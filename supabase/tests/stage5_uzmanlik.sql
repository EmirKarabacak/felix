-- Access-rule tests for Genel Müdür and IT, the fixed bölümler and Uzmanlık
-- (0008). Runs after the earlier test files: ...0a ceo, ...0b manager,
-- ...0c worker (active).

\set ON_ERROR_STOP on

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

create function pg_temp.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

select pg_temp.expect((select string_agg(kod, ',' order by kod) from public.bolumler) = 'imalat,muhasebe,satinalma,tasarim',
  'there are exactly four bölümler');
select pg_temp.expect((select string_agg(name, ',' order by name) from public.uzmanliklar) = 'Elektrikçi,Kaynakçı',
  'the uzmanlık list starts with Kaynakçı and Elektrikçi');
select pg_temp.expect(to_regclass('public.seviyeler') is null, 'the old one-level-per-person table is gone');
select pg_temp.expect((select unvan from public.profiles where username = 'ceo') = 'genel_mudur', 'an existing CEO became Genel Müdür');
select pg_temp.expect((select st.uzmanlik_id = u.id from public.step_types st, public.uzmanliklar u where st.name = 'Elektrik ve pano' and u.name = 'Elektrikçi'),
  'Elektrik ve pano suggests Elektrikçi');

-- ---- Genel Müdür and IT ----
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.profiles (id, full_name, username, panel, unvan) values
  ('00000000-0000-0000-0000-0000000000a1', 'Bilgi', 'bilgi', 'ceo', 'it');
select pg_temp.expect((select unvan from public.profiles where username = 'manager') is null, 'a Bölüm Sorumlusu has no unvan');

set role authenticated;
-- IT has every right the Genel Müdür has
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
select pg_temp.expect(pg_temp.affected($$update public.profiles set username = 'worker9' where username = 'worker'$$) = 1, 'IT can change a username');
select pg_temp.expect(pg_temp.affected($$update public.profiles set username = 'worker' where username = 'worker9'$$) = 1, 'and change it back');
select pg_temp.fails($$update public.profiles set unvan = 'genel_mudur' where username = 'bilgi'$$, 'the only IT cannot stop being IT');
select pg_temp.fails($$update public.profiles set panel = 'manager' where username = 'bilgi'$$, 'nor become a Bölüm Sorumlusu');
select pg_temp.fails($$update public.profiles set active = false where username = 'bilgi'$$, 'nor be deactivated');
select pg_temp.fails($$update public.profiles set unvan = 'it' where username = 'ceo'$$, 'the only Genel Müdür cannot become IT');
-- with a second IT, one can step down
select pg_temp.expect(pg_temp.affected($$update public.profiles set panel = 'ceo', unvan = 'it' where username = 'manager'$$) = 1, 'IT can make someone IT');
select pg_temp.expect(pg_temp.affected($$update public.profiles set panel = 'manager' where username = 'manager'$$) = 1, 'with two ITs, one can step down');
select pg_temp.expect((select unvan from public.profiles where username = 'manager') is null, 'and loses the unvan');
select pg_temp.expect(pg_temp.affected($$update public.profiles set panel = 'ceo' where username = 'worker'$$) = 1, 'a new ceo-panel person...');
select pg_temp.expect((select unvan from public.profiles where username = 'worker') = 'genel_mudur', '...is Genel Müdür unless IT is chosen');
select pg_temp.expect(pg_temp.affected($$update public.profiles set panel = 'worker' where username = 'worker'$$) = 1, 'and can go back to Personel');

-- a Bölüm Sorumlusu cannot change anyone's unvan
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select pg_temp.fails($$update public.profiles set unvan = 'genel_mudur' where username = 'bilgi'$$, 'a Bölüm Sorumlusu cannot change an unvan');
reset role;

-- ---- Bölümler are fixed ----
set role anon;
select pg_temp.fails('select * from public.uzmanliklar', 'anon cannot read the uzmanlık list');
select pg_temp.fails('select * from public.kisi_uzmanliklari', 'anon cannot read levels');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select pg_temp.fails($$insert into public.bolumler (name, kod) values ('Satış', 'satis')$$, 'even Genel Müdür cannot add a bölüm');
select pg_temp.fails($$update public.bolumler set name = 'x'$$, 'nor rename one');
select pg_temp.fails($$delete from public.bolumler$$, 'nor delete one');

