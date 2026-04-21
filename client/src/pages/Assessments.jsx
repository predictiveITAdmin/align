import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Plus, Clock, CheckCircle, AlertTriangle, X, LayoutTemplate, ClipboardList, Zap, RefreshCw, Calendar, Award } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Card, { CardHeader, CardBody } from '../components/Card'
import { AlignmentScore } from '../components/AlignmentBadge'
import { api } from '../lib/api'

const statusConfig = {
  draft:       { label: 'Draft',       icon: Clock,         color: 'text-gray-500',  bg: 'bg-gray-100' },
  in_progress: { label: 'In Progress', icon: Clock,         color: 'text-blue-600',  bg: 'bg-blue-50' },
  completed:   { label: 'Completed',   icon: CheckCircle,   color: 'text-green-600', bg: 'bg-green-50' },
}

const typeConfig = {
  onboarding_phase1: { label: 'Onboarding Phase 1', desc: 'Critical/high priority standards', icon: Zap, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  onboarding_phase2: { label: 'Onboarding Phase 2', desc: 'Remaining medium/low priority', icon: ClipboardList, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  recurring_review:  { label: 'Recurring Review', desc: 'Standards due for review', icon: RefreshCw, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  framework_gap:     { label: 'Framework Gap', desc: 'Compliance framework assessment (CMMC, ISO, PCI, etc.)', icon: ShieldCheck, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
  ad_hoc:            { label: 'Full Assessment', desc: 'All applicable standards', icon: ClipboardList, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' },
}

export default function Assessments() {
  const [assessments, setAssessments] = useState([])
  const [clients, setClients] = useState([])
  const [templates, setTemplates] = useState([])
  const [frameworks, setFrameworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [form, setForm] = useState({ client_id: '', template_id: '', name: '', mode: 'standards', assessment_type: 'ad_hoc', framework: '' })
  const [creating, setCreating] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      api.get('/assessments'),
      api.get('/clients'),
      api.get('/templates'),
      api.get('/assessments/frameworks'),
    ]).then(([aRes, cRes, tRes, fRes]) => {
      setAssessments(aRes.data || [])
      setClients(cRes.data || [])
      setTemplates(tRes.data || [])
      setFrameworks(fRes.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  async function createAssessment() {
    if (!form.client_id) return
    if (form.mode === 'template' && !form.template_id) return
    if (form.mode === 'standards' && form.assessment_type === 'framework_gap' && !form.framework) return
    setCreating(true)
    try {
      const body = { client_id: form.client_id }
      if (form.mode === 'template') {
        const selectedTemplate = templates.find(t => t.id === form.template_id)
        body.template_id = form.template_id
        body.name = form.name.trim() || selectedTemplate?.name || 'Technology Alignment Assessment'
      } else {
        body.assessment_type = form.assessment_type
        if (form.assessment_type === 'framework_gap') body.framework = form.framework
        body.name = form.name.trim() || ''
      }
      const res = await api.post('/assessments', body)
      navigate(`/assessments/${res.data.id}`)
    } catch (err) {
      console.error('Failed to create assessment:', err)
    } finally {
      setCreating(false)
    }
  }

  function openModal() {
    const def = templates.find(t => t.is_default)
    setForm({ client_id: '', template_id: def?.id || '', name: '', mode: 'standards', assessment_type: 'ad_hoc' })
    setShowNewModal(true)
  }

  const filteredAssessments = assessments.filter(a => {
    if (filterStatus && a.status !== filterStatus) return false
    if (filterClient && a.client_id !== filterClient) return false
    return true
  })

  if (loading) return <div className="text-center py-20 text-gray-400">Loading...</div>

  return (
    <div>
      <PageHeader
        title="Assessments"
        description={`${assessments.length} assessments across ${new Set(assessments.map(a => a.client_id)).size} clients`}
        actions={
          <button
            onClick={openModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus size={16} /> New Assessment
          </button>
        }
      />

      {/* Filters */}
      {assessments.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-400">
            <option value="">All Clients</option>
            {[...new Set(assessments.map(a => a.client_id))].map(cid => {
              const c = assessments.find(a => a.client_id === cid)
              return <option key={cid} value={cid}>{c?.client_name}</option>
            })}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-400">
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          {(filterClient || filterStatus) && (
            <button onClick={() => { setFilterClient(''); setFilterStatus('') }}
              className="text-xs text-red-500 hover:text-red-700">Clear</button>
          )}
          <span className="text-xs text-gray-400 ml-auto">{filteredAssessments.length} of {assessments.length}</span>
        </div>
      )}

      {/* New assessment modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">New Assessment</h2>
              <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Client selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client <span className="text-red-500">*</span></label>
                <select
                  value={form.client_id}
                  onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select a client...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Mode toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Assessment Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setForm(f => ({ ...f, mode: 'standards' }))}
                    className={`text-left p-3 rounded-xl border-2 transition-colors ${
                      form.mode === 'standards' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck size={16} className={form.mode === 'standards' ? 'text-primary-600' : 'text-gray-400'} />
                      <span className="text-sm font-medium text-gray-900">Standards-Based</span>
                    </div>
                    <p className="text-xs text-gray-500">Assess against your standards library with 5-level rubric per standard</p>
                  </button>
                  <button
                    onClick={() => setForm(f => ({ ...f, mode: 'template' }))}
                    className={`text-left p-3 rounded-xl border-2 transition-colors ${
                      form.mode === 'template' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <LayoutTemplate size={16} className={form.mode === 'template' ? 'text-primary-600' : 'text-gray-400'} />
                      <span className="text-sm font-medium text-gray-900">Template-Based</span>
                    </div>
                    <p className="text-xs text-gray-500">Use a predefined template with custom sections and questions</p>
                  </button>
                </div>
              </div>

              {/* Standards mode: pick assessment type */}
              {form.mode === 'standards' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Assessment Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(typeConfig).map(([key, cfg]) => {
                      const Icon = cfg.icon
                      const isSelected = form.assessment_type === key
                      return (
                        <button key={key}
                          onClick={() => setForm(f => ({ ...f, assessment_type: key }))}
                          className={`text-left p-3 rounded-xl border-2 transition-colors ${
                            isSelected ? `${cfg.border} ${cfg.bg}` : 'border-gray-200 hover:border-gray-300'
                          }`}>
                          <div className="flex items-center gap-2 mb-0.5">
                            <Icon size={14} className={isSelected ? cfg.color : 'text-gray-400'} />
                            <span className="text-sm font-medium text-gray-900">{cfg.label}</span>
                          </div>
                          <p className="text-xs text-gray-500">{cfg.desc}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Framework picker — shown only when framework_gap selected */}
              {form.mode === 'standards' && form.assessment_type === 'framework_gap' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Framework <span className="text-red-500">*</span></label>
                  <select
                    value={form.framework}
                    onChange={e => setForm(f => ({ ...f, framework: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">Select framework...</option>
                    {frameworks.map(f => (
                      <option key={f.framework} value={f.framework}>
                        {f.framework} ({f.standard_count} controls)
                      </option>
                    ))}
                  </select>
                  {frameworks.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">No frameworks found. Import standards from the Standards Library first.</p>
                  )}
                </div>
              )}

              {/* Template mode: pick template */}
              {form.mode === 'template' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Template <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.template_id}
                    onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Select a template...</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.is_default ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                  {templates.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">No templates found. Create a template in the Standards section first.</p>
                  )}
                </div>
              )}

              {/* Assessment name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assessment Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={form.mode === 'template'
                    ? (templates.find(t => t.id === form.template_id)?.name || 'Assessment name')
                    : (typeConfig[form.assessment_type]?.label || 'Assessment name')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank for auto-generated name.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowNewModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Cancel
              </button>
              <button
                onClick={createAssessment}
                disabled={!form.client_id || (form.mode === 'template' && !form.template_id) || creating}
                className="flex items-center gap-2 px-5 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors disabled:opacity-50"
              >
                <Plus size={15} />
                {creating ? 'Creating...' : 'Create Assessment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assessment list */}
      {assessments.length === 0 ? (
        <Card className="py-20 text-center">
          <ShieldCheck size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium text-gray-500">No assessments yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">
            Create your first assessment to start evaluating a client against your standards library.
          </p>
          <button
            onClick={openModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus size={16} /> New Assessment
          </button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredAssessments.map(a => {
            const cfg = statusConfig[a.status] || statusConfig.draft
            const StatusIcon = cfg.icon
            const answered = parseInt(a.answered_count) || 0
            const total = parseInt(a.total_items) || 0
            const pct = total > 0 ? Math.round((answered / total) * 100) : 0
            const tCfg = typeConfig[a.assessment_type]

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
                      <h3 className="text-sm font-semibold text-gray-900">{a.name || 'Assessment'}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-500">{a.client_name}</p>
                        {a.template_name && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                              <LayoutTemplate size={11} />{a.template_name}
                            </span>
                          </>
                        )}
                        {tCfg && !a.template_id && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className={`inline-flex items-center gap-1 text-xs ${tCfg.color}`}>
                              {tCfg.label}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {total > 0 && (
                      <div className="text-center hidden sm:block">
                        <p className="text-xs text-gray-400">Progress</p>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-medium text-gray-600">{pct}%</span>
                        </div>
                      </div>
                    )}
                    {a.misaligned_count > 0 && (
                      <div className="text-center">
                        <p className="text-xs text-gray-400">At Risk</p>
                        <p className="text-sm font-semibold text-red-600">{a.misaligned_count}</p>
                      </div>
                    )}
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
