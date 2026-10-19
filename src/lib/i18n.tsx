import { useSyncExternalStore } from 'react'
import { EN } from './en'

/**
 * Language and theme, chosen by each person in Ayarlar and kept on their
 * device. Turkish is the app's own language: every text is written in Turkish
 * inside t(), and t() swaps in the English from en.ts when English is chosen.
 * A text missing from en.ts stays Turkish (scripts/check-i18n.mjs catches it).
 */
export type Lang = 'tr' | 'en'
export type Theme = 'system' | 'light' | 'dark'

const LANG_KEY = 'felix.lang'
const THEME_KEY = 'felix.theme'

function stored<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return allowed.includes(value as T) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode or blocked storage: the choice lasts until the page closes.
  }
}

let lang: Lang = stored<Lang>(LANG_KEY, ['tr', 'en'], 'tr')
let theme: Theme = stored<Theme>(THEME_KEY, ['system', 'light', 'dark'], 'system')
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const currentLang = () => lang
export const currentTheme = () => theme

/**
 * Turkish wording changed after the text went into the database or the server.
 * Shown instead of the stored Turkish, so no database update is needed.
 */
const TR_FIX: Record<string, string> = {
  'Bu adım şu anda bu işleme uygun değil.': 'Bu adımın durumu değişmiş. Sayfayı yenileyip tekrar deneyin.', // i18n-ok
}

type Vars = Record<string, string | number>

/**
 * The text in the chosen language. `text` is the Turkish; `{name}` in it is
 * filled from `vars`. An English entry may have a singular form, picked when
 * `vars.n` is 1. When one Turkish word needs two different English words, a
 * note after "|" tells them apart ('Açık|tema'); the note is never shown.
 */
export function t(text: string, vars?: Vars): string {
  let out = TR_FIX[text] ?? text.split('|')[0]
  if (lang === 'en') {
    const en = EN[text]
    if (typeof en === 'string') out = en
    else if (en) out = vars?.n === 1 ? en.one : en.other
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m))
  return out
}

/** Locale for dates, numbers and sorting. */
export const locale = () => (lang === 'en' ? 'en-GB' : 'tr-TR')

export function setLang(next: Lang) {
  if (next === lang) return
  lang = next
  store(LANG_KEY, next)
  document.documentElement.lang = next
  emit()
}

const THEME_COLOR = { light: '#F5F5F7', dark: '#000000' }

/** Puts the chosen theme on the page; "system" follows the phone's own setting. */
export function applyTheme() {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light)
}

export function setTheme(next: Theme) {
  if (next === theme) return
  theme = next
  store(THEME_KEY, next)
  applyTheme()
  emit()
}

/** Called once at start: language and theme from the last visit. */
export function startSettings() {
  document.documentElement.lang = lang
  applyTheme()
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme)
}

/** Re-renders when the language or theme changes. */
export function useSettings(): { lang: Lang; theme: Theme } {
  const l = useSyncExternalStore(subscribe, currentLang)
  const th = useSyncExternalStore(subscribe, currentTheme)
  return { lang: l, theme: th }
}
