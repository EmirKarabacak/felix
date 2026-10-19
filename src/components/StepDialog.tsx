import { useState } from 'react'
import { useProfile } from '../lib/auth'
import { t } from '../lib/i18n'
import { SEVIYE_LABEL, SEVIYELER, canManage, supabase, type Profile } from '../lib/supabase'
import {
  PROBLEM_REASONS,
  SHOWN_LABEL,
  formatDay,
  formatMoment,
  groupPeople,
  reportProblem,
  shownStatus,
  stepAction,
  useWorkshop,
  type Step,
  type Workshop,
} from '../lib/workshop'
import { FileSection } from './Dosyalar'
import { TalepList } from './Talepler'
import { Dialog, ErrorNote, Field, Icon } from './ui'

export function StatusBadge({ step }: { step: Pick<Step, 'due_date' | 'status'> }) {
  const shown = shownStatus(step)
  return <span className={`badge status-${shown}`}>{t(SHOWN_LABEL[shown])}</span>
}

/**
 * Everything about one step. What it offers depends on who is looking:
 * the CEO and managers can change it; an assigned worker can start, finish
 * and report a problem; everyone else just reads it.
 */
export function StepDialog({ stepId, onClose }: { stepId: string; onClose: () => void }) {
  const me = useProfile()
  const { data, change } = useWorkshop()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [material, setMaterial] = useState('')
  const [quantity, setQuantity] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectNote, setRejectNote] = useState('')

  const step = data?.steps.find((s) => s.id === stepId)
  if (!data || !step) return null // removed by someone else while open

  const project = data.project(step.project_id)
  const siblings = data.stepsOf(step.project_id)
  const place = siblings.findIndex((s) => s.id === step.id)
  const assignees = data.assigneesOf(step.id)
  const manages = canManage(me.panel)
  const mine = assignees.some((p) => p.id === me.id)
  const canAct = manages || mine

  async function run(work: () => PromiseLike<{ error: unknown }>, after?: () => void) {
    if (busy) return
    setBusy(true)
    setError(null)
    const failed = await change(work)
    setBusy(false)
    if (failed) setError(failed)
    else after?.()
  }

  const act = (action: Parameters<typeof stepAction>[1]) => run(() => stepAction(step.id, action))

  // After 0008, "Malzeme eksik" names the material, and opens a request for it.
  const asksMaterial = data.ready && reason === 'Malzeme eksik'

  function report() {
    if (!reason || (asksMaterial && !material.trim())) return
    void run(
      () => reportProblem(data!, step!.id, reason, note, asksMaterial ? material : undefined, asksMaterial ? quantity : undefined),
      () => {
        setReporting(false)
        setReason(null)
        setNote('')
        setMaterial('')
        setQuantity('')
      },
    )
  }

  function toggle(userId: string, on: boolean) {
    void run(() =>
      on
        ? supabase.from('step_assignees').delete().eq('step_id', step!.id).eq('user_id', userId)
        : supabase.from('step_assignees').insert({ step_id: step!.id, user_id: userId }),
    )
  }

  function move(by: -1 | 1) {
    const other = siblings[place + by]
    if (!other) return
    // Swap places with the neighbour.
    void run(async () => {
      const first = await supabase.from('project_steps').update({ position: other.position }).eq('id', step!.id)
      if (first.error) return first
      return supabase.from('project_steps').update({ position: step!.position }).eq('id', other.id)
    })
  }

  const subtitle = [project?.code, project?.name].filter(Boolean).join(' · ')
  const talepler = data.taleplerOfStep(step.id)

  if (rejecting) {
    return (
      <Dialog title={t('Geri gönder')} subtitle={step.name} onClose={() => setRejecting(false)}>
        <Field
          label={t('Neden geri gönderiyorsunuz?')}
          hint={t('İşi yapan kişi bu notu görür. Örnek: neyin yeniden yapılması gerekiyor.')}
        >
          {(id) => (
            <textarea
              id={id}
              className="input textarea"
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              maxLength={400}
            />
          )}
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <button
          type="button"
          className="btn btn-warn btn-big press"
          disabled={busy || !rejectNote.trim()}
          onClick={() =>
            void run(
              () => stepAction(step.id, 'reject', undefined, rejectNote),
              () => {
                setRejecting(false)
                setRejectNote('')
              },
            )
          }
        >
          {busy ? t('Gönderiliyor…') : t('Geri gönder')}
        </button>
      </Dialog>
    )
  }

  if (reporting) {
    return (
      <Dialog title={t('Sorun nedir?')} subtitle={step.name} onClose={() => setReporting(false)} focusFirst={false}>
        <div className="card rows checklist" role="group" aria-label={t('Sorun türü')}>
          {PROBLEM_REASONS.map((r) => (
            <button key={r} type="button" className="check-row press" aria-pressed={reason === r} onClick={() => setReason(r)}>
              <span>{t(r)}</span>
              {reason === r ? <Icon name="check" /> : null}
            </button>
          ))}
        </div>
        {asksMaterial ? (
          <div className="pair material-pair">
            <Field label={t('Eksik malzeme')} hint={t('Satın alma ve bölüm sorumluları görür.')}>
              {(id) => (
                <input
                  id={id}
                  className="input"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  placeholder={t('Örnek: 2 inç küresel vana')}
                  maxLength={200}
                />
              )}
            </Field>
            <Field label={t('Miktar')}>
              {(id) => (
                <input
                  id={id}
                  className="input"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={t('Örnek: 4 adet')}
                  maxLength={60}
                />
              )}
            </Field>
          </div>
        ) : null}
        <Field
          label={t('Not (isteğe bağlı)')}
          hint={
            data.ready && reason === 'Çizim hatalı' // i18n-ok: the stored reason
              ? t('Tasarım görür. Örnek: hangi ölçü yanlış.')
              : t('Örnek: hangi makine, ne oldu.')
          }
        >
          {(id) => <input id={id} className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />}
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <button
          type="button"
          className="btn btn-warn btn-big press"
          disabled={busy || !reason || (asksMaterial && !material.trim())}
          onClick={report}
        >
          {busy ? t('Bildiriliyor…') : t('Sorunu bildir')}
        </button>
      </Dialog>
    )
  }

  return (
    <Dialog title={step.name} subtitle={subtitle} onClose={onClose} focusFirst={false}>
      {step.status === 'problem' ? (
        <div className="note note-warn" role="status">
          <strong>{step.problem_reason ? t(step.problem_reason) : null}</strong>
          {step.problem_note ? <div>{step.problem_note}</div> : null}
        </div>
      ) : null}

      {talepler.length ? <TalepList talepler={talepler} label={t('Talepler')} /> : null}

      {step.status === 'review' ? (
        <div className="note note-review" role="status">
          <strong>{manages ? t('Bu iş onayınızı bekliyor.') : t('Onay bekleniyor.')}</strong>
          {step.submitted_at ? <div>{t('Teslim edildi: {time}', { time: formatMoment(step.submitted_at) })}</div> : null}
        </div>
      ) : null}
      {step.review_note && step.status !== 'review' && step.status !== 'done' ? (
        <div className="note note-warn" role="status">
          <strong>{t('Geri gönderildi')}</strong>
          <div>{step.review_note}</div>
        </div>
      ) : null}

      <div className="card rows facts">
        <div className="fact">
          <span>{t('Durum')}</span>
          <StatusBadge step={step} />
        </div>
        {data.uzmanlikName(data.stepType(step.step_type_id)?.uzmanlik_id ?? null) ? (
          <div className="fact">
            <span>{t('Uzmanlık')}</span>
            <span className="value">{data.uzmanlikName(data.stepType(step.step_type_id)?.uzmanlik_id ?? null)}</span>
          </div>
        ) : null}
        {manages ? (
          <label className="fact">
            <span>{t('Bitiş tarihi')}</span>
            <input
              type="date"
              className="date-input"
              value={step.due_date ?? ''}
              onChange={(e) => {
                const value = e.target.value || null
                void run(() => supabase.from('project_steps').update({ due_date: value }).eq('id', step.id))
              }}
            />
          </label>
        ) : (
          <div className="fact">
            <span>{t('Bitiş tarihi')}</span>
            <span className="value">{formatDay(step.due_date) || t('Belirlenmedi')}</span>
          </div>
        )}
        {step.started_at ? (
          <div className="fact">
            <span>{t('Başladı')}</span>
            <span className="value">{formatMoment(step.started_at)}</span>
          </div>
        ) : null}
        {step.finished_at ? (
          <div className="fact">
            <span>{t('Bitti|zaman')}</span>
            <span className="value">{formatMoment(step.finished_at)}</span>
          </div>
        ) : null}
      </div>

      <ErrorNote>{error}</ErrorNote>

      {canAct ? (
        <div className="dialog-foot">
          {step.status === 'waiting' ? (
            <button type="button" className="btn btn-go btn-big press" disabled={busy} onClick={() => void act('start')}>
              {t('İşe başla')}
            </button>
          ) : null}
          {step.status === 'active' || (manages && step.status === 'waiting') ? (
            <button
              type="button"
              className={`btn ${step.status === 'active' ? 'btn-primary' : 'btn-tint'} btn-big press`}
              disabled={busy}
              onClick={() => void act('finish')}
            >
              {t('İşi bitir')}
            </button>
          ) : null}
          {step.status === 'problem' ? (
            <button type="button" className="btn btn-primary btn-big press" disabled={busy} onClick={() => void act('start')}>
              {t('Sorun çözüldü, devam et')}
            </button>
          ) : null}
          {step.status === 'waiting' || step.status === 'active' ? (
            <button type="button" className="btn btn-warn-quiet btn-big press" disabled={busy} onClick={() => setReporting(true)}>
              {t('Sorun bildir')}
            </button>
          ) : null}
          {manages && step.status === 'review' ? (
            <>
              <button type="button" className="btn btn-go btn-big press" disabled={busy} onClick={() => void act('approve')}>
                {t('Onayla')}
              </button>
              <button type="button" className="btn btn-warn-quiet btn-big press" disabled={busy} onClick={() => setRejecting(true)}>
                {t('Geri gönder')}
              </button>
            </>
          ) : null}
          {manages && step.status === 'done' ? (
            <button type="button" className="btn btn-tint btn-big press" disabled={busy} onClick={() => void act('reopen')}>
              {t('Yeniden aç')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="field-label">{t('Atanan kişiler')}</div>
        {manages ? (
          assignGroups(data, step, data.people.filter((p) => p.active || assignees.some((a) => a.id === p.id))).map((g) => (
            <div key={g.title ?? 'all'}>
              {g.title ? <div className="check-group">{t(g.title)}</div> : null}
              <div className="card rows checklist" role="group" aria-label={g.title ? t(g.title) : t('Atanan kişiler')}>
                {g.people.map(({ person: p, note }) => {
                  const on = assignees.some((a) => a.id === p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="check-row press"
                      aria-pressed={on}
                      disabled={busy}
                      onClick={() => toggle(p.id, on)}
                    >
                      <span>
                        {p.full_name}
                        {note ? <span className="sub"> {note}</span> : null}
                      </span>
                      {on ? <Icon name="check" /> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        ) : assignees.length ? (
          <div className="chips">
            {assignees.map((p) => (
              <span key={p.id} className="chip">
                {p.full_name}
              </span>
            ))}
          </div>
        ) : (
          <div className="sub">{t('Henüz kimse atanmadı.')}</div>
        )}
        {manages ? <div className="hint">{t('Bir adıma birden fazla kişi atayabilirsiniz.')}</div> : null}
      </div>

      {data.ready && project ? (
        <FileSection
          title={t('Dosyalar')}
          projectId={project.id}
          stepId={step.id}
          files={data.dosyalarOfStep(step.id)}
          canAdd
          addLabel={t('Dosya ekle')}
          empty={t('Bu adımda dosya yok. Fotoğraf veya küçük belgeler ekleyebilirsiniz.')}
        />
      ) : null}

      {manages ? (
        <div className="dialog-foot">
          <div className="pair">
            <button type="button" className="btn btn-quiet press" disabled={busy || place <= 0} onClick={() => move(-1)}>
              {t('Yukarı taşı')}
            </button>
            <button
              type="button"
              className="btn btn-quiet press"
              disabled={busy || place >= siblings.length - 1}
              onClick={() => move(1)}
            >
              {t('Aşağı taşı')}
            </button>
          </div>
          {confirmRemove ? (
            <>
              <div className="note note-error">{t('Bu adım projeden kaldırılacak. Geri alınamaz.')}</div>
              <button
                type="button"
                className="btn btn-danger btn-big press"
                disabled={busy}
                onClick={() => void run(() => supabase.from('project_steps').delete().eq('id', step.id), onClose)}
              >
                {t('Evet, adımı kaldır')}
              </button>
              <button type="button" className="btn btn-quiet btn-big press" onClick={() => setConfirmRemove(false)}>
                {t('Vazgeç')}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-danger btn-big press" onClick={() => setConfirmRemove(true)}>
              {t('Adımı kaldır')}
            </button>
          )}
        </div>
      ) : null}
    </Dialog>
  )
}

type AssignGroup = { title: string | null; people: { person: Profile; note: string }[] }

/**
 * The assign list. When the step's type suggests an uzmanlık, the people who
 * have it come first, best level first; everyone else follows, by bölüm. Only
 * Genel Müdür, IT and Bölüm Sorumluları see this list, and only they can read levels.
 */
function assignGroups(data: Workshop, step: Step, people: Profile[]): AssignGroup[] {
  const uzmanlikId = data.stepType(step.step_type_id)?.uzmanlik_id ?? null
  const uzmanlik = data.uzmanlikName(uzmanlikId)
  const levelIn = (p: Profile) => data.uzmanliklarOf(p.id).find((u) => u.uzmanlik_id === uzmanlikId)?.seviye
  const inImalat = (p: Profile) => p.panel === 'worker' && data.bolumKod(p.bolum_id) === 'imalat'
  const matching = uzmanlik
    ? people
        .filter((p) => inImalat(p) && levelIn(p))
        .sort((a, b) => SEVIYELER.indexOf(levelIn(a)!) - SEVIYELER.indexOf(levelIn(b)!))
    : []
  const rest = people.filter((p) => !matching.includes(p))
  const note = (p: Profile) => (inImalat(p) ? data.uzmanlikText(p.id) : '')
  return [
    ...(matching.length
      ? [
          {
            title: t('Önerilen: {uzmanlik}', { uzmanlik: uzmanlik ?? '' }),
            people: matching.map((p) => ({ person: p, note: t(SEVIYE_LABEL[levelIn(p)!]) })),
          },
        ]
      : []),
    ...groupPeople(data, rest).map((g) => ({
      title: matching.length && !g.title ? t('Diğerleri') : g.title,
      people: g.people.map((p) => ({ person: p, note: note(p) })),
    })),
  ]
}
