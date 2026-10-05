-- Felix: manager approval for chosen step types.
-- Run this once in the Supabase SQL editor, after 0003_companies.sql.
--
-- A step type can be marked "Onay gerekir". When a worker finishes a step of
-- such a type it does not become finished: it waits ("review") until a manager
-- or the CEO approves it, or sends it back with a note.

alter type public.step_status add value if not exists 'review';

alter table public.step_types
  add column needs_approval boolean not null default false;

-- Each step keeps its own copy of the setting, taken from its type when the
-- step is created, so changing a type later does not change running projects.
alter table public.project_steps
  add column needs_approval boolean not null default false,
  add column submitted_at timestamptz,
  add column review_note text;

create or replace function public.create_project(
  p_name text,
  p_code text default null,
  p_due_date date default null,
  p_type_id uuid default null,
  p_company_id uuid default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.projects (code, name, due_date, project_type_id, company_id, created_by)
  values (nullif(btrim(p_code), ''), btrim(p_name), p_due_date, p_type_id, p_company_id, auth.uid())
  returning id into v_id;

  insert into public.project_steps (project_id, step_type_id, name, position, needs_approval)
  select v_id, st.id, st.name, row_number() over (order by pts.position, pts.id), st.needs_approval
  from public.project_type_steps pts
  join public.step_types st on st.id = pts.step_type_id
  where pts.project_type_id = p_type_id;

  return v_id;
end;
$$;

create or replace function public.add_step(p_project_id uuid, p_step_type_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.project_steps (project_id, step_type_id, name, position, needs_approval)
  select p_project_id, st.id, st.name,
         coalesce((select max(position) from public.project_steps where project_id = p_project_id), 0) + 1,
         st.needs_approval
  from public.step_types st
  where st.id = p_step_type_id
  returning id into v_id;

  if v_id is null then
    raise exception 'Adım türü bulunamadı.' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

-- Every change of a step's status goes through here.
--   start   : begin work, or carry on after a problem
--   finish  : a worker on a step that needs approval sends it for approval;
--             otherwise the step is finished (any one assignee can do this)
--   problem : report a problem; p_reason is required
--   approve : managers only: a step waiting for approval becomes finished
--   reject  : managers only: send it back to "in progress"; p_note is required
--   reopen  : managers only: a finished step goes back to "in progress"
--   reset   : managers only: back to "waiting", as if never started
create or replace function public.step_action(
  p_step_id uuid,
  p_action text,
  p_reason text default null,
  p_note text default null
)
returns public.step_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_panel public.panel := public.current_panel();
  v_step public.project_steps%rowtype;
  v_manages boolean;
  v_new public.step_status;
  v_kind text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_panel is null then
    raise exception 'Oturum bulunamadı.' using errcode = '42501';
  end if;

  select * into v_step from public.project_steps where id = p_step_id for update;
  if not found then
    raise exception 'Adım bulunamadı.' using errcode = 'P0002';
  end if;

  v_manages := v_panel in ('ceo', 'manager');
  if not v_manages and not exists (
    select 1 from public.step_assignees where step_id = p_step_id and user_id = auth.uid()
  ) then
    raise exception 'Bu adım size atanmamış.' using errcode = '42501';
  end if;

  if p_action = 'start' and v_step.status in ('waiting', 'problem') then
    v_new := 'active';
    v_kind := case when v_step.status = 'problem' then 'resolved' else 'started' end;
  elsif p_action = 'finish' and v_step.status in ('waiting', 'active') then
    if v_step.needs_approval and not v_manages then
      v_new := 'review';
      v_kind := 'submitted';
    else
      v_new := 'done';
      v_kind := 'finished';
    end if;
  elsif p_action = 'problem' and v_step.status in ('waiting', 'active') then
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'Sorunun ne olduğunu seçin.' using errcode = '22023';
    end if;
    v_new := 'problem';
    v_kind := 'problem';
  elsif p_action = 'approve' and v_manages and v_step.status = 'review' then
    v_new := 'done';
    v_kind := 'approved';
  elsif p_action = 'reject' and v_manages and v_step.status = 'review' then
    if v_note is null then
      raise exception 'Neden geri gönderdiğinizi yazın.' using errcode = '22023';
    end if;
    v_new := 'active';
    v_kind := 'rejected';
  elsif p_action = 'reopen' and v_manages and v_step.status = 'done' then
    v_new := 'active';
    v_kind := 'reopened';
  elsif p_action = 'reset' and v_manages and v_step.status <> 'waiting' then
    v_new := 'waiting';
    v_kind := 'reset';
  else
    raise exception 'Bu adım şu anda bu işleme uygun değil.' using errcode = '22023';
  end if;

  update public.project_steps set
    status = v_new,
    problem_reason = case when v_new = 'problem' then btrim(p_reason) else null end,
    problem_note = case when v_new = 'problem' then v_note else null end,
    started_at = case
      when v_new = 'waiting' then null
      when v_new in ('active', 'review', 'done') then coalesce(started_at, now())
      else started_at
    end,
    submitted_at = case
      when v_kind = 'submitted' then now()
      when v_kind = 'approved' then submitted_at
      else null
    end,
    -- An approved step counts as finished when the worker handed it in, not
    -- when the manager got round to approving it.
    finished_at = case
      when v_kind = 'approved' then coalesce(submitted_at, now())
      when v_new = 'done' then now()
      else null
    end,
    -- The manager's note stays with the step while the worker redoes it, and
    -- is cleared once the step moves on.
    review_note = case
      when v_kind = 'rejected' then v_note
      when v_new in ('active', 'problem') and v_kind not in ('reopened') then review_note
      else null
    end
  where id = p_step_id;

  insert into public.step_events (project_id, step_id, actor_id, kind, detail)
  values (
    v_step.project_id, p_step_id, auth.uid(), v_kind,
    case
      when v_new = 'problem' then btrim(p_reason) || coalesce(': ' || v_note, '')
      when v_kind = 'rejected' then v_note
    end
  );

  return v_new;
end;
$$;
