// End-to-end check of Update 3: notifications. Starts on a database without
// 0010 (as before Emir has run it), checks Felix works and shows no bell
// there, then runs 0010 mid-test. Phone alerts go to a local stand-in push
// service (scripts/e2e-push.mjs), which decrypts them as the phone would.
//   FELIX_MIGRATIONS_UNTIL=0009 scripts/local-up.sh && node scripts/e2e-update3.mjs [screenshot-folder]
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { photoFile } from './e2e-photo.mjs'
import { fakePushScript, startPushService } from './e2e-push.mjs'
const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  ;({ chromium } = require('/opt/npm-tools/node_modules/playwright'))
}

const BASE = process.env.FELIX_URL ?? 'http://127.0.0.1:5173'
const SHOTS = process.argv[2] ?? '/tmp'
const PGPORT = process.env.PGPORT_LOCAL ?? '54329'
const PHOTO = photoFile()
let step = 0
const ok = (label) => console.log(`ok ${++step}: ${label}`)
function expect(cond, label) {
  if (!cond) throw new Error(`FAILED: ${label}`)
  ok(label)
}
const psql = (args) =>
  execFileSync('psql', ['-h', '127.0.0.1', '-p', PGPORT, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
  })
const sql = (text) => psql(['-At', '-c', text]).toString().trim()

const push = await startPushService()
const browser = await chromium.launch()
const problems = []
function watch(p, name) {
  p.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`))
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`${name} console: ${m.text()}`)
  })
  p.on('filechooser', (chooser) => void chooser.setFiles(PHOTO))
}
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }
/** A browser for one person; `phone` makes it a phone that can receive alerts. */
async function open(name, context, username, password, phone) {
  const ctx = await browser.newContext(context)
  if (phone) await ctx.addInitScript(fakePushScript(push.phone(phone)))
  const p = await ctx.newPage()
  watch(p, name)
  if (username) await signIn(p, username, password)
  return p
}
async function signIn(p, username, password) {
  await p.goto(BASE)
  await p.getByLabel('Kullanıcı adı').fill(username)
  await p.getByLabel('Şifre').fill(password)
  await p.getByRole('button', { name: 'Giriş yap' }).click()
  await p.locator('.topbar').waitFor()
}
const nav = (p, label) => p.locator('.topnav a, .tabbar a').filter({ hasText: label }).locator('visible=true').first().click()
const dialog = (p) => p.getByRole('dialog')
const stepRow = (p, name) => p.locator('button.step', { has: p.locator('.step-name', { hasText: name }) })
const closeDialog = async (p) => {
  await dialog(p).getByRole('button', { name: /^(Kapat|Close)$/ }).click()
  await dialog(p).waitFor({ state: 'detached' })
}
const bellCount = (p) => p.locator('.bell .bell-count').innerText().catch(() => '')
/** Waits for the phone to have received n alerts, and returns the newest. */
async function alertOn(phone, n) {
  for (let i = 0; i < 80 && push.received(phone).length < n; i++) await new Promise((r) => setTimeout(r, 100))
  const got = push.received(phone)
  if (got.length < n) throw new Error(`FAILED: ${phone} received ${got.length} alerts, expected ${n}; errors: ${push.errors(phone).join(', ')}`)
  return got[n - 1]
}
const quiet = () => new Promise((r) => setTimeout(r, 1200))

// ---- setup: Genel Müdür, a Bölüm Sorumlusu, a Personel in İmalat and one in Satın alma ----
const page = await open('emir', DESKTOP)
await page.goto(BASE)
await page.getByLabel('Kurulum kodu').fill('kurulum')
await page.getByLabel('Ad soyad').fill('Emir Karabacak')
await page.getByLabel('Kullanıcı adı').fill('emir')
await page.getByLabel('Şifre').fill('emir1234')
await page.getByRole('button', { name: 'Genel Müdür hesabını oluştur' }).click()
await page.getByRole('heading', { name: 'Projeler' }).waitFor()
await page.evaluate(async () => {
  const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))
  const token = JSON.parse(localStorage.getItem(key)).access_token
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const add = (body) => fetch('/api/users', { method: 'POST', headers: auth, body: JSON.stringify(body) })
  const rest = (path) => fetch(`http://127.0.0.1:54321/rest/v1/${path}`, { headers: auth }).then((r) => r.json())
  const [imalat] = await rest('bolumler?select=id&kod=eq.imalat')
  const [satinalma] = await rest('bolumler?select=id&kod=eq.satinalma')
  const [kaynak] = await rest('uzmanliklar?select=id&name=eq.Kaynakçı')
  await add({ full_name: 'Selim Ateş', username: 'selim', password: 'selim123', panel: 'manager', bolum_id: imalat.id })
  await add({
    full_name: 'Ahmet Yılmaz',
    username: 'ahmet',
    password: 'ahmet123',
    panel: 'worker',
    bolum_id: imalat.id,
    uzmanliklar: [{ uzmanlik_id: kaynak.id, seviye: 'kalfa' }],
  })
  await add({ full_name: 'Ayşe Satınalma', username: 'ayse', password: 'ayse1234', panel: 'worker', bolum_id: satinalma.id })
})
await page.getByRole('button', { name: 'Yeni proje' }).click()
await dialog(page).getByLabel('Proje adı').fill('500 m³/gün RO Ünitesi')
await dialog(page).getByLabel('Proje kodu').fill('RO-24').catch(() => {})
await dialog(page).getByLabel('Proje türü').selectOption({ label: 'RO Ünitesi' })
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.locator('button.step').first().waitFor()
const projectUrl = page.url()
const projectId = projectUrl.split('/').pop()

