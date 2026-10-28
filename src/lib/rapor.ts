import { locale, t } from './i18n'
import type { Profile } from './supabase'
import type { Dosya, Project, Step, StepEvent, Talep, Workshop } from './workshop'

// The internal report (İç rapor): worked out from what Felix recorded about
// each step. Everyone assigned to a step counts as having done it (Emir).

export type Olay = StepEvent & { step_id: string }

export type AdimRaporu = {
  step: Step
  kisiler: Profile[]
  /** The first "İşe başlandı". */
  basladi: string | null
  /** Handed in (for an approved step this is the worker's hand-in time). */
  bitti: string | null
  /** When a manager approved it, if it needed approval. */
  onaylandi: string | null
  /** Time the step was being worked on, without problem or approval waits. */
  calisma: number
  sorunBekleme: number
  onayBekleme: number
  geriGonderme: number
  sorunlar: { neden: string; at: string }[]
  foto: Dosya | undefined
}

export type KisiRaporu = {
  kisi: Profile
  adim: number
  calisma: number
  geriGonderme: number
  sorun: number
}

export type ProjeRaporu = {
  project: Project
  adimlar: AdimRaporu[]
  kisiler: KisiRaporu[]
  talepler: Talep[]
  /** When the last step was done. */
  tamamlandi: string | null
  /** Days after the planned delivery date (negative: early), by the real delivery or, before it, the last step. */
  gecikme: number | null
  toplamCalisma: number
  toplamGeriGonderme: number
  toplamSorun: number
}

const ms = (iso: string) => new Date(iso).getTime()

/** Walks one step's history and adds up how long it spent in each state. */
function adimRaporu(data: Workshop, step: Step, olaylar: Olay[]): AdimRaporu {
  let state: 'waiting' | 'active' | 'problem' | 'review' | 'done' = 'waiting'
  let since = 0
  const r: AdimRaporu = {
    step,
    kisiler: data.assigneesOf(step.id),
    basladi: null,
    bitti: step.finished_at,
    onaylandi: null,
    calisma: 0,
    sorunBekleme: 0,
    onayBekleme: 0,
    geriGonderme: 0,
    sorunlar: [],
    foto: step.finish_photo_id ? data.dosyalarOfStep(step.id).find((f) => f.id === step.finish_photo_id) : undefined,
  }
  const close = (at: number) => {
    const spent = Math.max(0, at - since)
    if (state === 'active') r.calisma += spent
    else if (state === 'problem') r.sorunBekleme += spent
    else if (state === 'review') r.onayBekleme += spent
  }
  for (const e of olaylar) {
    const at = ms(e.created_at)
    switch (e.kind) {
      case 'started':
      case 'resolved':
      case 'rejected':
      case 'reopened':
        close(at)
        if (e.kind === 'started' && !r.basladi) r.basladi = e.created_at
        if (e.kind === 'rejected') r.geriGonderme++
        state = 'active'
        since = at
        break
      case 'problem':
        close(at)
        r.sorunlar.push({ neden: e.detail ?? '', at: e.created_at })
        state = 'problem'
        since = at
        break
      case 'submitted':
        close(at)
        state = 'review'
        since = at
        break
      case 'finished':
      case 'approved':
        close(at)
        if (e.kind === 'approved') r.onaylandi = e.created_at
        state = 'done'
        break
      case 'reset':
        close(at)
        state = 'waiting'
        break
    }
  }
  // Still going: count up to now, so an unfinished project's report is honest too.
  if (state !== 'done' && state !== 'waiting') close(Date.now())
  return r
}

/** Whole calendar days from one stored date or moment to another (local time). */
function gunFarki(from: string, to: string): number {
  const day = (v: string) => {
    const d = v.length <= 10 ? new Date(`${v}T00:00:00`) : new Date(v)
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  }
  return Math.round((day(to) - day(from)) / 86_400_000)
}

export function projeRaporu(data: Workshop, project: Project, olaylar: Olay[]): ProjeRaporu {
  const steps = data.stepsOf(project.id)
  const byStep = new Map<string, Olay[]>()
  for (const e of olaylar) {
    const list = byStep.get(e.step_id)
    if (list) list.push(e)
    else byStep.set(e.step_id, [e])
  }
  const adimlar = steps.map((s) => adimRaporu(data, s, byStep.get(s.id) ?? []))
  const done = steps.length > 0 && steps.every((s) => s.status === 'done')
  const tamamlandi = done ? steps.map((s) => s.finished_at ?? '').sort().at(-1) || null : null

  const kisiler = new Map<string, KisiRaporu>()
  for (const a of adimlar) {
    for (const kisi of a.kisiler) {
      const k = kisiler.get(kisi.id) ?? { kisi, adim: 0, calisma: 0, geriGonderme: 0, sorun: 0 }
      k.adim++
      k.calisma += a.calisma
      k.geriGonderme += a.geriGonderme
      kisiler.set(kisi.id, k)
    }
  }
  // A problem counts for whoever reported it.
  for (const e of olaylar) {
    if (e.kind !== 'problem' || !e.actor_id) continue
    const kisi = data.person(e.actor_id)
    if (!kisi) continue
    const k = kisiler.get(kisi.id) ?? { kisi, adim: 0, calisma: 0, geriGonderme: 0, sorun: 0 }
    k.sorun++
    kisiler.set(kisi.id, k)
  }

  const sonTarih = project.teslim_at ?? tamamlandi
  return {
    project,
    adimlar,
    kisiler: [...kisiler.values()].sort((a, b) => a.kisi.full_name.localeCompare(b.kisi.full_name, 'tr')),
    talepler: [...data.taleplerOfProject(project.id)].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    tamamlandi,
    gecikme: project.due_date && sonTarih ? gunFarki(project.due_date, sonTarih) : null,
    toplamCalisma: adimlar.reduce((n, a) => n + a.calisma, 0),
    toplamGeriGonderme: adimlar.reduce((n, a) => n + a.geriGonderme, 0),
    toplamSorun: adimlar.reduce((n, a) => n + a.sorunlar.length, 0),
  }
}

/** "3 sa 20 dk", "2 gün 4 sa". Calendar time: nights and weekends count. */
export function sureText(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000)
  if (minutes < 1) return t('1 dakikadan az')
  if (minutes < 60) return t('{m} dk', { m: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 ? t('{h} sa {m} dk', { h: hours, m: minutes % 60 }) : t('{h} sa', { h: hours })
  const days = Math.floor(hours / 24)
  return hours % 24 ? t('{d} gün {h} sa', { d: days, h: hours % 24 }) : t('{d} gün', { d: days })
}

/** "12 Eki 2026": a report is kept for years, so dates always carry the year. */
export function tarihText(value: string | null): string {
  if (!value) return ''
  const date = value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value)
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

/** "12 Eki 2026 09:40" */
export function anText(value: string | null): string {
  if (!value) return ''
  return new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/** "5 gün geç", "2 gün erken", "Zamanında" */
export function gecikmeText(days: number): string {
  if (days > 0) return t('{n} gün geç', { n: days })
  if (days < 0) return t('{n} gün erken', { n: -days })
  return t('Zamanında')
}
