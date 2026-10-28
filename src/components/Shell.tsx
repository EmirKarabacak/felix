import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useProfile } from '../lib/auth'
import { t } from '../lib/i18n'
import type { Panel } from '../lib/supabase'
import { Bell, PushPrompt } from './Bildirimler'
import { Icon, type IconName } from './ui'

// Labels are Turkish, shown through t().
type Tab = { to: string; label: string; icon: IconName }

const OZET: Tab = { to: '/ozet', label: 'Özet', icon: 'chart' } // i18n-ok
const ISLERIM: Tab = { to: '/islerim', label: 'İşlerim', icon: 'list' } // i18n-ok
const PROJELER: Tab = { to: '/projeler', label: 'Projeler', icon: 'folder' }
const EKIP: Tab = { to: '/ekip', label: 'Ekip', icon: 'people' }
const AYARLAR: Tab = { to: '/ayarlar', label: 'Ayarlar', icon: 'gear' }

// The daily screens only; lists set up once (Firmalar, Türler, Uzmanlıklar)
// live in Ayarlar. Genel Müdür and IT ('ceo') hand out work rather than
// receiving it, so have no İşlerim; Özet sums up the workshop for them.
const TABS: Record<Panel, Tab[]> = {
  ceo: [PROJELER, OZET, EKIP, AYARLAR],
  manager: [ISLERIM, PROJELER, EKIP, AYARLAR],
  worker: [ISLERIM, PROJELER, AYARLAR],
}

/** The frame around every signed-in screen: top bar and navigation. */
export function Shell({ children }: { children: ReactNode }) {
  const profile = useProfile()
  const tabs = TABS[profile.panel]
  const navigate = useNavigate()

  // A phone alert tapped while Felix is already open: go to its step.
  useEffect(() => {
    const onWorker = (e: MessageEvent) => {
      if (e.data?.type !== 'felix-ac' || typeof e.data.url !== 'string') return
      const url = new URL(e.data.url, window.location.origin)
      if (url.origin === window.location.origin) navigate(url.pathname + url.search)
    }
    navigator.serviceWorker?.addEventListener('message', onWorker)
    return () => navigator.serviceWorker?.removeEventListener('message', onWorker)
  }, [navigate])

  return (
    <>
      <header className="topbar glass">
        <Link to="/" className="brand">
          <Icon name="drop" size={24} />
          Felix
        </Link>
        <nav className="topnav" aria-label={t('Bölümler')}>
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className="press">
              {t(tab.label)}
            </NavLink>
          ))}
        </nav>
        <div className="top-actions">
          <Bell />
          <Link to="/ayarlar" className="account press" aria-label={`${profile.full_name}: ${t('Ayarlar')}`}>
            <Icon name="person" size={20} />
            <span>{profile.full_name}</span>
          </Link>
        </div>
      </header>

      <main>
        <PushPrompt />
        {children}
      </main>

      <nav className="tabbar glass" aria-label={t('Bölümler')}>
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className="press">
            {({ isActive }) => (
              <>
                <Icon name={tab.icon} size={25} filled={isActive} />
                {t(tab.label)}
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
      {t('Ayarlar')}
    </Link>
  )
}
