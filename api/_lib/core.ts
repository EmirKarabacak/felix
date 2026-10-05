import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import {
  MIN_PASSWORD_LENGTH,
  baseUrl,
  isValidUsername,
  normalizeUsername,
  usernameToEmail,
} from '../../shared/username.js'

// Everything that creates or removes a person runs here, on the server, with
// the service-role key. The browser never holds that key.

export type Reply = { status: number; body: Record<string, unknown> }
export type Call = { method: string; body: unknown; authorization: string | undefined }

type Panel = 'ceo' | 'manager' | 'worker'
const PANELS: Panel[] = ['ceo', 'manager', 'worker']

const fail = (status: number, error: string): Reply => ({ status, body: { error } })
const ok = (body: Record<string, unknown> = {}): Reply => ({ status: 200, body: { ok: true, ...body } })

export function adminClient(): SupabaseClient {
  const url = baseUrl(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('Sunucu ayarları eksik: SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body === 'string') {
    try {
      return asRecord(JSON.parse(body))
    } catch {
      return {}
    }
  }
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

type NewPerson = { fullName: string; username: string; password: string }

function readNewPerson(input: Record<string, unknown>): NewPerson | string {
  const fullName = text(input.full_name)
  const username = normalizeUsername(text(input.username))
  const password = typeof input.password === 'string' ? input.password : ''
  if (fullName.length < 1 || fullName.length > 80) return 'Ad soyad gerekli.'
  if (!isValidUsername(username)) return 'Kullanıcı adı en az 3 karakter olmalı; harf, rakam, nokta, tire kullanılabilir.'
  if (password.length < MIN_PASSWORD_LENGTH) return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`
  return { fullName, username, password }
}

async function createPerson(
  db: SupabaseClient,
  person: NewPerson,
  panel: Panel,
  meslekId: string | null,
): Promise<Reply> {
  const taken = await db.from('profiles').select('id').eq('username', person.username).maybeSingle()
  if (taken.error) return fail(500, taken.error.message)
  if (taken.data) return fail(409, 'Bu kullanıcı adı zaten kullanılıyor.')

  const created = await db.auth.admin.createUser({
    email: usernameToEmail(person.username),
    password: person.password,
    email_confirm: true,
  })
  if (created.error || !created.data.user) {
    return fail(400, created.error?.message ?? 'Hesap oluşturulamadı.')
  }
  const id = created.data.user.id

  const inserted = await db.from('profiles').insert({
    id,
    full_name: person.fullName,
    username: person.username,
    panel,
    meslek_id: meslekId,
  })
  if (inserted.error) {
    // Do not leave a sign-in without a profile behind.
    await db.auth.admin.deleteUser(id)
    return fail(400, inserted.error.message)
  }
  return ok({ id })
}

/** Resolves the caller from their session token and requires an active CEO. */
async function requireCeo(db: SupabaseClient, authorization: string | undefined): Promise<string | Reply> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return fail(401, 'Oturum bulunamadı. Yeniden giriş yapın.')
  const who = await db.auth.getUser(token)
  if (who.error || !who.data.user) return fail(401, 'Oturum geçersiz. Yeniden giriş yapın.')
  const profile = await db
    .from('profiles')
    .select('panel, active')
    .eq('id', who.data.user.id)
    .maybeSingle()
  if (profile.error) return fail(500, profile.error.message)
  if (!profile.data?.active || profile.data.panel !== 'ceo') {
    return fail(403, 'Bu işlemi yalnızca CEO yapabilir.')
  }
  return who.data.user.id
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** POST /api/setup: creates the first CEO. Works only while there are no people at all. */
export async function handleSetup(call: Call, db: SupabaseClient = adminClient()): Promise<Reply> {
  if (call.method !== 'POST') return fail(405, 'Yöntem desteklenmiyor.')
  const input = asRecord(call.body)

  const expected = process.env.FELIX_SETUP_CODE ?? ''
  if (!expected) return fail(503, 'Kurulum kodu sunucuda tanımlı değil (FELIX_SETUP_CODE).')
  if (!sameSecret(text(input.code), expected)) return fail(403, 'Kurulum kodu hatalı.')

  const existing = await db.from('profiles').select('id', { count: 'exact', head: true })
  if (existing.error) return fail(500, existing.error.message)
  if ((existing.count ?? 0) > 0) return fail(409, 'Kurulum zaten yapılmış. Giriş yapın.')

  const person = readNewPerson(input)
  if (typeof person === 'string') return fail(400, person)
  return createPerson(db, person, 'ceo', null)
}

/** /api/users: POST adds a person, PATCH sets a new password, DELETE removes a person. CEO only. */
export async function handleUsers(call: Call, db: SupabaseClient = adminClient()): Promise<Reply> {
  const caller = await requireCeo(db, call.authorization)
  if (typeof caller !== 'string') return caller
  const input = asRecord(call.body)

  if (call.method === 'POST') {
    const person = readNewPerson(input)
    if (typeof person === 'string') return fail(400, person)
    const panel = PANELS.includes(input.panel as Panel) ? (input.panel as Panel) : 'worker'
    const meslekId = text(input.meslek_id) || null
    return createPerson(db, person, panel, meslekId)
  }

  const id = text(input.id)
  if (!id) return fail(400, 'Kişi seçilmedi.')
  const target = await db.from('profiles').select('id, active').eq('id', id).maybeSingle()
  if (target.error) return fail(500, target.error.message)
  if (!target.data?.active) return fail(404, 'Kişi bulunamadı.')

  if (call.method === 'PATCH') {
    const password = typeof input.password === 'string' ? input.password : ''
    if (password.length < MIN_PASSWORD_LENGTH) {
      return fail(400, `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`)
    }
    const updated = await db.auth.admin.updateUserById(id, { password })
    if (updated.error) return fail(400, updated.error.message)
    return ok()
  }

  if (call.method === 'DELETE') {
    if (id === caller) return fail(400, 'Kendi hesabınızı silemezsiniz.')
    // The person is deactivated rather than erased, so their name stays on
    // past work. Their username is released for reuse and they can no longer sign in.
    const freed = `silindi-${id.replace(/-/g, '').slice(0, 20)}`
    const profile = await db.from('profiles').update({ active: false, username: freed }).eq('id', id)
    if (profile.error) return fail(400, profile.error.message)
    const banned = await db.auth.admin.updateUserById(id, {
      email: usernameToEmail(freed),
      ban_duration: '876000h',
    })
    if (banned.error) return fail(500, banned.error.message)
    return ok()
  }

  return fail(405, 'Yöntem desteklenmiyor.')
}

/** Runs a handler and turns anything unexpected into a readable error. */
export async function run(handler: (call: Call) => Promise<Reply>, call: Call): Promise<Reply> {
  try {
    return await handler(call)
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Beklenmeyen bir hata oluştu.')
  }
}