// ---- before 0010: no bell, no question, and everything works as before ----
const ahmet = await open('ahmet', PHONE, 'ahmet', 'ahmet123', 'ahmet')
await stepRow(page, 'Malzeme hazırlık').click()
await dialog(page).getByRole('button', { name: /Ahmet Yılmaz/ }).click()
await page.waitForFunction(() => document.querySelectorAll('[role=dialog] .check-row[aria-pressed=true]').length === 1)
await closeDialog(page)
await ahmet.reload()
await ahmet.locator('button.job', { hasText: 'Malzeme hazırlık' }).waitFor()
expect((await ahmet.locator('.bell').count()) === 0 && (await page.locator('.bell').count()) === 0, 'before 0010 there is no bell')
expect((await ahmet.locator('.push-prompt').count()) === 0, 'and Felix does not ask to allow alerts')
await nav(ahmet, 'Ayarlar')
await ahmet.getByRole('heading', { name: 'Ayarlar' }).waitFor()
expect((await ahmet.getByRole('heading', { name: 'Bildirimler' }).count()) === 0, 'nor shows a Bildirimler switch in Ayarlar')
await nav(ahmet, 'İşlerim')

// ---- Emir runs 0010 ----
psql(['-f', fileURLToPath(new URL('../supabase/migrations/0010_bildirimler.sql', import.meta.url))])
ok('0010 runs on a database already in use')
psql(['-f', fileURLToPath(new URL('../supabase/migrations/0010_bildirimler.sql', import.meta.url))])
ok('and can be run a second time')

// ---- the first-time question ----
await ahmet.reload()
const prompt = ahmet.locator('.push-prompt')
await prompt.waitFor()
expect((await prompt.innerText()).includes('Yeni işlerden haberdar olmak için bildirimlere izin verin.'), 'Felix asks once to allow alerts')
await ahmet.locator('.bell').waitFor()
ok('and the bell is at the top')
await ahmet.screenshot({ path: `${SHOTS}/90-izin-iste-telefon.png` })
await prompt.getByRole('button', { name: 'İzin ver' }).click()
await prompt.waitFor({ state: 'detached' })
for (let i = 0; i < 40 && sql(`select count(*) from public.push_cihazlar`) !== '1'; i++) await new Promise((r) => setTimeout(r, 100))
expect(
  sql(`select p.username || ' ' || c.lang from public.push_cihazlar c join public.profiles p on p.id = c.user_id`) === 'ahmet tr',
  '"İzin ver" registers the phone for Ahmet, in Turkish',
)
expect(sql(`select count(*) from public.push_anahtar`) === '1', 'Felix made its own signing keys on first use')
await ahmet.reload()
await ahmet.locator('button.job').first().waitFor()
expect((await ahmet.locator('.push-prompt').count()) === 0, 'the question does not come back')

