-- Tests for notifications (0010). Runs after the earlier test files:
--   ...0a Genel Müdür, ...a1 IT, ...0b Bölüm Sorumlusu, ...0c worker (Personel),
--   ...f1 Tasarım and ...f2 Satın alma (both Personel).

\set ON_ERROR_STOP on

-- The migration can be run again without harm.
\ir ../migrations/0010_bildirimler.sql

create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok: %', label;
end $$;

create function pg_temp.fails(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok: % (refused: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAILED: % was allowed', label;
end $$;

create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id)::text, false)
$$;

create function pg_temp.upload(p_step uuid) returns text language plpgsql as $$
declare v_path text := 's/' || p_step || '/' || gen_random_uuid();
begin
  perform public.dosya_ekle((select project_id from public.project_steps where id = p_step), p_step, false,
    'Bitiş fotoğrafı ' || gen_random_uuid() || '.jpg', v_path, 1000, 'image/jpeg');
  return v_path;
end $$;

-- Alerts of one kind for one step, counted as the database (not the caller) sees them.
create function pg_temp.alerts(p_kind text, p_step uuid) returns bigint language sql security definer as $$
  select count(*) from public.bildirimler where kind = p_kind and step_id = p_step
$$;
create function pg_temp.alerted(p_user text, p_kind text, p_step uuid) returns boolean language sql security definer as $$
  select exists (select 1 from public.bildirimler where user_id = p_user::uuid and kind = p_kind and step_id = p_step)
$$;

\set gm '00000000-0000-0000-0000-00000000000a'
\set it '00000000-0000-0000-0000-0000000000a1'
\set bs '00000000-0000-0000-0000-00000000000b'
\set worker '00000000-0000-0000-0000-00000000000c'
\set tasarim '00000000-0000-0000-0000-0000000000f1'
\set satinalma '00000000-0000-0000-0000-0000000000f2'

select (select count(*) from public.profiles where active and panel in ('ceo', 'manager')) as managers \gset
select pg_temp.expect(:managers >= 3, 'there are Bölüm Sorumluları, a Genel Müdür and IT to alert');

set role authenticated;

-- ---- Yeni iş ----
select pg_temp.as_user(:'bs');
insert into public.step_types (name) values ('Bildirimli iş');
select public.create_project('Bildirim projesi', 'BLD-1') as project_id \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Bildirimli iş')) as step1 \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Bildirimli iş')) as step2 \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Bildirimli iş')) as step3 \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Bildirimli iş')) as step4 \gset
insert into public.step_assignees (step_id, user_id) values
  (:'step1', :'worker'), (:'step2', :'worker'), (:'step3', :'worker'), (:'step4', :'worker');
select pg_temp.expect(pg_temp.alerted(:'worker', 'atandi', :'step1'), 'a person put on a step is told "Yeni iş"');
reset role;
select pg_temp.expect(
  (select adim = 'Bildirimli iş' and proje = (select code || ' Bildirim projesi' from public.projects where id = :'project_id') and kim is not null and read_at is null and pushed_at is null
   from public.bildirimler where step_id = :'step1' and kind = 'atandi'),
  'the alert keeps the step, the project and who did it');
set role authenticated;
insert into public.step_assignees (step_id, user_id) values (:'step1', :'bs');
select pg_temp.expect(not pg_temp.alerted(:'bs', 'atandi', :'step1'), 'nobody is told about their own action');

-- ---- Onay bekleyen iş ----
select pg_temp.as_user(:'worker');
select public.step_action(:'step1', 'start');
select public.step_action(:'step1', 'finish', null, null, pg_temp.upload(:'step1'));
select pg_temp.expect(pg_temp.alerts('onay_bekliyor', :'step1') = :managers,
  'a hand-in tells every Bölüm Sorumlusu, the Genel Müdür and IT');
select pg_temp.expect(pg_temp.alerted(:'gm', 'onay_bekliyor', :'step1') and pg_temp.alerted(:'it', 'onay_bekliyor', :'step1'),
  'Genel Müdür and IT among them');
select pg_temp.expect(not pg_temp.alerted(:'worker', 'onay_bekliyor', :'step1'), 'but not the worker who handed it in');

