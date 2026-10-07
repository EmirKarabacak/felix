-- Tests for manager approval. Runs after the earlier test files:
--   ...0a ceo, ...0b manager, ...0c worker (active)

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

-- manager builds a project type and a project from it, choosing which steps need approval
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
insert into public.step_types (name) values ('Onaylı test'), ('Onaysız iş');
insert into public.project_types (name) values ('Onay türü');
insert into public.project_type_steps (project_type_id, step_type_id, position)
select pt.id, st.id, case st.name when 'Onaylı test' then 1 else 2 end
from public.project_types pt, public.step_types st
where pt.name = 'Onay türü' and st.name in ('Onaylı test', 'Onaysız iş');
select id as type_id from public.project_types where name = 'Onay türü' \gset
select pts.id as gated_row from public.project_type_steps pts join public.step_types st on st.id = pts.step_type_id
  where pts.project_type_id = :'type_id' and st.name = 'Onaylı test' \gset

select public.create_project('Onaysız proje', null, null, :'type_id') as none_id \gset
select pg_temp.expect((select count(*) from public.project_steps where project_id = :'none_id' and needs_approval) = 0, 'a project created without choosing any has no steps needing approval');

select public.create_project('Onay projesi', null, null, :'type_id', null, array[:'gated_row']::uuid[]) as project_id \gset
select id as gated from public.project_steps where project_id = :'project_id' and name = 'Onaylı test' \gset
select id as plain from public.project_steps where project_id = :'project_id' and name = 'Onaysız iş' \gset
select pg_temp.expect((select needs_approval from public.project_steps where id = :'gated'), 'the step chosen at creation needs approval');
select pg_temp.expect((select not needs_approval from public.project_steps where id = :'plain'), 'and the one not chosen does not');
select pg_temp.expect((select count(*) from public.project_steps where project_id = :'none_id' and needs_approval) = 0, 'the choice belongs to that project only');
select public.create_project('Yabancı seçim', null, null, :'type_id', null, array['00000000-0000-0000-0000-0000000000ff']::uuid[]) as stray_id \gset
select pg_temp.expect((select count(*) from public.project_steps where project_id = :'stray_id' and needs_approval) = 0, 'an id that is not one of the type''s steps is ignored');
select public.add_step(:'project_id', (select id from public.step_types where name = 'Onaylı test')) as added \gset
select pg_temp.expect((select not needs_approval from public.project_steps where id = :'added'), 'a step added later starts without approval');
select pg_temp.expect(pg_temp.affected(format($$update public.project_steps set needs_approval = true where id = %L$$, :'added')) = 1, 'and a manager can switch it on for that step');
insert into public.step_assignees (step_id, user_id) values
  (:'gated', '00000000-0000-0000-0000-00000000000c'),
  (:'plain', '00000000-0000-0000-0000-00000000000c'),
  (:'added', '00000000-0000-0000-0000-00000000000c');

-- worker
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect(public.step_action(:'plain', 'finish') = 'done', 'a step that needs no approval still finishes straight away');
select pg_temp.expect(public.step_action(:'gated', 'start') = 'active', 'worker starts the gated step');
select pg_temp.expect(public.step_action(:'gated', 'finish') = 'review', 'finishing a gated step sends it for approval instead');
select pg_temp.expect((select submitted_at is not null and finished_at is null from public.project_steps where id = :'gated'), 'it has a hand-in time but no finish time yet');
select pg_temp.fails(format($$select public.step_action(%L, 'approve')$$, :'gated'), 'a worker cannot approve their own step');
select pg_temp.fails(format($$select public.step_action(%L, 'reject', null, 'x')$$, :'gated'), 'a worker cannot send a step back');
select pg_temp.fails(format($$select public.step_action(%L, 'finish')$$, :'gated'), 'a step waiting for approval cannot be finished again');
select pg_temp.fails(format($$select public.step_action(%L, 'start')$$, :'gated'), 'nor restarted by the worker');
select pg_temp.fails(format($$select public.step_action(%L, 'problem', 'Malzeme eksik')$$, :'gated'), 'nor have a problem reported on it');
select pg_temp.expect(pg_temp.affected(format($$update public.project_steps set status = 'done', needs_approval = false where id = %L$$, :'gated')) = 0, 'a worker cannot skip approval by writing to the table');

-- manager sends it back
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select pg_temp.fails(format($$select public.step_action(%L, 'reject')$$, :'gated'), 'sending back needs a note');
select pg_temp.fails(format($$select public.step_action(%L, 'reject', null, '   ')$$, :'gated'), 'and a blank note does not count');
select pg_temp.expect(public.step_action(:'gated', 'reject', null, 'Kaynak dikişleri taşlanmamış') = 'active', 'manager can send a step back');
select pg_temp.expect((select review_note = 'Kaynak dikişleri taşlanmamış' and submitted_at is null and finished_at is null from public.project_steps where id = :'gated'), 'the note is stored and the hand-in is cleared');
select pg_temp.fails(format($$select public.step_action(%L, 'approve')$$, :'gated'), 'a step that is not waiting cannot be approved');

-- worker reports a problem, carries on, hands in again: the note survives until then
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect((select review_note is not null from public.project_steps where id = :'gated'), 'the worker can read the note');
select pg_temp.expect(public.step_action(:'gated', 'problem', 'Makine arızası') = 'problem', 'a problem can be reported while redoing');
select pg_temp.expect(public.step_action(:'gated', 'start') = 'active', 'and work carried on');
select pg_temp.expect((select review_note = 'Kaynak dikişleri taşlanmamış' from public.project_steps where id = :'gated'), 'the manager''s note is still there');
select pg_temp.expect(public.step_action(:'gated', 'finish') = 'review', 'the worker hands it in again');
select pg_temp.expect((select review_note is null from public.project_steps where id = :'gated'), 'handing in again clears the old note');
select submitted_at as handed_in from public.project_steps where id = :'gated' \gset

-- ceo approves
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select pg_sleep(0.05);
select pg_temp.expect(public.step_action(:'gated', 'approve') = 'done', 'the CEO can approve');
select pg_temp.expect((select finished_at = :'handed_in'::timestamptz from public.project_steps where id = :'gated'), 'the finish time is when the worker handed it in');
select pg_temp.expect(
  (select string_agg(kind, ',' order by created_at, kind) from public.step_events where step_id = :'gated' and kind <> 'assigned')
    = 'started,submitted,rejected,problem,resolved,submitted,approved',
  'the history shows the whole back-and-forth');
select pg_temp.expect((select detail from public.step_events where step_id = :'gated' and kind = 'rejected') = 'Kaynak dikişleri taşlanmamış', 'including why it was sent back');

-- a manager finishing a gated step needs nobody's approval
select pg_temp.expect(public.step_action(:'added', 'finish') = 'done', 'a manager or CEO finishing a gated step completes it directly');

-- a manager can switch approval off for one step
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select public.add_step(:'project_id', (select id from public.step_types where name = 'Onaysız iş')) as extra \gset
select pg_temp.expect(pg_temp.affected(format($$update public.project_steps set needs_approval = true where id = %L$$, :'extra')) = 1, 'a manager can switch approval on for a single step');
select pg_temp.expect(public.step_action(:'gated', 'reopen') = 'active', 'a reopened step is in progress again');
select pg_temp.expect(public.step_action(:'gated', 'reset') = 'waiting', 'and can be reset');
reset role;

\echo ALL APPROVAL TESTS PASSED
