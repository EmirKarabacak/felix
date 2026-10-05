-- Access-rule tests for stage 1. Runs against a plain Postgres with a small
-- stand-in for Supabase's auth schema (see run.sh). Any failed check aborts.

\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'),
  ('00000000-0000-0000-0000-00000000000d');

insert into public.profiles (id, full_name, username, panel, active) values
  ('00000000-0000-0000-0000-00000000000a', 'Ceo', 'ceo', 'ceo', true),
  ('00000000-0000-0000-0000-00000000000b', 'Manager', 'manager', 'manager', true),
  ('00000000-0000-0000-0000-00000000000c', 'Worker', 'worker', 'worker', true),
  ('00000000-0000-0000-0000-00000000000d', 'Gone', 'gone', 'worker', false);

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

-- signed out
set role anon;
select pg_temp.expect(public.has_users(), 'anon can ask whether any user exists');
select pg_temp.fails('select * from public.profiles', 'anon cannot read profiles');
select pg_temp.fails('select * from public.meslek_turleri', 'anon cannot read meslek türleri');
reset role;

-- worker
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect((select count(*) from public.profiles) = 4, 'worker sees the team');
select pg_temp.expect((select count(*) from public.meslek_turleri) = 5, 'worker sees meslek türleri');
select pg_temp.expect(pg_temp.affected($$update public.profiles set full_name = 'x' where username = 'worker'$$) = 0, 'worker cannot edit a profile');
select pg_temp.expect(pg_temp.affected($$update public.profiles set panel = 'ceo' where username = 'worker'$$) = 0, 'worker cannot promote themself');
select pg_temp.fails($$insert into public.meslek_turleri (name) values ('Boyacı')$$, 'worker cannot add a meslek türü');
select pg_temp.expect(pg_temp.affected($$delete from public.meslek_turleri$$) = 0, 'worker cannot delete meslek türleri');
select pg_temp.fails($$insert into public.profiles (id, full_name, username) values ('00000000-0000-0000-0000-00000000000d', 'x', 'xxx')$$, 'worker cannot insert a profile');
select pg_temp.fails($$delete from public.profiles$$, 'worker cannot delete profiles');

-- manager
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select pg_temp.expect(pg_temp.affected($$update public.profiles set full_name = 'Worker 2' where username = 'worker'$$) = 1, 'manager can correct a name');
select pg_temp.fails($$update public.profiles set panel = 'ceo' where username = 'manager'$$, 'manager cannot promote themself');
select pg_temp.fails($$update public.profiles set panel = 'manager' where username = 'worker'$$, 'manager cannot change a panel');
select pg_temp.fails($$update public.profiles set active = false where username = 'worker'$$, 'manager cannot deactivate a person');
select pg_temp.fails($$update public.profiles set username = 'other' where username = 'worker'$$, 'manager cannot change a username');
select pg_temp.expect(pg_temp.affected($$insert into public.meslek_turleri (name) values ('Boyacı')$$) = 1, 'manager can add a meslek türü');
select pg_temp.expect(pg_temp.affected($$update public.meslek_turleri set name = 'Boyacı 2' where name = 'Boyacı'$$) = 1, 'manager can rename a meslek türü');
select pg_temp.expect(pg_temp.affected($$delete from public.meslek_turleri where name = 'Boyacı 2'$$) = 1, 'manager can delete a meslek türü');
select pg_temp.fails($$insert into public.profiles (id, full_name, username) values ('00000000-0000-0000-0000-00000000000d', 'x', 'xxx')$$, 'manager cannot insert a profile');
select pg_temp.fails($$delete from public.profiles$$, 'manager cannot delete profiles');

-- ceo
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select pg_temp.expect(pg_temp.affected($$update public.profiles set panel = 'manager' where username = 'worker'$$) = 1, 'ceo can change a panel');
select pg_temp.expect(pg_temp.affected($$update public.profiles set panel = 'worker' where username = 'worker'$$) = 1, 'ceo can change it back');
select pg_temp.fails($$delete from public.profiles$$, 'even the ceo cannot delete profiles from the browser');
select pg_temp.fails($$update public.profiles set panel = 'manager' where username = 'ceo'$$, 'the last ceo cannot demote themself');
select pg_temp.fails($$update public.profiles set active = false where username = 'ceo'$$, 'the last ceo cannot be deactivated');
select pg_temp.expect(pg_temp.affected($$update public.profiles set panel = 'ceo' where username = 'manager'$$) = 1, 'ceo can make a second ceo');
select pg_temp.expect(pg_temp.affected($$update public.profiles set panel = 'manager' where username = 'manager'$$) = 1, 'with two ceos, one can step down');

-- deactivated person with a still-valid session
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', false);
select pg_temp.expect((select count(*) from public.profiles) = 0, 'deactivated person sees no one');
select pg_temp.expect((select count(*) from public.meslek_turleri) = 0, 'deactivated person sees no meslek türleri');
reset role;

-- deleting a meslek keeps the person
select set_config('request.jwt.claims', '', false);
update public.profiles set meslek_id = (select id from public.meslek_turleri where name = 'Kaynakçı') where username = 'worker';
delete from public.meslek_turleri where name = 'Kaynakçı';
select pg_temp.expect((select meslek_id is null from public.profiles where username = 'worker'), 'deleting a meslek türü leaves the person without one');

-- bad usernames are refused
select pg_temp.fails($$update public.profiles set username = 'Büyük Harf' where username = 'worker'$$, 'username must be lowercase ascii');

\echo ALL STAGE 1 ACCESS TESTS PASSED
