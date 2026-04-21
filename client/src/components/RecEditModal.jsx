/**
 * RecEditModal — Full initiative/recommendation editor.
 * Matches MyITProcess Initiative Detail style:
 *   header → meta bar → title → exec summary → description → action items → goals → budget → assets
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Plus, Loader2, Check, ExternalLink, Search, CheckSquare, Square, Trash2, User, ChevronRight, Ticket, Briefcase, Link2, Link, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'draft',       label: 'Draft' },
  { value: 'proposed',    label: 'Proposed' },
  { value: 'approved',    label: 'Approved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'deferred',    label: 'Deferred' },
  { value: 'declined',    label: 'Declined' },
]

const PRIORITY_CONFIG = [
  { value: 'low',      label: '·',   title: 'Low',      active: 'bg-gray-400 text-white',    inactive: 'bg-gray-100 text-gray-400 hover:bg-gray-200' },
  { value: 'medium',   label: '!',   title: 'Medium',   active: 'bg-yellow-400 text-white',  inactive: 'bg-gray-100 text-gray-400 hover:bg-gray-200' },
  { value: 'high',     label: '!!',  title: 'High',     active: 'bg-orange-500 text-white',  inactive: 'bg-gray-100 text-gray-400 hover:bg-gray-200' },
  { value: 'critical', label: '!!!', title: 'Critical', active: 'bg-red-600 text-white',     inactive: 'bg-gray-100 text-gray-400 hover:bg-gray-200' },
]

const TYPE_OPTIONS = [
  { value: '',             label: '— Category —' },
  { value: 'hardware',     label: 'Hardware' },
  { value: 'software',     label: 'Software' },
  { value: 'project',      label: 'Project' },
  { value: 'upgrade',      label: 'Upgrade' },
  { value: 'new_service',  label: 'New Service' },
  { value: 'remediation',  label: 'Remediation' },
  { value: 'compliance',   label: 'Compliance' },
  { value: 'training',     label: 'Training' },
  { value: 'process',      label: 'Process' },
  { value: 'improvement',  label: 'Improvement' },
  { value: 'maintenance',  label: 'Maintenance' },
  { value: 'strategic',    label: 'Strategic' },
]

const CUR_YEAR = new Date().getFullYear()
const YEARS = [CUR_YEAR - 1, CUR_YEAR, CUR_YEAR + 1, CUR_YEAR + 2, CUR_YEAR + 3]

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, action, children }) {
  return (
    <div className="border-t border-gray-100 pt-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

// ─── Action Items (enhanced with detail popup) ────────────────────────────────

const ACTION_ITEM_STATUSES = [
  { value: 'open',        label: 'Open',        cls: 'bg-gray-100 text-gray-600'   },
  { value: 'in_progress', label: 'In Progress', cls: 'bg-blue-100 text-blue-700'   },
  { value: 'done',        label: 'Done',        cls: 'bg-green-100 text-green-700' },
  { value: 'blocked',     label: 'Blocked',     cls: 'bg-red-100 text-red-700'     },
]

function ActionItemDetailModal({ recId, item, onClose, onSaved, onDeleted }) {
  const [text,      setText]      = useState(item?.text || '')
  const [status,    setStatus]    = useState(item?.status || 'open')
  const [dueDate,   setDueDate]   = useState(item?.due_date ? item.due_date.slice(0, 10) : '')
  const [notes,     setNotes]     = useState(item?.notes || '')
  const [ticketNum, setTicketNum] = useState(item?.at_ticket_number || '')
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const textTimer   = useRef(null)
  const notesTimer  = useRef(null)
  const ticketTimer = useRef(null)
  const isNew = !item

  async function patch(fields) {
    if (isNew) return
    try {
      const r = await api.patch(`/recommendations/${recId}/action-items/${item.id}`, fields)
      onSaved(r.data, false)
    } catch (e) { console.error(e) }
  }

  async function submit() {
    if (!text.trim()) return
    setSaving(true)
    try {
      const body = { text: text.trim(), status, due_date: dueDate || null, notes: notes || null, at_ticket_number: ticketNum || null }
      const result = await api.post(`/recommendations/${recId}/action-items`, body)
      onSaved(result.data, true)
      onClose()
    } catch (e) { console.error(e) } finally { setSaving(false) }
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
  function handleTicketChange(v) {
    setTicketNum(v)
    clearTimeout(ticketTimer.current)
    ticketTimer.current = setTimeout(() => patch({ at_ticket_number: v || null }), 800)
  }
  async function doDelete() {
    setDeleting(true)
    try {
      await api.delete(`/recommendations/${recId}/action-items/${item.id}`)
      onDeleted && onDeleted(item)
      onClose()
    } catch (e) { console.error(e) } finally { setDeleting(false) }
  }

  const statusCfg = ACTION_ITEM_STATUSES.find(s => s.value === status) || ACTION_ITEM_STATUSES[0]
  const createdOn = item?.created_at
    ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-[71] overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">{isNew ? 'New Action Item' : 'Edit Action'}</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>

            {isNew ? (
              /* ── New item simple form ── */
              <div className="px-5 py-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Task <span className="text-red-500">*</span></label>
                  <textarea autoFocus value={text} onChange={e => setText(e.target.value)} rows={2}
                    placeholder="Describe the action item…"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                      {ACTION_ITEM_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Due Date</label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                    placeholder="Additional notes…"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                  <button onClick={submit} disabled={saving || !text.trim()}
                    className="px-5 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                    {saving ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Top bar: Mark complete + Due date + Status + Created */}
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
                  <select value={status} onChange={e => handleStatusChange(e.target.value)}
                    className={`text-xs font-semibold border rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer ${statusCfg.cls} border-transparent`}>
                    {ACTION_ITEM_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  {createdOn && (
                    <span className="ml-auto text-[11px] text-gray-400 uppercase tracking-wider font-semibold whitespace-nowrap hidden sm:block">
                      Created: {createdOn}
                    </span>
                  )}
                </div>

                {/* Task text */}
                <div className="px-5 pt-4 pb-2">
                  <textarea value={text} onChange={e => handleTextChange(e.target.value)} rows={3}
                    className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 bg-gray-50/50"
                    placeholder="Describe the action item…" />
                </div>

                {/* Notes */}
                <div className="px-5 pb-3">
                  <textarea value={notes} onChange={e => handleNotesChange(e.target.value)} rows={2}
                    placeholder="Additional notes…"
                    className="w-full text-xs text-gray-600 border border-gray-100 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 bg-gray-50/30 placeholder:text-gray-300" />
                </div>

                {/* Context rows */}
                <div className="px-5 space-y-1.5 pb-4">
                  <div className="flex items-center gap-3 py-2 border border-gray-100 rounded-lg px-3">
                    <User size={13} className="text-gray-300 shrink-0" />
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24 shrink-0">Assign to</span>
                    <span className="text-sm text-gray-400 italic">{item.assigned_to_name || '—'}</span>
                  </div>
                  <div className="flex items-center gap-3 py-1.5 border border-gray-100 rounded-lg px-3">
                    <Ticket size={13} className="text-gray-300 shrink-0" />
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24 shrink-0">PSA Ticket</span>
                    <input value={ticketNum} onChange={e => handleTicketChange(e.target.value)}
                      placeholder="Ticket #…"
                      className="flex-1 text-sm text-gray-700 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-primary-400 focus:outline-none" />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100">
                  <button onClick={doDelete} disabled={deleting}
                    className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                    <Trash2 size={13} /> {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                  <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Close</button>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  )
}

function ActionItemsSection({ recId, initialItems }) {
  const [items,      setItems]      = useState(initialItems || [])
  const [detailItem, setDetailItem] = useState(null) // null=closed, false=new, obj=edit

  async function toggleItem(item) {
    try {
      const res = await api.patch(`/recommendations/${recId}/action-items/${item.id}`, { completed: !item.completed })
      setItems(prev => prev.map(i => i.id === item.id ? res.data : i))
    } catch (e) { console.error(e) }
  }

  async function deleteItem(id) {
    try {
      await api.delete(`/recommendations/${recId}/action-items/${id}`)
      setItems(prev => prev.filter(i => i.id !== id))
    } catch (e) { console.error(e) }
  }

  function onSaved(savedItem, isNew) {
    if (isNew) setItems(prev => [...prev, savedItem])
    else setItems(prev => prev.map(i => i.id === savedItem.id ? savedItem : i))
  }

  return (
    <Section
      title="Action Items"
      action={
        <button onClick={() => setDetailItem(false)}
          className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium">
          <Plus size={13} /> Create action item
        </button>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No action items yet.</p>
      ) : (
        <div className="space-y-1">
          {items.map(item => {
            const sc = ACTION_ITEM_STATUSES.find(s => s.value === item.status) || ACTION_ITEM_STATUSES[0]
            return (
              <div key={item.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg group hover:bg-gray-50">
                <button onClick={() => toggleItem(item)} className="shrink-0 text-gray-400 hover:text-primary-600 transition-colors">
                  {item.completed ? <CheckSquare size={15} className="text-primary-600" /> : <Square size={15} />}
                </button>
                <span onClick={() => setDetailItem(item)}
                  className={`flex-1 text-sm cursor-pointer hover:text-primary-700 ${item.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {item.text}
                </span>
                {item.status && item.status !== 'open' && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${sc.cls}`}>{sc.label}</span>
                )}
                {item.due_date && (
                  <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                    {new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                <button onClick={() => deleteItem(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 shrink-0 transition-opacity">
                  <X size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}
      {detailItem !== null && (
        <ActionItemDetailModal
          recId={recId}
          item={detailItem === false ? null : detailItem}
          onClose={() => setDetailItem(null)}
          onSaved={onSaved}
          onDeleted={deleted => {
            setItems(prev => prev.filter(i => i.id !== deleted.id))
            setDetailItem(null)
          }}
        />
      )}
    </Section>
  )
}

// ─── PSA Ticket + Opportunity (full create/link modals) ───────────────────────

function CreateTicketModal({ rec, onClose, onSave }) {
  const [picklists, setPicklists] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [form, setForm] = useState({
    title: `Lifecycle Initiative: ${rec?.title || ''}`,
    description: `${rec?.description || ''}\n\nEstimated Investment: $${rec?.estimated_budget || '0.00'}\n\nInitiative created from predictiveIT Align`,
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
      const res = await api.post(`/recommendations/${rec.id}/at-ticket`, {
        ...form,
        status:       form.status       ? parseInt(form.status)       : undefined,
        ticketType:   form.ticketType   ? parseInt(form.ticketType)   : undefined,
        priority:     form.priority     ? parseInt(form.priority)     : undefined,
        queueId:      form.queueId      ? parseInt(form.queueId)      : undefined,
        issueType:    form.issueType    ? parseInt(form.issueType)    : undefined,
        subIssueType: form.subIssueType ? parseInt(form.subIssueType) : undefined,
        categoryId:   form.categoryId   ? parseInt(form.categoryId)   : undefined,
        billingCodeId:form.billingCodeId? parseInt(form.billingCodeId): undefined,
      })
      onSave(res.data); onClose()
    } catch (err) { setError(err.message || 'Failed to create ticket') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
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
              <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={4}
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
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Ticket Category</label>
                  <select value={form.categoryId} onChange={e => f('categoryId', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select></div>
              )}
              {picklists?.billingCodes?.length > 0 && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Billing Code</label>
                  <select value={form.billingCodeId} onChange={e => f('billingCodeId', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.billingCodes.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select></div>
              )}
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => f('dueDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" /></div>
            </div>
            {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle size={14} />{error}</p>}
          </div>
        )}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
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

function LinkTicketModal({ recId, onClose, onSave }) {
  const [search,   setSearch]   = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  async function fetchTickets(q) {
    setLoading(true); setError('')
    try {
      const res = await api.get(`/recommendations/at-search/tickets?rec_id=${recId}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
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
    setSaving(true); setError('')
    try {
      const res = await api.patch(`/recommendations/${recId}/at-ticket`, {
        at_ticket_id:     selected.id,
        at_ticket_number: selected.ticketNumber,
        at_ticket_title:  selected.title,
      })
      onSave(res.data); onClose()
    } catch { setError('Failed to link ticket') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
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
                    selected?.id === t.id
                      ? 'border-primary-400 bg-primary-50'
                      : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                  }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono font-semibold text-primary-600 shrink-0">
                      {t.ticketNumber || `#${t.id}`}
                    </span>
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

function CreateOpportunityModal({ rec, onClose, onSave }) {
  const [picklists, setPicklists] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [form, setForm] = useState({
    title: rec?.title || '', description: rec?.description || '',
    status: '', stage: '', categoryId: '', rating: '', source: '',
    probability: '50', totalRevenue: rec?.estimated_budget || '0',
    cost: '0', onetimeRevenue: '0', monthlyRevenue: '0', yearlyRevenue: '0',
    estimatedCloseDate: rec?.target_date ? rec.target_date.split('T')[0] : '',
    startDate: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    api.get('/recommendations/at-picklists/opportunities')
      .then(r => {
        setPicklists(r.data)
        setForm(f => ({ ...f, status: r.data.statuses?.[0]?.value || '', stage: r.data.stages?.[0]?.value || '' }))
      })
      .catch(() => setPicklists({}))
      .finally(() => setLoading(false))
  }, [])

  const f = (name, value) => setForm(p => ({ ...p, [name]: value }))

  async function submit() {
    setSaving(true); setError('')
    try {
      const res = await api.post(`/recommendations/${rec.id}/at-opportunity`, {
        ...form,
        status:      form.status     ? parseInt(form.status)     : undefined,
        stage:       form.stage      ? parseInt(form.stage)      : undefined,
        categoryId:  form.categoryId ? parseInt(form.categoryId) : undefined,
        rating:      form.rating     ? parseInt(form.rating)     : undefined,
        source:      form.source     ? parseInt(form.source)     : undefined,
        probability:     parseFloat(form.probability)     || 50,
        totalRevenue:    parseFloat(form.totalRevenue)    || 0,
        cost:            parseFloat(form.cost)            || 0,
        onetimeRevenue:  parseFloat(form.onetimeRevenue)  || 0,
        monthlyRevenue:  parseFloat(form.monthlyRevenue)  || 0,
        yearlyRevenue:   parseFloat(form.yearlyRevenue)   || 0,
      })
      onSave(res.data); onClose()
    } catch (err) { setError(err.message || 'Failed to create opportunity') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Briefcase size={16} /> Create PSA Opportunity</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-10 text-gray-400">
            <Loader2 size={24} className="animate-spin mr-2" /> Loading...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={form.title} onChange={e => f('title', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
            <div className="grid grid-cols-2 gap-3">
              {picklists?.statuses?.length > 0 && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Status *</label>
                  <select value={form.status} onChange={e => f('status', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    {picklists.statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select></div>
              )}
              {picklists?.stages?.length > 0 && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Stage *</label>
                  <select value={form.stage} onChange={e => f('stage', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    {picklists.stages.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select></div>
              )}
              {picklists?.categories?.length > 0 && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select value={form.categoryId} onChange={e => f('categoryId', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select></div>
              )}
              {picklists?.ratings?.length > 0 && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Rating</label>
                  <select value={form.rating} onChange={e => f('rating', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.ratings.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select></div>
              )}
              {picklists?.sources?.length > 0 && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
                  <select value={form.source} onChange={e => f('source', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                    <option value="">Select...</option>
                    {picklists.sources.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select></div>
              )}
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
                <input type="date" value={form.startDate} onChange={e => f('startDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Expected Close Date *</label>
                <input type="date" value={form.estimatedCloseDate} onChange={e => f('estimatedCloseDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Probability (%)</label>
                <input type="number" min="0" max="100" value={form.probability} onChange={e => f('probability', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" /></div>
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none resize-none" /></div>
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-2">Financial Details</h4>
              <div className="grid grid-cols-2 gap-3">
                {[['totalRevenue','Total Revenue'],['cost','Cost'],['onetimeRevenue','One-time Rev'],['monthlyRevenue','Monthly Rev'],['yearlyRevenue','Yearly Rev']].map(([key, label]) => (
                  <div key={key}><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-400">$</span>
                      <input type="number" value={form[key]} onChange={e => f(key, e.target.value)}
                        className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
                    </div></div>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle size={14} />{error}</p>}
          </div>
        )}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button onClick={submit} disabled={saving || loading || !form.title}
            className="px-5 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Briefcase size={14} />}
            {saving ? 'Creating...' : 'Create Opportunity'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LinkOpportunityModal({ recId, onClose, onSave }) {
  const [search,   setSearch]   = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  function fmt(n) { return n ? `$${parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '' }

  async function fetchOpps(q) {
    setLoading(true); setError('')
    try {
      const res = await api.get(`/recommendations/at-search/opportunities?rec_id=${recId}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
      setResults(res.data || [])
    } catch { setError('Failed to load opportunities'); setResults([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchOpps('') }, [])

  useEffect(() => {
    if (!search) return
    const t = setTimeout(() => fetchOpps(search), 400)
    return () => clearTimeout(t)
  }, [search])

  async function submit() {
    if (!selected) return
    setSaving(true); setError('')
    try {
      const res = await api.patch(`/recommendations/${recId}/at-opportunity`, {
        at_opportunity_id:     selected.id,
        at_opportunity_number: selected.id,
        at_opportunity_title:  selected.title,
      })
      onSave(res.data); onClose()
    } catch { setError('Failed to link opportunity') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Briefcase size={16} /> Link Existing Opportunity</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="px-5 pt-4 pb-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by opportunity name…"
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
              {search ? 'No opportunities match your search.' : 'No opportunities found for this client.'}
            </p>
          ) : (
            <div className="space-y-1">
              {results.map(o => (
                <button key={o.id} onClick={() => setSelected(o)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    selected?.id === o.id
                      ? 'border-primary-400 bg-primary-50'
                      : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                  }`}>
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-sm text-gray-800 truncate">{o.title}</span>
                    {o.totalAmount > 0 && (
                      <span className="text-xs font-medium text-gray-500 shrink-0">{fmt(o.totalAmount)}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">ID #{o.id}</p>
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
            {saving ? 'Linking…' : 'Link Opportunity'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TicketSection({ recId, rec: initialRec }) {
  const [rec,   setRec]   = useState(initialRec)
  const [modal, setModal] = useState(null) // 'create_ticket'|'link_ticket'|'create_opp'|'link_opp'|'opp_dropdown'
  const oppDropRef = useRef(null)

  useEffect(() => {
    function handler(e) { if (oppDropRef.current && !oppDropRef.current.contains(e.target)) setModal(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const hasTicket      = rec?.at_ticket_id || rec?.at_ticket_number
  const hasOpportunity = rec?.at_opportunity_id || rec?.at_opportunity_number

  async function unlinkTicket() {
    try {
      await api.delete(`/recommendations/${recId}/at-ticket`)
      setRec(r => ({ ...r, at_ticket_id: null, at_ticket_number: null, at_ticket_title: null }))
    } catch (e) { console.error(e) }
  }

  async function unlinkOpportunity() {
    try {
      await api.delete(`/recommendations/${recId}/at-opportunity`)
      setRec(r => ({ ...r, at_opportunity_id: null, at_opportunity_number: null, at_opportunity_title: null }))
    } catch (e) { console.error(e) }
  }

  return (
    <Section title="PSA Integration">
      <div className="grid grid-cols-2 gap-3">
        {/* Ticket */}
        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/30">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Ticket size={12} /> PSA Ticket
          </p>
          {hasTicket ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary-700 truncate">
                  {rec.at_ticket_number ? `#${rec.at_ticket_number}` : 'Linked'}
                </p>
                {rec.at_ticket_title && <p className="text-xs text-gray-500 truncate">{rec.at_ticket_title}</p>}
              </div>
              <button onClick={unlinkTicket} title="Unlink" className="text-gray-300 hover:text-red-400 shrink-0"><X size={14} /></button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setModal('create_ticket')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary-700 rounded-lg hover:bg-primary-800 transition-colors">
                <Ticket size={12} /> Create Ticket
              </button>
              <button onClick={() => setModal('link_ticket')} title="Link existing"
                className="px-2.5 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 bg-white">
                <Link2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Opportunity */}
        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/30">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Briefcase size={12} /> PSA Opportunity
          </p>
          {hasOpportunity ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary-700 truncate">
                  {rec.at_opportunity_number ? `#${rec.at_opportunity_number}` : 'Linked'}
                </p>
                {rec.at_opportunity_title && <p className="text-xs text-gray-500 truncate">{rec.at_opportunity_title}</p>}
              </div>
              <button onClick={unlinkOpportunity} title="Unlink" className="text-gray-300 hover:text-red-400 shrink-0"><X size={14} /></button>
            </div>
          ) : (
            <div ref={oppDropRef} className="relative">
              <button onClick={() => setModal(modal === 'opp_dropdown' ? null : 'opp_dropdown')}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary-700 rounded-lg hover:bg-primary-800">
                <Briefcase size={12} /> Link Opportunity ▾
              </button>
              {modal === 'opp_dropdown' && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 w-full py-1">
                  <button onClick={() => setModal('create_opp')}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Plus size={14} /> New opportunity
                  </button>
                  <button onClick={() => setModal('link_opp')}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Link size={14} /> Link existing
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {modal === 'create_ticket' && <CreateTicketModal rec={rec} onClose={() => setModal(null)} onSave={d => setRec(d.data || d)} />}
      {modal === 'link_ticket'   && <LinkTicketModal recId={recId} onClose={() => setModal(null)} onSave={d => setRec(d.data || d)} />}
      {modal === 'create_opp'    && <CreateOpportunityModal rec={rec} onClose={() => setModal(null)} onSave={d => setRec(d.data || d)} />}
      {modal === 'link_opp'      && <LinkOpportunityModal recId={recId} onClose={() => setModal(null)} onSave={d => setRec(d.data || d)} />}
    </Section>
  )
}

// ─── Assets ───────────────────────────────────────────────────────────────────

function AssetsSection({ recId, initialAssets, clientId }) {
  const [assets,      setAssets]      = useState(initialAssets || [])
  const [showPicker,  setShowPicker]  = useState(false)

  async function removeAsset(assetId) {
    try {
      await api.delete(`/recommendations/${recId}/assets/${assetId}`)
      setAssets(prev => prev.filter(a => a.id !== assetId))
    } catch (e) { console.error(e) }
  }

  function onLinked(newAssets) {
    setAssets(prev => {
      const existingIds = new Set(prev.map(a => a.id))
      const toAdd = newAssets.filter(a => !existingIds.has(a.id))
      return [...prev, ...toAdd]
    })
    setShowPicker(false)
  }

  return (
    <Section
      title="Assets"
      action={
        <button onClick={() => setShowPicker(true)}
          className="inline-flex items-center gap-1 text-xs bg-primary-600 text-white px-2.5 py-1 rounded-lg hover:bg-primary-700">
          <Plus size={12} /> Add assets…
        </button>
      }
    >
      {assets.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No assets linked.</p>
      ) : (
        <div className="space-y-1">
          {assets.map(a => (
            <div key={a.id} className="flex items-center gap-3 py-2 px-2 rounded-lg group hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{a.name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {[a.asset_type, a.manufacturer, a.model].filter(Boolean).join(' · ')}
                  {a.serial_number && <> &nbsp;·&nbsp; SN: {a.serial_number}</>}
                </p>
              </div>
              <button onClick={() => removeAsset(a.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 shrink-0 transition-opacity">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {showPicker && (
        <AssetPickerModal
          recId={recId}
          clientId={clientId}
          existingIds={new Set(assets.map(a => a.id))}
          onClose={() => setShowPicker(false)}
          onLinked={onLinked}
        />
      )}
    </Section>
  )
}

function AssetPickerModal({ recId, clientId, existingIds, onClose, onLinked }) {
  const [allAssets, setAllAssets] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState(new Set())
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    const url = clientId ? `/assets?client_id=${clientId}&limit=2000` : '/assets?limit=5000'
    api.get(url)
      .then(r => setAllAssets((r.data || []).filter(a => !existingIds.has(a.id))))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = allAssets.filter(a => {
    if (!search) return true
    const q = search.toLowerCase()
    return [a.name, a.manufacturer, a.model, a.serial_number, a.hostname].some(v => v?.toLowerCase().includes(q))
  })

  async function link() {
    if (!selected.size) return
    setSaving(true)
    try {
      await api.post(`/recommendations/${recId}/assets/bulk`, { asset_ids: Array.from(selected) })
      const linked = allAssets.filter(a => selected.has(a.id))
      onLinked(linked)
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h4 className="font-semibold text-gray-800 text-sm">Add Assets</h4>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <span className="text-xs text-gray-500">{selected.size} selected</span>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search assets…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
              <Loader2 size={16} className="animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-10 text-sm text-gray-400">No assets found</p>
          ) : filtered.map(a => (
            <div key={a.id}
              onClick={() => setSelected(prev => { const n = new Set(prev); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n })}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-50 transition-colors ${selected.has(a.id) ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
              <input type="checkbox" readOnly checked={selected.has(a.id)}
                className="rounded border-gray-300 text-primary-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{a.name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {[a.asset_type_name || a.asset_type, a.manufacturer, a.model].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={link} disabled={saving || !selected.size}
            className="px-4 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 size={13} className="animate-spin" />}
            Link {selected.size > 0 ? `${selected.size} asset${selected.size > 1 ? 's' : ''}` : 'assets'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Goals Section ────────────────────────────────────────────────────────────

const GOAL_STATUS_CFG = {
  on_track:  { label: 'On Track',  cls: 'bg-green-100 text-green-700' },
  at_risk:   { label: 'At Risk',   cls: 'bg-amber-100 text-amber-700' },
  behind:    { label: 'Behind',    cls: 'bg-red-100 text-red-700'     },
  completed: { label: 'Completed', cls: 'bg-gray-100 text-gray-600'   },
}

function GoalEditPopup({ goalId, onClose }) {
  const [goal,    setGoal]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [title,   setTitle]   = useState('')
  const [desc,    setDesc]    = useState('')
  const titleTimer = useRef(null)
  const descTimer  = useRef(null)
  const curYear = new Date().getFullYear()

  useEffect(() => {
    api.get(`/goals/${goalId}`)
      .then(r => { const g = r.data; setGoal(g); setTitle(g.title || ''); setDesc(g.description || '') })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [goalId])

  async function patchGoal(fields) {
    try {
      const r = await api.patch(`/goals/${goalId}`, fields)
      setGoal(prev => ({ ...prev, ...r.data }))
    } catch (e) { console.error(e) }
  }

  function handleTitle(v) { setTitle(v); clearTimeout(titleTimer.current); titleTimer.current = setTimeout(() => patchGoal({ title: v }), 600) }
  function handleDesc(v)  { setDesc(v);  clearTimeout(descTimer.current);  descTimer.current  = setTimeout(() => patchGoal({ description: v }), 600) }

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-[71] overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Goal Detail</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 size={20} className="animate-spin mr-2" /> Loading…
              </div>
            ) : goal ? (
              <div className="px-5 py-4 space-y-4">
                <input value={title} onChange={e => handleTitle(e.target.value)}
                  className="w-full text-base font-semibold text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400" />
                <textarea value={desc} onChange={e => handleDesc(e.target.value)} rows={2}
                  placeholder="Description…"
                  className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={goal.status || 'on_track'}
                    onChange={e => { setGoal(g => ({ ...g, status: e.target.value })); patchGoal({ status: e.target.value }) }}
                    className={`text-xs font-semibold border rounded-lg px-2 py-1 focus:outline-none ${(GOAL_STATUS_CFG[goal.status] || GOAL_STATUS_CFG.on_track).cls}`}>
                    {Object.entries(GOAL_STATUS_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                  </select>
                  <select value={goal.target_year || ''}
                    onChange={e => { const y = e.target.value ? parseInt(e.target.value) : null; setGoal(g => ({ ...g, target_year: y })); patchGoal({ target_year: y }) }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
                    <option value="">Year</option>
                    {[curYear - 1, curYear, curYear + 1, curYear + 2].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select value={goal.target_quarter || ''}
                    onChange={e => { const q = e.target.value ? parseInt(e.target.value) : null; setGoal(g => ({ ...g, target_quarter: q })); patchGoal({ target_quarter: q }) }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
                    <option value="">Qtr</option>
                    {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
                  </select>
                </div>
                {(goal.action_items || []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Action Items</p>
                    <div className="space-y-1">
                      {goal.action_items.map(item => (
                        <div key={item.id} className="flex items-center gap-2 text-sm text-gray-700">
                          {item.completed
                            ? <CheckSquare size={14} className="text-primary-600 shrink-0" />
                            : <Square size={14} className="text-gray-300 shrink-0" />}
                          <span className={item.completed ? 'line-through text-gray-400' : ''}>{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(goal.initiatives || []).length > 0 && (
                  <p className="text-xs text-gray-400">{goal.initiatives.length} linked initiative{goal.initiatives.length !== 1 ? 's' : ''}</p>
                )}
              </div>
            ) : (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">Goal not found</p>
            )}
            <div className="flex justify-end px-5 py-3.5 border-t border-gray-100">
              <button onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function GoalPickerModal({ recId, clientId, existingIds, onClose, onLinked }) {
  const [goals,   setGoals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [saving,  setSaving]  = useState(null)

  useEffect(() => {
    if (!clientId) { setLoading(false); return }
    api.get(`/goals?client_id=${clientId}`)
      .then(r => setGoals(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [clientId])

  const filtered = goals.filter(g =>
    !existingIds.has(g.id) && g.title.toLowerCase().includes(search.toLowerCase())
  )

  async function link(goal) {
    setSaving(goal.id)
    try {
      await api.post(`/recommendations/${recId}/goals`, { goal_id: goal.id })
      onLinked(goal)
    } catch (e) { console.error(e) } finally { setSaving(null) }
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-[71] overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Link a Goal</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="px-4 py-2.5 border-b border-gray-100">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search goals…"
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
                  <Loader2 size={16} className="animate-spin mr-2" /> Loading…
                </div>
              ) : !clientId ? (
                <p className="px-5 py-8 text-sm text-gray-400 text-center">No client context</p>
              ) : filtered.length === 0 ? (
                <p className="px-5 py-8 text-sm text-gray-400 text-center">
                  {goals.length === 0 ? 'No goals for this client yet' : 'No matching goals'}
                </p>
              ) : filtered.map(goal => {
                const sc = GOAL_STATUS_CFG[goal.status] || GOAL_STATUS_CFG.on_track
                const target = goal.target_year ? `${goal.target_year}${goal.target_quarter ? ` Q${goal.target_quarter}` : ''}` : null
                return (
                  <button key={goal.id} onClick={() => link(goal)} disabled={saving === goal.id}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-primary-50 text-left transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{goal.title}</p>
                      {target && <p className="text-xs text-gray-400">{target}</p>}
                    </div>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${sc.cls}`}>{sc.label}</span>
                    {saving === goal.id && <Loader2 size={13} className="animate-spin shrink-0" />}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end px-5 py-3 border-t border-gray-100">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Close</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function GoalQuickCreateModal({ recId, clientId, onClose, onCreated }) {
  const [title,  setTitle]  = useState('')
  const [year,   setYear]   = useState(new Date().getFullYear())
  const [saving, setSaving] = useState(false)
  const curYear = new Date().getFullYear()

  async function submit() {
    if (!title.trim() || !clientId) return
    setSaving(true)
    try {
      const gRes = await api.post('/goals', { client_id: clientId, title: title.trim(), status: 'on_track', target_year: year })
      await api.post(`/recommendations/${recId}/goals`, { goal_id: gRes.data.id })
      onCreated(gRes.data)
      onClose()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-[71] overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">New Goal</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Title <span className="text-red-500">*</span></label>
                <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder="e.g. Improve Security Posture 2026"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Target Year</label>
                <select value={year} onChange={e => setYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                  {[curYear - 1, curYear, curYear + 1, curYear + 2].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={submit} disabled={saving || !title.trim()}
                className="px-5 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {saving ? 'Creating…' : 'Create & Link'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function GoalsSection({ recId, clientId }) {
  const [goals,      setGoals]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showPicker, setShowPicker] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editGoalId, setEditGoalId] = useState(null)

  useEffect(() => {
    setLoading(true)
    api.get(`/recommendations/${recId}/goals`)
      .then(r => setGoals(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [recId])

  async function unlink(goalId) {
    try {
      await api.delete(`/recommendations/${recId}/goals/${goalId}`)
      setGoals(prev => prev.filter(g => g.id !== goalId))
    } catch (e) { console.error(e) }
  }

  return (
    <Section
      title="Goals"
      action={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPicker(true)}
            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium">
            + Link goal
          </button>
          <span className="text-gray-300">|</span>
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium">
            + New goal
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 py-2">
          <Loader2 size={13} className="animate-spin" /> Loading…
        </div>
      ) : goals.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No goals linked. Goals help track strategic objectives for this client.</p>
      ) : (
        <div className="space-y-1.5">
          {goals.map(goal => {
            const sc = GOAL_STATUS_CFG[goal.status] || GOAL_STATUS_CFG.on_track
            const target = goal.target_year
              ? `${goal.target_year}${goal.target_quarter ? ` Q${goal.target_quarter}` : ''}`
              : null
            return (
              <div key={goal.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg group hover:bg-gray-50">
                <button onClick={() => setEditGoalId(goal.id)} className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-primary-600 hover:text-primary-800 hover:underline truncate cursor-pointer">
                    {goal.title}
                  </p>
                  {target && <p className="text-xs text-gray-400">{target}</p>}
                </button>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${sc.cls}`}>{sc.label}</span>
                <button onClick={() => unlink(goal.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity shrink-0">
                  <X size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}
      {showPicker && (
        <GoalPickerModal
          recId={recId} clientId={clientId}
          existingIds={new Set(goals.map(g => g.id))}
          onClose={() => setShowPicker(false)}
          onLinked={goal => { setGoals(prev => [...prev, goal]); setShowPicker(false) }}
        />
      )}
      {showCreate && (
        <GoalQuickCreateModal
          recId={recId} clientId={clientId}
          onClose={() => setShowCreate(false)}
          onCreated={goal => { setGoals(prev => [...prev, goal]) }}
        />
      )}
      {editGoalId && (
        <GoalEditPopup goalId={editGoalId} onClose={() => setEditGoalId(null)} />
      )}
    </Section>
  )
}

// ─── Budget ───────────────────────────────────────────────────────────────────

// BudgetItemRow must be defined OUTSIDE BudgetSection so React sees a stable
// component identity and never unmounts it on parent re-renders (which would
// destroy focus and cause the cursor-jump bug when typing dollar amounts).
function BudgetItemRow({ item, onUpdate, onDelete }) {
  const [desc, setDesc] = useState(item.description)
  const [amt,  setAmt]  = useState(item.amount)
  const dT = useRef(null)
  const aT = useRef(null)
  return (
    <div className="flex items-center gap-2 py-2 group border-b border-gray-100 last:border-0">
      <button onClick={() => onDelete(item.id)}
        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <X size={14} />
      </button>
      <input value={desc}
        onChange={e => { setDesc(e.target.value); clearTimeout(dT.current); dT.current = setTimeout(() => onUpdate(item.id, 'description', e.target.value), 600) }}
        className="flex-1 text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-400 focus:outline-none px-1 min-w-0"
      />
      <span className="text-xs text-gray-400 shrink-0">$</span>
      <input type="number" value={amt}
        onChange={e => { setAmt(e.target.value); clearTimeout(aT.current); aT.current = setTimeout(() => onUpdate(item.id, 'amount', parseFloat(e.target.value) || 0), 600) }}
        className="w-24 text-sm text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-400 focus:outline-none px-1 shrink-0"
      />
      <select value={item.billing_type} onChange={e => onUpdate(item.id, 'billing_type', e.target.value)}
        className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600 focus:outline-none shrink-0">
        <option value="fixed">Flat fee</option>
        <option value="per_asset">Per asset</option>
      </select>
    </div>
  )
}

function BudgetSection({ recId, initialItems, assetCount }) {
  const [items,      setItems]   = useState(initialItems || [])
  const [adding,     setAdding]  = useState(null)
  const [newDesc,    setNewDesc] = useState('')
  const [newAmount,  setNewAmt]  = useState('')
  const [newBilling, setNewBill] = useState('fixed')
  const [saving,     setSaving]  = useState(false)

  const oneTime = items.filter(i => i.fee_type === 'one_time')
  const monthly = items.filter(i => i.fee_type === 'recurring_monthly')
  const annual  = items.filter(i => i.fee_type === 'recurring_annual')

  function calcTotal(list) {
    return list.reduce((s, i) => {
      const amt = parseFloat(i.amount) || 0
      return s + (i.billing_type === 'per_asset' ? amt * (assetCount || 0) : amt)
    }, 0)
  }

  function fmtUSD(n) {
    return (parseFloat(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
  }

  async function addItem(feeType) {
    if (!newDesc.trim()) return
    setSaving(true)
    try {
      const res = await api.post(`/recommendations/${recId}/budget-items`, {
        description: newDesc.trim(), amount: parseFloat(newAmount) || 0,
        billing_type: newBilling, fee_type: feeType,
      })
      setItems(prev => [...prev, res.data])
      setNewDesc(''); setNewAmt(''); setNewBill('fixed'); setAdding(null)
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  async function updateItem(id, field, value) {
    try {
      const res = await api.patch(`/recommendations/${recId}/budget-items/${id}`, { [field]: value })
      setItems(prev => prev.map(i => i.id === id ? res.data : i))
    } catch (e) { console.error(e) }
  }

  async function deleteItem(id) {
    try {
      await api.delete(`/recommendations/${recId}/budget-items/${id}`)
      setItems(prev => prev.filter(i => i.id !== id))
    } catch (e) { console.error(e) }
  }

  // Inline add-row JSX helper — NOT a component, just a variable, so React never
  // unmounts/remounts it and autoFocus never fires again mid-typing.
  const addRowJsx = (feeType) => adding !== feeType ? null : (
    <div className="flex items-center gap-2 py-2 border-t border-gray-100">
      <input autoFocus value={newDesc} onChange={e => setNewDesc(e.target.value)}
        placeholder="Description…" onKeyDown={e => e.key === 'Enter' && addItem(feeType)}
        className="flex-1 text-sm border-b border-primary-400 focus:outline-none px-1 min-w-0" />
      <span className="text-xs text-gray-400 shrink-0">$</span>
      <input type="number" value={newAmount} onChange={e => setNewAmt(e.target.value)}
        placeholder="0" className="w-20 text-sm text-right border-b border-gray-300 focus:outline-none px-1 shrink-0" />
      <select value={newBilling} onChange={e => setNewBill(e.target.value)}
        className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none shrink-0">
        <option value="fixed">Flat fee</option>
        <option value="per_asset">Per asset</option>
      </select>
      <button onClick={() => addItem(feeType)} disabled={saving || !newDesc.trim()}
        className="px-2.5 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 shrink-0">
        {saving ? '…' : 'Add'}
      </button>
      <button onClick={() => { setAdding(null); setNewDesc(''); setNewAmt('') }}
        className="text-gray-400 hover:text-gray-600 shrink-0"><X size={13} /></button>
    </div>
  )

  const totalOT = calcTotal(oneTime)
  const totalMo = calcTotal(monthly)
  const totalYr = calcTotal(annual)

  return (
    <Section title="Budget">
      <div className="grid grid-cols-2 gap-5">
        {/* One-time */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">One-time fees</h4>
            <button onClick={() => setAdding('one_time')}
              className="inline-flex items-center gap-1 text-xs bg-primary-600 text-white px-2.5 py-1 rounded-lg hover:bg-primary-700">
              <Plus size={12} /> Add
            </button>
          </div>
          <div className="min-h-[2rem]">
            {oneTime.length === 0 && adding !== 'one_time' && <p className="text-xs text-gray-400 italic py-2">No one-time fees yet.</p>}
            {oneTime.map(i => <BudgetItemRow key={i.id} item={i} onUpdate={updateItem} onDelete={deleteItem} />)}
            {addRowJsx('one_time')}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-sm font-semibold text-gray-800">
            <span>Total one-time fee</span><span>{fmtUSD(totalOT)}</span>
          </div>
          {assetCount > 0 && <p className="text-xs text-gray-400 mt-0.5">{assetCount} assets linked</p>}
        </div>

        {/* Recurring */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">Recurring fees</h4>
            <div className="flex gap-1">
              <button onClick={() => setAdding('recurring_monthly')}
                className="inline-flex items-center gap-1 text-xs bg-primary-600 text-white px-2.5 py-1 rounded-lg hover:bg-primary-700">
                <Plus size={12} /> Monthly
              </button>
              <button onClick={() => setAdding('recurring_annual')}
                className="inline-flex items-center gap-1 text-xs bg-primary-600 text-white px-2.5 py-1 rounded-lg hover:bg-primary-700">
                <Plus size={12} /> Annual
              </button>
            </div>
          </div>
          <div className="min-h-[2rem]">
            {monthly.length === 0 && annual.length === 0 && adding !== 'recurring_monthly' && adding !== 'recurring_annual' && (
              <p className="text-xs text-gray-400 italic py-2">No recurring fees yet.</p>
            )}
            {[...monthly, ...annual].map(i => <BudgetItemRow key={i.id} item={i} onUpdate={updateItem} onDelete={deleteItem} />)}
            {addRowJsx(adding === 'recurring_monthly' ? 'recurring_monthly' : 'recurring_annual')}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
            <div className="flex justify-between text-sm text-gray-700"><span>Monthly fee</span><span className="font-medium">{fmtUSD(totalMo)}</span></div>
            <div className="flex justify-between text-sm text-gray-700"><span>Annual fee</span><span className="font-medium">{fmtUSD(totalYr)}</span></div>
          </div>
        </div>
      </div>
    </Section>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

// ─── Delete confirmation button ───────────────────────────────────────────────
function DeleteButton({ recId, onDeleted }) {
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function doDelete() {
    setDeleting(true)
    try {
      await api.delete(`/recommendations/${recId}`)
      onDeleted()
    } catch (e) {
      console.error(e)
      setDeleting(false)
      setConfirm(false)
    }
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-600 font-medium">Delete this record?</span>
        <button onClick={doDelete} disabled={deleting}
          className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
          {deleting ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button onClick={() => setConfirm(false)}
          className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button onClick={() => setConfirm(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors">
      <Trash2 size={13} /> Delete
    </button>
  )
}

export default function RecEditModal({ recId, onClose, onSaved }) {
  const [rec,     setRec]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [saved,   setSaved]   = useState(false)
  const [title,   setTitle]   = useState('')
  const [descr,   setDescr]   = useState('')
  const [execSum, setExecSum] = useState('')

  const titleTimer = useRef(null)
  const descrTimer = useRef(null)
  const execTimer  = useRef(null)
  const savedTimer = useRef(null)

  useEffect(() => {
    setLoading(true)
    api.get(`/recommendations/${recId}`)
      .then(r => {
        const d = r.data || r
        setRec(d)
        setTitle(d.title || '')
        setDescr(d.description || '')
        setExecSum(d.executive_summary || '')
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [recId])

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  function flashSaved() {
    setSaved(true)
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 2000)
  }

  async function patch(fields) {
    try {
      const r = await api.patch(`/recommendations/${recId}`, fields)
      if (r.data) setRec(prev => ({ ...prev, ...r.data }))
      flashSaved()
      onSaved && onSaved()
    } catch (e) { console.error(e) }
  }

  function setField(field, value) {
    setRec(r => ({ ...r, [field]: value }))
    patch({ [field]: value })
  }

  function debounced(setFn, field, timer, delay = 600) {
    return v => {
      setFn(v)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => patch({ [field]: v }), delay)
    }
  }

  const handleTitle  = debounced(setTitle,  'title',             titleTimer)
  const handleDescr  = debounced(setDescr,  'description',       descrTimer)
  const handleExec   = debounced(setExecSum,'executive_summary', execTimer)

  const isInitiative = (rec?.kind || 'recommendation') === 'initiative'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center sm:p-4 p-0">
        <div className="w-full sm:max-w-3xl bg-white sm:rounded-2xl rounded-none shadow-2xl sm:my-4 my-0 min-h-screen sm:min-h-0">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 rounded-t-2xl">
            <h2 className="text-base font-semibold text-gray-800">
              {isInitiative ? 'Initiative' : 'Recommendation'} Detail
            </h2>
            <div className="flex items-center gap-3">
              {saved && (
                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <Check size={12} /> Saved
                </span>
              )}
              <a href={`/recommendations/${recId}`} target="_blank" rel="noreferrer"
                className="text-gray-400 hover:text-primary-600 transition-colors" title="Open full page">
                <ExternalLink size={15} />
              </a>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-gray-400">
              <Loader2 size={22} className="animate-spin mr-2" /> Loading…
            </div>
          ) : rec && (
            <>
              {/* Meta bar */}
              <div className="flex items-center gap-4 flex-wrap px-6 py-3 bg-gray-50 border-b border-gray-100">
                {/* Record Type */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Type</span>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                    {[{ v: 'initiative', l: 'Initiative' }, { v: 'recommendation', l: 'Recommendation' }].map(opt => (
                      <button key={opt.v} onClick={() => setField('kind', opt.v)}
                        className={`px-2.5 py-1 font-medium transition-colors ${rec.kind === opt.v ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-px h-5 bg-gray-200 shrink-0" />

                {/* Status */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</span>
                  <select value={rec.status || 'draft'} onChange={e => setField('status', e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-400">
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                <div className="w-px h-5 bg-gray-200 shrink-0" />

                {/* Priority */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Priority</span>
                  <div className="flex gap-1">
                    {PRIORITY_CONFIG.map(p => (
                      <button key={p.value} title={p.title} onClick={() => setField('priority', p.value)}
                        className={`w-8 py-1 rounded text-xs font-bold transition-colors ${rec.priority === p.value ? p.active : p.inactive}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-px h-5 bg-gray-200 shrink-0" />

                {/* Schedule */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Schedule</span>
                  <select value={rec.schedule_year ? String(rec.schedule_year) : ''}
                    onChange={e => setField('schedule_year', e.target.value ? parseInt(e.target.value) : null)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-400">
                    <option value="">No Year</option>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <div className="flex gap-0.5">
                    {[null, 1, 2, 3, 4].map(q => (
                      <button key={q ?? 'ns'} onClick={() => setField('schedule_quarter', q)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          rec.schedule_quarter === q ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>
                        {q ? `Q${q}` : 'None'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category */}
                <div className="flex items-center gap-1.5 ml-auto">
                  <select value={rec.type || ''} onChange={e => setField('type', e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-400">
                    {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-5">

                {/* Title */}
                <div>
                  <input value={title} onChange={e => handleTitle(e.target.value)}
                    placeholder="Initiative or recommendation title…"
                    className="w-full text-lg font-semibold text-gray-900 bg-transparent border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 placeholder:text-gray-300"
                  />
                  {rec.client_name && <p className="text-xs text-gray-400 mt-1.5 ml-1">{rec.client_name}</p>}
                </div>

                {/* Executive Summary */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Executive Summary</label>
                  <textarea value={execSum} onChange={e => handleExec(e.target.value)}
                    placeholder="Write an executive summary for your client…"
                    rows={3}
                    className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-primary-400 placeholder:text-gray-300"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Description</label>
                  <textarea value={descr} onChange={e => handleDescr(e.target.value)}
                    placeholder="Internal notes and details…"
                    rows={3}
                    className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-primary-400 placeholder:text-gray-300"
                  />
                </div>

                {/* Action Items */}
                <ActionItemsSection recId={recId} initialItems={rec.action_items || []} />

                {/* PSA Ticket & Opportunity */}
                <TicketSection recId={recId} rec={rec} />

                {/* Goals */}
                <GoalsSection recId={recId} clientId={rec.client_id} />

                {/* Budget */}
                <BudgetSection recId={recId} initialItems={rec.budget_items || []} assetCount={(rec.assets || []).length} />

                {/* Assets */}
                <AssetsSection recId={recId} initialAssets={rec.assets || []} clientId={rec.client_id} />

              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                <DeleteButton recId={recId} onDeleted={() => { onClose(); onSaved?.() }} />
                <div className="flex items-center gap-3">
                  <p className="text-xs text-gray-400">Changes auto-save as you type</p>
                  <button onClick={onClose}
                    className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    Close
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        </div>
      </div>
    </>
  )
}
