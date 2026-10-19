-- Update 2: a photo of the finished work, like the Lime bike app.
--
-- Pressing "İşi bitir" opens the camera, and the job finishes only once a
-- photo is taken. Everyone takes one, Genel Müdür and IT included: storing
-- what was done is the point of the app. The photo
-- is an ordinary step file; the step and its history remember which file it
-- was, so the approver sees it and the history can show it later.
--
-- Safe to run more than once; works as one transaction.

-- The photo of the latest hand-in, and the photo of each finish in the history.
alter table public.project_steps
  add column if not exists finish_photo_id uuid references public.dosyalar (id) on delete set null;
alter table public.step_events
  add column if not exists dosya_id uuid references public.dosyalar (id) on delete set null;

-- step_action gains a fifth argument, the stored path of the photo. Callers
-- that pass four arguments (sorun_bildir, older screens) still reach it.
drop function if exists public.step_action(uuid, text, text, text);

create or replace function public.step_action(
  p_step_id uuid,
  p_action text,
  p_reason text default null,
  p_note text default null,
  p_photo_path text default null
)
returns public.step_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_panel public.panel := public.current_panel();
  v_step public.project_steps%rowtype;
  v_manages boolean;
  v_new public.step_status;
  v_kind text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_photo uuid;
begin
  if v_panel is null then
    raise exception 'Oturum bulunamadı.' using errcode = '42501';
  end if;

  select * into v_step from public.project_steps where id = p_step_id for update;
  if not found then
    raise exception 'Adım bulunamadı.' using errcode = 'P0002';
  end if;

  v_manages := v_panel in ('ceo', 'manager');
  if not v_manages and not exists (
    select 1 from public.step_assignees where step_id = p_step_id and user_id = auth.uid()
  ) then
    raise exception 'Bu adım size atanmamış.' using errcode = '42501';
  end if;

  if p_action = 'start' and v_step.status in ('waiting', 'problem') then
    v_new := 'active';
    v_kind := case when v_step.status = 'problem' then 'resolved' else 'started' end;
  elsif p_action = 'finish' and v_step.status in ('waiting', 'active') then
    -- The photo: an image this person has just added to this step, not used
    -- for an earlier finish. Everyone needs one.
    select d.id into v_photo
    from public.dosyalar d
    where d.storage_path = p_photo_path
      and d.step_id = p_step_id
      and d.eski_at is null
      and d.uploaded_by = auth.uid()
      and coalesce(d.mime, '') like 'image/%'
      and not exists (select 1 from public.step_events e where e.dosya_id = d.id);
    if v_photo is null then
      raise exception 'İşi bitirmek için bir fotoğraf çekin.' using errcode = '22023';
    end if;
    -- The finisher's level in the step's uzmanlık decides (0008).
    if v_manages or (
      coalesce(public.current_bolum() = 'imalat', false)
      and exists (
        select 1
        from public.step_types st
        join public.kisi_uzmanliklari ku on ku.uzmanlik_id = st.uzmanlik_id
        where st.id = v_step.step_type_id and ku.user_id = auth.uid() and ku.seviye = 'usta'
      )
    ) then
      v_new := 'done';
      v_kind := 'finished';
    else
      v_new := 'review';
      v_kind := 'submitted';
    end if;
  elsif p_action = 'problem' and v_step.status in ('waiting', 'active') then
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'Sorunun ne olduğunu seçin.' using errcode = '22023';
    end if;
    v_new := 'problem';
    v_kind := 'problem';
  elsif p_action = 'approve' and v_manages and v_step.status = 'review' then
    v_new := 'done';
    v_kind := 'approved';
  elsif p_action = 'reject' and v_manages and v_step.status = 'review' then
    if v_note is null then
      raise exception 'Neden geri gönderdiğinizi yazın.' using errcode = '22023';
    end if;
    v_new := 'active';
    v_kind := 'rejected';
  elsif p_action = 'reopen' and v_manages and v_step.status = 'done' then
    v_new := 'active';
    v_kind := 'reopened';
  elsif p_action = 'reset' and v_manages and v_step.status <> 'waiting' then
    v_new := 'waiting';
    v_kind := 'reset';
  else
    raise exception 'Bu adım şu anda bu işleme uygun değil.' using errcode = '22023';
  end if;

  update public.project_steps set
    status = v_new,
    problem_reason = case when v_new = 'problem' then btrim(p_reason) else null end,
    problem_note = case when v_new = 'problem' then v_note else null end,
    started_at = case
      when v_new = 'waiting' then null
      when v_new in ('active', 'review', 'done') then coalesce(started_at, now())
      else started_at
    end,
    submitted_at = case
      when v_kind = 'submitted' then now()
      when v_kind = 'approved' then submitted_at
      else null
    end,
    finished_at = case
      when v_kind = 'approved' then coalesce(submitted_at, now())
      when v_new = 'done' then now()
      else null
    end,
    review_note = case
      when v_kind = 'rejected' then v_note
      when v_new in ('active', 'problem') and v_kind not in ('reopened') then review_note
      else null
    end,
    finish_photo_id = case
      when v_kind in ('submitted', 'finished') then v_photo
      when v_new = 'waiting' then null
      else finish_photo_id
    end
  where id = p_step_id;

  insert into public.step_events (project_id, step_id, actor_id, kind, detail, dosya_id)
  values (
    v_step.project_id, p_step_id, auth.uid(), v_kind,
    case
      when v_new = 'problem' then btrim(p_reason) || coalesce(': ' || v_note, '')
      when v_kind = 'rejected' then v_note
    end,
    v_photo
  );

  return v_new;
end;
$$;

revoke all on function public.step_action(uuid, text, text, text, text) from public;
grant execute on function public.step_action(uuid, text, text, text, text) to authenticated;

-- Lets the app see the new argument straight away.
notify pgrst, 'reload schema';
