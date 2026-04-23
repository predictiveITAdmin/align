import { Outlet, useMatch } from 'react-router-dom'
import { useState } from 'react'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import OppDetailSlideOver from './OppDetailSlideOver'
import OrderDetailSlideOver from './OrderDetailSlideOver'

export default function Layout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [globalOppId, setGlobalOppId] = useState(null)
  const [globalOrderId, setGlobalOrderId] = useState(null)
  const clientMatch = useMatch('/clients/:id')
  const isClientView = !!clientMatch

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile top bar — only visible on small screens */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar z-[55] flex items-center px-4 gap-3 shadow-md">
        <button onClick={() => setMobileNavOpen(true)} className="text-white p-1">
          <Menu size={22} />
        </button>
        <div className="flex items-baseline gap-0.5">
          <span className="font-semibold text-base text-white">predictive</span>
          <span className="font-bold text-base text-accent-500">IT</span>
          <span className="text-xs text-primary-300 ml-1.5 font-medium">Align</span>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileNavOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-[59]"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <Sidebar
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        onOppClick={setGlobalOppId}
        onOrderClick={setGlobalOrderId}
      />

      <main className={`
        ${isClientView ? 'md:ml-48' : 'md:ml-56'}
        pt-14 md:pt-0
        p-4 md:p-8
      `}>
        <Outlet />
      </main>

      {globalOppId && (
        <OppDetailSlideOver
          oppId={globalOppId}
          onClose={() => setGlobalOppId(null)}
          onOrderClick={setGlobalOrderId}
        />
      )}
      {globalOrderId && (
        <OrderDetailSlideOver
          orderId={globalOrderId}
          onClose={() => setGlobalOrderId(null)}
          onRefresh={() => {}}
        />
      )}
    </div>
  )
}
