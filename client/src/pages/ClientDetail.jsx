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
  ExternalLink,
  User,
  Mail,
  Phone,
  Package,
  Cloud,
  Wifi,
  Server,
  Laptop,
  HardDrive,
  Shield,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import Card, { CardHeader, CardBody } from '../components/Card'
import StatCard from '../components/StatCard'
import { AlignmentScore } from '../components/AlignmentBadge'
import { api } from '../lib/api'

const TABS = ['Overview', 'Assets', 'Contacts', 'M365 Licenses']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function warrantyBadge(expiry) {
  if (!expiry) return { label: 'Unknown', cls: 'bg-gray-100 text-gray-500' }
  const d = new Date(expiry)
  const now = new Date()
  const days = Math.round((d - now) / 86400000)
  if (days < 0) return { label: 'Expired', cls: 'bg-red-100 text-red-700' }
  if (days < 90) return { label: `${days}d left`, cls: 'bg-yellow-100 text-yellow-700' }
  return { label: d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }), cls: 'bg-green-100 text-green-700' }
}

function AssetIcon({ type }) {
  const t = (type || '').toLowerCase()
  if (t.includes('server')) return <Server size={16} className="text-blue-500" />
  if (t.includes('laptop') || t.includes('notebook')) return <Laptop size={16} className="text-primary-500" />
  if (t.includes('network') || t.includes('switch') || t.includes('router') || t.includes('firewall')) return <Wifi size={16} className="text-purple-500" />
  if (t.includes('storage') || t.includes('nas')) return <HardDrive size={16} className="text-orange-500" />
  if (t.includes('cloud')) return <Cloud size={16} className="text-sky-500" />
  return <Monitor size={16} className="text-gray-400" />
}

function patchBadge(status) {
  if (!status) return null
  const s = status.toLowerCase()
  if (s === 'fullypatched' || s === 'compliant') return <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 rounded px-1.5 py-0.5"><CheckCircle size={11} />Patched</span>
  if (s === 'notcompliant' || s === 'not compliant') return <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 rounded px-1.5 py-0.5"><AlertCircle size={11} />Unpatched</span>
  return <span className="inline-flex items-center gap-1 text-xs text-yellow-700 bg-yellow-50 rounded px-1.5 py-0.5"><AlertTriangle size={11} />{status}</span>
}

function avBadge(status) {
  if (!status) return null
  const s = status.toLowerCase()
  if (s.includes('runninganduptodate') || s.includes('protected')) return <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 rounded px-1.5 py-0.5"><Shield size={11} />AV OK</span>
  return <span className="inline-flex items-center gap-1 text-xs text-orange-700 bg-orange-50 rounded px-1.5 py-0.5"><Shield size={11} />{status}</span>
}

