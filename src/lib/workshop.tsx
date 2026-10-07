import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { friendly } from './errors'
import { supabase, type Meslek, type Profile } from './supabase'

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
  name: string
  position: number
  due_date: string | null
  status: StepStatus
  problem_reason: string | null
  problem_note: string | null
  started_at: string | null
  finished_at: string | null
  /** A worker's finish waits for a manager before the step counts as done. */
  needs_approval: boolean
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
export type StepType = NamedItem
export type ProjectTypeStep = { id: string; project_type_id: string; step_type_id: string; position: number }

type Raw = {
  projects: Project[]
  steps: Step[]
  assignees: { step_id: string; user_id: string }[]
  people: Profile[]
  meslekler: Meslek[]
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
  const [projects, steps, assignees, people, meslekler, stepTypes, projectTypes, projectTypeSteps, companies, companyDetails] = await Promise.all([
    supabase.from('projects').select('id, code, name, due_date, project_type_id, company_id, created_at').order('created_at'),
    supabase
      .from('project_steps')
      .select(
        'id, project_id, name, position, due_date, status, problem_reason, problem_note, started_at, finished_at, needs_approval, submitted_at, review_note',
      )
      .order('position'),
    supabase.from('step_assignees').select('step_id, user_id'),
    supabase.from('profiles').select('id, full_name, username, panel, meslek_id, active').order('full_name'),
    supabase.from('meslek_turleri').select('id, name').order('name'),
    supabase.from('step_types').select('id, name').order('name'),
    supabase.from('project_types').select('id, name').order('name'),
    supabase.from('project_type_steps').select('id, project_type_id, step_type_id, position').order('position'),
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('company_details').select('company_id, contact_name, email, phone, address, notes'),
  ])
  const failed = [projects, steps, assignees, people, meslekler, stepTypes, projectTypes, projectTypeSteps, companies, companyDetails].find((r) => r.error)
  if (failed?.error) throw failed.error
  return {
    projects: projects.data as Project[],
    steps: steps.data as Step[],
    assignees: assignees.data as Raw['assignees'],
    people: people.data as Profile[],
    meslekler: meslekler.data as Meslek[],
    stepTypes: stepTypes.data as StepType[],
    projectTypes: projectTypes.data as NamedItem[],
    projectTypeSteps: projectTypeSteps.data as ProjectTypeStep[],
    companies: companies.data as Company[],
    companyDetails: companyDetails.data as CompanyDetails[],
  }
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'tr')

function index(input: Raw): Workshop {
  // The database sorts by raw character codes, which puts Ş, Ç, Ö and İ last.
  const raw: Raw = {
    ...input,
    people: [...input.people].sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')),
    meslekler: [...input.meslekler].sort(byName),
    stepTypes: [...input.stepTypes].sort(byName),
    projectTypes: [...input.projectTypes].sort(byName),
    companies: [...input.companies].sort(byName),
  }
  const people = new Map(raw.people.map((p) => [p.id, p]))
  const projects = new Map(raw.projects.map((p) => [p.id, p]))
  const companies = new Map(raw.companies.map((c) => [c.id, c]))
  const details = new Map(raw.companyDetails.map((d) => [d.company_id, d]))
  const stepTypeName = new Map(raw.stepTypes.map((s) => [s.id, s.name]))
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
