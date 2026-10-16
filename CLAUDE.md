# Felix: notes for whoever continues this project

Read this first. It is the handover from the session that built Felix, so a new
session can carry on without the original conversation.

## What Felix is

A web app for the workshop of Arı Arıtım (water treatment systems
manufacturer, Istanbul). Managers turn customer orders into projects made of
steps, assign workers to steps, and follow progress; workers see their jobs on
their phones and press start / finish / report a problem.

- Owner: Emir (Mehmet Emir Karabacak). He is not a developer: explain in plain
  words, give click-by-click steps for anything he must do, ask before big
  decisions, and keep the conversation in English.
- The app's interface is in Turkish.
- About 25 users, mixed iPhone and Android, which is why it is a web app (no
  app store) that can be added to the home screen.

## Decisions already made (do not reopen without asking Emir)

- Three panels. CEO: everything. Yönetici (manager): same as CEO except adding
  or removing people. İşçi (worker): own jobs plus every project read-only.
- Accounts are created by the CEO only, with username + password (no e-mail
  needed). Login form has "Beni hatırla" (on by default).
- Removing a person deactivates them (name stays on past work), frees the
  username, and takes them off unfinished steps. There must always be one CEO.
- Project types fill a new project's steps; steps can be added, removed and
  reordered afterwards. Step types, project types and meslek türleri are lists
  the CEO and managers edit in the app.
- A step can have several people. Any step can be started at any time (no
  enforced order). One assignee pressing finish finishes it for everyone.
- Approval: chosen per step when the project is created ("Onay gerekir" switches
  in the new-project form), changeable on a single step later. A worker's
  finish then waits ("Onay bekliyor") until a manager approves or sends it back
  with a required note. A manager's own finish needs no approval. The finish
  time is the worker's hand-in time.
- Companies (Firmalar): name visible to everyone; contact details (person,
  phone, e-mail, address, note) visible to CEO and managers only, enforced in
  the database. Deleting a company keeps its projects.
- Projeler has two views: Liste (cards) and Takvim (projects as bars from
  opening to delivery date, step due dates as dots, line for today).
- Bölümler (departments): Üretim, Tasarım, Satın alma, Muhasebe, a fixed list
  because each one gets its own screens. Üretim has atölyeler (workshops,
  editable list, e.g. Elektrik / Kaynak atölyesi). The panel stays the rank;
  the bölüm decides which version of the app someone sees. CEO and managers
  set someone's bölüm. One bölüm per person for now: Emir asked to be reminded
  later that people may need several.
- Agreed next, in order: Çizimler (design uploads a PDF to view plus the
  original AutoCAD/SolidWorks file; originals only for CEO, managers, Tasarım;
  a worker sees a project's PDF only while assigned to a step on it, with their
  name printed on it, no download; each upload a new revision), then Talepler
  ("Sorun bildir → Malzeme eksik" with typed material and quantity goes to Satın
  alma: needed, ordered, arrived; "Çizim hatalı" goes to Tasarım). Muhasebe is
  parked; Emir wants only the CEO to see invoices and payments, as two sections.
- Chat, when built, goes on projects (one conversation per project), visible to
  workers too. The "Sorun bildir" button stays and should also post into the
  project chat.

## Design language

Apple-style, as Emir asked (he pointed at the "apple-design" skill and at
SwiftUI's ConcentricRectangle):
- System font, large tight titles, weight for hierarchy, size-specific
  letter-spacing.
- Light grey background, white rounded cards with soft shadows, one blue accent.
- Translucent (frosted) top bar and phone tab bar; bottom sheets on phones,
  centred panels on desktop, with a dimmed background.
- Press feedback on pointer-down (`.press`), reduced-motion / reduced-
  transparency / high-contrast fallbacks.
- Concentric corners: an inner radius is the outer radius minus the gap, with a
  minimum (see the top of `src/styles.css`).
- Icons are drawn in `src/components/ui.tsx` as one family; tab icons have a
  filled form for the current tab. SF Symbols themselves cannot be used (their
  licence is for Apple platforms only).
- Touch targets at least 44px; inputs 16px so iOS does not zoom.

## How it is built and run

| Part | Where | Notes |
| --- | --- | --- |
| Screens | `src/` | React + TypeScript + Vite |
| Server endpoints | `api/` | Vercel functions: first-time setup, add/reset/remove people (service-role key, CEO only) |
| Database | `supabase/migrations/` | Postgres on Supabase; access rules (RLS) and all status changes (`step_action`) live here |
| Shared | `shared/` | Username rules used by both sides |

- Code: GitHub `EmirKarabacak/felix` (private). Pushing to `main` deploys to
  Vercel automatically.
- Hosting: Vercel (free address, no domain yet). Settings there:
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `FELIX_SETUP_CODE`.
- Database changes: Emir runs each new file in `supabase/migrations/` himself,
  in the Supabase SQL Editor (copy from GitHub, paste, Run). So every migration
  must be safe to run more than once and must also work as one transaction.
  Push the front end so it still works before he has run the new file, and tell
  him clearly which file to run. He has run 0001 to 0005; 0006_bolumler.sql is new.
  `src/lib/supabase.ts` `fetchProfiles` shows the pattern for working before a
  migration has run (fall back, hide the feature).
- Data loads in `src/lib/workshop.tsx` (one provider, refreshes every 30 s and
  when the app comes back into view).

## Testing

The build machine could not reach Supabase, so tests run against a local
stand-in (`scripts/local-stack.ts`: real Postgres with the real migrations and
access rules, plus just enough of Supabase's auth and data API).

```
./supabase/tests/run.sh                                 # database access rules (164 checks)
scripts/local-up.sh && node scripts/e2e-stage1.mjs      # sign-in, panels, Ekip (30)
scripts/local-up.sh && node scripts/e2e-stage2.mjs      # projects, steps, workers (47)
scripts/local-up.sh && node scripts/e2e-companies.mjs   # Firmalar (22)
scripts/local-up.sh && node scripts/e2e-approval.mjs    # approval, Takvim (32)
FELIX_MIGRATIONS_UNTIL=0005 scripts/local-up.sh && node scripts/e2e-bolumler.mjs  # bölümler, runs 0006 mid-test (22)
```

Run them all before pushing, and check that each one actually printed "ALL ...
PASSED" (a loop that only shows the last line can hide a failed run). Look at
the screenshots, desktop and phone width.

## Status and what is next

Done: sign-in and panels, Ekip and meslek türleri, Türler (project and step
types), projects with steps and assigning, start / finish / problems,
approval, Firmalar, Takvim, keyboard handling on phones, icons, bölümler and
atölyeler (Ekip grouped by bölüm, assign list grouped by workshop).

Agreed but not built yet (stage 3):
- Chat on each project.
- Notifications: a bell in the app plus phone alerts (web push; iPhones need
  Felix added to the home screen first).
- Drawings and photos on steps (Supabase Storage).
- Time and history view per step (the data is already recorded in
  `step_events`, `started_at`, `finished_at`).
- Workload view: what each worker has this week.

Open questions to Emir:
- Should each project type remember the usual "Onay gerekir" choices so the
  new-project form comes pre-set?
- Does Takvim need a zoomed-out option to show more months?

Ideas discussed, not agreed: duplicate a project, planned durations per step
type (fill due dates from the delivery date), files on a project, checklists
inside a step, materials per step, Excel export, dashboard.
