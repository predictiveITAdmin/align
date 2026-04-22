/**
 * QuoteLineItems — rich quote line-item table with cost/margin toggle
 *
 * Props:
 *   items     — array of quote_items rows
 *   quoteAmount — quote.amount (used to derive tax when subtotal ≠ amount)
 *   compact   — boolean, smaller padding for slide-overs (default false)
 */
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

function fmt(val) {
  if (val == null || val === '') return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(val)
}

function pct(val) {
  if (val == null || !isFinite(val)) return '—'
  return `${val.toFixed(1)}%`
}

export default function QuoteLineItems({ items = [], quoteAmount = null, compact = false }) {
  const [showCost, setShowCost] = useState(false)

  if (!items.length) {
    return <p className="text-xs text-gray-400 px-3 py-2">No line items synced</p>
  }

  // Derived totals
  const subtotal = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0)
  const totalCost = items.reduce((s, i) => s + ((Number(i.unit_cost) || 0) * (Number(i.quantity) || 1)), 0)
  const grossProfit = subtotal - totalCost
  const marginPct = subtotal > 0 ? (grossProfit / subtotal) * 100 : null
  const markupPct = totalCost > 0 ? (grossProfit / totalCost) * 100 : null
  // Tax = quote.amount − subtotal (if amount is provided and differs)
  const tax = quoteAmount != null && Math.abs(quoteAmount - subtotal) > 0.005
    ? quoteAmount - subtotal
    : null
  const total = quoteAmount ?? subtotal

  const px = compact ? 'px-3' : 'px-4'
  const py = compact ? 'py-1.5' : 'py-2.5'
  const textSz = compact ? 'text-xs' : 'text-sm'

  const hasCostData = items.some(i => i.unit_cost != null)

  return (
    <div>
      {/* Toggle */}
      {hasCostData && (
        <div className="flex justify-end px-3 pt-2 pb-1">
          <button
            onClick={() => setShowCost(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors
              ${showCost
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}
          >
            {showCost ? <EyeOff size={12} /> : <Eye size={12} />}
            {showCost ? 'Hide cost' : 'Show cost'}
          </button>
        </div>
      )}

      {/* Header row */}
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50/60 border-y border-gray-100">
            <th className={`text-left ${px} py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-6`}>#</th>
            <th className={`text-left ${px} py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider`}>MFG Part#</th>
            <th className={`text-left ${px} py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider`}>Description</th>
            <th className={`text-center ${px} py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-12`}>Qty</th>
            <th className={`text-right ${px} py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider`}>Unit Price</th>
            {showCost && <>
              <th className={`text-right ${px} py-2 text-[10px] font-semibold text-indigo-400 uppercase tracking-wider`}>Unit Cost</th>
              <th className={`text-right ${px} py-2 text-[10px] font-semibold text-indigo-400 uppercase tracking-wider`}>Ext. Cost</th>
            </>}
            <th className={`text-right ${px} py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider`}>Extended</th>
            {showCost && <>
              <th className={`text-right ${px} py-2 text-[10px] font-semibold text-indigo-400 uppercase tracking-wider`}>Profit $</th>
              <th className={`text-right ${px} py-2 text-[10px] font-semibold text-indigo-400 uppercase tracking-wider`}>Markup %</th>
            </>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.map((item, i) => {
            const qty      = Number(item.quantity) || 1
            const unitCost = item.unit_cost != null ? Number(item.unit_cost) : null
            const extCost  = unitCost != null ? unitCost * qty : null
            const extPrice = item.line_total != null
              ? Number(item.line_total)
              : item.unit_price != null ? Number(item.unit_price) * qty : null
            const lineProfit = (extPrice != null && extCost != null) ? extPrice - extCost : null
            const lineMarkup = (extCost != null && extCost > 0 && lineProfit != null) ? (lineProfit / extCost) * 100 : null

            return (
              <tr key={item.id || i} className="hover:bg-gray-50/40 transition-colors">
                <td className={`${px} ${py} ${textSz} text-gray-400 text-center`}>{i + 1}</td>
                <td className={`${px} ${py}`}>
                  <span className="font-mono text-xs text-gray-600">{item.mfg_part_number || '—'}</span>
                </td>
                <td className={`${px} ${py} max-w-[240px]`}>
                  <p className={`${textSz} text-gray-800`}>{item.description || '—'}</p>
                  {item.manufacturer && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{item.manufacturer}</p>
                  )}
                </td>
                <td className={`${px} ${py} ${textSz} text-gray-700 text-center`}>{qty}</td>
                <td className={`${px} ${py} ${textSz} text-gray-700 text-right font-medium`}>
                  {item.unit_price != null ? fmt(item.unit_price) : '—'}
                </td>
                {showCost && <>
                  <td className={`${px} ${py} text-xs text-indigo-700 text-right`}>
                    {unitCost != null ? fmt(unitCost) : '—'}
                  </td>
                  <td className={`${px} ${py} text-xs text-indigo-700 text-right`}>
                    {extCost != null ? fmt(extCost) : '—'}
                  </td>
                </>}
                <td className={`${px} ${py} ${textSz} text-gray-900 text-right font-semibold`}>
                  {extPrice != null ? fmt(extPrice) : '—'}
                </td>
                {showCost && <>
                  <td className={`${px} ${py} text-xs font-medium text-right ${lineProfit != null && lineProfit > 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {lineProfit != null ? fmt(lineProfit) : '—'}
                  </td>
                  <td className={`${px} ${py} text-xs font-medium text-right ${lineMarkup != null && lineMarkup > 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {lineMarkup != null ? pct(lineMarkup) : '—'}
                  </td>
                </>}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Totals footer */}
      <div className={`border-t-2 border-gray-200 bg-gray-50/50 ${px}`}>
        {/* One row for cost totals when expanded */}
        {showCost && hasCostData && (
          <div className="flex justify-end gap-8 py-2 border-b border-gray-100">
            <div className="text-right">
              <p className="text-[10px] text-indigo-400 uppercase tracking-wider">Total Cost</p>
              <p className="text-sm font-semibold text-indigo-700">{fmt(totalCost)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-indigo-400 uppercase tracking-wider">Gross Profit</p>
              <p className={`text-sm font-semibold ${grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(grossProfit)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-indigo-400 uppercase tracking-wider">Margin %</p>
              <p className={`text-sm font-semibold ${marginPct != null && marginPct >= 0 ? 'text-green-700' : 'text-red-600'}`}>{pct(marginPct)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-indigo-400 uppercase tracking-wider">Markup %</p>
              <p className={`text-sm font-semibold ${markupPct != null && markupPct >= 0 ? 'text-green-700' : 'text-red-600'}`}>{pct(markupPct)}</p>
            </div>
          </div>
        )}

        {/* Subtotal / Tax / Total */}
        <div className="flex flex-col items-end py-2 gap-1 text-sm">
          <div className="flex items-center gap-12 min-w-[220px] justify-between">
            <span className="text-gray-500 text-xs uppercase tracking-wider">Subtotal</span>
            <span className="font-medium text-gray-900">{fmt(subtotal)}</span>
          </div>
          {tax != null && (
            <div className="flex items-center gap-12 min-w-[220px] justify-between">
              <span className="text-gray-500 text-xs uppercase tracking-wider">Est. Taxes</span>
              <span className="text-gray-700">{fmt(tax)}</span>
            </div>
          )}
          <div className="flex items-center gap-12 min-w-[220px] justify-between border-t border-gray-200 pt-1 mt-0.5">
            <span className="font-semibold text-gray-700 text-xs uppercase tracking-wider">Total</span>
            <span className="font-bold text-gray-900 text-base">{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
