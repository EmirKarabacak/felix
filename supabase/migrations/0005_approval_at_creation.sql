-- Felix: choose which steps need approval when the project is created.
-- Run this once in the Supabase SQL editor, after 0004_approval.sql.
-- Every statement in this file is safe to run more than once.
--
-- Approval used to be set on a step type, for all future projects. It is now
-- chosen per project, in the new-project form, and can still be changed on a
-- single step afterwards. Step types no longer carry the setting.

-- Nothing reads this column any more; clear it so no old choice lingers.
update public.step_types set needs_approval = false where needs_approval;

drop function if exists public.create_project(text, text, date, uuid, uuid);

-- p_approval lists the steps of the chosen project type (project_type_steps
-- ids) that should need a manager's approval in this project.
create or replace function public.create_project(
  p_name text,
  p_code text default null,
  p_due_date date default null,
  p_type_id uuid default null,
  p_company_id uuid default null,
  p_approval uuid[] default null
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
  select v_id, st.id, st.name, row_number() over (order by pts.position, pts.id),
         pts.id = any (coalesce(p_approval, '{}'::uuid[]))
  from public.project_type_steps pts
  join public.step_types st on st.id = pts.step_type_id
  where pts.project_type_id = p_type_id;

  return v_id;
end;
$$;

grant execute on function public.create_project(text, text, date, uuid, uuid, uuid[]) to authenticated;

-- A step added to a running project starts without approval; it can be
-- switched on from the step itself.
create or replace function public.add_step(p_project_id uuid, p_step_type_id uuid)
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
