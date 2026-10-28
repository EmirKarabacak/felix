import { useEffect, useRef, useState } from 'react'
import { friendly } from '../lib/errors'
import { t } from '../lib/i18n'
import { belgeAnahtari, pdfOlustur, type PdfBelge } from '../lib/pdf'
import { ErrorNote, Icon, Spinner } from './ui'

export type RaporPdf = { blob: Blob | null; dosyaAdi: string; error: string | null }

/**
 * The report's PDF file, made by Felix from what the report says, and made
 * again only when that changes.
 */
export function useRaporPdf(belge: PdfBelge | null): RaporPdf {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const anahtar = belge ? belgeAnahtari(belge) : null
  const son = useRef(belge)
  son.current = belge
  useEffect(() => {
    if (!anahtar || !son.current) return
    let alive = true
    setError(null)
    setBlob(null)
    pdfOlustur(son.current)
      .then((b) => {
        if (alive) setBlob(b)
      })
      .catch((e) => {
        if (alive) setError(friendly(e))
      })
    return () => {
      alive = false
    }
  }, [anahtar])
  return { blob: anahtar ? blob : null, dosyaAdi: belge?.dosyaAdi ?? 'rapor.pdf', error }
}

/**
 * Saves the file. On a phone or tablet it opens the share sheet (on an iPhone:
 * "Dosyalar'a Kaydet", Mail, WhatsApp...), which also works when Felix runs
 * from the home screen; on a computer it downloads.
 */
async function kaydet(blob: Blob, dosyaAdi: string) {
  const file = new File([blob], dosyaAdi, { type: 'application/pdf' })
  const touch = window.matchMedia?.('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: dosyaAdi.replace(/\.pdf$/, '') })
      return
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = dosyaAdi
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function PdfKaydet({ pdf }: { pdf: RaporPdf }) {
  return (
    <button type="button" className="btn btn-primary press" disabled={!pdf.blob} onClick={() => pdf.blob && void kaydet(pdf.blob, pdf.dosyaAdi)}>
      <Icon name="download" size={18} />
      {pdf.blob ? t('PDF olarak kaydet') : t('PDF hazırlanıyor…')}
    </button>
  )
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjsYukleniyor: Promise<PdfJs> | null = null

/** pdf.js draws the pages on screen; loaded the first time a report is opened. */
function pdfJs(): Promise<PdfJs> {
  pdfjsYukleniyor ??= Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib
    },
  )
  return pdfjsYukleniyor.catch((e) => {
    pdfjsYukleniyor = null
    throw e
  })
}

/**
 * The A4 pages of the file itself, one under the other, so what is on screen
 * is exactly what is saved. Pages are drawn off screen and swapped in at once,
 * so a new version does not flicker.
 */
export function PdfOnizleme({ pdf }: { pdf: RaporPdf }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [drawn, setDrawn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setWidth((w) => (Math.abs(w - el.clientWidth) > 24 ? el.clientWidth : w))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const el = box.current
    if (!pdf.blob || !el || !width) return
    let alive = true
    void (async () => {
      try {
        const lib = await pdfJs()
        const task = lib.getDocument({ data: new Uint8Array(await pdf.blob!.arrayBuffer()) })
        const doc = await task.promise
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        const pages: HTMLCanvasElement[] = []
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (width / base.width) * ratio })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.className = 'pdf-page'
          canvas.setAttribute('role', 'img')
          canvas.setAttribute('aria-label', t('Sayfa {page} / {total}', { page: n, total: doc.numPages }))
          await page.render({ canvas, viewport }).promise
          if (!alive) return
          pages.push(canvas)
        }
        void task.destroy()
        if (!alive) return
        el.replaceChildren(...pages)
        setDrawn(true)
        setError(null)
      } catch (e) {
        if (alive) setError(friendly(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [pdf.blob, width])

  const message = pdf.error ?? error
  return (
    <>
      <ErrorNote>{message}</ErrorNote>
      {!drawn && !message ? <Spinner /> : null}
      <div ref={box} className="pdf-pages" role="document" aria-label={t('Rapor önizlemesi')} aria-busy={!drawn} />
    </>
  )
}
