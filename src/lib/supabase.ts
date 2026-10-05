import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False when the app was built without its Supabase settings. */
export const isConfigured = Boolean(url && anonKey)

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing')

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
