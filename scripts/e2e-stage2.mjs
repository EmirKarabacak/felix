// End-to-end check of stage 2 (project types, projects, steps, assigning,
// start/finish, problems) against the local stack. Needs a fresh database:
//   scripts/local-up.sh && node scripts/e2e-stage2.mjs [screenshot-folder]
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
const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await desktop.newPage()
watch(page, 'desktop')

async function signIn(p, username, password) {
  await p.getByLabel('Kullanıcı adı').fill(username)
  await p.getByLabel('Şifre').fill(password)
  await p.getByRole('button', { name: 'Giriş yap' }).click()
  await p.locator('.topbar').waitFor()
}
const nav = (p, label) => p.locator('.topnav a, .tabbar a').filter({ hasText: label }).locator('visible=true').first().click()
const dialog = (p) => p.getByRole('dialog')
const stepRow = (p, name) => p.locator('button.step', { hasText: name })
const closeDialog = async (p) => {
  await dialog(p).getByRole('button', { name: 'Kapat' }).click()
  await dialog(p).waitFor({ state: 'detached' })
}

// ---- setup: CEO, one manager, two workers ----
await page.goto(BASE)
await page.getByLabel('Kurulum kodu').fill('kurulum')
await page.getByLabel('Ad soyad').fill('Emir Karabacak')
await page.getByLabel('Kullanıcı adı').fill('emir')
await page.getByLabel('Şifre').fill('emir1234')
await page.getByRole('button', { name: 'CEO hesabını oluştur' }).click()
await page.getByRole('heading', { name: 'Projeler' }).waitFor()
ok('a signed-in CEO lands on Projeler')
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
expect(made === '200,200,200', 'test people created')
expect(await page.getByText('Aktif proje yok. "Yeni proje" ile başlayın.').count() === 1, 'an empty workshop explains how to start')

// ---- Türler ----
await nav(page, 'Türler')
await page.getByRole('heading', { name: 'Türler', exact: true }).waitFor()
await page.locator('.type-row', { hasText: 'RO Ünitesi' }).waitFor()
expect(await page.locator('.type-row').count() === 4, 'four starting project types are listed')
await page.locator('.type-row', { hasText: 'RO Ünitesi' }).click()
expect(await page.locator('.type-step').count() === 8, 'RO Ünitesi shows its 8 steps')

await page.getByLabel('Yeni adım türü').fill('Membran yükleme')
await page.locator('section[aria-label="Adım türleri"]').getByRole('button', { name: 'Oluştur' }).click()
await page.getByRole('button', { name: 'Membran yükleme', exact: true }).first().waitFor()
ok('a step type can be created')
await page.locator('.type-editor .chips').getByRole('button', { name: 'Membran yükleme' }).click()
await page.locator('.type-step', { hasText: 'Membran yükleme' }).waitFor()
expect(await page.locator('.type-step').count() === 9, 'a step can be added to a project type')
await page.getByRole('button', { name: 'Membran yükleme adımını yukarı taşı' }).click()
await page.waitForFunction(() => [...document.querySelectorAll('.type-step .label-text')].map((e) => e.textContent).indexOf('Membran yükleme') === 7)
ok('a step can be moved up within a project type')
await page.getByRole('button', { name: 'Yüzey işlemi adımını türden çıkar' }).click()
await page.waitForFunction(() => document.querySelectorAll('.type-step').length === 8)
ok('a step can be removed from a project type')

await page.getByLabel('Yeni proje türü').fill('UF Ünitesi')
await page.locator('section[aria-label="Proje türleri"]').getByRole('button', { name: 'Oluştur' }).click()
await page.locator('.type-editor h2', { hasText: 'UF Ünitesi' }).waitFor()
ok('a project type can be created and is opened for editing')
await page.locator('.type-editor .chips').getByRole('button', { name: 'Test' }).click()
await page.locator('.type-step', { hasText: 'Test' }).waitFor()
await page.getByRole('button', { name: 'Adını değiştir' }).click()
await page.getByLabel('Proje türü adı').fill('Ultrafiltrasyon')
await page.locator('.type-editor').getByRole('button', { name: 'Kaydet' }).click()
await page.locator('.type-row', { hasText: 'Ultrafiltrasyon' }).waitFor()
ok('a project type can be renamed')
await page.locator('.type-row', { hasText: 'Dozaj Skid' }).click()
await page.getByRole('button', { name: 'Bu türü sil' }).click()
await page.getByRole('button', { name: 'Evet, türü sil' }).click()
await page.waitForFunction(() => ![...document.querySelectorAll('.type-row')].some((e) => e.textContent.includes('Dozaj Skid')))
ok('a project type can be deleted')
await page.locator('section[aria-label="Adım türleri"]').getByRole('button', { name: 'Tank imalatı', exact: true }).click()
await page.getByLabel('Adım türü adı').fill('Tank kaynağı')
await page.locator('section[aria-label="Adım türleri"]').getByRole('button', { name: 'Kaydet' }).click()
await page.locator('section[aria-label="Adım türleri"]').getByRole('button', { name: 'Tank kaynağı', exact: true }).waitFor()
ok('a step type can be renamed')
await page.screenshot({ path: `${SHOTS}/20-turler.png`, fullPage: true })

