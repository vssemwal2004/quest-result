import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'

// The show and the admin are separate bundles so the big screen never downloads admin code and vice versa.
const ShowPage = lazy(() => import('@/show/ShowPage'))
const AdminApp = lazy(() => import('@/admin/AdminApp'))

function BootSplash() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-quest-gradient">
      <div className="h-14 w-14 animate-spin rounded-full border-4 border-cyan-glow/20 border-t-cyan-glow" />
    </div>
  )
}

export default function App() {
  return (
    <>
      <Suspense fallback={<BootSplash />}>
        <Routes>
          <Route path="/" element={<ShowPage />} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster theme="dark" position="top-right" richColors closeButton />
    </>
  )
}
