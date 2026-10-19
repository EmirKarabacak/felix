// End-to-end check of 0008: Genel Müdür and IT, the four fixed bölümler,
// Uzmanlık, Talepler and Dosyalar. Starts on a database with 0007 but without
// 0008 (as before Emir has run it), checks the app still works, then runs 0008
// mid-test and checks what it carried over.
//   FELIX_MIGRATIONS_UNTIL=0007 scripts/local-up.sh && node scripts/e2e-0008.mjs [screenshot-folder]
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
const sql = (text) => psql(['-At', '-c', text]).toString().trim()

const browser = await chromium.launch()
const problems = []
function watch(p, name) {
  p.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`))
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`${name} console: ${m.text()}`)
  })
}
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }
async function open(name, context, username, password) {
  const p = await (await browser.newContext({ ...context, acceptDownloads: true })).newPage()
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
const row = (p, name) => p.locator('button.person', { hasText: name })
const stepRow = (p, name) => p.locator('button.step', { hasText: name })
const group = (p, title) => p.locator('section', { has: p.locator('h3', { hasText: title }) }).first()
const closeDialog = async (p) => {
  await dialog(p).getByRole('button', { name: 'Kapat' }).click()
  await dialog(p).waitFor({ state: 'detached' })
}
const pdf = (text) => ({ mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% ${text}\n`) })

// ---- before 0008: the app keeps working ----
const page = await open('genel-mudur', DESKTOP)
await page.goto(BASE)
await page.getByLabel('Kurulum kodu').fill('kurulum')
await page.getByLabel('Ad soyad').fill('Emir Karabacak')
await page.getByLabel('Kullanıcı adı').fill('emir')
await page.getByLabel('Şifre').fill('emir1234')
await page.getByRole('button', { name: 'Genel Müdür hesabını oluştur' }).click()
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
    await add({ full_name: 'Zeynep Tasarımcı', username: 'zeynep', password: 'zeynep123', panel: 'worker' }),
    await add({ full_name: 'Ayşe Satınalma', username: 'ayse', password: 'ayse1234', panel: 'worker' }),
  ].join(',')
})
expect(made === '200,200,200,200,200', 'test people created before the update')
// What the 0007 screens would have set: welding and electrical workshops with levels.
psql(['-c', `
  update public.profiles p set bolum_id = b.id from public.bolumler b where
    (p.username, b.name) in (('ahmet', 'Kaynak atölyesi'), ('murat', 'Elektrik atölyesi'), ('zeynep', 'Tasarım'), ('ayse', 'Satın alma'), ('selim', 'Satın alma'));
  insert into public.seviyeler (user_id, seviye) select id, 'usta' from public.profiles where username = 'ahmet';
  insert into public.seviyeler (user_id, seviye) select id, 'cirak' from public.profiles where username = 'murat';
`])
await page.reload()
await nav(page, 'Ekip')
await row(page, 'Ahmet Yılmaz').waitFor()
expect((await row(page, 'Emir Karabacak').innerText()).includes('Genel Müdür') && (await row(page, 'Selim Ateş').innerText()).includes('Bölüm Sorumlusu'),
  'the new role names show before the update')
await row(page, 'Selim Ateş').click()
expect((await dialog(page).getByRole('group', { name: 'Rol' }).getByRole('button').allInnerTexts()).join('|') === 'Genel Müdür|Bölüm Sorumlusu|Personel',
  'IT is offered only once the update has run')
await closeDialog(page)
await nav(page, 'Ayarlar')
await page.locator('a.link-row', { hasText: 'Uzmanlıklar' }).click()
await page.getByText('0008 dosyası henüz çalıştırılmamış').waitFor()
ok('Uzmanlıklar explains that the update is needed')

