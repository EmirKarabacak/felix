-- Update 3: notifications (Bildirimler).
--
-- Felix tells people when something needs them: the bell at the top of every
-- screen, and an alert on the phone. Nobody is told about their own actions.
--   Yeni iş            the person just assigned to a step
--   İş geri gönderildi the step's assignees
--   Onay bekleyen iş   Bölüm Sorumluları, Genel Müdür and IT
--   Sorun bildirildi   Bölüm Sorumluları, Genel Müdür and IT
--   Yeni talep         whoever can handle it: Bölüm Sorumluları, Genel Müdür,
--                      IT, plus Satın alma (material) or Tasarım (drawing)
--   Malzemen geldi / Çizim düzeltildi   the person who reported it
-- Alerts are kept for 30 days.
--
-- Phone alerts are sent by Felix's server (api/bildirim.ts). It makes its own
-- signing keys the first time and keeps them in push_anahtar, which only the
-- server can read. Each phone that allowed alerts is a row in push_cihazlar.
--
-- Safe to run more than once; works as one transaction.

-- ---- The alerts ----
create table if not exists public.bildirimler (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'atandi', 'geri_gonderildi', 'onay_bekliyor', 'sorun',
    'malzeme_talebi', 'cizim_talebi', 'malzeme_geldi', 'cizim_duzeltildi'
  )),
  project_id uuid references public.projects (id) on delete cascade,
  step_id uuid references public.project_steps (id) on delete cascade,
  talep_id uuid references public.talepler (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  -- What the alert says, as it was at the time: step and project names, who
  -- did it, the problem reason (translated when shown) and any free text.
  adim text,
  proje text,
  kim text,
  sebep text,
  detay text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- Set by the server once it has sent (or skipped) the phone alert.
  pushed_at timestamptz
);

create index if not exists bildirimler_user_idx on public.bildirimler (user_id, created_at desc);
create index if not exists bildirimler_created_idx on public.bildirimler (created_at);
create index if not exists bildirimler_unsent_idx on public.bildirimler (created_at) where pushed_at is null;

alter table public.bildirimler enable row level security;

drop policy if exists bildirim_select on public.bildirimler;
create policy bildirim_select on public.bildirimler
  for select to authenticated using (user_id = auth.uid());

revoke all on public.bildirimler from anon, authenticated;
grant select on public.bildirimler to authenticated;
grant all on public.bildirimler to service_role;