// ---- new project from a type ----
await nav(page, 'Projeler')
await page.getByRole('button', { name: 'Yeni proje' }).click()
await dialog(page).getByLabel('Proje adı').fill('500 m³/gün RO Ünitesi')
await dialog(page).getByLabel('Proje kodu').fill('P-2614')
await dialog(page).getByLabel('Teslim tarihi').fill('2027-01-15')
await dialog(page).getByLabel('Proje türü').selectOption({ label: 'RO Ünitesi' })
expect(await dialog(page).locator('.approval-row').count() === 8, 'choosing a type previews its steps')
await page.screenshot({ path: `${SHOTS}/21-yeni-proje.png` })
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.getByRole('heading', { name: '500 m³/gün RO Ünitesi' }).waitFor()
await stepRow(page, 'Membran yükleme').waitFor()
expect(await page.locator('button.step').count() === 8, 'the new project opens with its type\'s steps')
expect((await page.locator('button.step .step-name').allInnerTexts()).join('|') === 'Malzeme hazırlık|Şase imalatı|Ekipman montajı|Borulama|Elektrik ve pano|Test|Membran yükleme|Paketleme ve sevkiyat', 'in the order set on the type')

// ---- assign, due date, add/move/remove steps ----
await stepRow(page, 'Borulama').click()
await dialog(page).getByRole('button', { name: /Ahmet Yılmaz/ }).click()
await dialog(page).getByRole('button', { name: /Murat Kaya/ }).click()
await page.waitForFunction(() => document.querySelectorAll('[role=dialog] .check-row[aria-pressed=true]').length === 2)
ok('two people can be assigned to one step')
await dialog(page).getByLabel('Bitiş tarihi').fill('2026-01-10')
await dialog(page).locator('.status-late').waitFor()
ok('a step past its due date shows as late')
await dialog(page).getByLabel('Bitiş tarihi').fill('2027-01-05')
await dialog(page).locator('.facts .status-waiting').waitFor()
await page.screenshot({ path: `${SHOTS}/22-adim.png` })
await closeDialog(page)
expect((await stepRow(page, 'Borulama').locator('.chip').allInnerTexts()).sort().join('|') === 'Ahmet Yılmaz|Murat Kaya', 'the step row shows both names')

await stepRow(page, 'Şase imalatı').click()
await dialog(page).getByRole('button', { name: /Ahmet Yılmaz/ }).click()
await page.waitForFunction(() => document.querySelectorAll('[role=dialog] .check-row[aria-pressed=true]').length === 1)
await closeDialog(page)

await page.getByRole('button', { name: 'Adım ekle' }).click()
await dialog(page).locator('.name-row', { hasText: 'Yüzey işlemi' }).getByRole('button', { name: 'Ekle' }).click()
await stepRow(page, 'Yüzey işlemi').waitFor()
await dialog(page).getByText('Projede 1 adet').first().waitFor()
ok('a step can be added from the list, and the list shows it is in the project')
await dialog(page).getByLabel('Listede yoksa yeni adım türü oluştur').fill('Boya')
await dialog(page).getByRole('button', { name: 'Oluştur ve ekle' }).click()
await stepRow(page, 'Boya').waitFor()
ok('a new step type can be created and added in one go')
await closeDialog(page)
expect(await page.locator('button.step').count() === 10, 'the project now has 10 steps')

await stepRow(page, 'Boya').click()
await dialog(page).getByRole('button', { name: 'Yukarı taşı' }).click()
await page.waitForFunction(() => [...document.querySelectorAll('button.step .step-name')].map((e) => e.textContent).indexOf('Boya') === 8)
ok('a step can be moved up')
await dialog(page).getByRole('button', { name: 'Adımı kaldır' }).click()
await dialog(page).getByRole('button', { name: 'Evet, adımı kaldır' }).click()
await dialog(page).waitFor({ state: 'detached' })
expect(await page.locator('button.step').count() === 9, 'a step can be removed after confirming')
await page.screenshot({ path: `${SHOTS}/23-proje-detay.png`, fullPage: true })

