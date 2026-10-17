import { useMemo, useState, type FormEvent } from 'react'
import { Dialog, ErrorNote, Field, Icon, Segmented, Spinner } from '../components/ui'
import { callApi } from '../lib/api'
import { useAuth, useProfile } from '../lib/auth'
import { friendly } from '../lib/errors'
import {
  DEFAULT_SEVIYE,
  PANEL_LABEL,
  SEVIYELER,
  SEVIYE_LABEL,
  supabase,
  type Bolum,
  type Panel,
  type Profile,
  type Seviye,
} from '../lib/supabase'
import { groupPeople, useWorkshop, type Workshop } from '../lib/workshop'
import { MIN_PASSWORD_LENGTH, isValidUsername, normalizeUsername } from '../../shared/username'

const PANEL_OPTIONS: { value: Panel; label: string }[] = [
  { value: 'worker', label: PANEL_LABEL.worker },
  { value: 'manager', label: PANEL_LABEL.manager },
  { value: 'ceo', label: PANEL_LABEL.ceo },
]

const SEVIYE_OPTIONS = SEVIYELER.map((s) => ({ value: s, label: SEVIYE_LABEL[s] }))

const PANEL_ORDER: Record<Panel, number> = { ceo: 0, manager: 1, worker: 2 }
const SEVIYE_ORDER: Record<Seviye, number> = { usta: 0, kalfa: 1, cirak: 2 }

