import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Dialog, ErrorNote, Field, Icon, Spinner } from '../components/ui'
import { supabase } from '../lib/supabase'
import { useWorkshop, type Company, type Workshop } from '../lib/workshop'

/** Customer companies: who ordered a project, and who to talk to there. */
export function Firmalar() {
  const { data, error } = useWorkshop()
  const [editing, setEditing] = useState<Company | 'new' | null>(null)
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLocaleLowerCase('tr')
    if (!q) return data.companies
    return data.companies.filter((c) => {
      const d = data.detailsOf(c.id)
      return [c.name, d?.contact_name, d?.email, d?.phone].some((v) => v?.toLocaleLowerCase('tr').includes(q))
    })
  }, [data, query])

  if (!data) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Firmalar</h1>
        </div>
        {error ? <ErrorNote>{error}</ErrorNote> : <Spinner />}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Firmalar</h1>
          <div className="sub">Sipariş veren firmalar. İletişim bilgilerini yalnızca CEO ve yöneticiler görür.</div>
        </div>
        <button type="button" className="btn btn-primary press" onClick={() => setEditing('new')}>
          <Icon name="plus" size={18} />
          Yeni firma
        </button>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {data.companies.length > 5 ? (
        <input
          className="input search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Firma veya kişi ara"
          aria-label="Firma veya kişi ara"
        />
      ) : null}

      {data.companies.length === 0 ? (
        <div className="card empty">Henüz firma yok. "Yeni firma" ile ilk firmayı ekleyin.</div>
      ) : shown.length === 0 ? (
        <div className="card empty">Aramanıza uyan firma yok.</div>
      ) : (
        <section className="card companies rows" aria-label="Firmalar">
          {shown.map((c) => {
            const d = data.detailsOf(c.id)
            const count = data.projectsOf(c.id).length
            return (
              <button key={c.id} type="button" className="company press" onClick={() => setEditing(c)}>
                <span className="company-name">{c.name}</span>
                <span className="company-contact sub">
                  {[d?.contact_name, d?.phone, d?.email].filter(Boolean).join(' · ') || 'İletişim bilgisi yok'}
                </span>
                <span className="company-count sub">{count ? `${count} proje` : ''}</span>
                <span className="go">
                  <Icon name="chevron" size={18} />
                </span>
              </button>
            )
          })}
        </section>
      )}

      {editing ? (
        <CompanyDialog company={editing === 'new' ? null : editing} data={data} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  )
}

function CompanyDialog({ company, data, onClose }: { company: Company | null; data: Workshop; onClose: () => void }) {
  const { change } = useWorkshop()
  const details = company ? data.detailsOf(company.id) : undefined
  const projects = company ? data.projectsOf(company.id) : []
  const [name, setName] = useState(company?.name ?? '')
  const [contact, setContact] = useState(details?.contact_name ?? '')
  const [email, setEmail] = useState(details?.email ?? '')
  const [phone, setPhone] = useState(details?.phone ?? '')
  const [address, setAddress] = useState(details?.address ?? '')
  const [notes, setNotes] = useState(details?.notes ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(work: () => PromiseLike<{ error: unknown }>) {
    if (busy) return
    setBusy(true)
    setError(null)
    const failed = await change(work)
    if (failed) {
      setError(failed)
      setBusy(false)
    } else onClose()
  }

  function save(e: FormEvent) {
    e.preventDefault()
    void run(() =>
      supabase.rpc('save_company', {
        p_name: name,
        p_id: company?.id ?? null,
        p_contact_name: contact,
        p_email: email,
        p_phone: phone,
        p_address: address,
        p_notes: notes,
      }),
    )
  }

  return (
    <Dialog title={company ? company.name : 'Yeni firma'} onClose={onClose} focusFirst={!company}>
      <form onSubmit={save} className="dialog-body">
        <Field label="Firma adı">
          {(id) => (
            <input
              id={id}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoComplete="off"
              required
            />
          )}
        </Field>
        <Field label="Yetkili kişi" hint="Bu firmada görüştüğünüz kişi.">
          {(id) => (
            <input
              id={id}
              className="input"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={120}
              autoComplete="off"
            />
          )}
        </Field>
        <div className="pair">
          <Field label="Telefon">
            {(id) => (
              <input
                id={id}
                className="input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={40}
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="E-posta">
            {(id) => (
              <input
                id={id}
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={160}
                autoComplete="off"
                autoCapitalize="none"
              />
            )}
          </Field>
        </div>
        <Field label="Adres">
          {(id) => (
            <textarea
              id={id}
              className="input textarea"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={400}
            />
          )}
        </Field>
        <Field label="Not">
          {(id) => (
            <textarea
              id={id}
              className="input textarea"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={600}
            />
          )}
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="btn btn-primary btn-big press" disabled={busy}>
          {busy ? 'Kaydediliyor…' : company ? 'Kaydet' : 'Firmayı ekle'}
        </button>
      </form>

      {projects.length ? (
        <div>
          <div className="field-label">Bu firmanın projeleri</div>
          <div className="chips">
            {projects.map((p) => (
              <Link key={p.id} to={`/projeler/${p.id}`} className="chip chip-link">
                {[p.code, p.name].filter(Boolean).join(' · ')}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {company ? (
        confirmDelete ? (
          <div className="dialog-foot">
            <div className="note note-error">
              {projects.length
                ? `"${company.name}" silinecek. ${projects.length} projesi yerinde kalır ama firmasız görünür.`
                : `"${company.name}" silinecek.`}
            </div>
            <button
              type="button"
              className="btn btn-danger btn-big press"
              disabled={busy}
              onClick={() => void run(() => supabase.from('companies').delete().eq('id', company.id))}
            >
              Evet, firmayı sil
            </button>
            <button type="button" className="btn btn-quiet btn-big press" onClick={() => setConfirmDelete(false)}>
              Vazgeç
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-danger btn-big press" onClick={() => setConfirmDelete(true)}>
            Firmayı sil
          </button>
        )
      ) : null}
    </Dialog>
  )
}
