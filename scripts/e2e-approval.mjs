// End-to-end check of manager approval and the Takvim (timeline) view.
//   scripts/local-up.sh && node scripts/e2e-approval.mjs [screenshot-folder]
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
const stepRow = (p, name) => p.locator('button.step', { hasText: name })
const closeDialog = async (p) => {
  await dialog(p).getByRole('button', { name: 'Kapat' }).click()
  await dialog(p).waitFor({ state: 'detached' })
}
async function signIn(p, username, password) {
  await p.goto(BASE)
  await p.getByLabel('Kullanıcı adı').fill(username)
  await p.getByLabel('Şifre').fill(password)
  await p.getByRole('button', { name: 'Giriş yap' }).click()
  await p.locator('.topbar').waitFor()
}

// ---- setup ----
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
watch(page, 'ceo')
await page.goto(BASE)
await page.getByLabel('Kurulum kodu').fill('kurulum')
await page.getByLabel('Ad soyad').fill('Emir Karabacak')
await page.getByLabel('Kullanıcı adı').fill('emir')
await page.getByLabel('Şifre').fill('emir1234')
await page.getByRole('button', { name: 'CEO hesabını oluştur' }).click()
await page.getByRole('heading', { name: 'Projeler' }).waitFor()
await page.evaluate(async () => {
  const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))
  const token = JSON.parse(localStorage.getItem(key)).access_token
  const add = (body) =>
    fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  await add({ full_name: 'Selim Ateş', username: 'selim', password: 'selim123', panel: 'manager' })
  await add({ full_name: 'Ahmet Yılmaz', username: 'ahmet', password: 'ahmet123', panel: 'worker' })
})

// ---- the choice is made when the project is created, not on the step type ----
await nav(page, 'Türler')
await page.locator('section[aria-label="Adım türleri"] .name-row').first().waitFor()
expect(await page.getByRole('switch').count() === 0, 'Türler no longer has approval switches')

await nav(page, 'Projeler')
await page.getByRole('button', { name: 'Yeni proje' }).click()
await dialog(page).getByLabel('Proje adı').fill('500 m³/gün RO Ünitesi')
await dialog(page).getByLabel('Proje kodu').fill('P-2614')
expect(await dialog(page).getByRole('switch').count() === 0, 'with no project type chosen there are no steps to choose from')
await dialog(page).getByLabel('Proje türü').selectOption({ label: 'RO Ünitesi' })
const switches = dialog(page).getByRole('group', { name: 'Eklenecek adımlar' }).getByRole('switch')
expect(await switches.count() === 8, 'choosing a type lists its steps, each with an "Onay gerekir" switch')
expect((await switches.evaluateAll((els) => els.filter((e) => e.checked).length)) === 0, 'all of them start switched off')
await dialog(page).getByRole('switch', { name: 'Test: onay gerekir' }).check()
await dialog(page).getByLabel('Proje türü').selectOption({ label: 'Filtre Grubu' })
await dialog(page).getByLabel('Proje türü').selectOption({ label: 'RO Ünitesi' })
expect(!(await dialog(page).getByRole('switch', { name: 'Test: onay gerekir' }).isChecked()), 'changing the project type clears the choices')
await dialog(page).getByRole('switch', { name: 'Test: onay gerekir' }).check()
await dialog(page).getByRole('switch', { name: 'Test: onay gerekir' }).scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await page.screenshot({ path: `${SHOTS}/40-yeni-proje-onay.png` })
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.getByRole('heading', { name: '500 m³/gün RO Ünitesi' }).waitFor()
for (const name of ['Test', 'Borulama']) {
  await stepRow(page, name).click()
  const on = await dialog(page).getByRole('switch', { name: 'Onay gerekir' }).isChecked()
  expect(on === (name === 'Test'), `${name}: approval is ${name === 'Test' ? 'on' : 'off'} on the new project's step`)
  await dialog(page).getByRole('button', { name: /Ahmet Yılmaz/ }).click()
  await page.waitForFunction(() => document.querySelectorAll('[role=dialog] .check-row[aria-pressed=true]').length === 1)
  await closeDialog(page)
}

// ---- worker hands in ----
const ahmet = await (await browser.newContext(PHONE)).newPage()
watch(ahmet, 'ahmet')
await signIn(ahmet, 'ahmet', 'ahmet123')
await ahmet.locator('button.job', { hasText: 'Borulama' }).click()
await dialog(ahmet).getByRole('button', { name: 'İşe başla' }).click()
await dialog(ahmet).getByRole('button', { name: 'İşi bitir', exact: true }).click()
await dialog(ahmet).locator('.facts .status-done').waitFor()
ok('a step without approval still finishes straight away for a worker')
await closeDialog(ahmet)

