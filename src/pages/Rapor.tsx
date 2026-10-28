import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { MusteriRaporu } from '../../shared/rapor'
import { IcRapor, MusteriRaporuBelgesi } from '../components/Rapor'
import { Photo } from '../components/StepHistory'
import { ErrorNote, Icon, Spinner, Switch } from '../components/ui'
import { callApi } from '../lib/api'
import { friendly } from '../lib/errors'
import { t } from '../lib/i18n'
import { projeRaporu, type Olay } from '../lib/rapor'
import { dosyaMusteriye, fetchProjectEvents, useWorkshop, type Dosya, type Project, type Workshop } from '../lib/workshop'
import { CopyButton } from './ProjeDetay'

type Gorunum = 'ic' | 'musteri'

/** The report of one project: İç rapor and Müşteri raporu, ready to save as PDF. */
export function Rapor() {
  const { id = '' } = useParams()
  const { data, error } = useWorkshop()
  const [gorunum, setGorunum] = useState<Gorunum>('ic')
  const project = data?.project(id)

  // The saved PDF is named after the project.
  useEffect(() => {
    if (!project) return
    const before = document.title
    document.title = [project.code, project.name, t('Proje raporu')].filter(Boolean).join(' - ')
    return () => {
      document.title = before
    }
  }, [project])

  const back = (
    <Link to={`/projeler/${id}`} className="back press no-print">
      <Icon name="back" size={20} />
      {project?.name ?? t('Projeler')}
    </Link>
  )
  if (!data) {
    return (
      <div className="page">
        {back}
        {error ? <ErrorNote>{error}</ErrorNote> : <Spinner />}
      </div>
    )
  }
  if (!project) {
    return (
      <div className="page">
        {back}
        <div className="card empty">{t('Bu proje bulunamadı. Silinmiş olabilir.')}</div>
      </div>
    )
  }

  return (
    <div className="page report-page">
      {back}
      <div className="report-bar no-print">
        <div className="segmented narrow" role="group" aria-label={t('Rapor')}>
          <button type="button" className="press" aria-pressed={gorunum === 'ic'} onClick={() => setGorunum('ic')}>
            {t('İç rapor')}
          </button>
          <button type="button" className="press" aria-pressed={gorunum === 'musteri'} onClick={() => setGorunum('musteri')}>
            {t('Müşteri raporu')}
          </button>
        </div>
        <button type="button" className="btn btn-primary press" onClick={() => window.print()}>
          <Icon name="download" size={18} />
          {t('PDF olarak kaydet')}
        </button>
      </div>
      {gorunum === 'ic' ? <IcRaporu project={project} data={data} /> : <MusteriTarafi project={project} data={data} />}
    </div>
  )
}

function IcRaporu({ project, data }: { project: Project; data: Workshop }) {
  const [olaylar, setOlaylar] = useState<Olay[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Read again when a step of this project changes.
  const changed = data
    .stepsOf(project.id)
    .map((s) => `${s.status}${s.finished_at}`)
    .join()
  useEffect(() => {
    let alive = true
    void fetchProjectEvents(project.id, data.photoReady).then(({ events, error }) => {
      if (!alive) return
      setOlaylar(events)
      setError(error ? friendly(error) : null)
    })
    return () => {
      alive = false
    }
  }, [project.id, data.photoReady, changed])
  const rapor = useMemo(() => (olaylar ? projeRaporu(data, project, olaylar) : null), [data, project, olaylar])
  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!rapor) return <Spinner />
  return <IcRapor rapor={rapor} data={data} />
}

/** The customer's version as they will see it, with the choice of photos and files above it. */
function MusteriTarafi({ project, data }: { project: Project; data: Workshop }) {
  const kod = data.musteriKodu(project.id)
  const [rapor, setRapor] = useState<MusteriRaporu | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ticks = data.dosyalar
    .filter((d) => d.project_id === project.id && d.musteriye)
    .map((d) => d.id)
    .join()
  const done = data.stepsOf(project.id).every((s) => s.status === 'done')

  // The same request the customer's page makes, so this is exactly what they get.
  useEffect(() => {
    if (!kod) return
    let alive = true
    void callApi('/api/rapor', 'POST', { kod })
      .then((reply) => {
        if (!alive) return
        setRapor(reply.rapor as MusteriRaporu)
        setError(null)
      })
      .catch((e) => {
        if (alive) setError(friendly(e))
      })
    return () => {
      alive = false
    }
  }, [kod, ticks, done, project.teslim_at])

  return (
    <>
      <section className="card stack report-choice no-print" aria-label={t('Müşteriye gösterilecekler')}>
        {kod ? (
          <div className="code-row">
            <span>
              <span className="field-label">{t('Müşteri kodu')}</span>
              <span className="mono code-value">{kod}</span>
            </span>
            <CopyButton text={kod} />
          </div>
        ) : null}
        <p className="sub">{t('Müşteri bu kodu giriş sayfasındaki "Proje raporu sorgula" bölümüne yazar. Aşağıda işaretlediğiniz fotoğraf ve belgeleri görür; kişi adlarını görmez.')}</p>
        <MusteriSecimi project={project} data={data} />
      </section>
      <ErrorNote>{error}</ErrorNote>
      {!rapor ? (
        error ? null : <Spinner />
      ) : rapor.hazir ? (
        <MusteriRaporuBelgesi rapor={rapor} />
      ) : (
        <div className="card empty">{t('Bütün adımlar bitince müşteri raporu hazır olur. O zamana kadar müşteri "Projeniz hazırlanıyor" yazısını görür.')}</div>
      )}
    </>
  )
}

/** Switches for every current photo of a step and every project file. */
function MusteriSecimi({ project, data }: { project: Project; data: Workshop }) {
  const { reload } = useWorkshop()
  const [error, setError] = useState<string | null>(null)
  const current = (d: Dosya) => !d.eski_at && !d.silindi
  const photos = data
    .stepsOf(project.id)
    .flatMap((s) => data.dosyalarOfStep(s.id).filter((d) => current(d) && (d.mime ?? '').startsWith('image/')).map((d) => ({ d, step: s.name })))
  const files = data.dosyalarOfProject(project.id).filter(current)

  async function toggle(d: Dosya, on: boolean) {
    const { error } = await dosyaMusteriye(d.id, on)
    setError(error ? friendly(error) : null)
    await reload()
  }

  if (!photos.length && !files.length) return <div className="sub">{t('Bu projede henüz fotoğraf veya belge yok.')}</div>
  return (
    <>
      {photos.length ? (
        <div>
          <div className="field-label">{t('Fotoğraflar')}</div>
          <div className="card rows pick-list">
            {photos.map(({ d, step }) => (
              <label key={d.id} className="pick-row">
                <Photo file={d} size="small" />
                <span className="pick-text">
                  <span>{step}</span>
                  <span className="sub">{d.name}</span>
                </span>
                <Switch checked={d.musteriye} label={t('Müşteriye göster')} onChange={(on) => toggle(d, on)} />
              </label>
            ))}
          </div>
        </div>
      ) : null}
      {files.length ? (
        <div>
          <div className="field-label">{t('Belgeler')}</div>
          <div className="card rows pick-list">
            {files.map((d) => (
              <label key={d.id} className="pick-row">
                <span className="pick-icon">
                  <Icon name="doc" size={22} />
                </span>
                <span className="pick-text">
                  <span>{d.name}</span>
                  <span className="sub">{d.ana ? t('Ana doküman') : t('Proje dosyası')}</span>
                </span>
                <Switch checked={d.musteriye} label={t('Müşteriye göster')} onChange={(on) => toggle(d, on)} />
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
    </>
  )
}
