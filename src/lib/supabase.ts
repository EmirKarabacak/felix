import { createClient } from '@supabase/supabase-js'
import { baseUrl } from '../../shared/username'
import { t } from './i18n'

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

/** Which of the two "everything" roles a 'ceo' panel person is (0008). */
export type Unvan = 'genel_mudur' | 'it'

export type Profile = {
  id: string
  full_name: string
  username: string
  panel: Panel
  /** 'genel_mudur' or 'it' for the 'ceo' panel, otherwise null. Null for everyone until 0008 has run. */
  unvan: Unvan | null
  active: boolean
  /** Null for people without a bölüm, and for everyone until 0007 has been run. */
  bolum_id: string | null
}

/** The four fixed bölümler (0008). Before 0008 the list was editable and had no code. */
export type BolumKod = 'satinalma' | 'tasarim' | 'imalat' | 'muhasebe'
export type Bolum = { id: string; name: string; kod: BolumKod | null }

/**
 * How experienced a Personel is in one uzmanlık. Seen only by Genel Müdür, IT
 * and Bölüm Sorumluları. Only an Usta's finish counts at once.
 */
export type Seviye = 'usta' | 'kalfa' | 'cirak'

export const SEVIYELER: Seviye[] = ['usta', 'kalfa', 'cirak']

/** Turkish; shown through t() or seviyeLabel(). */
export const SEVIYE_LABEL: Record<Seviye, string> = {
  usta: 'Usta',
  kalfa: 'Kalfa',
  cirak: 'Çırak', // i18n-ok
}

export const seviyeLabel = (s: Seviye) => t(SEVIYE_LABEL[s])

/** A newly ticked uzmanlık starts at Kalfa, as in the database. */
export const DEFAULT_SEVIYE: Seviye = 'kalfa'

/** Shown (through t()) wherever levels and step types' uzmanlık are set. Emir's wording. */
export const ONAY_KURALI =
  'Onay kuralı: Bir adımı bitiren kişinin, o adımın uzmanlığındaki seviyesi geçerlidir. Kaynakta Usta olan biri kaynak adımını bitirince iş hemen biter. Aynı kişi elektrik adımını bitirirse ve elektrikte Çırak ise ya da hiç Elektrikçi uzmanlığı yoksa, iş onay bekler.' // i18n-ok

const PROFILE_COLUMNS = 'id, full_name, username, panel, active'

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === '42703' || /column .* does not exist/i.test(error.message ?? ''))

/**
 * Which database updates have been run: 7 after 0007 (bölümler), 8 after 0008
 * (Genel Müdür and IT, Uzmanlık, Talepler, Dosyalar), 0 before either.
 */
export type DbStage = 0 | 7 | 8

/**
 * Reads people. Before a migration has run its columns do not exist; the app
 * then reads without them and reports the stage, so it keeps working and
 * simply hides what is not there yet.
 */
export async function fetchProfiles(only: { id?: string; active?: boolean } = {}) {
  const query = (columns: string) => {
    let q = supabase.from('profiles').select(columns)
    if (only.id) q = q.eq('id', only.id)
    if (only.active) q = q.eq('active', true)
    return q.order('full_name')
  }
  const full = await query(`${PROFILE_COLUMNS}, bolum_id, unvan`)
  if (!isMissingColumn(full.error)) {
    return { data: full.data as unknown as Profile[] | null, error: full.error, stage: 8 as DbStage }
  }
  const mid = await query(`${PROFILE_COLUMNS}, bolum_id`)
  if (!isMissingColumn(mid.error)) {
    const data = (mid.data as unknown as Omit<Profile, 'unvan'>[] | null)?.map((p) => ({ ...p, unvan: null }))
    return { data: data ?? null, error: mid.error, stage: 7 as DbStage }
  }
  const basic = await query(PROFILE_COLUMNS)
  const data = (basic.data as unknown as Omit<Profile, 'bolum_id' | 'unvan'>[] | null)?.map((p) => ({
    ...p,
    bolum_id: null,
    unvan: null,
  }))
  return { data: data ?? null, error: basic.error, stage: 0 as DbStage }
}

/**
 * The four roles people choose from. Genel Müdür and IT have every right
 * (the 'ceo' panel); Bölüm Sorumlusu runs the workshop (the 'manager' panel);
 * Personel do their own jobs.
 */
export type Rol = 'genel_mudur' | 'it' | 'manager' | 'worker'

/** Turkish; shown through rolName() or rolLabel(). */
export const ROL_LABEL: Record<Rol, string> = {
  genel_mudur: 'Genel Müdür', // i18n-ok
  it: 'IT',
  manager: 'Bölüm Sorumlusu', // i18n-ok
  worker: 'Personel',
}

export const rolName = (rol: Rol) => t(ROL_LABEL[rol])

export const rolOf = (p: Pick<Profile, 'panel' | 'unvan'>): Rol =>
  p.panel === 'ceo' ? (p.unvan === 'it' ? 'it' : 'genel_mudur') : p.panel

export const panelOf = (rol: Rol): { panel: Panel; unvan: Unvan | null } =>
  rol === 'genel_mudur' || rol === 'it' ? { panel: 'ceo', unvan: rol } : { panel: rol, unvan: null }

export const rolLabel = (p: Pick<Profile, 'panel' | 'unvan'>) => rolName(rolOf(p))

/** Genel Müdür, IT and Bölüm Sorumluları run the workshop; Personel see it read-only. */
export const canManage = (panel: Panel) => panel === 'ceo' || panel === 'manager'
