import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { I18nProvider } from './lib/i18n'
import { SessionProvider } from './lib/session'
import '@dsh-1024store/core/tokens.css'
import './theme.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Vite's base, so the router agrees with where the bundle is served
        from — '/community/' in both dev and production. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <I18nProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
)
