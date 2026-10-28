import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { MusteriRaporu as Rapor } from '../../shared/rapor'
import { MusteriRaporuBelgesi } from '../components/Rapor'
import { ErrorNote, Field, Icon } from '../components/ui'
import { callApi } from '../lib/api'
import { friendly } from '../lib/errors'
import { t } from '../lib/i18n'

/**
 * "Proje raporu sorgula": a customer types the code they were given and sees
 * their project's report. Open to everyone; Felix's server checks the code.
 * The code can also come in the address (/rapor?kod=AF-26-014-K7PX).
 */
export function MusteriRaporu() {
  const [params, setParams] = useSearchParams()
  const [kod, setKod] = useState(params.get('kod') ?? '')
  const [rapor, setRapor] = useState<Rapor | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sorgula(value: string) {
    if (busy || !value.trim()) return
    setBusy(true)
    setError(null)
    try {
      const reply = await callApi('/api/rapor', 'POST', { kod: value.trim() })
      setRapor(reply.rapor as Rapor)
    } catch (e) {
      setError(friendly(e))
    }
    setBusy(false)
  }

  useEffect(() => {
    const fromLink = params.get('kod')
    if (fromLink) {
      setParams({}, { replace: true })
      void sorgula(fromLink)
    }
    // Only once, for a code that came in the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!rapor) return
    const before = document.title
    document.title = [rapor.kod, rapor.ad, t('Proje raporu')].filter(Boolean).join(' - ')
    return () => {
      document.title = before
    }
  }, [rapor])

  function submit(e: FormEvent) {
    e.preventDefault()
    void sorgula(kod)
  }

  const again = (
    <button
      type="button"
      className="btn btn-quiet press"
      onClick={() => {
        setRapor(null)
        setKod('')
      }}
    >
      {t('Başka bir kod gir')}
    </button>
  )

  if (rapor?.hazir) {
    return (
      <div className="page report-page public-report">
        <div className="report-bar no-print">
          {again}
          <button type="button" className="btn btn-primary press" onClick={() => window.print()}>
            <Icon name="download" size={18} />
            {t('PDF olarak kaydet')}
          </button>
        </div>
        <MusteriRaporuBelgesi rapor={rapor} />
      </div>
    )
  }

  return (
    <div className="gate">
      <div className="gate-inner">
        <div className="gate-brand">
          <img className="gate-letterhead" src="/aquafelix-logo.png" alt="Aquafelix" width={273} height={52} />
          <h1>{t('Proje raporu')}</h1>
        </div>
        {rapor ? (
          <div className="card stack report-wait" role="status">
            <div className="mono">{rapor.kod}</div>
            <strong>{rapor.ad}</strong>
            <p>{t('Projeniz hazırlanıyor. Bütün işler bitince raporu burada görebilirsiniz.')}</p>
            {again}
          </div>
        ) : (
          <form onSubmit={submit}>
            <Field label={t('Müşteri kodu')} hint={t('Size verilen kodu yazın. Örnek: AF-26-014-K7PX')}>
              {(id) => (
                <input
                  id={id}
                  className="input mono-input"
                  value={kod}
                  onChange={(e) => setKod(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={40}
                  required
                />
              )}
            </Field>
            <ErrorNote>{error}</ErrorNote>
            <button type="submit" className="btn btn-primary btn-big press" disabled={busy}>
              {busy ? t('Aranıyor…') : t('Raporu göster')}
            </button>
          </form>
        )}
        <div className="foot">
          <Link to="/" className="press">
            {t('Giriş sayfasına dön')}
          </Link>
        </div>
      </div>
    </div>
  )
}
