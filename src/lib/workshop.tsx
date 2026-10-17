import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { friendly } from './errors'
import { canManage, fetchProfiles, supabase, type Bolum, type BolumKod, type DbStage, type Profile, type Seviye } from './supabase'

export type StepStatus = 'waiting' | 'active' | 'problem' | 'review' | 'done'

export type Project = {
  id: string
  code: string | null
  name: string
  due_date: string | null
  project_type_id: string | null
  company_id: string | null
  created_at: string
}

export type Step = {
  id: string
  project_id: string
  step_type_id: string | null
  name: string
  position: number
  due_date: string | null
  status: StepStatus
  problem_reason: string | null
  problem_note: string | null
  started_at: string | null
  finished_at: string | null
  submitted_at: string | null
  /** Why a manager sent the step back, shown to the worker until it is handed in again. */
  review_note: string | null
}

export type NamedItem = { id: string; name: string }

/** A customer company. Everyone sees the name; only the CEO and managers get details. */
export type Company = NamedItem
export type CompanyDetails = {
  company_id: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
}
/** uzmanlik_id: the suggested uzmanlık, which also decides approval (0008). */
export type StepType = NamedItem & { uzmanlik_id: string | null }
export type Uzmanlik = NamedItem
export type KisiUzmanlik = { user_id: string; uzmanlik_id: string; seviye: Seviye }

export type TalepKind = 'malzeme' | 'cizim'
export type TalepStatus = 'acik' | 'siparis' | 'geldi' | 'cozuldu'
/** A request opened by "Sorun bildir": missing material or a wrong drawing. */
export type Talep = {
  id: string
  project_id: string
  step_id: string | null
  kind: TalepKind
  material: string | null
  quantity: string | null
  note: string | null
  status: TalepStatus
  created_by: string | null
  created_at: string
  handler_id: string | null
  handled_at: string | null
  ordered_at: string | null
  closed_at: string | null
  closed_by: string | null
}

/** A file on a project (Ana doküman or another project file) or on a step. */
export type Dosya = {
  id: string
  project_id: string
  step_id: string | null
  ana: boolean
  name: string
  storage_path: string
  size: number | null
  mime: string | null
  uploaded_by: string | null
  created_at: string
  /** Set once the file is in Eski sürümler (replaced or deleted). */
  eski_at: string | null
  silindi: boolean
}
export type ProjectTypeStep = { id: string; project_type_id: string; step_type_id: string; position: number }

type Raw = {
  projects: Project[]
  steps: Step[]
  assignees: { step_id: string; user_id: string }[]
  people: Profile[]
  bolumler: Bolum[]
  uzmanliklar: Uzmanlik[]
  /** Empty for Personel: the database shows levels only to Genel Müdür, IT and Bölüm Sorumluları. */
  kisiUzmanliklari: KisiUzmanlik[]
  talepler: Talep[]
  dosyalar: Dosya[]
  /** False until 0007 has been run: bölümler are then hidden. */
  bolumReady: boolean
  /** False until 0008 has been run: Uzmanlık, Talepler and Dosyalar are then hidden. */
  ready: boolean
  stepTypes: StepType[]
  projectTypes: NamedItem[]
  projectTypeSteps: ProjectTypeStep[]
  companies: Company[]
  /** Empty for workers: the database does not give them contact details. */
  companyDetails: CompanyDetails[]
}

