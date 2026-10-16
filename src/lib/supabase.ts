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
  /** Null for people without a bölüm, and for everyone until 0006_bolumler.sql has run. */
  bolum: Bolum | null
  atolye_id: string | null
}

export type Meslek = { id: string; name: string }
export type Atolye = { id: string; name: string }

/** The department someone works in. It decides which version of the app they get. */
export type Bolum = 'uretim' | 'tasarim' | 'satinalma' | 'muhasebe'

export const BOLUMLER: Bolum[] = ['uretim', 'tasarim', 'satinalma', 'muhasebe']

export const BOLUM_LABEL: Record<Bolum, string> = {
  uretim: 'Üretim',
  tasarim: 'Tasarım',
  satinalma: 'Satın alma',
  muhasebe: 'Muhasebe',
}

const PROFILE_COLUMNS = 'id, full_name, username, panel, meslek_id, active'

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === '42703' || /column .* does not exist/i.test(error.message ?? ''))

/**
 * Reads people. Until 0006_bolumler.sql has been run the bölüm columns do not
 * exist; the app then reads without them and reports bolumReady: false, so it
 * keeps working and simply hides bölümler and atölyeler.
 */
export async function fetchProfiles(only: { id?: string; active?: boolean } = {}) {
  const query = (columns: string) => {
    let q = supabase.from('profiles').select(columns)
    if (only.id) q = q.eq('id', only.id)
    if (only.active) q = q.eq('active', true)
    return q.order('full_name')
  }
  const full = await query(`${PROFILE_COLUMNS}, bolum, atolye_id`)
  if (!isMissingColumn(full.error)) {
    return { data: full.data as unknown as Profile[] | null, error: full.error, bolumReady: true }
  }
  const basic = await query(PROFILE_COLUMNS)
  const data = (basic.data as unknown as Omit<Profile, 'bolum' | 'atolye_id'>[] | null)?.map((p) => ({
    ...p,
    bolum: null,
    atolye_id: null,
  }))
  return { data: data ?? null, error: basic.error, bolumReady: false }
}

export const PANEL_LABEL: Record<Panel, string> = {
  ceo: 'CEO',
  manager: 'Yönetici',
  worker: 'İşçi',
}

/** CEO and managers run the workshop; workers see it read-only. */
export const canManage = (panel: Panel) => panel === 'ceo' || panel === 'manager'