// A project and a problem reported the old way.
await nav(page, 'Projeler')
await page.getByRole('button', { name: 'Yeni proje' }).click()
await dialog(page).getByLabel('Proje adı').fill('RO 2027-01')
await dialog(page).getByLabel('Proje türü').selectOption({ label: 'RO Ünitesi' })
await dialog(page).getByText('Borulama').waitFor()
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.getByRole('heading', { name: 'RO 2027-01' }).waitFor()
const projectUrl = page.url()
for (const [name, who] of [['Şase imalatı', 'Ahmet Yılmaz'], ['Borulama', 'Ahmet Yılmaz'], ['Elektrik ve pano', 'Murat Kaya'], ['Test', 'Ahmet Yılmaz']]) {
  await stepRow(page, name).click()
  await dialog(page).getByRole('button', { name: new RegExp(who) }).click()
  await page.waitForFunction(() => document.querySelectorAll('[role=dialog] .check-row[aria-pressed=true]').length === 1)
  if (name === 'Şase imalatı') expect(await dialog(page).getByText('Dosyalar').count() === 0, 'no files on steps before the update')
  await closeDialog(page)
}
const ahmet = await open('ahmet', PHONE, 'ahmet', 'ahmet123')
await ahmet.locator('button.job', { hasText: 'Test' }).click()
await dialog(ahmet).getByRole('button', { name: 'Sorun bildir' }).click()
await dialog(ahmet).getByRole('button', { name: 'Malzeme eksik' }).click()
expect(await dialog(ahmet).getByLabel('Eksik malzeme').count() === 0, 'before the update a problem is reported the old way')
await dialog(ahmet).getByLabel('Not (isteğe bağlı)').fill('Conta yok')
await dialog(ahmet).getByRole('button', { name: 'Sorunu bildir' }).click()
await dialog(ahmet).locator('.note-warn', { hasText: 'Conta yok' }).waitFor()
await closeDialog(ahmet)
ok('and the step shows it')

// ---- Emir runs 0008 ----
psql(['-1', '-f', fileURLToPath(new URL('../supabase/migrations/0008_uzmanlik_talepler_dosyalar.sql', import.meta.url))])
psql(['-1', '-f', fileURLToPath(new URL('../supabase/migrations/0008_uzmanlik_talepler_dosyalar.sql', import.meta.url))])
ok('0008 runs, twice, each time as one transaction')
expect(sql('select string_agg(name, \',\' order by name) from public.bolumler') === 'Muhasebe,Satın alma,Tasarım,İmalat', 'the bölümler are now the fixed four')

await page.reload()
await nav(page, 'Ekip')
await row(page, 'Ahmet Yılmaz').waitFor()
const imalat = await group(page, 'İmalat').innerText()
expect(imalat.includes('Kaynakçı · Usta') && imalat.includes('Elektrikçi · Çırak'), 'the welding and electrical workshops became İmalat with their uzmanlık and level')
expect((await page.locator('section h3').first().innerText()).startsWith('Genel Müdür ve IT'), 'Genel Müdür and IT are listed first')
await page.screenshot({ path: `${SHOTS}/60-ekip-0008.png`, fullPage: true })

// ---- Uzmanlıklar and Türler ----
await nav(page, 'Ayarlar')
await page.locator('a.link-row', { hasText: 'Uzmanlıklar' }).click()
await page.locator('.name-row button.label').first().waitFor()
expect((await page.locator('.name-row button.label').allInnerTexts()).join('|') === 'Elektrikçi|Kaynakçı', 'the uzmanlık list starts with Kaynakçı and Elektrikçi')
await page.getByLabel('Yeni uzmanlık').fill('Montajcı')
await page.getByRole('button', { name: 'Oluştur' }).click()
await page.locator('.name-row button.label', { hasText: 'Montajcı' }).waitFor()
ok('Genel Müdür can add an uzmanlık')
await nav(page, 'Ayarlar')
await page.locator('a.link-row', { hasText: 'Türler' }).click()
const elektrik = page.getByLabel('Elektrik ve pano uzmanlığı')
await elektrik.waitFor()
expect((await elektrik.locator('option:checked').innerText()) === 'Elektrikçi', 'Elektrik ve pano suggests Elektrikçi from the start')
await page.getByLabel('Ekipman montajı uzmanlığı').selectOption({ label: 'Montajcı' })
await page.waitForFunction(() => document.querySelector('[aria-label="Ekipman montajı uzmanlığı"] option:checked')?.textContent === 'Montajcı')
await page.reload()
await page.getByLabel('Ekipman montajı uzmanlığı').waitFor()
expect((await page.getByLabel('Ekipman montajı uzmanlığı').locator('option:checked').innerText()) === 'Montajcı', 'a step type gets a suggested uzmanlık')
await page.screenshot({ path: `${SHOTS}/61-turler-uzmanlik.png`, fullPage: true })

