import { useEffect, useState, useCallback } from 'react'
import {
  Monitor, Laptop, Server, Wifi, Shield, Router, HardDrive,
  Printer, Cpu, Box, Activity, Search, SlidersHorizontal,
  ExternalLink, ChevronUp, ChevronDown, AlertCircle, AlertTriangle,
  CheckCircle, Clock, X, RefreshCw, Edit2,
} from 'lucide-react'
import Card from '../components/Card'
import PageHeader from '../components/PageHeader'
import { api } from '../lib/api'
import AssetModal from '../components/AssetModal'

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

// ─── Warranty filter tabs ─────────────────────────────────────────────────────
const WARRANTY_FILTERS = [
  { key: 'all',            label: 'All' },
  { key: 'active',         label: 'Active' },
  { key: 'expiring_soon',  label: 'Expiring Soon' },
  { key: 'expired',        label: 'Expired' },
  { key: 'unknown',        label: 'Unknown' },
]

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Assets() {
  const [assets, setAssets]       = useState([])
  const [assetTypes, setAssetTypes] = useState([])
  const [clients, setClients]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [warrantyFilter, setWarrantyFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [managedFilter, setManagedFilter] = useState('all')
  const [sort, setSort]           = useState({ col: 'name', dir: 'asc' })
  const [selected, setSelected]   = useState(null) // asset for modal
  const [page, setPage]           = useState(0)
  const PAGE_SIZE = 100

  const loadData = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get('/assets?limit=2000'),
      api.get('/assets/types'),
      api.get('/clients'),
    ]).then(([aRes, tRes, cRes]) => {
      setAssets(aRes.data || [])
      setAssetTypes(tRes.data || [])
      setClients(cRes.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = assets.filter(a => {
    if (search) {
      const q = search.toLowerCase()
      if (!a.name?.toLowerCase().includes(q) &&
          !a.serial_number?.toLowerCase().includes(q) &&
          !a.client_name?.toLowerCase().includes(q) &&
          !a.manufacturer?.toLowerCase().includes(q) &&
          !a.model?.toLowerCase().includes(q)) return false
    }
    if (typeFilter !== 'all' && a.asset_type_name !== typeFilter) return false
    if (clientFilter && a.client_id !== clientFilter) return false
    if (managedFilter === 'managed' && !a.is_managed) return false
    if (managedFilter === 'unmanaged' && a.is_managed) return false
    if (sourceFilter === 'rmm' && !a.datto_rmm_device_id) return false
    if (sourceFilter === 'itg' && !a.it_glue_config_id) return false
    if (sourceFilter === 'multi' && (!!a.datto_rmm_device_id + !!a.it_glue_config_id + !!a.autotask_ci_id + !!a.auvik_device_id) < 2) return false
    if (warrantyFilter !== 'all') {
      const exp = a.warranty_expiry ? new Date(a.warranty_expiry) : null
      const now = new Date()
      if (warrantyFilter === 'unknown' && exp) return false
      if (warrantyFilter === 'expired' && (!exp || exp >= now)) return false
      if (warrantyFilter === 'expiring_soon' && (!exp || exp < now || exp > new Date(now.getTime() + 90*86400000))) return false
      if (warrantyFilter === 'active' && (!exp || exp < now || exp <= new Date(now.getTime() + 90*86400000))) return false
    }
    return true
  })

  // ── Sorting ────────────────────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    let av = a[sort.col] ?? '', bv = b[sort.col] ?? ''
    if (sort.col === 'warranty_expiry' || sort.col === 'purchase_date') {
      av = av ? new Date(av).getTime() : 0
      bv = bv ? new Date(bv).getTime() : 0
    }
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sort.dir === 'asc' ? cmp : -cmp
  })

  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)

  // ── Type counts for sidebar ────────────────────────────────────────────────
  const typeCounts = {}
  for (const a of assets) typeCounts[a.asset_type_name || 'Other'] = (typeCounts[a.asset_type_name || 'Other'] || 0) + 1

  // ── Warranty counts for tabs ───────────────────────────────────────────────
  const warrantyCounts = { all: filtered.length, active: 0, expiring_soon: 0, expired: 0, unknown: 0 }
  for (const a of filtered) {
    const exp = a.warranty_expiry ? new Date(a.warranty_expiry) : null
    const now = new Date()
    if (!exp) warrantyCounts.unknown++
    else if (exp < now) warrantyCounts.expired++
    else if (exp <= new Date(now.getTime() + 90*86400000)) warrantyCounts.expiring_soon++
    else warrantyCounts.active++
  }

  function handleSave(updated) {
    setAssets(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
    setSelected(prev => prev ? { ...prev, ...updated } : prev)
  }

  const typeOrder = ['Workstation','Laptop','Server','Switch','Firewall','Router',
    'Access Point','UPS','NAS/SAN','Printer','Virtual Machine','Monitor','Other']

  return (
    <div className="flex gap-6">
      {/* ── Type filter sidebar ──────────────────────────────────────────── */}
      <aside className="w-48 shrink-0">
        <div className="sticky top-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Asset Type</h3>
          <nav className="space-y-0.5">
            <button
              onClick={() => { setTypeFilter('all'); setPage(0) }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${typeFilter === 'all' ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <span>All Types</span>
              <span className="text-xs text-gray-400">{Object.values(typeCounts).reduce((s, n) => s + n, 0)}</span>
            </button>
            {typeOrder.map(t => {
              const cnt = typeCounts[t] || 0
              if (cnt === 0) return null
              const cfg = TYPE_ICONS[t] || TYPE_ICONS['Other']
              const Icon = cfg.icon
              return (
                <button
                  key={t}
                  onClick={() => { setTypeFilter(t); setPage(0) }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${typeFilter === t ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <span className="flex items-center gap-2">
                    <Icon size={13} className={typeFilter === t ? cfg.color : 'text-gray-400'} />
                    {t}
                  </span>
                  <span className="text-xs text-gray-400">{cnt}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <PageHeader
          title={typeFilter === 'all' ? 'All Assets' : typeFilter}
          description={`${sorted.length.toLocaleString()} asset${sorted.length !== 1 ? 's' : ''}`}
        />

        {/* ── Warranty tabs ──────────────────────────────────────────────── */}
        <div className="flex border-b border-gray-200 mb-4 gap-0.5">
          {WARRANTY_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => { setWarrantyFilter(f.key); setPage(0) }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                warrantyFilter === f.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
              <span className="ml-1.5 text-xs text-gray-400">
                {f.key === 'all' ? sorted.length : (warrantyCounts[f.key] || 0)}
              </span>
            </button>
          ))}
        </div>

        {/* ── Filters bar ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, serial, client..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
          </div>

          {/* Client filter */}
          <select
            value={clientFilter}
            onChange={e => { setClientFilter(e.target.value); setPage(0) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
          >
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Source filter */}
          <select
            value={sourceFilter}
            onChange={e => { setSourceFilter(e.target.value); setPage(0) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
          >
            <option value="all">All Sources</option>
            <option value="rmm">In Datto RMM</option>
            <option value="itg">In IT Glue</option>
            <option value="multi">Multi-source</option>
          </select>

          {/* Managed filter */}
          <select
            value={managedFilter}
            onChange={e => { setManagedFilter(e.target.value); setPage(0) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
          >
            <option value="all">All Tracking</option>
            <option value="managed">Tracked</option>
            <option value="unmanaged">Untracked</option>
          </select>

          <button onClick={loadData} className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50" title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>

        {/* ── Asset table ─────────────────────────────────────────────────── */}
        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading assets...</div>
        ) : sorted.length === 0 ? (
          <Card className="py-16 text-center text-gray-400">No assets match your filters</Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <SortHeader label="Name"         col="name"           sort={sort} setSort={setSort} />
                    <SortHeader label="Client"       col="client_name"    sort={sort} setSort={setSort} />
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2 whitespace-nowrap">Type</th>
                    <SortHeader label="OS / Model"   col="operating_system" sort={sort} setSort={setSort} />
                    <SortHeader label="Serial #"     col="serial_number"  sort={sort} setSort={setSort} />
                    <SortHeader label="Warranty"     col="warranty_expiry" sort={sort} setSort={setSort} />
                    <SortHeader label="Purchase"     col="purchase_date"  sort={sort} setSort={setSort} />
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2 whitespace-nowrap">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2 whitespace-nowrap">Sources</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paged.map(asset => {
                    const rmm = asset.datto_rmm_data || {}
                    const patchStatus = rmm.patchManagement?.patchStatus || asset.patch_status
                    const os = asset.operating_system || rmm.operatingSystem
                    const osShort = os ? os.replace(/Microsoft Windows /i, 'Win ').replace(/ \d+\.\d+\.\d+$/, '') : null

                    return (
                      <tr
                        key={asset.id}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => setSelected(asset)}
                      >
                        {/* Name */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <TypeIcon typeName={asset.asset_type_name} size={13} />
                            <div>
                              <p className="font-medium text-gray-900 whitespace-nowrap">{asset.name}</p>
                              {asset.is_online !== null && (
                                <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                                  <span className={`w-1.5 h-1.5 rounded-full ${asset.is_online ? 'bg-green-400' : 'bg-gray-300'}`} />
                                  {asset.is_online ? 'Online' : 'Offline'}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Client */}
                        <td className="px-3 py-2.5">
                          <span className="text-gray-600 whitespace-nowrap text-xs">{asset.client_name}</span>
                        </td>

                        {/* Type */}
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-gray-600 whitespace-nowrap">{asset.asset_type_name || '—'}</span>
                        </td>

                        {/* OS / Model */}
                        <td className="px-3 py-2.5 max-w-[200px]">
                          {osShort && <p className="text-xs text-gray-600 truncate">{osShort}</p>}
                          {(asset.manufacturer || asset.model) && (
                            <p className="text-xs text-gray-400 truncate">{[asset.manufacturer, asset.model].filter(Boolean).join(' ')}</p>
                          )}
                        </td>

                        {/* Serial */}
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-gray-500 font-mono whitespace-nowrap">{asset.serial_number || '—'}</span>
                        </td>

                        {/* Warranty */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <WarrantyBadge expiry={asset.warranty_expiry} />
                        </td>

                        {/* Purchase */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="text-xs text-gray-500">
                            {asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '—'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col gap-0.5">
                            {patchStatus && <PatchBadge status={patchStatus} />}
                            {!asset.is_managed && (
                              <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Untracked</span>
                            )}
                          </div>
                        </td>

                        {/* Sources */}
                        <td className="px-3 py-2.5">
                          <SourcePills asset={asset} />
                        </td>

                        {/* Edit */}
                        <td className="px-3 py-2.5">
                          <button
                            onClick={e => { e.stopPropagation(); setSelected(asset) }}
                            className="p-1 rounded text-gray-300 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                          >
                            <Edit2 size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length.toLocaleString()}</span>
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

      {/* ── Asset detail/edit modal ────────────────────────────────────────── */}
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
