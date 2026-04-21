/**
 * Roadmap — Kanban view of Initiatives & Recommendations by fiscal quarter
 *
 * Features:
 *  - Drag cards between quarter columns to reschedule
 *  - Quick status update via dropdown on each card
 *  - Card info toggle: "View fees" shows budget line items, "View description" shows text
 *  - Filter by status, priority, client
 *  - "Not Scheduled" column toggle
 *  - Year navigation with arrows
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Plus, ChevronLeft, ChevronRight, ExternalLink, GripVertical,
  Loader2, RefreshCw, X,
} from 'lucide-react'
import { api } from '../lib/api'
import RecEditModal from '../components/RecEditModal'

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'draft',       label: 'Draft' },
  { value: 'proposed',    label: 'Proposed' },
  { value: 'approved',    label: 'Approved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'deferred',    label: 'Deferred' },
  { value: 'declined',    label: 'Declined' },
]

const STATUS_COLORS = {
  draft:       'text-gray-500',
  proposed:    'text-blue-600',
  approved:    'text-indigo-600',
  in_progress: 'text-amber-600',
  completed:   'text-green-600',
  deferred:    'text-purple-500',
  declined:    'text-red-400',
}

const PRIORITY_CONFIG = {
  critical: { bang: '!!!', bar: 'bg-red-500',    text: 'text-red-600' },
  high:     { bang: '!!',  bar: 'bg-orange-400', text: 'text-orange-500' },
  medium:   { bang: '!',   bar: 'bg-yellow-400', text: 'text-yellow-500' },
  low:      { bang: '·',   bar: 'bg-gray-200',   text: 'text-gray-400' },
}

const COLUMN_DEFS = [
  { key: 'not_scheduled', label: 'Not Scheduled', qNum: null,
    hdrCls: 'bg-gray-100 border-gray-200', labelCls: 'text-gray-700' },
  { key: 'q1', label: 'Q1', qNum: 1,
    hdrCls: 'bg-blue-50 border-blue-100', labelCls: 'text-blue-700' },
  { key: 'q2', label: 'Q2', qNum: 2,
    hdrCls: 'bg-violet-50 border-violet-100', labelCls: 'text-violet-700' },
  { key: 'q3', label: 'Q3', qNum: 3,
    hdrCls: 'bg-orange-50 border-orange-100', labelCls: 'text-orange-700' },
  { key: 'q4', label: 'Q4', qNum: 4,
    hdrCls: 'bg-green-50 border-green-100', labelCls: 'text-green-700' },
]

function fmt$(n) {
  if (!n || n == 0) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtK(n) {
  if (!n || n == 0) return '$0.00'
  return `$${Number(n).toFixed(2)}`
}

// ─── Quick-create modal ────────────────────────────────────────────────────────

function QuickCreateModal({ clients, defaultQuarter, defaultYear, onClose, onCreated }) {
  const [clientId, setClientId] = useState(clients[0]?.id || '')
  const [title,    setTitle]    = useState('')
  const [kind,     setKind]     = useState('initiative')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  async function submit() {
    if (!clientId || !title.trim()) { setError('Client and title are required'); return }
    setSaving(true)
    try {
      const res = await api.post('/recommendations', {
        client_id: clientId, title: title.trim(),
        kind, status: 'draft', priority: 'medium',
        schedule_year: defaultQuarter ? defaultYear : null,
        schedule_quarter: defaultQuarter,
      })
      onCreated(res.data.id)
      onClose()
    } catch { setError('Failed to create') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            New {defaultQuarter ? `Q${defaultQuarter} ${defaultYear}` : 'Unscheduled'} Item
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Record Type</label>
            <div className="flex gap-2">
              {[{ v: 'initiative', l: 'Initiative' }, { v: 'recommendation', l: 'Recommendation' }].map(k => (
                <button key={k.v} onClick={() => setKind(k.v)}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                    kind === k.v ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>{k.l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Client</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white">
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
              autoFocus placeholder="Initiative or recommendation title…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-60 flex items-center gap-1.5">
            {saving && <Loader2 size={13} className="animate-spin" />} Create & Edit
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({ rec, cardInfo, isDragging, onDragStart, onStatusChange, onCardClick }) {
  const p = PRIORITY_CONFIG[rec.priority] || PRIORITY_CONFIG.medium
  const lineItems = rec.budget_line_items || []
  const oneTime   = parseFloat(rec.budget_one_time)  || 0
  const recurring = parseFloat(rec.budget_recurring) || 0
  const hasEstimate = !lineItems.length && (parseFloat(rec.estimated_budget) || 0) > 0

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, rec)}
      className={`bg-white border rounded-xl mb-2.5 overflow-hidden select-none transition-all ${
        isDragging
          ? 'opacity-40 scale-95 border-primary-300'
          : 'border-gray-200 hover:border-primary-200 hover:shadow-sm cursor-grab active:cursor-grabbing'
      }`}
    >
      {/* Priority top bar */}
      <div className={`h-0.5 w-full ${p.bar}`} />

      <div className="p-3">
        {/* Title row */}
        <div className="flex items-start gap-1.5 mb-2.5">
          <GripVertical size={14} className="text-gray-300 mt-0.5 shrink-0 cursor-grab" />
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onCardClick(rec)}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                (rec.kind || 'recommendation') === 'initiative'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-gray-50 text-gray-500 border-gray-200'
              }`}>
                {(rec.kind || 'recommendation') === 'initiative' ? 'Initiative' : 'Rec'}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-900 leading-snug hover:text-primary-700 transition-colors">{rec.title}</p>
            {rec.client_name && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{rec.client_name}</p>
            )}
          </div>
        </div>

        {/* Status dropdown */}
        <select
          value={rec.status || 'draft'}
          onChange={e => { e.stopPropagation(); onStatusChange(rec.id, e.target.value) }}
          onClick={e => e.stopPropagation()}
          className={`w-full text-xs font-medium border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white mb-2.5 ${STATUS_COLORS[rec.status] || 'text-gray-500'}`}
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {/* Card body: fees OR description */}
        {cardInfo === 'fees' ? (
          <div className="text-xs border-t border-gray-100 pt-2.5">
            {lineItems.length > 0 ? (
              <>
                {lineItems.map((item, i) => (
                  <div key={i} className="flex justify-between mb-1">
                    <span className="text-primary-600 font-medium truncate mr-2">{item.description || '—'}</span>
                    <span className="text-gray-700 shrink-0">{fmt$(item.amount)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 mt-2 pt-2 space-y-0.5">
                  <div className="flex justify-between font-semibold text-gray-800">
                    <span>Total one-time fees:</span>
                    <span>{fmt$(oneTime)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Total recurring fees:</span>
                    <span className="text-primary-600">{fmt$(recurring)}/month</span>
                  </div>
                </div>
              </>
            ) : hasEstimate ? (
              <div className="flex justify-between text-gray-600">
                <span>Estimated budget:</span>
                <span className="font-medium">{fmt$(rec.estimated_budget)}</span>
              </div>
            ) : (
              <p className="text-gray-300 italic text-center py-1">No budget items</p>
            )}
          </div>
        ) : (
          <div className="text-xs border-t border-gray-100 pt-2.5 text-gray-600 leading-relaxed line-clamp-4">
            {rec.executive_summary || rec.description || <span className="text-gray-300 italic">No description</span>}
          </div>
        )}

        {/* Footer: priority + edit */}
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-50">
          <span className={`text-sm font-black ${p.text}`}>{p.bang}</span>
          <button
            onClick={e => { e.stopPropagation(); onCardClick(rec) }}
            title="Edit"
            className="text-gray-300 hover:text-primary-500 transition-colors"
          >
            <ExternalLink size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({ col, recs, year, curYear, curQuarter, cardInfo,
                         isDragOver, dragRec, onDragOver, onDrop, onDragLeave,
                         onAddClick, onDragStart, onStatusChange, onCardClick }) {
  const isCurrent = col.qNum === curQuarter && year === curYear
  const oneTime   = recs.reduce((s, r) => s + (parseFloat(r.budget_one_time) || parseFloat(r.estimated_budget) || 0), 0)
  const monthly   = recs.reduce((s, r) => s + (parseFloat(r.budget_recurring) || 0), 0)
  const annual    = monthly * 12

  return (
    <div
      className={`flex flex-col w-72 shrink-0 rounded-xl border transition-all ${
        isDragOver ? 'border-primary-400 ring-2 ring-primary-200 bg-primary-50/30' : 'border-transparent'
      }`}
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
    >
      {/* Column header */}
      <div className={`rounded-xl border px-3 py-2.5 mb-2 ${col.hdrCls}`}>
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-base font-bold ${col.labelCls}`}>{col.label}</span>
            {col.qNum && (
              <span className="text-sm text-gray-500 font-medium">{year}</span>
            )}
            {isCurrent && (
              <span className="text-[10px] font-bold bg-primary-600 text-white px-1.5 py-0.5 rounded-full ml-1">
                Current
              </span>
            )}
          </div>
          <button onClick={onAddClick}
            className={`w-6 h-6 rounded-full flex items-center justify-center ${col.labelCls} hover:bg-white/60 transition-colors`}>
            <Plus size={14} />
          </button>
        </div>
        <p className="text-xs text-gray-500 font-mono">
          {fmtK(oneTime)} | {fmtK(monthly)}/M | {fmtK(annual)}/Y
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{recs.length} item{recs.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Cards */}
      <div className="flex-1 min-h-32 px-0.5">
        {recs.map(rec => (
          <KanbanCard
            key={rec.id}
            rec={rec}
            cardInfo={cardInfo}
            isDragging={dragRec?.id === rec.id}
            onDragStart={onDragStart}
            onStatusChange={onStatusChange}
            onCardClick={onCardClick}
          />
        ))}
        {recs.length === 0 && !isDragOver && (
          <div className="text-center py-10 text-xs text-gray-300 select-none">
            No initiatives created.
          </div>
        )}
        {isDragOver && recs.every(r => r.id !== dragRec?.id) && (
          <div className="border-2 border-dashed border-primary-300 rounded-xl h-14 flex items-center justify-center text-xs text-primary-400 mb-2">
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Roadmap() {
  const curYear    = new Date().getFullYear()
  const curQuarter = Math.ceil((new Date().getMonth() + 1) / 3)

  const [year,          setYear]          = useState(curYear)
  const [recs,          setRecs]          = useState([])
  const [clients,       setClients]       = useState([])
  const [loading,       setLoading]       = useState(true)
  const [filterClient,  setFilterClient]  = useState('')
  const [filterStatus,  setFilterStatus]  = useState('')
  const [filterPriority,setFilterPriority]= useState('')
  const [cardInfo,      setCardInfo]      = useState('fees')   // 'fees' | 'description'
  const [showNotSched,  setShowNotSched]  = useState(true)
  const [dragRec,       setDragRec]       = useState(null)
  const [dragOver,      setDragOver]      = useState(null)     // column key
  const [updating,      setUpdating]      = useState(new Set())
  const [createFor,     setCreateFor]     = useState(null)     // { quarter, year } | null
  const [editRecId,     setEditRecId]     = useState(null)     // id of rec open in edit modal
  const dragRecRef = useRef(null)

  const loadData = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get(`/recommendations?year=${year}`),
      api.get('/clients'),
    ]).then(([rRes, cRes]) => {
      setRecs(rRes.data || [])
      setClients((cRes.data || []).sort((a, b) => a.name.localeCompare(b.name)))
    }).catch(console.error).finally(() => setLoading(false))
  }, [year])

  useEffect(() => { loadData() }, [loadData])

  // ── Filter + group ──────────────────────────────────────────────────────────
  const columns = useMemo(() => {
    let filtered = recs
    if (filterClient)   filtered = filtered.filter(r => r.client_id === filterClient)
    if (filterStatus)   filtered = filtered.filter(r => r.status === filterStatus)
    if (filterPriority) filtered = filtered.filter(r => r.priority === filterPriority)

    const cols = { not_scheduled: [], q1: [], q2: [], q3: [], q4: [] }
    for (const rec of filtered) {
      const key = !rec.schedule_quarter ? 'not_scheduled' : `q${rec.schedule_quarter}`
      cols[key] = cols[key] || []
      cols[key].push(rec)
    }
    return cols
  }, [recs, filterClient, filterStatus, filterPriority])

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
  function onDragStart(e, rec) {
    dragRecRef.current = rec
    setDragRec(rec)
    e.dataTransfer.effectAllowed = 'move'
  }

  async function onDrop(e, colKey) {
    e.preventDefault()
    const rec = dragRecRef.current
    setDragRec(null); setDragOver(null)
    if (!rec) return

    const newQ    = colKey === 'not_scheduled' ? null : parseInt(colKey.replace('q', ''))
    const newYear = newQ ? year : null
    if (rec.schedule_quarter === newQ && rec.schedule_year === newYear) return

    setUpdating(prev => new Set(prev).add(rec.id))
    // Optimistic update
    setRecs(prev => prev.map(r => r.id === rec.id
      ? { ...r, schedule_quarter: newQ, schedule_year: newYear }
      : r
    ))
    try {
      await api.patch(`/recommendations/${rec.id}`, {
        schedule_quarter: newQ,
        schedule_year: newYear,
      })
    } catch {
      // Revert on failure
      setRecs(prev => prev.map(r => r.id === rec.id
        ? { ...r, schedule_quarter: rec.schedule_quarter, schedule_year: rec.schedule_year }
        : r
      ))
    } finally {
      setUpdating(prev => { const n = new Set(prev); n.delete(rec.id); return n })
    }
  }

  async function onStatusChange(recId, newStatus) {
    setRecs(prev => prev.map(r => r.id === recId ? { ...r, status: newStatus } : r))
    try {
      await api.patch(`/recommendations/${recId}`, { status: newStatus })
    } catch (e) { console.error(e) }
  }

  const hasFilters = filterClient || filterStatus || filterPriority
  const visibleColumns = COLUMN_DEFS.filter(c => c.key !== 'not_scheduled' || showNotSched)

  return (
    <div className="flex flex-col h-full">
      {/* ── Top nav bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white">
        {/* Year navigation */}
        <button onClick={() => setYear(y => y - 1)}
          className="text-gray-400 hover:text-gray-700 transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear(curYear - 1)}
            className={`text-sm font-medium px-2 py-1 rounded-lg transition-colors ${
              year === curYear - 1 ? 'text-primary-600 bg-primary-50' : 'text-gray-500 hover:text-gray-700'
            }`}>
            Q1, {curYear - 1}
          </button>
          <button onClick={() => setYear(curYear)}
            className={`text-sm font-medium px-2 py-1 rounded-lg transition-colors ${
              year === curYear ? 'text-primary-600 bg-primary-50' : 'text-gray-500 hover:text-gray-700'
            }`}>
            Q1, {curYear}
          </button>
          <button onClick={() => setYear(curYear + 1)}
            className={`text-sm font-medium px-2 py-1 rounded-lg transition-colors ${
              year === curYear + 1 ? 'text-primary-600 bg-primary-50' : 'text-gray-500 hover:text-gray-700'
            }`}>
            Q1, {curYear + 1}
          </button>
        </div>
        <button onClick={() => setYear(y => y + 1)}
          className="text-gray-400 hover:text-gray-700 transition-colors">
          <ChevronRight size={16} />
        </button>
        <button onClick={() => setYear(curYear)}
          className="flex items-center gap-1.5 text-xs text-primary-600 font-medium border border-primary-200 bg-primary-50 px-2.5 py-1.5 rounded-lg hover:bg-primary-100 transition-colors ml-1">
          <Calendar size={12} /> Current quarter
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={loadData} disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 p-1.5 rounded-lg hover:bg-gray-100">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setCreateFor({ quarter: null, year })}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors">
            <Plus size={15} /> New Initiative
          </button>
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-2.5 border-b border-gray-100 bg-gray-50/50 flex-wrap">
        {/* Status */}
        <div>
          <label className="text-xs text-gray-400 block mb-0.5">Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 min-w-28">
            <option value="">All status</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Priority */}
        <div>
          <label className="text-xs text-gray-400 block mb-0.5">Priority</label>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 min-w-28">
            <option value="">All priority</option>
            {Object.entries(PRIORITY_CONFIG).map(([v, p]) => (
              <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Client */}
        {clients.length > 1 && (
          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Client</label>
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 min-w-36">
              <option value="">All clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Card info */}
        <div>
          <label className="text-xs text-gray-400 block mb-0.5">Card info</label>
          <select value={cardInfo} onChange={e => setCardInfo(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 min-w-32">
            <option value="fees">View fees</option>
            <option value="description">View description</option>
          </select>
        </div>

        {/* Not scheduled toggle */}
        <div>
          <label className="text-xs text-gray-400 block mb-0.5">Not scheduled</label>
          <button onClick={() => setShowNotSched(v => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showNotSched ? 'bg-green-500' : 'bg-gray-300'
            }`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              showNotSched ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button onClick={() => { setFilterClient(''); setFilterStatus(''); setFilterPriority('') }}
            className="text-xs text-gray-400 hover:text-gray-600 mt-4 font-medium">
            Clear All
          </button>
        )}

        {/* Fiscal year label */}
        <div className="ml-auto text-right">
          <p className="text-xs text-gray-400">Fiscal year started</p>
          <p className="text-xs font-semibold text-gray-600">Jan {year}</p>
        </div>
      </div>

      {/* ── Kanban board ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-gray-400">
          <Loader2 size={22} className="animate-spin mr-3" />
          <span className="text-sm">Loading roadmap…</span>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 p-6 min-h-full">
            {visibleColumns.map(col => (
              <KanbanColumn
                key={col.key}
                col={col}
                recs={columns[col.key] || []}
                year={year}
                curYear={curYear}
                curQuarter={curQuarter}
                cardInfo={cardInfo}
                isDragOver={dragOver === col.key}
                dragRec={dragRec}
                onDragOver={() => setDragOver(col.key)}
                onDrop={e => onDrop(e, col.key)}
                onDragLeave={() => setDragOver(null)}
                onAddClick={() => setCreateFor({ quarter: col.qNum, year })}
                onDragStart={onDragStart}
                onStatusChange={onStatusChange}
                onCardClick={rec => setEditRecId(rec.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Quick create modal ────────────────────────────────────────────── */}
      {createFor && (
        <QuickCreateModal
          clients={clients}
          defaultQuarter={createFor.quarter}
          defaultYear={createFor.year}
          onClose={() => setCreateFor(null)}
          onCreated={id => { loadData(); setEditRecId(id) }}
        />
      )}

      {/* ── Full edit modal ───────────────────────────────────────────────── */}
      {editRecId && (
        <RecEditModal
          recId={editRecId}
          onClose={() => setEditRecId(null)}
          onSaved={loadData}
        />
      )}
    </div>
  )
}
