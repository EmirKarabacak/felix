-- Access-rule tests for the Bölümler list and levels (0007). Runs after the
-- earlier test files: ...0a ceo, ...0b manager, ...0c worker (active)

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

select pg_temp.expect((select string_agg(name, ',' order by name) from public.bolumler) = 'Elektrik atölyesi,Kaynak atölyesi,Muhasebe,Satın alma,Tasarım',
  'the starting bölümler are there');
select pg_temp.expect(to_regclass('public.meslek_turleri') is null and to_regclass('public.atolyeler') is null, 'meslek türleri and atölyeler are gone');

set role anon;
select pg_temp.fails('select * from public.bolumler', 'anon cannot read bölümler');
select pg_temp.fails('select * from public.seviyeler', 'anon cannot read levels');
reset role;

-- worker
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect((select count(*) from public.bolumler) = 5, 'a worker sees the bölümler');
select pg_temp.fails($$insert into public.bolumler (name) values ('Boya atölyesi')$$, 'a worker cannot add a bölüm');
select pg_temp.expect(pg_temp.affected($$update public.bolumler set name = 'x'$$) = 0, 'a worker cannot rename a bölüm');
select pg_temp.expect(pg_temp.affected($$delete from public.bolumler$$) = 0, 'a worker cannot delete a bölüm');
select pg_temp.expect(pg_temp.affected($$update public.profiles set bolum_id = (select id from public.bolumler where name = 'Tasarım') where id = '00000000-0000-0000-0000-00000000000c'$$) = 0,
  'a worker cannot change their own bölüm');
reset role;

-- manager
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
insert into public.bolumler (name) values ('Boya atölyesi');
select pg_temp.expect(exists (select 1 from public.bolumler where name = 'Boya atölyesi'), 'a manager can add a bölüm');
select pg_temp.fails($$insert into public.bolumler (name) values ('Boya atölyesi')$$, 'bölüm names are unique');
select pg_temp.expect(
  pg_temp.affected($$update public.profiles set bolum_id = (select id from public.bolumler where name = 'Boya atölyesi') where id = '00000000-0000-0000-0000-00000000000c'$$) = 1,
  'a manager can put someone in a bölüm');
insert into public.seviyeler (user_id, seviye) values ('00000000-0000-0000-0000-00000000000c', 'usta');
select pg_temp.expect((select seviye::text from public.seviyeler where user_id = '00000000-0000-0000-0000-00000000000c') = 'usta', 'a manager can set and read a level');
select pg_temp.fails($$insert into public.seviyeler (user_id, seviye) values ('00000000-0000-0000-0000-00000000000b', 'patron')$$, 'only Usta, Kalfa and Çırak exist');
delete from public.bolumler where name = 'Boya atölyesi';
select pg_temp.expect((select bolum_id is null from public.profiles where id = '00000000-0000-0000-0000-00000000000c'), 'deleting a bölüm leaves its people without one');
delete from public.seviyeler;
reset role;

\echo ALL BÖLÜM TESTS PASSED
