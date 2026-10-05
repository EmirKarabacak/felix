import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Dialog, ErrorNote, Field, Icon, Spinner } from '../components/ui'
import { useProfile } from '../lib/auth'
import { friendly } from '../lib/errors'
import { canManage, supabase } from '../lib/supabase'
import {
  formatDay,
  isFinished,
  isLate,
  shownStatus,
  stepAction,
  useWorkshop,
  type Project,
  type Step,
  type Workshop,
} from '../lib/workshop'

/** One coloured segment per step: the project's progress at a glance. */
export function ProgressStrip({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return <span className="strip strip-empty" />
  return (
    <span className="strip" aria-hidden="true">
      {steps.map((s) => (
        <span key={s.id} className={`seg seg-${shownStatus(s)}`} />
      ))}
    </span>
  )
}

export function progressText(steps: Step[]): string {
  if (steps.length === 0) return 'Henüz adım yok'
  return `${steps.filter((s) => s.status === 'done').length} / ${steps.length} adım bitti`
}

export function Projeler() {
  const me = useProfile()
  const manages = canManage(me.panel)
  const { data, error, change } = useWorkshop()
  const [showFinished, setShowFinished] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busyStep, setBusyStep] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const view = useMemo(() => {
    if (!data) return null
    const active: Project[] = []
    const finished: Project[] = []
    for (const p of data.projects) (isFinished(data.stepsOf(p.id)) ? finished : active).push(p)
    // Soonest delivery first; projects without a date go last.
    const byDue = (a: Project, b: Project) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    active.sort(byDue)
    finished.sort((a, b) => b.created_at.localeCompare(a.created_at))
    const open = data.steps.filter((s) => s.status !== 'done')
    return {
      active,
      finished,
      nActiveSteps: open.filter((s) => s.status === 'active').length,
      nLate: open.filter(isLate).length,
      problems: open.filter((s) => s.status === 'problem'),
    }
  }, [data])

  if (!data || !view) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Projeler</h1>
        </div>
        {error ? <ErrorNote>{error}</ErrorNote> : <Spinner />}
      </div>
    )
  }

  async function resolve(step: Step) {
    setBusyStep(step.id)
    setActionError(await change(() => stepAction(step.id, 'start')))
    setBusyStep(null)
  }

  const list = showFinished ? view.finished : view.active

  return (
    <div className="page">
      <div className="page-head">
        <h1>Projeler</h1>
        {manages ? (
          <button type="button" className="btn btn-primary press" onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} />
            Yeni proje
          </button>
        ) : null}
      </div>

      <ErrorNote>{error ?? actionError}</ErrorNote>

      {manages ? (
        <div className="tiles">
          <Tile label="Aktif proje" value={view.active.length} />
          <Tile label="Devam eden iş" value={view.nActiveSteps} tone="active" />
          <Tile label="Geciken iş" value={view.nLate} tone="late" />
          <Tile label="Açık sorun" value={view.problems.length} tone="problem" />
        </div>
      ) : null}

      {view.problems.length > 0 ? (
        <section className="stack" aria-label="Bildirilen sorunlar">
          <h3>Atölyeden bildirilen sorunlar</h3>
          <div className="card rows problems">
            {view.problems.map((s) => {
              const project = data.project(s.project_id)
              const who = data.assigneesOf(s.id).map((p) => p.full_name).join(', ')
              return (
                <div key={s.id} className="problem">
                  <span className="problem-icon">
                    <Icon name="alert" size={20} />
                  </span>
                  <Link to={`/projeler/${s.project_id}`} className="problem-text">
                    <strong>
                      {s.problem_reason}
                      {s.problem_note ? `: ${s.problem_note}` : ''}
                    </strong>
                    <span className="sub">{[project?.code, project?.name, s.name, who].filter(Boolean).join(' · ')}</span>
                  </Link>
                  {manages ? (
                    <button type="button" className="btn btn-tint press" disabled={busyStep === s.id} onClick={() => void resolve(s)}>
                      Çözüldü
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      <div className="segmented narrow" role="group" aria-label="Proje durumu">
        <button type="button" className="press" aria-pressed={!showFinished} onClick={() => setShowFinished(false)}>
          Aktif ({view.active.length})
        </button>
        <button type="button" className="press" aria-pressed={showFinished} onClick={() => setShowFinished(true)}>
          Biten ({view.finished.length})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card empty">
          {showFinished
            ? 'Henüz biten proje yok.'
            : manages
              ? 'Aktif proje yok. "Yeni proje" ile başlayın.'
              : 'Şu anda aktif proje yok.'}
        </div>
      ) : (
        <div className="project-grid">
          {list.map((p) => (
            <ProjectCard key={p.id} project={p} data={data} />
          ))}
        </div>
      )}

      {creating ? <NewProjectDialog data={data} onClose={() => setCreating(false)} /> : null}
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'active' | 'late' | 'problem' }) {
  return (
    <div className="card tile">
      <div className="tile-label">{label}</div>
      <div className={`tile-value${tone && value > 0 ? ` tone-${tone}` : ''}`}>{value}</div>
    </div>
  )
}

function ProjectCard({ project, data }: { project: Project; data: Workshop }) {
  const steps = data.stepsOf(project.id)
  const late = steps.some(isLate)
  const problems = steps.filter((s) => s.status === 'problem').length
  return (
    <Link to={`/projeler/${project.id}`} className="card project-card press">
      <span className="project-meta">
        <span className="mono">{project.code ?? ''}</span>
        <span className="sub">{project.due_date ? `Teslim: ${formatDay(project.due_date)}` : 'Teslim tarihi yok'}</span>
      </span>
      <span className="project-name">{project.name}</span>
      <ProgressStrip steps={steps} />
      <span className="project-meta">
        <span className="sub">{progressText(steps)}</span>
        <span className="flags">
          {problems > 0 ? <span className="badge status-problem">{problems} sorun</span> : null}
          {late ? <span className="badge status-late">Gecikme var</span> : null}
        </span>
      </span>
    </Link>
  )
}

function NewProjectDialog({ data, onClose }: { data: Workshop; onClose: () => void }) {
  const navigate = useNavigate()
  const { reload } = useWorkshop()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [due, setDue] = useState('')
  const [typeId, setTypeId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview = typeId ? data.typeStepsOf(typeId) : []

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const { data: id, error } = await supabase.rpc('create_project', {
      p_name: name,
      p_code: code || null,
      p_due_date: due || null,
      p_type_id: typeId || null,
    })
    if (error) {
      setError(friendly(error))
      setBusy(false)
      return
    }
    await reload()
    navigate(`/projeler/${id}`)
  }

  return (
    <Dialog title="Yeni proje" onClose={onClose}>
      <form onSubmit={submit} className="dialog-body">
        <Field label="Proje adı">
          {(id) => (
            <input
              id={id}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örnek: 500 m³/gün RO Ünitesi"
              maxLength={120}
              autoComplete="off"
              required
            />
          )}
        </Field>
        <div className="pair">
          <Field label="Proje kodu">
            {(id) => (
              <input
                id={id}
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="İsteğe bağlı"
                maxLength={40}
                autoComplete="off"
                autoCapitalize="characters"
              />
            )}
          </Field>
          <Field label="Teslim tarihi">
            {(id) => <input id={id} className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
          </Field>
        </div>
        <Field label="Proje türü" hint="Türü seçince adımları otomatik eklenir. Sonra adım ekleyip kaldırabilirsiniz.">
          {(id) => (
            <select id={id} className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Boş proje (adımsız)</option>
              {data.projectTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {typeId ? (
          <div>
            <div className="field-label">Eklenecek adımlar</div>
            {preview.length ? (
              <ol className="card preview">
                {preview.map((s) => (
                  <li key={s.id}>{s.name}</li>
                ))}
              </ol>
            ) : (
              <div className="sub">Bu türde hazır adım yok.</div>
            )}
          </div>
        ) : null}
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="btn btn-primary btn-big press" disabled={busy}>
          {busy ? 'Oluşturuluyor…' : 'Projeyi oluştur'}
        </button>
      </form>
    </Dialog>
  )
}
