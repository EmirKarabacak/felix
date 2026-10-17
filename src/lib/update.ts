// Felix reloads itself when a newer version has been published, so nobody
// keeps using an old copy (which may ask the database for things that no
// longer exist). It checks when the app comes back into view, which is also
// the moment a reload disturbs nobody, and every few minutes while open, then
// reloads only when no form or sheet is open.

const CHECK_MS = 5 * 60_000

async function newerVersion(): Promise<boolean> {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return false // e.g. while developing, where there is no such file
    const { version } = (await response.json()) as { version?: string }
    return !!version && version !== __FELIX_VERSION__
  } catch {
    return false
  }
}

const busy = () => !!document.querySelector('.dialog') || document.activeElement instanceof HTMLInputElement

export function watchForUpdates() {
  let pending = false
  const check = async (returning: boolean) => {
    if (!pending) pending = await newerVersion()
    if (pending && (returning || !busy())) window.location.reload()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check(true)
  })
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void check(false)
  }, CHECK_MS)
}
