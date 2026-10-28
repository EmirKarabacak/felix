import { callApi } from './api'
import { currentLang } from './i18n'
import { supabase } from './supabase'

// Phone alerts on this device. The bell works everywhere; phone alerts need a
// browser that can receive them (on iPhone: Felix added to the home screen).
// The choice is kept per device, like the language: on, off, or not asked yet.

const KEY = 'felix.bildirim'
export type PushChoice = 'on' | 'off' | 'unasked'

export function pushChoice(): PushChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'on' || v === 'off' ? v : 'unasked'
  } catch {
    return 'unasked'
  }
}

function storeChoice(v: 'on' | 'off') {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    // Blocked storage: the choice lasts until the page closes.
  }
}

/** Whether this browser can receive phone alerts at all. */
export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const permission = (): NotificationPermission | 'unsupported' =>
  pushSupported() ? Notification.permission : 'unsupported'

/** Registers the small worker that shows phone alerts. Called once at start. */
export function registerWorker() {
  if (!pushSupported()) return
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Without it there are simply no phone alerts; the bell still works.
  })
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

const sameKey = (a: ArrayBuffer | null, b: Uint8Array) =>
  !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((x, i) => x === b[i])

/** Subscribes this device and tells Felix it belongs to the signed-in person, in this language. */
async function subscribe(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const { publicKey } = (await callApi('/api/bildirim', 'GET')) as { publicKey: string }
  const key = keyBytes(publicKey)
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  const json = sub.toJSON()
  const { error } = await supabase.rpc('push_kaydet', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_lang: currentLang(),
  })
  if (error) throw error
}

/**
 * Turns phone alerts on: asks the phone's permission (this must follow a tap),
 * then subscribes. Returns 'denied' when the person or the phone said no.
 */
export async function turnOn(): Promise<'on' | 'denied'> {
  const answer = await Notification.requestPermission()
  if (answer !== 'granted') {
    storeChoice('off')
    return 'denied'
  }
  await subscribe()
  storeChoice('on')
  return 'on'
}

/** Not now / off: this device stops receiving alerts (the bell keeps them). */
export async function turnOff(): Promise<void> {
  storeChoice('off')
  await forgetDevice()
}

/** Stops this device's alerts for the signed-in person, e.g. before signing out. */
export async function forgetDevice(): Promise<void> {
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await supabase.rpc('push_sil', { p_endpoint: sub.endpoint })
  } catch {
    // Offline: the server forgets the phone when the push service says it is gone.
  }
}

/**
 * Each start: keeps an allowed device registered for whoever is signed in now,
 * in the language chosen now.
 */
export async function refreshDevice(): Promise<void> {
  if (pushChoice() !== 'on' || permission() !== 'granted') return
  try {
    await subscribe()
  } catch {
    // Tried again on the next start.
  }
}

/** Asks the server to send waiting phone alerts. Fire and forget. */
export function sendWaiting() {
  void callApi('/api/bildirim', 'POST', {}).catch(() => {
    // The next action (anyone's) sends them.
  })
}

/** The number on the home-screen icon, where the phone shows one. */
export function setBadge(n: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try {
    if (n > 0) void nav.setAppBadge?.(n).catch(() => {})
    else void nav.clearAppBadge?.().catch(() => {})
  } catch {
    // Not supported here.
  }
}
