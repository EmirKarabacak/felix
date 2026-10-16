-- Felix: departments (bölümler: Üretim, Tasarım, Satın alma, Muhasebe) and the
-- workshops (atölyeler) inside Üretim.
-- Run this once in the Supabase SQL editor, after 0005_approval_at_creation.sql.
-- Every statement in this file is safe to run more than once.
--
-- The bölüm decides which version of the app someone gets; the panel (CEO,
-- Yönetici, İşçi) still decides what they are allowed to change. The four bölümler
-- are fixed because each one has its own screens; workshops are a list the
-- workshop edits itself. One bölüm per person for now.

do $$
begin
  create type public.bolum as enum ('uretim', 'tasarim', 'satinalma', 'muhasebe');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.atolyeler (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

-- Everyone who was a worker before bölümler existed works in production. Only
-- done when the column is first added, so a later run keeps choices made since.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'bolum'
  ) then
    alter table public.profiles add column bolum public.bolum;
    update public.profiles set bolum = 'uretim' where panel = 'worker';
  end if;
end $$;

alter table public.profiles
  add column if not exists atolye_id uuid references public.atolyeler (id) on delete set null;

create index if not exists profiles_atolye_idx on public.profiles (atolye_id);

-- A workshop belongs to production; nobody in another bölüm has one.
do $$
begin
  alter table public.profiles
    add constraint profiles_atolye_in_uretim check (atolye_id is null or bolum = 'uretim');
exception
  when duplicate_object then null;
end $$;

-- Bölüm and workshop are edited like a name or a meslek: by the CEO and managers,
-- through the existing profiles_update rule. Nothing more is needed for that.

alter table public.atolyeler enable row level security;

drop policy if exists atolye_select on public.atolyeler;
create policy atolye_select on public.atolyeler
  for select to authenticated
  using (public.current_panel() is not null);

drop policy if exists atolye_insert on public.atolyeler;
create policy atolye_insert on public.atolyeler
  for insert to authenticated
  with check (public.current_panel() in ('ceo', 'manager'));

drop policy if exists atolye_update on public.atolyeler;
create policy atolye_update on public.atolyeler
  for update to authenticated
  using (public.current_panel() in ('ceo', 'manager'))
  with check (public.current_panel() in ('ceo', 'manager'));

drop policy if exists atolye_delete on public.atolyeler;
create policy atolye_delete on public.atolyeler
  for delete to authenticated
  using (public.current_panel() in ('ceo', 'manager'));

grant select, insert, update, delete on public.atolyeler to authenticated;
grant all on public.atolyeler to service_role;

-- The two workshops Emir named. Only on the first run, so a deleted one stays deleted.
insert into public.atolyeler (name)
select v.name
from (values ('Elektrik atölyesi'), ('Kaynak atölyesi')) as v (name)
where not exists (select 1 from public.atolyeler);
