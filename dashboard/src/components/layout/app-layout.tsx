import { Outlet } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { Toaster } from 'sonner'
import { SkumsImportProgressPanel, SkumsImportProvider } from '@/hooks/use-skums-import-job'

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <SkumsImportProvider>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl p-6">
            <Outlet />
          </div>
        </main>
        <SkumsImportProgressPanel />
      </SkumsImportProvider>
      <Toaster position="top-right" />
    </div>
  )
}
