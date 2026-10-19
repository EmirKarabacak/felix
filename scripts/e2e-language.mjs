// End-to-end check of the English version, the dark theme, the switches in
// Ayarlar and the Ekip role labels.
//   scripts/local-up.sh && node scripts/e2e-language.mjs [screenshot-folder]
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  ;({ chromium } = require('/opt/npm-tools/node_modules/playwright'))
}

const BASE = process.env.FELIX_URL ?? 'http://127.0.0.1:5173'
const SHOTS = process.argv[2] ?? '/tmp'
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
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
const nav = (p, label) => p.locator('.topnav a, .tabbar a').filter({ hasText: label }).locator('visible=true').first().click()
const dialog = (p) => p.getByRole('dialog')
const theme = (p) => p.evaluate(() => document.documentElement.getAttribute('data-theme'))
const background = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor)
async function signIn(p, username, password, labels = ['Kullanıcı adı', 'Şifre', 'Giriş yap']) {
  await p.goto(BASE)
  await p.getByLabel(labels[0]).fill(username)
  await p.getByLabel(labels[1]).fill(password)
  await p.getByRole('button', { name: labels[2] }).click()
  await p.locator('.topbar').waitFor()
}
/** The role label sits wholly left of the row's arrow, in every row of Ekip. */
async function badgesClear(p) {
  return p.locator('button.person').evaluateAll((rows) =>
    rows.every((row) => {
      const badge = row.querySelector('.badge')?.getBoundingClientRect()
      const go = row.querySelector('.go')?.getBoundingClientRect()
      return !badge || !go || badge.right <= go.left + 0.5
    }),
  )
}

// ---- setup ----
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
watch(page, 'ceo')
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
  const [satin] = await rest('bolumler?select=id&kod=eq.satinalma')
  const [kaynak] = await rest('uzmanliklar?select=id&name=eq.Kaynakçı')
  await add({ full_name: 'Selim Ateş', username: 'selim', password: 'selim123', panel: 'manager', bolum_id: satin.id })
  await add({
    full_name: 'Ahmet Yılmaz',
    username: 'ahmet',
    password: 'ahmet123',
    panel: 'worker',
    bolum_id: imalat.id,
    uzmanliklar: [{ uzmanlik_id: kaynak.id, seviye: 'kalfa' }],
  })
})

// A project with one step for Ahmet.
await page.getByRole('button', { name: 'Yeni proje' }).click()
await dialog(page).getByLabel('Proje adı').fill('500 m³/gün RO Ünitesi')
await dialog(page).getByLabel('Proje türü').selectOption({ label: 'RO Ünitesi' })
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.locator('button.step').first().waitFor()
await page.locator('button.step', { hasText: 'Şase imalatı' }).click()
await dialog(page).getByRole('button', { name: /Ahmet Yılmaz/ }).click()
await dialog(page).getByText('Atanan kişiler').first().waitFor()
expect(true, 'the step window says "Atanan kişiler" (not "Sorumlular")')
await dialog(page).getByRole('button', { name: 'Kapat' }).click()
await dialog(page).waitFor({ state: 'detached' })
const projectUrl = page.url()

// ---- Ekip: role labels no longer run over the arrow ----
await nav(page, 'Ekip')
await page.locator('button.person', { hasText: 'Selim Ateş' }).waitFor()
expect(await page.locator('button.person', { hasText: 'Selim Ateş' }).locator('.badge').innerText() === 'Bölüm Sorumlusu', 'Ekip shows Bölüm Sorumlusu')
expect(await badgesClear(page), 'desktop: every role label sits left of its arrow')
await page.screenshot({ path: `${SHOTS}/70-ekip-etiketler.png`, fullPage: true })

// ---- the switches in Ayarlar; Turkish and Sistem by default ----
await nav(page, 'Ayarlar')
const settings = page.locator('section[aria-label="Dil ve görünüm"]')
await settings.waitFor()
expect(
  (await settings.getByRole('button', { name: 'Türkçe' }).getAttribute('aria-pressed')) === 'true' &&
    (await settings.getByRole('button', { name: 'Sistem' }).getAttribute('aria-pressed')) === 'true',
  'Ayarlar starts on Türkçe and Sistem',
)
expect((await theme(page)) === null, 'Sistem puts no theme on the page (it follows the phone)')

// ---- English ----
await settings.getByRole('button', { name: 'English' }).click()
await page.getByRole('heading', { name: 'Settings' }).waitFor()
const tabs = await page.locator('.topnav a').allInnerTexts()
expect(JSON.stringify(tabs) === JSON.stringify(['Projects', 'Team', 'Settings']), `tabs in English: ${tabs.join(', ')}`)
expect(await page.evaluate(() => document.documentElement.lang) === 'en', 'the page says it is in English')
const appearance = page.locator('section[aria-label="Language and appearance"]')
expect(await appearance.getByText('Theme').count() === 1, 'Ayarlar: "Language and appearance" with Theme')
expect(await page.getByText('Lists').count() >= 1 && await page.getByText('Companies that place orders, and contact details').count() === 1, 'the lists are in English, with the agreed Firmalar wording')
expect(await page.locator('.fact', { hasText: 'Role' }).getByText('General Manager').count() === 1, 'my role reads General Manager')

