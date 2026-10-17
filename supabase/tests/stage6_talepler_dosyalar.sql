-- Access-rule tests for Talepler and Dosyalar (0008). Runs after the earlier
-- test files: ...0a Genel Müdür, ...0b Bölüm Sorumlusu, ...0c worker.
-- Adds ...f1 (Tasarım) and ...f2 (Satın alma), both Personel.

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

create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id)::text, false)
$$;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2');
insert into public.profiles (id, full_name, username, panel, bolum_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'Tasarımcı', 'tasarim', 'worker', (select id from public.bolumler where kod = 'tasarim')),
  ('00000000-0000-0000-0000-0000000000f2', 'Satınalmacı', 'satinalma', 'worker', (select id from public.bolumler where kod = 'satinalma'));

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.create_project('Talep projesi') as project_id \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Test')) as step1 \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Test')) as step2 \gset
select public.add_step(:'project_id', (select id from public.step_types where name = 'Test')) as step3 \gset
insert into public.step_assignees (step_id, user_id)
select s, '00000000-0000-0000-0000-00000000000c' from unnest(array[:'step1', :'step2', :'step3']::uuid[]) as s;

-- ---- Talepler ----
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails(format($$select public.sorun_bildir(%L, 'Malzeme eksik', null, '  ')$$, :'step1'), 'a missing material must be named');
select public.sorun_bildir(:'step1', 'Malzeme eksik', 'Acil', '2" vana', '4 adet') as malzeme \gset
select pg_temp.expect((select status = 'problem' and problem_reason = 'Malzeme eksik' from public.project_steps where id = :'step1'), 'the step shows the problem');
select pg_temp.expect((select kind = 'malzeme' and material = '2" vana' and quantity = '4 adet' and status = 'acik' and created_by = '00000000-0000-0000-0000-00000000000c'
  from public.talepler where id = :'malzeme'), 'and a material request is opened with what and how many');
select public.sorun_bildir(:'step2', 'Çizim hatalı', 'Ölçü yanlış') as cizim \gset
select pg_temp.expect((select kind = 'cizim' and material is null from public.talepler where id = :'cizim'), '"Çizim hatalı" opens a drawing request');
select pg_temp.expect(public.sorun_bildir(:'step3', 'Makine arızası') is null, 'other problems open no request');
select pg_temp.fails($$insert into public.talepler (project_id, kind) select id, 'malzeme' from public.projects limit 1$$, 'nobody writes requests by hand');
select pg_temp.fails(format($$select public.talep_action(%L, 'ilgilen')$$, :'malzeme'), 'a worker cannot handle a request');
select pg_temp.fails(format($$select public.sorun_bildir(%L, 'Malzeme eksik', null, 'x')$$, :'step1'), 'a step that already has a problem cannot get another');

-- Tasarım handles drawings only, Satın alma materials only
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect((select count(*) from public.talepler where project_id = :'project_id') = 2, 'everyone sees the requests');
select pg_temp.fails(format($$select public.talep_action(%L, 'siparis')$$, :'malzeme'), 'Tasarım cannot order material');
select pg_temp.expect(public.talep_action(:'cizim', 'ilgilen') = 'acik', 'Tasarım says "Ben ilgileniyorum"');
select pg_temp.expect((select handler_id = '00000000-0000-0000-0000-0000000000f1' from public.talepler where id = :'cizim'), 'and is shown as handling it');
select pg_temp.fails(format($$select public.talep_action(%L, 'geldi')$$, :'cizim'), 'a drawing request cannot "arrive"');
select pg_temp.expect(public.talep_action(:'cizim', 'cozuldu') = 'cozuldu', 'Tasarım marks the drawing fixed');
select pg_temp.fails(format($$select public.talep_action(%L, 'cozuldu')$$, :'cizim'), 'a closed request stays closed');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.fails(format($$select public.talep_action(%L, 'ilgilen')$$, :'cizim'), 'Satın alma cannot handle drawings');
select pg_temp.expect(public.talep_action(:'malzeme', 'siparis') = 'siparis', 'Satın alma orders the material');
select pg_temp.expect((select handler_id = '00000000-0000-0000-0000-0000000000f2' and ordered_at is not null from public.talepler where id = :'malzeme'),
  'ordering without pressing "Ben ilgileniyorum" first still names who is on it');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect(public.talep_action(:'malzeme', 'ilgilen') = 'siparis', 'a Bölüm Sorumlusu can take a request over');
select pg_temp.expect((select handler_id = '00000000-0000-0000-0000-00000000000b' from public.talepler where id = :'malzeme'), 'and is shown as handling it');
select pg_temp.expect(public.talep_action(:'malzeme', 'geldi') = 'geldi', 'the material arrived');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select status = 'geldi' and closed_at is not null from public.talepler where id = :'malzeme'), 'the reporter sees it arrived');

-- ---- Dosyalar ----
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails(format($$select public.dosya_ekle(%L, null, true, 'plan.pdf', 'p/%s/a')$$, :'project_id', :'project_id'), 'a worker cannot add a project file');
select pg_temp.fails(format($$insert into storage.objects (bucket_id, name, owner_id) values ('dosyalar', 'p/%s/a', '00000000-0000-0000-0000-00000000000c')$$, :'project_id'),
  'nor upload one to storage');
