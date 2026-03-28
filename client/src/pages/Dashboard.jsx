import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  ShieldCheck,
  Monitor,
  AlertTriangle,
  ThumbsUp,
  Target,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import Card, { CardHeader, CardBody } from '../components/Card'
import { api } from '../lib/api'

export default function Dashboard() {
  const [health, setHealth] = useState(null)
  const [clients, setClients] = useState([])

  useEffect(() => {
    api.get('/health').then(setHealth).catch(console.error)
    api.get('/clients').then(d => setClients(d.data || [])).catch(console.error)
  }, [])

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your managed client portfolio"
      />

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Clients"
          value={clients.length}
          icon={Building2}
          color="primary"
        />
        <StatCard
          label="Assessments Due"
          value="—"
          icon={ShieldCheck}
          color="yellow"
        />
        <StatCard
          label="Open Recommendations"
          value="—"
          icon={AlertTriangle}
          color="orange"
        />
        <StatCard
          label="Avg. CSAT Score"
          value="—"
          icon={ThumbsUp}
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Clients</h3>
              <Link
                to="/clients"
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                View all →
              </Link>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {clients.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-400">
                <Building2 size={40} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium">No clients synced yet</p>
                <p className="text-sm mt-1">
                  Run the Autotask sync from Settings to import your clients
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {clients.slice(0, 8).map((client) => (
                  <Link
                    key={client.id}
                    to={`/clients/${client.id}`}
                    className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-lg flex items-center justify-center font-semibold text-xs">
                        {client.name?.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {client.name}
                      </span>
                    </div>
                    <span className="text-sm text-gray-400">
                      {client.health_score != null
                        ? `${client.health_score}%`
                        : '—'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* System Status */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">System Status</h3>
          </CardHeader>
          <CardBody>
            {health ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">API Status</span>
                  <span className="inline-flex items-center gap-1.5 text-sm text-green-600 font-medium">
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                    {health.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Database</span>
                  <span className="text-sm text-gray-900 font-medium">
                    {health.database?.name} — {health.database?.tables} tables
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Version</span>
                  <span className="text-sm text-gray-900 font-medium">
                    {health.version}
                  </span>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Data Sources
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      'Autotask PSA',
                      'Datto RMM',
                      'IT Glue',
                      'ScalePad',
                      'MyITProcess',
                      'SaaS Alerts',
                      'Auvik',
                      'Customer Thermometer',
                    ].map((source) => (
                      <div
                        key={source}
                        className="flex items-center gap-2 text-xs text-gray-500"
                      >
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                        {source}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Loading...</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
