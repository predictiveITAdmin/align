import { useState } from 'react'
import {
  X, ExternalLink, Monitor, Server, Laptop, Wifi, Shield,
  Router, HardDrive, Printer, Cpu, Box, Activity, Save,
  CheckCircle, AlertCircle, AlertTriangle, Shield as ShieldIcon,
  Clock, Thermometer, User, Globe, Eye, EyeOff,
} from 'lucide-react'
import { api } from '../lib/api'

const TYPE_ICONS = {
  'Workstation': Monitor, 'Laptop': Laptop, 'Server': Server,
  'Switch': Wifi, 'Firewall': Shield, 'Router': Router,
  'Access Point': Wifi, 'UPS': Activity, 'NAS/SAN': HardDrive,
  'Printer': Printer, 'Virtual Machine': Cpu, 'Monitor': Monitor, 'Other': Box,
}

function fmtDate(val) {
  if (!val) return ''
  return new Date(val).toISOString().slice(0, 10)
}

function WarrantyLine({ expiry }) {
  if (!expiry) return <span className="text-gray-400">Unknown</span>
  const d = new Date(expiry)
  const now = new Date()
  const days = Math.round((d - now) / 86400000)
  const fmt = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  if (days < 0) return <span className="text-red-600 font-medium flex items-center gap-1"><AlertCircle size={13} /> Expired {fmt}</span>
  if (days < 90) return <span className="text-yellow-600 font-medium flex items-center gap-1"><AlertTriangle size={13} /> Expires in {days} days ({fmt})</span>
  return <span className="text-green-700 font-medium flex items-center gap-1"><CheckCircle size={13} /> Active until {fmt}</span>
}

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 flex-1 break-all">{value}</span>
    </div>
  )
}

