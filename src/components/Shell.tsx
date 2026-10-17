import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useProfile } from '../lib/auth'
import type { Panel } from '../lib/supabase'
import { Icon, type IconName } from './ui'

type Tab = { to: string; label: string; icon: IconName }

const ISLERIM: Tab = { to: '/islerim', label: 'İşlerim', icon: 'list' }
const PROJELER: Tab = { to: '/projeler', label: 'Projeler', icon: 'folder' }
const EKIP: Tab = { to: '/ekip', label: 'Ekip', icon: 'people' }
const AYARLAR: Tab = { to: '/ayarlar', label: 'Ayarlar', icon: 'gear' }

// The daily screens only; lists set up once (Firmalar, Türler, Uzmanlıklar)
// live in Ayarlar. Genel Müdür and IT ('ceo') hand out work rather than
// receiving it, so have no İşlerim.
const TABS: Record<Panel, Tab[]> = {
  ceo: [PROJELER, EKIP, AYARLAR],
  manager: [ISLERIM, PROJELER, EKIP, AYARLAR],
  worker: [ISLERIM, PROJELER, AYARLAR],
}

/** The frame around every signed-in screen: top bar and navigation. */
export function Shell({ children }: { children: ReactNode }) {
  const profile = useProfile()
  const tabs = TABS[profile.panel]

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
        <Link to="/ayarlar" className="account press" aria-label={`${profile.full_name}: Ayarlar`}>
          <Icon name="person" size={20} />
          <span>{profile.full_name}</span>
        </Link>
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
    </>
  )
}

/** Shown above the lists that open from Ayarlar. */
export function BackToSettings() {
  return (
    <Link to="/ayarlar" className="back press">
      <Icon name="back" size={20} />
      Ayarlar
    </Link>
  )
}
