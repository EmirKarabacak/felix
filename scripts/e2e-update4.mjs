// End-to-end check of Update 4: the project report, automatic project codes,
// customer codes, "Projeyi teslim et" and the customer's "Proje raporu
// sorgula" page. Starts on a database without 0011 (as before it has run),
// checks Felix works as before there, then runs 0011 mid-test.
//   FELIX_MIGRATIONS_UNTIL=0010 scripts/local-up.sh && node scripts/e2e-update4.mjs [screenshot-folder]
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
// A certificate to add as a project file: a tiny but real PDF.
const PDF = join(tmpdir(), 'Basinc testi sertifikasi.pdf')
writeFileSync(
  PDF,
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
)
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
/** Runs a statement as one person, through the same access rules as the app. */
const as = (username, text) =>
  sql(
    `begin; select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where username = '${username}'))::text, true); set local role authenticated; ${text}; commit;`,
  )

// A UTF-8 locale, so a download keeps its Turkish file name.
const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8' } })
const problems = []
let nextFile = null
function watch(p, name) {
  p.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`))
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`${name} console: ${m.text()}`)
  })
  // The camera (or a file picker): "take" the test photo, or the file set for this once.
  p.on('filechooser', (chooser) => {
    const file = nextFile ?? PHOTO
    nextFile = null
    void chooser.setFiles(file)
  })
}
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] }
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
const dialog = (p) => p.getByRole('dialog')
const stepRow = (p, name) => p.locator('button.step', { has: p.locator('.step-name', { hasText: name }) })
const closeDialog = async (p) => {
  await dialog(p).getByRole('button', { name: /^(Kapat|Close)$/ }).click()
  await dialog(p).waitFor({ state: 'detached' })
}
/** Every <img> inside has loaded and has a size. */
const imagesLoaded = (scope) =>
  scope.locator('img').evaluateAll(async (imgs) => {
    for (const img of imgs) if (!img.complete) await new Promise((done) => img.addEventListener('load', done, { once: true }))
    return imgs.length > 0 && imgs.every((img) => img.naturalWidth > 0)
  })
/** Runs a poppler tool on a saved file. */
const poppler = (tool, ...args) => execFileSync(tool, args).toString()
/**
 * Waits for the report's pages on screen, saves the file with "PDF olarak
 * kaydet" and reads it back: its text, pages, fonts and pictures. With a
 * condition, saves again until the file meets it (a tick makes a new file).
 */
async function savedPdf(p, file, until = () => true) {
  for (let i = 0; ; i++) {
    await p.locator('.pdf-pages canvas.pdf-page').first().waitFor()
    const button = p.getByRole('button', { name: /^(PDF olarak kaydet|Save as PDF)$/ })
    await button.waitFor()
    // A new file may start being made just as the button is pressed: then press it again.
    const download = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), button.click()]).then(
      ([d]) => d,
      () => null,
    )
    if (!download) {
      if (i === 20) throw new Error(`FAILED: no file was saved (${file})`)
      continue
    }
    await download.saveAs(file)
    const images = poppler('pdfimages', '-list', file).split('\n').slice(2).filter(Boolean)
    const r = {
      name: download.suggestedFilename(),
      text: poppler('pdftotext', '-layout', file, '-'),
      info: poppler('pdfinfo', file),
      fonts: poppler('pdffonts', file),
      jpegs: images.filter((l) => /\bjpeg\b/.test(l)).length,
      logos: images.filter((l) => !/\bjpeg\b/.test(l) && !/\bsmask\b/.test(l)).length,
    }
    r.pages = Number(r.info.match(/Pages:\s+(\d+)/)[1])
    if (until(r)) return r
    if (i === 20) throw new Error(`FAILED: the saved file never changed as expected (${file})`)
    await p.waitForTimeout(500)
  }
}
/** The file's text without the line that says when it was made. */
const withoutDate = (text) => text.replace(/(Rapor tarihi|Report date): .*/, '')
const yy = sql(`select to_char(now() at time zone 'Europe/Istanbul', 'YY')`)

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

// ---- before 0011: codes are typed, and there is no report ----
await page.getByRole('button', { name: 'Yeni proje' }).click()
await dialog(page).getByLabel('Proje adı').fill('Eski proje')
await dialog(page).getByLabel('Proje kodu').fill('RO-24')
await dialog(page).getByLabel('Proje türü').selectOption({ label: 'Filtre Grubu' })
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.locator('button.step').first().waitFor()
expect((await page.locator('.page-head .mono').innerText()).startsWith('RO-24'), 'before 0011 a project code is typed, as before')
expect((await page.locator('.customer-code, .deliver').count()) === 0, 'and there is no customer code or delivery')
const eskiId = page.url().split('/').pop()

const customer = await open('customer', PHONE)
await customer.goto(BASE)
await customer.getByRole('link', { name: 'Proje raporu sorgula' }).waitFor()
await customer.screenshot({ path: `${SHOTS}/99-giris-telefon.png` })
await customer.getByRole('link', { name: 'Proje raporu sorgula' }).click()
await customer.getByLabel('Müşteri kodu').fill('AF-26-001-ABCD')
await customer.getByRole('button', { name: 'Raporu göster' }).click()
await customer.getByText('Proje raporları henüz kurulmadı.').waitFor()
ok('a customer is told reports are not set up yet')

// ---- 0011 runs ----
const MIGRATION = fileURLToPath(new URL('../supabase/migrations/0011_proje_raporu.sql', import.meta.url))
psql(['-f', MIGRATION])
ok('0011 runs on a database already in use')
psql(['-f', MIGRATION])
ok('and can be run a second time')

await page.reload()
await page.locator('button.step').first().waitFor()
expect((await page.locator('.page-head .mono').innerText()).startsWith(`AF-${yy}-001`), `the earlier project now has the code AF-${yy}-001`)
await page.getByRole('button', { name: 'Düzenle' }).click()
expect((await dialog(page).getByLabel('Proje kodu').count()) === 0, 'and the code can no longer be edited')
await closeDialog(page)

// ---- a new project gets the next code by itself ----
const dueDay = sql(`select to_char(current_date - 2, 'YYYY-MM-DD')`)
await nav(page, 'Projeler')
await page.getByRole('button', { name: 'Yeni proje' }).click()
expect((await dialog(page).getByLabel('Proje kodu').count()) === 0, 'the new-project form has no code to type')
await dialog(page).getByLabel('Proje adı').fill('Kumlu filtre 2 m³/sa')
await dialog(page).getByLabel('Firma').selectOption({ label: '+ Yeni firma ekle…' })
await dialog(page).getByLabel('Yeni firma adı').fill('Deniz Su A.Ş.')
await dialog(page).getByLabel('Teslim tarihi').fill(dueDay)
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.getByRole('heading', { name: 'Kumlu filtre 2 m³/sa' }).waitFor()
const code = `AF-${yy}-002`
expect((await page.locator('.page-head .mono').innerText()).startsWith(code), `it gets ${code}`)
const projectId = page.url().split('/').pop()
await page.getByRole('button', { name: 'Adım ekle' }).click()
for (const name of ['Şase imalatı', 'Paketleme ve sevkiyat']) {
  await dialog(page).locator('.name-row', { has: page.locator('.label-text', { hasText: name }) }).getByRole('button', { name: 'Ekle' }).click()
  await stepRow(page, name).waitFor()
}
await closeDialog(page)

// ---- the customer code ----
const codeCard = page.locator('.customer-code')
const customerCode = await codeCard.locator('.code-value').innerText()
expect(new RegExp(`^${code}-[A-HJ-NP-Z2-9]{4}$`).test(customerCode), `the project page shows the customer code ${customerCode}`)
await codeCard.getByRole('button', { name: 'Kopyala' }).click()
await codeCard.getByRole('button', { name: 'Kopyalandı' }).waitFor()
expect((await page.evaluate(() => navigator.clipboard.readText())) === customerCode, '"Kopyala" copies it')
await page.screenshot({ path: `${SHOTS}/100-musteri-kodu.png` })

// The customer, before the work is done.
await customer.goto(`${BASE}/rapor`)
await customer.getByLabel('Müşteri kodu').fill('AF-26-001-ZZZZ')
await customer.getByRole('button', { name: 'Raporu göster' }).click()
await customer.getByText('Bu kodla bir proje bulunamadı. Kodu kontrol edip tekrar deneyin.').waitFor()
ok('a wrong code opens nothing')
await customer.getByLabel('Müşteri kodu').fill(customerCode)
await customer.getByRole('button', { name: 'Raporu göster' }).click()
await customer.getByText('Projeniz hazırlanıyor. Bütün işler bitince raporu burada görebilirsiniz.').waitFor()
expect((await customer.locator('.report-wait').innerText()).includes('Kumlu filtre 2 m³/sa'), 'before every step is done the customer sees only that it is being prepared')
await customer.screenshot({ path: `${SHOTS}/101-hazirlaniyor-telefon.png` })

// ---- the work: a problem with a material request, a send-back, two finishes ----
const step1 = sql(`select id from public.project_steps where project_id = '${projectId}' and name = 'Şase imalatı'`)
const step2 = sql(`select id from public.project_steps where project_id = '${projectId}' and name = 'Paketleme ve sevkiyat'`)
as('emir', `insert into public.step_assignees (step_id, user_id) select '${step1}', id from public.profiles where username = 'ahmet'`)
as('emir', `insert into public.step_assignees (step_id, user_id) select '${step2}', id from public.profiles where username = 'selim'`)
as('ahmet', `select public.step_action('${step1}', 'start')`)
as('ahmet', `select public.sorun_bildir('${step1}', 'Malzeme eksik', null, 'Paslanmaz profil 40x40', '12 boy')`)
as('selim', `select public.talep_action((select id from public.talepler where step_id = '${step1}'), 'geldi')`)
as('selim', `select public.step_action('${step1}', 'start')`)

const ahmet = await open('ahmet', PHONE, 'ahmet', 'ahmet123')
async function ahmetFinishes() {
  await ahmet.goto(`${BASE}/projeler/${projectId}`)
  await stepRow(ahmet, 'Şase imalatı').click()
  await dialog(ahmet).getByRole('button', { name: 'İşi bitir', exact: true }).click()
  await dialog(ahmet).locator('.facts .status-review').waitFor()
  await closeDialog(ahmet)
}
await ahmetFinishes()
as('selim', `select public.step_action('${step1}', 'reject', null, 'Kaynak dikişleri temizlenmeli.')`)
await ahmetFinishes()
as('selim', `select public.step_action('${step1}', 'approve')`)
as('selim', `select public.step_action('${step2}', 'start')`)
const selim = await open('selim', DESKTOP, 'selim', 'selim123')
await selim.goto(`${BASE}/projeler/${projectId}`)
await stepRow(selim, 'Paketleme ve sevkiyat').click()
await dialog(selim).getByRole('button', { name: 'İşi bitir', exact: true }).click()
await dialog(selim).locator('.facts .status-done').waitFor()
await closeDialog(selim)
ok('the steps are done through the app, with finish photos')

// Known times, so the report's sums can be checked: started three days ago.
sql(`
  with e as (select id, row_number() over (order by created_at, id) as n from public.step_events where step_id = '${step1}' and kind not in ('assigned', 'unassigned'))
  update public.step_events s set created_at = date_trunc('hour', now()) - interval '3 days' + case e.n
    when 1 then interval '0 hours'   -- started
    when 2 then interval '2 hours'   -- problem
    when 3 then interval '5 hours'   -- resolved
    when 4 then interval '20 hours'  -- handed in
    when 5 then interval '22 hours'  -- sent back
    when 6 then interval '26 hours'  -- handed in again
    else interval '27 hours'         -- approved
  end
  from e where e.id = s.id;
  with e as (select id, row_number() over (order by created_at, id) as n from public.step_events where step_id = '${step2}' and kind not in ('assigned', 'unassigned'))
  update public.step_events s set created_at = date_trunc('hour', now()) - interval '3 days' + case e.n when 1 then interval '30 hours' else interval '33 hours' end
  from e where e.id = s.id;
  update public.project_steps set started_at = date_trunc('hour', now()) - interval '3 days', finished_at = date_trunc('hour', now()) - interval '3 days' + interval '26 hours' where id = '${step1}';
  update public.project_steps set started_at = date_trunc('hour', now()) - interval '3 days' + interval '30 hours', finished_at = date_trunc('hour', now()) - interval '3 days' + interval '33 hours' where id = '${step2}';
  update public.talepler set created_at = date_trunc('hour', now()) - interval '3 days' + interval '2 hours', closed_at = date_trunc('hour', now()) - interval '3 days' + interval '5 hours' where step_id = '${step1}';
`)

// ---- delivery ----
await page.reload()
const deliver = page.locator('.deliver')
await deliver.getByText('Bütün adımlar bitti.').waitFor()
ok('once every step is done the project page says so, with the report')
await nav(page, 'Projeler')
await page.getByRole('button', { name: /Biten/ }).click()
expect((await page.locator('a.project-card', { hasText: 'Kumlu filtre' }).innerText()).includes('Teslim bekliyor'), 'Biten shows it is waiting for delivery')
await page.locator('a.project-card', { hasText: 'Kumlu filtre' }).click()
await deliver.getByRole('button', { name: 'Projeyi teslim et' }).click()
await deliver.getByText(/^Teslim edildi: /).waitFor()
expect((await page.locator('.page-head .mono').innerText()).includes('Teslim edildi'), '"Projeyi teslim et" records the delivery')
await deliver.getByRole('button', { name: 'Teslimi geri al' }).click()
await deliver.getByRole('button', { name: 'Projeyi teslim et' }).waitFor()
ok('and can be undone')
await deliver.getByRole('button', { name: 'Projeyi teslim et' }).click()
await deliver.getByText(/^Teslim edildi: /).waitFor()
await page.screenshot({ path: `${SHOTS}/102-teslim.png` })
await nav(page, 'Projeler')
await page.getByRole('button', { name: /Biten/ }).click()
expect((await page.locator('a.project-card', { hasText: 'Kumlu filtre' }).innerText()).includes('Teslim edildi'), 'Biten then shows it as delivered')

// A certificate among the project files.
await page.locator('a.project-card', { hasText: 'Kumlu filtre' }).click()
nextFile = PDF
await page.locator('section', { has: page.getByRole('heading', { name: 'Proje dosyaları' }) }).getByRole('button', { name: 'Dosya ekle' }).click()
await page.getByText('Basinc testi sertifikasi.pdf').first().waitFor()

// ---- İç rapor ----
await deliver.getByRole('link', { name: 'Rapor' }).click()
const ic = await savedPdf(page, join(SHOTS, '103-ic-rapor.pdf'))
expect(ic.name === `${code} - Kumlu filtre 2 m³ sa - İç rapor.pdf`, `Felix makes the file itself, named after the project: ${ic.name}`)
expect(/Page size:\s+595\.2\d? x 841\.8\d? pts \(A4\)/.test(ic.info), 'on A4 pages')
const fontRows = ic.fonts.split('\n').slice(2).filter(Boolean)
expect(fontRows.length > 0 && fontRows.every((l) => /Inter/.test(l) && /\byes\b/.test(l)), `only the Inter font, inside the file: ${fontRows.map((l) => l.split(/\s+/)[0]).join(', ')}`)
const icText = ic.text.replace(/\s+/g, ' ')
expect(icText.includes(code) && icText.includes('Deniz Su A.Ş.') && icText.includes('İÇ RAPOR'), 'the report shows the code, the company and that it is the internal one')
expect(icText.includes('2 gün geç'), 'planned two days ago and delivered today: 2 days late')
expect(icText.includes('Ahmet Yılmaz'), 'each step shows who did it')
expect(icText.includes('Çalışma: 21 sa'), 'work time leaves out the waits')
expect(icText.includes('Sorun beklemesi: 3 sa') && icText.includes('Onay beklemesi: 3 sa'), 'the problem and approval waits are shown apart')
expect(icText.includes('Geri gönderen: Selim Ateş') && icText.includes('Not: Kaynak dikişleri temizlenmeli.'), 'who sent the step back, and their note')
expect(icText.includes('Onaylayan: Selim Ateş'), 'who approved the step')
expect(icText.includes('Sorun: Malzeme eksik'), 'and the problem')
expect(/ 2 1 gün 1 1 Adım Toplam çalışma Geri gönderme Sorun /.test(icText), 'the total work time is one day (21 h + 3 h)')
expect(/Ahmet Yılmaz 1 21 sa 1 1/.test(icText), 'each person\'s steps, time, send-backs and problems')
expect(icText.includes('Malzeme talebi: Paslanmaz profil 40x40 · 12 boy') && icText.includes('Bekleme: 3 sa'), 'the material request, with how long it waited')
expect(ic.jpegs === 2, `each step's finish photo is inside the file (${ic.jpegs})`)
expect(ic.text.includes('Hadımköy') && /Sayfa 1 \/ \d/.test(ic.text) && ic.logos === ic.pages, `on the Aquafelix letterhead, with page numbers, on each of its ${ic.pages} pages`)
await page.screenshot({ path: `${SHOTS}/103-ic-rapor.png`, fullPage: true })

// The same file from a phone.
const emirPhone = await open('emir-phone', PHONE, 'emir', 'emir1234')
await emirPhone.goto(`${BASE}/projeler/${projectId}/rapor`)
const icPhone = await savedPdf(emirPhone, join(SHOTS, '103b-ic-rapor-telefon.pdf'))
expect(withoutDate(icPhone.text) === withoutDate(ic.text) && icPhone.info.match(/Pages:.*/)[0] === ic.info.match(/Pages:.*/)[0], 'a phone saves exactly the same document')
await emirPhone.screenshot({ path: `${SHOTS}/103c-ic-rapor-telefon.png`, fullPage: true })

// ---- Müşteri raporu: choosing what the customer sees ----
await page.getByRole('button', { name: 'Müşteri raporu' }).click()
const choice = page.locator('.report-choice')
await choice.locator('.pick-row').first().waitFor()
const choosable = sql(`select count(*) from public.dosyalar where project_id = '${projectId}' and eski_at is null and (step_id is null or mime like 'image/%')`)
expect(String(await choice.locator('.pick-row').count()) === choosable, `every current finish photo and the certificate can be chosen (${choosable})`)
expect((await savedPdf(page, join(SHOTS, '104-bos.pdf'))).jpegs === 0, 'nothing is shown to the customer until it is ticked')
const lastPhoto = choice.locator('.pick-row', { hasText: 'Şase imalatı' }).last()
await lastPhoto.getByRole('switch').click()
await choice.locator('.pick-row', { hasText: 'Basinc testi sertifikasi.pdf' }).getByRole('switch').click()
const secim = await savedPdf(page, join(SHOTS, '104-musteri-raporu.pdf'), (r) => r.jpegs === 1 && r.text.includes('Basinc testi sertifikasi.pdf'))
ok('the ticked photo and certificate go into the customer version')
expect(!secim.text.includes('Ahmet') && !secim.text.includes('Selim'), 'the customer version has no names')
expect(secim.name === `${code} - Kumlu filtre 2 m³ sa - Müşteri raporu.pdf`, `named as the customer version: ${secim.name}`)
await page.screenshot({ path: `${SHOTS}/104-musteri-raporu-secim.png`, fullPage: true })
await page.emulateMedia({ colorScheme: 'dark' })
await page.waitForTimeout(200)
await page.screenshot({ path: `${SHOTS}/104b-musteri-raporu-koyu.png` })
await page.emulateMedia({ colorScheme: 'light' })

// ---- Personel see neither the code nor the report ----
await ahmet.goto(`${BASE}/projeler/${projectId}`)
await stepRow(ahmet, 'Şase imalatı').waitFor()
expect((await ahmet.locator('.customer-code, .deliver').count()) === 0, 'Personel see no customer code and no delivery button')
await ahmet.goto(`${BASE}/projeler/${projectId}/rapor`)
await ahmet.waitForURL('**/islerim')
ok('and cannot open the report')

// ---- the customer's page ----
await customer.goto(BASE)
await customer.getByRole('link', { name: 'Proje raporu sorgula' }).click()
await customer.getByLabel('Müşteri kodu').fill(customerCode.toLowerCase().replace(/-/g, ' '))
await customer.getByRole('button', { name: 'Raporu göster' }).click()
const cust = await savedPdf(customer, join(SHOTS, '105-musteri-raporu-telefon.pdf'))
ok('the customer opens the report with the code (written in lower case, with spaces)')
const ctext = cust.text.replace(/\s+/g, ' ')
expect(ctext.includes('Yapılan işler') && ctext.includes('Şase imalatı') && ctext.includes('Paketleme ve sevkiyat'), 'it lists the work done')
expect(!ctext.includes('Ahmet') && !ctext.includes('Selim') && !ctext.includes('Malzeme') && !ctext.includes('İÇ RAPOR'), 'with no names and no internal problems')
expect(ctext.includes('Teslim edildi') && ctext.includes('Deniz Su A.Ş.'), 'with the company and the delivery date')
expect(cust.jpegs === 1 && ctext.includes('Basinc testi sertifikasi.pdf'), 'the ticked photo is inside, and the certificate is listed')
expect(withoutDate(cust.text) === withoutDate(secim.text), 'exactly what the manager saw as the customer version')
expect(cust.name === `${code} - Kumlu filtre 2 m³ sa - Proje raporu.pdf`, `the customer's file is called ${cust.name}`)
const certificate = customer.locator('.file-list a', { hasText: 'Basinc testi sertifikasi.pdf' })
expect((await certificate.getAttribute('href')).includes('download='), 'and the certificate downloads from the page')
await customer.screenshot({ path: `${SHOTS}/105-musteri-raporu-telefon.png`, fullPage: true })

const desk = await open('customer-desk', { viewport: { width: 1280, height: 900 } })
await desk.goto(`${BASE}/rapor?kod=${encodeURIComponent(customerCode)}`)
const custDesk = await savedPdf(desk, join(SHOTS, '106-musteri-raporu.pdf'))
ok('a link with the code opens the report directly')
expect(withoutDate(custDesk.text) === withoutDate(cust.text), 'a computer saves exactly the same document as the phone')
await desk.screenshot({ path: `${SHOTS}/106-musteri-raporu.png`, fullPage: true })
await desk.evaluate(() => localStorage.setItem('felix.lang', 'en'))
await desk.goto(`${BASE}/rapor?kod=${encodeURIComponent(customerCode)}`)
const english = await savedPdf(desk, join(SHOTS, '106b-customer-report.pdf'))
expect(english.text.includes('Work done') && /Page 1 of \d/.test(english.text), 'in English too')

// The unfinished project: only "being prepared".
const eskiCode = `AF-${yy}-001-${sql(`select anahtar from public.proje_anahtarlari where project_id = '${eskiId}'`)}`
await customer.getByRole('button', { name: 'Başka bir kod gir' }).click()
await customer.getByLabel('Müşteri kodu').fill(eskiCode)
await customer.getByRole('button', { name: 'Raporu göster' }).click()
await customer.locator('.report-wait').waitFor()
ok('an unfinished project shows only "Projeniz hazırlanıyor"')

// ---- "Yeni kod": the old code stops working ----
await page.goto(`${BASE}/projeler/${projectId}`)
await codeCard.getByRole('button', { name: 'Yeni kod' }).click()
await codeCard.getByRole('button', { name: 'Yeni kod oluştur' }).click()
await page.waitForFunction((old) => document.querySelector('.customer-code .code-value')?.textContent !== old, customerCode)
const newCode = await codeCard.locator('.code-value').innerText()
expect(newCode.startsWith(`${code}-`) && newCode !== customerCode, `"Yeni kod" makes a new customer code: ${newCode}`)
await customer.getByRole('button', { name: 'Başka bir kod gir' }).click()
await customer.getByLabel('Müşteri kodu').fill(customerCode)
await customer.getByRole('button', { name: 'Raporu göster' }).click()
await customer.getByText('Bu kodla bir proje bulunamadı. Kodu kontrol edip tekrar deneyin.').waitFor()
ok('and the old one no longer opens the report')

expect(problems.length === 0, `no errors in the browser${problems.length ? `: ${problems.join(' | ')}` : ''}`)
await browser.close()
console.log(`\nALL ${step} UPDATE 4 CHECKS PASSED`)
