import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AccountPage } from './pages/AccountPage'
import { ApiDocsPage } from './pages/ApiDocsPage'
import { CatalogPage } from './pages/CatalogPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PackagePage } from './pages/PackagePage'

function LegacyCatalogRedirect() {
  const { hash, search } = useLocation()
  return <Navigate to={`/plugins${search}${hash}`} replace />
}

function LegacyPackageRedirect() {
  const { owner = '', '*': rest = '' } = useParams()
  const { hash, search } = useLocation()
  // Splat, so a monorepo subdirectory path survives the redirect.
  const tail = rest.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  const target = tail.length === 0
    ? `/plugins/${encodeURIComponent(owner)}`
    : `/plugins/${encodeURIComponent(owner)}/${tail}`
  return <Navigate to={`${target}${search}${hash}`} replace />
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<CatalogPage view="rankings" />} />
        <Route path="/plugins" element={<CatalogPage view="catalog" />} />
        <Route path="/rankings" element={<CatalogPage view="rankings" />} />
        <Route path="/plugins/:owner/*" element={<PackagePage />} />
        <Route path="/docs/api" element={<ApiDocsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/plugin" element={<LegacyCatalogRedirect />} />
        <Route path="/plugin/:owner/*" element={<LegacyPackageRedirect />} />
        <Route path="/packages" element={<LegacyCatalogRedirect />} />
        <Route path="/packages/:owner/*" element={<LegacyPackageRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
