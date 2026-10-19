import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TalepList } from '../components/Talepler'
import { Timeline } from '../components/Timeline'
import { Dialog, ErrorNote, Field, Icon, Spinner } from '../components/ui'
import { useProfile } from '../lib/auth'
import { friendly } from '../lib/errors'
import { t } from '../lib/i18n'
import { canManage, supabase } from '../lib/supabase'
import {
  canHandleTalep,
  formatDay,
  formatMoment,
  isOpen,
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
  if (steps.length === 0) return t('Henüz adım yok')
  return t('{done} / {total} adım bitti', { done: steps.filter((s) => s.status === 'done').length, total: steps.length })
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
    // Requests go to whoever handles them: the managers, Satın alma, Tasarım.
    const talepler = data.talepler.filter((tl) => isOpen(tl) && canHandleTalep(data, me, tl))
    const withTalep = new Set(data.talepler.filter(isOpen).map((tl) => tl.step_id))
    return {
      talepler: talepler.sort((a, b) => a.created_at.localeCompare(b.created_at)),
      // A problem waiting on a request is shown with the request instead.
      shownProblems: open.filter((s) => s.status === 'problem' && !withTalep.has(s.id)),
      active,
      finished,
      nActiveSteps: open.filter((s) => s.status === 'active').length,
      nLate: open.filter(isLate).length,
      problems: open.filter((s) => s.status === 'problem'),
      reviews: open
        .filter((s) => s.status === 'review')
        .sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '')),
    }
  }, [data, me])

  if (!data || !view) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>{t('Projeler')}</h1>
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
        <h1>{t('Projeler')}</h1>
        {manages ? (
          <button type="button" className="btn btn-primary press" onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} />
            {t('Yeni proje')}
          </button>
        ) : null}
      </div>

      <ErrorNote>{error ?? actionError}</ErrorNote>

      {manages ? (
        <div className="tiles">
          <Tile label={t('Aktif proje')} value={view.active.length} />
          <Tile label={t('Devam eden iş')} value={view.nActiveSteps} tone="active" />
          <Tile label={t('Onay bekleyen')} value={view.reviews.length} tone="review" />
          <Tile label={t('Geciken iş')} value={view.nLate} tone="late" />
          <Tile label={t('Açık sorun')} value={view.problems.length} tone="problem" />
        </div>
      ) : null}

      {view.talepler.length > 0 ? (
        <section className="stack" aria-label={t('Açık talepler')}>
          <h3>{t('Açık talepler')}</h3>
          <TalepList talepler={view.talepler} where label={t('Açık talepler')} />
        </section>
      ) : null}

      {view.shownProblems.length > 0 ? (
        <section className="stack" aria-label={t('Bildirilen sorunlar')}>
          <h3>{t('Atölyeden bildirilen sorunlar')}</h3>
          <div className="card rows problems">
            {view.shownProblems.map((s) => {
              const project = data.project(s.project_id)
              const who = data.assigneesOf(s.id).map((p) => p.full_name).join(', ')
              return (
                <div key={s.id} className="problem">
                  <span className="problem-icon">
                    <Icon name="alert" size={20} />
                  </span>
                  <Link to={`/projeler/${s.project_id}`} className="problem-text">
                    <strong>
                      {s.problem_reason ? t(s.problem_reason) : null}
                      {s.problem_note ? `: ${s.problem_note}` : ''}
                    </strong>
                    <span className="sub">{[project?.code, project?.name, s.name, who].filter(Boolean).join(' · ')}</span>
                  </Link>
                  {manages ? (
                    <button type="button" className="btn btn-tint press" disabled={busyStep === s.id} onClick={() => void act(s, 'start')}>
                      {t('Çözüldü')}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {manages && view.reviews.length > 0 ? (
        <section className="stack" aria-label={t('Onay bekleyen işler')}>
          <h3>{t('Onay bekleyen işler')}</h3>
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
                      {[project?.code, project?.name, who, s.submitted_at ? t('Teslim edildi: {time}', { time: formatMoment(s.submitted_at) }) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </Link>
                  <Link to={`/projeler/${s.project_id}`} className="btn btn-quiet press">
                    {t('İncele')}
                  </Link>
                  <button type="button" className="btn btn-go press" disabled={busyStep === s.id} onClick={() => void act(s, 'approve')}>
                    {t('Onayla')}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      <div className="view-bar">
        <div className="segmented narrow" role="group" aria-label={t('Proje durumu')}>
          <button type="button" className="press" aria-pressed={!showFinished} onClick={() => setShowFinished(false)}>
            {t('Aktif ({n})', { n: view.active.length })}
          </button>
          <button type="button" className="press" aria-pressed={showFinished} onClick={() => setShowFinished(true)}>
            {t('Biten ({n})', { n: view.finished.length })}
          </button>
        </div>
        <div className="segmented narrow" role="group" aria-label={t('Görünüm')}>
          <button type="button" className="press" aria-pressed={layout === 'list'} onClick={() => pickLayout('list')}>
            {t('Liste')}
          </button>
          <button type="button" className="press" aria-pressed={layout === 'timeline'} onClick={() => pickLayout('timeline')}>
            {t('Takvim')}
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card empty">
          {showFinished
            ? t('Henüz biten proje yok.')
            : manages
              ? t('Aktif proje yok. "Yeni proje" ile başlayın.')
              : t('Şu anda aktif proje yok.')}
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
        <span className="sub">{project.due_date ? t('Teslim: {date}', { date: formatDay(project.due_date) }) : t('Teslim tarihi yok')}</span>
      </span>
      <span className="project-name">{project.name}</span>
      {company ? <span className="sub">{company.name}</span> : null}
      <ProgressStrip steps={steps} />
      <span className="project-meta">
        <span className="sub">{progressText(steps)}</span>
        <span className="flags">
          {problems > 0 ? <span className="badge status-problem">{t('{n} sorun', { n: problems })}</span> : null}
          {late ? <span className="badge status-late">{t('Gecikme var')}</span> : null}
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

  const preview = typeId ? data.typeStepsOf(typeId) : []

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
    <Dialog title={t('Yeni proje')} onClose={onClose}>
      <form onSubmit={submit} className="dialog-body">
        <Field label={t('Proje adı')}>
          {(id) => (
            <input
              id={id}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('Örnek: 500 m³/gün RO Ünitesi')}
              maxLength={120}
              autoComplete="off"
              required
            />
          )}
        </Field>
        <Field label={t('Firma')} hint={t('Siparişi veren firma.')}>
          {(id) => (
            <select id={id} className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">{t('Seçilmedi')}</option>
              {data.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_COMPANY}>{t('+ Yeni firma ekle…')}</option>
            </select>
          )}
        </Field>
        {companyId === NEW_COMPANY ? (
          <Field label={t('Yeni firma adı')} hint={t('Firma listeye eklenir. İletişim bilgilerini sonra Firmalar sayfasından girebilirsiniz.')}>
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
          <Field label={t('Proje kodu')}>
            {(id) => (
              <input
                id={id}
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('İsteğe bağlı')}
                maxLength={40}
                autoComplete="off"
                autoCapitalize="characters"
              />
            )}
          </Field>
          <Field label={t('Teslim tarihi')}>
            {(id) => <input id={id} className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
          </Field>
        </div>
        <Field label={t('Proje türü')} hint={t('Türü seçince adımları otomatik eklenir. Sonra adım ekleyip kaldırabilirsiniz.')}>
          {(id) => (
            <select id={id} className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">{t('Boş proje (adımsız)')}</option>
              {data.projectTypes.map((ty) => (
                <option key={ty.id} value={ty.id}>
                  {ty.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {typeId ? (
          <div>
            <div className="field-label">{t('Eklenecek adımlar')}</div>
            {preview.length ? (
              <>
                <div className="card rows approval-list" role="group" aria-label={t('Eklenecek adımlar')}>
                  {preview.map((s, i) => (
                    <div key={s.id} className="approval-row">
                      <span className="mono no">{i + 1}</span>
                      <span className="approval-name">{s.name}</span>
                    </div>
                  ))}
                </div>
                <div className="hint">{t('Adımları proje açıldıktan sonra ekleyip çıkarabilirsiniz.')}</div>
              </>
            ) : (
              <div className="sub">{t('Bu türde hazır adım yok.')}</div>
            )}
          </div>
        ) : null}
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="btn btn-primary btn-big press" disabled={busy}>
          {busy ? t('Oluşturuluyor…') : t('Projeyi oluştur')}
        </button>
      </form>
    </Dialog>
  )
}
