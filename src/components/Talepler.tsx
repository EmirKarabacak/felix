import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../lib/auth'
import { t } from '../lib/i18n'
import {
  TALEP_STATUS_LABEL,
  canHandleTalep,
  formatMoment,
  isOpen,
  talepAction,
  useWorkshop,
  type Talep,
  type TalepActionName,
} from '../lib/workshop'
import { ErrorNote, Icon } from './ui'

/** "Malzeme eksik: 2" vana · 4 adet" or "Çizim hatalı" */
export function talepTitle(talep: Talep): string {
  if (talep.kind === 'cizim') return t('Çizim hatalı')
  return [t('Malzeme eksik: {material}', { material: talep.material ?? '' }), talep.quantity].filter(Boolean).join(' · ')
}

const STATUS_TONE: Record<Talep['status'], string> = {
  acik: 'status-problem',
  siparis: 'status-active',
  geldi: 'status-done',
  cozuldu: 'status-done',
}

/**
 * One request: what is needed, for which job, who is on it, and the buttons
 * for those who handle it ("Ben ilgileniyorum", "Sipariş verildi", "Geldi",
 * "Düzeltildi"). `where` adds the project and step, for lists outside a step.
 */
export function TalepCard({ talep, where = false }: { talep: Talep; where?: boolean }) {
  const me = useProfile()
  const { data, change } = useWorkshop()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!data) return null

  const open = isOpen(talep)
  const handles = open && canHandleTalep(data, me, talep)
  const handler = talep.handler_id ? data.person(talep.handler_id) : undefined
  const reporter = talep.created_by ? data.person(talep.created_by) : undefined
  const closer = talep.closed_by ? data.person(talep.closed_by) : undefined
  const project = data.project(talep.project_id)
  const step = talep.step_id ? data.steps.find((s) => s.id === talep.step_id) : undefined

  async function act(action: TalepActionName) {
    if (busy) return
    setBusy(true)
    setError(null)
    setError(await change(() => talepAction(talep.id, action)))
    setBusy(false)
  }

  const handlerText = handler
    ? handler.id === me.id
      ? t('Siz ilgileniyorsunuz')
      : t('{name} ilgileniyor', { name: handler.full_name })
    : open
      ? t('Henüz kimse ilgilenmiyor')
      : null

  return (
    <div className="talep">
      <span className={`talep-icon ${talep.kind === 'malzeme' ? 'talep-malzeme' : 'talep-cizim'}`}>
        <Icon name={talep.kind === 'malzeme' ? 'box' : 'doc'} size={20} />
      </span>
      <div className="talep-text">
        <div className="talep-top">
          <strong>{talepTitle(talep)}</strong>
          <span className={`badge ${STATUS_TONE[talep.status]}`}>{t(TALEP_STATUS_LABEL[talep.status])}</span>
        </div>
        {talep.note ? <div className="talep-note">{talep.note}</div> : null}
        {where ? (
          <Link to={`/projeler/${talep.project_id}`} className="sub talep-where">
            {[project?.code, project?.name, step?.name].filter(Boolean).join(' · ')}
          </Link>
        ) : null}
        <div className="sub">
          {[reporter ? t('{name} bildirdi', { name: reporter.full_name }) : t('Bildirildi'), formatMoment(talep.created_at)].join(', ')}
        </div>
        {talep.status === 'siparis' && talep.ordered_at ? (
          <div className="sub">{t('Sipariş verildi: {time}', { time: formatMoment(talep.ordered_at) })}</div>
        ) : null}
        {!open && talep.closed_at ? (
          <div className="sub">
            {t(TALEP_STATUS_LABEL[talep.status])}: {formatMoment(talep.closed_at)}
            {closer ? `, ${closer.full_name}` : ''}
          </div>
        ) : null}
        {handlerText && open ? <div className={`talep-handler${handler ? ' on' : ''}`}>{handlerText}</div> : null}
        {handles ? (
          <div className="talep-actions">
            {handler?.id !== me.id ? (
              <button type="button" className="btn btn-tint press" disabled={busy} onClick={() => void act('ilgilen')}>
                {t('Ben ilgileniyorum')}
              </button>
            ) : null}
            {talep.kind === 'malzeme' && talep.status === 'acik' ? (
              <button type="button" className="btn btn-quiet press" disabled={busy} onClick={() => void act('siparis')}>
                {t('Sipariş verildi')}
              </button>
            ) : null}
            {talep.kind === 'malzeme' ? (
              <button type="button" className="btn btn-go press" disabled={busy} onClick={() => void act('geldi')}>
                {t('Geldi')}
              </button>
            ) : (
              <button type="button" className="btn btn-go press" disabled={busy} onClick={() => void act('cozuldu')}>
                {t('Düzeltildi')}
              </button>
            )}
          </div>
        ) : null}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </div>
  )
}

export function TalepList({ talepler, where = false, label }: { talepler: Talep[]; where?: boolean; label: string }) {
  return (
    <div className="card rows talepler" role="list" aria-label={label}>
      {talepler.map((talep) => (
        <div key={talep.id} role="listitem">
          <TalepCard talep={talep} where={where} />
        </div>
      ))}
    </div>
  )
}
