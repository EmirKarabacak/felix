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

- Four roles (0008). Genel Müdür (the owner) and IT (Emir) both have every
  right; in the database both are panel 'ceo' and `profiles.unvan` says which
  ('genel_mudur' / 'it'), because a new enum value cannot be used in the same
  transaction. There must always be one active Genel Müdür and, once one
  exists, one active IT. Bölüm Sorumlusu (panel 'manager', formerly Yönetici,
  same rights as before: everything except adding/removing people and changing
  usernames). Personel (panel 'worker'; "İşçi" was felt to be rude): own jobs
  plus every project read-only. Tabs: Genel Müdür/IT Projeler / Ekip / Ayarlar;
  Bölüm Sorumlusu İşlerim / Projeler / Ekip / Ayarlar; Personel İşlerim /
  Projeler / Ayarlar. Emir wants proposed names shown to him before use.
- Bölümler are a fixed list of four (0008, `bolumler.kod`): Satın alma,
  Tasarım, İmalat, Muhasebe. Nobody edits it in the app. Genel Müdür and IT
  have no bölüm; a Bölüm Sorumlusu picks only the bölüm they lead (no uzmanlık,
  no level); Personel pick a bölüm. One bölüm per person for now: Emir asked to
  be reminded later that people may need several.
- Uzmanlık (only in İmalat): an editable list (Ayarlar > Uzmanlıklar, table
  `uzmanliklar`), started with only Kaynakçı and Elektrikçi. A Personel in
  İmalat can have several, each with its own hidden level Usta / Kalfa / Çırak
  (`kisi_uzmanliklari`, new ticks start at Kalfa). Levels are visible only to
  Genel Müdür, IT and Bölüm Sorumluları, enforced in the database; Personel
  never see anyone's level, not even their own (Emir found visible titles rude).
- Each step type has a suggested uzmanlık (Türler). The assign list puts people
  with that uzmanlık first, best level first.
- Approval rule (0008, in `step_action`): the finisher's level in the step's
  uzmanlık decides. Usta: done at once. Otherwise "Onay bekliyor" until a Bölüm
  Sorumlusu/Genel Müdür/IT approves or sends it back with a required note.
  Personel outside İmalat, without that uzmanlık, or on a step with no
  uzmanlık ALWAYS wait. Genel Müdür, IT and Bölüm Sorumluları never wait. The
  finish time is the worker's hand-in time. The Turkish rule text Emir approved
  is `ONAY_KURALI` in `src/lib/supabase.ts`.
- Genel Müdür and IT change usernames (anyone's, including their own) through
  `PATCH /api/users`, which also moves the sign-in e-mail, and add or remove
  people (accounts are username + password, no e-mail). Login form has "Beni
  hatırla" (on by default).
- Ayarlar (gear tab) for everyone: account, password, Beni hatırla, home-screen
  guide, sign out. Genel Müdür, IT and Bölüm Sorumluları also find the lists
  there: Firmalar, Türler, Uzmanlıklar.
- Removing a person deactivates them (name stays on past work), frees the
  username, and takes them off unfinished steps.
- Project types fill a new project's steps; steps can be added, removed and
  reordered afterwards.
- A step can have several people. Any step can be started at any time (no
  enforced order). One assignee pressing finish finishes it for everyone.
- Companies (Firmalar): name visible to everyone; contact details visible to
  Genel Müdür, IT and Bölüm Sorumluları only, enforced in the database.
  Deleting a company keeps its projects.
- Projeler has two views: Liste (cards) and Takvim (projects as bars from
  opening to delivery date, step due dates as dots, line for today).
- Talepler (0008, `talepler`, functions `sorun_bildir` and `talep_action`):
  "Sorun bildir → Malzeme eksik" asks for the material (required) and quantity
  and opens a request for all Bölüm Sorumluları and Satın alma; states Açık →
  Sipariş verildi → Geldi. "Çizim hatalı" opens one for Tasarım (→ Düzeltildi).
  Anyone who can handle one presses "Ben ilgileniyorum" and everyone sees "X
  ilgileniyor". Shown in İşlerim (to handlers, and to the reporter until a week
  after it closes), in an "Açık talepler" box on Projeler and as a mark on the
  step. The step itself stays "Sorun bildirildi" until someone presses "Sorun
  çözüldü, devam et".
