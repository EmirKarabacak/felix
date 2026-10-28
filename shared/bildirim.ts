// What an alert says, in Turkish or English. Used by the bell in the app and
// by the server for phone alerts (which go out in each phone's language), so
// both read the same words. The words were agreed with Emir; English sits
// beside each Turkish text so neither can be missing.

export type BildirimKind =
  | 'atandi'
  | 'geri_gonderildi'
  | 'onay_bekliyor'
  | 'sorun'
  | 'malzeme_talebi'
  | 'cizim_talebi'
  | 'malzeme_geldi'
  | 'cizim_duzeltildi'

/** The stored alert (table bildirimler); names are as they were at the time. */
export type BildirimMetinVerisi = {
  kind: BildirimKind
  project_id: string | null
  step_id: string | null
  adim: string | null
  proje: string | null
  kim: string | null
  sebep: string | null
  detay: string | null
}

type Lang = 'tr' | 'en'
type Pair = { tr: string; en: string }

const TITLES: Record<BildirimKind, Pair> = {
  atandi: { tr: 'Yeni iş: {adim}', en: 'New job: {adim}' },
  geri_gonderildi: { tr: 'İş geri gönderildi: {adim}', en: 'Job sent back: {adim}' },
  onay_bekliyor: { tr: 'Onay bekleyen iş: {adim}', en: 'Job awaiting approval: {adim}' },
  sorun: { tr: 'Sorun bildirildi: {adim}', en: 'Problem reported: {adim}' },
  malzeme_talebi: { tr: 'Yeni talep: {detay}', en: 'New request: {detay}' },
  cizim_talebi: { tr: 'Yeni talep: Çizim hatalı', en: 'New request: Drawing is wrong' },
  malzeme_geldi: { tr: 'Malzemen geldi: {detay}', en: 'Your material has arrived: {detay}' },
  cizim_duzeltildi: { tr: 'Çizim düzeltildi: {adim}', en: 'Drawing fixed: {adim}' },
}

// Problem reasons are stored in Turkish (as in src/lib/en/genel.ts).
const REASONS: Record<string, string> = {
  'Malzeme eksik': 'Missing material',
  'Çizim hatalı': 'Drawing is wrong',
  'Makine arızası': 'Machine breakdown',
  'Başka bir sorun': 'Another problem',
}

const MISSING_MATERIAL: Pair = { tr: 'Malzeme eksik', en: 'Missing material' }

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
const join = (parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim()).join(' · ')

/** The alert's heading and the line under it. */
export function bildirimMetni(b: BildirimMetinVerisi, lang: Lang): { title: string; body: string } {
  const kim = b.kim ?? ''
  const detay = b.detay?.trim() || (b.kind === 'malzeme_talebi' || b.kind === 'malzeme_geldi' ? MISSING_MATERIAL[lang] : '')
  const title = fill(TITLES[b.kind][lang], { adim: b.adim ?? '', detay })
  const sebep = b.sebep ? (lang === 'en' ? (REASONS[b.sebep] ?? b.sebep) : b.sebep) : ''
  const said = (what: string) => (what && kim ? `${kim}: ${what}` : what || kim)
  let body: string
  switch (b.kind) {
    case 'atandi':
    case 'cizim_duzeltildi':
      body = join([b.proje])
      break
    case 'geri_gonderildi':
      body = join([b.proje, said(b.detay ?? '')])
      break
    case 'onay_bekliyor':
      body = join([b.proje, kim])
      break
    case 'sorun':
      body = join([b.proje, said(join([sebep, b.detay]))])
      break
    case 'malzeme_talebi':
    case 'cizim_talebi':
      body = join([b.proje, b.adim, b.kind === 'cizim_talebi' ? said(b.detay ?? '') : kim])
      break
    case 'malzeme_geldi':
      body = join([b.proje, b.adim])
      break
  }
  return { title, body }
}

/** Where tapping the alert goes: the project, with the step open. */
export function bildirimAdresi(b: Pick<BildirimMetinVerisi, 'project_id' | 'step_id'>): string {
  if (!b.project_id) return '/'
  return `/projeler/${b.project_id}${b.step_id ? `?adim=${b.step_id}` : ''}`
}
