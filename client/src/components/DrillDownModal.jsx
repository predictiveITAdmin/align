/**
 * DrillDownModal — reusable drill-down table modal for stat widgets
 *
 * Usage:
 *   <DrillDownModal
 *     title="MFA Issues"
 *     subtitle="Users with MFA disabled"
 *     columns={[
 *       { key: 'user', label: 'User' },
 *       { key: 'client', label: 'Client' },
 *       { key: 'status', label: 'Status', render: (v) => <Badge>{v}</Badge> },
 *     ]}
 *     rows={data}
 *     onClose={() => setModal(null)}
 *   />
 */
import { useState, useMemo } from 'react'
import { X, Search, Download, ChevronUp, ChevronDown } from 'lucide-react'

export default function DrillDownModal({ title, subtitle, columns, rows, onClose, emptyMessage }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ col: null, dir: 'asc' })

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(row =>
      columns.some(col => {
        const val = row[col.key]
        return val != null && String(val).toLowerCase().includes(q)
      })
    )
  }, [rows, search, columns])

  const sorted = useMemo(() => {
    if (!sort.col) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sort.col] ?? ''
      const bv = b[sort.col] ?? ''
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  function toggleSort(key) {
    setSort(prev =>
      prev.col === key
        ? { col: key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col: key, dir: 'asc' }
    )
  }

  function exportCsv() {
    const header = columns.map(c => `"${c.label}"`).join(',')
    const lines = sorted.map(row =>
      columns.map(col => {
        const val = row[col.key] ?? ''
        return `"${String(val).replace(/"/g, '""')}"`
      }).join(',')
    )
    const csv = [header, ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button onClick={exportCsv} title="Export CSV"
              className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
              <Download size={14} />
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Search + count */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter results…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>
          <span className="text-xs text-gray-400 shrink-0">
            {sorted.length}{sorted.length !== rows.length ? ` of ${rows.length}` : ''} rows
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {sorted.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              {emptyMessage || 'No data to display'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                <tr>
                  {columns.map(col => (
                    <th key={col.key}
                      onClick={() => !col.noSort && toggleSort(col.key)}
                      className={`text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap
                        ${!col.noSort ? 'cursor-pointer hover:text-gray-700 select-none' : ''}
                        ${col.align === 'right' ? 'text-right' : ''}`}>
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {!col.noSort && sort.col === col.key && (
                          sort.dir === 'asc'
                            ? <ChevronUp size={11} className="text-primary-500" />
                            : <ChevronDown size={11} className="text-primary-500" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map((row, i) => (
                  <tr key={row.id || i} className="hover:bg-gray-50 transition-colors">
                    {columns.map(col => (
                      <td key={col.key}
                        className={`px-4 py-2.5 ${col.align === 'right' ? 'text-right' : ''} ${col.className || ''}`}>
                        {col.render ? col.render(row[col.key], row) : (
                          <span className="text-sm text-gray-700">{row[col.key] ?? '—'}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
