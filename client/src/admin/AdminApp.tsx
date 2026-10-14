import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useToken } from '@/lib/auth'
import './admin.css'
import { AdminLayout } from './layout/AdminLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ResultsPage } from './pages/results/ResultsPage'
import { ImportPage } from './pages/import/ImportPage'
import { TiersPage } from './pages/tiers/TiersPage'
import { LivePage } from './pages/live/LivePage'
import { SettingsPage } from './pages/settings/SettingsPage'

/** Redirects to the login page (remembering where the user wanted to go) when there is no token. */
function RequireAuth({ children }: { children: ReactNode }) {
  const token = useToken()
  const location = useLocation()
  if (!token) return <Navigate to="/admin/login" replace state={{ from: location }} />
  return <>{children}</>
}

export default function AdminApp() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="tiers" element={<TiersPage />} />
        <Route path="live" element={<LivePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  )
}
