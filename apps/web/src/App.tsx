import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { CatalogPage } from './pages/CatalogPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PackagePage } from './pages/PackagePage'

function LegacyCatalogRedirect() {
  const { hash, search } = useLocation()
  return <Navigate to={`/plugins${search}${hash}`} replace />
}

function LegacyPackageRedirect() {
  const { owner = '', name = '' } = useParams()
  const { hash, search } = useLocation()
  return (
    <Navigate
      to={`/plugins/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${search}${hash}`}
      replace
    />
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<CatalogPage view="rankings" />} />
        <Route path="/plugins" element={<CatalogPage view="catalog" />} />
        <Route path="/rankings" element={<CatalogPage view="rankings" />} />
        <Route path="/plugins/:owner/:name" element={<PackagePage />} />
        <Route path="/plugin" element={<LegacyCatalogRedirect />} />
        <Route path="/plugin/:owner/:name" element={<LegacyPackageRedirect />} />
        <Route path="/packages" element={<LegacyCatalogRedirect />} />
        <Route path="/packages/:owner/:name" element={<LegacyPackageRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
