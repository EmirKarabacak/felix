-- Access-rule tests for bölümler and atölyeler. Runs after the earlier test files:
--   ...0a ceo, ...0b manager, ...0c worker (active), ...0d deactivated

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

select pg_temp.expect((select count(*) from public.atolyeler) = 2, 'the two workshops are there from the start');

set role anon;
select pg_temp.fails('select * from public.atolyeler', 'anon cannot read workshops');
reset role;

-- worker
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect((select count(*) from public.atolyeler) = 2, 'a worker sees the workshops');
select pg_temp.fails($$insert into public.atolyeler (name) values ('Boya atölyesi')$$, 'a worker cannot add a workshop');
select pg_temp.expect(pg_temp.affected($$update public.atolyeler set name = 'x'$$) = 0, 'a worker cannot rename a workshop');
select pg_temp.expect(pg_temp.affected($$delete from public.atolyeler$$) = 0, 'a worker cannot delete a workshop');
select pg_temp.expect(pg_temp.affected($$update public.profiles set bolum = 'tasarim' where id = '00000000-0000-0000-0000-00000000000c'$$) = 0,
  'a worker cannot change their own bölüm');
reset role;

-- manager
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
insert into public.atolyeler (name) values ('Boya atölyesi');
select pg_temp.expect(exists (select 1 from public.atolyeler where name = 'Boya atölyesi'), 'a manager can add a workshop');
select pg_temp.fails($$insert into public.atolyeler (name) values ('Boya atölyesi')$$, 'workshop names are unique');
select pg_temp.expect(
  pg_temp.affected($$update public.profiles set bolum = 'uretim', atolye_id = (select id from public.atolyeler where name = 'Kaynak atölyesi')
                     where id = '00000000-0000-0000-0000-00000000000c'$$) = 1,
  'a manager can put a worker in Üretim and a workshop');
select pg_temp.fails($$update public.profiles set bolum = 'tasarim' where id = '00000000-0000-0000-0000-00000000000c'$$,
  'a workshop only goes with Üretim');
select pg_temp.expect(
  pg_temp.affected($$update public.profiles set bolum = 'tasarim', atolye_id = null where id = '00000000-0000-0000-0000-00000000000c'$$) = 1,
  'moving someone to Tasarım clears their workshop');
select pg_temp.fails($$update public.profiles set bolum = 'pazarlama' where id = '00000000-0000-0000-0000-00000000000c'$$,
  'only the four bölümler exist');
select pg_temp.expect(
  pg_temp.affected($$update public.profiles set bolum = 'uretim', atolye_id = (select id from public.atolyeler where name = 'Boya atölyesi')
                     where id = '00000000-0000-0000-0000-00000000000c'$$) = 1,
  'and back to Üretim with a workshop');
delete from public.atolyeler where name = 'Boya atölyesi';
select pg_temp.expect((select atolye_id is null and bolum = 'uretim' from public.profiles where id = '00000000-0000-0000-0000-00000000000c'),
  'deleting a workshop leaves its people in Üretim without one');
reset role;

\echo ALL BÖLÜM TESTS PASSED