export type Workshop = Raw & {
  /** Steps of a project, in order. */
  stepsOf: (projectId: string) => Step[]
  /** People assigned to a step, by name. */
  assigneesOf: (stepId: string) => Profile[]
  person: (id: string) => Profile | undefined
  /** A person's uzmanlıklar with their level in each (Personel in İmalat only). */
  uzmanliklarOf: (personId: string) => (KisiUzmanlik & { name: string })[]
  /** "Kaynakçı · Usta, Elektrikçi · Kalfa" */
  uzmanlikText: (personId: string) => string
  uzmanlikName: (id: string | null) => string | undefined
  stepType: (id: string | null) => StepType | undefined
  bolumName: (id: string | null) => string | undefined
  bolumKod: (id: string | null) => BolumKod | undefined
  /** Requests of a step, or of a project, newest first. */
  taleplerOfStep: (stepId: string) => Talep[]
  taleplerOfProject: (projectId: string) => Talep[]
  /** Files of a step, or of a project itself (step_id null), current and old. */
  dosyalarOfStep: (stepId: string) => Dosya[]
  dosyalarOfProject: (projectId: string) => Dosya[]
  project: (id: string) => Project | undefined
  company: (id: string | null) => Company | undefined
  detailsOf: (companyId: string) => CompanyDetails | undefined
  projectsOf: (companyId: string) => Project[]
  /** Steps of a project type, in order, with the step type's name. */
  typeStepsOf: (projectTypeId: string) => (ProjectTypeStep & { name: string })[]
}

type WorkshopContextValue = {
  data: Workshop | null
  error: string | null
  reload: () => Promise<void>
  /** Runs a change, then reloads. Returns an error message, or null on success. */
  change: (work: () => PromiseLike<{ error: unknown }>) => Promise<string | null>
}

const WorkshopContext = createContext<WorkshopContextValue | null>(null)

const REFRESH_MS = 30_000

async function load(): Promise<Raw> {
  // People first: which columns they have tells which database updates have run.
  const people = await fetchProfiles()
  if (people.error) throw people.error
  const stage: DbStage = people.stage
  const ready = stage >= 8
  const none = Promise.resolve({ data: [], error: null })
  const [projects, steps, assignees, stepTypes, projectTypes, projectTypeSteps, companies, companyDetails, bolumler, uzmanliklar, kisiUzmanliklari, talepler, dosyalar] = await Promise.all([
    supabase.from('projects').select('id, code, name, due_date, project_type_id, company_id, created_at').order('created_at'),
    supabase
      .from('project_steps')
      .select(
        'id, project_id, step_type_id, name, position, due_date, status, problem_reason, problem_note, started_at, finished_at, submitted_at, review_note',
      )
      .order('position'),
    supabase.from('step_assignees').select('step_id, user_id'),
    supabase.from('step_types').select(ready ? 'id, name, uzmanlik_id' : 'id, name').order('name'),
    supabase.from('project_types').select('id, name').order('name'),
    supabase.from('project_type_steps').select('id, project_type_id, step_type_id, position').order('position'),
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('company_details').select('company_id, contact_name, email, phone, address, notes'),
    stage >= 7 ? supabase.from('bolumler').select(ready ? 'id, name, kod' : 'id, name').order('name') : none,
    ready ? supabase.from('uzmanliklar').select('id, name').order('name') : none,
    ready ? supabase.from('kisi_uzmanliklari').select('user_id, uzmanlik_id, seviye') : none,
    ready
      ? supabase
          .from('talepler')
          .select('id, project_id, step_id, kind, material, quantity, note, status, created_by, created_at, handler_id, handled_at, ordered_at, closed_at, closed_by')
          .order('created_at')
      : none,
    ready
      ? supabase
          .from('dosyalar')
          .select('id, project_id, step_id, ana, name, storage_path, size, mime, uploaded_by, created_at, eski_at, silindi')
          .order('created_at')
      : none,
  ])
  const failed = [projects, steps, assignees, stepTypes, projectTypes, projectTypeSteps, companies, companyDetails, bolumler, uzmanliklar, kisiUzmanliklari, talepler, dosyalar].find((r) => r.error)
  if (failed?.error) throw failed.error
  return {
    projects: projects.data as Project[],
    steps: steps.data as unknown as Step[],
    assignees: assignees.data as Raw['assignees'],
    people: people.data as Profile[],
    bolumler: (bolumler.data as unknown as Bolum[]).map((b) => ({ ...b, kod: b.kod ?? null })),
    uzmanliklar: uzmanliklar.data as Uzmanlik[],
    kisiUzmanliklari: kisiUzmanliklari.data as KisiUzmanlik[],
    talepler: talepler.data as Talep[],
    dosyalar: dosyalar.data as Dosya[],
    bolumReady: stage >= 7,
    ready,
    stepTypes: (stepTypes.data as unknown as StepType[]).map((t) => ({ ...t, uzmanlik_id: t.uzmanlik_id ?? null })),
    projectTypes: projectTypes.data as NamedItem[],
    projectTypeSteps: projectTypeSteps.data as ProjectTypeStep[],
    companies: companies.data as Company[],
    companyDetails: companyDetails.data as CompanyDetails[],
  }
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'tr')

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

