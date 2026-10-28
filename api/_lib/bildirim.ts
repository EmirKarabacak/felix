import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { bildirimAdresi, bildirimMetni, type BildirimMetinVerisi } from '../../shared/bildirim.js'
import { adminClient, fail, ok, requireUser, type Call, type Reply } from './core.js'

// Phone alerts. The database writes each alert (0010); this sends the ones not
// sent yet to every phone their person allowed alerts on, in that phone's
// language. The app calls it right after anything that may have made alerts.
// Any signed-in person may call it: it only ever sends what is waiting.

/** Older alerts are only shown in the bell; a phone alert a day late helps nobody. */
const FRESH_MS = 24 * 3600 * 1000
/** How long the push service keeps trying a phone that is off (a night and a weekend day). */
const TTL_SECONDS = 2 * 24 * 3600

type Keys = { public_key: string; private_key: string }
type Device = { endpoint: string; user_id: string; p256dh: string; auth: string; lang: 'tr' | 'en' }
type Pending = BildirimMetinVerisi & { id: string; user_id: string; created_at: string }

/**
 * The signing keys phones use to know alerts really come from this Felix.
 * Made the first time and kept in the database, where only the server reads them.
 */
async function keys(db: SupabaseClient): Promise<Keys> {
  const read = () => db.from('push_anahtar').select('public_key, private_key').eq('id', 1).maybeSingle()
  const found = await read()
  if (found.error) throw new Error(found.error.message)
  if (found.data) return found.data as Keys
  const made = webpush.generateVAPIDKeys()
  // Two first calls at once: the first one's keys win, and both use them.
  const saved = await db
    .from('push_anahtar')
    .upsert({ id: 1, public_key: made.publicKey, private_key: made.privateKey }, { onConflict: 'id', ignoreDuplicates: true })
  if (saved.error) throw new Error(saved.error.message)
  const again = await read()
  if (again.error || !again.data) throw new Error(again.error?.message ?? 'push_anahtar')
  return again.data as Keys
}

/** Who the alerts are from, as push services require: the site's own address. */
function subject(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  return host ? `https://${host}` : 'https://felix.local'
}

export async function sendPending(db: SupabaseClient) {
  // Claiming and marking are one step, so two calls at once never send twice.
  const claimed = await db
    .from('bildirimler')
    .update({ pushed_at: new Date().toISOString() })
    .is('pushed_at', null)
    .select('id, user_id, kind, project_id, step_id, adim, proje, kim, sebep, detay, created_at')
  if (claimed.error) throw new Error(claimed.error.message)
  const since = Date.now() - FRESH_MS
  const fresh = ((claimed.data ?? []) as Pending[]).filter((b) => new Date(b.created_at).getTime() >= since)
  if (!fresh.length) return { sent: 0, failed: 0 }

  const people = [...new Set(fresh.map((b) => b.user_id))]
  const [devices, unread] = await Promise.all([
    db.from('push_cihazlar').select('endpoint, user_id, p256dh, auth, lang').in('user_id', people),
    db.from('bildirimler').select('user_id').in('user_id', people).is('read_at', null),
  ])
  if (devices.error) throw new Error(devices.error.message)
  if (unread.error) throw new Error(unread.error.message)
  if (!devices.data?.length) return { sent: 0, failed: 0 }

  // The number on the app's icon: the person's unread alerts.
  const badge = new Map<string, number>()
  for (const row of unread.data as { user_id: string }[]) badge.set(row.user_id, (badge.get(row.user_id) ?? 0) + 1)

  const key = await keys(db)
  const options: webpush.RequestOptions = {
    vapidDetails: { subject: subject(), publicKey: key.public_key, privateKey: key.private_key },
    TTL: TTL_SECONDS,
    urgency: 'high',
  }
  const jobs: { device: Device; payload: string }[] = []
  for (const b of fresh) {
    for (const device of (devices.data as Device[]).filter((d) => d.user_id === b.user_id)) {
      const text = bildirimMetni(b, device.lang)
      jobs.push({
        device,
        payload: JSON.stringify({ ...text, url: bildirimAdresi(b), tag: b.id, badge: badge.get(b.user_id) ?? 0 }),
      })
    }
  }

  const results = await Promise.allSettled(
    jobs.map(({ device, payload }) =>
      webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, options),
    ),
  )
  // A phone that uninstalled Felix or withdrew permission is told apart by the
  // push service; forget it so it is not tried again.
  const gone = new Set<string>()
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const code = (r.reason as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) gone.add(jobs[i].device.endpoint)
    }
  })
  if (gone.size) await db.from('push_cihazlar').delete().in('endpoint', [...gone])
  const failed = results.filter((r) => r.status === 'rejected').length
  return { sent: results.length - failed, failed }
}

/** /api/bildirim: GET gives the key a phone needs to allow alerts; POST sends waiting alerts. */
export async function handleBildirim(call: Call, db: SupabaseClient = adminClient()): Promise<Reply> {
  const caller = await requireUser(db, call.authorization)
  if ('status' in caller) return caller
  if (call.method === 'GET') return ok({ publicKey: (await keys(db)).public_key })
  if (call.method === 'POST') return ok(await sendPending(db))
  return fail(405, 'Yöntem desteklenmiyor.')
}
