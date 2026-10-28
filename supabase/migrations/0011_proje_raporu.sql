-- Update 4: the project report (Proje raporu), project codes and delivery.
--
-- Every project gets a code by itself, AF-26-014: Aquafelix, the year, and
-- the 14th project of that year. Codes are never typed and never change.
-- Each project also has a customer key of four characters; the customer code
-- is the project code plus the key (AF-26-014-K7PX). Only Genel Müdür, IT and
-- Bölüm Sorumluları see the key. A customer who types the customer code on
-- the sign-in page's "Proje raporu sorgula" sees the customer version of the
-- report, once every step is done; before that only "Projeniz hazırlanıyor".
-- That page reaches the database through Felix's server (api/rapor.ts), never
-- directly.
--
-- "Projeyi teslim et" records the day the product leaves the factory, which
-- can be later than the day the last step is done.
--
-- The customer version shows only the photos and project files a manager
-- ticked (dosyalar.musteriye), and no names.
--
-- Safe to run more than once; works as one transaction. Nothing is dropped.

-- ---- Delivery ----
alter table public.projects add column if not exists teslim_at timestamptz;
alter table public.projects add column if not exists teslim_by uuid references public.profiles (id) on delete set null;

-- ---- Files the customer sees ----
alter table public.dosyalar add column if not exists musteriye boolean not null default false;

-- ---- Project codes ----
-- The last number given in each year (two digits: 26).
create table if not exists public.proje_kod_sayaci (
  yil integer primary key,
  son integer not null
);

alter table public.proje_kod_sayaci enable row level security;
revoke all on public.proje_kod_sayaci from anon, authenticated;
grant all on public.proje_kod_sayaci to service_role;

-- The next code for a project opened at p_at (Istanbul time decides the year).
-- A number is never given twice, even if its project is deleted.
create or replace function public.yeni_proje_kodu(p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yil integer := extract(year from p_at at time zone 'Europe/Istanbul')::integer % 100;
  v_no integer;
begin
  insert into public.proje_kod_sayaci (yil, son) values (v_yil, 1)
  on conflict (yil) do update set son = public.proje_kod_sayaci.son + 1
  returning son into v_no;
  return 'AF-' || lpad(v_yil::text, 2, '0') || '-' || lpad(v_no::text, 3, '0');
end;
$$;

revoke all on function public.yeni_proje_kodu(timestamptz) from public, anon, authenticated;

-- A new project always gets the next code, whatever was sent; a code once
-- given never changes.
create or replace function public.proje_kodu_ver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.code := public.yeni_proje_kodu(coalesce(new.created_at, now()));
  elsif old.code ~ '^AF-[0-9]{2}-[0-9]{3,}$' then
    new.code := old.code;
  end if;
  return new;
end;
$$;

revoke all on function public.proje_kodu_ver() from public, anon, authenticated;

create or replace trigger proje_kodu_ver
  before insert or update of code on public.projects
  for each row execute function public.proje_kodu_ver();

-- Projects from before this update get codes in the order they were opened.
-- Codes already given are counted first, so running this again changes nothing.
insert into public.proje_kod_sayaci (yil, son)
select substring(code from 4 for 2)::integer, max(substring(code from 7)::integer)
from public.projects
where code ~ '^AF-[0-9]{2}-[0-9]{3,}$'
group by 1
on conflict (yil) do update set son = greatest(public.proje_kod_sayaci.son, excluded.son);

do $$
declare
  r record;
begin
  for r in
    select id, created_at from public.projects
    where code is null or code !~ '^AF-[0-9]{2}-[0-9]{3,}$'
    order by created_at, id
  loop
    update public.projects set code = public.yeni_proje_kodu(r.created_at) where id = r.id;
  end loop;
end;
$$;

-- ---- Customer keys ----
create table if not exists public.proje_anahtarlari (
  project_id uuid primary key references public.projects (id) on delete cascade,
  -- Four characters without the easily confused 0, O, 1 and I.
  anahtar text not null check (anahtar ~ '^[A-HJ-NP-Z2-9]{4}$'),
  created_at timestamptz not null default now()
);

alter table public.proje_anahtarlari enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'proje_anahtarlari' and policyname = 'proje_anahtar_select'
  ) then
    create policy proje_anahtar_select on public.proje_anahtarlari
      for select to authenticated using (public.current_panel() in ('ceo', 'manager'));
  end if;
