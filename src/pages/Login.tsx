import { useState, type FormEvent } from 'react'
import { ErrorNote, Field, Icon } from '../components/ui'
import { friendly } from '../lib/errors'
import { rememberMe, supabase } from '../lib/supabase'
import { loginIdToEmail } from '../../shared/username'

export function Login({ notice }: { notice: string | null }) {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(rememberMe.get)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(notice)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    rememberMe.set(remember) // must be decided before the sign-in is stored
    const { error } = await supabase.auth.signInWithPassword({
      email: loginIdToEmail(loginId),
      password,
    })
    if (error) {
      setError(friendly(error))
      setBusy(false)
    }
    // On success the auth listener swaps this screen for the app.
  }

  return (
    <div className="gate">
      <div className="gate-inner">
        <div className="gate-brand">
          <div className="gate-logo">
            <Icon name="drop" size={38} />
          </div>
          <h1>Felix</h1>
          <div className="sub">Atölye iş takibi</div>
        </div>
        <form onSubmit={submit}>
          <Field label="Kullanıcı adı">
            {(id) => (
              <input
                id={id}
                className="input"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            )}
          </Field>
          <Field label="Şifre">
            {(id) => (
              <input
                id={id}
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            )}
          </Field>
          <label className="switch-row">
            <span>
              Beni hatırla
              <span className="hint">Kapalıysa tarayıcı kapanınca çıkış yapılır.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
          </label>
          <ErrorNote>{error}</ErrorNote>
          <button type="submit" className="btn btn-primary btn-big press" disabled={busy}>
            {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
        </form>
        <div className="foot">
          Hesabınız yok mu veya şifrenizi mi unuttunuz? Yöneticinize söyleyin, hesapları yönetici oluşturur.
        </div>
      </div>
    </div>
  )
}
