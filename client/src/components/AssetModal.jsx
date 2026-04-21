import { useState, useEffect, useMemo } from 'react'
import {
  X, ExternalLink, Monitor, Server, Laptop, Wifi, Shield,
  Router, HardDrive, Printer, Cpu, Box, Activity, Save,
  CheckCircle, AlertCircle, AlertTriangle, Shield as ShieldIcon,
  Clock, Thermometer, User, Globe, Eye, EyeOff, Building2,
  Search, Package,
} from 'lucide-react'
import { api } from '../lib/api'
import { autotaskUrl } from '../lib/autotask'

const TYPE_ICONS = {
  'Workstation': Monitor, 'Laptop': Laptop, 'Server': Server,
  'Switch': Wifi, 'Firewall': Shield, 'Router': Router,
  'Access Point': Wifi, 'UPS': Activity, 'NAS/SAN': HardDrive,
  'Printer': Printer, 'Virtual Machine': Cpu, 'Monitor': Monitor, 'Other': Box,
}

function fmtDate(val) {
  if (!val) return ''
  return new Date(val).toISOString().slice(0, 10)
}

function fmtRam(bytes) {
  if (!bytes || bytes === 0) return null
  const gb = bytes / (1024 ** 3)
  return gb >= 1 ? `${Math.round(gb)} GB` : `${Math.round(bytes / (1024 ** 2))} MB`
}

function fmtStorage(bytes) {
  if (!bytes || bytes === 0) return null
  const gb = bytes / (1024 ** 3)
  return gb >= 1000 ? `${(gb / 1024).toFixed(1)} TB` : `${Math.round(gb)} GB`
}