const selim = await open('selim', PHONE, 'selim', 'selim123', 'selim')
await selim.locator('.push-prompt').getByRole('button', { name: 'Şimdi değil' }).click()
await selim.locator('.push-prompt').waitFor({ state: 'detached' })
await selim.reload()
await selim.locator('.bell').waitFor()
expect((await selim.locator('.push-prompt').count()) === 0, '"Şimdi değil" hides the question too')
expect(sql(`select count(*) from public.push_cihazlar c join public.profiles p on p.id = c.user_id where p.username = 'selim'`) === '0', 'and registers nothing')

// ---- Yeni iş: on the phone and in the bell ----
await page.reload()
await stepRow(page, 'Şase imalatı').click()
await dialog(page).getByRole('button', { name: /Ahmet Yılmaz/ }).click()
await page.waitForFunction(() => document.querySelectorAll('[role=dialog] .check-row[aria-pressed=true]').length === 1)
await closeDialog(page)
const yeniIs = await alertOn('ahmet', 1)
expect(yeniIs.title === 'Yeni iş: Şase imalatı', `the phone shows "${yeniIs.title}"`)
expect(yeniIs.body.includes('500 m³/gün RO Ünitesi'), `with the project under it: "${yeniIs.body}"`)
const sase = sql(`select id from public.project_steps where name = 'Şase imalatı'`)
expect(yeniIs.url === `/projeler/${projectId}?adim=${sase}`, 'tapping it opens that step')
expect(yeniIs.badge === 1 && yeniIs.ttl === 172800, 'the app icon shows 1, and a phone that is off still gets it within two days')
expect(/^vapid t=/.test(yeniIs.vapid ?? ''), 'signed with Felix\'s own keys')
await quiet()
expect(push.received('ahmet').length === 1, 'one alert, not one per refresh')
expect(push.received('selim').length === 0, 'nobody else is alerted')

await ahmet.reload()
await ahmet.locator('button.job').first().waitFor()
expect((await bellCount(ahmet)) === '1', 'the bell shows 1 unread')
await ahmet.locator('.bell').click()
const list = dialog(ahmet)
await list.locator('.alert-row.unread', { hasText: 'Yeni iş: Şase imalatı' }).waitFor()
ok('the bell lists the alert, unread')
await ahmet.waitForTimeout(400)
await ahmet.screenshot({ path: `${SHOTS}/91-bildirimler-telefon.png` })
await list.locator('.alert-row', { hasText: 'Yeni iş: Şase imalatı' }).click()
await ahmet.waitForURL(`**/projeler/${projectId}`)
await dialog(ahmet).getByRole('heading', { name: 'Şase imalatı' }).waitFor()
ok('tapping an alert opens its step')
await ahmet.locator('.bell .bell-count').waitFor({ state: 'detached' })
ok('and it counts as read')
await closeDialog(ahmet)

// ---- Onay bekleyen iş: to Bölüm Sorumluları, Genel Müdür and IT ----
await stepRow(ahmet, 'Şase imalatı').click()
await dialog(ahmet).getByRole('button', { name: 'İşe başla' }).click()
await dialog(ahmet).getByRole('button', { name: 'İşi bitir', exact: true }).click()
await dialog(ahmet).getByText('Onay bekleniyor.').waitFor()
await closeDialog(ahmet)
const onay = await alertOn('selim', 0).catch(() => null)
expect(onay === undefined || onay === null, 'Selim said "Şimdi değil": no phone alert for him')
await selim.reload()
await selim.locator('.bell .bell-count').waitFor()
expect((await bellCount(selim)) === '1', 'but his bell shows the job awaiting approval')
await page.reload()
await page.locator('.bell .bell-count').waitFor()
expect((await bellCount(page)) === '1', 'and so does the Genel Müdür\'s')
expect(sql(`select count(*) from public.bildirimler where kind = 'onay_bekliyor'`) === '2', 'nobody else (Ahmet is not told of his own hand-in)')
await page.locator('.bell').click()
await dialog(page).locator('.alert-row', { hasText: 'Onay bekleyen iş: Şase imalatı' }).waitFor()
expect((await dialog(page).locator('.alert-row').first().innerText()).includes('Ahmet Yılmaz'), 'the alert says who handed it in')
await page.waitForTimeout(400)
await page.screenshot({ path: `${SHOTS}/92-bildirimler-masaustu.png` })
await dialog(page).locator('.alert-row', { hasText: 'Onay bekleyen iş' }).click()
await dialog(page).getByText('Bu iş onayınızı bekliyor.').waitFor()
ok('the Genel Müdür goes straight from the alert to approving')

