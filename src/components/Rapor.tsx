import type { ReactNode } from 'react'
import type { MusteriRaporu } from '../../shared/rapor'
import { formatSize } from '../lib/dosyalar'
import { t } from '../lib/i18n'
import { anText, gecikmeText, sureText, tarihText, type ProjeRaporu } from '../lib/rapor'
import { PROBLEM_REASONS, TALEP_STATUS_LABEL, type Workshop } from '../lib/workshop'
import { Photo } from './StepHistory'
import { Icon } from './ui'

/** The bottom line of the Aquafelix letterhead, as printed on it. */
const ANTET_ADRES =
  'Atatürk Sanayi Bölgesi Ömerli Mah. Hakkı İleri Cad. 76/A Hadımköy-İST · Tel: 0212 771 58 00 (2 Hat) · Faks: 0212 771 57 76' // i18n-ok

/**
 * A page on the Aquafelix letterhead: the logo at the top, the address at the
 * bottom. On paper (or PDF) both repeat on every page; the empty first and
 * last rows of the table keep the text clear of them.
 */
export function Antetli({ children }: { children: ReactNode }) {
  return (
    <article className="paper">
      <header className="paper-head">
        <img src="/aquafelix-logo.png" alt="Aquafelix" width={273} height={52} />
      </header>
      <table className="paper-frame">
        <thead>
          <tr>
            <td>
              <div className="paper-head-space" />
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div className="paper-body">{children}</div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>
              <div className="paper-foot-space" />
            </td>
          </tr>
        </tfoot>
      </table>
      <footer className="paper-foot">{ANTET_ADRES}</footer>
    </article>
  )
}

