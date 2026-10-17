// End-to-end check of stage 1 against the local stack (scripts/local-stack.ts).
// Needs a fresh local database: scripts/local-db.sh start
//   node scripts/e2e-stage1.mjs [screenshot-folder]
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
const desktop = await browser.newContext({ viewport: { width: 1280, height: 860 } })
const page = await desktop.newPage()
const problems = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`)
})

async function signIn(p, username, password) {
  await p.getByLabel('Kullanıcı adı').fill(username)
  await p.getByLabel('Şifre').fill(password)
  await p.getByRole('button', { name: 'Giriş yap' }).click()
}
const nav = (p, label) => p.locator('.topnav a, .tabbar a').filter({ hasText: label }).locator('visible=true').first().click()
async function signOut(p) {
  await nav(p, 'Ayarlar')
  await p.getByRole('button', { name: 'Çıkış yap' }).click()
  await p.getByRole('button', { name: 'Giriş yap' }).waitFor()
}
/** Signed-in managers land on Projeler; these checks are about the Ekip page. */
async function toEkip(p) {
  await p.locator('.topbar').waitFor()
  if (!p.url().endsWith('/ekip')) await p.locator('.topnav a, .tabbar a').filter({ hasText: 'Ekip' }).locator('visible=true').first().click()
  await p.getByRole('heading', { name: 'Ekip' }).waitFor()
}
const row = (p, name) => p.locator('button.person', { hasText: name })

// 1. first-time setup
await page.goto(BASE)
await page.getByRole('heading', { name: "Felix'i kur" }).waitFor()
await page.screenshot({ path: `${SHOTS}/01-setup.png` })
await page.getByLabel('Kurulum kodu').fill('yanlis')
await page.getByLabel('Ad soyad').fill('Emir Karabacak')
await page.getByLabel('Kullanıcı adı').fill('Emir')
await page.getByLabel('Şifre').fill('emir1234')
await page.getByRole('button', { name: 'Genel Müdür hesabını oluştur' }).click()
await page.getByText('Kurulum kodu hatalı.').waitFor()
ok('setup refuses a wrong setup code')
await page.getByLabel('Kurulum kodu').fill('kurulum')
await page.getByRole('button', { name: 'Genel Müdür hesabını oluştur' }).click()
await toEkip(page)
await row(page, 'Emir Karabacak').locator('.badge-ceo').waitFor()
ok('setup creates the Genel Müdür and signs them in')

// 2. add people
const pickLevel = (p, uzmanlik, seviye) =>
  p.getByRole('group', { name: `${uzmanlik} seviyesi` }).getByRole('button', { name: seviye, exact: true }).click()
async function addPerson(name, password, rol, { bolum, uzmanliklar = {} } = {}) {
  await page.getByRole('button', { name: 'Kişi ekle' }).click()
  await page.getByLabel('Ad soyad').fill(name)
  await page.getByLabel('İlk şifre').fill(password)
  await page.getByRole('group', { name: 'Rol' }).getByRole('button', { name: rol, exact: true }).click()
  if (bolum) await page.getByRole('dialog').locator('select').selectOption({ label: bolum })
  for (const [uzmanlik, seviye] of Object.entries(uzmanliklar)) {
    await page.getByRole('group', { name: 'Uzmanlıklar' }).getByRole('button', { name: uzmanlik, exact: true }).click()
    await pickLevel(page, uzmanlik, seviye)
  }
}
await addPerson('Ahmet Yılmaz', 'ahmet123', 'Personel', { bolum: 'İmalat', uzmanliklar: { Kaynakçı: 'Çırak' } })
expect((await page.getByLabel('Kullanıcı adı').inputValue()) === 'ahmet.yilmaz', 'username is suggested from the name, without Turkish letters')
expect(await page.getByText('Onay kuralı: Bir adımı bitiren kişinin').count() === 1, 'the approval rule is explained in Turkish next to the levels')
await page.screenshot({ path: `${SHOTS}/02-add-person.png` })
await page.getByRole('button', { name: 'Kişiyi ekle' }).click()
await row(page, 'Ahmet Yılmaz').waitFor()
expect((await row(page, 'Ahmet Yılmaz').innerText()).includes('Kaynakçı · Çırak'), 'new Personel appears with their uzmanlık and level')

await page.getByRole('button', { name: 'Kişi ekle' }).click()
expect((await page.getByRole('group', { name: 'Rol' }).getByRole('button').allInnerTexts()).join('|') === 'Genel Müdür|IT|Bölüm Sorumlusu|Personel', 'four roles to choose from')
await page.getByRole('dialog').locator('select').selectOption({ label: 'Satın alma' })
expect(await page.getByRole('group', { name: 'Uzmanlıklar' }).count() === 0, 'Personel outside İmalat get no uzmanlık to choose')
await page.getByRole('group', { name: 'Rol' }).getByRole('button', { name: 'Bölüm Sorumlusu', exact: true }).click()
expect(await page.getByLabel('Sorumlu olduğu bölüm').count() === 1, 'a Bölüm Sorumlusu only chooses the bölüm they lead')
await page.getByRole('dialog').locator('select').selectOption({ label: 'İmalat' })
expect(await page.getByRole('group', { name: 'Uzmanlıklar' }).count() === 0, 'and gets no uzmanlık or level, even in İmalat')
await page.getByRole('group', { name: 'Rol' }).getByRole('button', { name: 'IT', exact: true }).click()
expect(await page.getByRole('dialog').locator('select').count() === 0, 'Genel Müdür and IT have no bölüm')
await page.getByRole('button', { name: 'Kapat' }).click()
await addPerson('Selim Ateş', 'selim123', 'Bölüm Sorumlusu', { bolum: 'Satın alma' })
await page.getByRole('button', { name: 'Kişiyi ekle' }).click()
await row(page, 'Selim Ateş').waitFor()
expect(await row(page, 'Selim Ateş').locator('.badge-manager').innerText() === 'Bölüm Sorumlusu', 'new Bölüm Sorumlusu appears')
await addPerson('Deniz Kara', 'deniz123', 'IT')
await page.getByRole('button', { name: 'Kişiyi ekle' }).click()
await row(page, 'Deniz Kara').waitFor()
expect(await row(page, 'Deniz Kara').locator('.badge-ceo').innerText() === 'IT', 'new IT appears next to the Genel Müdür')
expect((await page.locator('section h3').first().innerText()).startsWith('Genel Müdür ve IT'), 'Genel Müdür and IT are listed first')

await addPerson('Ahmet Yılmaz', 'ahmet123', 'Personel')
await page.getByRole('button', { name: 'Kişiyi ekle' }).click()
await page.getByText('Bu kullanıcı adı zaten kullanılıyor.').waitFor()
ok('a duplicate username is refused')
await page.getByRole('button', { name: 'Kapat' }).click()

// 3. no meslek any more
expect(await page.getByText('Meslek').count() === 0, 'Ekip has no meslek list')
await page.screenshot({ path: `${SHOTS}/03-ekip-desktop.png` })

// 4. edit a person: level, new password, username (CEO only)
await row(page, 'Ahmet Yılmaz').click()
await pickLevel(page, 'Kaynakçı', 'Usta')
await page.getByRole('group', { name: 'Uzmanlıklar' }).getByRole('button', { name: 'Elektrikçi', exact: true }).click()
expect(await page.getByRole('group', { name: 'Elektrikçi seviyesi' }).getByRole('button', { pressed: true }).innerText() === 'Kalfa', 'a newly ticked uzmanlık starts at Kalfa')
await page.getByLabel('Yeni şifre ver').fill('yeni1234')
await page.screenshot({ path: `${SHOTS}/04-edit-person.png` })
await page.getByRole('button', { name: 'Kaydet' }).click()
await row(page, 'Ahmet Yılmaz').getByText('Elektrikçi · Kalfa, Kaynakçı · Usta').waitFor()
ok('Genel Müdür can give several uzmanlıklar with a level each, and a new password')
await row(page, 'Selim Ateş').click()
await page.getByRole('dialog').getByLabel('Kullanıcı adı').fill('selim')
await page.getByRole('button', { name: 'Kaydet' }).click()
await row(page, 'Selim Ateş').filter({ hasText: /\bselim\b/ }).waitFor()
ok("Genel Müdür can change someone's username")
await row(page, 'Ahmet Yılmaz').click()
await page.getByRole('dialog').getByLabel('Kullanıcı adı').fill('selim')
await page.getByRole('button', { name: 'Kaydet' }).click()
await page.getByText('Bu kullanıcı adı zaten kullanılıyor.').waitFor()
ok('a username already in use is refused')
await page.getByRole('button', { name: 'Kapat' }).click()

// 5. the last Genel Müdür and the last IT stay
await row(page, 'Emir Karabacak').click()
await page.getByRole('group', { name: 'Rol' }).getByRole('button', { name: 'Personel', exact: true }).click()
await page.getByRole('button', { name: 'Kaydet' }).click()
await page.getByText('En az bir Genel Müdür kalmalı.').waitFor()
expect(await page.getByRole('button', { name: 'Kişiyi sil' }).count() === 0, 'Genel Müdür cannot remove or demote themself')
await page.getByRole('button', { name: 'Kapat' }).click()
await row(page, 'Deniz Kara').click()
await page.getByRole('button', { name: 'Kişiyi sil' }).click()
await page.getByRole('button', { name: 'Evet, kişiyi sil' }).click()
await page.getByText('En az bir IT kalmalı.').waitFor()
ok('the only IT cannot be removed')
await page.getByRole('button', { name: 'Kapat' }).click()

// 6. sign-in errors, worker panel on a phone
await signOut(page)
await page.screenshot({ path: `${SHOTS}/05-login.png` })
await signIn(page, 'ahmet.yilmaz', 'ahmet123')
await page.getByText('Kullanıcı adı veya şifre hatalı.').waitFor()
ok('the old password no longer works')

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
const mobile = await phone.newPage()
mobile.on('pageerror', (e) => problems.push(`mobile pageerror: ${e.message}`))
await mobile.goto(BASE)
await signIn(mobile, 'Ahmet.Yilmaz', 'yeni1234')
await mobile.getByRole('heading', { name: 'İşlerim' }).waitFor()
expect(await mobile.locator('.tabbar a').allInnerTexts().then((t) => t.join('|')) === 'İşlerim|Projeler|Ayarlar', 'Personel get İşlerim, Projeler and Ayarlar, not Ekip')
await mobile.goto(`${BASE}/ekip`)
await mobile.getByRole('heading', { name: 'İşlerim' }).waitFor()
ok('worker is sent away from the Ekip page')
await mobile.screenshot({ path: `${SHOTS}/06-worker-phone.png` })

const workerApi = await mobile.evaluate(async () => {
  const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))
  const token = JSON.parse(localStorage.getItem(key)).access_token
  const call = (method, body) =>
    fetch('/api/users', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then((r) => r.status)
  return [
    await call('POST', { full_name: 'Sızan', username: 'sizan', password: 'sizan123', panel: 'ceo' }),
    await call('PATCH', { id: '00000000-0000-0000-0000-000000000000', password: 'x12345' }),
    await call('DELETE', { id: '00000000-0000-0000-0000-000000000000' }),
    await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.status),
  ].join(',')
})
expect(workerApi === '403,403,403,401', `server refuses a worker (and a signed-out caller) on the people endpoint: ${workerApi}`)

// 7. manager: can see and edit, cannot add or remove people
await signIn(page, 'selim', 'selim123')
await page.locator('.topbar').waitFor()
expect(await page.locator('.topnav a').allInnerTexts().then((t) => t.join('|')) === 'İşlerim|Projeler|Ekip|Ayarlar', 'manager gets İşlerim, Projeler, Ekip and Ayarlar (after the new username works)')
await toEkip(page)
expect(await page.getByRole('button', { name: 'Kişi ekle' }).count() === 0, 'manager has no "Kişi ekle" button')
await row(page, 'Ahmet Yılmaz').click()
expect(await page.getByRole('group', { name: 'Rol' }).count() === 0 && await page.getByRole('button', { name: 'Kişiyi sil' }).count() === 0, 'manager sees no role control and no delete')
expect(await page.getByRole('dialog').getByLabel('Kullanıcı adı').count() === 0, 'manager cannot change a username')
expect(await page.getByRole('group', { name: 'Kaynakçı seviyesi' }).count() === 1, 'manager can set levels')
await page.getByLabel('Ad soyad').fill('Ahmet Yılmaz Usta')
await page.getByRole('button', { name: 'Kaydet' }).click()
await row(page, 'Ahmet Yılmaz Usta').waitFor()
ok('manager can correct a name')
const managerApi = await page.evaluate(async () => {
  const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))
  const token = JSON.parse(localStorage.getItem(key)).access_token
  const me = JSON.parse(atob(token.split('.')[1])).sub
  return fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: me, username: 'patron' }) }).then((r) => r.status)
})
expect(managerApi === 403, `the server refuses a manager changing a username (${managerApi})`)
await signOut(page)

// 8. CEO removes a person; they are locked out; the username is free again
await signIn(page, 'emir', 'emir1234')
await toEkip(page)
await row(page, 'Ahmet Yılmaz Usta').click()
await page.getByRole('button', { name: 'Kişiyi sil' }).click()
await page.screenshot({ path: `${SHOTS}/07-confirm-remove.png` })
await page.getByRole('button', { name: 'Evet, kişiyi sil' }).click()
await row(page, 'Selim Ateş').waitFor()
await page.waitForFunction(() => !document.body.innerText.includes('Ahmet Yılmaz Usta'))
ok('Genel Müdür can remove a person')
await mobile.reload()
await mobile.getByRole('button', { name: 'Giriş yap' }).waitFor()
await mobile.getByText('Bu hesap artık kullanılmıyor.').waitFor()
ok("the removed person's open session is closed with an explanation")
await signIn(mobile, 'ahmet.yilmaz', 'yeni1234')
await mobile.getByText('Kullanıcı adı veya şifre hatalı.').waitFor()
ok('the removed person cannot sign in again')
await addPerson('Ahmet Yılmaz', 'ahmet456', 'Personel')
await page.getByRole('button', { name: 'Kişiyi ekle' }).click()
await row(page, 'Ahmet Yılmaz').waitFor()
ok('the freed username can be used for a new person')

// 9. changing your own password in Ayarlar; the CEO changes their own username
await page.locator('a.account').click()
await page.getByRole('heading', { name: 'Ayarlar' }).waitFor()
ok('the name in the top bar opens Ayarlar')
await page.getByLabel('Yeni şifre').fill('emir5678')
await page.getByRole('button', { name: 'Şifremi değiştir' }).click()
await page.getByText('Şifreniz değiştirildi.').waitFor()
await page.screenshot({ path: `${SHOTS}/08-ayarlar.png`, fullPage: true })
await page.getByRole('button', { name: 'Çıkış yap' }).click()
await signIn(page, 'emir', 'emir5678')
await toEkip(page)
ok('a person can change their own password')
await row(page, 'Emir Karabacak').click()
await page.getByRole('dialog').getByLabel('Kullanıcı adı').fill('emirk')
await page.getByRole('button', { name: 'Kaydet' }).click()
await row(page, 'Emir Karabacak').filter({ hasText: 'emirk' }).waitFor()
await signOut(page)
await signIn(page, 'emirk', 'emir5678')
await toEkip(page)
ok('the Genel Müdür can change their own username and sign in with it')

// 9b. "Beni hatırla": on keeps the sign-in for a new tab, off does not
{
  const tab = await desktop.newPage()
  await tab.goto(BASE)
  await toEkip(tab)
  ok('with "Beni hatırla" on, a new tab is already signed in')
  await tab.close()
  await signOut(page)
  expect(await page.getByRole('switch', { name: /Beni hatırla/ }).isChecked(), '"Beni hatırla" is on by default')
  await page.getByRole('switch', { name: /Beni hatırla/ }).uncheck()
  await signIn(page, 'emirk', 'emir5678')
  await toEkip(page)
  await page.reload()
  await toEkip(page)
  ok('with it off, reloading the same tab stays signed in')
  const kept = await page.evaluate(() => Object.keys(localStorage).some((k) => k.endsWith('-auth-token')))
  const tab2 = await desktop.newPage()
  await tab2.goto(BASE)
  await tab2.getByRole('button', { name: 'Giriş yap' }).waitFor()
  expect(!kept, 'with it off, nothing is kept on the device and a new tab asks to sign in')
  await tab2.close()
  await signOut(page)
  await page.getByRole('switch', { name: /Beni hatırla/ }).check()
  await signIn(page, 'emirk', 'emir5678')
  await toEkip(page)
}

// 9c. IT has the Genel Müdür's rights
{
  await signOut(page)
  const it = await desktop.newPage()
  it.on('pageerror', (e) => problems.push(`it pageerror: ${e.message}`))
  await it.goto(BASE)
  await signIn(it, 'deniz.kara', 'deniz123')
  await toEkip(it)
  expect(await it.locator('.topnav a').allInnerTexts().then((t) => t.join('|')) === 'Projeler|Ekip|Ayarlar', 'IT gets the same tabs as the Genel Müdür')
  expect(await it.getByRole('button', { name: 'Kişi ekle' }).count() === 1, 'and can add people')
  await row(it, 'Selim Ateş').click()
  expect(await it.getByRole('dialog').getByLabel('Kullanıcı adı').count() === 1, 'and change usernames')
  await it.getByRole('button', { name: 'Kapat' }).click()
  await signOut(it)
  await it.close()
  await page.getByRole('button', { name: 'Giriş yap' }).waitFor()
  await signIn(page, 'emirk', 'emir5678')
  await toEkip(page)
}

// 10. the team page on a phone
await signIn(mobile, 'emirk', 'emir5678')
await toEkip(mobile)
await row(mobile, 'Selim Ateş').waitFor()
await mobile.screenshot({ path: `${SHOTS}/09-ekip-phone.png`, fullPage: true })
await row(mobile, 'Selim Ateş').click()
await mobile.getByRole('dialog').waitFor()
await mobile.waitForTimeout(500)
await mobile.screenshot({ path: `${SHOTS}/10-edit-phone.png` })
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
expect(!overflow, 'no sideways scrolling on a phone')

await browser.close()
if (problems.length) {
  console.log('Browser problems:\n' + problems.join('\n'))
  process.exit(1)
}
console.log(`ALL ${step} STAGE 1 END-TO-END CHECKS PASSED`)
