import type { Column, Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { MusteriRaporu } from '../../shared/rapor'
import { formatSize, viewLink } from './dosyalar'
import { locale, t } from './i18n'
import { anText, gecikmeText, sureText, tarihText, type ProjeRaporu } from './rapor'
import { PROBLEM_REASONS, TALEP_STATUS_LABEL, type Workshop } from './workshop'

// Felix makes the report's PDF file itself, so it is the same A4 file from a
// phone or a computer: one font of its own (Inter, in public/fonts), the
// photos inside the file, the Aquafelix letterhead on every page. The
// browser's print is not used. pdfmake builds the file; it is loaded only
// when a report is opened.

/** The bottom lines of the Aquafelix letterhead, as printed on it. */
const ANTET_ADRES = 'Atatürk Sanayi Bölgesi Ömerli Mah. Hakkı İleri Cad. 76/A Hadımköy-İST' // i18n-ok
const ANTET_TEL = 'Tel: 0212 771 58 00 (2 Hat) · Faks: 0212 771 57 76' // i18n-ok

/** A photo in the report: a stored file (by its path) or a link already made. */
export type PdfFoto = { id: string; yol?: string; url?: string; alt: string }

export type PdfAdim = { no: number; ad: string; sag: string; satirlar: { text: string; tur?: 'sorun' | 'geri' | 'onay' }[] }

/**
 * Everything one report says, as plain text. The file is made from this, and
 * made again only when this changes (the app refreshes its data often).
 */
export type PdfBelge = {
  dosyaAdi: string
  ad: string
  kod: string
  tur: string | null
  bilgiler: [string, string][]
  toplamlar: [string, string][]
  adimBaslik: string
  adimlar: PdfAdim[]
  kisiler: { basliklar: string[]; satirlar: string[][] } | null
  talepler: { ust: string; alt: string }[]
  fotoBaslik: string
  fotolar: PdfFoto[]
  fotoSutun: 2 | 3
  belgeler: { ad: string; boyut: string }[]
  notlar: string[]
}

/** What decides whether the file must be made again (links change on every read; files do not). */
export function belgeAnahtari(belge: PdfBelge): string {
  return JSON.stringify({ ...belge, fotolar: belge.fotolar.map((f) => [f.id, f.alt]) })
}

/** A problem as stored ("Malzeme eksik: note"): the reason translated, the note as typed. */
function sorunText(detail: string): string {
  const [reason, ...rest] = detail.split(': ')
  return PROBLEM_REASONS.includes(reason) ? [t(reason), ...rest].join(': ') : detail
}

const birlestir = (parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(' · ')

/** İç rapor: everything Felix recorded, for Genel Müdür, IT and Bölüm Sorumluları. */
export function icRaporuBelgesi(rapor: ProjeRaporu, data: Workshop): PdfBelge {
  const p = rapor.project
  const type = data.projectTypes.find((ty) => ty.id === p.project_type_id)
  const bilgiler: [string, string][] = [
    [t('Firma'), data.company(p.company_id)?.name ?? ''],
    [t('Proje türü'), type?.name ?? ''],
    [t('Açıldı'), tarihText(p.created_at)],
    [t('Planlanan teslim'), tarihText(p.due_date)],
    [t('Bütün adımlar bitti'), tarihText(rapor.tamamlandi)],
    [t('Teslim edildi'), p.teslim_at ? tarihText(p.teslim_at) : rapor.tamamlandi ? t('Henüz teslim edilmedi') : ''],
    [t('Teslim durumu'), rapor.gecikme === null ? '' : gecikmeText(rapor.gecikme)],
  ]
  const adimlar: PdfAdim[] = rapor.adimlar.map((a, i) => {
    const satirlar: PdfAdim['satirlar'] = []
    const zaman = birlestir([
      a.basladi && t('Başladı: {time}', { time: anText(a.basladi) }),
      a.bitti ? t('Bitti: {time}', { time: anText(a.bitti) }) : t('Bitmedi'),
    ])
    satirlar.push({ text: zaman })
    const sure = birlestir([
      a.calisma > 0 && t('Çalışma: {time}', { time: sureText(a.calisma) }),
      a.sorunBekleme > 0 && t('Sorun beklemesi: {time}', { time: sureText(a.sorunBekleme) }),
      a.onayBekleme > 0 && t('Onay beklemesi: {time}', { time: sureText(a.onayBekleme) }),
    ])
    if (sure) satirlar.push({ text: sure })
    for (const g of a.geriGondermeler) {
      satirlar.push({
        tur: 'geri',
        text: birlestir([
          g.kim ? t('Geri gönderen: {name}', { name: g.kim.full_name }) : t('Geri gönderildi'),
          anText(g.at),
          g.not && t('Not: {text}', { text: g.not }),
        ]),
      })
    }
    for (const s of a.sorunlar) satirlar.push({ tur: 'sorun', text: birlestir([t('Sorun: {text}', { text: sorunText(s.neden) }), anText(s.at)]) })
    if (a.onaylandi) {
      satirlar.push({
        tur: 'onay',
        text: birlestir([a.onaylayan ? t('Onaylayan: {name}', { name: a.onaylayan.full_name }) : t('Onaylandı'), anText(a.onaylandi)]),
      })
    }
    return { no: i + 1, ad: a.step.name, sag: a.kisiler.map((k) => k.full_name).join(', ') || t('Atanmadı'), satirlar }
  })
  return {
    dosyaAdi: `${birlestirDosya([p.code, p.name, t('İç rapor')])}.pdf`,
    ad: p.name,
    kod: p.code ?? '',
    tur: t('İç rapor'),
    bilgiler: bilgiler.filter(([, v]) => v),
    toplamlar: [
      [String(rapor.adimlar.length), t('Adım')],
      [sureText(rapor.toplamCalisma), t('Toplam çalışma')],
      [String(rapor.toplamGeriGonderme), t('Geri gönderme')],
      [String(rapor.toplamSorun), t('Sorun')],
    ],
    adimBaslik: t('Adımlar'),
    adimlar,
    kisiler: rapor.kisiler.length
      ? {
          basliklar: [t('Kişi'), t('Adım'), t('Çalışma'), t('Geri gönderme'), t('Bildirdiği sorun')],
          satirlar: rapor.kisiler.map((k) => [
            k.kisi.full_name,
            String(k.adim),
            k.calisma ? sureText(k.calisma) : '–',
            String(k.geriGonderme),
            String(k.sorun),
          ]),
        }
      : null,
    talepler: rapor.talepler.map((tl) => {
      const what = tl.kind === 'malzeme' ? birlestir([tl.material, tl.quantity]) : tl.note || t('Çizim hatalı')
      return {
        ust: `${tl.kind === 'malzeme' ? t('Malzeme talebi') : t('Çizim talebi')}: ${what}`,
        alt: birlestir([
          data.steps.find((s) => s.id === tl.step_id)?.name,
          t('Açıldı: {time}', { time: anText(tl.created_at) }),
          tl.closed_at
            ? t('{status}: {time}', { status: t(TALEP_STATUS_LABEL[tl.status]), time: anText(tl.closed_at) })
            : t(TALEP_STATUS_LABEL[tl.status]),
          tl.closed_at && t('Bekleme: {time}', { time: sureText(new Date(tl.closed_at).getTime() - new Date(tl.created_at).getTime()) }),
        ]),
      }
    }),
    fotoBaslik: t('Bitiş fotoğrafları'),
    fotolar: rapor.adimlar
      .filter((a) => a.foto)
      .map((a) => ({ id: a.foto!.id, yol: a.foto!.storage_path, alt: birlestir([a.step.name, a.bitti && tarihText(a.bitti)]) })),
    fotoSutun: 3,
    belgeler: [],
    notlar: [t('Süreler takvim süresidir; geceler ve hafta sonları dahildir. Sorun ve onay beklemeleri çalışmaya sayılmaz. Bir adıma atanan herkes o adımı yapmış sayılır.')],
  }
}

/** Müşteri raporu: what the customer sees. No names, only the ticked photos and files. */
export function musteriRaporuBelgesi(rapor: Extract<MusteriRaporu, { hazir: true }>, dosyaTuru = t('Proje raporu')): PdfBelge {
  return {
    // The page is the same as the customer's own; only a manager's copy is named "Müşteri raporu".
    dosyaAdi: `${birlestirDosya([rapor.kod, rapor.ad, dosyaTuru])}.pdf`,
    ad: rapor.ad,
    kod: rapor.kod,
    tur: null,
    bilgiler: (
      [
        [t('Firma'), rapor.firma ?? ''],
        [t('Tamamlandı'), tarihText(rapor.tamamlandi)],
        [t('Teslim edildi'), tarihText(rapor.teslim)],
      ] as [string, string][]
    ).filter(([, v]) => v),
    toplamlar: [],
    adimBaslik: t('Yapılan işler'),
    adimlar: rapor.adimlar.map((a, i) => ({ no: i + 1, ad: a.ad, sag: tarihText(a.bitti), satirlar: [] })),
    kisiler: null,
    talepler: [],
    fotoBaslik: t('Fotoğraflar'),
    fotolar: rapor.dosyalar.filter((d) => d.foto).map((d) => ({ id: d.id, url: d.url, alt: d.adim ?? d.ad })),
    fotoSutun: 2,
    belgeler: rapor.dosyalar.filter((d) => !d.foto).map((d) => ({ ad: d.ad, boyut: formatSize(d.boyut) })),
    notlar: [],
  }
}

/** A file name without characters phones and computers refuse. */
function birlestirDosya(parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(' - ')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim()
}

// ---- Making the file ----

const RENK = {
  ink: '#1d1d1f',
  ink2: '#5a5a5f',
  hair: '#d9d9de',
  fill: '#f2f3f5',
  accent: '#0b5cad',
  danger: '#9a1b14',
  geri: '#8a5300',
}

const A4_GENISLIK = 595.28
const KENAR = 42
const ICERIK = A4_GENISLIK - 2 * KENAR

/** A picture as a data link, made smaller (at most 1400 px, JPEG) so the file stays light. */
async function resimVerisi(url: string, png = false): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    const local = URL.createObjectURL(blob)
    const image = new Image()
    try {
      image.src = local
      await image.decode()
    } finally {
      URL.revokeObjectURL(local)
    }
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    if (!png) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85)
  } catch {
    return null
  }
}

