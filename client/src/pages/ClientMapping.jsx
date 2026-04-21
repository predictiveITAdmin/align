import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Search, Check, X, GitBranch, RefreshCw, Loader2, Building2,
  ExternalLink, Pencil, AlertCircle, CheckSquare, Square, Wand2, ChevronDown,
} from 'lucide-react'
import { api } from '../lib/api'
import { autotaskUrl } from '../lib/autotask'
import PageHeader from '../components/PageHeader'
import Card, { CardBody } from '../components/Card'

// ─── Shared helpers ────────────────────────────────────────────────────────────

const CLASS_OPTIONS = [
  { value: 'managed',   label: 'Managed',   color: 'bg-green-100 text-green-700'   },
  { value: 'unmanaged', label: 'Unmanaged', color: 'bg-gray-100 text-gray-600'     },
  { value: 'prospect',  label: 'Prospect',  color: 'bg-yellow-100 text-yellow-700' },
]

const SOURCE_LABELS = {
  pax8:        'PAX8',
  saas_alerts: 'SaaS Alerts',
  auvik:       'Auvik',
  it_glue:     'IT Glue',
  datto_rmm:   'Datto RMM',
}
const SOURCE_TYPES = Object.keys(SOURCE_LABELS)

function ClassBadge({ value }) {
  const opt = CLASS_OPTIONS.find(o => o.value === value)
  if (!opt) return <span className="text-gray-300 text-xs">—</span>
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>
      {opt.label}
    </span>
  )
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

function ConfidenceDot({ confidence, confirmed }) {
  if (confirmed || confidence >= 99) return <span title="Confirmed" className="w-2 h-2 rounded-full bg-green-500 inline-block shrink-0" />
  if (confidence >= 90) return <span title="High confidence — click Edit to confirm" className="w-2 h-2 rounded-full bg-yellow-400 inline-block shrink-0" />
  return <span title="Fuzzy match — review recommended" className="w-2 h-2 rounded-full bg-orange-400 inline-block shrink-0" />
}

// ─── Combobox (searchable dropdown) ───────────────────────────────────────────

