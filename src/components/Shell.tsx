import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth, useProfile } from '../lib/auth'
import { friendly } from '../lib/errors'
import { PANEL_LABEL, canManage, supabase } from '../lib/supabase'
import { MIN_PASSWORD_LENGTH } from '../../shared/username'
import { Dialog, ErrorNote, Field, Icon, type IconName } from './ui'

type Tab = { to: string; label: string; icon: IconName }

const MANAGER_TABS: Tab[] = [
  { to: '/projeler', label: 'Projeler', icon: 'folder' },
  { to: '/firmalar', label: 'Firmalar', icon: 'building' },
  { to: '/turler', label: 'Türler', icon: 'layers' },
  { to: '/ekip', label: 'Ekip', icon: 'people' },
]

const WORKER_TABS: Tab[] = [
  { to: '/islerim', label: 'İşlerim', icon: 'list' },
  { to: '/projeler', label: 'Projeler', icon: 'folder' },
]

/** The frame around every signed-in screen: top bar, navigation, account. */
export function Shell({ children }: { children: ReactNode }) {
  const profile = useProfile()
  const [accountOpen, setAccountOpen] = useState(false)
  const tabs = canManage(profile.panel) ? MANAGER_TABS : WORKER_TABS

  return (
    <>
      <header className="topbar glass">
        <Link to="/" className="brand">
          <Icon name="drop" size={24} />
          Felix
        </Link>
        <nav className="topnav" aria-label="Bölümler">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} className="press">
              {t.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="account press" onClick={() => setAccountOpen(true)}>
          <Icon name="person" size={20} />
          <span>{profile.full_name}</span>
        </button>
      </header>

      <main>{children}</main>

      <nav className="tabbar glass" aria-label="Bölümler">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} className="press">
            {({ isActive }) => (
              <>
                <Icon name={t.icon} size={25} filled={isActive} />
                {t.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {accountOpen ? <AccountDialog onClose={() => setAccountOpen(false)} /> : null}
    </>
  )
}

function AccountDialog({ onClose }: { onClose: () => void }) {
  const profile = useProfile()
  const { signOut } = useAuth()
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
    <Dialog
      title={profile.full_name}
      subtitle={`${profile.username} · ${PANEL_LABEL[profile.panel]}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-danger btn-big press" onClick={() => void signOut()}>
          Çıkış yap
        </button>
      }
    >
      <form onSubmit={changePassword} className="dialog-body">
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
    </Dialog>
  )
}
