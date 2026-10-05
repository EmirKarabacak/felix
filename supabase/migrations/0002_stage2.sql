-- Felix, stage 2: step types, project types, projects, steps and assignments.
-- Run this once in the Supabase SQL editor, after 0001_stage1.sql.

create type public.step_status as enum ('waiting', 'active', 'problem', 'done');

-- The list steps are picked from ("Adım türleri").
create table public.step_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

-- A project type is a named, ordered set of step types. Choosing it for a new
-- project copies those steps into the project.
create table public.project_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.project_type_steps (
  id uuid primary key default gen_random_uuid(),
  project_type_id uuid not null references public.project_types (id) on delete cascade,
  step_type_id uuid not null references public.step_types (id) on delete cascade,
  position integer not null
);

create index project_type_steps_type_idx on public.project_type_steps (project_type_id, position);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text check (code is null or length(btrim(code)) between 1 and 40),
  name text not null check (length(btrim(name)) between 1 and 120),
  due_date date,
  project_type_id uuid references public.project_types (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index projects_code_key on public.projects (lower(code)) where code is not null;

-- A step keeps its own copy of the name, so renaming or deleting a step type
-- later never changes what a past project says was done.
create table public.project_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  step_type_id uuid references public.step_types (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 80),
  position integer not null,
  due_date date,
  status public.step_status not null default 'waiting',
  problem_reason text,
  problem_note text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index project_steps_project_idx on public.project_steps (project_id, position);

create table public.step_assignees (
  step_id uuid not null references public.project_steps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (step_id, user_id)
);

create index step_assignees_user_idx on public.step_assignees (user_id);

-- Who did what and when. Written only by the functions and triggers below.
create table public.step_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  step_id uuid not null references public.project_steps (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index step_events_step_idx on public.step_events (step_id, created_at);

-- Creates a project and copies its type's steps into it, in one go.
create function public.create_project(
  p_name text,
  p_code text default null,
  p_due_date date default null,
  p_type_id uuid default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.projects (code, name, due_date, project_type_id, created_by)
  values (nullif(btrim(p_code), ''), btrim(p_name), p_due_date, p_type_id, auth.uid())
  returning id into v_id;

  insert into public.project_steps (project_id, step_type_id, name, position)
  select v_id, st.id, st.name, row_number() over (order by pts.position, pts.id)
  from public.project_type_steps pts
  join public.step_types st on st.id = pts.step_type_id
  where pts.project_type_id = p_type_id;

  return v_id;
end;
$$;

-- Adds one step from the list to the end of a project.
create function public.add_step(p_project_id uuid, p_step_type_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.project_steps (project_id, step_type_id, name, position)
  select p_project_id, st.id, st.name,
         coalesce((select max(position) from public.project_steps where project_id = p_project_id), 0) + 1
  from public.step_types st
  where st.id = p_step_type_id
  returning id into v_id;

  if v_id is null then
    raise exception 'Adım türü bulunamadı.' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

-- Every change of a step's status goes through here, for workers and managers
-- alike, so the rules and the history are the same whoever presses the button.
--   start   : begin work, or carry on after a problem
--   finish  : the whole step is done (any one assignee can do this)
--   problem : report a problem; p_reason is required
--   reopen  : managers only: a finished step goes back to "in progress"
--   reset   : managers only: back to "waiting", as if never started
create function public.step_action(
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
    v_new := 'done';
    v_kind := 'finished';
  elsif p_action = 'problem' and v_step.status in ('waiting', 'active') then
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'Sorunun ne olduğunu seçin.' using errcode = '22023';
    end if;
    v_new := 'problem';
    v_kind := 'problem';
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
    problem_note = case when v_new = 'problem' then nullif(btrim(coalesce(p_note, '')), '') else null end,
    started_at = case
      when v_new = 'waiting' then null
      when v_new in ('active', 'done') then coalesce(started_at, now())
      else started_at
    end,
    finished_at = case when v_new = 'done' then now() else null end
  where id = p_step_id;

  insert into public.step_events (project_id, step_id, actor_id, kind, detail)
  values (
    v_step.project_id, p_step_id, auth.uid(), v_kind,
    case when v_new = 'problem'
      then btrim(p_reason) || coalesce(': ' || nullif(btrim(coalesce(p_note, '')), ''), '')
    end
  );

  return v_new;
end;
$$;

-- Assignments are part of the history too.
create function public.log_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.step_assignees%rowtype;
  v_project uuid;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  select project_id into v_project from public.project_steps where id = v_row.step_id;
  -- When the step itself is being deleted there is nothing left to attach history to.
  if v_project is not null then
    insert into public.step_events (project_id, step_id, actor_id, kind, detail)
    select v_project, v_row.step_id, auth.uid(),
           case when tg_op = 'DELETE' then 'unassigned' else 'assigned' end,
           (select full_name from public.profiles where id = v_row.user_id);
  end if;
  return v_row;
end;
$$;

create trigger log_assignment
  after insert or delete on public.step_assignees
  for each row execute function public.log_assignment();

-- A person who is removed drops off the steps that are not finished yet.
-- Finished steps keep their name.
create function public.unassign_removed_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.active and not new.active then
    delete from public.step_assignees sa
    using public.project_steps ps
    where sa.step_id = ps.id and sa.user_id = new.id and ps.status <> 'done';
  end if;
  return new;
end;
$$;

create trigger unassign_removed_person
  after update of active on public.profiles
  for each row execute function public.unassign_removed_person();

revoke all on function public.step_action(uuid, text, text, text) from public;
grant execute on function public.step_action(uuid, text, text, text) to authenticated;
grant execute on function public.create_project(text, text, date, uuid) to authenticated;
grant execute on function public.add_step(uuid, uuid) to authenticated;

alter table public.step_types enable row level security;
alter table public.project_types enable row level security;
alter table public.project_type_steps enable row level security;
alter table public.projects enable row level security;
alter table public.project_steps enable row level security;
alter table public.step_assignees enable row level security;
alter table public.step_events enable row level security;

-- Everyone who can sign in sees everything here: workers see all projects, read-only.
-- Only the CEO and managers can change anything. Workers change a step's status
-- through step_action() above, never by writing to the tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'step_types', 'project_types', 'project_type_steps', 'projects', 'project_steps', 'step_assignees'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.current_panel() is not null)',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.current_panel() in (''ceo'', ''manager''))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.current_panel() in (''ceo'', ''manager'')) with check (public.current_panel() in (''ceo'', ''manager''))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.current_panel() in (''ceo'', ''manager''))',
      t || '_delete', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy step_events_select on public.step_events
  for select to authenticated
  using (public.current_panel() is not null);

grant select on public.step_events to authenticated;
grant all on public.step_events to service_role;

-- Starting lists. Everything here can be renamed, changed or deleted in the app.
insert into public.step_types (name) values
  ('Malzeme hazırlık'), ('Şase imalatı'), ('Tank imalatı'), ('Yüzey işlemi'),
  ('Ekipman montajı'), ('Borulama'), ('Elektrik ve pano'), ('Test'),
  ('Paketleme ve sevkiyat');

insert into public.project_types (name) values
  ('RO Ünitesi'), ('Filtre Grubu'), ('DAF Ünitesi'), ('Dozaj Skid');

insert into public.project_type_steps (project_type_id, step_type_id, position)
select pt.id, st.id, x.ord
from (values
  ('RO Ünitesi',   array['Malzeme hazırlık','Şase imalatı','Yüzey işlemi','Ekipman montajı','Borulama','Elektrik ve pano','Test','Paketleme ve sevkiyat']),
  ('Filtre Grubu', array['Malzeme hazırlık','Şase imalatı','Yüzey işlemi','Ekipman montajı','Borulama','Test','Paketleme ve sevkiyat']),
  ('DAF Ünitesi',  array['Malzeme hazırlık','Tank imalatı','Yüzey işlemi','Ekipman montajı','Borulama','Elektrik ve pano','Test','Paketleme ve sevkiyat']),
  ('Dozaj Skid',   array['Malzeme hazırlık','Şase imalatı','Ekipman montajı','Borulama','Elektrik ve pano','Test','Paketleme ve sevkiyat'])
) as t(type_name, steps)
join public.project_types pt on pt.name = t.type_name
cross join lateral unnest(t.steps) with ordinality as x(step_name, ord)
join public.step_types st on st.name = x.step_name;