// ---- Talepler: Malzeme eksik ----
await ahmet.reload()
await ahmet.locator('button.job', { hasText: 'Şase imalatı' }).click()
await dialog(ahmet).getByRole('button', { name: 'Sorun bildir' }).click()
await dialog(ahmet).getByRole('button', { name: 'Malzeme eksik' }).click()
expect(await dialog(ahmet).getByRole('button', { name: 'Sorunu bildir' }).isDisabled(), 'a missing material must be named')
await dialog(ahmet).getByLabel('Eksik malzeme').fill('DN50 flanş')
await dialog(ahmet).getByLabel('Miktar').fill('4 adet')
await ahmet.waitForTimeout(300)
await ahmet.screenshot({ path: `${SHOTS}/62-malzeme-eksik-telefon.png` })
await dialog(ahmet).getByRole('button', { name: 'Sorunu bildir' }).click()
await dialog(ahmet).locator('.talep', { hasText: 'Malzeme eksik: DN50 flanş · 4 adet' }).waitFor()
ok('the worker reports the missing material with how many')
expect((await dialog(ahmet).locator('.talep').innerText()).includes('Henüz kimse ilgilenmiyor'), 'and sees that nobody has taken it yet')
await closeDialog(ahmet)

const ayse = await open('ayse', PHONE, 'ayse', 'ayse1234')
const ayseTalep = ayse.locator('section[aria-label="Talepler"] .talep', { hasText: 'DN50 flanş' })
await ayseTalep.waitFor()
ok('Satın alma finds the request in İşlerim')
await ayseTalep.getByRole('button', { name: 'Ben ilgileniyorum' }).click()
await ayseTalep.getByText('Siz ilgileniyorsunuz').waitFor()
ok('"Ben ilgileniyorum" puts their name on it')
await ayseTalep.getByRole('button', { name: 'Sipariş verildi' }).click()
await ayseTalep.locator('.badge', { hasText: 'Sipariş verildi' }).waitFor()
ok('Satın alma marks it ordered')
await ayse.screenshot({ path: `${SHOTS}/63-talep-satinalma-telefon.png`, fullPage: true })

const selim = await open('selim', DESKTOP, 'selim', 'selim123')
const box = selim.locator('section[aria-label="Açık talepler"]')
await box.locator('.talep', { hasText: 'DN50 flanş' }).waitFor()
expect((await box.innerText()).includes('Ayşe Satınalma ilgileniyor'), 'Bölüm Sorumluları see the request on Projeler, with who is on it')
expect(await selim.locator('section[aria-label="Bildirilen sorunlar"]', { hasText: 'DN50' }).count() === 0, 'a problem with a request is not listed twice')
await selim.screenshot({ path: `${SHOTS}/64-acik-talepler.png`, fullPage: true })
await selim.goto(projectUrl)
await stepRow(selim, 'Şase imalatı').getByText('Malzeme talebi').waitFor()
ok('the step carries a mark for its open request')
await selim.goto(BASE)
await box.locator('.talep', { hasText: 'DN50 flanş' }).getByRole('button', { name: 'Geldi' }).click()
await box.waitFor({ state: 'detached' })
ok('a Bölüm Sorumlusu marks the material arrived')
await ahmet.reload()
const mine = ahmet.locator('section[aria-label="Talepler"] .talep', { hasText: 'DN50 flanş' })
await mine.locator('.badge', { hasText: 'Geldi' }).waitFor()
ok('the reporter sees it arrived')
await ahmet.screenshot({ path: `${SHOTS}/65-talep-geldi-telefon.png`, fullPage: true })

