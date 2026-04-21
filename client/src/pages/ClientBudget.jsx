import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronDown, Loader2, ExternalLink,
  RefreshCw, AlertCircle, X,
} from 'lucide-react'
import { api } from '../lib/api'
import Card, { CardBody } from '../components/Card'
import RecEditModal from '../components/RecEditModal'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (!n || isNaN(n) || n === 0) return null
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const PERIOD_LABELS = {
  not_scheduled: 'Not Scheduled',
  overdue:       'Overdue',
  q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4',
}
const PERIOD_KEYS = ['not_scheduled', 'overdue', 'q1', 'q2', 'q3', 'q4']

const STATUS_DOT = {
  draft:       'bg-gray-400',
  proposed:    'bg-blue-400',
  approved:    'bg-green-500',
  in_progress: 'bg-yellow-400',
  completed:   'bg-green-700',
  deferred:    'bg-gray-300',
}

const PRIORITY_COLOR = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-100 text-yellow-700',
  low:      'bg-gray-100 text-gray-500',
}

const GROUP_COLORS = {
  initiative:     { bar: 'bg-blue-600',   badge: 'bg-blue-100 text-blue-700' },
  recommendation: { bar: 'bg-blue-400',   badge: 'bg-sky-100 text-sky-700' },
  hardware:       { bar: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700' },
  software:       { bar: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700' },
  licensing:      { bar: 'bg-emerald-500',badge: 'bg-emerald-100 text-emerald-700' },
  infrastructure: { bar: 'bg-teal-500',   badge: 'bg-teal-100 text-teal-700' },
  security:       { bar: 'bg-rose-500',   badge: 'bg-rose-100 text-rose-700' },
  default:        { bar: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600' },
}

// ─── Stacked Bar Chart ────────────────────────────────────────────────────────

function StackedBarChart({ chartData, groups }) {
  const max = Math.max(...chartData.map(d => d.total), 1)
  return (
    <div>
      <div className="flex items-end gap-3 h-44 mb-2">
        {chartData.map(period => {
          const heightPx  = Math.round((period.total / max) * 160)
          const hasData   = period.total > 0
          const isOverdue = period.key === 'overdue'
          return (
            <div key={period.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <p className={`text-xs font-semibold mb-1 ${hasData ? 'text-gray-600' : 'text-gray-300'}`}>
                {hasData ? fmt(period.total) : '—'}
              </p>
              <div className="w-full flex flex-col-reverse" style={{ height: 160 }}>
                {hasData ? (
                  period.segments.filter(s => s.value > 0).map(seg => {
                    const c = GROUP_COLORS[seg.key] || GROUP_COLORS.default
                    const segH = Math.max(Math.round((seg.value / max) * 160), 2)
                    return (
                      <div key={seg.key}
                        style={{ height: segH }}
                        className={`w-full ${c.bar} ${isOverdue ? 'opacity-70' : ''} first:rounded-t-sm transition-all`}
                        title={`${seg.label}: ${fmt(seg.value)}`}
                      />
                    )
                  })
                ) : (
                  <div className="w-full bg-gray-100 rounded-t-sm" style={{ height: 4 }} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* X labels */}
      <div className="flex gap-3">
        {chartData.map(d => (
          <div key={d.key} className="flex-1 text-center min-w-0">
            <span className={`text-xs font-medium ${d.key === 'overdue' ? 'text-red-500' : 'text-gray-500'}`}>
              {d.label}
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-4">
          {groups.map(g => {
            const c = GROUP_COLORS[g.key] || GROUP_COLORS.default
            return (
              <span key={g.key} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className={`w-3 h-3 rounded-sm ${c.bar} inline-block`} />
                {g.label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Group Section (collapsible) ──────────────────────────────────────────────

function GroupSection({ group, year, onItemClick }) {
  const [open, setOpen] = useState(true)
  const c = GROUP_COLORS[group.key] || GROUP_COLORS.default

  const hasAnyTotal = PERIOD_KEYS.some(k => group.totals[k] > 0)
  if (!hasAnyTotal && group.items.length === 0) return null

  return (
    <div className="mb-1">
      {/* Group header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-0 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className={`w-1 self-stretch ${c.bar} opacity-60`} />
        <div className="flex items-center gap-3 px-4 py-2 flex-1 min-w-0">
          <ChevronDown size={13} className={`text-gray-400 transition-transform shrink-0 ${open ? '' : '-rotate-90'}`} />
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{group.label}</span>
          <span className="text-xs text-gray-400 bg-white rounded-full px-1.5 border border-gray-200">{group.items.length}</span>
        </div>
        {PERIOD_KEYS.map(k => (
          <div key={k} className="w-24 text-right px-3 py-2 text-xs font-semibold text-gray-700 tabular-nums shrink-0">
            {group.totals[k] > 0 ? fmt(group.totals[k]) : <span className="text-gray-300 font-normal">—</span>}
          </div>
        ))}
        <div className="w-24 text-right px-4 py-2 text-xs font-bold text-gray-900 tabular-nums shrink-0">
          {fmt(PERIOD_KEYS.reduce((s, k) => s + group.totals[k], 0)) || '—'}
        </div>
      </button>

      {/* Items */}
      {open && (
        <div className="divide-y divide-gray-50">
          {group.items.map(item => {
            const isClickable = group.key === 'initiative' || group.key === 'recommendation'
            return (
            <div key={item.id}
              onClick={() => isClickable && onItemClick({ ...item, groupKey: group.key })}
              className={`flex items-center gap-0 bg-white transition-colors ${isClickable ? 'hover:bg-blue-50/40 cursor-pointer' : 'hover:bg-gray-50/50'}`}>
              <div className={`w-1 self-stretch ${c.bar} opacity-20`} />
              <div className="flex items-center gap-2 px-4 py-2.5 flex-1 min-w-0">
                {/* Status dot (for recommendations) */}
                {item.status && (
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[item.status] || 'bg-gray-300'}`} />
                )}
                <span className={`text-sm truncate ${isClickable ? 'text-gray-800 hover:text-primary-700' : 'text-gray-800'}`}>{item.name}</span>
                {item.priority && item.priority !== 'medium' && (
                  <span className={`text-[10px] font-semibold px-1 py-0.5 rounded shrink-0 ${PRIORITY_COLOR[item.priority] || ''}`}>
                    {item.priority}
                  </span>
                )}
                {/* Schedule */}
                {item.schedule_year && (
                  <span className="text-xs text-gray-400 shrink-0">
                    {item.schedule_year}{item.schedule_quarter ? ` Q${item.schedule_quarter}` : ''}
                  </span>
                )}
                {/* Link to recommendation */}
                {isClickable && (
                  <a
                    href={`/recommendations/${item.id}`}
                    onClick={e => e.stopPropagation()}
                    className="text-gray-300 hover:text-primary-500 shrink-0"
                  >
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
              {PERIOD_KEYS.map(k => (
                <div key={k} className="w-24 text-right px-3 py-2.5 text-xs text-gray-600 tabular-nums shrink-0">
                  {item.periods[k] > 0 ? fmt(item.periods[k]) : <span className="text-gray-200">—</span>}
                </div>
              ))}
              <div className="w-24 text-right px-4 py-2.5 text-xs font-semibold text-gray-800 tabular-nums shrink-0">
                {fmt(item.total) || '—'}
              </div>
            </div>
          )})}
        </div>
      )}
    </div>
  )
}

// ─── New item quick-create modal (Budget context) ─────────────────────────────

function BudgetNewItemModal({ clientId, defaultYear, onClose, onCreated }) {
  const [title,   setTitle]   = useState('')
  const [kind,    setKind]    = useState('initiative')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  async function submit() {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true)
    try {
      const res = await api.post('/recommendations', {
        client_id: clientId,
        title: title.trim(),
        kind,
        status: 'draft',
        priority: 'medium',
        schedule_year: defaultYear,
      })
      onCreated(res.data.id)
    } catch { setError('Failed to create') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40" onClick={onClose} />
        <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">New Budget Item</h2>
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
              <label className="text-xs font-medium text-gray-600 mb-1 block">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                autoFocus placeholder="Initiative or recommendation title…"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400" />
            </div>
            <p className="text-xs text-gray-400">Will be scheduled for FY {defaultYear}. You can adjust the quarter after creating.</p>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button onClick={submit} disabled={saving}
              className="px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-60">
              {saving ? 'Creating…' : 'Create & Edit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Shared panel content (used both in standalone page and as a tab) ─────────

export function ClientBudgetPanel({ clientId }) {
  const navigate = useNavigate()
  const curYear  = new Date().getFullYear()

  const [years,      setYears]      = useState([curYear, curYear + 1, curYear + 2, curYear + 3])
  const [year,       setYear]       = useState(curYear)
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [editItem,   setEditItem]   = useState(null)
  const [createNew,  setCreateNew]  = useState(false)
  const [newRecId,   setNewRecId]   = useState(null)

  useEffect(() => {
    api.get('/budget/years').then(r => { if (Array.isArray(r) && r.length) setYears(r) }).catch(() => {})
  }, [])

  const loadData = useCallback(() => {
    setLoading(true)
    setError(null)
    api.get(`/budget/client/${clientId}?year=${year}`)
      .then(r => setData(r))
      .catch(e => setError(e.message || 'Failed to load budget'))
      .finally(() => setLoading(false))
  }, [clientId, year])

  useEffect(() => { loadData() }, [loadData])

  const grandTotal = data
    ? PERIOD_KEYS.reduce((s, k) => s + (data.grand_totals[k] || 0), 0)
    : 0

  return (
    <div>
      {/* Year tabs + refresh */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
        {years.map(y => (
          <button key={y} onClick={() => setYear(y)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              y === year
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            FY {y}
            {y === curYear && (
              <span className="ml-1.5 text-[10px] font-semibold bg-primary-100 text-primary-600 px-1.5 py-0.5 rounded-full">
                Current
              </span>
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 pb-1">
          {grandTotal > 0 && (
            <span className="text-sm font-bold text-gray-800">FY {year} total: {fmt(grandTotal)}</span>
          )}
          <button onClick={loadData} disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 flex items-center gap-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={() => setCreateNew(true)}
            className="text-xs font-medium bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 flex items-center gap-1">
            + Add Item
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-5">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-3" />
          <span className="text-sm">Loading budget forecast…</span>
        </div>
      ) : data && (
        <>
          {/* Chart */}
          <Card className="mb-5">
            <CardBody>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-800">Budget Forecast — FY {year}</h3>
                {data.current_quarter && (
                  <span className="text-xs text-gray-400">
                    Current: Q{data.current_quarter} {year}
                  </span>
                )}
              </div>
              {grandTotal > 0
                ? <StackedBarChart chartData={data.chart_data} groups={data.groups} />
                : <p className="text-sm text-gray-400 text-center py-8">No budget data for FY {year}</p>
              }
            </CardBody>
          </Card>

          {/* Overdue callout */}
          {(data.grand_totals?.overdue || 0) > 0 && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-4 text-sm">
              <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
              <span className="text-red-700">
                <strong>{fmt(data.grand_totals.overdue)}</strong> in overdue items — these were scheduled before Q{data.current_quarter} {year}
              </span>
            </div>
          )}

          {/* Grouped table */}
          <Card>
            <div className="overflow-x-auto">
              {/* Table header */}
              <div className="flex items-center gap-0 border-b border-gray-200 bg-gray-50">
                <div className="w-1 shrink-0" />
                <div className="flex-1 px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-0">
                  Name
                </div>
                {PERIOD_KEYS.map(k => (
                  <div key={k} className={`w-24 text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wide shrink-0 ${
                    k === 'overdue' ? 'text-red-400' : 'text-gray-500'
                  }`}>
                    {PERIOD_LABELS[k]}
                  </div>
                ))}
                <div className="w-24 text-right px-4 py-2.5 text-xs font-semibold text-gray-900 uppercase tracking-wide shrink-0">
                  Total
                </div>
              </div>

              {/* Groups */}
              {data.groups.length === 0 ? (
                <div className="text-center py-14 text-gray-400 text-sm">
                  No budget items for FY {year}.<br />
                  <span className="text-xs mt-1 block">Set a schedule year on recommendations or add direct budget items.</span>
                </div>
              ) : (
                data.groups.map(g => (
                  <GroupSection key={g.key} group={g} year={year} onItemClick={setEditItem} />
                ))
              )}

              {/* Total row */}
              {data.groups.length > 0 && (
                <div className="flex items-center gap-0 border-t-2 border-gray-300 bg-gray-50">
                  <div className="w-1 shrink-0" />
                  <div className="flex-1 px-4 py-2.5 text-xs font-bold text-gray-700 uppercase tracking-wide">
                    Total
                  </div>
                  {PERIOD_KEYS.map(k => (
                    <div key={k} className="w-24 text-right px-3 py-2.5 text-xs font-bold text-gray-900 tabular-nums shrink-0">
                      {data.grand_totals[k] > 0 ? fmt(data.grand_totals[k]) : <span className="text-gray-300 font-normal">—</span>}
                    </div>
                  ))}
                  <div className="w-24 text-right px-4 py-2.5 text-sm font-bold text-gray-900 tabular-nums shrink-0">
                    {fmt(grandTotal) || '—'}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      {/* Full edit modal for existing items */}
      {editItem && (
        <RecEditModal
          recId={editItem.id}
          onClose={() => setEditItem(null)}
          onSaved={loadData}
        />
      )}

      {/* Create new initiative/recommendation */}
      {createNew && (
        <BudgetNewItemModal
          clientId={clientId}
          defaultYear={year}
          onClose={() => setCreateNew(false)}
          onCreated={id => { setCreateNew(false); setNewRecId(id) }}
        />
      )}
      {newRecId && (
        <RecEditModal
          recId={newRecId}
          onClose={() => { setNewRecId(null); loadData() }}
          onSaved={loadData}
        />
      )}
    </div>
  )
}

// ─── Standalone page (accessed via /budget/:clientId) ─────────────────────────

export default function ClientBudget() {
  const { clientId } = useParams()
  const navigate     = useNavigate()

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => navigate('/budget')}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <ChevronLeft size={15} /> Budget
        </button>
      </div>
      <ClientBudgetPanel clientId={clientId} />
    </div>
  )
}