// ---- İş geri gönderildi ----
await dialog(page).getByRole('button', { name: 'Geri gönder' }).click()
await dialog(page).getByLabel('Neden geri gönderiyorsunuz?').fill('Kaynak dikişi eksik.')
await dialog(page).getByRole('button', { name: 'Geri gönder' }).click()
await dialog(page).locator('.facts .status-active').waitFor()
await closeDialog(page)
const geri = await alertOn('ahmet', 2)
expect(geri.title === 'İş geri gönderildi: Şase imalatı', `sending it back alerts Ahmet: "${geri.title}"`)
expect(geri.body.includes('Emir Karabacak: Kaynak dikişi eksik.'), `with who and why: "${geri.body}"`)

// ---- In English: Malzemen geldi ----
await nav(ahmet, 'Ayarlar')
await ahmet.getByRole('button', { name: 'English' }).click()
await ahmet.getByRole('heading', { name: 'Settings' }).waitFor()
for (let i = 0; i < 40 && sql(`select lang from public.push_cihazlar`) !== 'en'; i++) await new Promise((r) => setTimeout(r, 100))
expect(sql(`select lang from public.push_cihazlar`) === 'en', 'choosing English moves the phone\'s alerts to English')
await ahmet.goto(projectUrl)
await stepRow(ahmet, 'Şase imalatı').click()
await dialog(ahmet).getByRole('button', { name: 'Report a problem' }).click()
await dialog(ahmet).getByRole('button', { name: 'Missing material' }).click()
await dialog(ahmet).getByLabel('Missing material').fill('Profil 40x40')
await dialog(ahmet).getByLabel('Quantity').fill('6 boy')
await dialog(ahmet).getByRole('button', { name: 'Report problem' }).click()
await dialog(ahmet).locator('.talep').waitFor()
await closeDialog(ahmet)
expect(
  sql(`select string_agg(p.username || ':' || b.kind, ',' order by p.username) from public.bildirimler b join public.profiles p on p.id = b.user_id where b.kind in ('sorun', 'malzeme_talebi')`) ===
    'ayse:malzeme_talebi,emir:malzeme_talebi,selim:malzeme_talebi',
  'missing material: one "Yeni talep" for Satın alma, the Bölüm Sorumlusu and the Genel Müdür',
)
const ayse = await open('ayse', PHONE, 'ayse', 'ayse1234', 'ayse')
await ayse.locator('.bell .bell-count').waitFor()
await ayse.locator('.bell').click()
await dialog(ayse).locator('.alert-row', { hasText: 'Yeni talep: Profil 40x40 · 6 boy' }).click()
await dialog(ayse).getByRole('heading', { name: 'Şase imalatı' }).waitFor()
ok('Satın alma opens the request from the bell')
await dialog(ayse).getByRole('button', { name: 'Geldi' }).click()
await dialog(ayse).locator('.talep .badge', { hasText: 'Geldi' }).waitFor()
const geldi = await alertOn('ahmet', 3)
expect(geldi.title === 'Your material has arrived: Profil 40x40 · 6 boy', `and Ahmet's phone says, in English: "${geldi.title}"`)
await ahmet.goto(BASE)
await ahmet.locator('.bell .bell-count').waitFor()
await ahmet.locator('.bell').click()
await dialog(ahmet).locator('.alert-row', { hasText: 'Your material has arrived' }).waitFor()
ok('the bell is in English too')
await ahmet.waitForTimeout(400)
await ahmet.screenshot({ path: `${SHOTS}/93-bildirimler-ingilizce.png` })
await dialog(ahmet).getByRole('button', { name: 'Mark all as read' }).click()
await ahmet.locator('.bell .bell-count').waitFor({ state: 'detached' })
ok('"Mark all as read" clears the count')
await closeDialog(ahmet)

