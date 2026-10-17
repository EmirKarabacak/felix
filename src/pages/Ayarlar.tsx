import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNote, Field, Icon, Switch, type IconName } from '../components/ui'
import { useAuth, useProfile } from '../lib/auth'
import { friendly } from '../lib/errors'
import { canManage, rememberMe, rolLabel, supabase } from '../lib/supabase'
import { useWorkshop } from '../lib/workshop'
import { MIN_PASSWORD_LENGTH } from '../../shared/username'

const LISTS: { to: string; label: string; note: string; icon: IconName }[] = [
  { to: '/firmalar', label: 'Firmalar', note: 'Müşteri firmalar ve iletişim bilgileri', icon: 'building' },
  { to: '/turler', label: 'Türler', note: 'Proje ve adım türleri', icon: 'layers' },
  { to: '/uzmanliklar', label: 'Uzmanlıklar', note: 'İmalattaki uzmanlıklar: Kaynakçı, Elektrikçi…', icon: 'wrench' },
]

/** Everyone's account, plus the lists Genel Müdür, IT and Bölüm Sorumluları set up once. */
export function Ayarlar() {
  const profile = useProfile()
  const { signOut } = useAuth()
  const { data } = useWorkshop()
  const manages = canManage(profile.panel)
  const bolum = data?.bolumName(profile.bolum_id)

  return (
    <div className="page settings">
      <div className="page-head">
        <div>
          <h1>Ayarlar</h1>
          <div className="sub">{profile.full_name}</div>
        </div>
      </div>

      <section className="stack" aria-label="Hesabım">
        <h3>Hesabım</h3>
        <div className="card rows facts">
          <div className="fact">
            <span>Kullanıcı adı</span>
            <span className="value mono">{profile.username}</span>
          </div>
          <div className="fact">
            <span>Rol</span>
            <span className="value">{rolLabel(profile)}</span>
          </div>
          {bolum ? (
            <div className="fact">
              <span>Bölüm</span>
              <span className="value">{bolum}</span>
            </div>
          ) : null}
          <RememberRow />
        </div>
        <PasswordForm />
      </section>

      {manages ? (
        <section className="stack" aria-label="Listeler">
          <h3>Listeler</h3>
          <div className="card rows link-list">
            {LISTS.map((l) => (
              <Link key={l.to} to={l.to} className="link-row press">
                <Icon name={l.icon} size={22} />
                <span className="link-text">
                  <span className="link-label">{l.label}</span>
                  <span className="sub">{l.note}</span>
                </span>
                <span className="go">
                  <Icon name="chevron" size={18} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="stack" aria-label="Ana ekrana ekle">
        <h3>Felix'i ana ekrana ekle</h3>
        <div className="card home-guide">
          <p>
            <strong>iPhone:</strong> Felix'i Safari'de açın, alttaki paylaş düğmesine (yukarı ok olan kare) dokunun,
            ardından <strong>Ana Ekrana Ekle</strong>'yi seçin.
          </p>
          <p>
            <strong>Android:</strong> Felix'i Chrome'da açın, sağ üstteki üç noktaya dokunun, ardından{' '}
            <strong>Ana ekrana ekle</strong>'yi seçin.
          </p>
        </div>
      </section>

      <button type="button" className="btn btn-danger btn-big press" onClick={() => void signOut()}>
        Çıkış yap
      </button>
    </div>
  )
}

/** "Beni hatırla", changeable after signing in as well. */
function RememberRow() {
  const [on, setOn] = useState(rememberMe.get)
  return (
    <label className="fact">
      <span>
        Beni hatırla
        <span className="sub block">Kapalıysa tarayıcı kapanınca oturum kapanır. Ortak telefonda kapatın.</span>
      </span>
      <Switch
        checked={on}
        onChange={async (next) => {
          rememberMe.set(next)
          setOn(next)
          // Storing the session again moves it to where the new choice keeps it.
          await supabase.auth.refreshSession()
        }}
      />
    </label>
  )
}

function PasswordForm() {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setSaved(false)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(friendly(error))
      return
    }
    setPassword('')
    setSaved(true)
  }

  return (
    <form onSubmit={changePassword} className="card password-form">
      <Field label="Yeni şifre" hint={`En az ${MIN_PASSWORD_LENGTH} karakter.`}>
        {(id) => (
          <input
            id={id}
            className="input"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setSaved(false)
            }}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        )}
      </Field>
      <ErrorNote>{error}</ErrorNote>
      {saved ? (
        <div className="note note-info" role="status">
          Şifreniz değiştirildi.
        </div>
      ) : null}
      <button type="submit" className="btn btn-tint btn-big press" disabled={busy}>
        {busy ? 'Kaydediliyor…' : 'Şifremi değiştir'}
      </button>
    </form>
  )
}