// ---- worker on a phone ----
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
const ahmet = await phone.newPage()
watch(ahmet, 'ahmet')
await ahmet.goto(BASE)
await signIn(ahmet, 'ahmet', 'ahmet123')
await ahmet.getByRole('heading', { name: 'İşlerim' }).waitFor()
await ahmet.locator('button.job', { hasText: 'Borulama' }).waitFor()
expect(await ahmet.locator('button.job').count() === 2, 'the worker sees exactly the steps assigned to them')
await ahmet.screenshot({ path: `${SHOTS}/24-islerim-telefon.png` })
await ahmet.locator('button.job', { hasText: 'Borulama' }).click()
await ahmet.waitForTimeout(450)
await ahmet.screenshot({ path: `${SHOTS}/25-is-telefon.png` })
await dialog(ahmet).getByRole('button', { name: 'İşe başla' }).click()
await dialog(ahmet).locator('.facts .status-active').waitFor()
ok('the worker can start a step')
expect(await dialog(ahmet).getByRole('button', { name: 'Adımı kaldır' }).count() === 0 && await dialog(ahmet).getByLabel('Bitiş tarihi').count() === 0, 'the worker gets no manager controls')
await dialog(ahmet).getByRole('button', { name: 'Sorun bildir' }).click()
expect(await dialog(ahmet).getByRole('button', { name: 'Sorunu bildir' }).isDisabled(), 'a problem cannot be sent without choosing what it is')
await dialog(ahmet).getByRole('button', { name: 'Malzeme eksik' }).click()
await dialog(ahmet).getByLabel('Not (isteğe bağlı)').fill('DN50 flanş gelmedi')
await ahmet.screenshot({ path: `${SHOTS}/26-sorun-telefon.png` })
await dialog(ahmet).getByRole('button', { name: 'Sorunu bildir' }).click()
await dialog(ahmet).locator('.note-warn', { hasText: 'DN50 flanş gelmedi' }).waitFor()
ok('the worker can report a problem with a note')
await closeDialog(ahmet)
await ahmet.locator('section[aria-label="Sorun bildirilenler"] button.job', { hasText: 'Borulama' }).waitFor()
ok('the reported step moves to the top group')

// ---- manager sees the problem and resolves it ----
await nav(page, 'Projeler')
await page.reload()
await page.locator('.problem', { hasText: 'DN50 flanş gelmedi' }).waitFor()
expect((await page.locator('.tile', { hasText: 'Açık sorun' }).locator('.tile-value').innerText()) === '1', 'the manager board counts the open problem')
expect((await page.locator('.problem').innerText()).includes('Ahmet Yılmaz'), 'and says who is on the step')
await page.screenshot({ path: `${SHOTS}/27-projeler.png`, fullPage: true })
await page.locator('.problem').getByRole('button', { name: 'Çözüldü' }).click()
await page.locator('.problem').waitFor({ state: 'detached' })
expect((await page.locator('.tile', { hasText: 'Devam eden iş' }).locator('.tile-value').innerText()) === '1', 'resolving puts the step back in progress')

// ---- the other assignee finishes: done for everyone ----
const murat = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage()
watch(murat, 'murat')
await murat.goto(BASE)
await signIn(murat, 'murat', 'murat123')
await murat.locator('button.job', { hasText: 'Borulama' }).click()
await dialog(murat).getByRole('button', { name: 'İşi bitir' }).click()
await dialog(murat).locator('.facts .status-done').waitFor()
await closeDialog(murat)
await ahmet.reload()
await ahmet.locator('section[aria-label="Son bitenler"] button.job', { hasText: 'Borulama' }).waitFor()
ok('when one assignee finishes, the step is finished for the other too')
await ahmet.locator('button.job', { hasText: 'Borulama' }).click()
expect(await dialog(ahmet).getByRole('button', { name: /İşe başla|İşi bitir|Sorun bildir|Yeniden aç/ }).count() === 0, 'a finished step offers a worker nothing to press')
await closeDialog(ahmet)

