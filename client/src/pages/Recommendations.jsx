import { useEffect, useState, useMemo } from 'react'
import {
  Plus, Search, DollarSign, Cpu, X, ChevronRight,
  Layers, Ticket, Briefcase, Calendar, Users, Filter,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { api } from '../lib/api'
import RecEditModal from '../components/RecEditModal'

// ─── Priority config (LMX-style dots/bangs) ───────────────────────────────────
const PRIORITY = {
  critical: { label: 'Critical', bang: '!!!', bar: 'bg-red-500',    text: 'text-red-600',    pill: 'bg-red-50 text-red-700 border-red-200' },
  high:     { label: 'High',     bang: '!!',  bar: 'bg-orange-400', text: 'text-orange-600', pill: 'bg-orange-50 text-orange-700 border-orange-200' },
  medium:   { label: 'Medium',   bang: '!',   bar: 'bg-yellow-400', text: 'text-yellow-600', pill: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  low:      { label: 'Low',      bang: '·',   bar: 'bg-gray-300',   text: 'text-gray-400',   pill: 'bg-gray-50 text-gray-500 border-gray-200' },
}

const STATUS = {
  draft:       { label: 'Draft',       dot: 'bg-gray-400',   text: 'text-gray-500' },
  proposed:    { label: 'Proposed',    dot: 'bg-blue-400',   text: 'text-blue-600' },
  approved:    { label: 'Approved',    dot: 'bg-indigo-500', text: 'text-indigo-600' },
  in_progress: { label: 'In Progress', dot: 'bg-amber-400',  text: 'text-amber-600' },
  completed:   { label: 'Completed',   dot: 'bg-green-500',  text: 'text-green-600' },
  deferred:    { label: 'Deferred',    dot: 'bg-purple-400', text: 'text-purple-600' },
  declined:    { label: 'Declined',    dot: 'bg-red-400',    text: 'text-red-500' },
}

const TYPE_LABELS = {
  hardware: 'Hardware', software: 'Software', project: 'Project',
  upgrade: 'Upgrade', new_service: 'New Service', remediation: 'Remediation',
  compliance: 'Compliance', training: 'Training', process: 'Process',
}

const KIND_CONFIG = {
  initiative:     { label: 'Initiative',     cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  recommendation: { label: 'Recommendation', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
}

function fmt$(n) {
  if (!n || n == 0) return null
  return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

// ─── Quick-create modal (client + title only → open RecEditModal) ─────────────
function QuickCreateModal({ clients, onClose, onCreated }) {
  const [clientId, setClientId] = useState('')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('recommendation')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!clientId || !title.trim()) { setError('Client and title are required'); return }
    setSaving(true)
    try {
      const res = await api.post('/recommendations', {
        client_id: clientId,
        title: title.trim(),
        kind,
        status: 'draft',
        priority: 'medium',
        type: 'improvement',
      })
      onCreated(res.data.id)
    } catch (err) {
      setError('Failed to create')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Recommendation</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Type</label>
            <div className="flex gap-2">
              {[['recommendation','Recommendation'],['initiative','Initiative']].map(([v,l]) => (
                <button key={v} onClick={() => setKind(v)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${kind === v ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Client <span className="text-red-500">*</span></label>
            <select autoFocus value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
              <option value="">Select a client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Title <span className="text-red-500">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="e.g. Workstation Lifecycle Refresh 2025"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <p className="text-xs text-gray-400">You'll set priority, schedule, budget, and assets in the editor.</p>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={submit} disabled={saving || !clientId || !title.trim()}
            className="px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create & Open'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Single recommendation row ────────────────────────────────────────────────
function RecRow({ rec, onClick }) {
  const p = PRIORITY[rec.priority] || PRIORITY.medium
  const s = STATUS[rec.status] || STATUS.draft
  const budget = parseFloat(rec.budget_one_time) > 0 ? rec.budget_one_time : rec.estimated_budget
  const schedStr = rec.schedule_year
    ? `${rec.schedule_year}${rec.schedule_quarter ? ` Q${rec.schedule_quarter}` : ''}`
    : rec.schedule_quarter ? `Q${rec.schedule_quarter}` : null

  return (
    <div onClick={onClick}
      className="group flex items-center gap-0 bg-white border border-gray-100 rounded-xl overflow-hidden hover:border-primary-200 hover:shadow-sm transition-all cursor-pointer">

      {/* Priority bar */}
      <div className={`w-1 self-stretch shrink-0 ${p.bar}`} />

      <div className="flex items-center gap-4 px-4 py-3.5 flex-1 min-w-0">
        {/* Priority bang */}
        <span className={`text-sm font-black w-6 text-center shrink-0 ${p.text}`}>{p.bang}</span>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{rec.title}</h3>
            {(() => { const k = KIND_CONFIG[rec.kind || 'recommendation']; return (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${k.cls}`}>{k.label}</span>
            )})()}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">{rec.client_name}</span>
            {rec.type && (
              <span className="text-xs text-gray-400">{TYPE_LABELS[rec.type] || rec.type}</span>
            )}
            {rec.at_ticket_number && (
              <span className="inline-flex items-center gap-1 text-xs text-indigo-500">
                <Ticket size={10} /> #{rec.at_ticket_number}
              </span>
            )}
            {rec.at_opportunity_number && (
              <span className="inline-flex items-center gap-1 text-xs text-purple-500">
                <Briefcase size={10} /> #{rec.at_opportunity_number}
              </span>
            )}
          </div>
        </div>

        {/* Right meta */}
        <div className="flex items-center gap-5 shrink-0">
          {/* Status */}
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
          </span>

          {/* Schedule */}
          {schedStr && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-400 font-medium min-w-16">
              <Calendar size={11} /> {schedStr}
            </span>
          )}

          {/* Assets */}
          {rec.asset_count > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-400 min-w-12">
              <Cpu size={11} /> {rec.asset_count}
            </span>
          )}

          {/* Budget */}
          <span className="text-sm font-semibold text-gray-700 min-w-20 text-right">
            {fmt$(budget) || <span className="text-gray-300 font-normal text-xs">—</span>}
          </span>

          <ChevronRight size={15} className="text-gray-300 group-hover:text-primary-400 transition-colors" />
        </div>
      </div>
    </div>
  )
}

// ─── Client group header ──────────────────────────────────────────────────────
function ClientGroup({ clientName, recs, onRecClick }) {
  const [collapsed, setCollapsed] = useState(false)
  const groupBudget = recs.reduce((s, r) => s + (parseFloat(r.budget_one_time) || parseFloat(r.estimated_budget) || 0), 0)
  return (
    <div className="mb-5">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between mb-2 px-1 group/header"
      >
        <div className="flex items-center gap-2">
          <span className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}>▾</span>
          <span className="text-sm font-semibold text-gray-800">{clientName}</span>
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{recs.length}</span>
        </div>
        {groupBudget > 0 && (
          <span className="text-xs font-semibold text-gray-500">{fmt$(groupBudget)}</span>
        )}
      </button>
      {!collapsed && (
        <div className="space-y-1.5 pl-6">
          {recs.map(rec => (
            <RecRow key={rec.id} rec={rec} onClick={() => onRecClick(rec.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Recommendations() {
  const [recs, setRecs]       = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filterClient, setFilterClient]   = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterKind, setFilterKind]         = useState('')
  const [groupBy, setGroupBy] = useState('client') // 'client' | 'status' | 'none'
  const [showCreate, setShowCreate] = useState(false)
  const [editRecId, setEditRecId] = useState(null)

  function load() {
    Promise.all([
      api.get('/recommendations'),
      api.get('/clients'),
    ]).then(([rRes, cRes]) => {
      setRecs(rRes.data || [])
      setClients(cRes.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => recs.filter(r => {
    if (filterClient && r.client_id !== filterClient) return false
    if (filterStatus && r.status !== filterStatus) return false
    if (filterPriority && r.priority !== filterPriority) return false
    if (filterKind && (r.kind || 'recommendation') !== filterKind) return false
    if (search) {
      const q = search.toLowerCase()
      if (!r.title.toLowerCase().includes(q) && !r.client_name?.toLowerCase().includes(q) &&
          !r.description?.toLowerCase().includes(q)) return false
    }
    return true
  }), [recs, filterClient, filterStatus, filterPriority, search])

  // Budget rollup
  const totalBudget = useMemo(() =>
    filtered.reduce((s, r) => s + (parseFloat(r.budget_one_time) || parseFloat(r.estimated_budget) || 0), 0),
    [filtered])

  // Status summary counts
  const statusCounts = useMemo(() => {
    const counts = {}
    for (const r of filtered) counts[r.status] = (counts[r.status] || 0) + 1
    return counts
  }, [filtered])

  // Group the filtered list
  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: 'All', recs: filtered }]
    if (groupBy === 'status') {
      return Object.entries(STATUS)
        .map(([key, cfg]) => ({ key, label: cfg.label, recs: filtered.filter(r => r.status === key) }))
        .filter(g => g.recs.length > 0)
    }
    // group by client
    const map = {}
    for (const r of filtered) {
      if (!map[r.client_name]) map[r.client_name] = []
      map[r.client_name].push(r)
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, recs]) => ({ key: name, label: name, recs }))
  }, [filtered, groupBy])

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mr-3" />
      Loading...
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Recommendations"
        description={`${recs.length} total${totalBudget > 0 ? ' · ' + fmt$(totalBudget) + ' estimated' : ''}`}
        actions={
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
            <Plus size={16} /> New Recommendation
          </button>
        }
      />

      {/* ── Status summary chips ──────────────────────────────────────────── */}
      {Object.keys(statusCounts).length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {Object.entries(STATUS).map(([key, cfg]) => {
            const count = statusCounts[key]
            if (!count) return null
            return (
              <button key={key} onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  filterStatus === key
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label} <span className="opacity-60">{count}</span>
              </button>
            )
          })}
          {Object.keys(statusCounts).length > 1 && filterStatus && (
            <button onClick={() => setFilterStatus('')}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5">
              Clear
            </button>
          )}
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search recommendations..."
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
        </div>

        {clients.length > 1 && (
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white min-w-40">
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white">
          <option value="">All Priorities</option>
          {Object.entries(PRIORITY).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
        </select>

        {/* Kind filter */}
        <div className="flex items-center gap-1">
          {Object.entries(KIND_CONFIG).map(([v, k]) => (
            <button key={v} onClick={() => setFilterKind(filterKind === v ? '' : v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                filterKind === v ? k.cls + ' font-semibold' : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
              }`}>
              {k.label}
            </button>
          ))}
        </div>

        {/* Group by toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 ml-auto">
          <span className="text-xs text-gray-400 px-2 flex items-center gap-1"><Filter size={11}/> Group</span>
          {[
            { key: 'client', label: 'Client' },
            { key: 'status', label: 'Status' },
            { key: 'none',   label: 'None' },
          ].map(g => (
            <button key={g.key} onClick={() => setGroupBy(g.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                groupBy === g.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── List ─────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl py-20 text-center">
          <Layers size={40} className="mx-auto mb-3 text-gray-200" />
          <p className="text-base font-medium text-gray-500">No recommendations found</p>
          <p className="text-sm text-gray-400 mt-1">
            {recs.length > 0 ? 'Try adjusting your filters.' : 'Create your first recommendation to get started.'}
          </p>
          {recs.length === 0 && (
            <button onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
              <Plus size={15} /> New Recommendation
            </button>
          )}
        </div>
      ) : groupBy === 'none' ? (
        <div className="space-y-1.5">
          {filtered.map(rec => (
            <RecRow key={rec.id} rec={rec} onClick={() => setEditRecId(rec.id)} />
          ))}
        </div>
      ) : groupBy === 'status' ? (
        <div>
          {grouped.map(g => (
            <div key={g.key} className="mb-5">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className={`w-2 h-2 rounded-full ${STATUS[g.key]?.dot || 'bg-gray-400'}`} />
                <span className="text-sm font-semibold text-gray-700">{g.label}</span>
                <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{g.recs.length}</span>
              </div>
              <div className="space-y-1.5 pl-5">
                {g.recs.map(rec => (
                  <RecRow key={rec.id} rec={rec} onClick={() => setEditRecId(rec.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Group by client
        grouped.map(g => (
          <ClientGroup
            key={g.key}
            clientName={g.label}
            recs={g.recs}
            onRecClick={id => setEditRecId(id)}
          />
        ))
      )}

      {showCreate && (
        <QuickCreateModal
          clients={clients}
          onClose={() => setShowCreate(false)}
          onCreated={id => { setShowCreate(false); setEditRecId(id) }}
        />
      )}

      {editRecId && (
        <RecEditModal
          recId={editRecId}
          onClose={() => setEditRecId(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