function Combobox({ options = [], value, onChange, placeholder, loading, disabled }) {
  const [query,  setQuery]  = useState('')
  const [open,   setOpen]   = useState(false)
  const ref = useRef(null)

  const filtered = useMemo(() => {
    if (!query) return options
    const q = query.toLowerCase()
    return options.filter(o => o.name.toLowerCase().includes(q))
  }, [options, query])

  const selected = value ? options.find(o => o.id === value.id || o.name === value.name) : null

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className={`flex items-center border rounded-lg bg-white transition-colors ${open ? 'border-primary-400 ring-2 ring-primary-100' : 'border-gray-200'}`}>
        <input
          type="text"
          value={open ? query : (selected?.name || '')}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setQuery(''); setOpen(true) }}
          placeholder={loading ? 'Loading…' : placeholder}
          disabled={loading || disabled}
          className="flex-1 px-3 py-2 text-sm focus:outline-none rounded-l-lg bg-transparent min-w-0"
        />
        {selected && !open && (
          <button
            onMouseDown={e => { e.preventDefault(); onChange(null) }}
            className="px-2 py-2 text-gray-400 hover:text-red-500 shrink-0"
          >
            <X size={13} />
          </button>
        )}
        {loading && <Loader2 size={13} className="animate-spin text-gray-400 mx-2 shrink-0" />}
      </div>

      {open && !loading && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">
              {query ? `No results for "${query}"` : 'No options available'}
            </div>
          ) : (
            filtered.map(opt => (
              <button
                key={opt.id || opt.name}
                onMouseDown={e => { e.preventDefault(); onChange(opt); setOpen(false); setQuery('') }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  selected?.name === opt.name
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {opt.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Edit Modal ────────────────────────────────────────────────────────────────

const SOURCE_PLACEHOLDERS = {
  pax8:        'Search PAX8 companies…',
  saas_alerts: 'Search SaaS Alerts customers…',
  auvik:       'Search Auvik tenants…',
  it_glue:     'Search IT Glue organizations…',
  datto_rmm:   'Search Datto RMM sites…',
}

function EditModal({ client, allClients, onSave, onClose }) {
  const [classification, setClassification] = useState(client.classification || '')
  const [accountType,    setAccountType]    = useState(client.account_type   || '')
  const [parentId,       setParentId]       = useState(client.parent_client_id || '')
  const [saving,         setSaving]         = useState(false)

  // External mappings — current confirmed/auto state
  const [mappings, setMappings] = useState(
    SOURCE_TYPES.reduce((acc, src) => {
      const m = client.external_mappings?.find(m => m.source_type === src)
      acc[src] = m ? { id: m.id, name: m.external_name, extId: m.external_id, confirmed: m.is_confirmed, confidence: m.confidence } : null
      return acc
    }, {})
  )
  // Pending new selections per source (before Save)
  const [selected,   setSelected]   = useState({}) // src → {id, name} | null
  const [removing,   setRemoving]   = useState(new Set())
  const [confirming, setConfirming] = useState(new Set())

  // External company lists loaded lazily per source
  const [extData,    setExtData]    = useState({}) // src → [{id,name}]
  const [extLoading, setExtLoading] = useState({}) // src → bool

  // Load a source's company list on first open
  function loadSource(src) {
    if (extData[src] || extLoading[src]) return
    setExtLoading(prev => ({ ...prev, [src]: true }))
    api.get(`/settings/client-mapping/external-companies?source=${src}`)
      .then(r => setExtData(prev => ({ ...prev, [src]: r.data || [] })))
      .catch(() => setExtData(prev => ({ ...prev, [src]: [] })))
      .finally(() => setExtLoading(prev => ({ ...prev, [src]: false })))
  }
  // Load all sources immediately when modal opens
  useEffect(() => { SOURCE_TYPES.forEach(loadSource) }, [])

  const parentOptions = useMemo(
    () => allClients.filter(c => c.id !== client.id && !c.parent_client_id),
    [allClients, client.id]
  )

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(client.id, {
        classification:   classification || null,
        account_type:     accountType || null,
        parent_client_id: parentId || null,
      })
      // Save any newly selected mappings
      for (const [src, val] of Object.entries(selected)) {
        if (val) {
          await api.post('/settings/client-mapping/link', {
            client_id: client.id, source_type: src, external_name: val.name, external_id: val.id || null,
          })
        }
      }
      onClose(true)
    } finally { setSaving(false) }
  }

  async function removeMapping(src, id) {
    setRemoving(prev => new Set(prev).add(src))
    try {
      await api.delete(`/settings/client-mapping/link/${id}`)
      setMappings(prev => ({ ...prev, [src]: null }))
    } finally { setRemoving(prev => { const s = new Set(prev); s.delete(src); return s }) }
  }

  async function confirmMapping(src, id) {
    setConfirming(prev => new Set(prev).add(src))
    try {
      await api.patch(`/settings/client-mapping/link/${id}/confirm`)
      setMappings(prev => ({ ...prev, [src]: { ...prev[src], confirmed: true, confidence: 99 } }))
    } finally { setConfirming(prev => { const s = new Set(prev); s.delete(src); return s }) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{client.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Edit classification, relationships, and system mappings</p>
          </div>
          <button onClick={() => onClose(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Classification + Account Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Classification</label>
              <select value={classification} onChange={e => setClassification(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">— Not set —</option>
                {CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Account Type <span className="text-gray-400 font-normal">(Autotask)</span>
              </label>
              <input type="text" value={accountType} onChange={e => setAccountType(e.target.value)}
                placeholder="e.g. Customer, Partner"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>

          {/* Parent client */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              <GitBranch size={12} className="inline mr-1" />Parent Client
            </label>
            <select value={parentId} onChange={e => setParentId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">— No parent (top-level client) —</option>
              {parentOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* External system mappings */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">External System Mappings</h3>
            <div className="space-y-2">
              {SOURCE_TYPES.map(src => {
                const label   = SOURCE_LABELS[src]
                const current = mappings[src]
                const options = extData[src] || []
                const loading = !!extLoading[src]

                return (
                  <div key={src} className="flex items-start gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                    <span className="text-xs font-medium text-gray-500 w-24 shrink-0 pt-2">{label}</span>

                    <div className="flex-1 min-w-0">
                      {current && !selected[src] ? (
                        /* Existing mapping — show with confirm/remove actions */
                        <div className="flex items-center gap-2">
                          <ConfidenceDot confidence={current.confidence} confirmed={current.confirmed} />
                          <span className="text-sm text-gray-800 flex-1 truncate">{current.name}</span>
                          {!current.confirmed && (
                            <button onClick={() => confirmMapping(src, current.id)}
                              disabled={confirming.has(src)}
                              className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1 shrink-0">
                              {confirming.has(src) ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                              Confirm
                            </button>
                          )}
                          {current.confirmed && (
                            <span className="text-xs text-green-600 font-medium flex items-center gap-1 shrink-0">
                              <Check size={11} /> Confirmed
                            </span>
                          )}
                          <button onClick={() => removeMapping(src, current.id)}
                            disabled={removing.has(src)}
                            title="Remove and reassign"
                            className="text-gray-400 hover:text-red-500 shrink-0">
                            {removing.has(src) ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                          </button>
                        </div>
                      ) : (
                        /* No mapping yet (or user cleared it) — searchable dropdown */
                        <Combobox
                          options={options}
                          value={selected[src] || null}
                          onChange={val => setSelected(prev => ({ ...prev, [src]: val }))}
                          placeholder={SOURCE_PLACEHOLDERS[src]}
                          loading={loading}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button onClick={() => onClose(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-60 flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sync Filters ─────────────────────────────────────────────────────────────

// Which Autotask account types are "recommended" to sync
const RECOMMENDED_TYPES = new Set(['Customer', 'Partner'])

function FilterCheckbox({ item, onChange }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer py-1 px-1 rounded hover:bg-gray-50 group">
      <div
        onClick={onChange}
        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
          item.is_synced
            ? 'bg-primary-600 border-primary-600'
            : 'border-gray-300 group-hover:border-gray-400 bg-white'
        }`}
      >
        {item.is_synced && <Check size={10} className="text-white" strokeWidth={3} />}
      </div>
      <span className="text-sm text-gray-700 leading-tight select-none">{item.label}</span>
    </label>
  )
}

function SyncFilters() {
  const [local,   setLocal]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  // "Enable Classification Filter" — off = sync all regardless of classification
  const [classFilterOn, setClassFilterOn] = useState(false)

  function load() {
    setLoading(true)
    api.get('/settings/autotask-company-filters')
      .then(r => {
        const data = r.data || {}
        setLocal(data)
        // If any classification is checked, the filter is considered "on"
        setClassFilterOn((data.classification || []).some(c => c.is_synced))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  function toggle(fieldName, value) {
    setLocal(prev => ({
      ...prev,
      [fieldName]: prev[fieldName].map(item =>
        item.value === value ? { ...item, is_synced: !item.is_synced } : item
      ),
    }))
    setSaved(false)
  }

  function selectAll(fieldName, synced) {
    setLocal(prev => ({
      ...prev,
      [fieldName]: prev[fieldName].map(item => ({ ...item, is_synced: synced })),
    }))
    setSaved(false)
  }

  function toggleClassFilter(enabled) {
    setClassFilterOn(enabled)
    // If turning off, uncheck all classifications
    if (!enabled) {
      setLocal(prev => ({
        ...prev,
        classification: (prev.classification || []).map(c => ({ ...c, is_synced: false })),
      }))
    }
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      const updates = []
      for (const [fieldName, items] of Object.entries(local)) {
        for (const item of items) {
          updates.push({ field_name: fieldName, picklist_value: item.value, is_synced: item.is_synced })
        }
      }
      await api.patch('/settings/autotask-company-filters', { updates })
      setSaved(true)
      setTimeout(() => setSaved(false), 4000)
    } finally {
      setSaving(false)
    }
  }

  const companyTypes   = local?.companyType     || []
  const classifications = local?.classification   || []
  const recommended    = companyTypes.filter(t => RECOMMENDED_TYPES.has(t.label))
  const other          = companyTypes.filter(t => !RECOMMENDED_TYPES.has(t.label))
  const typeCount      = companyTypes.filter(t => t.is_synced).length
  const classCount     = classifications.filter(c => c.is_synced).length

  return (
    <Card className="mb-6">
      <CardBody>
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Autotask Sync Settings</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Select the <strong>actively managed</strong> account types and classifications you wish to sync from Autotask.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <Check size={12} /> Saved — takes effect on next sync
              </span>
            )}
            <button onClick={save} disabled={saving || loading}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save Sync Settings
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading Autotask configuration…
          </div>
        ) : (
          <>
            {typeCount === 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                <AlertCircle size={13} />
                No Account Types selected — sync will fall back to <strong>Customer only</strong>.
              </div>
            )}

            <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-gray-200">

                {/* ── Account Types ── */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-800">Account Types</h4>
                    <div className="flex gap-2 text-xs text-gray-400">
                      <button onClick={() => selectAll('companyType', true)}
                        className="hover:text-primary-600 font-medium">All</button>
                      <span>·</span>
                      <button onClick={() => selectAll('companyType', false)}
                        className="hover:text-gray-600 font-medium">None</button>
                    </div>
                  </div>

                  {recommended.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Recommended:</p>
                      <div className="mb-3">
                        {recommended.map(t => (
                          <FilterCheckbox key={t.value} item={t} onChange={() => toggle('companyType', t.value)} />
                        ))}
                      </div>
                    </>
                  )}

                  {other.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Other:</p>
                      <div>
                        {other.map(t => (
                          <FilterCheckbox key={t.value} item={t} onChange={() => toggle('companyType', t.value)} />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* ── Classifications ── */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-800">Classifications</h4>
                    {classFilterOn && (
                      <div className="flex gap-2 text-xs text-gray-400">
                        <button onClick={() => selectAll('classification', true)}
                          className="hover:text-primary-600 font-medium">All</button>
                        <span>·</span>
                        <button onClick={() => selectAll('classification', false)}
                          className="hover:text-gray-600 font-medium">None</button>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mb-2">Sync by Classification:</p>

                  {/* Enable toggle */}
                  <label className="flex items-center gap-2.5 cursor-pointer py-1 px-1 mb-2">
                    <div
                      onClick={() => toggleClassFilter(!classFilterOn)}
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                        classFilterOn
                          ? 'bg-primary-600 border-primary-600'
                          : 'border-gray-300 bg-white hover:border-gray-400'
                      }`}
                    >
                      {classFilterOn && <Check size={10} className="text-white" strokeWidth={3} />}
                    </div>
                    <span className="text-sm font-medium text-gray-700 select-none">Enable Sync</span>
                  </label>

                  {classFilterOn && (
                    <>
                      <p className="text-xs text-gray-500 mb-1 mt-3">Classification Types:</p>
                      <div className="max-h-64 overflow-y-auto">
                        {classifications.map(c => (
                          <FilterCheckbox key={c.value} item={c} onChange={() => toggle('classification', c.value)} />
                        ))}
                      </div>
                      {classCount === 0 && (
                        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                          <AlertCircle size={11} /> Select at least one classification
                        </p>
                      )}
                    </>
                  )}
                </div>

              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}

// ─── Panel (embeddable in Settings or standalone) ──────────────────────────────

export function ClientMappingPanel() {
  const [clients,      setClients]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [syncing,      setSyncing]      = useState(false)
  const [autoMapping,  setAutoMapping]  = useState(false)
  const [autoMapResult,setAutoMapResult]= useState(null)
  const [lastSync,     setLastSync]     = useState(null)
  const [search,       setSearch]       = useState('')
  const [filterClass,  setFilterClass]  = useState([])
  const [editClient,   setEditClient]   = useState(null)
  const [updating,     setUpdating]     = useState(new Set()) // sync toggle
  const [sortCol,      setSortCol]      = useState('name')
  const [sortDir,      setSortDir]      = useState('asc')

  function toggleSort(col) {
    if (sortCol === col) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function loadData() {
    setLoading(true)
    api.get('/settings/client-mapping')
      .then(r => setClients(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(loadData, [])

  const filtered = useMemo(() => {
    let rows = clients
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(c => c.name.toLowerCase().includes(q) || (c.parent_name || '').toLowerCase().includes(q))
    }
    if (filterClass.length) rows = rows.filter(c => filterClass.includes(c.classification))
    return rows
  }, [clients, search, filterClass])

  const sortedData = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let aVal, bVal
      switch (sortCol) {
        case 'name':
          aVal = (a.name || '').toLowerCase()
          bVal = (b.name || '').toLowerCase()
          break
        case 'classification':
          aVal = a.classification || ''
          bVal = b.classification || ''
          break
        case 'sync':
          aVal = a.sync_enabled ? 1 : 0
          bVal = b.sync_enabled ? 1 : 0
          break
        case 'pax8':
          aVal = (a.external_mappings?.find(m => m.source_type === 'pax8')?.external_name || '').toLowerCase()
          bVal = (b.external_mappings?.find(m => m.source_type === 'pax8')?.external_name || '').toLowerCase()
          break
        case 'saas_alerts':
          aVal = (a.external_mappings?.find(m => m.source_type === 'saas_alerts')?.external_name || '').toLowerCase()
          bVal = (b.external_mappings?.find(m => m.source_type === 'saas_alerts')?.external_name || '').toLowerCase()
          break
        case 'auvik':
          aVal = (a.external_mappings?.find(m => m.source_type === 'auvik')?.external_name || '').toLowerCase()
          bVal = (b.external_mappings?.find(m => m.source_type === 'auvik')?.external_name || '').toLowerCase()
          break
        case 'parent':
          aVal = (a.parent_name || '').toLowerCase()
          bVal = (b.parent_name || '').toLowerCase()
          break
        default:
          return 0
      }
      if (aVal < bVal) return -1 * dir
      if (aVal > bVal) return 1 * dir
      return 0
    })
  }, [filtered, sortCol, sortDir])

  function toggleClass(val) {
    setFilterClass(prev => prev.includes(val) ? prev.filter(c => c !== val) : [...prev, val])
  }

  async function handleSyncToggle(client, val) {
    setUpdating(prev => new Set(prev).add(client.id))
    try {
      await api.patch(`/clients/${client.id}`, { sync_enabled: val })
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, sync_enabled: val } : c))
    } finally { setUpdating(prev => { const n = new Set(prev); n.delete(client.id); return n }) }
  }

  async function handleSelectAllSync(enable) {
    for (const c of filtered.filter(c => c.sync_enabled !== enable)) {
      await handleSyncToggle(c, enable)
    }
  }

  async function handleSyncNow() {
    setSyncing(true)
    try {
      const r = await api.post('/sync/clients')
      setLastSync({ ok: true, msg: `Synced — ${r.created || 0} created, ${r.updated || 0} updated, ${r.skipped || 0} skipped` })
      loadData()
    } catch (e) {
      setLastSync({ ok: false, msg: e.message || 'Sync failed' })
    } finally { setSyncing(false) }
  }

  async function handleAutoMap() {
    setAutoMapping(true)
    setAutoMapResult(null)
    try {
      const r = await api.post('/settings/client-mapping/auto-map')
      const stats = r.data || r
      const parts = SOURCE_TYPES
        .map(s => stats[s] ? `${SOURCE_LABELS[s]}: ${stats[s].mapped ?? 0} matched` : null)
        .filter(Boolean)
      setAutoMapResult({ ok: true, msg: parts.length ? parts.join(' · ') : 'No new matches found' })
      loadData()
    } catch (e) {
      setAutoMapResult({ ok: false, msg: e.message || 'Auto-map failed' })
    } finally { setAutoMapping(false) }
  }

  async function saveClient(clientId, updates) {
    await api.patch(`/settings/client-mapping/${clientId}`, updates)
  }

  function handleModalClose(didChange) {
    setEditClient(null)
    if (didChange) loadData()
  }

  const syncCount = clients.filter(c => c.sync_enabled).length

  return (
    <div>
      {/* Autotask Sync Filters */}
      <SyncFilters />

      {/* Toolbar */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Client Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage sync, classification, parent relationships, and external system mappings
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={handleAutoMap} disabled={autoMapping || loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 disabled:opacity-50 transition-colors">
              {autoMapping
                ? <><Loader2 size={14} className="animate-spin" /> Auto-mapping…</>
                : <><Wand2 size={14} /> Auto-map All</>}
            </button>
            <button onClick={handleSyncNow} disabled={syncing}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
              {syncing
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Syncing…</>
                : <><RefreshCw size={14} /> Sync Clients Now</>}
            </button>
          </div>
          {autoMapResult && (
            <span className={`text-xs ${autoMapResult.ok ? 'text-green-600' : 'text-red-600'}`}>{autoMapResult.msg}</span>
          )}
          {lastSync && (
            <span className={`text-xs ${lastSync.ok ? 'text-green-600' : 'text-red-600'}`}>{lastSync.msg}</span>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 w-56" />
        </div>

        <div className="flex items-center gap-1 text-xs">
          {CLASS_OPTIONS.map(o => (
            <button key={o.value} onClick={() => toggleClass(o.value)}
              className={`px-3 py-1.5 rounded-full border font-medium transition-colors ${
                filterClass.includes(o.value)
                  ? 'border-primary-400 bg-primary-50 text-primary-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {o.label}
            </button>
          ))}
          {filterClass.length > 0 && (
            <button onClick={() => setFilterClass([])} className="text-gray-400 hover:text-gray-600 ml-1"><X size={13} /></button>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-auto text-xs">
          <span className="text-gray-500">
            <span className="font-semibold text-gray-800">{syncCount}</span>/{clients.length} syncing
          </span>
          <button onClick={() => handleSelectAllSync(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 font-medium">
            <CheckSquare size={12} /> Select All
          </button>
          <button onClick={() => handleSelectAllSync(false)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium">
            <Square size={12} /> None
          </button>
          <button onClick={loadData} title="Refresh" className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {[
                  { key: 'name',           label: 'Client',        align: 'text-left' },
                  { key: 'classification',  label: 'Classification', align: 'text-left' },
                  { key: 'sync',           label: 'Sync',          align: 'text-center' },
                  { key: 'pax8',           label: 'PAX8',          align: 'text-left' },
                  { key: 'saas_alerts',    label: 'SaaS Alerts',   align: 'text-left' },
                  { key: 'auvik',          label: 'Auvik',         align: 'text-left' },
                  { key: 'parent',         label: 'Parent',        align: 'text-left' },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={`${col.align} px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <ChevronDown
                        size={12}
                        className={`transition-transform ${sortCol === col.key ? 'opacity-100' : 'opacity-0'} ${sortCol === col.key && sortDir === 'asc' ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </th>
                ))}
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">AT</th>
                <th className="px-2 py-3 sticky right-0 bg-gray-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.04)]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-gray-400">
                    <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                    <span className="text-sm">Loading clients…</span>
                  </td>
                </tr>
              ) : sortedData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-gray-400 text-sm">No clients found</td>
                </tr>
              ) : sortedData.map(client => {
                const pax8Map  = client.external_mappings?.find(m => m.source_type === 'pax8')
                const saasMap  = client.external_mappings?.find(m => m.source_type === 'saas_alerts')
                const auvikMap = client.external_mappings?.find(m => m.source_type === 'auvik')
                const atUrl    = autotaskUrl('company', client.autotask_company_id)

                return (
                  <tr key={client.id} className="hover:bg-gray-50/50 transition-colors group">
                    {/* Name */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {client.parent_client_id && <span className="text-gray-300 text-xs">└</span>}
                        <span className="font-medium text-gray-900 truncate max-w-[150px]">{client.name}</span>
                      </div>
                      {client.account_type && (
                        <div className="text-xs text-gray-400 mt-0.5 ml-3">{client.account_type}</div>
                      )}
                    </td>

                    {/* Classification */}
                    <td className="px-3 py-2.5"><ClassBadge value={client.classification} /></td>

                    {/* Sync toggle */}
                    <td className="px-3 py-2.5 text-center">
                      <Toggle
                        value={!!client.sync_enabled}
                        disabled={updating.has(client.id)}
                        onChange={val => handleSyncToggle(client, val)}
                      />
                    </td>

                    {/* PAX8 */}
                    <td className="px-3 py-2.5">
                      {pax8Map ? (
                        <div className="flex items-center gap-1.5">
                          <ConfidenceDot confidence={pax8Map.confidence} confirmed={pax8Map.is_confirmed} />
                          <span className="text-xs text-gray-700 truncate max-w-[100px]" title={pax8Map.external_name}>
                            {pax8Map.external_name}
                          </span>
                        </div>
                      ) : <span className="text-gray-300 text-sm">—</span>}
                    </td>

                    {/* SaaS Alerts */}
                    <td className="px-3 py-2.5">
                      {saasMap ? (
                        <div className="flex items-center gap-1.5">
                          <ConfidenceDot confidence={saasMap.confidence} confirmed={saasMap.is_confirmed} />
                          <span className="text-xs text-gray-700 truncate max-w-[100px]">{saasMap.external_name}</span>
                        </div>
                      ) : <span className="text-gray-300 text-sm">—</span>}
                    </td>

                    {/* Auvik */}
                    <td className="px-3 py-2.5">
                      {auvikMap ? (
                        <div className="flex items-center gap-1.5">
                          <ConfidenceDot confidence={auvikMap.confidence} confirmed={auvikMap.is_confirmed} />
                          <span className="text-xs text-gray-700 truncate max-w-[100px]">{auvikMap.external_name}</span>
                        </div>
                      ) : <span className="text-gray-300 text-sm">—</span>}
                    </td>

                    {/* Parent */}
                    <td className="px-3 py-2.5">
                      {client.parent_name
                        ? <span className="text-xs text-gray-600 flex items-center gap-1">
                            <Building2 size={11} className="text-gray-400 shrink-0" />
                            <span className="truncate max-w-[90px]">{client.parent_name}</span>
                          </span>
                        : <span className="text-gray-300 text-sm">—</span>}
                    </td>

                    {/* Autotask link */}
                    <td className="px-3 py-2.5 text-center">
                      {atUrl
                        ? <a href={atUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
                            <ExternalLink size={11} />
                          </a>
                        : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Edit — sticky right so it's always visible */}
                    <td className="px-2 py-2.5 text-right sticky right-0 bg-white group-hover:bg-gray-50/50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.04)] transition-colors">
                      <button
                        onClick={() => setEditClient(client)}
                        title="Edit client mapping"
                        className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-5 text-xs text-gray-500 rounded-b-xl">
          <span className="font-medium text-gray-600">Mapping status:</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Confirmed</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Auto-matched (high)</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Fuzzy match (review)</span>
        </div>
      </Card>

      {/* Edit Modal */}
      {editClient && (
        <EditModal
          client={editClient}
          allClients={clients}
          onSave={saveClient}
          onClose={handleModalClose}
        />
      )}
    </div>
  )
}

// ─── Standalone page wrapper ───────────────────────────────────────────────────

export default function ClientMapping() {
  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      <PageHeader title="Client Management" description="Sync, classification, parent relationships, and external system mappings" />
      <ClientMappingPanel />
    </div>
  )
}
