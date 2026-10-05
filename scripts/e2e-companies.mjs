// End-to-end check of companies (Firmalar) against the local stack.
//   scripts/local-up.sh && node scripts/e2e-companies.mjs [screenshot-folder]
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
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
watch(page, 'desktop')
const nav = (p, label) => p.locator('.topnav a, .tabbar a').filter({ hasText: label }).locator('visible=true').first().click()
const dialog = (p) => p.getByRole('dialog')
const companyRow = (p, name) => p.locator('button.company', { hasText: name })

// ---- setup ----
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
  await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ full_name: 'Ahmet Yılmaz', username: 'ahmet', password: 'ahmet123', panel: 'worker' }),
  })
})
expect((await page.locator('.topnav a').allInnerTexts()).join('|') === 'Projeler|Firmalar|Türler|Ekip', 'Firmalar is in the menu')

// ---- create, duplicate, edit ----
await nav(page, 'Firmalar')
await page.getByText('Henüz firma yok.').waitFor()
ok('an empty list explains how to start')
await page.getByRole('button', { name: 'Yeni firma' }).click()
await dialog(page).getByLabel('Firma adı').fill('Örnek Su Arıtma A.Ş.')
await dialog(page).getByLabel('Yetkili kişi').fill('Ayşe Demir')
await dialog(page).getByLabel('Telefon').fill('0212 555 00 00')
await dialog(page).getByLabel('E-posta').fill('ayse@ornek.test')
await dialog(page).getByLabel('Adres').fill('Organize Sanayi Bölgesi 3. Cadde No: 12\nİstanbul')
await dialog(page).getByLabel('Not').fill('Sevkiyat öncesi mutlaka arayın.')
await page.waitForTimeout(400) // let the sheet finish arriving before the picture
await page.screenshot({ path: `${SHOTS}/30-yeni-firma.png` })
await dialog(page).getByRole('button', { name: 'Firmayı ekle' }).click()
await companyRow(page, 'Örnek Su Arıtma A.Ş.').waitFor()
expect((await companyRow(page, 'Örnek Su Arıtma A.Ş.').innerText()).includes('Ayşe Demir'), 'a company is created and listed with its contact')

await page.getByRole('button', { name: 'Yeni firma' }).click()
await dialog(page).getByLabel('Firma adı').fill('Örnek Su Arıtma A.Ş.')
await dialog(page).getByRole('button', { name: 'Firmayı ekle' }).click()
await dialog(page).getByText('Bu adla bir firma zaten var.').waitFor()
ok('a second company with the same name is refused')
await dialog(page).getByRole('button', { name: 'Kapat' }).click()

await companyRow(page, 'Örnek Su Arıtma A.Ş.').click()
expect((await dialog(page).getByLabel('Adres').inputValue()).includes('İstanbul'), 'opening a company shows what was saved')
await dialog(page).getByLabel('Telefon').fill('0212 555 11 11')
await dialog(page).getByLabel('Not').fill('')
await dialog(page).getByRole('button', { name: 'Kaydet' }).click()
await dialog(page).waitFor({ state: 'detached' })
await companyRow(page, 'Örnek Su Arıtma A.Ş.').getByText('0212 555 11 11').waitFor()
ok('a company can be edited')

// ---- a project for a company ----
await nav(page, 'Projeler')
await page.getByRole('button', { name: 'Yeni proje' }).click()
await dialog(page).getByLabel('Proje adı').fill('500 m³/gün RO Ünitesi')
await dialog(page).getByLabel('Firma').selectOption({ label: 'Örnek Su Arıtma A.Ş.' })
await dialog(page).getByLabel('Proje türü').selectOption({ label: 'RO Ünitesi' })
await page.screenshot({ path: `${SHOTS}/31-yeni-proje-firma.png` })
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.getByRole('heading', { name: '500 m³/gün RO Ünitesi' }).waitFor()
await page.locator('.company-line', { hasText: 'Örnek Su Arıtma A.Ş.' }).waitFor()
ok('the project page shows the company')
const customer = page.locator('section[aria-label="Müşteri"]')
expect((await customer.innerText()).includes('Ayşe Demir') && !(await customer.innerText()).includes('Sevkiyat'), 'managers see the contact details there, without the cleared note')
expect((await customer.getByRole('link', { name: '0212 555 11 11' }).getAttribute('href')) === 'tel:02125551111', 'the phone number is a call link')
expect((await customer.getByRole('link', { name: 'ayse@ornek.test' }).getAttribute('href')) === 'mailto:ayse@ornek.test', 'the e-mail address is a mail link')
await page.screenshot({ path: `${SHOTS}/32-proje-musteri.png` })

