-- Felix: Genel Müdür and IT, four fixed bölümler, Uzmanlık with a level per
-- uzmanlık, Talepler (material and drawing requests) and Dosyalar (files on
-- projects and steps, with old versions).
-- Run this in the Supabase SQL editor after 0007_seviye_ve_bolum_listesi.sql.
-- Every statement in this file is safe to run more than once.

-- ---- Genel Müdür and IT ----
-- Both have every right (the 'ceo' panel). Which of the two someone is, is
-- kept in profiles.unvan, so the panel list itself does not change.

alter table public.profiles add column if not exists unvan text;

do $$
begin
  alter table public.profiles
    add constraint profiles_unvan_check check (unvan in ('genel_mudur', 'it'));
exception
  when duplicate_object then null;
end $$;

-- Only the 'ceo' panel has an unvan; a 'ceo' without one is Genel Müdür.
create or replace function public.normalize_unvan()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.panel = 'ceo' then
    new.unvan := coalesce(new.unvan, 'genel_mudur');
  else
    new.unvan := null;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_unvan on public.profiles;
create trigger normalize_unvan
  before insert or update on public.profiles
  for each row execute function public.normalize_unvan();

update public.profiles set unvan = 'genel_mudur' where panel = 'ceo' and unvan is null;
update public.profiles set unvan = null where panel <> 'ceo' and unvan is not null;

-- Only Genel Müdür and IT (or the server) may change who someone is. There
-- must always be a Genel Müdür and, once one has been added, an IT who can
-- sign in.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and public.current_panel() is distinct from 'ceo'
     and (new.panel, new.unvan, new.username, new.active, new.id)
         is distinct from (old.panel, old.unvan, old.username, old.active, old.id) then
    raise exception 'Bu değişikliği yalnızca Genel Müdür veya IT yapabilir.' using errcode = '42501';
  end if;
  if old.panel = 'ceo' and old.active
     and (new.panel <> 'ceo' or not new.active or new.unvan is distinct from old.unvan)
     and not exists (
       select 1 from public.profiles
       where panel = 'ceo' and active and unvan = old.unvan and id <> old.id
     ) then
    if old.unvan = 'it' then
      raise exception 'En az bir IT kalmalı.' using errcode = '23514';
    end if;
    raise exception 'En az bir Genel Müdür kalmalı.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ---- Uzmanlık (only for İmalat) ----
-- An editable list. A Personel in İmalat can have several uzmanlıklar, each
-- with its own level. Levels stay hidden: only Genel Müdür, IT and Bölüm
-- Sorumluları can read them.

