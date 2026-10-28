import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { bildirimAdresi, bildirimMetni } from '../../shared/bildirim'
import { permission, pushChoice, pushSupported, turnOff, turnOn } from '../lib/bildirim'
import { currentLang, t } from '../lib/i18n'
import { formatMoment, markRead, useWorkshop, type Bildirim } from '../lib/workshop'
import { Dialog, Icon } from './ui'

/** The bell at the top of every screen, with the number of unread alerts. */
export function Bell() {
  const { data } = useWorkshop()
  const [open, setOpen] = useState(false)
  if (!data?.bildirimReady) return null
  const unread = data.unread
  return (
    <>
      <button
        type="button"
        className="bell press"
        onClick={() => setOpen(true)}
        aria-label={unread ? t('Bildirimler ({n} okunmamış)', { n: unread }) : t('Bildirimler')}
      >
        <Icon name="bell" size={24} filled={open} />
        {unread ? <span className="bell-count">{unread > 9 ? '9+' : unread}</span> : null}
      </button>
      {/* Drawn outside the top bar, so it covers the tab bar like every other sheet. */}
      {open ? createPortal(<BildirimList onClose={() => setOpen(false)} />, document.body) : null}
    </>
  )
}

/** My alerts, newest first. Tapping one opens its step. */
function BildirimList({ onClose }: { onClose: () => void }) {
  const { data, reload } = useWorkshop()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  if (!data) return null
  const list = data.bildirimler

  async function open(b: Bildirim) {
    onClose()
    navigate(bildirimAdresi(b))
    if (!b.read_at) {
      await markRead(b.id)
      await reload()
    }
  }

  async function readAll() {
    setBusy(true)
    await markRead()
    await reload()
    setBusy(false)
  }

  return (
    <Dialog
      title={t('Bildirimler')}
      subtitle={t('Son 30 gün')}
      onClose={onClose}
      focusFirst={false}
      footer={
        data.unread ? (
          <button type="button" className="btn btn-tint btn-big press" onClick={() => void readAll()} disabled={busy}>
            {t('Tümünü okundu say')}
          </button>
        ) : undefined
      }
    >
      {list.length ? (
        <div className="card rows alerts">
          {list.map((b) => {
            const { title, body } = bildirimMetni(b, currentLang())
            return (
              <button key={b.id} type="button" className={b.read_at ? 'alert-row press' : 'alert-row unread press'} onClick={() => void open(b)}>
                <span className="alert-dot" aria-label={b.read_at ? undefined : t('Okunmamış')} />
                <span className="alert-text">
                  <span className="alert-title">{title}</span>
                  {body ? <span className="sub">{body}</span> : null}
                  <span className="sub alert-time">{formatMoment(b.created_at)}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="card empty">{t('Henüz bildirim yok. Size iş verildiğinde veya onayınız gerektiğinde burada görünür.')}</div>
      )}
    </Dialog>
  )
}

/**
 * The first time after Felix can send phone alerts, a card asks to allow them.
 * "Şimdi değil" hides it; Ayarlar > Bildirimler can turn them on later.
 */
export function PushPrompt() {
  const { data } = useWorkshop()
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!data?.bildirimReady || hidden || !pushSupported() || pushChoice() !== 'unasked' || permission() === 'denied') return null

  async function allow() {
    setBusy(true)
    try {
      await turnOn()
    } catch {
      // Ayarlar shows the switch off, and can be tried again there.
    }
    setBusy(false)
    setHidden(true)
  }

  return (
    <div className="page-banner">
      <div className="card push-prompt" role="region" aria-label={t('Bildirimler')}>
        <Icon name="bell" size={28} />
        <p>{t('Yeni işlerden haberdar olmak için bildirimlere izin verin.')}</p>
        <div className="push-actions">
          <button
            type="button"
            className="btn btn-quiet press"
            onClick={() => {
              void turnOff()
              setHidden(true)
            }}
          >
            {t('Şimdi değil')}
          </button>
          <button type="button" className="btn btn-primary press" onClick={() => void allow()} disabled={busy}>
            {t('İzin ver')}
          </button>
        </div>
      </div>
    </div>
  )
}