end;
$$;

revoke all on public.proje_anahtarlari from anon, authenticated;
grant select on public.proje_anahtarlari to authenticated;
grant all on public.proje_anahtarlari to service_role;

-- Four random characters. The bytes come from gen_random_uuid(), which uses
-- the database's secure random source; 256 is a multiple of 32, so every
-- character is equally likely.
create or replace function public.yeni_anahtar()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_harfler constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_anahtar text := '';
begin
  for i in 0..3 loop
    v_anahtar := v_anahtar || substr(v_harfler, get_byte(v_bytes, i) % 32 + 1, 1);
  end loop;
  return v_anahtar;
end;
$$;

revoke all on function public.yeni_anahtar() from public, anon, authenticated;

create or replace function public.proje_anahtari_ver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.proje_anahtarlari (project_id, anahtar)
  values (new.id, public.yeni_anahtar())
  on conflict (project_id) do nothing;
  return new;
end;
$$;

revoke all on function public.proje_anahtari_ver() from public, anon, authenticated;

create or replace trigger proje_anahtari_ver
  after insert on public.projects
  for each row execute function public.proje_anahtari_ver();

insert into public.proje_anahtarlari (project_id, anahtar)
select id, public.yeni_anahtar() from public.projects
on conflict (project_id) do nothing;

-- ---- What the app calls ----

