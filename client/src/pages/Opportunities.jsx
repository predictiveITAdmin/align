import { useState, useEffect, useCallback } from 'react'
import {
  Target, Search, RefreshCw, X, ChevronRight, Loader2,
  ShoppingCart, FileText, DollarSign, ExternalLink, Package,
  CheckCircle2, Clock, AlertTriangle, ChevronDown,
} from 'lucide-react'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'

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

const STAGE_STYLES = {
  Prospect:     'bg-gray-100 text-gray-600',
  Qualified:    'bg-blue-50 text-blue-700',
  Quoting:      'bg-indigo-50 text-indigo-700',
  'Closed Won':  'bg-green-50 text-green-700',
  'Closed Lost': 'bg-red-50 text-red-600',
}

const ORDER_STATUS_STYLES = {
  submitted:        'bg-blue-50 text-blue-700',
  confirmed:        'bg-indigo-50 text-indigo-700',
  partially_shipped:'bg-yellow-50 text-yellow-700',
  shipped:          'bg-cyan-50 text-cyan-700',
  delivered:        'bg-green-50 text-green-700',
  backordered:      'bg-orange-50 text-orange-700',
  cancelled:        'bg-red-50 text-red-700',
  exception:        'bg-gray-100 text-gray-600',
}

const DISTRIBUTOR_LABELS = {
  ingram_xi: 'Ingram',
  tdsynnex_ecx: 'TD Synnex',
  amazon_business_csv: 'Amazon',
  provantage_manual: 'Provantage',
}

function StagePill({ stage }) {
  const cls = STAGE_STYLES[stage] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {stage || '—'}
    </span>
  )
}

