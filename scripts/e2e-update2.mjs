// End-to-end check of Update 2: the finish photo, the step history and the
// Özet tab. Starts on a database without 0009 (as before Emir has run it),
// checks finishing still works there, then runs 0009 mid-test.
//   FELIX_MIGRATIONS_UNTIL=0008 scripts/local-up.sh && node scripts/e2e-update2.mjs [screenshot-folder]
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { photoFile } from './e2e-photo.mjs'
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

const browser = await chromium.launch()
const problems = []
const cameraOpened = new Map()
function watch(p, name) {
  p.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`))
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`${name} console: ${m.text()}`)
  })
  // Felix opens the camera: count it, and "take" the test photo.
  cameraOpened.set(p, 0)
  p.on('filechooser', (chooser) => {
    cameraOpened.set(p, cameraOpened.get(p) + 1)
    void chooser.setFiles(PHOTO)
  })
}
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }
async function open(name, context, username, password) {
  const p = await (await browser.newContext(context)).newPage()
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
const tabs = (p, where) => p.locator(`${where} a`).allInnerTexts().then((t) => t.join('|'))
const dialog = (p) => p.getByRole('dialog')
const group = (p, title) => p.locator('section', { has: p.locator('h3', { hasText: title }) }).first()
const tile = (p, label) => p.locator('.tile', { hasText: label }).locator('.tile-value').innerText()
const closeDialog = async (p) => {
  await dialog(p).getByRole('button', { name: /^(Kapat|Close)$/ }).click()
  await dialog(p).waitFor({ state: 'detached' })
}
/** The photo has loaded and has a size: the browser could read it. */
const photoShown = (scope) =>
  scope
    .locator('.photo img')
    .first()
    .evaluate(async (img) => {
      if (!img.complete) await new Promise((done) => img.addEventListener('load', done, { once: true }))
      return img.naturalWidth > 0
    })

// ---- setup: Genel Müdür, a Bölüm Sorumlusu and a Personel in İmalat ----
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
})
await page.getByRole('button', { name: 'Yeni proje' }).click()
await dialog(page).getByLabel('Proje adı').fill('500 m³/gün RO Ünitesi')
await dialog(page).getByLabel('Proje türü').selectOption({ label: 'RO Ünitesi' })
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.locator('button.step').first().waitFor()
const projectUrl = page.url()
// Ahmet gets the first three steps, Selim the fourth.
sql(`
  insert into public.step_assignees (step_id, user_id)
  select s.id, p.id from public.project_steps s, public.profiles p
  where (p.username = 'ahmet' and s.name in ('Malzeme hazırlık', 'Şase imalatı', 'Yüzey işlemi'))
     or (p.username = 'selim' and s.name = 'Ekipman montajı');
`)

// ---- before 0009: finishing works as before, without a photo ----
const ahmet = await open('ahmet', PHONE, 'ahmet', 'ahmet123')
await ahmet.locator('button.job', { hasText: 'Malzeme hazırlık' }).click()
await dialog(ahmet).getByRole('button', { name: 'İşe başla' }).click()
await dialog(ahmet).getByRole('button', { name: 'İşi bitir', exact: true }).click()
await dialog(ahmet).getByText('Onay bekleniyor.').waitFor()
expect(cameraOpened.get(ahmet) === 0, 'before 0009, finishing opens no camera and works as before')
expect((await dialog(ahmet).getByText('kamera açılır').count()) === 0, 'and the step window does not mention the camera')

// The history works before 0009 too: it was always recorded.
await dialog(ahmet).getByRole('button', { name: /^Geçmiş \(\d+\)$/ }).click()
const history = dialog(ahmet).locator('.history-list')
await history.getByText('Bitirildi, onaya gönderildi').waitFor()
const lines = await history.locator('.history-title').allInnerTexts()
expect(
  JSON.stringify(lines) === JSON.stringify(['Atandı: Ahmet Yılmaz', 'İşe başlandı', 'Bitirildi, onaya gönderildi']),
  `the step window shows the history, oldest first: ${lines.join(' / ')}`,
)
expect((await history.locator('.history-row').nth(1).innerText()).includes('Ahmet Yılmaz'), 'each line says who did it, and when')
await ahmet.screenshot({ path: `${SHOTS}/80-gecmis-telefon.png`, fullPage: true })
await closeDialog(ahmet)

// Özet: a tab for Genel Müdür and IT only; Projeler stays where they start.
await page.goto(BASE)
await page.getByRole('heading', { name: 'Projeler' }).waitFor()
expect((await tabs(page, '.topnav')) === 'Projeler|Özet|Ekip|Ayarlar', 'Genel Müdür gets an Özet tab after Projeler, and still starts on Projeler')
await nav(page, 'Özet')
await page.getByRole('heading', { name: 'Özet' }).waitFor()
expect((await tile(page, 'Onay bekleyen')) === '1', 'Özet counts the job awaiting approval')
expect((await group(page, 'Onay bekleyen işler').getByText('Malzeme hazırlık').count()) === 1, 'and lists it')

const selim = await open('selim', DESKTOP, 'selim', 'selim123')
expect(!(await tabs(selim, '.topnav')).includes('Özet'), 'a Bölüm Sorumlusu has no Özet tab')
await selim.goto(`${BASE}/ozet`)
await selim.getByRole('heading', { name: 'Projeler' }).waitFor()
expect(selim.url().endsWith('/projeler'), 'and is sent to Projeler if they open its address')

// ---- Emir runs 0009 ----
const migration = fileURLToPath(new URL('../supabase/migrations/0009_bitis_fotografi.sql', import.meta.url))
psql(['-1', '-f', migration])
psql(['-1', '-f', migration])
ok('0009 runs, twice, each time as one transaction')

// ---- a worker finishes with a photo ----
await ahmet.reload()
await ahmet.locator('button.job', { hasText: 'Şase imalatı' }).click()
await dialog(ahmet).getByRole('button', { name: 'İşe başla' }).click()
await dialog(ahmet).getByText('İşi bitirince kamera açılır: yapılan işin fotoğrafını çekin.').waitFor()
await ahmet.screenshot({ path: `${SHOTS}/81-kamera-notu-telefon.png`, fullPage: true })
ok('after 0009 the step window says finishing opens the camera')
await dialog(ahmet).getByRole('button', { name: 'İşi bitir', exact: true }).click()
await dialog(ahmet).getByText('Onay bekleniyor.').waitFor()
expect(cameraOpened.get(ahmet) === 1, 'pressing İşi bitir opened the camera, and the photo finished the job')
const files = await dialog(ahmet).locator('section.files .file-name').allInnerTexts()
expect(files.length === 1 && /^Bitiş fotoğrafı \d{4}-\d\d-\d\d \d\d\.\d\d\.jpg$/.test(files[0]), `the photo is in the step's files, made smaller as JPEG: ${files[0]}`)
const stored = sql(`select size from public.dosyalar where name like 'Bitiş fotoğrafı%'`)
expect(Number(stored) > 0 && Number(stored) < 200_000, `the stored photo is small (${stored} bytes)`)
expect(await photoShown(dialog(ahmet).locator('.note-review')), 'the worker sees the photo they handed in')

// ---- the Genel Müdür approves, seeing the photo ----
await page.goto(BASE)
const reviewRow = group(page, 'Onay bekleyen işler').locator('.problem', { hasText: 'Şase imalatı' })
await reviewRow.waitFor()
expect(await photoShown(reviewRow), "Projeler's approval list shows the photo next to its Onayla button")
await nav(page, 'Özet')
await page.getByRole('heading', { name: 'Özet' }).waitFor()
expect((await tile(page, 'Onay bekleyen')) === '2', 'Özet now counts two jobs awaiting approval')
await group(page, 'Onay bekleyen işler').locator('button.job', { hasText: 'Şase imalatı' }).click()
await dialog(page).getByText('Bu iş onayınızı bekliyor.').waitFor()
expect(await photoShown(dialog(page).locator('.note-review')), 'the approver sees the photo with the job')
await page.waitForTimeout(500) // the window's opening animation
await page.screenshot({ path: `${SHOTS}/82-onay-fotograf.png` })
await dialog(page).getByRole('button', { name: 'Onayla' }).click()
await dialog(page).getByText('Bitiş fotoğrafı', { exact: true }).waitFor()
expect(await photoShown(dialog(page).locator('.finish-photo')), 'a finished step keeps showing its photo')
await dialog(page).getByRole('button', { name: /^Geçmiş \(\d+\)$/ }).click()
const handIn = dialog(page).locator('.history-row', { hasText: 'Bitirildi, onaya gönderildi' })
expect(await photoShown(handIn), 'the history shows the photo next to the hand-in')
expect((await dialog(page).locator('.history-title').last().innerText()) === 'Onaylandı', 'and ends with the approval')
await dialog(page).locator('.history').scrollIntoViewIfNeeded()
await page.waitForTimeout(500) // the window's opening animation
await page.screenshot({ path: `${SHOTS}/83-gecmis-fotograf.png` })
await closeDialog(page)

// ---- Genel Müdür and IT take a photo too ----
await page.goto(projectUrl)
await page.locator('button.step', { hasText: 'Ekipman montajı' }).click()
await dialog(page).getByText('kamera açılır', { exact: false }).waitFor()
await dialog(page).getByRole('button', { name: 'İşi bitir', exact: true }).click()
await dialog(page).getByText('Bitiş fotoğrafı', { exact: true }).waitFor()
expect(cameraOpened.get(page) === 1, 'the Genel Müdür also takes a photo, and the step is done at once')
await closeDialog(page)

// ---- Özet: late projects and this week ----
sql(`update public.projects set due_date = current_date - 3`)
await nav(page, 'Özet')
await page.getByRole('heading', { name: 'Özet' }).waitFor()
await page.reload()
await group(page, 'Geciken projeler').getByText('500 m³/gün RO Ünitesi').waitFor()
expect((await tile(page, 'Geciken proje')) === '1', 'a project past its delivery date counts as late')
expect((await group(page, 'Geciken projeler').innerText()).includes('3 gün gecikti'), 'and says how many days late it is')
expect((await tile(page, 'Bu hafta biten')) === '2', 'Özet counts the jobs finished this week')
const week = await group(page, 'Bu hafta biten işler').locator('.job-name').allInnerTexts()
expect(week.includes('Şase imalatı') && week.includes('Ekipman montajı'), 'and lists them')
await page.screenshot({ path: `${SHOTS}/84-ozet.png`, fullPage: true })

const emirPhone = await open('emir-phone', PHONE, 'emir', 'emir1234')
expect((await tabs(emirPhone, '.tabbar')) === 'Projeler|Özet|Ekip|Ayarlar', 'on a phone the tab bar has Özet too')
await nav(emirPhone, 'Özet')
await emirPhone.getByRole('heading', { name: 'Özet' }).waitFor()
await emirPhone.screenshot({ path: `${SHOTS}/85-ozet-telefon.png`, fullPage: true })
expect(
  await emirPhone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  'Özet does not scroll sideways on a phone',
)

// ---- in English ----
await emirPhone.evaluate(() => localStorage.setItem('felix.lang', 'en'))
await emirPhone.reload()
await emirPhone.getByRole('heading', { name: 'Overview' }).waitFor()
expect((await tabs(emirPhone, '.tabbar')) === 'Projects|Overview|Team|Settings', 'in English the tab is Overview')
await group(emirPhone, 'Jobs finished this week').locator('button.job', { hasText: 'Şase imalatı' }).click()
await dialog(emirPhone).getByRole('button', { name: /^History \(\d+\)$/ }).click()
expect((await dialog(emirPhone).locator('.history-title').allInnerTexts()).includes('Finished, sent for approval'), 'the history reads in English')
expect((await dialog(emirPhone).getByText('Finish photo', { exact: true }).count()) === 1, 'and so does the photo label')

await browser.close()
if (problems.length) {
  console.log(problems.join('\n'))
  throw new Error('FAILED: errors in the browser console')
}
console.log(`ALL ${step} UPDATE 2 CHECKS PASSED`)