- Dosyalar (0008, replaces the earlier locked-down Çizimler plan; Emir: "dont
  focus on the safety just yet"). Each project has one Ana doküman plus any
  number of project files (certificates...); each step has its own files.
  Project files: only Genel Müdür, IT, Bölüm Sorumluları and Tasarım add,
  replace or delete. Step files: everyone adds, those four groups delete.
  Everyone downloads current files. Re-uploading a name works like the Mac:
  "plan (2).pdf" becomes current and the earlier one goes to Eski sürümler,
  which only those four groups open. Deleting moves to Eski sürümler too;
  nothing is erased. Files are in the private Storage bucket `dosyalar` under
  `p/<project>/<uuid>` or `s/<step>/<uuid>`; names live in table `dosyalar`.
- Felix reloads itself when a new version is deployed (`src/lib/update.ts`,
  `/version.json` written by `vite.config.ts`).
- Muhasebe is parked; Emir wants only the Genel Müdür to see invoices and
  payments, as two sections. The Genel Müdür phone summary became Özet.
- Language and theme (Update 1): Ayarlar > "Dil ve görünüm" has Dil (Türkçe /
  English) and Tema (Sistem / Açık / Koyu). Each person's own choice, kept on
  the device (localStorage `felix.lang`, `felix.theme`); defaults Türkçe and
  Sistem (follows the phone). Turkish wording was reviewed with Emir string by
  string: e.g. "Kişiyi çıkar", "Atanan kişiler", "Onay bekleniyor.", "Firma"
  (not Müşteri), "Proje türleri" / "Adım türleri". In English Kalfa is
  "Skilled", Usta "Master", Çırak "Apprentice", Bölüm Sorumlusu "Department
  Head", Personel "Staff".
- Finish photo (Update 2, 0009): pressing "İşi bitir" opens the camera
  (`capture="environment"`; a computer offers its files) and the step finishes
  only once a photo is taken, for EVERYONE, Genel Müdür and IT included (Emir
  changed this from "everyone but them"). The photo is shrunk in the browser
  (1600 px JPEG), saved as an ordinary step file "Bitiş fotoğrafı <time>.jpg",
  and `step_action(..., p_photo_path)` checks it is a new image this person
  just added to this step. `project_steps.finish_photo_id` is the latest
  hand-in's photo, shown to the approver; `step_events.dosya_id` keeps each
  finish's photo in the history.
- Step history (Update 2): "Geçmiş (n)" at the bottom of the step window,
  closed at first, read from `step_events`, oldest first, with photos.
- Özet (Update 2): a tab for Genel Müdür and IT only, after Projeler (they
  still start on Projeler, "keep everything same"): late projects (past their
  delivery date), open problems, jobs awaiting approval, open requests, jobs
  finished this week (from Monday).
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

## Texts and languages

- Every text on screen goes through `t()` from `src/lib/i18n.tsx`, written in
  Turkish: `t('Projeyi oluştur')`, `t('{n} adım', { n })`. The English is in
  `src/lib/en/*.ts`, keyed by that Turkish text; a missing entry shows the
  Turkish. A count uses the var `n` and its English can be `{ one, other }`.
- When one Turkish word means two things, add `|note` to the key
  (`t('Açık|tema')` = Light, `t('Açık')` = Open); the note is never shown.
- Messages that come from the database or `api/` also go through `t()` (in
  `friendly()`); `TR_FIX` in i18n.tsx rewords a database message without a
  migration.
- Never call `t()` at module top level (the language is read at call time;
  changing it remounts the app). Never pass a template literal to `t()`.
- `npx tsx scripts/check-i18n.ts` fails on a `t()` text with no English, on
  server/database messages with no English, and on Turkish left outside
  `t()`. A line that must stay Turkish (e.g. "Türkçe" itself) ends with
  `// i18n-ok`.
- Dark theme: colours are tokens at the top of `src/styles.css`, redefined for
  `[data-theme='dark']` and for Sistem on a dark phone. Never write a colour
  outside the tokens. `index.html` applies the saved theme before the app
  loads so dark never flashes white.

## How it is built and run

| Part | Where | Notes |
| --- | --- | --- |
| Screens | `src/` | React + TypeScript + Vite |
| Server endpoints | `api/` | Vercel functions: first-time setup, add/reset/remove people (service-role key, Genel Müdür and IT only) |
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
  him clearly which file to run. He has run 0001 to 0008
  (0008 also created the Storage bucket and its access rules);
  0009_bitis_fotografi.sql is new (finish photo). Before it runs, finishing
  needs no photo (`photoReady` in `workshop.tsx`). The Supabase
  connector can be tried for running a migration; it timed out once, so the
  fallback is Emir pasting it.
  `src/lib/supabase.ts` `fetchProfiles` shows the pattern for working before a
  migration has run (fall back, hide the feature).
- Data loads in `src/lib/workshop.tsx` (one provider, refreshes every 30 s and
  when the app comes back into view).

## Testing

The build machine could not reach Supabase, so tests run against a local
stand-in (`scripts/local-stack.ts`: real Postgres with the real migrations and
access rules, plus just enough of Supabase's auth, data and storage API).

```
./supabase/tests/run.sh                                 # database access rules
scripts/local-up.sh && node scripts/e2e-stage1.mjs      # sign-in, roles, Ekip, uzmanlık, usernames, Ayarlar (47)
scripts/local-up.sh && node scripts/e2e-stage2.mjs      # projects, steps, workers (49)
scripts/local-up.sh && node scripts/e2e-companies.mjs   # Firmalar (23)
scripts/local-up.sh && node scripts/e2e-approval.mjs    # approval by uzmanlık level, Takvim (31)
FELIX_MIGRATIONS_UNTIL=0007 scripts/local-up.sh && node scripts/e2e-0008.mjs  # runs 0008 mid-test; Uzmanlık, Talepler, Dosyalar (42)
FELIX_MIGRATIONS_UNTIL=0008 scripts/local-up.sh && node scripts/e2e-update2.mjs  # runs 0009 mid-test; finish photo, history, Özet (30)
scripts/local-up.sh && node scripts/e2e-language.mjs    # English, dark theme, Ayarlar switches, Ekip labels (25)
npx tsc --noEmit && npx tsx scripts/check-i18n.ts       # types, and every text has English
```

Run them all before pushing, and check that each one actually printed "ALL ...
PASSED" (a loop that only shows the last line can hide a failed run). Look at
the screenshots, desktop and phone width. The e2e suites "take" the finish
photo from `scripts/e2e-photo.mjs` whenever Felix opens the camera; database
tests use `pg_temp.photo(step)`.

## Status and what is next

Done: sign-in and roles (Genel Müdür, IT, Bölüm Sorumlusu, Personel), Ekip,
Türler (project and step types, with a suggested uzmanlık), projects with steps
and assigning, start / finish / problems, approval by uzmanlık level, Firmalar,
Takvim, keyboard handling on phones, icons, the four fixed bölümler, Uzmanlık,
Talepler, Dosyalar (project and step files with Eski sürümler), self-reload on
a new version, İşlerim for managers, Ayarlar, English version, dark theme
(Update 1), finish photo, step history, Özet (Update 2).

Agreed order of the next updates; each goes to Emir before going live and
starts only when he says go:
- Update 3: chat on each project, seen by everyone; "Sorun bildir" also posts
  into it.
- Update 4: notifications, a bell plus phone alerts (web push; iPhones need
  Felix on the home screen): assigned, sent back, awaiting your approval, new
  request for your bölüm, your material arrived, new chat message.
- Not wanted: weekly workload view. Not chosen yet: quality checklist, planned
  durations per step type, copy a project, customer PDF, QR label, Kılavuz
  (manuals per bölüm).

Open questions to Emir:
- Does Takvim need a zoomed-out option to show more months?

Ideas discussed, not agreed: materials per step, Excel export.