// ---- Talepler: Çizim hatalı goes to Tasarım ----
await ahmet.locator('button.job', { hasText: 'Borulama' }).click()
await dialog(ahmet).getByRole('button', { name: 'Sorun bildir' }).click()
await dialog(ahmet).getByRole('button', { name: 'Çizim hatalı' }).click()
await dialog(ahmet).getByLabel('Not (isteğe bağlı)').fill('Flanş ölçüsü yanlış')
await dialog(ahmet).getByRole('button', { name: 'Sorunu bildir' }).click()
await dialog(ahmet).locator('.talep', { hasText: 'Çizim hatalı' }).waitFor()
await closeDialog(ahmet)
await ayse.reload()
await ayse.getByRole('heading', { name: 'İşlerim' }).waitFor()
expect(await ayse.locator('.talep', { hasText: 'Çizim hatalı' }).count() === 0, 'a drawing request does not go to Satın alma')
const zeynep = await open('zeynep', PHONE, 'zeynep', 'zeynep123')
const cizim = zeynep.locator('section[aria-label="Talepler"] .talep', { hasText: 'Çizim hatalı' })
await cizim.waitFor()
expect((await cizim.innerText()).includes('Flanş ölçüsü yanlış'), 'Tasarım gets the drawing request with the note')
expect(await cizim.getByRole('button', { name: 'Sipariş verildi' }).count() === 0, 'a drawing request is never ordered')
await cizim.getByRole('button', { name: 'Düzeltildi' }).click()
await zeynep.locator('section[aria-label="Talepler"]').waitFor({ state: 'detached' })
ok('Tasarım marks the drawing fixed')

// ---- Dosyalar: project files ----
await zeynep.goto(projectUrl)
const ana = zeynep.locator('section[aria-label="Ana doküman"]')
await ana.getByText('Henüz ana doküman yok.').waitFor()
await ana.locator('input[type=file]').setInputFiles({ name: 'plan.pdf', ...pdf('ilk') })
await ana.locator('.file-name', { hasText: 'plan.pdf' }).waitFor()
ok('Tasarım uploads the Ana doküman')
await ana.locator('input[type=file]').setInputFiles({ name: 'plan.pdf', ...pdf('revize') })
await ana.locator('.file-list').first().locator('.file-name', { hasText: 'plan (2).pdf' }).waitFor()
expect(await ana.locator('.file-list').first().locator('.file-row').count() === 1, 'uploading the same name again makes "plan (2).pdf" the one Ana doküman')
await ana.getByRole('button', { name: 'Eski sürümler (1)' }).click()
await ana.locator('.file-old .file-name', { hasText: 'plan.pdf' }).waitFor()
ok('and the earlier one moves to Eski sürümler')
const extra = zeynep.locator('section[aria-label="Proje dosyaları"]')
await extra.locator('input[type=file]').setInputFiles([{ name: 'Sertifika CE.pdf', ...pdf('ce') }, { name: 'Basınç testi.pdf', ...pdf('test') }])
await extra.locator('.file-name', { hasText: 'Basınç testi.pdf' }).waitFor()
await extra.locator('.file-name', { hasText: 'Sertifika CE.pdf' }).waitFor()
ok('several project files can sit next to it')
await zeynep.waitForTimeout(300)
await zeynep.screenshot({ path: `${SHOTS}/66-proje-dosyalari-telefon.png`, fullPage: true })

await ahmet.goto(projectUrl)
const ahmetAna = ahmet.locator('section[aria-label="Ana doküman"]')
await ahmetAna.locator('.file-name', { hasText: 'plan (2).pdf' }).waitFor()
expect(await ahmetAna.locator('input[type=file]').count() === 0 && await ahmetAna.getByRole('button', { name: /Eski sürümler/ }).count() === 0,
  'a worker sees the current Ana doküman, but cannot replace it or open old versions')
const [download] = await Promise.all([ahmet.waitForEvent('download'), ahmetAna.getByRole('button', { name: 'plan (2).pdf indir' }).click()])
expect(download.suggestedFilename() === 'plan (2).pdf' && readFileSync(await download.path()).toString().includes('revize'), 'everyone downloads the current file under its name')