create table if not exists public.uzmanliklar (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

insert into public.uzmanliklar (name)
select v.name from (values ('Kaynakçı'), ('Elektrikçi')) as v (name)
where not exists (select 1 from public.uzmanliklar);

create table if not exists public.kisi_uzmanliklari (
  user_id uuid not null references public.profiles (id) on delete cascade,
  uzmanlik_id uuid not null references public.uzmanliklar (id) on delete cascade,
  seviye public.seviye not null default 'kalfa',
  primary key (user_id, uzmanlik_id)
);

create index if not exists kisi_uzmanliklari_uzmanlik_idx on public.kisi_uzmanliklari (uzmanlik_id);

alter table public.uzmanliklar enable row level security;
alter table public.kisi_uzmanliklari enable row level security;

drop policy if exists uzmanlik_select on public.uzmanliklar;
create policy uzmanlik_select on public.uzmanliklar
  for select to authenticated using (public.current_panel() is not null);
drop policy if exists uzmanlik_insert on public.uzmanliklar;
create policy uzmanlik_insert on public.uzmanliklar
  for insert to authenticated with check (public.current_panel() in ('ceo', 'manager'));
drop policy if exists uzmanlik_update on public.uzmanliklar;
create policy uzmanlik_update on public.uzmanliklar
  for update to authenticated
  using (public.current_panel() in ('ceo', 'manager'))
  with check (public.current_panel() in ('ceo', 'manager'));
drop policy if exists uzmanlik_delete on public.uzmanliklar;
create policy uzmanlik_delete on public.uzmanliklar
  for delete to authenticated using (public.current_panel() in ('ceo', 'manager'));

drop policy if exists kisi_uzmanlik_all on public.kisi_uzmanliklari;
create policy kisi_uzmanlik_all on public.kisi_uzmanliklari
  for all to authenticated
  using (public.current_panel() in ('ceo', 'manager'))
  with check (public.current_panel() in ('ceo', 'manager'));

grant select, insert, update, delete on public.uzmanliklar, public.kisi_uzmanliklari to authenticated;
grant all on public.uzmanliklar, public.kisi_uzmanliklari to service_role;

-- Each step type can suggest an uzmanlık; it also decides whose finish counts.
alter table public.step_types
  add column if not exists uzmanlik_id uuid references public.uzmanliklar (id) on delete set null;

-- ---- Bölümler become four fixed ones: Satın alma, Tasarım, İmalat, Muhasebe ----
-- Done once: the old editable list is folded into these four. Elektrik and
-- Kaynak (and any other workshop) become İmalat, and their Personel get the
-- matching uzmanlık, keeping the level they had.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bolumler' and column_name = 'kod'
  ) then
    alter table public.bolumler add column kod text;
    update public.bolumler set kod = case
      when name ilike 'sat_n%' then 'satinalma'
      when name ilike 'tasar%' then 'tasarim'
      when name ilike 'muhasebe%' then 'muhasebe'
      else 'imalat'
    end;

    insert into public.kisi_uzmanliklari (user_id, uzmanlik_id, seviye)
    select p.id, u.id, coalesce(s.seviye, 'kalfa')
    from public.profiles p
    join public.bolumler b on b.id = p.bolum_id
    join public.uzmanliklar u on u.name = case
      when b.name ilike '%elektrik%' then 'Elektrikçi'
      when b.name ilike '%kaynak%' then 'Kaynakçı'
    end
    left join public.seviyeler s on s.user_id = p.id
    where p.panel = 'worker'
    on conflict do nothing;

    insert into public.bolumler (name, kod)
    select v.name, v.kod
    from (values ('Satın alma', 'satinalma'), ('Tasarım', 'tasarim'), ('İmalat', 'imalat'), ('Muhasebe', 'muhasebe')) as v (name, kod)
    where not exists (select 1 from public.bolumler b where b.name = v.name);

    update public.bolumler b set kod = v.kod
    from (values ('Satın alma', 'satinalma'), ('Tasarım', 'tasarim'), ('İmalat', 'imalat'), ('Muhasebe', 'muhasebe')) as v (name, kod)
    where b.name = v.name;

    update public.profiles p set bolum_id = c.id
    from public.bolumler o, public.bolumler c
    where p.bolum_id = o.id and o.id <> c.id and c.kod = o.kod
      and c.name in ('Satın alma', 'Tasarım', 'İmalat', 'Muhasebe');

    delete from public.bolumler where name not in ('Satın alma', 'Tasarım', 'İmalat', 'Muhasebe');

    -- Starting suggestions for the step types, so welders' and electricians'
    -- finishes keep counting straight away. Editable in Türler.
    update public.step_types st set uzmanlik_id = u.id
    from public.uzmanliklar u
    where st.uzmanlik_id is null and u.name = case
      when st.name ilike '%elektrik%' then 'Elektrikçi'
      when st.name ilike '%kaynak%' or st.name ilike '%şase%' or st.name like '%Şase%' or st.name ilike '%tank%' then 'Kaynakçı'
    end;
  end if;
end $$;

alter table public.bolumler alter column kod set not null;
create unique index if not exists bolumler_kod_key on public.bolumler (kod);

do $$
begin
  alter table public.bolumler
    add constraint bolumler_kod_check check (kod in ('satinalma', 'tasarim', 'imalat', 'muhasebe'));
exception
  when duplicate_object then null;
end $$;

-- The list is fixed now: everyone reads it, nobody edits it from the app.
drop policy if exists bolum_insert on public.bolumler;
drop policy if exists bolum_update on public.bolumler;
drop policy if exists bolum_delete on public.bolumler;
revoke insert, update, delete on public.bolumler from authenticated;

-- The signed-in person's bölüm, by its fixed code ('imalat', 'tasarim'...).
create or replace function public.current_bolum()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select b.kod from public.profiles p join public.bolumler b on b.id = p.bolum_id
  where p.id = auth.uid() and p.active
$$;

revoke all on function public.current_bolum() from public;
grant execute on function public.current_bolum() to authenticated, service_role;

-- The one level for everyone is replaced by a level per uzmanlık.
drop table if exists public.seviyeler;

-- ---- Approval follows the level in the step's uzmanlık ----
-- The person who finishes a step counts with their level in that step's
-- uzmanlık (from its step type). An Usta's finish is final. Anyone else, a
-- Personel outside İmalat, or one without that uzmanlık, waits for approval.
-- Genel Müdür, IT and Bölüm Sorumluları never wait.
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
    if v_manages or (
      coalesce(public.current_bolum() = 'imalat', false)
      and exists (
        select 1
        from public.step_types st
        join public.kisi_uzmanliklari ku on ku.uzmanlik_id = st.uzmanlik_id
        where st.id = v_step.step_type_id and ku.user_id = auth.uid() and ku.seviye = 'usta'
      )
    ) then
      v_new := 'done';
      v_kind := 'finished';
    else
      v_new := 'review';
      v_kind := 'submitted';
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
    finished_at = case
      when v_kind = 'approved' then coalesce(submitted_at, now())
      when v_new = 'done' then now()
      else null
    end,
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

