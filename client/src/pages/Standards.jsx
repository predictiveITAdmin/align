import { useEffect, useState } from 'react'
import { ShieldCheck, Plus, ChevronRight, Edit2, Search } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Card, { CardHeader, CardBody } from '../components/Card'
import AlignmentBadge from '../components/AlignmentBadge'
import { api } from '../lib/api'

const severityColors = {
  aligned: 'bg-green-500',
  marginal: 'bg-yellow-500',
  vulnerable: 'bg-orange-500',
  highly_vulnerable: 'bg-red-500',
  not_assessed: 'bg-gray-300',
}

export default function Standards() {
  const [categories, setCategories] = useState([])
  const [standards, setStandards] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/standards/categories'),
      api.get('/standards'),
    ]).then(([catRes, stdRes]) => {
      setCategories(catRes.data || [])
      setStandards(stdRes.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const filteredStandards = standards.filter(s => {
    if (selectedCategory && s.category_id !== selectedCategory) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
        !(s.description || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const grouped = {}
  for (const s of filteredStandards) {
    const cat = s.category_name || 'Uncategorized'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(s)
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading standards...</div>

  return (
    <div>
      <PageHeader
        title="Standards Library"
        description={`${standards.length} standards across ${categories.length} categories`}
        actions={
          <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">
            <Plus size={16} /> Add Standard
          </button>
        }
      />

      <div className="flex gap-6">
        {/* Category sidebar */}
        <div className="w-64 shrink-0">
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-gray-900">Categories</h3>
            </CardHeader>
            <CardBody className="p-0">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${!selectedCategory ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600'}`}
              >
                <span>All Categories</span>
                <span className="text-xs text-gray-400">{standards.length}</span>
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${selectedCategory === cat.id ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600'}`}
                >
                  <span className="truncate">{cat.name}</span>
                  <span className="text-xs text-gray-400">{cat.standard_count}</span>
                </button>
              ))}
            </CardBody>
          </Card>

          {/* Source breakdown */}
          <Card className="mt-4">
            <CardHeader>
              <h3 className="text-sm font-semibold text-gray-900">Sources</h3>
            </CardHeader>
            <CardBody className="text-sm text-gray-500 space-y-2">
              <div className="flex justify-between">
                <span>Custom (seeded)</span>
                <span className="font-medium text-gray-700">
                  {standards.filter(s => !s.external_source).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span>MyITProcess</span>
                <span className="font-medium text-gray-700">
                  {standards.filter(s => s.external_source === 'myitprocess').length}
                </span>
              </div>
              <div className="flex justify-between">
                <span>ScalePad LMX</span>
                <span className="font-medium text-gray-700">
                  {standards.filter(s => s.external_source === 'scalepad').length}
                </span>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Standards list */}
        <div className="flex-1">
          {/* Search */}
          <div className="relative mb-4">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search standards..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {Object.entries(grouped).length === 0 ? (
            <Card className="py-16 text-center">
              <ShieldCheck size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-medium">No standards found</p>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your search or category filter</p>
            </Card>
          ) : (
            Object.entries(grouped).map(([catName, stds]) => (
              <Card key={catName} className="mb-4">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">{catName}</h3>
                    <span className="text-xs text-gray-400">{stds.length} standards</span>
                  </div>
                </CardHeader>
                <div className="divide-y divide-gray-50">
                  {stds.map(std => (
                    <div key={std.id} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium text-gray-900">{std.name}</h4>
                            {std.external_source && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">
                                {std.external_source === 'myitprocess' ? 'MITP' : 'LMX'}
                              </span>
                            )}
                          </div>
                          {std.description && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{std.description}</p>
                          )}
                          {std.criteria && (
                            <p className="text-xs text-gray-400 mt-1 italic">Criteria: {std.criteria}</p>
                          )}
                        </div>
                        <button className="p-1 text-gray-400 hover:text-gray-600">
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
