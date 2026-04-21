/**
 * HardwareTable — full-featured hardware asset table
 * Features: column chooser, per-column filtering, CSV export, sortable headers
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Monitor, Laptop, Server, Wifi, Shield, Router, HardDrive,
  Printer, Cpu, Box, Activity, ChevronUp, ChevronDown,
  Download, Columns, Filter, X, CheckSquare, Square,
  ExternalLink, AlertCircle, AlertTriangle, CheckCircle,
  Minus, ChevronDown as ChevronDownIcon, EyeOff, Eye,
  Users, Tag, PlusCircle, ClipboardList,
} from 'lucide-react'
import { autotaskUrl } from '../lib/autotask'
import { api } from '../lib/api'
import RecEditModal from './RecEditModal'

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtBytes(bytes) {
  if (!bytes || bytes === 0) return null
  const b = Number(bytes)
  if (b >= 1e12) return (b / 1e12).toFixed(1) + ' TB'
  if (b >= 1e9)  return Math.round(b / 1e9) + ' GB'
  if (b >= 1e6)  return Math.round(b / 1e6) + ' MB'
  return b + ' B'
}

function fmtRam(bytes) {
  if (!bytes || bytes === 0) return null
  const gb = bytes / 1e9
  // Round to standard memory sizes
  const sizes = [1,2,4,8,12,16,24,32,48,64,96,128,192,256,512]
  const nearest = sizes.reduce((a, b) => Math.abs(b - gb) < Math.abs(a - gb) ? b : a)
  return `${nearest} GB`
}

function fmtDate(val) {
  if (!val) return null
  const d = new Date(val)
  if (isNaN(d)) return null
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtRelative(val) {
  if (!val) return null
  const d = new Date(val)
  if (isNaN(d)) return null
  const now = new Date()
  const diffMs = now - d
  const days = Math.floor(diffMs / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function fmtAge(purchaseDate) {
  if (!purchaseDate) return null
  const d = new Date(purchaseDate)
  if (isNaN(d)) return null
  const years = (new Date() - d) / (365.25 * 86400000)
  if (years < 1) return `${Math.floor(years * 12)}mo`
  return `${years.toFixed(1)}y`
}

// Priority: ScalePad → Datto RMM → IT Glue → Autotask
function resolvedDate(asset, field) {
  if (field === 'purchase_date') {
    if (asset.scalepad_data?.purchase_date) return { val: asset.scalepad_data.purchase_date, src: 'ScalePad' }
    if (asset.it_glue_data?.attributes?.['purchased-date']) return { val: asset.it_glue_data.attributes['purchased-date'], src: 'ITG' }
    if (asset.autotask_data?.installDate) return { val: asset.autotask_data.installDate, src: 'AT' }
    if (asset.purchase_date) return { val: asset.purchase_date, src: asset.primary_source || '' }
    return { val: null, src: null }
  }
  if (field === 'warranty_expiry') {
    if (asset.scalepad_data?.warranty_expiry) return { val: asset.scalepad_data.warranty_expiry, src: 'ScalePad' }
    if (asset.datto_rmm_data?.warrantyDate) return { val: asset.datto_rmm_data.warrantyDate, src: 'RMM' }
    if (asset.it_glue_data?.attributes?.['warranty-expires-at']) return { val: asset.it_glue_data.attributes['warranty-expires-at'], src: 'ITG' }
    if (asset.autotask_data?.warrantyExpirationDate) return { val: asset.autotask_data.warrantyExpirationDate, src: 'AT' }
    if (asset.warranty_expiry) return { val: asset.warranty_expiry, src: asset.primary_source || '' }
    return { val: null, src: null }
  }
  return { val: null, src: null }
}

function WarrantyBadge({ asset }) {
  const { val } = resolvedDate(asset, 'warranty_expiry')
  if (!val) return <span className="text-xs text-gray-400">—</span>
  const d = new Date(val)
  const days = Math.round((d - new Date()) / 86400000)
  if (days < 0) return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 rounded px-1.5 py-0.5 whitespace-nowrap">
      <AlertCircle size={10} /> Expired {fmtDate(val)}
    </span>
  )
  if (days < 90) return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 whitespace-nowrap">
      <AlertTriangle size={10} /> {days}d left
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 rounded px-1.5 py-0.5 whitespace-nowrap">
      <CheckCircle size={10} /> {fmtDate(val)}
    </span>
  )
}

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

function TypeIcon({ typeName }) {
  const cfg = TYPE_ICONS[typeName] || TYPE_ICONS['Other']
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${cfg.bg} shrink-0`}>
      <Icon size={12} className={cfg.color} />
    </span>
  )
}

// ─── Column definitions ────────────────────────────────────────────────────────

function buildColumns(assetTypes) {
  return [
    {
      key: 'type',
      label: 'Type',
      defaultVisible: true,
      defaultWidth: 130,
      sortVal: a => a.asset_type_name || '',
      filterVal: a => a.asset_type_name || 'Unknown',
      render: a => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <TypeIcon typeName={a.asset_type_name} />
          <span className="text-xs text-gray-500">{a.asset_type_name || '—'}</span>
        </div>
      ),
    },
    {
      key: 'name',
      label: 'Device Name',
      defaultVisible: true,
      defaultWidth: 200,
      sortVal: a => a.name || '',
      filterVal: a => a.name || '',
      render: a => {
        const atLink = autotaskUrl('ci', a.autotask_ci_id)
        return (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="font-medium text-gray-900">{a.name || '—'}</span>
            {atLink && (
              <a href={atLink} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="shrink-0 text-gray-300 hover:text-primary-500 transition-colors">
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        )
      },
    },
    {
      key: 'client_name',
      label: 'Client',
      defaultVisible: true,
      defaultWidth: 220,
      sortVal: a => a.client_name || '',
      filterVal: a => a.client_name || '',
      render: a => <span className="text-sm text-gray-700 whitespace-nowrap">{a.client_name || '—'}</span>,
    },
    {
      key: 'hostname',
      label: 'Hostname (RMM)',
      defaultVisible: false,
      defaultWidth: 180,
      sortVal: a => a.hostname || '',
      filterVal: a => a.hostname || '',
      render: a => <span className="text-sm font-mono text-gray-600 whitespace-nowrap">{a.hostname || '—'}</span>,
    },
    {
      key: 'last_user',
      label: 'Last User (RMM)',
      defaultVisible: true,
      defaultWidth: 180,
      sortVal: a => a.last_user || '',
      filterVal: a => a.last_user || '',
      render: a => <span className="text-sm text-gray-700 whitespace-nowrap">{a.last_user || '—'}</span>,
    },
    {
      key: 'last_seen_at',
      label: 'Last Seen (RMM)',
      defaultVisible: true,
      defaultWidth: 150,
      sortVal: a => a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0,
      filterVal: a => {
        if (!a.last_seen_at) return 'Never'
        const isRmm = !a.last_seen_source || a.last_seen_source === 'Datto RMM'
        const days = Math.floor((new Date() - new Date(a.last_seen_at)) / 86400000)
        const prefix = isRmm ? '' : `${a.last_seen_source || 'Other'} — `
        if (days < 1) return `${prefix}Today`
        if (days < 7) return `${prefix}This week`
        if (days < 30) return `${prefix}This month`
        if (days < 90) return `${prefix}1–3 months ago`
        return `${prefix}3+ months ago`
      },
      render: a => {
        const rel = fmtRelative(a.last_seen_at)
        if (!rel) return <span className="text-xs text-gray-400">—</span>
        const days = a.last_seen_at ? Math.floor((new Date() - new Date(a.last_seen_at)) / 86400000) : 0
        const src = a.last_seen_source
        const isRmm = !src || src === 'Datto RMM'
        return (
          <div title={fmtDate(a.last_seen_at)}>
            <span className={`text-sm ${days > 30 ? 'text-amber-600' : days > 7 ? 'text-yellow-600' : 'text-gray-700'}`}>
              {rel}
            </span>
            {src && !isRmm && (
              <span className="ml-1 text-xs text-gray-400 italic">({src})</span>
            )}
          </div>
        )
      },
    },
    {
      key: 'ram',
      label: 'RAM (RMM)',
      defaultVisible: true,
      defaultWidth: 90,
      sortVal: a => {
        const bytes = a.ram_bytes || a.autotask_data?.rmmDeviceAuditMemoryBytes || 0
        return Number(bytes) || 0
      },
      filterVal: a => {
        const bytes = a.ram_bytes || a.autotask_data?.rmmDeviceAuditMemoryBytes
        return fmtRam(bytes) || '—'
      },
      render: a => {
        const bytes = a.ram_bytes || a.autotask_data?.rmmDeviceAuditMemoryBytes
        return <span className="text-sm text-gray-700 whitespace-nowrap">{fmtRam(bytes) || '—'}</span>
      },
    },
    {
      key: 'cpu',
      label: 'Processor (RMM)',
      defaultVisible: true,
      defaultWidth: 220,
      sortVal: a => a.cpu_description || '',
      filterVal: a => {
        const cpu = a.cpu_description
        if (!cpu) return '—'
        if (/intel/i.test(cpu)) return 'Intel'
        if (/amd/i.test(cpu)) return 'AMD'
        if (/apple/i.test(cpu)) return 'Apple'
        if (/arm/i.test(cpu)) return 'ARM'
        return 'Other'
      },
      render: a => <span className="text-sm text-gray-700 whitespace-nowrap" title={a.cpu_description}>{a.cpu_description || '—'}</span>,
    },
    {
      key: 'cpu_cores',
      label: 'Cores (RMM)',
      defaultVisible: false,
      defaultWidth: 80,
      sortVal: a => a.cpu_cores || 0,
      filterVal: a => a.cpu_cores ? `${a.cpu_cores} cores` : '—',
      render: a => <span className="text-sm text-gray-700">{a.cpu_cores || '—'}</span>,
    },
    {
      key: 'storage',
      label: 'Storage (RMM)',
      defaultVisible: true,
      defaultWidth: 120,
      sortVal: a => {
        const bytes = a.storage_bytes || a.autotask_data?.rmmDeviceAuditStorageBytes || 0
        return Number(bytes) || 0
      },
      filterVal: a => {
        const bytes = a.storage_bytes || a.autotask_data?.rmmDeviceAuditStorageBytes
        if (!bytes) return '—'
        const gb = Number(bytes) / 1e9
        if (gb >= 1000) return '1 TB+'
        if (gb >= 500) return '500 GB+'
        if (gb >= 256) return '256 GB+'
        if (gb >= 128) return '128 GB+'
        return 'Under 128 GB'
      },
      render: a => {
        const bytes = a.storage_bytes || a.autotask_data?.rmmDeviceAuditStorageBytes
        const freeBytes = a.storage_free_bytes
        const total = fmtBytes(bytes)
        const free = fmtBytes(freeBytes)
        if (!total) return <span className="text-sm text-gray-400">—</span>
        return (
          <div className="whitespace-nowrap">
            <span className="text-sm text-gray-700">{total}</span>
            {free && <span className="text-xs text-gray-400 ml-1">({free} free)</span>}
          </div>
        )
      },
    },
    {
      key: 'free_space',
      label: 'Free Space (RMM)',
      defaultVisible: false,
      defaultWidth: 110,
      sortVal: a => Number(a.storage_free_bytes) || 0,
      filterVal: a => fmtBytes(a.storage_free_bytes) || '—',
      render: a => <span className="text-sm text-gray-700 whitespace-nowrap">{fmtBytes(a.storage_free_bytes) || '—'}</span>,
    },
    {
      key: 'manufacturer',
      label: 'Make (RMM)',
      defaultVisible: true,
      defaultWidth: 130,
      sortVal: a => {
        const m = a.manufacturer || a.datto_rmm_data?.manufacturer || ''
        return m.toLowerCase()
      },
      filterVal: a => a.manufacturer || a.datto_rmm_data?.manufacturer || '—',
      render: a => {
        const m = a.manufacturer || a.datto_rmm_data?.manufacturer
        return <span className="text-sm text-gray-700 whitespace-nowrap">{m || '—'}</span>
      },
    },
    {
      key: 'model',
      label: 'Model (RMM)',
      defaultVisible: true,
      defaultWidth: 180,
      sortVal: a => {
        const m = a.model || a.datto_rmm_data?.model || ''
        return m.toLowerCase()
      },
      filterVal: a => a.model || a.datto_rmm_data?.model || '—',
      render: a => {
        const m = a.model || a.datto_rmm_data?.model
        return <span className="text-sm text-gray-700 whitespace-nowrap" title={m}>{m || '—'}</span>
      },
    },
    {
      key: 'operating_system',
      label: 'Operating System',
      defaultVisible: true,
      defaultWidth: 200,
      sortVal: a => a.operating_system || '',
      filterVal: a => {
        const os = a.operating_system || ''
        if (/windows 11/i.test(os)) return 'Windows 11'
        if (/windows 10/i.test(os)) return 'Windows 10'
        if (/windows server 2022/i.test(os)) return 'Server 2022'
        if (/windows server 2019/i.test(os)) return 'Server 2019'
        if (/windows server 2016/i.test(os)) return 'Server 2016'
        if (/windows server/i.test(os)) return 'Windows Server'
        if (/macos|mac os/i.test(os)) return 'macOS'
        if (/linux/i.test(os)) return 'Linux'
        return os || '—'
      },
      render: a => (
        <span className="text-sm text-gray-700 whitespace-nowrap" title={a.operating_system}>
          {a.operating_system || '—'}
        </span>
      ),
    },
    {
      key: 'purchase_date',
      label: 'Purchase Date',
      defaultVisible: false,
      defaultWidth: 130,
      sortVal: a => {
        const { val } = resolvedDate(a, 'purchase_date')
        return val ? new Date(val).getTime() : 0
      },
      filterVal: a => {
        const { val } = resolvedDate(a, 'purchase_date')
        if (!val) return '—'
        const yr = new Date(val).getFullYear()
        return String(yr)
      },
      render: a => {
        const { val, src } = resolvedDate(a, 'purchase_date')
        if (!val) return <span className="text-xs text-gray-400">—</span>
        return (
          <div className="whitespace-nowrap">
            <span className="text-sm text-gray-700">{fmtDate(val)}</span>
            {src && <span className="ml-1 text-xs text-gray-400">({src})</span>}
          </div>
        )
      },
    },
    {
      key: 'warranty_expiry',
      label: 'Warranty Expiry',
      defaultVisible: true,
      defaultWidth: 160,
      sortVal: a => {
        const { val } = resolvedDate(a, 'warranty_expiry')
        return val ? new Date(val).getTime() : 0
      },
      filterVal: a => {
        const { val } = resolvedDate(a, 'warranty_expiry')
        if (!val) return 'Unknown'
        const days = Math.round((new Date(val) - new Date()) / 86400000)
        if (days < 0) return 'Expired'
        if (days < 90) return 'Expiring Soon'
        return 'Active'
      },
      render: a => <WarrantyBadge asset={a} />,
    },
    {
      key: 'age',
      label: 'Age',
      defaultVisible: true,
      defaultWidth: 70,
      sortVal: a => {
        const { val } = resolvedDate(a, 'purchase_date')
        return val ? new Date(val).getTime() : Infinity
      },
      filterVal: a => {
        const { val } = resolvedDate(a, 'purchase_date')
        if (!val) return '—'
        const yrs = (new Date() - new Date(val)) / (365.25 * 86400000)
        if (yrs < 1) return '< 1 year'
        if (yrs < 2) return '1–2 years'
        if (yrs < 3) return '2–3 years'
        if (yrs < 5) return '3–5 years'
        return '5+ years'
      },
      render: a => {
        const { val } = resolvedDate(a, 'purchase_date')
        const age = fmtAge(val)
        if (!age) return <span className="text-xs text-gray-400">—</span>
        const yrs = val ? (new Date() - new Date(val)) / (365.25 * 86400000) : 0
        return (
          <span className={`text-sm font-medium whitespace-nowrap ${yrs > 5 ? 'text-red-600' : yrs > 3 ? 'text-amber-600' : 'text-gray-700'}`}>
            {age}
          </span>
        )
      },
    },
    {
      key: 'serial_number',
      label: 'Serial Number',
      defaultVisible: false,
      defaultWidth: 140,
      sortVal: a => a.serial_number || '',
      filterVal: a => a.serial_number ? 'Has Serial' : 'No Serial',
      render: a => <span className="text-sm font-mono text-gray-600 whitespace-nowrap">{a.serial_number || '—'}</span>,
    },
    {
      key: 'ip_address',
      label: 'IP Address',
      defaultVisible: false,
      defaultWidth: 120,
      sortVal: a => a.ip_address || '',
      filterVal: a => a.ip_address ? 'Has IP' : '—',
      render: a => <span className="text-sm font-mono text-gray-600 whitespace-nowrap">{a.ip_address || '—'}</span>,
    },
    {
      key: 'sources',
      label: 'Sources',
      defaultVisible: false,
      defaultWidth: 120,
      sortVal: a => [a.datto_rmm_device_id, a.it_glue_config_id, a.autotask_ci_id].filter(Boolean).length,
      filterVal: a => {
        const srcs = []
        if (a.datto_rmm_device_id) srcs.push('RMM')
        if (a.it_glue_config_id) srcs.push('ITG')
        if (a.autotask_ci_id) srcs.push('PSA')
        return srcs.length ? srcs.join('+') : 'Unknown'
      },
      render: a => (
        <div className="flex items-center gap-1 flex-nowrap">
          {a.datto_rmm_device_id && <span className="text-xs bg-primary-50 text-primary-700 rounded px-1 py-0.5 font-medium">RMM</span>}
          {a.it_glue_config_id && <span className="text-xs bg-green-50 text-green-700 rounded px-1 py-0.5 font-medium">ITG</span>}
          {a.autotask_ci_id && <span className="text-xs bg-gray-100 text-gray-500 rounded px-1 py-0.5 font-medium">PSA</span>}
          {a.auvik_device_id && <span className="text-xs bg-purple-50 text-purple-700 rounded px-1 py-0.5 font-medium">Auvik</span>}
        </div>
      ),
    },
  ]
}

// ─── Column filter popover ────────────────────────────────────────────────────

function ColFilterPopover({ col, assets, activeFilters, onFilterChange, onClose, triggerRect }) {
  const ref = useRef(null)
  const values = useMemo(() => {
    const set = new Map()
    for (const a of assets) {
      const v = col.filterVal(a)
      set.set(v, (set.get(v) || 0) + 1)
    }
    return [...set.entries()].sort(([a], [b]) => {
      if (a === '—') return 1
      if (b === '—') return -1
      return a.localeCompare(b)
    })
  }, [assets, col])

  const selected = activeFilters || new Set()

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function toggle(val) {
    const next = new Set(selected)
    if (next.has(val)) next.delete(val)
    else next.add(val)
    onFilterChange(next.size ? next : null)
  }

  function selectAll() { onFilterChange(null) }
  function clearAll() { onFilterChange(new Set(values.map(([v]) => v))) }

  // Position below the trigger button, flipping left if near right edge
  const left = triggerRect
    ? Math.min(triggerRect.left, window.innerWidth - 224 - 8)
    : 0
  const top = triggerRect ? triggerRect.bottom + 4 : 0

  return createPortal(
    <div ref={ref}
      style={{ position: 'fixed', top, left, zIndex: 9999 }}
      className="w-56 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{col.label}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
      </div>
      <div className="px-2 py-1 flex gap-2 border-b border-gray-100">
        <button onClick={selectAll} className="text-xs text-primary-600 hover:text-primary-700 font-medium px-1 py-0.5">All</button>
        <button onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-700 px-1 py-0.5">None</button>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {values.map(([val, count]) => {
          const isActive = !selected.size || !selected.has(val)
          return (
            <div key={val}
              onClick={() => toggle(val)}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer select-none">
              {isActive
                ? <CheckSquare size={13} className="text-primary-600 shrink-0" />
                : <Square size={13} className="text-gray-300 shrink-0" />}
              <span className="text-sm text-gray-700 flex-1 truncate">{val}</span>
              <span className="text-xs text-gray-400">{count}</span>
            </div>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

// ─── Column chooser dropdown ──────────────────────────────────────────────────

function ColumnChooser({ columns, visible, onToggle }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
          open ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}>
        <Columns size={14} /> Columns
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 w-52 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Show / Hide Columns</span>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {columns.map(col => (
              <label key={col.key}
                className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                <span className="text-gray-400">
                  {visible.has(col.key)
                    ? <CheckSquare size={14} className="text-primary-600" />
                    : <Square size={14} />}
                </span>
                <span className="text-sm text-gray-700">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {/* Use invisible overlay for toggle since label onClick is tricky */}
      {open && columns.map(col => (
        <button key={col.key} onClick={() => onToggle(col.key)}
          className="absolute opacity-0 pointer-events-none" />
      ))}
    </div>
  )
}

