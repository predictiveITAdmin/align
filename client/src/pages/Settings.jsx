import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Search, ExternalLink, CheckSquare, Square, Plus, Pencil, Trash2,
  ChevronDown, ChevronUp, X, Check, AlertCircle, RefreshCw, Play,
  Users, Mail, Copy, UserPlus, Shield, Eye, ClipboardCheck,
  HelpCircle, ChevronRight, Terminal, Key, Globe, Building2 as Building, Cloud,
  Edit2, CheckCircle2,
} from 'lucide-react'
import { api } from '../lib/api'
import { autotaskUrl } from '../lib/autotask'
import { useAuth } from '../hooks/useAuth'
import PageHeader from '../components/PageHeader'
import Card, { CardBody } from '../components/Card'
import { ClientMappingPanel } from './ClientMapping'

// ─── Shared helpers ────────────────────────────────────────────────────────────

function fmtRelative(val) {
  if (!val) return null
  const ms = Date.now() - new Date(val).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 14) return `${days}d ago`
  return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
        ${value ? 'bg-primary-600' : 'bg-gray-200'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
        ${value ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  )
}

function ClassificationBadge({ value }) {
  if (!value) return <span className="text-gray-400">—</span>
  const colors = {
    Strategic: 'bg-purple-100 text-purple-700',
    Standard:  'bg-blue-100 text-blue-700',
    Basic:     'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[value] || 'bg-gray-100 text-gray-600'}`}>
      {value}
    </span>
  )
}

// ─── Asset Types Tab ───────────────────────────────────────────────────────────

const CATEGORIES = ['workstation', 'server', 'network', 'mobile', 'peripheral', 'software', 'service', 'other']

