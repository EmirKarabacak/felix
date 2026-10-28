import type { SupabaseClient } from '@supabase/supabase-js'
import type { MusteriDosyasi, MusteriRaporu } from '../../shared/rapor.js'
import { adminClient, asRecord, fail, ok, type Call, type Reply } from './core.js'

// The customer's report. Anyone may call this, signed in or not, with a
// customer code (AF-26-014-K7PX); the database checks the code, counts wrong
// ones, and returns only the customer version (0011). The ticked photos and
// files get links that work for an hour.

const LINK_SECONDS = 3600

type Row = {
  durum: 'yok' | 'bekle' | 'hazirlaniyor' | 'hazir'
  kod?: string
  ad?: string
  firma?: string | null
  tamamlandi?: string | null
  teslim?: string | null
  adimlar?: { ad: string; bitti: string | null }[]
  dosyalar?: { id: string; ad: string; yol: string; mime: string | null; boyut: number | null; adim: string | null }[]
}

const isMissingFunction = (error: { code?: string; message?: string }) =>
  error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message ?? '')

/** POST /api/rapor { kod }: the customer version of a project's report. */
export async function handleRapor(call: Call, db: SupabaseClient = adminClient()): Promise<Reply> {
  if (call.method !== 'POST') return fail(405, 'Yöntem desteklenmiyor.')
  const kod = String(asRecord(call.body).kod ?? '').trim().slice(0, 40)
  if (!kod) return fail(400, 'Müşteri kodunu yazın.')

  const { data, error } = await db.rpc('musteri_raporu', { p_kod: kod })
  if (error) {
    if (isMissingFunction(error)) return fail(503, 'Proje raporları henüz kurulmadı.')
    return fail(500, error.message)
  }
  const row = data as Row
  if (row.durum === 'bekle') return fail(429, 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.')
  if (row.durum === 'yok') return fail(404, 'Bu kodla bir proje bulunamadı. Kodu kontrol edip tekrar deneyin.')
  if (row.durum === 'hazirlaniyor') {
    const rapor: MusteriRaporu = { hazir: false, kod: row.kod ?? '', ad: row.ad ?? '' }
    return ok({ rapor })
  }

  const dosyalar = await Promise.all(
    (row.dosyalar ?? []).map(async (d) => {
      const signed = await db.storage.from('dosyalar').createSignedUrl(d.yol, LINK_SECONDS)
      const url = signed.data?.signedUrl ?? null
      const foto = (d.mime ?? '').startsWith('image/')
      return {
        id: d.id,
        ad: d.ad,
        adim: d.adim,
        boyut: d.boyut,
        foto,
        url,
        // Documents download under their own name; photos show in the page.
        indir: url && !foto ? `${url}&download=${encodeURIComponent(d.ad)}` : url,
      }
    }),
  )
  const rapor: MusteriRaporu = {
    hazir: true,
    kod: row.kod ?? '',
    ad: row.ad ?? '',
    firma: row.firma ?? null,
    tamamlandi: row.tamamlandi ?? null,
    teslim: row.teslim ?? null,
    adimlar: row.adimlar ?? [],
    // A file whose link could not be made (gone from storage) is left out.
    dosyalar: dosyalar.filter((d): d is MusteriDosyasi => d.url !== null && d.indir !== null),
  }
  return ok({ rapor })
}