const SEVIYE_TEXT: Record<Seviye, string> = { usta: 'Usta', kalfa: 'Kalfa', cirak: 'Çırak' }

// İmalat first: it is where most people are.
const BOLUM_RANK: Record<BolumKod, number> = { imalat: 0, satinalma: 1, tasarim: 2, muhasebe: 3 }
const BOLUM_ORDER = (b: Bolum) => (b.kod ? BOLUM_RANK[b.kod] : 9)

function index(input: Raw): Workshop {
  // The database sorts by raw character codes, which puts Ş, Ç, Ö and İ last.
  const raw: Raw = {
    ...input,
    people: [...input.people].sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')),
    bolumler: [...input.bolumler].sort((a, b) => BOLUM_ORDER(a) - BOLUM_ORDER(b) || byName(a, b)),
    uzmanliklar: [...input.uzmanliklar].sort(byName),
    stepTypes: [...input.stepTypes].sort(byName),
    projectTypes: [...input.projectTypes].sort(byName),
    companies: [...input.companies].sort(byName),
  }
  const people = new Map(raw.people.map((p) => [p.id, p]))
  const projects = new Map(raw.projects.map((p) => [p.id, p]))
  const companies = new Map(raw.companies.map((c) => [c.id, c]))
  const details = new Map(raw.companyDetails.map((d) => [d.company_id, d]))
  const stepTypeName = new Map(raw.stepTypes.map((s) => [s.id, s.name]))
  const bolumById = new Map(raw.bolumler.map((b) => [b.id, b]))
  const stepTypes = new Map(raw.stepTypes.map((t) => [t.id, t]))
  const uzmanlikName = new Map(raw.uzmanliklar.map((u) => [u.id, u.name]))
  const uzmanliklarOf = new Map<string, (KisiUzmanlik & { name: string })[]>()
  for (const k of raw.kisiUzmanliklari) {
    const name = uzmanlikName.get(k.uzmanlik_id)
    if (!name) continue
    push(uzmanliklarOf, k.user_id, { ...k, name })
  }
  for (const list of uzmanliklarOf.values()) list.sort(byName)
  const newestFirst = (a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at)
  const taleplerOfStep = new Map<string, Talep[]>()
  const taleplerOfProject = new Map<string, Talep[]>()
  for (const t of [...raw.talepler].sort(newestFirst)) {
    if (t.step_id) push(taleplerOfStep, t.step_id, t)
    push(taleplerOfProject, t.project_id, t)
  }
  const dosyalarOfStep = new Map<string, Dosya[]>()
  const dosyalarOfProject = new Map<string, Dosya[]>()
  for (const d of [...raw.dosyalar].sort(newestFirst)) {
    if (d.step_id) push(dosyalarOfStep, d.step_id, d)
    else push(dosyalarOfProject, d.project_id, d)
  }
  const steps = new Map<string, Step[]>()
  for (const s of raw.steps) {
    const list = steps.get(s.project_id)
    if (list) list.push(s)
    else steps.set(s.project_id, [s])
  }
  const assigned = new Map<string, Profile[]>()
  for (const a of raw.assignees) {
    const who = people.get(a.user_id)
    if (!who) continue
    const list = assigned.get(a.step_id)
    if (list) list.push(who)
    else assigned.set(a.step_id, [who])
  }
  const typeSteps = new Map<string, (ProjectTypeStep & { name: string })[]>()
  for (const t of raw.projectTypeSteps) {
    const row = { ...t, name: stepTypeName.get(t.step_type_id) ?? '' }
    const list = typeSteps.get(t.project_type_id)
    if (list) list.push(row)
    else typeSteps.set(t.project_type_id, [row])
  }
  return {
    ...raw,
    stepsOf: (id) => steps.get(id) ?? [],
    assigneesOf: (id) => assigned.get(id) ?? [],
    person: (id) => people.get(id),
    uzmanliklarOf: (id) => uzmanliklarOf.get(id) ?? [],
    uzmanlikText: (id) =>
      (uzmanliklarOf.get(id) ?? []).map((u) => `${u.name} · ${SEVIYE_TEXT[u.seviye]}`).join(', '),
    uzmanlikName: (id) => (id ? uzmanlikName.get(id) : undefined),
    stepType: (id) => (id ? stepTypes.get(id) : undefined),
    bolumName: (id) => (id ? bolumById.get(id)?.name : undefined),
    bolumKod: (id) => (id ? (bolumById.get(id)?.kod ?? undefined) : undefined),
    taleplerOfStep: (id) => taleplerOfStep.get(id) ?? [],
    taleplerOfProject: (id) => taleplerOfProject.get(id) ?? [],
    dosyalarOfStep: (id) => dosyalarOfStep.get(id) ?? [],
    dosyalarOfProject: (id) => dosyalarOfProject.get(id) ?? [],
    project: (id) => projects.get(id),
    company: (id) => (id ? companies.get(id) : undefined),
    detailsOf: (id) => details.get(id),
    projectsOf: (id) => raw.projects.filter((p) => p.company_id === id),
    typeStepsOf: (id) => typeSteps.get(id) ?? [],
  }
}