export function Ekip() {
  const me = useProfile()
  const { reloadProfile } = useAuth()
  const { data, error, reload } = useWorkshop()
  const isCeo = me.panel === 'ceo'
  const [editing, setEditing] = useState<Profile | null>(null)
  const [adding, setAdding] = useState(false)

  // One card per bölüm, people without one last. Before 0007 has run, one card for everyone.
  const groups = useMemo(() => {
    if (!data) return null
    const rank = (p: Profile) => PANEL_ORDER[p.panel] * 10 + SEVIYE_ORDER[data.seviyeOf(p) ?? 'usta']
    const sorted = data.people
      .filter((p) => p.active)
      .sort((a, b) => rank(a) - rank(b) || a.full_name.localeCompare(b.full_name, 'tr'))
    return groupPeople(data, sorted)
  }, [data])

  async function afterChange(changedId?: string) {
    await reload()
    if (changedId === me.id) await reloadProfile()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Ekip</h1>
          <div className="sub">
            {isCeo ? 'Kişi eklemek veya düzenlemek için dokunun.' : 'Kişi eklemeyi ve silmeyi yalnızca CEO yapar.'}
          </div>
        </div>
        {isCeo ? (
          <button type="button" className="btn btn-primary press" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} />
            Kişi ekle
          </button>
        ) : null}
      </div>

      <ErrorNote>{error}</ErrorNote>

      {!data || !groups ? (
        error ? null : (
          <Spinner />
        )
      ) : (
        <div className="stack groups">
          {groups.map((g) => (
            <section key={g.title ?? 'all'} className="stack" aria-label={g.title ?? 'Kişiler'}>
              {g.title ? (
                <h3>
                  {g.title} <span className="count">{g.people.length}</span>
                </h3>
              ) : null}
              <div className="card people rows">
                {g.people.map((p) => {
                  const seviye = data.seviyeOf(p)
                  return (
                    <button key={p.id} type="button" className="person press" onClick={() => setEditing(p)}>
                      <span className="who">
                        <span className="name">{p.full_name}</span>
                        <span className="mono"> {p.username}</span>
                      </span>
                      <span className="meslek">{data.bolumReady && seviye ? SEVIYE_LABEL[seviye] : ''}</span>
                      <span className={`badge badge-${p.panel}`}>{PANEL_LABEL[p.panel]}</span>
                      <span className="go">
                        <Icon name="chevron" size={18} />
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          {data.bolumReady ? (
            <div className="sub">Usta, Kalfa ve Çırak yalnızca CEO ve yöneticilere görünür.</div>
          ) : null}
        </div>
      )}

      {adding && data ? (
        <AddPersonDialog
          data={data}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            void afterChange()
          }}
        />
      ) : null}

      {editing && data ? (
        <EditPersonDialog
          data={data}
          person={editing}
          isCeo={isCeo}
          isSelf={editing.id === me.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            const id = editing.id
            setEditing(null)
            void afterChange(id)
          }}
        />
      ) : null}
    </div>
  )
}

function BolumSelect({
  id,
  value,
  bolumler,
  onChange,
}: {
  id: string
  value: string
  bolumler: Bolum[]
  onChange: (value: string) => void
}) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Seçilmedi</option>
      {bolumler.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  )
}

/** Bölüm, and the level when the person is Personel. Hidden until 0007 has run. */
function PlaceFields({
  data,
  panel,
  bolumId,
  seviye,
  onBolum,
  onSeviye,
}: {
  data: Workshop
  panel: Panel
  bolumId: string
  seviye: Seviye
  onBolum: (value: string) => void
  onSeviye: (value: Seviye) => void
}) {
  if (!data.bolumReady) return null
  return (
    <>
      <Field label="Bölüm">
        {(id) => <BolumSelect id={id} value={bolumId} bolumler={data.bolumler} onChange={onBolum} />}
      </Field>
      {panel === 'worker' ? (
        <div>
          <Segmented label="Seviye" value={seviye} options={SEVIYE_OPTIONS} onChange={onSeviye} />
          <div className="hint">
            Usta'nın bitirdiği iş hemen biter; Kalfa ve Çırak'ınki yönetici onayını bekler. Bunu yalnızca CEO ve
            yöneticiler görür.
          </div>
        </div>
      ) : null}
    </>
  )
}

function AddPersonDialog({ data, onClose, onSaved }: { data: Workshop; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [panel, setPanel] = useState<Panel>('worker')
  const [bolumId, setBolumId] = useState('')
  const [seviye, setSeviye] = useState<Seviye>(DEFAULT_SEVIYE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!isValidUsername(username)) {
      setError('Kullanıcı adı en az 3 karakter olmalı.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await callApi('/api/users', 'POST', {
        full_name: fullName,
        username,
        password,
        panel,
        // Sent only once 0007 has run; an older database has no place for them.
        ...(data.bolumReady ? { bolum_id: bolumId || null, seviye: panel === 'worker' ? seviye : null } : {}),
      })
      onSaved()
    } catch (err) {
      setError(friendly(err))
      setBusy(false)
    }
  }

  return (
    <Dialog title="Kişi ekle" onClose={onClose}>
      <form onSubmit={submit} className="dialog-body">
        <Field label="Ad soyad">
          {(id) => (
            <input
              id={id}
              className="input"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value)
                // Suggest a username from the name until the CEO types their own.
                if (!usernameTouched) setUsername(normalizeUsername(e.target.value))
              }}
              autoComplete="off"
              required
            />
          )}
        </Field>
        <Field label="Kullanıcı adı" hint="Kişi bu adla giriş yapar.">
          {(id) => (
            <input
              id={id}
              className="input"
              value={username}
              onChange={(e) => {
                setUsernameTouched(true)
                setUsername(normalizeUsername(e.target.value))
              }}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          )}
        </Field>
        <Field label="İlk şifre" hint={`En az ${MIN_PASSWORD_LENGTH} karakter. Kişi sonra kendisi değiştirebilir.`}>
          {(id) => (
            <input
              id={id}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          )}
        </Field>
        <Segmented label="Panel" value={panel} options={PANEL_OPTIONS} onChange={setPanel} />
        <PlaceFields
          data={data}
          panel={panel}
          bolumId={bolumId}
          seviye={seviye}
          onBolum={setBolumId}
          onSeviye={setSeviye}
        />
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="btn btn-primary btn-big press" disabled={busy}>
          {busy ? 'Ekleniyor…' : 'Kişiyi ekle'}
        </button>
      </form>
    </Dialog>
  )
}

