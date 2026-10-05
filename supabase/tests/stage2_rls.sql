-- Access-rule tests for stage 2. Runs after stage1_rls.sql in the same
-- throwaway database, so the four people from that file already exist:
--   ...0a ceo, ...0b manager, ...0c worker (active), ...0d worker (deactivated)

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

-- A second worker, to test "assigned to someone else".
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000e');
insert into public.profiles (id, full_name, username, panel) values
  ('00000000-0000-0000-0000-00000000000e', 'Worker Two', 'worker2', 'worker');

select pg_temp.expect((select count(*) from public.step_types) = 9, 'starting step types exist');
select pg_temp.expect(
  (select count(*) from public.project_type_steps pts join public.project_types pt on pt.id = pts.project_type_id where pt.name = 'RO Ünitesi') = 8,
  'RO Ünitesi starts with 8 steps');

-- signed out
set role anon;
select pg_temp.fails('select * from public.projects', 'anon cannot read projects');
select pg_temp.fails($$select public.create_project('x')$$, 'anon cannot create a project');
reset role;

-- manager creates a project from a type
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select public.create_project('500 m³/gün RO', 'P-1', '2026-11-01', (select id from public.project_types where name = 'RO Ünitesi')) as project_id \gset
select pg_temp.expect((select count(*) from public.project_steps where project_id = :'project_id') = 8, 'a new project gets its type''s steps');
select pg_temp.expect(
  (select string_agg(name, ',' order by position) from public.project_steps where project_id = :'project_id')
    = 'Malzeme hazırlık,Şase imalatı,Yüzey işlemi,Ekipman montajı,Borulama,Elektrik ve pano,Test,Paketleme ve sevkiyat',
  'steps are copied in the type''s order');
select pg_temp.fails($$select public.create_project('Other', 'p-1')$$, 'a project code cannot be used twice (case-insensitive)');
select public.create_project('Boş proje') as empty_id \gset
select pg_temp.expect((select count(*) from public.project_steps where project_id = :'empty_id') = 0, 'a project without a type starts empty');
select public.add_step(:'empty_id', (select id from public.step_types where name = 'Test')) as added_id \gset
select pg_temp.expect((select position from public.project_steps where id = :'added_id') = 1, 'a step can be added from the list');

select id as step1 from public.project_steps where project_id = :'project_id' and position = 1 \gset
select id as step2 from public.project_steps where project_id = :'project_id' and position = 2 \gset
select id as step3 from public.project_steps where project_id = :'project_id' and position = 3 \gset

