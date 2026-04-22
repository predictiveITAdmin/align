/**
 * OppDetailSlideOver — reusable opportunity detail panel
 *
 * Used on the global /opportunities page and inside ClientDetail procurement tabs.
 * Self-contained: fetches its own data from /api/opportunities/{oppId}.
 *
 * Props:
 *   oppId   — UUID of the opportunity to show
 *   onClose — called when user dismisses the slide-over
 */
import { useState, useEffect } from 'react'
import { X, ChevronDown, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import QuoteLineItems from './QuoteLineItems'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(val) {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val)
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusPillClass(status) {
  switch (status) {
    case 'Active':            return 'bg-green-50 text-green-700'
    case 'Not Ready To Buy':  return 'bg-yellow-50 text-yellow-700'
    case 'Lost':              return 'bg-red-50 text-red-600'
    case 'Closed':            return 'bg-blue-50 text-blue-700'
    case 'Implemented':       return 'bg-emerald-50 text-emerald-700'
    default:                  return 'bg-gray-100 text-gray-500'
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function OppDetailSlideOver({ oppId, onClose }) {
  const [opp, setOpp]             = useState(null)
  const [loading, setLoading]     = useState(true)
  const [openQuote, setOpenQuote] = useState(null)

  useEffect(() => {
    setLoading(true)
    setOpp(null)
    api.get(`/opportunities/${oppId}`)
      .then(r => {
        setOpp(r.data)
        if (r.data?.quotes?.length) setOpenQuote(r.data.quotes[0].id)
      })
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
              <div className="flex items-center gap-2 mt-1">
                {opp.status && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusPillClass(opp.status)}`}>
                    {opp.status}
                  </span>
                )}
                {opp.client_name && <span className="text-xs text-gray-500">{opp.client_name}</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        )}

        {!loading && !opp && (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Opportunity not found</div>
        )}

        {!loading && opp && (
          <div className="flex-1 overflow-y-auto">
            {/* Key fields grid */}
            <div className="grid grid-cols-2 gap-px bg-gray-100 border-b border-gray-100">
              {[
                { label: 'Stage',       value: opp.stage || '—' },
                { label: 'Amount',      value: fmt(opp.amount) },
                { label: 'Owner',       value: opp.assigned_resource_name || '—' },
                { label: 'Category',    value: opp.category || '—' },
                { label: 'Close Date',  value: fmtDate(opp.expected_close) },
                { label: 'Create Date', value: fmtDate(opp.created_date) },
                { label: 'Closed Date', value: fmtDate(opp.closed_date) },
                { label: 'PO Numbers',  value: opp.po_numbers?.join(', ') || '—' },
              ].map(f => (
                <div key={f.label} className="bg-white px-4 py-3">
                  <p className="text-xs text-gray-400">{f.label}</p>
                  <p className="text-sm font-medium text-gray-900 font-mono">{f.value}</p>
                </div>
              ))}
            </div>

            {/* Quotes */}
            {opp.quotes?.length > 0 && (
              <div className="border-b border-gray-100">
                <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quotes ({opp.quotes.length})</h3>
                  <span className="text-xs text-gray-400">{fmt(opp.quotes.reduce((s, q) => s + (q.amount || 0), 0))} total</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {opp.quotes.map(q => (
                    <div key={q.id}>
                      <button className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 text-left"
                        onClick={() => setOpenQuote(openQuote === q.id ? null : q.id)}>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{q.title || `Quote ${q.quote_number || q.id}`}</p>
                          <p className="text-xs text-gray-500">
                            {q.quote_number && `#${q.quote_number} · `}{q.status && `${q.status} · `}{q.amount != null && fmt(q.amount)}
                          </p>
                        </div>
                        <ChevronDown size={14} className={`text-gray-400 transition-transform ${openQuote === q.id ? '' : '-rotate-90'}`} />
                      </button>
                      {openQuote === q.id && (
                        <div className="border-t border-gray-100 overflow-x-auto">
                          <QuoteLineItems items={q.items || []} quoteAmount={q.amount} compact={true} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Orders */}
            {opp.orders?.length > 0 && (
              <div>
                <div className="px-5 py-3 bg-gray-50">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Linked Orders ({opp.orders.length})</h3>
                </div>
                <div className="divide-y divide-gray-50 px-5">
                  {opp.orders.map(o => (
                    <div key={o.id} className="py-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{o.supplier_order_number || o.id}</p>
                        <p className="text-xs text-gray-500">{o.supplier_name || o.adapter_key} · {fmtDate(o.order_date)}</p>
                      </div>
                      <span className="text-xs font-medium text-gray-600">{fmt(o.total_amount)}</span>
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
