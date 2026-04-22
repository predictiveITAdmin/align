/**
 * OrderDetailSlideOver — reusable order detail panel + POMapperModal
 *
 * Used on the global /orders page and inside ClientDetail procurement tabs.
 * Self-contained: fetches its own data from /api/orders/{orderId}.
 *
 * Props:
 *   orderId   — UUID of the distributor order to show
 *   onClose   — called when user dismisses the slide-over
 *   onRefresh — called after a map/unmap action so the parent can reload its list
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X, Search, Loader2, Inbox, Link2, Link2Off, AlertTriangle,
} from 'lucide-react'
import { api } from '../lib/api'

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

const DISTRIBUTOR_LABELS = {
  ingram_xi:            'Ingram Micro',
  tdsynnex_esolutions:  'TD Synnex',
  tdsynnex_ecx:         'TD Synnex',
  amazon_business_csv:  'Amazon Business',
  provantage_manual:    'Provantage',
  dell_premier:         'Dell Premier',
}

const STATUS_STYLES = {
  submitted:         'bg-blue-50 text-blue-700 border-blue-200',
  confirmed:         'bg-indigo-50 text-indigo-700 border-indigo-200',
  partially_shipped: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  shipped:           'bg-cyan-50 text-cyan-700 border-cyan-200',
  delivered:         'bg-green-50 text-green-700 border-green-200',
  backordered:       'bg-orange-50 text-orange-700 border-orange-200',
  cancelled:         'bg-red-50 text-red-700 border-red-200',
  returned:          'bg-purple-50 text-purple-700 border-purple-200',
  exception:         'bg-gray-100 text-gray-700 border-gray-200',
}

const MATCH_STYLES = {
  matched:      'bg-green-50 text-green-700 border-green-200',
  needs_review: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  unmapped:     'bg-red-50 text-red-600 border-red-200',
}

function StatusPill({ status, type = 'order' }) {
  const styles = type === 'match' ? MATCH_STYLES : STATUS_STYLES
  const cls = styles[status] || 'bg-gray-100 text-gray-600 border-gray-200'
  const label = status?.replace(/_/g, ' ') || '—'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  )
}

// ─── PO Mapper Modal ──────────────────────────────────────────────────────────
function POMapperModal({ order, onClose, onMapped }) {
  const [search, setSearch]           = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading]         = useState(false)
  const [selected, setSelected]       = useState(null)
  const [mapping, setMapping]         = useState(false)
  const [error, setError]             = useState(null)
  const searchRef = useRef(null)

  const loadSuggestions = useCallback(async (q) => {
    setLoading(true)
    setError(null)
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : ''
      const r = await api.get(`/orders/${order.id}/match-suggestions${params}`)
      setSuggestions(r.data || [])
    } catch {
      setError('Failed to load suggestions')
    } finally {
      setLoading(false)
    }
  }, [order.id])

  useEffect(() => {
    loadSuggestions('')
    setTimeout(() => searchRef.current?.focus(), 100)
  }, [loadSuggestions])

  useEffect(() => {
    const t = setTimeout(() => { if (search !== undefined) loadSuggestions(search) }, 350)
    return () => clearTimeout(t)
  }, [search, loadSuggestions])

  async function confirmMap() {
    if (!selected) return
    setMapping(true)
    setError(null)
    try {
      await api.post(`/orders/${order.id}/map`, { opportunity_id: selected.id })
      onMapped()
      onClose()
    } catch (err) {
      setError(err.message || 'Mapping failed')
      setMapping(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Map to Opportunity</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Order #{order.distributor_order_id}
              {order.po_number && <> · PO: <span className="font-mono font-medium text-gray-700">{order.po_number}</span></>}
              {order.ship_to_name && <> · {order.ship_to_name}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4 mt-0.5"><X size={18} /></button>
        </div>

        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by opportunity name, client, or PO…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" />
              <span className="text-sm">Finding matches…</span>
            </div>
          )}
          {!loading && suggestions.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <Inbox size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">{search ? 'No matching opportunities found' : 'No suggestions found'}</p>
              <p className="text-xs mt-1">Try searching by client name or PO number</p>
            </div>
          )}
          {!loading && suggestions.map(opp => (
            <button key={opp.id} onClick={() => setSelected(selected?.id === opp.id ? null : opp)}
              className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 border transition-all
                ${selected?.id === opp.id ? 'border-primary-400 bg-primary-50' : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{opp.title}</p>
                  <p className="text-xs text-gray-500 truncate">{opp.client_name}</p>
                  {opp.po_numbers?.length > 0 && (
                    <p className="text-xs text-gray-400 font-mono mt-0.5">
                      POs: {opp.po_numbers.slice(0, 3).join(', ')}{opp.po_numbers.length > 3 ? '…' : ''}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {opp.confidence != null && (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${opp.confidence >= 80 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {opp.confidence}% match
                    </span>
                  )}
                  {opp.amount != null && <span className="text-xs text-gray-600">{fmt(opp.amount)}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>

        {error && <p className="px-5 py-2 text-sm text-red-600 bg-red-50 border-t border-red-100">{error}</p>}
        <div className="flex items-center justify-between p-4 border-t border-gray-100 gap-3">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button onClick={confirmMap} disabled={!selected || mapping}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {mapping ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            {mapping ? 'Mapping…' : 'Confirm Link'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function OrderDetailSlideOver({ orderId, onClose, onRefresh }) {
  const [order, setOrder]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [showMapper, setShowMapper] = useState(false)
  const [unmapping, setUnmapping]   = useState(false)

  useEffect(() => {
    setLoading(true)
    setOrder(null)
    api.get(`/orders/${orderId}`)
      .then(r => setOrder(r.data))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false))
  }, [orderId])

  async function handleUnmap() {
    if (!confirm('Remove the mapping for this order?')) return
    setUnmapping(true)
    try {
      await api.post(`/orders/${orderId}/unmap`)
      onRefresh?.()
      onClose()
    } catch {
      setUnmapping(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Order Details</h2>
            {order && (
              <p className="text-xs text-gray-500 mt-0.5">
                {DISTRIBUTOR_LABELS[order.distributor] || order.distributor} · #{order.distributor_order_id}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        )}
        {!loading && !order && (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Order not found</div>
        )}

        {!loading && order && (
          <div className="flex-1 overflow-y-auto">
            {/* Summary */}
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <StatusPill status={order.status} />
                <StatusPill status={order.match_status} type="match" />
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {order.po_number && (<>
                  <span className="text-gray-500">PO Number</span>
                  <span className="font-mono font-medium text-gray-900">{order.po_number}</span>
                </>)}
                <span className="text-gray-500">Order Date</span>
                <span className="text-gray-900">{fmtDate(order.order_date)}</span>
                {order.total != null && (<>
                  <span className="text-gray-500">Total</span>
                  <span className="font-medium text-gray-900">{fmt(order.total)}</span>
                </>)}
                {order.ship_to_name && (<>
                  <span className="text-gray-500">Ship To</span>
                  <span className="text-gray-900">{order.ship_to_name}</span>
                </>)}
                {order.client_name && (<>
                  <span className="text-gray-500">Client</span>
                  <span className="text-gray-900">{order.client_name}</span>
                </>)}
                {order.opportunity_title && (<>
                  <span className="text-gray-500">Opportunity</span>
                  <span className="text-gray-900">{order.opportunity_title}</span>
                </>)}
                {order.quote_number && (<>
                  <span className="text-gray-500">Quote #</span>
                  <span className="text-gray-900">{order.quote_number}</span>
                </>)}
              </div>
              {/* Action buttons */}
              <div className="flex gap-2 mt-4">
                {order.match_status !== 'matched' && (
                  <button onClick={() => setShowMapper(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors">
                    <Link2 size={13} /> Map to Opportunity
                  </button>
                )}
                {order.match_status === 'matched' && (
                  <button onClick={handleUnmap} disabled={unmapping}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                    <Link2Off size={13} /> {unmapping ? 'Removing…' : 'Remove Mapping'}
                  </button>
                )}
                {order.match_status === 'needs_review' && (
                  <button onClick={() => setShowMapper(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-yellow-200 text-yellow-700 bg-yellow-50 text-sm rounded-lg hover:bg-yellow-100 transition-colors">
                    <AlertTriangle size={13} /> Review & Confirm
                  </button>
                )}
              </div>
            </div>

            {/* Line items */}
            {order.items?.length > 0 && (
              <div className="p-5 border-b border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Line Items ({order.items.length})
                </h3>
                <div className="space-y-3">
                  {order.items.map((item, i) => (
                    <div key={item.id || i} className="rounded-lg border border-gray-100 p-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          {item.mfg_part_number && <p className="font-mono text-xs text-gray-500 mb-0.5">{item.mfg_part_number}</p>}
                          <p className="text-gray-900 font-medium truncate">{item.description || '—'}</p>
                          {item.manufacturer && <p className="text-xs text-gray-500">{item.manufacturer}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">Ord: {item.quantity_ordered}</p>
                          {item.quantity_shipped > 0 && <p className="text-xs text-green-600">Ship: {item.quantity_shipped}</p>}
                          {item.quantity_backordered > 0 && <p className="text-xs text-orange-600">B/O: {item.quantity_backordered}</p>}
                        </div>
                      </div>
                      {(item.tracking_number || item.carrier) && (
                        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          {item.carrier && <span>📦 {item.carrier}</span>}
                          {item.tracking_number && <span className="font-mono">{item.tracking_number}</span>}
                          {item.ship_date && <span>Shipped: {fmtDate(item.ship_date)}</span>}
                          {item.expected_delivery && <span className="text-green-600">Expected: {fmtDate(item.expected_delivery)}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Event timeline */}
            {order.events?.length > 0 && (
              <div className="p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">History</h3>
                <div className="space-y-3">
                  {order.events.map((ev, i) => (
                    <div key={ev.id || i} className="flex gap-3 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-2 shrink-0" />
                      <div>
                        <p className="text-gray-700">{ev.description}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{fmtTs(ev.event_date || ev.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showMapper && order && (
        <POMapperModal
          order={order}
          onClose={() => setShowMapper(false)}
          onMapped={() => { onRefresh?.(); onClose() }}
        />
      )}
    </>
  )
}