// ---- worker: every project, read-only ----
await nav(ahmet, 'Projeler')
await ahmet.locator('a.project-card', { hasText: '500 m³/gün RO Ünitesi' }).click()
await ahmet.getByRole('heading', { name: '500 m³/gün RO Ünitesi' }).waitFor()
expect(await ahmet.getByRole('button', { name: /Adım ekle|Düzenle/ }).count() === 0, 'a worker sees the project without edit buttons')
await stepRow(ahmet, 'Test').click()
expect(await dialog(ahmet).getByRole('button', { name: /İşe başla|İşi bitir|Sorun bildir|Adımı kaldır/ }).count() === 0, 'and can only read a step that is not theirs')
await ahmet.screenshot({ path: `${SHOTS}/28-proje-telefon.png` })
await closeDialog(ahmet)
expect(!(await ahmet.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'no sideways scrolling on a phone')
await ahmet.goto(`${BASE}/turler`)
await ahmet.getByRole('heading', { name: 'İşlerim' }).waitFor()
ok('a worker is sent away from Türler')

// ---- manager: reopen, finish a project, edit, delete ----
await page.locator('a.project-card', { hasText: '500 m³/gün RO Ünitesi' }).click()
await stepRow(page, 'Borulama').click()
await dialog(page).getByRole('button', { name: 'Yeniden aç' }).click()
await dialog(page).locator('.facts .status-active').waitFor()
ok('a manager can reopen a finished step')
await closeDialog(page)

await nav(page, 'Projeler')
await page.getByRole('button', { name: 'Yeni proje' }).click()
await dialog(page).getByLabel('Proje adı').fill('Yedek filtre')
await dialog(page).getByLabel('Proje kodu').fill('p-2614')
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await dialog(page).getByText('Bu proje kodu zaten kullanılıyor.').waitFor()
ok('a project code cannot be used twice')
await dialog(page).getByLabel('Proje kodu').fill('P-2615')
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.getByRole('heading', { name: 'Yedek filtre' }).waitFor()
await page.getByText('Bu projede henüz adım yok. "Adım ekle" ile başlayın.').waitFor()
ok('a project without a type starts empty')
await page.getByRole('button', { name: 'Adım ekle' }).click()
await dialog(page).locator('.name-row', { hasText: 'Test' }).getByRole('button', { name: 'Ekle' }).click()
await stepRow(page, 'Test').waitFor()
await closeDialog(page)
await stepRow(page, 'Test').click()
await dialog(page).getByRole('button', { name: 'İşi bitir' }).click()
await dialog(page).locator('.facts .status-done').waitFor()
await closeDialog(page)
await nav(page, 'Projeler')
await page.getByRole('button', { name: /Biten \(1\)/ }).click()
await page.locator('a.project-card', { hasText: 'Yedek filtre' }).waitFor()
ok('a project whose steps are all done moves to Biten')
await page.locator('a.project-card', { hasText: 'Yedek filtre' }).click()
await page.getByRole('button', { name: 'Düzenle' }).click()
await dialog(page).getByLabel('Proje adı').fill('Yedek kum filtresi')
await dialog(page).getByRole('button', { name: 'Kaydet' }).click()
await page.getByRole('heading', { name: 'Yedek kum filtresi' }).waitFor()
ok('a project can be renamed')
await page.getByRole('button', { name: 'Düzenle' }).click()
await dialog(page).getByRole('button', { name: 'Projeyi sil' }).click()
await dialog(page).getByRole('button', { name: 'Evet, projeyi sil' }).click()
await page.getByRole('heading', { name: 'Projeler' }).waitFor()
await page.waitForFunction(() => !document.body.innerText.includes('Yedek kum filtresi'))
ok('a project can be deleted after confirming')

// ---- a removed person drops off unfinished steps ----
await nav(page, 'Ekip')
await page.locator('button.person', { hasText: 'Ahmet Yılmaz' }).click()
await dialog(page).getByRole('button', { name: 'Kişiyi sil' }).click()
await dialog(page).getByRole('button', { name: 'Evet, kişiyi sil' }).click()
await dialog(page).waitFor({ state: 'detached' })
await nav(page, 'Projeler')
await page.locator('a.project-card', { hasText: '500 m³/gün RO Ünitesi' }).click()
await stepRow(page, 'Şase imalatı').getByText('Atanmadı').waitFor()
ok('a removed person is taken off their unfinished steps')

// ---- manager panel ----
const selim = await desktop.browser().newContext({ viewport: { width: 1280, height: 900 } }).then((c) => c.newPage())
watch(selim, 'selim')
await selim.goto(BASE)
await signIn(selim, 'selim', 'selim123')
await selim.getByRole('button', { name: 'Yeni proje' }).waitFor()
expect((await selim.locator('.topnav a').allInnerTexts()).join('|') === 'Projeler|Firmalar|Türler|Ekip', 'a manager gets the same sections as the CEO')

await browser.close()
if (problems.length) {
  console.log('Browser problems:\n' + problems.join('\n'))
  process.exit(1)
}
console.log(`ALL ${step} STAGE 2 END-TO-END CHECKS PASSED`)