-- "Yeni kod": the old customer code stops working. Returns the new key.
create or replace function public.musteri_kodu_yenile(p_project_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anahtar text := public.yeni_anahtar();
begin
  if coalesce(public.current_panel() in ('ceo', 'manager'), false) is not true then
    raise exception 'Bu işlemi yalnızca Genel Müdür, IT veya Bölüm Sorumluları yapabilir.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Bu proje bulunamadı. Silinmiş olabilir.' using errcode = 'P0002';
  end if;
  insert into public.proje_anahtarlari (project_id, anahtar) values (p_project_id, v_anahtar)
  on conflict (project_id) do update set anahtar = excluded.anahtar, created_at = now();
  return v_anahtar;
end;
$$;

-- "Projeyi teslim et" (p_teslim true) or "Teslimi geri al" (false).
create or replace function public.proje_teslim(p_project_id uuid, p_teslim boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_panel() in ('ceo', 'manager'), false) is not true then
    raise exception 'Bu işlemi yalnızca Genel Müdür, IT veya Bölüm Sorumluları yapabilir.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Bu proje bulunamadı. Silinmiş olabilir.' using errcode = 'P0002';
  end if;
  if p_teslim then
    if not exists (select 1 from public.project_steps where project_id = p_project_id)
       or exists (select 1 from public.project_steps where project_id = p_project_id and status <> 'done') then
      raise exception 'Proje teslim edilmeden önce bütün adımlar bitmeli.' using errcode = '22023';
    end if;
    update public.projects set teslim_at = now(), teslim_by = auth.uid()
    where id = p_project_id and teslim_at is null;
  else
    update public.projects set teslim_at = null, teslim_by = null where id = p_project_id;
  end if;
end;
$$;

-- Ticks a photo or project file for the customer version (or unticks it).
create or replace function public.dosya_musteriye(p_id uuid, p_musteriye boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_panel() in ('ceo', 'manager'), false) is not true then
    raise exception 'Bu işlemi yalnızca Genel Müdür, IT veya Bölüm Sorumluları yapabilir.' using errcode = '42501';
  end if;
  update public.dosyalar set musteriye = p_musteriye
  where id = p_id and (eski_at is null or not p_musteriye);
  if not found then
    raise exception 'Dosya bulunamadı.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.musteri_kodu_yenile(uuid) from public, anon;
revoke all on function public.proje_teslim(uuid, boolean) from public, anon;
revoke all on function public.dosya_musteriye(uuid, boolean) from public, anon;
grant execute on function public.musteri_kodu_yenile(uuid) to authenticated;
grant execute on function public.proje_teslim(uuid, boolean) to authenticated;
grant execute on function public.dosya_musteriye(uuid, boolean) to authenticated;

-- ---- The customer's report ----
-- Wrong codes are counted, so codes cannot be guessed by trying many.
create table if not exists public.rapor_denemeleri (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table public.rapor_denemeleri enable row level security;
revoke all on public.rapor_denemeleri from anon, authenticated;
grant all on public.rapor_denemeleri to service_role;

-- Called only by Felix's server with a customer code. Returns durum:
--   'yok'           no project has this code
--   'bekle'         too many wrong codes lately: try again later
--   'hazirlaniyor'  the project is not finished yet (only its code and name)
--   'hazir'         the customer version: no names, only ticked files
-- Spaces, lower case and missing dashes in the code are forgiven.
create or replace function public.musteri_raporu(p_kod text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kod text := upper(regexp_replace(coalesce(p_kod, ''), '\s', '', 'g'));
  v_parca text[];
  v_proje public.projects%rowtype;
begin
  delete from public.rapor_denemeleri where created_at < now() - interval '1 day';
  if (select count(*) from public.rapor_denemeleri where created_at > now() - interval '10 minutes') >= 30 then
    return jsonb_build_object('durum', 'bekle');
  end if;

  v_parca := regexp_match(v_kod, '^AF-?([0-9]{2})-?([0-9]{1,6})-?([A-Z0-9]{4})$');
  if v_parca is not null then
    select p.* into v_proje
    from public.projects p
    join public.proje_anahtarlari a on a.project_id = p.id
    where p.code = 'AF-' || v_parca[1] || '-' || lpad(ltrim(v_parca[2], '0'), 3, '0')
      and a.anahtar = v_parca[3];
  end if;
  if v_proje.id is null then
    insert into public.rapor_denemeleri default values;
    return jsonb_build_object('durum', 'yok');
  end if;

  if not exists (select 1 from public.project_steps where project_id = v_proje.id)
     or exists (select 1 from public.project_steps where project_id = v_proje.id and status <> 'done') then
    return jsonb_build_object('durum', 'hazirlaniyor', 'kod', v_proje.code, 'ad', v_proje.name);
  end if;

  return jsonb_build_object(
    'durum', 'hazir',
    'kod', v_proje.code,
    'ad', v_proje.name,
    'firma', (select name from public.companies where id = v_proje.company_id),
    'tamamlandi', (select max(finished_at) from public.project_steps where project_id = v_proje.id),
    'teslim', v_proje.teslim_at,
    'adimlar', (
      select coalesce(jsonb_agg(jsonb_build_object('ad', s.name, 'bitti', s.finished_at) order by s.position, s.id), '[]'::jsonb)
      from public.project_steps s
      where s.project_id = v_proje.id
    ),
    'dosyalar', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'ad', d.name, 'yol', d.storage_path, 'mime', d.mime, 'boyut', d.size, 'adim', s.name
      ) order by s.position nulls first, d.created_at), '[]'::jsonb)
      from public.dosyalar d
      left join public.project_steps s on s.id = d.step_id
      where d.project_id = v_proje.id and d.musteriye and d.eski_at is null and not d.silindi
    )
  );
end;
$$;

revoke all on function public.musteri_raporu(text) from public, anon, authenticated;
grant execute on function public.musteri_raporu(text) to service_role;

-- Lets the app see the new columns, tables and functions straight away.
notify pgrst, 'reload schema';
