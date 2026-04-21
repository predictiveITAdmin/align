import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Monitor, Laptop, Server, Wifi, Shield, Router, HardDrive,
  Printer, Cpu, Box, Activity, Search, Cloud,
  ExternalLink, X, RefreshCw, SlidersHorizontal, ChevronDown,
} from 'lucide-react'
import Card from '../components/Card'
import PageHeader from '../components/PageHeader'
import { api } from '../lib/api'
import AssetModal from '../components/AssetModal'
import HardwareTable from '../components/HardwareTable'

// ─── Type icon map ────────────────────────────────────────────────────────────
const TYPE_ICONS = {
  'Workstation':    { icon: Monitor,   color: 'text-primary-600', bg: 'bg-primary-50' },
  'Laptop':         { icon: Laptop,    color: 'text-primary-600', bg: 'bg-primary-50' },
  'Server':         { icon: Server,    color: 'text-blue-600',    bg: 'bg-blue-50' },
  'Switch':         { icon: Wifi,      color: 'text-purple-600',  bg: 'bg-purple-50' },
  'Firewall':       { icon: Shield,    color: 'text-red-600',     bg: 'bg-red-50' },
  'Router':         { icon: Router,    color: 'text-orange-600',  bg: 'bg-orange-50' },
  'Access Point':   { icon: Wifi,      color: 'text-teal-600',    bg: 'bg-teal-50' },
  'UPS':            { icon: Activity,  color: 'text-yellow-600',  bg: 'bg-yellow-50' },
  'NAS/SAN':        { icon: HardDrive, color: 'text-gray-600',    bg: 'bg-gray-50' },
  'Printer':        { icon: Printer,   color: 'text-gray-600',    bg: 'bg-gray-100' },
  'Virtual Machine':{ icon: Cpu,       color: 'text-sky-600',     bg: 'bg-sky-50' },
  'Monitor':        { icon: Monitor,   color: 'text-gray-400',    bg: 'bg-gray-50' },
  'Other':          { icon: Box,       color: 'text-gray-400',    bg: 'bg-gray-50' },
}

