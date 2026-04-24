import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutTemplate, Plus, Copy, Star, ChevronRight, Layers, CheckSquare, X,
  BookOpen, FolderOpen, ChevronDown, Search, Check, Clock, AlertTriangle,
  Filter, Tag, Edit2, Trash2, Eye, EyeOff, RefreshCw, Calendar, Folder,
  Shield, Zap, Monitor, Users, Globe, ChevronUp, CheckCircle,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Card, { CardBody } from '../components/Card'
import { api } from '../lib/api'

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  draft:              { label: 'Draft',             bg: 'bg-gray-100 text-gray-600 border-gray-200',   dot: 'bg-gray-400' },
  waiting_for_review: { label: 'Waiting for Review',bg: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
  approved:           { label: 'Approved',          bg: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500' },
}

const REVIEW_FREQ_LABELS = {
  never:     'Never',
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  biannual:  'Bi-Annual',
  annually:  'Annually',
}

// ─── TAM badge configs ────────────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  high:   { label: 'H', full: 'High',   bg: 'bg-red-100 text-red-700 border-red-200' },
  medium: { label: 'M', full: 'Medium', bg: 'bg-amber-100 text-amber-700 border-amber-200' },
  low:    { label: 'L', full: 'Low',    bg: 'bg-gray-100 text-gray-600 border-gray-200' },
}