export default function AssetModal({ asset, assetTypes, onClose, onSave }) {
  const [tab, setTab] = useState('details')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    asset_type_id:  asset.asset_type_id || '',
    name:           asset.name || '',
    serial_number:  asset.serial_number || '',
    manufacturer:   asset.manufacturer || '',
    model:          asset.model || '',
    warranty_expiry: fmtDate(asset.warranty_expiry),
    purchase_date:  fmtDate(asset.purchase_date),
    eol_date:       fmtDate(asset.eol_date),
    notes:          asset.notes || '',
    is_managed:     asset.is_managed !== false,
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        asset_type_id:  form.asset_type_id || null,
        name:           form.name,
        serial_number:  form.serial_number || null,
        manufacturer:   form.manufacturer || null,
        model:          form.model || null,
        warranty_expiry: form.warranty_expiry || null,
        purchase_date:  form.purchase_date || null,
        eol_date:       form.eol_date || null,
        notes:          form.notes || null,
        is_managed:     form.is_managed,
      }
      const res = await api.patch(`/assets/${asset.id}`, payload)
      // Merge asset_type_name from our local list
      const typeName = assetTypes.find(t => t.id === res.data.asset_type_id)?.name
      onSave({ ...res.data, asset_type_name: typeName })
      setEditing(false)
    } catch (err) {
      console.error('Failed to save asset:', err)
    } finally {
      setSaving(false)
    }
  }

  const rmm = asset.datto_rmm_data || {}
  const itg = asset.it_glue_data?.attributes || {}
  const TypeIcon = TYPE_ICONS[asset.asset_type_name] || Box
  const dattoUrl = rmm.portalUrl
  const itgUrl = itg['resource-url']
  const webRemoteUrl = rmm.webRemoteUrl

  // Source count
  const sourceCount = [asset.datto_rmm_device_id, asset.it_glue_config_id,
    asset.autotask_ci_id, asset.auvik_device_id].filter(Boolean).length

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-[620px] h-full bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
            <TypeIcon size={18} className="text-primary-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900 truncate">{asset.name}</h2>
              {asset.is_online === true && (
                <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Online
                </span>
              )}
              {asset.is_online === false && (
                <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />Offline
                </span>
              )}
              {!asset.is_managed && (
                <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Untracked</span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{asset.client_name} · {asset.asset_type_name || 'Unknown Type'}</p>
            {/* Source links */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {dattoUrl && (
                <a href={dattoUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
                  Datto RMM <ExternalLink size={10} />
                </a>
              )}
              {webRemoteUrl && (
                <a href={webRemoteUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium">
                  Remote Control <ExternalLink size={10} />
                </a>
              )}
              {itgUrl && (
                <a href={itgUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium">
                  IT Glue <ExternalLink size={10} />
                </a>
              )}
              {asset.autotask_ci_id && (
                <a
                  href={`https://webservices1.autotask.net/Mvc/Framework/Modules/Client/ConfigurationItem.mvc?id=${asset.autotask_ci_id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-medium">
                  Autotask <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5 gap-1 shrink-0">
          {['details', 'live data', 'sources'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                tab === t ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'sources' ? `Sources (${sourceCount})` : t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Details tab ──────────────────────────────────────────────── */}
          {tab === 'details' && (
            <div className="px-5 py-4">
              {!editing ? (
                <>
                  {/* Read-only view */}
                  <div className="space-y-0">
                    <InfoRow label="Name"          value={asset.name} />
                    <InfoRow label="Type"          value={asset.asset_type_name} />
                    <InfoRow label="Client"        value={asset.client_name} />
                    <InfoRow label="Serial Number" value={asset.serial_number} />
                    <InfoRow label="Manufacturer"  value={asset.manufacturer} />
                    <InfoRow label="Model"         value={asset.model} />
                    <div className="flex items-start gap-3 py-1.5 border-b border-gray-50">
                      <span className="text-xs text-gray-400 w-32 shrink-0 pt-0.5">Warranty</span>
                      <span className="text-sm flex-1"><WarrantyLine expiry={asset.warranty_expiry} /></span>
                    </div>
                    <InfoRow label="Purchase Date" value={asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null} />
                    <InfoRow label="EOL Date"      value={asset.eol_date ? new Date(asset.eol_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null} />
                    <InfoRow label="IP Address"    value={asset.ip_address} />
                    <InfoRow label="OS"            value={asset.operating_system} />
                    <InfoRow label="Tracking"      value={asset.is_managed !== false ? 'Tracked' : 'Untracked'} />
                    {asset.notes && <InfoRow label="Notes" value={asset.notes} />}
                  </div>

                  <button
                    onClick={() => setEditing(true)}
                    className="mt-5 flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Edit Asset
                  </button>
                </>
              ) : (
                /* Edit form */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                      <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Asset Type</label>
                      <select value={form.asset_type_id} onChange={e => set('asset_type_id', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
                        <option value="">-- Select type --</option>
                        {assetTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Serial Number</label>
                      <input type="text" value={form.serial_number} onChange={e => set('serial_number', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Manufacturer</label>
                      <input type="text" value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
                      <input type="text" value={form.model} onChange={e => set('model', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Warranty Expiry</label>
                      <input type="date" value={form.warranty_expiry} onChange={e => set('warranty_expiry', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Purchase Date</label>
                      <input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">End-of-Life Date</label>
                      <input type="date" value={form.eol_date} onChange={e => set('eol_date', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                      <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
                    </div>

                    <div className="col-span-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <div
                          onClick={() => set('is_managed', !form.is_managed)}
                          className={`relative w-11 h-6 rounded-full transition-colors ${form.is_managed ? 'bg-primary-600' : 'bg-gray-200'}`}
                        >
                          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_managed ? 'translate-x-5' : ''}`} />
                        </div>
                        <span className="text-sm text-gray-700">
                          {form.is_managed ? 'Tracked (included in reporting)' : 'Untracked (excluded from reporting)'}
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button onClick={handleSave} disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-60">
                      <Save size={14} />{saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Live Data tab (Datto RMM) ─────────────────────────────────── */}
          {tab === 'live data' && (
            <div className="px-5 py-4">
              {!asset.datto_rmm_device_id ? (
                <div className="text-center py-10 text-gray-400">
                  <Monitor size={32} className="mx-auto mb-3 text-gray-200" />
                  <p className="text-sm">This asset is not in Datto RMM</p>
                  <p className="text-xs mt-1">Live data is only available for RMM-managed devices</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Status row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className={`rounded-xl p-3 text-center ${asset.is_online ? 'bg-green-50' : 'bg-gray-50'}`}>
                      <p className={`text-lg font-bold ${asset.is_online ? 'text-green-600' : 'text-gray-400'}`}>
                        {asset.is_online ? 'Online' : 'Offline'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Status</p>
                    </div>
                    <div className={`rounded-xl p-3 text-center ${rmm.patchManagement?.patchStatus === 'FullyPatched' ? 'bg-green-50' : 'bg-yellow-50'}`}>
                      <p className={`text-sm font-bold ${rmm.patchManagement?.patchStatus === 'FullyPatched' ? 'text-green-600' : 'text-yellow-600'}`}>
                        {rmm.patchManagement?.patchStatus === 'FullyPatched' ? 'Patched' : (rmm.patchManagement?.patchStatus || 'Unknown')}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Patches</p>
                    </div>
                    <div className={`rounded-xl p-3 text-center ${rmm.antivirus?.antivirusStatus?.includes('RunningAndUpToDate') ? 'bg-green-50' : 'bg-red-50'}`}>
                      <p className={`text-sm font-bold truncate ${rmm.antivirus?.antivirusStatus?.includes('RunningAndUpToDate') ? 'text-green-600' : 'text-red-600'}`}>
                        {rmm.antivirus?.antivirusProduct || 'No AV'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Antivirus</p>
                    </div>
                  </div>

                  {/* Patch details */}
                  {rmm.patchManagement && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-gray-600 mb-2">Patch Details</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div><p className="text-lg font-bold text-green-600">{rmm.patchManagement.patchesInstalled || 0}</p><p className="text-xs text-gray-400">Installed</p></div>
                        <div><p className="text-lg font-bold text-yellow-600">{rmm.patchManagement.patchesApprovedPending || 0}</p><p className="text-xs text-gray-400">Pending</p></div>
                        <div><p className="text-lg font-bold text-gray-400">{rmm.patchManagement.patchesNotApproved || 0}</p><p className="text-xs text-gray-400">Not Approved</p></div>
                      </div>
                    </div>
                  )}

                  {/* Device info */}
                  <div className="space-y-0">
                    <InfoRow label="Hostname"       value={rmm.hostname} />
                    <InfoRow label="OS"             value={rmm.operatingSystem} />
                    <InfoRow label="Domain"         value={rmm.domain} />
                    <InfoRow label="Internal IP"    value={rmm.intIpAddress} />
                    <InfoRow label="External IP"    value={rmm.extIpAddress} />
                    <InfoRow label="Last User"      value={rmm.lastLoggedInUser} />
                    <InfoRow label="Last Seen"      value={rmm.lastSeen ? new Date(rmm.lastSeen).toLocaleString() : null} />
                    <InfoRow label="Last Reboot"    value={rmm.lastReboot ? new Date(rmm.lastReboot).toLocaleString() : null} />
                    <InfoRow label="Last Audit"     value={rmm.lastAuditDate ? new Date(rmm.lastAuditDate).toLocaleString() : null} />
                    <InfoRow label="Agent Version"  value={rmm.displayVersion} />
                    <InfoRow label="Site"           value={rmm.siteName} />
                  </div>

                  {dattoUrl && (
                    <a href={dattoUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">
                      Open in Datto RMM <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Sources tab ───────────────────────────────────────────────── */}
          {tab === 'sources' && (
            <div className="px-5 py-4 space-y-4">
              {/* Datto RMM */}
              <div className={`rounded-xl border p-4 ${asset.datto_rmm_device_id ? 'border-primary-200 bg-primary-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${asset.datto_rmm_device_id ? 'bg-primary-500' : 'bg-gray-300'}`} />
                    <span className="text-sm font-semibold text-gray-800">Datto RMM</span>
                  </div>
                  {asset.datto_rmm_device_id && dattoUrl && (
                    <a href={dattoUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
                      Open <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                {asset.datto_rmm_device_id
                  ? <p className="text-xs text-gray-500 font-mono break-all">{asset.datto_rmm_device_id}</p>
                  : <p className="text-xs text-gray-400">Not in Datto RMM</p>}
              </div>

              {/* IT Glue */}
              <div className={`rounded-xl border p-4 ${asset.it_glue_config_id ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${asset.it_glue_config_id ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm font-semibold text-gray-800">IT Glue</span>
                  </div>
                  {asset.it_glue_config_id && itgUrl && (
                    <a href={itgUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium">
                      Open <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                {asset.it_glue_config_id
                  ? <>
                      <p className="text-xs text-gray-500 font-mono">Config ID: {asset.it_glue_config_id}</p>
                      {itg['configuration-type-name'] && <p className="text-xs text-gray-500 mt-0.5">Type: {itg['configuration-type-name']}</p>}
                      {itg['configuration-status-name'] && <p className="text-xs text-gray-500">Status: {itg['configuration-status-name']}</p>}
                    </>
                  : <p className="text-xs text-gray-400">Not in IT Glue</p>}
              </div>

              {/* Autotask PSA */}
              <div className={`rounded-xl border p-4 ${asset.autotask_ci_id ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${asset.autotask_ci_id ? 'bg-gray-500' : 'bg-gray-300'}`} />
                    <span className="text-sm font-semibold text-gray-800">Autotask PSA</span>
                  </div>
                  {asset.autotask_ci_id && (
                    <a href={`https://webservices1.autotask.net/Mvc/Framework/Modules/Client/ConfigurationItem.mvc?id=${asset.autotask_ci_id}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 font-medium">
                      Open <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                {asset.autotask_ci_id
                  ? <p className="text-xs text-gray-500 font-mono">CI ID: {asset.autotask_ci_id}</p>
                  : <p className="text-xs text-gray-400">Not in Autotask PSA</p>}
              </div>

              {/* Auvik */}
              <div className={`rounded-xl border p-4 ${asset.auvik_device_id ? 'border-purple-200 bg-purple-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${asset.auvik_device_id ? 'bg-purple-500' : 'bg-gray-300'}`} />
                  <span className="text-sm font-semibold text-gray-800">Auvik</span>
                </div>
                {asset.auvik_device_id
                  ? <p className="text-xs text-gray-500 font-mono break-all">{asset.auvik_device_id}</p>
                  : <p className="text-xs text-gray-400">Not in Auvik</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
