import { useMemo, useState } from 'react'
import { StatusBadge, StepDialog } from '../components/StepDialog'
import { TalepList } from '../components/Talepler'
import { ErrorNote, Spinner } from '../components/ui'
import { locale, t } from '../lib/i18n'
import { formatMoment, isFinished, isOpen, parseDay, startOfWeek, today, useWorkshop, type Step, type Workshop } from '../lib/workshop'
import { ProjectCard, Tile } from './Projeler'

/**
 * Genel Müdür and IT only: the whole workshop on one screen, made for a
 * phone. What is late, stuck or waiting for someone, and what got done this
 * week. Each step opens the step window, where it can be approved.
 */
export function Ozet() {
  const { data, error } = useWorkshop()
  const [openStep, setOpenStep] = useState<string | null>(null)

  const view = useMemo(() => {
    if (!data) return null
    const now = today()
    const late = data.projects
      .filter((p) => p.due_date && p.due_date.slice(0, 10) < now && !isFinished(data.stepsOf(p.id)))
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    const since = startOfWeek().getTime()
    return {
      late,
      problems: data.steps.filter((s) => s.status === 'problem'),
      reviews: data.steps
        .filter((s) => s.status === 'review')
        .sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '')),
      talepler: data.talepler.filter(isOpen).sort((a, b) => a.created_at.localeCompare(b.created_at)),
      finished: data.steps
        .filter((s) => s.status === 'done' && s.finished_at && new Date(s.finished_at).getTime() >= since)
        .sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? '')),
    }
  }, [data])

  const daysLate = (due: string) => Math.round((parseDay(today()).getTime() - parseDay(due).getTime()) / 86_400_000)

  const who = (step: Step) => data?.assigneesOf(step.id).map((p) => p.full_name).join(', ')
  const calm = view && !view.late.length && !view.problems.length && !view.reviews.length && !view.talepler.length

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="sub">
            {new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date())}
          </div>
          <h1>{t('Özet')}</h1>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {!data || !view ? (
        error ? null : (
          <Spinner />
        )
      ) : (
        <>
          <div className="tiles">
            <Tile label={t('Geciken proje')} value={view.late.length} tone="late" />
            <Tile label={t('Açık sorun')} value={view.problems.length} tone="problem" />
            <Tile label={t('Onay bekleyen')} value={view.reviews.length} tone="review" />
            <Tile label={t('Açık talep')} value={view.talepler.length} tone="active" />
            <Tile label={t('Bu hafta biten')} value={view.finished.length} tone="done" />
          </div>

          {calm ? <div className="card empty">{t('Geciken proje, açık sorun, onay bekleyen iş veya açık talep yok.')}</div> : null}

          {view.late.length ? (
            <section className="stack" aria-label={t('Geciken projeler')}>
              <h3>{t('Geciken projeler')}</h3>
              <div className="project-grid">
                {view.late.map((p) => (
                  <ProjectCard key={p.id} project={p} data={data} lateDays={daysLate(p.due_date!)} />
                ))}
              </div>
            </section>
          ) : null}

          {view.problems.length ? (
            <section className="stack" aria-label={t('Açık sorunlar')}>
              <h3>{t('Açık sorunlar')}</h3>
              <div className="job-list">
                {view.problems.map((s) => (
                  <StepCard
                    data={data}
                    onOpen={setOpenStep}
                    key={s.id}
                    step={s}
                    lines={[[s.problem_reason ? t(s.problem_reason) : null, s.problem_note].filter(Boolean).join(': '), who(s)]}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {view.reviews.length ? (
            <section className="stack" aria-label={t('Onay bekleyen işler')}>
              <h3>{t('Onay bekleyen işler')}</h3>
              <div className="job-list">
                {view.reviews.map((s) => (
                  <StepCard
                    data={data}
                    onOpen={setOpenStep}
                    key={s.id}
                    step={s}
                    lines={[who(s), s.submitted_at ? t('Teslim edildi: {time}', { time: formatMoment(s.submitted_at) }) : null]}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {view.talepler.length ? (
            <section className="stack" aria-label={t('Açık talepler')}>
              <h3>{t('Açık talepler')}</h3>
              <TalepList talepler={view.talepler} where label={t('Açık talepler')} />
            </section>
          ) : null}

          <section className="stack" aria-label={t('Bu hafta biten işler')}>
            <h3>{t('Bu hafta biten işler')}</h3>
            {view.finished.length ? (
              <div className="job-list">
                {view.finished.map((s) => (
                  <StepCard
                    data={data}
                    onOpen={setOpenStep}
                    key={s.id}
                    step={s}
                    lines={[who(s), t('Bitti: {time}', { time: formatMoment(s.finished_at) })]}
                  />
                ))}
              </div>
            ) : (
              <div className="card empty">{t('Bu hafta henüz biten iş yok.')}</div>
            )}
          </section>
        </>
      )}

      {openStep ? <StepDialog stepId={openStep} onClose={() => setOpenStep(null)} /> : null}
    </div>
  )
}

/** A step as a card, like in İşlerim; it opens the step window. */
function StepCard({
  data,
  step,
  lines,
  onOpen,
}: {
  data: Workshop
  step: Step
  lines: (string | null | undefined)[]
  onOpen: (stepId: string) => void
}) {
  const project = data.project(step.project_id)
  return (
    <button type="button" className="card job press" onClick={() => onOpen(step.id)}>
      <span className="job-top">
        <span className="mono">{project?.code ?? ''}</span>
        <StatusBadge step={step} />
      </span>
      <span className="job-name">{step.name}</span>
      <span className="sub">{project?.name}</span>
      {lines.filter(Boolean).map((line) => (
        <span key={line} className="sub">
          {line}
        </span>
      ))}
    </button>
  )
}
