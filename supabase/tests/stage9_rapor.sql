-- Tests for the project report, codes and delivery (0011). Runs after the
-- earlier test files:
--   ...0a Genel Müdür, ...a1 IT, ...0b Bölüm Sorumlusu, ...0c worker (Personel).

\set ON_ERROR_STOP on

-- The migration can be run again without harm, and changes no code it gave.
create temp table codes_before as select id, code from public.projects;
\ir ../migrations/0011_proje_raporu.sql
\ir ../migrations/0011_proje_raporu.sql

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

\set gm '00000000-0000-0000-0000-00000000000a'
\set bs '00000000-0000-0000-0000-00000000000b'
\set worker '00000000-0000-0000-0000-00000000000c'

select pg_temp.expect(
  (select count(*) from public.projects p join codes_before b using (id) where p.code is distinct from b.code) = 0,
  'running the update again changes no code');
select pg_temp.expect(
  not exists (select 1 from public.projects where code is null or code !~ '^AF-[0-9]{2}-[0-9]{3,}$'),
  'every earlier project has an AF code');
select pg_temp.expect(
  (select array_agg(code order by created_at, id) = array_agg(code order by code) from public.projects),
  'earlier projects are numbered in the order they were opened');
select pg_temp.expect(
  (select count(*) from public.projects) = (select count(*) from public.proje_anahtarlari),
  'every earlier project has a customer key');

-- ---- New projects ----
set role authenticated;
select pg_temp.as_user(:'bs');
select (select max(substring(code from 7)::integer) from public.projects) as last_no \gset
select public.create_project('Rapor projesi', 'ELLE-1') as p1 \gset
select code as p1_code from public.projects where id = :'p1' \gset
select pg_temp.expect(:'p1_code' = 'AF-' || to_char(now() at time zone 'Europe/Istanbul', 'YY') || '-' || lpad((:last_no + 1)::text, 3, '0'),
  'a new project gets the next code, whatever code was sent');
select public.create_project('İkinci proje') as p2 \gset
select pg_temp.expect((select code from public.projects where id = :'p2') = 'AF-' || to_char(now() at time zone 'Europe/Istanbul', 'YY') || '-' || lpad((:last_no + 2)::text, 3, '0'),
  'and the one after it the number after that');
update public.projects set code = 'BASKA' where id = :'p1';
select pg_temp.expect((select code from public.projects where id = :'p1') = :'p1_code', 'a code once given cannot be changed');

-- A deleted project's number is not given again.
select public.create_project('Silinecek') as p3 \gset
select code as p3_code from public.projects where id = :'p3' \gset
delete from public.projects where id = :'p3';
select public.create_project('Sonraki') as p4 \gset
select pg_temp.expect((select code from public.projects where id = :'p4') > :'p3_code', 'a deleted project''s number is not given again');

-- ---- Customer keys ----
select anahtar as p1_key from public.proje_anahtarlari where project_id = :'p1' \gset
select pg_temp.expect(:'p1_key' ~ '^[A-HJ-NP-Z2-9]{4}$', 'a new project gets a four-character key without 0, O, 1 or I');
select pg_temp.expect((select count(distinct anahtar) from public.proje_anahtarlari) > 1, 'keys differ between projects');
select pg_temp.as_user(:'worker');
select pg_temp.expect((select count(*) from public.proje_anahtarlari) = 0, 'Personel see no customer keys');
select pg_temp.fails(format($$select public.musteri_kodu_yenile(%L)$$, :'p2'), 'Personel cannot make a new customer code');
select pg_temp.as_user(:'gm');
select pg_temp.expect((select count(*) from public.proje_anahtarlari where project_id = :'p1') = 1, 'the Genel Müdür sees them');
select pg_temp.fails($$insert into public.proje_anahtarlari (project_id, anahtar) values (gen_random_uuid(), 'AAAA')$$, 'keys are not written directly');
select public.musteri_kodu_yenile(:'p2') as p2_key \gset
select pg_temp.expect((select anahtar from public.proje_anahtarlari where project_id = :'p2') = :'p2_key', 'a manager can make a new customer code');
reset role;
set role anon;
select pg_temp.fails('select * from public.proje_anahtarlari', 'signed out, keys cannot be read');
select pg_temp.fails($$select public.musteri_raporu('AF-26-001-AAAA')$$, 'nor the customer report called directly');
reset role;
set role authenticated;
select pg_temp.as_user(:'gm');
select pg_temp.fails($$select public.musteri_raporu('AF-26-001-AAAA')$$, 'only the server calls the customer report');

