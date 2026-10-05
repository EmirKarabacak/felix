import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary, Spinner } from './components/ui'
import { Shell } from './components/Shell'
import { useAuth } from './lib/auth'
import { canManage, isConfigured, supabase } from './lib/supabase'
import { Ekip } from './pages/Ekip'
import { Login } from './pages/Login'
import { Islerim } from './pages/Islerim'
import { ProjeDetay } from './pages/ProjeDetay'
import { Projeler } from './pages/Projeler'
import { Turler } from './pages/Turler'
import { WorkshopProvider } from './lib/workshop'
import { Setup } from './pages/Setup'

export function App() {
  const { state } = useAuth()

  if (!isConfigured) {
    return (
      <div className="gate">
        <div className="gate-inner">
          <div className="note note-error" role="alert">
            Felix henüz veritabanına bağlanmadı. VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY ayarlarını ekleyip
            siteyi yeniden yayınlayın.
          </div>
        </div>
      </div>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="gate">
        <Spinner />
      </div>
    )
  }

  if (state.status === 'signedOut') return <SignedOut notice={state.notice} />

  const manages = canManage(state.profile.panel)
  return (
    <WorkshopProvider>
      <Shell>
        <ErrorBoundary>
        <Routes>
          <Route path="/projeler" element={<Projeler />} />
          <Route path="/projeler/:id" element={<ProjeDetay />} />
          {manages ? (
            <>
              <Route path="/turler" element={<Turler />} />
              <Route path="/ekip" element={<Ekip />} />
              <Route path="*" element={<Navigate to="/projeler" replace />} />
            </>
          ) : (
            <>
              <Route path="/islerim" element={<Islerim />} />
              <Route path="*" element={<Navigate to="/islerim" replace />} />
            </>
          )}
        </Routes>
        </ErrorBoundary>
      </Shell>
    </WorkshopProvider>
  )
}

/** Explains, in plain words, why the app cannot talk to its database. */
function diagnose(message: string): string {
  if (/has_users|schema cache|PGRST202|does not exist/i.test(message)) {
    return 'Veritabanı henüz kurulmamış: supabase/migrations klasöründeki SQL, Supabase SQL Editor içinde çalıştırılmamış.'
  }
  if (/api key|apikey|jwt|unauthorized|401/i.test(message)) {
    return 'Anahtar hatalı: Vercel ayarlarındaki VITE_SUPABASE_ANON_KEY, Supabase projesindeki anon (publishable) anahtarla aynı olmalı.'
  }
  if (/invalid path/i.test(message)) {
    return 'Veritabanı adresi hatalı: Vercel ayarlarındaki VITE_SUPABASE_URL yalnızca https://....supabase.co biçiminde olmalı.'
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Veritabanına ulaşılamıyor: Vercel ayarlarındaki VITE_SUPABASE_URL hatalı olabilir ya da internet bağlantısı yok.'
  }
  return 'Veritabanı beklenmeyen bir yanıt verdi.'
}

/** Shows first-time setup while Felix has no people at all, and sign-in afterwards. */
function SignedOut({ notice }: { notice: string | null }) {
  const [hasUsers, setHasUsers] = useState<boolean | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setProblem(null)
    setHasUsers(null)
    supabase.rpc('has_users').then(({ data, error }) => {
      if (!alive) return
      // A failed check must be shown, not hidden behind the sign-in form:
      // nobody can sign in while the database is unreachable or not set up.
      if (error) setProblem(error.message || 'Bilinmeyen hata')
      else setHasUsers(Boolean(data))
    })
    return () => {
      alive = false
    }
  }, [attempt])

  if (problem) {
    return (
      <div className="gate">
        <div className="gate-inner">
          <div className="note note-error" role="alert">
            {diagnose(problem)}
          </div>
          <div className="sub">Ayrıntı: {problem}</div>
          <button type="button" className="btn btn-tint btn-big press" onClick={() => setAttempt((n) => n + 1)}>
            Tekrar dene
          </button>
        </div>
      </div>
    )
  }

  if (hasUsers === null) {
    return (
      <div className="gate">
        <Spinner />
      </div>
    )
  }
  return hasUsers ? <Login notice={notice} /> : <Setup onDone={() => setHasUsers(true)} />
}