function EditPersonDialog({
  data,
  person,
  isCeo,
  isSelf,
  onClose,
  onSaved,
}: {
  data: Workshop
  person: Profile
  isCeo: boolean
  isSelf: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(person.full_name)
  const [username, setUsername] = useState(person.username)
  const [panel, setPanel] = useState<Panel>(person.panel)
  const [bolumId, setBolumId] = useState(person.bolum_id ?? '')
  const [seviye, setSeviye] = useState<Seviye>(data.seviyeOf(person) ?? DEFAULT_SEVIYE)
  const [newPassword, setNewPassword] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guard(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await work()
      onSaved()
    } catch (err) {
      setError(friendly(err))
      setBusy(false)
    }
  }

  function save(e: FormEvent) {
    e.preventDefault()
    if (isCeo && username !== person.username && !isValidUsername(username)) {
      setError('Kullanıcı adı en az 3 karakter olmalı.')
      return
    }
    void guard(async () => {
      const changes: Record<string, unknown> = { full_name: fullName.trim() }
      if (data.bolumReady) changes.bolum_id = bolumId || null
      if (isCeo) changes.panel = panel
      const { error } = await supabase.from('profiles').update(changes).eq('id', person.id)
      if (error) throw error
      if (data.bolumReady && panel === 'worker' && seviye !== data.seviyeOf(person)) {
        const saved = await supabase.from('seviyeler').upsert({ user_id: person.id, seviye }, { onConflict: 'user_id' })
        if (saved.error) throw saved.error
      }
      // The username is also the sign-in, so it changes on the server.
      const account: Record<string, string> = {}
      if (isCeo && username !== person.username) account.username = username
      if (isCeo && newPassword) account.password = newPassword
      if (Object.keys(account).length) await callApi('/api/users', 'PATCH', { id: person.id, ...account })
    })
  }

  function remove() {
    void guard(async () => {
      await callApi('/api/users', 'DELETE', { id: person.id })
    })
  }

  return (
    <Dialog title={person.full_name} subtitle={person.username} onClose={onClose}>
      <form onSubmit={save} className="dialog-body">
        <Field label="Ad soyad">
          {(id) => (
            <input
              id={id}
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="off"
              required
            />
          )}
        </Field>
        {isCeo ? (
          <Field label="Kullanıcı adı" hint="Değiştirirseniz kişi yeni adla giriş yapar; şifresi aynı kalır.">
            {(id) => (
              <input
                id={id}
                className="input"
                value={username}
                onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            )}
          </Field>
        ) : null}
        {isCeo ? <Segmented label="Panel" value={panel} options={PANEL_OPTIONS} onChange={setPanel} /> : null}
        <PlaceFields
          data={data}
          panel={panel}
          bolumId={bolumId}
          seviye={seviye}
          onBolum={setBolumId}
          onSeviye={setSeviye}
        />
        {isCeo ? (
          <Field
            label="Yeni şifre ver"
            hint="Kişi şifresini unuttuysa buraya yenisini yazın. Değiştirmek istemiyorsanız boş bırakın."
          >
            {(id) => (
              <input
                id={id}
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                minLength={MIN_PASSWORD_LENGTH}
              />
            )}
          </Field>
        ) : null}
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="btn btn-primary btn-big press" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </form>

      {isCeo && !isSelf ? (
        confirmRemove ? (
          <div className="dialog-foot">
            <div className="note note-error">
              {person.full_name} artık giriş yapamayacak. Geçmiş işlerde adı görünmeye devam eder.
            </div>
            <button type="button" className="btn btn-danger btn-big press" disabled={busy} onClick={remove}>
              Evet, kişiyi sil
            </button>
            <button type="button" className="btn btn-quiet btn-big press" onClick={() => setConfirmRemove(false)}>
              Vazgeç
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-danger btn-big press" onClick={() => setConfirmRemove(true)}>
            Kişiyi sil
          </button>
        )
      ) : null}
    </Dialog>
  )
}