const DELIVERY_CONFIG = {
  automated:        { label: 'Auto',    icon: Zap,     bg: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  remote_human:     { label: 'Remote',  icon: Monitor, bg: 'bg-blue-100 text-blue-700 border-blue-200' },
  onsite_required:  { label: 'Onsite',  icon: Users,   bg: 'bg-orange-100 text-orange-700 border-orange-200' },
  hybrid:           { label: 'Hybrid',  icon: Globe,   bg: 'bg-purple-100 text-purple-700 border-purple-200' },
}

const TIER_CONFIG = {
  level_1: { label: 'L1', full: 'Core',       bg: 'bg-sky-100 text-sky-700 border-sky-200' },
  level_2: { label: 'L2', full: 'Intermediate',bg: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  level_3: { label: 'L3', full: 'Advanced',    bg: 'bg-violet-100 text-violet-700 border-violet-200' },
}

const RESPONSE_LEVEL_CONFIG = {
  satisfactory:    { label: 'Satisfactory',    color: 'bg-green-500',  textColor: 'text-green-700', bgLight: 'bg-green-50 border-green-200',  aligned: true },
  acceptable_risk: { label: 'Acceptable Risk', color: 'bg-lime-500',   textColor: 'text-lime-700',  bgLight: 'bg-lime-50 border-lime-200',    aligned: true },
  needs_attention: { label: 'Needs Attention', color: 'bg-amber-500',  textColor: 'text-amber-700', bgLight: 'bg-amber-50 border-amber-200',  aligned: false },
  at_risk:         { label: 'At Risk',         color: 'bg-red-500',    textColor: 'text-red-700',   bgLight: 'bg-red-50 border-red-200',      aligned: false },
  not_applicable:  { label: 'N/A',             color: 'bg-gray-400',   textColor: 'text-gray-600',  bgLight: 'bg-gray-50 border-gray-200',    aligned: true },
  unknown:         { label: 'Unknown',         color: 'bg-gray-300',   textColor: 'text-gray-500',  bgLight: 'bg-gray-50 border-gray-200',    aligned: false },
}

const PRIORITY_OPTIONS = [
  { key: '',       label: 'All Priorities' },
  { key: 'high',   label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low',    label: 'Low' },
]

const TIER_OPTIONS = [
  { key: '',        label: 'All Tiers' },
  { key: 'level_1', label: 'L1 Core' },
  { key: 'level_2', label: 'L2 Intermediate' },
  { key: 'level_3', label: 'L3 Advanced' },
]

const DELIVERY_OPTIONS = [
  { key: '',                label: 'All Delivery' },
  { key: 'automated',      label: 'Automated' },
  { key: 'remote_human',   label: 'Remote' },
  { key: 'onsite_required',label: 'Onsite' },
  { key: 'hybrid',         label: 'Hybrid' },
]

const STATUS_FILTERS = [
  { key: 'all',               label: 'All' },
  { key: 'draft',             label: 'Draft' },
  { key: 'waiting_for_review',label: 'Waiting for Review' },
  { key: 'approved',          label: 'Approved' },
  { key: 'due_for_review',    label: 'Due for Review' },
]

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, small }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft
  if (small) return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full border ${cfg.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${cfg.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─── TAM Badges ──────────────────────────────────────────────────────────────
function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CONFIG[priority]
  if (!cfg) return null
  return <span className={`inline-flex items-center text-xs font-bold px-1.5 py-0.5 rounded border ${cfg.bg}`} title={`${cfg.full} Priority`}>{cfg.label}</span>
}

function DeliveryBadge({ method }) {
  const cfg = DELIVERY_CONFIG[method]
  if (!cfg) return null
  const Icon = cfg.icon
  return <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded border ${cfg.bg}`} title={`${cfg.label} delivery`}><Icon size={10} />{cfg.label}</span>
}

function TierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier]
  if (!cfg) return null
  return <span className={`inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded border ${cfg.bg}`} title={cfg.full}>{cfg.label}</span>
}

// ─── Response Rubric Viewer ──────────────────────────────────────────────────
function ResponseRubric({ standardId }) {
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/standards/${standardId}/responses`)
      .then(res => setResponses(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [standardId])

  if (loading) return <p className="text-xs text-gray-400 py-2">Loading rubric...</p>
  if (!responses.length) return <p className="text-xs text-gray-400 py-2">No response levels defined.</p>

  return (
    <div className="space-y-1.5">
      {responses.map(r => {
        const cfg = RESPONSE_LEVEL_CONFIG[r.level] || RESPONSE_LEVEL_CONFIG.unknown
        return (
          <div key={r.id} className={`rounded-lg border p-2.5 ${cfg.bgLight}`}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`w-2 h-2 rounded-full ${cfg.color} shrink-0`} />
              <span className={`text-xs font-semibold ${cfg.textColor}`}>{r.label}</span>
              {r.is_aligned && <span className="text-xs text-green-600 font-medium ml-auto">Aligned</span>}
            </div>
            {r.description && <p className="text-xs text-gray-600 leading-relaxed pl-4">{r.description}</p>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Standard Create/Edit Panel ───────────────────────────────────────────────
function StandardPanel({ standard, categories, sections, onClose, onSave, defaultCategoryId }) {
  const isEdit = !!standard?.id
  const [form, setForm] = useState(standard ? {
    name:                     standard.name || '',
    description:              standard.description || '',
    criteria:                 standard.criteria || '',
    how_to_find:              standard.how_to_find || '',
    why_we_ask:               standard.why_we_ask || '',
    why_we_ask_client_visible: standard.why_we_ask_client_visible || false,
    category_id:              standard.category_id || defaultCategoryId || '',
    status:                   standard.status || 'draft',
    review_frequency:         standard.review_frequency || 'never',
    severity_weight:          standard.severity_weight || 1.0,
    tags:                     (standard.tags || []).join(', '),
    priority:                 standard.priority || 'medium',
    level_tier:               standard.level_tier || 'level_1',
    delivery_method:          standard.delivery_method || 'remote_human',
    is_universal:             standard.is_universal || false,
    business_impact:          standard.business_impact || '',
    technical_rationale:      standard.technical_rationale || '',
    question_text:            standard.question_text || '',
    user_impact_tag:          standard.user_impact_tag || 'no_user_impact',
  } : {
    name: '', description: '', criteria: '', how_to_find: '', why_we_ask: '',
    why_we_ask_client_visible: false,
    category_id: defaultCategoryId || '',
    status: 'draft', review_frequency: 'never', severity_weight: 1.0, tags: '',
    priority: 'medium', level_tier: 'level_1', delivery_method: 'remote_human',
    is_universal: false, business_impact: '', technical_rationale: '',
    question_text: '', user_impact_tag: 'no_user_impact',
  })
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('general')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function submit() {
    if (!form.name.trim() || !form.category_id) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        severity_weight: parseFloat(form.severity_weight) || 1.0,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      }
      let res
      if (isEdit) res = await api.put(`/standards/${standard.id}`, payload)
      else res = await api.post('/standards', payload)
      onSave(res.data, isEdit)
      onClose()
    } catch (err) { console.error(err) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? 'Edit Standard' : 'Create Standard'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6 shrink-0">
          {[
            { key: 'general',   label: 'General' },
            { key: 'guidance',  label: 'Guidance' },
            { key: 'settings',  label: 'Settings' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Title <span className="text-red-500">*</span></label>
                <input autoFocus value={form.name} onChange={e => f('name', e.target.value)}
                  placeholder="e.g. Workstation Lifecycle Management"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Category <span className="text-red-500">*</span></label>
                <select value={form.category_id} onChange={e => f('category_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Select category...</option>
                  {sections.map(sec => (
                    <optgroup key={sec.id} label={sec.name}>
                      {categories.filter(c => c.section_id === sec.id).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </optgroup>
                  ))}
                  {categories.filter(c => !c.section_id).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Question Text</label>
                <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={3}
                  placeholder="e.g. Do all workstations fall within a 5-year lifecycle with active manufacturer support?"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Criteria / Acceptance</label>
                <textarea value={form.criteria} onChange={e => f('criteria', e.target.value)} rows={2}
                  placeholder="Specific pass/fail criteria for this standard"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                  <select value={form.status} onChange={e => f('status', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="draft">Draft</option>
                    <option value="waiting_for_review">Waiting for Review</option>
                    <option value="approved">Approved</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tags</label>
                  <input value={form.tags} onChange={e => f('tags', e.target.value)}
                    placeholder="e.g. Security, Onboarding (comma separated)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'guidance' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                <strong>Internal only</strong> — Guidance fields are visible to your team only, not to clients.
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">How to Find the Answer</label>
                <p className="text-xs text-gray-400 mb-1.5">Internal: describe where the tech should look to evaluate this standard.</p>
                <textarea value={form.how_to_find} onChange={e => f('how_to_find', e.target.value)} rows={4}
                  placeholder="e.g. Check device purchase dates in PSA, review warranty status in Datto RMM under device details..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Why We Ask</label>
                <textarea value={form.why_we_ask} onChange={e => f('why_we_ask', e.target.value)} rows={4}
                  placeholder="e.g. End-of-life hardware cannot receive security updates, increasing breach risk and impacting employee productivity..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.why_we_ask_client_visible}
                    onChange={e => f('why_we_ask_client_visible', e.target.checked)}
                    className="rounded border-gray-300 text-primary-600" />
                  <span className="text-sm text-gray-700">
                    Show "Why We Ask" to clients in reports
                  </span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Priority</label>
                  <select value={form.priority} onChange={e => f('priority', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Level Tier</label>
                  <select value={form.level_tier} onChange={e => f('level_tier', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="level_1">L1 — Core</option>
                    <option value="level_2">L2 — Intermediate</option>
                    <option value="level_3">L3 — Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Delivery Method</label>
                  <select value={form.delivery_method} onChange={e => f('delivery_method', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="automated">Automated</option>
                    <option value="remote_human">Remote / Human</option>
                    <option value="onsite_required">Onsite Required</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">User Impact</label>
                  <select value={form.user_impact_tag} onChange={e => f('user_impact_tag', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="no_user_impact">No User Impact</option>
                    <option value="minimum_user_impact">Minimum User Impact</option>
                    <option value="significant_user_impact">Significant User Impact</option>
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_universal}
                      onChange={e => f('is_universal', e.target.checked)}
                      className="rounded border-gray-300 text-primary-600" />
                    <span className="text-sm text-gray-700">Universal Baseline</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Business Impact</label>
                <textarea value={form.business_impact} onChange={e => f('business_impact', e.target.value)} rows={2}
                  placeholder="Why this matters to the business..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Technical Rationale</label>
                <textarea value={form.technical_rationale} onChange={e => f('technical_rationale', e.target.value)} rows={2}
                  placeholder="Technical reasoning for this standard..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Review Frequency</label>
                <select value={form.review_frequency} onChange={e => f('review_frequency', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                  {Object.entries(REVIEW_FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Severity Weight</label>
                <p className="text-xs text-gray-400 mb-1.5">Used in legacy scoring (1.0 = normal, 2.0 = doubled weight)</p>
                <input type="number" min="0.1" max="5" step="0.1" value={form.severity_weight}
                  onChange={e => f('severity_weight', e.target.value)}
                  className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={submit} disabled={saving || !form.name.trim() || !form.category_id}
            className="px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Standard'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Inline Standard Detail (expanded under clicked row) ─────────────────────
function StandardInlineDetail({ standard, onClose, onEdit, onDelete, onStatusChange }) {
  const isDue = standard.next_review_due && new Date(standard.next_review_due) <= new Date()
  const [markingReview, setMarkingReview] = useState(false)
  const [detailTab, setDetailTab] = useState('overview')

  async function markReviewed(newStatus) {
    setMarkingReview(true)
    try {
      const res = await api.post(`/standards/${standard.id}/review`, { new_status: newStatus })
      onStatusChange(res.data)
    } catch (err) { console.error(err) } finally { setMarkingReview(false) }
  }

  const DETAIL_TABS = [
    { key: 'overview',  label: 'Overview' },
    { key: 'guidance',  label: 'Guidance' },
    { key: 'rubric',    label: 'Response Levels' },
    { key: 'metadata',  label: 'Details' },
  ]

  return (
    <div className="bg-white border border-primary-200 rounded-xl shadow-md mt-1 mb-2 overflow-hidden" onClick={e => e.stopPropagation()}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={standard.status} />
          <PriorityBadge priority={standard.priority} />
          <TierBadge tier={standard.level_tier} />
          <DeliveryBadge method={standard.delivery_method} />
          {standard.is_universal && (
            <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded border bg-cyan-50 text-cyan-700 border-cyan-200">
              <Globe size={9} /> Universal
            </span>
          )}
          {isDue && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded-full">
              <AlertTriangle size={11} /> Review Due
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Status workflow buttons */}
          {standard.status === 'draft' && (
            <button onClick={() => markReviewed('waiting_for_review')} disabled={markingReview}
              className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
              Submit for Review
            </button>
          )}
          {standard.status === 'waiting_for_review' && (
            <>
              <button onClick={() => markReviewed('approved')} disabled={markingReview}
                className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                <Check size={12} className="inline mr-1" />Approve
              </button>
              <button onClick={() => markReviewed('draft')} disabled={markingReview}
                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50">
                Return to Draft
              </button>
            </>
          )}
          {standard.status === 'approved' && isDue && (
            <button onClick={() => markReviewed('approved')} disabled={markingReview}
              className="text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
              <RefreshCw size={12} className="inline mr-1" />Mark Reviewed
            </button>
          )}
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg" title="Edit"><Edit2 size={14} /></button>
          <button onClick={() => { if (confirm('Delete this standard?')) onDelete(standard.id) }}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 size={14} /></button>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg" title="Close"><ChevronUp size={16} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-5 bg-white">
        {DETAIL_TABS.map(t => (
          <button key={t.key} onClick={() => setDetailTab(t.key)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              detailTab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-5 py-4">
        {detailTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              {standard.description && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Question</h4>
                  <p className="text-sm text-gray-800">{standard.description}</p>
                </div>
              )}
              {standard.criteria && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Criteria / Acceptance</h4>
                  <p className="text-sm text-gray-700">{standard.criteria}</p>
                </div>
              )}
              {standard.business_impact && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Business Impact</h4>
                  <p className="text-sm text-gray-700">{standard.business_impact}</p>
                </div>
              )}
              {standard.technical_rationale && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Technical Rationale</h4>
                  <p className="text-sm text-gray-700">{standard.technical_rationale}</p>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {/* Quick response rubric preview */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Response Levels</h4>
                <ResponseRubric standardId={standard.id} />
              </div>
            </div>
          </div>
        )}

        {detailTab === 'guidance' && (
          <div className="space-y-4 max-w-2xl">
            {standard.how_to_find ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1.5">
                  <Search size={12} /> How to Find the Answer
                </h4>
                <p className="text-sm text-blue-800 leading-relaxed">{standard.how_to_find}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No "How to Find" guidance has been added yet.</p>
            )}

            {standard.why_we_ask ? (
              <div className={`rounded-lg p-3 ${standard.why_we_ask_client_visible ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                <h4 className={`text-xs font-semibold mb-1 flex items-center gap-1.5 ${standard.why_we_ask_client_visible ? 'text-green-700' : 'text-amber-700'}`}>
                  {standard.why_we_ask_client_visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  Why We Ask {standard.why_we_ask_client_visible ? '(Client visible)' : '(Internal only)'}
                </h4>
                <p className={`text-sm leading-relaxed ${standard.why_we_ask_client_visible ? 'text-green-800' : 'text-amber-800'}`}>
                  {standard.why_we_ask}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No "Why We Ask" rationale has been added yet.</p>
            )}

            {standard.scoring_instructions && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-gray-500 mb-1">Scoring Instructions</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{standard.scoring_instructions}</p>
              </div>
            )}
          </div>
        )}

        {detailTab === 'rubric' && (
          <div className="max-w-xl">
            <ResponseRubric standardId={standard.id} />
          </div>
        )}

        {detailTab === 'metadata' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-gray-500">Domain</span>
              <p className="font-medium text-gray-800 mt-0.5">{standard.section_name || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500">Category</span>
              <p className="font-medium text-gray-800 mt-0.5">{standard.category_name || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500">Priority</span>
              <p className="font-medium text-gray-800 mt-0.5 capitalize">{standard.priority || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500">Tier</span>
              <p className="font-medium text-gray-800 mt-0.5">{TIER_CONFIG[standard.level_tier]?.full || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500">Delivery Method</span>
              <p className="font-medium text-gray-800 mt-0.5">{DELIVERY_CONFIG[standard.delivery_method]?.label || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500">Review Cycle</span>
              <p className="font-medium text-gray-800 mt-0.5">
                {standard.review_frequency && standard.review_frequency !== 'never'
                  ? REVIEW_FREQ_LABELS[standard.review_frequency]
                  : standard.review_frequency_months
                    ? `Every ${standard.review_frequency_months}mo (category default)`
                    : '—'}
              </p>
            </div>
            {standard.next_review_due && (
              <div>
                <span className="text-gray-500">Next Review</span>
                <p className={`font-medium mt-0.5 ${isDue ? 'text-red-600' : 'text-gray-800'}`}>
                  {new Date(standard.next_review_due).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            )}
            {standard.last_reviewed_at && (
              <div>
                <span className="text-gray-500">Last Reviewed</span>
                <p className="font-medium text-gray-800 mt-0.5">
                  {new Date(standard.last_reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            )}
            {standard.created_by && (
              <div>
                <span className="text-gray-500">Created By</span>
                <p className="font-medium text-gray-800 mt-0.5">{standard.created_by}</p>
              </div>
            )}
            <div>
              <span className="text-gray-500">Universal</span>
              <p className="font-medium text-gray-800 mt-0.5">{standard.is_universal ? 'Yes' : 'No'}</p>
            </div>
            {standard.user_impact_tag && standard.user_impact_tag !== 'no_user_impact' && (
              <div>
                <span className="text-gray-500">User Impact</span>
                <p className="font-medium text-gray-800 mt-0.5 capitalize">{standard.user_impact_tag.replace(/_/g, ' ')}</p>
              </div>
            )}
            {standard.source && (
              <div>
                <span className="text-gray-500">Source</span>
                <p className="font-medium text-gray-800 mt-0.5 capitalize">{standard.source}</p>
              </div>
            )}
            {standard.tags?.length > 0 && (
              <div className="col-span-2 md:col-span-4">
                <span className="text-gray-500">Tags</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {standard.tags.map(tag => (
                    <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Standards Library Tab ─────────────────────────────────────────────────────
function StandardsLibrary() {
  const [standards, setStandards]     = useState([])
  const [categories, setCategories]   = useState([])
  const [sections, setSections]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedSection, setSelectedSection] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [expandedSections, setExpandedSections] = useState(new Set())
  const [selectedStandard, setSelectedStandard] = useState(null)
  const [showCreate, setShowCreate]   = useState(false)
  const [editStandard, setEditStandard] = useState(null)
  const [priorityFilter, setPriorityFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [deliveryFilter, setDeliveryFilter] = useState('')
  const [universalFilter, setUniversalFilter] = useState('')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

  const loadData = useCallback(() => {
    Promise.all([
      api.get('/standards'),
      api.get('/standards/categories'),
      api.get('/standards/sections'),
    ]).then(([sRes, cRes, secRes]) => {
      setStandards(sRes.data || [])
      setCategories(cRes.data || [])
      const secs = secRes.data || []
      setSections(secs)
      // Default to collapsed
      setExpandedSections(new Set())
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filtered = useMemo(() => {
    return standards.filter(s => {
      if (selectedCategory && s.category_id !== selectedCategory) return false
      if (selectedSection && !categories.find(c => c.id === s.category_id && c.section_id === selectedSection)) return false
      if (statusFilter === 'due_for_review') {
        if (!s.next_review_due || new Date(s.next_review_due) > new Date()) return false
      } else if (statusFilter !== 'all') {
        if (s.status !== statusFilter) return false
      }
      if (priorityFilter && s.priority !== priorityFilter) return false
      if (tierFilter && s.level_tier !== tierFilter) return false
      if (deliveryFilter && s.delivery_method !== deliveryFilter) return false
      if (universalFilter === 'true' && !s.is_universal) return false
      if (universalFilter === 'false' && s.is_universal) return false
      if (search) {
        const q = search.toLowerCase()
        return s.name?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q) ||
               s.category_name?.toLowerCase().includes(q)
      }
      return true
    })
  }, [standards, categories, selectedCategory, selectedSection, statusFilter, search,
      priorityFilter, tierFilter, deliveryFilter, universalFilter])

  // Counts for status filter pills
  const statusCounts = useMemo(() => {
    const now = new Date()
    return {
      all: standards.length,
      draft: standards.filter(s => s.status === 'draft').length,
      waiting_for_review: standards.filter(s => s.status === 'waiting_for_review').length,
      approved: standards.filter(s => s.status === 'approved').length,
      due_for_review: standards.filter(s => s.next_review_due && new Date(s.next_review_due) <= now).length,
    }
  }, [standards])

  function handleSave(std, isEdit) {
    if (isEdit) setStandards(prev => prev.map(s => s.id === std.id ? std : s))
    else setStandards(prev => [std, ...prev])
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/standards/${id}`)
      setStandards(prev => prev.filter(s => s.id !== id))
      setSelectedStandard(null)
    } catch (err) { console.error(err) }
  }

  function handleStatusChange(updated) {
    setStandards(prev => prev.map(s => s.id === updated.id ? updated : s))
    setSelectedStandard(updated)
  }

  function toggleSection(id) {
    setExpandedSections(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading standards...</div>

  return (
    <div className="flex gap-0 h-full" style={{ minHeight: 'calc(100vh - 200px)' }}>
      {/* ── Left tree navigation ────────────────────────────────────────────── */}
      <aside className="w-52 shrink-0 border-r border-gray-200 pr-0 mr-4 flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <div className="shrink-0">
          <button
            onClick={() => { setSelectedSection(null); setSelectedCategory(null) }}
            className={`w-full text-left px-3 py-2 text-sm rounded-lg mb-1 flex items-center justify-between ${
              !selectedSection && !selectedCategory ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="flex items-center gap-2"><BookOpen size={14} /> All Standards</span>
            <span className="text-xs text-gray-400">{standards.length}</span>
          </button>

          {/* Collapse / Expand All */}
          <div className="flex items-center justify-end gap-1 px-1 mb-1">
            <button
              onClick={() => setExpandedSections(new Set(sections.map(s => s.id)))}
              className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100"
              title="Expand all domains"
            >Expand</button>
            <span className="text-gray-300 text-xs">|</span>
            <button
              onClick={() => setExpandedSections(new Set())}
              className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100"
              title="Collapse all domains"
            >Collapse</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-0.5 pr-1" style={{ scrollbarWidth: 'thin' }}>
            {sections.map(sec => {
              const secCats = categories.filter(c => c.section_id === sec.id)
              const secCount = standards.filter(s => secCats.some(c => c.id === s.category_id)).length
              const expanded = expandedSections.has(sec.id)
              const isActive = selectedSection === sec.id && !selectedCategory
              return (
                <div key={sec.id}>
                  <button
                    onClick={() => {
                      toggleSection(sec.id)
                      setSelectedSection(sec.id)
                      setSelectedCategory(null)
                    }}
                    className={`w-full text-left px-2.5 py-1.5 text-sm rounded-lg flex items-center justify-between gap-1 ${
                      isActive ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <FolderOpen size={13} className={isActive ? 'text-primary-600' : 'text-gray-400'} />
                      <span className="truncate text-xs font-semibold">{sec.name}</span>
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-gray-400">{secCount}</span>
                      <ChevronDown size={12} className={`transition-transform text-gray-400 ${expanded ? '' : '-rotate-90'}`} />
                    </div>
                  </button>
                  {expanded && secCats.map(cat => {
                    const catCount = standards.filter(s => s.category_id === cat.id).length
                    const isCatActive = selectedCategory === cat.id
                    return (
                      <button key={cat.id}
                        onClick={() => { setSelectedCategory(cat.id); setSelectedSection(sec.id) }}
                        className={`w-full text-left pl-7 pr-2.5 py-1 text-xs rounded-lg flex items-center justify-between ${
                          isCatActive ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-500 hover:bg-gray-50'
                        }`}>
                        <span className="truncate">{cat.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">{catCount}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}

            {/* Uncategorized sections */}
            {categories.filter(c => !c.section_id).map(cat => (
              <button key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setSelectedSection(null) }}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between ${
                  selectedCategory === cat.id ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-500 hover:bg-gray-50'
                }`}>
                <span className="truncate">{cat.name}</span>
                <span className="text-xs text-gray-400">{standards.filter(s => s.category_id === cat.id).length}</span>
              </button>
            ))}
          </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-48">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search standards..."
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          {(() => {
            // Count drafts in current scope (section or all)
            const scopeDrafts = standards.filter(s => {
              if (s.status !== 'draft') return false
              if (selectedCategory) return s.category_id === selectedCategory
              if (selectedSection) {
                const cat = categories.find(c => c.id === s.category_id)
                return cat?.section_id === selectedSection
              }
              return true
            }).length

            if (scopeDrafts === 0) return null

            const scopeLabel = selectedCategory
              ? (categories.find(c => c.id === selectedCategory)?.name || 'category')
              : (selectedSection ? (sections.find(s => s.id === selectedSection)?.name || 'section') : 'tenant')

            return (
              <button onClick={async () => {
                if (!confirm(`Approve all ${scopeDrafts} draft standards in "${scopeLabel}"?`)) return
                const body = selectedSection && !selectedCategory ? { section_id: selectedSection }
                  : selectedCategory ? { ids: standards.filter(s => s.status === 'draft' && s.category_id === selectedCategory).map(s => s.id) }
                  : {}
                try {
                  const res = await api.post('/standards/bulk-approve', body)
                  alert(`Approved ${res.updated_count} standard(s).`)
                  // Reload standards
                  const fresh = await api.get('/standards')
                  setStandards(fresh.data || [])
                } catch (err) {
                  alert('Bulk approve failed: ' + (err.message || 'unknown'))
                }
              }}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
                <CheckCircle size={14} /> Approve {scopeDrafts} Draft{scopeDrafts !== 1 ? 's' : ''}
              </button>
            )
          })()}
          <button onClick={() => { setEditStandard(null); setShowCreate(true) }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
            <Plus size={15} /> Add Standard
          </button>
        </div>

        {/* Status filter pills */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                statusFilter === f.key
                  ? f.key === 'due_for_review' ? 'bg-red-600 text-white border-red-600'
                    : f.key === 'waiting_for_review' ? 'bg-amber-500 text-white border-amber-500'
                    : f.key === 'approved' ? 'bg-green-600 text-white border-green-600'
                    : f.key === 'draft' ? 'bg-gray-500 text-white border-gray-500'
                    : 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}>
              {f.label}
              <span className={`ml-1.5 ${statusFilter === f.key ? 'text-white/80' : 'text-gray-400'}`}>
                {statusCounts[f.key] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Advanced filters */}
        <div className="mb-4">
          <button onClick={() => setShowAdvancedFilters(p => !p)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2">
            <Filter size={12} /> Filters
            {showAdvancedFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {(priorityFilter || tierFilter || deliveryFilter || universalFilter) && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary-500" />
            )}
          </button>
          {showAdvancedFilters && (
            <div className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
              <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
                className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-primary-400">
                {PRIORITY_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
                className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-primary-400">
                {TIER_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <select value={deliveryFilter} onChange={e => setDeliveryFilter(e.target.value)}
                className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-primary-400">
                {DELIVERY_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <select value={universalFilter} onChange={e => setUniversalFilter(e.target.value)}
                className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-primary-400">
                <option value="">All Standards</option>
                <option value="true">Universal Only</option>
                <option value="false">Custom Only</option>
              </select>
              {(priorityFilter || tierFilter || deliveryFilter || universalFilter) && (
                <button onClick={() => { setPriorityFilter(''); setTierFilter(''); setDeliveryFilter(''); setUniversalFilter('') }}
                  className="text-xs text-red-500 hover:text-red-700 ml-1">Clear</button>
              )}
            </div>
          )}
        </div>

        {/* Standards list */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-500">
              {standards.length === 0 ? 'No standards yet' : 'No standards match your filters'}
            </p>
            {standards.length === 0 && (
              <p className="text-sm mt-1 text-gray-400">Create your first standard to start building your library.</p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map(std => {
              const isDue = std.next_review_due && new Date(std.next_review_due) <= new Date()
              const isSelected = selectedStandard?.id === std.id
              return (
                <div key={std.id}>
                  <div
                    onClick={() => setSelectedStandard(isSelected ? null : std)}
                    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected ? 'bg-primary-50 border-primary-200 shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
                    }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusBadge status={std.status} small />
                        <PriorityBadge priority={std.priority} />
                        <TierBadge tier={std.level_tier} />
                        <DeliveryBadge method={std.delivery_method} />
                        {std.is_universal && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded border bg-cyan-50 text-cyan-700 border-cyan-200" title="Universal baseline">
                            <Globe size={9} />U
                          </span>
                        )}
                        {isDue && (
                          <span className="text-xs text-red-600 flex items-center gap-0.5">
                            <AlertTriangle size={10} /> Due
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{std.name}</p>
                      {std.description && <p className="text-xs text-gray-500 truncate mt-0.5">{std.description}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-gray-400">{std.category_name}</p>
                        {(std.review_frequency && std.review_frequency !== 'never') ? (
                          <p className="text-xs text-gray-400">{REVIEW_FREQ_LABELS[std.review_frequency]}</p>
                        ) : std.review_frequency_months ? (
                          <p className="text-xs text-gray-400">{std.review_frequency_months}mo cycle</p>
                        ) : null}
                      </div>
                      <ChevronDown size={14} className={`text-gray-400 transition-transform ${isSelected ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  {isSelected && (
                    <StandardInlineDetail
                      standard={std}
                      onClose={() => setSelectedStandard(null)}
                      onEdit={() => { setEditStandard(std); setShowCreate(true) }}
                      onDelete={handleDelete}
                      onStatusChange={handleStatusChange}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      {showCreate && (
        <StandardPanel
          standard={editStandard}
          categories={categories}
          sections={sections}
          defaultCategoryId={selectedCategory || ''}
          onClose={() => { setShowCreate(false); setEditStandard(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

// ─── Assessment Templates Tab ─────────────────────────────────────────────────
function AssessmentTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/templates').then(res => setTemplates(res.data || []))
      .catch(console.error).finally(() => setLoading(false))
  }, [])

  async function createTemplate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await api.post('/templates', { name: newName.trim(), description: newDesc.trim() || undefined })
      setTemplates(prev => [res.data, ...prev])
      setShowNew(false); setNewName(''); setNewDesc('')
      navigate(`/standards/${res.data.id}`)
    } catch (err) { console.error(err) } finally { setCreating(false) }
  }

  async function duplicateTemplate(e, id) {
    e.stopPropagation()
    try {
      const res = await api.post(`/templates/${id}/duplicate`)
      setTemplates(prev => [res.data, ...prev])
      navigate(`/standards/${res.data.id}`)
    } catch (err) { console.error(err) }
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading templates...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">{templates.length} templates · Used to build and run client assessments</p>
        <button onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
          <Plus size={16} /> New Template
        </button>
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">New Template</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template Name <span className="text-red-500">*</span></label>
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createTemplate()}
                  placeholder="e.g. Quarterly Technology Review"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={createTemplate} disabled={!newName.trim() || creating}
                className="px-5 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <Card className="py-16 text-center">
          <LayoutTemplate size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-base font-medium text-gray-500">No templates yet</p>
          <p className="text-sm text-gray-400 mt-1">Create a template to structure your assessment questions.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <div key={t.id} onClick={() => navigate(`/standards/${t.id}`)}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-primary-200 transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-primary-100 text-primary-600 rounded-xl flex items-center justify-center shrink-0">
                  <LayoutTemplate size={20} />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {t.is_default && <span className="inline-flex items-center gap-1 text-xs bg-accent-100 text-accent-700 px-2 py-0.5 rounded-full"><Star size={10} /> Default</span>}
                  <button onClick={e => duplicateTemplate(e, t.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                    <Copy size={14} />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-gray-900 text-sm mb-1">{t.name}</h3>
              {t.description && <p className="text-xs text-gray-500 line-clamp-2 mb-3">{t.description}</p>}
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Layers size={11} /> {t.section_count || 0} sections</span>
                <span className="flex items-center gap-1"><CheckSquare size={11} /> {t.item_count || 0} items</span>
                {t.is_default && <span className="flex items-center gap-1 text-accent-600"><Star size={11} /> Default</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Client Standards Mapping Tab ────────────────────────────────────────────
function ClientMappingTab() {
  const [mapping, setMapping] = useState(false)
  const [result, setResult] = useState(null)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get('/clients?include_standards_count=true')
      .then(res => setClients(res.data || res || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function runAutoMapAll() {
    if (!confirm('This will auto-map standards to all active clients based on their profile (industry, frameworks, tech stack). Continue?')) return
    setMapping(true)
    setResult(null)
    try {
      const res = await api.post('/standards/auto-map-all')
      setResult(res)
      // Refresh client list
      api.get('/clients?include_standards_count=true')
        .then(res => setClients(res.data || res || []))
        .catch(console.error)
    } catch (err) {
      console.error(err)
      alert('Auto-map failed: ' + (err.message || 'Unknown error'))
    } finally { setMapping(false) }
  }

  async function runAutoMapSingle(clientId) {
    try {
      await api.post(`/clients/${clientId}/standards/auto-map`)
      // Refresh
      api.get('/clients?include_standards_count=true')
        .then(res => setClients(res.data || res || []))
        .catch(console.error)
    } catch (err) { console.error(err) }
  }

  const filtered = useMemo(() => {
    if (!search) return clients
    const q = search.toLowerCase()
    return clients.filter(c => c.name?.toLowerCase().includes(q))
  }, [clients, search])

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Client Standards Mapping</h2>
          <p className="text-sm text-gray-500">Auto-map standards to clients based on their profile, or manually adjust per client</p>
        </div>
        <button onClick={runAutoMapAll} disabled={mapping}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50">
          {mapping ? <><RefreshCw size={14} className="animate-spin" /> Mapping All Clients...</> : <><RefreshCw size={14} /> Auto-Map All Clients</>}
        </button>
      </div>

      {result && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          Mapped {result.clients_mapped} of {result.total_clients} clients — {result.standards_inserted} new mappings, {result.standards_updated} updated
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search clients..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">Loading clients...</div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">Client</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5 w-32">Vertical</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5 w-36">Frameworks</th>
                <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5 w-28">Standards</th>
                <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5 w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <span className="text-sm font-medium text-gray-900">{c.name}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs ${c.vertical ? 'text-gray-600' : 'text-gray-300 italic'}`}>
                      {c.vertical || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.frameworks_enabled?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {c.frameworks_enabled.map(fw => (
                          <span key={fw} className="text-[10px] font-medium bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5">{fw}</span>
                        ))}
                      </div>
                    ) : <span className="text-xs text-gray-300 italic">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs font-semibold ${c.standards_count > 0 ? 'text-primary-600' : 'text-gray-300'}`}>
                      {c.standards_count || 0}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => runAutoMapSingle(c.id)}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                      Map
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main Standards Page ───────────────────────────────────────────────────────
export default function Standards() {
  const [tab, setTab] = useState('library')

  return (
    <div>
      <PageHeader
        title="Standards"
        description="Manage your standards library and assessment templates"
      />

      {/* Tab switcher */}
      <div className="flex border-b border-gray-200 mb-6 gap-0.5">
        <button onClick={() => setTab('library')}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2 ${
            tab === 'library' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          <BookOpen size={15} /> Standards Library
        </button>
        <button onClick={() => setTab('templates')}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2 ${
            tab === 'templates' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          <LayoutTemplate size={15} /> Assessment Templates
        </button>
        <button onClick={() => setTab('mapping')}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2 ${
            tab === 'mapping' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          <Users size={15} /> Client Mapping
        </button>
      </div>

      {tab === 'library' && <StandardsLibrary />}
      {tab === 'templates' && <AssessmentTemplates />}
      {tab === 'mapping' && <ClientMappingTab />}
    </div>
  )
}
