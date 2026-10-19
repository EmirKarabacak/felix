-- Tests for the finish photo (0009). Runs after the earlier test files:
--   ...0a Genel Müdür, ...0b Bölüm Sorumlusu, ...0c worker (Personel).

\set ON_ERROR_STOP on

-- The migration can be run again without harm.
\ir ../migrations/0009_bitis_fotografi.sql

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

-- Adds a file to a step as the signed-in person and returns its stored path.
create function pg_temp.upload(p_step uuid, p_mime text default 'image/jpeg') returns text language plpgsql as $$
declare v_path text := 's/' || p_step || '/' || gen_random_uuid();
begin
  perform public.dosya_ekle((select project_id from public.project_steps where id = p_step), p_step, false,
    'Bitiş fotoğrafı ' || gen_random_uuid() || '.jpg', v_path, 1000, p_mime);
  return v_path;
end $$;

select pg_temp.expect(
  (select count(*) from pg_proc where proname = 'step_action' and pronamespace = 'public'::regnamespace) = 1,
  'there is one step_action, with the photo argument');

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
insert into public.step_types (name) values ('Fotoğraflı iş');
select public.create_project('Fotoğraf projesi') as project_id \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Fotoğraflı iş')) as step1 \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Fotoğraflı iş')) as step2 \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Fotoğraflı iş')) as step3 \gset
insert into public.step_assignees (step_id, user_id) values
  (:'step1', '00000000-0000-0000-0000-00000000000c'),
  (:'step2', '00000000-0000-0000-0000-00000000000c');
select pg_temp.upload(:'step1') as manager_photo \gset

-- ---- a worker ----
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.expect(public.step_action(:'step1', 'start') = 'active', 'starting needs no photo');
select pg_temp.fails(format($$select public.step_action(%L, 'finish')$$, :'step1'), 'a worker cannot finish without a photo');
select pg_temp.fails(format($$select public.step_action(%L, 'finish', null, null, %L)$$, :'step1', :'manager_photo'),
  'nor with a photo someone else took');
select pg_temp.fails(format($$select public.step_action(%L, 'finish', null, null, %L)$$, :'step1', pg_temp.upload(:'step1', 'application/pdf')),
  'nor with a file that is not a picture');
select pg_temp.fails(format($$select public.step_action(%L, 'finish', null, null, %L)$$, :'step1', pg_temp.upload(:'step2')),
  'nor with a photo of another step');
select pg_temp.fails(format($$select public.step_action(%L, 'finish', null, null, %L)$$, :'step1', 's/' || :'step1' || '/not-there'),
  'nor with a photo that was never added');
select pg_temp.upload(:'step1') as photo1 \gset
select pg_temp.expect(public.step_action(:'step1', 'finish', null, null, :'photo1') = 'review', 'with a photo the job is handed in');
select pg_temp.expect(
  (select s.finish_photo_id = d.id from public.project_steps s, public.dosyalar d where s.id = :'step1' and d.storage_path = :'photo1'),
  'the step remembers the photo, for the approver');
select pg_temp.expect(
  (select e.dosya_id = s.finish_photo_id from public.step_events e join public.project_steps s on s.id = e.step_id
   where e.step_id = :'step1' and e.kind = 'submitted'),
  'and the history keeps it with the hand-in');
select pg_temp.expect((select step_id from public.dosyalar where storage_path = :'photo1') = :'step1'::uuid, 'the photo is one of the step''s files');

-- sent back: the same photo cannot be used twice
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select pg_temp.expect(public.step_action(:'step1', 'reject', null, 'Kaynak eksik') = 'active', 'the approver sends it back');
select pg_temp.expect((select finish_photo_id is not null from public.project_steps where id = :'step1'), 'the earlier photo stays until the next hand-in');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select pg_temp.fails(format($$select public.step_action(%L, 'finish', null, null, %L)$$, :'step1', :'photo1'), 'the same photo cannot hand it in again');
select pg_temp.upload(:'step1') as photo2 \gset
select pg_temp.expect(public.step_action(:'step1', 'finish', null, null, :'photo2') = 'review', 'a new photo hands it in again');
select pg_temp.expect(
  (select s.finish_photo_id = d.id from public.project_steps s, public.dosyalar d where s.id = :'step1' and d.storage_path = :'photo2'),
  'and is the one the approver now sees');
select pg_temp.expect((select count(*) from public.step_events where step_id = :'step1' and dosya_id is not null) = 2,
  'the history keeps both photos');

-- problems and approving need no photo
select pg_temp.expect(public.step_action(:'step2', 'problem', 'Makine arızası') = 'problem', 'a problem needs no photo');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select pg_temp.expect(public.step_action(:'step1', 'approve') = 'done', 'approving needs no photo');

-- ---- Bölüm Sorumlusu, Genel Müdür and IT take one too ----
select pg_temp.fails(format($$select public.step_action(%L, 'finish')$$, :'step3'), 'a Bölüm Sorumlusu needs a photo too');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select pg_temp.fails(format($$select public.step_action(%L, 'finish')$$, :'step3'), 'and so does the Genel Müdür');
select pg_temp.upload(:'step3') as gm_photo \gset
select pg_temp.expect(public.step_action(:'step3', 'finish', null, null, :'gm_photo') = 'done', 'with a photo the Genel Müdür finishes at once');
select pg_temp.expect(public.step_action(:'step3', 'reset') = 'waiting', 'a reset step...');
select pg_temp.expect((select finish_photo_id is null from public.project_steps where id = :'step3'), '...forgets its photo (the file stays)');
select pg_temp.expect((select count(*) from public.dosyalar where storage_path = :'gm_photo' and eski_at is null) = 1, 'the photo is still among the step''s files');

-- Everyone can read the history (the step window shows it).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', false);
select pg_temp.expect((select count(*) from public.step_events where step_id = :'step1') >= 6, 'any Personel can read a step''s history');
reset role;

\echo ALL FINISH PHOTO TESTS PASSED
