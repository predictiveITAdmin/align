import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Settings,
  Monitor,
  ClipboardList,
  DollarSign,
  Target,
  ThumbsUp,
  Calendar,
  TrendingUp,
  ExternalLink,
  User,
  Mail,
  Phone,
  Package,
  Wifi,
  Server,
  Laptop,
  HardDrive,
  Shield,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Router,
  Printer,
  Cpu,
  Box,
  Activity,
  Search,
  X,
  RefreshCw,
  Edit2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  MapPin,
  Square,
  CheckSquare,
  Plus,
  Loader2,
  Trash2,
  Ticket,
  Link2,
  ListChecks,
  Filter,
  Clock,
  Eye,
  EyeOff,
  FileText,
  ShoppingCart,
} from 'lucide-react'
import Card, { CardHeader, CardBody } from '../components/Card'
import StatCard from '../components/StatCard'
import { AlignmentScore } from '../components/AlignmentBadge'
import AssetModal from '../components/AssetModal'
import ContactModal from '../components/ContactModal'
import { api } from '../lib/api'
import { autotaskUrl } from '../lib/autotask'
import HardwareTable from '../components/HardwareTable'
import DrillDownModal from '../components/DrillDownModal'
import { ClientBudgetPanel } from './ClientBudget'
import RecEditModal from '../components/RecEditModal'

const TABS = ['Overview', 'Roadmap', 'Budget', 'Assessments', 'Recommendations', 'Hardware', 'Software', 'Contacts', 'SaaS Licenses', 'Profile', 'Standards', 'Orders']


const PLATFORM_COLORS = {
  microsoft_365: 'bg-blue-50 text-blue-700 border-blue-200',
  google_workspace: 'bg-green-50 text-green-700 border-green-200',
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 72, stroke = 6 }) {
  if (score === null || score === undefined) return null
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  const color = score >= 75 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626'
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fontSize="15" fontWeight="700" fill={color}>{score}</text>
    </svg>
  )
}

function ComponentBar({ label, score, weight, detail }) {
  const color = score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600">{label}</span>
        <span className="text-xs font-medium text-gray-500">{score}/100 <span className="text-gray-300">({weight}%)</span></span>
      </div>
      <div className="bg-gray-100 rounded-full h-1.5">
        <div className={`${color} rounded-full h-1.5 transition-all duration-500`} style={{ width: `${score}%` }} />
      </div>
      {detail && <p className="text-xs text-gray-400 mt-0.5">{detail}</p>}
    </div>
  )
}

// ─── Priority + Status config (reused from Recommendations) ──────────────────
const PRIORITY_CFG = {
  critical: { bang: '!!!', bar: 'bg-red-500',    text: 'text-red-600'    },
  high:     { bang: '!!',  bar: 'bg-orange-400', text: 'text-orange-600' },
  medium:   { bang: '!',   bar: 'bg-yellow-400', text: 'text-yellow-600' },
  low:      { bang: '·',   bar: 'bg-gray-300',   text: 'text-gray-400'   },
}
const STATUS_CFG = {
  draft:       { dot: 'bg-gray-400',   label: 'Draft'       },
  proposed:    { dot: 'bg-blue-400',   label: 'Proposed'    },
  approved:    { dot: 'bg-indigo-500', label: 'Approved'    },
  in_progress: { dot: 'bg-amber-400',  label: 'In Progress' },
  completed:   { dot: 'bg-green-500',  label: 'Completed'   },
  deferred:    { dot: 'bg-purple-400', label: 'Deferred'    },
  declined:    { dot: 'bg-red-400',    label: 'Declined'    },
}

function fmtBudget(n) {
  if (!n || Number(n) === 0) return null
  return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function SectionHeader({ title, icon: Icon, actionLabel, onAction }) {
  return (
    <div className="flex items-center justify-between pb-2.5 mb-1 border-b border-gray-100">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} className="text-gray-400" />}
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      {actionLabel && onAction && (
        <button onClick={onAction}
          className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5 transition-colors">
          {actionLabel} <ChevronRight size={11} />
        </button>
      )}
    </div>
  )
}

