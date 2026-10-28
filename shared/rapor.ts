// What the customer's report holds (api/rapor.ts sends it, the app shows it).
// Shared so both sides agree on its shape.

export type MusteriDosyasi = {
  id: string
  ad: string
  /** The step a photo was taken on; null for a project file. */
  adim: string | null
  boyut: number | null
  foto: boolean
  /** Shows the file in the page; works for an hour. */
  url: string
  /** Downloads it under its own name. */
  indir: string
}

export type MusteriRaporu =
  | { hazir: false; kod: string; ad: string }
  | {
      hazir: true
      kod: string
      ad: string
      firma: string | null
      /** When the last step was done. */
      tamamlandi: string | null
      /** When the product left the factory ("Projeyi teslim et"), if it has. */
      teslim: string | null
      adimlar: { ad: string; bitti: string | null }[]
      dosyalar: MusteriDosyasi[]
    }

/** The code a customer types: the project code and its four-character key. */
export const musteriKodu = (projeKodu: string, anahtar: string) => `${projeKodu}-${anahtar}`
