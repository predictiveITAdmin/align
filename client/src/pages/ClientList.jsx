import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Building2, ArrowUpDown } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import { AlignmentScore } from '../components/AlignmentBadge'
import { api } from '../lib/api'

export default function ClientList() {
  const [clients, setClients] = useState([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/clients')
      .then(d => setClients(d.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = clients
    .filter(c => c.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'score') return (b.health_score || 0) - (a.health_score || 0)
      return 0
    })

  return (
    <div>
      <PageHeader
        title="Clients"
        description={`${clients.length} managed client organizations`}
        actions={
          <button className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">
            Sync Clients
          </button>
        }
      />

      {/* Search & Filter bar */}
      <Card className="mb-6 p-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setSortBy(s => s === 'name' ? 'score' : 'name')}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <ArrowUpDown size={16} />
            Sort: {sortBy === 'name' ? 'Name' : 'Score'}
          </button>
        </div>
      </Card>

      {/* Client grid */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading clients...</div>
      ) : filtered.length === 0 ? (
        <Card className="py-20 text-center">
          <Building2 size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium text-gray-500">
            {search ? 'No clients match your search' : 'No clients synced yet'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Import clients from Autotask via Settings → Sync
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(client => (
            <Link key={client.id} to={`/clients/${client.id}`}>
              <Card className="p-5 hover:shadow-md hover:border-primary-200 transition-all cursor-pointer">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-100 text-primary-700 rounded-lg flex items-center justify-center font-bold text-sm">
                      {client.name?.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">
                        {client.name}
                      </h3>
                      <p className="text-xs text-gray-400">
                        {client.autotask_company_id ? `AT#${client.autotask_company_id}` : 'Not linked'}
                      </p>
                    </div>
                  </div>
                  <AlignmentScore score={client.health_score} size="sm" />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-50 rounded-lg py-2">
                    <p className="text-xs text-gray-400">Assets</p>
                    <p className="text-sm font-semibold text-gray-700">—</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg py-2">
                    <p className="text-xs text-gray-400">Recs</p>
                    <p className="text-sm font-semibold text-gray-700">—</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg py-2">
                    <p className="text-xs text-gray-400">CSAT</p>
                    <p className="text-sm font-semibold text-gray-700">—</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
