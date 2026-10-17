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
  active: boolean
  /** Null for people without a bölüm, and for everyone until 0007 has been run. */
  bolum_id: string | null
}

/** A bölüm (department or workshop): a list the workshop edits itself. */
export type Bolum = { id: string; name: string }

/**
 * How experienced a Personel is. Seen only by the CEO and managers. Kalfa and
 * Çırak work the same way (their finish waits for approval); an Usta's does not.
 */
export type Seviye = 'usta' | 'kalfa' | 'cirak'

export const SEVIYELER: Seviye[] = ['usta', 'kalfa', 'cirak']

export const SEVIYE_LABEL: Record<Seviye, string> = {
  usta: 'Usta',
  kalfa: 'Kalfa',
  cirak: 'Çırak',
}

/** A Personel without a stored level counts as Kalfa, as in the database. */
export const DEFAULT_SEVIYE: Seviye = 'kalfa'

const PROFILE_COLUMNS = 'id, full_name, username, panel, active'

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === '42703' || /column .* does not exist/i.test(error.message ?? ''))

/**
 * Reads people. Until 0007 has been run the bölüm column does not exist; the
 * app then reads without it and reports bolumReady: false, so it keeps working
 * and simply hides bölümler and levels.
 */
export async function fetchProfiles(only: { id?: string; active?: boolean } = {}) {
  const query = (columns: string) => {
    let q = supabase.from('profiles').select(columns)
    if (only.id) q = q.eq('id', only.id)
    if (only.active) q = q.eq('active', true)
    return q.order('full_name')
  }
  const full = await query(`${PROFILE_COLUMNS}, bolum_id`)
  if (!isMissingColumn(full.error)) {
    return { data: full.data as unknown as Profile[] | null, error: full.error, bolumReady: true }
  }
  const basic = await query(PROFILE_COLUMNS)
  const data = (basic.data as unknown as Omit<Profile, 'bolum_id'>[] | null)?.map((p) => ({ ...p, bolum_id: null }))
  return { data: data ?? null, error: basic.error, bolumReady: false }
}

export const PANEL_LABEL: Record<Panel, string> = {
  ceo: 'CEO',
  manager: 'Yönetici',
  worker: 'Personel',
}

/** CEO and managers run the workshop; workers see it read-only. */
export const canManage = (panel: Panel) => panel === 'ceo' || panel === 'manager'
