import { useState } from 'react'
import { X, ExternalLink, Mail, Phone, Save } from 'lucide-react'
import { api } from '../lib/api'
import { autotaskUrl } from '../lib/autotask'

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-primary-600' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  )
}

function getInitials(contact) {
  const first = (contact.first_name || '').trim()
  const last = (contact.last_name || '').trim()
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase()
  if (first) return first[0].toUpperCase()
  if (last) return last[0].toUpperCase()
  return '?'
}

function InfoRow({ icon: Icon, label, value, href }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
      {Icon && <Icon size={14} className="text-gray-400 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium break-all">
            {value}
          </a>
        ) : (
          <p className="text-sm text-gray-800 break-all">{value}</p>
        )}
      </div>
    </div>
  )
}

export default function ContactModal({ contact, onClose, onSave }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({
    first_name:   contact.first_name   || '',
    last_name:    contact.last_name    || '',
    title:        contact.title        || '',
    email:        contact.email        || '',
    phone:        contact.phone        || '',
    mobile_phone: contact.mobile_phone || '',
    is_primary:   !!contact.is_primary,
    sync_enabled: !!contact.sync_enabled,
  })

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      // Only send changed fields
      const payload = {}
      const keys = ['first_name', 'last_name', 'title', 'email', 'phone', 'mobile_phone', 'is_primary', 'sync_enabled']
      for (const k of keys) {
        const original = contact[k] ?? (typeof form[k] === 'boolean' ? false : '')
        if (form[k] !== original) {
          payload[k] = form[k] === '' ? null : form[k]
        }
      }
      const res = await api.patch(`/contacts/${contact.id}`, payload)
      onSave(res.data ?? { ...contact, ...payload })
      setEditing(false)
    } catch (err) {
      console.error('Failed to save contact:', err)
      setError('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setForm({
      first_name:   contact.first_name   || '',
      last_name:    contact.last_name    || '',
      title:        contact.title        || '',
      email:        contact.email        || '',
      phone:        contact.phone        || '',
      mobile_phone: contact.mobile_phone || '',
      is_primary:   !!contact.is_primary,
      sync_enabled: !!contact.sync_enabled,
    })
    setError(null)
    setEditing(false)
  }

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown Contact'
  const atUrl = contact.external_id ? autotaskUrl('contact', contact.external_id) : null
  const initials = getInitials(contact)

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-end"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-[480px] h-full bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-primary-700">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">{fullName}</h2>
            {contact.title && (
              <p className="text-xs text-gray-500 truncate">{contact.title}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {!editing ? (
            /* ── View mode ───────────────────────────────────────────── */
            <div className="px-5 py-5">
              {/* Avatar + name block */}
              <div className="flex items-center gap-4 mb-5">
                <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                  <span className="text-xl font-bold text-primary-700">{initials}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-gray-900">{fullName}</p>
                  {contact.title && <p className="text-sm text-gray-500">{contact.title}</p>}
                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {contact.is_primary && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
                        Primary Contact
                      </span>
                    )}
                    {contact.sync_enabled !== undefined && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        contact.sync_enabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {contact.sync_enabled ? 'Sync On' : 'Sync Off'}
                      </span>
                    )}
                    {contact.external_source && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        {contact.external_source}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact details */}
              <div className="space-y-0 mb-5">
                <InfoRow icon={Mail} label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : null} />
                <InfoRow icon={Phone} label="Phone" value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : null} />
                <InfoRow icon={Phone} label="Mobile" value={contact.mobile_phone} href={contact.mobile_phone ? `tel:${contact.mobile_phone}` : null} />
              </div>

              {/* Autotask link */}
              {atUrl && (
                <a
                  href={atUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors mb-5"
                >
                  Open in Autotask <ExternalLink size={11} />
                </a>
              )}

              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                Edit Contact
              </button>
            </div>
          ) : (
            /* ── Edit mode ───────────────────────────────────────────── */
            <div className="px-5 py-5">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">First Name</label>
                    <input
                      type="text"
                      value={form.first_name}
                      onChange={e => set('first_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={form.last_name}
                      onChange={e => set('last_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => set('title', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => set('phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Mobile</label>
                    <input
                      type="tel"
                      value={form.mobile_phone}
                      onChange={e => set('mobile_phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-3 pt-1">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Primary Contact</p>
                      <p className="text-xs text-gray-400">Mark as the primary contact for this client</p>
                    </div>
                    <Toggle value={form.is_primary} onChange={v => set('is_primary', v)} />
                  </label>
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Sync Enabled</p>
                      <p className="text-xs text-gray-400">Include this contact in data syncs</p>
                    </div>
                    <Toggle value={form.sync_enabled} onChange={v => set('sync_enabled', v)} />
                  </label>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-60"
                  >
                    <Save size={14} />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
