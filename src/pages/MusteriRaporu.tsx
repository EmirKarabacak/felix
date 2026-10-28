import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { MusteriRaporu as Rapor } from '../../shared/rapor'
import { PdfKaydet, PdfOnizleme, useRaporPdf } from '../components/Rapor'
import { ErrorNote, Field, Icon } from '../components/ui'
import { callApi } from '../lib/api'
import { formatSize } from '../lib/dosyalar'
import { friendly } from '../lib/errors'
import { t } from '../lib/i18n'
import { musteriRaporuBelgesi } from '../lib/pdf'

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

  const belge = useMemo(() => (rapor?.hazir ? musteriRaporuBelgesi(rapor) : null), [rapor])
  const pdf = useRaporPdf(belge)

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
    const files = rapor.dosyalar.filter((d) => !d.foto)
    return (
      <div className="page report-page public-report">
        <div className="report-bar">
          {again}
          <PdfKaydet pdf={pdf} />
        </div>
        {files.length ? (
          <section className="stack" aria-label={t('Belgeler')}>
            <div className="field-label">{t('Belgeler')}</div>
            <div className="card rows file-list">
              {files.map((d) => (
                <div key={d.id} className="file-row">
                  <a href={d.indir} className="file-open press" aria-label={t('{name} indir', { name: d.ad })}>
                    <span className="file-icon">
                      <Icon name="doc" size={22} />
                    </span>
                    <span className="file-text">
                      <span className="file-name">{d.ad}</span>
                      <span className="sub">{formatSize(d.boyut)}</span>
                    </span>
                    <span className="file-go">
                      <Icon name="download" size={18} />
                    </span>
                  </a>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <PdfOnizleme pdf={pdf} />
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