function OverviewTab({ client, clientId, onSwitchTab }) {
  const navigate = useNavigate()
  const atUrl = autotaskUrl('company', client.autotask_company_id)
  const [editRecId, setEditRecId] = useState(null)
  const [lifecycle, setLifecycle] = useState(null)
  const [recs, setRecs] = useState([])
  const [contacts, setContacts] = useState([])
  const [latestAssessment, setLatestAssessment] = useState(null)
  const [findings, setFindings] = useState(null)
  const [showNewAssessment, setShowNewAssessment] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get(`/assets/lifecycle-score?client_id=${clientId}`).catch(() => null),
      api.get(`/recommendations?client_id=${clientId}`).catch(() => null),
      api.get(`/contacts?client_id=${clientId}`).catch(() => null),
      api.get(`/assessments?client_id=${clientId}`).catch(() => null),
      api.get(`/assessments/findings-summary?client_id=${clientId}`).catch(() => null),
    ]).then(([lcRes, recRes, conRes, assRes, findRes]) => {
      if (lcRes) setLifecycle(lcRes.data)
      if (recRes) setRecs(recRes.data?.data || recRes.data || [])
      if (conRes) setContacts(conRes.data || [])
      if (assRes) {
        const list = assRes.data?.data || assRes.data || []
        if (list.length > 0) setLatestAssessment(list[0])
      }
      if (findRes) setFindings(findRes.data)
    })
  }, [clientId])

  const lc = lifecycle?.components
  const activeRecs = recs
    .filter(r => r.status !== 'completed' && r.status !== 'declined')
    .slice(0, 6)
  const [selectedContact, setSelectedContact] = useState(null)
  const keyContacts = [...contacts]
    .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
    .slice(0, 4)
  const overallScore = lifecycle?.overall ?? client.health_score

  function handleContactSave(updated) {
    setContacts(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
    setSelectedContact(null)
  }

  return (
    <div className="flex gap-5 items-start">

      {/* ── Left panel ─────────────────────────────────────── */}
      <aside className="w-52 shrink-0 space-y-3 sticky top-4">

        {/* Score card */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <div className="flex justify-center mb-2">
            <ScoreRing score={overallScore} size={80} stroke={7} />
          </div>
          <p className="text-xs font-semibold text-gray-700">Alignment Score</p>
          <p className={`text-[11px] mt-0.5 font-medium ${
            (overallScore ?? 0) >= 75 ? 'text-green-600' :
            (overallScore ?? 0) >= 50 ? 'text-amber-600' : 'text-red-500'
          }`}>
            {overallScore == null ? 'No data yet' :
             overallScore >= 75 ? 'Healthy fleet' :
             overallScore >= 50 ? 'Needs attention' : 'At risk'}
          </p>
        </div>

        {/* Stats — each item drills into the relevant tab */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2.5">
          {[
            { label: 'Assets',      value: client.asset_count ?? '—',       icon: Monitor,       color: 'text-primary-600', tab: 'hardware'         },
            { label: 'Open Recs',   value: client.open_rec_count ?? '—',    icon: ClipboardList, color: 'text-orange-500',  tab: 'recommendations'  },
            { label: 'Assessments', value: client.assessment_count ?? '—',  icon: ShieldCheck,   color: 'text-green-600',   tab: 'assessments'      },
            { label: 'CSAT',        value: client.csat_score != null ? `${client.csat_score}%` : '—', icon: ThumbsUp, color: 'text-blue-500', tab: null },
          ].map(({ label, value, icon: Icon, color, tab }) => (
            tab ? (
              <button key={label} onClick={() => onSwitchTab(tab)}
                className="flex items-center justify-between w-full hover:bg-gray-50 rounded-lg px-1 -mx-1 py-0.5 transition-colors group cursor-pointer">
                <div className="flex items-center gap-2">
                  <Icon size={12} className={color} />
                  <span className="text-xs text-gray-600 group-hover:text-primary-600 transition-colors">{label}</span>
                </div>
                <span className="text-xs font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">{value}</span>
              </button>
            ) : (
              <div key={label} className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Icon size={12} className={color} />
                  <span className="text-xs text-gray-600">{label}</span>
                </div>
                <span className="text-xs font-semibold text-gray-900">{value}</span>
              </div>
            )
          ))}
        </div>

        {/* Key Contacts */}
        {keyContacts.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Key Contacts</p>
              <button onClick={() => onSwitchTab('contacts')}
                className="text-[10px] text-primary-600 hover:text-primary-700 font-medium">Manage</button>
            </div>
            <div className="space-y-2">
              {keyContacts.map(c => (
                <button key={c.id} onClick={() => setSelectedContact(c)}
                  className="flex items-center gap-2 w-full text-left hover:bg-gray-50 rounded-lg p-0.5 -mx-0.5 transition-colors group">
                  <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[11px] font-bold shrink-0">
                    {c.first_name?.charAt(0)}{c.last_name?.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-900 truncate leading-tight group-hover:text-primary-700">{c.first_name} {c.last_name}</p>
                    {c.title && <p className="text-[10px] text-gray-400 truncate leading-tight">{c.title}</p>}
                  </div>
                  <Edit2 size={11} className="text-gray-300 group-hover:text-primary-500 shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedContact && (
          <ContactModal contact={selectedContact} onClose={() => setSelectedContact(null)} onSave={handleContactSave} />
        )}
        {editRecId && (
          <RecEditModal recId={editRecId} onClose={() => setEditRecId(null)} onSaved={() => {
            api.get(`/recommendations?client_id=${clientId}`).then(r => setRecs(r.data?.data || r.data || [])).catch(() => {})
          }} />
        )}

        {/* Quick Actions */}
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quick Actions</p>
          <div className="space-y-0.5">
            <button onClick={() => setShowNewAssessment(true)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <ShieldCheck size={13} className="text-green-600" /> New Assessment
            </button>
            <button onClick={() => onSwitchTab('recommendations')}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <ClipboardList size={13} className="text-orange-500" /> Add Recommendation
            </button>
            {atUrl && (
              <a href={atUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <ExternalLink size={13} className="text-gray-400" /> Open in Autotask
              </a>
            )}
          </div>
        </div>

        {/* Client info */}
        {(client.phone || client.website || client.city) && (
          <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-1.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Info</p>
            {client.phone && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <Phone size={11} className="text-gray-400 shrink-0" />{client.phone}
              </div>
            )}
            {client.website && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600 truncate">
                <ExternalLink size={11} className="text-gray-400 shrink-0" />
                <a href={`https://${client.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer"
                  className="hover:text-primary-600 truncate">{client.website}</a>
              </div>
            )}
            {(client.city || client.state) && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <MapPin size={11} className="text-gray-400 shrink-0" />
                {[client.city, client.state].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ── Right content ──────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Findings Summary */}
        {findings && Number(findings.total_answered) > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <SectionHeader
              title="Total Findings"
              icon={AlertTriangle}
              actionLabel="View assessments"
              onAction={() => onSwitchTab('Assessments')}
            />
            <div className="mt-3 flex items-center gap-4">
              <div className="text-center px-4 py-3 bg-red-50 rounded-xl flex-1">
                <p className="text-3xl font-bold text-red-600 leading-none">{findings.total_misaligned}</p>
                <p className="text-xs text-gray-500 mt-1">Misaligned Items</p>
              </div>
              <div className="text-center px-4 py-3 bg-green-50 rounded-xl flex-1">
                <p className="text-3xl font-bold text-green-600 leading-none">{findings.total_aligned}</p>
                <p className="text-xs text-gray-500 mt-1">Aligned Items</p>
              </div>
              <div className="text-center px-4 py-3 bg-gray-50 rounded-xl flex-1">
                <p className="text-3xl font-bold text-gray-700 leading-none">
                  {findings.total_answered > 0
                    ? `${Math.round((findings.total_aligned / findings.total_answered) * 100)}%`
                    : '—'}
                </p>
                <p className="text-xs text-gray-500 mt-1">Alignment Rate</p>
              </div>
            </div>
            {findings.by_assessment?.length > 0 && (
              <div className="mt-3 space-y-2">
                {findings.by_assessment.map(a => {
                  const pct = a.answered > 0 ? Math.round(((a.answered - a.misaligned) / a.answered) * 100) : 0
                  return (
                    <div key={a.id} className="flex items-center gap-3">
                      <p className="text-xs text-gray-600 truncate flex-1">{a.name}</p>
                      <div className="w-24 bg-gray-100 rounded-full h-1.5 shrink-0">
                        <div className={`h-full rounded-full ${pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-12 text-right shrink-0">{a.misaligned} findings</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Roadmap / Recommendations */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionHeader
            title="Roadmap"
            icon={TrendingUp}
            actionLabel="View all"
            onAction={() => onSwitchTab('Roadmap')}
          />
          {activeRecs.length === 0 ? (
            <div className="py-8 text-center">
              <ClipboardList size={28} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">No open recommendations</p>
              <button onClick={() => onSwitchTab('Recommendations')}
                className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium">
                + Add first recommendation
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 -mx-5 mt-1">
              {activeRecs.map(rec => {
                const p = PRIORITY_CFG[rec.priority] || PRIORITY_CFG.medium
                const s = STATUS_CFG[rec.status] || STATUS_CFG.draft
                const budget = fmtBudget(rec.budget_one_time) || fmtBudget(rec.budget_recurring)
                return (
                  <div key={rec.id}
                    onClick={() => setEditRecId(rec.id)}
                    className="flex items-center gap-0 px-5 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors group">
                    <div className={`w-1 self-stretch shrink-0 rounded-sm mr-3 ${p.bar}`} />
                    <span className={`text-xs font-black w-6 shrink-0 ${p.text}`}>{p.bang}</span>
                    <span className="flex-1 min-w-0 text-sm text-gray-800 font-medium truncate group-hover:text-primary-700 mx-2">{rec.title}</span>
                    <div className="flex items-center gap-1.5 shrink-0 mr-3">
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      <span className="text-xs text-gray-400 hidden sm:block">{s.label}</span>
                    </div>
                    {rec.schedule_year && (
                      <span className="text-xs text-gray-400 shrink-0 mr-3 hidden md:block">
                        {rec.schedule_year}{rec.schedule_quarter ? ` ${rec.schedule_quarter}` : ''}
                      </span>
                    )}
                    {budget && (
                      <span className="text-xs font-medium text-gray-600 shrink-0">{budget}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Assessment Summary */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionHeader
            title="Assessment Summary"
            icon={ShieldCheck}
            actionLabel="New assessment"
            onAction={() => onSwitchTab('Assessments')}
          />
          {latestAssessment ? (
            <div className="flex items-center gap-4 mt-3">
              <ScoreRing score={latestAssessment.overall_score} size={64} stroke={6} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{latestAssessment.name || 'Assessment'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {latestAssessment.template_name && <span>{latestAssessment.template_name} · </span>}
                  <span className={latestAssessment.status === 'completed' ? 'text-green-600' : 'text-amber-600'}>
                    {latestAssessment.status === 'completed' ? 'Completed' : 'In progress'}
                  </span>
                  {latestAssessment.completed_at && (
                    <span> · {new Date(latestAssessment.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  )}
                </p>
                {latestAssessment.overall_score != null && (
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden w-full max-w-xs">
                    <div className={`h-full rounded-full ${
                      latestAssessment.overall_score >= 75 ? 'bg-green-500' :
                      latestAssessment.overall_score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                    }`} style={{ width: `${latestAssessment.overall_score}%` }} />
                  </div>
                )}
              </div>
              <button onClick={() => navigate(`/assessments/${latestAssessment.id}`)}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium shrink-0 flex items-center gap-0.5">
                Open <ChevronRight size={12} />
              </button>
            </div>
          ) : (
            <div className="py-8 text-center">
              <ShieldCheck size={28} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">No assessments yet</p>
              <button onClick={() => setShowNewAssessment(true)}
                className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium">
                Start first assessment →
              </button>
            </div>
          )}
        </div>

        {/* Hardware Insights */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionHeader
            title="Hardware Insights"
            icon={Monitor}
            actionLabel="View hardware"
            onAction={() => onSwitchTab('Hardware')}
          />
          {lifecycle ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                {[
                  { label: 'Total Assets',    value: lifecycle.total,                    col: 'bg-gray-50',    val: 'text-gray-900' },
                  { label: 'Expired Warranty', value: lc?.warranty?.expired ?? 0,         col: 'bg-red-50',     val: 'text-red-600'  },
                  { label: 'Expiring Soon',   value: lc?.warranty?.expiring ?? 0,        col: 'bg-amber-50',   val: 'text-amber-600'},
                  { label: 'RMM Coverage',    value: lc?.rmm?.active != null ? `${Math.round((lc.rmm.active / (lifecycle.total || 1)) * 100)}%` : '—', col: 'bg-primary-50', val: 'text-primary-600' },
                ].map(({ label, value, col, val }) => (
                  <div key={label} className={`rounded-xl p-3 text-center ${col}`}>
                    <p className={`text-2xl font-bold leading-none mb-1 ${val}`}>{value}</p>
                    <p className="text-[11px] text-gray-500 leading-tight">{label}</p>
                  </div>
                ))}
              </div>
              {lc && (
                <div className="mt-4 space-y-2.5">
                  <ComponentBar label="Warranty Coverage" score={lc.warranty.score} weight={lc.warranty.weight}
                    detail={`${lc.warranty.active} active · ${lc.warranty.expiring} expiring · ${lc.warranty.expired} expired · ${lc.warranty.unknown} unknown`} />
                  <ComponentBar label="Asset Age" score={lc.age.score} weight={lc.age.weight}
                    detail={`${lc.age.under_3} under 3yr · ${lc.age.age_3_to_5} 3–5yr · ${lc.age.over_5} over 5yr`} />
                  <ComponentBar label="RMM Visibility" score={lc.rmm.score} weight={lc.rmm.weight}
                    detail={`${lc.rmm.active} active in RMM`} />
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-4 gap-3 mt-3">
              {[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />)}
            </div>
          )}
        </div>

      </div>

      {showNewAssessment && (
        <NewAssessmentModal
          clientId={clientId}
          onClose={() => setShowNewAssessment(false)}
          onCreated={() => setShowNewAssessment(false)}
        />
      )}

      {editRecId && <RecEditModal recId={editRecId} onClose={() => setEditRecId(null)} onSaved={() => {}} />}
    </div>
  )
}

// ─── Tab: Assets ──────────────────────────────────────────────────────────────

const ASSET_TYPE_ICONS_SIDEBAR = {
  'Workstation':    { icon: Monitor,   color: 'text-primary-600' },
  'Laptop':         { icon: Laptop,    color: 'text-primary-600' },
  'Server':         { icon: Server,    color: 'text-blue-600' },
  'Switch':         { icon: Wifi,      color: 'text-purple-600' },
  'Firewall':       { icon: Shield,    color: 'text-red-600' },
  'Router':         { icon: Router,    color: 'text-orange-600' },
  'Access Point':   { icon: Wifi,      color: 'text-teal-600' },
  'UPS':            { icon: Activity,  color: 'text-yellow-600' },
  'NAS/SAN':        { icon: HardDrive, color: 'text-gray-600' },
  'Printer':        { icon: Printer,   color: 'text-gray-600' },
  'Virtual Machine':{ icon: Cpu,       color: 'text-sky-600' },
  'Monitor':        { icon: Monitor,   color: 'text-gray-400' },
  'Other':          { icon: Box,       color: 'text-gray-400' },
}

const ASSET_TYPE_ORDER = ['Workstation','Laptop','Server','Switch','Firewall','Router',
  'Access Point','UPS','NAS/SAN','Printer','Virtual Machine','Monitor','Other']

const LIFECYCLE_FILTERS = [
  { key: 'active',        label: 'All Active' },
  { key: 'expiring_soon', label: 'Expiring Soon' },
  { key: 'expired',       label: 'Expired' },
  { key: 'eol_soon',      label: 'EOL Soon' },
  { key: 'eol',           label: 'EOL' },
  { key: 'decommissioned',label: 'Decommissioned' },
]

function getEolDate(asset) {
  if (asset.eol_date) return new Date(asset.eol_date)
  if (asset.purchase_date && asset.default_lifecycle_years) {
    const d = new Date(asset.purchase_date)
    d.setFullYear(d.getFullYear() + parseInt(asset.default_lifecycle_years))
    return d
  }
  return null
}

function AssetsTab({ clientId }) {
  const [assets, setAssets]                   = useState([])
  const [decommAssets, setDecommAssets]       = useState([])
  const [assetTypes, setAssetTypes]           = useState([])
  const [loading, setLoading]                 = useState(true)
  const [selected, setSelected]               = useState(null)
  const [search, setSearch]                   = useState('')
  const [typeFilter, setTypeFilter]           = useState('all')
  const [lifecycleFilter, setLifecycleFilter] = useState('active')
  const [decommLoaded, setDecommLoaded]       = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get(`/assets?client_id=${clientId}&limit=2000`),
      api.get('/assets/types'),
    ]).then(([aRes, tRes]) => {
      setAssets(aRes.data || [])
      setAssetTypes(tRes.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [clientId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (lifecycleFilter === 'decommissioned' && !decommLoaded) {
      api.get(`/assets?lifecycle=decommissioned&client_id=${clientId}&limit=2000`)
        .then(r => { setDecommAssets(r.data || []); setDecommLoaded(true) })
        .catch(console.error)
    }
  }, [lifecycleFilter, clientId, decommLoaded])

  function handleSave(updated) {
    setAssets(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
    setSelected(prev => prev ? { ...prev, ...updated } : prev)
  }

  const baseAssets = lifecycleFilter === 'decommissioned' ? decommAssets : assets

  // Pre-filter: search + type + lifecycle
  const preFiltered = useMemo(() => {
    const now = new Date()
    const soon12mo = new Date(now.getTime() + 365 * 86400000)
    const warningSoon = new Date(now.getTime() + 90 * 86400000)
    return baseAssets.filter(a => {
      if (search) {
        const q = search.toLowerCase()
        if (!a.name?.toLowerCase().includes(q) &&
            !a.serial_number?.toLowerCase().includes(q) &&
            !a.hostname?.toLowerCase().includes(q) &&
            !a.last_user?.toLowerCase().includes(q) &&
            !a.manufacturer?.toLowerCase().includes(q) &&
            !a.model?.toLowerCase().includes(q)) return false
      }
      if (typeFilter !== 'all' && a.asset_type_name !== typeFilter) return false
      if (lifecycleFilter === 'decommissioned') return true
      if (lifecycleFilter === 'expiring_soon') {
        const exp = a.warranty_expiry ? new Date(a.warranty_expiry) : null
        return exp && exp >= now && exp <= warningSoon
      }
      if (lifecycleFilter === 'expired') {
        const exp = a.warranty_expiry ? new Date(a.warranty_expiry) : null
        return exp && exp < now
      }
      if (lifecycleFilter === 'eol_soon') {
        const eol = getEolDate(a)
        return eol && eol > now && eol <= soon12mo
      }
      if (lifecycleFilter === 'eol') {
        const eol = getEolDate(a)
        return eol && eol <= now
      }
      return true // 'active'
    })
  }, [baseAssets, search, typeFilter, lifecycleFilter])

  // Type counts (from active assets)
  const typeCounts = useMemo(() => {
    const map = {}
    for (const a of assets) map[a.asset_type_name || 'Other'] = (map[a.asset_type_name || 'Other'] || 0) + 1
    return map
  }, [assets])

  // Lifecycle tab counts
  const lifecycleCounts = useMemo(() => {
    const now = new Date()
    const soon12mo = new Date(now.getTime() + 365 * 86400000)
    const warningSoon = new Date(now.getTime() + 90 * 86400000)
    const counts = { active: assets.length, expiring_soon: 0, expired: 0, eol_soon: 0, eol: 0, decommissioned: decommAssets.length }
    for (const a of assets) {
      const exp = a.warranty_expiry ? new Date(a.warranty_expiry) : null
      const eol = getEolDate(a)
      if (exp && exp >= now && exp <= warningSoon) counts.expiring_soon++
      if (exp && exp < now) counts.expired++
      if (eol && eol > now && eol <= soon12mo) counts.eol_soon++
      if (eol && eol <= now) counts.eol++
    }
    return counts
  }, [assets, decommAssets])

  return (
    <div className="flex gap-6">
      {/* ── Type sidebar ───────────────────────────────────────────────── */}
      <aside className="w-44 shrink-0">
        <div className="sticky top-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X size={12} /></button>}
          </div>

          {/* Asset type filter */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-1">Type</p>
            <nav className="space-y-0.5">
              <button onClick={() => setTypeFilter('all')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors ${typeFilter === 'all' ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                <span>All Types</span>
                <span className="text-xs text-gray-400">{assets.length}</span>
              </button>
              {ASSET_TYPE_ORDER.map(t => {
                const cnt = typeCounts[t] || 0
                if (cnt === 0) return null
                const cfg = ASSET_TYPE_ICONS_SIDEBAR[t] || ASSET_TYPE_ICONS_SIDEBAR['Other']
                const Icon = cfg.icon
                return (
                  <button key={t} onClick={() => setTypeFilter(t)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors ${typeFilter === t ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                    <span className="flex items-center gap-1.5">
                      <Icon size={12} className={typeFilter === t ? cfg.color : 'text-gray-400'} />
                      {t}
                    </span>
                    <span className="text-xs text-gray-400">{cnt}</span>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Refresh */}
          <button onClick={load}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Lifecycle tabs */}
        <div className="flex border-b border-gray-200 mb-4 gap-0.5 flex-wrap">
          {LIFECYCLE_FILTERS.map(f => {
            const count = lifecycleCounts[f.key] ?? 0
            const isDecomm = f.key === 'decommissioned'
            return (
              <button key={f.key}
                onClick={() => setLifecycleFilter(f.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                  lifecycleFilter === f.key
                    ? isDecomm ? 'border-gray-500 text-gray-600' : 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {f.label}
                <span className={`ml-1.5 text-xs ${
                  f.key === 'expired' || f.key === 'eol' ? 'text-red-400' :
                  f.key === 'expiring_soon' || f.key === 'eol_soon' ? 'text-amber-400' :
                  'text-gray-400'
                }`}>{count}</span>
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mr-3" />
            <span className="text-sm">Loading assets…</span>
          </div>
        ) : (
          <HardwareTable
            assets={preFiltered}
            assetTypes={assetTypes}
            clientId={clientId}
            onRowClick={setSelected}
          />
        )}
      </div>

      {selected && (
        <AssetModal
          asset={selected}
          assetTypes={assetTypes}
          onClose={() => setSelected(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

// ─── Tab: Contacts ───────────────────────────────────────────────────────────

function ContactsTab({ clientId, autotaskCompanyId }) {
  const [contacts, setContacts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [selected, setSelected]   = useState(null)

  useEffect(() => {
    api.get(`/contacts?client_id=${clientId}`)
      .then(r => setContacts(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [clientId])

  function handleSave(updated) {
    setContacts(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
    setSelected(prev => prev ? { ...prev, ...updated } : prev)
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Loading contacts...</div>

  const filtered = contacts.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (c.first_name + ' ' + c.last_name).toLowerCase().includes(q) ||
           c.email?.toLowerCase().includes(q) ||
           c.title?.toLowerCase().includes(q)
  })

  const syncing = contacts.filter(c => c.sync_enabled !== false).length

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search contacts..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
        <p className="text-sm text-gray-400 shrink-0">{contacts.length} total · {syncing} syncing</p>
        {autotaskCompanyId && (
          <a href={autotaskUrl('company', autotaskCompanyId)} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium shrink-0">
            <ExternalLink size={14} /> View in Autotask
          </a>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <User size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">{contacts.length === 0 ? 'No contacts synced yet' : 'No contacts match your search'}</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(contact => (
            <Card key={contact.id}
              className="cursor-pointer hover:border-primary-200 hover:shadow-sm transition-all"
              onClick={() => setSelected(contact)}>
              <div className="p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold text-sm shrink-0">
                  {contact.first_name?.charAt(0)}{contact.last_name?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">
                      {contact.first_name} {contact.last_name}
                    </p>
                    {contact.is_primary && (
                      <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-medium">Primary</span>
                    )}
                    {contact.sync_enabled === false && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">No Sync</span>
                    )}
                  </div>
                  {contact.title && <p className="text-xs text-gray-500 mt-0.5">{contact.title}</p>}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary-600 mt-1">
                      <Mail size={11} />{contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary-600">
                      <Phone size={11} />{contact.phone}
                    </a>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {contact.external_id && (
                    <a href={autotaskUrl('contact', contact.external_id)} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-gray-400 hover:text-primary-600" title="Open in Autotask">
                      <ExternalLink size={13} />
                    </a>
                  )}
                  <button onClick={e => { e.stopPropagation(); setSelected(contact) }}
                    className="text-gray-300 hover:text-primary-600">
                    <Edit2 size={13} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <ContactModal
          contact={selected}
          onClose={() => setSelected(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

// ─── Tab: Software ────────────────────────────────────────────────────────────

// ── Sub-view: Product → Devices (with search + filters) ──────────────────────
function ProductDevicesView({ product, devices, loading, onBack, onDrillDevice }) {
  const [search, setSearch]       = useState('')
  const [mfgFilter, setMfgFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const manufacturers = useMemo(() => {
    const m = {}
    devices.forEach(d => { if (d.manufacturer) m[d.manufacturer] = (m[d.manufacturer] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [devices])

  const deviceTypes = useMemo(() => {
    const t = {}
    devices.forEach(d => { const dt = d.device_type || 'Unknown'; t[dt] = (t[dt] || 0) + 1 })
    return Object.entries(t).sort((a, b) => b[1] - a[1])
  }, [devices])

  const filtered = useMemo(() => {
    return devices.filter(d => {
      if (mfgFilter && d.manufacturer !== mfgFilter) return false
      if (typeFilter && (d.device_type || 'Unknown') !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (d.device_name || '').toLowerCase().includes(q) ||
               (d.manufacturer || '').toLowerCase().includes(q) ||
               (d.serial_number || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [devices, mfgFilter, typeFilter, search])

  const hasFilters = search || mfgFilter || typeFilter

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 mb-4">
        <ChevronRight size={14} className="rotate-180" /> Back to Products
      </button>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-gray-900">{product.product_name}</h3>
          <p className="text-xs text-gray-500">{product.publisher} · {product.category || 'Uncategorized'} · {product.installed_count} devices</p>
        </div>
        <span className="text-xs text-gray-400">{filtered.length} of {devices.length} devices</span>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Find in list..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none">
          <option value="">All hardware types</option>
          {deviceTypes.map(([t, c]) => <option key={t} value={t}>{t} ({c})</option>)}
        </select>
        <select value={mfgFilter} onChange={e => setMfgFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none">
          <option value="">All manufacturers</option>
          {manufacturers.map(([m, c]) => <option key={m} value={m}>{m} ({c})</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setSearch(''); setMfgFilter(''); setTypeFilter('') }}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium">Clear all</button>
        )}
      </div>

      {loading ? <div className="py-12 text-center text-gray-400">Loading devices...</div> : filtered.length === 0 ? (
        <Card className="py-12 text-center text-gray-400">
          {devices.length === 0 ? 'No devices found with this software' : 'No devices match your filters'}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2">Hardware Name</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2">Manufacturer</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2">Serial</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2">Publisher</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2">Product Name</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(d => (
                <tr key={d.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onDrillDevice(d)}>
                  <td className="px-3 py-2"><span className="text-sm font-medium text-primary-600 hover:underline">{d.device_name || '—'}</span></td>
                  <td className="px-3 py-2 text-xs text-gray-600">{d.manufacturer || '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 font-mono">{d.serial_number || '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{d.publisher || '—'}</td>
                  <td className="px-3 py-2 text-sm text-primary-600">{product.product_name}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 font-mono">{d.version || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ── Sub-view: Device → Software (with search + filters) ──────────────────────
function DeviceSoftwareView({ device, software, loading, productName, onBack }) {
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [pubFilter, setPubFilter] = useState('')

  const categories = useMemo(() => {
    const c = {}
    software.forEach(s => { const cat = s.category || 'Uncategorized'; c[cat] = (c[cat] || 0) + 1 })
    return Object.entries(c).sort((a, b) => b[1] - a[1])
  }, [software])

  const publishers = useMemo(() => {
    const p = {}
    software.forEach(s => { const pub = s.publisher || s.vendor; if (pub) p[pub] = (p[pub] || 0) + 1 })
    return Object.entries(p).sort((a, b) => b[1] - a[1])
  }, [software])

  const filtered = useMemo(() => {
    return software.filter(s => {
      if (catFilter && (s.category || 'Uncategorized') !== catFilter) return false
      if (pubFilter && (s.publisher || s.vendor) !== pubFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (s.name || '').toLowerCase().includes(q) ||
               (s.publisher || s.vendor || '').toLowerCase().includes(q) ||
               (s.category || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [software, catFilter, pubFilter, search])

  const hasFilters = search || catFilter || pubFilter

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 mb-4">
        <ChevronRight size={14} className="rotate-180" /> Back to {productName}
      </button>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-gray-900">{device.device_name || 'Unknown Device'}</h3>
          <p className="text-xs text-gray-500">{[device.manufacturer, device.model, device.serial_number].filter(Boolean).join(' · ')}</p>
        </div>
        <span className="text-xs text-gray-400">{filtered.length} of {software.length} installed</span>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Find installed software..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none">
          <option value="">All categories</option>
          {categories.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        <select value={pubFilter} onChange={e => setPubFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none">
          <option value="">All publishers</option>
          {publishers.map(([p, n]) => <option key={p} value={p}>{p} ({n})</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setSearch(''); setCatFilter(''); setPubFilter('') }}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium">Clear all</button>
        )}
      </div>

      {loading ? <div className="py-12 text-center text-gray-400">Loading...</div> : filtered.length === 0 ? (
        <Card className="py-12 text-center text-gray-400">
          {software.length === 0 ? 'No software found on this device' : 'No software matches your filters'}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2">Publisher</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2">Product Name</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2">Category</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-600">{s.publisher || s.vendor || '—'}</td>
                  <td className="px-3 py-2"><span className="text-sm font-medium text-primary-600">{s.name}</span></td>
                  <td className="px-3 py-2 text-xs text-gray-500">{s.category || '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 font-mono">{s.version || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// Inline editable cell for software publisher/category
function EditableSoftwareCell({ value, field, productName, onUpdated, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value || '')
  const [saving, setSaving] = useState(false)

  const CATEGORY_OPTIONS = [
    '', 'Endpoint protection', 'RMM', 'Office suite', 'OS', 'Web browser',
    'Cloud storage', 'Communication', 'Remote control', 'Accounting', 'Runtime',
    'Backup', 'PDF', 'Maintenance utility', 'Password manager', 'VPN',
    'Database', 'Development', 'ERP', 'CRM', 'LOB', 'Other',
  ]

  async function save() {
    setSaving(true)
    try {
      await api.patch(`/software/product/${encodeURIComponent(productName)}`, {
        [field]: val || null,
      })
      onUpdated(field, val)
      setEditing(false)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <td className={`px-3 py-1 ${className}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          {field === 'category' ? (
            <select value={val} onChange={e => setVal(e.target.value)} autoFocus
              onBlur={save} onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
              className="w-full text-xs border border-primary-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-400">
              {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c || '— None —'}</option>)}
            </select>
          ) : (
            <input type="text" value={val} onChange={e => setVal(e.target.value)} autoFocus
              onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
              className="w-full text-xs border border-primary-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-400"
              placeholder={`Set ${field}...`} />
          )}
        </div>
      </td>
    )
  }

  return (
    <td className={`px-3 py-2 ${className} group/cell`} onClick={e => { e.stopPropagation(); setEditing(true) }}>
      <span className={`text-xs ${value ? 'text-gray-600' : 'text-gray-300 italic'} group-hover/cell:text-primary-600 cursor-pointer`}>
        {value || '— click to set —'}
      </span>
    </td>
  )
}

function SoftwareTab({ clientId }) {
  const [products, setProducts]       = useState([])
  const [categories, setCategories]   = useState([])
  const [totalDevices, setTotalDevices] = useState(0)
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [catFilter, setCatFilter]     = useState('')
  const [pubFilter, setPubFilter]     = useState('')
  const [showAll, setShowAll]         = useState(false)
  const [sortCol, setSortCol]         = useState('installed_count')
  const [sortDir, setSortDir]         = useState('desc')
  // Drill-in states
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [productDevices, setProductDevices]   = useState([])
  const [loadingDevices, setLoadingDevices]   = useState(false)
  const [selectedDevice, setSelectedDevice]   = useState(null)
  const [deviceSoftware, setDeviceSoftware]   = useState([])
  const [loadingDevice, setLoadingDevice]     = useState(false)
  // LOB tracking
  const [lobApps, setLobApps]         = useState(new Set())
  const [addingLob, setAddingLob]     = useState({})

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get(`/software/products?client_id=${clientId}&hide_noise=${!showAll}`),
      api.get(`/software/categories?client_id=${clientId}`),
      api.get('/settings/lob-apps'),
    ]).then(([pRes, cRes, lobRes]) => {
      setProducts(pRes.data || [])
      setTotalDevices(pRes.total_devices || 0)
      setCategories(cRes.data || [])
      setLobApps(new Set((lobRes.data || []).map(a => a.name.toLowerCase())))
    }).catch(console.error).finally(() => setLoading(false))
  }, [clientId, showAll])

  useEffect(() => { load() }, [load])

  async function addToLob(product, e) {
    e.stopPropagation()
    const key = product.product_name
    setAddingLob(prev => ({ ...prev, [key]: true }))
    try {
      await api.post('/settings/lob-apps', {
        name: product.product_name,
        vendor: product.publisher || null,
        category: product.category || 'lob',
        client_id: clientId,
      })
      setLobApps(prev => new Set([...prev, key.toLowerCase()]))
    } catch (err) {
      console.error('Failed to add LOB app:', err)
    } finally {
      setAddingLob(prev => ({ ...prev, [key]: false }))
    }
  }

  async function drillIntoProduct(product) {
    setSelectedProduct(product)
    setSelectedDevice(null)
    setLoadingDevices(true)
    try {
      const res = await api.get(`/software/products/${encodeURIComponent(product.product_name)}/devices?client_id=${clientId}`)
      setProductDevices(res.data || [])
    } catch (err) { console.error(err) }
    finally { setLoadingDevices(false) }
  }

  async function drillIntoDevice(device) {
    if (!device.asset_id) return
    setSelectedDevice(device)
    setLoadingDevice(true)
    try {
      const res = await api.get(`/software/device/${device.asset_id}`)
      setDeviceSoftware(res.data || [])
    } catch (err) { console.error(err) }
    finally { setLoadingDevice(false) }
  }

  function goBack() {
    if (selectedDevice) { setSelectedDevice(null); setDeviceSoftware([]) }
    else if (selectedProduct) { setSelectedProduct(null); setProductDevices([]) }
  }

  const filtered = useMemo(() => {
    const list = products.filter(p => {
      if (catFilter && p.category !== catFilter) return false
      if (pubFilter && p.publisher !== pubFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return p.product_name?.toLowerCase().includes(q) || p.publisher?.toLowerCase().includes(q)
      }
      return true
    })
    // Sort
    list.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol]
      if (av == null) av = ''
      if (bv == null) bv = ''
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [products, catFilter, pubFilter, search, sortCol, sortDir])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'product_name' || col === 'publisher' || col === 'category' ? 'asc' : 'desc') }
  }

  const publishers = useMemo(() => {
    const map = {}
    products.forEach(p => { if (p.publisher) map[p.publisher] = (map[p.publisher] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [products])

  // ── Device software view ──
  if (selectedDevice) {
    return <DeviceSoftwareView
      device={selectedDevice}
      software={deviceSoftware}
      loading={loadingDevice}
      productName={selectedProduct.product_name}
      onBack={goBack}
    />
  }

  // ── Product drill-in view (devices with product installed) ──
  if (selectedProduct) {
    return <ProductDevicesView
      product={selectedProduct}
      devices={productDevices}
      loading={loadingDevices}
      onBack={goBack}
      onDrillDevice={drillIntoDevice}
    />
  }

  // ── Products list view (main) ──
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{products.length} products across {totalDevices} devices</p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500">
            <span>{showAll ? 'Showing all' : 'Hiding noise'}</span>
            <button onClick={() => setShowAll(!showAll)}
              className={`relative w-9 h-5 rounded-full transition-colors ${showAll ? 'bg-primary-600' : 'bg-gray-200'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${showAll ? 'translate-x-4' : ''}`} />
            </button>
          </label>
          <button onClick={load} className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600"><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Category summary cards */}
      {categories.length > 0 && (
        <div className="flex gap-3 mb-5 overflow-x-auto pb-1">
          {categories.slice(0, 8).map(c => (
            <button key={c.category}
              onClick={() => setCatFilter(catFilter === c.category ? '' : c.category)}
              className={`shrink-0 px-4 py-3 rounded-xl border transition-colors text-left min-w-[120px] ${
                catFilter === c.category ? 'bg-primary-50 border-primary-200' : 'bg-white border-gray-200 hover:border-gray-300'
              }`}>
              <p className="text-lg font-bold text-gray-900">{c.device_count}</p>
              <p className="text-xs font-semibold text-gray-600 truncate">{c.category}</p>
              <p className="text-xs text-gray-400">{c.product_count} products</p>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search software..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
        <select value={pubFilter} onChange={e => setPubFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none">
          <option value="">All Publishers</option>
          {publishers.map(([p, c]) => <option key={p} value={p}>{p} ({c})</option>)}
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.category} value={c.category}>{c.category} ({c.product_count})</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading software...</div>
      ) : filtered.length === 0 ? (
        <Card className="py-12 text-center text-gray-400">
          {products.length === 0 ? 'No software data — run a Software sync first' : 'No software matches your filters'}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {[
                  { key: 'product_name',      label: 'Product Name', align: 'left' },
                  { key: 'publisher',          label: 'Publisher',    align: 'left' },
                  { key: 'category',           label: 'Category',     align: 'left' },
                  { key: 'installed_count',    label: 'Installed',    align: 'left' },
                  { key: 'not_installed_count', label: 'Not Installed', align: 'left' },
                  { key: null,                 label: 'Coverage',     align: 'left', className: 'w-32' },
                  { key: null,                 label: 'LOB',          align: 'center', className: 'w-20' },
                ].map(col => (
                  <th key={col.label}
                    onClick={col.key ? () => toggleSort(col.key) : undefined}
                    className={`text-${col.align} text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2 ${col.className || ''} ${col.key ? 'cursor-pointer hover:text-gray-700 select-none' : ''}`}>
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.key && sortCol === col.key && (
                        sortDir === 'asc'
                          ? <ChevronUp size={12} className="text-primary-500" />
                          : <ChevronDown size={12} className="text-primary-500" />
                      )}
                      {col.key && sortCol !== col.key && (
                        <ChevronDown size={12} className="text-gray-300" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((p, i) => {
                const pct = totalDevices > 0 ? Math.round((p.installed_count / totalDevices) * 100) : 0
                const barColor = pct === 100 ? 'bg-green-500' : pct >= 80 ? 'bg-green-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
                return (
                  <tr key={i} className="hover:bg-gray-50 cursor-pointer" onClick={() => drillIntoProduct(p)}>
                    <td className="px-3 py-2">
                      <span className="text-sm font-medium text-primary-600 hover:underline">{p.product_name}</span>
                    </td>
                    <EditableSoftwareCell value={p.publisher} field="publisher" productName={p.product_name}
                      onUpdated={(f, v) => setProducts(prev => prev.map(pp => pp.product_name === p.product_name ? { ...pp, [f]: v } : pp))} />
                    <EditableSoftwareCell value={p.category} field="category" productName={p.product_name}
                      onUpdated={(f, v) => setProducts(prev => prev.map(pp => pp.product_name === p.product_name ? { ...pp, [f]: v } : pp))} />
                    <td className="px-3 py-2">
                      <span className="text-xs font-medium text-green-700">{p.installed_count}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium ${p.not_installed_count > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {p.not_installed_count}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {lobApps.has(p.product_name.toLowerCase()) ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle size={13} /> LOB
                        </span>
                      ) : (
                        <button
                          onClick={(e) => addToLob(p, e)}
                          disabled={addingLob[p.product_name]}
                          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded px-1.5 py-0.5 transition-colors"
                          title="Add to Line of Business list"
                        >
                          {addingLob[p.product_name] ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                          LOB
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ─── Tab: SaaS Licenses ───────────────────────────────────────────────────────

function SetSeatsModal({ row, onClose, onSave }) {
  const [form, setForm] = useState({
    total_seats: row.total_seats || '',
    cost_per_seat: row.cost_per_seat || '',
    subscription_end: row.subscription_end ? row.subscription_end.slice(0, 10) : '',
    notes: row.notes || '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await api.post('/saas-licenses/subscriptions', {
        client_id: row.client_id,
        platform: row.platform,
        license_name: row.license_name,
        total_seats: parseInt(form.total_seats) || 0,
        cost_per_seat: parseFloat(form.cost_per_seat) || null,
        subscription_end: form.subscription_end || null,
        notes: form.notes || null,
      })
      onSave()
      onClose()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Set Subscription Details</h3>
            <p className="text-xs text-gray-400 mt-0.5">{row.license_display_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Total Seats Purchased</label>
              <input type="number" min="0" value={form.total_seats}
                onChange={e => setForm(f => ({ ...f, total_seats: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cost per Seat / mo</label>
              <input type="number" min="0" step="0.01" value={form.cost_per_seat}
                onChange={e => setForm(f => ({ ...f, cost_per_seat: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subscription Expiry</label>
            <input type="date" value={form.subscription_end}
              onChange={e => setForm(f => ({ ...f, subscription_end: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
              placeholder="Optional notes..." />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LicensesTab({ clientId }) {
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [editRow, setEditRow] = useState(null)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [usersByLicense, setUsersByLicense] = useState({})
  const [platformFilter, setPlatformFilter] = useState('all')
  const [drillDown, setDrillDown] = useState(null)

  function load() {
    setLoading(true)
    api.get(`/saas-licenses/summary?client_id=${clientId}`)
      .then(r => setSummary(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [clientId])

  async function loadUsers(licenseName) {
    if (usersByLicense[licenseName]) return
    try {
      const r = await api.get(`/saas-licenses?client_id=${clientId}`)
      const byLicense = {}
      for (const u of (r.data || [])) {
        if (!byLicense[u.license_name]) byLicense[u.license_name] = []
        byLicense[u.license_name].push(u)
      }
      setUsersByLicense(prev => ({ ...prev, ...byLicense }))
    } catch (err) { console.error(err) }
  }

  function toggleExpand(licenseName) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(licenseName)) { next.delete(licenseName) } else {
        next.add(licenseName)
        loadUsers(licenseName)
      }
      return next
    })
  }

  function openLicenseDrill(key) {
    const PLATFORM_LABEL = { microsoft_365: 'Microsoft 365', google_workspace: 'Google Workspace' }
    if (key === 'skus') {
      setDrillDown({
        title: 'License SKUs',
        subtitle: `${filtered.length} license types`,
        columns: [
          { key: 'license_display_name', label: 'Product' },
          { key: 'platform_label',       label: 'Platform' },
          { key: 'consumed',             label: 'Consumed', align: 'right' },
          { key: 'available',            label: 'Available', align: 'right',
            render: (v, row) => <span className={parseInt(row.total_seats) > 0 ? (parseInt(v) === 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold') : 'text-gray-400'}>{parseInt(row.total_seats) > 0 ? v : '—'}</span> },
        ],
        rows: filtered.map(r => ({ ...r, platform_label: PLATFORM_LABEL[r.platform] || r.platform })),
      })
    } else if (key === 'consumed') {
      const allUsers = Object.values(usersByLicense).flat()
      const rows = allUsers.length > 0 ? allUsers : []
      if (rows.length === 0) {
        api.get(`/saas-licenses?client_id=${clientId}`).then(r => {
          const users = r.data || []
          setDrillDown({
            title: 'Consumed Licenses',
            subtitle: 'All assigned users',
            columns: [
              { key: 'display', label: 'User', render: (v, row) => <span>{row.user_display_name || row.user_email}</span> },
              { key: 'user_email',   label: 'Email' },
              { key: 'license_name', label: 'License' },
              { key: 'account_status', label: 'Status', render: (v) => <span className={`capitalize text-xs px-2 py-0.5 rounded-full ${v === 'suspended' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{v || 'active'}</span> },
            ],
            rows: users,
          })
        }).catch(console.error)
        return
      }
      setDrillDown({
        title: 'Consumed Licenses', subtitle: 'All assigned users',
        columns: [
          { key: 'display', label: 'User', render: (v, row) => <span>{row.user_display_name || row.user_email}</span> },
          { key: 'user_email', label: 'Email' },
          { key: 'license_name', label: 'License' },
          { key: 'account_status', label: 'Status', render: (v) => <span className={`capitalize text-xs px-2 py-0.5 rounded-full ${v === 'suspended' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{v || 'active'}</span> },
        ],
        rows,
      })
    } else if (key === 'available') {
      setDrillDown({
        title: 'Available Seats', subtitle: 'SKUs with open seats',
        columns: [
          { key: 'license_display_name', label: 'Product' },
          { key: 'total_seats', label: 'Total', align: 'right' },
          { key: 'consumed',    label: 'Consumed', align: 'right' },
          { key: 'available',   label: 'Available', align: 'right',
            render: (v) => <span className={parseInt(v) > 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{v}</span> },
        ],
        rows: filtered.filter(r => parseInt(r.total_seats) > 0),
      })
    } else if (key === 'mfa') {
      api.get(`/saas-licenses?client_id=${clientId}`).then(r => {
        const users = (r.data || []).filter(u => u.mfa_enabled === false)
        setDrillDown({
          title: 'MFA Issues', subtitle: 'Users with MFA disabled',
          columns: [
            { key: 'display',    label: 'User', render: (v, row) => <span>{row.user_display_name || row.user_email}</span> },
            { key: 'user_email', label: 'Email' },
            { key: 'license_name', label: 'License' },
            { key: 'mfa_method', label: 'MFA Method', render: (v) => <span className="text-red-600 text-xs">{v || 'None'}</span> },
          ],
          rows: users,
        })
      }).catch(console.error)
    } else if (key === 'monthly') {
      setDrillDown({
        title: 'Monthly Cost Breakdown', subtitle: 'Estimated cost by license',
        columns: [
          { key: 'license_display_name', label: 'Product' },
          { key: 'consumed',      label: 'Seats', align: 'right' },
          { key: 'cost_per_seat', label: '$/Seat', align: 'right', render: (v) => <span>{v ? `$${parseFloat(v).toFixed(2)}` : '—'}</span> },
          { key: 'monthly_total', label: 'Monthly Total', align: 'right',
            render: (v) => <span className="font-semibold">{parseFloat(v) > 0 ? `$${parseFloat(v).toLocaleString(undefined,{maximumFractionDigits:0})}` : '—'}</span> },
        ],
        rows: filtered.filter(r => parseFloat(r.monthly_total) > 0).sort((a,b) => parseFloat(b.monthly_total) - parseFloat(a.monthly_total)),
      })
    }
  }

  const PLATFORM_LABEL = { microsoft_365: 'Microsoft 365', google_workspace: 'Google Workspace' }
  const PLATFORM_COLOR = {
    microsoft_365:    'bg-blue-50 text-blue-700 border-blue-200',
    google_workspace: 'bg-green-50 text-green-700 border-green-200',
  }

  const now = new Date()

  const filtered = summary.filter(r => platformFilter === 'all' || r.platform === platformFilter)

  // Stats
  const totalConsumed  = filtered.reduce((s, r) => s + parseInt(r.consumed || 0), 0)
  const totalSeats     = filtered.reduce((s, r) => s + parseInt(r.total_seats || 0), 0)
  const totalAvailable = filtered.reduce((s, r) => s + parseInt(r.available || 0), 0)
  const totalMFA       = filtered.reduce((s, r) => s + parseInt(r.mfa_disabled_count || 0), 0)
  const totalMonthly   = filtered.reduce((s, r) => s + parseFloat(r.monthly_total || 0), 0)

  if (loading) return <div className="text-center py-12 text-gray-400">Loading licenses…</div>

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { key: 'skus',     label: 'License SKUs', value: filtered.length,                       color: 'text-gray-900',    clickable: true },
          { key: 'consumed', label: 'Consumed',     value: totalConsumed,                          color: 'text-primary-600', clickable: true },
          { key: 'available',label: 'Available',    value: totalSeats > 0 ? totalAvailable : '—',
            color: totalAvailable === 0 && totalSeats > 0 ? 'text-red-600' : 'text-green-600',     clickable: totalSeats > 0 },
          { key: 'mfa',      label: 'MFA Issues',   value: totalMFA || '—',
            color: totalMFA > 0 ? 'text-red-600' : 'text-gray-400',                               clickable: totalMFA > 0 },
          { key: 'monthly',  label: 'Est. Monthly', value: totalMonthly > 0 ? `$${totalMonthly.toLocaleString(undefined,{maximumFractionDigits:0})}` : '—',
            color: 'text-gray-900',                                                                clickable: totalMonthly > 0 },
        ].map(s => (
          <div key={s.label}
            onClick={() => s.clickable && openLicenseDrill(s.key)}
            className={`bg-white border border-gray-200 rounded-xl p-3 text-center transition-all
              ${s.clickable ? 'cursor-pointer hover:border-primary-300 hover:shadow-sm hover:bg-primary-50/30' : ''}`}>
            <p className={`text-xl font-bold leading-none ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            {s.clickable && <p className="text-[10px] text-primary-400 mt-0.5">click to view</p>}
          </div>
        ))}
      </div>

      {/* Platform tabs */}
      <div className="flex items-center gap-2 mb-4">
        {['all','microsoft_365','google_workspace'].map(p => (
          <button key={p} onClick={() => setPlatformFilter(p)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${platformFilter === p ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {p === 'all' ? 'All' : PLATFORM_LABEL[p]}
          </button>
        ))}
        <button onClick={load} className="ml-auto p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600">
          <RefreshCw size={14} />
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Package size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm">No license data available</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="w-8" />
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Consumed</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Available</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Suspended</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Utilization</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">MFA</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Monthly</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(row => {
                const isExpanded = expandedRows.has(row.license_name)
                const users = usersByLicense[row.license_name] || []
                const expDate = row.subscription_end ? new Date(row.subscription_end) : null
                const expiring = expDate && expDate > now && expDate < new Date(now.getTime() + 90*86400000)
                const expired = expDate && expDate < now
                const pct = row.total_seats > 0 ? Math.min(100, Math.round((row.consumed / row.total_seats) * 100)) : null
                const barColor = pct >= 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : 'bg-green-500'
                return (
                  <>
                    <tr key={row.license_name} onClick={() => toggleExpand(row.license_name)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors">
                      <td className="pl-3">
                        <ChevronRight size={14} className={`text-gray-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{row.license_display_name || row.license_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] border rounded px-1.5 py-0.5 ${PLATFORM_COLOR[row.platform] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            {PLATFORM_LABEL[row.platform] || row.platform}
                          </span>
                          {(expiring || expired) && (
                            <span className={`text-[10px] ${expired ? 'text-red-500' : 'text-amber-500'}`}>
                              {expired ? 'Expired' : 'Exp.'} {expDate.toLocaleDateString('en-US',{month:'short',year:'numeric'})}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{row.active}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{row.consumed}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={parseInt(row.total_seats) > 0 ? (parseInt(row.available) === 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold') : 'text-gray-400'}>
                          {parseInt(row.total_seats) > 0 ? row.available : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{parseInt(row.suspended) > 0 ? <span className="text-red-600">{row.suspended}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3">
                        {pct !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-100 rounded-full h-1.5">
                              <div className={`${barColor} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{pct}%</span>
                          </div>
                        ) : <span className="text-xs text-gray-400">Set seats →</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {parseInt(row.mfa_disabled_count) > 0
                          ? <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium"><ShieldAlert size={11} />{row.mfa_disabled_count}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                        {parseFloat(row.monthly_total) > 0 ? `$${parseFloat(row.monthly_total).toLocaleString(undefined,{maximumFractionDigits:0})}` : '—'}
                      </td>
                      <td className="px-3">
                        <button onClick={e => { e.stopPropagation(); setEditRow({ ...row, client_id: clientId }) }}
                          className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-600 transition-colors" title="Set seats">
                          <Settings size={13} />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${row.license_name}-users`}>
                        <td colSpan={10} className="bg-gray-50 px-8 py-3 border-t border-gray-100">
                          {users.length === 0 ? (
                            <p className="text-xs text-gray-400 py-1">Loading…</p>
                          ) : (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{users.length} users</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                {users.map(u => (
                                  <div key={u.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2">
                                    <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                                      {(u.user_display_name || u.user_email).charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-gray-900 truncate">{u.user_display_name || u.user_email}</p>
                                      <p className="text-[10px] text-gray-400 truncate">{u.user_display_name ? u.user_email : ''}</p>
                                    </div>
                                    {u.mfa_enabled === false && <ShieldAlert size={11} className="text-red-500 shrink-0" title="MFA off" />}
                                    {u.mfa_enabled === true  && <ShieldCheck  size={11} className="text-green-500 shrink-0" title="MFA on" />}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editRow && (
        <SetSeatsModal row={editRow} onClose={() => setEditRow(null)} onSave={load} />
      )}

      {drillDown && (
        <DrillDownModal
          title={drillDown.title}
          subtitle={drillDown.subtitle}
          columns={drillDown.columns}
          rows={drillDown.rows}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  )
}

// ─── Tab: Roadmap (client-specific recommendations) ──────────────────────────

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low']
const STATUS_ORDER   = ['draft', 'proposed', 'approved', 'in_progress', 'deferred', 'completed', 'declined']

function RecRow({ rec, onClick }) {
  const p = PRIORITY_CFG[rec.priority] || PRIORITY_CFG.medium
  const s = STATUS_CFG[rec.status] || STATUS_CFG.draft
  const budget = fmtBudget(rec.budget_one_time) || fmtBudget(rec.budget_recurring)
  const sched = rec.schedule_year
    ? `${rec.schedule_year}${rec.schedule_quarter ? ` Q${rec.schedule_quarter}` : ''}`
    : null
  const isInitiative = (rec.kind || 'recommendation') === 'initiative'
  return (
    <div onClick={onClick}
      className="flex items-center gap-0 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors group border-b border-gray-50 last:border-0">
      <div className={`w-1 self-stretch shrink-0 rounded-sm mr-3 ${p.bar}`} />
      <span className={`text-xs font-black w-6 shrink-0 ${p.text}`}>{p.bang}</span>
      {/* Title + type badge — fixed width so exec summary always gets space */}
      <div className="flex items-center gap-2 shrink-0 w-52 xl:w-64 mx-2 min-w-0">
        <span className="text-sm text-gray-800 font-medium group-hover:text-primary-700 truncate">{rec.title}</span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
          isInitiative ? 'bg-violet-100 text-violet-700' : 'bg-blue-50 text-blue-600'
        }`}>{isInitiative ? 'Initiative' : 'Rec'}</span>
      </div>
      {/* Executive summary takes remaining horizontal space */}
      <p className="flex-1 min-w-0 text-xs text-gray-400 truncate hidden sm:block">
        {rec.executive_summary || ''}
      </p>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          <span className="text-xs text-gray-400 hidden lg:block">{s.label}</span>
        </div>
        {sched && <span className="text-xs text-gray-400 hidden md:block">{sched}</span>}
        {budget && <span className="text-xs font-semibold text-gray-700 w-20 text-right">{budget}</span>}
        <ChevronRight size={14} className="text-gray-300 group-hover:text-primary-400" />
      </div>
    </div>
  )
}

function RoadmapTab({ clientId }) {
  const [recs,           setRecs]           = useState([])
  const [loading,        setLoading]        = useState(true)
  const [statusFilter,   setStatusFilter]   = useState('active')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [groupBy,        setGroupBy]        = useState('priority') // 'none'|'priority'|'quarter'|'status'|'type'
  const [dateFilter,     setDateFilter]     = useState('all')    // 'all'|'YYYY-Q#'|'no_date'
  const [editRecId,      setEditRecId]      = useState(null)
  const [creating,       setCreating]       = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/recommendations?client_id=${clientId}&limit=500`)
      .then(r => setRecs(r.data?.data || r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [clientId])

  useEffect(() => { load() }, [load])

  // Build available quarters from data
  const quarters = useMemo(() => {
    const set = new Set()
    recs.forEach(r => {
      if (r.schedule_year) {
        const q = r.schedule_quarter ? `${r.schedule_year}-Q${r.schedule_quarter}` : `${r.schedule_year}-Q0`
        set.add(q)
      }
    })
    return [...set].sort()
  }, [recs])

  const filtered = useMemo(() => recs.filter(r => {
    if (statusFilter === 'active' && (r.status === 'completed' || r.status === 'declined')) return false
    if (statusFilter === 'completed' && r.status !== 'completed') return false
    if (priorityFilter !== 'all' && r.priority !== priorityFilter) return false
    if (dateFilter !== 'all') {
      if (dateFilter === 'no_date') { if (r.schedule_year) return false }
      else {
        const [yr, qPart] = dateFilter.split('-Q')
        const q = parseInt(qPart)
        if (String(r.schedule_year) !== yr) return false
        if (q > 0 && r.schedule_quarter !== q) return false
      }
    }
    return true
  }), [recs, statusFilter, priorityFilter, dateFilter])

  // Subtotal helper
  function groupSubtotal(items) {
    const ot = items.reduce((s, r) => s + (Number(r.budget_one_time) || 0), 0)
    const rc = items.reduce((s, r) => s + (Number(r.budget_recurring) || 0), 0)
    const total = ot + rc
    return total > 0 ? fmtBudget(total) : null
  }

  // Build grouped data
  const groups = useMemo(() => {
    if (groupBy === 'priority') {
      return PRIORITY_ORDER.map(p => ({
        key: p,
        label: p.charAt(0).toUpperCase() + p.slice(1),
        items: filtered.filter(r => r.priority === p),
        color: PRIORITY_CFG[p]?.text || 'text-gray-500',
        bar: PRIORITY_CFG[p]?.bar || 'bg-gray-300',
      })).filter(g => g.items.length > 0)
    }
    if (groupBy === 'status') {
      return STATUS_ORDER.map(s => ({
        key: s,
        label: STATUS_CFG[s]?.label || s,
        items: filtered.filter(r => (r.status || 'draft') === s),
        dot: STATUS_CFG[s]?.dot || 'bg-gray-400',
      })).filter(g => g.items.length > 0)
    }
    if (groupBy === 'type') {
      return [
        { key: 'initiative',     label: 'Initiative',     items: filtered.filter(r => r.kind === 'initiative'),                      pill: 'bg-violet-100 text-violet-700' },
        { key: 'recommendation', label: 'Recommendation', items: filtered.filter(r => !r.kind || r.kind === 'recommendation'),        pill: 'bg-blue-50 text-blue-600' },
      ].filter(g => g.items.length > 0)
    }
    if (groupBy === 'quarter') {
      const map = {}
      filtered.forEach(r => {
        const key = r.schedule_year
          ? `${r.schedule_year}${r.schedule_quarter ? `-Q${r.schedule_quarter}` : ''}`
          : 'No Date'
        if (!map[key]) map[key] = []
        map[key].push(r)
      })
      const sorted = Object.keys(map).sort((a, b) => {
        if (a === 'No Date') return 1
        if (b === 'No Date') return -1
        return a.localeCompare(b)
      })
      return sorted.map(k => ({ key: k, label: k, items: map[k] }))
    }
    return [{ key: 'all', label: null, items: filtered }]
  }, [filtered, groupBy])

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['active', 'completed', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${statusFilter === s ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s === 'active' ? 'Open' : s === 'all' ? 'All' : 'Completed'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* Group by */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Group by</span>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400">
              <option value="none">None</option>
              <option value="priority">Priority</option>
              <option value="status">Status</option>
              <option value="type">Type</option>
              <option value="quarter">Schedule</option>
            </select>
          </div>
          {/* Priority filter (hide when grouping by priority or type) */}
          {groupBy !== 'priority' && groupBy !== 'type' && (
            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400">
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          )}
          {/* Date filter */}
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="all">All Dates</option>
            {quarters.map(q => {
              const [yr, qPart] = q.split('-Q')
              const qNum = parseInt(qPart)
              const label = qNum === 0 ? yr : `${yr} Q${qNum}`
              return <option key={q} value={q}>{label}</option>
            })}
            <option value="no_date">No Date</option>
          </select>
          <button onClick={() => setCreating(true)}
            className="px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors">
            + New
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading roadmap...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList size={36} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm">No recommendations found</p>
          <button onClick={() => setCreating(true)}
            className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium">+ Add recommendation</button>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const sub = groupSubtotal(group.items)
            return (
              <div key={group.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {group.label ? (
                  <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-100 bg-gray-50/60">
                    {/* priority bar */}
                    {group.bar && <div className={`w-2.5 h-2.5 rounded-sm ${group.bar}`} />}
                    {/* status dot */}
                    {group.dot && <div className={`w-2 h-2 rounded-full ${group.dot}`} />}
                    {/* type pill */}
                    {group.pill && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${group.pill}`}>{group.label}</span>}
                    {!group.pill && (
                      <span className={`text-xs font-bold uppercase tracking-wider ${group.color || 'text-gray-600'}`}>{group.label}</span>
                    )}
                    <span className="text-xs text-gray-400">({group.items.length})</span>
                    {sub && <span className="ml-auto text-xs font-semibold text-gray-600">{sub}</span>}
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100">
                    <span className="text-xs text-gray-400">{filtered.length} items</span>
                    {sub && <span className="text-xs font-semibold text-gray-600">{sub}</span>}
                  </div>
                )}
                <div>
                  {group.items.map(rec => (
                    <RecRow key={rec.id} rec={rec} onClick={() => setEditRecId(rec.id)} />
                  ))}
                </div>
                {/* Group subtotal footer */}
                {sub && groups.length > 1 && (
                  <div className="flex items-center justify-end gap-2 px-5 py-2 border-t border-gray-100 bg-gray-50/60">
                    <span className="text-xs text-gray-400">Subtotal</span>
                    <span className="text-xs font-bold text-gray-700 w-20 text-right">{sub}</span>
                  </div>
                )}
              </div>
            )
          })}
          {/* Grand total across all filtered items */}
          {(() => {
            const grand = groupSubtotal(filtered)
            return grand ? (
              <div className="flex items-center justify-end gap-2 px-5 py-3 bg-white border border-gray-200 rounded-xl">
                <span className="text-sm font-medium text-gray-500">Total</span>
                <span className="text-sm font-bold text-gray-800 w-20 text-right">{grand}</span>
              </div>
            ) : null
          })()}
        </div>
      )}

      {creating && (
        <QuickCreateRec clientId={clientId}
          onClose={() => setCreating(false)}
          onCreated={id => { setCreating(false); setEditRecId(id); load() }}
        />
      )}
      {editRecId && (
        <RecEditModal recId={editRecId} onClose={() => setEditRecId(null)} onSaved={load} />
      )}
    </div>
  )
}

// ─── Quick-create rec (used inside ClientDetail without navigation) ────────────

function QuickCreateRec({ clientId, onClose, onCreated }) {
  const [title, setTitle]   = useState('')
  const [kind,  setKind]    = useState('initiative')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function submit() {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true)
    try {
      const res = await api.post('/recommendations', {
        client_id: clientId, title: title.trim(),
        kind, status: 'draft', priority: 'medium',
      })
      onCreated(res.data.id)
    } catch { setError('Failed to create') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">New Item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Record Type</label>
            <div className="flex gap-2">
              {[{ v: 'initiative', l: 'Initiative' }, { v: 'recommendation', l: 'Recommendation' }].map(k => (
                <button key={k.v} onClick={() => setKind(k.v)}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                    kind === k.v ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>{k.l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
              autoFocus placeholder="Title…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-60">
            {saving ? 'Creating…' : 'Create & Edit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── New Assessment Modal (inline, client pre-filled) ────────────────────────
function NewAssessmentModal({ clientId, onClose, onCreated }) {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [frameworks, setFrameworks] = useState([])
  const [mode, setMode] = useState('standards')
  const [templateId, setTemplateId] = useState('')
  const [assessmentType, setAssessmentType] = useState('ad_hoc')
  const [framework, setFramework] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/templates'),
      api.get('/assessments/frameworks'),
    ]).then(([tRes, fRes]) => {
      const tlist = tRes.data || []
      setTemplates(tlist)
      const def = tlist.find(t => t.is_default)
      if (def) setTemplateId(def.id)
      setFrameworks(fRes.data || [])
    }).catch(console.error)
  }, [])

  const typeOptions = [
    { key: 'onboarding_phase1', label: 'Onboarding Phase 1', desc: 'Critical/high priority', color: 'border-red-200 bg-red-50' },
    { key: 'onboarding_phase2', label: 'Onboarding Phase 2', desc: 'Remaining standards', color: 'border-amber-200 bg-amber-50' },
    { key: 'recurring_review',  label: 'Recurring Review', desc: 'Standards due for review', color: 'border-blue-200 bg-blue-50' },
    { key: 'framework_gap',     label: 'Framework Gap', desc: 'Compliance assessment (CMMC, ISO, PCI…)', color: 'border-violet-200 bg-violet-50' },
    { key: 'ad_hoc',            label: 'Full Assessment', desc: 'All applicable standards', color: 'border-gray-200 bg-gray-50' },
  ]

  async function create() {
    if (mode === 'template' && !templateId) return
    if (mode === 'standards' && assessmentType === 'framework_gap' && !framework) return
    setSaving(true)
    try {
      const body = { client_id: clientId }
      if (mode === 'template') {
        body.template_id = templateId
        body.name = name.trim() || templates.find(t => t.id === templateId)?.name || 'Assessment'
      } else {
        body.assessment_type = assessmentType
        if (assessmentType === 'framework_gap') body.framework = framework
        body.name = name.trim() || ''
      }
      const res = await api.post('/assessments', body)
      navigate(`/assessments/${res.data.id}?from_client=${clientId}`)
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const canCreate = mode === 'standards'
    ? (assessmentType !== 'framework_gap' || framework)
    : !!templateId

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">New Assessment</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Mode toggle */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Assessment Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setMode('standards')}
                    className={`text-left p-3 rounded-xl border-2 transition-colors ${mode === 'standards' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className="text-sm font-medium text-gray-900">Standards-Based</p>
                    <p className="text-xs text-gray-500">5-level rubric per standard</p>
                  </button>
                  <button onClick={() => setMode('template')}
                    className={`text-left p-3 rounded-xl border-2 transition-colors ${mode === 'template' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className="text-sm font-medium text-gray-900">Template-Based</p>
                    <p className="text-xs text-gray-500">Custom template questions</p>
                  </button>
                </div>
              </div>

              {mode === 'standards' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Assessment Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {typeOptions.map(t => (
                      <button key={t.key} onClick={() => setAssessmentType(t.key)}
                        className={`text-left p-2.5 rounded-xl border-2 transition-colors ${assessmentType === t.key ? t.color.replace('bg-', 'border-').split(' ')[0] + ' ' + t.color : 'border-gray-200 hover:border-gray-300'}`}>
                        <p className="text-sm font-medium text-gray-900">{t.label}</p>
                        <p className="text-xs text-gray-500">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode === 'standards' && assessmentType === 'framework_gap' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Framework <span className="text-red-500">*</span></label>
                  <select value={framework} onChange={e => setFramework(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">Select framework…</option>
                    {frameworks.map(f => (
                      <option key={f.framework} value={f.framework}>{f.framework} ({f.standard_count} controls)</option>
                    ))}
                  </select>
                  {frameworks.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">No frameworks imported yet.</p>
                  )}
                </div>
              )}

              {mode === 'template' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Template</label>
                  <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                    <option value="">Select template…</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (Default)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Assessment Name</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Leave blank for auto-generated name"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={create} disabled={saving || !canCreate}
                className="px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {saving ? 'Creating…' : 'Start Assessment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Tab: Assessments (client-specific) ──────────────────────────────────────
function AssessmentsTab({ clientId }) {
  const navigate = useNavigate()
  const [assessments,  setAssessments]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)

  useEffect(() => {
    api.get(`/assessments?client_id=${clientId}`)
      .then(r => setAssessments(r.data?.data || r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [clientId])

  if (loading) return <div className="text-center py-12 text-gray-400">Loading assessments...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{assessments.length} assessment{assessments.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowNewModal(true)}
          className="px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors">
          + New Assessment
        </button>
      </div>

      {assessments.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ShieldCheck size={36} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm">No assessments yet</p>
          <button onClick={() => setShowNewModal(true)}
            className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium">
            Start first assessment →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map(a => {
            const score = a.overall_score
            const color = score == null ? 'text-gray-400' : score >= 75 ? 'text-green-600' : score >= 50 ? 'text-amber-600' : 'text-red-600'
            return (
              <div key={a.id} onClick={() => navigate(`/assessments/${a.id}?from_client=${clientId}`)}
                className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 hover:border-primary-200 hover:shadow-sm cursor-pointer transition-all group">
                <ScoreRing score={score} size={56} stroke={5} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">{a.name || 'Assessment'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {a.template_name && <span>{a.template_name} · </span>}
                    <span className={a.status === 'completed' ? 'text-green-600' : 'text-amber-600'}>
                      {a.status === 'completed' ? 'Completed' : a.status === 'in_progress' ? 'In Progress' : a.status}
                    </span>
                  </p>
                  {a.completed_at && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(a.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
                {score != null && (
                  <div className="text-right shrink-0">
                    <p className={`text-xl font-bold ${color}`}>{score}</p>
                    <p className="text-[11px] text-gray-400">/ 100</p>
                  </div>
                )}
                <ChevronRight size={16} className="text-gray-300 group-hover:text-primary-400 transition-colors shrink-0" />
              </div>
            )
          })}
        </div>
      )}

      {showNewModal && (
        <NewAssessmentModal
          clientId={clientId}
          onClose={() => setShowNewModal(false)}
          onCreated={a => { setAssessments(prev => [a, ...prev]); setShowNewModal(false) }}
        />
      )}
    </div>
  )
}

// ─── Tab: Recommendations (client-specific, alias of RoadmapTab with full features) ──

function RecommendationsTab({ clientId }) {
  return <RoadmapTab clientId={clientId} />
}

// ─── Goal Status config ───────────────────────────────────────────────────────
const GOAL_STATUS = {
  on_track:  { label: 'On Track',  cls: 'bg-green-100 text-green-700 border-green-200',  dot: 'bg-green-500'  },
  at_risk:   { label: 'At Risk',   cls: 'bg-amber-100 text-amber-700 border-amber-200',  dot: 'bg-amber-500'  },
  behind:    { label: 'Behind',    cls: 'bg-red-100 text-red-700 border-red-200',         dot: 'bg-red-500'    },
  completed: { label: 'Completed', cls: 'bg-gray-100 text-gray-600 border-gray-200',     dot: 'bg-gray-400'   },
}

// ─── Tab: Goals ───────────────────────────────────────────────────────────────
function GoalsTab({ clientId }) {
  const [goals,      setGoals]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [tabFilter,  setTabFilter]  = useState('ongoing')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterYear,   setFilterYear]   = useState('')
  const [showCreate, setShowCreate]  = useState(false)
  const [expanded,   setExpanded]   = useState({})
  const curYear = new Date().getFullYear()

  function load() {
    setLoading(true)
    api.get(`/goals?client_id=${clientId}`)
      .then(r => setGoals(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [clientId])

  const filtered = useMemo(() => {
    return goals.filter(g => {
      const isOverdue = g.target_year && g.target_year < curYear && g.status !== 'completed'
      if (tabFilter === 'completed') return g.status === 'completed'
      if (tabFilter === 'overdue')   return isOverdue
      return g.status !== 'completed' && !isOverdue
    }).filter(g => {
      if (filterStatus && g.status !== filterStatus) return false
      if (filterYear && String(g.target_year) !== filterYear) return false
      return true
    })
  }, [goals, tabFilter, filterStatus, filterYear, curYear])

  const counts = useMemo(() => {
    const ongoingCount  = goals.filter(g => g.status !== 'completed' && !(g.target_year && g.target_year < curYear && g.status !== 'completed')).length
    const overdueCount  = goals.filter(g => g.target_year && g.target_year < curYear && g.status !== 'completed').length
    const completedCount = goals.filter(g => g.status === 'completed').length
    return { ongoing: ongoingCount, overdue: overdueCount, completed: completedCount }
  }, [goals, curYear])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Goals</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setExpanded(Object.fromEntries(filtered.map(g => [g.id, true])))}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            Expand all
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-sm font-medium bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700">
            + New Goal
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {[
          ['ongoing',   '◯ Ongoing',   counts.ongoing],
          ['overdue',   '⊘ Overdue',   counts.overdue],
          ['completed', '✓ Completed', counts.completed],
        ].map(([v, l, cnt]) => (
          <button key={v} onClick={() => setTabFilter(v)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tabFilter === v ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {l}
            {cnt > 0 && (
              <span className={`text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center ${
                v === 'overdue' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>{cnt}</span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center mb-5">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none">
          <option value="">All status</option>
          {Object.entries(GOAL_STATUS).filter(([v]) => v !== 'completed').map(([v, c]) => (
            <option key={v} value={v}>{c.label}</option>
          ))}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none">
          <option value="">All year</option>
          {[curYear - 1, curYear, curYear + 1, curYear + 2].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {(filterStatus || filterYear) && (
          <button onClick={() => { setFilterStatus(''); setFilterYear('') }}
            className="text-xs text-gray-400 hover:text-gray-700">Clear All</button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mr-2" />
          Loading goals…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
          <Target size={36} className="mx-auto mb-3 text-gray-200" />
          <p className="text-base font-medium text-gray-500">No goals {tabFilter !== 'ongoing' ? `in ${tabFilter}` : 'yet'}</p>
          <p className="text-sm text-gray-400 mt-1">Goals help you track strategic objectives for this client.</p>
          {tabFilter === 'ongoing' && (
            <button onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
              + New Goal
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(goal => (
            <GoalCard key={goal.id} goal={goal}
              expanded={!!expanded[goal.id]}
              clientId={clientId}
              onToggle={() => setExpanded(p => ({ ...p, [goal.id]: !p[goal.id] }))}
              onUpdate={updated => setGoals(p => p.map(g => g.id === updated.id ? { ...g, ...updated } : g))}
              onDelete={() => { setGoals(p => p.filter(g => g.id !== goal.id)) }}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <GoalCreateModal clientId={clientId} defaultYear={curYear}
          onClose={() => setShowCreate(false)}
          onCreated={newGoal => { setGoals(p => [newGoal, ...p]); setShowCreate(false) }}
        />
      )}
    </div>
  )
}

function GoalCard({ goal, expanded, clientId, onToggle, onUpdate, onDelete }) {
  const [data,          setData]          = useState(null)   // full detail (initiatives + action_items)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [section,       setSection]       = useState('initiatives')
  const [showLinkRec,   setShowLinkRec]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editRecId,     setEditRecId]     = useState(null)
  // Inline edit
  const [editStatus,  setEditStatus]  = useState(goal.status)
  const [editYear,    setEditYear]    = useState(goal.target_year)
  const [editQuarter, setEditQuarter] = useState(goal.target_quarter)
  const [editTitle,   setEditTitle]   = useState(goal.title)
  const [editDesc,    setEditDesc]    = useState(goal.description || '')
  // Action item add
  const [addingItem,         setAddingItem]         = useState(false)
  const [newItemText,        setNewItemText]        = useState('')
  const [editGoalActionItem, setEditGoalActionItem] = useState(null)
  const titleTimer = useRef(null)
  const descTimer  = useRef(null)
  const curYear = new Date().getFullYear()
  const s = GOAL_STATUS[editStatus] || GOAL_STATUS.on_track

  const initiatives  = data?.initiatives  || []
  const actionItems  = data?.action_items || []

  useEffect(() => {
    if (expanded && !data) {
      setLoadingDetail(true)
      api.get(`/goals/${goal.id}`).then(r => setData(r.data)).catch(console.error).finally(() => setLoadingDetail(false))
    }
  }, [expanded])

  async function patchGoal(fields) {
    try {
      const r = await api.patch(`/goals/${goal.id}`, fields)
      onUpdate(r.data)
    } catch (e) { console.error(e) }
  }

  function handleTitle(v) {
    setEditTitle(v)
    clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => patchGoal({ title: v }), 600)
  }
  function handleDesc(v) {
    setEditDesc(v)
    clearTimeout(descTimer.current)
    descTimer.current = setTimeout(() => patchGoal({ description: v }), 600)
  }
  function handleStatus(v) { setEditStatus(v); patchGoal({ status: v }) }
  function handleYear(v) {
    const y = v ? parseInt(v) : null
    setEditYear(y); patchGoal({ target_year: y })
  }
  function handleQuarter(v) {
    const q = v ? parseInt(v) : null
    setEditQuarter(q); patchGoal({ target_quarter: q })
  }

  async function unlinkInitiative(recId) {
    await api.delete(`/goals/${goal.id}/initiatives/${recId}`)
    setData(p => ({ ...p, initiatives: p.initiatives.filter(i => i.id !== recId) }))
    onUpdate({ ...goal, initiative_count: Math.max(0, (goal.initiative_count || 1) - 1) })
  }

  async function toggleActionItem(item) {
    const r = await api.patch(`/goals/${goal.id}/action-items/${item.id}`, { completed: !item.completed })
    setData(p => ({ ...p, action_items: p.action_items.map(i => i.id === item.id ? r.data : i) }))
  }

  async function deleteActionItem(itemId) {
    await api.delete(`/goals/${goal.id}/action-items/${itemId}`)
    setData(p => ({ ...p, action_items: p.action_items.filter(i => i.id !== itemId) }))
  }

  async function addActionItem() {
    if (!newItemText.trim()) return
    const r = await api.post(`/goals/${goal.id}/action-items`, { text: newItemText.trim() })
    setData(p => ({ ...p, action_items: [...(p?.action_items || []), r.data] }))
    setNewItemText(''); setAddingItem(false)
  }

  async function doDelete() {
    await api.delete(`/goals/${goal.id}`)
    onDelete()
  }

  // Format target period display
  const targetLabel = editYear
    ? `${editYear}${editQuarter ? ` Q${editQuarter}` : ''}`
    : editQuarter ? `Q${editQuarter}` : null

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Inline RecEditModal for linked initiatives */}
      {editRecId && <RecEditModal recId={editRecId} onClose={() => setEditRecId(null)} onSaved={() => {
        // Refresh goal detail to reflect any status changes
        api.get(`/goals/${goal.id}`).then(r => setData(r.data)).catch(() => {})
      }} />}

      {/* ── Card header ── */}
      <div className="flex items-start gap-3 px-5 py-4">
        <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5">
          <ChevronDown size={16} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
        </button>

        {/* Editable title + description */}
        <div className="flex-1 min-w-0">
          <input value={editTitle} onChange={e => handleTitle(e.target.value)}
            className="w-full text-sm font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-primary-400 focus:outline-none pb-0.5 transition-colors"
          />
          {(expanded || editDesc) && (
            <textarea value={editDesc} onChange={e => handleDesc(e.target.value)}
              placeholder="Add a description…"
              rows={expanded ? 2 : 1}
              className="w-full text-xs text-gray-500 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-primary-400 focus:outline-none resize-none mt-1 transition-colors placeholder:text-gray-300"
            />
          )}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {/* Status */}
          <select value={editStatus} onChange={e => handleStatus(e.target.value)}
            className={`text-xs font-semibold border rounded-lg px-2 py-1 focus:outline-none cursor-pointer ${s.cls}`}>
            {Object.entries(GOAL_STATUS).map(([v, c]) => (
              <option key={v} value={v}>{c.label}</option>
            ))}
          </select>

          {/* Year */}
          <select value={editYear || ''} onChange={e => handleYear(e.target.value)}
            className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
            <option value="">Year</option>
            {[curYear - 1, curYear, curYear + 1, curYear + 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Quarter */}
          <select value={editQuarter || ''} onChange={e => handleQuarter(e.target.value)}
            className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
            <option value="">Qtr</option>
            {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
          </select>

          {/* Target label pill */}
          {targetLabel && (
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">{targetLabel}</span>
          )}

          {/* Delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button onClick={doDelete} className="text-xs text-red-600 font-medium hover:text-red-700">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-gray-300 hover:text-red-500 transition-colors">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Edit goal action item */}
      {editGoalActionItem && (
        <ActionItemEditModal
          item={editGoalActionItem}
          clientId={clientId}
          onClose={() => setEditGoalActionItem(null)}
          onSaved={updated => {
            setData(p => ({ ...p, action_items: p.action_items.map(i => i.id === updated._raw_id ? { ...i, text: updated.text, completed: updated.completed, due_date: updated.due_date } : i) }))
            setEditGoalActionItem(null)
          }}
          onDeleted={deleted => {
            setData(p => ({ ...p, action_items: p.action_items.filter(i => i.id !== deleted._raw_id) }))
            setEditGoalActionItem(null)
          }}
          onOpenRec={id => { setEditGoalActionItem(null); setEditRecId(id) }}
        />
      )}

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="border-t border-gray-100">
          {loadingDetail ? (
            <div className="py-8 text-center text-xs text-gray-400">Loading…</div>
          ) : (
            <>
              {/* Section tabs */}
              <div className="flex items-center border-b border-gray-100 px-5 bg-gray-50/50">
                {[
                  ['initiatives',   `Initiatives (${initiatives.length})`],
                  ['action-items',  `Action Items (${actionItems.length})`],
                ].map(([v, l]) => (
                  <button key={v} onClick={() => setSection(v)}
                    className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
                      section === v ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}>
                    {l}
                  </button>
                ))}
              </div>

              {/* ── Initiatives section ── */}
              {section === 'initiatives' && (
                <div>
                  {/* Header row */}
                  <div className="flex items-center px-5 py-2 bg-gray-50/40 border-b border-gray-50">
                    <div className="grid grid-cols-[1fr_110px_100px_80px] gap-3 flex-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      <span>Initiative</span>
                      <span>Status</span>
                      <span>Scheduled</span>
                      <span>Priority</span>
                    </div>
                    <button onClick={() => setShowLinkRec(true)}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium ml-4 shrink-0">
                      + Link New
                    </button>
                  </div>

                  {initiatives.length === 0 ? (
                    <div className="py-8 text-center text-xs text-gray-400">
                      No initiatives linked.{' '}
                      <button onClick={() => setShowLinkRec(true)} className="text-primary-600 hover:underline">Link one →</button>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {initiatives.map(rec => {
                        const rs = STATUS_CFG[rec.status] || STATUS_CFG.draft
                        const rp = PRIORITY_CFG[rec.priority] || PRIORITY_CFG.medium
                        const sched = rec.schedule_year
                          ? `${rec.schedule_year}${rec.schedule_quarter ? ` Q${rec.schedule_quarter}` : ''}`
                          : '—'
                        return (
                          <div key={rec.id} className="flex items-center px-5 py-2.5 group hover:bg-blue-50/30 transition-colors">
                            <div className="grid grid-cols-[1fr_110px_100px_80px] gap-3 flex-1 items-center">
                              {/* Clickable title → opens RecEditModal */}
                              <button onClick={() => setEditRecId(rec.id)}
                                className="text-sm text-primary-600 hover:text-primary-800 font-medium text-left truncate hover:underline">
                                {rec.title}
                              </button>
                              <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rs.dot}`} />
                                {rs.label}
                              </span>
                              <span className="text-xs text-gray-500">{sched}</span>
                              <span className={`text-sm font-black ${rp.text}`}>{rp.bang}</span>
                            </div>
                            <button onClick={() => unlinkInitiative(rec.id)}
                              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all ml-3 shrink-0">
                              <X size={13} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Action Items section ── */}
              {section === 'action-items' && (
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-2 bg-gray-50/40 border-b border-gray-50">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Task</span>
                    <button onClick={() => setAddingItem(true)}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
                      + Add Action Item
                    </button>
                  </div>

                  {/* Add new item row */}
                  {addingItem && (
                    <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-100 bg-blue-50/30">
                      <Square size={15} className="text-gray-300 shrink-0" />
                      <input autoFocus value={newItemText} onChange={e => setNewItemText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addActionItem(); if (e.key === 'Escape') { setAddingItem(false); setNewItemText('') } }}
                        placeholder="Action item text…"
                        className="flex-1 text-sm bg-transparent border-b border-primary-400 focus:outline-none" />
                      <button onClick={addActionItem} className="text-xs bg-primary-600 text-white px-2.5 py-1 rounded-lg hover:bg-primary-700 shrink-0">Add</button>
                      <button onClick={() => { setAddingItem(false); setNewItemText('') }} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={13} /></button>
                    </div>
                  )}

                  {actionItems.length === 0 && !addingItem ? (
                    <div className="py-8 text-center text-xs text-gray-400">
                      No action items yet.{' '}
                      <button onClick={() => setAddingItem(true)} className="text-primary-600 hover:underline">Add one →</button>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {actionItems.map(item => (
                        <div key={item.id}
                          className="flex items-center gap-3 px-5 py-2.5 group hover:bg-gray-50/70 cursor-pointer transition-colors"
                          onClick={() => setEditGoalActionItem({
                            ...item, _uid: `g-${item.id}`, _raw_id: item.id,
                            source: 'goal', goal_id: goal.id, goal_title: editTitle,
                          })}>
                          <button onClick={e => { e.stopPropagation(); toggleActionItem(item) }} className="shrink-0">
                            {item.completed
                              ? <CheckSquare size={15} className="text-primary-600" />
                              : <Square size={15} className="text-gray-300 hover:text-primary-400" />
                            }
                          </button>
                          <span className={`flex-1 text-sm ${item.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {item.text}
                          </span>
                          {item.due_date && (
                            <span className="text-xs text-gray-400 shrink-0">
                              {new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          <button onClick={e => { e.stopPropagation(); deleteActionItem(item.id) }}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all shrink-0">
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {showLinkRec && (
                <LinkInitiativeModal
                  goalId={goal.id} clientId={clientId} existingIds={initiatives.map(i => i.id)}
                  onClose={() => setShowLinkRec(false)}
                  onLinked={rec => {
                    setData(p => ({ ...p, initiatives: [...(p?.initiatives || []), rec] }))
                    setShowLinkRec(false)
                    onUpdate({ ...goal, initiative_count: (goal.initiative_count || 0) + 1 })
                  }}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function GoalCreateModal({ clientId, defaultYear, onClose, onCreated }) {
  const [title,  setTitle]  = useState('')
  const [desc,   setDesc]   = useState('')
  const [status, setStatus] = useState('on_track')
  const [year,   setYear]   = useState(defaultYear)
  const [saving, setSaving] = useState(false)
  const curYear = new Date().getFullYear()

  async function submit() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const r = await api.post('/goals', { client_id: clientId, title: title.trim(), description: desc, status, target_year: year })
      onCreated(r.data)
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">New Goal</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Title <span className="text-red-500">*</span></label>
                <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder="e.g. Improve Security Posture 2026"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
                  placeholder="Brief description of this goal…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                    {Object.entries(GOAL_STATUS).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Target Year</label>
                  <select value={year || ''} onChange={e => setYear(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                    <option value="">No year</option>
                    {[curYear - 1, curYear, curYear + 1, curYear + 2].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={submit} disabled={saving || !title.trim()}
                className="px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {saving ? 'Creating…' : 'Create Goal'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function LinkInitiativeModal({ goalId, clientId, existingIds, onClose, onLinked }) {
  const [recs, setRecs] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get(`/recommendations?client_id=${clientId}`)
      .then(r => setRecs(r.data?.data || r.data || []))
  }, [clientId])

  const filtered = recs.filter(r =>
    !existingIds.includes(r.id) &&
    r.title.toLowerCase().includes(search.toLowerCase())
  )

  async function link(rec) {
    try {
      await api.post(`/goals/${goalId}/initiatives`, { recommendation_id: rec.id })
      onLinked(rec)
    } catch (e) { console.error(e) }
  }

  return (
    <>
      <div className="fixed inset-0 z-60 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[61] overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Link Initiative / Recommendation</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search recommendations…"
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-400 text-center">No matching recommendations</p>
              ) : filtered.map(rec => (
                <button key={rec.id} onClick={() => link(rec)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-primary-50 text-left transition-colors">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_CFG[rec.status]?.dot || 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{rec.title}</p>
                    <p className="text-xs text-gray-400">{rec.kind === 'initiative' ? 'Initiative' : 'Recommendation'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

const ACTION_ITEM_STATUSES_CD = [
  { value: 'open',        label: 'Open',        cls: 'bg-gray-100 text-gray-600'   },
  { value: 'in_progress', label: 'In Progress', cls: 'bg-blue-100 text-blue-700'   },
  { value: 'done',        label: 'Done',        cls: 'bg-green-100 text-green-700' },
  { value: 'blocked',     label: 'Blocked',     cls: 'bg-red-100 text-red-700'     },
]

// ─── Action Item Ticket Modals ────────────────────────────────────────────────
function CreateActionItemTicketModal({ item, onClose, onSaved }) {
  const [picklists, setPicklists] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [form, setForm] = useState({
    title: item?.text || '',
    description: 'Action item created from predictiveIT Align',
    status: '', ticketType: '', priority: '', queueId: '',
    issueType: '', subIssueType: '', categoryId: '', billingCodeId: '', dueDate: '',
  })

  useEffect(() => {
    api.get('/recommendations/at-picklists/tickets')
      .then(r => {
        setPicklists(r.data)
        const statusDefault   = r.data.statuses?.find(s => s.label === 'New')?.value || r.data.statuses?.[0]?.value || ''
        const typeDefault     = r.data.types?.find(t => t.label?.toLowerCase().includes('change'))?.value || r.data.types?.[0]?.value || ''
        const priorityDefault = r.data.priorities?.find(p => p.label === 'Medium')?.value || r.data.priorities?.[1]?.value || ''
        setForm(f => ({ ...f, status: statusDefault, ticketType: typeDefault, priority: priorityDefault }))
      })
      .catch(() => setPicklists({}))
      .finally(() => setLoading(false))
  }, [])

  const f = (name, value) => setForm(p => ({ ...p, [name]: value }))

  async function submit() {
    setSaving(true); setError('')
    try {
      const body = {
        ...form,
        status:       form.status       ? parseInt(form.status)       : undefined,
        ticketType:   form.ticketType   ? parseInt(form.ticketType)   : undefined,
        priority:     form.priority     ? parseInt(form.priority)     : undefined,
        queueId:      form.queueId      ? parseInt(form.queueId)      : undefined,
        issueType:    form.issueType    ? parseInt(form.issueType)    : undefined,
        subIssueType: form.subIssueType ? parseInt(form.subIssueType) : undefined,
        categoryId:   form.categoryId   ? parseInt(form.categoryId)   : undefined,
        billingCodeId:form.billingCodeId? parseInt(form.billingCodeId): undefined,
      }
      const url = item.source === 'rec'
        ? `/recommendations/${item.recommendation_id}/action-items/${item.id}/at-ticket`
        : `/action-items/${item.id}/at-ticket`
      const res = await api.post(url, body)
      onSaved(res.data)
      onClose()
    } catch (err) { setError(err.message || 'Failed to create ticket') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Ticket size={16} /> Create PSA Ticket</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-10 text-gray-400">
            <Loader2 size={24} className="animate-spin mr-2" /> Loading Autotask fields...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title <span className="text-red-500">*</span></label>
              <textarea value={form.title} onChange={e => f('title', e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {picklists?.statuses?.length > 0 && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Ticket Status</label>
                  <select value={form.status} onChange={e => f('status', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select></div>
              )}
              {picklists?.types?.length > 0 && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Ticket Type</label>
                  <select value={form.ticketType} onChange={e => f('ticketType', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select></div>
              )}
              {picklists?.priorities?.length > 0 && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                  <select value={form.priority} onChange={e => f('priority', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select></div>
              )}
              {picklists?.queues?.length > 0 && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Queue</label>
                  <select value={form.queueId} onChange={e => f('queueId', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.queues.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                  </select></div>
              )}
              {picklists?.issueTypes?.length > 0 && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Issue Type</label>
                  <select value={form.issueType} onChange={e => f('issueType', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.issueTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select></div>
              )}
              {picklists?.subIssueTypes?.length > 0 && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Sub Issue Type</label>
                  <select value={form.subIssueType} onChange={e => f('subIssueType', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.subIssueTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select></div>
              )}
              {picklists?.categories?.length > 0 && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select value={form.categoryId} onChange={e => f('categoryId', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select></div>
              )}
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => f('dueDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" /></div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button onClick={submit} disabled={saving || loading || !form.title}
            className="px-5 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Ticket size={14} />}
            {saving ? 'Creating...' : 'Create Ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LinkActionItemTicketModal({ item, clientId, onClose, onLink }) {
  const [search,   setSearch]   = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  async function fetchTickets(q) {
    setLoading(true); setError('')
    try {
      const param = item?.recommendation_id
        ? `rec_id=${item.recommendation_id}`
        : `client_id=${clientId}`
      const res = await api.get(`/recommendations/at-search/tickets?${param}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
      setResults(res.data || [])
    } catch { setError('Failed to load tickets'); setResults([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchTickets('') }, [])
  useEffect(() => {
    if (!search) return
    const t = setTimeout(() => fetchTickets(search), 400)
    return () => clearTimeout(t)
  }, [search])

  async function submit() {
    if (!selected) return
    setSaving(true)
    try { await onLink(selected.ticketNumber || String(selected.id)); onClose() }
    catch (e) { console.error(e) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Ticket size={16} /> Link Existing Ticket</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="px-5 pt-4 pb-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by ticket # or title…"
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-2 min-h-[140px]">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 size={18} className="animate-spin mr-2" /> Loading…
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-6 text-center">
              {search ? 'No tickets match your search.' : 'No tickets found for this client.'}
            </p>
          ) : (
            <div className="space-y-1">
              {results.map(t => (
                <button key={t.id} onClick={() => setSelected(t)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    selected?.id === t.id ? 'border-primary-400 bg-primary-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                  }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono font-semibold text-primary-600 shrink-0">{t.ticketNumber || `#${t.id}`}</span>
                    <span className="text-sm text-gray-800 truncate">{t.title}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-xs text-red-500 mt-2 text-center">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button onClick={submit} disabled={!selected || saving}
            className="px-5 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Linking…' : 'Link Ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Action Item Edit Modal (LMX-style) ──────────────────────────────────────
function ActionItemEditModal({ item, clientId, onClose, onSaved, onDeleted, onOpenRec }) {
  const [text,           setText]           = useState(item?.text || '')
  const [dueDate,        setDueDate]        = useState(item?.due_date ? item.due_date.slice(0, 10) : '')
  const [status,         setStatus]         = useState(item?.status || 'open')
  const [notes,          setNotes]          = useState(item?.notes || '')
  const [ticketNum,      setTicketNum]      = useState(item?.at_ticket_number || '')
  const [assignedTo,     setAssignedTo]     = useState(item?.assigned_to || '')
  const [users,          setUsers]          = useState([])
  const [ticketModal,    setTicketModal]    = useState(null) // 'create'|'link'
  const [saving,         setSaving]         = useState(false)
  const [deleting,       setDeleting]       = useState(false)
  const textTimer   = useRef(null)
  const notesTimer  = useRef(null)
  const isNew = !item?.id
  const isGoal = item?.source === 'goal'

  useEffect(() => {
    api.get('/users/team').then(r => setUsers(r.data || [])).catch(() => {})
  }, [])

  async function patch(fields) {
    if (isNew) return
    try {
      let res
      if (item.source === 'rec') {
        res = await api.patch(`/recommendations/${item.recommendation_id}/action-items/${item.id}`, fields)
      } else if (item.source === 'goal') {
        res = await api.patch(`/goals/${item.goal_id}/action-items/${item._raw_id}`, fields)
      } else {
        res = await api.patch(`/action-items/${item.id}`, fields)
      }
      if (res?.data) onSaved({ ...item, ...res.data })
    } catch (e) { console.error(e) }
  }

  async function toggleComplete() { await patch({ completed: !item.completed }) }
  function handleTextChange(v) {
    setText(v)
    clearTimeout(textTimer.current)
    textTimer.current = setTimeout(() => patch({ text: v }), 700)
  }
  async function handleDateChange(v) { setDueDate(v); await patch({ due_date: v || null }) }
  async function handleStatusChange(v) { setStatus(v); await patch({ status: v }) }
  function handleNotesChange(v) {
    setNotes(v)
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => patch({ notes: v || null }), 800)
  }

  async function handleAssignChange(userId) {
    setAssignedTo(userId)
    await patch({ assigned_to: userId || '' }) // '' → backend NULLIF → NULL
  }

  async function handleUnlinkTicket() {
    try {
      if (item.source === 'rec') {
        await api.delete(`/recommendations/${item.recommendation_id}/action-items/${item.id}/at-ticket`)
      } else {
        await api.delete(`/action-items/${item.id}/at-ticket`)
      }
      setTicketNum('')
      onSaved({ ...item, at_ticket_number: null })
    } catch (e) { console.error(e) }
  }

  function handleTicketCreated(data) {
    const num = data?.data?.at_ticket_number || data?.at_ticket_number || ''
    setTicketNum(num)
    onSaved({ ...item, at_ticket_number: num })
  }

  async function handleLinkTicket(num) {
    await patch({ at_ticket_number: num })
    setTicketNum(num)
  }

  async function doDelete() {
    setDeleting(true)
    try {
      if (item.source === 'rec') {
        await api.delete(`/recommendations/${item.recommendation_id}/action-items/${item.id}`)
      } else if (item.source === 'goal') {
        await api.delete(`/goals/${item.goal_id}/action-items/${item._raw_id}`)
      } else {
        await api.delete(`/action-items/${item.id}`)
      }
      onDeleted(item)
    } catch (e) { console.error(e) } finally { setDeleting(false) }
  }

  const createdOn = item?.created_at
    ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null
  const contextTitle = item?.source === 'goal' ? item.goal_title
    : item?.source === 'rec' ? item.recommendation_title
    : item?.recommendation_title || item?.goal_title || null
  const contextLabel = item?.source === 'goal' ? 'Goal' : 'Initiative'
  const statusCfg = ACTION_ITEM_STATUSES_CD.find(s => s.value === status) || ACTION_ITEM_STATUSES_CD[0]

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[61] overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">{isNew ? 'New Action Item' : 'Edit Action'}</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>

            {isNew ? (
              <NewActionItemForm clientId={clientId} onClose={onClose} onCreated={onSaved} />
            ) : (
              <>
                {/* Top bar: Mark complete + Due date + Created on */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 flex-wrap">
                  <button onClick={toggleComplete}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      item.completed
                        ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                        : 'bg-primary-600 text-white border-primary-600 hover:bg-primary-700'
                    }`}>
                    <CheckSquare size={13} />
                    {item.completed ? 'Completed' : 'Mark as complete'}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Due</span>
                    <input type="date" value={dueDate} onChange={e => handleDateChange(e.target.value)}
                      className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-400" />
                  </div>
                  {!isGoal && (
                    <select value={status} onChange={e => handleStatusChange(e.target.value)}
                      className={`text-xs font-semibold border rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer ${statusCfg.cls} border-transparent`}>
                      {ACTION_ITEM_STATUSES_CD.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  )}
                  {createdOn && (
                    <span className="ml-auto text-[11px] text-gray-400 uppercase tracking-wider font-semibold whitespace-nowrap hidden sm:block">
                      Created: {createdOn}
                    </span>
                  )}
                </div>

                {/* Task text (auto-save) */}
                <div className="px-5 pt-4 pb-2">
                  <textarea value={text} onChange={e => handleTextChange(e.target.value)} rows={3}
                    className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 bg-gray-50/50"
                    placeholder="Describe the action item…"
                  />
                </div>

                {/* Notes (non-goal) */}
                {!isGoal && (
                  <div className="px-5 pb-3">
                    <textarea value={notes} onChange={e => handleNotesChange(e.target.value)} rows={2}
                      placeholder="Additional notes…"
                      className="w-full text-xs text-gray-600 border border-gray-100 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 bg-gray-50/30 placeholder:text-gray-300"
                    />
                  </div>
                )}

                {/* Context rows */}
                <div className="px-5 space-y-1.5 pb-4">
                  {/* Assigned to */}
                  <div className="flex items-center gap-3 py-1.5 border border-gray-100 rounded-lg px-3">
                    <User size={13} className="text-gray-300 shrink-0" />
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24 shrink-0">Assign to</span>
                    <select
                      value={assignedTo}
                      onChange={e => handleAssignChange(e.target.value)}
                      className="flex-1 text-sm text-gray-700 bg-transparent focus:outline-none cursor-pointer">
                      <option value="">— Unassigned</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                    </select>
                  </div>

                  {/* Initiative or Goal context */}
                  <div className="flex items-center gap-3 py-2 border border-gray-100 rounded-lg px-3">
                    <ClipboardList size={13} className="text-gray-300 shrink-0" />
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24 shrink-0">{contextLabel}</span>
                    {contextTitle ? (
                      item.recommendation_id && onOpenRec ? (
                        <button
                          onClick={() => { onOpenRec(item.recommendation_id); onClose() }}
                          className="text-sm font-medium text-primary-600 hover:text-primary-800 hover:underline text-left">
                          → {contextTitle}
                        </button>
                      ) : (
                        <span className={`text-sm font-medium ${item.source === 'goal' ? 'text-violet-600' : 'text-primary-600'}`}>
                          → {contextTitle}
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-gray-300 italic">None linked</span>
                    )}
                  </div>

                  {/* PSA Ticket */}
                  {!isGoal && (
                    <div className="flex items-center gap-3 py-1.5 border border-gray-100 rounded-lg px-3">
                      <Ticket size={13} className="text-gray-300 shrink-0" />
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24 shrink-0">PSA Ticket</span>
                      {ticketNum ? (
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-sm font-medium text-primary-600">#{ticketNum}</span>
                          <button onClick={handleUnlinkTicket} title="Unlink" className="text-gray-300 hover:text-red-500">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => setTicketModal('create')}
                            className="inline-flex items-center gap-1 text-xs font-medium bg-primary-600 text-white px-2.5 py-1 rounded-lg hover:bg-primary-700">
                            <Ticket size={11} /> Create
                          </button>
                          <button onClick={() => setTicketModal('link')}
                            className="inline-flex items-center gap-1 text-xs font-medium border border-gray-200 text-gray-600 px-2.5 py-1 rounded-lg hover:bg-gray-50">
                            <Link2 size={11} /> Link
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100">
                  <button onClick={doDelete} disabled={deleting}
                    className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                    <Trash2 size={13} /> {deleting ? 'Deleting…' : 'Delete action item'}
                  </button>
                  <button onClick={onClose}
                    className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Ticket modals (rendered outside main overlay so z-index stacks correctly) */}
      {ticketModal === 'create' && item && (
        <CreateActionItemTicketModal
          item={item}
          onClose={() => setTicketModal(null)}
          onSaved={handleTicketCreated}
        />
      )}
      {ticketModal === 'link' && (
        <LinkActionItemTicketModal
          item={item}
          clientId={clientId}
          onClose={() => setTicketModal(null)}
          onLink={handleLinkTicket}
        />
      )}
    </>
  )
}

function NewActionItemForm({ clientId, onClose, onCreated }) {
  const [text,   setText]   = useState('')
  const [saving, setSaving] = useState(false)

  async function create() {
    if (!text.trim()) return
    setSaving(true)
    try {
      const res = await api.post('/action-items', { client_id: clientId, text: text.trim() })
      onCreated(res.data, true)
      onClose()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  return (
    <div className="px-5 py-4 space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Task <span className="text-red-500">*</span></label>
        <textarea autoFocus value={text} onChange={e => setText(e.target.value)} rows={3}
          placeholder="Describe the action item…"
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) create() }}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
        <button onClick={create} disabled={saving || !text.trim()}
          className="px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50">
          {saving ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  )
}

// ─── Tab: Activities (LMX-style table) ────────────────────────────────────────
function ActivitiesTab({ clientId }) {
  const [items,    setItems]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [tabView,  setTabView]  = useState('upcoming')
  const [editItem, setEditItem] = useState(null)  // null=closed, false=new, obj=edit
  const [editRecId, setEditRecId] = useState(null)

  function load() {
    setLoading(true)
    Promise.all([
      api.get(`/action-items?client_id=${clientId}`),
      api.get(`/recommendations/action-items?client_id=${clientId}`),
      api.get(`/goals/action-items?client_id=${clientId}`),
    ]).then(([standRes, recRes, goalRes]) => {
      const standalone = (standRes.data || []).map(i => ({ ...i, _uid: `s-${i.id}`, source: 'standalone' }))
      const recItems   = (recRes.data   || []).map(i => ({ ...i, _uid: `r-${i.id}`, source: 'rec' }))
      const goalItems  = (goalRes.data  || []).map(i => ({
        _uid: `g-${i.id}`, _raw_id: i.id, id: i.id, source: 'goal',
        text: i.text, completed: i.completed, due_date: i.due_date, created_at: i.created_at,
        goal_id: i.goal_id, goal_title: i.goal_title,
        recommendation_id: null, recommendation_title: null, at_ticket_number: null,
      }))
      // Sort all by created_at desc
      const all = [...standalone, ...recItems, ...goalItems]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setItems(all)
    }).catch(console.error).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [clientId])

  const now = new Date(); now.setHours(0, 0, 0, 0)
  const upcoming  = items.filter(i => !i.completed && (!i.due_date || new Date(i.due_date) >= now))
  const overdue   = items.filter(i => !i.completed && i.due_date && new Date(i.due_date) < now)
  const completed = items.filter(i => i.completed)
  const shown = tabView === 'upcoming' ? upcoming : tabView === 'overdue' ? overdue : completed

  function onItemSaved(updated, isNew) {
    if (isNew) {
      setItems(prev => [{ ...updated, _uid: `s-${updated.id}`, source: 'standalone' }, ...prev])
    } else {
      setItems(prev => prev.map(i => i._uid === updated._uid ? { ...i, ...updated } : i))
    }
  }

  function onItemDeleted(deleted) {
    setItems(prev => prev.filter(i => i._uid !== deleted._uid))
    setEditItem(null)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Activities</h2>
        <button onClick={() => setEditItem(false)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
          <Plus size={14} /> New Action Item
        </button>
      </div>

      {/* Status tabs */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            ['upcoming',  'Upcoming',  upcoming.length,  false],
            ['overdue',   'Overdue',   overdue.length,   true],
            ['completed', 'Completed', completed.length, false],
          ].map(([v, l, cnt, isRed]) => (
            <button key={v} onClick={() => setTabView(v)}
              className={`flex-1 flex items-center justify-between px-5 py-3.5 text-sm font-medium border-r last:border-r-0 border-gray-100 transition-colors ${
                tabView === v ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full border-2 ${tabView === v ? 'border-primary-500' : 'border-gray-300'}`} />
                {l}
              </div>
              {cnt > 0 && (
                <span className={`text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                  isRed ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'
                }`}>{cnt}</span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={18} className="animate-spin mr-2" /> Loading…
          </div>
        ) : shown.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle size={28} className="mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">
              {tabView === 'upcoming' ? 'No upcoming action items' : tabView === 'overdue' ? 'Nothing overdue' : 'No completed items yet'}
            </p>
          </div>
        ) : (
          <>
            {/* Column header */}
            <div className="grid grid-cols-[1fr_120px_140px_160px_120px] gap-3 px-5 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Task</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Due Date</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Assigned to</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Initiative</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">PSA Ticket</span>
            </div>
            <div className="divide-y divide-gray-50">
              {shown.map(item => {
                const isOverdue = !item.completed && item.due_date && new Date(item.due_date) < now
                const contextTitle = item.source === 'goal' ? item.goal_title : item.recommendation_title
                const recId = item.recommendation_id
                return (
                  <div key={item._uid}
                    className="grid grid-cols-[1fr_120px_140px_160px_120px] gap-3 px-5 py-3 items-center hover:bg-gray-50/70 transition-colors group cursor-pointer"
                    onClick={() => setEditItem(item)}>
                    {/* Task */}
                    <div className="flex items-center gap-3 min-w-0">
                      <button onClick={e => { e.stopPropagation(); /* toggle inline */ }}
                        className="shrink-0">
                        {item.completed
                          ? <CheckSquare size={16} className="text-primary-600" />
                          : <Square size={16} className={isOverdue ? 'text-red-300' : 'text-gray-300'} />}
                      </button>
                      <span className={`text-sm truncate ${item.completed ? 'line-through text-gray-400' : isOverdue ? 'text-red-700 font-medium' : 'text-gray-800'}`}>
                        {item.text}
                      </span>
                    </div>
                    {/* Due date */}
                    <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {item.due_date
                        ? new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="text-gray-300">—</span>}
                    </span>
                    {/* Assigned to */}
                    <span className="text-xs text-gray-500 truncate">
                      {item.assigned_to_name || <span className="text-gray-300">—</span>}
                    </span>
                    {/* Initiative / Goal */}
                    <div className="flex items-center gap-1 min-w-0" onClick={e => e.stopPropagation()}>
                      {contextTitle ? (
                        <button onClick={() => recId && setEditRecId(recId)}
                          className={`text-xs truncate font-medium hover:underline ${item.source === 'goal' ? 'text-violet-600' : 'text-primary-600'}`}>
                          {contextTitle}
                        </button>
                      ) : (
                        <button onClick={() => {}} className="text-gray-300 hover:text-primary-500">
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                    {/* PSA Ticket */}
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      {item.at_ticket_number ? (
                        <span className="text-xs font-medium text-indigo-600">#{item.at_ticket_number}</span>
                      ) : (
                        <button className="text-gray-300 hover:text-primary-500">
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Edit / New modal */}
      {editItem !== null && (
        <ActionItemEditModal
          item={editItem === false ? null : editItem}
          clientId={clientId}
          onClose={() => setEditItem(null)}
          onSaved={onItemSaved}
          onDeleted={onItemDeleted}
          onOpenRec={id => { setEditItem(null); setEditRecId(id) }}
        />
      )}
      {editRecId && (
        <RecEditModal recId={editRecId} onClose={() => setEditRecId(null)} onSaved={() => {}} />
      )}
    </div>
  )
}

// ─── Tab: Client Profile ─────────────────────────────────────────────────────
// Verticals and LOB apps are now loaded from tenant settings API
const FRAMEWORK_OPTIONS = ['SOC2', 'HIPAA', 'PCI', 'NIST', 'CMMC', 'CIS', 'ISO27001']
const IDENTITY_OPTIONS = [
  { value: 'entra_id', label: 'Microsoft Entra ID (Azure AD)' },
  { value: 'google_workspace', label: 'Google Workspace' },
  { value: 'hybrid_ad', label: 'Hybrid AD (On-Prem + Cloud)' },
  { value: 'local_only', label: 'Local AD Only' },
  { value: 'none', label: 'None / Unknown' },
]
const INFRA_OPTIONS = [
  { value: 'cloud_only', label: 'Cloud Only' },
  { value: 'on_prem', label: 'On-Premises' },
  { value: 'hybrid', label: 'Hybrid (Cloud + On-Prem)' },
]

function ProfileTab({ clientId, client, onClientUpdate }) {
  const [verticals, setVerticals] = useState([])
  const [lobApps, setLobApps] = useState([])
  const [form, setForm] = useState({
    vertical:           client.vertical || '',
    frameworks_enabled: client.frameworks_enabled || [],
    identity_platform:  client.identity_platform || 'none',
    infra_model:        client.infra_model || 'hybrid',
    platform_stack:     client.platform_stack || 'microsoft365',
    lob_apps:           client.lob_apps || [],
    review_cadence:     client.review_cadence || 'quarterly',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [lobSearch, setLobSearch] = useState('')
  const [lobDropOpen, setLobDropOpen] = useState(false)
  const f = (k, v) => { setForm(p => ({ ...p, [k]: v })); setSaved(false) }

  useEffect(() => {
    Promise.all([
      api.get('/settings/verticals'),
      api.get('/settings/lob-apps'),
    ]).then(([vRes, lRes]) => {
      setVerticals(vRes.data || [])
      setLobApps(lRes.data || [])
    }).catch(console.error)
  }, [])

  function toggleFramework(fw) {
    setForm(p => {
      const arr = p.frameworks_enabled.includes(fw)
        ? p.frameworks_enabled.filter(x => x !== fw)
        : [...p.frameworks_enabled, fw]
      return { ...p, frameworks_enabled: arr }
    })
    setSaved(false)
  }

  function toggleLobApp(appName) {
    setForm(p => {
      const arr = p.lob_apps.includes(appName)
        ? p.lob_apps.filter(x => x !== appName)
        : [...p.lob_apps, appName]
      return { ...p, lob_apps: arr }
    })
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await api.patch(`/clients/${clientId}`, form)
      onClientUpdate(res.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) { console.error(err) } finally { setSaving(false) }
  }

  const filteredLobApps = useMemo(() => {
    if (!lobSearch) return lobApps
    const q = lobSearch.toLowerCase()
    return lobApps.filter(a => a.name.toLowerCase().includes(q) || a.vendor?.toLowerCase().includes(q))
  }, [lobApps, lobSearch])

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Client Profile</h2>
          <p className="text-sm text-gray-500">Industry, compliance, infrastructure — used to auto-map applicable standards</p>
        </div>
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : saved ? <><CheckCircle size={14} /> Saved</> : 'Save Profile'}
        </button>
      </div>

      <div className="space-y-6">
        {/* Vertical / Industry */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Industry Vertical</h3>
          <p className="text-xs text-gray-500 mb-3">Determines which industry-specific standards are auto-mapped. Manage list in Settings → Verticals.</p>
          <select value={form.vertical} onChange={e => f('vertical', e.target.value)}
            className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Not Set</option>
            {verticals.filter(v => v.is_active).map(v => (
              <option key={v.id} value={v.slug}>{v.name}</option>
            ))}
          </select>
        </div>

        {/* Compliance Frameworks */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Compliance Frameworks</h3>
          <p className="text-xs text-gray-500 mb-3">Select which frameworks apply. Framework-tagged standards will be auto-mapped.</p>
          <div className="flex flex-wrap gap-2">
            {FRAMEWORK_OPTIONS.map(fw => {
              const active = form.frameworks_enabled.includes(fw)
              return (
                <button key={fw} onClick={() => toggleFramework(fw)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    active
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}>
                  {active && <CheckCircle size={13} className="inline mr-1.5" />}
                  {fw}
                </button>
              )
            })}
          </div>
        </div>

        {/* Identity & Infrastructure */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Identity & Infrastructure</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Identity Platform</label>
              <select value={form.identity_platform} onChange={e => f('identity_platform', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {IDENTITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Infrastructure Model</label>
              <select value={form.infra_model} onChange={e => f('infra_model', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {INFRA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Platform Stack</label>
              <select value={form.platform_stack} onChange={e => f('platform_stack', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="microsoft365">Microsoft 365</option>
                <option value="google_workspace">Google Workspace</option>
                <option value="hybrid">Hybrid</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Review Cadence */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Review Cadence</h3>
          <p className="text-xs text-gray-500 mb-3">How often this client's standards should be reviewed. Smaller clients may use a longer cycle.</p>
          <div className="flex gap-2">
            {[
              { value: 'monthly', label: 'Monthly' },
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'semi_annual', label: 'Semi-Annual' },
              { value: 'annual', label: 'Annual' },
            ].map(opt => (
              <button key={opt.value} onClick={() => f('review_cadence', opt.value)}
                className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  form.review_cadence === opt.value
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}>
                {form.review_cadence === opt.value && <CheckCircle size={13} className="inline mr-1.5" />}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* LOB Applications — multi-select from managed list */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Line-of-Business Applications</h3>
          <p className="text-xs text-gray-500 mb-3">Select apps this client uses. Manage the master list in Settings → LOB Applications.</p>

          {/* Selected chips */}
          {form.lob_apps.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {form.lob_apps.map(app => (
                <span key={app} className="inline-flex items-center gap-1 text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-full">
                  {app}
                  <button onClick={() => toggleLobApp(app)} className="hover:text-primary-900">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Searchable dropdown */}
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={lobSearch}
                  onChange={e => { setLobSearch(e.target.value); setLobDropOpen(true) }}
                  onFocus={() => setLobDropOpen(true)}
                  placeholder="Search and select apps..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              {lobDropOpen && (
                <button onClick={() => setLobDropOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
              )}
            </div>
            {lobDropOpen && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                {filteredLobApps.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">No apps match. Add more in Settings → LOB Applications.</p>
                ) : (
                  filteredLobApps.map(a => {
                    const selected = form.lob_apps.includes(a.name)
                    return (
                      <button key={a.id} onClick={() => toggleLobApp(a.name)}
                        className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-gray-50 ${
                          selected ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                        }`}>
                        <span>
                          {a.name}
                          {a.vendor && <span className="text-xs text-gray-400 ml-2">{a.vendor}</span>}
                        </span>
                        {selected && <CheckCircle size={14} className="text-primary-600 shrink-0" />}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Client Standards ───────────────────────────────────────────────────
function ClientStandardsTab({ clientId, client }) {
  const [standards, setStandards]   = useState([])
  const [summary, setSummary]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [mapping, setMapping]       = useState(false)
  const [selectedDomain, setSelectedDomain] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [expandedDomains, setExpandedDomains] = useState(new Set())
  const [expandedStandards, setExpandedStandards] = useState(new Set())
  const [filterView, setFilterView] = useState('all')
  const [search, setSearch]         = useState('')
  const [filterPriority, setFilterPriority]   = useState('')
  const [filterTier, setFilterTier]           = useState('')
  const [filterDelivery, setFilterDelivery]   = useState('')
  const [filterSource, setFilterSource]       = useState('')
  const [filterFrequency, setFilterFrequency] = useState('')
  const [filterResponse, setFilterResponse]   = useState('')

  const loadData = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get(`/clients/${clientId}/standards`),
      api.get(`/clients/${clientId}/standards/summary`),
    ]).then(([stdRes, sumRes]) => {
      setStandards(stdRes.data || [])
      setSummary(sumRes.data || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [clientId])

  useEffect(() => { loadData() }, [loadData])

  async function runAutoMap() {
    setMapping(true)
    try {
      const res = await api.post(`/clients/${clientId}/standards/auto-map`)
      loadData()
      alert(`Auto-map complete: ${res.inserted} new, ${res.updated} updated. ${res.standards_count} total applicable.`)
    } catch (err) {
      console.error(err)
      alert('Auto-map failed. Check client profile is saved first.')
    } finally { setMapping(false) }
  }

  async function toggleApplicable(standardId, currentlyApplicable) {
    const newVal = currentlyApplicable === true ? false : true
    try {
      await api.patch(`/clients/${clientId}/standards/${standardId}`, { is_applicable: newVal })
      setStandards(prev => prev.map(s =>
        s.standard_id === standardId ? { ...s, is_applicable: newVal, applicability_source: 'manual', mapping_id: s.mapping_id || 'new' } : s
      ))
    } catch (err) { console.error(err) }
  }

  function toggleStandardExpand(id) {
    setExpandedStandards(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  // Group standards by domain for sidebar
  const domains = useMemo(() => {
    const map = {}
    for (const s of standards) {
      const key = s.domain_id || 'other'
      if (!map[key]) map[key] = { id: key, name: s.domain_name || 'Other', standards: [], categories: {}, domain_sort: s.domain_sort || 999 }
      map[key].standards.push(s)
      const cid = s.category_id || 'other'
      if (!map[key].categories[cid]) map[key].categories[cid] = { id: cid, name: s.category_name || 'Other', cat_sort: s.cat_sort || 999, count: 0, applicable: 0 }
      map[key].categories[cid].count++
      if (s.is_applicable === true) map[key].categories[cid].applicable++
    }
    return Object.values(map).sort((a, b) => a.domain_sort - b.domain_sort).map(d => ({
      ...d,
      categories: Object.values(d.categories).sort((a, b) => a.cat_sort - b.cat_sort)
    }))
  }, [standards])

  // Apply all filters
  const filtered = useMemo(() => {
    let list = standards
    if (selectedDomain) list = list.filter(s => (s.domain_id || 'other') === selectedDomain)
    if (selectedCategory) list = list.filter(s => (s.category_id || 'other') === selectedCategory)
    if (filterView === 'applicable') list = list.filter(s => s.is_applicable === true)
    else if (filterView === 'excluded') list = list.filter(s => s.is_applicable === false)
    else if (filterView === 'unmapped') list = list.filter(s => s.mapping_id == null)
    if (filterPriority) list = list.filter(s => s.priority === filterPriority)
    if (filterTier) list = list.filter(s => s.level_tier === filterTier)
    if (filterDelivery) list = list.filter(s => s.delivery_method === filterDelivery)
    if (filterSource) list = list.filter(s => s.applicability_source === filterSource)
    if (filterFrequency) list = list.filter(s => s.review_frequency === filterFrequency)
    if (filterResponse === 'reviewed') list = list.filter(s => s.last_reviewed_at)
    else if (filterResponse === 'never') list = list.filter(s => !s.last_reviewed_at)
    else if (filterResponse === 'aligned') list = list.filter(s => s.last_response_aligned === true)
    else if (filterResponse === 'misaligned') list = list.filter(s => s.last_response_aligned === false)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(s => s.name?.toLowerCase().includes(q) || s.category_name?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q))
    }
    return list
  }, [standards, selectedDomain, selectedCategory, filterView, filterPriority, filterTier, filterDelivery, filterSource, filterFrequency, filterResponse, search])

  const applicableCount = standards.filter(s => s.is_applicable === true).length
  const excludedCount = standards.filter(s => s.is_applicable === false).length
  const unmappedCount = standards.filter(s => s.mapping_id == null).length
  const hasActiveFilters = filterPriority || filterTier || filterDelivery || filterSource || filterFrequency || filterResponse

  function toggleDomain(id) {
    setExpandedDomains(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function selectDomain(domId) {
    setSelectedDomain(domId)
    setSelectedCategory(null)
  }

  function selectCategory(domId, catId) {
    setSelectedDomain(domId)
    setSelectedCategory(catId)
  }

  function clearFilters() {
    setFilterPriority(''); setFilterTier(''); setFilterDelivery(''); setFilterSource(''); setFilterFrequency(''); setFilterResponse('')
  }

  // Group filtered results by category for display
  const groupedFiltered = useMemo(() => {
    const catMap = {}
    for (const s of filtered) {
      const key = s.category_id || 'other'
      if (!catMap[key]) catMap[key] = { id: key, name: s.category_name || 'Other', domain_name: s.domain_name, cat_sort: s.cat_sort || 999, items: [] }
      catMap[key].items.push(s)
    }
    return Object.values(catMap).sort((a, b) => a.cat_sort - b.cat_sort)
  }, [filtered])

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const fmtFreq = f => ({ monthly: 'Monthly', quarterly: 'Quarterly', semi_annual: 'Semi-Annual', annual: 'Annual', never: 'Never' }[f] || f || '—')
  const levelColor = level => ({
    satisfactory: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    acceptable_risk: 'bg-sky-100 text-sky-700 border-sky-200',
    needs_attention: 'bg-amber-100 text-amber-700 border-amber-200',
    at_risk: 'bg-red-100 text-red-700 border-red-200',
    not_applicable: 'bg-gray-100 text-gray-500 border-gray-200'
  }[level] || 'bg-gray-100 text-gray-500 border-gray-200')

  if (loading) return <div className="text-center py-20 text-gray-400">Loading standards...</div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Client Standards</h2>
          <p className="text-sm text-gray-500">
            {applicableCount} applicable · {excludedCount} excluded · {unmappedCount > 0 ? `${unmappedCount} unmapped · ` : ''}{standards.length} total
          </p>
        </div>
        <button onClick={runAutoMap} disabled={mapping}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50">
          {mapping ? <><Loader2 size={14} className="animate-spin" /> Mapping...</> : <><RefreshCw size={14} /> Auto-Map Standards</>}
        </button>
      </div>

      {/* Layout: sidebar + content */}
      <div className="flex gap-0" style={{ minHeight: '600px' }}>
        {/* Left sidebar - domain/category tree */}
        <aside className="w-64 shrink-0 border-r border-gray-200 pr-3 mr-4 flex flex-col">
          <button
            onClick={() => { selectDomain(null) }}
            className={`w-full text-left px-3 py-2 text-sm rounded-lg mb-1 flex items-center justify-between ${
              !selectedDomain ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}>
            <span className="flex items-center gap-2"><ListChecks size={14} /> All Standards</span>
            <span className="text-xs text-gray-400">{standards.length}</span>
          </button>

          <div className="flex items-center justify-end gap-1 px-1 mb-1">
            <button onClick={() => setExpandedDomains(new Set(domains.map(d => d.id)))}
              className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100">Expand</button>
            <span className="text-gray-300 text-xs">|</span>
            <button onClick={() => setExpandedDomains(new Set())}
              className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100">Collapse</button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-0.5 pr-1" style={{ scrollbarWidth: 'thin' }}>
            {domains.map(dom => {
              const expanded = expandedDomains.has(dom.id)
              const isActive = selectedDomain === dom.id && !selectedCategory
              const domApplicable = dom.standards.filter(s => s.is_applicable === true).length
              return (
                <div key={dom.id}>
                  <div className="flex items-center">
                    <button
                      onClick={() => toggleDomain(dom.id)}
                      className="p-1 hover:bg-gray-100 rounded shrink-0">
                      <ChevronRight size={12} className={`transition-transform text-gray-400 ${expanded ? 'rotate-90' : ''}`} />
                    </button>
                    <button
                      onClick={() => { selectDomain(dom.id); if (!expanded) toggleDomain(dom.id) }}
                      className={`flex-1 text-left px-2 py-1.5 text-sm rounded-lg flex items-center justify-between gap-1 ${
                        isActive ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                      }`}>
                      <span className="leading-tight">{dom.name}</span>
                      <span className="text-xs text-gray-400 shrink-0 ml-1">{domApplicable}/{dom.standards.length}</span>
                    </button>
                  </div>
                  {expanded && dom.categories.map(cat => {
                    const isCatActive = selectedCategory === cat.id
                    return (
                      <button key={cat.id}
                        onClick={() => selectCategory(dom.id, cat.id)}
                        className={`w-full text-left pl-8 pr-2 py-1.5 text-xs rounded-lg flex items-center justify-between ${
                          isCatActive ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}>
                        <span className="leading-tight">{cat.name}</span>
                        <span className={`shrink-0 ml-1 ${isCatActive ? 'text-primary-500' : 'text-gray-400'}`}>{cat.applicable}/{cat.count}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </aside>

        {/* Right content */}
        <div className="flex-1 min-w-0">
          {/* Search + filter pills */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search standards..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
            </div>
            <div className="flex gap-1.5">
              {[
                { key: 'all', label: `All ${filtered.length}` },
                { key: 'applicable', label: `Applicable ${applicableCount}` },
                { key: 'excluded', label: `Excluded ${excludedCount}` },
                { key: 'unmapped', label: `Unmapped ${unmappedCount}` },
              ].map(f => (
                <button key={f.key} onClick={() => setFilterView(f.key)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                    filterView === f.key
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filter dropdowns */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Filter size={13} className="text-gray-400" />
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-400">
              <option value="">Priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-400">
              <option value="">Level Tier</option>
              <option value="level_1">Level 1 (Core)</option>
              <option value="level_2">Level 2</option>
              <option value="level_3">Level 3</option>
            </select>
            <select value={filterDelivery} onChange={e => setFilterDelivery(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-400">
              <option value="">Delivery</option>
              <option value="automated">Automated</option>
              <option value="remote_human">Remote</option>
              <option value="onsite">Onsite</option>
            </select>
            <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-400">
              <option value="">Source</option>
              <option value="universal">Universal</option>
              <option value="manual">Manual</option>
              <option value="vertical">Vertical</option>
              <option value="framework">Framework</option>
              <option value="tech">Tech</option>
            </select>
            <select value={filterFrequency} onChange={e => setFilterFrequency(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-400">
              <option value="">Frequency</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="semi_annual">Semi-Annual</option>
              <option value="annual">Annual</option>
            </select>
            <select value={filterResponse} onChange={e => setFilterResponse(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-400">
              <option value="">Review Status</option>
              <option value="reviewed">Reviewed</option>
              <option value="never">Never Reviewed</option>
              <option value="aligned">Last: Aligned</option>
              <option value="misaligned">Last: Misaligned</option>
            </select>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Clear filters</button>
            )}
          </div>

          {/* Standards grouped by category */}
          {filtered.length === 0 ? (
            <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
              <ListChecks size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-400">No standards match the current filters</p>
            </div>
          ) : (
            <div className="space-y-5">
              {groupedFiltered.map(cat => (
                <div key={cat.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{cat.domain_name}</h3>
                    <ChevronRight size={10} className="text-gray-300" />
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{cat.name}</h3>
                    <span className="text-xs text-gray-400">{cat.items.filter(s => s.is_applicable === true).length}/{cat.items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {cat.items.map(std => {
                      const isApplicable = std.is_applicable === true
                      const isExcluded = std.is_applicable === false
                      const isExpanded = expandedStandards.has(std.standard_id)
                      return (
                        <div key={std.standard_id}
                          className={`rounded-xl border transition-colors ${
                            isApplicable ? 'bg-white border-gray-100 hover:border-gray-200'
                            : isExcluded ? 'bg-gray-50 border-gray-100 opacity-60'
                            : 'bg-white border-dashed border-gray-200 opacity-70 hover:opacity-100'
                          }`}>
                          <div className="flex items-start gap-3 px-4 py-3">
                            {/* Checkbox */}
                            <button
                              onClick={() => toggleApplicable(std.standard_id, std.is_applicable)}
                              className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                isApplicable ? 'bg-primary-600 border-primary-600 text-white'
                                : isExcluded ? 'border-red-300 bg-red-50 hover:border-red-400'
                                : 'border-gray-300 hover:border-primary-400'
                              }`}
                              title={isApplicable ? 'Click to exclude' : 'Click to include'}>
                              {isApplicable && <CheckCircle size={12} />}
                              {isExcluded && <X size={10} className="text-red-400" />}
                            </button>

                            {/* Standard info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                                  std.priority === 'high' ? 'bg-red-100 text-red-700 border-red-200'
                                  : std.priority === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-200'
                                  : 'bg-gray-100 text-gray-600 border-gray-200'
                                }`}>{std.priority?.[0]?.toUpperCase()}</span>
                                {std.level_tier && (
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${
                                    std.level_tier === 'level_1' ? 'bg-sky-100 text-sky-700 border-sky-200'
                                    : std.level_tier === 'level_2' ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                                    : 'bg-violet-100 text-violet-700 border-violet-200'
                                  }`}>{std.level_tier === 'level_1' ? 'L1' : std.level_tier === 'level_2' ? 'L2' : 'L3'}</span>
                                )}
                                <span className={`text-xs px-1.5 py-0.5 rounded border ${
                                  std.delivery_method === 'automated' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                  : std.delivery_method === 'remote_human' ? 'bg-blue-100 text-blue-700 border-blue-200'
                                  : 'bg-orange-100 text-orange-700 border-orange-200'
                                }`}>{std.delivery_method === 'automated' ? 'Auto' : std.delivery_method === 'remote_human' ? 'Remote' : 'Onsite'}</span>
                                {std.applicability_source && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded border ${
                                    std.applicability_source === 'manual' ? 'bg-purple-100 text-purple-700 border-purple-200'
                                    : std.applicability_source === 'universal' ? 'bg-cyan-100 text-cyan-700 border-cyan-200'
                                    : 'bg-gray-100 text-gray-600 border-gray-200'
                                  }`}>{std.applicability_source}</span>
                                )}
                              </div>
                              <button onClick={() => toggleStandardExpand(std.standard_id)}
                                className="text-left w-full group">
                                <p className={`text-sm font-medium ${
                                  isApplicable ? 'text-gray-900' : isExcluded ? 'text-gray-500 line-through' : 'text-gray-600'
                                } group-hover:text-primary-600`}>
                                  {std.name}
                                </p>
                              </button>
                              {std.description && !isExpanded && (
                                <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{std.description}</p>
                              )}
                            </div>

                            {/* Right side: frequency, last reviewed, status */}
                            <div className="shrink-0 text-right space-y-1 min-w-[180px]">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-xs text-gray-400">{fmtFreq(std.review_frequency)}</span>
                              </div>
                              <div className="flex items-center justify-end gap-1.5">
                                <Clock size={10} className="text-gray-300" />
                                <span className="text-xs text-gray-500">
                                  {std.last_reviewed_at ? fmtDate(std.last_reviewed_at) : 'Never reviewed'}
                                </span>
                              </div>
                              {std.last_response_label && (
                                <div className="flex items-center justify-end">
                                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${levelColor(std.last_response_level)}`}>
                                    {std.last_response_label}
                                  </span>
                                </div>
                              )}
                              {!std.last_response_label && std.last_reviewed_at == null && (
                                <div className="flex items-center justify-end">
                                  <span className="text-xs px-2 py-0.5 rounded-full border border-gray-200 text-gray-400 bg-gray-50">Not assessed</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-0 ml-8 border-t border-gray-100 mt-1">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                                {std.description && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Description</p>
                                    <p className="text-sm text-gray-700">{std.description}</p>
                                  </div>
                                )}
                                {std.question_text && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Assessment Question</p>
                                    <p className="text-sm text-gray-700">{std.question_text}</p>
                                  </div>
                                )}
                                {std.business_impact && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Business Impact</p>
                                    <p className="text-sm text-gray-700">{std.business_impact}</p>
                                  </div>
                                )}
                                {std.technical_rationale && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Technical Rationale</p>
                                    <p className="text-sm text-gray-700">{std.technical_rationale}</p>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                                <span>Review Frequency: <strong>{fmtFreq(std.review_frequency)}</strong></span>
                                <span>Last Reviewed: <strong>{std.last_reviewed_at ? fmtDate(std.last_reviewed_at) : 'Never'}</strong></span>
                                {std.last_response_label && <span>Last Status: <strong className={std.last_response_aligned ? 'text-emerald-600' : 'text-red-600'}>{std.last_response_label}</strong></span>}
                                {std.override_reason && <span>Override Reason: <strong>{std.override_reason}</strong></span>}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Procurement shared helpers ───────────────────────────────────────────────
const PROC_STATUS_STYLES = {
  submitted: 'bg-blue-50 text-blue-700', confirmed: 'bg-indigo-50 text-indigo-700',
  partially_shipped: 'bg-yellow-50 text-yellow-700', shipped: 'bg-cyan-50 text-cyan-700',
  delivered: 'bg-green-50 text-green-700', backordered: 'bg-orange-50 text-orange-700',
  cancelled: 'bg-red-50 text-red-700', returned: 'bg-purple-50 text-purple-700',
  exception: 'bg-gray-100 text-gray-600',
}
function stagePillClass(stage) {
  if (!stage) return 'bg-gray-100 text-gray-500'
  const s = stage.toLowerCase()
  if (s.includes('closed') && (s.includes('won') || s.includes('satisfied') || s.includes('payment')))
    return 'bg-green-50 text-green-700'
  if (s.includes('closed') || s.includes('lost') || s.includes('no longer'))
    return 'bg-red-50 text-red-600'
  if (s.includes('qual') || s.includes('prospect'))
    return 'bg-blue-50 text-blue-700'
  if (s.includes('quote') || s.includes('proposal'))
    return 'bg-indigo-50 text-indigo-700'
  if (s.includes('waiting') || s.includes('po') || s.includes('contract'))
    return 'bg-yellow-50 text-yellow-700'
  return 'bg-gray-100 text-gray-600'
}
// "Active" is the only open status in Autotask
const OPEN_OPP_STATUS = 'Active'
function isOppOpen(opp) { return opp.status === OPEN_OPP_STATUS }
const DIST_LABELS = { ingram_xi: 'Ingram', tdsynnex_ecx: 'TD Synnex', amazon_business_csv: 'Amazon', provantage_manual: 'Provantage' }
function procFmt(v) { return v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v) }
function procDate(d) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }

function ProcEmptyState({ icon: Icon, title, sub, linkTo, linkLabel }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <Icon size={32} className="mx-auto mb-2 opacity-30" />
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {sub && <p className="text-xs mt-1">{sub}</p>}
      {linkTo && <a href={linkTo} className="text-xs text-primary-600 hover:underline mt-1 block">{linkLabel}</a>}
    </div>
  )
}

// ─── Tab: Procurement / Opportunities ────────────────────────────────────────
function ClientOpportunitiesTab({ clientId }) {
  const [opps, setOpps]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [showClosed, setShowClosed] = useState(false)

  useEffect(() => {
    api.get(`/opportunities?client_id=${clientId}`)
      .then(r => setOpps(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [clientId])

  if (loading) return <div className="text-center py-16 text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>
  if (!opps.length) return (
    <ProcEmptyState icon={Target} title="No opportunities yet"
      sub="Opportunities sync from Autotask for active clients"
      linkTo="/opportunities" linkLabel="View all opportunities →" />
  )

  const openOpps = opps.filter(o => isOppOpen(o))
  const wonOpps  = opps.filter(o => o.status === 'Closed' || o.status === 'Implemented')
  const lostOpps = opps.filter(o => o.status === 'Lost' || o.status === 'Not Ready To Buy')
  const visible  = showClosed ? opps : openOpps

  // Status pill for client opportunities tab
  function statusBadge(status) {
    switch (status) {
      case 'Active':           return <span className="px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700">Active</span>
      case 'Closed':           return <span className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700">Won</span>
      case 'Implemented':      return <span className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700">Implemented</span>
      case 'Lost':             return <span className="px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-600">Lost</span>
      case 'Not Ready To Buy': return <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-50 text-yellow-700">Not Ready</span>
      default:                 return <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">{status || '—'}</span>
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900">Opportunities</h2>
          {/* Summary badges */}
          <span className="text-xs text-gray-500">
            <span className="text-green-700 font-medium">{openOpps.length} open</span>
            {wonOpps.length > 0 && <> · <span className="text-blue-700 font-medium">{wonOpps.length} won</span></>}
            {lostOpps.length > 0 && <> · <span className="text-gray-400">{lostOpps.length} lost</span></>}
          </span>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-xs">
            <button onClick={() => setShowClosed(false)}
              className={`px-2.5 py-1 transition-colors ${!showClosed ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              Active
            </button>
            <button onClick={() => setShowClosed(true)}
              className={`px-2.5 py-1 transition-colors ${showClosed ? 'bg-gray-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              All
            </button>
          </div>
        </div>
        <a href="/opportunities" className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1">
          View all <ChevronRight size={12} />
        </a>
      </div>
      {visible.length === 0 ? (
        <ProcEmptyState icon={Target} title="No open opportunities"
          sub={(wonOpps.length + lostOpps.length) > 0 ? `${wonOpps.length + lostOpps.length} closed/lost — click "All" to see them` : ''}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Opportunity</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stage</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">PO Numbers</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quotes</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Orders</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Close Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.map(opp => (
                <tr key={opp.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 max-w-[220px]">
                    <p className="text-sm font-medium text-gray-900 truncate">{opp.title}</p>
                  </td>
                  <td className="px-4 py-3">
                    {statusBadge(opp.status)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${stagePillClass(opp.stage)}`}>
                      {opp.stage || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[160px]">
                    {opp.po_numbers?.length > 0 ? (
                      <p className="font-mono text-xs text-gray-700 truncate">
                        {opp.po_numbers.slice(0, 2).join(', ')}{opp.po_numbers.length > 2 ? ` +${opp.po_numbers.length - 2}` : ''}
                      </p>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${parseInt(opp.quote_count) > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                      {opp.quote_count || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${parseInt(opp.order_count) > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                      {opp.order_count || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm text-gray-900">{opp.amount != null ? procFmt(opp.amount) : '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">{procDate(opp.expected_close)}</span>
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

// ─── Tab: Procurement / Quotes ────────────────────────────────────────────────
function ClientQuotesTab({ clientId }) {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/opportunities/client-quotes?client_id=${clientId}`)
      .then(r => setQuotes(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [clientId])

  if (loading) return <div className="text-center py-16 text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>
  if (!quotes.length) return (
    <ProcEmptyState icon={FileText} title="No quotes yet"
      sub="Quotes sync from Autotask when opportunities are synced" />
  )

  const QUOTE_STATUS_STYLES = {
    Active: 'bg-green-50 text-green-700', Draft: 'bg-gray-100 text-gray-600',
    Sent: 'bg-blue-50 text-blue-700', Accepted: 'bg-emerald-50 text-emerald-700',
    Expired: 'bg-orange-50 text-orange-700', Rejected: 'bg-red-50 text-red-700',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Quotes ({quotes.length})</h2>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quote</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Opportunity</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">PO Numbers</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Items</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Valid Until</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {quotes.map(q => (
              <tr key={q.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">{q.title || q.quote_number || `Quote ${q.autotask_quote_id}`}</p>
                  {q.quote_number && <p className="text-xs text-gray-400 font-mono">#{q.quote_number}</p>}
                </td>
                <td className="px-4 py-3 max-w-[180px]">
                  <p className="text-xs text-gray-700 truncate">{q.opportunity_title || '—'}</p>
                  {q.opportunity_stage && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium mt-0.5 ${stagePillClass(q.opportunity_stage)}`}>
                      {q.opportunity_stage}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${QUOTE_STATUS_STYLES[q.status] || 'bg-gray-100 text-gray-600'}`}>
                    {q.status || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-[140px]">
                  {q.po_numbers?.length > 0 ? (
                    <p className="font-mono text-xs text-gray-700 truncate">{q.po_numbers.slice(0, 2).join(', ')}</p>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-medium ${parseInt(q.item_count) > 0 ? 'text-indigo-600' : 'text-gray-300'}`}>
                    {q.item_count || 0}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-medium text-gray-900">{q.amount != null ? procFmt(q.amount) : '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-500">{procDate(q.valid_until)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Tab: Procurement / Orders ────────────────────────────────────────────────
function ClientOrdersTab({ clientId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/orders?client_id=${clientId}&limit=100`)
      .then(r => setOrders(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [clientId])

  if (loading) return <div className="text-center py-16 text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>
  if (!orders.length) return (
    <ProcEmptyState icon={Package} title="No distributor orders linked to this client yet"
      sub="Import orders from distributors, then map them in the Orders page"
      linkTo="/orders" linkLabel="Go to Orders →" />
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Distributor Orders ({orders.length})</h2>
        <a href="/orders" className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1">
          View all <ChevronRight size={12} />
        </a>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Order #</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Distributor</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">PO</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Opportunity</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {orders.map(ord => (
              <tr key={ord.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{ord.distributor_order_id}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{DIST_LABELS[ord.distributor] || ord.distributor}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{ord.po_number || '—'}</td>
                <td className="px-4 py-3 max-w-[160px]">
                  <p className="text-xs text-gray-700 truncate">{ord.opportunity_title || '—'}</p>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{procDate(ord.order_date)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PROC_STATUS_STYLES[ord.status] || 'bg-gray-100 text-gray-600'}`}>
                    {ord.status?.replace(/_/g, ' ') || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-xs font-medium text-gray-900">{procFmt(ord.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Tab key normalizer ───────────────────────────────────────────────────────
const TAB_KEY_MAP = {
  'Overview': 'overview', 'Hardware': 'hardware', 'Recommendations': 'recommendations',
  'Assessments': 'assessments', 'Contacts': 'contacts', 'SaaS Licenses': 'saas-licenses',
  'Roadmap': 'roadmap', 'Budget': 'budget', 'Software': 'software',
  'Goals': 'goals', 'Activities': 'activities', 'Profile': 'profile', 'Standards': 'standards',
  'Procurement': 'procurement-opps', 'Opportunities': 'procurement-opps',
  'Quotes': 'procurement-quotes', 'Orders': 'procurement-orders',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClientDetail() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)

  const activeTab = searchParams.get('tab') || 'overview'

  function setActiveTab(tab) {
    const key = TAB_KEY_MAP[tab] || tab.toLowerCase().replace(/\s+/g, '-')
    setSearchParams({ tab: key }, { replace: true })
  }

  useEffect(() => {
    api.get(`/clients/${id}`)
      .then(d => setClient(d.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="text-center py-20 text-gray-400">Loading...</div>
  if (!client) return <div className="text-center py-20 text-gray-400">Client not found</div>

  // Section label for the header
  const SECTION_LABELS = {
    overview: 'Overview', goals: 'Goals', roadmap: 'Roadmap', budget: 'Budget',
    assessments: 'Assessments', recommendations: 'Recommendations', contacts: 'Contacts',
    hardware: 'Hardware', software: 'Software', 'saas-licenses': 'SaaS Licenses',
    activities: 'Activities', profile: 'Profile', standards: 'Standards',
    'procurement-opps': 'Procurement · Opportunities',
    'procurement-quotes': 'Procurement · Quotes',
    'procurement-orders': 'Procurement · Orders',
  }

  return (
    <div>
      {/* Client header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 text-primary-700 rounded-xl flex items-center justify-center font-bold text-lg shrink-0">
            {client.name?.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{client.name}</h1>
              {activeTab !== 'overview' && (
                <>
                  <span className="text-gray-300">/</span>
                  <span className="text-lg font-semibold text-gray-500">{SECTION_LABELS[activeTab] || activeTab}</span>
                </>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {client.autotask_company_id && `AT #${client.autotask_company_id}`}
              {client.city && client.state && ` · ${client.city}, ${client.state}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {client.autotask_company_id && (
            <a href={autotaskUrl('company', client.autotask_company_id)} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors font-medium">
              <ExternalLink size={12} /> Autotask
            </a>
          )}
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Alignment Score</p>
            <AlignmentScore score={client.health_score} size="lg" />
          </div>
        </div>
      </div>

      {/* Section content — no tab bar, sidebar handles navigation */}
      {activeTab === 'overview'        && <OverviewTab client={client} clientId={id} onSwitchTab={setActiveTab} />}
      {activeTab === 'goals'           && <GoalsTab clientId={id} />}
      {activeTab === 'activities'      && <ActivitiesTab clientId={id} />}
      {activeTab === 'roadmap'         && <RoadmapTab clientId={id} />}
      {activeTab === 'budget'          && <ClientBudgetPanel clientId={id} />}
      {activeTab === 'assessments'     && <AssessmentsTab clientId={id} />}
      {activeTab === 'recommendations' && <RecommendationsTab clientId={id} />}
      {activeTab === 'hardware'        && <AssetsTab clientId={id} />}
      {activeTab === 'software'        && <SoftwareTab clientId={id} />}
      {activeTab === 'contacts'        && <ContactsTab clientId={id} autotaskCompanyId={client.autotask_company_id} />}
      {activeTab === 'saas-licenses'   && <LicensesTab clientId={id} />}
      {activeTab === 'profile'              && <ProfileTab clientId={id} client={client} onClientUpdate={setClient} />}
      {activeTab === 'standards'            && <ClientStandardsTab clientId={id} client={client} />}
      {activeTab === 'procurement-opps'     && <ClientOpportunitiesTab clientId={id} />}
      {activeTab === 'procurement-quotes'   && <ClientQuotesTab clientId={id} />}
      {activeTab === 'procurement-orders'   && <ClientOrdersTab clientId={id} />}
    </div>
  )
}
