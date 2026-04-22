import { NavLink, useMatch, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard, Building2, ShieldCheck, BookOpen, ClipboardList,
  Monitor, Map, DollarSign, Target, BarChart3, FileText, Settings,
  ChevronLeft, ChevronRight, ChevronDown, Package, AppWindow,
  Users, CheckSquare, UserCog, ListChecks, ShoppingCart,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '../lib/cn'
import { useAuth } from '../hooks/useAuth'

// ─── Global nav items (Assessments/Recommendations/Roadmap/Budget/EOS live in client sidebar) ──
const globalNavItems = [
  { to: '/',            icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients',     icon: Building2,       label: 'Clients' },
  {
    icon: Monitor, label: 'Assets', key: 'assets',
    children: [
      { to: '/assets',        icon: Monitor,   label: 'Hardware' },
      { to: '/saas-licenses', icon: Package,   label: 'SaaS Licenses' },
      { to: '/software',      icon: AppWindow, label: 'Software' },
    ],
  },
  { to: '/orders',      icon: ShoppingCart, label: 'Orders' },
  { to: '/standards',   icon: BookOpen,  label: 'Standards' },
  { to: '/analytics',   icon: BarChart3, label: 'Analytics' },
  { to: '/reports',     icon: FileText,  label: 'Reports' },
]

// ─── Client-specific nav items ────────────────────────────────────────────────
const clientNavItems = [
  { tab: 'overview',        icon: LayoutDashboard, label: 'Dashboard' },
  { tab: 'goals',           icon: Target,          label: 'Goals' },
  { tab: 'roadmap',         icon: Map,             label: 'Roadmap' },
  { tab: 'budget',          icon: DollarSign,      label: 'Budget' },
  { tab: 'assessments',     icon: ShieldCheck,     label: 'Assessments' },
  { tab: 'recommendations', icon: ClipboardList,   label: 'Recommendations' },
  { tab: 'contacts',        icon: Users,           label: 'Contacts' },
  { tab: 'activities',      icon: CheckSquare,     label: 'Activities' },
  { tab: 'profile',         icon: UserCog,         label: 'Profile' },
  { tab: 'standards',       icon: ListChecks,      label: 'Standards' },
  {
    key: 'client-assets', icon: Monitor, label: 'Assets',
    children: [
      { tab: 'hardware',      icon: Monitor,   label: 'Hardware' },
      { tab: 'saas-licenses', icon: Package,   label: 'SaaS Licenses' },
      { tab: 'software',      icon: AppWindow, label: 'Software' },
    ],
  },
]

export default function Sidebar({ mobileOpen = false, onMobileClose }) {
  const [collapsed, setCollapsed]   = useState(false)
  const [openGroups, setOpenGroups] = useState({ assets: true, 'client-assets': true })
  const { user, logout } = useAuth()
  const location = useLocation()

  // Detect if we're in a client context
  const clientMatch = useMatch('/clients/:id')
  const clientId    = clientMatch?.params?.id
  const searchParams = new URLSearchParams(location.search)
  const activeTab   = searchParams.get('tab') || 'overview'

  function toggleGroup(key) {
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))
  }
  function isGroupActive(children) {
    return children.some(c => location.pathname.startsWith(c.to || ''))
  }

  // ── Client sidebar ──────────────────────────────────────────────────────────
  if (clientId) {
    return (
      <aside className={cn(
        'fixed left-0 top-0 h-screen bg-sidebar text-white flex flex-col transition-all duration-200 z-[60]',
        // Desktop: collapsed or normal width
        collapsed ? 'md:w-16' : 'md:w-48',
        // Mobile: full-width drawer
        'w-64',
        // Mobile slide: hidden by default, visible when mobileOpen
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10 shrink-0">
          <div className="w-7 h-7 bg-accent-500 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0">A</div>
          {!collapsed && (
            <div className="flex items-baseline gap-0 leading-none">
              <span className="font-semibold text-sm text-white">predictive</span>
              <span className="font-bold text-sm text-accent-500">IT</span>
              <span className="text-[10px] text-primary-300 ml-1 font-medium">Align</span>
            </div>
          )}
        </div>

        {/* Back to clients */}
        {!collapsed && (
          <div className="flex items-center justify-between border-b border-white/10 shrink-0">
            <Link to="/clients" onClick={onMobileClose}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-gray-400 hover:text-white transition-colors flex-1">
              <ChevronLeft size={13} /> All Clients
            </Link>
            {/* Mobile close button */}
            <button onClick={onMobileClose} className="md:hidden px-4 py-2.5 text-gray-400 hover:text-white">
              <ChevronLeft size={16} />
            </button>
          </div>
        )}

        {/* Client nav */}
        <nav className="flex-1 py-1 overflow-y-auto">
          {clientNavItems.map((item) => {
            if (item.children) {
              const open = openGroups[item.key] !== false
              const Icon = item.icon
              const childActive = item.children.some(c => c.tab === activeTab)
              return (
                <div key={item.key}>
                  <button
                    onClick={() => !collapsed && toggleGroup(item.key)}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 mx-1.5 rounded-lg text-xs transition-colors w-[calc(100%-0.75rem)]',
                      childActive ? 'text-white' : 'text-gray-400 hover:bg-sidebar-hover hover:text-white'
                    )}>
                    <Icon size={16} className="shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left font-medium">{item.label}</span>
                        <ChevronDown size={11} className={cn('transition-transform', open ? '' : '-rotate-90')} />
                      </>
                    )}
                  </button>
                  {!collapsed && open && (
                    <div className="ml-3 border-l border-white/10 pl-2 mb-0.5">
                      {item.children.map(child => {
                        const CIcon = child.icon
                        const isActive = child.tab === activeTab
                        return (
                          <Link key={child.tab}
                            to={`/clients/${clientId}?tab=${child.tab}`}
                            className={cn(
                              'flex items-center gap-2 px-2.5 py-1.5 mx-0.5 rounded-lg text-xs transition-colors',
                              isActive ? 'bg-sidebar-active text-white' : 'text-gray-400 hover:bg-sidebar-hover hover:text-white'
                            )}>
                            <CIcon size={13} className="shrink-0" />
                            <span>{child.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }
            const Icon = item.icon
            const isActive = item.tab === activeTab
            return (
              <Link key={item.tab}
                to={`/clients/${clientId}?tab=${item.tab}`}
                onClick={onMobileClose}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 mx-1.5 rounded-lg text-xs font-medium transition-colors',
                  isActive ? 'bg-sidebar-active text-white' : 'text-gray-400 hover:bg-sidebar-hover hover:text-white'
                )}>
                <Icon size={16} className="shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* User + collapse */}
        <div className="border-t border-white/10 py-2 shrink-0">
          {user && !collapsed && (
            <div className="px-4 py-1.5 mb-1">
              <p className="text-xs text-gray-400 truncate">{user.display_name}</p>
              <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2.5 px-3 py-2 mx-1.5 rounded-lg text-xs text-gray-400 hover:bg-sidebar-hover hover:text-white w-[calc(100%-0.75rem)] transition-colors">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    )
  }

  // ── Global sidebar ──────────────────────────────────────────────────────────
  return (
    <aside className={cn(
      'fixed left-0 top-0 h-screen bg-sidebar text-white flex flex-col transition-all duration-200 z-[60]',
      collapsed ? 'md:w-16' : 'md:w-56',
      'w-64',
      mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10">
        <div className="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center font-bold text-sm text-white shrink-0">A</div>
        {!collapsed && (
          <div className="flex items-baseline gap-0.5">
            <span className="font-semibold text-lg tracking-tight text-white">predictive</span>
            <span className="font-bold text-lg tracking-tight text-accent-500">IT</span>
            <span className="text-xs text-primary-300 ml-1.5 font-medium">Align</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {globalNavItems.map((item) => {
          if (item.children) {
            const active = isGroupActive(item.children)
            const open   = openGroups[item.key] !== false
            const Icon   = item.icon
            return (
              <div key={item.key}>
                <button onClick={() => !collapsed && toggleGroup(item.key)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors w-[calc(100%-1rem)]',
                    active ? 'text-white' : 'text-gray-400 hover:bg-sidebar-hover hover:text-white'
                  )}>
                  <Icon size={20} className="shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown size={14} className={cn('transition-transform', open ? '' : '-rotate-90')} />
                    </>
                  )}
                </button>
                {!collapsed && open && (
                  <div className="ml-4 border-l border-white/10 pl-2 mb-1">
                    {item.children.map(child => {
                      const CIcon = child.icon
                      return (
                        <NavLink key={child.to} to={child.to} end onClick={onMobileClose}
                          className={({ isActive }) => cn(
                            'flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg text-xs transition-colors',
                            isActive ? 'bg-sidebar-active text-white' : 'text-gray-400 hover:bg-sidebar-hover hover:text-white'
                          )}>
                          <CIcon size={15} className="shrink-0" />
                          <span>{child.label}</span>
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }
          const Icon = item.icon
          return (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={onMobileClose}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors',
                isActive ? 'bg-sidebar-active text-white' : 'text-gray-400 hover:bg-sidebar-hover hover:text-white'
              )}>
              <Icon size={20} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          )
        })}
      </nav>

      {/* User + Settings + Collapse */}
      <div className="border-t border-white/10 py-2">
        {user && !collapsed && (
          <div className="px-4 py-2 mb-1">
            <p className="text-xs text-gray-400 truncate">{user.display_name}</p>
            <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
          </div>
        )}
        <NavLink to="/settings"
          className={({ isActive }) => cn(
            'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors',
            isActive ? 'bg-sidebar-active text-white' : 'text-gray-400 hover:bg-sidebar-hover hover:text-white'
          )}>
          <Settings size={20} className="shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        <button onClick={logout}
          className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm text-gray-400 hover:bg-sidebar-hover hover:text-white w-[calc(100%-1rem)] transition-colors">
          <ChevronLeft size={20} className="shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
        <button onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm text-gray-400 hover:bg-sidebar-hover hover:text-white w-[calc(100%-1rem)] transition-colors">
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
