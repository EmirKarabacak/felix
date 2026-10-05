import { Component, useEffect, useId, useRef, type ReactNode } from 'react'

const PATHS = {
  drop: <path d="M12 3c3.5 4.2 6 7.3 6 10.5a6 6 0 0 1-12 0C6 10.3 8.5 7.2 12 3z" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14" />
      <path d="M10 7V4h4v3" />
      <path d="M7 7l1 13h8l1-13" />
    </>
  ),
  chevron: <path d="M9 5l7 7-7 7" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.200 1.900 7 5.5" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.500" r="3" />
      <path d="M3 19.500c.6-3 2.900-4.700 6-4.700s5.400 1.700 6 4.700" />
      <path d="M15.500 5.800a3 3 0 0 1 0 5.400" />
      <path d="M17.500 14.900c1.900.5 3.100 2 3.500 4.600" />
    </>
  ),
  folder: <path d="M3.500 7.500v10a1.500 1.500 0 0 0 1.500 1.500h14a1.500 1.500 0 0 0 1.500-1.500V9a1.500 1.500 0 0 0-1.500-1.500h-6.500l-2-2.500H5A1.500 1.500 0 0 0 3.500 6.500z" />,
  building: (
    <>
      <path d="M5 20V6l7-2.500V20" />
      <path d="M12 9l7 2v9" />
      <path d="M3 20h18" />
      <path d="M8 9v.01M8 12.500v.01M8 16v.01M15.500 13.500v.01M15.500 16.500v.01" />
    </>
  ),
  layers: (
    <>
      <path d="M12 4l8 4-8 4-8-4 8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 16l8 4 8-4" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  alert: (
    <>
      <path d="M12 4 2.5 20h19L12 4z" />
      <path d="M12 10v4" />
      <path d="M12 17v.5" />
    </>
  ),
  up: <path d="M6 14l6-6 6 6" />,
  down: <path d="M6 10l6 6 6-6" />,
  minus: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </>
  ),
  list: (
    <>
      <path d="M9 7h11" />
      <path d="M9 12h11" />
      <path d="M9 17h11" />
      <path d="M4.500 7h.01" />
      <path d="M4.500 12h.01" />
      <path d="M4.500 17h.01" />
    </>
  ),
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}

export function Spinner({ label = 'Yükleniyor' }: { label?: string }) {
  return (
    <div className="spinner" role="status" aria-label={label}>
      <span />
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div className="note note-error" role="alert">
      {children}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="field">
      <div className="field-label" id={`${label}-seg`}>
        {label}
      </div>
      <div className="segmented" role="group" aria-labelledby={`${label}-seg`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="press"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * A modal: a centered panel on wide screens, a bottom sheet on phones.
 * The scrim dims the page because the task blocks everything behind it.
 */
export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
  focusFirst = true,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Put the cursor in the first field on open. Turn off for sheets that are mostly buttons. */
  focusFirst?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = focusFirst ? panel.current?.querySelector<HTMLElement>('input, select, textarea') : null
    ;(first ?? panel.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={panel}>
        <div className="dialog-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <div className="sub">{subtitle}</div> : null}
          </div>
          <button type="button" className="btn btn-quiet press" onClick={onClose}>
            Kapat
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

/** If a screen crashes, say so and offer a way back, instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Felix screen error:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="gate">
        <div className="gate-inner">
          <div className="note note-error" role="alert">
            Bu ekran açılırken bir hata oluştu. Verileriniz güvende; sayfayı yenileyip tekrar deneyin.
          </div>
          <button type="button" className="btn btn-primary btn-big press" onClick={() => window.location.assign('/')}>
            Yenile
          </button>
        </div>
      </div>
    )
  }
}
