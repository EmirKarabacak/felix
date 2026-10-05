import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Spinner } from './components/ui'
import { Shell } from './components/Shell'
import { useAuth } from './lib/auth'
import { canManage, isConfigured, supabase } from './lib/supabase'
import { Ekip } from './pages/Ekip'
import { Login } from './pages/Login'
import { ComingSoon } from './pages/ComingSoon'
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
    <Shell>
      <Routes>
        {manages ? (
          <>
            <Route path="/projeler" element={<ComingSoon title="Projeler" />} />
            <Route path="/ekip" element={<Ekip />} />
            <Route path="*" element={<Navigate to="/ekip" replace />} />
          </>
        ) : (
          <>
            <Route path="/islerim" element={<ComingSoon title="İşlerim" />} />
            <Route path="/projeler" element={<ComingSoon title="Projeler" />} />
            <Route path="*" element={<Navigate to="/islerim" replace />} />
          </>
        )}
      </Routes>
    </Shell>
  )
}

/** Shows first-time setup while Felix has no people at all, and sign-in afterwards. */
function SignedOut({ notice }: { notice: string | null }) {
  const [hasUsers, setHasUsers] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    supabase.rpc('has_users').then(({ data, error }) => {
      // If the check itself fails, show sign-in; its own errors explain the problem.
      if (alive) setHasUsers(error ? true : Boolean(data))
    })
    return () => {
      alive = false
    }
  }, [])

  if (hasUsers === null) {
    return (
      <div className="gate">
        <Spinner />
      </div>
    )
  }
  return hasUsers ? <Login notice={notice} /> : <Setup onDone={() => setHasUsers(true)} />
}