// ─── Opportunity Detail Slide-over ────────────────────────────────────────────
function OppDetail({ oppId, onClose }) {
  const [opp, setOpp]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [openQuote, setOpenQuote] = useState(null)

  useEffect(() => {
    setLoading(true)
    api.get(`/opportunities/${oppId}`)
      .then(r => { setOpp(r.data); if (r.data?.quotes?.length) setOpenQuote(r.data.quotes[0].id) })
      .catch(() => setOpp(null))
      .finally(() => setLoading(false))
  }, [oppId])

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900 pr-4">{opp?.title || 'Opportunity'}</h2>
            {opp && (
              <p className="text-xs text-gray-500 mt-0.5">{opp.client_name} · {opp.stage}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X size={18} />
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        )}

        {!loading && opp && (
          <div className="flex-1 overflow-y-auto">
            {/* Summary */}
            <div className="p-5 border-b border-gray-100">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <span className="text-gray-500">Client</span>
                <span className="text-gray-900 font-medium">{opp.client_name || '—'}</span>

                <span className="text-gray-500">Stage</span>
                <span><StagePill stage={opp.stage} /></span>

                {opp.amount != null && (
                  <>
                    <span className="text-gray-500">Amount</span>
                    <span className="text-gray-900 font-medium">{fmt(opp.amount)}</span>
                  </>
                )}

                {opp.po_numbers?.length > 0 && (
                  <>
                    <span className="text-gray-500">PO Numbers</span>
                    <span className="font-mono text-xs text-gray-900">{opp.po_numbers.join(', ')}</span>
                  </>
                )}

                {opp.expected_close && (
                  <>
                    <span className="text-gray-500">Expected Close</span>
                    <span className="text-gray-900">{fmtDate(opp.expected_close)}</span>
                  </>
                )}

                {opp.created_date && (
                  <>
                    <span className="text-gray-500">Created</span>
                    <span className="text-gray-900">{fmtDate(opp.created_date)}</span>
                  </>
                )}
              </div>

              {/* AT link */}
              {opp.autotask_opportunity_id && (
                <div className="mt-3">
                  <a
                    href={`${window.__ALIGN_AT_URL__ || 'https://ww1.autotask.net'}/Mvc/Sales/Opportunities/Details.mvc?opportunityId=${opp.autotask_opportunity_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800"
                  >
                    <ExternalLink size={12} /> View in Autotask
                  </a>
                </div>
              )}
            </div>

            {/* Linked distributor orders */}
            {opp.orders?.length > 0 && (
              <div className="p-5 border-b border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Distributor Orders ({opp.orders.length})
                </h3>
                <div className="space-y-2">
                  {opp.orders.map(ord => (
                    <div key={ord.id} className="rounded-lg border border-gray-100 p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-medium text-gray-900">
                            {DISTRIBUTOR_LABELS[ord.distributor] || ord.distributor}
                            {' '}#{ord.distributor_order_id}
                          </p>
                          {ord.po_number && (
                            <p className="text-xs text-gray-500 font-mono mt-0.5">PO: {ord.po_number}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ORDER_STATUS_STYLES[ord.status] || 'bg-gray-100 text-gray-600'}`}>
                            {ord.status?.replace(/_/g, ' ') || '—'}
                          </span>
                          {ord.total != null && (
                            <span className="text-xs text-gray-600">{fmt(ord.total)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quotes */}
            {opp.quotes?.length > 0 && (
              <div className="p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Quotes ({opp.quotes.length})
                </h3>
                <div className="space-y-2">
                  {opp.quotes.map(q => (
                    <div key={q.id} className="border border-gray-100 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setOpenQuote(openQuote === q.id ? null : q.id)}
                        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {q.title || q.quote_number || `Quote ${q.autotask_quote_id}`}
                          </p>
                          <p className="text-xs text-gray-500">
                            {q.quote_number && `#${q.quote_number} · `}
                            {q.status && `${q.status} · `}
                            {q.amount != null && fmt(q.amount)}
                          </p>
                        </div>
                        <ChevronDown size={14} className={`text-gray-400 transition-transform ${openQuote === q.id ? '' : '-rotate-90'}`} />
                      </button>

                      {openQuote === q.id && q.items?.length > 0 && (
                        <div className="border-t border-gray-100 divide-y divide-gray-50">
                          {q.items.map((item, i) => (
                            <div key={item.id || i} className="px-3 py-2.5 text-xs">
                              <div className="flex justify-between gap-4">
                                <div className="min-w-0">
                                  {item.mfg_part_number && (
                                    <span className="font-mono text-gray-400 mr-1.5">{item.mfg_part_number}</span>
                                  )}
                                  <span className="text-gray-700">{item.description || '—'}</span>
                                </div>
                                <div className="text-right shrink-0 text-gray-600">
                                  {item.quantity != null && <span>×{item.quantity}</span>}
                                  {item.line_total != null && <span className="ml-2 font-medium">{fmt(item.line_total)}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {openQuote === q.id && q.items?.length === 0 && (
                        <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">No line items synced</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {opp.quotes?.length === 0 && opp.orders?.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">No quotes or orders linked yet</div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Main Opportunities page ──────────────────────────────────────────────────
export default function Opportunities() {
  const [opps, setOpps]       = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [stages, setStages]   = useState([])
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)

  // Filters
  const [search, setSearch]       = useState('')
  const [stageFilter, setStageFilter] = useState('')

  // Detail panel
  const [selectedId, setSelectedId] = useState(null)

  const loadOpps = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (search)      params.set('search', search)
    if (stageFilter) params.set('stage', stageFilter)
    params.set('limit', '500')

    api.get(`/opportunities?${params}`)
      .then(r => {
        const data = r.data || []
        setOpps(data)
        setTotal(r.total || data.length)
        // Derive unique stages for filter
        const uniqueStages = [...new Set(data.map(o => o.stage).filter(Boolean))].sort()
        setStages(uniqueStages)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [search, stageFilter])

  const loadSyncStatus = useCallback(() => {
    api.get('/opportunities/sync/status')
      .then(r => setSyncStatus(r.data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadSyncStatus()
  }, [loadSyncStatus])

  useEffect(() => {
    const t = setTimeout(loadOpps, search ? 350 : 0)
    return () => clearTimeout(t)
  }, [loadOpps, search])

  async function handleSync() {
    setSyncing(true)
    try {
      await api.post('/opportunities/sync')
      // Give it a moment then refresh
      setTimeout(() => { loadOpps(); loadSyncStatus() }, 2000)
    } catch {
      // ignore
    } finally {
      setSyncing(false)
    }
  }

  // Stats derived from loaded data
  const stats = {
    total: total,
    withPo: opps.filter(o => o.po_numbers?.length > 0).length,
    withOrders: opps.filter(o => parseInt(o.order_count) > 0).length,
    totalValue: opps.reduce((s, o) => s + (o.amount || 0), 0),
  }

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        icon={Target}
        title="Opportunities"
        subtitle="Autotask opportunities with quotes, PO numbers, and linked distributor orders"
      >
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync Autotask'}
        </button>
      </PageHeader>

      {/* Sync status */}
      {syncStatus && (
        <div className="flex flex-wrap gap-4 mb-5 text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            <Target size={13} className="text-gray-400" /> {syncStatus.opp_count} opportunities
          </span>
          <span className="flex items-center gap-1.5">
            <FileText size={13} className="text-gray-400" /> {syncStatus.quote_count} quotes
          </span>
          <span className="flex items-center gap-1.5">
            <Package size={13} className="text-gray-400" /> {syncStatus.item_count} line items
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-gray-400" /> {syncStatus.opps_with_po} with PO numbers
          </span>
          {syncStatus.last_opp_sync && (
            <span className="flex items-center gap-1.5 text-gray-400">
              <Clock size={12} /> Last sync: {fmtTs(syncStatus.last_opp_sync)}
            </span>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { label: 'Total Opportunities', value: stats.total, icon: Target, color: 'text-primary-600', bg: 'bg-primary-50' },
          { label: 'With PO Numbers', value: stats.withPo, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'With Orders', value: stats.withOrders, icon: ShoppingCart, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Total Pipeline', value: fmt(stats.totalValue), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(tile => (
          <div key={tile.label} className="flex-1 min-w-[140px] bg-white rounded-xl border border-gray-200 p-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${tile.bg}`}>
              <tile.icon size={16} className={tile.color} />
            </div>
            <p className="text-xl font-bold text-gray-900">{tile.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{tile.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, client, or PO…"
            className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="relative">
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            className="appearance-none pl-3 pr-7 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
          >
            <option value="">All Stages</option>
            {stages.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        {(search || stageFilter) && (
          <button
            onClick={() => { setSearch(''); setStageFilter('') }}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <X size={13} /> Clear
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">{total} opportunity{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {error && (
          <div className="p-6 text-center text-sm text-red-600">{error}</div>
        )}

        {!error && loading && (
          <div className="p-8 text-center text-gray-400">
            <Loader2 size={24} className="animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading opportunities…</p>
          </div>
        )}

        {!error && !loading && opps.length === 0 && (
          <div className="p-12 text-center text-gray-400">
            <Target size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium text-gray-500">No opportunities found</p>
            <p className="text-xs mt-1">
              {search || stageFilter
                ? 'Try adjusting your filters'
                : 'Run "Sync Autotask" to import opportunities from Autotask'}
            </p>
          </div>
        )}

        {!error && !loading && opps.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Opportunity</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stage</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">PO Numbers</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quotes</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Orders</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Close Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {opps.map(opp => (
                <tr
                  key={opp.id}
                  className="hover:bg-gray-50/70 cursor-pointer transition-colors"
                  onClick={() => setSelectedId(opp.id)}
                >
                  <td className="px-4 py-3 max-w-[220px]">
                    <p className="text-sm font-medium text-gray-900 truncate">{opp.title}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700">{opp.client_name || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StagePill stage={opp.stage} />
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    {opp.po_numbers?.length > 0 ? (
                      <p className="font-mono text-xs text-gray-700 truncate">
                        {opp.po_numbers.slice(0, 2).join(', ')}
                        {opp.po_numbers.length > 2 && ` +${opp.po_numbers.length - 2}`}
                      </p>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
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
                    <span className="text-xs text-gray-500">{fmtDate(opp.expected_close)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight size={15} className="text-gray-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail slide-over */}
      {selectedId && (
        <OppDetail
          oppId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
