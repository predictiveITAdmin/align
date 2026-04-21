import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronDown, Trash2, Plus, X, ExternalLink, Ticket, Briefcase,
  FileText, DollarSign, Cpu, Search, Check, AlertCircle, Loader2,
  Link2, Link, RefreshCw,
} from 'lucide-react'
import { api } from '../lib/api'

// ─── Priority config ──────────────────────────────────────────────────────────
const PRIORITY_CONFIG = [
  { value: 'low',      label: '·',   title: 'Low',      activeClass: 'bg-gray-400 text-white',    inactiveClass: 'bg-gray-100 text-gray-400 hover:bg-gray-200' },
  { value: 'medium',   label: '!',   title: 'Medium',   activeClass: 'bg-yellow-400 text-white',  inactiveClass: 'bg-gray-100 text-gray-400 hover:bg-gray-200' },
  { value: 'high',     label: '!!',  title: 'High',     activeClass: 'bg-orange-500 text-white',  inactiveClass: 'bg-gray-100 text-gray-400 hover:bg-gray-200' },
  { value: 'critical', label: '!!!', title: 'Critical', activeClass: 'bg-red-600 text-white',     inactiveClass: 'bg-gray-100 text-gray-400 hover:bg-gray-200' },
]

const STATUS_OPTIONS = [
  { value: 'draft',       label: 'Draft' },
  { value: 'proposed',    label: 'Proposed' },
  { value: 'approved',    label: 'Approved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'deferred',    label: 'Deferred' },
  { value: 'declined',    label: 'Declined' },
]

const TYPE_OPTIONS = [
  { value: 'hardware',    label: 'Hardware' },
  { value: 'software',    label: 'Software' },
  { value: 'project',     label: 'Project' },
  { value: 'upgrade',     label: 'Upgrade' },
  { value: 'new_service', label: 'New Service' },
  { value: 'remediation', label: 'Remediation' },
  { value: 'compliance',  label: 'Compliance' },
  { value: 'training',    label: 'Training' },
  { value: 'process',     label: 'Process' },
]

const QUARTERS = [1, 2, 3, 4]
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3]

// ─── AutoSave hook ────────────────────────────────────────────────────────────
function useAutoSave(recId, field, value, delay = 800) {
  const timer = useRef(null)
  const initial = useRef(true)
  useEffect(() => {
    if (initial.current) { initial.current = false; return }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      api.patch(`/recommendations/${recId}`, { [field]: value }).catch(console.error)
    }, delay)
    return () => clearTimeout(timer.current)
  }, [value]) // eslint-disable-line
}

