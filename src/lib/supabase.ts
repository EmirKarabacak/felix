import { createClient } from '@supabase/supabase-js'
import { baseUrl } from '../../shared/username'

const url = baseUrl(import.meta.env.VITE_SUPABASE_URL)
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

/** False when the app was built without its Supabase settings. */
export const isConfigured = Boolean(url && anonKey)

const REMEMBER_KEY = 'felix.remember'

/**
 * "Beni hatırla". On (the default): the sign-in is kept on this device until
 * the person signs out. Off: it lasts only until the browser or tab is closed,
 * which is the right choice on a shared phone or computer.
 */
export const rememberMe = {
  get: () => {
    try {
      return localStorage.getItem(REMEMBER_KEY) !== '0'
    } catch {
      return true
    }
  },
  set: (on: boolean) => {
    try {
      localStorage.setItem(REMEMBER_KEY, on ? '1' : '0')
    } catch {
      // Storage can be blocked (private mode); the sign-in then simply is not kept.
    }
  },
}

// Where the sign-in is stored follows the choice above. Reads look in both
// places so a choice made earlier keeps working.
const authStorage = {
  getItem: (key: string) => localStorage.getItem(key) ?? sessionStorage.getItem(key),
  setItem: (key: string, value: string) => {
    const [keep, drop] = rememberMe.get() ? [localStorage, sessionStorage] : [sessionStorage, localStorage]
    keep.setItem(key, value)
    drop.removeItem(key)
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: { storage: authStorage, persistSession: true, autoRefreshToken: true },
})

export type Panel = 'ceo' | 'manager' | 'worker'

export type Profile = {
  id: string
  full_name: string
  username: string
  panel: Panel
  meslek_id: string | null
  active: boolean
}

export type Meslek = { id: string; name: string }

export const PANEL_LABEL: Record<Panel, string> = {
  ceo: 'CEO',
  manager: 'Yönetici',
  worker: 'İşçi',
}

/** CEO and managers run the workshop; workers see it read-only. */
export const canManage = (panel: Panel) => panel === 'ceo' || panel === 'manager'
