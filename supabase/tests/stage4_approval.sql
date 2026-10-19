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

-- Finishing needs a photo (0009): adds one to the step, as the signed-in
-- person, and returns its stored path for step_action.
create function pg_temp.photo(p_step uuid) returns text language plpgsql as $$
declare v_path text := 's/' || p_step || '/' || gen_random_uuid();
begin
  perform public.dosya_ekle((select project_id from public.project_steps where id = p_step), p_step, false,
    'Bitiş fotoğrafı.jpg', v_path, 1000, 'image/jpeg');
  return v_path;
end $$;

create function pg_temp.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

-- Approval follows the person's level in the step's uzmanlık (0008): only an
-- Usta's finish counts at once. The worker has no bölüm or uzmanlık yet, so
-- every finish of theirs waits for a manager.

-- manager builds a project type and a project from it
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
insert into public.step_types (name) values ('Onaylı test'), ('Onaysız iş');
insert into public.project_types (name) values ('Onay türü');
insert into public.project_type_steps (project_type_id, step_type_id, position)
select pt.id, st.id, case st.name when 'Onaylı test' then 1 else 2 end
from public.project_types pt, public.step_types st
where pt.name = 'Onay türü' and st.name in ('Onaylı test', 'Onaysız iş');
select id as type_id from public.project_types where name = 'Onay türü' \gset

select public.create_project('Onay projesi', null, null, :'type_id') as project_id \gset
select id as gated from public.project_steps where project_id = :'project_id' and name = 'Onaylı test' \gset
select id as plain from public.project_steps where project_id = :'project_id' and name = 'Onaysız iş' \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Onaylı test')) as added \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Onaysız iş')) as usta_step \gset
insert into public.step_assignees (step_id, user_id) values
  (:'gated', '00000000-0000-0000-0000-00000000000c'),
  (:'plain', '00000000-0000-0000-0000-00000000000c'),
  (:'added', '00000000-0000-0000-0000-00000000000c'),
  (:'usta_step', '00000000-0000-0000-0000-00000000000c');

-- worker without an uzmanlık
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect(public.step_action(:'plain', 'finish', null, null, pg_temp.photo(:'plain')) = 'review', 'a finish without the uzmanlık always waits for approval');
select pg_temp.expect(public.step_action(:'gated', 'start') = 'active', 'worker starts a step');
select pg_temp.expect(public.step_action(:'gated', 'finish', null, null, pg_temp.photo(:'gated')) = 'review', 'and finishing it sends it for approval');
select pg_temp.expect((select submitted_at is not null and finished_at is null from public.project_steps where id = :'gated'), 'it has a hand-in time but no finish time yet');
select pg_temp.fails(format($$select public.step_action(%L, 'approve')$$, :'gated'), 'a worker cannot approve their own step');
select pg_temp.fails(format($$select public.step_action(%L, 'reject', null, 'x')$$, :'gated'), 'a worker cannot send a step back');
select pg_temp.fails(format($$select public.step_action(%L, 'finish')$$, :'gated'), 'a step waiting for approval cannot be finished again');
select pg_temp.fails(format($$select public.step_action(%L, 'start')$$, :'gated'), 'nor restarted by the worker');
select pg_temp.fails(format($$select public.step_action(%L, 'problem', 'Malzeme eksik')$$, :'gated'), 'nor have a problem reported on it');
select pg_temp.expect(pg_temp.affected(format($$update public.project_steps set status = 'done' where id = %L$$, :'gated')) = 0, 'a worker cannot skip approval by writing to the table');
select pg_temp.fails($$insert into public.kisi_uzmanliklari (user_id, uzmanlik_id, seviye) select '00000000-0000-0000-0000-00000000000c', id, 'usta' from public.uzmanliklar$$, 'a worker cannot make themself an Usta');

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
select pg_temp.expect(public.step_action(:'gated', 'finish', null, null, pg_temp.photo(:'gated')) = 'review', 'the worker hands it in again');
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

-- a manager's or the CEO's own finish needs nobody's approval
select pg_temp.expect(public.step_action(:'added', 'finish', null, null, pg_temp.photo(:'added')) = 'done', 'a manager or CEO finishing a step completes it directly');

-- a Çırak is treated like a Kalfa; an Usta's finish counts at once
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
update public.step_types set uzmanlik_id = (select id from public.uzmanliklar where name = 'Kaynakçı') where name = 'Onaysız iş';
update public.profiles set bolum_id = (select id from public.bolumler where kod = 'imalat') where id = '00000000-0000-0000-0000-00000000000c';
insert into public.kisi_uzmanliklari (user_id, uzmanlik_id, seviye)
select '00000000-0000-0000-0000-00000000000c', id, 'cirak' from public.uzmanliklar where name = 'Kaynakçı';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect((select count(*) from public.kisi_uzmanliklari) = 0, 'a worker cannot see levels, not even their own');
select pg_temp.expect(public.step_action(:'usta_step', 'finish', null, null, pg_temp.photo(:'usta_step')) = 'review', 'a Çırak''s finish waits for approval too');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select pg_temp.expect(public.step_action(:'usta_step', 'reject', null, 'Tekrar') = 'active', 'manager sends it back');
select pg_temp.expect(pg_temp.affected($$update public.kisi_uzmanliklari set seviye = 'usta' where user_id = '00000000-0000-0000-0000-00000000000c'$$) = 1,
  'a manager can make someone an Usta');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect(public.step_action(:'usta_step', 'finish', null, null, pg_temp.photo(:'usta_step')) = 'done', 'an Usta''s finish counts at once');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select pg_temp.expect(public.step_action(:'gated', 'reopen') = 'active', 'a reopened step is in progress again');
select pg_temp.expect(public.step_action(:'gated', 'reset') = 'waiting', 'and can be reset');
delete from public.kisi_uzmanliklari;
update public.profiles set bolum_id = null where id = '00000000-0000-0000-0000-00000000000c';
reset role;

\echo ALL APPROVAL TESTS PASSED