function AssetTypeRow({ type, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: type.name, category: type.category || 'other', default_lifecycle_years: type.default_lifecycle_years || '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!form.name.trim()) return
    setSaving(true); setError('')
    try {
      const data = await api.patch(`/settings/asset-types/${type.id}`, {
        name: form.name.trim(),
        category: form.category,
        default_lifecycle_years: form.default_lifecycle_years ? parseInt(form.default_lifecycle_years) : null,
      })
      onSave(data.data)
      setEditing(false)
    } catch (e) { setError(e.message || 'Save failed') }
    finally { setSaving(false) }
  }

  async function del() {
    if (!window.confirm(`Delete asset type "${type.name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/settings/asset-types/${type.id}`)
      onDelete(type.id)
    } catch (e) { alert(e.message || 'Delete failed') }
  }

  if (editing) {
    return (
      <tr className="bg-blue-50">
        <td className="px-5 py-2">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full px-2 py-1 text-sm border border-primary-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white" />
          {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
        </td>
        <td className="px-5 py-2">
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="text-sm border border-gray-200 rounded px-2 py-1 bg-white">
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </td>
        <td className="px-5 py-2">
          <input type="number" min="1" max="20" value={form.default_lifecycle_years}
            onChange={e => setForm(f => ({ ...f, default_lifecycle_years: e.target.value }))}
            placeholder="—"
            className="w-20 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white" />
        </td>
        <td className="px-5 py-2 text-center text-xs text-gray-400">—</td>
        <td className="px-5 py-2 text-right">
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setEditing(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500"><X size={14} /></button>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50">
              <Check size={12} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-5 py-3 font-medium text-gray-900">{type.name}</td>
      <td className="px-5 py-3 text-sm text-gray-600 capitalize">{type.category || '—'}</td>
      <td className="px-5 py-3 text-sm text-gray-600">{type.default_lifecycle_years ? `${type.default_lifecycle_years} yrs` : '—'}</td>
      <td className="px-5 py-3 text-center text-sm text-gray-600">{type.asset_count || 0}</td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => setEditing(true)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <Pencil size={13} />
          </button>
          {parseInt(type.asset_count || 0) === 0 && (
            <button onClick={del}
              className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function AssetTypesTab() {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', category: 'other', default_lifecycle_years: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    api.get('/settings/asset-types')
      .then(d => setTypes(d.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleAdd() {
    if (!newForm.name.trim()) { setAddError('Name is required'); return }
    setAdding(true); setAddError('')
    try {
      const data = await api.post('/settings/asset-types', {
        name: newForm.name.trim(),
        category: newForm.category,
        default_lifecycle_years: newForm.default_lifecycle_years ? parseInt(newForm.default_lifecycle_years) : null,
      })
      setTypes(prev => [...prev, data.data])
      setNewForm({ name: '', category: 'other', default_lifecycle_years: '' })
      setShowAdd(false)
    } catch (e) { setAddError(e.message || 'Failed to create') }
    finally { setAdding(false) }
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Asset Types</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage categories for classifying hardware assets</p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddError('') }}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors">
          <Plus size={15} /> New Type
        </button>
      </div>

      <Card>
        {loading ? (
          <CardBody>
            <div className="flex items-center justify-center py-12 text-gray-400">
              <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mr-3" />
              <span className="text-sm">Loading…</span>
            </div>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lifecycle</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assets</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* Add row */}
                {showAdd && (
                  <tr className="bg-green-50">
                    <td className="px-5 py-2">
                      <input autoFocus value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Type name…"
                        className="w-full px-2 py-1 text-sm border border-green-300 rounded focus:outline-none focus:ring-1 focus:ring-green-400 bg-white" />
                      {addError && <p className="text-xs text-red-500 mt-0.5">{addError}</p>}
                    </td>
                    <td className="px-5 py-2">
                      <select value={newForm.category} onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}
                        className="text-sm border border-gray-200 rounded px-2 py-1 bg-white">
                        {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-2">
                      <input type="number" min="1" max="20" value={newForm.default_lifecycle_years}
                        onChange={e => setNewForm(f => ({ ...f, default_lifecycle_years: e.target.value }))}
                        placeholder="—"
                        className="w-20 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none bg-white" />
                    </td>
                    <td className="px-5 py-2 text-center text-xs text-gray-400">—</td>
                    <td className="px-5 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setShowAdd(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500"><X size={14} /></button>
                        <button onClick={handleAdd} disabled={adding}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50">
                          <Check size={12} /> {adding ? 'Adding…' : 'Add'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {types.length === 0 && !showAdd ? (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">No asset types found.</td></tr>
                ) : types.map(type => (
                  <AssetTypeRow key={type.id} type={type}
                    onSave={updated => setTypes(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))}
                    onDelete={id => setTypes(prev => prev.filter(t => t.id !== id))} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Autotask CI Types Tab ─────────────────────────────────────────────────────

// Categorise CI type names for grouping
function deriveCiCategory(name) {
  const n = name.toLowerCase()
  if (/workstation|laptop|desktop|computer/.test(n)) return 'Workstation'
  if (/server/.test(n)) return 'Server'
  if (/switch|router|firewall|network|wireless|access point|wifi|wan|lan/.test(n)) return 'Network'
  if (/printer|scanner|copier|fax/.test(n)) return 'Printer'
  if (/phone|mobile|tablet|ipad|iphone|android/.test(n)) return 'Mobile'
  if (/ups|battery|power/.test(n)) return 'Power'
  if (/nas|san|storage|drive/.test(n)) return 'Storage'
  if (/virtual|vm|cloud/.test(n)) return 'Virtual'
  if (/monitor|display|kvm/.test(n)) return 'Display'
  if (/software|license|application/.test(n)) return 'Software'
  if (/service|support|maintenance|contract/.test(n)) return 'Service'
  if (/backup/.test(n)) return 'Backup'
  if (/document|policy|procedure/.test(n)) return 'Documentation'
  return 'Other'
}

const HARDWARE_CATEGORIES = new Set(['Workstation', 'Server', 'Network', 'Printer', 'Mobile', 'Power', 'Storage', 'Virtual', 'Display'])

function CITypesTab() {
  const [ciTypes, setCiTypes] = useState([])
  const [assetTypes, setAssetTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterView, setFilterView] = useState('all') // all | hardware | non-hardware
  const [updating, setUpdating] = useState(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/settings/autotask-ci-types'),
      api.get('/settings/asset-types'),
    ]).then(([ci, at]) => {
      setCiTypes(ci.data || [])
      setAssetTypes(at.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const enriched = useMemo(() => ciTypes.map(t => ({
    ...t,
    _category: deriveCiCategory(t.ci_type_name),
  })), [ciTypes])

  const filtered = useMemo(() => {
    let list = enriched
    if (filterView === 'hardware') list = list.filter(t => HARDWARE_CATEGORIES.has(t._category))
    if (filterView === 'non-hardware') list = list.filter(t => !HARDWARE_CATEGORIES.has(t._category))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t => t.ci_type_name.toLowerCase().includes(q))
    }
    return list.sort((a, b) => a.ci_type_name.localeCompare(b.ci_type_name))
  }, [enriched, filterView, search])

  // Group by category
  const grouped = useMemo(() => {
    const map = {}
    for (const t of filtered) {
      if (!map[t._category]) map[t._category] = []
      map[t._category].push(t)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const enabledCount = ciTypes.filter(t => t.is_synced).length

  async function handleToggle(ciType, val) {
    setUpdating(prev => new Set(prev).add(ciType.id))
    try {
      await api.patch(`/settings/autotask-ci-types/${ciType.id}`, { is_synced: val })
      setCiTypes(prev => prev.map(t => t.id === ciType.id ? { ...t, is_synced: val } : t))
    } catch (e) { console.error(e) }
    finally { setUpdating(prev => { const n = new Set(prev); n.delete(ciType.id); return n }) }
  }

  async function handleMappingChange(ciType, assetTypeId) {
    try {
      await api.patch(`/settings/autotask-ci-types/${ciType.id}`, {
        maps_to_asset_type_id: assetTypeId || null,
      })
      setCiTypes(prev => prev.map(t => t.id === ciType.id ? { ...t, maps_to_asset_type_id: assetTypeId || null } : t))
    } catch (e) { console.error(e) }
  }

  async function handleBulk(enable, onlyVisible = false) {
    setBulkSaving(true)
    try {
      if (onlyVisible) {
        const ids = filtered.map(t => t.id)
        await api.patch('/settings/autotask-ci-types', { ids, is_synced: enable })
        setCiTypes(prev => prev.map(t => ids.includes(t.id) ? { ...t, is_synced: enable } : t))
      } else {
        await api.patch('/settings/autotask-ci-types', { all: true, is_synced: enable })
        setCiTypes(prev => prev.map(t => ({ ...t, is_synced: enable })))
      }
    } catch (e) { console.error(e) }
    finally { setBulkSaving(false) }
  }

  async function handleEnableHardware() {
    setBulkSaving(true)
    try {
      // Disable all first, then enable hardware
      const allIds = ciTypes.map(t => t.id)
      const hardwareIds = enriched.filter(t => HARDWARE_CATEGORIES.has(t._category)).map(t => t.id)
      const nonHardwareIds = allIds.filter(id => !hardwareIds.includes(id))
      await api.patch('/settings/autotask-ci-types', { ids: nonHardwareIds, is_synced: false })
      await api.patch('/settings/autotask-ci-types', { ids: hardwareIds, is_synced: true })
      setCiTypes(prev => prev.map(t => ({ ...t, is_synced: hardwareIds.includes(t.id) })))
    } catch (e) { console.error(e) }
    finally { setBulkSaving(false) }
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900">Autotask CI Type Filter</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Choose which Autotask Configuration Item types to include in asset syncs.
          Non-hardware types (services, software, documentation) are excluded by default.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search CI types…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1">
          {[['all', 'All'], ['hardware', 'Hardware'], ['non-hardware', 'Non-Hardware']].map(([v, l]) => (
            <button key={v} onClick={() => setFilterView(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filterView === v ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'
              }`}>
              {l}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <span className="text-xs text-gray-500 mr-1">
            <span className="font-medium text-gray-800">{enabledCount}</span>/{ciTypes.length} enabled
          </span>
          <button onClick={handleEnableHardware} disabled={bulkSaving}
            className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 disabled:opacity-50">
            Hardware Only
          </button>
          <button onClick={() => handleBulk(true, filterView !== 'all')} disabled={bulkSaving}
            className="px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 disabled:opacity-50">
            Enable Visible
          </button>
          <button onClick={() => handleBulk(false, filterView !== 'all')} disabled={bulkSaving}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50">
            Disable Visible
          </button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardBody>
            <div className="flex items-center justify-center py-12 text-gray-400">
              <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mr-3" />
              <span className="text-sm">Loading CI types…</span>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([category, items]) => {
            const isHw = HARDWARE_CATEGORIES.has(category)
            return (
              <Card key={category}>
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{category}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isHw ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {isHw ? 'Hardware' : 'Non-Hardware'}
                    </span>
                    <span className="text-xs text-gray-400">{items.filter(t => t.is_synced).length}/{items.length} syncing</span>
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {items.map(ciType => (
                    <div key={ciType.id} className={`flex items-center gap-4 px-5 py-2.5 hover:bg-gray-50 transition-colors ${!ciType.is_synced ? 'opacity-60' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-800">{ciType.ci_type_name}</span>
                        <span className="ml-2 text-xs text-gray-400">ID {ciType.ci_type_id}</span>
                      </div>
                      {/* Map to asset type dropdown */}
                      <div className="shrink-0">
                        <select
                          value={ciType.maps_to_asset_type_id || ''}
                          onChange={e => handleMappingChange(ciType, e.target.value)}
                          disabled={!ciType.is_synced}
                          className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-50">
                          <option value="">— Auto map —</option>
                          {assetTypes.map(at => (
                            <option key={at.id} value={at.id}>{at.name}</option>
                          ))}
                        </select>
                      </div>
                      <Toggle value={!!ciType.is_synced} disabled={updating.has(ciType.id)}
                        onChange={val => handleToggle(ciType, val)} />
                    </div>
                  ))}
                </div>
              </Card>
            )
          })}
          {grouped.length === 0 && (
            <Card><CardBody>
              <p className="text-center text-sm text-gray-400 py-8">No CI types match your filter.</p>
            </CardBody></Card>
          )}
        </div>
      )}

      {/* Info notice */}
      <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-500" />
        <span>Changes take effect on the next asset sync. Run a sync after updating CI type filters to remove excluded types from existing asset records.</span>
      </div>
    </div>
  )
}

// ─── Asset Rules Tab ───────────────────────────────────────────────────────────

function AssetRulesTab() {
  const [form, setForm] = useState({ rmm_inactive_threshold_days: 60, rmm_inactive_action: 'mark_inactive' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/settings/rules')
      .then(d => setForm(d.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const data = await api.patch('/settings/rules', form)
      setForm(data.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { setError(e.message || 'Save failed') }
    finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mr-3" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900">Asset Rules</h2>
        <p className="text-sm text-gray-500 mt-0.5">Configure how inactive assets are detected and handled</p>
      </div>

      <Card>
        <CardBody>
          <div className="space-y-6 max-w-lg">

            {/* RMM Inactive Threshold */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">RMM Inactive Threshold</h3>
              <p className="text-xs text-gray-500 mb-3">
                Assets not seen by Datto RMM for this many days (and offline/unknown) will trigger the action below.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number" min="1" max="365"
                  value={form.rmm_inactive_threshold_days}
                  onChange={e => setForm(f => ({ ...f, rmm_inactive_threshold_days: parseInt(e.target.value) || 60 }))}
                  className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                />
                <span className="text-sm text-gray-600">days without check-in</span>
              </div>
            </div>

            {/* Inactive Action */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Action When Threshold Reached</h3>
              <p className="text-xs text-gray-500 mb-3">
                What should happen when an asset exceeds the inactive threshold?
              </p>
              <div className="space-y-2">
                {[
                  { value: 'mark_inactive', label: 'Mark as Inactive', desc: 'Asset is hidden from active views and reports until seen again by RMM.' },
                  { value: 'none', label: 'No Action', desc: 'Log only — asset remains active regardless of last seen date.' },
                ].map(opt => (
                  <label key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      form.rmm_inactive_action === opt.value
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}>
                    <input
                      type="radio"
                      name="rmm_inactive_action"
                      value={opt.value}
                      checked={form.rmm_inactive_action === opt.value}
                      onChange={() => setForm(f => ({ ...f, rmm_inactive_action: opt.value }))}
                      className="mt-0.5 accent-primary-600"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
                {saving ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                ) : (
                  <><Check size={14} /> Save Rules</>
                )}
              </button>
              {saved && (
                <span className="text-sm text-green-600 font-medium">Saved!</span>
              )}
            </div>

          </div>
        </CardBody>
      </Card>

      <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <AlertCircle size={15} className="mt-0.5 shrink-0 text-blue-500" />
        <span>These rules apply during each Datto RMM sync. Assets that come back online are automatically re-activated regardless of this setting.</span>
      </div>
    </div>
  )
}

// ─── Warranty Lookup Tab ──────────────────────────────────────────────────────

const SUPPORTED_LOOKUP = {
  dell:     { label: 'Dell',           needsKey: true,  hint: 'Register free at Dell TechDirect (developer.dell.com). Returns ship date + warranty end date by service tag.' },
  hp:       { label: 'HP',             needsKey: false, hint: 'Uses HP public warranty API — no credentials needed. Returns warranty start and end dates.' },
  lenovo:   { label: 'Lenovo',         needsKey: false, hint: 'Uses Lenovo public warranty API — no credentials needed. Returns purchase date and warranty end date.' },
  cisco:    { label: 'Cisco',          needsKey: true,  keyType: 'oauth2', hint: 'Register free at developer.cisco.com (Support APIs). Returns end-of-support date for network gear lifecycle tracking.' },
  meraki:   { label: 'Meraki',         needsKey: true,  keyType: 'api_key', hint: 'Get your API key from Meraki Dashboard → Profile → API access. Returns license/subscription expiry dates per device serial.' },
  apc:      { label: 'APC / Schneider',needsKey: false, serialEst: true, hint: 'No public API (reCAPTCHA blocks automation). Dates are estimated from serial number — APC serial encodes manufacture year + week. Configure standard warranty period below.' },
  ubiquiti: { label: 'Ubiquiti',       needsKey: false, noApi: true, hint: 'No public warranty API. Standard 1–2 year hardware warranty on UniFi devices. Enter dates manually based on purchase records.' },
  apple:    { label: 'Apple',          needsKey: false, noApi: true, hint: 'No public API — requires Apple GSX (AASP/Apple Authorized Service Provider access only). Check manually at checkcoverage.apple.com. ScalePad sync may already populate Apple warranty dates.' },
}

function detectManufacturer(name) {
  const n = (name || '').toLowerCase()
  if (/dell/.test(n)) return 'dell'
  if (/^hp$|hewlett|hp inc/.test(n)) return 'hp'
  if (/lenovo/.test(n)) return 'lenovo'
  if (/cisco/.test(n)) return 'cisco'
  if (/meraki/.test(n)) return 'meraki'
  if (/\bapc\b|schneider/.test(n)) return 'apc'
  if (/ubiquiti|unifi|uisp/.test(n)) return 'ubiquiti'
  if (/apple/.test(n)) return 'apple'
  return null
}

function WarrantyLookupTab() {
  const [config, setConfig] = useState({})
  const [manufacturers, setManufacturers] = useState([])
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(null) // manufacturer key being run
  const [testing, setTesting] = useState({}) // { [key]: bool }
  const [testResults, setTestResults] = useState({}) // { [key]: { ok, msg } }
  const [saved, setSaved] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([
      api.get('/warranty-lookup/config'),
      api.get('/warranty-lookup/log'),
    ]).then(([cfg, lg]) => {
      setConfig(cfg.data.config || {})
      setManufacturers(cfg.data.manufacturers || [])
      setLog(lg.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function updateConfig(mfrKey, field, value) {
    setConfig(prev => ({
      ...prev,
      [mfrKey]: { ...(prev[mfrKey] || {}), [field]: value }
    }))
  }

  async function handleSave() {
    setSaving(true); setSaved(false)
    try {
      await api.patch('/warranty-lookup/config', { config })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { alert(e.message || 'Save failed') }
    finally { setSaving(false) }
  }

  async function handleTest(key) {
    setTesting(prev => ({ ...prev, [key]: true }))
    setTestResults(prev => ({ ...prev, [key]: null }))
    try {
      const mfrConfig = config[key] || {}
      const res = await api.post(`/warranty-lookup/test-${key}`, {
        client_id: mfrConfig.client_id || '',
        client_secret: mfrConfig.client_secret || '',
      })
      setTestResults(prev => ({ ...prev, [key]: { ok: true, msg: res.message } }))
    } catch (e) {
      setTestResults(prev => ({ ...prev, [key]: { ok: false, msg: e.message || 'Test failed' } }))
    }
    finally { setTesting(prev => ({ ...prev, [key]: false })) }
  }

  async function handleRun(mfrKey) {
    setRunning(mfrKey)
    try {
      await api.post('/warranty-lookup/run', { manufacturer: mfrKey })
      setTimeout(() => {
        api.get('/warranty-lookup/log').then(r => setLog(r.data || []))
        setRunning(null)
      }, 3000)
    } catch (e) {
      alert(e.message || 'Failed to start')
      setRunning(null)
    }
  }

  async function handleRunAll() {
    setRunning('all')
    try {
      await api.post('/warranty-lookup/run', {})
      setTimeout(() => {
        api.get('/warranty-lookup/log').then(r => setLog(r.data || []))
        setRunning(null)
      }, 3000)
    } catch (e) {
      alert(e.message || 'Failed to start')
      setRunning(null)
    }
  }

  // Which supported manufacturers are found in inventory
  const detectedSupported = manufacturers
    .map(m => ({ ...m, key: detectManufacturer(m.mfr) }))
    .filter(m => m.key)
    .reduce((acc, m) => {
      if (!acc[m.key]) acc[m.key] = { key: m.key, count: 0, names: [] }
      acc[m.key].count += parseInt(m.cnt)
      acc[m.key].names.push(m.mfr)
      return acc
    }, {})

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mr-3" />
      <span className="text-sm">Loading…</span>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Warranty Lookup</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Automatically populate purchase dates and warranty expiry from manufacturer APIs using device serial numbers.
        </p>
      </div>

      {/* Manufacturer cards — API-enabled */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Automated Lookup</p>
        {Object.entries(SUPPORTED_LOOKUP).filter(([, mfr]) => !mfr.noApi).map(([key, mfr]) => {

          const detected = detectedSupported[key]
          const mfrConfig = config[key] || {}
          const isEnabled = mfrConfig.enabled !== false
          const isRunning = running === key || running === 'all'
          const isTesting = testing[key]
          const testResult = testResults[key]

          return (
            <Card key={key}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary-600">{mfr.label.charAt(0)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{mfr.label}</span>
                      {mfr.needsKey
                        ? <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">Requires API Key</span>
                        : <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">No key needed</span>}
                      {detected
                        ? <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-medium">{detected.count} devices in inventory</span>
                        : <span className="text-xs text-gray-400">Not in inventory</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 max-w-lg">{mfr.hint}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {detected && !mfr.needsKey && (
                    <button
                      onClick={() => handleRun(key)}
                      disabled={!!running}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
                      {isRunning ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running…</> : <><Play size={11} /> Run</>}
                    </button>
                  )}
                  {detected && mfr.needsKey && (mfr.keyType === 'api_key' ? mfrConfig.api_key : (mfrConfig.client_id && mfrConfig.client_secret)) && (
                    <button
                      onClick={() => handleRun(key)}
                      disabled={!!running}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
                      {isRunning ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running…</> : <><Play size={11} /> Run</>}
                    </button>
                  )}
                  {detected && mfr.serialEst && (
                    <button onClick={() => handleRun(key)} disabled={!!running}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
                      {isRunning ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running…</> : <><Play size={11} /> Estimate from Serial</>}
                    </button>
                  )}
                  <Toggle value={isEnabled} onChange={v => updateConfig(key, 'enabled', v)} />
                </div>
              </div>

              {/* Credential inputs */}
              {mfr.needsKey && (
                <CardBody>
                  <div className="space-y-3 max-w-md">
                    {mfr.keyType === 'api_key' ? (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
                        <input type="password" value={mfrConfig.api_key || ''}
                          onChange={e => updateConfig(key, 'api_key', e.target.value)}
                          placeholder="Paste API key…"
                          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white font-mono" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
                          <input type="text" value={mfrConfig.client_id || ''}
                            onChange={e => updateConfig(key, 'client_id', e.target.value)}
                            placeholder="API Client ID"
                            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white font-mono" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Client Secret</label>
                          <input type="password" value={mfrConfig.client_secret || ''}
                            onChange={e => updateConfig(key, 'client_secret', e.target.value)}
                            placeholder="API Client Secret"
                            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white font-mono" />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleTest(key)}
                        disabled={isTesting || (mfr.keyType === 'api_key' ? !mfrConfig.api_key : (!mfrConfig.client_id || !mfrConfig.client_secret))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                        {isTesting ? <><span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Testing…</> : 'Test Connection'}
                      </button>
                      {testResult && (
                        <span className={`text-xs font-medium ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                          {testResult.ok ? '✓' : '✗'} {testResult.msg}
                        </span>
                      )}
                    </div>
                  </div>
                </CardBody>
              )}
              {/* APC serial estimation config */}
              {mfr.serialEst && (
                <CardBody>
                  <div className="flex items-center gap-4 max-w-sm">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Standard Warranty Period</label>
                      <div className="flex items-center gap-2">
                        <input type="number" min="1" max="5" value={mfrConfig.warranty_years || 2}
                          onChange={e => updateConfig(key, 'warranty_years', e.target.value)}
                          className="w-16 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white text-center" />
                        <span className="text-sm text-gray-500">years (applied to manufacture date from serial)</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">SMT/SMX/SRT series: 2 years standard. Extended warranty units: 3 years.</p>
                    </div>
                  </div>
                </CardBody>
              )}
            </Card>
          )
        })}
      </div>

      {/* Manufacturer cards — Manual only (no public API) */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Manual Entry Only</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(SUPPORTED_LOOKUP).filter(([, mfr]) => mfr.noApi).map(([key, mfr]) => {
            const detected = detectedSupported[key]
            return (
              <div key={key} className="p-4 rounded-xl border border-gray-200 bg-gray-50">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-gray-500">{mfr.label.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-700">{mfr.label}</span>
                      {detected
                        ? <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-medium">{detected.count} devices</span>
                        : <span className="text-xs text-gray-400">Not in inventory</span>}
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{mfr.hint}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
          {saving ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</> : <><Check size={14} /> Save Configuration</>}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
        {Object.keys(detectedSupported).length > 0 && (
          <button onClick={handleRunAll} disabled={!!running}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {running === 'all'
              ? <><span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Running All…</>
              : <><Play size={13} /> Run All Lookups</>}
          </button>
        )}
      </div>

      {/* Run log */}
      {log.length > 0 && (
        <Card>
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">Lookup History</span>
            <button onClick={load} className="text-gray-400 hover:text-gray-600"><RefreshCw size={13} /></button>
          </div>
          <div className="divide-y divide-gray-50">
            {log.map(entry => (
              <div key={entry.id} className="flex items-center gap-4 px-5 py-2.5 text-sm">
                <span className="text-gray-400 text-xs w-36 shrink-0">{new Date(entry.ran_at).toLocaleString()}</span>
                <span className="font-medium text-gray-700 capitalize w-20 shrink-0">{entry.manufacturer}</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-500">{entry.total} total</span>
                  <span className="text-green-600 font-medium">{entry.updated} updated</span>
                  <span className="text-gray-400">{entry.skipped} skipped</span>
                  {entry.errors > 0 && <span className="text-red-500">{entry.errors} errors</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <AlertCircle size={15} className="mt-0.5 shrink-0 text-blue-500" />
        <span>Lookup only fills in <strong>missing</strong> purchase dates and warranty dates — existing values are never overwritten. Assets must have a serial number to be eligible. Data sourced from manufacturer APIs is stored as the asset's primary values.</span>
      </div>
    </div>
  )
}

// ─── Backfill Hardware Button ────────────────────────────────────────────────

function BackfillHardwareButton() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)

  async function run() {
    setRunning(true); setResult(null)
    try {
      const data = await api.post('/sync/backfill-hardware')
      setResult(data)
    } catch (e) {
      setResult({ status: 'error', message: e.message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="relative">
      <button onClick={run} disabled={running}
        title="Re-resolve manufacturer, model, CPU from Autotask picklists for existing assets"
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-amber-50 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors">
        {running
          ? <><span className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /> Backfilling…</>
          : <><RefreshCw size={14} /> Backfill Hardware</>}
      </button>
      {result && (
        <div className={`absolute top-full right-0 mt-1 z-50 w-64 p-3 rounded-xl shadow-xl border text-sm ${
          result.status === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {result.status === 'ok'
            ? `✓ Resolved hardware for ${result.updated} assets (${result.skipped} already had data)`
            : result.message || 'Backfill failed'}
        </div>
      )}
    </div>
  )
}

// ─── Integrations Tab ─────────────────────────────────────────────────────────

const SYNC_ENDPOINTS = {
  autotask:             ['/sync/clients', '/sync/assets', '/sync/contacts'],
  datto_rmm:            ['/sync/datto-rmm', '/sync/software'],
  it_glue:              ['/sync/it-glue'],
  scalepad:             ['/sync/scalepad'],
  myitprocess:          ['/sync/mitp'],
  saas_alerts:          ['/sync/saas-alerts'],
  auvik:                ['/sync/auvik'],
  customer_thermometer: ['/sync/csat'],
}

const CATEGORY_COLORS = {
  PSA:           'bg-blue-100 text-blue-700',
  RMM:           'bg-purple-100 text-purple-700',
  Documentation: 'bg-green-100 text-green-700',
  vCIO:          'bg-amber-100 text-amber-700',
  Security:      'bg-red-100 text-red-700',
  Network:       'bg-cyan-100 text-cyan-700',
  CSAT:          'bg-pink-100 text-pink-700',
}

const INT_ABBR = {
  autotask: 'AT', datto_rmm: 'D', it_glue: 'IT', scalepad: 'SP',
  myitprocess: 'MI', saas_alerts: 'SA', auvik: 'AU', customer_thermometer: 'CT',
}

function intStatus(integration) {
  if (!integration.is_configured) return { color: 'bg-gray-300', label: 'Not configured', text: 'gray' }
  if (integration.last_sync_status === 'failed') return { color: 'bg-red-500', label: 'Last sync failed', text: 'red' }
  if (!integration.last_sync_at) return { color: 'bg-gray-300', label: 'Never synced', text: 'gray' }
  const staleDays = (Date.now() - new Date(integration.last_sync_at)) / 86400000
  if (staleDays > 2) return { color: 'bg-yellow-400', label: `Stale — ${Math.floor(staleDays)} days ago`, text: 'yellow' }
  return { color: 'bg-green-500', label: 'Up to date', text: 'green' }
}

function IntegrationsTab() {
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState({})
  const [testing, setTesting] = useState({})
  const [testResults, setTestResults] = useState({})
  const [syncingAll, setSyncingAll] = useState(false)

  function load() {
    setLoading(true)
    api.get('/integrations')
      .then(d => setIntegrations(d.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleSync(type) {
    const endpoints = SYNC_ENDPOINTS[type] || []
    setSyncing(prev => ({ ...prev, [type]: true }))
    try {
      for (const ep of endpoints) await api.post(ep)
      const d = await api.get('/integrations')
      setIntegrations(d.data || [])
    } catch (err) { console.error('Sync failed:', err) }
    finally { setSyncing(prev => ({ ...prev, [type]: false })) }
  }

  async function handleTest(type) {
    setTesting(prev => ({ ...prev, [type]: true }))
    setTestResults(prev => ({ ...prev, [type]: null }))
    try {
      const res = await api.post(`/integrations/${type}/test`)
      setTestResults(prev => ({ ...prev, [type]: { ok: res.status === 'ok', message: res.message } }))
    } catch (err) {
      setTestResults(prev => ({ ...prev, [type]: { ok: false, message: err.message || 'Request failed' } }))
    } finally { setTesting(prev => ({ ...prev, [type]: false })) }
  }

  async function handleSyncAll() {
    setSyncingAll(true)
    try {
      await api.post('/sync/all')
      const d = await api.get('/integrations')
      setIntegrations(d.data || [])
    } catch (err) { console.error('Sync all error:', err) }
    finally { setSyncingAll(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mr-3" />
      <span className="text-sm">Loading integrations…</span>
    </div>
  )

  // Sort: configured first
  const sorted = [...integrations].sort((a, b) => {
    if (a.is_configured !== b.is_configured) return a.is_configured ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Integrations</h2>
          <p className="text-sm text-gray-500 mt-0.5">Monitor connection status and trigger manual syncs for each data source</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <RefreshCw size={15} />
          </button>
          <button onClick={handleSyncAll} disabled={syncingAll}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {syncingAll
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Syncing All…</>
              : <><RefreshCw size={14} /> Sync All</>}
          </button>
          <BackfillHardwareButton />
        </div>
      </div>

      <div className="space-y-3">
        {sorted.map(integration => {
          const st = intStatus(integration)
          const isSyncing = syncing[integration.type]
          const isTesting = testing[integration.type]
          const testResult = testResults[integration.type]
          const abbr = INT_ABBR[integration.type] || integration.name.slice(0, 2).toUpperCase()

          return (
            <Card key={integration.type}>
              <div className="px-5 py-4">
                <div className="flex items-start gap-3">
                  {/* Icon + status dot */}
                  <div className="relative shrink-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${integration.is_configured ? 'bg-primary-50' : 'bg-gray-100'}`}>
                      <span className={`text-xs font-bold ${integration.is_configured ? 'text-primary-600' : 'text-gray-400'}`}>{abbr}</span>
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${st.color}`} title={st.label} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{integration.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[integration.category] || 'bg-gray-100 text-gray-500'}`}>
                        {integration.category}
                      </span>
                      {!integration.is_configured && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Not configured</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{integration.description}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {integration.last_sync_at ? (
                        <span className={`text-xs ${st.text === 'red' ? 'text-red-500' : st.text === 'yellow' ? 'text-yellow-600' : 'text-gray-400'}`}>
                          {st.text === 'red' ? '✗ Last sync failed' : `Last sync: ${fmtRelative(integration.last_sync_at)}`}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Never synced</span>
                      )}
                      {integration.last_records_fetched != null && (
                        <span className="text-xs text-gray-400">{Number(integration.last_records_fetched).toLocaleString()} records</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleTest(integration.type)}
                      disabled={isTesting}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {isTesting
                        ? <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
                        : 'Test Connection'}
                    </button>
                    <button
                      onClick={() => handleSync(integration.type)}
                      disabled={isSyncing || syncingAll}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {isSyncing
                        ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Syncing…</>
                        : <><RefreshCw size={11} /> Sync Now</>}
                    </button>
                  </div>
                </div>

                {/* Test result */}
                {testResult && (
                  <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${testResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {testResult.ok ? '✓' : '✗'} {testResult.message}
                  </div>
                )}

                {/* Sync entities reminder */}
                {integration.sync_entities?.length > 0 && (
                  <div className="mt-2 flex items-center gap-1 flex-wrap">
                    <span className="text-xs text-gray-400">Syncs:</span>
                    {integration.sync_entities.map(e => (
                      <span key={e} className="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 capitalize">{e.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <AlertCircle size={15} className="mt-0.5 shrink-0 text-blue-500" />
        <span>Sync status updates after each run completes. Use <strong>Test Connection</strong> to verify API credentials are valid before triggering a full sync. The green dot means the last sync completed within 2 days.</span>
      </div>
    </div>
  )
}

// ─── Device Lifecycle Tab ─────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: 'workstation', label: 'Workstations' },
  { value: 'laptop',      label: 'Laptops' },
  { value: 'server',      label: 'Servers' },
  { value: 'network',     label: 'Network Devices' },
  { value: 'mobile',      label: 'Mobile Devices' },
  { value: 'peripheral',  label: 'Peripherals' },
]

function DeviceLifecycleTab() {
  const [config, setConfig] = useState({
    enabled: false,
    rmm_managed_categories: ['workstation', 'laptop', 'server'],
    absent_threshold_days: 30,
    absent_action: 'mark_inactive',
    rmm_is_last_seen_source: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/settings/lifecycle')
      .then(d => setConfig(d.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const data = await api.patch('/settings/lifecycle', config)
      setConfig(data.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { setError(e.message || 'Save failed') }
    finally { setSaving(false) }
  }

  async function handleRun() {
    setRunning(true); setRunResult(null); setError('')
    try {
      const data = await api.post('/settings/lifecycle/run')
      setRunResult(data.data)
    } catch (e) { setError(e.message || 'Run failed') }
    finally { setRunning(false) }
  }

  function toggleCategory(val) {
    setConfig(c => ({
      ...c,
      rmm_managed_categories: c.rmm_managed_categories.includes(val)
        ? c.rmm_managed_categories.filter(x => x !== val)
        : [...c.rmm_managed_categories, val],
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mr-3" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900">Device Lifecycle Management</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Configure how assets are marked inactive when not found in RMM, and control the last-seen source of truth.
        </p>
      </div>

      <Card className="mb-4">
        <CardBody>
          <div className="space-y-6 max-w-xl">

            {/* Enable toggle */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Enable Lifecycle Automation</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  When enabled, devices of the tracked types that are absent from RMM will be acted on.
                </p>
              </div>
              <button
                onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  config.enabled ? 'bg-primary-600' : 'bg-gray-200'
                }`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  config.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* RMM-managed device categories */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">RMM-Managed Device Types</h3>
              <p className="text-xs text-gray-500 mb-3">
                Device categories that <em>should</em> always be monitored in RMM (Workstations, Laptops, Servers, etc.).
                Devices of these types that are missing from RMM will trigger the action below.
              </p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map(opt => (
                  <button key={opt.value}
                    onClick={() => toggleCategory(opt.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
                      config.rmm_managed_categories.includes(opt.value)
                        ? 'bg-primary-50 border-primary-400 text-primary-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Absence threshold */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Absence Threshold</h3>
              <p className="text-xs text-gray-500 mb-3">
                How long a device must be absent from RMM before the action is triggered.
                Set to 0 to act immediately on any device not actively reporting to RMM.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number" min="0" max="365"
                  value={config.absent_threshold_days}
                  onChange={e => setConfig(c => ({ ...c, absent_threshold_days: parseInt(e.target.value) || 0 }))}
                  className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                />
                <span className="text-sm text-gray-600">days absent from RMM</span>
              </div>
            </div>

            {/* Action */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Action When Threshold Reached</h3>
              <div className="space-y-2">
                {[
                  { value: 'mark_inactive', label: 'Mark as Inactive', desc: 'Device is moved to inactive status. It will reactivate automatically if RMM picks it up again.' },
                  { value: 'flag_only',     label: 'Flag Only',        desc: 'Device is flagged with an absence note but remains active. Useful for review before decommission.' },
                ].map(opt => (
                  <label key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      config.absent_action === opt.value
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}>
                    <input type="radio" name="absent_action" value={opt.value}
                      checked={config.absent_action === opt.value}
                      onChange={() => setConfig(c => ({ ...c, absent_action: opt.value }))}
                      className="mt-0.5 accent-primary-600" />
                    <div>
                      <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Last-seen source of truth */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Last Seen — Source of Truth</h3>
              <p className="text-xs text-gray-500 mb-3">
                Controls how the <strong>Last Seen</strong> timestamp is updated during syncs.
              </p>
              <div className="space-y-2">
                {[
                  { value: true,  label: 'RMM Only',    desc: 'Last Seen is only updated by Datto RMM sync. Other sources (Autotask, IT Glue, Auvik) show their source name but do not advance the timestamp.' },
                  { value: false, label: 'Any Source',  desc: 'Last Seen is updated by any sync source. Devices not in RMM will still show a recent Last Seen date from other integrations.' },
                ].map(opt => (
                  <label key={String(opt.value)}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      config.rmm_is_last_seen_source === opt.value
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}>
                    <input type="radio" name="last_seen_source" value={String(opt.value)}
                      checked={config.rmm_is_last_seen_source === opt.value}
                      onChange={() => setConfig(c => ({ ...c, rmm_is_last_seen_source: opt.value }))}
                      className="mt-0.5 accent-primary-600" />
                    <div>
                      <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
                {saving ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                ) : (
                  <><Check size={14} /> Save Settings</>
                )}
              </button>
              <button onClick={handleRun} disabled={running || !config.enabled}
                title={!config.enabled ? 'Enable lifecycle automation to run a check' : ''}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-40 transition-colors">
                {running ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running…</>
                ) : (
                  <><Play size={14} /> Run Check Now</>
                )}
              </button>
              {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
            </div>

          </div>
        </CardBody>
      </Card>

      {runResult && (
        <Card>
          <CardBody>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Last Run Results</h3>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Checked',    value: runResult.checked,         color: 'text-gray-700' },
                { label: 'Deactivated',value: runResult.marked_inactive, color: 'text-red-600' },
                { label: 'Flagged',    value: runResult.flagged,         color: 'text-amber-600' },
                { label: 'Healthy',    value: runResult.skipped,         color: 'text-green-600' },
              ].map(stat => (
                <div key={stat.label} className="text-center p-3 bg-gray-50 rounded-xl">
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value ?? 0}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
            {runResult.message && (
              <p className="text-xs text-gray-500 mt-3 italic">{runResult.message}</p>
            )}
          </CardBody>
        </Card>
      )}

      <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <AlertCircle size={15} className="mt-0.5 shrink-0 text-blue-500" />
        <span>
          This check runs automatically after each Datto RMM sync if enabled. You can also trigger it manually above.
          Devices are <strong>only marked inactive</strong> — data is never deleted.
          A device that re-appears in RMM will be automatically re-activated on the next sync.
        </span>
      </div>
    </div>
  )
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: 'tenant_admin',   label: 'Admin',                   desc: 'Full platform access and user management' },
  { value: 'vcio',           label: 'Virtual CIO',             desc: 'Access to all client data and reporting' },
  { value: 'tam',            label: 'Technical Account Mgr',   desc: 'Standard access to client and asset data' },
  { value: 'client_readonly',label: 'Read Only',               desc: 'View-only access, no editing' },
]

function roleBadge(role) {
  const map = {
    global_admin:   'bg-purple-100 text-purple-700',
    tenant_admin:   'bg-blue-100 text-blue-700',
    vcio:           'bg-indigo-100 text-indigo-700',
    tam:            'bg-green-100 text-green-700',
    client_readonly:'bg-gray-100 text-gray-600',
  }
  const labels = {
    global_admin:   'Global Admin',
    tenant_admin:   'Admin',
    vcio:           'Virtual CIO',
    tam:            'TAM',
    client_readonly:'Read Only',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[role] || 'bg-gray-100 text-gray-600'}`}>
      {labels[role] || role}
    </span>
  )
}

function InviteModal({ onClose, onInvited }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('tam')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [inviteUrl, setInviteUrl] = useState(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const data = await api.post('/users/invite', { email: email.trim(), role })
      setInviteUrl(data.invite_url)
      onInvited()
    } catch (err) {
      setError(err.message || 'Failed to create invite')
    } finally {
      setSaving(false)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Invite team member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {inviteUrl ? (
          <div className="p-6">
            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mx-auto mb-4">
              <Check size={20} className="text-green-600" />
            </div>
            <p className="text-center text-sm font-medium text-gray-900 mb-1">Invite created!</p>
            <p className="text-center text-xs text-gray-500 mb-4">
              Share this link with <strong>{email}</strong>. It expires in 7 days.
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={inviteUrl}
                className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 truncate"
              />
              <button
                onClick={copyLink}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors
                  ${copied ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button
              onClick={onClose}
              className="mt-4 w-full py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                required
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Role
              </label>
              <div className="space-y-2">
                {ROLE_OPTIONS.map(opt => (
                  <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                    ${role === opt.value ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input
                      type="radio"
                      name="role"
                      value={opt.value}
                      checked={role === opt.value}
                      onChange={() => setRole(opt.value)}
                      className="mt-0.5 accent-primary-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? 'Creating…' : 'Create invite'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function TeamTab() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editingRole, setEditingRole] = useState(null) // userId being edited
  const [newRole, setNewRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const data = await api.get('/users')
      setUsers(data.users || [])
      setPendingInvites(data.pending_invites || [])
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to load team' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleRoleSave(userId) {
    setSaving(true)
    try {
      await api.patch(`/users/${userId}`, { role: newRole })
      setEditingRole(null)
      await load()
      setMsg({ type: 'success', text: 'Role updated' })
      setTimeout(() => setMsg(null), 2500)
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(userId, name) {
    if (!confirm(`Deactivate ${name}? They will no longer be able to log in.`)) return
    try {
      await api.patch(`/users/${userId}`, { is_active: false })
      await load()
      setMsg({ type: 'success', text: `${name} deactivated` })
      setTimeout(() => setMsg(null), 2500)
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  async function handleReactivate(userId, name) {
    try {
      await api.patch(`/users/${userId}`, { is_active: true })
      await load()
      setMsg({ type: 'success', text: `${name} reactivated` })
      setTimeout(() => setMsg(null), 2500)
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  async function handleCancelInvite(inviteId, email) {
    if (!confirm(`Cancel invite for ${email}?`)) return
    try {
      await api.delete(`/users/invite/${inviteId}`)
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }

  const activeUsers   = users.filter(u => u.is_active)
  const inactiveUsers = users.filter(u => !u.is_active)

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Team members</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage who has access to this workspace
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <UserPlus size={15} />
          Invite user
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm
          ${msg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {msg.type === 'error' ? <AlertCircle size={14} /> : <Check size={14} />}
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading team…</div>
      ) : (
        <>
          {/* Active users */}
          <Card>
            <CardBody className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Member</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Role</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Last login</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Auth</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {activeUsers.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-xs shrink-0">
                            {(u.display_name || u.email).slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 leading-tight">{u.display_name}</p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </div>
                          {u.id === currentUser?.id && (
                            <span className="text-xs text-gray-400 italic">(you)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {editingRole === u.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={newRole}
                              onChange={e => setNewRole(e.target.value)}
                              className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                            >
                              {ROLE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <button onClick={() => handleRoleSave(u.id)} disabled={saving}
                              className="text-xs text-green-700 hover:text-green-900 font-medium disabled:opacity-50">
                              {saving ? '…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingRole(null)}
                              className="text-xs text-gray-400 hover:text-gray-600">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          roleBadge(u.role)
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {u.last_login_at ? fmtRelative(u.last_login_at) : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-400 capitalize">{u.auth_provider || 'local'}</span>
                      </td>
                      <td className="px-4 py-3">
                        {u.id !== currentUser?.id && (
                          <div className="flex items-center gap-2 justify-end">
                            {editingRole !== u.id && (
                              <button
                                onClick={() => { setEditingRole(u.id); setNewRole(u.role) }}
                                className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1"
                              >
                                <Pencil size={12} /> Edit role
                              </button>
                            )}
                            <button
                              onClick={() => handleDeactivate(u.id, u.display_name || u.email)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Deactivate
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Pending invites</h3>
              <Card>
                <CardBody className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Email</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Role</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Expires</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Invited by</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pendingInvites.map(inv => (
                        <tr key={inv.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Mail size={13} className="text-gray-400" />
                              <span className="text-gray-700">{inv.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">{roleBadge(inv.role)}</td>
                          <td className="px-4 py-3 text-xs text-amber-600">
                            {fmtRelative(inv.expires_at)} left
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {inv.invited_by_name || '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleCancelInvite(inv.id, inv.email)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Cancel
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            </div>
          )}

          {/* Inactive users (collapsed) */}
          {inactiveUsers.length > 0 && (
            <details className="group">
              <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-600 list-none flex items-center gap-1">
                <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
                {inactiveUsers.length} deactivated user{inactiveUsers.length !== 1 ? 's' : ''}
              </summary>
              <div className="mt-2">
                <Card>
                  <CardBody className="p-0">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-gray-50">
                        {inactiveUsers.map(u => (
                          <tr key={u.id} className="opacity-50 hover:opacity-75">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-700">{u.display_name}</p>
                              <p className="text-xs text-gray-400">{u.email}</p>
                            </td>
                            <td className="px-4 py-3">{roleBadge(u.role)}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleReactivate(u.id, u.display_name || u.email)}
                                className="text-xs text-primary-600 hover:text-primary-800"
                              >
                                Reactivate
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardBody>
                </Card>
              </div>
            </details>
          )}
        </>
      )}

      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          onInvited={() => load()}
        />
      )}
    </div>
  )
}

// ─── Integration Setup Tab ────────────────────────────────────────────────────

function SetupSection({ title, icon: Icon, color, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          <Icon size={16} className="text-white" />
        </span>
        <span className="flex-1 font-semibold text-gray-900 text-sm">{title}</span>
        <ChevronRight size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="px-5 py-5 space-y-5 bg-white">{children}</div>}
    </div>
  )
}

function Step({ n, title, children }) {
  return (
    <div className="flex gap-4">
      <div className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-800 mb-1">{title}</p>
        <div className="text-sm text-gray-600 space-y-1">{children}</div>
      </div>
    </div>
  )
}

function Code({ children }) {
  return (
    <code className="inline-block bg-gray-100 border border-gray-200 text-xs text-gray-800 font-mono px-2 py-0.5 rounded">{children}</code>
  )
}

function EnvBlock({ lines }) {
  return (
    <pre className="mt-2 bg-gray-900 text-green-300 text-xs font-mono rounded-lg p-3 overflow-x-auto whitespace-pre">{lines.join('\n')}</pre>
  )
}

function InfoBox({ children }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
      <AlertCircle size={14} className="shrink-0 mt-0.5 text-blue-500" />
      <span>{children}</span>
    </div>
  )
}

function WarningBox({ children }) {
  return (
    <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
      <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-500" />
      <span>{children}</span>
    </div>
  )
}

function IntegrationSetupTab() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-base font-semibold text-gray-900">Integration Setup Guide</h2>
        <p className="text-sm text-gray-500 mt-1">Step-by-step instructions for configuring each platform integration. All credentials are stored as environment variables on the server.</p>
      </div>

      {/* Microsoft 365 / Partner Center */}
      <SetupSection title="Microsoft 365 & Partner Center" icon={Cloud} color="bg-blue-500" defaultOpen>
        <InfoBox>
          Align already has an Azure app registration configured for SSO (<Code>MS_TENANT_ID</Code>, <Code>MS_CLIENT_ID</Code>, <Code>MS_CLIENT_SECRET</Code>). The same credentials can be extended to the Microsoft Partner Center API — no new app registration required as long as the correct API permission is added.
        </InfoBox>

        <div className="space-y-4 pt-1">
          <Step n="1" title="Open your Azure App Registration">
            <p>Go to <a href="https://portal.azure.com" target="_blank" rel="noreferrer" className="text-primary-600 underline">portal.azure.com</a> → <strong>Azure Active Directory</strong> → <strong>App registrations</strong> → find the app currently used for Align SSO (the one whose Client ID matches <Code>MS_CLIENT_ID</Code> in your .env).</p>
          </Step>

          <Step n="2" title="Add Partner Center API Permission">
            <p>In the app registration → <strong>API permissions</strong> → <strong>Add a permission</strong> → search for <strong>"Partner Center"</strong>.</p>
            <p className="mt-1">Select <strong>Microsoft Partner Center</strong> → <strong>Application permissions</strong> → check <Code>user_impersonation</Code> (or <Code>Delegated</Code> depending on your partner tier).</p>
            <p className="mt-1">Click <strong>Grant admin consent</strong> for your tenant.</p>
            <WarningBox>If "Partner Center" does not appear in the API list, your Azure tenant is not enrolled as a CSP (Cloud Solution Provider). You may need to create a separate app in the Partner Center dashboard at partner.microsoft.com → Account settings → App management.</WarningBox>
          </Step>

          <Step n="3" title="Verify existing .env values">
            <p>Your <Code>/opt/align/.env</Code> should already have these. Confirm they match the app registration above:</p>
            <EnvBlock lines={[
              '# Microsoft Entra (Azure AD)',
              'MS_TENANT_ID=your-tenant-id',
              'MS_CLIENT_ID=your-client-id',
              'MS_CLIENT_SECRET=your-client-secret',
            ]} />
          </Step>

          <Step n="4" title="Add Partner Center scope to .env">
            <p>Add this new variable to <Code>/opt/align/.env</Code>:</p>
            <EnvBlock lines={[
              'MS_PARTNER_SCOPE=https://api.partnercenter.microsoft.com/.default',
            ]} />
          </Step>

          <Step n="5" title="Test the connection">
            <p>After adding the scope, restart the API (<Code>pm2 restart align</Code>) and navigate to <strong>Settings → Integrations</strong> to trigger a test sync once the Partner Center sync feature is built.</p>
          </Step>

          <div className="pt-1 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Key API endpoints used</p>
            <div className="space-y-1 font-mono text-xs text-gray-600">
              <p><Code>GET https://api.partnercenter.microsoft.com/v1/customers</Code> — list all CSP customers</p>
              <p><Code>GET /v1/customers/&#123;id&#125;/subscriptions</Code> — subscriptions per customer</p>
              <p><Code>GET /v1/customers/&#123;id&#125;/subscribedskus</Code> — seat counts per SKU</p>
            </div>
          </div>
        </div>
      </SetupSection>

      {/* Google Workspace */}
      <SetupSection title="Google Workspace" icon={Globe} color="bg-red-500">
        <InfoBox>
          Resolve already has Google OAuth credentials (<Code>GOOGLE_CLIENT_ID</Code> / <Code>GOOGLE_CLIENT_SECRET</Code>) configured for client portal SSO. For Align's Google Workspace integration (license counts, user directory), you can reuse the same OAuth app but need to add the <strong>Admin SDK Directory API</strong> scope and enable domain-wide delegation.
        </InfoBox>

        <div className="space-y-4 pt-1">
          <Step n="1" title="Open Google Cloud Console">
            <p>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-primary-600 underline">console.cloud.google.com</a> → select the project used for your existing OAuth credentials → <strong>APIs & Services</strong> → <strong>Credentials</strong>.</p>
          </Step>

          <Step n="2" title="Enable the Admin SDK API">
            <p>Go to <strong>APIs & Services</strong> → <strong>Library</strong> → search <strong>"Admin SDK API"</strong> → click <strong>Enable</strong>.</p>
            <p className="mt-1">Also enable: <strong>Google Workspace License Manager API</strong> if you want per-product license assignment data.</p>
          </Step>

          <Step n="3" title="Create a Service Account (for server-to-server access)">
            <p>In <strong>Credentials</strong> → <strong>Create credentials</strong> → <strong>Service account</strong>.</p>
            <p className="mt-1">Give it a name (e.g. "predictiveIT Align"), click <strong>Create and continue</strong> → skip optional steps → <strong>Done</strong>.</p>
            <p className="mt-1">Click the new service account → <strong>Keys</strong> tab → <strong>Add key</strong> → <strong>Create new key</strong> → <strong>JSON</strong>. Save the downloaded file securely.</p>
          </Step>

          <Step n="4" title="Enable Domain-Wide Delegation">
            <p>In the service account detail page → check <strong>"Enable Google Workspace Domain-Wide Delegation"</strong> → save.</p>
            <p className="mt-1">Note the <strong>Client ID</strong> shown (numeric, different from OAuth Client ID).</p>
            <p className="mt-1">Then in your <strong>Google Workspace Admin Console</strong> (<a href="https://admin.google.com" target="_blank" rel="noreferrer" className="text-primary-600 underline">admin.google.com</a>) → Security → API Controls → <strong>Domain-wide delegation</strong> → <strong>Add new</strong>.</p>
            <p className="mt-1">Paste the service account Client ID and add these OAuth scopes:</p>
            <EnvBlock lines={[
              'https://www.googleapis.com/auth/admin.directory.user.readonly',
              'https://www.googleapis.com/auth/admin.directory.domain.readonly',
              'https://www.googleapis.com/auth/apps.licensing',
            ]} />
          </Step>

          <Step n="5" title="Add credentials to .env">
            <p>Copy the contents of the downloaded JSON key file. Add to <Code>/opt/align/.env</Code>:</p>
            <EnvBlock lines={[
              'GOOGLE_SERVICE_ACCOUNT_EMAIL=align@your-project.iam.gserviceaccount.com',
              'GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}',
              '# Admin email to impersonate for directory reads:',
              'GOOGLE_ADMIN_EMAIL=admin@yourdomain.com',
            ]} />
            <WarningBox>The JSON key value must be a single line (minified) in .env. You can minify it with: <Code>cat key.json | tr -d '\n'</Code></WarningBox>
          </Step>

          <Step n="6" title="Per-client tenant mapping">
            <p>Each managed Google Workspace customer needs to grant your service account access, OR you can use the <strong>Google Workspace Reseller API</strong> if predictiveIT is a Google reseller.</p>
            <p className="mt-1">In Align, each client will have a <Code>google_customer_id</Code> field (e.g. <Code>C04abc123</Code>) used to query their directory and license counts.</p>
          </Step>

          <div className="pt-1 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Key API endpoints used</p>
            <div className="space-y-1 font-mono text-xs text-gray-600">
              <p><Code>GET /admin/directory/v1/users?customer=&#123;id&#125;</Code> — user list + license assignments</p>
              <p><Code>GET /apps/licensing/v1/product/&#123;sku&#125;/sku/&#123;sku&#125;/users</Code> — per-SKU license usage</p>
              <p><Code>GET /admin/directory/v1/customer/&#123;id&#125;</Code> — customer domain info</p>
            </div>
          </div>
        </div>
      </SetupSection>

      {/* General env var instructions */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <Terminal size={14} className="text-gray-500" />
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">How to update .env and restart</span>
        </div>
        <div className="space-y-2 text-xs text-gray-600 font-mono">
          <p><span className="text-gray-400"># Edit the env file</span></p>
          <p>nano /opt/align/.env</p>
          <p className="mt-2"><span className="text-gray-400"># Restart the API to apply changes</span></p>
          <p>pm2 restart align</p>
          <p className="mt-2"><span className="text-gray-400"># Verify it's running</span></p>
          <p>pm2 status</p>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Verticals ───────────────────────────────────────────────────────────
function VerticalsTab() {
  const [verticals, setVerticals] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newAtClass, setNewAtClass] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    api.get('/settings/verticals').then(r => setVerticals(r.data || []))
      .catch(console.error).finally(() => setLoading(false))
  }, [])

  async function addVertical() {
    if (!newName.trim()) return
    setAdding(true)
    try {
      const res = await api.post('/settings/verticals', { name: newName.trim(), autotask_classification: newAtClass.trim() || null })
      setVerticals(prev => [...prev, res.data])
      setNewName(''); setNewAtClass('')
    } catch (err) { alert(err.response?.data?.error || 'Failed') }
    finally { setAdding(false) }
  }

  async function removeVertical(id) {
    if (!confirm('Delete this vertical?')) return
    try {
      await api.delete(`/settings/verticals/${id}`)
      setVerticals(prev => prev.filter(v => v.id !== id))
    } catch (err) { console.error(err) }
  }

  async function updateAtMapping(id, val) {
    try {
      await api.patch(`/settings/verticals/${id}`, { autotask_classification: val || null })
      setVerticals(prev => prev.map(v => v.id === id ? { ...v, autotask_classification: val } : v))
    } catch (err) { console.error(err) }
  }

  if (loading) return <div className="py-10 text-center text-gray-400">Loading...</div>

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">Industry Verticals</h2>
        <p className="text-sm text-gray-500">Manage the list of verticals available on client profiles. Optionally map each to an Autotask classification for auto-assignment during sync.</p>
      </div>

      {/* Add new */}
      <div className="flex items-end gap-3 mb-5 bg-gray-50 rounded-xl p-4 border border-gray-100">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Vertical Name</label>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addVertical()}
            placeholder="e.g. Veterinary"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Autotask Classification (optional)</label>
          <input value={newAtClass} onChange={e => setNewAtClass(e.target.value)}
            placeholder="e.g. Veterinary"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <button onClick={addVertical} disabled={adding || !newName.trim()}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 shrink-0">
          Add Vertical
        </button>
      </div>

      {/* List */}
      <div className="space-y-1">
        {verticals.map(v => (
          <div key={v.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{v.name}</p>
              <p className="text-xs text-gray-400">{v.slug}</p>
            </div>
            <div className="w-56">
              <input
                value={v.autotask_classification || ''}
                onChange={e => updateAtMapping(v.id, e.target.value)}
                onBlur={e => updateAtMapping(v.id, e.target.value)}
                placeholder="AT Classification..."
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-400" />
            </div>
            <button onClick={() => removeVertical(v.id)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab: LOB Applications ────────────────────────────────────────────────────
function LobAppsTab() {
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newVendor, setNewVendor] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [adding, setAdding] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncingAt, setSyncingAt] = useState(false)
  const [filterCat, setFilterCat] = useState('')

  useEffect(() => {
    api.get('/settings/lob-apps').then(r => setApps(r.data || []))
      .catch(console.error).finally(() => setLoading(false))
  }, [])

  const categories = useMemo(() => {
    const cats = new Set(apps.map(a => a.category).filter(Boolean))
    return ['', ...Array.from(cats).sort()]
  }, [apps])

  const filtered = useMemo(() => {
    if (!filterCat) return apps
    return apps.filter(a => a.category === filterCat)
  }, [apps, filterCat])

  async function addApp() {
    if (!newName.trim()) return
    setAdding(true)
    try {
      const res = await api.post('/settings/lob-apps', { name: newName.trim(), vendor: newVendor.trim() || null, category: newCategory })
      setApps(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName(''); setNewVendor('')
    } catch (err) { alert(err.response?.data?.error || 'Failed') }
    finally { setAdding(false) }
  }

  async function removeApp(id) {
    try {
      await api.delete(`/settings/lob-apps/${id}`)
      setApps(prev => prev.filter(a => a.id !== id))
    } catch (err) { console.error(err) }
  }

  async function syncFromSoftware() {
    setSyncing(true)
    try {
      const res = await api.post('/settings/lob-apps/sync-from-software')
      if (res.imported > 0) {
        const refreshed = await api.get('/settings/lob-apps')
        setApps(refreshed.data || [])
        alert(`Imported ${res.imported} new apps from software inventory.`)
      } else {
        alert('No new apps found to import.')
      }
    } catch (err) { console.error(err); alert('Sync failed') }
    finally { setSyncing(false) }
  }

  async function syncFromAutotask() {
    setSyncingAt(true)
    try {
      const res = await api.post('/settings/lob-apps/sync-from-autotask')
      const refreshed = await api.get('/settings/lob-apps')
      setApps(refreshed.data || [])
      alert(`Fetched ${res.fetched} LOB CIs from Autotask.\n${res.added_to_master} new apps added, ${res.assigned_to_clients} assigned to clients.`)
    } catch (err) { console.error(err); alert(err.response?.data?.error || 'Sync failed') }
    finally { setSyncingAt(false) }
  }

  if (loading) return <div className="py-10 text-center text-gray-400">Loading...</div>

  const CAT_LABELS = {
    '': 'All', lob: 'Line of Business', general: 'General', accounting: 'Accounting', dental: 'Dental', ehr: 'EHR/Medical',
    legal: 'Legal', crm: 'CRM', cad: 'CAD/Engineering', erp: 'ERP', construction: 'Construction',
    pos: 'POS', nonprofit: 'Nonprofit', design: 'Design', inventory: 'Inventory', ecommerce: 'eCommerce',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Line-of-Business Applications</h2>
          <p className="text-sm text-gray-500">{apps.length} apps · Used in client profiles to auto-map tech-specific standards</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={syncFromAutotask} disabled={syncingAt}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {syncingAt ? 'Syncing...' : 'Import from Autotask'}
          </button>
          <button onClick={syncFromSoftware} disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {syncing ? 'Syncing...' : 'Import from Software Inventory'}
          </button>
        </div>
      </div>

      {/* Add new */}
      <div className="flex items-end gap-3 mb-4 bg-gray-50 rounded-xl p-4 border border-gray-100">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">App Name</label>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addApp()}
            placeholder="e.g. Dentrix"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div className="w-40">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Vendor</label>
          <input value={newVendor} onChange={e => setNewVendor(e.target.value)}
            placeholder="e.g. Henry Schein"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div className="w-36">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
          <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
            {Object.entries(CAT_LABELS).filter(([k]) => k).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button onClick={addApp} disabled={adding || !newName.trim()}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 shrink-0">
          Add App
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {categories.map(c => (
          <button key={c} onClick={() => setFilterCat(c)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium ${
              filterCat === c ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}>
            {CAT_LABELS[c] || c} {c ? apps.filter(a => a.category === c).length : apps.length}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-1">
        {filtered.map(a => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 bg-white border border-gray-100 rounded-xl">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{a.name}</p>
              {a.vendor && <p className="text-xs text-gray-400">{a.vendor}</p>}
            </div>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{CAT_LABELS[a.category] || a.category}</span>
            <button onClick={() => removeApp(a.id)}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Software Catalog ─────────────────────────────────────────────────────────

function SoftwareCatalogTab() {
  const [products, setProducts] = useState([])
  const [total, setTotal]       = useState(0)
  const [publishers, setPublishers] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [pubFilter, setPubFilter] = useState('')
  const [lobFilter, setLobFilter] = useState('')  // '' | 'lob' | 'not-lob'
  const [page, setPage]         = useState(1)
  const [sortCol, setSortCol]   = useState('device_count')
  const [sortDir, setSortDir]   = useState('desc')
  const [editing, setEditing]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [inferring, setInferring] = useState(false)
  const [hideNoise, setHideNoise] = useState(true)
  const [maxDevices, setMaxDevices] = useState(1)
  const perPage = 50

  const [error, setError] = useState(null)

  function load(pg = page) {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page: pg, per_page: perPage, sort: sortCol, dir: sortDir, hide_noise: hideNoise })
    if (search) params.set('search', search)
    if (catFilter) params.set('category', catFilter)
    if (pubFilter) params.set('publisher', pubFilter)
    api.get(`/software/catalog?${params}`)
      .then(res => {
        let data = res.data || []
        if (lobFilter === 'lob') data = data.filter(row => row.is_lob)
        else if (lobFilter === 'not-lob') data = data.filter(row => !row.is_lob)
        setProducts(data)
        setTotal(res.total || 0)
        setPublishers(res.publishers || [])
        setCategories(res.categories || [])
        setMaxDevices(data.length > 0 ? Math.max(...data.map(row => row.device_count || 0)) : 1)
        setPage(pg)
      })
      .catch(err => {
        console.error('Software catalog load error:', err)
        setError(err.message || 'Failed to load catalog')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(1) }, [search, catFilter, pubFilter, lobFilter, sortCol, sortDir, hideNoise])

  const CATEGORY_OPTIONS = [
    '', 'Endpoint protection', 'RMM', 'Office suite', 'OS', 'Web browser',
    'Cloud storage', 'Communication', 'Remote control', 'Accounting', 'Runtime',
    'Backup', 'PDF', 'Maintenance utility', 'Password manager', 'VPN',
    'Database', 'Development', 'ERP', 'CRM', 'LOB', 'Network', 'Other',
  ]

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'product_name' || col === 'publisher' || col === 'category' ? 'asc' : 'desc') }
  }

  function renderSortHeader(col, label, className = '') {
    return (
      <th onClick={() => toggleSort(col)}
        className={`text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 cursor-pointer select-none hover:text-gray-700 transition-colors ${className}`}>
        <span className="inline-flex items-center gap-1">
          {label}
          {sortCol === col && <ChevronDown size={12} className={`transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} />}
        </span>
      </th>
    )
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    try {
      await api.post('/software/catalog/bulk-update', {
        updates: [{
          product_name: editing.product_name,
          publisher: editing.publisher,
          category: editing.category,
          is_lob: editing.is_lob,
        }]
      })
      setProducts(prev => prev.map(p =>
        p.product_name === editing.product_name
          ? { ...p, publisher: editing.publisher, category: editing.category, is_lob: editing.is_lob }
          : p
      ))
      setEditing(null)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  async function toggleLob(product) {
    const newLob = !product.is_lob
    try {
      await api.post('/software/catalog/bulk-update', {
        updates: [{ product_name: product.product_name, is_lob: newLob }]
      })
      setProducts(prev => prev.map(p =>
        p.product_name === product.product_name ? { ...p, is_lob: newLob } : p
      ))
    } catch (err) { console.error(err) }
  }

  async function inferPublishers() {
    setInferring(true)
    try {
      const res = await api.post('/software/infer-publishers')
      alert(`Auto-detected publisher for ${res.updated} software records.`)
      load(page)
    } catch (err) { console.error(err) }
    finally { setInferring(false) }
  }

  const totalPages = Math.ceil(total / perPage)

  // Category color badges
  const CAT_COLORS = {
    'Endpoint protection': 'bg-red-50 text-red-700',
    'RMM': 'bg-indigo-50 text-indigo-700',
    'Office suite': 'bg-blue-50 text-blue-700',
    'OS': 'bg-slate-100 text-slate-700',
    'Web browser': 'bg-cyan-50 text-cyan-700',
    'Cloud storage': 'bg-sky-50 text-sky-700',
    'Communication': 'bg-violet-50 text-violet-700',
    'Remote control': 'bg-orange-50 text-orange-700',
    'Accounting': 'bg-emerald-50 text-emerald-700',
    'Runtime': 'bg-gray-100 text-gray-600',
    'Backup': 'bg-green-50 text-green-700',
    'PDF': 'bg-rose-50 text-rose-700',
    'Maintenance utility': 'bg-amber-50 text-amber-700',
    'Database': 'bg-purple-50 text-purple-700',
    'LOB': 'bg-teal-50 text-teal-700',
    'VPN': 'bg-lime-50 text-lime-700',
    'Network': 'bg-yellow-50 text-yellow-700',
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Software Catalog</h2>
          <p className="text-sm text-gray-500">{total} products across all clients · Edit publisher, category, and LOB globally</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={hideNoise} onChange={e => setHideNoise(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            Hide noise
          </label>
          <button onClick={inferPublishers} disabled={inferring}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {inferring ? 'Inferring...' : 'Auto-Detect Publishers'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search products..." value={search}
            onChange={e => { setSearch(e.target.value) }}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
        <select value={pubFilter} onChange={e => setPubFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none">
          <option value="">All Publishers ({publishers.length})</option>
          {publishers.map(pub => <option key={pub.publisher} value={pub.publisher}>{pub.publisher} ({pub.cnt})</option>)}
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none">
          <option value="">All Categories ({categories.length})</option>
          {categories.map(c => <option key={c.category} value={c.category}>{c.category} ({c.cnt})</option>)}
        </select>
        <select value={lobFilter} onChange={e => setLobFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none">
          <option value="">All Products</option>
          <option value="lob">LOB Only</option>
          <option value="not-lob">Non-LOB</option>
        </select>
        {(search || pubFilter || catFilter || lobFilter) && (
          <button onClick={() => { setSearch(''); setPubFilter(''); setCatFilter(''); setLobFilter('') }}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium">Clear all</button>
        )}
      </div>

      {error ? (
        <div className="py-12 text-center">
          <p className="text-red-500 mb-2">Error loading catalog: {error}</p>
          <button onClick={() => load(1)} className="text-sm text-primary-600 hover:text-primary-700">Retry</button>
        </div>
      ) : loading ? (
        <div className="py-12 text-center text-gray-400">Loading catalog...</div>
      ) : products.length === 0 ? (
        <div className="py-12 text-center text-gray-400">No products found</div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {renderSortHeader('publisher', 'Publisher', 'text-left w-36')}
                  {renderSortHeader('product_name', 'Product Name', 'text-left')}
                  {renderSortHeader('category', 'Category', 'text-left w-36')}
                  {renderSortHeader('device_count', 'Devices', 'text-left w-48')}
                  {renderSortHeader('client_count', 'Clients', 'text-center w-20')}
                  <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 w-14">LOB</th>
                  <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 w-14"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map(prod => {
                  const isEd = editing?.product_name === prod.product_name
                  const barPct = maxDevices > 0 ? Math.max(2, (prod.device_count / maxDevices) * 100) : 0
                  return (
                    <tr key={prod.product_name} className={`hover:bg-gray-50 transition-colors ${isEd ? 'bg-primary-50' : ''}`}>
                      {/* Publisher */}
                      <td className="px-3 py-2">
                        {isEd ? (
                          <input type="text" value={editing.publisher || ''}
                            onChange={e => setEditing(prev => ({ ...prev, publisher: e.target.value }))}
                            className="w-full text-xs border border-primary-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-400"
                            placeholder="Publisher..." />
                        ) : (
                          <span className={`text-xs font-medium ${prod.publisher ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                            {prod.publisher || '—'}
                          </span>
                        )}
                      </td>
                      {/* Product Name */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{prod.product_name}</span>
                          {prod.latest_version && <span className="text-[10px] text-gray-400 bg-gray-50 rounded px-1.5 py-0.5">{prod.latest_version}</span>}
                        </div>
                      </td>
                      {/* Category */}
                      <td className="px-3 py-2">
                        {isEd ? (
                          <select value={editing.category || ''}
                            onChange={e => setEditing(prev => ({ ...prev, category: e.target.value }))}
                            className="w-full text-xs border border-primary-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-400">
                            {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c || '— None —'}</option>)}
                          </select>
                        ) : prod.category ? (
                          <span className={`inline-block text-[11px] font-medium rounded-full px-2 py-0.5 ${CAT_COLORS[prod.category] || 'bg-gray-100 text-gray-600'}`}>
                            {prod.category}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 italic">—</span>
                        )}
                      </td>
                      {/* Devices - progress bar */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${barPct}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-gray-700 w-10 text-right">{prod.device_count}</span>
                        </div>
                      </td>
                      {/* Clients */}
                      <td className="px-3 py-2 text-center text-xs font-medium text-gray-500">{prod.client_count}</td>
                      {/* LOB */}
                      <td className="px-3 py-2 text-center">
                        {isEd ? (
                          <button onClick={() => setEditing(prev => ({ ...prev, is_lob: !prev.is_lob }))}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors mx-auto ${
                              editing.is_lob ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-gray-400'
                            }`}>
                            {editing.is_lob && <CheckCircle2 size={12} />}
                          </button>
                        ) : (
                          <button onClick={() => toggleLob(prod)}
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
                              prod.is_lob ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                            }`}>
                            {prod.is_lob ? <CheckCircle2 size={14} /> : <span className="text-[10px]">—</span>}
                          </button>
                        )}
                      </td>
                      {/* Edit */}
                      <td className="px-3 py-2 text-center">
                        {isEd ? (
                          <div className="flex items-center gap-1">
                            <button onClick={saveEdit} disabled={saving}
                              className="text-xs text-primary-600 hover:text-primary-700 font-medium">{saving ? '...' : 'Save'}</button>
                            <button onClick={() => setEditing(null)}
                              className="text-xs text-gray-400 hover:text-gray-600">X</button>
                          </div>
                        ) : (
                          <button onClick={() => setEditing({ product_name: prod.product_name, publisher: prod.publisher || '', category: prod.category || '', is_lob: prod.is_lob })}
                            className="text-gray-300 hover:text-primary-600 transition-colors">
                            <Edit2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-gray-500">Page {page} of {totalPages} · {total} products</span>
              <div className="flex items-center gap-1">
                <button onClick={() => load(1)} disabled={page <= 1}
                  className="px-2 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:bg-gray-50">First</button>
                <button onClick={() => load(page - 1)} disabled={page <= 1}
                  className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:bg-gray-50">Prev</button>
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                  const pg = start + i
                  if (pg > totalPages) return null
                  return <button key={pg} onClick={() => load(pg)}
                    className={`px-2.5 py-1 text-xs rounded ${pg === page ? 'bg-primary-600 text-white' : 'border border-gray-200 hover:bg-gray-50'}`}>{pg}</button>
                })}
                <button onClick={() => load(page + 1)} disabled={page >= totalPages}
                  className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:bg-gray-50">Next</button>
                <button onClick={() => load(totalPages)} disabled={page >= totalPages}
                  className="px-2 py-1 text-xs border border-gray-200 rounded disabled:opacity-30 hover:bg-gray-50">Last</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Root Settings page ────────────────────────────────────────────────────────

const TABS = [
  { id: 'team',             label: 'Team' },
  { id: 'client-mapping',   label: 'Client Management' },
  { id: 'asset-types',      label: 'Asset Types' },
  { id: 'ci-types',         label: 'CI Type Filter' },
  { id: 'asset-rules',      label: 'Asset Rules' },
  { id: 'device-lifecycle', label: 'Device Lifecycle' },
  { id: 'warranty-lookup',  label: 'Warranty Lookup' },
  { id: 'integrations',     label: 'Integrations' },
  { id: 'integration-setup', label: 'Integration Setup' },
  { id: 'verticals',        label: 'Verticals' },
  { id: 'lob-apps',         label: 'LOB Applications' },
  { id: 'software-catalog', label: 'Software Catalog' },
]

export default function Settings() {
  const [activeTab, setActiveTab] = useState('team')

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      <PageHeader title="Settings" description="Platform configuration and sync management" />

      <div className="flex gap-6">
        {/* Left nav */}
        <nav className="w-52 shrink-0">
          <ul className="space-y-0.5">
            {TABS.map(tab => (
              <li key={tab.id}>
                <button onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}>
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'team'             && <TeamTab />}
          {activeTab === 'client-mapping'   && <ClientMappingPanel />}
          {activeTab === 'asset-types'      && <AssetTypesTab />}
          {activeTab === 'ci-types'         && <CITypesTab />}
          {activeTab === 'asset-rules'      && <AssetRulesTab />}
          {activeTab === 'device-lifecycle' && <DeviceLifecycleTab />}
          {activeTab === 'warranty-lookup'  && <WarrantyLookupTab />}
          {activeTab === 'integrations'      && <IntegrationsTab />}
          {activeTab === 'integration-setup' && <IntegrationSetupTab />}
          {activeTab === 'verticals'         && <VerticalsTab />}
          {activeTab === 'lob-apps'          && <LobAppsTab />}
          {activeTab === 'software-catalog'  && <SoftwareCatalogTab />}
        </div>
      </div>
    </div>
  )
}
