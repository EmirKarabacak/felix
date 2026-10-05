import { useState, type FormEvent } from 'react'
import { ErrorNote, Field, Icon } from '../components/ui'
import { callApi } from '../lib/api'
import { friendly } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { MIN_PASSWORD_LENGTH, isValidUsername, normalizeUsername, usernameToEmail } from '../../shared/username'

/** First run only: creates the CEO account. Disappears once anyone exists. */
export function Setup({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!isValidUsername(username)) {
      setError('Kullanıcı adı en az 3 karakter olmalı.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await callApi('/api/setup', 'POST', { code, full_name: fullName, username, password })
      const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password })
      if (error) onDone() // account exists; fall back to the sign-in screen
    } catch (err) {
      setError(friendly(err))
      setBusy(false)
    }
  }

  return (
    <div className="gate">
      <div className="gate-inner">
        <div className="gate-brand">
          <div className="gate-logo">
            <Icon name="drop" size={38} />
          </div>
          <h1>Felix'i kur</h1>
          <div className="sub">İlk hesap CEO hesabıdır. Diğer herkesi bu hesapla eklersiniz.</div>
        </div>
        <form onSubmit={submit}>
          <Field label="Kurulum kodu" hint="Yayın ayarlarında FELIX_SETUP_CODE olarak belirlediğiniz ifade.">
            {(id) => (
              <input
                id={id}
                className="input"
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                required
              />
            )}
          </Field>
          <Field label="Ad soyad">
            {(id) => (
              <input
                id={id}
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
            )}
          </Field>
          <Field label="Kullanıcı adı">
            {(id) => (
              <input
                id={id}
                className="input"
                value={username}
                onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            )}
          </Field>
          <Field label="Şifre" hint={`En az ${MIN_PASSWORD_LENGTH} karakter.`}>
            {(id) => (
              <input
                id={id}
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            )}
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <button type="submit" className="btn btn-primary btn-big press" disabled={busy}>
            {busy ? 'Oluşturuluyor…' : 'CEO hesabını oluştur'}
          </button>
        </form>
      </div>
    </div>
  )
}
