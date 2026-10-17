import { Component, useEffect, useId, useRef, useState, type ReactNode } from 'react'

// Felix's icons are drawn here, in one family: a 24-unit grid, rounded line
// ends, one line weight, and corners rounded to match. Icons that mark a place
// in the app (the tab bar) also have a filled form, shown when that tab is
// the current one, so selection is carried by shape as well as colour.
type Glyph = { outline: ReactNode; filled?: ReactNode }

const F = { fill: 'currentColor' } as const

const GLYPHS = {
  drop: {
    outline: <path d="M12 3.2c3.4 4.1 5.8 7.2 5.8 10.4a5.8 5.8 0 0 1-11.6 0c0-3.2 2.4-6.300 5.8-10.4z" />,
  },
  plus: { outline: <path d="M12 5.500v13M5.500 12h13" /> },
  check: { outline: <path d="M5.200 12.600l4.300 4.300 9.300-9.500" /> },
  chevron: { outline: <path d="M9.200 5.500l6.300 6.500-6.300 6.500" /> },
  back: { outline: <path d="M14.800 5.500L8.500 12l6.300 6.500" /> },
  up: { outline: <path d="M6 14.500l6-6 6 6" /> },
  down: { outline: <path d="M6 9.500l6 6 6-6" /> },
  minus: {
    outline: (
      <>
        <circle cx="12" cy="12" r="8.700" />
        <path d="M8.300 12h7.400" />
      </>
    ),
  },
  trash: {
    outline: (
      <>
        <path d="M4.500 7h15" />
        <path d="M9.500 7V5.300A1.300 1.300 0 0 1 10.800 4h2.400a1.300 1.300 0 0 1 1.300 1.300V7" />
        <path d="M6.400 7l.8 11.200A1.900 1.900 0 0 0 9.100 20h5.800a1.900 1.900 0 0 0 1.900-1.800L17.600 7" />
        <path d="M10.200 11v5M13.800 11v5" />
      </>
    ),
  },
  alert: {
    outline: (
      <>
        <path d="M10.300 4.900L2.900 17.600a1.950 1.950 0 0 0 1.700 2.900h14.800a1.950 1.950 0 0 0 1.700-2.900L13.700 4.900a1.950 1.950 0 0 0-3.400 0z" />
        <path d="M12 9.500v4.300" />
        <circle cx="12" cy="16.900" r="0.900" {...F} stroke="none" />
      </>
    ),
  },
  person: {
    outline: (
      <>
        <circle cx="12" cy="8" r="3.600" />
        <path d="M4.800 20a7.200 7.200 0 0 1 14.400 0" />
      </>
    ),
    filled: (
      <>
        <circle cx="12" cy="8" r="3.600" {...F} />
        <path d="M4.800 20a7.200 7.200 0 0 1 14.400 0z" {...F} />
      </>
    ),
  },
  people: {
    outline: (
      <>
        <circle cx="9.300" cy="8.500" r="3.100" />
        <path d="M3.200 19.500a6.100 6.100 0 0 1 12.200 0" />
        <path d="M15.900 5.600a3.100 3.100 0 0 1 0 5.800" />
        <path d="M17.700 14.300a6 6 0 0 1 3.100 5.200" />
      </>
    ),
    filled: (
      <>
        <circle cx="9.300" cy="8.500" r="3.100" {...F} />
        <path d="M3.200 19.500a6.100 6.100 0 0 1 12.200 0z" {...F} />
        <path d="M15.900 5.600a3.100 3.100 0 0 1 0 5.800" />
        <path d="M17.700 14.300a6 6 0 0 1 3.100 5.200" />
      </>
    ),
  },
  folder: {
    outline: (
      <path d="M3.500 7v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V9.700a2 2 0 0 0-2-2h-6.200L10.700 5.600A2 2 0 0 0 9.300 5H5.500a2 2 0 0 0-2 2z" />
    ),
    filled: (
      <path
        d="M3.500 7v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V9.700a2 2 0 0 0-2-2h-6.200L10.700 5.600A2 2 0 0 0 9.300 5H5.500a2 2 0 0 0-2 2z"
        {...F}
      />
    ),
  },
  building: {
    outline: (
      <>
        <path d="M5 20V5.500A1.500 1.500 0 0 1 6.500 4h6A1.500 1.500 0 0 1 14 5.500V20" />
        <path d="M14 10h3.500a1.500 1.500 0 0 1 1.500 1.500V20" />
        <path d="M3 20h18" />
        <path d="M8.300 8h2.400M8.300 11.500h2.400M8.300 15h2.400" />
      </>
    ),
    filled: (
      <>
        {/* The windows are holes in the fill; no stroke here, or it would close them up. */}
        <path
          d="M5 20V5.500A1.500 1.500 0 0 1 6.500 4h6A1.500 1.500 0 0 1 14 5.500V20zM7.700 7h3.600v2H7.700zM7.700 10.500h3.600v2H7.700zM7.700 14h3.600v2H7.700z"
          {...F}
          fillRule="evenodd"
          stroke="none"
        />
        <path d="M5 20V5.500A1.500 1.500 0 0 1 6.500 4h6A1.500 1.500 0 0 1 14 5.500V20" />
        <path d="M14 10h3.500a1.500 1.500 0 0 1 1.500 1.500V20h-5z" {...F} />
        <path d="M3 20h18" />
      </>
    ),
  },
  layers: {
    outline: (
      <>
        <path d="M12 4.200l8.300 4.100-8.300 4.100-8.300-4.100z" />
        <path d="M4.200 12.200L12 16l7.800-3.800" />
        <path d="M4.200 15.900L12 19.700l7.800-3.800" />
      </>
    ),
    filled: (
      <>
        <path d="M12 4.200l8.300 4.100-8.300 4.100-8.300-4.100z" {...F} />
        <path d="M4.200 12.200L12 16l7.800-3.800" />
        <path d="M4.200 15.900L12 19.700l7.800-3.800" />
      </>
    ),
  },
  list: {
    outline: (
      <>
        <path d="M9.500 7h10M9.500 12h10M9.500 17h10" />
        <circle cx="5" cy="7" r="1.100" {...F} stroke="none" />
        <circle cx="5" cy="12" r="1.100" {...F} stroke="none" />
        <circle cx="5" cy="17" r="1.100" {...F} stroke="none" />
      </>
    ),
    filled: (
      <>
        <path d="M9.500 7h10M9.500 12h10M9.500 17h10" strokeWidth="2.600" />
        <circle cx="5" cy="7" r="1.600" {...F} stroke="none" />
        <circle cx="5" cy="12" r="1.600" {...F} stroke="none" />
        <circle cx="5" cy="17" r="1.600" {...F} stroke="none" />
      </>
    ),
  },
  gear: {
    outline: (
      <>
        <path d="M18.85 9.78L20.99 10.03L20.99 13.97L18.85 14.22L18.42 15.27L19.75 16.96L16.96 19.75L15.27 18.42L14.22 18.85L13.97 20.99L10.03 20.99L9.78 18.85L8.73 18.42L7.04 19.75L4.25 16.96L5.58 15.27L5.15 14.22L3.01 13.97L3.01 10.03L5.15 9.78L5.58 8.73L4.25 7.04L7.04 4.25L8.73 5.58L9.78 5.15L10.03 3.01L13.970 3.01L14.22 5.15L15.27 5.58L16.96 4.25L19.75 7.04L18.42 8.73z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    filled: (
      <>
        {/* The middle is a hole in the fill, like the windows of "building". */}
        <path d="M18.85 9.78L20.99 10.03L20.99 13.97L18.85 14.22L18.42 15.27L19.75 16.96L16.96 19.75L15.27 18.42L14.22 18.85L13.97 20.99L10.03 20.99L9.78 18.85L8.73 18.42L7.04 19.75L4.25 16.96L5.58 15.27L5.15 14.22L3.01 13.97L3.01 10.03L5.15 9.78L5.58 8.73L4.25 7.04L7.04 4.25L8.73 5.58L9.78 5.15L10.03 3.01L13.970 3.01L14.22 5.15L15.27 5.58L16.96 4.25L19.75 7.04L18.42 8.73zM15 12a3 3 0 1 0-6 0a3 3 0 1 0 6 0z" {...F} fillRule="evenodd" />
      </>
    ),
  },
  doc: {
    outline: (
      <>
        <path d="M7 3.500h6.600L18.500 8.400V19a1.500 1.500 0 0 1-1.500 1.500H7A1.500 1.500 0 0 1 5.500 19V5A1.500 1.500 0 0 1 7 3.500z" />
        <path d="M13.300 3.700V7.600A1 1 0 0 0 14.300 8.600h4" />
        <path d="M8.800 12.800h6.400M8.800 16.300h4.600" />
      </>
    ),
  },
  download: {
    outline: (
      <>
        <path d="M12 4.500v10.300M7.500 10.500l4.500 4.500 4.500-4.500" />
        <path d="M5 19.500h14" />
      </>
    ),
  },
  clip: {
    outline: (
      <path d="M19.300 11.600l-7.100 7.100a4.500 4.500 0 0 1-6.400-6.400l7.400-7.400a3 3 0 0 1 4.300 4.300l-7.300 7.300a1.500 1.500 0 0 1-2.100-2.100l6.700-6.700" />
    ),
  },
  wrench: {
    outline: (
      <path d="M14.700 4.300a4.600 4.600 0 0 0-5.500 6.100L4.400 15.200a1.900 1.900 0 0 0 2.700 2.700l4.800-4.800a4.600 4.600 0 0 0 6.100-5.500l-2.700 2.700-2.400-.4-.4-2.400z" />
    ),
  },
  box: {
    outline: (
      <>
        <path d="M12 3.500l7.800 4.100v8.800L12 20.500l-7.800-4.100V7.600z" />
        <path d="M4.400 7.700L12 11.800l7.600-4.100M12 11.800v8.500" />
      </>
    ),
  },
} satisfies Record<string, Glyph>