-- ---- Steps, photos and delivery ----
select public.add_step(:'p1', (select id from public.step_types where name = 'Test')) as s1 \gset
select public.add_step(:'p1', (select id from public.step_types where name = 'Paketleme ve sevkiyat')) as s2 \gset
select pg_temp.fails(format($$select public.proje_teslim(%L)$$, :'p1'), 'a project cannot be delivered before its steps are done');
select public.step_action(:'s1', 'finish', null, null, pg_temp.upload(:'s1'));
select (select id from public.dosyalar where step_id = :'s1') as photo1 \gset

reset role;
select set_config('request.jwt.claims', '', false);
set role service_role;
select :'p1_code' || '-' || :'p1_key' as customer_code \gset
select pg_temp.expect(public.musteri_raporu(:'customer_code') ->> 'durum' = 'hazirlaniyor', 'before every step is done the customer only sees that it is being prepared');
select pg_temp.expect(public.musteri_raporu(:'customer_code') - 'durum' - 'kod' - 'ad' = '{}'::jsonb, 'and nothing but its code and name');
reset role;

set role authenticated;
select pg_temp.as_user(:'gm');
select public.step_action(:'s2', 'finish', null, null, pg_temp.upload(:'s2'));
select pg_temp.as_user(:'worker');
select pg_temp.fails(format($$select public.proje_teslim(%L)$$, :'p1'), 'Personel cannot deliver a project');
select pg_temp.fails(format($$select public.dosya_musteriye(%L, true)$$, :'photo1'), 'nor tick a photo for the customer');
select pg_temp.as_user(:'bs');
select public.proje_teslim(:'p1');
select pg_temp.expect((select teslim_at is not null and teslim_by = :'bs'::uuid from public.projects where id = :'p1'), 'a Bölüm Sorumlusu delivers a finished project');
select public.proje_teslim(:'p1', false);
select pg_temp.expect((select teslim_at is null from public.projects where id = :'p1'), 'and can undo it');
select public.proje_teslim(:'p1');
select public.dosya_musteriye(:'photo1', true);
select pg_temp.expect((select musteriye from public.dosyalar where id = :'photo1'), 'a manager ticks a photo for the customer');

-- ---- The customer's report ----
reset role;
select set_config('request.jwt.claims', '', false);
set role service_role;
select public.musteri_raporu(:'customer_code') as report \gset
select pg_temp.expect((:'report'::jsonb) ->> 'durum' = 'hazir', 'once every step is done the customer sees the report');
select pg_temp.expect(jsonb_array_length((:'report'::jsonb) -> 'adimlar') = 2, 'with every step');
select pg_temp.expect((:'report'::jsonb) ->> 'teslim' is not null, 'and the delivery date');
select pg_temp.expect(jsonb_array_length((:'report'::jsonb) -> 'dosyalar') = 1
  and (:'report'::jsonb) -> 'dosyalar' -> 0 ->> 'id' = :'photo1', 'only the ticked photo is in it');
select pg_temp.expect(
  not exists (select 1 from public.profiles p where position(p.full_name in :'report') > 0 or position(p.username in :'report') > 0),
  'no person''s name is in it');
select pg_temp.expect(public.musteri_raporu(lower(replace(:'customer_code', '-', ' '))) ->> 'durum' = 'hazir',
  'lower case, spaces and missing dashes are forgiven');
select pg_temp.expect(public.musteri_raporu(:'p1_code') ->> 'durum' = 'yok', 'the project code alone opens nothing');
select pg_temp.expect(public.musteri_raporu(:'p1_code' || '-' || :'p2_key') ->> 'durum' = 'yok', 'nor another project''s key');
reset role;

-- A renewed code: the old one stops working.
set role authenticated;
select pg_temp.as_user(:'gm');
select public.musteri_kodu_yenile(:'p1') as p1_new \gset
reset role;
select set_config('request.jwt.claims', '', false);
set role service_role;
select pg_temp.expect(public.musteri_raporu(:'customer_code') ->> 'durum' = 'yok', 'after "Yeni kod" the old customer code stops working');
select pg_temp.expect(public.musteri_raporu(:'p1_code' || '-' || :'p1_new') ->> 'durum' = 'hazir', 'and the new one works');

-- Guessing is slowed down: after 30 wrong codes in ten minutes, nothing opens for a while.
select count(public.musteri_raporu('AF-26-999-ZZZZ')) from generate_series(1, 30);
select pg_temp.expect(public.musteri_raporu(:'p1_code' || '-' || :'p1_new') ->> 'durum' = 'bekle', 'after many wrong codes the customer is asked to wait');
reset role;
delete from public.rapor_denemeleri;

\echo ALL REPORT TESTS PASSED
