import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FileSection } from '../components/Dosyalar'
import { StatusBadge, StepDialog } from '../components/StepDialog'
import { Dialog, ErrorNote, Field, Icon, Spinner } from '../components/ui'
import { useProfile } from '../lib/auth'
import { t } from '../lib/i18n'
import { canManage, supabase } from '../lib/supabase'
import { canManageFiles, formatDay, isOpen, useWorkshop, type Project, type Workshop } from '../lib/workshop'
import { ProgressStrip, progressText } from './Projeler'

export function ProjeDetay() {
  const { id = '' } = useParams()
  const me = useProfile()
  const manages = canManage(me.panel)
  const { data, error } = useWorkshop()
  const [openStep, setOpenStep] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [params, setParams] = useSearchParams()
  const linked = params.get('adim')

  // An alert opens its step: /projeler/<id>?adim=<step>.
  useEffect(() => {
    if (!linked) return
    setOpenStep(linked)
    setParams({}, { replace: true })
  }, [linked, setParams])

  const back = (
    <Link to="/projeler" className="back press">
      <Icon name="back" size={20} />
      {t('Projeler')}
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
        <div className="card empty">{t('Bu proje bulunamadı. Silinmiş olabilir.')}</div>
      </div>
    )
  }

  const steps = data.stepsOf(project.id)
  const company = data.company(project.company_id)
  const contact = company ? data.detailsOf(company.id) : undefined
  const hasContact = !!contact && [contact.contact_name, contact.phone, contact.email, contact.address, contact.notes].some(Boolean)
  const files = data.dosyalarOfProject(project.id)
  const fileManager = canManageFiles(data, me)
  const anaFiles = files.filter((f) => f.ana)

  return (
    <div className="page">
      {back}
      <div className="page-head">
        <div>
          <div className="mono">
            {[project.code, project.due_date ? t('Teslim {date}', { date: formatDay(project.due_date) }) : t('Teslim tarihi yok')]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <h1>{project.name}</h1>
          {company ? <div className="sub company-line">{company.name}</div> : null}
        </div>
        {manages ? (
          <div className="head-actions">
            <button type="button" className="btn btn-quiet press" onClick={() => setEditing(true)}>
              {t('Düzenle')}
            </button>
            <button type="button" className="btn btn-primary press" onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} />
              {t('Adım ekle')}
            </button>
          </div>
        ) : null}
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="progress-line">
        <ProgressStrip steps={steps} />
        <span className="sub">{progressText(steps)}</span>
      </div>

      {manages && company && contact && hasContact ? (
        <section className="card rows facts customer" aria-label={t('Firma')}>
          {contact.contact_name ? (
            <div className="fact">
              <span>{t('Yetkili kişi')}</span>
              <span className="value">{contact.contact_name}</span>
            </div>
          ) : null}
          {contact.phone ? (
            <div className="fact">
              <span>{t('Telefon')}</span>
              <a className="value" href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}>
                {contact.phone}
              </a>
            </div>
          ) : null}
          {contact.email ? (
            <div className="fact">
              <span>{t('E-posta')}</span>
              <a className="value" href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            </div>
          ) : null}
          {contact.address ? (
            <div className="fact">
              <span>{t('Adres')}</span>
              <span className="value">{contact.address}</span>
            </div>
          ) : null}
          {contact.notes ? (
            <div className="fact">
              <span>{t('Not')}</span>
              <span className="value">{contact.notes}</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {steps.length === 0 ? (
        <div className="card empty">
          {manages ? t('Bu projede henüz adım yok. "Adım ekle" ile başlayın.') : t('Bu projede henüz adım yok.')}
        </div>
      ) : (
        <section className="card steps rows" aria-label={t('Adımlar')}>
          {steps.map((s, i) => {
            const who = data.assigneesOf(s.id)
            const openTalep = data.taleplerOfStep(s.id).find(isOpen)
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
                    <span className="sub">{t('Atanmadı')}</span>
                  )}
                </span>
                <span className="step-due sub">{formatDay(s.due_date)}</span>
                <span className="step-status">
                  {openTalep ? (
                    <span className="badge status-problem talep-mark">
                      {openTalep.kind === 'malzeme' ? t('Malzeme talebi') : t('Çizim talebi')}
                    </span>
                  ) : null}
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

      {data.ready ? (
        <div className="project-files">
          <FileSection
            title={t('Ana doküman')}
            heading
            projectId={project.id}
            ana
            files={anaFiles}
            canAdd={fileManager}
            addLabel={anaFiles.some((f) => !f.eski_at) ? t('Yenisini yükle') : t('Yükle')}
            empty={t('Henüz ana doküman yok.')}
          />
          <FileSection
            title={t('Proje dosyaları')}
            heading
            projectId={project.id}
            files={files.filter((f) => !f.ana)}
            canAdd={fileManager}
            addLabel={t('Dosya ekle')}
            empty={t('Sertifika gibi başka dosyalar burada durur.')}
          />
        </div>
      ) : null}

      {openStep ? <StepDialog stepId={openStep} onClose={() => setOpenStep(null)} /> : null}
      {adding ? <AddStepDialog project={project} data={data} onClose={() => setAdding(false)} /> : null}
      {editing ? <EditProjectDialog project={project} data={data} onClose={() => setEditing(false)} /> : null}
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
    <Dialog title={t('Adım ekle')} subtitle={project.name} onClose={onClose} focusFirst={false}>
      <div>
        <div className="field-label">{t('Adım türleri')}</div>
        <div className="card rows name-list">
          {data.stepTypes.length === 0 ? <div className="empty">{t('Henüz adım türü yok.')}</div> : null}
          {data.stepTypes.map((st) => {
            const count = inProject.filter((s) => s.name === st.name).length
            return (
              <div key={st.id} className="name-row">
                <span className="label-text">{st.name}</span>
                <span className="count">{count ? t('Projede {n} adet', { n: count }) : ''}</span>
                <button type="button" className="btn btn-tint press" disabled={busy} onClick={() => void add(st.id)}>
                  {t('Ekle')}
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <form onSubmit={create} className="field">
        <label htmlFor="yeni-adim-turu">{t('Listede yoksa yeni adım türü oluştur')}</label>
        <div className="inline-form">
          <input
            id="yeni-adim-turu"
            className="input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('Örnek: Membran yükleme')}
            maxLength={80}
          />
          <button type="submit" className="btn btn-dark press" disabled={busy || !newName.trim()}>
            {t('Oluştur ve ekle')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function EditProjectDialog({ project, data, onClose }: { project: Project; data: Workshop; onClose: () => void }) {
  const navigate = useNavigate()
  const { change } = useWorkshop()
  const [name, setName] = useState(project.name)
  const [code, setCode] = useState(project.code ?? '')
  const [due, setDue] = useState(project.due_date ?? '')
  const [companyId, setCompanyId] = useState(project.company_id ?? '')
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
          .update({ name: name.trim(), code: code.trim() || null, due_date: due || null, company_id: companyId || null })
          .eq('id', project.id),
      onClose,
    )
  }

  return (
    <Dialog title={t('Projeyi düzenle')} onClose={onClose}>
      <form onSubmit={save} className="dialog-body">
        <Field label={t('Proje adı')}>
          {(id) => (
            <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          )}
        </Field>
        <Field label={t('Firma')}>
          {(id) => (
            <select id={id} className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">{t('Seçilmedi')}</option>
              {data.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="pair">
          <Field label={t('Proje kodu')}>
            {(id) => (
              <input id={id} className="input" value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} />
            )}
          </Field>
          <Field label={t('Teslim tarihi')}>
            {(id) => <input id={id} className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
          </Field>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="btn btn-primary btn-big press" disabled={busy}>
          {busy ? t('Kaydediliyor…') : t('Kaydet')}
        </button>
      </form>
      {confirmDelete ? (
        <div className="dialog-foot">
          <div className="note note-error">
            {t('Proje, bütün adımları ve geçmişiyle birlikte silinecek. Geri alınamaz.')}
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
            {t('Evet, projeyi sil')}
          </button>
          <button type="button" className="btn btn-quiet btn-big press" onClick={() => setConfirmDelete(false)}>
            {t('Vazgeç')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-danger btn-big press" onClick={() => setConfirmDelete(true)}>
          {t('Projeyi sil')}
        </button>
      )}
    </Dialog>
  )
}