await ahmet.locator('button.job', { hasText: 'Test' }).click()
await dialog(ahmet).getByRole('button', { name: 'İşe başla' }).click()
await dialog(ahmet).getByRole('button', { name: 'Bitir ve onaya gönder' }).waitFor()
ok('on a step that needs approval the button says it will be sent for approval')
await ahmet.waitForTimeout(400)
await ahmet.screenshot({ path: `${SHOTS}/41-onaya-gonder-telefon.png` })
await dialog(ahmet).getByRole('button', { name: 'Bitir ve onaya gönder' }).click()
await dialog(ahmet).locator('.facts .status-review').waitFor()
await dialog(ahmet).getByText('Yönetici onayı bekleniyor.').waitFor()
expect(await dialog(ahmet).locator('.dialog-foot button').count() === 0, 'after handing in, the worker has nothing more to press')
await ahmet.screenshot({ path: `${SHOTS}/42-onay-bekliyor-telefon.png` })
await closeDialog(ahmet)
await ahmet.locator('section[aria-label="Onay bekleyen"] button.job', { hasText: 'Test' }).waitFor()
ok('the step sits under "Onay bekleyen" in İşlerim')

// ---- CEO sends it back ----
await nav(page, 'Projeler')
await page.reload()
await page.locator('section[aria-label="Onay bekleyen işler"]').waitFor()
expect((await page.locator('.tile', { hasText: 'Onay bekleyen' }).locator('.tile-value').innerText()) === '1', 'the board counts the step waiting for approval')
expect((await page.locator('section[aria-label="Onay bekleyen işler"]').innerText()).includes('Ahmet Yılmaz'), 'and lists it with who handed it in')
expect((await page.locator('a.project-card').innerText()).includes('1 / 8'), 'a step waiting for approval does not count as finished')
await page.screenshot({ path: `${SHOTS}/43-onay-bekleyenler.png`, fullPage: true })
await page.locator('section[aria-label="Onay bekleyen işler"]').getByRole('link', { name: 'İncele' }).click()
await stepRow(page, 'Test').click()
await dialog(page).getByText('Bu iş onayınızı bekliyor.').waitFor()
await dialog(page).getByRole('button', { name: 'Geri gönder' }).click()
expect(await dialog(page).getByRole('button', { name: 'İşçiye geri gönder' }).isDisabled(), 'sending back is not possible without a note')
await dialog(page).getByLabel('Neden geri gönderiyorsunuz?').fill('Basınç testi 30 dakika tutulmalı, 10 dakika yapılmış.')
await page.screenshot({ path: `${SHOTS}/44-geri-gonder.png` })
await dialog(page).getByRole('button', { name: 'İşçiye geri gönder' }).click()
await dialog(page).locator('.facts .status-active').waitFor()
ok('a manager can send a step back with a note')
await closeDialog(page)

// ---- worker sees the note and hands in again ----
await ahmet.reload()
await ahmet.locator('section[aria-label="Devam eden"] button.job', { hasText: 'Geri gönderildi' }).waitFor()
ok('the worker sees the step marked as sent back')
await ahmet.locator('button.job', { hasText: 'Test' }).click()
await dialog(ahmet).getByText('Basınç testi 30 dakika tutulmalı, 10 dakika yapılmış.').waitFor()
ok('and can read why')
await ahmet.waitForTimeout(400)
await ahmet.screenshot({ path: `${SHOTS}/45-geri-gonderildi-telefon.png` })
await dialog(ahmet).getByRole('button', { name: 'Bitir ve onaya gönder' }).click()
await dialog(ahmet).locator('.facts .status-review').waitFor()
await closeDialog(ahmet)

// ---- a manager approves from the board ----
const selim = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
watch(selim, 'selim')
await signIn(selim, 'selim', 'selim123')
await selim.locator('section[aria-label="Onay bekleyen işler"]').getByRole('button', { name: 'Onayla' }).click()
await selim.locator('section[aria-label="Onay bekleyen işler"]').waitFor({ state: 'detached' })
expect((await selim.locator('a.project-card').innerText()).includes('2 / 8'), 'approving finishes the step')
await ahmet.reload()
await ahmet.locator('section[aria-label="Son bitenler"] button.job', { hasText: 'Test' }).waitFor()
ok('the worker sees it finished')

// ---- a manager's own finish needs nobody ----
await selim.locator('a.project-card').click()
await stepRow(selim, 'Ekipman montajı').click()
await dialog(selim).getByRole('switch', { name: 'Onay gerekir' }).check()
await selim.waitForFunction(() => document.querySelector('[role=dialog] input.switch').checked)
ok('approval can be switched on for a single step')
await dialog(selim).getByRole('button', { name: 'İşi bitir', exact: true }).click()
await dialog(selim).locator('.facts .status-done').waitFor()
ok('a manager finishing a step that needs approval completes it directly')
await dialog(selim).getByLabel('Bitiş tarihi').fill('2027-02-01')
await closeDialog(selim)
await stepRow(selim, 'Borulama').click()
await dialog(selim).getByLabel('Bitiş tarihi').fill('2027-02-10')
await selim.waitForTimeout(300)
await closeDialog(selim)

