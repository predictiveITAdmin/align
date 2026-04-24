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
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  X, Search, Loader2, Inbox, Link2, Link2Off, AlertTriangle, ExternalLink,
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

// Build a carrier tracking URL for the common US carriers; fall back to a
// Google lookup so the number is always clickable even for unknown carriers.
function trackingUrl(carrier, tracking) {
  if (!tracking) return null
  const c = (carrier || '').toUpperCase()
  const t = encodeURIComponent(tracking)
  if (c.includes('UPS'))    return `https://www.ups.com/track?tracknum=${t}`
  if (c.includes('FEDEX'))  return `https://www.fedex.com/fedextrack/?tracknumbers=${t}`
  if (c.includes('USPS'))   return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`
  if (c.includes('DHL'))    return `https://www.dhl.com/en/express/tracking.html?AWB=${t}`
  if (c.includes('ONTRAC')) return `https://www.ontrac.com/tracking.asp?tracking=${t}`
  return `https://www.google.com/search?q=${encodeURIComponent(tracking + ' tracking')}`
}

function formatAddress(addr) {
  if (!addr || typeof addr !== 'object') return null
  const line1 = [addr.line1, addr.line2].filter(Boolean).join(' ')
  const cityLine = [addr.city, addr.state].filter(Boolean).join(', ')
  const cityZip = [cityLine, addr.postal].filter(Boolean).join(' ')
  const lines = [line1, cityZip, addr.country].filter(Boolean)
  return lines.length ? lines : null
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
// Predictive groups (server-assigned match_method) → section labels/order.
const GROUP_META = [
  { key: 'po_exact',       label: 'Exact PO match',          tint: 'green'  },
  { key: 'po_fuzzy',       label: 'Similar PO',              tint: 'green'  },
  { key: 'part_overlap',   label: 'Part numbers match',      tint: 'indigo' },
  { key: 'date_proximity', label: 'Closed near order date',  tint: 'blue'   },
  { key: 'client_name',    label: 'Same client',             tint: 'gray'   },
  { key: 'recent_closed',  label: 'Recently closed',         tint: 'yellow' },
]
const GROUP_TINT = {
  green:  'bg-green-50  text-green-700  border-green-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  blue:   'bg-blue-50   text-blue-700   border-blue-200',
  gray:   'bg-gray-50   text-gray-600   border-gray-200',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
}

function ConfidencePill({ confidence }) {
  if (confidence == null) return null
  const cls = confidence >= 90 ? 'bg-green-100  text-green-700'
           : confidence >= 70 ? 'bg-blue-100   text-blue-700'
           : confidence >= 50 ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100   text-gray-600'
  return <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cls}`}>{confidence}%</span>
}

function SuggestionRow({ opp, selected, onSelect }) {
  const tint = GROUP_META.find(g => g.key === opp.match_method)?.tint || 'gray'
  return (
    <button
      onClick={() => onSelect(opp)}
      className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 border transition-all
        ${selected ? 'border-primary-400 bg-primary-50' : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{opp.title}</p>
          <p className="text-xs text-gray-500 truncate">{opp.client_name || '—'}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
            {opp.match_reason && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded border ${GROUP_TINT[tint]}`}>
                {opp.match_reason}
              </span>
            )}
            {opp.stage && <span className="text-[11px] text-gray-500">{opp.stage}</span>}
            {opp.closed_date && (
              <span className="text-[11px] text-gray-500">Closed {fmtDate(opp.closed_date)}</span>
            )}
            {!opp.closed_date && opp.created_date && (
              <span className="text-[11px] text-gray-500">Created {fmtDate(opp.created_date)}</span>
            )}
          </div>
          {opp.po_numbers?.length > 0 && (
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              PO: {opp.po_numbers.slice(0, 3).join(', ')}{opp.po_numbers.length > 3 ? '…' : ''}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <ConfidencePill confidence={opp.confidence} />
          {opp.amount != null && <span className="text-xs text-gray-600">{fmt(opp.amount)}</span>}
        </div>
      </div>
    </button>
  )
}

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
    const t = setTimeout(() => { loadSuggestions(search) }, 350)
    return () => clearTimeout(t)
  }, [search, loadSuggestions])

  // Group suggestions by match_method (preserving server order within each group)
  const grouped = useMemo(() => {
    const map = new Map()
    for (const s of suggestions) {
      const key = s.match_method || 'other'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(s)
    }
    return map
  }, [suggestions])

  const isSearchMode = search.trim().length > 0
  const searchResults = grouped.get('search') || []

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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
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
              placeholder="Search any opportunity by name, client, PO, or quote #…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          {!isSearchMode && (
            <p className="text-[11px] text-gray-400 mt-2">
              Predictive matches shown below. Start typing to search any opportunity instead.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" />
              <span className="text-sm">Finding matches…</span>
            </div>
          )}

          {!loading && isSearchMode && (
            <>
              {searchResults.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Inbox size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No matches for "{search.trim()}"</p>
                  <p className="text-xs mt-1">Try a client name, PO, or quote number</p>
                </div>
              ) : (
                <>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Search results ({searchResults.length})
                  </p>
                  {searchResults.map(opp => (
                    <SuggestionRow key={opp.id} opp={opp}
                      selected={selected?.id === opp.id}
                      onSelect={o => setSelected(selected?.id === o.id ? null : o)} />
                  ))}
                </>
              )}
            </>
          )}

          {!loading && !isSearchMode && (
            <>
              {suggestions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Inbox size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No predictive matches found</p>
                  <p className="text-xs mt-1">Type above to search any opportunity</p>
                </div>
              ) : (
                GROUP_META.map(g => {
                  const rows = grouped.get(g.key) || []
                  if (!rows.length) return null
                  return (
                    <div key={g.key} className="mb-3">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 px-1">
                        {g.label} <span className="text-gray-400 font-normal">· {rows.length}</span>
                      </p>
                      {rows.map(opp => (
                        <SuggestionRow key={opp.id} opp={opp}
                          selected={selected?.id === opp.id}
                          onSelect={o => setSelected(selected?.id === o.id ? null : o)} />
                      ))}
                    </div>
                  )
                })
              )}
            </>
          )}
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
export default function OrderDetailSlideOver({ orderId, onClose, onRefresh, onOppClick }) {
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
              <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                {order.po_number && (<>
                  <span className="text-gray-500">PO Number</span>
                  <span className="font-mono font-medium text-gray-900">{order.po_number}</span>
                </>)}
                <span className="text-gray-500">Order Date</span>
                <span className="text-gray-900">{fmtDate(order.order_date)}</span>
                {order.created_at && (<>
                  <span className="text-gray-500">Created</span>
                  <span className="text-gray-900">{fmtTs(order.created_at)}</span>
                </>)}
                {order.subtotal != null && order.subtotal !== order.total && (<>
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-900">{fmt(order.subtotal)}</span>
                </>)}
                {order.shipping != null && order.shipping !== 0 && (<>
                  <span className="text-gray-500">Shipping</span>
                  <span className="text-gray-900">{fmt(order.shipping)}</span>
                </>)}
                {order.tax != null && order.tax !== 0 && (<>
                  <span className="text-gray-500">Tax</span>
                  <span className="text-gray-900">{fmt(order.tax)}</span>
                </>)}
                {order.total != null && (<>
                  <span className="text-gray-500 font-medium">Total</span>
                  <span className="font-semibold text-gray-900">{fmt(order.total)}</span>
                </>)}
                {order.client_name && (<>
                  <span className="text-gray-500">Client</span>
                  <Link to={`/clients/${order.client_id}`} onClick={onClose} className="text-blue-600 hover:underline">
                    {order.client_name}
                  </Link>
                </>)}
                {order.opportunity_title && (<>
                  <span className="text-gray-500">Opportunity</span>
                  <span
                    className={order.opportunity_id && onOppClick ? 'text-blue-600 hover:underline cursor-pointer' : 'text-gray-900'}
                    onClick={() => order.opportunity_id && onOppClick?.(order.opportunity_id)}
                  >
                    {order.opportunity_title}
                  </span>
                </>)}
                {order.quote_number && (<>
                  <span className="text-gray-500">Quote #</span>
                  <span className="text-gray-900">{order.quote_number}</span>
                </>)}
                {(order.ship_to_name || order.ship_to_address) && (<>
                  <span className="text-gray-500">Ship To</span>
                  <span className="text-gray-900">
                    {order.ship_to_name && <span className="block font-medium">{order.ship_to_name}</span>}
                    {formatAddress(order.ship_to_address)?.map((line, i) => (
                      <span key={i} className="block text-gray-700">{line}</span>
                    ))}
                  </span>
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
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Line Items ({order.items.length})
                  </h3>
                  {(() => {
                    const computed = order.items.reduce((sum, it) => sum + (parseFloat(it.line_total) || 0), 0)
                    if (computed > 0 && order.total == null) {
                      return <span className="text-xs text-gray-500">Est. {fmt(computed)}</span>
                    }
                    return null
                  })()}
                </div>
                <div className="space-y-3">
                  {order.items.map((item, i) => {
                    // Prefer metadata.tracking_numbers[] (populated by adapters when
                    // an order line has multiple shipments). Fall back to the
                    // single tracking_number column for older rows.
                    const extra = Array.isArray(item.metadata?.tracking_numbers) ? item.metadata.tracking_numbers : []
                    const trackingList = extra.length ? extra : (item.tracking_number ? [item.tracking_number] : [])
                    const longDesc = item.metadata?.long_description
                    return (
                      <div key={item.id || i} className="rounded-lg border border-gray-100 p-3 text-sm">
                        <div className="flex justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {item.mfg_part_number && <p className="font-mono text-xs text-gray-500 mb-0.5">{item.mfg_part_number}</p>}
                            <p className="text-gray-900 font-medium break-words">{item.description || '—'}</p>
                            {longDesc && longDesc !== item.description && (
                              <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{longDesc}</p>
                            )}
                            {item.manufacturer && <p className="text-xs text-gray-500 mt-0.5">{item.manufacturer}</p>}
                          </div>
                          <div className="text-right shrink-0 space-y-0.5">
                            <p className="text-xs text-gray-500">Qty: {item.quantity_ordered}</p>
                            {item.quantity_shipped > 0 && <p className="text-xs text-green-600">Ship: {item.quantity_shipped}</p>}
                            {item.quantity_backordered > 0 && <p className="text-xs text-orange-600">B/O: {item.quantity_backordered}</p>}
                            {item.quantity_cancelled > 0 && <p className="text-xs text-red-600">Can: {item.quantity_cancelled}</p>}
                            {item.unit_cost != null && (
                              <p className="text-xs text-gray-500 mt-1">{fmt(item.unit_cost)} ea</p>
                            )}
                            {item.line_total != null && (
                              <p className="text-sm font-semibold text-gray-900">{fmt(item.line_total)}</p>
                            )}
                          </div>
                        </div>
                        {(trackingList.length > 0 || item.carrier || item.ship_date || item.expected_delivery) && (
                          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1 text-xs text-gray-500">
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              {item.carrier && <span>📦 {item.carrier}</span>}
                              {item.ship_date && <span>Shipped: {fmtDate(item.ship_date)}</span>}
                              {item.expected_delivery && <span className="text-green-600">Expected: {fmtDate(item.expected_delivery)}</span>}
                            </div>
                            {trackingList.length > 0 && (
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {trackingList.map((t, j) => {
                                  const url = trackingUrl(item.carrier, t)
                                  return (
                                    <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                                      className="font-mono text-blue-600 hover:underline inline-flex items-center gap-1">
                                      {t}<ExternalLink size={10} />
                                    </a>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
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
