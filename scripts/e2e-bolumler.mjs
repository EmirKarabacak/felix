// End-to-end check of the Bölümler list, hidden levels and Ayarlar against the local
// stack. Starts on a database with 0006 but without 0007 (as before Emir has run it),
// then runs 0007 mid-test.
//   FELIX_MIGRATIONS_UNTIL=0006 scripts/local-up.sh && node scripts/e2e-bolumler.mjs [screenshot-folder]
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
const psql = (args) =>
  execFileSync('psql', ['-h', '127.0.0.1', '-p', PGPORT, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
  })

const browser = await chromium.launch()
const problems = []
function watch(p, name) {
  p.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`))
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`${name} console: ${m.text()}`)
  })
}
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
watch(page, 'desktop')

async function signIn(p, username, password) {
  await p.goto(BASE)
  await p.getByLabel('Kullanıcı adı').fill(username)
  await p.getByLabel('Şifre').fill(password)
  await p.getByRole('button', { name: 'Giriş yap' }).click()
  await p.locator('.topbar').waitFor()
}
const nav = (p, label) => p.locator('.topnav a, .tabbar a').filter({ hasText: label }).locator('visible=true').first().click()
const dialog = (p) => p.getByRole('dialog')
const row = (p, name) => p.locator('button.person', { hasText: name })
const group = (p, title) => p.locator('section', { has: p.locator('h3', { hasText: title }) }).first()
async function openBolumler(p) {
  await nav(p, 'Ayarlar')
  await p.locator('a.link-row', { hasText: 'Bölümler' }).click()
  await p.getByRole('heading', { name: 'Bölümler' }).waitFor()
}

// ---- before 0007: the app works and shows no bölümler or levels ----
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
    await add({ full_name: 'Can Öz', username: 'can', password: 'can12345', panel: 'worker' }),
  ].join(',')
})
expect(made === '200,200,200,200', 'test people created before the migration')
// What the 0006 screens would have set: Ahmet in the welding shop, Murat in design, Can in Üretim with no workshop.
psql(['-c', `update public.profiles set bolum = 'uretim', atolye_id = (select id from public.atolyeler where name = 'Kaynak atölyesi') where username = 'ahmet';
             update public.profiles set bolum = 'tasarim' where username = 'murat';
             update public.profiles set bolum = 'uretim' where username = 'can';`])
await page.reload()
await nav(page, 'Ekip')
await row(page, 'Ahmet Yılmaz').waitFor()
expect(await page.locator('h3').count() === 0, 'before 0007, Ekip is one plain list')
expect(!(await page.locator('.people').innerText()).match(/Usta|Kalfa|Çırak/), 'before 0007, no levels are shown')
await row(page, 'Ahmet Yılmaz').click()
expect(await dialog(page).getByLabel('Bölüm').count() === 0 && await dialog(page).getByRole('group', { name: 'Seviye' }).count() === 0, 'before 0007, the person form has no bölüm or level')
await dialog(page).getByRole('button', { name: 'Kaydet' }).click()
await dialog(page).waitFor({ state: 'detached' })
ok('before 0007, a person can still be saved')
await openBolumler(page)
await page.getByText('0007 dosyası henüz çalıştırılmamış').waitFor()
ok('before 0007, the Bölümler page says the update is needed')
expect(await page.locator('.note-error').count() === 0, 'before 0007, no error is shown')

// ---- Emir runs 0007 (twice, as he might) ----
const migration = fileURLToPath(new URL('../supabase/migrations/0007_seviye_ve_bolum_listesi.sql', import.meta.url))
psql(['-1', '-f', migration])
psql(['-1', '-f', migration])
ok('0007 runs as one transaction, and again without harm, on a database with people in it')
await page.reload()
await page.locator('.name-row').first().waitFor()
const names = await page.locator('.name-row button.label').allInnerTexts()
expect(names.join('|') === 'Elektrik atölyesi|Kaynak atölyesi|Muhasebe|Satın alma|Tasarım|Üretim', `the workshops and departments become one list (${names.join('|')})`)

await nav(page, 'Ekip')
await group(page, 'Kaynak atölyesi').waitFor()
expect((await group(page, 'Kaynak atölyesi').innerText()).includes('Ahmet Yılmaz'), 'a worker in a workshop keeps it')
expect((await group(page, 'Tasarım').innerText()).includes('Murat Kaya'), 'a person in Tasarım keeps it')
expect((await group(page, 'Üretim').innerText()).includes('Can Öz'), 'a worker in Üretim without a workshop stays in Üretim')
expect((await group(page, 'Bölüm seçilmedi').locator('button.person').count()) === 2, 'the CEO and the manager have no bölüm yet')
expect((await row(page, 'Ahmet Yılmaz').innerText()).includes('Kalfa'), 'everyone starts as Kalfa')

// ---- the Bölümler list ----
await openBolumler(page)
await page.getByLabel('Yeni bölüm').fill('Boya atölyesi')
await page.getByRole('button', { name: 'Oluştur' }).click()
await page.locator('.name-row', { hasText: 'Boya atölyesi' }).waitFor()
ok('a bölüm can be added')
await page.getByLabel('Yeni bölüm').fill('Boya atölyesi')
await page.getByRole('button', { name: 'Oluştur' }).click()
await page.getByText('Bu adla bir bölüm zaten var.').waitFor()
ok('a duplicate bölüm is refused')
await page.getByLabel('Yeni bölüm').fill('')
await page.locator('.name-row', { hasText: 'Üretim' }).getByRole('button', { name: 'Üretim', exact: true }).click()
await page.getByLabel('Bölüm adı').fill('Montaj atölyesi')
await page.getByRole('button', { name: 'Kaydet' }).click()
await page.locator('.name-row', { hasText: 'Montaj atölyesi' }).waitFor()
expect((await page.locator('.name-row', { hasText: 'Montaj atölyesi' }).innerText()).includes('1 kişi'), 'a bölüm can be renamed and shows how many people are in it')
await page.getByRole('button', { name: 'Muhasebe bölüm sil' }).click()
await page.getByRole('button', { name: 'Sil', exact: true }).click()
await page.locator('.name-row', { hasText: 'Muhasebe' }).waitFor({ state: 'detached' })
ok('an empty bölüm can be deleted')
await page.screenshot({ path: `${SHOTS}/50-bolumler.png`, fullPage: true })
await page.getByRole('link', { name: 'Ayarlar' }).first().click()
await page.getByRole('heading', { name: 'Ayarlar' }).waitFor()
ok('the back link returns to Ayarlar')

// ---- levels and bölüm on a person ----
await nav(page, 'Ekip')
await row(page, 'Murat Kaya').click()
await dialog(page).getByLabel('Bölüm').selectOption({ label: 'Boya atölyesi' })
await dialog(page).getByRole('group', { name: 'Seviye' }).getByRole('button', { name: 'Usta', exact: true }).click()
await dialog(page).getByRole('button', { name: 'Kaydet' }).click()
await dialog(page).waitFor({ state: 'detached' })
await group(page, 'Boya atölyesi').locator('button.person', { hasText: 'Murat Kaya' }).filter({ hasText: 'Usta' }).waitFor()
ok('a person can be moved to another bölüm and made Usta')
await row(page, 'Selim Ateş').click()
expect(await dialog(page).getByRole('group', { name: 'Seviye' }).count() === 0, 'a manager has no level')
await dialog(page).getByRole('button', { name: 'Kapat' }).click()

await page.getByRole('button', { name: 'Kişi ekle' }).click()
await dialog(page).getByLabel('Ad soyad').fill('Hasan Demir')
await dialog(page).getByLabel('İlk şifre').fill('hasan123')
await dialog(page).getByLabel('Bölüm').selectOption({ label: 'Elektrik atölyesi' })
await dialog(page).getByRole('group', { name: 'Seviye' }).getByRole('button', { name: 'Çırak', exact: true }).click()
await page.screenshot({ path: `${SHOTS}/51-kisi-ekle.png` })
await dialog(page).getByRole('button', { name: 'Kişiyi ekle' }).click()
await group(page, 'Elektrik atölyesi').locator('button.person', { hasText: 'Hasan Demir' }).filter({ hasText: 'Çırak' }).waitFor()
ok('a new person can be added straight into a bölüm as Çırak')
await page.screenshot({ path: `${SHOTS}/52-ekip.png`, fullPage: true })

// ---- the assign list is grouped by bölüm and shows levels ----
await nav(page, 'Projeler')
await page.getByRole('button', { name: 'Yeni proje' }).click()
await dialog(page).getByLabel('Proje adı').fill('Bölüm testi')
await dialog(page).getByLabel('Proje türü').selectOption({ label: 'RO Ünitesi' })
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.getByRole('heading', { name: 'Bölüm testi' }).waitFor()
await page.locator('button.step', { hasText: 'Borulama' }).click()
const titles = await dialog(page).locator('.check-group').allInnerTexts()
expect(titles.join('|') === 'Boya atölyesi|Elektrik atölyesi|Kaynak atölyesi|Montaj atölyesi|Bölüm seçilmedi', `the assign list is grouped (${titles.join('|')})`)
const hasan = dialog(page).getByRole('group', { name: 'Elektrik atölyesi' }).getByRole('button', { name: /Hasan Demir/ })
expect((await hasan.innerText()).includes('Çırak'), 'the assign list shows the level')
await hasan.click()
await page.waitForFunction(() => document.querySelectorAll('[role=dialog] .check-row[aria-pressed=true]').length === 1)
ok('assigning from a group works')
await page.screenshot({ path: `${SHOTS}/53-sorumlular.png` })
await dialog(page).getByRole('button', { name: 'Kapat' }).click()

// ---- a Çırak waits for approval, an Usta does not ----
const hasanPhone = await (await browser.newContext(PHONE)).newPage()
watch(hasanPhone, 'hasan')
await signIn(hasanPhone, 'hasan.demir', 'hasan123')
await hasanPhone.locator('button.job', { hasText: 'Borulama' }).click()
await dialog(hasanPhone).getByRole('button', { name: 'İşe başla' }).click()
await dialog(hasanPhone).getByRole('button', { name: 'İşi bitir', exact: true }).click()
await dialog(hasanPhone).locator('.facts .status-review').waitFor()
ok("a Çırak's finish waits for approval")
await dialog(hasanPhone).getByRole('button', { name: 'Kapat' }).click()
await nav(hasanPhone, 'Ayarlar')
await hasanPhone.getByRole('button', { name: 'Çıkış yap' }).waitFor()
const hasanSettings = await hasanPhone.locator('.page').innerText()
expect(hasanSettings.includes('Elektrik atölyesi') && hasanSettings.includes('Personel'), 'Personel see their panel and bölüm in Ayarlar')
expect(!hasanSettings.match(/Usta|Kalfa|Çırak/), 'but not their level')
await hasanPhone.waitForTimeout(300)
await hasanPhone.screenshot({ path: `${SHOTS}/54-ayarlar-telefon.png`, fullPage: true })
const asWorker = await hasanPhone.evaluate(async () => {
  const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))
  const token = JSON.parse(localStorage.getItem(key)).access_token
  const base = [...performance.getEntriesByType('resource')].map((r) => r.name).find((n) => n.includes('/rest/v1/')).split('/rest/v1/')[0]
  const res = await fetch(`${base}/rest/v1/seviyeler?select=*`, { headers: { apikey: token, Authorization: `Bearer ${token}` } })
  return JSON.stringify(await res.json())
})
expect(asWorker === '[]', 'asking the database directly as Personel returns no levels')

// ---- a manager can change the list and levels too ----
const selim = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
watch(selim, 'selim')
await signIn(selim, 'selim', 'selim123')
await openBolumler(selim)
await selim.getByLabel('Yeni bölüm').fill('Kumlama')
await selim.getByRole('button', { name: 'Oluştur' }).click()
await selim.locator('.name-row', { hasText: 'Kumlama' }).waitFor()
ok('a manager can add a bölüm')
await nav(selim, 'Ekip')
await row(selim, 'Hasan Demir').click()
await dialog(selim).getByRole('group', { name: 'Seviye' }).getByRole('button', { name: 'Kalfa', exact: true }).click()
await dialog(selim).getByRole('button', { name: 'Kaydet' }).click()
await row(selim, 'Hasan Demir').filter({ hasText: 'Kalfa' }).waitFor()
ok('a manager can change a level')

// ---- phone width ----
const phone = await (await browser.newContext(PHONE)).newPage()
watch(phone, 'phone')
await signIn(phone, 'emir', 'emir1234')
expect((await phone.locator('.tabbar a').allInnerTexts()).join('|') === 'Projeler|Ekip|Ayarlar', 'the CEO has no İşlerim tab')
await nav(phone, 'Ekip')
await group(phone, 'Elektrik atölyesi').waitFor()
await phone.screenshot({ path: `${SHOTS}/55-ekip-telefon.png`, fullPage: true })
await row(phone, 'Ahmet Yılmaz').click()
await dialog(phone).getByRole('group', { name: 'Seviye' }).waitFor()
await phone.waitForTimeout(700) // let the sheet finish sliding up
await phone.screenshot({ path: `${SHOTS}/56-kisi-telefon.png` })
await dialog(phone).getByRole('button', { name: 'Kapat' }).click()
await nav(phone, 'Ayarlar')
await phone.locator('a.link-row').first().waitFor()
await phone.waitForTimeout(300)
await phone.screenshot({ path: `${SHOTS}/57-ayarlar-ceo-telefon.png`, fullPage: true })
expect(!(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'Ekip, the person sheet and Ayarlar work at phone width')

expect(problems.length === 0, `no errors in the browser${problems.length ? `: ${problems.join(' / ')}` : ''}`)
await browser.close()
console.log(`ALL ${step} BÖLÜM END-TO-END CHECKS PASSED`)