// Simpler column chooser implementation using direct click on label
function ColumnChooserV2({ columns, visible, onToggle }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
          open ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}>
        <Columns size={14} /> Columns
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 w-52 bg-white rounded-xl shadow-xl border border-gray-200">
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Columns</span>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {columns.map(col => (
              <div key={col.key}
                onClick={() => onToggle(col.key)}
                className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                {visible.has(col.key)
                  ? <CheckSquare size={14} className="text-primary-600 shrink-0" />
                  : <Square size={14} className="text-gray-300 shrink-0" />}
                <span className="text-sm text-gray-700">{col.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(visibleCols, rows) {
  const header = visibleCols.map(c => `"${c.label}"`).join(',')
  const lines = rows.map(row =>
    visibleCols.map(c => {
      // Get raw value for CSV (not JSX)
      let val = ''
      if (c.key === 'name') val = row.name || ''
      else if (c.key === 'client_name') val = row.client_name || ''
      else if (c.key === 'type') val = row.asset_type_name || ''
      else if (c.key === 'hostname') val = row.hostname || ''
      else if (c.key === 'last_user') val = row.last_user || ''
      else if (c.key === 'last_seen_at') val = row.last_seen_at ? new Date(row.last_seen_at).toLocaleDateString() : ''
      else if (c.key === 'ram') {
        const bytes = row.ram_bytes || row.autotask_data?.rmmDeviceAuditMemoryBytes
        val = fmtRam(bytes) || ''
      }
      else if (c.key === 'cpu') val = row.cpu_description || ''
      else if (c.key === 'cpu_cores') val = row.cpu_cores || ''
      else if (c.key === 'storage') {
        const bytes = row.storage_bytes || row.autotask_data?.rmmDeviceAuditStorageBytes
        val = fmtBytes(bytes) || ''
      }
      else if (c.key === 'free_space') val = fmtBytes(row.storage_free_bytes) || ''
      else if (c.key === 'manufacturer') val = row.manufacturer || row.datto_rmm_data?.manufacturer || ''
      else if (c.key === 'model') val = row.model || row.datto_rmm_data?.model || ''
      else if (c.key === 'operating_system') val = row.operating_system || ''
      else if (c.key === 'purchase_date') { const { val: v } = resolvedDate(row, 'purchase_date'); val = v ? new Date(v).toLocaleDateString() : '' }
      else if (c.key === 'warranty_expiry') { const { val: v } = resolvedDate(row, 'warranty_expiry'); val = v ? new Date(v).toLocaleDateString() : '' }
      else if (c.key === 'age') { const { val: v } = resolvedDate(row, 'purchase_date'); val = fmtAge(v) || '' }
      else if (c.key === 'serial_number') val = row.serial_number || ''
      else if (c.key === 'ip_address') val = row.ip_address || ''
      return `"${String(val).replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv = [header, ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `hardware-assets-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Bulk Action Bar ─────────────────────────────────────────────────────────

function BulkActionBar({ selectedIds, assetTypes, clients, clientId, onAction, onClear, onCreateRec }) {
  const [action, setAction] = useState('')
  const [value, setValue] = useState('')
  const [running, setRunning] = useState(false)
  const [open, setOpen] = useState(false)
  const [recs, setRecs] = useState([])
  const [recsLoaded, setRecsLoaded] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Lazy-load recommendations when action dropdown opens
  useEffect(() => {
    if (open && !recsLoaded) {
      const url = clientId ? `/recommendations?client_id=${clientId}&limit=200` : '/recommendations?limit=200'
      api.get(url)
        .then(r => {
          const list = r.data?.data || r.data || []
          setRecs(list.filter(r => r.status !== 'completed' && r.status !== 'declined'))
        })
        .catch(console.error)
        .finally(() => setRecsLoaded(true))
    }
  }, [open, recsLoaded, clientId])

  async function runAction() {
    if (!action) return
    setRunning(true)
    try {
      if (action === 'add_to_rec' && value) {
        await api.post(`/recommendations/${value}/assets/bulk`, { asset_ids: [...selectedIds] })
        onAction('add_to_rec', [...selectedIds])
        setAction(''); setValue('')
        return
      }
      if (action === 'create_rec') {
        // Create the recommendation, link selected assets, then open inline editor
        const res = await api.post('/recommendations', {
          client_id: clientId || null,
          title: 'New Recommendation',
          kind: 'recommendation',
          status: 'draft',
          priority: 'medium',
          type: 'improvement',
        })
        const recId = res.data.id
        if (selectedIds.size > 0) {
          await api.post(`/recommendations/${recId}/assets/bulk`, { asset_ids: [...selectedIds] })
        }
        onCreateRec(recId)
        setAction('')
        return
      }
      const body = { ids: [...selectedIds], action, value: value || undefined }
      const result = await api.post('/assets/bulk', body)
      onAction(action, result.ids || [])
      setAction(''); setValue('')
    } catch (e) {
      alert(e.message || 'Bulk action failed')
    } finally {
      setRunning(false)
    }
  }

  const count = selectedIds.size

  const ACTIONS = [
    { value: 'mark_inactive',  label: 'Mark as Inactive',           icon: EyeOff,  needsValue: false,  confirm: true  },
    { value: 'mark_active',    label: 'Mark as Active',             icon: Eye,     needsValue: false,  confirm: false },
    { value: 'set_type',       label: 'Change Type',                icon: Tag,     needsValue: 'type', confirm: false },
    { value: 'set_client',     label: 'Move to Client',             icon: Users,   needsValue: 'client', confirm: false },
    { divider: true },
    { value: 'add_to_rec',     label: 'Add to Recommendation',      icon: ClipboardList, needsValue: 'rec', confirm: false },
    { value: 'create_rec',     label: 'Create New Recommendation',  icon: PlusCircle,    needsValue: false, confirm: false },
  ]

  const selectedAction = ACTIONS.find(a => !a.divider && a.value === action)
  const canRun = action && (
    action === 'create_rec' ||
    (action === 'add_to_rec' && value) ||
    (!selectedAction?.needsValue || value)
  )

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-primary-900 rounded-xl text-white mb-3 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{count} selected</span>
        <button onClick={onClear} className="text-primary-300 hover:text-white text-xs underline">clear</button>
      </div>

      <div className="flex items-center gap-2 ml-auto flex-wrap">
        {/* Action selector */}
        <div ref={ref} className="relative">
          <button onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-700 hover:bg-primary-600 rounded-lg transition-colors border border-primary-600">
            {selectedAction?.label || 'Choose action…'}
            <ChevronDownIcon size={13} />
          </button>
          {open && (
            <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
              {ACTIONS.map((opt, i) => {
                if (opt.divider) return <div key={`div-${i}`} className="border-t border-gray-100 my-1" />
                const Icon = opt.icon
                return (
                  <div key={opt.value}
                    onClick={() => { setAction(opt.value); setValue(''); setOpen(false) }}
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer text-gray-700">
                    <Icon size={13} className="text-gray-400" />
                    <span className="text-sm">{opt.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Value selector when needed */}
        {action === 'set_type' && (
          <select value={value} onChange={e => setValue(e.target.value)}
            className="px-2 py-1.5 text-sm text-gray-800 bg-white rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="">Select type…</option>
            {assetTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {action === 'set_client' && (
          <select value={value} onChange={e => setValue(e.target.value)}
            className="px-2 py-1.5 text-sm text-gray-800 bg-white rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="">Select client…</option>
            {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {action === 'add_to_rec' && (
          <select value={value} onChange={e => setValue(e.target.value)}
            className="px-2 py-1.5 text-sm text-gray-800 bg-white rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-400 max-w-xs">
            <option value="">Select recommendation…</option>
            {recs.length === 0 && recsLoaded && <option disabled>No open recommendations</option>}
            {recs.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        )}

        <button onClick={runAction} disabled={!canRun || running}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-white text-primary-900 rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors">
          {running ? (
            <><span className="w-3.5 h-3.5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /> Running…</>
          ) : 'Apply'}
        </button>
      </div>
    </div>
  )
}

// ─── Main HardwareTable component ────────────────────────────────────────────

export default function HardwareTable({ assets, assetTypes, onRowClick, onBulkUpdate, clients, clientId }) {
  const allColumns = useMemo(() => buildColumns(assetTypes), [assetTypes])
  const [newRecId, setNewRecId] = useState(null)
  const dragColKey = useRef(null)

  const [visibleCols, setVisibleCols] = useState(
    () => {
      const defaultVisible = new Set(allColumns.filter(c => c.defaultVisible).map(c => c.key))
      // In client-specific views, hide the client column — already known from context
      if (clientId) defaultVisible.delete('client_name')
      return defaultVisible
    }
  )
  const [sort, setSort] = useState({ col: 'name', dir: 'asc' })
  const [colFilters, setColFilters] = useState({}) // { colKey: Set<string> | null }
  const [openFilter, setOpenFilter] = useState(null) // { key, rect } | null
  // Initialize colWidths from defaultWidth so columns start at the right size
  const [colWidths, setColWidths] = useState(
    () => {
      const widths = {}
      for (const col of allColumns) {
        if (col.defaultWidth) widths[col.key] = col.defaultWidth
      }
      return widths
    }
  )
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [colOrder, setColOrder] = useState(() => allColumns.map(c => c.key))
  const resizeDrag = useRef(null)

  const columns = useMemo(() => {
    const visible = allColumns.filter(c => visibleCols.has(c.key))
    // Sort by colOrder; columns not in colOrder go to end
    return [...visible].sort((a, b) => {
      const ai = colOrder.indexOf(a.key)
      const bi = colOrder.indexOf(b.key)
      if (ai === -1 && bi === -1) return 0
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  }, [allColumns, visibleCols, colOrder])

  function toggleCol(key) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelect(id, e) {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll(ids) {
    setSelectedIds(prev => {
      if (ids.every(id => prev.has(id))) {
        // Deselect all visible
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      }
      // Select all visible
      const next = new Set(prev)
      ids.forEach(id => next.add(id))
      return next
    })
  }

  function handleBulkAction(action, updatedIds) {
    setSelectedIds(new Set())
    if (onBulkUpdate) onBulkUpdate(action, updatedIds)
  }

  function onResizeStart(e, colKey, thEl) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = thEl.offsetWidth
    resizeDrag.current = { key: colKey, startX, startW }

    function onMouseMove(e) {
      const { key, startX, startW } = resizeDrag.current
      const newW = Math.max(60, startW + (e.clientX - startX))
      setColWidths(prev => ({ ...prev, [key]: newW }))
    }
    function onMouseUp() {
      resizeDrag.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // Apply column filters
  const filtered = useMemo(() => {
    return assets.filter(a => {
      for (const [key, excluded] of Object.entries(colFilters)) {
        if (!excluded || excluded.size === 0) continue
        const col = allColumns.find(c => c.key === key)
        if (!col) continue
        const val = col.filterVal(a)
        if (excluded.has(val)) return false
      }
      return true
    })
  }, [assets, colFilters, allColumns])

  // Sort
  const sorted = useMemo(() => {
    const col = allColumns.find(c => c.key === sort.col) || allColumns[0]
    return [...filtered].sort((a, b) => {
      const av = col.sortVal(a)
      const bv = col.sortVal(b)
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort, allColumns])

  const activeFilterCount = Object.values(colFilters).filter(v => v && v.size > 0).length
  const isFilterOpen = key => openFilter?.key === key

  function clearAllFilters() { setColFilters({}); setOpenFilter(null) }

  const sortedIds = sorted.map(a => a.id)
  const allSortedSelected = sortedIds.length > 0 && sortedIds.every(id => selectedIds.has(id))
  const someSortedSelected = sortedIds.some(id => selectedIds.has(id)) && !allSortedSelected

  return (
    <div>
      {/* Inline rec editor opened after "Create Recommendation" bulk action */}
      {newRecId && (
        <RecEditModal recId={newRecId} onClose={() => setNewRecId(null)} onSaved={() => {}} />
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{sorted.length.toLocaleString()}</span>
          {sorted.length !== assets.length && ` of ${assets.length.toLocaleString()}`} assets
        </span>

        {activeFilterCount > 0 && (
          <button onClick={clearAllFilters}
            className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 hover:bg-amber-100 transition-colors">
            <X size={11} /> {activeFilterCount} column filter{activeFilterCount > 1 ? 's' : ''} active
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <ColumnChooserV2 columns={allColumns} visible={visibleCols} onToggle={toggleCol} />
          <button
            onClick={() => exportCsv(columns, sorted)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Bulk action bar — visible when assets are selected */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          assetTypes={assetTypes}
          clients={clients}
          clientId={clientId}
          onAction={handleBulkAction}
          onClear={() => setSelectedIds(new Set())}
          onCreateRec={id => setNewRecId(id)}
        />
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <table className="text-sm" style={{ minWidth: 'max-content', width: '100%' }}>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {/* Checkbox column header */}
                <th style={{ width: 40, minWidth: 40 }} className="px-3 py-2.5 text-center">
                  <button
                    onClick={() => toggleSelectAll(sortedIds)}
                    className="flex items-center justify-center w-4 h-4 text-gray-400 hover:text-primary-600 transition-colors mx-auto">
                    {allSortedSelected
                      ? <CheckSquare size={14} className="text-primary-600" />
                      : someSortedSelected
                        ? <Minus size={14} className="text-primary-400" />
                        : <Square size={14} />}
                  </button>
                </th>
                {columns.map(col => {
                  const isSort = sort.col === col.key
                  const hasFilter = colFilters[col.key] && colFilters[col.key].size > 0
                  const filterOpen = isFilterOpen(col.key)
                  const w = colWidths[col.key] || col.defaultWidth
                  return (
                    <th key={col.key}
                      style={w ? { width: w, minWidth: w } : { minWidth: 80 }}
                      className="relative text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap select-none group/th"
                      draggable
                      onDragStart={e => {
                        dragColKey.current = col.key
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragOver={e => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={e => {
                        e.preventDefault()
                        const from = dragColKey.current
                        const to = col.key
                        if (!from || from === to) return
                        setColOrder(prev => {
                          const order = prev.length ? [...prev] : allColumns.map(c => c.key)
                          const fi = order.indexOf(from)
                          const ti = order.indexOf(to)
                          if (fi === -1 || ti === -1) return order
                          const next = [...order]
                          next.splice(fi, 1)
                          next.splice(ti, 0, from)
                          return next
                        })
                        dragColKey.current = null
                      }}
                      onDragEnd={() => { dragColKey.current = null }}>
                      <div className="flex items-center gap-1 cursor-grab active:cursor-grabbing">
                        <button
                          onClick={() => setSort(s => s.col === col.key ? { col: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col: col.key, dir: 'asc' })}
                          className="flex items-center gap-1 hover:text-gray-800 transition-colors cursor-grab active:cursor-grabbing">
                          {col.label}
                          {isSort
                            ? (sort.dir === 'asc' ? <ChevronUp size={11} className="text-primary-600" /> : <ChevronDown size={11} className="text-primary-600" />)
                            : <ChevronDown size={11} className="text-gray-300" />}
                        </button>
                        <button
                          onClick={e => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setOpenFilter(filterOpen ? null : { key: col.key, rect })
                          }}
                          className={`p-0.5 rounded transition-colors ${
                            hasFilter ? 'text-primary-600 bg-primary-50' : 'text-gray-300 hover:text-gray-500'
                          } ${filterOpen ? 'text-primary-600' : ''}`}
                          title="Filter column">
                          <Filter size={10} />
                        </button>
                      </div>
                      {/* Resize handle */}
                      <div
                        onMouseDown={e => onResizeStart(e, col.key, e.currentTarget.closest('th'))}
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover/th:opacity-100 hover:!opacity-100 bg-primary-300 hover:bg-primary-500 transition-opacity"
                        style={{ userSelect: 'none' }}
                      />
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-sm text-gray-400">
                    No assets match the current filters.
                  </td>
                </tr>
              ) : sorted.map(asset => {
                const isSelected = selectedIds.has(asset.id)
                return (
                  <tr key={asset.id}
                    onClick={() => onRowClick && onRowClick(asset)}
                    className={`transition-colors cursor-pointer ${isSelected ? 'bg-primary-50 hover:bg-primary-50' : 'hover:bg-gray-50'}`}>
                    {/* Checkbox cell */}
                    <td style={{ width: 40, minWidth: 40 }} className="px-3 py-2.5 text-center" onClick={e => toggleSelect(asset.id, e)}>
                      <span className="flex items-center justify-center">
                        {isSelected
                          ? <CheckSquare size={14} className="text-primary-600" />
                          : <Square size={14} className="text-gray-200 hover:text-gray-400" />}
                      </span>
                    </td>
                    {columns.map(col => (
                      <td key={col.key} className="px-3 py-2.5">
                        {col.render(asset)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
      </div>

      {/* Column filter popover — rendered via portal to escape overflow clipping */}
      {openFilter && (() => {
        const col = allColumns.find(c => c.key === openFilter.key)
        if (!col) return null
        return (
          <ColFilterPopover
            col={col}
            assets={assets}
            activeFilters={colFilters[openFilter.key]}
            onFilterChange={val => setColFilters(prev => ({ ...prev, [openFilter.key]: val }))}
            onClose={() => setOpenFilter(null)}
            triggerRect={openFilter.rect}
          />
        )
      })()}
    </div>
  )
}
