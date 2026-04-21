import { useState, useEffect } from 'react'
import {
  Search, X, ChevronDown, Edit2, CheckCircle2, Package, RefreshCw, Filter,
} from 'lucide-react'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'

const CATEGORY_OPTIONS = [
  '', 'Endpoint protection', 'RMM', 'Office suite', 'OS', 'Web browser',
  'Cloud storage', 'Communication', 'Remote control', 'Accounting', 'Runtime',
  'Backup', 'PDF', 'Maintenance utility', 'Password manager', 'VPN',
  'Database', 'Development', 'ERP', 'CRM', 'LOB', 'Network', 'Other',
]

const CAT_COLORS = {
  'Endpoint protection': 'bg-red-50 text-red-700',
  'RMM': 'bg-indigo-50 text-indigo-700',
  'Office suite': 'bg-blue-50 text-blue-700',
  'OS': 'bg-slate-100 text-slate-700',
  'Web browser': 'bg-cyan-50 text-cyan-700',
  'Cloud storage': 'bg-sky-50 text-sky-700',
  'Communication': 'bg-violet-50 text-violet-700',
  'Remote control': 'bg-orange-50 text-orange-700',
  'Accounting': 'bg-emerald-50 text-emerald-700',
  'Runtime': 'bg-gray-100 text-gray-600',
  'Backup': 'bg-green-50 text-green-700',
  'PDF': 'bg-rose-50 text-rose-700',
  'Maintenance utility': 'bg-amber-50 text-amber-700',
  'Database': 'bg-purple-50 text-purple-700',
  'LOB': 'bg-teal-50 text-teal-700',
  'VPN': 'bg-lime-50 text-lime-700',
  'Network': 'bg-yellow-50 text-yellow-700',
}