// ---- Ayarlar switch ----
await nav(ahmet, 'Settings')
const row = ahmet.locator('label.fact', { hasText: 'Phone notifications' })
await row.waitFor()
expect(await row.getByRole('switch').isChecked(), 'Ayarlar shows phone alerts on')
await ahmet.getByRole('button', { name: 'Türkçe' }).click()
await ahmet.getByRole('heading', { name: 'Ayarlar' }).waitFor()
const satir = ahmet.locator('label.fact', { hasText: 'Telefon bildirimleri' })
await satir.scrollIntoViewIfNeeded()
await ahmet.screenshot({ path: `${SHOTS}/94-ayarlar-bildirimler.png`, fullPage: true })
await satir.getByRole('switch').click()
for (let i = 0; i < 40 && sql(`select count(*) from public.push_cihazlar c join public.profiles p on p.id = c.user_id where p.username = 'ahmet'`) !== '0'; i++)
  await new Promise((r) => setTimeout(r, 100))
expect(sql(`select count(*) from public.push_cihazlar c join public.profiles p on p.id = c.user_id where p.username = 'ahmet'`) === '0', 'switching it off stops this phone\'s alerts')
await stepRow(page, 'Ekipman montajı').click().catch(async () => {
  await page.goto(projectUrl)
  await stepRow(page, 'Ekipman montajı').click()
})
await dialog(page).getByRole('button', { name: /Ahmet Yılmaz/ }).click()
await page.waitForFunction(() => document.querySelectorAll('[role=dialog] .check-row[aria-pressed=true]').length === 1)
await closeDialog(page)
await quiet()
expect(push.received('ahmet').length === 3, 'so a new job reaches only his bell')
await satir.getByRole('switch').click()
for (let i = 0; i < 40 && sql(`select count(*) from public.push_cihazlar c join public.profiles p on p.id = c.user_id where p.username = 'ahmet'`) !== '1'; i++)
  await new Promise((r) => setTimeout(r, 100))
expect(sql(`select lang from public.push_cihazlar c join public.profiles p on p.id = c.user_id where p.username = 'ahmet'`) === 'tr', 'switching it on again registers the phone, in Turkish again')

// ---- a phone that uninstalled Felix is forgotten ----
push.uninstall('ahmet')
await page.goto(projectUrl)
await stepRow(page, 'Borulama').click()
await dialog(page).getByRole('button', { name: /Ahmet Yılmaz/ }).click()
await page.waitForFunction(() => document.querySelectorAll('[role=dialog] .check-row[aria-pressed=true]').length === 1)
await closeDialog(page)
for (let i = 0; i < 40 && sql(`select count(*) from public.push_cihazlar`) !== '0'; i++) await new Promise((r) => setTimeout(r, 100))
expect(sql(`select count(*) from public.push_cihazlar`) === '0', 'a phone the push service says is gone is removed')

// ---- signing out ----
const sena = await open('ayse2', PHONE, 'ayse', 'ayse1234', 'ayse-ikinci')
await sena.locator('.push-prompt').getByRole('button', { name: 'İzin ver' }).click()
for (let i = 0; i < 40 && sql(`select count(*) from public.push_cihazlar`) !== '1'; i++) await new Promise((r) => setTimeout(r, 100))
expect(sql(`select count(*) from public.push_cihazlar`) === '1', 'Ayşe allows alerts on her phone')
await nav(sena, 'Ayarlar')
await sena.getByRole('button', { name: 'Çıkış yap' }).click()
await sena.getByRole('button', { name: 'Giriş yap' }).waitFor()
expect(sql(`select count(*) from public.push_cihazlar`) === '0', 'signing out stops the phone getting her alerts')

// ---- dark theme ----
await page.emulateMedia({ colorScheme: 'dark' })
await page.reload()
await page.locator('.bell').click()
await dialog(page).locator('.alert-row').first().waitFor()
await page.waitForTimeout(400)
await page.screenshot({ path: `${SHOTS}/95-bildirimler-koyu.png` })
await closeDialog(page)

expect(problems.length === 0, `no errors in the browser${problems.length ? `: ${problems.join(' | ')}` : ''}`)
await browser.close()
push.close()
console.log(`\nALL ${step} UPDATE 3 CHECKS PASSED`)
