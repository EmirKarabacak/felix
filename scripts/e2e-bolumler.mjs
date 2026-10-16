// End-to-end check of bölümler and atölyeler against the local stack. Starts on a
// database without 0006 (as before Emir has run it), then runs 0006 mid-test.
//   FELIX_MIGRATIONS_UNTIL=0005 scripts/local-up.sh && node scripts/e2e-bolumler.mjs [screenshot-folder]
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
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
let step = 0
const ok = (label) => console.log(`ok ${++step}: ${label}`)
function expect(cond, label) {
  if (!cond) throw new Error(`FAILED: ${label}`)
  ok(label)
}

const browser = await chromium.launch()
const problems = []
function watch(p, name) {
  p.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`))
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`${name} console: ${m.text()}`)
  })
}
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
watch(page, 'desktop')

async function signIn(p, username, password) {
  await p.getByLabel('Kullanıcı adı').fill(username)
  await p.getByLabel('Şifre').fill(password)
  await p.getByRole('button', { name: 'Giriş yap' }).click()
  await p.locator('.topbar').waitFor()
}
const nav = (p, label) => p.locator('.topnav a, .tabbar a').filter({ hasText: label }).locator('visible=true').first().click()
const dialog = (p) => p.getByRole('dialog')
const row = (p, name) => p.locator('button.person', { hasText: name })
const group = (p, title) => p.locator('section', { has: p.locator('h3', { hasText: title }) }).first()

// ---- before 0006: the app works and shows no bölümler ----
await page.goto(BASE)
await page.getByLabel('Kurulum kodu').fill('kurulum')
await page.getByLabel('Ad soyad').fill('Emir Karabacak')
await page.getByLabel('Kullanıcı adı').fill('emir')
await page.getByLabel('Şifre').fill('emir1234')
await page.getByRole('button', { name: 'CEO hesabını oluştur' }).click()
await page.getByRole('heading', { name: 'Projeler' }).waitFor()
const made = await page.evaluate(async () => {
  const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))
  const token = JSON.parse(localStorage.getItem(key)).access_token
  const add = (body) =>
    fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then((r) => r.status)
  return [
    await add({ full_name: 'Selim Ateş', username: 'selim', password: 'selim123', panel: 'manager' }),
    await add({ full_name: 'Ahmet Yılmaz', username: 'ahmet', password: 'ahmet123', panel: 'worker' }),
    await add({ full_name: 'Murat Kaya', username: 'murat', password: 'murat123', panel: 'worker' }),
  ].join(',')
})
expect(made === '200,200,200', 'test people created before the migration')
await nav(page, 'Ekip')
await row(page, 'Ahmet Yılmaz').waitFor()
expect(await page.locator('h3', { hasText: 'Atölyeler' }).count() === 0, 'before 0006, Ekip shows no workshop list')
await row(page, 'Ahmet Yılmaz').click()
expect(await dialog(page).getByLabel('Bölüm').count() === 0, 'before 0006, the person form has no bölüm')
await dialog(page).getByRole('button', { name: 'Kaydet' }).click()
await dialog(page).waitFor({ state: 'detached' })
ok('before 0006, a person can still be saved')
expect(await page.locator('.note-error').count() === 0, 'before 0006, no error is shown')

// ---- Emir runs 0006 ----
const migration = fileURLToPath(new URL('../supabase/migrations/0006_bolumler.sql', import.meta.url))
execFileSync('psql', ['-h', '127.0.0.1', '-p', PGPORT, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-1', '-f', migration])
ok('0006 runs as one transaction on a database with people in it')
await page.reload()
await group(page, 'Üretim').waitFor()
expect((await group(page, 'Üretim').locator('button.person').count()) === 2, 'existing workers are put in Üretim')
expect((await group(page, 'Bölüm seçilmedi').locator('button.person').count()) === 2, 'the CEO and the manager have no bölüm yet')
const atolyeler = page.locator('section[aria-label="Atölyeler"]')
expect((await atolyeler.locator('.name-row').count()) === 2, 'the two workshops are listed')

// ---- workshops ----
await page.getByLabel('Yeni atölye').fill('Boya atölyesi')
await atolyeler.getByRole('button', { name: 'Oluştur' }).click()
await atolyeler.locator('.name-row', { hasText: 'Boya atölyesi' }).waitFor()
ok('a workshop can be added')
await page.getByLabel('Yeni atölye').fill('Boya atölyesi')
await atolyeler.getByRole('button', { name: 'Oluştur' }).click()
await page.getByText('Bu adla bir atölye zaten var.').waitFor()
ok('a duplicate workshop is refused')
await page.getByLabel('Yeni atölye').fill('')

// ---- put people in bölümler and workshops ----
async function place(name, bolum, atolye) {
  await row(page, name).click()
  await dialog(page).getByLabel('Bölüm').selectOption({ label: bolum })
  if (atolye) await dialog(page).getByLabel('Atölye').selectOption({ label: atolye })
  else expect(await dialog(page).getByLabel('Atölye').count() === (bolum === 'Üretim' ? 1 : 0), `${bolum} ${bolum === 'Üretim' ? 'offers' : 'has no'} workshop choice`)
  await dialog(page).getByRole('button', { name: 'Kaydet' }).click()
  await dialog(page).waitFor({ state: 'detached' })
}
await place('Ahmet Yılmaz', 'Üretim', 'Kaynak atölyesi')
await row(page, 'Ahmet Yılmaz').filter({ hasText: 'Kaynak atölyesi' }).waitFor()
ok('a worker can be put in a workshop, and the list shows it')
await place('Murat Kaya', 'Tasarım')
await group(page, 'Tasarım').locator('button.person', { hasText: 'Murat Kaya' }).waitFor()
ok('a person can be moved to Tasarım')

await page.getByRole('button', { name: 'Kişi ekle' }).click()
await dialog(page).getByLabel('Ad soyad').fill('Hasan Demir')
await dialog(page).getByLabel('İlk şifre').fill('hasan123')
expect((await dialog(page).getByLabel('Bölüm').inputValue()) === 'uretim', 'a new person starts in Üretim')
await dialog(page).getByLabel('Atölye').selectOption({ label: 'Elektrik atölyesi' })
await page.screenshot({ path: `${SHOTS}/50-kisi-ekle.png` })
await dialog(page).getByRole('button', { name: 'Kişiyi ekle' }).click()
await row(page, 'Hasan Demir').filter({ hasText: 'Elektrik atölyesi' }).waitFor()
ok('a new person can be added straight into a workshop')
await page.screenshot({ path: `${SHOTS}/51-ekip.png`, fullPage: true })

// ---- the assign list is grouped by where people work ----
await nav(page, 'Projeler')
await page.getByRole('button', { name: 'Yeni proje' }).click()
await dialog(page).getByLabel('Proje adı').fill('Bölüm testi')
await dialog(page).getByLabel('Proje türü').selectOption({ label: 'RO Ünitesi' })
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.getByRole('heading', { name: 'Bölüm testi' }).waitFor()
await page.locator('button.step', { hasText: 'Borulama' }).click()
const titles = await dialog(page).locator('.check-group').allInnerTexts()
expect(titles.join('|') === 'Elektrik atölyesi|Kaynak atölyesi|Tasarım|Bölüm seçilmedi', `the assign list is grouped (${titles.join('|')})`)
await dialog(page).getByRole('group', { name: 'Kaynak atölyesi' }).getByRole('button', { name: /Ahmet Yılmaz/ }).click()
await page.waitForFunction(() => document.querySelectorAll('[role=dialog] .check-row[aria-pressed=true]').length === 1)
ok('assigning from a group works')
await page.screenshot({ path: `${SHOTS}/52-sorumlular.png` })
await dialog(page).getByRole('button', { name: 'Kapat' }).click()

// ---- a manager can change bölümler; a worker sees their own in the account sheet ----
const selim = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
watch(selim, 'selim')
await selim.goto(BASE)
await signIn(selim, 'selim', 'selim123')
await nav(selim, 'Ekip')
await row(selim, 'Murat Kaya').click()
await dialog(selim).getByLabel('Bölüm').selectOption({ label: 'Satın alma' })
await dialog(selim).getByRole('button', { name: 'Kaydet' }).click()
await group(selim, 'Satın alma').locator('button.person', { hasText: 'Murat Kaya' }).waitFor()
ok('a manager can move someone to another bölüm')

const ahmet = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage()
watch(ahmet, 'ahmet')
await ahmet.goto(BASE)
await signIn(ahmet, 'ahmet', 'ahmet123')
await ahmet.locator('button.account').click()
expect((await dialog(ahmet).innerText()).includes('İşçi · Üretim'), 'a worker sees their bölüm in their account sheet')
await ahmet.screenshot({ path: `${SHOTS}/53-hesap-telefon.png` })

// phone-width Ekip
const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage()
watch(phone, 'phone')
await phone.goto(BASE)
await signIn(phone, 'emir', 'emir1234')
await nav(phone, 'Ekip')
await group(phone, 'Üretim').waitFor()
await phone.screenshot({ path: `${SHOTS}/54-ekip-telefon.png`, fullPage: true })
await row(phone, 'Ahmet Yılmaz').click()
await dialog(phone).getByLabel('Atölye').waitFor()
await phone.waitForTimeout(700) // let the sheet finish sliding up
await phone.screenshot({ path: `${SHOTS}/55-kisi-telefon.png` })
ok('Ekip and the person sheet work at phone width')

expect(problems.length === 0, `no errors in the browser${problems.length ? `: ${problems.join(' / ')}` : ''}`)
await browser.close()
console.log(`ALL ${step} BÖLÜM END-TO-END CHECKS PASSED`)
