import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Plus, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Card, { CardHeader, CardBody } from '../components/Card'
import { AlignmentScore } from '../components/AlignmentBadge'
import AlignmentBadge from '../components/AlignmentBadge'
import { api } from '../lib/api'

const statusConfig = {
  draft:      { label: 'Draft', icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100' },
  in_progress:{ label: 'In Progress', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
  completed:  { label: 'Completed', icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
}

export default function Assessments() {
  const [assessments, setAssessments] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newClientId, setNewClientId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      api.get('/assessments'),
      api.get('/clients'),
    ]).then(([aRes, cRes]) => {
      setAssessments(aRes.data || [])
      setClients(cRes.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  async function createAssessment() {
    if (!newClientId) return
    try {
      const res = await api.post('/assessments', {
        client_id: newClientId,
        title: newTitle || 'Technology Alignment Assessment',
      })
      navigate(`/assessments/${res.data.id}`)
    } catch (err) {
      console.error('Failed to create assessment:', err)
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading...</div>

  return (
    <div>
      <PageHeader
        title="Assessments"
        description={`${assessments.length} assessments across ${new Set(assessments.map(a => a.client_id)).size} clients`}
        actions={
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus size={16} /> New Assessment
          </button>
        }
      />

      {/* New assessment form */}
      {showNewForm && (
        <Card className="mb-6 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Create New Assessment</h3>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
              <select
                value={newClientId}
                onChange={e => setNewClientId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select a client...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Technology Alignment Assessment"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              onClick={createAssessment}
              disabled={!newClientId}
              className="px-6 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors disabled:opacity-50"
            >
              Create
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            This will create an assessment pre-populated with all {clients.length ? '' : '0'} active standards for scoring.
          </p>
        </Card>
      )}

      {/* Assessment list */}
      {assessments.length === 0 ? (
        <Card className="py-20 text-center">
          <ShieldCheck size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium text-gray-500">No assessments yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Create your first assessment to start evaluating a client against your standards library
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {assessments.map(a => {
            const cfg = statusConfig[a.status] || statusConfig.draft
            const StatusIcon = cfg.icon
            return (
              <Card
                key={a.id}
                className="p-5 hover:shadow-md hover:border-primary-200 transition-all cursor-pointer"
                onClick={() => navigate(`/assessments/${a.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary-100 text-primary-700 rounded-lg flex items-center justify-center font-bold text-sm">
                      {a.client_name?.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{a.title || 'Assessment'}</h3>
                      <p className="text-xs text-gray-500">{a.client_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-xs text-gray-400">Items</p>
                      <p className="text-sm font-semibold text-gray-700">{a.item_count || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400">Critical</p>
                      <p className="text-sm font-semibold text-red-600">{a.critical_count || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400">Score</p>
                      <AlignmentScore score={a.overall_score} size="sm" />
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                      <StatusIcon size={12} />
                      {cfg.label}
                    </span>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