// ---- Dosyalar: step files ----
await stepRow(ahmet, 'Şase imalatı').click()
const stepFiles = dialog(ahmet).locator('section[aria-label="Dosyalar"]')
await stepFiles.locator('input[type=file]').setInputFiles({ name: 'kaynak.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('jpg-1') })
await stepFiles.locator('.file-name', { hasText: 'kaynak.jpg' }).waitFor()
await stepFiles.locator('input[type=file]').setInputFiles({ name: 'kaynak.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('jpg-2') })
await stepFiles.locator('.file-name', { hasText: 'kaynak (2).jpg' }).waitFor()
expect(await stepFiles.locator('.file-row').count() === 1 && await stepFiles.getByRole('button', { name: /sil$/ }).count() === 0,
  'a worker adds step files (the same name becomes "(2)") but cannot delete them')
await ahmet.waitForTimeout(300)
await ahmet.screenshot({ path: `${SHOTS}/67-adim-dosyalari-telefon.png` })
await closeDialog(ahmet)

await selim.goto(projectUrl)
await stepRow(selim, 'Şase imalatı').click()
const selimFiles = dialog(selim).locator('section[aria-label="Dosyalar"]')
await selimFiles.getByRole('button', { name: 'kaynak (2).jpg sil' }).click()
await selimFiles.getByRole('button', { name: 'Sil', exact: true }).click()
await selimFiles.getByText('Bu adımda dosya yok.').waitFor()
await selimFiles.getByRole('button', { name: 'Eski sürümler (2)' }).click()
await selimFiles.locator('.file-old', { hasText: 'Silindi' }).waitFor()
ok('a Bölüm Sorumlusu deletes a step file; it moves to Eski sürümler, not away')
const [old] = await Promise.all([selim.waitForEvent('download'), selimFiles.getByRole('button', { name: 'kaynak.jpg indir' }).click()])
expect(readFileSync(await old.path()).toString() === 'jpg-1', 'and can still download an old version')
await selim.screenshot({ path: `${SHOTS}/68-eski-surumler.png` })
await closeDialog(selim)

// ---- Approval after the update ----
const murat = await open('murat', PHONE, 'murat', 'murat123')
await murat.locator('button.job', { hasText: 'Elektrik ve pano' }).click()
await dialog(murat).getByRole('button', { name: 'İşe başla' }).click()
await dialog(murat).getByRole('button', { name: 'İşi bitir', exact: true }).click()
await dialog(murat).getByText('Onay bekleniyor.').waitFor()
ok("an Elektrikçi Çırak's finish waits, as their level was carried over")
await closeDialog(murat)

// ---- The person form on a phone ----
const emirPhone = await open('emir-phone', PHONE, 'emir', 'emir1234')
await nav(emirPhone, 'Ekip')
await row(emirPhone, 'Murat Kaya').click()
await dialog(emirPhone).getByRole('group', { name: 'Uzmanlıklar' }).waitFor()
await emirPhone.waitForTimeout(400)
await emirPhone.screenshot({ path: `${SHOTS}/69-kisi-telefon.png` })
await dialog(emirPhone).getByRole('group', { name: 'Uzmanlıklar' }).getByRole('button', { name: 'Montajcı' }).click()
await dialog(emirPhone).getByRole('group', { name: 'Montajcı seviyesi' }).getByRole('button', { name: 'Usta' }).click()
await dialog(emirPhone).getByRole('button', { name: 'Kaydet' }).click()
await row(emirPhone, 'Murat Kaya').getByText('Elektrikçi · Çırak, Montajcı · Usta').waitFor()
ok('a second uzmanlık with its own level is saved from a phone')
const overflow = await emirPhone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
expect(!overflow, 'no sideways scrolling on a phone')

await browser.close()
if (problems.length) {
  console.log('Browser problems:\n' + problems.join('\n'))
  process.exit(1)
}
console.log(`ALL ${step} 0008 END-TO-END CHECKS PASSED`)
