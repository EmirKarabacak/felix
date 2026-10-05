import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { StatusBadge, StepDialog } from '../components/StepDialog'
import { Dialog, ErrorNote, Field, Icon, Spinner } from '../components/ui'
import { useProfile } from '../lib/auth'
import { canManage, supabase } from '../lib/supabase'
import { formatDay, useWorkshop, type Project, type Workshop } from '../lib/workshop'
import { ProgressStrip, progressText } from './Projeler'

export function ProjeDetay() {
  const { id = '' } = useParams()
  const me = useProfile()
  const manages = canManage(me.panel)
  const { data, error } = useWorkshop()
  const [openStep, setOpenStep] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)

  const back = (
    <Link to="/projeler" className="back press">
      <Icon name="back" size={20} />
      Projeler
    </Link>
  )

  if (!data) {
    return (
      <div className="page">
        {back}
        {error ? <ErrorNote>{error}</ErrorNote> : <Spinner />}
      </div>
    )
  }

  const project = data.project(id)
  if (!project) {
    return (
      <div className="page">
        {back}
        <div className="card empty">Bu proje bulunamadı. Silinmiş olabilir.</div>
      </div>
    )
  }

  const steps = data.stepsOf(project.id)

  return (
    <div className="page">
      {back}
      <div className="page-head">
        <div>
          <div className="mono">
            {[project.code, project.due_date ? `Teslim ${formatDay(project.due_date)}` : 'Teslim tarihi yok']
              .filter(Boolean)
              .join(' · ')}
          </div>
          <h1>{project.name}</h1>
        </div>
        {manages ? (
          <div className="head-actions">
            <button type="button" className="btn btn-quiet press" onClick={() => setEditing(true)}>
              Düzenle
            </button>
            <button type="button" className="btn btn-primary press" onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} />
              Adım ekle
            </button>
          </div>
        ) : null}
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="progress-line">
        <ProgressStrip steps={steps} />
        <span className="sub">{progressText(steps)}</span>
      </div>

      {steps.length === 0 ? (
        <div className="card empty">
          {manages ? 'Bu projede henüz adım yok. "Adım ekle" ile başlayın.' : 'Bu projede henüz adım yok.'}
        </div>
      ) : (
        <section className="card steps rows" aria-label="Adımlar">
          {steps.map((s, i) => {
            const who = data.assigneesOf(s.id)
            return (
              <button key={s.id} type="button" className="step press" onClick={() => setOpenStep(s.id)}>
                <span className="mono no">{i + 1}</span>
                <span className="step-name">{s.name}</span>
                <span className="step-who">
                  {who.length ? (
                    who.map((p) => (
                      <span key={p.id} className="chip">
                        {p.full_name}
                      </span>
                    ))
                  ) : (
                    <span className="sub">Atanmadı</span>
                  )}
                </span>
                <span className="step-due sub">{formatDay(s.due_date)}</span>
                <span className="step-status">
                  <StatusBadge step={s} />
                </span>
                <span className="go">
                  <Icon name="chevron" size={18} />
                </span>
              </button>
            )
          })}
        </section>
      )}

      {openStep ? <StepDialog stepId={openStep} onClose={() => setOpenStep(null)} /> : null}
      {adding ? <AddStepDialog project={project} data={data} onClose={() => setAdding(false)} /> : null}
      {editing ? <EditProjectDialog project={project} onClose={() => setEditing(false)} /> : null}
    </div>
  )
}

function AddStepDialog({ project, data, onClose }: { project: Project; data: Workshop; onClose: () => void }) {
  const { change } = useWorkshop()
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inProject = data.stepsOf(project.id)

  async function run(work: () => PromiseLike<{ error: unknown }>, after?: () => void) {
    if (busy) return
    setBusy(true)
    setError(null)
    const failed = await change(work)
    setBusy(false)
    if (failed) setError(failed)
    else after?.()
  }

  const add = (stepTypeId: string) =>
    run(() => supabase.rpc('add_step', { p_project_id: project.id, p_step_type_id: stepTypeId }))

  function create(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    // A new type goes into the list and straight into this project.
    void run(async () => {
      const made = await supabase.from('step_types').insert({ name }).select('id').single()
      if (made.error) return made
      return supabase.rpc('add_step', { p_project_id: project.id, p_step_type_id: made.data.id })
    }, () => setNewName(''))
  }

  return (
    <Dialog title="Adım ekle" subtitle={project.name} onClose={onClose} focusFirst={false}>
      <div>
        <div className="field-label">Adım türleri</div>
        <div className="card rows name-list">
          {data.stepTypes.length === 0 ? <div className="empty">Henüz adım türü yok.</div> : null}
          {data.stepTypes.map((t) => {
            const count = inProject.filter((s) => s.name === t.name).length
            return (
              <div key={t.id} className="name-row">
                <span className="label-text">{t.name}</span>
                <span className="count">{count ? `Projede ${count} adet` : ''}</span>
                <button type="button" className="btn btn-tint press" disabled={busy} onClick={() => void add(t.id)}>
                  Ekle
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <form onSubmit={create} className="field">
        <label htmlFor="yeni-adim-turu">Listede yoksa yeni adım türü oluştur</label>
        <div className="inline-form">
          <input
            id="yeni-adim-turu"
            className="input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Örnek: Membran yükleme"
            maxLength={80}
          />
          <button type="submit" className="btn btn-dark press" disabled={busy || !newName.trim()}>
            Oluştur ve ekle
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function EditProjectDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const navigate = useNavigate()
  const { change } = useWorkshop()
  const [name, setName] = useState(project.name)
  const [code, setCode] = useState(project.code ?? '')
  const [due, setDue] = useState(project.due_date ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(work: () => PromiseLike<{ error: unknown }>, after: () => void) {
    if (busy) return
    setBusy(true)
    setError(null)
    const failed = await change(work)
    if (failed) {
      setError(failed)
      setBusy(false)
    } else after()
  }

  function save(e: FormEvent) {
    e.preventDefault()
    void run(
      () =>
        supabase
          .from('projects')
          .update({ name: name.trim(), code: code.trim() || null, due_date: due || null })
          .eq('id', project.id),
      onClose,
    )
  }

  return (
    <Dialog title="Projeyi düzenle" onClose={onClose}>
      <form onSubmit={save} className="dialog-body">
        <Field label="Proje adı">
          {(id) => (
            <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          )}
        </Field>
        <div className="pair">
          <Field label="Proje kodu">
            {(id) => (
              <input id={id} className="input" value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} />
            )}
          </Field>
          <Field label="Teslim tarihi">
            {(id) => <input id={id} className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
          </Field>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="btn btn-primary btn-big press" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </form>
      {confirmDelete ? (
        <div className="dialog-foot">
          <div className="note note-error">
            Proje, bütün adımları ve geçmişiyle birlikte silinecek. Geri alınamaz.
          </div>
          <button
            type="button"
            className="btn btn-danger btn-big press"
            disabled={busy}
            onClick={() =>
              void run(
                () => supabase.from('projects').delete().eq('id', project.id),
                () => navigate('/projeler', { replace: true }),
              )
            }
          >
            Evet, projeyi sil
          </button>
          <button type="button" className="btn btn-quiet btn-big press" onClick={() => setConfirmDelete(false)}>
            Vazgeç
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-danger btn-big press" onClick={() => setConfirmDelete(true)}>
          Projeyi sil
        </button>
      )}
    </Dialog>
  )
}