async function fotoVerisi(foto: PdfFoto): Promise<string | null> {
  const url = foto.url ?? (foto.yol ? (await viewLink(foto.yol)).url : null)
  return url ? resimVerisi(url) : null
}

/**
 * A section: its heading with the line under it, then its items. The heading
 * is kept on one page with the first item, so a page never ends on a heading.
 */
function bolum(text: string, items: Content[]): Content[] {
  const head: Content[] = [
    { text, fontSize: 12, bold: true, color: RENK.ink, margin: [0, 18, 0, 5] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: ICERIK, y2: 0, lineWidth: 0.6, lineColor: RENK.hair }] },
  ]
  return [{ unbreakable: true, stack: [...head, items[0]] }, ...items.slice(1)]
}

function satirlar<T>(items: T[], n: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n))
  return rows
}

function icerik(belge: PdfBelge, resimler: Map<string, string>): Content[] {
  const out: Content[] = [
    { text: t('Proje raporu'), fontSize: 22, bold: true, alignment: 'center', characterSpacing: -0.3 },
    { text: belge.ad, font: 'InterSemi', fontSize: 13, alignment: 'center', margin: [0, 4, 0, 0] },
    { text: belge.kod, fontSize: 10, color: RENK.ink2, alignment: 'center', characterSpacing: 0.6, margin: [0, 3, 0, 0] },
  ]
  if (belge.tur) {
    out.push({
      text: belge.tur.toLocaleUpperCase(locale()),
      font: 'InterSemi',
      fontSize: 7.5,
      color: RENK.accent,
      alignment: 'center',
      characterSpacing: 1.4,
      margin: [0, 6, 0, 0],
    })
  }

  if (belge.bilgiler.length) {
    out.push({
      margin: [0, 18, 0, 0],
      layout: 'noBorders',
      table: {
        widths: ['*', '*', '*'],
        body: satirlar(belge.bilgiler, 3).map((row) => {
          const cells: Content[] = row.map(([label, value]) => ({
            margin: [0, 0, 8, 8],
            stack: [
              { text: label, fontSize: 7.5, color: RENK.ink2 },
              { text: value, font: 'InterSemi', fontSize: 10, margin: [0, 1, 0, 0] },
            ],
          }))
          while (cells.length < 3) cells.push({ text: '' })
          return cells
        }),
      },
    })
  }

  if (belge.toplamlar.length) {
    out.push({
      margin: [0, 6, 0, 0],
      columnGap: 8,
      columns: belge.toplamlar.map(([value, label]) => ({
        width: '*',
        layout: 'noBorders',
        table: {
          widths: ['*'],
          body: [
            [
              {
                fillColor: RENK.fill,
                margin: [10, 8, 10, 8],
                stack: [
                  { text: value, fontSize: 14, bold: true },
                  { text: label, fontSize: 7.5, color: RENK.ink2, margin: [0, 2, 0, 0] },
                ],
              },
            ],
          ],
        },
      })),
    })
  }

  if (belge.adimlar.length) {
    out.push(
      ...bolum(
        belge.adimBaslik,
        belge.adimlar.map((a, i) => ({
          unbreakable: true,
          margin: [0, i ? 0 : 6, 0, 0],
          stack: [
            {
              columns: [
                { text: String(a.no), width: 18, bold: true, color: RENK.accent, fontSize: 10 },
                { text: a.ad, width: '*', font: 'InterSemi', fontSize: 10.5 },
                { text: a.sag, width: 180, alignment: 'right', fontSize: 9, color: RENK.ink2 },
              ],
            },
            ...a.satirlar.map(
              (s): Content => ({
                text: s.text,
                margin: [18, 2, 0, 0],
                fontSize: 8.5,
                color: s.tur === 'sorun' ? RENK.danger : s.tur === 'geri' ? RENK.geri : s.tur === 'onay' ? RENK.ink : RENK.ink2,
              }),
            ),
            {
              margin: [0, 7, 0, 7],
              canvas: [{ type: 'line', x1: 0, y1: 0, x2: ICERIK, y2: 0, lineWidth: 0.4, lineColor: RENK.hair }],
            },
          ],
        })),
      ),
    )
  }

  if (belge.kisiler) {
    const sayi = (i: number) => i > 0
    out.push(
      ...bolum(t('Kişiler'), [
        {
          margin: [0, 6, 0, 0],
          layout: {
            hLineWidth: (i: number) => (i === 0 ? 0 : 0.4),
            vLineWidth: () => 0,
            hLineColor: () => RENK.hair,
            paddingLeft: () => 0,
            paddingRight: (i: number) => (i === 4 ? 0 : 8),
            paddingTop: () => 5,
            paddingBottom: () => 5,
          },
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto', 'auto'],
            body: [
              belge.kisiler.basliklar.map((h, i) => ({ text: h, fontSize: 7.5, color: RENK.ink2, alignment: sayi(i) ? 'right' : 'left' })),
              ...belge.kisiler.satirlar.map((row) => row.map((v, i) => ({ text: v, fontSize: 9, alignment: sayi(i) ? 'right' : 'left' }))),
            ] as Content[][],
          },
        },
      ]),
    )
  }

  if (belge.talepler.length) {
    out.push(
      ...bolum(
        t('Talepler'),
        belge.talepler.map((tl) => ({
          unbreakable: true,
          margin: [0, 6, 0, 0],
          stack: [
            { text: tl.ust, font: 'InterSemi', fontSize: 9.5 },
            { text: tl.alt, fontSize: 8.5, color: RENK.ink2, margin: [0, 2, 0, 0] },
          ],
        })),
      ),
    )
  }

  const fotolar = belge.fotolar.filter((f) => resimler.has(f.id))
  if (fotolar.length) {
    const n = belge.fotoSutun
    const gap = 12
    const w = (ICERIK - gap * (n - 1)) / n
    const h = w * 0.75
    const rows = satirlar(fotolar, n).map((row, i): Content => {
      const cells: Column[] = row.map((f) => ({
        width: w,
        stack: [
          { image: f.id, fit: [w, h], alignment: 'center' },
          { text: f.alt, fontSize: 8, color: RENK.ink2, alignment: 'center', margin: [0, 4, 0, 0] },
        ],
      }))
      // A row that is not full is centred, so the page stays symmetrical.
      const side: Column = { width: '*', stack: [] }
      const columns = cells.length < n ? [side, ...cells, side] : cells
      return { unbreakable: true, columnGap: gap, columns, margin: [0, i ? 12 : 10, 0, 0] }
    })
    out.push(...bolum(belge.fotoBaslik, rows))
  }

  if (belge.belgeler.length) {
    out.push(
      ...bolum(
        t('Belgeler'),
        belge.belgeler.map((d) => ({
          margin: [0, 6, 0, 0],
          columns: [
            { text: d.ad, width: '*', fontSize: 9.5 },
            { text: d.boyut, width: 'auto', fontSize: 8.5, color: RENK.ink2 },
          ],
        })),
      ),
    )
  }

  const notlar = [...belge.notlar, t('Rapor tarihi: {date}', { date: anText(new Date().toISOString()) })]
  out.push({ margin: [0, 20, 0, 0], stack: notlar.map((n) => ({ text: n, fontSize: 7.5, color: RENK.ink2, margin: [0, 0, 0, 3] })) })
  return out
}