// ─── Budget Section ───────────────────────────────────────────────────────────
function BudgetSection({ recId, items, assetCount, onItemsChange }) {
  const [adding, setAdding] = useState(null) // 'one_time' | 'recurring_monthly' | 'recurring_annual'
  const [newDesc, setNewDesc] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newBillingType, setNewBillingType] = useState('fixed')
  const [saving, setSaving] = useState(false)

  const oneTime = items.filter(i => i.fee_type === 'one_time')
  const recurring = items.filter(i => i.fee_type !== 'one_time')

  function calcTotal(list) {
    return list.reduce((sum, i) => {
      const amt = parseFloat(i.amount) || 0
      return sum + (i.billing_type === 'per_asset' ? amt * (assetCount || 0) : amt)
    }, 0)
  }

  const totalOneTime = calcTotal(oneTime)
  const totalMonthly = calcTotal(recurring.filter(i => i.fee_type === 'recurring_monthly'))
  const totalAnnual  = calcTotal(recurring.filter(i => i.fee_type === 'recurring_annual'))

  async function addItem(feeType) {
    if (!newDesc.trim()) return
    setSaving(true)
    try {
      const res = await api.post(`/recommendations/${recId}/budget-items`, {
        description: newDesc.trim(),
        amount: parseFloat(newAmount) || 0,
        billing_type: newBillingType,
        fee_type: feeType,
      })
      onItemsChange(prev => [...prev, res.data])
      setNewDesc(''); setNewAmount(''); setNewBillingType('fixed'); setAdding(null)
    } catch (err) { console.error(err) } finally { setSaving(false) }
  }

  async function updateItem(id, field, value) {
    try {
      const res = await api.patch(`/recommendations/${recId}/budget-items/${id}`, { [field]: value })
      onItemsChange(prev => prev.map(i => i.id === id ? res.data : i))
    } catch (err) { console.error(err) }
  }

  async function deleteItem(id) {
    try {
      await api.delete(`/recommendations/${recId}/budget-items/${id}`)
      onItemsChange(prev => prev.filter(i => i.id !== id))
    } catch (err) { console.error(err) }
  }

  function BudgetItemRow({ item }) {
    const [desc, setDesc] = useState(item.description)
    const [amount, setAmount] = useState(item.amount)
    const descTimer = useRef(null)
    const amtTimer = useRef(null)

    return (
      <div className="flex items-center gap-3 py-1.5 group">
        <button onClick={() => deleteItem(item.id)}
          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <X size={14} />
        </button>
        <input value={desc}
          onChange={e => {
            setDesc(e.target.value)
            clearTimeout(descTimer.current)
            descTimer.current = setTimeout(() => updateItem(item.id, 'description', e.target.value), 600)
          }}
          className="flex-1 text-sm bg-transparent border-b border-transparent hover:border-gray-200 focus:border-primary-400 focus:outline-none px-1 py-0.5 text-gray-800"
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">$</span>
          <input type="number" value={amount}
            onChange={e => {
              setAmount(e.target.value)
              clearTimeout(amtTimer.current)
              amtTimer.current = setTimeout(() => updateItem(item.id, 'amount', parseFloat(e.target.value) || 0), 600)
            }}
            className="w-28 text-sm text-right bg-transparent border-b border-transparent hover:border-gray-200 focus:border-primary-400 focus:outline-none px-1 py-0.5"
          />
        </div>
        <select value={item.billing_type}
          onChange={e => updateItem(item.id, 'billing_type', e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600 focus:outline-none shrink-0">
          <option value="fixed">Fixed</option>
          <option value="per_asset">Per asset</option>
        </select>
        {item.billing_type === 'per_asset' && assetCount > 0 && (
          <span className="text-xs text-gray-400 shrink-0">=&nbsp;${((parseFloat(amount)||0) * assetCount).toLocaleString()}</span>
        )}
      </div>
    )
  }

  function AddRow({ feeType }) {
    if (adding !== feeType) return (
      <button onClick={() => setAdding(feeType)}
        className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 mt-2 ml-6">
        <Plus size={13} /> Add
      </button>
    )
    return (
      <div className="flex items-center gap-2 mt-2 ml-6">
        <input autoFocus value={newDesc} onChange={e => setNewDesc(e.target.value)}
          placeholder="Description..." onKeyDown={e => e.key === 'Enter' && addItem(feeType)}
          className="flex-1 text-sm border-b border-primary-300 focus:outline-none px-1 py-0.5" />
        <span className="text-xs text-gray-400">$</span>
        <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)}
          placeholder="0" className="w-24 text-sm text-right border-b border-gray-300 focus:outline-none px-1 py-0.5" />
        <select value={newBillingType} onChange={e => setNewBillingType(e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none">
          <option value="fixed">Fixed</option>
          <option value="per_asset">Per asset</option>
        </select>
        <button onClick={() => addItem(feeType)} disabled={saving || !newDesc.trim()}
          className="px-3 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">
          {saving ? '...' : 'Add'}
        </button>
        <button onClick={() => { setAdding(null); setNewDesc(''); setNewAmount('') }}
          className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Budget</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* One-time fees */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">One-time fees</h3>
            <button onClick={() => setAdding('one_time')}
              className="inline-flex items-center gap-1 text-xs bg-primary-600 text-white px-2.5 py-1 rounded-lg hover:bg-primary-700">
              <Plus size={12} /> Add
            </button>
          </div>
          {oneTime.length === 0 && adding !== 'one_time' && (
            <p className="text-xs text-gray-400 italic">No one-time fees yet.</p>
          )}
          {oneTime.map(i => <BudgetItemRow key={i.id} item={i} />)}
          {adding === 'one_time' && <AddRow feeType="one_time" />}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex justify-between text-sm font-semibold text-gray-800">
              <span>Total one-time fee</span>
              <span>${totalOneTime.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {assetCount > 0 && <p className="text-xs text-gray-400 mt-0.5">{assetCount} asset{assetCount !== 1 ? 's' : ''} linked</p>}
          </div>
        </div>

        {/* Recurring fees */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Recurring fees</h3>
            <div className="flex gap-1">
              <button onClick={() => setAdding('recurring_monthly')}
                className="inline-flex items-center gap-1 text-xs bg-primary-600 text-white px-2.5 py-1 rounded-lg hover:bg-primary-700">
                <Plus size={12} /> Monthly
              </button>
              <button onClick={() => setAdding('recurring_annual')}
                className="inline-flex items-center gap-1 text-xs bg-primary-600 text-white px-2.5 py-1 rounded-lg hover:bg-primary-700">
                <Plus size={12} /> Annual
              </button>
            </div>
          </div>
          {recurring.length === 0 && adding !== 'recurring_monthly' && adding !== 'recurring_annual' && (
            <p className="text-xs text-gray-400 italic">No recurring fees yet.</p>
          )}
          {recurring.map(i => <BudgetItemRow key={i.id} item={i} />)}
          {(adding === 'recurring_monthly' || adding === 'recurring_annual') && <AddRow feeType={adding} />}
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
            <div className="flex justify-between text-sm text-gray-700">
              <span>Monthly fee</span>
              <span className="font-medium">${totalMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-700">
              <span>Annual fee</span>
              <span className="font-medium">${totalAnnual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Asset Picker Modal ───────────────────────────────────────────────────────
function AssetPickerModal({ recId, existingIds, clientId, onAdd, onClose }) {
  const [search, setSearch] = useState('')
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [warrantyFilter, setWarrantyFilter] = useState('all')
  const [pickerSortCol, setPickerSortCol] = useState('name')
  const [pickerSortDir, setPickerSortDir] = useState('asc')

  function togglePickerSort(col) {
    if (pickerSortCol === col) {
      setPickerSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setPickerSortCol(col)
      setPickerSortDir('asc')
    }
  }

  useEffect(() => {
    const url = clientId ? `/assets?client_id=${clientId}&limit=2000` : '/assets?limit=5000'
    api.get(url).then(r => setAssets((r.data || []).filter(a => !existingIds.has(a.id))))
      .catch(console.error).finally(() => setLoading(false))
  }, [clientId])

  // Derive type list from loaded assets
  const typeOptions = useMemo(() => {
    const types = [...new Set(assets.map(a => a.asset_type_name || 'Other').filter(Boolean))].sort()
    return types
  }, [assets])

  const now = new Date()
  const soon90d = new Date(now.getTime() + 90 * 86400000)

  const filtered = assets.filter(a => {
    if (search) {
      const q = search.toLowerCase()
      if (!a.name?.toLowerCase().includes(q) &&
          !a.serial_number?.toLowerCase().includes(q) &&
          !a.model?.toLowerCase().includes(q) &&
          !a.manufacturer?.toLowerCase().includes(q) &&
          !a.hostname?.toLowerCase().includes(q) &&
          !a.last_user?.toLowerCase().includes(q)) return false
    }
    if (typeFilter !== 'all' && (a.asset_type_name || 'Other') !== typeFilter) return false
    if (warrantyFilter !== 'all') {
      const exp = a.warranty_expiry ? new Date(a.warranty_expiry) : null
      if (warrantyFilter === 'active'   && !(exp && exp >= now)) return false
      if (warrantyFilter === 'expiring' && !(exp && exp >= now && exp <= soon90d)) return false
      if (warrantyFilter === 'expired'  && !(exp && exp < now)) return false
      if (warrantyFilter === 'unknown'  && exp != null) return false
    }
    return true
  })

  const sortedFiltered = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let aVal, bVal
      switch (pickerSortCol) {
        case 'name':    aVal = a.name || ''; bVal = b.name || ''; break
        case 'type':    aVal = a.asset_type_name || ''; bVal = b.asset_type_name || ''; break
        case 'user':    aVal = a.last_user || ''; bVal = b.last_user || ''; break
        case 'warranty': aVal = a.warranty_expiry || ''; bVal = b.warranty_expiry || ''; break
        default:        aVal = ''; bVal = ''
      }
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (aVal < bVal) return pickerSortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return pickerSortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [filtered, pickerSortCol, pickerSortDir])

  // Counts for filter badges
  const warrantyCounts = useMemo(() => {
    let active = 0, expiring = 0, expired = 0, unknown = 0
    for (const a of assets) {
      const exp = a.warranty_expiry ? new Date(a.warranty_expiry) : null
      if (!exp) { unknown++; continue }
      if (exp < now) { expired++; continue }
      if (exp <= soon90d) { expiring++; active++ } else { active++ }
    }
    return { active, expiring, expired, unknown }
  }, [assets])

  function toggleAll() {
    if (filtered.every(a => selected.has(a.id))) {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(a => n.delete(a.id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(a => n.add(a.id)); return n })
    }
  }

  async function handleAdd() {
    if (!selected.size) return
    setSaving(true)
    try {
      await api.post(`/recommendations/${recId}/assets/bulk`, { asset_ids: Array.from(selected) })
      onAdd(Array.from(selected))
      onClose()
    } catch (err) { console.error(err) } finally { setSaving(false) }
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every(a => selected.has(a.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Add Assets</h3>
            <p className="text-xs text-gray-400 mt-0.5">{assets.length} available · {selected.size} selected</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-gray-100 space-y-2.5">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, serial, model, user…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter chips row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Type filter */}
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white text-gray-700">
              <option value="all">All Types</option>
              {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            {/* Warranty filter */}
            <select value={warrantyFilter} onChange={e => setWarrantyFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white text-gray-700">
              <option value="all">All Warranty</option>
              <option value="active">Active ({warrantyCounts.active})</option>
              <option value="expiring">Expiring Soon ({warrantyCounts.expiring})</option>
              <option value="expired">Expired ({warrantyCounts.expired})</option>
              <option value="unknown">Unknown ({warrantyCounts.unknown})</option>
            </select>

            {(typeFilter !== 'all' || warrantyFilter !== 'all' || search) && (
              <button onClick={() => { setTypeFilter('all'); setWarrantyFilter('all'); setSearch('') }}
                className="text-xs text-gray-500 hover:text-gray-700 underline">
                Clear filters
              </button>
            )}

            <span className="ml-auto text-xs text-gray-400">{filtered.length} matching</span>
          </div>
        </div>

        {/* Asset list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Loading assets…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No assets match your filters</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="w-10 px-3 py-2 text-center">
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll}
                      className="rounded border-gray-300 text-primary-600" />
                  </th>
                  {[
                    { key: 'name', label: 'Device' },
                    { key: 'type', label: 'Type' },
                    { key: 'user', label: 'User' },
                    { key: 'warranty', label: 'Warranty' },
                  ].map(col => (
                    <th key={col.key}
                      onClick={() => togglePickerSort(col.key)}
                      className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700">
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {pickerSortCol === col.key && (
                          <ChevronDown size={12} className={`transition-transform ${pickerSortDir === 'asc' ? 'rotate-180' : ''}`} />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedFiltered.map(a => {
                  const exp = a.warranty_expiry ? new Date(a.warranty_expiry) : null
                  const expStr = exp ? exp.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null
                  const expColor = !exp ? 'text-gray-400' : exp < now ? 'text-red-600' : exp <= soon90d ? 'text-amber-600' : 'text-green-600'
                  return (
                    <tr key={a.id}
                      onClick={() => setSelected(prev => { const n = new Set(prev); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n })}
                      className={`cursor-pointer transition-colors ${selected.has(a.id) ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(a.id)}
                          onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(a.id) : n.delete(a.id); return n })}
                          className="rounded border-gray-300 text-primary-600" />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-gray-900 truncate max-w-[200px]">{a.name}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[200px]">{[a.manufacturer, a.model].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-gray-500">{a.asset_type_name || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-gray-500">{a.last_user || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium ${expColor}`}>{expStr || 'Unknown'}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <span className="text-sm text-gray-500">
            {selected.size > 0 ? `${selected.size} asset${selected.size !== 1 ? 's' : ''} selected` : 'Select assets to add'}
          </span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button onClick={handleAdd} disabled={!selected.size || saving}
              className="px-5 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium">
              {saving ? 'Adding…' : `Add ${selected.size || ''} Asset${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AT Ticket Modal ──────────────────────────────────────────────────────────
function CreateTicketModal({ rec, onClose, onSave }) {
  const [picklists, setPicklists] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: `Lifecycle Initiative: ${rec.title || ''}`,
    description: `${rec.description || ''}\n\nEstimated Investment: $${rec.estimated_budget || '0.00'}\n\nInitiative created from predictiveIT Align`,
    status: '',
    ticketType: '',
    priority: '',
    queueId: '',
    issueType: '',
    subIssueType: '',
    categoryId: '',
    billingCodeId: '',
    dueDate: '',
  })

  useEffect(() => {
    api.get('/recommendations/at-picklists/tickets')
      .then(r => {
        setPicklists(r.data)
        // Set defaults
        const statusDefault = r.data.statuses?.find(s => s.label === 'New')?.value || r.data.statuses?.[0]?.value || ''
        const typeDefault   = r.data.types?.find(t => t.label?.toLowerCase().includes('change'))?.value || r.data.types?.[0]?.value || ''
        const priorityDefault = r.data.priorities?.find(p => p.label === 'Medium')?.value || r.data.priorities?.[1]?.value || ''
        setForm(f => ({ ...f, status: statusDefault, ticketType: typeDefault, priority: priorityDefault }))
      })
      .catch(() => setPicklists({}))
      .finally(() => setLoading(false))
  }, [])

  async function submit() {
    setSaving(true); setError('')
    try {
      const res = await api.post(`/recommendations/${rec.id}/at-ticket`, {
        ...form,
        status: form.status ? parseInt(form.status) : undefined,
        ticketType: form.ticketType ? parseInt(form.ticketType) : undefined,
        priority: form.priority ? parseInt(form.priority) : undefined,
        queueId: form.queueId ? parseInt(form.queueId) : undefined,
        issueType: form.issueType ? parseInt(form.issueType) : undefined,
        subIssueType: form.subIssueType ? parseInt(form.subIssueType) : undefined,
        categoryId: form.categoryId ? parseInt(form.categoryId) : undefined,
        billingCodeId: form.billingCodeId ? parseInt(form.billingCodeId) : undefined,
      })
      onSave(res.data)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create ticket')
    } finally { setSaving(false) }
  }

  const f = (name, value) => setForm(p => ({ ...p, [name]: value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Ticket size={16} /> Create PSA Ticket</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-10 text-gray-400">
            <Loader2 size={24} className="animate-spin mr-2" /> Loading Autotask fields...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title <span className="text-red-500">*</span></label>
              <textarea value={form.title} onChange={e => f('title', e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              <p className="text-xs text-gray-400 text-right mt-0.5">{form.title.length}/255</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {picklists?.statuses?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ticket Status</label>
                  <select value={form.status} onChange={e => f('status', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              )}
              {picklists?.types?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ticket Type</label>
                  <select value={form.ticketType} onChange={e => f('ticketType', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              )}
              {picklists?.priorities?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                  <select value={form.priority} onChange={e => f('priority', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              )}
              {picklists?.queues?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Queue</label>
                  <select value={form.queueId} onChange={e => f('queueId', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.queues.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                  </select>
                </div>
              )}
              {picklists?.issueTypes?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Issue Type</label>
                  <select value={form.issueType} onChange={e => f('issueType', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.issueTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              )}
              {picklists?.subIssueTypes?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sub Issue Type</label>
                  <select value={form.subIssueType} onChange={e => f('subIssueType', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.subIssueTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              )}
              {picklists?.categories?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ticket Category</label>
                  <select value={form.categoryId} onChange={e => f('categoryId', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              )}
              {picklists?.billingCodes?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Billing Code</label>
                  <select value={form.billingCodeId} onChange={e => f('billingCodeId', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.billingCodes.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => f('dueDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
              </div>
            </div>
            {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle size={14} />{error}</p>}
          </div>
        )}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={submit} disabled={saving || loading || !form.title}
            className="px-5 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Ticket size={14} />}
            {saving ? 'Creating...' : 'Create Ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Link Ticket Modal ────────────────────────────────────────────────────────
function LinkTicketModal({ recId, onClose, onSave }) {
  const [ticketNum, setTicketNum] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!ticketNum.trim()) return
    setSaving(true); setError('')
    try {
      const res = await api.patch(`/recommendations/${recId}/at-ticket`, {
        at_ticket_number: parseInt(ticketNum),
        at_ticket_title: `Ticket #${ticketNum}`,
      })
      onSave(res.data); onClose()
    } catch (err) { setError('Failed to link ticket') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">Link Existing Ticket</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="px-5 py-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Autotask Ticket Number</label>
          <input autoFocus type="number" value={ticketNum} onChange={e => setTicketNum(e.target.value)}
            placeholder="e.g. 12345" onKeyDown={e => e.key === 'Enter' && submit()}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button onClick={submit} disabled={!ticketNum || saving}
            className="px-5 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'Linking...' : 'Link Ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Opportunity Modal ─────────────────────────────────────────────────
function CreateOpportunityModal({ rec, onClose, onSave }) {
  const [picklists, setPicklists] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: rec.title || '',
    description: rec.description || '',
    status: '', stage: '', categoryId: '', rating: '', source: '',
    probability: '50',
    totalRevenue: rec.estimated_budget || '0',
    cost: '0', onetimeRevenue: '0', monthlyRevenue: '0', yearlyRevenue: '0',
    estimatedCloseDate: rec.target_date ? rec.target_date.split('T')[0] : '',
    startDate: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    api.get('/recommendations/at-picklists/opportunities')
      .then(r => {
        setPicklists(r.data)
        const st = r.data.statuses?.[0]?.value || ''
        const sg = r.data.stages?.[0]?.value || ''
        setForm(f => ({ ...f, status: st, stage: sg }))
      })
      .catch(() => setPicklists({}))
      .finally(() => setLoading(false))
  }, [])

  const f = (name, value) => setForm(p => ({ ...p, [name]: value }))

  async function submit() {
    setSaving(true); setError('')
    try {
      const res = await api.post(`/recommendations/${rec.id}/at-opportunity`, {
        ...form,
        status: form.status ? parseInt(form.status) : undefined,
        stage: form.stage ? parseInt(form.stage) : undefined,
        categoryId: form.categoryId ? parseInt(form.categoryId) : undefined,
        rating: form.rating ? parseInt(form.rating) : undefined,
        source: form.source ? parseInt(form.source) : undefined,
        probability: parseFloat(form.probability) || 50,
        totalRevenue: parseFloat(form.totalRevenue) || 0,
        cost: parseFloat(form.cost) || 0,
        onetimeRevenue: parseFloat(form.onetimeRevenue) || 0,
        monthlyRevenue: parseFloat(form.monthlyRevenue) || 0,
        yearlyRevenue: parseFloat(form.yearlyRevenue) || 0,
      })
      onSave(res.data); onClose()
    } catch (err) { setError(err.message || 'Failed to create opportunity') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Briefcase size={16} /> Create PSA Opportunity</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-10 text-gray-400">
            <Loader2 size={24} className="animate-spin mr-2" /> Loading...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={form.title} onChange={e => f('title', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {picklists?.statuses?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status *</label>
                  <select value={form.status} onChange={e => f('status', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    {picklists.statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              )}
              {picklists?.stages?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Stage *</label>
                  <select value={form.stage} onChange={e => f('stage', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    {picklists.stages.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              )}
              {picklists?.categories?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select value={form.categoryId} onChange={e => f('categoryId', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              )}
              {picklists?.ratings?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rating</label>
                  <select value={form.rating} onChange={e => f('rating', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.ratings.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              )}
              {picklists?.sources?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
                  <select value={form.source} onChange={e => f('source', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.sources.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
                <input type="date" value={form.startDate} onChange={e => f('startDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Expected Close Date *</label>
                <input type="date" value={form.estimatedCloseDate} onChange={e => f('estimatedCloseDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Probability (%)</label>
                <input type="number" min="0" max="100" value={form.probability} onChange={e => f('probability', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none resize-none" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-2">Financial Details</h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'totalRevenue', label: 'Total Revenue' },
                  { key: 'cost', label: 'Cost' },
                  { key: 'onetimeRevenue', label: 'One-time Rev' },
                  { key: 'monthlyRevenue', label: 'Monthly Rev' },
                  { key: 'yearlyRevenue', label: 'Yearly Rev' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-400">$</span>
                      <input type="number" value={form[key]} onChange={e => f(key, e.target.value)}
                        className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle size={14} />{error}</p>}
          </div>
        )}
        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button onClick={submit} disabled={saving || loading || !form.title}
            className="px-5 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Briefcase size={14} />}
            {saving ? 'Creating...' : 'Create Opportunity'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Link Opportunity Modal ───────────────────────────────────────────────────
function LinkOpportunityModal({ recId, onClose, onSave }) {
  const [oppNum, setOppNum] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!oppNum.trim()) return
    setSaving(true)
    try {
      const res = await api.patch(`/recommendations/${recId}/at-opportunity`, {
        at_opportunity_number: parseInt(oppNum),
        at_opportunity_title: `Opportunity #${oppNum}`,
      })
      onSave(res.data); onClose()
    } catch (err) { console.error(err) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">Link Existing Opportunity</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="px-5 py-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Autotask Opportunity Number</label>
          <input autoFocus type="number" value={oppNum} onChange={e => setOppNum(e.target.value)}
            placeholder="e.g. 9876" onKeyDown={e => e.key === 'Enter' && submit()}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button onClick={submit} disabled={!oppNum || saving}
            className="px-5 py-2 bg-primary-600 text-white text-sm rounded-lg disabled:opacity-50">
            {saving ? 'Linking...' : 'Link Opportunity'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main RecommendationDetail ────────────────────────────────────────────────
export default function RecommendationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [rec, setRec] = useState(null)
  const [loading, setLoading] = useState(true)
  const [assets, setAssets] = useState([])
  const [budgetItems, setBudgetItems] = useState([])
  const [modal, setModal] = useState(null) // 'create_ticket' | 'link_ticket' | 'create_opp' | 'link_opp' | 'add_assets' | 'confirm_delete' | 'opp_dropdown'
  const [saving, setSaving] = useState(false)
  const [assetSortCol, setAssetSortCol] = useState('name')
  const [assetSortDir, setAssetSortDir] = useState('asc')
  const oppDropdownRef = useRef(null)

  function toggleAssetSort(col) {
    if (assetSortCol === col) {
      setAssetSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setAssetSortCol(col)
      setAssetSortDir('asc')
    }
  }

  const sortedAssets = useMemo(() => {
    const arr = [...assets]
    arr.sort((a, b) => {
      let aVal, bVal
      switch (assetSortCol) {
        case 'name':         aVal = a.name || ''; bVal = b.name || ''; break
        case 'type':         aVal = a.asset_type || ''; bVal = b.asset_type || ''; break
        case 'manufacturer': aVal = a.manufacturer || ''; bVal = b.manufacturer || ''; break
        case 'model':        aVal = a.model || ''; bVal = b.model || ''; break
        case 'purchase_date': aVal = a.purchase_date || ''; bVal = b.purchase_date || ''; break
        default:             aVal = ''; bVal = ''
      }
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (aVal < bVal) return assetSortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return assetSortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [assets, assetSortCol, assetSortDir])

  // Close opp dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (oppDropdownRef.current && !oppDropdownRef.current.contains(e.target)) {
        setModal(m => m === 'opp_dropdown' ? null : m)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    api.get(`/recommendations/${id}`)
      .then(r => {
        setRec(r.data)
        setAssets(r.data.assets || [])
        setBudgetItems(r.data.budget_items || [])
      })
      .catch(() => navigate('/recommendations'))
      .finally(() => setLoading(false))
  }, [id])

  // Auto-save title after typing stops
  const titleTimer = useRef(null)
  function handleTitleChange(val) {
    setRec(r => ({ ...r, title: val }))
    clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => {
      api.patch(`/recommendations/${id}`, { title: val }).catch(console.error)
    }, 800)
  }

  // Auto-save executive summary
  const summaryTimer = useRef(null)
  function handleSummaryChange(val) {
    setRec(r => ({ ...r, executive_summary: val }))
    clearTimeout(summaryTimer.current)
    summaryTimer.current = setTimeout(() => {
      api.patch(`/recommendations/${id}`, { executive_summary: val }).catch(console.error)
    }, 800)
  }

  async function patchRec(fields) {
    try {
      const res = await api.patch(`/recommendations/${id}`, fields)
      setRec(r => ({ ...r, ...res.data }))
    } catch (err) { console.error(err) }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await api.delete(`/recommendations/${id}`)
      navigate('/recommendations')
    } catch (err) { setSaving(false) }
  }

  async function unlinkTicket() {
    try {
      await api.delete(`/recommendations/${id}/at-ticket`)
      setRec(r => ({ ...r, at_ticket_id: null, at_ticket_number: null, at_ticket_title: null }))
    } catch (err) { console.error(err) }
  }

  async function unlinkOpportunity() {
    try {
      await api.delete(`/recommendations/${id}/at-opportunity`)
      setRec(r => ({ ...r, at_opportunity_id: null, at_opportunity_number: null, at_opportunity_title: null }))
    } catch (err) { console.error(err) }
  }

  async function removeAsset(assetId) {
    try {
      await api.delete(`/recommendations/${id}/assets/${assetId}`)
      setAssets(prev => prev.filter(a => a.id !== assetId))
    } catch (err) { console.error(err) }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>
  if (!rec) return null

  const hasTicket = rec.at_ticket_id || rec.at_ticket_number
  const hasOpportunity = rec.at_opportunity_id || rec.at_opportunity_number

  return (
    <div className="max-w-5xl mx-auto">
      {/* ── Top action bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate('/recommendations')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ChevronLeft size={16} /> Recommendations
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{rec.client_name}</span>
          <button onClick={() => setModal('confirm_delete')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {/* ── PSA Integration bar ────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* PSA Ticket */}
        <div className="border border-gray-200 rounded-xl p-3 bg-white">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Ticket size={12} /> PSA Ticket
          </p>
          {hasTicket ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary-700 truncate">
                  {rec.at_ticket_number ? `#${rec.at_ticket_number}` : 'Linked'}
                </p>
                {rec.at_ticket_title && <p className="text-xs text-gray-500 truncate">{rec.at_ticket_title}</p>}
              </div>
              <button onClick={unlinkTicket} title="Unlink" className="text-gray-300 hover:text-red-400"><X size={14} /></button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setModal('create_ticket')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary-700 rounded-lg hover:bg-primary-800 transition-colors">
                <Ticket size={12} /> Create PSA Ticket
              </button>
              <button onClick={() => setModal('link_ticket')} title="Link existing"
                className="px-2.5 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                <Link2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* PSA Opportunity */}
        <div className="border border-gray-200 rounded-xl p-3 bg-white relative">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Briefcase size={12} /> PSA Opportunity
          </p>
          {hasOpportunity ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary-700 truncate">
                  {rec.at_opportunity_number ? `#${rec.at_opportunity_number}` : 'Linked'}
                </p>
                {rec.at_opportunity_title && <p className="text-xs text-gray-500 truncate">{rec.at_opportunity_title}</p>}
              </div>
              <button onClick={unlinkOpportunity} title="Unlink" className="text-gray-300 hover:text-red-400"><X size={14} /></button>
            </div>
          ) : (
            <div ref={oppDropdownRef} className="relative">
              <button onClick={() => setModal(modal === 'opp_dropdown' ? null : 'opp_dropdown')}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary-700 rounded-lg hover:bg-primary-800">
                <Briefcase size={12} /> Link PSA Opportunity ▾
              </button>
              {modal === 'opp_dropdown' && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 w-full min-w-44 py-1">
                  <button onClick={() => setModal('create_opp')}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Plus size={14} /> New opportunity
                  </button>
                  <button onClick={() => setModal('link_opp')}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Link size={14} /> Link Opportunity
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quotes - future */}
        <div className="border border-gray-200 rounded-xl p-3 bg-white">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FileText size={12} /> Quotes
          </p>
          <button className="text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1">
            Link Quotes in Quoter <ExternalLink size={12} />
          </button>
        </div>
      </div>

      {/* ── Status / Priority / Schedule bar ──────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Status */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Status</p>
            <select value={rec.status || 'draft'} onChange={e => patchRec({ status: e.target.value })}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white">
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Priority */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Priority</p>
            <div className="flex items-center gap-1">
              {PRIORITY_CONFIG.map(p => (
                <button key={p.value} title={p.title}
                  onClick={() => patchRec({ priority: p.value })}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${rec.priority === p.value ? p.activeClass : p.inactiveClass}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Schedule</p>
            <div className="flex items-center gap-1.5">
              <select value={rec.schedule_year || ''}
                onChange={e => patchRec({ schedule_year: e.target.value ? parseInt(e.target.value) : null })}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white">
                <option value="">No Year</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {QUARTERS.map(q => (
                <button key={q} onClick={() => patchRec({ schedule_quarter: rec.schedule_quarter === q ? null : q })}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                    rec.schedule_quarter === q ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  Q{q}
                </button>
              ))}
            </div>
          </div>

          {/* Kind */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Record Type</p>
            <div className="flex gap-1">
              {[
                { value: 'initiative',     label: 'Initiative',     active: 'bg-blue-600 text-white border-blue-600' },
                { value: 'recommendation', label: 'Recommendation', active: 'bg-gray-700 text-white border-gray-700' },
              ].map(k => (
                <button key={k.value}
                  onClick={() => patchRec({ kind: k.value })}
                  className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    (rec.kind || 'recommendation') === k.value
                      ? k.active
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
                  }`}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {/* Type */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Category</p>
            <select value={rec.type || 'project'} onChange={e => patchRec({ type: e.target.value })}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white">
              {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Title ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 mb-4">
        <input
          value={rec.title || ''}
          onChange={e => handleTitleChange(e.target.value)}
          placeholder="Initiative title..."
          className="w-full text-lg font-semibold text-gray-900 border-none outline-none bg-transparent placeholder-gray-300"
        />
      </div>

      {/* ── Executive Summary ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Executive Summary</h2>
        <textarea
          value={rec.executive_summary || ''}
          onChange={e => handleSummaryChange(e.target.value)}
          placeholder="Write an executive summary for your client..."
          rows={4}
          className="w-full text-sm text-gray-700 border-none outline-none bg-transparent resize-none placeholder-gray-300 leading-relaxed"
        />
      </div>

      {/* ── Budget ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-5 mb-4">
        <BudgetSection
          recId={id}
          items={budgetItems}
          assetCount={assets.length}
          onItemsChange={setBudgetItems}
        />
      </div>

      {/* ── Assets ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Assets</h2>
          <button onClick={() => setModal('add_assets')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">
            <Plus size={14} /> Add assets...
          </button>
        </div>
        {assets.length === 0 ? (
          <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <Cpu size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No assets linked</p>
            <p className="text-xs mt-0.5">Add hardware assets to this recommendation</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {[
                    { key: 'name', label: 'Name & Serial' },
                    { key: 'type', label: 'Type' },
                    { key: 'manufacturer', label: 'Manufacturer' },
                    { key: 'model', label: 'Model' },
                    { key: 'purchase_date', label: 'Purchase Date' },
                  ].map(col => (
                    <th key={col.key}
                      onClick={() => toggleAssetSort(col.key)}
                      className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700">
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {assetSortCol === col.key && (
                          <ChevronDown size={12} className={`transition-transform ${assetSortDir === 'asc' ? 'rotate-180' : ''}`} />
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedAssets.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50 group">
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{a.name}</p>
                      {a.serial_number && <p className="text-xs text-gray-400">{a.serial_number}</p>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{a.asset_type}</td>
                    <td className="px-3 py-2 text-gray-600">{a.manufacturer || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{a.model || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {a.purchase_date ? new Date(a.purchase_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeAsset(a.id)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {modal === 'create_ticket' && (
        <CreateTicketModal rec={rec} onClose={() => setModal(null)}
          onSave={updated => setRec(r => ({ ...r, ...updated }))} />
      )}
      {modal === 'link_ticket' && (
        <LinkTicketModal recId={id} onClose={() => setModal(null)}
          onSave={updated => setRec(r => ({ ...r, ...updated }))} />
      )}
      {modal === 'create_opp' && (
        <CreateOpportunityModal rec={rec} onClose={() => setModal(null)}
          onSave={updated => setRec(r => ({ ...r, ...updated }))} />
      )}
      {modal === 'link_opp' && (
        <LinkOpportunityModal recId={id} onClose={() => setModal(null)}
          onSave={updated => setRec(r => ({ ...r, ...updated }))} />
      )}
      {modal === 'add_assets' && (
        <AssetPickerModal
          recId={id}
          existingIds={new Set(assets.map(a => a.id))}
          clientId={rec.client_id}
          onAdd={async (ids) => {
            const res = await api.get(`/recommendations/${id}`)
            setAssets(res.data.assets || [])
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'confirm_delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-2">Delete Recommendation?</h3>
            <p className="text-sm text-gray-600 mb-5">This will permanently delete the recommendation and all linked budget items. This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={handleDelete} disabled={saving}
                className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
