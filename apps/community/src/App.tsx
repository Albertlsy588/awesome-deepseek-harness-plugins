import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AboutPage } from './pages/AboutPage'
import { FeedPage } from './pages/FeedPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ThreadPage } from './pages/ThreadPage'
import { UserPage } from './pages/UserPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<FeedPage />} />
        <Route path="/p/:id" element={<ThreadPage />} />
        <Route path="/u/:login" element={<UserPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
