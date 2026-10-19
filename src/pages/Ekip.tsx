import { useMemo, useState, type FormEvent } from 'react'
import { Dialog, ErrorNote, Field, Icon, Segmented, Spinner } from '../components/ui'
import { callApi } from '../lib/api'
import { useAuth, useProfile } from '../lib/auth'
import { friendly } from '../lib/errors'
import { locale, t } from '../lib/i18n'
import {
  DEFAULT_SEVIYE,
  ONAY_KURALI,
  ROL_LABEL,
  SEVIYELER,
  SEVIYE_LABEL,
  panelOf,
  rolLabel,
  rolOf,
  supabase,
  type Profile,
  type Rol,
  type Seviye,
} from '../lib/supabase'
import { groupPeople, useWorkshop, type Workshop } from '../lib/workshop'
import { MIN_PASSWORD_LENGTH, isValidUsername, normalizeUsername } from '../../shared/username'

const ROL_ORDER: Rol[] = ['genel_mudur', 'it', 'manager', 'worker']

/** Uzmanlık id -> level, for the ticked uzmanlıklar of one person. */
type Levels = Record<string, Seviye>

export function Ekip() {
  const me = useProfile()
  const { reloadProfile } = useAuth()
  const { data, error, reload } = useWorkshop()
  // Genel Müdür and IT add and remove people; Bölüm Sorumluları only edit.
  const isCeo = me.panel === 'ceo'
  const [editing, setEditing] = useState<Profile | null>(null)
  const [adding, setAdding] = useState(false)

  // One card per bölüm, Genel Müdür and IT first, people without a bölüm last.
  const groups = useMemo(() => {
    if (!data) return null
    const sorted = data.people
      .filter((p) => p.active)
      .sort((a, b) => ROL_ORDER.indexOf(rolOf(a)) - ROL_ORDER.indexOf(rolOf(b)) || a.full_name.localeCompare(b.full_name, locale()))
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
          <h1>{t('Ekip')}</h1>
          <div className="sub">
            {isCeo ? t('Kişi eklemek veya düzenlemek için dokunun.') : t('Kişi eklemeyi ve silmeyi Genel Müdür ve IT yapar.')}
          </div>
        </div>
        {isCeo ? (
          <button type="button" className="btn btn-primary press" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} />
            {t('Kişi ekle')}
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
            <section key={g.title ?? 'all'} className="stack" aria-label={g.title ? t(g.title) : t('Kişiler')}>
              {g.title ? (
                <h3>
                  {t(g.title)} <span className="count">{g.people.length}</span>
                </h3>
              ) : null}
              <div className="card people rows">
                {g.people.map((p) => (
                  <button key={p.id} type="button" className="person press" onClick={() => setEditing(p)}>
                    <span className="who">
                      <span className="name">{p.full_name}</span>
                      <span className="mono"> {p.username}</span>
                    </span>
                    <span className="meslek">{personNote(data, p)}</span>
                    <span className={`badge badge-${p.panel}`}>{t(rolLabel(p))}</span>
                    <span className="go">
                      <Icon name="chevron" size={18} />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {data.ready ? (
            <div className="sub">{t('Uzmanlık seviyeleri yalnızca Genel Müdür, IT ve Bölüm Sorumlularına görünür.')}</div>
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

/** The small text on a person's row: their uzmanlıklar, or which bölüm they lead. */
function personNote(data: Workshop, p: Profile): string {
  if (!data.ready) return ''
  if (p.panel === 'manager') return p.bolum_id ? t('Sorumlu') : ''
  if (p.panel === 'worker' && data.bolumKod(p.bolum_id) === 'imalat') return data.uzmanlikText(p.id)
  return ''
}

function levelsOf(data: Workshop, personId: string): Levels {
  return Object.fromEntries(data.uzmanliklarOf(personId).map((u) => [u.uzmanlik_id, u.seviye]))
}

/**
 * Who the person is and where they work:
 * - Genel Müdür and IT: no bölüm.
 * - Bölüm Sorumlusu: only the bölüm they lead.
 * - Personel: a bölüm; in İmalat also their uzmanlıklar, each with a level.
 */
function PersonFields({
  data,
  rol,
  canChooseRol,
  bolumId,
  levels,
  onRol,
  onBolum,
  onLevels,
}: {
  data: Workshop
  rol: Rol
  canChooseRol: boolean
  bolumId: string
  levels: Levels
  onRol: (value: Rol) => void
  onBolum: (value: string) => void
  onLevels: (value: Levels) => void
}) {
  // IT needs 0008; before it, the three older choices remain.
  const roles = data.ready ? ROL_ORDER : ROL_ORDER.filter((r) => r !== 'it')
  const inImalat = data.ready && rol === 'worker' && data.bolumKod(bolumId || null) === 'imalat'
  return (
    <>
      {canChooseRol ? (
        <Segmented
          label={t('Rol')}
          value={rol}
          options={roles.map((r) => ({ value: r, label: t(ROL_LABEL[r]) }))}
          onChange={onRol}
          grid={roles.length === 4}
        />
      ) : null}
      {data.bolumReady && (rol === 'manager' || rol === 'worker') ? (
        <Field
          label={rol === 'manager' ? t('Sorumlu olduğu bölüm') : t('Bölüm')}
          hint={
            data.ready && rol === 'worker' && bolumId && !inImalat
              ? t('İmalat dışındaki Personelin bitirdiği iş her zaman onay bekler.')
              : undefined
          }
        >
          {(id) => (
            <select id={id} className="input" value={bolumId} onChange={(e) => onBolum(e.target.value)}>
              <option value="">{t('Seçilmedi')}</option>
              {data.bolumler.map((b) => (
                <option key={b.id} value={b.id}>
                  {t(b.name)}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      {inImalat ? <UzmanlikFields data={data} levels={levels} onChange={onLevels} /> : null}
    </>
  )
}

/** Tick the person's uzmanlıklar; each ticked one gets a level, starting at Kalfa. */
function UzmanlikFields({ data, levels, onChange }: { data: Workshop; levels: Levels; onChange: (value: Levels) => void }) {
  return (
    <div className="field">
      <div className="field-label">{t('Uzmanlıklar')}</div>
      {data.uzmanliklar.length === 0 ? (
        <div className="sub">{t("Uzmanlık listesi boş. Ayarlar'daki Uzmanlıklar'dan ekleyin.")}</div>
      ) : (
        <div className="card rows checklist uzmanlik-list" role="group" aria-label={t('Uzmanlıklar')}>
          {data.uzmanliklar.map((u) => {
            const level = levels[u.id]
            return (
              <div key={u.id} className="uzmanlik-row">
                <button
                  type="button"
                  className="check-row press"
                  aria-pressed={!!level}
                  onClick={() => {
                    const next = { ...levels }
                    if (level) delete next[u.id]
                    else next[u.id] = DEFAULT_SEVIYE
                    onChange(next)
                  }}
                >
                  <span>{u.name}</span>
                  {level ? <Icon name="check" /> : null}
                </button>
                {level ? (
                  <div className="segmented" role="group" aria-label={t('{name} seviyesi', { name: u.name })}>
                    {SEVIYELER.map((sv) => (
                      <button
                        key={sv}
                        type="button"
                        className="press"
                        aria-pressed={sv === level}
                        onClick={() => onChange({ ...levels, [u.id]: sv })}
                      >
                        {t(SEVIYE_LABEL[sv])}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      <div className="hint">{t(ONAY_KURALI)}</div>
      <div className="hint">{t('Seviyeleri yalnızca Genel Müdür, IT ve Bölüm Sorumluları görür.')}</div>
    </div>
  )
}

function AddPersonDialog({ data, onClose, onSaved }: { data: Workshop; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<Rol>('worker')
  const [bolumId, setBolumId] = useState('')
  const [levels, setLevels] = useState<Levels>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!isValidUsername(username)) {
      setError(t('Kullanıcı adı en az 3 karakter olmalı.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { panel, unvan } = panelOf(rol)
      const leadsOrWorks = rol === 'manager' || rol === 'worker'
      await callApi('/api/users', 'POST', {
        full_name: fullName,
        username,
        password,
        panel,
        // Sent only once the matching update has run; an older database has no place for them.
        ...(data.ready ? { unvan } : {}),
        ...(data.bolumReady ? { bolum_id: leadsOrWorks ? bolumId || null : null } : {}),
        ...(data.ready && rol === 'worker' && data.bolumKod(bolumId || null) === 'imalat'
          ? { uzmanliklar: Object.entries(levels).map(([uzmanlik_id, seviye]) => ({ uzmanlik_id, seviye })) }
          : {}),
      })
      onSaved()
    } catch (err) {
      setError(friendly(err))
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('Kişi ekle')} onClose={onClose}>
      <form onSubmit={submit} className="dialog-body">
        <Field label={t('Ad soyad')}>
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
        <Field label={t('Kullanıcı adı')} hint={t('Kişi bu adla giriş yapar.')}>
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
        <Field label={t('İlk şifre')} hint={t('En az {n} karakter. Kişi sonra kendisi değiştirebilir.', { n: MIN_PASSWORD_LENGTH })}>
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
        <PersonFields
          data={data}
          rol={rol}
          canChooseRol
          bolumId={bolumId}
          levels={levels}
          onRol={setRol}
          onBolum={setBolumId}
          onLevels={setLevels}
        />
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="btn btn-primary btn-big press" disabled={busy}>
          {busy ? t('Ekleniyor…') : t('Kişiyi ekle')}
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
  const [rol, setRol] = useState<Rol>(rolOf(person))
  const [bolumId, setBolumId] = useState(person.bolum_id ?? '')
  const [levels, setLevels] = useState<Levels>(() => levelsOf(data, person.id))
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
      setError(t('Kullanıcı adı en az 3 karakter olmalı.'))
      return
    }
    void guard(async () => {
      const changes: Record<string, unknown> = { full_name: fullName.trim() }
      // Genel Müdür and IT belong to no bölüm.
      if (data.bolumReady) changes.bolum_id = rol === 'manager' || rol === 'worker' ? bolumId || null : null
      if (isCeo) {
        const { panel, unvan } = panelOf(rol)
        changes.panel = panel
        if (data.ready) changes.unvan = unvan
      }
      const { error } = await supabase.from('profiles').update(changes).eq('id', person.id)
      if (error) throw error
      // Levels are kept only for Personel in İmalat. Moving someone out of
      // İmalat leaves them stored but unused, in case they come back.
      if (data.ready && rol === 'worker' && data.bolumKod(bolumId || null) === 'imalat') {
        const before = levelsOf(data, person.id)
        const removed = Object.keys(before).filter((id) => !levels[id])
        if (removed.length) {
          const gone = await supabase.from('kisi_uzmanliklari').delete().eq('user_id', person.id).in('uzmanlik_id', removed)
          if (gone.error) throw gone.error
        }
        const rows = Object.entries(levels)
          .filter(([id, seviye]) => before[id] !== seviye)
          .map(([uzmanlik_id, seviye]) => ({ user_id: person.id, uzmanlik_id, seviye }))
        if (rows.length) {
          const saved = await supabase.from('kisi_uzmanliklari').upsert(rows, { onConflict: 'user_id,uzmanlik_id' })
          if (saved.error) throw saved.error
        }
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
        <Field label={t('Ad soyad')}>
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
          <Field label={t('Kullanıcı adı')} hint={t('Değiştirirseniz kişi yeni adla giriş yapar; şifresi aynı kalır.')}>
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
        <PersonFields
          data={data}
          rol={rol}
          canChooseRol={isCeo}
          bolumId={bolumId}
          levels={levels}
          onRol={setRol}
          onBolum={setBolumId}
          onLevels={setLevels}
        />
        {isCeo ? (
          <Field
            label={t('Yeni şifre ver')}
            hint={t('Kişi şifresini unuttuysa buraya yenisini yazın. Değiştirmek istemiyorsanız boş bırakın.')}
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
          {busy ? t('Kaydediliyor…') : t('Kaydet')}
        </button>
      </form>

      {isCeo && !isSelf ? (
        confirmRemove ? (
          <div className="dialog-foot">
            <div className="note note-error">
              {t('{name} artık giriş yapamayacak. Geçmiş işlerde adı görünmeye devam eder.', { name: person.full_name })}
            </div>
            <button type="button" className="btn btn-danger btn-big press" disabled={busy} onClick={remove}>
              {t('Evet, kişiyi çıkar')}
            </button>
            <button type="button" className="btn btn-quiet btn-big press" onClick={() => setConfirmRemove(false)}>
              {t('Vazgeç')}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-danger btn-big press" onClick={() => setConfirmRemove(true)}>
            {t('Kişiyi çıkar')}
          </button>
        )
      ) : null}
    </Dialog>
  )
}
