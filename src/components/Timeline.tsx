import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { formatDay, isFinished, shownStatus, today, type Project, type Workshop } from '../lib/workshop'

const DAY_PX = 14
const ROW_PX = 56
const MONTH = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' })

/** Whole days since 1970 for a "YYYY-MM-DD" day. Plain arithmetic, so no time-zone or clock-change surprises. */
function dayNumber(day: string): number {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

function dayOf(n: number): Date {
  return new Date(n * 86_400_000) // read with getUTC*
}

/** The local calendar day of a timestamp, as "YYYY-MM-DD". */
function localDay(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type Row = {
  project: Project
  start: number
  end: number
  /** No delivery date: the bar's end is only where the known dates stop. */
  openEnded: boolean
  done: number
  total: number
  tone: 'done' | 'problem' | 'late' | 'active'
  marks: { id: string; day: number; shown: string; title: string }[]
}

/**
 * Projects as bars on a calendar: each bar runs from the day the project was
 * opened (or first worked on) to its delivery date, with a dot for every step
 * that has a due date. The vertical line is today.
 */
export function Timeline({ projects, data }: { projects: Project[]; data: Workshop }) {
  const scroller = useRef<HTMLDivElement>(null)
  const now = dayNumber(today())

  const { rows, from, days } = useMemo(() => {
    const rows: Row[] = projects.map((project) => {
      const steps = data.stepsOf(project.id)
      const started = steps.filter((s) => s.started_at).map((s) => dayNumber(localDay(s.started_at!)))
      const dues = steps.filter((s) => s.due_date).map((s) => dayNumber(s.due_date!))
      const opened = dayNumber(localDay(project.created_at))
      const start = Math.min(opened, ...started)
      const end = project.due_date ? dayNumber(project.due_date) : Math.max(start + 13, now, ...dues)
      const finished = isFinished(steps)
      return {
        project,
        start: Math.min(start, end),
        end: Math.max(start, end),
        openEnded: !project.due_date,
        done: steps.filter((s) => s.status === 'done').length,
        total: steps.length,
        tone: finished
          ? 'done'
          : steps.some((s) => s.status === 'problem')
            ? 'problem'
            : project.due_date && dayNumber(project.due_date) < now
              ? 'late'
              : 'active',
        marks: steps
          .filter((s) => s.due_date)
          .map((s) => ({
            id: s.id,
            day: dayNumber(s.due_date!),
            shown: shownStatus(s),
            title: `${s.name}: ${formatDay(s.due_date)}`,
          })),
      }
    })
    const first = Math.min(now, ...rows.map((r) => r.start), ...rows.flatMap((r) => r.marks.map((m) => m.day)))
    const last = Math.max(now, ...rows.map((r) => r.end), ...rows.flatMap((r) => r.marks.map((m) => m.day)))
    const from = first - 7
    return { rows, from, days: Math.max(last + 14 - from, 56) }
  }, [projects, data, now])

  const width = days * DAY_PX
  const x = (day: number) => (day - from) * DAY_PX

  const { months, weeks } = useMemo(() => {
    const months: { left: number; label: string }[] = []
    const weeks: { left: number; label: string }[] = []
    for (let d = from; d < from + days; d++) {
      const date = dayOf(d)
      if (date.getUTCDate() === 1 || d === from) {
        months.push({ left: (d - from) * DAY_PX, label: MONTH.format(new Date(date.getUTCFullYear(), date.getUTCMonth(), 1)) })
      }
      if (date.getUTCDay() === 1) weeks.push({ left: (d - from) * DAY_PX, label: String(date.getUTCDate()) })
    }
    // A month that starts right at the edge would print over the next one.
    if (months.length > 1 && months[1].left - months[0].left < 90) months.shift()
    return { months, weeks }
  }, [from, days])

  // Open on today, a little in from the left edge.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = Math.max(0, (now - from) * DAY_PX - 60)
  }, [now, from])

  const weekOffset = weeks[0]?.left ?? 0

  return (
    <div className="stack">
      <div className="card tl" ref={scroller} tabIndex={0} role="group" aria-label="Zaman çizelgesi">
        <div className="tl-inner" style={{ width: `calc(var(--tl-label) + ${width}px)` }}>
          <div className="tl-head">
            <div className="tl-corner">Proje</div>
            <div className="tl-axis" style={{ width }}>
              {months.map((m) => (
                <span key={m.left} className="tl-month" style={{ left: m.left }}>
                  {m.label}
                </span>
              ))}
              {weeks.map((w) => (
                <span key={w.left} className="tl-week" style={{ left: w.left }}>
                  {w.label}
                </span>
              ))}
            </div>
          </div>

          {rows.map((r) => {
            const left = x(r.start)
            const barWidth = Math.max((r.end - r.start + 1) * DAY_PX, DAY_PX * 2)
            const label = [r.project.code, r.project.name].filter(Boolean).join(' · ')
            const dates = `${formatDay(localDayOf(r.start))} – ${r.openEnded ? 'teslim tarihi yok' : formatDay(r.project.due_date)}`
            return (
              <div key={r.project.id} className="tl-row" style={{ height: ROW_PX }}>
                <Link to={`/projeler/${r.project.id}`} className="tl-label press">
                  <span className="tl-name">{r.project.name}</span>
                  <span className="sub">
                    {r.total ? `${r.done} / ${r.total} adım` : 'Adım yok'}
                    {r.project.due_date ? ` · ${formatDay(r.project.due_date)}` : ''}
                  </span>
                </Link>
                <div
                  className="tl-track"
                  style={{ width, backgroundSize: `${7 * DAY_PX}px 100%`, backgroundPositionX: weekOffset }}
                >
                  <Link
                    to={`/projeler/${r.project.id}`}
                    className={`tl-bar tl-${r.tone}${r.openEnded ? ' tl-open' : ''}`}
                    style={{ left, width: barWidth }}
                    aria-label={`${label}, ${dates}, ${r.done} / ${r.total} adım bitti`}
                    title={`${label}\n${dates}`}
                  >
                    <span className="tl-fill" style={{ width: r.total ? `${(r.done / r.total) * 100}%` : 0 }} />
                  </Link>
                  {r.marks.map((m) => (
                    <span key={m.id} className={`tl-mark seg-${m.shown}`} style={{ left: x(m.day) + DAY_PX / 2 }} title={m.title} />
                  ))}
                </div>
              </div>
            )
          })}

          <div className="tl-today" style={{ left: `calc(var(--tl-label) + ${x(now) + DAY_PX / 2}px)` }} aria-hidden="true">
            <span>Bugün</span>
          </div>
        </div>
      </div>
      <div className="sub">
        Çubuk, projenin açıldığı günden teslim tarihine uzanır; dolu kısmı biten adımları gösterir. Noktalar adımların bitiş
        tarihleri, dikey çizgi bugündür. Kesik uçlu çubukların teslim tarihi yoktur.
      </div>
    </div>
  )
}

function localDayOf(n: number): string {
  const d = dayOf(n)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