// ---- Takvim ----
await nav(page, 'Projeler')
await page.getByRole('button', { name: 'Yeni proje' }).click()
await dialog(page).getByLabel('Proje adı').fill('Geciken filtre')
await dialog(page).getByLabel('Teslim tarihi').fill('2026-01-15')
await dialog(page).getByLabel('Proje türü').selectOption({ label: 'Filtre Grubu' })
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.getByRole('heading', { name: 'Geciken filtre' }).waitFor()
await page.getByRole('button', { name: 'Düzenle' }).waitFor()
await stepRow(page, 'Test').click()
expect(!(await dialog(page).getByRole('switch', { name: 'Onay gerekir' }).isChecked()), 'a project created without choosing any has no approval steps')
await closeDialog(page)
await nav(page, 'Projeler')
await page.locator('a.project-card', { hasText: '500 m³/gün RO Ünitesi' }).click()
await page.getByRole('button', { name: 'Düzenle' }).click()
await dialog(page).getByLabel('Teslim tarihi').fill('2027-03-01')
await dialog(page).getByRole('button', { name: 'Kaydet' }).click()
await dialog(page).waitFor({ state: 'detached' })

await nav(page, 'Projeler')
await page.locator('.project-grid').waitFor()
expect(await page.locator('.tl').count() === 0, 'Projeler opens in the list view, as before')
await page.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Takvim' }).click()
await page.locator('.tl').waitFor()
expect(await page.locator('.tl-row').count() === 2 && await page.locator('.project-grid').count() === 0, 'Takvim shows one row per project instead of the cards')
expect(await page.locator('.tl-row', { hasText: 'Geciken filtre' }).locator('.tl-bar.tl-late').count() === 1, 'a project past its delivery date is drawn as late')
expect(await page.locator('.tl-row', { hasText: '500 m³/gün RO Ünitesi' }).locator('.tl-mark').count() === 2, 'steps with a due date appear as dots')
const geometry = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.tl-row')].find((r) => r.textContent.includes('500 m³'))
  const bar = row.querySelector('.tl-bar').getBoundingClientRect()
  const today = document.querySelector('.tl-today').getBoundingClientRect()
  const marks = [...row.querySelectorAll('.tl-mark')].map((m) => m.getBoundingClientRect().left)
  return { starts: bar.left <= today.left + 1, ends: bar.right > today.left, marksInside: marks.every((m) => m > today.left && m < bar.right), width: bar.width }
})
expect(geometry.starts && geometry.ends && geometry.marksInside, 'the bar runs from before today to the delivery date, with the dots inside it')
// 1 March 2027 is 147 days after 5 October 2026; the bar is one day wider than the gap.
const expectedDays = Math.round((Date.UTC(2027, 2, 1) - Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 86400000) + 1
expect(Math.abs(geometry.width - expectedDays * 14) < 1, `the bar's length matches the number of days to delivery (${expectedDays})`)
await page.screenshot({ path: `${SHOTS}/46-takvim.png` })
await page.reload()
await page.locator('.tl').waitFor()
ok('the chosen view is remembered after a reload')
await page.locator('.tl-row', { hasText: 'Geciken filtre' }).locator('.tl-label').click()
await page.getByRole('heading', { name: 'Geciken filtre' }).waitFor()
ok('a project opens from the timeline')

// ---- Takvim on a phone ----
const emirPhone = await (await browser.newContext(PHONE)).newPage()
watch(emirPhone, 'emir-phone')
await signIn(emirPhone, 'emir', 'emir1234')
await emirPhone.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Takvim' }).click()
await emirPhone.locator('.tl').waitFor()
await emirPhone.waitForTimeout(300)
await emirPhone.screenshot({ path: `${SHOTS}/47-takvim-telefon.png` })
const scroll = await emirPhone.evaluate(() => {
  const tl = document.querySelector('.tl')
  return { page: document.documentElement.scrollWidth > window.innerWidth, inner: tl.scrollWidth > tl.clientWidth }
})
expect(!scroll.page && scroll.inner, 'on a phone the timeline scrolls inside its own box, not the whole page')

await browser.close()
if (problems.length) {
  console.log('Browser problems:\n' + problems.join('\n'))
  process.exit(1)
}
console.log(`ALL ${step} APPROVAL AND TIMELINE CHECKS PASSED`)
