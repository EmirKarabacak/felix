import { useState } from 'react'
import { useProfile } from '../lib/auth'
import { canManage, supabase } from '../lib/supabase'
import {
  PROBLEM_REASONS,
  SHOWN_LABEL,
  formatDay,
  formatMoment,
  shownStatus,
  stepAction,
  useWorkshop,
  type Step,
} from '../lib/workshop'
import { Dialog, ErrorNote, Field, Icon, Switch } from './ui'

export function StatusBadge({ step }: { step: Pick<Step, 'due_date' | 'status'> }) {
  const shown = shownStatus(step)
  return <span className={`badge status-${shown}`}>{SHOWN_LABEL[shown]}</span>
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

  function report() {
    if (!reason) return
    void run(
      () => stepAction(step!.id, 'problem', reason, note),
      () => {
        setReporting(false)
        setReason(null)
        setNote('')
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
  // A worker's finish on such a step goes to a manager first.
  const handsIn = step.needs_approval && !manages

  if (rejecting) {
    return (
      <Dialog title="Geri gönder" subtitle={step.name} onClose={() => setRejecting(false)}>
        <Field label="Neden geri gönderiyorsunuz?" hint="İşçi bu notu görür. Örnek: neyin yeniden yapılması gerekiyor.">
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
          {busy ? 'Gönderiliyor…' : 'İşçiye geri gönder'}
        </button>
      </Dialog>
    )
  }

  if (reporting) {
    return (
      <Dialog title="Sorun nedir?" subtitle={step.name} onClose={() => setReporting(false)} focusFirst={false}>
        <div className="card rows checklist" role="group" aria-label="Sorun türü">
          {PROBLEM_REASONS.map((r) => (
            <button key={r} type="button" className="check-row press" aria-pressed={reason === r} onClick={() => setReason(r)}>
              <span>{r}</span>
              {reason === r ? <Icon name="check" /> : null}
            </button>
          ))}
        </div>
        <Field label="Not (isteğe bağlı)" hint="Örnek: hangi malzeme eksik, hangi çizimde hata var.">
          {(id) => <input id={id} className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />}
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <button type="button" className="btn btn-warn btn-big press" disabled={busy || !reason} onClick={report}>
          {busy ? 'Bildiriliyor…' : 'Sorunu bildir'}
        </button>
      </Dialog>
    )
  }

  return (
    <Dialog title={step.name} subtitle={subtitle} onClose={onClose} focusFirst={false}>
      {step.status === 'problem' ? (
        <div className="note note-warn" role="status">
          <strong>{step.problem_reason}</strong>
          {step.problem_note ? <div>{step.problem_note}</div> : null}
        </div>
      ) : null}

      {step.status === 'review' ? (
        <div className="note note-review" role="status">
          <strong>{manages ? 'Bu iş onayınızı bekliyor.' : 'Yönetici onayı bekleniyor.'}</strong>
          {step.submitted_at ? <div>Teslim edildi: {formatMoment(step.submitted_at)}</div> : null}
        </div>
      ) : null}
      {step.review_note && step.status !== 'review' && step.status !== 'done' ? (
        <div className="note note-warn" role="status">
          <strong>Yönetici geri gönderdi</strong>
          <div>{step.review_note}</div>
        </div>
      ) : null}

      <div className="card rows facts">
        <div className="fact">
          <span>Durum</span>
          <StatusBadge step={step} />
        </div>
        {manages ? (
          <label className="fact">
            <span>Onay gerekir</span>
            <Switch
              checked={step.needs_approval}
              onChange={(next) => run(() => supabase.from('project_steps').update({ needs_approval: next }).eq('id', step.id))}
            />
          </label>
        ) : null}
        {manages ? (
          <label className="fact">
            <span>Bitiş tarihi</span>
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
            <span>Bitiş tarihi</span>
            <span className="value">{formatDay(step.due_date) || 'Belirlenmedi'}</span>
          </div>
        )}
        {step.started_at ? (
          <div className="fact">
            <span>Başladı</span>
            <span className="value">{formatMoment(step.started_at)}</span>
          </div>
        ) : null}
        {step.finished_at ? (
          <div className="fact">
            <span>Bitti</span>
            <span className="value">{formatMoment(step.finished_at)}</span>
          </div>
        ) : null}
      </div>

      <ErrorNote>{error}</ErrorNote>

      {canAct ? (
        <div className="dialog-foot">
          {step.status === 'waiting' ? (
            <button type="button" className="btn btn-go btn-big press" disabled={busy} onClick={() => void act('start')}>
              İşe başla
            </button>
          ) : null}
          {step.status === 'active' || (manages && step.status === 'waiting') ? (
            <button
              type="button"
              className={`btn ${step.status === 'active' ? 'btn-primary' : 'btn-tint'} btn-big press`}
              disabled={busy}
              onClick={() => void act('finish')}
            >
              {handsIn ? 'Bitir ve onaya gönder' : 'İşi bitir'}
            </button>
          ) : null}
          {step.status === 'problem' ? (
            <button type="button" className="btn btn-primary btn-big press" disabled={busy} onClick={() => void act('start')}>
              Sorun çözüldü, devam et
            </button>
          ) : null}
          {step.status === 'waiting' || step.status === 'active' ? (
            <button type="button" className="btn btn-warn-quiet btn-big press" disabled={busy} onClick={() => setReporting(true)}>
              Sorun bildir
            </button>
          ) : null}
          {manages && step.status === 'review' ? (
            <>
              <button type="button" className="btn btn-go btn-big press" disabled={busy} onClick={() => void act('approve')}>
                Onayla
              </button>
              <button type="button" className="btn btn-warn-quiet btn-big press" disabled={busy} onClick={() => setRejecting(true)}>
                Geri gönder
              </button>
            </>
          ) : null}
          {manages && step.status === 'done' ? (
            <button type="button" className="btn btn-tint btn-big press" disabled={busy} onClick={() => void act('reopen')}>
              Yeniden aç
            </button>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="field-label">Sorumlular</div>
        {manages ? (
          <div className="card rows checklist" role="group" aria-label="Sorumlular">
            {data.people
              .filter((p) => p.active || assignees.some((a) => a.id === p.id))
              .map((p) => {
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
                      <span className="sub"> {data.meslekler.find((m) => m.id === p.meslek_id)?.name ?? ''}</span>
                    </span>
                    {on ? <Icon name="check" /> : null}
                  </button>
                )
              })}
          </div>
        ) : assignees.length ? (
          <div className="chips">
            {assignees.map((p) => (
              <span key={p.id} className="chip">
                {p.full_name}
              </span>
            ))}
          </div>
        ) : (
          <div className="sub">Henüz kimse atanmadı.</div>
        )}
        {manages ? <div className="hint">Bir adıma birden fazla kişi atayabilirsiniz.</div> : null}
      </div>

      {manages ? (
        <div className="dialog-foot">
          <div className="pair">
            <button type="button" className="btn btn-quiet press" disabled={busy || place <= 0} onClick={() => move(-1)}>
              Yukarı taşı
            </button>
            <button
              type="button"
              className="btn btn-quiet press"
              disabled={busy || place >= siblings.length - 1}
              onClick={() => move(1)}
            >
              Aşağı taşı
            </button>
          </div>
          {confirmRemove ? (
            <>
              <div className="note note-error">Bu adım projeden kaldırılacak. Geri alınamaz.</div>
              <button
                type="button"
                className="btn btn-danger btn-big press"
                disabled={busy}
                onClick={() => void run(() => supabase.from('project_steps').delete().eq('id', step.id), onClose)}
              >
                Evet, adımı kaldır
              </button>
              <button type="button" className="btn btn-quiet btn-big press" onClick={() => setConfirmRemove(false)}>
                Vazgeç
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-danger btn-big press" onClick={() => setConfirmRemove(true)}>
              Adımı kaldır
            </button>
          )}
        </div>
      ) : null}
    </Dialog>
  )
}