insert into public.step_assignees (step_id, user_id) values
  (:'step1', '00000000-0000-0000-0000-00000000000c'),
  (:'step1', '00000000-0000-0000-0000-00000000000e'),
  (:'step2', '00000000-0000-0000-0000-00000000000e'),
  (:'step3', '00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.step_events where kind = 'assigned' and step_id = :'step1') = 2, 'assignments are recorded in the history');

-- worker: sees everything, changes nothing directly
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect((select count(*) from public.projects) = 2, 'worker sees every project');
select pg_temp.expect((select count(*) from public.project_steps) = 9, 'worker sees every step');
select pg_temp.fails($$select public.create_project('Sızma')$$, 'worker cannot create a project');
select pg_temp.fails(format($$select public.add_step(%L, (select id from public.step_types limit 1))$$, :'project_id'), 'worker cannot add a step');
select pg_temp.expect(pg_temp.affected($$update public.project_steps set status = 'done'$$) = 0, 'worker cannot write a step''s status directly');
select pg_temp.expect(pg_temp.affected($$update public.projects set name = 'x'$$) = 0, 'worker cannot edit a project');
select pg_temp.expect(pg_temp.affected($$delete from public.projects$$) = 0, 'worker cannot delete a project');
select pg_temp.expect(pg_temp.affected($$delete from public.step_assignees$$) = 0, 'worker cannot unassign anyone');
select pg_temp.fails(format($$insert into public.step_assignees values (%L, '00000000-0000-0000-0000-00000000000c')$$, :'step2'), 'worker cannot assign themself');
select pg_temp.fails($$insert into public.step_types (name) values ('x')$$, 'worker cannot add a step type');
select pg_temp.fails($$insert into public.step_events (project_id, step_id, kind) select project_id, id, 'finished' from public.project_steps limit 1$$, 'nobody can write history by hand');

-- worker: actions on their own steps only
select pg_temp.fails(format($$select public.step_action(%L, 'start')$$, :'step2'), 'worker cannot start a step assigned to someone else');
select pg_temp.expect(public.step_action(:'step1', 'start') = 'active', 'worker can start their step');
select pg_temp.expect((select started_at is not null from public.project_steps where id = :'step1'), 'start time is recorded');
select pg_temp.fails(format($$select public.step_action(%L, 'start')$$, :'step1'), 'a started step cannot be started again');
select pg_temp.fails(format($$select public.step_action(%L, 'problem')$$, :'step1'), 'a problem needs a reason');
select pg_temp.expect(public.step_action(:'step1', 'problem', 'Malzeme eksik', 'DN50 flanş yok') = 'problem', 'worker can report a problem');
select pg_temp.expect((select problem_reason = 'Malzeme eksik' and problem_note = 'DN50 flanş yok' from public.project_steps where id = :'step1'), 'the problem''s reason and note are stored');
select pg_temp.fails(format($$select public.step_action(%L, 'finish')$$, :'step1'), 'a step with an open problem cannot be finished');
select pg_temp.expect(public.step_action(:'step1', 'start') = 'active', 'worker can carry on once the problem is solved');
select pg_temp.expect((select problem_reason is null from public.project_steps where id = :'step1'), 'carrying on clears the problem');
select pg_temp.fails(format($$select public.step_action(%L, 'reopen')$$, :'step1'), 'worker cannot use manager-only actions');

-- the other assignee finishes: the whole step is done for everyone
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', false);
select pg_temp.expect(public.step_action(:'step1', 'finish') = 'done', 'any one assignee finishes the whole step');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect((select status = 'done' and finished_at is not null from public.project_steps where id = :'step1'), 'the first worker sees it finished, with a finish time');
select pg_temp.fails(format($$select public.step_action(%L, 'start')$$, :'step1'), 'a finished step cannot be restarted by a worker');
select pg_temp.expect(public.step_action(:'step3', 'finish') = 'done', 'a step can be finished without pressing start first');
select pg_temp.expect((select started_at is not null from public.project_steps where id = :'step3'), 'and still gets a start time');
select pg_temp.expect(
  (select string_agg(kind, ',' order by created_at, kind) from public.step_events where step_id = :'step1' and kind not in ('assigned'))
    = 'started,problem,resolved,finished',
  'the history lists what happened, in order');

-- deactivated person
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', false);
select pg_temp.expect((select count(*) from public.projects) = 0, 'deactivated person sees no projects');
select pg_temp.fails(format($$select public.step_action(%L, 'start')$$, :'step2'), 'deactivated person cannot act on steps');

-- manager: full control
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select pg_temp.expect(public.step_action(:'step1', 'reopen') = 'active', 'manager can reopen a finished step');
select pg_temp.expect((select finished_at is null from public.project_steps where id = :'step1'), 'reopening clears the finish time');
select pg_temp.expect(public.step_action(:'step1', 'reset') = 'waiting', 'manager can reset a step');
select pg_temp.expect(public.step_action(:'step2', 'start') = 'active', 'manager can start a step they are not assigned to');
select pg_temp.expect(pg_temp.affected(format($$update public.project_steps set due_date = '2026-10-20' where id = %L$$, :'step2')) = 1, 'manager can set a due date');
select pg_temp.expect(pg_temp.affected(format($$delete from public.project_steps where id = %L$$, :'step3')) = 1, 'manager can remove a step');
select pg_temp.expect(pg_temp.affected($$update public.step_types set name = 'Boru işleri' where name = 'Borulama'$$) = 1, 'manager can rename a step type');
select pg_temp.expect((select count(*) from public.project_steps where project_id = :'project_id' and name = 'Borulama') = 1, 'renaming a type does not rename steps in existing projects');
select pg_temp.expect(pg_temp.affected($$delete from public.step_types where name = 'Boru işleri'$$) = 1, 'manager can delete a step type');
select pg_temp.expect((select count(*) from public.project_steps where project_id = :'project_id' and name = 'Borulama') = 1, 'deleting a type keeps the step in existing projects');
select pg_temp.expect(
  (select count(*) from public.project_type_steps pts join public.project_types pt on pt.id = pts.project_type_id where pt.name = 'RO Ünitesi') = 7,
  'deleting a step type removes it from project types');
reset role;

-- removing a person takes them off unfinished steps only
select set_config('request.jwt.claims', '', false);
update public.project_steps set status = 'done' where id = :'step2';
insert into public.step_assignees (step_id, user_id) values (:'added_id', '00000000-0000-0000-0000-00000000000e');
update public.profiles set active = false where id = '00000000-0000-0000-0000-00000000000e';
select pg_temp.expect(
  (select count(*) from public.step_assignees where user_id = '00000000-0000-0000-0000-00000000000e' and step_id = :'added_id') = 0,
  'a removed person is taken off unfinished steps');
select pg_temp.expect(
  (select count(*) from public.step_assignees where user_id = '00000000-0000-0000-0000-00000000000e' and step_id = :'step2') = 1,
  'a removed person stays on finished steps');

-- deleting a project removes its steps, assignments and history
delete from public.projects where id = :'project_id';
select pg_temp.expect((select count(*) from public.project_steps where project_id = :'project_id') = 0, 'deleting a project removes its steps');
select pg_temp.expect((select count(*) from public.step_events where project_id = :'project_id') = 0, 'and its history');

\echo ALL STAGE 2 ACCESS TESTS PASSED
