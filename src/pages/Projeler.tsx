import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Timeline } from '../components/Timeline'
import { Dialog, ErrorNote, Field, Icon, Spinner } from '../components/ui'
import { useProfile } from '../lib/auth'
import { friendly } from '../lib/errors'
import { canManage, supabase } from '../lib/supabase'
import {
  formatDay,
  formatMoment,
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

type Layout = 'list' | 'timeline'
const LAYOUT_KEY = 'felix.projeler.gorunum'

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'timeline' ? 'timeline' : 'list'
  } catch {
    return 'list'
  }
}

export function Projeler() {
  const me = useProfile()
  const manages = canManage(me.panel)
  const { data, error, change } = useWorkshop()
  const [showFinished, setShowFinished] = useState(false)
  const [layout, setLayout] = useState<Layout>(readLayout)
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
      reviews: open
        .filter((s) => s.status === 'review')
        .sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '')),
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

  async function act(step: Step, action: 'start' | 'approve') {
    setBusyStep(step.id)
    setActionError(await change(() => stepAction(step.id, action)))
    setBusyStep(null)
  }

  function pickLayout(next: Layout) {
    setLayout(next)
    try {
      localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      // Not being able to remember the choice is harmless.
    }
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
          <Tile label="Onay bekleyen" value={view.reviews.length} tone="review" />
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
                    <button type="button" className="btn btn-tint press" disabled={busyStep === s.id} onClick={() => void act(s, 'start')}>
                      Çözüldü
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {manages && view.reviews.length > 0 ? (
        <section className="stack" aria-label="Onay bekleyen işler">
          <h3>Onay bekleyen işler</h3>
          <div className="card rows problems">
            {view.reviews.map((s) => {
              const project = data.project(s.project_id)
              const who = data.assigneesOf(s.id).map((p) => p.full_name).join(', ')
              return (
                <div key={s.id} className="problem">
                  <span className="problem-icon review-icon">
                    <Icon name="check" size={20} />
                  </span>
                  <Link to={`/projeler/${s.project_id}`} className="problem-text">
                    <strong>{s.name}</strong>
                    <span className="sub">
                      {[project?.code, project?.name, who, s.submitted_at ? `Teslim: ${formatMoment(s.submitted_at)}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </Link>
                  <Link to={`/projeler/${s.project_id}`} className="btn btn-quiet press">
                    İncele
                  </Link>
                  <button type="button" className="btn btn-go press" disabled={busyStep === s.id} onClick={() => void act(s, 'approve')}>
                    Onayla
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      <div className="view-bar">
        <div className="segmented narrow" role="group" aria-label="Proje durumu">
          <button type="button" className="press" aria-pressed={!showFinished} onClick={() => setShowFinished(false)}>
            Aktif ({view.active.length})
          </button>
          <button type="button" className="press" aria-pressed={showFinished} onClick={() => setShowFinished(true)}>
            Biten ({view.finished.length})
          </button>
        </div>
        <div className="segmented narrow" role="group" aria-label="Görünüm">
          <button type="button" className="press" aria-pressed={layout === 'list'} onClick={() => pickLayout('list')}>
            Liste
          </button>
          <button type="button" className="press" aria-pressed={layout === 'timeline'} onClick={() => pickLayout('timeline')}>
            Takvim
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card empty">
          {showFinished
            ? 'Henüz biten proje yok.'
            : manages
              ? 'Aktif proje yok. "Yeni proje" ile başlayın.'
              : 'Şu anda aktif proje yok.'}
        </div>
      ) : layout === 'timeline' ? (
        <Timeline projects={list} data={data} />
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

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'active' | 'late' | 'problem' | 'review' }) {
  return (
    <div className="card tile">
      <div className="tile-label">{label}</div>
      <div className={`tile-value${tone && value > 0 ? ` tone-${tone}` : ''}`}>{value}</div>
    </div>
  )
}

function ProjectCard({ project, data }: { project: Project; data: Workshop }) {
  const steps = data.stepsOf(project.id)
  const company = data.company(project.company_id)
  const late = steps.some(isLate)
  const problems = steps.filter((s) => s.status === 'problem').length
  return (
    <Link to={`/projeler/${project.id}`} className="card project-card press">
      <span className="project-meta">
        <span className="mono">{project.code ?? ''}</span>
        <span className="sub">{project.due_date ? `Teslim: ${formatDay(project.due_date)}` : 'Teslim tarihi yok'}</span>
      </span>
      <span className="project-name">{project.name}</span>
      {company ? <span className="sub">{company.name}</span> : null}
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

const NEW_COMPANY = '__new__'

function NewProjectDialog({ data, onClose }: { data: Workshop; onClose: () => void }) {
  const navigate = useNavigate()
  const { reload } = useWorkshop()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [due, setDue] = useState('')
  const [typeId, setTypeId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Which of the type's steps should wait for a manager's approval in this project.
  const [approval, setApproval] = useState<ReadonlySet<string>>(new Set())

  const preview = typeId ? data.typeStepsOf(typeId) : []
  const chosen = preview.filter((s) => approval.has(s.id)).map((s) => s.id)

  function pickType(next: string) {
    setTypeId(next)
    setApproval(new Set()) // the choices belong to the previous type's steps
  }

  function toggleApproval(id: string) {
    setApproval((now) => {
      const next = new Set(now)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    let company: string | null = companyId || null
    if (companyId === NEW_COMPANY) {
      // A firm typed here is added to Firmalar by name; its details can be filled in there later.
      const made = await supabase.rpc('save_company', { p_name: newCompany })
      if (made.error) {
        setError(friendly(made.error))
        setBusy(false)
        return
      }
      company = made.data as string
      setCompanyId(company) // if the project itself fails next, do not create the firm twice
      await reload()
    }
    const { data: id, error } = await supabase.rpc('create_project', {
      p_name: name,
      p_code: code || null,
      p_due_date: due || null,
      p_type_id: typeId || null,
      p_company_id: company,
      // Left out when nothing is chosen, so a database that has not had the
      // 0005 update yet can still create ordinary projects.
      ...(chosen.length ? { p_approval: chosen } : {}),
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
        <Field label="Firma" hint="Siparişi veren firma.">
          {(id) => (
            <select id={id} className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Seçilmedi</option>
              {data.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_COMPANY}>+ Yeni firma ekle…</option>
            </select>
          )}
        </Field>
        {companyId === NEW_COMPANY ? (
          <Field label="Yeni firma adı" hint="Firma listeye eklenir. İletişim bilgilerini sonra Firmalar sayfasından girebilirsiniz.">
            {(id) => (
              <input
                id={id}
                className="input"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                maxLength={120}
                autoComplete="off"
                required
              />
            )}
          </Field>
        ) : null}
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
            <select id={id} className="input" value={typeId} onChange={(e) => pickType(e.target.value)}>
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
              <>
                <div className="card rows approval-list" role="group" aria-label="Eklenecek adımlar">
                  {preview.map((s, i) => (
                    <label key={s.id} className="approval-row">
                      <span className="mono no">{i + 1}</span>
                      <span className="approval-name">{s.name}</span>
                      <span className="approval-label">Onay gerekir</span>
                      <input
                        type="checkbox"
                        role="switch"
                        className="switch"
                        aria-label={`${s.name}: onay gerekir`}
                        checked={approval.has(s.id)}
                        onChange={() => toggleApproval(s.id)}
                      />
                    </label>
                  ))}
                </div>
                <div className="hint">
                  "Onay gerekir" açık olan adımlarda, işçi işi bitirdiğinde adım bir yönetici onaylayana kadar bitmiş
                  sayılmaz. Sonradan adımın kendi ekranından değiştirebilirsiniz.
                </div>
              </>
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
