import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Save } from 'lucide-react'
import Card, { CardHeader, CardBody } from '../components/Card'
import AlignmentBadge, { AlignmentScore } from '../components/AlignmentBadge'
import { api } from '../lib/api'

const severities = [
  { value: 'aligned', label: 'Aligned', color: 'bg-green-500' },
  { value: 'marginal', label: 'Marginal', color: 'bg-yellow-500' },
  { value: 'vulnerable', label: 'Vulnerable', color: 'bg-orange-500' },
  { value: 'highly_vulnerable', label: 'Highly Vulnerable', color: 'bg-red-500' },
  { value: 'not_assessed', label: 'Not Assessed', color: 'bg-gray-300' },
]

export default function AssessmentDetail() {
  const { id } = useParams()
  const [assessment, setAssessment] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    api.get(`/assessments/${id}`)
      .then(res => {
        setAssessment(res.data)
        setItems(res.data.items || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  async function updateItem(itemId, severity, notes) {
    setSaving(itemId)
    try {
      await api.put(`/assessments/${id}/items/${itemId}`, { severity, notes })
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, severity, notes } : i))
    } catch (err) {
      console.error('Failed to update item:', err)
    } finally {
      setSaving(null)
    }
  }

  async function completeAssessment() {
    setCompleting(true)
    try {
      const res = await api.post(`/assessments/${id}/complete`)
      setAssessment(res.data)
    } catch (err) {
      console.error('Failed to complete:', err)
    } finally {
      setCompleting(false)
    }
  }

  // Group items by category
  const grouped = {}
  for (const item of items) {
    const cat = item.category_name || 'Uncategorized'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(item)
  }

  // Calculate stats
  const scoreMap = { aligned: 100, marginal: 60, vulnerable: 30, highly_vulnerable: 0, not_assessed: null }
  const scored = items.filter(i => scoreMap[i.severity] != null)
  const avgScore = scored.length > 0
    ? Math.round(scored.reduce((sum, i) => sum + scoreMap[i.severity], 0) / scored.length)
    : null

  const severityCounts = {}
  for (const s of severities) severityCounts[s.value] = items.filter(i => i.severity === s.value).length

  if (loading) return <div className="text-center py-20 text-gray-400">Loading...</div>
  if (!assessment) return <div className="text-center py-20 text-gray-400">Assessment not found</div>

  return (
    <div>
      <Link to="/assessments" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 mb-4">
        <ArrowLeft size={16} /> Back to Assessments
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{assessment.title || 'Assessment'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{assessment.client_name} · {items.length} standards</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Score</p>
            <AlignmentScore score={avgScore} size="lg" />
          </div>
          {assessment.status !== 'completed' && (
            <button
              onClick={completeAssessment}
              disabled={completing}
              className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors disabled:opacity-50"
            >
              <CheckCircle size={16} />
              {completing ? 'Completing...' : 'Complete Assessment'}
            </button>
          )}
        </div>
      </div>

      {/* Severity summary bar */}
      <Card className="mb-6 p-4">
        <div className="flex items-center gap-4">
          {severities.map(s => (
            <div key={s.value} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${s.color}`} />
              <span className="text-xs text-gray-600">{s.label}</span>
              <span className="text-xs font-bold text-gray-900">{severityCounts[s.value] || 0}</span>
            </div>
          ))}
        </div>
        {/* Progress bar */}
        <div className="flex h-3 rounded-full overflow-hidden mt-3 bg-gray-100">
          {items.length > 0 && severities.map(s => {
            const pct = (severityCounts[s.value] || 0) / items.length * 100
            return pct > 0 ? (
              <div key={s.value} className={`${s.color} transition-all`} style={{ width: `${pct}%` }} />
            ) : null
          })}
        </div>
      </Card>

      {/* Assessment items by category */}
      {Object.entries(grouped).map(([catName, catItems]) => (
        <Card key={catName} className="mb-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">{catName}</h3>
              <span className="text-xs text-gray-400">{catItems.length} items</span>
            </div>
          </CardHeader>
          <div className="divide-y divide-gray-50">
            {catItems.map(item => (
              <div key={item.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900">{item.standard_name}</h4>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {severities.filter(s => s.value !== 'not_assessed').map(s => (
                      <button
                        key={s.value}
                        onClick={() => updateItem(item.id, s.value, item.notes)}
                        className={`w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center ${
                          item.severity === s.value
                            ? `${s.color} border-transparent text-white`
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                        title={s.label}
                      >
                        {item.severity === s.value && saving === item.id ? (
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className={`w-3 h-3 rounded-full ${item.severity === s.value ? 'bg-white/30' : s.color}`} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                {item.notes && (
                  <p className="text-xs text-gray-400 mt-1">{item.notes}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
