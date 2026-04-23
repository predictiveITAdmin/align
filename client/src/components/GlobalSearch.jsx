/**
 * GlobalSearch — ⌘K / Ctrl+K command palette search
 * Props: onOppClick(id), onOrderClick(id)
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Loader2, Target, Package, FileText, Users, CheckCircle2, Monitor } from 'lucide-react'
import { api } from '../lib/api'

const DIST_LABELS = {
  ingram_xi: 'Ingram Micro', tdsynnex_esolutions: 'TD Synnex', tdsynnex_ecx: 'TD Synnex',
  amazon_business_csv: 'Amazon Business', provantage_manual: 'Provantage', dell_premier: 'Dell Premier',
}

function fmt(val) {
  if (val == null) return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val)
}

const STATUS_COLORS = {
  Active: 'bg-green-50 text-green-700', Closed: 'bg-blue-50 text-blue-700',
  Implemented: 'bg-emerald-50 text-emerald-700', Lost: 'bg-red-50 text-red-600',
  delivered: 'bg-green-50 text-green-700', shipped: 'bg-cyan-50 text-cyan-700',
  partially_shipped: 'bg-yellow-50 text-yellow-700', backordered: 'bg-orange-50 text-orange-700',
}

function Pill({ label }) {
  const cls = STATUS_COLORS[label] || 'bg-gray-100 text-gray-500'
  return <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>{label}</span>
}

function SecHeader({ icon: Icon, label, count, color }) {
  return (
    <div className={`flex items-center gap-1.5 px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider ${color}`}>
      <Icon size={10} />{label} ({count})
    </div>
  )
}

export default function GlobalSearch({ onOppClick, onOrderClick }) {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor]   = useState(0)
  const inputRef = useRef()
  const navigate = useNavigate()

  // ⌘K / Ctrl+K open
  useEffect(() => {
    function h(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        // Don't open if already in an input (except our own)
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          if (document.activeElement !== inputRef.current) return
        }
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  // Focus on open
  useEffect(() => {
    if (open) { setQuery(''); setResults(null); setCursor(0); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) { setResults(null); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/search?q=${encodeURIComponent(query)}`)
        setResults(r); setCursor(0)
      } catch { setResults(null) }
      finally { setLoading(false) }
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  // Build flat item list for keyboard nav
  const flat = buildFlat(results, { onOppClick, onOrderClick, navigate, close: () => setOpen(false) })

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, flat.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && flat[cursor]) { flat[cursor].action(); setOpen(false) }
  }

  // Trigger button (shown in sidebar)
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left rounded-lg text-sidebar-text/50 hover:text-sidebar-text hover:bg-white/5 transition-colors"
        title="Global Search (⌘K)">
        <Search size={14} className="shrink-0" />
        <span className="text-xs flex-1">Search…</span>
        <kbd className="text-[9px] opacity-40 font-mono">⌘K</kbd>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-start justify-center pt-[8vh] px-4"
      onClick={() => setOpen(false)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={e => e.stopPropagation()}>
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input ref={inputRef} value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search clients, opportunities, orders, quotes…"
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent" />
          {loading && <Loader2 size={14} className="animate-spin text-gray-400 shrink-0" />}
          {!loading && query && <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>}
          <kbd className="text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 border border-gray-200">Esc</kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {!query && <p className="text-center text-sm text-gray-400 py-10">Type to search everything…</p>}
          {query && query.length < 2 && <p className="text-center text-sm text-gray-400 py-10">Keep typing…</p>}
          {!loading && results && results.total === 0 && (
            <p className="text-center text-sm text-gray-400 py-10">No results for "{query}"</p>
          )}
          {results && results.total > 0 && (
            <div className="pb-3">
              {/* Clients */}
              {results.clients?.length > 0 && <>
                <SecHeader icon={Users} label="Clients" count={results.clients.length} color="text-blue-500" />
                {results.clients.map((c, i) => {
                  const idx = flat.findIndex(f => f.id === `c-${c.id}`)
                  return (
                    <button key={c.id} onClick={() => { navigate(`/clients/${c.id}`); setOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 transition-colors ${cursor === idx ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                    </button>
                  )
                })}
              </>}

              {/* Opportunities */}
              {results.opportunities?.length > 0 && <>
                <SecHeader icon={Target} label="Opportunities" count={results.opportunities.length} color="text-primary-500" />
                {results.opportunities.map(o => {
                  const idx = flat.findIndex(f => f.id === `o-${o.id}`)
                  return (
                    <button key={o.id} onClick={() => { onOppClick?.(o.id); setOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 transition-colors ${cursor === idx ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 truncate">{o.title}</span>
                            {o.status && <Pill label={o.status} />}
                          </div>
                          <p className="text-xs text-gray-500 truncate mt-0.5">
                            {o.client_name}{o.stage && ` · ${o.stage}`}
                          </p>
                          {/* Linked quotes + orders */}
                          {(o.quotes?.length > 0 || o.orders?.length > 0) && (
                            <div className="mt-1 space-y-0.5">
                              {o.quotes?.slice(0, 2).map(q => (
                                <p key={q.id} className="text-xs text-gray-400 flex items-center gap-1 pl-3">
                                  <span className="text-gray-300">└</span>
                                  <FileText size={9} className="shrink-0" />
                                  {q.quote_number ? `#${q.quote_number}` : q.title}
                                  {q.amount != null && <span className="ml-1">{fmt(q.amount)}</span>}
                                </p>
                              ))}
                              {o.orders?.slice(0, 2).map(ord => (
                                <p key={ord.id} className="text-xs text-gray-400 flex items-center gap-1 pl-3">
                                  <span className="text-gray-300">└</span>
                                  <Package size={9} className="shrink-0" />
                                  {DIST_LABELS[ord.distributor] || ord.distributor} #{ord.distributor_order_id}
                                  {ord.status && <Pill label={ord.status} />}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                        {o.amount != null && <span className="text-xs font-medium text-gray-600 shrink-0">{fmt(o.amount)}</span>}
                      </div>
                    </button>
                  )
                })}
              </>}

              {/* Quotes */}
              {results.quotes?.length > 0 && <>
                <SecHeader icon={FileText} label="Quotes" count={results.quotes.length} color="text-indigo-500" />
                {results.quotes.map(q => {
                  const idx = flat.findIndex(f => f.id === `q-${q.id}`)
                  return (
                    <button key={q.id} onClick={() => { onOppClick?.(q.opportunity_id); setOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 transition-colors ${cursor === idx ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {q.quote_number && <span className="font-mono text-gray-500 mr-1.5">#{q.quote_number}</span>}
                            {q.title}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{q.client_name} · {q.opportunity_title}</p>
                        </div>
                        {q.amount != null && <span className="text-xs font-medium text-gray-600 shrink-0">{fmt(q.amount)}</span>}
                      </div>
                    </button>
                  )
                })}
              </>}

              {/* Orders */}
              {results.orders?.length > 0 && <>
                <SecHeader icon={Package} label="Orders" count={results.orders.length} color="text-cyan-500" />
                {results.orders.map(ord => {
                  const idx = flat.findIndex(f => f.id === `ord-${ord.id}`)
                  return (
                    <button key={ord.id} onClick={() => { onOrderClick?.(ord.id); setOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 transition-colors ${cursor === idx ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-gray-900 font-mono">#{ord.distributor_order_id}</span>
                            {ord.status && <Pill label={ord.status} />}
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            {DIST_LABELS[ord.distributor] || ord.distributor}
                            {ord.po_number && ` · PO: ${ord.po_number}`}
                            {ord.client_name && ` · ${ord.client_name}`}
                          </p>
                        </div>
                        {ord.total != null && <span className="text-xs font-medium text-gray-600 shrink-0">{fmt(ord.total)}</span>}
                      </div>
                    </button>
                  )
                })}
              </>}

              {/* Recommendations */}
              {results.recs?.length > 0 && <>
                <SecHeader icon={CheckCircle2} label="Recommendations" count={results.recs.length} color="text-green-500" />
                {results.recs.map(r => {
                  const idx = flat.findIndex(f => f.id === `r-${r.id}`)
                  return (
                    <button key={r.id} onClick={() => { navigate(`/clients/${r.client_id}?tab=recommendations`); setOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 transition-colors ${cursor === idx ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                      <p className="text-sm font-medium text-gray-900">{r.title}</p>
                      <p className="text-xs text-gray-500">{r.client_name}{r.priority && ` · ${r.priority}`}</p>
                    </button>
                  )
                })}
              </>}

              {/* Assets */}
              {results.assets?.length > 0 && <>
                <SecHeader icon={Monitor} label="Assets" count={results.assets.length} color="text-gray-500" />
                {results.assets.map(a => {
                  const idx = flat.findIndex(f => f.id === `a-${a.id}`)
                  return (
                    <button key={a.id} onClick={() => { navigate(`/clients/${a.client_id}?tab=hardware`); setOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 transition-colors ${cursor === idx ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                      <p className="text-sm font-medium text-gray-900">{a.name}</p>
                      <p className="text-xs text-gray-500">
                        {a.client_name}{a.model && ` · ${a.model}`}
                        {a.serial_number && <span className="font-mono"> · {a.serial_number}</span>}
                      </p>
                    </button>
                  )
                })}
              </>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function buildFlat(results, { onOppClick, onOrderClick, navigate, close }) {
  if (!results) return []
  const items = []
  for (const c of results.clients || [])       items.push({ id: `c-${c.id}`,   action: () => { navigate(`/clients/${c.id}`); close() } })
  for (const o of results.opportunities || []) items.push({ id: `o-${o.id}`,   action: () => { onOppClick?.(o.id); close() } })
  for (const q of results.quotes || [])        items.push({ id: `q-${q.id}`,   action: () => { onOppClick?.(q.opportunity_id); close() } })
  for (const o of results.orders || [])        items.push({ id: `ord-${o.id}`, action: () => { onOrderClick?.(o.id); close() } })
  for (const r of results.recs || [])          items.push({ id: `r-${r.id}`,   action: () => { navigate(`/clients/${r.client_id}?tab=recommendations`); close() } })
  for (const a of results.assets || [])        items.push({ id: `a-${a.id}`,   action: () => { navigate(`/clients/${a.client_id}?tab=hardware`); close() } })
  return items
}