-- ---- Talepler ----
-- "Malzeme eksik" (with the material and quantity typed in) goes to the Bölüm
-- Sorumluları and Satın alma: Sipariş verildi, then Geldi. "Çizim hatalı" goes
-- to Tasarım. Anyone who can handle one may press "Ben ilgileniyorum"; everyone
-- sees who is on it.

create table if not exists public.talepler (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  step_id uuid references public.project_steps (id) on delete set null,
  kind text not null check (kind in ('malzeme', 'cizim')),
  material text check (material is null or length(material) <= 200),
  quantity text check (quantity is null or length(quantity) <= 60),
  note text check (note is null or length(note) <= 400),
  status text not null default 'acik' check (status in ('acik', 'siparis', 'geldi', 'cozuldu')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  handler_id uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  ordered_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null
);

create index if not exists talepler_project_idx on public.talepler (project_id);
create index if not exists talepler_step_idx on public.talepler (step_id);

alter table public.talepler enable row level security;

drop policy if exists talep_select on public.talepler;
create policy talep_select on public.talepler
  for select to authenticated using (public.current_panel() is not null);

grant select on public.talepler to authenticated;
grant all on public.talepler to service_role;

-- Reports a problem on a step, and for "Malzeme eksik" or "Çizim hatalı" also
-- opens a request. The step change itself goes through step_action.
create or replace function public.sorun_bildir(
  p_step_id uuid,
  p_reason text,
  p_note text default null,
  p_material text default null,
  p_quantity text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := case btrim(coalesce(p_reason, ''))
    when 'Malzeme eksik' then 'malzeme'
    when 'Çizim hatalı' then 'cizim'
  end;
  v_material text := nullif(btrim(coalesce(p_material, '')), '');
  v_id uuid;
begin
  if v_kind = 'malzeme' and v_material is null then
    raise exception 'Hangi malzemenin eksik olduğunu yazın.' using errcode = '22023';
  end if;
  perform public.step_action(p_step_id, 'problem', p_reason, p_note);
  if v_kind is null then
    return null;
  end if;
  insert into public.talepler (project_id, step_id, kind, material, quantity, note, created_by)
  select ps.project_id, ps.id, v_kind,
         case when v_kind = 'malzeme' then v_material end,
         case when v_kind = 'malzeme' then nullif(btrim(coalesce(p_quantity, '')), '') end,
         nullif(btrim(coalesce(p_note, '')), ''),
         auth.uid()
  from public.project_steps ps where ps.id = p_step_id
  returning id into v_id;
  return v_id;
end;
$$;

-- Moves a request along.
--   ilgilen : "Ben ilgileniyorum": the caller becomes the one handling it
--   siparis : material requests: Sipariş verildi
--   geldi   : material requests: Geldi (closes it)
--   cozuldu : drawing requests: Düzeltildi (closes it)
-- Allowed for Genel Müdür, IT and Bölüm Sorumluları; Satın alma for material
-- requests, Tasarım for drawing requests.
create or replace function public.talep_action(p_id uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_panel public.panel := public.current_panel();
  v_talep public.talepler%rowtype;
  v_status text;
begin
  if v_panel is null then
    raise exception 'Oturum bulunamadı.' using errcode = '42501';
  end if;
  select * into v_talep from public.talepler where id = p_id for update;
  if not found then
    raise exception 'Talep bulunamadı.' using errcode = 'P0002';
  end if;
  if not coalesce(
    v_panel in ('ceo', 'manager')
    or (v_talep.kind = 'malzeme' and public.current_bolum() = 'satinalma')
    or (v_talep.kind = 'cizim' and public.current_bolum() = 'tasarim'),
    false
  ) then
    raise exception 'Bu talebi yalnızca ilgili bölüm ve sorumlular yönetebilir.' using errcode = '42501';
  end if;

  if p_action = 'ilgilen' and v_talep.status in ('acik', 'siparis') then
    v_status := v_talep.status;
  elsif p_action = 'siparis' and v_talep.kind = 'malzeme' and v_talep.status = 'acik' then
    v_status := 'siparis';
  elsif p_action = 'geldi' and v_talep.kind = 'malzeme' and v_talep.status in ('acik', 'siparis') then
    v_status := 'geldi';
  elsif p_action = 'cozuldu' and v_talep.kind = 'cizim' and v_talep.status = 'acik' then
    v_status := 'cozuldu';
  else
    raise exception 'Bu talep şu anda bu işleme uygun değil.' using errcode = '22023';
  end if;

  update public.talepler set
    status = v_status,
    handler_id = case when p_action = 'ilgilen' then auth.uid() else coalesce(handler_id, auth.uid()) end,
    handled_at = case when p_action = 'ilgilen' or handler_id is null then now() else handled_at end,
    ordered_at = case when v_status = 'siparis' then now() else ordered_at end,
    closed_at = case when v_status in ('geldi', 'cozuldu') then now() else null end,
    closed_by = case when v_status in ('geldi', 'cozuldu') then auth.uid() else null end
  where id = p_id;
  return v_status;
end;
$$;

revoke all on function public.sorun_bildir(uuid, text, text, text, text) from public;
revoke all on function public.talep_action(uuid, text) from public;
grant execute on function public.sorun_bildir(uuid, text, text, text, text) to authenticated;
grant execute on function public.talep_action(uuid, text) to authenticated;

-- ---- Dosyalar ----
-- Each project has one Ana doküman and any number of other project files;
-- each step has its own small files. Uploading a file whose name is already
-- there (like Mac's Desktop) saves it as "name (2).ext", the current version,
-- and the earlier one moves to Eski sürümler. Deleting also moves a file to
-- Eski sürümler; nothing is erased.
-- Project files: only Genel Müdür, IT, Bölüm Sorumluları and Tasarım add,
-- replace or delete them. Step files: everyone adds them; the same four groups
-- delete them. Everyone downloads current files; only the four groups open
-- Eski sürümler.

create table if not exists public.dosyalar (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  step_id uuid references public.project_steps (id) on delete cascade,
  ana boolean not null default false,
  name text not null check (length(btrim(name)) between 1 and 200),
  storage_path text not null unique,
  size bigint,
  mime text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Set when the file moved to Eski sürümler: replaced by a newer version, or deleted.
  eski_at timestamptz,
  eski_by uuid references public.profiles (id) on delete set null,
  silindi boolean not null default false,
  check (not (ana and step_id is not null))
);

create index if not exists dosyalar_project_idx on public.dosyalar (project_id);
create index if not exists dosyalar_step_idx on public.dosyalar (step_id);

-- Genel Müdür, IT, Bölüm Sorumluları and Tasarım.
create or replace function public.dosya_yetkili()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_panel() in ('ceo', 'manager') or public.current_bolum() = 'tasarim', false)
$$;

revoke all on function public.dosya_yetkili() from public;
grant execute on function public.dosya_yetkili() to authenticated, service_role;

alter table public.dosyalar enable row level security;

drop policy if exists dosya_select on public.dosyalar;
create policy dosya_select on public.dosyalar
  for select to authenticated
  using (public.current_panel() is not null and (eski_at is null or public.dosya_yetkili()));

grant select on public.dosyalar to authenticated;
grant all on public.dosyalar to service_role;

-- "plan (2).pdf" -> "plan"; "plan.pdf" -> "plan"
create or replace function public.dosya_kok(p_name text)
returns text
language sql
immutable
as $$
  select regexp_replace(regexp_replace(p_name, '\.[^./]*$', ''), ' \(\d+\)$', '')
$$;

-- Records a file after the browser has uploaded it to storage, and works out
-- its name and versions. Returns the name it was saved under.
create or replace function public.dosya_ekle(
  p_project_id uuid,
  p_step_id uuid,
  p_ana boolean,
  p_name text,
  p_path text,
  p_size bigint default null,
  p_mime text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_ext text;
  v_kok text;
  v_n integer;
  v_ana boolean := coalesce(p_ana, false) and p_step_id is null;
begin
  if public.current_panel() is null then
    raise exception 'Oturum bulunamadı.' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Dosya adı boş olamaz.' using errcode = '22023';
  end if;
  if p_step_id is null then
    if not public.dosya_yetkili() then
      raise exception 'Proje dosyalarını yalnızca Genel Müdür, IT, Bölüm Sorumluları ve Tasarım ekleyebilir.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.projects where id = p_project_id) then
      raise exception 'Proje bulunamadı.' using errcode = 'P0002';
    end if;
    if p_path not like 'p/' || p_project_id || '/%' then
      raise exception 'Dosya yolu geçersiz.' using errcode = '22023';
    end if;
  else
    if not exists (select 1 from public.project_steps where id = p_step_id and project_id = p_project_id) then
      raise exception 'Adım bulunamadı.' using errcode = 'P0002';
    end if;
    if p_path not like 's/' || p_step_id || '/%' then
      raise exception 'Dosya yolu geçersiz.' using errcode = '22023';
    end if;
  end if;

  v_ext := coalesce(substring(v_name from '(\.[^./]*)$'), '');
  v_kok := public.dosya_kok(v_name);

  -- One place at a time, so two uploads cannot pick the same number.
  perform pg_advisory_xact_lock(hashtext(p_project_id::text || coalesce(p_step_id::text, '') || v_ana::text));

  -- Same name already here: the new one becomes "name (n).ext", the next free number.
  if exists (
    select 1 from public.dosyalar d
    where d.project_id = p_project_id and d.step_id is not distinct from p_step_id and d.ana = v_ana
      and d.eski_at is null and public.dosya_kok(d.name) = v_kok
      and coalesce(substring(d.name from '(\.[^./]*)$'), '') = v_ext
  ) then
    select coalesce(max(coalesce((substring(d.name from ' \((\d+)\)(\.[^./]*)?$'))::int, 1)), 1) + 1 into v_n
    from public.dosyalar d
    where d.project_id = p_project_id and d.step_id is not distinct from p_step_id and d.ana = v_ana
      and public.dosya_kok(d.name) = v_kok
      and coalesce(substring(d.name from '(\.[^./]*)$'), '') = v_ext;
    v_name := v_kok || ' (' || v_n || ')' || v_ext;
  end if;

  -- The earlier version moves to Eski sürümler. A project has one Ana doküman,
  -- so a new one always replaces the old one, whatever its name.
  update public.dosyalar d set eski_at = now(), eski_by = auth.uid()
  where d.project_id = p_project_id and d.step_id is not distinct from p_step_id and d.ana = v_ana
    and d.eski_at is null
    and (v_ana or (public.dosya_kok(d.name) = v_kok and coalesce(substring(d.name from '(\.[^./]*)$'), '') = v_ext));

  insert into public.dosyalar (project_id, step_id, ana, name, storage_path, size, mime, uploaded_by)
  values (p_project_id, p_step_id, v_ana, v_name, p_path, p_size, nullif(p_mime, ''), auth.uid());
  return v_name;
end;
$$;

-- Moves a file to Eski sürümler. Genel Müdür, IT, Bölüm Sorumluları and Tasarım only.
create or replace function public.dosya_sil(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.dosya_yetkili() then
    raise exception 'Dosyaları yalnızca Genel Müdür, IT, Bölüm Sorumluları ve Tasarım silebilir.' using errcode = '42501';
  end if;
  update public.dosyalar set eski_at = now(), eski_by = auth.uid(), silindi = true
  where id = p_id and eski_at is null;
  if not found then
    raise exception 'Dosya bulunamadı.' using errcode = 'P0002';
  end if;
end;
$$;

-- Whether the signed-in person may download a stored file: a current file,
-- or any version for the four groups above. (Storage also lets the uploader
-- read back what they just uploaded, before it is recorded here.)
create or replace function public.dosya_okunabilir(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_panel() is not null and exists (
    select 1 from public.dosyalar d
    where d.storage_path = p_path and (d.eski_at is null or public.dosya_yetkili())
  )
$$;

revoke all on function public.dosya_ekle(uuid, uuid, boolean, text, text, bigint, text) from public;
revoke all on function public.dosya_sil(uuid) from public;
revoke all on function public.dosya_okunabilir(text) from public;
grant execute on function public.dosya_ekle(uuid, uuid, boolean, text, text, bigint, text) to authenticated;
grant execute on function public.dosya_sil(uuid) to authenticated;
grant execute on function public.dosya_okunabilir(text) to authenticated;

-- The files themselves live in a private storage bucket. Paths are
-- p/<project id>/<random id> for project files and s/<step id>/<random id>
-- for step files; the real name is kept in the table above.
insert into storage.buckets (id, name, public)
values ('dosyalar', 'dosyalar', false)
on conflict (id) do nothing;

drop policy if exists felix_dosyalar_insert on storage.objects;
create policy felix_dosyalar_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dosyalar'
    and public.current_panel() is not null
    and (name like 's/%' or (name like 'p/%' and public.dosya_yetkili()))
  );

drop policy if exists felix_dosyalar_select on storage.objects;
create policy felix_dosyalar_select on storage.objects
  for select to authenticated
  using (bucket_id = 'dosyalar' and (public.dosya_okunabilir(name) or owner_id = (auth.uid())::text));
