import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { AuthProvider } from './lib/auth'
import { registerWorker } from './lib/bildirim'
import { startSettings, useSettings } from './lib/i18n'
import { watchForUpdates } from './lib/update'
import { watchViewport } from './lib/viewport'
import './styles.css'

watchViewport()
watchForUpdates()
startSettings()
registerWorker()

/** Draws everything again in the new language when it is changed in Ayarlar. */
function Root() {
  const { lang } = useSettings()
  return <App key={lang} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
