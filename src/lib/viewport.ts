// Phones draw the on-screen keyboard over the page without telling CSS, so a
// sheet pinned to the bottom of the screen ends up underneath it. This keeps
// two CSS variables in step with the part of the screen that is really visible
// (--vvh: its height, --vvtop: its offset) and marks <html> with "typing"
// while a text field has focus, so fixed chrome can get out of the way.

const TEXT_FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea'

function keepFocusedFieldVisible() {
  const el = document.activeElement
  if (!(el instanceof HTMLElement) || !el.matches(TEXT_FIELD)) return
  if (el.closest('.dialog')) {
    // Sheets scroll inside themselves and are already sized to the visible area.
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
    return
  }
  // On the page itself, scroll only if the keyboard is really covering the field.
  const vv = window.visualViewport
  const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
  const hidden = el.getBoundingClientRect().bottom + 16 - visibleBottom
  if (hidden > 0) window.scrollBy({ top: hidden + 64 })
}

export function watchViewport(): void {
  const root = document.documentElement
  const vv = window.visualViewport

  const apply = () => {
    root.style.setProperty('--vvh', `${vv ? vv.height : window.innerHeight}px`)
    root.style.setProperty('--vvtop', `${vv ? vv.offsetTop : 0}px`)
  }
  apply()

  if (vv) {
    let lastHeight = vv.height
    vv.addEventListener('resize', () => {
      apply()
      // The keyboard just opened or closed: bring the field being typed in back into view.
      if (Math.abs(vv.height - lastHeight) > 80) keepFocusedFieldVisible()
      lastHeight = vv.height
    })
    vv.addEventListener('scroll', apply)
  } else {
    window.addEventListener('resize', apply)
  }

  const isTyping = () => {
    const el = document.activeElement
    return el instanceof HTMLElement && el.matches(TEXT_FIELD)
  }
  let settle: number | undefined
  const update = () => {
    // Focus hops between elements in bursts (focusout, then focusin). Decide
    // once things have settled, from where focus actually ended up.
    window.clearTimeout(settle)
    settle = window.setTimeout(() => root.classList.toggle('typing', isTyping()), 120)
  }
  document.addEventListener('focusin', () => {
    if (isTyping()) {
      root.classList.add('typing')
      // Keyboards animate in; check again once it has settled.
      window.setTimeout(keepFocusedFieldVisible, 350)
    }
    update()
  })
  document.addEventListener('focusout', update)
}
