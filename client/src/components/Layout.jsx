import { Outlet, useMatch } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import GlobalSearch from './GlobalSearch'
import OppDetailSlideOver from './OppDetailSlideOver'
import OrderDetailSlideOver from './OrderDetailSlideOver'

export default function Layout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [globalOppId, setGlobalOppId]     = useState(null)
  const [globalOrderId, setGlobalOrderId] = useState(null)
  const [searchOpen, setSearchOpen]       = useState(false)

  // "/" key opens search (when not typing in an input)
  useEffect(() => {
    function h(e) {
      if (e.key !== '/') return
      const tag = document.activeElement?.tagName?.toLowerCase()
      const editable = document.activeElement?.isContentEditable
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || editable) return
      e.preventDefault()
      setSearchOpen(true)
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  const clientMatch = useMatch('/clients/:id')
  const isClientView = !!clientMatch
  // Sidebar is 56 on global pages, 48 on client detail
  const sidebarW = isClientView ? 'md:left-48' : 'md:left-56'

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Persistent top bar ─────────────────────────────────────────── */}
      <div className={`fixed top-0 left-0 ${sidebarW} right-0 h-14 bg-white border-b border-gray-200 z-30 flex items-center gap-3 px-4 shadow-sm`}>
        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileNavOpen(true)}
          className="md:hidden text-gray-500 hover:text-gray-700 p-1"
        >
          <Menu size={22} />
        </button>

        {/* Mobile logo */}
        <div className="md:hidden flex items-baseline gap-0">
          <span className="font-semibold text-sm text-gray-800">predictive</span>
          <span className="font-bold text-sm text-accent-500">IT</span>
          <span className="text-[10px] text-primary-400 ml-1 font-medium">Align</span>
        </div>

        {/* Global search — always visible on desktop, hidden on mobile (use sidebar) */}
        <div className="hidden md:block flex-1 max-w-sm">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 bg-gray-50 border border-gray-200 rounded-lg hover:border-gray-300 hover:text-gray-500 transition-colors text-left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <span className="flex-1">Search everything…</span>
            <kbd className="text-[10px] text-gray-300 font-mono">/</kbd>
          </button>
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
        onSearchOpen={() => setSearchOpen(true)}
      />

      <main className={`
        ${isClientView ? 'md:ml-48' : 'md:ml-56'}
        pt-14
        p-4 md:p-8
      `}>
        <Outlet />
      </main>

      {/* Global search modal — triggered from top bar or keyboard / */}
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOppClick={id  => { setSearchOpen(false); setGlobalOppId(id) }}
        onOrderClick={id => { setSearchOpen(false); setGlobalOrderId(id) }}
      />

      {globalOppId && (
        <OppDetailSlideOver
          oppId={globalOppId}
          onClose={() => setGlobalOppId(null)}
          onOrderClick={id => { setGlobalOppId(null); setGlobalOrderId(id) }}
        />
      )}
      {globalOrderId && (
        <OrderDetailSlideOver
          orderId={globalOrderId}
          onClose={() => setGlobalOrderId(null)}
          onRefresh={() => {}}
          onOppClick={id => { setGlobalOrderId(null); setGlobalOppId(id) }}
        />
      )}
    </div>
  )
}