export default function Software() {
  const [products, setProducts] = useState([])
  const [total, setTotal]       = useState(0)
  const [publishers, setPublishers] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [search, setSearch]     = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [pubFilter, setPubFilter] = useState('')
  const [lobFilter, setLobFilter] = useState('')
  const [page, setPage]         = useState(1)
  const [sortCol, setSortCol]   = useState('device_count')
  const [sortDir, setSortDir]   = useState('desc')
  const [editing, setEditing]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [inferring, setInferring] = useState(false)
  const [hideNoise, setHideNoise] = useState(true)
  const [maxDevices, setMaxDevices] = useState(1)
  const perPage = 50

  function load(pg = page) {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page: pg, per_page: perPage, sort: sortCol, dir: sortDir, hide_noise: hideNoise })
    if (search) params.set('search', search)
    if (catFilter) params.set('category', catFilter)
    if (pubFilter) params.set('publisher', pubFilter)
    api.get(`/software/catalog?${params}`)
      .then(res => {
        let data = res.data || []
        if (lobFilter === 'lob') data = data.filter(row => row.is_lob)
        else if (lobFilter === 'not-lob') data = data.filter(row => !row.is_lob)
        setProducts(data)
        setTotal(res.total || 0)
        setPublishers(res.publishers || [])
        setCategories(res.categories || [])
        setMaxDevices(data.length > 0 ? Math.max(...data.map(row => row.device_count || 0)) : 1)
        setPage(pg)
      })
      .catch(err => {
        console.error('Software catalog load error:', err)
        setError(err.message || 'Failed to load catalog')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(1) }, [search, catFilter, pubFilter, lobFilter, sortCol, sortDir, hideNoise])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'product_name' || col === 'publisher' || col === 'category' ? 'asc' : 'desc') }
  }

  function renderSortHeader(col, label, className = '') {
    return (
      <th onClick={() => toggleSort(col)}
        className={`text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors ${className}`}>
        <span className="inline-flex items-center gap-1">
          {label}
          {sortCol === col && <ChevronDown size={12} className={`transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} />}
        </span>
      </th>
    )
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    try {
      await api.post('/software/catalog/bulk-update', {
        updates: [{
          product_name: editing.product_name,
          publisher: editing.publisher,
          category: editing.category,
          is_lob: editing.is_lob,
        }]
      })
      setProducts(prev => prev.map(row =>
        row.product_name === editing.product_name
          ? { ...row, publisher: editing.publisher, category: editing.category, is_lob: editing.is_lob }
          : row
      ))
      setEditing(null)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  async function toggleLob(product) {
    const newLob = !product.is_lob
    try {
      await api.post('/software/catalog/bulk-update', {
        updates: [{ product_name: product.product_name, is_lob: newLob }]
      })
      setProducts(prev => prev.map(row =>
        row.product_name === product.product_name ? { ...row, is_lob: newLob } : row
      ))
    } catch (err) { console.error(err) }
  }

  async function inferPublishers() {
    setInferring(true)
    try {
      const res = await api.post('/software/infer-publishers')
      alert(`Auto-detected publisher for ${res.updated} software records.`)
      load(page)
    } catch (err) { console.error(err) }
    finally { setInferring(false) }
  }

  const totalPages = Math.ceil(total / perPage)
  const hasFilters = search || pubFilter || catFilter || lobFilter

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      <PageHeader title="Software Catalog" description={`${total} products across all clients`} />

      {/* Action bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-gray-500 cursor-pointer bg-white border border-gray-200 rounded-lg px-3 py-1.5">
            <input type="checkbox" checked={hideNoise} onChange={e => setHideNoise(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            Hide drivers &amp; noise
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={inferPublishers} disabled={inferring}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={13} className={inferring ? 'animate-spin' : ''} />
            {inferring ? 'Detecting...' : 'Auto-Detect Publishers'}
          </button>
        </div>
      </div>

      {/* Active filter pills */}
      {hasFilters && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-400"><Filter size={12} className="inline -mt-0.5" /> Filters:</span>
          {search && (
            <span className="inline-flex items-center gap-1 text-xs bg-primary-50 text-primary-700 border border-primary-200 rounded-full px-2.5 py-0.5">
              Search: "{search}" <button onClick={() => setSearch('')}><X size={11} /></button>
            </span>
          )}
          {pubFilter && (
            <span className="inline-flex items-center gap-1 text-xs bg-primary-50 text-primary-700 border border-primary-200 rounded-full px-2.5 py-0.5">
              Publisher: {pubFilter} <button onClick={() => setPubFilter('')}><X size={11} /></button>
            </span>
          )}
          {catFilter && (
            <span className="inline-flex items-center gap-1 text-xs bg-primary-50 text-primary-700 border border-primary-200 rounded-full px-2.5 py-0.5">
              Category: {catFilter} <button onClick={() => setCatFilter('')}><X size={11} /></button>
            </span>
          )}
          {lobFilter && (
            <span className="inline-flex items-center gap-1 text-xs bg-primary-50 text-primary-700 border border-primary-200 rounded-full px-2.5 py-0.5">
              {lobFilter === 'lob' ? 'LOB Only' : 'Non-LOB'} <button onClick={() => setLobFilter('')}><X size={11} /></button>
            </span>
          )}
          <button onClick={() => { setSearch(''); setPubFilter(''); setCatFilter(''); setLobFilter('') }}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium">Clear all</button>
        </div>
      )}

      {/* Content */}
      {error ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
          <p className="text-red-500 mb-3">Error: {error}</p>
          <button onClick={() => load(1)} className="text-sm text-primary-600 hover:text-primary-700 font-medium">Retry</button>
        </div>
      ) : loading ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-6 h-6 border-3 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading software catalog...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
          <Package size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No products found</p>
          {hasFilters && <button onClick={() => { setSearch(''); setPubFilter(''); setCatFilter(''); setLobFilter('') }}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium mt-2">Clear filters</button>}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                {/* Sort row */}
                <tr className="border-b border-gray-200">
                  {renderSortHeader('publisher', 'Publisher', 'text-left w-40')}
                  {renderSortHeader('product_name', 'Product Name', 'text-left')}
                  {renderSortHeader('category', 'Category', 'text-left w-40')}
                  {renderSortHeader('device_count', 'Devices', 'text-left w-52')}
                  {renderSortHeader('client_count', 'Clients', 'text-center w-20')}
                  <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-3 w-14">LOB</th>
                  <th className="w-12"></th>
                </tr>
                {/* Filter row */}
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  {/* Publisher filter */}
                  <th className="px-3 py-1.5">
                    <select value={pubFilter} onChange={e => setPubFilter(e.target.value)}
                      className={`w-full text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-400 ${pubFilter ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-500'}`}>
                      <option value="">All ({publishers.length})</option>
                      {publishers.map(pub => <option key={pub.publisher} value={pub.publisher}>{pub.publisher} ({pub.cnt})</option>)}
                    </select>
                  </th>
                  {/* Product search */}
                  <th className="px-3 py-1.5">
                    <div className="relative">
                      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" placeholder="Search..." value={search}
                        onChange={e => setSearch(e.target.value)}
                        className={`w-full pl-7 pr-6 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary-400 ${search ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-white'}`} />
                      {search && <button onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={11} /></button>}
                    </div>
                  </th>
                  {/* Category filter */}
                  <th className="px-3 py-1.5">
                    <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                      className={`w-full text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-400 ${catFilter ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-500'}`}>
                      <option value="">All ({categories.length})</option>
                      {categories.map(cat => <option key={cat.category} value={cat.category}>{cat.category} ({cat.cnt})</option>)}
                    </select>
                  </th>
                  {/* Devices - no filter */}
                  <th className="px-3 py-1.5"></th>
                  {/* Clients - no filter */}
                  <th className="px-3 py-1.5"></th>
                  {/* LOB filter */}
                  <th className="px-3 py-1.5">
                    <select value={lobFilter} onChange={e => setLobFilter(e.target.value)}
                      className={`w-full text-[10px] border rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary-400 ${lobFilter ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-500'}`}>
                      <option value="">All</option>
                      <option value="lob">Yes</option>
                      <option value="not-lob">No</option>
                    </select>
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map(prod => {
                  const isEd = editing?.product_name === prod.product_name
                  const barPct = maxDevices > 0 ? Math.max(2, (prod.device_count / maxDevices) * 100) : 0
                  return (
                    <tr key={prod.product_name} className={`hover:bg-gray-50/70 transition-colors ${isEd ? 'bg-primary-50' : ''}`}>
                      {/* Publisher */}
                      <td className="px-4 py-2.5">
                        {isEd ? (
                          <input type="text" value={editing.publisher || ''}
                            onChange={e => setEditing(prev => ({ ...prev, publisher: e.target.value }))}
                            className="w-full text-xs border border-primary-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-400"
                            placeholder="Publisher..." />
                        ) : (
                          <span className={`text-xs font-medium ${prod.publisher ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                            {prod.publisher || '—'}
                          </span>
                        )}
                      </td>
                      {/* Product Name */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{prod.product_name}</span>
                          {prod.latest_version && (
                            <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5 whitespace-nowrap">
                              v{prod.latest_version}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Category */}
                      <td className="px-4 py-2.5">
                        {isEd ? (
                          <select value={editing.category || ''}
                            onChange={e => setEditing(prev => ({ ...prev, category: e.target.value }))}
                            className="w-full text-xs border border-primary-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-400">
                            {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c || '-- None --'}</option>)}
                          </select>
                        ) : prod.category ? (
                          <span className={`inline-block text-[11px] font-medium rounded-full px-2.5 py-0.5 ${CAT_COLORS[prod.category] || 'bg-gray-100 text-gray-600'}`}>
                            {prod.category}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 italic">—</span>
                        )}
                      </td>
                      {/* Devices */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${barPct}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-gray-700 w-10 text-right">{prod.device_count}</span>
                        </div>
                      </td>
                      {/* Clients */}
                      <td className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">{prod.client_count}</td>
                      {/* LOB */}
                      <td className="px-3 py-2.5 text-center">
                        {isEd ? (
                          <button onClick={() => setEditing(prev => ({ ...prev, is_lob: !prev.is_lob }))}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors mx-auto ${
                              editing.is_lob ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-gray-400'
                            }`}>
                            {editing.is_lob && <CheckCircle2 size={12} />}
                          </button>
                        ) : (
                          <button onClick={() => toggleLob(prod)}
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
                              prod.is_lob ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                            }`}>
                            {prod.is_lob ? <CheckCircle2 size={14} /> : <span className="text-[10px]">—</span>}
                          </button>
                        )}
                      </td>
                      {/* Edit */}
                      <td className="px-2 py-2.5 text-center">
                        {isEd ? (
                          <div className="flex items-center gap-1">
                            <button onClick={saveEdit} disabled={saving}
                              className="text-xs text-primary-600 hover:text-primary-700 font-medium">{saving ? '...' : 'Save'}</button>
                            <button onClick={() => setEditing(null)}
                              className="text-xs text-gray-400 hover:text-gray-600">X</button>
                          </div>
                        ) : (
                          <button onClick={() => setEditing({ product_name: prod.product_name, publisher: prod.publisher || '', category: prod.category || '', is_lob: prod.is_lob })}
                            className="text-gray-300 hover:text-primary-600 transition-colors">
                            <Edit2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-gray-500">Page {page} of {totalPages} · {total} products</span>
              <div className="flex items-center gap-1">
                <button onClick={() => load(1)} disabled={page <= 1}
                  className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white disabled:opacity-30 hover:bg-gray-50">First</button>
                <button onClick={() => load(page - 1)} disabled={page <= 1}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white disabled:opacity-30 hover:bg-gray-50">Prev</button>
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                  const pg = start + i
                  if (pg > totalPages) return null
                  return (
                    <button key={pg} onClick={() => load(pg)}
                      className={`px-2.5 py-1.5 text-xs rounded-lg ${pg === page ? 'bg-primary-600 text-white' : 'border border-gray-200 bg-white hover:bg-gray-50'}`}>
                      {pg}
                    </button>
                  )
                })}
                <button onClick={() => load(page + 1)} disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white disabled:opacity-30 hover:bg-gray-50">Next</button>
                <button onClick={() => load(totalPages)} disabled={page >= totalPages}
                  className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white disabled:opacity-30 hover:bg-gray-50">Last</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
