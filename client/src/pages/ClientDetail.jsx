import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  ShieldCheck,
  Monitor,
  ClipboardList,
  DollarSign,
  Target,
  ThumbsUp,
  Calendar,
  TrendingUp,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Card, { CardHeader, CardBody } from '../components/Card'
import StatCard from '../components/StatCard'
import { AlignmentScore } from '../components/AlignmentBadge'
import { api } from '../lib/api'

export default function ClientDetail() {
  const { id } = useParams()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/clients/${id}`)
      .then(d => setClient(d.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="text-center py-20 text-gray-400">Loading...</div>
  if (!client) return <div className="text-center py-20 text-gray-400">Client not found</div>

  return (
    <div>
      {/* Breadcrumb */}
      <Link
        to="/clients"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 mb-4"
      >
        <ArrowLeft size={16} /> Back to Clients
      </Link>

      {/* Client header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-100 text-primary-700 rounded-xl flex items-center justify-center font-bold text-xl">
            {client.name?.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Autotask #{client.autotask_company_id || '—'}
              {client.website && ` · ${client.website}`}
              {client.city && client.state && ` · ${client.city}, ${client.state}`}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">
            Alignment Score
          </p>
          <AlignmentScore score={client.health_score} size="lg" />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Assets" value="—" icon={Monitor} color="primary" />
        <StatCard label="Assessments" value="—" icon={ShieldCheck} color="green" />
        <StatCard label="Open Recs" value="—" icon={ClipboardList} color="orange" />
        <StatCard label="Annual Budget" value="—" icon={DollarSign} color="primary" />
        <StatCard label="Rocks (Q)" value="—" icon={Target} color="yellow" />
        <StatCard label="CSAT" value="—" icon={ThumbsUp} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assessment summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Assessment Summary</h3>
              <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                View Details →
              </button>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {[
                'Security', 'Networking', 'Endpoint Management', 'Cloud & SaaS',
                'Backup & DR', 'Email & Communication', 'Server & Infrastructure',
                'Compliance', 'Documentation', 'End User Experience',
              ].map(category => (
                <div key={category} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-44 shrink-0">{category}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                    <div
                      className="bg-gray-300 rounded-full h-2.5"
                      style={{ width: '0%' }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-10 text-right">—</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Quick actions / recent activity */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Quick Actions</h3>
          </CardHeader>
          <CardBody className="space-y-2">
            {[
              { icon: ShieldCheck,   label: 'New Assessment',    color: 'text-green-600' },
              { icon: ClipboardList, label: 'Add Recommendation', color: 'text-orange-600' },
              { icon: Calendar,      label: 'Schedule QBR',       color: 'text-primary-600' },
              { icon: Target,        label: 'Set Quarterly Rock', color: 'text-purple-600' },
              { icon: TrendingUp,    label: 'Generate Report',    color: 'text-gray-600' },
            ].map(({ icon: Icon, label, color }) => (
              <button
                key={label}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Icon size={18} className={color} />
                {label}
              </button>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