-- ---- Uzmanlık ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect((select count(*) from public.uzmanliklar) = 2, 'a worker sees the uzmanlık list');
select pg_temp.fails($$insert into public.uzmanliklar (name) values ('Boyacı')$$, 'a worker cannot add an uzmanlık');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
insert into public.uzmanliklar (name) values ('Boyacı');
select pg_temp.fails($$insert into public.uzmanliklar (name) values ('Boyacı')$$, 'uzmanlık names are unique');
update public.profiles set bolum_id = (select id from public.bolumler where kod = 'imalat') where username = 'worker';
insert into public.kisi_uzmanliklari (user_id, uzmanlik_id, seviye)
select '00000000-0000-0000-0000-00000000000c', id, case name when 'Kaynakçı' then 'usta' else 'cirak' end::public.seviye
from public.uzmanliklar where name in ('Kaynakçı', 'Boyacı');
select pg_temp.expect((select count(*) from public.kisi_uzmanliklari where user_id = '00000000-0000-0000-0000-00000000000c') = 2,
  'a Bölüm Sorumlusu can give someone several uzmanlıklar');
select pg_temp.fails($$insert into public.kisi_uzmanliklari (user_id, uzmanlik_id, seviye) select '00000000-0000-0000-0000-00000000000b', id, 'patron' from public.uzmanliklar limit 1$$, 'only Usta, Kalfa and Çırak exist');

-- approval follows the level in the step's uzmanlık
insert into public.step_types (name, uzmanlik_id) values
  ('Kaynak işi', (select id from public.uzmanliklar where name = 'Kaynakçı')),
  ('Elektrik işi', (select id from public.uzmanliklar where name = 'Elektrikçi')),
  ('Boya işi', (select id from public.uzmanliklar where name = 'Boyacı')),
  ('Genel iş', null);
select public.create_project('Uzmanlık projesi') as project_id \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Kaynak işi')) as kaynak \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Kaynak işi')) as kaynak2 \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Elektrik işi')) as elektrik \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Boya işi')) as boya \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Genel iş')) as genel \gset
insert into public.step_assignees (step_id, user_id)
select s, '00000000-0000-0000-0000-00000000000c'
from unnest(array[:'kaynak', :'kaynak2', :'elektrik', :'boya', :'genel']::uuid[]) as s;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect(public.step_action(:'kaynak', 'finish') = 'done', 'a Kaynakçı Usta finishes a Kaynak step at once');
select pg_temp.expect(public.step_action(:'elektrik', 'finish') = 'review', 'the same person waits on an Elektrik step (no Elektrikçi uzmanlık)');
select pg_temp.expect(public.step_action(:'boya', 'finish') = 'review', 'and on a Boya step, where they are Çırak');
select pg_temp.expect(public.step_action(:'genel', 'finish') = 'review', 'a step with no uzmanlık always waits');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
update public.profiles set bolum_id = (select id from public.bolumler where kod = 'satinalma') where username = 'worker';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect(public.step_action(:'kaynak2', 'finish') = 'review', 'outside İmalat even an Usta''s finish waits');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select pg_temp.expect(public.step_action(:'elektrik', 'approve') = 'done', 'a Bölüm Sorumlusu approves');
delete from public.uzmanliklar where name = 'Boyacı';
select pg_temp.expect((select uzmanlik_id is null from public.step_types where name = 'Boya işi'), 'deleting an uzmanlık clears it from step types');
select pg_temp.expect((select count(*) from public.kisi_uzmanliklari where user_id = '00000000-0000-0000-0000-00000000000c') = 1, 'and from people');
delete from public.projects where id = :'project_id';
delete from public.step_types where name in ('Kaynak işi', 'Elektrik işi', 'Boya işi', 'Genel iş');
delete from public.kisi_uzmanliklari;
update public.profiles set bolum_id = null where username = 'worker';
reset role;

\echo ALL UZMANLIK TESTS PASSED
