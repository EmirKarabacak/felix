-- Felix, stage 1: people, panels and meslek türleri.
-- Run this once in the Supabase SQL editor of a new project.

create type public.panel as enum ('ceo', 'manager', 'worker');

create table public.meslek_turleri (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 80),
  username text not null unique check (username ~ '^[a-z0-9._-]{3,40}$'),
  panel public.panel not null default 'worker',
  meslek_id uuid references public.meslek_turleri (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index profiles_meslek_idx on public.profiles (meslek_id);

-- The signed-in person's panel, or null when they are signed out or deactivated.
-- Every access rule below is written in terms of this function.
create function public.current_panel()
returns public.panel
language sql
stable
security definer
set search_path = public
as $$
  select panel from public.profiles where id = auth.uid() and active
$$;

-- Lets the sign-in page know whether the very first account still has to be created.
create function public.has_users()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles)
$$;

revoke all on function public.current_panel() from public;
revoke all on function public.has_users() from public;
grant execute on function public.current_panel() to authenticated, service_role;
grant execute on function public.has_users() to anon, authenticated, service_role;

-- Managers may correct a name or a meslek, but only the CEO (or the server,
-- which has no signed-in user) may change who someone is: panel, username, active.
create function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and public.current_panel() is distinct from 'ceo'
     and (new.panel, new.username, new.active, new.id)
         is distinct from (old.panel, old.username, old.active, old.id) then
    raise exception 'Bu değişikliği yalnızca CEO yapabilir.' using errcode = '42501';
  end if;
  -- Never leave the company without a CEO who can sign in.
  if old.panel = 'ceo' and old.active
     and (new.panel <> 'ceo' or not new.active)
     and not exists (
       select 1 from public.profiles
       where panel = 'ceo' and active and id <> old.id
     ) then
    raise exception 'En az bir CEO kalmalı.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

alter table public.profiles enable row level security;
alter table public.meslek_turleri enable row level security;

-- Everyone who can sign in sees the team (names are needed for assigning and chat).
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.current_panel() is not null);

-- CEO and managers can edit a person; the trigger above limits what managers change.
-- Creating and removing people happens only on the server, never from the browser.
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.current_panel() in ('ceo', 'manager'))
  with check (public.current_panel() in ('ceo', 'manager'));

create policy meslek_select on public.meslek_turleri
  for select to authenticated
  using (public.current_panel() is not null);

create policy meslek_insert on public.meslek_turleri
  for insert to authenticated
  with check (public.current_panel() in ('ceo', 'manager'));

create policy meslek_update on public.meslek_turleri
  for update to authenticated
  using (public.current_panel() in ('ceo', 'manager'))
  with check (public.current_panel() in ('ceo', 'manager'));

create policy meslek_delete on public.meslek_turleri
  for delete to authenticated
  using (public.current_panel() in ('ceo', 'manager'));

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.meslek_turleri to authenticated;
grant all on public.profiles, public.meslek_turleri to service_role;

insert into public.meslek_turleri (name) values
  ('Operatör'), ('Kaynakçı'), ('Montajcı'), ('Boru ustası'), ('Elektrikçi');
