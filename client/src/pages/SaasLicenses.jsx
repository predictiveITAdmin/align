import { useState, useEffect, useMemo } from 'react'
import { Search, X, RefreshCw, Shield, ShieldCheck, ShieldAlert,
         ChevronDown, ChevronRight, Package, AlertTriangle,
         CheckCircle, XCircle, MinusCircle, Settings } from 'lucide-react'
import { api } from '../lib/api'
import Card from '../components/Card'
import DrillDownModal from '../components/DrillDownModal'

const PLATFORM_LABEL = {
  microsoft_365:    'Microsoft 365',
  google_workspace: 'Google Workspace',
}
const PLATFORM_COLOR = {
  microsoft_365:    'bg-blue-50 text-blue-700 border-blue-200',
  google_workspace: 'bg-green-50 text-green-700 border-green-200',
}

function StatusBadge({ status }) {
  if (status === 'suspended') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
      <XCircle size={10} /> Suspended
    </span>
  )
  if (status === 'full') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      <MinusCircle size={10} /> Full
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
      <CheckCircle size={10} /> Enabled
    </span>
  )
}

function UtilizationBar({ consumed, total }) {
  if (!total || total === 0) return <span className="text-xs text-gray-400">—</span>
  const pct = Math.min(100, Math.round((consumed / total) * 100))
  const color = pct >= 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-gray-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500">{pct}%</span>
    </div>
  )
}