function TypeIcon({ typeName, size = 14 }) {
  const cfg = TYPE_ICONS[typeName] || TYPE_ICONS['Other']
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${cfg.bg}`}>
      <Icon size={size} className={cfg.color} />
    </span>
  )
}

// ─── Warranty badge ───────────────────────────────────────────────────────────
function WarrantyBadge({ expiry }) {
  if (!expiry) return <span className="text-xs text-gray-400">Unknown</span>
  const d = new Date(expiry)
  const now = new Date()
  const days = Math.round((d - now) / 86400000)
  if (days < 0) return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 rounded px-1.5 py-0.5">
      <AlertCircle size={10} /> Expired
    </span>
  )
  if (days < 90) return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-50 rounded px-1.5 py-0.5">
      <AlertTriangle size={10} /> {days}d left
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 rounded px-1.5 py-0.5">
      <CheckCircle size={10} /> {d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
    </span>
  )
}

// ─── Patch / AV badges ───────────────────────────────────────────────────────
function PatchBadge({ status }) {
  if (!status) return null
  const s = status.toLowerCase()
  if (s === 'fullypatched' || s === 'compliant') return <span className="text-xs text-green-700 bg-green-50 rounded px-1.5 py-0.5">Patched</span>
  if (s === 'notcompliant' || s.includes('not compliant')) return <span className="text-xs text-red-700 bg-red-50 rounded px-1.5 py-0.5">Unpatched</span>
  return <span className="text-xs text-yellow-700 bg-yellow-50 rounded px-1.5 py-0.5">{status}</span>
}

// ─── Source pills ─────────────────────────────────────────────────────────────
function SourcePills({ asset }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {asset.autotask_ci_id && <span className="text-xs bg-gray-100 text-gray-500 rounded px-1 py-0.5 font-medium">PSA</span>}
      {asset.datto_rmm_device_id && (
        <a href={asset.datto_rmm_data?.portalUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 text-xs bg-primary-50 text-primary-700 border border-primary-200 rounded px-1 py-0.5 font-medium hover:bg-primary-100">
          RMM <ExternalLink size={9} />
        </a>
      )}
      {asset.it_glue_config_id && (
        asset.it_glue_data?.attributes?.['resource-url'] ? (
          <a href={asset.it_glue_data.attributes['resource-url']} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded px-1 py-0.5 font-medium hover:bg-green-100">
            ITG <ExternalLink size={9} />
          </a>
        ) : <span className="text-xs bg-green-50 text-green-700 rounded px-1 py-0.5 font-medium">ITG</span>
      )}
      {asset.auvik_device_id && <span className="text-xs bg-purple-50 text-purple-700 rounded px-1 py-0.5 font-medium">Auvik</span>}
    </div>
  )
}

// ─── Sort helper ──────────────────────────────────────────────────────────────
function SortHeader({ label, col, sort, setSort }) {
  const active = sort.col === col
  return (
    <th
      className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2 cursor-pointer select-none hover:text-gray-700 whitespace-nowrap"
      onClick={() => setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronDown size={12} className="text-gray-300" />}
      </span>
    </th>
  )
}

// ─── Hardware Tab ─────────────────────────────────────────────────────────────
const TYPE_ICONS_SIDEBAR = {
  'Workstation':    { icon: Monitor,   color: 'text-primary-600' },
  'Laptop':         { icon: Laptop,    color: 'text-primary-600' },
  'Server':         { icon: Server,    color: 'text-blue-600' },
  'Switch':         { icon: Wifi,      color: 'text-purple-600' },
  'Firewall':       { icon: Shield,    color: 'text-red-600' },
  'Router':         { icon: Router,    color: 'text-orange-600' },
  'Access Point':   { icon: Wifi,      color: 'text-teal-600' },
  'UPS':            { icon: Activity,  color: 'text-yellow-600' },
  'NAS/SAN':        { icon: HardDrive, color: 'text-gray-600' },
  'Printer':        { icon: Printer,   color: 'text-gray-600' },
  'Virtual Machine':{ icon: Cpu,       color: 'text-sky-600' },
  'Monitor':        { icon: Monitor,   color: 'text-gray-400' },
  'Other':          { icon: Box,       color: 'text-gray-400' },
}

// ─── Lifecycle filter config ──────────────────────────────────────────────────
const LIFECYCLE_FILTERS = [
  { key: 'active',        label: 'All Active' },
  { key: 'expiring_soon', label: 'Expiring Soon' },
  { key: 'expired',       label: 'Expired' },
  { key: 'eol_soon',      label: 'EOL Soon' },
  { key: 'eol',           label: 'EOL' },
  { key: 'decommissioned',label: 'Decommissioned' },
]

// Compute effective EOL date: use eol_date if set, else purchase_date + default_lifecycle_years
function getEolDate(asset) {
  if (asset.eol_date) return new Date(asset.eol_date)
  if (asset.purchase_date && asset.default_lifecycle_years) {
    const d = new Date(asset.purchase_date)
    d.setFullYear(d.getFullYear() + parseInt(asset.default_lifecycle_years))
    return d
  }
  return null
}

function HardwareTab({ clientId }) {
  const [assets, setAssets]                     = useState([])
  const [decommAssets, setDecommAssets]         = useState([])
  const [assetTypes, setAssetTypes]             = useState([])
  const [clients, setClients]                   = useState([])
  const [loading, setLoading]                   = useState(true)
  const [search, setSearch]                     = useState('')
  const [typeFilter, setTypeFilter]             = useState('all')
  const [lifecycleFilter, setLifecycleFilter]   = useState('active')
  const [clientFilter, setClientFilter]         = useState(clientId || '')
  const [selected, setSelected]                 = useState(null)
  const [decommLoaded, setDecommLoaded]         = useState(false)
  const [sidebarOpen, setSidebarOpen]           = useState(false)

  const loadData = useCallback(() => {
    setLoading(true)
    const url = clientId ? `/assets?client_id=${clientId}&limit=2000` : '/assets?limit=5000'
    Promise.all([
      api.get(url),
      api.get('/assets/types'),
      ...(clientId ? [] : [api.get('/clients')]),
    ]).then(([aRes, tRes, cRes]) => {
      setAssets(aRes.data || [])
      setAssetTypes(tRes.data || [])
      if (cRes) setClients(cRes.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [clientId])

  // Load decommissioned assets lazily when that tab is selected
  const loadDecomm = useCallback(() => {
    if (decommLoaded) return
    const url = clientId ? `/assets?lifecycle=decommissioned&client_id=${clientId}&limit=2000` : '/assets?lifecycle=decommissioned&limit=5000'
    api.get(url).then(r => {
      setDecommAssets(r.data || [])
      setDecommLoaded(true)
    }).catch(console.error)
  }, [clientId, decommLoaded])

  useEffect(() => {
    if (lifecycleFilter === 'decommissioned') loadDecomm()
  }, [lifecycleFilter, loadDecomm])

  useEffect(() => { loadData() }, [loadData])

  // ── Base pool: active assets or decommissioned ─────────────────────────────
  const baseAssets = lifecycleFilter === 'decommissioned' ? decommAssets : assets

  // ── Pre-filter (search + type sidebar + lifecycle tabs + client) ───────────
  const preFiltered = useMemo(() => {
    const now = new Date()
    const soon12mo = new Date(now.getTime() + 365 * 86400000)
    const warningSoon = new Date(now.getTime() + 90 * 86400000)
    return baseAssets.filter(a => {
      if (search) {
        const q = search.toLowerCase()
        if (!a.name?.toLowerCase().includes(q) &&
            !a.serial_number?.toLowerCase().includes(q) &&
            !a.client_name?.toLowerCase().includes(q) &&
            !a.hostname?.toLowerCase().includes(q) &&
            !a.last_user?.toLowerCase().includes(q) &&
            !a.manufacturer?.toLowerCase().includes(q) &&
            !a.model?.toLowerCase().includes(q)) return false
      }
      if (typeFilter !== 'all' && a.asset_type_name !== typeFilter) return false
      if (clientFilter && a.client_id !== clientFilter) return false
      // Lifecycle tab filters
      if (lifecycleFilter === 'decommissioned') return true // already filtered by API
      if (lifecycleFilter === 'expiring_soon') {
        const exp = a.warranty_expiry ? new Date(a.warranty_expiry) : null
        return exp && exp >= now && exp <= warningSoon
      }
      if (lifecycleFilter === 'expired') {
        const exp = a.warranty_expiry ? new Date(a.warranty_expiry) : null
        return exp && exp < now
      }
      if (lifecycleFilter === 'eol_soon') {
        const eol = getEolDate(a)
        return eol && eol > now && eol <= soon12mo
      }
      if (lifecycleFilter === 'eol') {
        const eol = getEolDate(a)
        return eol && eol <= now
      }
      return true // 'active' — show all active assets
    })
  }, [baseAssets, search, typeFilter, clientFilter, lifecycleFilter])

  // Type counts for sidebar (based on active assets)
  const typeCounts = useMemo(() => {
    const map = {}
    for (const a of assets) map[a.asset_type_name || 'Other'] = (map[a.asset_type_name || 'Other'] || 0) + 1
    return map
  }, [assets])

  // Lifecycle tab counts
  const lifecycleCounts = useMemo(() => {
    const now = new Date()
    const soon12mo = new Date(now.getTime() + 365 * 86400000)
    const warningSoon = new Date(now.getTime() + 90 * 86400000)
    const counts = { active: 0, expiring_soon: 0, expired: 0, eol_soon: 0, eol: 0, decommissioned: decommAssets.length }
    for (const a of assets) {
      counts.active++
      const exp = a.warranty_expiry ? new Date(a.warranty_expiry) : null
      const eol = getEolDate(a)
      if (exp && exp >= now && exp <= warningSoon) counts.expiring_soon++
      if (exp && exp < now) counts.expired++
      if (eol && eol > now && eol <= soon12mo) counts.eol_soon++
      if (eol && eol <= now) counts.eol++
    }
    return counts
  }, [assets, decommAssets])

  function handleSave(updated) {
    setAssets(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
    setSelected(prev => prev ? { ...prev, ...updated } : prev)
  }

  function handleBulkUpdate(action, updatedIds) {
    const idSet = new Set(updatedIds)
    if (action === 'mark_inactive') {
      setAssets(prev => prev.filter(a => !idSet.has(a.id)))
      setDecommLoaded(false) // Force decomm refresh next time
    } else if (action === 'mark_active') {
      setDecommAssets(prev => prev.filter(a => !idSet.has(a.id)))
      loadData()
    } else {
      loadData()
    }
  }

  const typeOrder = ['Workstation','Laptop','Server','Switch','Firewall','Router',
    'Access Point','UPS','NAS/SAN','Printer','Virtual Machine','Monitor','Other']

  const totalTypeCount = Object.values(typeCounts).reduce((s, n) => s + n, 0)
  const activeTypeLabel = typeFilter === 'all' ? `All Types (${totalTypeCount})` : `${typeFilter} (${typeCounts[typeFilter] || 0})`

  // Sidebar content — shared between desktop and mobile drawer
  const sidebarContent = (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
        {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X size={12} /></button>}
      </div>

      {/* Client filter (global view only) */}
      {!clientId && clients.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-1">Client</p>
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Asset type filter */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-1">Type</p>
        <nav className="space-y-0.5">
          <button onClick={() => { setTypeFilter('all'); setSidebarOpen(false) }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors ${typeFilter === 'all' ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
            <span>All Types</span>
            <span className="text-xs text-gray-400">{totalTypeCount}</span>
          </button>
          {typeOrder.map(t => {
            const cnt = typeCounts[t] || 0
            if (cnt === 0) return null
            const cfg = TYPE_ICONS_SIDEBAR[t] || TYPE_ICONS_SIDEBAR['Other']
            const Icon = cfg.icon
            return (
              <button key={t} onClick={() => { setTypeFilter(t); setSidebarOpen(false) }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors ${typeFilter === t ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                <span className="flex items-center gap-1.5">
                  <Icon size={12} className={typeFilter === t ? cfg.color : 'text-gray-400'} />
                  {t}
                </span>
                <span className="text-xs text-gray-400">{cnt}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Refresh */}
      <button onClick={() => { loadData(); setSidebarOpen(false) }}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
        <RefreshCw size={12} /> Refresh
      </button>
    </div>
  )

  return (
    <div>
      {/* ── Mobile: filter toggle bar ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 md:hidden">
        <button onClick={() => setSidebarOpen(v => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50">
          <SlidersHorizontal size={14} />
          {activeTypeLabel}
          <ChevronDown size={12} className={`transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
        </button>
        {search && (
          <span className="text-xs bg-primary-50 text-primary-700 px-2 py-1 rounded-full">
            "{search}" <button onClick={() => setSearch('')} className="ml-1 text-primary-400"><X size={10} /></button>
          </span>
        )}
      </div>

      {/* ── Mobile: collapsible filter drawer ─────────────────────────────── */}
      {sidebarOpen && (
        <div className="mb-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm md:hidden">
          {sidebarContent}
        </div>
      )}

      <div className="flex gap-6">
        {/* ── Desktop sidebar (hidden on mobile) ───────────────────────────── */}
        <aside className="w-44 shrink-0 hidden md:block">
          <div className="sticky top-4">
            {sidebarContent}
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Lifecycle tabs — horizontally scrollable on mobile */}
          <div className="flex border-b border-gray-200 mb-4 gap-0.5 overflow-x-auto scrollbar-hide">
            {LIFECYCLE_FILTERS.map(f => {
              const count = lifecycleCounts[f.key] ?? 0
              const isDecomm = f.key === 'decommissioned'
              return (
                <button key={f.key}
                  onClick={() => setLifecycleFilter(f.key)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0 ${
                    lifecycleFilter === f.key
                      ? isDecomm ? 'border-gray-500 text-gray-600' : 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {f.label}
                  <span className={`ml-1.5 text-xs ${
                    f.key === 'expired' || f.key === 'eol' ? 'text-red-400' :
                    f.key === 'expiring_soon' || f.key === 'eol_soon' ? 'text-amber-400' :
                    'text-gray-400'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mr-3" />
              <span className="text-sm">Loading assets…</span>
            </div>
          ) : (
            <HardwareTable
              assets={preFiltered}
              assetTypes={assetTypes}
              clients={clients}
              onRowClick={setSelected}
              onBulkUpdate={handleBulkUpdate}
            />
          )}
        </div>
      </div>

      {/* Asset detail modal */}
      {selected && (
        <AssetModal
          asset={selected}
          assetTypes={assetTypes}
          onClose={() => setSelected(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

// ─── Software Tab ─────────────────────────────────────────────────────────────
function SoftwareTab() {
  const [software, setSoftware]   = useState([])
  const [clients, setClients]     = useState([])
  const [vendors, setVendors]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [sort, setSort]           = useState({ col: 'device_count', dir: 'desc' })
  const PAGE_SIZE = 100
  const [page, setPage]           = useState(0)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get('/software?limit=5000'),
      api.get('/software/vendors'),
      api.get('/clients'),
    ]).then(([swRes, vRes, cRes]) => {
      setSoftware(swRes.data || [])
      setVendors(vRes.data || [])
      setClients(cRes.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = software.filter(s => {
    if (search && !s.name?.toLowerCase().includes(search.toLowerCase()) && !s.vendor?.toLowerCase().includes(search.toLowerCase())) return false
    if (clientFilter && s.client_id !== clientFilter) return false
    if (vendorFilter && s.vendor !== vendorFilter) return false
    return true
  })

  // Group by name+version across clients
  const grouped = {}
  for (const s of filtered) {
    const key = `${s.name}||${s.version || ''}`
    if (!grouped[key]) grouped[key] = { name: s.name, version: s.version, vendor: s.vendor, device_count: 0, client_ids: new Set() }
    grouped[key].device_count++
    grouped[key].client_ids.add(s.client_id)
  }
  let rows = Object.values(grouped).map(r => ({ ...r, client_count: r.client_ids.size }))

  // Sort
  rows = rows.sort((a, b) => {
    const av = a[sort.col] ?? 0, bv = b[sort.col] ?? 0
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv
    return sort.dir === 'asc' ? cmp : -cmp
  })

  const totalPages = Math.ceil(rows.length / PAGE_SIZE)
  const paged = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function SortTh({ label, col }) {
    const active = sort.col === col
    return (
      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2 cursor-pointer select-none hover:text-gray-700 whitespace-nowrap"
        onClick={() => { setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' }); setPage(0) }}>
        <span className="inline-flex items-center gap-1">
          {label}
          {active ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronDown size={12} className="text-gray-300" />}
        </span>
      </th>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search software or vendor..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
        <select value={clientFilter} onChange={e => { setClientFilter(e.target.value); setPage(0) }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400">
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={vendorFilter} onChange={e => { setVendorFilter(e.target.value); setPage(0) }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400">
          <option value="">All Vendors</option>
          {vendors.map(v => v.vendor && <option key={v.vendor} value={v.vendor}>{v.vendor}</option>)}
        </select>
        <button onClick={load} className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600"><RefreshCw size={14} /></button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading software inventory...</div>
      ) : rows.length === 0 ? (
        <Card className="py-16 text-center text-gray-400">
          {software.length === 0 ? 'No software data yet — run a Software sync from the Sync page' : 'No results match your filters'}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-400">{rows.length.toLocaleString()} unique applications · {software.length.toLocaleString()} total installs</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <SortTh label="Application" col="name" />
                  <SortTh label="Version" col="version" />
                  <SortTh label="Vendor" col="vendor" />
                  <SortTh label="Devices" col="device_count" />
                  <SortTh label="Clients" col="client_count" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paged.map((s, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5"><p className="font-medium text-gray-900">{s.name}</p></td>
                    <td className="px-3 py-2.5"><span className="text-xs text-gray-500 font-mono">{s.version || '—'}</span></td>
                    <td className="px-3 py-2.5"><span className="text-xs text-gray-600">{s.vendor || '—'}</span></td>
                    <td className="px-3 py-2.5"><span className="text-xs font-medium text-primary-700 bg-primary-50 rounded px-1.5 py-0.5">{s.device_count}</span></td>
                    <td className="px-3 py-2.5"><span className="text-xs text-gray-500">{s.client_count}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length.toLocaleString()}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">← Prev</button>
                <span>{page + 1} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next →</button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

// ─── SaaS Licenses Tab ────────────────────────────────────────────────────────
function SaaSTab() {
  const [licenses, setLicenses] = useState([])
  const [clients, setClients]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [clientFilter, setClientFilter] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [search, setSearch]     = useState('')
  const [view, setView]         = useState('summary') // summary | users

  const PLATFORM_COLORS = {
    microsoft_365:    'bg-blue-50 text-blue-700 border-blue-200',
    google_workspace: 'bg-green-50 text-green-700 border-green-200',
  }
  const PLATFORM_LABELS = {
    microsoft_365:    'Microsoft 365',
    google_workspace: 'Google Workspace',
  }

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get('/saas-licenses?limit=5000'),
      api.get('/clients'),
    ]).then(([lRes, cRes]) => {
      setLicenses(lRes.data || [])
      setClients(cRes.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = licenses.filter(l => {
    if (clientFilter && l.client_id !== clientFilter) return false
    if (platformFilter && l.platform !== platformFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!l.user_email?.toLowerCase().includes(q) && !l.user_display_name?.toLowerCase().includes(q) && !l.license_name?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const platforms = [...new Set(licenses.map(l => l.platform).filter(Boolean))]

  // Summary: group by license
  const byLicense = {}
  for (const l of filtered) {
    const key = `${l.platform}||${l.license_sku || l.license_name}`
    if (!byLicense[key]) byLicense[key] = { ...l, count: 0 }
    byLicense[key].count++
  }
  const summaryRows = Object.values(byLicense).sort((a, b) => b.count - a.count)

  // Users view: group by email
  const byUser = {}
  for (const l of filtered) {
    if (!byUser[l.user_email]) byUser[l.user_email] = { ...l, licenses: [] }
    byUser[l.user_email].licenses.push(l.license_display_name || l.license_name)
  }
  const userRows = Object.values(byUser).sort((a, b) => (a.user_display_name || a.user_email).localeCompare(b.user_display_name || b.user_email))

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search user or license..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400">
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400">
          <option value="">All Platforms</option>
          {platforms.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p] || p}</option>)}
        </select>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {['summary','users'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm font-medium capitalize transition-colors ${view === v ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {v === 'summary' ? 'By License' : 'By User'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading SaaS licenses...</div>
      ) : view === 'summary' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {summaryRows.length === 0 ? (
            <div className="col-span-3 text-center py-12 text-gray-400">No license data</div>
          ) : summaryRows.map((s, i) => (
            <Card key={i}>
              <div className="p-4 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.license_display_name || s.license_name}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded border mt-1 inline-block ${PLATFORM_COLORS[s.platform] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                    {PLATFORM_LABELS[s.platform] || s.platform}
                  </span>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <span className="text-2xl font-bold text-gray-900">{s.count}</span>
                  <p className="text-xs text-gray-400">users</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-gray-50">
            {userRows.length === 0 ? (
              <div className="text-center py-12 text-gray-400">No license data</div>
            ) : userRows.map(user => (
              <div key={user.user_email} className="px-4 py-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                  {(user.user_display_name || user.user_email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{user.user_display_name || user.user_email}</p>
                  {user.user_display_name && <p className="text-xs text-gray-400">{user.user_email}</p>}
                  <p className="text-xs text-gray-400">{user.client_name}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {user.licenses.map((lic, i) => (
                      <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">{lic}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Root Assets Page ─────────────────────────────────────────────────────────
const ASSET_PAGE_TABS = [
  { key: 'hardware', label: 'Hardware' },
  { key: 'software', label: 'Software' },
]

export default function Assets() {
  const [tab, setTab] = useState('hardware')
  return (
    <div>
      <PageHeader title="Assets" description="Hardware and software across all clients" />
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6 gap-0.5">
        {ASSET_PAGE_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'hardware' && <HardwareTab />}
      {tab === 'software' && <SoftwareTab />}
    </div>
  )
}
