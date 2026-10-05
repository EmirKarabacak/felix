import { useMemo, useState } from 'react'
import { StatusBadge, StepDialog } from '../components/StepDialog'
import { ErrorNote, Spinner } from '../components/ui'
import { useProfile } from '../lib/auth'
import { formatDay, useWorkshop, type Step } from '../lib/workshop'

const RECENT_DAYS = 7

/** The worker's home: the steps assigned to them, most urgent first. */
export function Islerim() {
  const me = useProfile()
  const { data, error } = useWorkshop()
  const [openStep, setOpenStep] = useState<string | null>(null)

  const groups = useMemo(() => {
    if (!data) return null
    const mineIds = new Set(data.assignees.filter((a) => a.user_id === me.id).map((a) => a.step_id))
    const mine = data.steps.filter((s) => mineIds.has(s.id))
    const byDue = (a: Step, b: Step) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    const since = Date.now() - RECENT_DAYS * 24 * 3600 * 1000
    return [
      { title: 'Sorun bildirilenler', steps: mine.filter((s) => s.status === 'problem').sort(byDue) },
      { title: 'Devam eden', steps: mine.filter((s) => s.status === 'active').sort(byDue) },
      { title: 'Bekleyen', steps: mine.filter((s) => s.status === 'waiting').sort(byDue) },
      { title: 'Onay bekleyen', steps: mine.filter((s) => s.status === 'review').sort(byDue) },
      {
        title: 'Son bitenler',
        steps: mine
          .filter((s) => s.status === 'done' && s.finished_at && new Date(s.finished_at).getTime() >= since)
          .sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? '')),
      },
    ].filter((g) => g.steps.length > 0)
  }, [data, me.id])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="sub">
            {new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date())}
          </div>
          <h1>İşlerim</h1>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {!data || !groups ? (
        error ? null : (
          <Spinner />
        )
      ) : groups.length === 0 ? (
        <div className="card empty">Size atanmış bir iş yok.</div>
      ) : (
        groups.map((g) => (
          <section key={g.title} className="stack" aria-label={g.title}>
            <h3>{g.title}</h3>
            <div className="job-list">
              {g.steps.map((s) => {
                const project = data.project(s.project_id)
                return (
                  <button key={s.id} type="button" className="card job press" onClick={() => setOpenStep(s.id)}>
                    <span className="job-top">
                      <span className="mono">{project?.code ?? ''}</span>
                      <StatusBadge step={s} />
                    </span>
                    <span className="job-name">{s.name}</span>
                    {s.review_note && s.status !== 'review' ? <span className="badge status-problem">Geri gönderildi</span> : null}
                    <span className="sub">{project?.name}</span>
                    {s.due_date ? <span className="sub">Bitiş: {formatDay(s.due_date)}</span> : null}
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}

      {openStep ? <StepDialog stepId={openStep} onClose={() => setOpenStep(null)} /> : null}
    </div>
  )
}