export type IconName = keyof typeof GLYPHS

export function Icon({ name, size = 22, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  const glyph: Glyph = GLYPHS[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.900"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {filled && glyph.filled ? glyph.filled : glyph.outline}
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

/**
 * An on/off switch that moves the moment it is touched and saves in the
 * background. If saving fails it moves back, so it never shows a state the
 * server does not have for long.
 */
export function Switch({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean
  /** Read by screen readers when there is no visible label wrapping the switch. */
  label?: string
  disabled?: boolean
  onChange: (next: boolean) => Promise<unknown>
}) {
  const [pending, setPending] = useState<boolean | null>(null)
  // Once the saved value catches up with what was tapped, stop overriding it.
  useEffect(() => {
    if (pending !== null && pending === checked) setPending(null)
  }, [checked, pending])

  return (
    <input
      type="checkbox"
      role="switch"
      className="switch"
      aria-label={label}
      checked={pending ?? checked}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.checked
        setPending(next)
        void onChange(next).finally(() => setPending((now) => (now === next ? null : now)))
      }}
    />
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  grid = false,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  /** Two per row, for four longer labels that would not fit side by side on a phone. */
  grid?: boolean
}) {
  return (
    <div className="field">
      <div className="field-label" id={`${label}-seg`}>
        {label}
      </div>
      <div className={grid ? 'segmented segmented-grid' : 'segmented'} role="group" aria-labelledby={`${label}-seg`}>
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
