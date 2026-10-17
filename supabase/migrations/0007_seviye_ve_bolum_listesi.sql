-- Felix: levels (Usta / Kalfa / Çırak), one editable Bölümler list, approval
-- by level, and no more meslek.
-- Run this in the Supabase SQL editor after 0005_approval_at_creation.sql.
-- If 0006_bolumler.sql was run, its bölümler and atölyeler are carried over;
-- if it was not, this file does not need it.
-- Every statement in this file is safe to run more than once.

-- ---- Bölümler: one list the workshop edits itself ----
-- Replaces 0006's four fixed bölümler and its atölyeler. Elektrik atölyesi,
-- Kaynak atölyesi, Tasarım, Satın alma... are all simply bölümler.

create table if not exists public.bolumler (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists bolum_id uuid references public.bolumler (id) on delete set null;

create index if not exists profiles_bolum_idx on public.profiles (bolum_id);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'bolum'
  ) then
    insert into public.bolumler (name) select name from public.atolyeler on conflict (name) do nothing;
    insert into public.bolumler (name) values ('Tasarım'), ('Satın alma'), ('Muhasebe') on conflict (name) do nothing;
    if exists (select 1 from public.profiles where bolum = 'uretim' and atolye_id is null) then
      insert into public.bolumler (name) values ('Üretim') on conflict (name) do nothing;
    end if;

    update public.profiles p set bolum_id = b.id
    from public.atolyeler a, public.bolumler b
    where p.atolye_id = a.id and b.name = a.name and p.bolum_id is null;

    update public.profiles p set bolum_id = b.id
    from public.bolumler b
    where p.bolum_id is null and p.atolye_id is null
      and b.name = case p.bolum::text
        when 'uretim' then 'Üretim'
        when 'tasarim' then 'Tasarım'
        when 'satinalma' then 'Satın alma'
        when 'muhasebe' then 'Muhasebe'
      end;

    alter table public.profiles drop constraint if exists profiles_atolye_in_uretim;
    alter table public.profiles drop column if exists atolye_id;
    alter table public.profiles drop column if exists bolum;
  end if;
end $$;

drop table if exists public.atolyeler;
drop type if exists public.bolum;

-- A starting list, only when there is none yet.
insert into public.bolumler (name)
select v.name
from (values ('Elektrik atölyesi'), ('Kaynak atölyesi'), ('Tasarım'), ('Satın alma'), ('Muhasebe')) as v (name)
where not exists (select 1 from public.bolumler);

alter table public.bolumler enable row level security;

drop policy if exists bolum_select on public.bolumler;
create policy bolum_select on public.bolumler
  for select to authenticated
  using (public.current_panel() is not null);

drop policy if exists bolum_insert on public.bolumler;
create policy bolum_insert on public.bolumler
  for insert to authenticated
  with check (public.current_panel() in ('ceo', 'manager'));

drop policy if exists bolum_update on public.bolumler;
create policy bolum_update on public.bolumler
  for update to authenticated
  using (public.current_panel() in ('ceo', 'manager'))
  with check (public.current_panel() in ('ceo', 'manager'));

drop policy if exists bolum_delete on public.bolumler;
create policy bolum_delete on public.bolumler
  for delete to authenticated
  using (public.current_panel() in ('ceo', 'manager'));

grant select, insert, update, delete on public.bolumler to authenticated;
grant all on public.bolumler to service_role;

-- ---- Levels: Usta, Kalfa, Çırak ----
-- Hidden: only the CEO and managers can read or change them, so they live in
-- their own table rather than on profiles (which everyone reads). A person
-- with no row counts as Kalfa. Kalfa and Çırak behave the same; Çırak is there
-- to help when assigning work.

do $$
begin
  create type public.seviye as enum ('usta', 'kalfa', 'cirak');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.seviyeler (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seviye public.seviye not null default 'kalfa',
  updated_at timestamptz not null default now()
);

alter table public.seviyeler enable row level security;

drop policy if exists seviye_select on public.seviyeler;
create policy seviye_select on public.seviyeler
  for select to authenticated
  using (public.current_panel() in ('ceo', 'manager'));

drop policy if exists seviye_insert on public.seviyeler;
create policy seviye_insert on public.seviyeler
  for insert to authenticated
  with check (public.current_panel() in ('ceo', 'manager'));

drop policy if exists seviye_update on public.seviyeler;
create policy seviye_update on public.seviyeler
  for update to authenticated
  using (public.current_panel() in ('ceo', 'manager'))
  with check (public.current_panel() in ('ceo', 'manager'));

drop policy if exists seviye_delete on public.seviyeler;
create policy seviye_delete on public.seviyeler
  for delete to authenticated
  using (public.current_panel() in ('ceo', 'manager'));

grant select, insert, update, delete on public.seviyeler to authenticated;
grant all on public.seviyeler to service_role;

-- ---- Meslek türleri are no longer used ----
alter table public.profiles drop column if exists meslek_id;
drop table if exists public.meslek_turleri;

-- ---- Approval follows the person's level ----
-- An Usta's finish counts at once; a Kalfa's or Çırak's waits for a manager.
-- The CEO's and managers' own finish never waits. The per-step "Onay gerekir"
-- setting (project_steps.needs_approval) is no longer read.
-- Every change of a step's status goes through here.
--   start   : begin work, or carry on after a problem
--   finish  : a Kalfa or Çırak sends it for approval; an Usta, a manager or
--             the CEO finishes it (any one assignee can do this)
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
    if not v_manages and coalesce(
         (select seviye from public.seviyeler where user_id = auth.uid()), 'kalfa'
       ) <> 'usta' then
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
