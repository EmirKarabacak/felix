# Felix

Workshop job tracking for Arı Arıtım. A web app that runs in any browser on
desktop, iOS and Android.

## What is built

**Stage 1 (done):** sign-in, the three panels (CEO, Yönetici, İşçi), the Ekip
page (add, edit and remove people, CEO only for add/remove), Meslek Türleri.

Still to come: project types, projects and steps, assigning, start/finish,
problems (stage 2); project chat, notifications, time tracking, history,
workload view (stage 3).

## How it is put together

| Part | Where | Notes |
| --- | --- | --- |
| Screens | `src/` | React + TypeScript, built with Vite |
| Server endpoints | `api/` | Run on Vercel. Create/remove people, first-time setup |
| Database | `supabase/migrations/` | Postgres on Supabase. Access rules live here |
| Shared helpers | `shared/` | Username rules used by screens and server |

Who may see or change what is enforced in the database (row level security),
not in the screens. The service-role key exists only on the server.

## Putting it online (first time)

1. **Supabase:** create a project. Open SQL Editor and run every file in
   `supabase/migrations/` in order.
2. **Vercel:** import this repository. Add the four settings from
   `.env.example` under Environment Variables, then deploy.
3. Open the site. The first visit shows "Felix'i kur": enter the setup code
   you chose and create the CEO account. Everyone else is added from Ekip.

## Testing

```
./supabase/tests/run.sh          # access rules, on a throwaway local Postgres
scripts/local-reset.sh           # local stand-in for Supabase (prints ANON_KEY)
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<key> \
  FELIX_API_PROXY=http://127.0.0.1:54321 npx vite
node scripts/e2e-stage1.mjs      # full browser run of stage 1
```

The local stand-in (`scripts/local-stack.ts`) is for testing only. It mimics
the parts of Supabase the app uses and runs every request against a real
Postgres with the real access rules.
