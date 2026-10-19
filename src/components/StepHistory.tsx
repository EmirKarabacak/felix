import { useEffect, useState } from 'react'
import { viewLink } from '../lib/dosyalar'
import { friendly } from '../lib/errors'
import { t } from '../lib/i18n'
import { PROBLEM_REASONS, fetchStepEvents, formatMoment, useWorkshop, type Dosya, type Step, type StepEvent } from '../lib/workshop'
import { ErrorNote, Icon } from './ui'

/**
 * A stored photo shown in the page. Tapping it opens the full size in a new
 * tab. Shows nothing while the link is fetched, or if the file cannot be read
 * (for Personel, once it has been moved to Eski sürümler).
 */
export function Photo({ file, size = 'large' }: { file: Dosya; size?: 'large' | 'small' }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void viewLink(file.storage_path).then(({ url }) => {
      if (alive) setUrl(url)
    })
    return () => {
      alive = false
    }
  }, [file.storage_path])
  if (!url) return <span className={`photo photo-${size} photo-loading`} aria-hidden="true" />
  return (
    <a className={`photo photo-${size} press`} href={url} target="_blank" rel="noreferrer" aria-label={t('{name} aç', { name: file.name })}>
      <img src={url} alt={file.name} />
    </a>
  )
}

/** What one line of the history says, in the reader's language. */
function eventText(e: StepEvent): { title: string; detail: string | null } {
  // Problems are stored as "Malzeme eksik: note"; the reason is translated, the note stays as typed.
  const problem = () => {
    const [reason, ...rest] = (e.detail ?? '').split(': ')
    const known = PROBLEM_REASONS.includes(reason)
    return known ? [t(reason), ...rest].join(': ') : e.detail
  }
  const name = e.detail ?? ''
  switch (e.kind) {
    case 'assigned':
      return { title: t('Atandı: {name}', { name }), detail: null }
    case 'unassigned':
      return { title: t('Atamadan çıkarıldı: {name}', { name }), detail: null }
    case 'started':
      return { title: t('İşe başlandı'), detail: null }
    case 'submitted':
      return { title: t('Bitirildi, onaya gönderildi'), detail: null }
    case 'finished':
      return { title: t('Bitirildi'), detail: null }
    case 'approved':
      return { title: t('Onaylandı'), detail: null }
    case 'rejected':
      return { title: t('Geri gönderildi'), detail: e.detail }
    case 'problem':
      return { title: t('Sorun bildirildi'), detail: problem() }
    case 'resolved':
      return { title: t('Sorun çözüldü, devam edildi'), detail: null }
    case 'reopened':
      return { title: t('Yeniden açıldı'), detail: null }
    case 'reset':
      return { title: t('Başa alındı'), detail: null }
    default:
      return { title: e.kind, detail: e.detail }
  }
}

/**
 * Who did what to a step, and when, oldest first, with the photo of each
 * finish. Closed at first, like Eski sürümler, so the step window stays short.
 */
export function StepHistory({ step }: { step: Step }) {
  const { data } = useWorkshop()
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<StepEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const photoReady = data?.photoReady ?? false

  // Read again whenever the step changes, so a new line shows straight away.
  const changed = [step.status, step.started_at, step.submitted_at, step.finished_at, data?.assigneesOf(step.id).length].join()
  useEffect(() => {
    let alive = true
    void fetchStepEvents(step.id, photoReady).then(({ events, error }) => {
      if (!alive) return
      setEvents(events)
      setError(error ? friendly(error) : null)
    })
    return () => {
      alive = false
    }
  }, [step.id, photoReady, changed])

  if (!data || !events || events.length === 0) return <ErrorNote>{error}</ErrorNote>
  const files = data.dosyalarOfStep(step.id)

  return (
    <section className="history" aria-label={t('Geçmiş')}>
      <button type="button" className="btn btn-quiet press" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'up' : 'down'} size={18} />
        {t('Geçmiş ({n})', { n: events.length })}
      </button>
      {open ? (
        <ol className="card rows history-list">
          {events.map((e) => {
            const { title, detail } = eventText(e)
            const who = e.actor_id ? data.person(e.actor_id)?.full_name : undefined
            const photo = e.dosya_id ? files.find((f) => f.id === e.dosya_id) : undefined
            return (
              <li key={e.id} className="history-row">
                <span className="history-text">
                  <span className="history-title">{title}</span>
                  {detail ? <span className="history-detail">{detail}</span> : null}
                  <span className="sub">{[who, formatMoment(e.created_at)].filter(Boolean).join(' · ')}</span>
                </span>
                {photo ? <Photo file={photo} size="small" /> : null}
              </li>
            )
          })}
        </ol>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
    </section>
  )
}