insert into storage.objects (bucket_id, name, owner_id) values
  ('dosyalar', 's/' || :'step1' || '/w1', '00000000-0000-0000-0000-00000000000c'),
  ('dosyalar', 's/' || :'step1' || '/w2', '00000000-0000-0000-0000-0000000000f2'),
  ('dosyalar', 's/' || :'step1' || '/w3', '00000000-0000-0000-0000-0000000000f2');
select pg_temp.expect(public.dosya_ekle(:'project_id', :'step1', false, 'foto.jpg', 's/' || :'step1' || '/w1', 1000, 'image/jpeg') = 'foto.jpg', 'a worker adds a step file');
select pg_temp.fails(format($$select public.dosya_ekle(%L, %L, false, 'x.jpg', 's/%s/w2')$$, :'project_id', :'step1', :'step2'), 'a file must be stored under its own step');
select pg_temp.expect(public.dosya_ekle(:'project_id', :'step1', false, 'foto.jpg', 's/' || :'step1' || '/w2') = 'foto (2).jpg', 'the same name again becomes "foto (2).jpg"');
select pg_temp.expect(public.dosya_ekle(:'project_id', :'step1', false, 'foto.jpg', 's/' || :'step1' || '/w3') = 'foto (3).jpg', 'and then "foto (3).jpg"');
select pg_temp.expect(public.dosya_ekle(:'project_id', :'step1', false, 'foto.png', 's/' || :'step1' || '/w4') = 'foto.png', 'another extension is another file');
select pg_temp.expect((select string_agg(name, ',' order by name) from public.dosyalar where step_id = :'step1') = 'foto (3).jpg,foto.png',
  'a worker sees only the current versions');
select pg_temp.expect((select count(*) from storage.objects where name = 's/' || :'step1' || '/w2') = 0, 'and cannot download an old one someone else uploaded');
select pg_temp.expect((select count(*) from storage.objects where name = 's/' || :'step1' || '/w3') = 1, 'but can download the current one');
select pg_temp.fails(format($$select public.dosya_sil((select id from public.dosyalar where storage_path = 's/%s/w3'))$$, :'step1'), 'a worker cannot delete a file');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
insert into storage.objects (bucket_id, name, owner_id) values ('dosyalar', 'p/' || :'project_id' || '/t1', '00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect(public.dosya_ekle(:'project_id', null, true, 'Ana çizim.pdf', 'p/' || :'project_id' || '/t1') = 'Ana çizim.pdf', 'Tasarım adds the Ana doküman');
select pg_temp.expect(public.dosya_ekle(:'project_id', null, true, 'Revize.pdf', 'p/' || :'project_id' || '/t2') = 'Revize.pdf', 'a new Ana doküman...');
select pg_temp.expect((select string_agg(name, ',') from public.dosyalar where project_id = :'project_id' and ana and eski_at is null) = 'Revize.pdf',
  '...replaces the old one, which moves to Eski sürümler');
select pg_temp.expect(public.dosya_ekle(:'project_id', null, false, 'Sertifika.pdf', 'p/' || :'project_id' || '/t3') = 'Sertifika.pdf', 'other project files sit next to it');
select pg_temp.expect(public.dosya_ekle(:'project_id', null, false, 'Sertifika 2.pdf', 'p/' || :'project_id' || '/t4') = 'Sertifika 2.pdf', 'as many as needed');
select pg_temp.expect((select count(*) from public.dosyalar where step_id = :'step1') = 4, 'Tasarım sees old versions');
select pg_temp.expect((select count(*) from storage.objects where name = 's/' || :'step1' || '/w2') = 1, 'and can download them');
select public.dosya_sil((select id from public.dosyalar where storage_path = 's/' || :'step1' || '/w4'));
select pg_temp.expect((select silindi and eski_at is not null from public.dosyalar where storage_path = 's/' || :'step1' || '/w4'), 'deleting moves a file to Eski sürümler');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select string_agg(name, ',' order by name) from public.dosyalar where project_id = :'project_id' and step_id is null) = 'Revize.pdf,Sertifika 2.pdf,Sertifika.pdf',
  'a worker sees the current project files');
select pg_temp.expect((select count(*) from public.dosyalar where storage_path = 's/' || :'step1' || '/w4') = 0, 'but not a deleted one');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.fails(format($$select public.dosya_ekle(%L, null, false, 'x.pdf', 'p/%s/s1')$$, :'project_id', :'project_id'), 'Satın alma cannot add project files');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect(public.dosya_ekle(:'project_id', null, false, 'Sertifika.pdf', 'p/' || :'project_id' || '/m1') = 'Sertifika (2).pdf', 'a Bölüm Sorumlusu replaces a project file');
delete from public.projects where id = :'project_id';
select pg_temp.expect((select count(*) from public.talepler where project_id = :'project_id') = 0, 'deleting a project removes its requests');
reset role;
delete from storage.objects;

\echo ALL TALEP AND DOSYA TESTS PASSED