type PdfMake = typeof import('pdfmake')

let yukleniyor: Promise<PdfMake> | null = null

/** pdfmake with the Inter font, loaded the first time a report is made. */
function pdfMake(): Promise<PdfMake> {
  yukleniyor ??= import('pdfmake').then((m) => {
    const lib = ((m as { default?: PdfMake }).default ?? m) as PdfMake
    const font = (name: string) => new URL(`/fonts/Inter-${name}.ttf`, location.origin).href
    lib.setFonts({
      Inter: { normal: font('Regular'), bold: font('Bold'), italics: font('Regular'), bolditalics: font('Bold') },
      InterSemi: { normal: font('SemiBold'), bold: font('Bold'), italics: font('SemiBold'), bolditalics: font('Bold') },
    })
    return lib
  })
  return yukleniyor.catch((e) => {
    yukleniyor = null
    throw e
  })
}

/** The A4 file of a report. */
export async function pdfOlustur(belge: PdfBelge): Promise<Blob> {
  const [lib, logo, ...fotolar] = await Promise.all([
    pdfMake(),
    resimVerisi(new URL('/aquafelix-logo.png', location.origin).href, true),
    ...belge.fotolar.map(fotoVerisi),
  ])
  const resimler = new Map<string, string>()
  belge.fotolar.forEach((f, i) => {
    const data = fotolar[i]
    if (data) resimler.set(f.id, data)
  })
  const images: Record<string, string> = Object.fromEntries(resimler)
  if (logo) images.logo = logo

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [KENAR, 92, KENAR, 70],
    info: { title: belge.dosyaAdi.replace(/\.pdf$/, ''), author: 'Aquafelix', creator: 'Felix', producer: 'Felix' },
    defaultStyle: { font: 'Inter', fontSize: 10, color: RENK.ink, lineHeight: 1.2 },
    images,
    header: () => ({
      margin: [KENAR, 26, KENAR, 0],
      stack: [
        logo ? { image: 'logo', width: 150, alignment: 'center' } : { text: 'AQUAFELIX', bold: true, alignment: 'center', color: RENK.accent }, // i18n-ok
        { margin: [0, 9, 0, 0], canvas: [{ type: 'line', x1: 0, y1: 0, x2: ICERIK, y2: 0, lineWidth: 1.2, lineColor: RENK.accent }] },
      ],
    }),
    footer: (page: number, pages: number) => ({
      margin: [KENAR, 16, KENAR, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: ICERIK, y2: 0, lineWidth: 0.6, lineColor: RENK.hair }] },
        { text: ANTET_ADRES, fontSize: 7.5, color: RENK.ink2, alignment: 'center', margin: [0, 6, 0, 0] },
        { text: ANTET_TEL, fontSize: 7.5, color: RENK.ink2, alignment: 'center', margin: [0, 1, 0, 0] },
        { text: t('Sayfa {page} / {total}', { page, total: pages }), fontSize: 7.5, color: RENK.ink2, alignment: 'center', margin: [0, 4, 0, 0] },
      ],
    }),
    content: icerik(belge, resimler),
  }
  return lib.createPdf(doc).getBlob()
}