function fmtRelative(val) {
  if (!val) return null
  const ms = Date.now() - new Date(val).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins} minutes ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  if (days < 365) return `${days} day${days > 1 ? 's' : ''} ago`
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) > 1 ? 's' : ''} ago`
}

function fmtAge(val) {
  if (!val) return null
  const ms = Date.now() - new Date(val).getTime()
  const days = Math.floor(ms / 86400000)
  if (days < 365) return `${days} days`
  const yrs = Math.floor(days / 365)
  const rem = Math.floor((days % 365) / 30)
  return rem > 0 ? `${yrs} yr ${rem} mo` : `${yrs} yr`
}

function WarrantyLine({ expiry }) {
  if (!expiry) return <span className="text-gray-400">Unknown</span>
  const d = new Date(expiry)
  const now = new Date()
  const days = Math.round((d - now) / 86400000)
  const fmt = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  if (days < 0) return <span className="text-red-600 font-medium flex items-center gap-1"><AlertCircle size={13} /> Expired {fmt}</span>
  if (days < 90) return <span className="text-yellow-600 font-medium flex items-center gap-1"><AlertTriangle size={13} /> Expires in {days} days ({fmt})</span>
  return <span className="text-green-700 font-medium flex items-center gap-1"><CheckCircle size={13} /> Active until {fmt}</span>
}

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 flex-1 break-all">{value}</span>
    </div>
  )
}

function SectionHeader({ label }) {
  return (
    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-4 pb-1 border-b border-gray-100 mt-3 mb-1 first:mt-0 first:pt-0">
      {label}
    </div>
  )
}

function AssetSoftwareTab({ assetId }) {
  const [software, setSoftware] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [pubFilter, setPubFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    api.get(`/software/device/${assetId}`)
      .then(res => setSoftware(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [assetId])

  const categories = useMemo(() => {
    const c = {}
    software.forEach(s => { const cat = s.category || 'Uncategorized'; c[cat] = (c[cat] || 0) + 1 })
    return Object.entries(c).sort((a, b) => b[1] - a[1])
  }, [software])

  const publishers = useMemo(() => {
    const p = {}
    software.forEach(s => { const pub = s.publisher || s.vendor; if (pub) p[pub] = (p[pub] || 0) + 1 })
    return Object.entries(p).sort((a, b) => b[1] - a[1])
  }, [software])

  const filtered = useMemo(() => {
    return software.filter(s => {
      if (catFilter && (s.category || 'Uncategorized') !== catFilter) return false
      if (pubFilter && (s.publisher || s.vendor) !== pubFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (s.name || '').toLowerCase().includes(q) ||
               (s.publisher || s.vendor || '').toLowerCase().includes(q) ||
               (s.category || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [software, catFilter, pubFilter, search])

  const hasFilters = search || catFilter || pubFilter

  if (loading) return <div className="py-12 text-center text-gray-400"><Package size={24} className="mx-auto mb-2 text-gray-200 animate-pulse" />Loading software...</div>

  if (software.length === 0) return (
    <div className="text-center py-12 text-gray-400 px-5">
      <Package size={32} className="mx-auto mb-3 text-gray-200" />
      <p className="text-sm">No software data for this device</p>
      <p className="text-xs mt-1">Run a Software sync from Datto RMM to populate</p>
    </div>
  )

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">{filtered.length} of {software.length} installed applications</p>
        {hasFilters && (
          <button onClick={() => { setSearch(''); setCatFilter(''); setPubFilter('') }}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium">Clear all</button>
        )}
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Find installed software..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={12} /></button>}
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none">
          <option value="">All categories</option>
          {categories.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        <select value={pubFilter} onChange={e => setPubFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none">
          <option value="">All publishers</option>
          {publishers.map(([p, n]) => <option key={p} value={p}>{p} ({n})</option>)}
        </select>
      </div>

      {/* Software list */}
      <div className="rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider">Publisher</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider">Product Name</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider">Category</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider">Version</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-600">{s.publisher || s.vendor || '—'}</td>
                <td className="px-3 py-2 font-medium text-primary-600">{s.name}</td>
                <td className="px-3 py-2 text-gray-500">{s.category || '—'}</td>
                <td className="px-3 py-2 text-gray-500 font-mono">{s.version || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No software matches your filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function AssetModal({ asset, assetTypes, onClose, onSave }) {
  const [tab, setTab] = useState('details')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clients, setClients] = useState([])

  const [form, setForm] = useState({
    client_id:      asset.client_id || '',
    asset_type_id:  asset.asset_type_id || '',
    name:           asset.name || '',
    serial_number:  asset.serial_number || '',
    manufacturer:   asset.manufacturer || '',
    model:          asset.model || '',
    warranty_expiry: fmtDate(asset.warranty_expiry),
    purchase_date:  fmtDate(asset.purchase_date),
    eol_date:       fmtDate(asset.eol_date),
    notes:          asset.notes || '',
    is_managed:     asset.is_managed !== false,
  })

  // Load clients list for reassignment
  useEffect(() => {
    api.get('/clients?limit=500').then(res => {
      setClients((res.data || []).sort((a, b) => a.name.localeCompare(b.name)))
    }).catch(() => {})
  }, [])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        client_id:      form.client_id || null,
        asset_type_id:  form.asset_type_id || null,
        name:           form.name,
        serial_number:  form.serial_number || null,
        manufacturer:   form.manufacturer || null,
        model:          form.model || null,
        warranty_expiry: form.warranty_expiry || null,
        purchase_date:  form.purchase_date || null,
        eol_date:       form.eol_date || null,
        notes:          form.notes || null,
        is_managed:     form.is_managed,
      }
      const res = await api.patch(`/assets/${asset.id}`, payload)
      // Merge resolved names from our local lists
      const typeName = assetTypes.find(t => t.id === res.data.asset_type_id)?.name
      const clientName = clients.find(c => c.id === res.data.client_id)?.name || asset.client_name
      onSave({ ...res.data, asset_type_name: typeName, client_name: clientName })
      setEditing(false)
    } catch (err) {
      console.error('Failed to save asset:', err)
    } finally {
      setSaving(false)
    }
  }

  const rmm = asset.datto_rmm_data || {}
  const itg = asset.it_glue_data?.attributes || {}
  const TypeIcon = TYPE_ICONS[asset.asset_type_name] || Box
  const dattoUrl = rmm.portalUrl
  const itgUrl = itg['resource-url']
  const webRemoteUrl = rmm.webRemoteUrl

  // Source count
  const sourceCount = [asset.datto_rmm_device_id, asset.it_glue_config_id,
    asset.autotask_ci_id, asset.auvik_device_id].filter(Boolean).length

  // Formatted hardware values
  const ramDisplay = fmtRam(asset.ram_bytes)
  const storageDisplay = asset.storage_bytes
    ? `${fmtStorage(asset.storage_bytes)}${asset.storage_free_bytes ? ` (${fmtStorage(asset.storage_free_bytes)} free)` : ''}`
    : null
  const cpuDisplay = asset.cpu_description
    ? `${asset.cpu_description}${asset.cpu_cores ? ` · ${asset.cpu_cores} cores` : ''}`
    : asset.cpu_cores ? `${asset.cpu_cores} cores` : null
  const lastSeenDisplay = asset.last_seen_at
    ? `${fmtRelative(asset.last_seen_at)} (${new Date(asset.last_seen_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`
    : null
  const ageDisplay = asset.purchase_date ? fmtAge(asset.purchase_date) : null

  // Display last_user — strip domain prefix if present
  const lastUserDisplay = asset.last_user
    ? (asset.last_user.includes('\\') ? asset.last_user.split('\\').pop() : asset.last_user)
    : null

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-[620px] h-full bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
            <TypeIcon size={18} className="text-primary-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900 truncate">{asset.name}</h2>
              {asset.is_online === true && (
                <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Online
                </span>
              )}
              {asset.is_online === false && (
                <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />Offline
                </span>
              )}
              {!asset.is_managed && (
                <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Untracked</span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{asset.client_name} · {asset.asset_type_name || 'Unknown Type'}</p>
            {/* Source links */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {dattoUrl && (
                <a href={dattoUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
                  Datto RMM <ExternalLink size={10} />
                </a>
              )}
              {webRemoteUrl && (
                <a href={webRemoteUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium">
                  Remote Control <ExternalLink size={10} />
                </a>
              )}
              {itgUrl && (
                <a href={itgUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium">
                  IT Glue <ExternalLink size={10} />
                </a>
              )}
              {asset.autotask_ci_id && (
                <a
                  href={autotaskUrl('ci', asset.autotask_ci_id)}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-medium">
                  Autotask <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5 gap-1 shrink-0">
          {['details', 'live data', 'software', 'warranty', 'sources'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                tab === t ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'sources' ? `Sources (${sourceCount})` : t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Details tab ──────────────────────────────────────────────── */}
          {tab === 'details' && (
            <div className="px-5 py-4">
              {!editing ? (
                <>
                  {/* Read-only view */}
                  <SectionHeader label="Identity" />
                  <div className="space-y-0">
                    <InfoRow label="Name"          value={asset.name} />
                    <InfoRow label="Type"          value={asset.asset_type_name} />
                    <InfoRow label="Client"        value={asset.client_name} />
                    <InfoRow label="Hostname"      value={asset.hostname} />
                    <InfoRow label="Serial Number" value={asset.serial_number} />
                    <InfoRow label="Manufacturer"  value={asset.manufacturer} />
                    <InfoRow label="Model"         value={asset.model} />
                    <InfoRow label="MAC Address"   value={asset.mac_address} />
                  </div>

                  <SectionHeader label="Warranty & Lifecycle" />
                  <div className="space-y-0">
                    <div className="flex items-start gap-3 py-1.5 border-b border-gray-50">
                      <span className="text-xs text-gray-400 w-32 shrink-0 pt-0.5">Warranty</span>
                      <span className="text-sm flex-1"><WarrantyLine expiry={asset.warranty_expiry} /></span>
                    </div>
                    <InfoRow label="Purchase Date" value={asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null} />
                    <InfoRow label="Age"           value={ageDisplay} />
                    <InfoRow label="EOL Date"      value={asset.eol_date ? new Date(asset.eol_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null} />
                  </div>

                  <SectionHeader label="Hardware" />
                  <div className="space-y-0">
                    <InfoRow label="Manufacturer"  value={asset.manufacturer} />
                    <InfoRow label="Model"         value={asset.model} />
                    <InfoRow label="Motherboard"   value={asset.motherboard} />
                    <InfoRow label="CPU"           value={cpuDisplay} />
                    <InfoRow label="RAM"           value={ramDisplay} />
                    <InfoRow label="Storage"       value={storageDisplay} />
                    <InfoRow label="Display"       value={asset.display_adapters} />
                    <InfoRow label="OS"            value={[asset.operating_system, asset.os_version].filter(Boolean).join(' ')} />
                    <InfoRow label="IP Address"    value={asset.ip_address} />
                    <InfoRow label="MAC Address"   value={asset.mac_address} />
                  </div>

                  <SectionHeader label="RMM Status" />
                  <div className="space-y-0">
                    <InfoRow label="Last Seen"     value={lastSeenDisplay} />
                    <InfoRow label="Last User"     value={lastUserDisplay} />
                    <InfoRow label="Patch Status"  value={asset.patch_status} />
                    <InfoRow label="Antivirus"     value={asset.antivirus_status} />
                    <InfoRow label="Tracking"      value={asset.is_managed !== false ? 'Tracked' : 'Untracked'} />
                  </div>

                  {asset.notes && (
                    <>
                      <SectionHeader label="Notes" />
                      <div className="text-sm text-gray-700 whitespace-pre-wrap py-1">{asset.notes}</div>
                    </>
                  )}

                  <button
                    onClick={() => setEditing(true)}
                    className="mt-5 flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Edit Asset
                  </button>
                </>
              ) : (
                /* Edit form */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">

                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                      <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <span className="flex items-center gap-1"><Building2 size={12} /> Client / Company</span>
                      </label>
                      <select value={form.client_id} onChange={e => set('client_id', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
                        <option value="">-- Select client --</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {form.client_id && form.client_id !== asset.client_id && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <AlertTriangle size={11} /> This will move the asset to a different company
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Asset Type</label>
                      <select value={form.asset_type_id} onChange={e => set('asset_type_id', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
                        <option value="">-- Select type --</option>
                        {assetTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Serial Number</label>
                      <input type="text" value={form.serial_number} onChange={e => set('serial_number', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Manufacturer</label>
                      <input type="text" value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
                      <input type="text" value={form.model} onChange={e => set('model', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Warranty Expiry</label>
                      <input type="date" value={form.warranty_expiry} onChange={e => set('warranty_expiry', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Purchase Date</label>
                      <input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">End-of-Life Date</label>
                      <input type="date" value={form.eol_date} onChange={e => set('eol_date', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                      <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
                    </div>

                    <div className="col-span-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <div
                          onClick={() => set('is_managed', !form.is_managed)}
                          className={`relative w-11 h-6 rounded-full transition-colors ${form.is_managed ? 'bg-primary-600' : 'bg-gray-200'}`}
                        >
                          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_managed ? 'translate-x-5' : ''}`} />
                        </div>
                        <span className="text-sm text-gray-700">
                          {form.is_managed ? 'Tracked (included in reporting)' : 'Untracked (excluded from reporting)'}
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button onClick={handleSave} disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-60">
                      <Save size={14} />{saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Live Data tab ─────────────────────────────────────────────── */}
          {tab === 'live data' && (() => {
            const at = asset.autotask_data || {}
            const hasRmm = !!asset.datto_rmm_device_id
            const hasAt  = !!asset.autotask_ci_id
            // Autotask hardware — resolved strings stored on asset columns
            const atManufacturer  = asset.manufacturer
            const atModel         = asset.model
            const atMotherboard   = asset.motherboard
            const atCpu           = asset.cpu_description
            const atDisplay       = asset.display_adapters
            const atRam           = fmtRam(asset.ram_bytes)
            const atStorage       = fmtStorage(asset.storage_bytes)
            const atOs            = at.rmmDeviceAuditOperatingSystem || asset.operating_system
            const atLastUser      = asset.last_user
            const atSerial        = asset.serial_number
            const atMac           = asset.mac_address
            const atIp            = asset.ip_address
            const atHostname      = asset.hostname

            return (
              <div className="px-5 py-4 space-y-5">

                {/* Datto RMM section */}
                {hasRmm ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Monitor size={14} className="text-primary-500" />
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Datto RMM — Live Status</span>
                      <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${asset.is_online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {asset.is_online ? 'Online' : 'Offline'}
                      </span>
                    </div>

                    {/* Status tiles */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className={`rounded-xl p-3 text-center ${rmm.patchManagement?.patchStatus === 'FullyPatched' ? 'bg-green-50' : 'bg-yellow-50'}`}>
                        <p className={`text-sm font-bold ${rmm.patchManagement?.patchStatus === 'FullyPatched' ? 'text-green-600' : 'text-yellow-600'}`}>
                          {rmm.patchManagement?.patchStatus === 'FullyPatched' ? 'Fully Patched' : (rmm.patchManagement?.patchStatus || 'Unknown')}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Patch Status</p>
                      </div>
                      <div className={`rounded-xl p-3 text-center ${rmm.antivirus?.antivirusStatus?.includes('RunningAndUpToDate') ? 'bg-green-50' : 'bg-red-50'}`}>
                        <p className={`text-sm font-bold truncate ${rmm.antivirus?.antivirusStatus?.includes('RunningAndUpToDate') ? 'text-green-600' : 'text-red-600'}`}>
                          {rmm.antivirus?.antivirusProduct || 'No AV'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Antivirus</p>
                      </div>
                    </div>

                    {rmm.patchManagement && (
                      <div className="bg-gray-50 rounded-xl p-3 mb-3">
                        <p className="text-xs font-semibold text-gray-500 mb-2">Patch Counts</p>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div><p className="text-base font-bold text-green-600">{rmm.patchManagement.patchesInstalled || 0}</p><p className="text-xs text-gray-400">Installed</p></div>
                          <div><p className="text-base font-bold text-yellow-600">{rmm.patchManagement.patchesApprovedPending || 0}</p><p className="text-xs text-gray-400">Pending</p></div>
                          <div><p className="text-base font-bold text-gray-400">{rmm.patchManagement.patchesNotApproved || 0}</p><p className="text-xs text-gray-400">Not Approved</p></div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-0">
                      <InfoRow label="Hostname"      value={rmm.hostname} />
                      <InfoRow label="OS"            value={rmm.operatingSystem} />
                      <InfoRow label="Domain"        value={rmm.domain} />
                      <InfoRow label="Internal IP"   value={rmm.intIpAddress} />
                      <InfoRow label="External IP"   value={rmm.extIpAddress} />
                      <InfoRow label="Last User"     value={rmm.lastLoggedInUser} />
                      <InfoRow label="Last Seen"     value={rmm.lastSeen ? new Date(rmm.lastSeen).toLocaleString() : null} />
                      <InfoRow label="Last Reboot"   value={rmm.lastReboot ? new Date(rmm.lastReboot).toLocaleString() : null} />
                      <InfoRow label="Last Audit"    value={rmm.lastAuditDate ? new Date(rmm.lastAuditDate).toLocaleString() : null} />
                      <InfoRow label="Agent Version" value={rmm.displayVersion} />
                      <InfoRow label="Site"          value={rmm.siteName} />
                    </div>

                    {dattoUrl && (
                      <a href={dattoUrl} target="_blank" rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">
                        Open in Datto RMM <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400 border border-dashed border-gray-200 rounded-xl">
                    <Monitor size={28} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-sm">Not in Datto RMM</p>
                  </div>
                )}

                {/* Autotask hardware audit section */}
                {hasAt && (atManufacturer || atModel || atCpu || atRam || atMotherboard || atDisplay) && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Cpu size={14} className="text-gray-400" />
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Autotask — Hardware Audit</span>
                    </div>
                    <div className="space-y-0">
                      <InfoRow label="Manufacturer"  value={atManufacturer} />
                      <InfoRow label="Model"         value={atModel} />
                      <InfoRow label="Serial"        value={atSerial} />
                      <InfoRow label="Motherboard"   value={atMotherboard} />
                      <InfoRow label="Processor"     value={atCpu} />
                      <InfoRow label="Memory"        value={atRam} />
                      <InfoRow label="Storage"       value={atStorage} />
                      <InfoRow label="Display"       value={atDisplay} />
                      <InfoRow label="OS"            value={atOs} />
                      <InfoRow label="Last User"     value={atLastUser} />
                      <InfoRow label="Hostname"      value={atHostname} />
                      <InfoRow label="IP Address"    value={atIp} />
                      <InfoRow label="MAC Address"   value={atMac} />
                    </div>
                    {asset.autotask_ci_id && (
                      <a href={autotaskUrl('configurationItem', asset.autotask_ci_id)} target="_blank" rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors">
                        Open in Autotask <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                )}

                {!hasRmm && !hasAt && (
                  <div className="text-center py-10 text-gray-400">
                    <Monitor size={32} className="mx-auto mb-3 text-gray-200" />
                    <p className="text-sm">No live data available</p>
                    <p className="text-xs mt-1">This asset is not linked to Datto RMM or Autotask</p>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Software tab ─────────────────────────────────────────────── */}
          {tab === 'software' && <AssetSoftwareTab assetId={asset.id} />}

          {/* ── Warranty tab ──────────────────────────────────────────────── */}
          {tab === 'warranty' && (() => {
            const rmm = asset.datto_rmm_data || {}
            const at  = asset.autotask_data || {}
            const itg = asset.it_glue_data?.attributes || {}

            // Extract per-source warranty/purchase dates
            const sources = []

            if (asset.datto_rmm_device_id) {
              sources.push({
                key: 'datto',
                name: 'Datto RMM',
                color: 'text-primary-600 bg-primary-50 border-primary-200',
                dot:   'bg-primary-500',
                serial:   asset.serial_number || null,
                purchase: null, // Datto doesn't store purchase date
                warranty: rmm.warrantyExpirationDate || null,
                notes:    rmm.displayManufacturer ? `${rmm.displayManufacturer}${rmm.displayModel ? ' ' + rmm.displayModel : ''}` : null,
              })
            }
            if (asset.autotask_ci_id) {
              sources.push({
                key: 'autotask',
                name: 'Autotask PSA',
                color: 'text-gray-700 bg-gray-50 border-gray-200',
                dot:   'bg-gray-400',
                serial:   at.serialNumber || null,
                purchase: at.installDate || null,
                warranty: at.warrantyExpirationDate || null,
                notes:    null,
              })
            }
            if (asset.it_glue_config_id) {
              sources.push({
                key: 'itg',
                name: 'IT Glue',
                color: 'text-green-700 bg-green-50 border-green-200',
                dot:   'bg-green-500',
                serial:   itg['serial-number'] || null,
                purchase: itg['purchased-at'] || null,
                warranty: itg['warranty-expires-at'] || null,
                notes:    itg['configuration-type-name'] || null,
              })
            }
            if (asset.auvik_device_id) {
              const auvik = asset.auvik_data || {}
              sources.push({
                key: 'auvik',
                name: 'Auvik',
                color: 'text-purple-700 bg-purple-50 border-purple-200',
                dot:   'bg-purple-500',
                serial:   null,
                purchase: null,
                warranty: null,
                notes:    auvik.deviceType || null,
              })
            }
            if (asset.warranty_source) {
              sources.push({
                key: 'mfr_api',
                name: asset.warranty_source,
                color: 'text-blue-700 bg-blue-50 border-blue-200',
                dot:   'bg-blue-500',
                serial:   asset.serial_number || null,
                purchase: asset.purchase_date || null,
                warranty: asset.warranty_expiry || null,
                notes:    'Manufacturer API',
              })
            }

            function fmtSrc(val) {
              if (!val) return <span className="text-gray-300">—</span>
              try { return new Date(val).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) }
              catch { return val }
            }

            function WarrantyBadge({ date }) {
              if (!date) return <span className="text-gray-300">—</span>
              const days = Math.round((new Date(date) - new Date()) / 86400000)
              if (days < 0) return <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Expired</span>
              if (days < 90) return <span className="text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">Expiring Soon</span>
              return <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Active</span>
            }

            return (
              <div className="px-5 py-4 space-y-4">
                {/* Summary card */}
                <div className={`rounded-xl p-4 border ${
                  !asset.warranty_expiry ? 'bg-gray-50 border-gray-200' :
                  (new Date(asset.warranty_expiry) < new Date()) ? 'bg-red-50 border-red-200' :
                  (Math.round((new Date(asset.warranty_expiry) - new Date()) / 86400000) < 90) ? 'bg-yellow-50 border-yellow-200' :
                  'bg-green-50 border-green-200'
                }`}>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Warranty Status</p>
                      <WarrantyLine expiry={asset.warranty_expiry} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Purchase Date</p>
                      <p className="text-sm font-medium text-gray-800">
                        {asset.purchase_date
                          ? new Date(asset.purchase_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                          : <span className="text-gray-400">Unknown</span>}
                      </p>
                    </div>
                    {asset.eol_date && (
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">End of Life</p>
                        <p className="text-sm font-medium text-gray-800">
                          {new Date(asset.eol_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                      </div>
                    )}
                    {asset.warranty_source && (
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Data Source</p>
                        <p className="text-sm font-medium text-blue-700">{asset.warranty_source}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Source comparison table */}
                {sources.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Source Comparison</p>
                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="text-left px-3 py-2 font-semibold text-gray-500">Source</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-500">Serial</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-500">Purchase Date</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-500">Warranty Expiry</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-500">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {sources.map(src => (
                            <tr key={src.key} className="hover:bg-gray-50">
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${src.dot}`} />
                                  <span className="font-medium text-gray-700">{src.name}</span>
                                </div>
                                {src.notes && <p className="text-gray-400 pl-3.5 mt-0.5">{src.notes}</p>}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-gray-600">{src.serial || <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2.5 text-gray-600">{fmtSrc(src.purchase)}</td>
                              <td className="px-3 py-2.5 text-gray-600">{fmtSrc(src.warranty)}</td>
                              <td className="px-3 py-2.5"><WarrantyBadge date={src.warranty} /></td>
                            </tr>
                          ))}
                          {/* Final Summary */}
                          <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-gray-700" />
                                <span className="text-gray-900">Final Summary</span>
                              </div>
                              <p className="text-gray-400 pl-3.5 mt-0.5 font-normal">Resolved from all sources</p>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-gray-900">{asset.serial_number || <span className="text-gray-300 font-normal">—</span>}</td>
                            <td className="px-3 py-2.5 text-gray-900">{fmtSrc(asset.purchase_date)}</td>
                            <td className="px-3 py-2.5 text-gray-900">{fmtSrc(asset.warranty_expiry)}</td>
                            <td className="px-3 py-2.5"><WarrantyBadge date={asset.warranty_expiry} /></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {sources.length === 0 && !asset.warranty_expiry && (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">No warranty data available</p>
                    <p className="text-xs mt-1">Run Warranty Lookup in Settings to auto-populate from manufacturer APIs</p>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Sources tab ───────────────────────────────────────────────── */}
          {tab === 'sources' && (
            <div className="px-5 py-4 space-y-4">
              {/* Datto RMM */}
              <div className={`rounded-xl border p-4 ${asset.datto_rmm_device_id ? 'border-primary-200 bg-primary-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${asset.datto_rmm_device_id ? 'bg-primary-500' : 'bg-gray-300'}`} />
                    <span className="text-sm font-semibold text-gray-800">Datto RMM</span>
                  </div>
                  {asset.datto_rmm_device_id && dattoUrl && (
                    <a href={dattoUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
                      Open <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                {asset.datto_rmm_device_id
                  ? <p className="text-xs text-gray-500 font-mono break-all">{asset.datto_rmm_device_id}</p>
                  : <p className="text-xs text-gray-400">Not in Datto RMM</p>}
              </div>

              {/* IT Glue */}
              <div className={`rounded-xl border p-4 ${asset.it_glue_config_id ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${asset.it_glue_config_id ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm font-semibold text-gray-800">IT Glue</span>
                  </div>
                  {asset.it_glue_config_id && itgUrl && (
                    <a href={itgUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium">
                      Open <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                {asset.it_glue_config_id
                  ? <>
                      <p className="text-xs text-gray-500 font-mono">Config ID: {asset.it_glue_config_id}</p>
                      {itg['configuration-type-name'] && <p className="text-xs text-gray-500 mt-0.5">Type: {itg['configuration-type-name']}</p>}
                      {itg['configuration-status-name'] && <p className="text-xs text-gray-500">Status: {itg['configuration-status-name']}</p>}
                    </>
                  : <p className="text-xs text-gray-400">Not in IT Glue</p>}
              </div>

              {/* Autotask PSA */}
              <div className={`rounded-xl border p-4 ${asset.autotask_ci_id ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${asset.autotask_ci_id ? 'bg-gray-500' : 'bg-gray-300'}`} />
                    <span className="text-sm font-semibold text-gray-800">Autotask PSA</span>
                  </div>
                  {asset.autotask_ci_id && (
                    <a href={autotaskUrl('ci', asset.autotask_ci_id)}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 font-medium">
                      Open <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                {asset.autotask_ci_id
                  ? <p className="text-xs text-gray-500 font-mono">CI ID: {asset.autotask_ci_id}</p>
                  : <p className="text-xs text-gray-400">Not in Autotask PSA</p>}
              </div>

              {/* Auvik */}
              <div className={`rounded-xl border p-4 ${asset.auvik_device_id ? 'border-purple-200 bg-purple-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${asset.auvik_device_id ? 'bg-purple-500' : 'bg-gray-300'}`} />
                  <span className="text-sm font-semibold text-gray-800">Auvik</span>
                </div>
                {asset.auvik_device_id
                  ? <p className="text-xs text-gray-500 font-mono break-all">{asset.auvik_device_id}</p>
                  : <p className="text-xs text-gray-400">Not in Auvik</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
