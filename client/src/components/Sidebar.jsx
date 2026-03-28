import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  ShieldCheck,
  ClipboardList,
  Monitor,
  Map,
  DollarSign,
  Target,
  BarChart3,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '../lib/cn'
import { useAuth } from '../hooks/useAuth'

const navItems = [
  { to: '/',               icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients',        icon: Building2,       label: 'Clients' },
  { to: '/assessments',    icon: ShieldCheck,     label: 'Assessments' },
  { to: '/recommendations',icon: ClipboardList,   label: 'Recommendations' },
  { to: '/assets',         icon: Monitor,         label: 'Assets' },
  { to: '/roadmap',        icon: Map,             label: 'Roadmap' },
  { to: '/budget',         icon: DollarSign,      label: 'Budget' },
  { to: '/eos',            icon: Target,          label: 'EOS' },
  { to: '/analytics',      icon: BarChart3,       label: 'Analytics' },
  { to: '/reports',        icon: FileText,        label: 'Reports' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, logout } = useAuth()

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-sidebar text-white flex flex-col transition-all duration-200 z-50',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10">
        <div className="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center font-bold text-sm text-white shrink-0">
          A
        </div>
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
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-active text-white'
                  : 'text-gray-400 hover:bg-sidebar-hover hover:text-white'
              )
            }
          >
            <Icon size={20} className="shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User + Settings + Collapse */}
      <div className="border-t border-white/10 py-2">
        {user && !collapsed && (
          <div className="px-4 py-2 mb-1">
            <p className="text-xs text-gray-400 truncate">{user.display_name}</p>
            <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
          </div>
        )}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors',
              isActive
                ? 'bg-sidebar-active text-white'
                : 'text-gray-400 hover:bg-sidebar-hover hover:text-white'
            )
          }
        >
          <Settings size={20} className="shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm text-gray-400 hover:bg-sidebar-hover hover:text-white w-[calc(100%-1rem)] transition-colors"
        >
          <ChevronLeft size={20} className="shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm text-gray-400 hover:bg-sidebar-hover hover:text-white w-[calc(100%-1rem)] transition-colors"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