// ---- quick-create a company from the new-project form ----
await nav(page, 'Projeler')
await page.locator('a.project-card', { hasText: 'Örnek Su Arıtma A.Ş.' }).waitFor()
ok('the project card shows the company')
await page.getByRole('button', { name: 'Yeni proje' }).click()
await dialog(page).getByLabel('Proje adı').fill('Kum filtresi')
await dialog(page).getByLabel('Firma', { exact: true }).selectOption({ label: '+ Yeni firma ekle…' })
await dialog(page).getByLabel('Yeni firma adı').fill('Deneme Kimya Ltd.')
await dialog(page).getByRole('button', { name: 'Projeyi oluştur' }).click()
await page.getByRole('heading', { name: 'Kum filtresi' }).waitFor()
await page.locator('.company-line', { hasText: 'Deneme Kimya Ltd.' }).waitFor()
expect(await page.locator('section[aria-label="Müşteri"]').count() === 0, 'a company added by name only has no contact card yet')
await nav(page, 'Firmalar')
await companyRow(page, 'Deneme Kimya Ltd.').getByText('1 proje').waitFor()
ok('a company typed into the new-project form is added to Firmalar')
await page.screenshot({ path: `${SHOTS}/33-firmalar.png` })
await companyRow(page, 'Deneme Kimya Ltd.').click()
await dialog(page).getByRole('link', { name: 'Kum filtresi' }).click()
await page.getByRole('heading', { name: 'Kum filtresi' }).waitFor()
ok('a company lists its projects, and they open from there')

// ---- change a project's company ----
await page.getByRole('button', { name: 'Düzenle' }).click()
await dialog(page).getByLabel('Firma').selectOption({ label: 'Örnek Su Arıtma A.Ş.' })
await dialog(page).getByRole('button', { name: 'Kaydet' }).click()
await page.locator('.company-line', { hasText: 'Örnek Su Arıtma A.Ş.' }).waitFor()
ok('a project can be moved to another company')

// ---- worker: name only ----
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
const ahmet = await phone.newPage()
watch(ahmet, 'ahmet')
await ahmet.goto(BASE)
await ahmet.getByLabel('Kullanıcı adı').fill('ahmet')
await ahmet.getByLabel('Şifre').fill('ahmet123')
await ahmet.getByRole('button', { name: 'Giriş yap' }).click()
await ahmet.locator('.topbar').waitFor()
expect((await ahmet.locator('.tabbar a').allInnerTexts()).join('|') === 'İşlerim|Projeler', 'a worker has no Firmalar tab')
await ahmet.goto(`${BASE}/firmalar`)
await ahmet.getByRole('heading', { name: 'İşlerim' }).waitFor()
ok('a worker is sent away from Firmalar')
await nav(ahmet, 'Projeler')
await ahmet.locator('a.project-card', { hasText: '500 m³/gün RO Ünitesi' }).click()
await ahmet.locator('.company-line', { hasText: 'Örnek Su Arıtma A.Ş.' }).waitFor()
expect(await ahmet.locator('section[aria-label="Müşteri"]').count() === 0, 'a worker sees the company name but no contact details')
const leaked = await ahmet.evaluate(async () => {
  const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))
  const token = JSON.parse(localStorage.getItem(key)).access_token
  const base = [...performance.getEntriesByType('resource')].map((r) => r.name).find((n) => n.includes('/rest/v1/')).split('/rest/v1/')[0]
  const res = await fetch(`${base}/rest/v1/company_details?select=*`, { headers: { apikey: token, Authorization: `Bearer ${token}` } })
  return JSON.stringify(await res.json())
})
expect(leaked === '[]', 'asking the database directly as a worker returns no contact details')
await ahmet.screenshot({ path: `${SHOTS}/34-proje-isci.png` })

// ---- delete a company that has projects ----
await nav(page, 'Firmalar')
await companyRow(page, 'Örnek Su Arıtma A.Ş.').getByText('2 proje').waitFor()
await companyRow(page, 'Örnek Su Arıtma A.Ş.').click()
await dialog(page).getByRole('button', { name: 'Firmayı sil' }).click()
await dialog(page).getByText('2 projesi yerinde kalır ama firmasız görünür.').waitFor()
ok('deleting a company with projects says what will happen')
await dialog(page).getByRole('button', { name: 'Evet, firmayı sil' }).click()
await dialog(page).waitFor({ state: 'detached' })
await companyRow(page, 'Örnek Su Arıtma A.Ş.').waitFor({ state: 'detached' })
await nav(page, 'Projeler')
await page.locator('a.project-card', { hasText: '500 m³/gün RO Ünitesi' }).waitFor()
expect(await page.locator('a.project-card').count() === 2 && !(await page.locator('.project-grid').innerText()).includes('Örnek Su'), 'its projects remain, without a company')

// ---- phone layout ----
const emirPhone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage()
watch(emirPhone, 'emir-phone')
await emirPhone.goto(BASE)
await emirPhone.getByLabel('Kullanıcı adı').fill('emir')
await emirPhone.getByLabel('Şifre').fill('emir1234')
await emirPhone.getByRole('button', { name: 'Giriş yap' }).click()
await emirPhone.getByRole('button', { name: 'Yeni proje' }).waitFor()
await nav(emirPhone, 'Firmalar')
await companyRow(emirPhone, 'Deneme Kimya Ltd.').waitFor()
await emirPhone.screenshot({ path: `${SHOTS}/35-firmalar-telefon.png` })
expect(!(await emirPhone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'no sideways scrolling on a phone')

await browser.close()
if (problems.length) {
  console.log('Browser problems:\n' + problems.join('\n'))
  process.exit(1)
}
console.log(`ALL ${step} COMPANY END-TO-END CHECKS PASSED`)
