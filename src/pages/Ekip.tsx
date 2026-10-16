import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { EditableList } from '../components/EditableList'
import { Dialog, ErrorNote, Field, Icon, Segmented, Spinner } from '../components/ui'
import { callApi } from '../lib/api'
import { useAuth, useProfile } from '../lib/auth'
import { friendly } from '../lib/errors'
import {
  BOLUMLER,
  BOLUM_LABEL,
  PANEL_LABEL,
  fetchProfiles,
  supabase,
  type Atolye,
  type Bolum,
  type Meslek,
  type Panel,
  type Profile,
} from '../lib/supabase'
import { useWorkshop } from '../lib/workshop'
import { MIN_PASSWORD_LENGTH, isValidUsername, normalizeUsername } from '../../shared/username'

const PANEL_OPTIONS: { value: Panel; label: string }[] = [
  { value: 'worker', label: PANEL_LABEL.worker },
  { value: 'manager', label: PANEL_LABEL.manager },
  { value: 'ceo', label: PANEL_LABEL.ceo },
]

const PANEL_ORDER: Record<Panel, number> = { ceo: 0, manager: 1, worker: 2 }

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'tr')

export function Ekip() {
  const me = useProfile()
  const { reloadProfile } = useAuth()
  const isCeo = me.panel === 'ceo'
  const reloadWorkshop = useWorkshop().reload

  const [people, setPeople] = useState<Profile[] | null>(null)
  const [meslekler, setMeslekler] = useState<Meslek[]>([])
  const [atolyeler, setAtolyeler] = useState<Atolye[]>([])
  const [bolumReady, setBolumReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const [p, m, a] = await Promise.all([
      fetchProfiles({ active: true }),
      supabase.from('meslek_turleri').select('id, name').order('name'),
      supabase.from('atolyeler').select('id, name').order('name'),
    ])
    // The workshop list only exists once 0006_bolumler.sql has run.
    const atolyeError = p.bolumReady ? a.error : null
    if (p.error || m.error || atolyeError) {
      setError(friendly(p.error ?? m.error ?? atolyeError))
      return
    }
    setError(null)
    setPeople(p.data ?? [])
    setBolumReady(p.bolumReady)
    setMeslekler((m.data as Meslek[]).sort(byName))
    setAtolyeler(p.bolumReady ? (a.data as Atolye[]).sort(byName) : [])
    // Projects show people and meslek names too; keep them in step.
    void reloadWorkshop()
  }, [reloadWorkshop])

  useEffect(() => {
    void load()
  }, [load])

  const meslekName = useMemo(() => new Map(meslekler.map((m) => [m.id, m.name])), [meslekler])
  const atolyeName = useMemo(() => new Map(atolyeler.map((a) => [a.id, a.name])), [atolyeler])

  // One card per bölüm, people without one last. Before 0006 has run, one card for everyone.
  const groups = useMemo(() => {
    const atolyeOf = (p: Profile) => (p.atolye_id && atolyeName.get(p.atolye_id)) || '\uffff'
    const sorted = [...(people ?? [])].sort(
      (a, b) =>
        PANEL_ORDER[a.panel] - PANEL_ORDER[b.panel] ||
        atolyeOf(a).localeCompare(atolyeOf(b), 'tr') ||
        a.full_name.localeCompare(b.full_name, 'tr'),
    )
    if (!bolumReady) return [{ key: 'all', title: null, people: sorted }]
    const keys: (Bolum | null)[] = [...BOLUMLER, null]
    return keys
      .map((key) => ({
        key: key ?? 'none',
        title: key ? BOLUM_LABEL[key] : 'Bölüm seçilmedi',
        people: sorted.filter((p) => p.bolum === key),
      }))
      .filter((g) => g.people.length > 0)
  }, [people, bolumReady, atolyeName])

  function placeOf(p: Profile) {
    const meslek = p.meslek_id ? meslekName.get(p.meslek_id) : undefined
    const atolye = p.atolye_id ? atolyeName.get(p.atolye_id) : undefined
    return [atolye, meslek].filter(Boolean).join(' · ') || 'Meslek seçilmedi'
  }

  async function afterChange(changedId?: string) {
    await load()
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

      <div className="split">
        <div className="main stack groups">
          {people === null ? (
            error ? null : (
              <Spinner />
            )
          ) : (
            groups.map((g) => (
              <section key={g.key} className="stack" aria-label={g.title ?? 'Kişiler'}>
                {g.title ? (
                  <h3>
                    {g.title} <span className="count">{g.people.length}</span>
                  </h3>
                ) : null}
                <div className="card people rows">
                  {g.people.map((p) => (
                    <button key={p.id} type="button" className="person press" onClick={() => setEditing(p)}>
                      <span className="who">
                        <span className="name">{p.full_name}</span>
                        <span className="mono"> {p.username}</span>
                      </span>
                      <span className="meslek">{placeOf(p)}</span>
                      <span className={`badge badge-${p.panel}`}>{PANEL_LABEL[p.panel]}</span>
                      <span className="go">
                        <Icon name="chevron" size={18} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <div className="side">
          <MeslekTurleri meslekler={meslekler} people={people ?? []} onChange={() => void load()} />
          {bolumReady ? <Atolyeler atolyeler={atolyeler} people={people ?? []} onChange={load} /> : null}
        </div>
      </div>

      {adding ? (
        <AddPersonDialog
          meslekler={meslekler}
          atolyeler={bolumReady ? atolyeler : null}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            void afterChange()
          }}
        />
      ) : null}

      {editing ? (
        <EditPersonDialog
          person={editing}
          meslekler={meslekler}
          atolyeler={bolumReady ? atolyeler : null}
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

function MeslekSelect({
  id,
  value,
  meslekler,
  onChange,
}: {
  id: string
  value: string
  meslekler: Meslek[]
  onChange: (value: string) => void
}) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Seçilmedi</option>
      {meslekler.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  )
}

/** Bölüm, and the workshop when the bölüm is Üretim. Empty strings mean "not chosen". */
type Place = { bolum: Bolum | ''; atolyeId: string }

/** What a Place stores. Only Üretim has workshops, so any other bölüm clears it. */
function placeColumns(place: Place) {
  return {
    bolum: place.bolum || null,
    atolye_id: place.bolum === 'uretim' ? place.atolyeId || null : null,
  }
}

function PlaceFields({
  value,
  atolyeler,
  onChange,
}: {
  value: Place
  atolyeler: Atolye[]
  onChange: (value: Place) => void
}) {
  return (
    <>
      <Field label="Bölüm" hint="Kişinin uygulamada hangi bölümleri göreceğini belirler.">
        {(id) => (
          <select
            id={id}
            className="input"
            value={value.bolum}
            onChange={(e) => onChange({ ...value, bolum: e.target.value as Bolum | '' })}
          >
            <option value="">Seçilmedi</option>
            {BOLUMLER.map((b) => (
              <option key={b} value={b}>
                {BOLUM_LABEL[b]}
              </option>
            ))}
          </select>
        )}
      </Field>
      {value.bolum === 'uretim' ? (
        <Field label="Atölye">
          {(id) => (
            <select
              id={id}
              className="input"
              value={value.atolyeId}
              onChange={(e) => onChange({ ...value, atolyeId: e.target.value })}
            >
              <option value="">Seçilmedi</option>
              {atolyeler.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
    </>
  )
}

function AddPersonDialog({
  meslekler,
  atolyeler,
  onClose,
  onSaved,
}: {
  meslekler: Meslek[]
  atolyeler: Atolye[] | null
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [panel, setPanel] = useState<Panel>('worker')
  const [meslekId, setMeslekId] = useState('')
  const [place, setPlace] = useState<Place>({ bolum: 'uretim', atolyeId: '' })
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
        meslek_id: meslekId || null,
        ...(atolyeler ? placeColumns(place) : {}),
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
        {atolyeler ? <PlaceFields value={place} atolyeler={atolyeler} onChange={setPlace} /> : null}
        <Field label="Meslek">
          {(id) => <MeslekSelect id={id} value={meslekId} meslekler={meslekler} onChange={setMeslekId} />}
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="btn btn-primary btn-big press" disabled={busy}>
          {busy ? 'Ekleniyor…' : 'Kişiyi ekle'}
        </button>
      </form>
    </Dialog>
  )
}

function EditPersonDialog({
  person,
  meslekler,
  atolyeler,
  isCeo,
  isSelf,
  onClose,
  onSaved,
}: {
  person: Profile
  meslekler: Meslek[]
  atolyeler: Atolye[] | null
  isCeo: boolean
  isSelf: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(person.full_name)
  const [panel, setPanel] = useState<Panel>(person.panel)
  const [meslekId, setMeslekId] = useState(person.meslek_id ?? '')
  const [place, setPlace] = useState<Place>({ bolum: person.bolum ?? '', atolyeId: person.atolye_id ?? '' })
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
    void guard(async () => {
      const changes: Record<string, unknown> = {
        full_name: fullName.trim(),
        meslek_id: meslekId || null,
        ...(atolyeler ? placeColumns(place) : {}),
      }
      if (isCeo) changes.panel = panel
      const { error } = await supabase.from('profiles').update(changes).eq('id', person.id)
      if (error) throw error
      if (isCeo && newPassword) {
        await callApi('/api/users', 'PATCH', { id: person.id, password: newPassword })
      }
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
        {atolyeler ? <PlaceFields value={place} atolyeler={atolyeler} onChange={setPlace} /> : null}
        <Field label="Meslek">
          {(id) => <MeslekSelect id={id} value={meslekId} meslekler={meslekler} onChange={setMeslekId} />}
        </Field>
        {isCeo ? (
          <>
            <Segmented label="Panel" value={panel} options={PANEL_OPTIONS} onChange={setPanel} />
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
          </>
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

function MeslekTurleri({
  meslekler,
  people,
  onChange,
}: {
  meslekler: Meslek[]
  people: Profile[]
  onChange: () => void
}) {
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of people) if (p.meslek_id) map.set(p.meslek_id, (map.get(p.meslek_id) ?? 0) + 1)
    return map
  }, [people])

  async function run(work: () => PromiseLike<{ error: unknown }>, done?: () => void) {
    if (busy) return
    setBusy(true)
    setError(null)
    const { error } = await work()
    setBusy(false)
    if (error) {
      setError(friendly(error))
      return
    }
    done?.()
    onChange()
  }

  function create(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    void run(
      () => supabase.from('meslek_turleri').insert({ name }),
      () => setNewName(''),
    )
  }

  function rename(e: FormEvent) {
    e.preventDefault()
    if (!renaming) return
    const name = renaming.name.trim()
    if (!name) return
    void run(
      () => supabase.from('meslek_turleri').update({ name }).eq('id', renaming.id),
      () => setRenaming(null),
    )
  }

  function remove(m: Meslek) {
    void run(
      () => supabase.from('meslek_turleri').delete().eq('id', m.id),
      () => setRemoving(null),
    )
  }

  return (
    <section className="stack" aria-label="Meslek türleri">
      <h3>Meslek Türleri</h3>
      <div className="card meslek-list rows">
        {meslekler.length === 0 ? <div className="empty">Henüz meslek türü yok.</div> : null}
        {meslekler.map((m) =>
          renaming?.id === m.id ? (
            <form key={m.id} className="meslek-row" onSubmit={rename}>
              <input
                className="input"
                value={renaming.name}
                onChange={(e) => setRenaming({ id: m.id, name: e.target.value })}
                aria-label="Meslek türü adı"
                autoFocus
                maxLength={60}
              />
              <button type="submit" className="btn btn-tint press" disabled={busy}>
                Kaydet
              </button>
            </form>
          ) : removing === m.id ? (
            <div key={m.id} className="meslek-row">
              <span className="label-text">
                {counts.get(m.id) ? `${m.name}: ${counts.get(m.id)} kişi mesleksiz kalır.` : `${m.name} silinsin mi?`}
              </span>
              <button type="button" className="btn btn-danger press" disabled={busy} onClick={() => remove(m)}>
                Sil
              </button>
              <button type="button" className="btn btn-quiet press" onClick={() => setRemoving(null)}>
                Vazgeç
              </button>
            </div>
          ) : (
            <div key={m.id} className="meslek-row">
              <button
                type="button"
                className="label press"
                onClick={() => setRenaming({ id: m.id, name: m.name })}
                title="Adını değiştir"
              >
                {m.name}
              </button>
              <span className="count">{counts.get(m.id) ? `${counts.get(m.id)} kişi` : ''}</span>
              <button
                type="button"
                className="btn btn-icon press"
                aria-label={`${m.name} meslek türünü sil`}
                onClick={() => setRemoving(m.id)}
              >
                <Icon name="trash" size={20} />
              </button>
            </div>
          ),
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <form onSubmit={create} className="field">
        <label htmlFor="yeni-meslek">Yeni meslek türü</label>
        <div className="inline-form">
          <input
            id="yeni-meslek"
            className="input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Örnek: Boyacı"
            maxLength={60}
          />
          <button type="submit" className="btn btn-dark press" disabled={busy || !newName.trim()}>
            Oluştur
          </button>
        </div>
      </form>
    </section>
  )
}

function Atolyeler({
  atolyeler,
  people,
  onChange,
}: {
  atolyeler: Atolye[]
  people: Profile[]
  onChange: () => Promise<void>
}) {
  const count = (a: Atolye) => people.filter((p) => p.atolye_id === a.id).length

  async function run(work: () => PromiseLike<{ error: unknown }>): Promise<string | null> {
    const { error } = await work()
    if (error) return friendly(error)
    await onChange()
    return null
  }

  return (
    <section className="stack" aria-label="Atölyeler">
      <h3>Atölyeler</h3>
      <div className="sub">Üretim bölümündeki kişiler bir atölyeye bağlanır.</div>
      <EditableList
        items={atolyeler}
        noun="atölye"
        placeholder="Örnek: Boya atölyesi"
        note={(a) => (count(a) ? `${count(a)} kişi` : '')}
        deleteWarning={(a) => (count(a) ? `${a.name}: ${count(a)} kişi atölyesiz kalır.` : null)}
        onCreate={(name) => run(() => supabase.from('atolyeler').insert({ name }))}
        onRename={(a, name) => run(() => supabase.from('atolyeler').update({ name }).eq('id', a.id))}
        onDelete={(a) => run(() => supabase.from('atolyeler').delete().eq('id', a.id))}
      />
    </section>
  )
}
