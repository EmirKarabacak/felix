// A stand-in push service for the end-to-end tests. Real phones get alerts
// from Apple's or Google's push service; here Felix's server sends them to
// this local one instead, which decrypts them the way a phone would, so a
// test can read exactly what the phone would show.
import { createECDH, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const b64url = (buf) => Buffer.from(buf).toString('base64url')

/** Decrypts one alert (RFC 8291, aes128gcm), as the phone with these keys would. */
function decrypt(body, phone) {
  const salt = body.subarray(0, 16)
  const idlen = body[20]
  const serverKey = body.subarray(21, 21 + idlen)
  const data = body.subarray(21 + idlen)
  const shared = phone.ecdh.computeSecret(serverKey)
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), phone.ecdh.getPublicKey(), serverKey])
  const ikm = Buffer.from(hkdfSync('sha256', shared, phone.auth, info, 32))
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
  const decipher = createDecipheriv('aes-128-gcm', key, nonce)
  decipher.setAuthTag(data.subarray(data.length - 16))
  const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()])
  // The last record ends with 0x02 and padding zeros.
  let end = plain.length - 1
  while (end >= 0 && plain[end] === 0) end--
  return JSON.parse(plain.subarray(0, end).toString())
}

export async function startPushService() {
  const dir = mkdtempSync(join(tmpdir(), 'felix-push-'))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' })
  const phones = new Map()
  const server = createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, (req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const phone = phones.get(req.url.replace(/^\/push\//, ''))
      if (!phone || phone.gone) {
        res.writeHead(410).end()
        return
      }
      try {
        phone.received.push({ ...decrypt(Buffer.concat(chunks), phone), ttl: Number(req.headers.ttl), vapid: req.headers.authorization })
        res.writeHead(201).end()
      } catch (e) {
        phone.errors.push(String(e))
        res.writeHead(400).end()
      }
    })
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const port = server.address().port
  return {
    /** A new phone: its push address and keys, as the browser would report them. */
    phone(name) {
      const ecdh = createECDH('prime256v1')
      ecdh.generateKeys()
      const phone = { ecdh, auth: randomBytes(16), received: [], errors: [], gone: false }
      phones.set(name, phone)
      return {
        endpoint: `https://127.0.0.1:${port}/push/${name}`,
        p256dh: b64url(ecdh.getPublicKey()),
        auth: b64url(phone.auth),
      }
    },
    received: (name) => phones.get(name).received,
    errors: (name) => phones.get(name).errors,
    /** The phone uninstalled Felix: the push service now answers "gone". */
    uninstall: (name) => (phones.get(name).gone = true),
    close: () => server.close(),
  }
}

/**
 * Makes a browser page behave like a phone that can receive alerts: the
 * permission question is answered "Allow", and subscribing returns the given
 * push address and keys. Everything else (the worker, Felix's code) is real.
 */
export function fakePushScript(sub) {
  // Kept in localStorage, so the phone remembers across reloads like a real one.
  return `(() => {
    const sub = ${JSON.stringify(sub)}
    const get = (k) => localStorage.getItem('fake-push.' + k)
    const set = (k, v) => (v === null ? localStorage.removeItem('fake-push.' + k) : localStorage.setItem('fake-push.' + k, v))
    Object.defineProperty(Notification, 'permission', { get: () => get('permission') || 'default' })
    Notification.requestPermission = async () => {
      set('permission', 'granted')
      return 'granted'
    }
    const make = (key) => ({
      endpoint: sub.endpoint,
      options: { applicationServerKey: Uint8Array.from(atob(key), (c) => c.charCodeAt(0)).buffer },
      toJSON: () => ({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }),
      unsubscribe: async () => {
        set('key', null)
        return true
      },
    })
    PushManager.prototype.getSubscription = async () => (get('key') ? make(get('key')) : null)
    PushManager.prototype.subscribe = async (options) => {
      const bytes = new Uint8Array(options.applicationServerKey)
      set('key', btoa(String.fromCharCode(...bytes)))
      return make(get('key'))
    }
  })()`
}
