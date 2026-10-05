-- Access-rule tests for companies. Runs after the stage 1 and 2 test files:
--   ...0a ceo, ...0b manager, ...0c worker (active), ...0d and ...0e deactivated

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

set role anon;
select pg_temp.fails('select * from public.companies', 'anon cannot read companies');
select pg_temp.fails($$select public.save_company('x')$$, 'anon cannot create a company');
reset role;

-- manager
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select public.save_company('Örnek Su A.Ş.', null, 'Ayşe Demir', 'ayse@ornek.test', '0212 000 00 00', 'İstanbul', null) as company_id \gset
select pg_temp.expect((select name from public.companies where id = :'company_id') = 'Örnek Su A.Ş.', 'manager can create a company');
select pg_temp.expect((select contact_name = 'Ayşe Demir' and email = 'ayse@ornek.test' from public.company_details where company_id = :'company_id'), 'its contact details are stored');
select pg_temp.fails($$select public.save_company('Örnek SU A.Ş.')$$, 'two companies cannot share a name, whatever the capitals');
select public.save_company('Örnek Su Sanayi A.Ş.', :'company_id', 'Ayşe Demir', '  ', null, null, 'Cuma günleri kapalı') as same_id \gset
select pg_temp.expect(:'same_id' = :'company_id', 'saving an existing company keeps its id');
select pg_temp.expect((select name from public.companies where id = :'company_id') = 'Örnek Su Sanayi A.Ş.', 'a company can be renamed');
select pg_temp.expect((select email is null and phone is null and notes = 'Cuma günleri kapalı' from public.company_details where company_id = :'company_id'), 'emptied fields are cleared, not kept');
select pg_temp.expect((select count(*) from public.company_details where company_id = :'company_id') = 1, 'details stay one row per company');
select pg_temp.fails($$select public.save_company('x', '00000000-0000-0000-0000-0000000000ff')$$, 'saving a company that does not exist fails');

select public.create_project('Firma projesi', 'F-1', null, null, :'company_id') as project_id \gset
select pg_temp.expect((select company_id from public.projects where id = :'project_id') = :'company_id', 'a project can be created for a company');
select public.create_project('Firmasız proje') as plain_id \gset
select pg_temp.expect((select company_id is null from public.projects where id = :'plain_id'), 'a project can still be created without a company');
select pg_temp.fails($$select public.create_project('x', null, null, null, '00000000-0000-0000-0000-0000000000ff')$$, 'a project cannot point at a company that does not exist');

-- worker: sees the name, not the details, changes nothing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect((select count(*) from public.companies) = 1, 'worker sees company names');
select pg_temp.expect((select count(*) from public.company_details) = 0, 'worker cannot see contact details');
select pg_temp.fails($$select public.save_company('Sızma Ltd.')$$, 'worker cannot create a company');
select pg_temp.fails(format($$select public.save_company('Değişti', %L)$$, :'company_id'), 'worker cannot rename a company');
select pg_temp.expect((select name from public.companies where id = :'company_id') = 'Örnek Su Sanayi A.Ş.', 'and the name is unchanged afterwards');
select pg_temp.expect(pg_temp.affected($$update public.company_details set email = 'x@x.test'$$) = 0, 'worker cannot edit contact details');
select pg_temp.expect(pg_temp.affected($$delete from public.companies$$) = 0, 'worker cannot delete a company');
select pg_temp.expect(pg_temp.affected($$update public.projects set company_id = null$$) = 0, 'worker cannot change a project''s company');

-- deactivated person
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', false);
select pg_temp.expect((select count(*) from public.companies) = 0, 'deactivated person sees no companies');

-- ceo deletes: the project stays
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select pg_temp.expect((select count(*) from public.company_details) = 1, 'ceo sees contact details');
select pg_temp.expect(pg_temp.affected(format($$delete from public.companies where id = %L$$, :'company_id')) = 1, 'ceo can delete a company');
select pg_temp.expect((select company_id is null from public.projects where id = :'project_id'), 'its project stays, without a company');
reset role;
select pg_temp.expect((select count(*) from public.company_details where company_id = :'company_id') = 0, 'its contact details are deleted with it');

\echo ALL COMPANY ACCESS TESTS PASSED