const PLATFORM_COLORS = {
  microsoft_365: 'bg-blue-50 text-blue-700 border-blue-200',
  google_workspace: 'bg-green-50 text-green-700 border-green-200',
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({ client }) {
  const atUrl = client.autotask_company_id
    ? `https://webservices1.autotask.net/Mvc/Framework/Modules/Client/ManageClient.mvc?companyId=${client.autotask_company_id}`
    : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Assessment summary */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Assessment Summary</h3>
            <Link to="/assessments" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View Details →
            </Link>
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
                  <div className="bg-gray-300 rounded-full h-2.5" style={{ width: '0%' }} />
                </div>
                <span className="text-xs text-gray-400 w-10 text-right">—</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Quick actions */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Quick Actions</h3>
          </CardHeader>
          <CardBody className="space-y-1">
            {[
              { icon: ShieldCheck,   label: 'New Assessment',     color: 'text-green-600' },
              { icon: ClipboardList, label: 'Add Recommendation', color: 'text-orange-600' },
              { icon: Calendar,      label: 'Schedule QBR',       color: 'text-primary-600' },
              { icon: Target,        label: 'Set Quarterly Rock', color: 'text-purple-600' },
              { icon: TrendingUp,    label: 'Generate Report',    color: 'text-gray-600' },
            ].map(({ icon: Icon, label, color }) => (
              <button
                key={label}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Icon size={18} className={color} />
                {label}
              </button>
            ))}
          </CardBody>
        </Card>

        {/* Client info */}
        <Card>
          <CardHeader><h3 className="font-semibold text-gray-900">Client Info</h3></CardHeader>
          <CardBody className="space-y-2 text-sm">
            {client.phone && (
              <div className="flex items-center gap-2 text-gray-600">
                <Phone size={14} className="text-gray-400 shrink-0" />
                {client.phone}
              </div>
            )}
            {client.website && (
              <div className="flex items-center gap-2 text-gray-600">
                <ExternalLink size={14} className="text-gray-400 shrink-0" />
                <a href={`https://${client.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary-600 truncate">
                  {client.website}
                </a>
              </div>
            )}
            {(client.city || client.state) && (
              <div className="text-gray-600">{[client.city, client.state].filter(Boolean).join(', ')}</div>
            )}
            {atUrl && (
              <a
                href={atUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary-600 hover:text-primary-700 font-medium mt-1"
              >
                <ExternalLink size={14} />
                Open in Autotask
              </a>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

// ─── Tab: Assets ──────────────────────────────────────────────────────────────

function AssetsTab({ clientId }) {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all | datto | itg | auvik

  useEffect(() => {
    api.get(`/assets?client_id=${clientId}`)
      .then(r => setAssets(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [clientId])

  if (loading) return <div className="text-center py-12 text-gray-400">Loading assets...</div>

  const dattoCount = assets.filter(a => a.datto_rmm_device_id).length
  const itgCount = assets.filter(a => a.it_glue_config_id).length
  const auvikCount = assets.filter(a => a.auvik_device_id).length
  const multiCount = assets.filter(a =>
    (!!a.datto_rmm_device_id + !!a.it_glue_config_id + !!a.autotask_ci_id + !!a.auvik_device_id) >= 2
  ).length

  const filtered = assets.filter(a => {
    if (filter === 'datto') return !!a.datto_rmm_device_id
    if (filter === 'itg') return !!a.it_glue_config_id
    if (filter === 'auvik') return !!a.auvik_device_id
    if (filter === 'multi') return (!!a.datto_rmm_device_id + !!a.it_glue_config_id + !!a.autotask_ci_id + !!a.auvik_device_id) >= 2
    return true
  })

  return (
    <div>
      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-4">
        {[
          { key: 'all',   label: `All (${assets.length})` },
          { key: 'multi', label: `Multi-source (${multiCount})` },
          { key: 'datto', label: `RMM (${dattoCount})` },
          { key: 'itg',   label: `IT Glue (${itgCount})` },
          { key: 'auvik', label: `Auvik (${auvikCount})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No assets found</div>
      ) : (
        <Card>
          <div className="divide-y divide-gray-50">
            {filtered.map(asset => {
              const dattoUrl = asset.datto_rmm_data?.portalUrl
              const itgUrl = asset.it_glue_data?.attributes?.['resource-url']
              const wb = warrantyBadge(asset.warranty_expiry)
              const rmm = asset.datto_rmm_data || {}
              const patchStatus = rmm.patchManagement?.patchStatus || asset.patch_status
              const avStatus = rmm.antivirus?.antivirusStatus || asset.antivirus_status
              const os = asset.operating_system || rmm.operatingSystem

              return (
                <div key={asset.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    <AssetIcon type={asset.asset_type_name || rmm.deviceType?.category} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{asset.name}</span>
                      {asset.is_online && (
                        <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" title="Online" />
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${wb.cls}`}>
                        {wb.label}
                      </span>
                      {patchStatus && patchBadge(patchStatus)}
                      {avStatus && avBadge(avStatus)}
                    </div>
                    {os && <p className="text-xs text-gray-400 mt-0.5 truncate">{os}</p>}
                    {(asset.manufacturer || asset.model) && (
                      <p className="text-xs text-gray-400 truncate">{[asset.manufacturer, asset.model].filter(Boolean).join(' ')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {/* Source badges — show which systems this asset exists in */}
                    {asset.autotask_ci_id && (
                      <span className="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 font-medium" title="In Autotask PSA">PSA</span>
                    )}
                    {dattoUrl ? (
                      <a href={dattoUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-xs bg-primary-50 text-primary-700 border border-primary-200 rounded px-1.5 py-0.5 font-medium hover:bg-primary-100"
                        title="Open in Datto RMM">
                        RMM <ExternalLink size={10} />
                      </a>
                    ) : asset.datto_rmm_device_id && (
                      <span className="text-xs bg-primary-50 text-primary-700 rounded px-1.5 py-0.5 font-medium">RMM</span>
                    )}
                    {itgUrl ? (
                      <a href={itgUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 font-medium hover:bg-green-100"
                        title="Open in IT Glue">
                        ITG <ExternalLink size={10} />
                      </a>
                    ) : asset.it_glue_config_id && (
                      <span className="text-xs bg-green-50 text-green-700 rounded px-1.5 py-0.5 font-medium">ITG</span>
                    )}
                    {asset.auvik_device_id && (
                      <span className="text-xs bg-purple-50 text-purple-700 rounded px-1.5 py-0.5 font-medium">Auvik</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Tab: Contacts ───────────────────────────────────────────────────────────

function ContactsTab({ clientId, autotaskCompanyId }) {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/contacts?client_id=${clientId}`)
      .then(r => setContacts(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [clientId])

  if (loading) return <div className="text-center py-12 text-gray-400">Loading contacts...</div>

  const atBaseUrl = `https://webservices1.autotask.net/Mvc/Framework/Modules/Client/ManageContacts.mvc?companyId=${autotaskCompanyId}`

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
        {autotaskCompanyId && (
          <a
            href={atBaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            <ExternalLink size={14} />
            View All in Autotask
          </a>
        )}
      </div>

      {contacts.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <User size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No contacts synced yet</p>
            <p className="text-xs text-gray-400 mt-1">Run a contacts sync to pull from Autotask</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {contacts.map(contact => {
            const atContactUrl = contact.external_id
              ? `https://webservices1.autotask.net/Mvc/Framework/Modules/Client/ContactDetail.mvc?contactId=${contact.external_id}`
              : null

            return (
              <Card key={contact.id}>
                <div className="p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold text-sm shrink-0">
                    {contact.first_name?.charAt(0)}{contact.last_name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {contact.first_name} {contact.last_name}
                      </p>
                      {contact.is_primary && (
                        <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-medium">Primary</span>
                      )}
                    </div>
                    {contact.title && <p className="text-xs text-gray-500 mt-0.5">{contact.title}</p>}
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary-600 mt-1">
                        <Mail size={11} />{contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary-600">
                        <Phone size={11} />{contact.phone}
                      </a>
                    )}
                  </div>
                  {atContactUrl && (
                    <a
                      href={atContactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-primary-600 shrink-0"
                      title="Open in Autotask"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Tab: M365 Licenses ───────────────────────────────────────────────────────

function LicensesTab({ clientId }) {
  const [licenses, setLicenses] = useState([])
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('summary') // summary | users

  useEffect(() => {
    Promise.all([
      api.get(`/saas-licenses?client_id=${clientId}`),
      api.get(`/saas-licenses/summary?client_id=${clientId}`),
    ])
      .then(([lic, sum]) => {
        setLicenses(lic.data || [])
        setSummary(sum.data || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [clientId])

  if (loading) return <div className="text-center py-12 text-gray-400">Loading licenses...</div>

  // Group users by email (one row per user with all their licenses)
  const byUser = {}
  for (const lic of licenses) {
    if (!byUser[lic.user_email]) {
      byUser[lic.user_email] = { ...lic, licenses: [] }
    }
    byUser[lic.user_email].licenses.push(lic.license_display_name || lic.license_name)
  }
  const users = Object.values(byUser).sort((a, b) => (a.user_display_name || a.user_email).localeCompare(b.user_display_name || b.user_email))

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setView('summary')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${view === 'summary' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Summary
        </button>
        <button
          onClick={() => setView('users')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${view === 'users' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Per User ({users.length})
        </button>
      </div>

      {view === 'summary' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {summary.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-gray-400">No license data available</div>
          ) : (
            summary.map((s, i) => (
              <Card key={i}>
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.license_display_name || s.license_name}</p>
                    <p className={`text-xs mt-0.5 px-1.5 py-0.5 rounded inline-block border ${PLATFORM_COLORS[s.platform] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {s.platform === 'microsoft_365' ? 'Microsoft 365' : s.platform === 'google_workspace' ? 'Google Workspace' : s.platform}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-gray-900">{s.count}</span>
                    <p className="text-xs text-gray-400">users</p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      ) : (
        <Card>
          {users.length === 0 ? (
            <div className="text-center py-12">
              <Package size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No license data available</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {users.map(user => (
                <div key={user.user_email} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                    {(user.user_display_name || user.user_email).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {user.user_display_name || user.user_email}
                    </p>
                    {user.user_display_name && (
                      <p className="text-xs text-gray-400">{user.user_email}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {user.licenses.map((lic, i) => (
                        <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                          {lic}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClientDetail() {
  const { id } = useParams()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Overview')

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
      <Link to="/clients" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 mb-4">
        <ArrowLeft size={16} /> Back to Clients
      </Link>

      {/* Client header */}
      <div className="flex items-start justify-between mb-6">
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
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Alignment Score</p>
          <AlignmentScore score={client.health_score} size="lg" />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="Assets" value={client.asset_count ?? '—'} icon={Monitor} color="primary" />
        <StatCard label="Assessments" value={client.assessment_count ?? '—'} icon={ShieldCheck} color="green" />
        <StatCard label="Open Recs" value={client.open_rec_count ?? '—'} icon={ClipboardList} color="orange" />
        <StatCard label="Licenses" value={client.license_count ?? '—'} icon={Package} color="primary" />
        <StatCard label="Rocks" value={client.active_rocks ?? '—'} icon={Target} color="yellow" />
        <StatCard label="CSAT" value={client.csat_score != null ? `${client.csat_score}%` : '—'} icon={ThumbsUp} color="green" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Overview'      && <OverviewTab client={client} />}
      {activeTab === 'Assets'        && <AssetsTab clientId={id} />}
      {activeTab === 'Contacts'      && <ContactsTab clientId={id} autotaskCompanyId={client.autotask_company_id} />}
      {activeTab === 'M365 Licenses' && <LicensesTab clientId={id} />}
    </div>
  )
}