// ---- dark ----
await appearance.getByRole('button', { name: 'Dark' }).click()
expect((await theme(page)) === 'dark', 'Dark puts the dark theme on the page')
expect((await background(page)) === 'rgb(0, 0, 0)', 'the page turns black')
await page.screenshot({ path: `${SHOTS}/71-settings-en-dark.png`, fullPage: true })

// Both choices survive a reload.
await page.reload()
await page.getByRole('heading', { name: 'Settings' }).waitFor()
expect((await theme(page)) === 'dark', 'dark stays after a reload')

await nav(page, 'Team')
await page.locator('button.person', { hasText: 'Selim Ateş' }).waitFor()
const team = await page.locator('.page').innerText()
expect(team.includes('Department Head') && team.includes('Staff') && team.includes('General Manager and IT'), 'Team: roles and groups in English')
expect(team.includes('Purchasing') && team.includes('Production'), 'Team: bölüm names in English')
expect(team.includes('Skilled'), 'Team: Kalfa reads Skilled')
expect(await badgesClear(page), 'English: every role label sits left of its arrow')
await page.screenshot({ path: `${SHOTS}/72-team-en-dark.png`, fullPage: true })

await page.goto(projectUrl)
await page.getByRole('button', { name: 'Add step' }).waitFor()
expect(await page.locator('section[aria-label="Steps"]').count() === 1, 'project page: Steps')
await page.locator('button.step', { hasText: 'Şase imalatı' }).click()
await dialog(page).getByText('Assigned people').first().waitFor()
expect(await dialog(page).getByRole('button', { name: 'Start work' }).count() === 1, 'step window: Start work')
await page.screenshot({ path: `${SHOTS}/73-step-en-dark.png` })
await dialog(page).getByRole('button', { name: 'Close' }).click()

// Light, then Sistem again.
await nav(page, 'Settings')
await page.locator('section[aria-label="Language and appearance"]').getByRole('button', { name: 'Light' }).click()
expect((await theme(page)) === 'light' && (await background(page)) === 'rgb(245, 245, 247)', 'Light: the usual light grey page')
await page.locator('section[aria-label="Language and appearance"]').getByRole('button', { name: 'System' }).click()
expect((await theme(page)) === null, 'System again: follows the phone')

// ---- a worker on a phone, in a dark phone ----
const phone = await (await browser.newContext({ ...PHONE, colorScheme: 'dark' })).newPage()
watch(phone, 'ahmet')
await signIn(phone, 'ahmet', 'ahmet123')
expect((await background(phone)) === 'rgb(0, 0, 0)', 'Sistem on a phone set to dark shows the dark theme')
await nav(phone, 'Ayarlar')
await phone.locator('section[aria-label="Dil ve görünüm"]').getByRole('button', { name: 'English' }).click()
await phone.getByRole('heading', { name: 'Settings' }).waitFor()
await nav(phone, 'My jobs')
await phone.getByRole('heading', { name: 'My jobs' }).waitFor()
await phone.getByText('Şase imalatı').first().waitFor()
ok('My jobs lists the step, its name as typed')
await phone.screenshot({ path: `${SHOTS}/74-myjobs-en-dark-phone.png`, fullPage: true })

// Errors come in English too: the language stays on the sign-in screen.
await nav(phone, 'Settings')
await phone.getByRole('button', { name: 'Sign out' }).click()
await phone.getByLabel('Username').fill('ahmet')
await phone.getByLabel('Password').fill('yanlis-sifre')
await phone.getByRole('button', { name: 'Sign in' }).click()
await phone.getByText('Wrong username or password.').waitFor()
expect(true, 'a wrong password says so in English')

// ---- back in Turkish: the Ekip labels on a phone ----
const tr = await (await browser.newContext(PHONE)).newPage()
watch(tr, 'ceo-phone')
await signIn(tr, 'emir', 'emir1234')
await nav(tr, 'Ekip')
await tr.locator('button.person', { hasText: 'Selim Ateş' }).waitFor()
expect(await badgesClear(tr), 'phone: every role label sits left of its arrow')
await tr.screenshot({ path: `${SHOTS}/75-ekip-telefon.png`, fullPage: true })

await browser.close()
if (problems.length) {
  console.log(problems.join('\n'))
  throw new Error('FAILED: errors in the browser console')
}
console.log(`ALL ${step} LANGUAGE AND THEME CHECKS PASSED`)
