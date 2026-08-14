import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { CatalogPage } from './pages/CatalogPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PackagePage } from './pages/PackagePage'

function LegacyCatalogRedirect() {
  const { hash, search } = useLocation()
  return <Navigate to={`/plugin${search}${hash}`} replace />
}

function LegacyPackageRedirect() {
  const { owner = '', name = '' } = useParams()
  const { hash, search } = useLocation()
  return (
    <Navigate
      to={`/plugin/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${search}${hash}`}
      replace
    />
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/rankings" replace />} />
        <Route path="/plugin" element={<CatalogPage view="catalog" />} />
        <Route path="/rankings" element={<CatalogPage view="rankings" />} />
        <Route path="/plugin/:owner/:name" element={<PackagePage />} />
        <Route path="/packages" element={<LegacyCatalogRedirect />} />
        <Route path="/packages/:owner/:name" element={<LegacyPackageRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
