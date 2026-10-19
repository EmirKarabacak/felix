import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNote, Field, Icon, Segmented, Switch, type IconName } from '../components/ui'
import { useAuth, useProfile } from '../lib/auth'
import { friendly } from '../lib/errors'
import { setLang, setTheme, t, useSettings, type Lang, type Theme } from '../lib/i18n'
import { canManage, rememberMe, rolLabel, supabase } from '../lib/supabase'
import { useWorkshop } from '../lib/workshop'
import { MIN_PASSWORD_LENGTH } from '../../shared/username'

const lists = (): { to: string; label: string; note: string; icon: IconName }[] => [
  { to: '/firmalar', label: t('Firmalar'), note: t('Sipariş veren firmalar ve iletişim bilgileri'), icon: 'building' },
  { to: '/turler', label: t('Türler'), note: t('Proje ve adım türleri'), icon: 'layers' },
  { to: '/uzmanliklar', label: t('Uzmanlıklar'), note: t('İmalattaki uzmanlıklar: Kaynakçı, Elektrikçi…'), icon: 'wrench' },
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
          <h1>{t('Ayarlar')}</h1>
          <div className="sub">{profile.full_name}</div>
        </div>
      </div>

      <section className="stack" aria-label={t('Hesabım')}>
        <h3>{t('Hesabım')}</h3>
        <div className="card rows facts">
          <div className="fact">
            <span>{t('Kullanıcı adı')}</span>
            <span className="value mono">{profile.username}</span>
          </div>
          <div className="fact">
            <span>{t('Rol')}</span>
            <span className="value">{t(rolLabel(profile))}</span>
          </div>
          {bolum ? (
            <div className="fact">
              <span>{t('Bölüm')}</span>
              <span className="value">{t(bolum)}</span>
            </div>
          ) : null}
          <RememberRow />
        </div>
        <PasswordForm />
      </section>

      <Appearance />

      {manages ? (
        <section className="stack" aria-label={t('Listeler')}>
          <h3>{t('Listeler')}</h3>
          <div className="card rows link-list">
            {lists().map((l) => (
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

      <section className="stack" aria-label={t('Ana ekrana ekle')}>
        <h3>{t("Felix'i ana ekrana ekle")}</h3>
        <div className="card home-guide">
          <p>
            <strong>iPhone:</strong>{' '}
            <WithButton
              text={t("Felix'i Safari'de açın, alttaki paylaş düğmesine (yukarı ok olan kare) dokunun, ardından {button}'yi seçin.")}
              button={t('Ana Ekrana Ekle')}
            />
          </p>
          <p>
            <strong>Android:</strong>{' '}
            <WithButton
              text={t("Felix'i Chrome'da açın, sağ üstteki üç noktaya dokunun, ardından {button}'yi seçin.")}
              button={t('Ana ekrana ekle')}
            />
          </p>
        </div>
      </section>

      <button type="button" className="btn btn-danger btn-big press" onClick={() => void signOut()}>
        {t('Çıkış yap')}
      </button>
    </div>
  )
}

/** Language and theme, kept on this device. "Sistem" follows the phone's own light or dark setting. */
function Appearance() {
  const { lang, theme } = useSettings()
  return (
    <section className="stack" aria-label={t('Dil ve görünüm')}>
      <h3>{t('Dil ve görünüm')}</h3>
      <div className="card password-form">
        {/* Each language is named in itself, so anyone can find their own. */}
        <Segmented<Lang>
          label={t('Dil')}
          value={lang}
          options={[
            { value: 'tr', label: 'Türkçe' }, // i18n-ok
            { value: 'en', label: 'English' },
          ]}
          onChange={setLang}
        />
        <Segmented<Theme>
          label={t('Tema')}
          value={theme}
          options={[
            { value: 'system', label: t('Sistem') },
            { value: 'light', label: t('Açık|tema') },
            { value: 'dark', label: t('Koyu') },
          ]}
          onChange={setTheme}
        />
      </div>
    </section>
  )
}

/** A sentence with the name of a phone's button, in bold, where {button} stands. */
function WithButton({ text, button }: { text: string; button: string }) {
  const [before, after = ''] = text.split('{button}')
  return (
    <>
      {before}
      <strong>{button}</strong>
      {after}
    </>
  )
}

/** "Beni hatırla", changeable after signing in as well. */
function RememberRow() {
  const [on, setOn] = useState(rememberMe.get)
  return (
    <label className="fact">
      <span>
        {t('Beni hatırla')}
        <span className="sub block">{t('Kapalıysa tarayıcı kapanınca oturum kapanır. Ortak telefonda kapatın.')}</span>
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
      <Field label={t('Yeni şifre')} hint={t('En az {n} karakter.', { n: MIN_PASSWORD_LENGTH })}>
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
          {t('Şifreniz değiştirildi.')}
        </div>
      ) : null}
      <button type="submit" className="btn btn-tint btn-big press" disabled={busy}>
        {busy ? t('Kaydediliyor…') : t('Şifremi değiştir')}
      </button>
    </form>
  )
}
