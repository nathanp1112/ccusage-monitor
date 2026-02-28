import { Sidebar } from '@/components/layout/sidebar'
import { Navbar } from '@/components/layout/navbar'
import { AuthGuard } from '@/components/layout/auth-guard'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Navbar />
          <main id="main-content" className="flex-1 p-6" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}