-- ---- İş geri gönderildi ----
select pg_temp.as_user(:'gm');
select public.step_action(:'step1', 'reject', null, 'Kaynak dikişi eksik');
reset role;
select pg_temp.expect(
  (select detay = 'Kaynak dikişi eksik' from public.bildirimler where user_id = :'worker' and kind = 'geri_gonderildi' and step_id = :'step1'),
  'sending it back tells the assignees, with the reason');
set role authenticated;
select pg_temp.expect(pg_temp.alerted(:'bs', 'geri_gonderildi', :'step1'), 'every assignee');
select pg_temp.expect(not pg_temp.alerted(:'gm', 'geri_gonderildi', :'step1'), 'not the one who sent it back');

-- ---- Sorun bildirildi ----
select pg_temp.as_user(:'worker');
select public.sorun_bildir(:'step2', 'Makine arızası', 'Pres çalışmıyor');
select pg_temp.expect(pg_temp.alerts('sorun', :'step2') = :managers, 'a problem tells the managers, Genel Müdür and IT');
reset role;
select pg_temp.expect(
  (select sebep = 'Makine arızası' and detay = 'Pres çalışmıyor' from public.bildirimler where user_id = :'gm' and kind = 'sorun' and step_id = :'step2'),
  'with the reason and the note');
set role authenticated;
select pg_temp.expect(not pg_temp.alerted(:'satinalma', 'sorun', :'step2'), 'Satın alma is not told of a machine breakdown');

-- ---- Yeni talep ----
select public.sorun_bildir(:'step3', 'Malzeme eksik', null, 'Profil 40x40', '6 boy');
select pg_temp.expect(pg_temp.alerts('sorun', :'step3') = 0 and pg_temp.alerts('malzeme_talebi', :'step3') = :managers + 1,
  'missing material: one "Yeni talep" each for the managers and Satın alma, not a second alert');
reset role;
select pg_temp.expect(
  (select detay = 'Profil 40x40 · 6 boy' and talep_id is not null from public.bildirimler where user_id = :'satinalma' and step_id = :'step3'),
  'it says what is missing and how much');
set role authenticated;
select pg_temp.expect(not pg_temp.alerted(:'tasarim', 'malzeme_talebi', :'step3'), 'Tasarım is not told of material');
select public.sorun_bildir(:'step4', 'Çizim hatalı', 'Ölçü yanlış');
select pg_temp.expect(pg_temp.alerted(:'tasarim', 'cizim_talebi', :'step4') and not pg_temp.alerted(:'satinalma', 'cizim_talebi', :'step4'),
  'a wrong drawing tells Tasarım, not Satın alma');
select pg_temp.expect(pg_temp.alerts('cizim_talebi', :'step4') = :managers + 1, 'and the managers');

-- ---- Malzemen geldi / Çizim düzeltildi ----
select pg_temp.as_user(:'satinalma');
select public.talep_action((select id from public.talepler where step_id = :'step3'), 'siparis');
select pg_temp.expect(not pg_temp.alerted(:'worker', 'malzeme_geldi', :'step3'), 'ordering does not alert yet');
select public.talep_action((select id from public.talepler where step_id = :'step3'), 'geldi');
reset role;
select pg_temp.expect(
  (select detay = 'Profil 40x40 · 6 boy' from public.bildirimler where user_id = :'worker' and kind = 'malzeme_geldi'),
  'the reporter is told the material arrived');
set role authenticated;
select pg_temp.as_user(:'tasarim');
select public.talep_action((select id from public.talepler where step_id = :'step4'), 'cozuldu');
select pg_temp.expect(pg_temp.alerted(:'worker', 'cizim_duzeltildi', :'step4'), 'and that the drawing was fixed');

-- ---- Who sees what ----
select pg_temp.as_user(:'worker');
select pg_temp.expect((select count(*) from public.bildirimler) = (select count(*) from public.bildirimler where user_id = :'worker'),
  'everyone sees only their own alerts');
select pg_temp.expect((select count(*) from public.bildirimler) >= 6, 'and does see them');
select pg_temp.fails($$insert into public.bildirimler (user_id, kind) values ('00000000-0000-0000-0000-00000000000c', 'atandi')$$,
  'nobody writes alerts directly');
