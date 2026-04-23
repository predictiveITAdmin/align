import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Target, Search, RefreshCw, X, ChevronRight, Loader2,
  ShoppingCart, FileText, DollarSign, ExternalLink, Package,
  CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp,
  ChevronsUpDown, Filter, SlidersHorizontal,
} from 'lucide-react'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import QuoteLineItems from '../components/QuoteLineItems'
import OppDetailSlideOver from '../components/OppDetailSlideOver'
import OrderDetailSlideOver from '../components/OrderDetailSlideOver'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(val) {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val)
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTs(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Autotask status labels (as stored after stage-based derivation in sync)
const AT_STATUS_OPTIONS = ['Active', 'Not Ready To Buy', 'Lost', 'Closed', 'Implemented']

// Status groups for filter widgets + stat tiles
const OPEN_STATUSES = new Set(['Active'])
const WON_STATUSES  = new Set(['Closed', 'Implemented'])
const LOST_STATUSES = new Set(['Lost', 'Not Ready To Buy'])

// Derive stage number prefix from label (e.g. "7 - Closed..." → 7)
function stageNum(stageLabel) {
  const m = String(stageLabel || '').match(/^(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

function statusPillClass(status) {
  switch (status) {
    case 'Active':            return 'bg-green-50 text-green-700'
    case 'Not Ready To Buy':  return 'bg-yellow-50 text-yellow-700'
    case 'Lost':              return 'bg-red-50 text-red-600'
    case 'Closed':            return 'bg-blue-50 text-blue-700'
    case 'Implemented':       return 'bg-emerald-50 text-emerald-700'
    default:                  return 'bg-gray-100 text-gray-500'
  }
}

// Stage pill: colour by stage-number group
function stagePillClass(stage) {
  if (!stage) return 'bg-gray-100 text-gray-500'
  const n = stageNum(stage)
  if (n != null) {
    if (n >= 1  && n <= 6)  return 'bg-indigo-50 text-indigo-700'   // In-progress
    if (n >= 7  && n <= 14) return 'bg-blue-50 text-blue-700'       // Closed/Won
    if (n === 15)            return 'bg-red-50 text-red-600'         // Lost
    if (n === 16)            return 'bg-yellow-50 text-yellow-700'   // Reopen/RMA
  }
  const s = stage.toLowerCase()
  if (s.includes('quote') || s.includes('proposal')) return 'bg-indigo-50 text-indigo-700'
  if (s.includes('waiting') || s.includes('po') || s.includes('contract')) return 'bg-yellow-50 text-yellow-700'
  if (s.includes('qual'))  return 'bg-blue-50 text-blue-700'
  if (s.includes('lead') || s.includes('first contact')) return 'bg-purple-50 text-purple-700'
  return 'bg-gray-100 text-gray-600'
}

// ─── Date preset helpers ──────────────────────────────────────────────────────
// Returns {from, to} Date objects for a preset
function datePresetRange(preset) {
  const now = new Date()
  const startOfWeek = (d) => { const x = new Date(d); x.setDate(d.getDate() - d.getDay()); x.setHours(0,0,0,0); return x }
  const endOfWeek   = (d) => { const x = new Date(d); x.setDate(d.getDate() + (6 - d.getDay())); x.setHours(23,59,59,999); return x }
  switch (preset) {
    case 'this_week':   return { from: startOfWeek(now), to: endOfWeek(now) }
    case 'last_week':   { const lw = new Date(now); lw.setDate(now.getDate()-7); return { from: startOfWeek(lw), to: endOfWeek(lw) } }
    case 'this_month':  { const f=new Date(now.getFullYear(),now.getMonth(),1); const t=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59); return {from:f,to:t} }
    case 'last_month':  { const f=new Date(now.getFullYear(),now.getMonth()-1,1); const t=new Date(now.getFullYear(),now.getMonth(),0,23,59,59); return {from:f,to:t} }
    case 'next_month':  { const f=new Date(now.getFullYear(),now.getMonth()+1,1); const t=new Date(now.getFullYear(),now.getMonth()+2,0,23,59,59); return {from:f,to:t} }
    default: return null
  }
}

function inDateRange(dateStr, preset, fromStr, toStr) {
  if (!preset && !fromStr && !toStr) return true
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (preset && preset !== 'custom') {
    const r = datePresetRange(preset)
    if (!r) return true
    return d >= r.from && d <= r.to
  }
  if (fromStr && d < new Date(fromStr)) return false
  if (toStr && d > new Date(toStr + 'T23:59:59')) return false
  return true
}

// ─── Sort icon ────────────────────────────────────────────────────────────────
function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <ChevronsUpDown size={11} className="text-gray-300 ml-1 inline" />
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="text-primary-500 ml-1 inline" />
    : <ChevronDown size={11} className="text-primary-500 ml-1 inline" />
}

// ─── Column filter popover ────────────────────────────────────────────────────
function ColFilter({ label, options, value, onChange, onClear, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const active = !!value

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={`ml-1 inline-flex items-center justify-center w-4 h-4 rounded transition-colors ${
          active ? 'text-primary-600 bg-primary-50' : 'text-gray-300 hover:text-gray-500'
        }`}
        title={active ? `Filter: ${value}` : `Filter ${label}`}
      >
        <Filter size={10} />
      </button>
      {open && (
        <div className={`absolute top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-2 min-w-[160px] ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}>
          <div className="text-xs font-semibold text-gray-400 px-2 pb-1 border-b border-gray-100 mb-1">
            Filter: {label}
          </div>
          <button
            onClick={() => { onChange(''); setOpen(false) }}
            className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-50 ${!value ? 'text-primary-600 font-medium' : 'text-gray-600'}`}
          >
            All
          </button>
          {options.map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false) }}
              className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-50 ${value === opt ? 'text-primary-600 font-medium bg-primary-50' : 'text-gray-600'}`}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── DateRangeFilter popover ──────────────────────────────────────────────────
function DateRangeFilter({ label, preset, fromDate, toDate, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const active = !!(preset || fromDate || toDate)

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const PRESETS = [
    { label: 'This Week',   value: 'this_week' },
    { label: 'Last Week',   value: 'last_week' },
    { label: 'This Month',  value: 'this_month' },
    { label: 'Last Month',  value: 'last_month' },
    { label: 'Next Month',  value: 'next_month' },
  ]

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={`ml-1 inline-flex items-center justify-center w-4 h-4 rounded transition-colors ${
          active ? 'text-primary-600 bg-primary-50' : 'text-gray-300 hover:text-gray-500'
        }`}
        title={active ? (preset || `${fromDate||''}–${toDate||''}`) : `Filter by ${label}`}
      >
        <Filter size={10} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[200px] left-0">
          <div className="text-xs font-semibold text-gray-400 pb-1.5 mb-1.5 border-b border-gray-100">
            {label} filter
          </div>
          {PRESETS.map(p => (
            <button key={p.value}
              onClick={() => onChange({ preset: preset === p.value ? '' : p.value, from: '', to: '' })}
              className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-50 ${preset === p.value ? 'text-primary-600 font-medium bg-primary-50' : 'text-gray-600'}`}>
              {p.label}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1.5 pt-1.5">
            <div className="text-xs text-gray-400 mb-1">Custom range</div>
            <div className="flex gap-1 items-center">
              <input type="date" value={fromDate} onChange={e => onChange({ preset: 'custom', from: e.target.value, to: toDate })}
                className="text-xs border border-gray-200 rounded px-1.5 py-1 w-[110px] focus:outline-none focus:ring-1 focus:ring-primary-300" />
              <span className="text-gray-300 text-xs">–</span>
              <input type="date" value={toDate} onChange={e => onChange({ preset: 'custom', from: fromDate, to: e.target.value })}
                className="text-xs border border-gray-200 rounded px-1.5 py-1 w-[110px] focus:outline-none focus:ring-1 focus:ring-primary-300" />
            </div>
          </div>
          {active && (
            <button onClick={() => onChange({ preset: '', from: '', to: '' })}
              className="w-full mt-2 text-xs text-red-500 hover:text-red-700 text-left px-1">
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── MultiSelectFilter popover ────────────────────────────────────────────────
function MultiSelectFilter({ label, options, value = [], onChange, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const active = value.length > 0

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function toggle(opt) {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={`ml-1 inline-flex items-center justify-center w-4 h-4 rounded transition-colors ${
          active ? 'text-primary-600 bg-primary-50' : 'text-gray-300 hover:text-gray-500'
        }`}
        title={active ? value.join(', ') : `Filter ${label}`}
      >
        <Filter size={10} />
      </button>
      {open && (
        <div className={`absolute top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-2 min-w-[200px] max-h-[280px] overflow-y-auto ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <div className="text-xs font-semibold text-gray-400 px-2 pb-1 border-b border-gray-100 mb-1 flex justify-between">
            <span>Filter: {label}</span>
            {active && <button onClick={() => onChange([])} className="text-red-400 hover:text-red-600 text-xs">Clear</button>}
          </div>
          {options.map(opt => (
            <button key={opt} onClick={() => toggle(opt)}
              className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-50 flex items-center gap-2 ${value.includes(opt) ? 'text-primary-600 font-medium' : 'text-gray-600'}`}>
              <span className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center ${value.includes(opt) ? 'bg-primary-600 border-primary-600' : 'border-gray-300'}`}>
                {value.includes(opt) && <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 8 8"><path d="M1 3.5L3 5.5 7 1.5" stroke="white" strokeWidth="1.5" fill="none"/></svg>}
              </span>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Opportunity Detail Slide-over ────────────────────────────────────────────
// OppDetail is now a shared component — imported above as OppDetailSlideOver
// Used here with the alias OppDetail for backward compat with selectedId state
const OppDetail = OppDetailSlideOver

// ─── Main Opportunities page ──────────────────────────────────────────────────
export default function Opportunities() {
  const [opps, setOpps]       = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)

  // Global filters
  const [search, setSearch]         = useState('')
  // statusFilter: 'open' | 'won' | 'lost' | 'all'
  const [statusFilter, setStatusFilter] = useState('open')
  const [hasPOFilter, setHasPOFilter]         = useState(false)
  const [hasOrdersFilter, setHasOrdersFilter] = useState(false)

  // Column-level filters
  const [colFilters, setColFilters] = useState({ status: '', stage: '', category: '' })

  // Multi-select filters
  const [ownerFilter, setOwnerFilter]   = useState([])
  const [clientFilter, setClientFilter] = useState([])

  // Date range filters
  const [dateFilters, setDateFilters] = useState({
    close_date_preset: '',
    close_date_from: '',
    close_date_to: '',
    create_date_preset: '',
    create_date_from: '',
    create_date_to: '',
    closed_date_preset: '',
    closed_date_from: '',
    closed_date_to: '',
  })

  // Derived option lists (from loaded data)
  const [stageOptions, setStageOptions]   = useState([])
  const [clientOptions, setClientOptions] = useState([])
  const [ownerOptions, setOwnerOptions]   = useState([])
  const [categoryOptions, setCategoryOptions] = useState([])

  // Sort
  const [sortKey, setSortKey] = useState('created_date')
  const [sortDir, setSortDir] = useState('desc')

  // Detail
  const [selectedId, setSelectedId] = useState(null)
  const [selectedOrderId, setSelectedOrderId] = useState(null)

  function setColFilter(col, val) {
    setColFilters(prev => ({ ...prev, [col]: val }))
  }

  function setDateFilter(field, val) {
    setDateFilters(prev => ({ ...prev, [field]: val }))
  }

  const loadOpps = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    // Always fetch all statuses — client-side filtering keeps stats tiles correct
    // and allows toggling between open/won/lost/all without a round-trip.
    params.set('include_closed', '1')

    api.get(`/opportunities?${params}`)
      .then(r => {
        const data = r.data || []
        setOpps(data)
        setTotal(r.total || data.length)
        setStageOptions([...new Set(data.map(o => o.stage).filter(Boolean))].sort())
        setClientOptions([...new Set(data.map(o => o.client_name).filter(Boolean))].sort())
        setOwnerOptions([...new Set(data.map(o => o.assigned_resource_name).filter(Boolean))].sort())
        setCategoryOptions([...new Set(data.map(o => o.category).filter(Boolean))].sort())
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [search])

  const loadSyncStatus = useCallback(() => {
    api.get('/opportunities/sync/status').then(r => setSyncStatus(r.data)).catch(() => {})
  }, [])

  useEffect(() => { loadSyncStatus() }, [loadSyncStatus])
  useEffect(() => {
    const t = setTimeout(loadOpps, search ? 350 : 0)
    return () => clearTimeout(t)
  }, [loadOpps, search])

  async function handleSync() {
    setSyncing(true)
    try {
      await api.post('/opportunities/sync')
      setTimeout(() => { loadOpps(); loadSyncStatus() }, 2000)
    } catch { /* ignore */ } finally { setSyncing(false) }
  }

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // ── Apply filters + sort ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = opps
    // Apply the top-level status group filter
    if (statusFilter === 'open') rows = rows.filter(o => OPEN_STATUSES.has(o.status))
    else if (statusFilter === 'won')  rows = rows.filter(o => WON_STATUSES.has(o.status))
    else if (statusFilter === 'lost') rows = rows.filter(o => LOST_STATUSES.has(o.status))
    // else 'all' — no status filter
    // Apply column-level filters on top
    if (colFilters.status)   rows = rows.filter(o => o.status === colFilters.status)
    if (colFilters.stage)    rows = rows.filter(o => o.stage === colFilters.stage)
    if (colFilters.category) rows = rows.filter(o => o.category === colFilters.category)
    // Multi-select client filter
    if (clientFilter.length > 0) rows = rows.filter(o => clientFilter.includes(o.client_name))
    // Multi-select owner filter
    if (ownerFilter.length > 0) rows = rows.filter(o => ownerFilter.includes(o.assigned_resource_name))
    // Date range filters
    if (dateFilters.close_date_preset || dateFilters.close_date_from || dateFilters.close_date_to)
      rows = rows.filter(o => inDateRange(o.expected_close, dateFilters.close_date_preset, dateFilters.close_date_from, dateFilters.close_date_to))
    if (dateFilters.create_date_preset || dateFilters.create_date_from || dateFilters.create_date_to)
      rows = rows.filter(o => inDateRange(o.created_date, dateFilters.create_date_preset, dateFilters.create_date_from, dateFilters.create_date_to))
    if (dateFilters.closed_date_preset || dateFilters.closed_date_from || dateFilters.closed_date_to)
      rows = rows.filter(o => inDateRange(o.closed_date, dateFilters.closed_date_preset, dateFilters.closed_date_from, dateFilters.closed_date_to))
    if (hasPOFilter)     rows = rows.filter(o => (o.po_numbers?.length ?? 0) > 0)
    if (hasOrdersFilter) rows = rows.filter(o => parseInt(o.order_count) > 0)
    return rows
  }, [opps, statusFilter, colFilters, clientFilter, ownerFilter, dateFilters, hasPOFilter, hasOrdersFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av, bv
      if (sortKey === 'amount') {
        av = a.amount ?? -Infinity; bv = b.amount ?? -Infinity
      } else if (sortKey === 'expected_close' || sortKey === 'created_date' || sortKey === 'closed_date') {
        av = a[sortKey] ? new Date(a[sortKey]).getTime() : 0
        bv = b[sortKey] ? new Date(b[sortKey]).getTime() : 0
      } else if (sortKey === 'quote_count' || sortKey === 'order_count') {
        av = parseInt(a[sortKey]) || 0; bv = parseInt(b[sortKey]) || 0
      } else {
        av = (a[sortKey] || '').toLowerCase()
        bv = (b[sortKey] || '').toLowerCase()
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  // Stats always from full loaded set (all statuses)
  const stats = useMemo(() => ({
    open:       opps.filter(o => OPEN_STATUSES.has(o.status)).length,
    won:        opps.filter(o => WON_STATUSES.has(o.status)).length,
    lost:       opps.filter(o => LOST_STATUSES.has(o.status)).length,
    withPo:     filtered.filter(o => o.po_numbers?.length > 0).length,
    withOrders: filtered.filter(o => parseInt(o.order_count) > 0).length,
    totalValue: filtered.reduce((s, o) => s + (o.amount || 0), 0),
  }), [opps, filtered])

  const hasColFilters = Object.values(colFilters).some(Boolean)
  const hasMultiFilters = clientFilter.length > 0 || ownerFilter.length > 0
  const hasDateFilters = Object.values(dateFilters).some(Boolean)
  const hasAnyFilter = hasColFilters || hasMultiFilters || hasDateFilters

  function clearAllFilters() {
    setSearch('')
    setColFilters({ status: '', stage: '', category: '' })
    setClientFilter([])
    setOwnerFilter([])
    setDateFilters({
      close_date_preset: '', close_date_from: '', close_date_to: '',
      create_date_preset: '', create_date_from: '', create_date_to: '',
      closed_date_preset: '', closed_date_from: '', closed_date_to: '',
    })
    setHasPOFilter(false)
    setHasOrdersFilter(false)
  }

  // Sortable + filterable column header
  function Th({ col, label, filterCol, filterOptions, filterType, filterValue, onFilterChange, className = 'text-left', alignFilter = 'left', datePreset, dateFrom, dateTo, onDateChange }) {
    return (
      <th
        className={`${className} px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider`}
        onClick={() => handleSort(col)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {label}<SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
        {filterType === 'single' && filterCol && filterOptions && (
          <ColFilter
            label={label}
            options={filterOptions}
            value={colFilters[filterCol]}
            onChange={v => setColFilter(filterCol, v)}
            align={alignFilter}
          />
        )}
        {filterType === 'multi' && filterOptions && (
          <MultiSelectFilter
            label={label}
            options={filterOptions}
            value={filterValue}
            onChange={onFilterChange}
            align={alignFilter}
          />
        )}
        {filterType === 'date' && (
          <DateRangeFilter
            label={label}
            preset={datePreset}
            fromDate={dateFrom}
            toDate={dateTo}
            onChange={onDateChange}
          />
        )}
      </th>
    )
  }

  // Helper to show date filter label in chips
  function dateFilterLabel(preset, from, to) {
    if (preset && preset !== 'custom') {
      const map = { this_week: 'This Week', last_week: 'Last Week', this_month: 'This Month', last_month: 'Last Month', next_month: 'Next Month' }
      return map[preset] || preset
    }
    if (from || to) return `${from || '…'} – ${to || '…'}`
    return ''
  }

  return (
    <div className="max-w-[1600px]">
      <PageHeader
        icon={Target}
        title="Opportunities"
        subtitle="Autotask opportunities with quotes, PO numbers, and linked distributor orders"
      >
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync Autotask'}
        </button>
      </PageHeader>

      {/* Sync status bar */}
      {syncStatus && (
        <div className="flex flex-wrap gap-4 mb-5 text-sm text-gray-600">
          <span className="flex items-center gap-1.5"><Target size={13} className="text-gray-400" /> {syncStatus.opp_count} in database</span>
          <span className="flex items-center gap-1.5"><FileText size={13} className="text-gray-400" /> {syncStatus.quote_count} quotes</span>
          <span className="flex items-center gap-1.5"><Package size={13} className="text-gray-400" /> {syncStatus.item_count} line items</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-gray-400" /> {syncStatus.opps_with_po} with PO</span>
          {syncStatus.last_opp_sync && (
            <span className="flex items-center gap-1.5 text-gray-400"><Clock size={12} /> Last sync: {fmtTs(syncStatus.last_opp_sync)}</span>
          )}
        </div>
      )}

      {/* Stat tiles — Open/All act as filter toggles */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { label: 'Open',              value: stats.open,       icon: Target,          color: 'text-primary-600', bg: 'bg-primary-50',  filter: 'open',  onClick: () => { setStatusFilter('open');  setColFilter('status', '') } },
          { label: 'Won / Implemented', value: stats.won,        icon: CheckCircle2,    color: 'text-green-600',   bg: 'bg-green-50',    filter: 'won',   onClick: () => { setStatusFilter('won');   setColFilter('status', '') } },
          { label: 'Lost / Not Ready',  value: stats.lost,       icon: X,               color: 'text-red-500',     bg: 'bg-red-50',      filter: 'lost',  onClick: () => { setStatusFilter('lost');  setColFilter('status', '') } },
          { label: 'All',               value: opps.length,      icon: SlidersHorizontal, color: 'text-gray-400', bg: 'bg-gray-100',    filter: 'all',   onClick: () => { setStatusFilter('all');   setColFilter('status', '') } },
          { label: 'With PO Numbers', value: stats.withPo, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50',
            filter: 'hasPO', onClick: () => { setHasPOFilter(f => !f) } },
          { label: 'With Orders', value: stats.withOrders, icon: ShoppingCart, color: 'text-green-600', bg: 'bg-green-50',
            filter: 'hasOrders', onClick: () => { setHasOrdersFilter(f => !f) } },
          { label: 'Pipeline Value',    value: fmt(stats.totalValue), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(tile => (
          <div key={tile.label} onClick={tile.onClick}
            className={`flex-1 min-w-[130px] bg-white rounded-xl border p-4 transition-colors
              ${tile.onClick ? 'cursor-pointer hover:border-primary-300' : ''}
              ${(tile.filter === 'hasPO' && hasPOFilter) || (tile.filter === 'hasOrders' && hasOrdersFilter) || (tile.filter && !['hasPO','hasOrders'].includes(tile.filter) && statusFilter === tile.filter) ? 'border-primary-400 ring-1 ring-primary-300' : 'border-gray-200'}
            `}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${tile.bg}`}>
              <tile.icon size={16} className={tile.color} />
            </div>
            <p className="text-xl font-bold text-gray-900">{tile.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{tile.label}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Status group toggle */}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-sm">
          {[
            { label: 'Open',  value: 'open',  cls: 'bg-primary-600' },
            { label: 'Won',   value: 'won',   cls: 'bg-green-600' },
            { label: 'Lost',  value: 'lost',  cls: 'bg-red-500' },
            { label: 'All',   value: 'all',   cls: 'bg-gray-600' },
          ].map(btn => (
            <button key={btn.value}
              onClick={() => { setStatusFilter(btn.value); setColFilter('status', '') }}
              className={`px-3 py-1.5 transition-colors ${statusFilter === btn.value ? `${btn.cls} text-white` : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {btn.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, client, or PO…"
            className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-primary-400" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {hasAnyFilter && (
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Column single-select filters */}
            {Object.entries(colFilters).filter(([, v]) => v).map(([col, val]) => (
              <span key={col} className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 text-xs rounded-lg">
                <Filter size={10} />
                {val}
                <button onClick={() => setColFilter(col, '')} className="ml-0.5 hover:text-primary-900">
                  <X size={10} />
                </button>
              </span>
            ))}
            {/* Multi-select client chips */}
            {clientFilter.map(c => (
              <span key={c} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-lg">
                <Filter size={10} />
                {c}
                <button onClick={() => setClientFilter(prev => prev.filter(v => v !== c))} className="ml-0.5 hover:text-blue-900">
                  <X size={10} />
                </button>
              </span>
            ))}
            {/* Multi-select owner chips */}
            {ownerFilter.map(o => (
              <span key={o} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-lg">
                <Filter size={10} />
                {o}
                <button onClick={() => setOwnerFilter(prev => prev.filter(v => v !== o))} className="ml-0.5 hover:text-purple-900">
                  <X size={10} />
                </button>
              </span>
            ))}
            {/* Date filter chips */}
            {(dateFilters.close_date_preset || dateFilters.close_date_from || dateFilters.close_date_to) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-lg">
                <Filter size={10} />
                Close: {dateFilterLabel(dateFilters.close_date_preset, dateFilters.close_date_from, dateFilters.close_date_to)}
                <button onClick={() => setDateFilters(p => ({ ...p, close_date_preset: '', close_date_from: '', close_date_to: '' }))} className="ml-0.5 hover:text-amber-900"><X size={10} /></button>
              </span>
            )}
            {(dateFilters.create_date_preset || dateFilters.create_date_from || dateFilters.create_date_to) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-lg">
                <Filter size={10} />
                Created: {dateFilterLabel(dateFilters.create_date_preset, dateFilters.create_date_from, dateFilters.create_date_to)}
                <button onClick={() => setDateFilters(p => ({ ...p, create_date_preset: '', create_date_from: '', create_date_to: '' }))} className="ml-0.5 hover:text-amber-900"><X size={10} /></button>
              </span>
            )}
            {(dateFilters.closed_date_preset || dateFilters.closed_date_from || dateFilters.closed_date_to) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-lg">
                <Filter size={10} />
                Closed: {dateFilterLabel(dateFilters.closed_date_preset, dateFilters.closed_date_from, dateFilters.closed_date_to)}
                <button onClick={() => setDateFilters(p => ({ ...p, closed_date_preset: '', closed_date_from: '', closed_date_to: '' }))} className="ml-0.5 hover:text-amber-900"><X size={10} /></button>
              </span>
            )}
          </div>
        )}

        {(search || hasAnyFilter) && (
          <button onClick={clearAllFilters}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <X size={13} /> Clear all
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {sorted.length} opportunity{sorted.length !== 1 ? 's' : ''}
          {statusFilter === 'open' && (stats.won + stats.lost) > 0 && (
            <button onClick={() => { setStatusFilter('all'); setColFilter('status', '') }} className="ml-2 text-gray-400 hover:text-gray-600 underline decoration-dotted">
              +{stats.won + stats.lost} closed/lost hidden
            </button>
          )}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
        {error && <div className="p-6 text-center text-sm text-red-600">{error}</div>}

        {!error && loading && (
          <div className="p-8 text-center text-gray-400">
            <Loader2 size={24} className="animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading opportunities…</p>
          </div>
        )}

        {!error && !loading && sorted.length === 0 && (
          <div className="p-12 text-center text-gray-400">
            <Target size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium text-gray-500">No opportunities found</p>
            <p className="text-xs mt-1">
              {statusFilter !== 'all' && opps.length > 0
                ? <span>No {statusFilter === 'open' ? 'Active' : statusFilter === 'won' ? 'Won/Implemented' : 'Lost/Not Ready'} opportunities — <button onClick={() => { setStatusFilter('all'); setColFilter('status', '') }} className="underline">show all?</button></span>
                : 'Run "Sync Autotask" to import opportunities from Autotask'
              }
            </p>
          </div>
        )}

        {!error && !loading && sorted.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <Th col="title"          label="Opportunity" />
                <Th col="client_name"    label="Client"
                    filterType="multi" filterOptions={clientOptions}
                    filterValue={clientFilter} onFilterChange={setClientFilter} />
                <Th col="assigned_resource_name" label="Owner"
                    filterType="multi" filterOptions={ownerOptions}
                    filterValue={ownerFilter} onFilterChange={setOwnerFilter} />
                <Th col="status"         label="Status"
                    filterType="single" filterCol="status" filterOptions={AT_STATUS_OPTIONS} />
                <Th col="stage"          label="Stage"
                    filterType="single" filterCol="stage" filterOptions={stageOptions} />
                <Th col="category"       label="Category"
                    filterType="single" filterCol="category" filterOptions={categoryOptions} />
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">PO Numbers</th>
                <Th col="quote_count"    label="Quotes"  className="text-center" />
                <Th col="order_count"    label="Orders"  className="text-center" />
                <Th col="amount"         label="Amount"  className="text-right" alignFilter="right" />
                <Th col="created_date"   label="Created"
                    filterType="date"
                    datePreset={dateFilters.create_date_preset}
                    dateFrom={dateFilters.create_date_from}
                    dateTo={dateFilters.create_date_to}
                    onDateChange={({ preset, from, to }) => setDateFilters(p => ({ ...p, create_date_preset: preset, create_date_from: from, create_date_to: to }))} />
                <Th col="expected_close" label="Close Date"
                    filterType="date"
                    datePreset={dateFilters.close_date_preset}
                    dateFrom={dateFilters.close_date_from}
                    dateTo={dateFilters.close_date_to}
                    onDateChange={({ preset, from, to }) => setDateFilters(p => ({ ...p, close_date_preset: preset, close_date_from: from, close_date_to: to }))} />
                {statusFilter !== 'open' && (
                  <Th col="closed_date" label="Closed"
                      filterType="date"
                      datePreset={dateFilters.closed_date_preset}
                      dateFrom={dateFilters.closed_date_from}
                      dateTo={dateFilters.closed_date_to}
                      onDateChange={({ preset, from, to }) => setDateFilters(p => ({ ...p, closed_date_preset: preset, closed_date_from: from, closed_date_to: to }))} />
                )}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(opp => (
                <tr key={opp.id} className="hover:bg-gray-50/70 cursor-pointer transition-colors"
                  onClick={() => setSelectedId(opp.id)}>
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="text-sm font-medium text-gray-900 truncate">{opp.title}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700">{opp.client_name || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-600">{opp.assigned_resource_name || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusPillClass(opp.status)}`}>
                      {opp.status || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[160px]">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${stagePillClass(opp.stage)}`}>
                      {opp.stage || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-600">{opp.category || '—'}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[160px]">
                    {opp.po_numbers?.length > 0 ? (
                      <p className="font-mono text-xs text-gray-700 truncate">
                        {opp.po_numbers.slice(0, 2).join(', ')}{opp.po_numbers.length > 2 && ` +${opp.po_numbers.length - 2}`}
                      </p>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${parseInt(opp.quote_count) > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                      {opp.quote_count || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${parseInt(opp.order_count) > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                      {opp.order_count || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm text-gray-900">{opp.amount != null ? fmt(opp.amount) : '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">{fmtDate(opp.created_date)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">{fmtDate(opp.expected_close)}</span>
                  </td>
                  {statusFilter !== 'open' && (
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{fmtDate(opp.closed_date)}</span>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <ChevronRight size={15} className="text-gray-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedId && (
        <OppDetail
          oppId={selectedId}
          onClose={() => setSelectedId(null)}
          onOrderClick={id => { setSelectedId(null); setSelectedOrderId(id) }}
        />
      )}
      {selectedOrderId && (
        <OrderDetailSlideOver
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onRefresh={() => {}}
        />
      )}
    </div>
  )
}