function Bilgi({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="doc-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** A problem as stored ("Malzeme eksik: note"): the reason translated, the note as typed. */
function sorunText(detail: string): string {
  const [reason, ...rest] = detail.split(': ')
  return PROBLEM_REASONS.includes(reason) ? [t(reason), ...rest].join(': ') : detail
}

/** İç rapor: everything Felix recorded, for Genel Müdür, IT and Bölüm Sorumluları. */
export function IcRapor({ rapor, data }: { rapor: ProjeRaporu; data: Workshop }) {
  const p = rapor.project
  const company = data.company(p.company_id)
  const type = data.projectTypes.find((ty) => ty.id === p.project_type_id)
  const photos = rapor.adimlar.filter((a) => a.foto)
  return (
    <Antetli>
      <div className="doc-title">
        <h1>{t('Proje raporu')}</h1>
        <span className="doc-kind">{t('İç rapor')}</span>
      </div>
      <dl className="doc-facts">
        <Bilgi label={t('Proje kodu')}>{p.code}</Bilgi>
        <Bilgi label={t('Proje')}>{p.name}</Bilgi>
        <Bilgi label={t('Firma')}>{company?.name}</Bilgi>
        <Bilgi label={t('Proje türü')}>{type?.name}</Bilgi>
        <Bilgi label={t('Açıldı')}>{tarihText(p.created_at)}</Bilgi>
        <Bilgi label={t('Planlanan teslim')}>{tarihText(p.due_date)}</Bilgi>
        <Bilgi label={t('Bütün adımlar bitti')}>{tarihText(rapor.tamamlandi)}</Bilgi>
        <Bilgi label={t('Teslim edildi')}>{p.teslim_at ? tarihText(p.teslim_at) : rapor.tamamlandi ? t('Henüz teslim edilmedi') : null}</Bilgi>
        <Bilgi label={t('Teslim durumu')}>{rapor.gecikme === null ? null : gecikmeText(rapor.gecikme)}</Bilgi>
      </dl>

      <div className="doc-totals">
        <div>
          <strong>{rapor.adimlar.length}</strong>
          <span>{t('Adım')}</span>
        </div>
        <div>
          <strong>{sureText(rapor.toplamCalisma)}</strong>
          <span>{t('Toplam çalışma')}</span>
        </div>
        <div>
          <strong>{rapor.toplamGeriGonderme}</strong>
          <span>{t('Geri gönderme')}</span>
        </div>
        <div>
          <strong>{rapor.toplamSorun}</strong>
          <span>{t('Sorun')}</span>
        </div>
      </div>

      <h2>{t('Adımlar')}</h2>
      <ol className="doc-steps">
        {rapor.adimlar.map((a, i) => (
          <li key={a.step.id} className="doc-step">
            <div className="doc-step-head">
              <span className="doc-no">{i + 1}</span>
              <strong>{a.step.name}</strong>
              <span className="doc-who">{a.kisiler.map((k) => k.full_name).join(', ') || t('Atanmadı')}</span>
            </div>
            <div className="doc-step-facts">
              {[
                a.basladi ? t('Başladı: {time}', { time: anText(a.basladi) }) : null,
                a.bitti ? t('Bitti: {time}', { time: anText(a.bitti) }) : t('Bitmedi'),
                a.onaylandi ? t('Onaylandı: {time}', { time: anText(a.onaylandi) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <div className="doc-step-facts">
              {[
                a.calisma ? t('Çalışma: {time}', { time: sureText(a.calisma) }) : null,
                a.sorunBekleme ? t('Sorun beklemesi: {time}', { time: sureText(a.sorunBekleme) }) : null,
                a.onayBekleme ? t('Onay beklemesi: {time}', { time: sureText(a.onayBekleme) }) : null,
                a.geriGonderme ? t('{n} kez geri gönderildi', { n: a.geriGonderme }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {a.sorunlar.map((s, j) => (
              <div key={j} className="doc-step-problem">
                {t('Sorun: {text}', { text: sorunText(s.neden) })} · {anText(s.at)}
              </div>
            ))}
          </li>
        ))}
      </ol>

      {rapor.kisiler.length ? (
        <>
          <h2>{t('Kişiler')}</h2>
          <table className="doc-table">
            <thead>
              <tr>
                <th>{t('Kişi')}</th>
                <th>{t('Adım')}</th>
                <th>{t('Çalışma')}</th>
                <th>{t('Geri gönderme')}</th>
                <th>{t('Bildirdiği sorun')}</th>
              </tr>
            </thead>
            <tbody>
              {rapor.kisiler.map((k) => (
                <tr key={k.kisi.id}>
                  <td>{k.kisi.full_name}</td>
                  <td>{k.adim}</td>
                  <td>{k.calisma ? sureText(k.calisma) : '–'}</td>
                  <td>{k.geriGonderme}</td>
                  <td>{k.sorun}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {rapor.talepler.length ? (
        <>
          <h2>{t('Talepler')}</h2>
          <ul className="doc-list">
            {rapor.talepler.map((tl) => {
              const step = data.steps.find((s) => s.id === tl.step_id)
              const what =
                tl.kind === 'malzeme'
                  ? [tl.material, tl.quantity].filter(Boolean).join(' · ')
                  : tl.note || t('Çizim hatalı')
              return (
                <li key={tl.id}>
                  <strong>
                    {tl.kind === 'malzeme' ? t('Malzeme talebi') : t('Çizim talebi')}: {what}
                  </strong>
                  <span>
                    {[
                      step?.name,
                      t('Açıldı: {time}', { time: anText(tl.created_at) }),
                      tl.closed_at
                        ? t('{status}: {time}', { status: t(TALEP_STATUS_LABEL[tl.status]), time: anText(tl.closed_at) })
                        : t(TALEP_STATUS_LABEL[tl.status]),
                      tl.closed_at ? t('Bekleme: {time}', { time: sureText(new Date(tl.closed_at).getTime() - new Date(tl.created_at).getTime()) }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      {photos.length ? (
        <>
          <h2>{t('Bitiş fotoğrafları')}</h2>
          <div className="doc-photos">
            {photos.map((a) => (
              <figure key={a.step.id}>
                <Photo file={a.foto!} />
                <figcaption>
                  {a.step.name}
                  {a.bitti ? ` · ${tarihText(a.bitti)}` : ''}
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      ) : null}

      <p className="doc-note">
        {t('Süreler takvim süresidir; geceler ve hafta sonları dahildir. Sorun ve onay beklemeleri çalışmaya sayılmaz. Bir adıma atanan herkes o adımı yapmış sayılır.')}
      </p>
      <p className="doc-note">{t('Rapor tarihi: {date}', { date: anText(new Date().toISOString()) })}</p>
    </Antetli>
  )
}

/** Müşteri raporu: what the customer sees. No names, only the ticked photos and files. */
export function MusteriRaporuBelgesi({ rapor }: { rapor: Extract<MusteriRaporu, { hazir: true }> }) {
  const photos = rapor.dosyalar.filter((d) => d.foto)
  const files = rapor.dosyalar.filter((d) => !d.foto)
  return (
    <Antetli>
      <div className="doc-title">
        <h1>{t('Proje raporu')}</h1>
      </div>
      <dl className="doc-facts">
        <Bilgi label={t('Proje kodu')}>{rapor.kod}</Bilgi>
        <Bilgi label={t('Proje')}>{rapor.ad}</Bilgi>
        <Bilgi label={t('Firma')}>{rapor.firma}</Bilgi>
        <Bilgi label={t('Tamamlandı')}>{tarihText(rapor.tamamlandi)}</Bilgi>
        <Bilgi label={t('Teslim edildi')}>{tarihText(rapor.teslim)}</Bilgi>
      </dl>

      <h2>{t('Yapılan işler')}</h2>
      <ol className="doc-steps doc-steps-simple">
        {rapor.adimlar.map((a, i) => (
          <li key={i} className="doc-step">
            <div className="doc-step-head">
              <span className="doc-no">{i + 1}</span>
              <strong>{a.ad}</strong>
              <span className="doc-who">{tarihText(a.bitti)}</span>
            </div>
          </li>
        ))}
      </ol>

      {photos.length ? (
        <>
          <h2>{t('Fotoğraflar')}</h2>
          <div className="doc-photos">
            {photos.map((d) => (
              <figure key={d.id}>
                <a className="photo photo-large" href={d.url} target="_blank" rel="noreferrer">
                  <img src={d.url} alt={d.adim ?? d.ad} />
                </a>
                {d.adim ? <figcaption>{d.adim}</figcaption> : null}
              </figure>
            ))}
          </div>
        </>
      ) : null}

      {files.length ? (
        <>
          <h2>{t('Belgeler')}</h2>
          <ul className="doc-list doc-files">
            {files.map((d) => (
              <li key={d.id}>
                <a href={d.indir} className="press">
                  <Icon name="doc" size={20} />
                  <strong>{d.ad}</strong>
                  <span>{formatSize(d.boyut)}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="doc-note">{t('Rapor tarihi: {date}', { date: anText(new Date().toISOString()) })}</p>
    </Antetli>
  )
}