select pg_temp.fails($$update public.bildirimler set read_at = now()$$, 'nor changes them directly');
select pg_temp.fails($$select public.bildir(array['00000000-0000-0000-0000-00000000000c'::uuid], 'atandi', null)$$,
  'nor calls the function that writes them');
select pg_temp.fails($$select * from public.push_anahtar$$, 'nobody signed in reads the server keys');

-- reading
select pg_temp.expect((select count(*) from public.bildirimler where read_at is null) >= 6, 'alerts start unread');
select public.bildirim_okundu((select id from public.bildirimler where kind = 'atandi' and step_id = :'step1'));
select pg_temp.expect((select read_at is not null from public.bildirimler where kind = 'atandi' and step_id = :'step1'), 'one alert can be marked read');
select pg_temp.expect((select count(*) from public.bildirimler where read_at is null) > 0, 'leaving the others');
select pg_temp.as_user(:'gm');
select public.bildirim_okundu();
select pg_temp.as_user(:'worker');
select pg_temp.expect((select count(*) from public.bildirimler where read_at is null) > 0, 'marking all read touches only my own');
select public.bildirim_okundu();
select pg_temp.expect((select count(*) from public.bildirimler where read_at is null) = 0, '"Tümünü okundu say" marks all mine');

-- ---- Phones ----
select pg_temp.fails($$select public.push_kaydet('http://example.com/x', 'k', 'a')$$, 'a phone address must be https');
select public.push_kaydet('https://push.example.com/telefon-1', 'p256', 'auth', 'en');
select pg_temp.expect((select user_id = '00000000-0000-0000-0000-00000000000c' and lang = 'en' from public.push_cihazlar), 'a phone is registered for me, in my language');
select pg_temp.as_user(:'bs');
select pg_temp.expect((select count(*) from public.push_cihazlar) = 0, 'others do not see my phone');
select public.push_kaydet('https://push.example.com/telefon-1', 'p256', 'auth');
select pg_temp.expect((select user_id = '00000000-0000-0000-0000-00000000000b' and lang = 'tr' from public.push_cihazlar), 'a phone someone else signs in on moves to them');
select pg_temp.fails($$insert into public.push_cihazlar (endpoint, user_id, p256dh, auth) values ('https://x.example.com/1', '00000000-0000-0000-0000-00000000000c', 'k', 'a')$$,
  'phones are registered only through push_kaydet');
select pg_temp.as_user(:'worker');
select public.push_sil('https://push.example.com/telefon-1');
select pg_temp.as_user(:'bs');
select pg_temp.expect((select count(*) from public.push_cihazlar) = 1, 'nobody else can remove my phone');
select public.push_sil('https://push.example.com/telefon-1');
select pg_temp.expect((select count(*) from public.push_cihazlar) = 0, 'signing out forgets the phone');
reset role;

-- ---- Kept for 30 days ----
insert into public.bildirimler (user_id, kind, created_at) values (:'worker', 'atandi', now() - interval '31 days');
set role authenticated;
select pg_temp.as_user(:'bs');
select public.add_step(:'project_id', (select id from public.step_types where name = 'Bildirimli iş')) as step5 \gset
insert into public.step_assignees (step_id, user_id) values (:'step5', :'worker');
reset role;
select pg_temp.expect((select count(*) from public.bildirimler where created_at < now() - interval '30 days') = 0, 'alerts older than 30 days are cleared');

-- ---- People who were removed are not alerted ----
select pg_temp.as_user(:'gm');
update public.profiles set active = false where id = :'satinalma';
set role authenticated;
select pg_temp.as_user(:'worker');
select public.step_action(:'step5', 'start');
select public.sorun_bildir(:'step5', 'Malzeme eksik', null, 'Vida', null);
reset role;
select pg_temp.expect(not pg_temp.alerted(:'satinalma', 'malzeme_talebi', :'step5'), 'a removed person gets no alerts');
select pg_temp.as_user(:'gm');
update public.profiles set active = true where id = :'satinalma';

\echo ALL NOTIFICATION TESTS PASSED