function SetSeatsModal({ row, onClose, onSave }) {
  const [form, setForm] = useState({
    total_seats: row.total_seats || '',
    cost_per_seat: row.cost_per_seat || '',
    subscription_end: row.subscription_end ? row.subscription_end.slice(0, 10) : '',
    notes: row.notes || '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await api.post('/saas-licenses/subscriptions', {
        client_id: row.client_id,
        platform: row.platform,
        license_name: row.license_name,
        total_seats: parseInt(form.total_seats) || 0,
        cost_per_seat: parseFloat(form.cost_per_seat) || null,
        subscription_end: form.subscription_end || null,
        notes: form.notes || null,
      })
      onSave()
      onClose()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Set Subscription Details</h3>
            <p className="text-xs text-gray-400 mt-0.5">{row.license_display_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Total Seats Purchased</label>
              <input type="number" min="0" value={form.total_seats}
                onChange={e => setForm(f => ({ ...f, total_seats: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cost per Seat / mo</label>
              <input type="number" min="0" step="0.01" value={form.cost_per_seat}
                onChange={e => setForm(f => ({ ...f, cost_per_seat: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subscription Expiry</label>
            <input type="date" value={form.subscription_end}
              onChange={e => setForm(f => ({ ...f, subscription_end: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
              placeholder="Optional notes..." />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SaasLicenses() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editRow, setEditRow] = useState(null)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [usersByKey, setUsersByKey] = useState({})
  const [drillDown, setDrillDown] = useState(null) // { title, subtitle, columns, rows }

  function load() {
    setLoading(true)
    api.get('/saas-licenses/global-summary')
      .then(r => setRows(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function loadUsers(row) {
    const key = `${row.client_id}__${row.license_name}`
    if (usersByKey[key]) return
    try {
      const r = await api.get(`/saas-licenses?client_id=${row.client_id}`)
      const users = (r.data || []).filter(u => u.license_name === row.license_name)
      setUsersByKey(prev => ({ ...prev, [key]: users }))
    } catch (err) { console.error(err) }
  }

  function toggleExpand(row) {
    const key = `${row.client_id}__${row.license_name}`
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else {
        next.add(key)
        loadUsers(row)
      }
      return next
    })
  }

  function openDrill(key) {
    if (key === 'skus') {
      setDrillDown({
        title: 'License SKUs',
        subtitle: `${filtered.length} unique license SKUs across clients`,
        columns: [
          { key: 'client_name',         label: 'Client' },
          { key: 'license_display_name', label: 'Product' },
          { key: 'platform_label',       label: 'Platform' },
          { key: 'status',               label: 'Status', render: (v) => <StatusBadge status={v} /> },
          { key: 'consumed',             label: 'Consumed', align: 'right' },
          { key: 'total_seats',          label: 'Total Seats', align: 'right', render: (v) => <span>{parseInt(v) || '—'}</span> },
          { key: 'available',            label: 'Available', align: 'right',
            render: (v, row) => <span className={parseInt(row.total_seats) > 0 ? (parseInt(v) === 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold') : 'text-gray-400'}>{parseInt(row.total_seats) > 0 ? v : '—'}</span> },
        ],
        rows: filtered.map(r => ({ ...r, platform_label: PLATFORM_LABEL[r.platform] || r.platform })),
      })
    } else if (key === 'consumed') {
      // Flatten all users from all loaded data — need to fetch
      api.get('/saas-licenses').then(r => {
        const users = r.data || []
        setDrillDown({
          title: 'Consumed Licenses',
          subtitle: `All assigned license seats`,
          columns: [
            { key: 'client_name',          label: 'Client' },
            { key: 'user_display_name',    label: 'User', render: (v, row) => <span>{v || row.user_email}</span> },
            { key: 'user_email',           label: 'Email' },
            { key: 'license_display_name', label: 'Product' },
            { key: 'platform_label',       label: 'Platform' },
            { key: 'account_status',       label: 'Status', render: (v) => <span className={`capitalize text-xs px-2 py-0.5 rounded-full ${v === 'suspended' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{v || 'active'}</span> },
          ],
          rows: users.map(u => ({
            ...u,
            license_display_name: u.license_name,
            platform_label: PLATFORM_LABEL[u.platform] || u.platform,
          })),
        })
      }).catch(console.error)
    } else if (key === 'available') {
      setDrillDown({
        title: 'Available Seats',
        subtitle: 'License SKUs with available seats',
        columns: [
          { key: 'client_name',          label: 'Client' },
          { key: 'license_display_name', label: 'Product' },
          { key: 'total_seats',          label: 'Total Seats', align: 'right' },
          { key: 'consumed',             label: 'Consumed', align: 'right' },
          { key: 'available',            label: 'Available', align: 'right',
            render: (v) => <span className={parseInt(v) > 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{v}</span> },
        ],
        rows: filtered.filter(r => parseInt(r.total_seats) > 0),
      })
    } else if (key === 'mfa') {
      api.get('/saas-licenses').then(r => {
        const users = (r.data || []).filter(u => u.mfa_enabled === false)
        setDrillDown({
          title: 'MFA Issues',
          subtitle: 'Users with MFA disabled',
          columns: [
            { key: 'client_name',          label: 'Client' },
            { key: 'user_display_name',    label: 'User', render: (v, row) => <span>{v || row.user_email}</span> },
            { key: 'user_email',           label: 'Email' },
            { key: 'license_display_name', label: 'License' },
            { key: 'mfa_method',           label: 'MFA Method', render: (v) => <span className="text-red-600 text-xs">{v || 'None'}</span> },
            { key: 'last_login_at',        label: 'Last Login',
              render: (v) => <span className="text-xs text-gray-500">{v ? new Date(v).toLocaleDateString() : '—'}</span> },
          ],
          rows: users.map(u => ({ ...u, license_display_name: u.license_name })),
        })
      }).catch(console.error)
    } else if (key === 'monthly') {
      setDrillDown({
        title: 'Estimated Monthly Cost',
        subtitle: 'Cost breakdown by client and product',
        columns: [
          { key: 'client_name',          label: 'Client' },
          { key: 'license_display_name', label: 'Product' },
          { key: 'consumed',             label: 'Seats', align: 'right' },
          { key: 'cost_per_seat',        label: '$/Seat', align: 'right',
            render: (v) => <span>{v ? `$${parseFloat(v).toFixed(2)}` : '—'}</span> },
          { key: 'monthly_total',        label: 'Monthly Total', align: 'right',
            render: (v) => <span className="font-semibold">{parseFloat(v) > 0 ? `$${parseFloat(v).toLocaleString(undefined,{maximumFractionDigits:0})}` : '—'}</span> },
        ],
        rows: filtered.filter(r => parseFloat(r.monthly_total) > 0).sort((a,b) => parseFloat(b.monthly_total) - parseFloat(a.monthly_total)),
      })
    }
  }

  const filtered = useMemo(() => rows.filter(r => {
    if (platformFilter !== 'all' && r.platform !== platformFilter) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!r.client_name?.toLowerCase().includes(q) && !r.license_display_name?.toLowerCase().includes(q)) return false
    }
    return true
  }), [rows, search, platformFilter, statusFilter])

  // Summary stats
  const stats = useMemo(() => ({
    total_skus:    filtered.length,
    total_seats:   filtered.reduce((s, r) => s + (parseInt(r.total_seats) || 0), 0),
    total_consumed: filtered.reduce((s, r) => s + (parseInt(r.consumed) || 0), 0),
    total_available: filtered.reduce((s, r) => s + (parseInt(r.available) || 0), 0),
    mfa_issues:    filtered.reduce((s, r) => s + (parseInt(r.mfa_disabled_count) || 0), 0),
    monthly_cost:  filtered.reduce((s, r) => s + (parseFloat(r.monthly_total) || 0), 0),
  }), [filtered])

  const now = new Date()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SaaS Licenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">License utilization across all clients</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Stats bar — each card is clickable */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { key: 'skus',     label: 'License SKUs',  value: stats.total_skus,     color: 'text-gray-900',    clickable: true },
          { key: 'seats',    label: 'Total Seats',   value: stats.total_seats || '—', color: 'text-gray-900', clickable: false },
          { key: 'consumed', label: 'Consumed',      value: stats.total_consumed, color: 'text-primary-600', clickable: true },
          { key: 'available',label: 'Available',     value: stats.total_seats ? stats.total_available : '—',
            color: stats.total_available === 0 && stats.total_seats > 0 ? 'text-red-600' : 'text-green-600', clickable: stats.total_seats > 0 },
          { key: 'mfa',      label: 'MFA Issues',    value: stats.mfa_issues || '—',
            color: stats.mfa_issues > 0 ? 'text-red-600' : 'text-gray-400', clickable: stats.mfa_issues > 0 },
          { key: 'monthly',  label: 'Est. Monthly',  value: stats.monthly_cost > 0 ? `$${stats.monthly_cost.toLocaleString(undefined,{maximumFractionDigits:0})}` : '—',
            color: 'text-gray-900', clickable: stats.monthly_cost > 0 },
        ].map(s => (
          <div key={s.label}
            onClick={() => s.clickable && openDrill(s.key)}
            className={`bg-white border border-gray-200 rounded-xl p-3 text-center transition-all
              ${s.clickable ? 'cursor-pointer hover:border-primary-300 hover:shadow-sm hover:bg-primary-50/30' : ''}`}>
            <p className={`text-xl font-bold leading-none ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            {s.clickable && <p className="text-[10px] text-primary-400 mt-0.5">click to view</p>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search client or license…"
            className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
        {['all','microsoft_365','google_workspace'].map(p => (
          <button key={p} onClick={() => setPlatformFilter(p)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${platformFilter === p ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {p === 'all' ? 'All Platforms' : PLATFORM_LABEL[p]}
          </button>
        ))}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white text-gray-700">
          <option value="all">All Status</option>
          <option value="enabled">Enabled</option>
          <option value="full">Full</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading licenses…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Package size={36} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm">No licenses found</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-2.5 border-b border-gray-100 text-xs text-gray-400">{filtered.length} license SKUs</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="w-8" />
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Consumed</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Available</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Suspended</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Utilization</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">MFA Issues</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Monthly</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(row => {
                  const key = `${row.client_id}__${row.license_name}`
                  const isExpanded = expandedRows.has(key)
                  const users = usersByKey[key] || []
                  const expDate = row.subscription_end ? new Date(row.subscription_end) : null
                  const expiring = expDate && expDate > now && expDate < new Date(now.getTime() + 90*86400000)
                  const expired = expDate && expDate < now
                  return (
                    <>
                      <tr key={key}
                        onClick={() => toggleExpand(row)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors">
                        <td className="pl-3">
                          <ChevronRight size={14} className={`text-gray-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.client_name}</td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{row.license_display_name}</p>
                            <span className={`text-[10px] border rounded px-1.5 py-0.5 ${PLATFORM_COLOR[row.platform] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                              {PLATFORM_LABEL[row.platform] || row.platform}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{row.active}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{row.consumed}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={parseInt(row.available) === 0 && parseInt(row.total_seats) > 0 ? 'text-red-600 font-semibold' : parseInt(row.available) > 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                            {parseInt(row.total_seats) > 0 ? row.available : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">{parseInt(row.suspended) > 0 ? <span className="text-red-600">{row.suspended}</span> : '—'}</td>
                        <td className="px-4 py-3">
                          <UtilizationBar consumed={parseInt(row.consumed)} total={parseInt(row.total_seats)} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {parseInt(row.mfa_disabled_count) > 0
                            ? <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium"><ShieldAlert size={12} />{row.mfa_disabled_count}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div>
                            <span className="text-sm font-medium text-gray-700">
                              {parseFloat(row.monthly_total) > 0 ? `$${parseFloat(row.monthly_total).toLocaleString(undefined,{maximumFractionDigits:0})}` : '—'}
                            </span>
                            {(expiring || expired) && (
                              <p className={`text-[10px] ${expired ? 'text-red-500' : 'text-amber-500'}`}>
                                {expired ? 'Expired' : 'Expiring'} {expDate.toLocaleDateString('en-US',{month:'short',year:'numeric'})}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-3">
                          <button onClick={e => { e.stopPropagation(); setEditRow(row) }}
                            className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-600 transition-colors" title="Set seats / cost">
                            <Settings size={13} />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${key}-users`}>
                          <td colSpan={12} className="bg-gray-50 border-t border-gray-100 px-8 py-3">
                            {users.length === 0 ? (
                              <p className="text-xs text-gray-400 py-2">Loading users…</p>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{users.length} assigned users</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                  {users.map(u => (
                                    <div key={u.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2">
                                      <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                                        {(u.user_display_name || u.user_email).charAt(0).toUpperCase()}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-gray-900 truncate">{u.user_display_name || u.user_email}</p>
                                        <p className="text-[10px] text-gray-400 truncate">{u.user_display_name ? u.user_email : ''}</p>
                                      </div>
                                      {u.mfa_enabled === false && (
                                        <ShieldAlert size={12} className="text-red-500 shrink-0" title="MFA disabled" />
                                      )}
                                      {u.mfa_enabled === true && (
                                        <ShieldCheck size={12} className="text-green-500 shrink-0" title="MFA enabled" />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editRow && <SetSeatsModal row={editRow} onClose={() => setEditRow(null)} onSave={load} />}

      {drillDown && (
        <DrillDownModal
          title={drillDown.title}
          subtitle={drillDown.subtitle}
          columns={drillDown.columns}
          rows={drillDown.rows}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  )
}
