-- Felix: customer companies ("Firmalar") and the company a project is for.
-- Run this once in the Supabase SQL editor, after 0002_stage2.sql.

-- The name is kept apart from the contact details on purpose: workers see
-- which company a project is for, but only the CEO and managers see who to
-- call, the e-mail address and the address.
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create unique index companies_name_key on public.companies (lower(name));

create table public.company_details (
  company_id uuid primary key references public.companies (id) on delete cascade,
  contact_name text,
  email text,
  phone text,
  address text,
  notes text
);

-- Deleting a company leaves its projects in place, without a company.
alter table public.projects
  add column company_id uuid references public.companies (id) on delete set null;

create index projects_company_idx on public.projects (company_id);

-- Creates a company or saves changes to one, name and details together.
create function public.save_company(
  p_name text,
  p_id uuid default null,
  p_contact_name text default null,
  p_email text default null,
  p_phone text default null,
  p_address text default null,
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  if v_id is null then
    insert into public.companies (name) values (btrim(p_name)) returning id into v_id;
  else
    update public.companies set name = btrim(p_name) where id = v_id;
    if not found then
      raise exception 'Firma bulunamadı.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.company_details (company_id, contact_name, email, phone, address, notes)
  values (
    v_id,
    nullif(btrim(coalesce(p_contact_name, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  on conflict (company_id) do update set
    contact_name = excluded.contact_name,
    email = excluded.email,
    phone = excluded.phone,
    address = excluded.address,
    notes = excluded.notes;

  return v_id;
end;
$$;

-- create_project gains the company. The old version is replaced.
drop function public.create_project(text, text, date, uuid);

create function public.create_project(
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

  insert into public.project_steps (project_id, step_type_id, name, position)
  select v_id, st.id, st.name, row_number() over (order by pts.position, pts.id)
  from public.project_type_steps pts
  join public.step_types st on st.id = pts.step_type_id
  where pts.project_type_id = p_type_id;

  return v_id;
end;
$$;

grant execute on function public.create_project(text, text, date, uuid, uuid) to authenticated;
grant execute on function public.save_company(text, uuid, text, text, text, text, text) to authenticated;

alter table public.companies enable row level security;
alter table public.company_details enable row level security;

create policy companies_select on public.companies
  for select to authenticated using (public.current_panel() is not null);
create policy companies_insert on public.companies
  for insert to authenticated with check (public.current_panel() in ('ceo', 'manager'));
create policy companies_update on public.companies
  for update to authenticated
  using (public.current_panel() in ('ceo', 'manager'))
  with check (public.current_panel() in ('ceo', 'manager'));
create policy companies_delete on public.companies
  for delete to authenticated using (public.current_panel() in ('ceo', 'manager'));

-- Contact details: CEO and managers only, for reading as well as writing.
create policy company_details_all on public.company_details
  for all to authenticated
  using (public.current_panel() in ('ceo', 'manager'))
  with check (public.current_panel() in ('ceo', 'manager'));

grant select, insert, update, delete on public.companies, public.company_details to authenticated;
grant all on public.companies, public.company_details to service_role;
