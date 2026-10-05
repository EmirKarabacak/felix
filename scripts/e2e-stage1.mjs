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
async function signOut(p) {
  await p.locator('button.account').click()
  await p.getByRole('button', { name: 'Çıkış yap' }).click()
  await p.getByRole('button', { name: 'Giriş yap' }).waitFor()
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
await page.getByRole('button', { name: 'CEO hesabını oluştur' }).click()
await page.getByText('Kurulum kodu hatalı.').waitFor()
ok('setup refuses a wrong setup code')
await page.getByLabel('Kurulum kodu').fill('kurulum')
await page.getByRole('button', { name: 'CEO hesabını oluştur' }).click()
await page.getByRole('heading', { name: 'Ekip' }).waitFor()
expect(await row(page, 'Emir Karabacak').locator('.badge-ceo').count() === 1, 'setup creates the CEO and signs them in')

// 2. add people
async function addPerson(name, password, panel, meslek) {
  await page.getByRole('button', { name: 'Kişi ekle' }).click()
  await page.getByLabel('Ad soyad').fill(name)
  await page.getByLabel('İlk şifre').fill(password)
  await page.getByRole('group', { name: 'Panel' }).getByRole('button', { name: panel, exact: true }).click()
  if (meslek) await page.getByRole('dialog').getByLabel('Meslek', { exact: true }).selectOption({ label: meslek })
}
await addPerson('Ahmet Yılmaz', 'ahmet123', 'İşçi', 'Kaynakçı')
expect((await page.getByLabel('Kullanıcı adı').inputValue()) === 'ahmet.yilmaz', 'username is suggested from the name, without Turkish letters')
await page.screenshot({ path: `${SHOTS}/02-add-person.png` })
await page.getByRole('button', { name: 'Kişiyi ekle' }).click()
await row(page, 'Ahmet Yılmaz').waitFor()
expect((await row(page, 'Ahmet Yılmaz').innerText()).includes('Kaynakçı'), 'new worker appears with their meslek')

await addPerson('Selim Ateş', 'selim123', 'Yönetici', 'Montajcı')
await page.getByRole('button', { name: 'Kişiyi ekle' }).click()
await row(page, 'Selim Ateş').waitFor()
expect(await row(page, 'Selim Ateş').locator('.badge-manager').count() === 1, 'new manager appears')

await addPerson('Ahmet Yılmaz', 'ahmet123', 'İşçi')
await page.getByRole('button', { name: 'Kişiyi ekle' }).click()
await page.getByText('Bu kullanıcı adı zaten kullanılıyor.').waitFor()
ok('a duplicate username is refused')
await page.getByRole('button', { name: 'Kapat' }).click()

// 3. meslek türleri
await page.getByLabel('Yeni meslek türü').fill('Boyacı')
await page.getByRole('button', { name: 'Oluştur' }).click()
await page.locator('.meslek-row', { hasText: 'Boyacı' }).waitFor()
ok('a meslek türü can be created')
await page.getByLabel('Yeni meslek türü').fill('Boyacı')
await page.getByRole('button', { name: 'Oluştur' }).click()
await page.getByText('Bu adla bir meslek türü zaten var.').waitFor()
ok('a duplicate meslek türü is refused')
await page.getByLabel('Yeni meslek türü').fill('')
await page.locator('.meslek-row', { hasText: 'Operatör' }).getByRole('button', { name: 'Operatör', exact: true }).click()
await page.getByLabel('Meslek türü adı').fill('Makine operatörü')
await page.getByRole('button', { name: 'Kaydet' }).click()
await page.locator('.meslek-row', { hasText: 'Makine operatörü' }).waitFor()
ok('a meslek türü can be renamed')
await page.getByRole('button', { name: 'Kaynakçı meslek türünü sil' }).click()
await page.getByText('Kaynakçı: 1 kişi mesleksiz kalır.').waitFor()
await page.getByRole('button', { name: 'Sil', exact: true }).click()
await row(page, 'Ahmet Yılmaz').getByText('Meslek seçilmedi').waitFor()
ok('deleting a meslek türü warns, then leaves the person without one')
await page.screenshot({ path: `${SHOTS}/03-ekip-desktop.png` })

// 4. edit a person: meslek, new password
await row(page, 'Ahmet Yılmaz').click()
await page.getByRole('dialog').getByLabel('Meslek', { exact: true }).selectOption({ label: 'Boru ustası' })
await page.getByLabel('Yeni şifre ver').fill('yeni1234')
await page.screenshot({ path: `${SHOTS}/04-edit-person.png` })
await page.getByRole('button', { name: 'Kaydet' }).click()
await row(page, 'Ahmet Yılmaz').getByText('Boru ustası').waitFor()
ok('CEO can change a meslek and give a new password')

// 5. the last CEO cannot demote themself
await row(page, 'Emir Karabacak').click()
await page.getByRole('group', { name: 'Panel' }).getByRole('button', { name: 'İşçi', exact: true }).click()
await page.getByRole('button', { name: 'Kaydet' }).click()
await page.getByText('En az bir CEO kalmalı.').waitFor()
expect(await page.getByRole('button', { name: 'Kişiyi sil' }).count() === 0, 'CEO cannot remove or demote themself')
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
expect(await mobile.locator('.tabbar a').allInnerTexts().then((t) => t.join('|')) === 'İşlerim|Projeler', 'worker gets İşlerim and Projeler, not Ekip')
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
await signIn(page, 'selim.ates', 'selim123')
await page.getByRole('heading', { name: 'Ekip' }).waitFor()
expect(await page.getByRole('button', { name: 'Kişi ekle' }).count() === 0, 'manager has no "Kişi ekle" button')
await row(page, 'Ahmet Yılmaz').click()
expect(await page.getByRole('group', { name: 'Panel' }).count() === 0 && await page.getByRole('button', { name: 'Kişiyi sil' }).count() === 0, 'manager sees no panel control and no delete')
await page.getByLabel('Ad soyad').fill('Ahmet Yılmaz Usta')
await page.getByRole('button', { name: 'Kaydet' }).click()
await row(page, 'Ahmet Yılmaz Usta').waitFor()
ok('manager can correct a name')
await page.getByLabel('Yeni meslek türü').fill('Tesisatçı')
await page.getByRole('button', { name: 'Oluştur' }).click()
await page.locator('.meslek-row', { hasText: 'Tesisatçı' }).waitFor()
ok('manager can create a meslek türü')
await signOut(page)

// 8. CEO removes a person; they are locked out; the username is free again
await signIn(page, 'emir', 'emir1234')
await row(page, 'Ahmet Yılmaz Usta').click()
await page.getByRole('button', { name: 'Kişiyi sil' }).click()
await page.screenshot({ path: `${SHOTS}/07-confirm-remove.png` })
await page.getByRole('button', { name: 'Evet, kişiyi sil' }).click()
await row(page, 'Selim Ateş').waitFor()
await page.waitForFunction(() => !document.body.innerText.includes('Ahmet Yılmaz Usta'))
ok('CEO can remove a person')
await mobile.reload()
await mobile.getByRole('button', { name: 'Giriş yap' }).waitFor()
await mobile.getByText('Bu hesap artık kullanılmıyor.').waitFor()
ok("the removed person's open session is closed with an explanation")
await signIn(mobile, 'ahmet.yilmaz', 'yeni1234')
await mobile.getByText('Kullanıcı adı veya şifre hatalı.').waitFor()
ok('the removed person cannot sign in again')
await addPerson('Ahmet Yılmaz', 'ahmet456', 'İşçi')
await page.getByRole('button', { name: 'Kişiyi ekle' }).click()
await row(page, 'Ahmet Yılmaz').waitFor()
ok('the freed username can be used for a new person')

// 9. changing your own password
await page.locator('button.account').click()
await page.getByLabel('Yeni şifre').fill('emir5678')
await page.getByRole('button', { name: 'Şifremi değiştir' }).click()
await page.getByText('Şifreniz değiştirildi.').waitFor()
await page.screenshot({ path: `${SHOTS}/08-account.png` })
await page.getByRole('button', { name: 'Çıkış yap' }).click()
await signIn(page, 'emir', 'emir5678')
await page.getByRole('heading', { name: 'Ekip' }).waitFor()
ok('a person can change their own password')

// 9b. "Beni hatırla": on keeps the sign-in for a new tab, off does not
{
  const tab = await desktop.newPage()
  await tab.goto(BASE)
  await tab.getByRole('heading', { name: 'Ekip' }).waitFor()
  ok('with "Beni hatırla" on, a new tab is already signed in')
  await tab.close()
  await signOut(page)
  expect(await page.getByRole('switch', { name: /Beni hatırla/ }).isChecked(), '"Beni hatırla" is on by default')
  await page.getByRole('switch', { name: /Beni hatırla/ }).uncheck()
  await signIn(page, 'emir', 'emir5678')
  await page.getByRole('heading', { name: 'Ekip' }).waitFor()
  await page.reload()
  await page.getByRole('heading', { name: 'Ekip' }).waitFor()
  ok('with it off, reloading the same tab stays signed in')
  const kept = await page.evaluate(() => Object.keys(localStorage).some((k) => k.endsWith('-auth-token')))
  const tab2 = await desktop.newPage()
  await tab2.goto(BASE)
  await tab2.getByRole('button', { name: 'Giriş yap' }).waitFor()
  expect(!kept, 'with it off, nothing is kept on the device and a new tab asks to sign in')
  await tab2.close()
  await signOut(page)
  await page.getByRole('switch', { name: /Beni hatırla/ }).check()
  await signIn(page, 'emir', 'emir5678')
  await page.getByRole('heading', { name: 'Ekip' }).waitFor()
}

// 10. the team page on a phone
await signIn(mobile, 'emir', 'emir5678')
await mobile.getByRole('heading', { name: 'Ekip' }).waitFor()
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