/** Loads the whole workshop once and keeps it fresh for every signed-in screen. */
export function WorkshopProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<Raw | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  const reload = useCallback(async () => {
    const ticket = ++latest.current
    try {
      const next = await load()
      // A slower, older request must not overwrite a newer result.
      if (ticket !== latest.current) return
      setRaw(next)
      setError(null)
    } catch (e) {
      if (ticket === latest.current) setError(friendly(e))
    }
  }, [])

  useEffect(() => {
    void reload()
    // Other people change things too: refresh quietly while the app is in view.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reload])

  const change = useCallback(
    async (work: () => PromiseLike<{ error: unknown }>) => {
      try {
        const { error } = await work()
        if (error) return friendly(error)
      } catch (e) {
        return friendly(e)
      }
      await reload()
      return null
    },
    [reload],
  )

  const data = useMemo(() => (raw ? index(raw) : null), [raw])
  const value = useMemo(() => ({ data, error, reload, change }), [data, error, reload, change])
  return <WorkshopContext.Provider value={value}>{children}</WorkshopContext.Provider>
}

export function useWorkshop(): WorkshopContextValue {
  const value = useContext(WorkshopContext)
  if (!value) throw new Error('useWorkshop must be used inside WorkshopProvider')
  return value
}

/**
 * People split by bölüm, for pickers, with Genel Müdür and IT first and people
 * without a bölüm last. Before 0007 has run, or when nobody has a bölüm yet,
 * one untitled group.
 */
export function groupPeople(data: Workshop, people: Profile[]): { title: string | null; people: Profile[] }[] {
  if (!data.bolumReady || people.every((p) => !p.bolum_id)) return [{ title: null, people }]
  const known = new Set(data.bolumler.map((b) => b.id))
  const top = data.ready ? people.filter((p) => p.panel === 'ceo') : []
  const rest = people.filter((p) => !top.includes(p))
  return [
    { title: 'Genel Müdür ve IT', people: top },
    ...data.bolumler.map((b) => ({ title: b.name, people: rest.filter((p) => p.bolum_id === b.id) })),
    { title: 'Bölüm seçilmedi', people: rest.filter((p) => !p.bolum_id || !known.has(p.bolum_id)) },
  ].filter((g) => g.people.length > 0)
}

/** Genel Müdür, IT, Bölüm Sorumluları and Tasarım: they manage project files and open old versions. */
export function canManageFiles(data: Workshop, me: Profile): boolean {
  return canManage(me.panel) || data.bolumKod(me.bolum_id) === 'tasarim'
}

/** Who may move a request along: the managers, Satın alma for material, Tasarım for drawings. */
export function canHandleTalep(data: Workshop, me: Profile, talep: Pick<Talep, 'kind'>): boolean {
  if (canManage(me.panel)) return true
  const kod = data.bolumKod(me.bolum_id)
  return talep.kind === 'malzeme' ? kod === 'satinalma' : kod === 'tasarim'
}

export const isOpen = (t: Pick<Talep, 'status'>) => t.status === 'acik' || t.status === 'siparis'

export const TALEP_STATUS_LABEL: Record<TalepStatus, string> = {
  acik: 'Açık',
  siparis: 'Sipariş verildi',
  geldi: 'Geldi',
  cozuldu: 'Düzeltildi',
}

export type TalepActionName = 'ilgilen' | 'siparis' | 'geldi' | 'cozuldu'

export function talepAction(id: string, action: TalepActionName) {
  return supabase.rpc('talep_action', { p_id: id, p_action: action })
}

/**
 * Reports a problem on a step. After 0008, "Malzeme eksik" and "Çizim hatalı"
 * also open a request; before it, only the step changes.
 */
export function reportProblem(
  data: Workshop,
  stepId: string,
  reason: string,
  note: string,
  material?: string,
  quantity?: string,
) {
  if (!data.ready) return stepAction(stepId, 'problem', reason, note)
  return supabase.rpc('sorun_bildir', {
    p_step_id: stepId,
    p_reason: reason,
    p_note: note || null,
    p_material: material || null,
    p_quantity: quantity || null,
  })
}

// ---- Dates and status, shared by every screen ----

const DAY = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' })
const DAY_YEAR = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
const MOMENT = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** A stored date ("2026-10-24") as a local calendar day, never shifted by time zone. */
export function parseDay(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function formatDay(value: string | null): string {
  if (!value) return ''
  const date = parseDay(value)
  return (date.getFullYear() === new Date().getFullYear() ? DAY : DAY_YEAR).format(date)
}

export function formatMoment(value: string | null): string {
  return value ? MOMENT.format(new Date(value)) : ''
}

/** Late means the due day has passed and the step is not finished. */
export function isLate(step: Pick<Step, 'due_date' | 'status'>): boolean {
  return step.status !== 'done' && !!step.due_date && step.due_date.slice(0, 10) < today()
}

export type Shown = 'done' | 'problem' | 'review' | 'late' | 'active' | 'waiting'

/** What a step is shown as. A problem outranks lateness; lateness outranks the rest. */
export function shownStatus(step: Pick<Step, 'due_date' | 'status'>): Shown {
  if (step.status === 'done') return 'done'
  if (step.status === 'problem') return 'problem'
  if (step.status === 'review') return 'review'
  if (isLate(step)) return 'late'
  return step.status
}

export const SHOWN_LABEL: Record<Shown, string> = {
  done: 'Bitti',
  problem: 'Sorun bildirildi',
  review: 'Onay bekliyor',
  late: 'Gecikti',
  active: 'Devam ediyor',
  waiting: 'Bekliyor',
}

export const PROBLEM_REASONS = ['Malzeme eksik', 'Çizim hatalı', 'Makine arızası', 'Başka bir sorun']

/** A project is finished when it has steps and all of them are done. */
export function isFinished(steps: Step[]): boolean {
  return steps.length > 0 && steps.every((s) => s.status === 'done')
}

/** Calls the one function that changes a step's status (see the stage 2 migration). */
export type StepActionName = 'start' | 'finish' | 'problem' | 'approve' | 'reject' | 'reopen' | 'reset'

export function stepAction(stepId: string, action: StepActionName, reason?: string, note?: string) {
  return supabase.rpc('step_action', {
    p_step_id: stepId,
    p_action: action,
    p_reason: reason ?? null,
    p_note: note ?? null,
  })
}
