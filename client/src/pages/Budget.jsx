import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DollarSign, RefreshCw, Loader2, Building2, ArrowUpDown,
  ChevronRight, TrendingUp, ChevronDown,
} from 'lucide-react'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import Card, { CardBody } from '../components/Card'

function fmt(n, compact = false) {
  if (!n || isNaN(n)) return '—'
  if (compact && n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (compact && n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const SORT_OPTIONS = [
  { value: 'total_desc',    label: 'Total (high → low)' },
  { value: 'total_asc',     label: 'Total (low → high)' },
  { value: 'name_asc',      label: 'Name (A–Z)' },
  { value: 'one_time_desc', label: 'One-time (high)' },
]

export default function Budget() {
  const navigate = useNavigate()
  const curYear  = new Date().getFullYear()

  const [years,   setYears]   = useState([curYear, curYear + 1, curYear + 2, curYear + 3])
  const [year,    setYear]    = useState(curYear)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [sort,    setSort]    = useState('total_desc')
  const [search,  setSearch]  = useState('')
  const [sortCol, setSortCol] = useState('total')
  const [sortDir, setSortDir] = useState('desc')

  const toggleSort = (col) => {
    if (col === sortCol) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir(col === 'client_name' ? 'asc' : 'desc')
    }
  }

  useEffect(() => {
    api.get('/budget/years')
      .then(r => { if (Array.isArray(r) && r.length) setYears(r) })
      .catch(() => {})
  }, [])

  const loadData = useCallback(() => {
    setLoading(true)
    api.get(`/budget/dashboard?year=${year}`)
      .then(r => setData(r))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [year])

  useEffect(() => { loadData() }, [loadData])

  const clients = useMemo(() => {
    if (!data?.clients) return []
    let rows = data.clients
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(c => c.client_name.toLowerCase().includes(q))
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      let aVal, bVal
      if (sortCol === 'client_name') {
        return dir * a.client_name.localeCompare(b.client_name)
      } else if (sortCol.startsWith('q')) {
        const q = parseInt(sortCol.slice(1))
        aVal = a.quarters[q]?.total || 0
        bVal = b.quarters[q]?.total || 0
      } else {
        aVal = a[sortCol] || 0
        bVal = b[sortCol] || 0
      }
      return dir * (aVal - bVal)
    })
  }, [data, sortCol, sortDir, search])

  const s = data?.summary || {}

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      <PageHeader
        title="Budget"
        description="Client budget overview — click a client to view their detailed forecast"
        actions={
          <button onClick={loadData} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      {/* Year Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        {years.map(y => (
          <button key={y} onClick={() => setYear(y)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
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
      </div>

      {/* Summary strip */}
      {!loading && s.grand_total > 0 && (
        <div className="flex items-center gap-6 mb-5 px-1">
          <div className="flex items-center gap-2 text-sm">
            <DollarSign size={15} className="text-primary-500" />
            <span className="text-gray-500">Total FY {year}:</span>
            <span className="font-bold text-gray-900">{fmt(s.grand_total)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp size={15} className="text-amber-500" />
            <span className="text-gray-500">Monthly recurring:</span>
            <span className="font-semibold text-gray-700">{fmt(s.total_monthly)}/mo</span>
          </div>
          <div className="text-sm text-gray-400">
            {s.client_count} client{s.client_count !== 1 ? 's' : ''} with spend
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          <span className="text-sm">Loading FY {year}…</span>
        </div>
      )}

      {/* Client table */}
      {!loading && (
        <Card>
          <CardBody>
            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-4">
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search clients…"
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 w-52"
              />
              <div className="flex items-center gap-1.5 ml-auto text-xs text-gray-500">
                <ArrowUpDown size={12} />
                <select value={sort} onChange={e => setSort(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <span className="text-xs text-gray-400">{clients.length} clients</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {[
                      { col: 'client_name', label: 'Client', align: 'left',  px: 'px-4', bold: false },
                      { col: 'q1',          label: 'Q1',     align: 'right', px: 'px-3', bold: false },
                      { col: 'q2',          label: 'Q2',     align: 'right', px: 'px-3', bold: false },
                      { col: 'q3',          label: 'Q3',     align: 'right', px: 'px-3', bold: false },
                      { col: 'q4',          label: 'Q4',     align: 'right', px: 'px-3', bold: false },
                      { col: 'one_time',    label: 'One-time', align: 'right', px: 'px-3', bold: false },
                      { col: 'monthly',     label: 'Monthly',  align: 'right', px: 'px-3', bold: false },
                      { col: 'total',       label: 'Total',    align: 'right', px: 'px-4', bold: true },
                    ].map(({ col, label, align, px, bold }) => (
                      <th
                        key={col}
                        onClick={() => toggleSort(col)}
                        className={`text-${align} ${px} py-2.5 text-xs font-semibold ${bold ? 'text-gray-900' : 'text-gray-500'} uppercase tracking-wide cursor-pointer select-none hover:text-gray-700`}
                      >
                        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
                          {label}
                          {sortCol === col && (
                            <ChevronDown size={12} className={`transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} />
                          )}
                        </span>
                      </th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clients.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-14 text-gray-400 text-sm">
                        No budget data for FY {year}. Set a schedule year on a recommendation to see it here.
                      </td>
                    </tr>
                  ) : clients.map(c => (
                    <tr
                      key={c.client_id}
                      onClick={() => navigate(`/budget/${c.client_id}`)}
                      className="hover:bg-primary-50/40 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Building2 size={13} className="text-gray-300 shrink-0" />
                          <span className="font-medium text-gray-800 group-hover:text-primary-700 transition-colors truncate max-w-[200px]">
                            {c.client_name}
                          </span>
                        </div>
                      </td>
                      {[1, 2, 3, 4].map(q => (
                        <td key={q} className="px-3 py-2.5 text-right text-xs text-gray-600 tabular-nums">
                          {c.quarters[q]?.total > 0 ? fmt(c.quarters[q].total, true) : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right text-xs text-gray-600 tabular-nums">
                        {c.one_time > 0 ? fmt(c.one_time, true) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-600 tabular-nums">
                        {c.monthly > 0 ? fmt(c.monthly, true) + '/mo' : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900 tabular-nums">
                        {c.total > 0 ? fmt(c.total, true) : <span className="text-gray-400 font-normal">—</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        <ChevronRight size={13} className="text-gray-300 group-hover:text-primary-400 transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {clients.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-4 py-2.5 text-xs font-semibold text-gray-500">{clients.length} clients</td>
                      {[1, 2, 3, 4].map(q => {
                        const t = clients.reduce((s, c) => s + (c.quarters[q]?.total || 0), 0)
                        return <td key={q} className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 tabular-nums">{t > 0 ? fmt(t, true) : '—'}</td>
                      })}
                      <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 tabular-nums">
                        {fmt(clients.reduce((s, c) => s + c.one_time, 0), true)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 tabular-nums">
                        {fmt(clients.reduce((s, c) => s + c.monthly, 0), true)}/mo
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums">
                        {fmt(clients.reduce((s, c) => s + c.total, 0), true)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
