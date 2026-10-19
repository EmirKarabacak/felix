import { adim } from './en/adim'
import { ayarlar } from './en/ayarlar'
import { genel } from './en/genel'
import { ozet } from './en/ozet'
import { projeler } from './en/projeler'

/** An English text, or its singular and plural when it counts something ({n}). */
export type Dictionary = Record<string, string | { one: string; other: string }>

/**
 * English for every Turkish text in the app, keyed by the Turkish exactly as
 * written in t(). Split by area: genel (shared words, sign-in, errors and the
 * server's and database's messages), projeler, adim (steps, İşlerim, Talepler,
 * Dosyalar), ayarlar (Ekip, Ayarlar and the lists), ozet (the Özet tab).
 */
export const EN: Dictionary = { ...genel, ...projeler, ...adim, ...ayarlar, ...ozet }