-- ---- Phones that receive alerts ----
-- One row per phone (its push address). The language is the one chosen on
-- that phone, so its alerts arrive in it.
create table if not exists public.push_cihazlar (
  endpoint text primary key check (length(endpoint) between 10 and 2000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  lang text not null default 'tr' check (lang in ('tr', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_cihazlar_user_idx on public.push_cihazlar (user_id);

alter table public.push_cihazlar enable row level security;

drop policy if exists push_cihaz_select on public.push_cihazlar;
create policy push_cihaz_select on public.push_cihazlar
  for select to authenticated using (user_id = auth.uid());

revoke all on public.push_cihazlar from anon, authenticated;
grant select on public.push_cihazlar to authenticated;
grant all on public.push_cihazlar to service_role;

-- ---- The server's signing keys ----
-- Made by the server the first time it sends; nobody signed in can read them.
create table if not exists public.push_anahtar (
  id integer primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_anahtar enable row level security;
revoke all on public.push_anahtar from anon, authenticated;
grant all on public.push_anahtar to service_role;

-- ---- Writing alerts ----
-- Adds one alert for each of p_users, except the person doing it and anyone
-- removed. Also clears alerts older than 30 days.
create or replace function public.bildir(
  p_users uuid[],
  p_kind text,
  p_step_id uuid,
  p_talep_id uuid default null,
  p_sebep text default null,
  p_detay text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  delete from public.bildirimler where created_at < now() - interval '30 days';

  insert into public.bildirimler (user_id, kind, project_id, step_id, talep_id, actor_id, adim, proje, kim, sebep, detay)
  select distinct u.id, p_kind, ps.project_id, ps.id, p_talep_id, v_actor,
         ps.name, concat_ws(' ', pr.code, pr.name),
         (select full_name from public.profiles where id = v_actor),
         p_sebep, p_detay
  from unnest(p_users) as x(id)
  join public.profiles u on u.id = x.id and u.active
  join public.project_steps ps on ps.id = p_step_id
  join public.projects pr on pr.id = ps.project_id
  where u.id is distinct from v_actor;
end;
$$;

revoke all on function public.bildir(uuid[], text, uuid, uuid, text, text) from public, anon, authenticated;

-- Bölüm Sorumluları, Genel Müdür and IT.
create or replace function public.yoneticiler()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(id), '{}') from public.profiles where active and panel in ('ceo', 'manager')
$$;

revoke all on function public.yoneticiler() from public, anon, authenticated;

-- Yeni iş: someone was put on a step (not on a finished one).
create or replace function public.bildir_atama()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.project_steps where id = new.step_id and status <> 'done') then
    perform public.bildir(array[new.user_id], 'atandi', new.step_id);
  end if;
  return new;
end;
$$;

drop trigger if exists bildir_atama on public.step_assignees;
create trigger bildir_atama
  after insert on public.step_assignees
  for each row execute function public.bildir_atama();

-- Handed in, sent back, or a problem: read from the step's history.
create or replace function public.bildir_adim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step public.project_steps%rowtype;
begin
  select * into v_step from public.project_steps where id = new.step_id;
  if not found then
    return new;
  end if;
  if new.kind = 'submitted' then
    perform public.bildir(public.yoneticiler(), 'onay_bekliyor', new.step_id);
  elsif new.kind = 'rejected' then
    perform public.bildir(
      (select coalesce(array_agg(user_id), '{}') from public.step_assignees where step_id = new.step_id),
      'geri_gonderildi', new.step_id, null, null, v_step.review_note);
  elsif new.kind = 'problem' then
    perform public.bildir(public.yoneticiler(), 'sorun', new.step_id, null, v_step.problem_reason, v_step.problem_note);
  end if;
  return new;
end;
$$;

drop trigger if exists bildir_adim on public.step_events;
create trigger bildir_adim
  after insert on public.step_events
  for each row
  when (new.kind in ('submitted', 'rejected', 'problem'))
  execute function public.bildir_adim();

-- Yeni talep. A request comes with its problem (sorun_bildir), so whoever was
-- just told "Sorun bildirildi" for that step gets this one in its place
-- rather than a second alert.
create or replace function public.bildir_talep()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := case when new.kind = 'malzeme' then 'malzeme_talebi' else 'cizim_talebi' end;
  v_detay text := case when new.kind = 'malzeme' then concat_ws(' · ', new.material, new.quantity) else new.note end;
  v_users uuid[];
begin
  if new.step_id is null then
    return new;
  end if;
  select coalesce(array_agg(p.id), '{}') into v_users
  from public.profiles p
  left join public.bolumler b on b.id = p.bolum_id
  where p.active and (
    p.panel in ('ceo', 'manager')
    or (new.kind = 'malzeme' and b.kod = 'satinalma')
    or (new.kind = 'cizim' and b.kod = 'tasarim')
  );

  update public.bildirimler set kind = v_kind, talep_id = new.id, sebep = null, detay = v_detay
  where step_id = new.step_id and kind = 'sorun' and created_at = now() and pushed_at is null
    and user_id = any (v_users);

  perform public.bildir(
    array(select u from unnest(v_users) u
          where not exists (select 1 from public.bildirimler b where b.user_id = u and b.talep_id = new.id)),
    v_kind, new.step_id, new.id, null, v_detay);
  return new;
end;
$$;

drop trigger if exists bildir_talep on public.talepler;
create trigger bildir_talep
  after insert on public.talepler
  for each row execute function public.bildir_talep();

-- Malzemen geldi / Çizim düzeltildi: to the person who reported it.
create or replace function public.bildir_talep_kapandi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.step_id is not null and new.created_by is not null then
    perform public.bildir(
      array[new.created_by],
      case when new.kind = 'malzeme' then 'malzeme_geldi' else 'cizim_duzeltildi' end,
      new.step_id, new.id, null,
      case when new.kind = 'malzeme' then concat_ws(' · ', new.material, new.quantity) end);
  end if;
  return new;
end;
$$;

drop trigger if exists bildir_talep_kapandi on public.talepler;
create trigger bildir_talep_kapandi
  after update of status on public.talepler
  for each row
  when (new.status in ('geldi', 'cozuldu') and old.status is distinct from new.status)
  execute function public.bildir_talep_kapandi();

revoke all on function public.bildir_atama() from public, anon, authenticated;
revoke all on function public.bildir_adim() from public, anon, authenticated;
revoke all on function public.bildir_talep() from public, anon, authenticated;
revoke all on function public.bildir_talep_kapandi() from public, anon, authenticated;

-- ---- What the app calls ----

-- Marks one of my alerts as read, or all of them (no id).
create or replace function public.bildirim_okundu(p_id uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bildirimler set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_id is null or id = p_id)
$$;

-- This phone wants alerts for me, in this language. A phone that someone else
-- used before moves to me.
create or replace function public.push_kaydet(p_endpoint text, p_p256dh text, p_auth text, p_lang text default 'tr')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_panel() is null then
    raise exception 'Oturum bulunamadı.' using errcode = '42501';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' then
    raise exception 'Bu cihazın bildirim adresi geçersiz.' using errcode = '22023';
  end if;
  insert into public.push_cihazlar (endpoint, user_id, p256dh, auth, lang)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, case when p_lang = 'en' then 'en' else 'tr' end)
  on conflict (endpoint) do update set
    user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    lang = excluded.lang, updated_at = now();
end;
$$;

-- This phone stops receiving my alerts (switched off, or signing out).
create or replace function public.push_sil(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_cihazlar where endpoint = p_endpoint and user_id = auth.uid()
$$;

revoke all on function public.bildirim_okundu(uuid) from public, anon;
revoke all on function public.push_kaydet(text, text, text, text) from public, anon;
revoke all on function public.push_sil(text) from public, anon;
grant execute on function public.bildirim_okundu(uuid) to authenticated;
grant execute on function public.push_kaydet(text, text, text, text) to authenticated;
grant execute on function public.push_sil(text) to authenticated;

-- Lets the app see the new tables and functions straight away.
notify pgrst, 'reload schema';
