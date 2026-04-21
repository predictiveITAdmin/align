import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, ChevronDown, ChevronRight, Plus, Trash2, Edit2, Scale,
  X, Save, AlertCircle, CheckCircle, Info, SlidersHorizontal, GripVertical
} from 'lucide-react'
import { api } from '../lib/api'

const COLOR_STYLES = {
  satisfactory:    { bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-500',  border: 'border-green-300' },
  needs_attention: { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500', border: 'border-yellow-300' },
  at_risk:         { bg: 'bg-red-100',    text: 'text-red-800',    dot: 'bg-red-500',    border: 'border-red-300' },
  not_applicable:  { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400',   border: 'border-gray-300' },
  acceptable_risk: { bg: 'bg-blue-100',   text: 'text-blue-800',   dot: 'bg-blue-500',   border: 'border-blue-300' },
}

const COLOR_OPTIONS = [
  { value: 'satisfactory',    label: 'Satisfactory' },
  { value: 'needs_attention', label: 'Needs Attention' },
  { value: 'at_risk',         label: 'At Risk' },
  { value: 'not_applicable',  label: 'Not Applicable' },
  { value: 'acceptable_risk', label: 'Acceptable Risk' },
]

function ResponsePill({ response }) {
  const s = COLOR_STYLES[response.color_code] || COLOR_STYLES.satisfactory
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text} border ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {response.label}
    </span>
  )
}

// Modal for editing an item
function ItemModal({ item, templateId, sectionId, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: item?.title || '',
    description: item?.description || '',
    item_type: item?.item_type || 'yes_no',
    weight: item?.weight || 0,
    scoring_instructions: item?.scoring_instructions || '',
    remediation_tips: item?.remediation_tips || '',
  })
  const [responses, setResponses] = useState(item?.responses || [])
  const [saving, setSaving] = useState(false)
  const [newRespLabel, setNewRespLabel] = useState('')
  const [newRespDesc, setNewRespDesc] = useState('')
  const [newRespColor, setNewRespColor] = useState('satisfactory')
  const [newRespAligned, setNewRespAligned] = useState(true)
  const descTimers = useRef({})

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      let saved
      if (item?.id) {
        const res = await api.patch(`/templates/${templateId}/items/${item.id}`, form)
        saved = res.data
      } else {
        const res = await api.post(`/templates/${templateId}/sections/${sectionId}/items`, form)
        saved = res.data
      }
      onSaved(saved)
    } catch (err) {
      console.error('Failed to save item:', err)
    } finally {
      setSaving(false)
    }
  }

  async function addResponse() {
    if (!newRespLabel.trim() || !item?.id) return
    try {
      const res = await api.post(`/templates/${templateId}/items/${item.id}/responses`, {
        label: newRespLabel.trim(), color_code: newRespColor, is_aligned: newRespAligned, description: newRespDesc.trim() || null
      })
      setResponses(prev => [...prev, res.data])
      setNewRespLabel('')
      setNewRespDesc('')
    } catch (err) { console.error(err) }
  }

  function updateRespDesc(respId, value) {
    setResponses(prev => prev.map(r => r.id === respId ? { ...r, description: value } : r))
    clearTimeout(descTimers.current[respId])
    descTimers.current[respId] = setTimeout(() => {
      api.patch(`/templates/${templateId}/responses/${respId}`, { description: value || null }).catch(console.error)
    }, 800)
  }

  async function deleteResponse(respId) {
    try {
      await api.delete(`/templates/${templateId}/responses/${respId}`)
      setResponses(prev => prev.filter(r => r.id !== respId))
    } catch (err) { console.error(err) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{item?.id ? 'Edit Item' : 'Add Item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question / Title <span className="text-red-500">*</span></label>
            <input
              autoFocus
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Response Type</label>
            <select
              value={form.item_type}
              onChange={e => setForm(f => ({ ...f, item_type: e.target.value }))}
              disabled={!!item?.id}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="yes_no">Yes / No</option>
              <option value="multi_response">Multi Response</option>
            </select>
            {!!item?.id && <p className="text-xs text-gray-400 mt-1">Response type cannot be changed after creation.</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Weight (%)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0" max="100" step="0.1"
                value={form.weight}
                onChange={e => setForm(f => ({ ...f, weight: parseFloat(e.target.value) || 0 }))}
                className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <span className="text-xs text-gray-400">Used for weighted scoring. All items in a section should total 100%.</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scoring Instructions</label>
            <textarea
              value={form.scoring_instructions}
              onChange={e => setForm(f => ({ ...f, scoring_instructions: e.target.value }))}
              rows={2}
              placeholder="How to evaluate this item..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remediation Tips</label>
            <textarea
              value={form.remediation_tips}
              onChange={e => setForm(f => ({ ...f, remediation_tips: e.target.value }))}
              rows={2}
              placeholder="What to recommend when this item is not aligned..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          {/* Responses section — only show for existing items */}
          {item?.id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Response Options</label>
              <div className="space-y-2 mb-3">
                {responses.map(r => {
                  const s = COLOR_STYLES[r.color_code] || COLOR_STYLES.satisfactory
                  return (
                    <div key={r.id} className={`rounded-lg border ${s.border} ${s.bg} overflow-hidden`}>
                      <div className="flex items-center gap-2 px-3 py-2">
                        <span className={`w-2 h-2 rounded-full ${s.dot} shrink-0`} />
                        <span className={`text-sm font-semibold ${s.text} shrink-0`}>{r.label}</span>
                        {r.is_aligned && <span className="text-[10px] text-green-600 font-medium shrink-0">(aligned)</span>}
                        <input
                          type="text"
                          value={r.description || ''}
                          onChange={e => updateRespDesc(r.id, e.target.value)}
                          placeholder="Describe what this response means..."
                          className="flex-1 min-w-0 px-2 py-0.5 text-xs bg-white/70 border border-transparent rounded focus:outline-none focus:border-gray-300 focus:bg-white transition-colors"
                        />
                        <button onClick={() => deleteResponse(r.id)} className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newRespLabel}
                    onChange={e => setNewRespLabel(e.target.value)}
                    placeholder="Response label..."
                    className="w-36 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <select
                    value={newRespColor}
                    onChange={e => setNewRespColor(e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {COLOR_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                    <input type="checkbox" checked={newRespAligned} onChange={e => setNewRespAligned(e.target.checked)} className="rounded" />
                    Aligned
                  </label>
                  <button
                    onClick={addResponse}
                    disabled={!newRespLabel.trim()}
                    className="p-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <input
                  type="text"
                  value={newRespDesc}
                  onChange={e => setNewRespDesc(e.target.value)}
                  placeholder="Description — what does this response mean? (optional)"
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
          <button
            onClick={save}
            disabled={!form.title.trim() || saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            <Save size={15} />
            {saving ? 'Saving...' : 'Save Item'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Weight editor modal
function WeightsModal({ template, onClose, onSaved }) {
  const [sections, setSections] = useState(
    (template.sections || []).map(s => ({
      ...s,
      weight: String(s.weight || 0),
      items: (s.items || []).map(i => ({ ...i, weight: String(i.weight || 0) }))
    }))
  )
  const [saving, setSaving] = useState(false)

  function setEqualSections() {
    const w = sections.length > 0 ? (100 / sections.length).toFixed(1) : '0'
    setSections(prev => prev.map(s => ({ ...s, weight: w })))
  }

  function setEqualItems(secIdx) {
    setSections(prev => prev.map((s, i) => {
      if (i !== secIdx) return s
      const w = s.items.length > 0 ? (100 / s.items.length).toFixed(1) : '0'
      return { ...s, items: s.items.map(item => ({ ...item, weight: w })) }
    }))
  }

  async function save() {
    setSaving(true)
    try {
      await api.put(`/templates/${template.id}/weights`, {
        sections: sections.map(s => ({
          id: s.id,
          weight: parseFloat(s.weight) || 0,
          items: s.items.map(i => ({ id: i.id, weight: parseFloat(i.weight) || 0 }))
        }))
      })
      onSaved(sections)
    } catch (err) {
      console.error('Failed to save weights:', err)
    } finally {
      setSaving(false)
    }
  }

  const totalSectionWeight = sections.reduce((sum, s) => sum + (parseFloat(s.weight) || 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Edit Weights</h2>
            <p className="text-xs text-gray-500 mt-0.5">Section weights should total 100%. Item weights within each section should total 100%.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Section weights */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Section Weights</h3>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium ${Math.abs(totalSectionWeight - 100) < 0.5 ? 'text-green-600' : 'text-orange-500'}`}>
                  Total: {totalSectionWeight.toFixed(1)}%
                </span>
                <button onClick={setEqualSections} className="text-xs text-primary-600 hover:underline">Set Equal</button>
              </div>
            </div>
            <div className="space-y-2">
              {sections.map((sec, si) => (
                <div key={sec.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="flex-1 text-sm text-gray-700 truncate">{sec.name}</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0" max="100" step="0.1"
                      value={sections[si].weight}
                      onChange={e => setSections(prev => prev.map((s, i) => i === si ? { ...s, weight: e.target.value } : s))}
                      className="w-20 px-2 py-1 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Item weights per section */}
          {sections.map((sec, si) => {
            const totalItemWeight = sec.items.reduce((sum, i) => sum + (parseFloat(i.weight) || 0), 0)
            return (
              <div key={sec.id}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">{sec.name} — Item Weights</h3>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${Math.abs(totalItemWeight - 100) < 0.5 ? 'text-green-600' : 'text-orange-500'}`}>
                      Total: {totalItemWeight.toFixed(1)}%
                    </span>
                    <button onClick={() => setEqualItems(si)} className="text-xs text-primary-600 hover:underline">Set Equal</button>
                  </div>
                </div>
                <div className="space-y-1">
                  {sec.items.map((item, ii) => (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-1.5">
                      <span className="flex-1 text-sm text-gray-600 truncate">{item.title}</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0" max="100" step="0.1"
                          value={sections[si].items[ii].weight}
                          onChange={e => setSections(prev => prev.map((s, sIdx) => {
                            if (sIdx !== si) return s
                            return { ...s, items: s.items.map((it, iIdx) => iIdx === ii ? { ...it, weight: e.target.value } : it) }
                          }))}
                          className="w-20 px-2 py-1 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            <Save size={15} />
            {saving ? 'Saving...' : 'Save Weights'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TemplateDetail() {
  const { id } = useParams()
  const [template, setTemplate] = useState(null)
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedSections, setExpandedSections] = useState({})
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState('')
  const [showWeights, setShowWeights] = useState(false)
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [activeSection, setActiveSection] = useState(null)
  const [addingSectionName, setAddingSectionName] = useState('')
  const [showAddSection, setShowAddSection] = useState(false)
  const titleRef = useRef(null)

  useEffect(() => {
    api.get(`/templates/${id}`).then(res => {
      setTemplate(res.data)
      setTitleVal(res.data.name)
      setSections(res.data.sections || [])
      // expand all sections by default
      const expanded = {}
      for (const s of res.data.sections || []) expanded[s.id] = true
      setExpandedSections(expanded)
    }).catch(console.error).finally(() => setLoading(false))
  }, [id])

  async function saveTitle() {
    if (!titleVal.trim() || titleVal === template.name) { setEditingTitle(false); return }
    try {
      await api.patch(`/templates/${id}`, { name: titleVal.trim() })
      setTemplate(t => ({ ...t, name: titleVal.trim() }))
    } catch (err) { console.error(err) }
    setEditingTitle(false)
  }

  async function addSection() {
    if (!addingSectionName.trim()) return
    try {
      const res = await api.post(`/templates/${id}/sections`, { name: addingSectionName.trim() })
      setSections(prev => [...prev, { ...res.data, items: [] }])
      setExpandedSections(prev => ({ ...prev, [res.data.id]: true }))
      setAddingSectionName('')
      setShowAddSection(false)
    } catch (err) { console.error(err) }
  }

  async function deleteSection(sectionId) {
    if (!confirm('Delete this section and all its items?')) return
    try {
      await api.delete(`/templates/${id}/sections/${sectionId}`)
      setSections(prev => prev.filter(s => s.id !== sectionId))
    } catch (err) { console.error(err) }
  }

  async function deleteItem(sectionId, itemId) {
    if (!confirm('Delete this item?')) return
    try {
      await api.delete(`/templates/${id}/items/${itemId}`)
      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, items: s.items.filter(i => i.id !== itemId) } : s))
    } catch (err) { console.error(err) }
  }

  function openAddItem(sectionId) {
    setEditingItem(null)
    setActiveSection(sectionId)
    setShowItemModal(true)
  }

  function openEditItem(item) {
    setEditingItem(item)
    setActiveSection(item.section_id)
    setShowItemModal(true)
  }

  function handleItemSaved(savedItem) {
    setSections(prev => prev.map(s => {
      if (s.id !== savedItem.section_id) return s
      const exists = s.items.some(i => i.id === savedItem.id)
      return {
        ...s,
        items: exists
          ? s.items.map(i => i.id === savedItem.id ? savedItem : i)
          : [...s.items, savedItem]
      }
    }))
    setShowItemModal(false)
  }

  function handleWeightsSaved(updatedSections) {
    setSections(prev => prev.map(s => {
      const updated = updatedSections.find(u => u.id === s.id)
      if (!updated) return s
      return {
        ...s,
        weight: parseFloat(updated.weight) || 0,
        items: s.items.map(item => {
          const updItem = updated.items.find(ui => ui.id === item.id)
          return updItem ? { ...item, weight: parseFloat(updItem.weight) || 0 } : item
        })
      }
    }))
    setShowWeights(false)
  }

  const toggleSection = (sectionId) => setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }))

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0)

  if (loading) return <div className="text-center py-20 text-gray-400">Loading template...</div>
  if (!template) return <div className="text-center py-20 text-gray-400">Template not found</div>

  return (
    <div>
      <Link to="/standards" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 mb-4 transition-colors">
        <ArrowLeft size={16} /> Back to Templates
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              ref={titleRef}
              autoFocus
              type="text"
              value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
              className="text-2xl font-bold text-gray-900 border-b-2 border-primary-500 outline-none bg-transparent w-full"
            />
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="text-2xl font-bold text-gray-900">{template.name}</h1>
              <button
                onClick={() => setEditingTitle(true)}
                className="p-1 text-gray-400 hover:text-primary-600 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Edit2 size={16} />
              </button>
            </div>
          )}
          {template.description && (
            <p className="text-sm text-gray-500 mt-1">{template.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{sections.length} sections · {totalItems} items</p>
        </div>
        <button
          onClick={() => setShowWeights(true)}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors shrink-0"
        >
          <SlidersHorizontal size={15} /> Edit Weights
        </button>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {sections.map(section => {
          const isOpen = expandedSections[section.id]
          return (
            <div key={section.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Section header */}
              <div
                className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleSection(section.id)}
              >
                <button className="text-gray-400">
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{section.name}</h3>
                  <p className="text-xs text-gray-400">{section.items.length} items · weight: {section.weight || 0}%</p>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => openAddItem(section.id)}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                  >
                    <Plus size={13} /> Add Item
                  </button>
                  <button
                    onClick={() => deleteSection(section.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Section items */}
              {isOpen && (
                <div className="border-t border-gray-100 divide-y divide-gray-50">
                  {section.items.length === 0 ? (
                    <div className="px-5 py-6 text-center text-sm text-gray-400">
                      No items yet.{' '}
                      <button onClick={() => openAddItem(section.id)} className="text-primary-600 hover:underline">Add the first item</button>
                    </div>
                  ) : (
                    section.items.map(item => (
                      <div key={item.id} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-gray-900 leading-snug">{item.title}</p>
                              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                item.item_type === 'yes_no' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                              }`}>
                                {item.item_type === 'yes_no' ? 'Yes/No' : 'Multi'}
                              </span>
                              {item.weight > 0 && (
                                <span className="shrink-0 text-[10px] text-gray-400">{item.weight}%</span>
                              )}
                            </div>
                            {item.responses && item.responses.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {item.responses.map(r => <ResponsePill key={r.id} response={r} />)}
                              </div>
                            )}
                            {item.remediation_tips && (
                              <p className="text-xs text-gray-400 mt-1 flex items-start gap-1">
                                <Info size={11} className="mt-0.5 shrink-0" />
                                <span className="line-clamp-1">{item.remediation_tips}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => openEditItem({ ...item, section_id: section.id })}
                              className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => deleteItem(section.id, item.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Add Section */}
        {showAddSection ? (
          <div className="bg-white border border-primary-200 rounded-xl p-4 flex items-center gap-3">
            <input
              autoFocus
              type="text"
              value={addingSectionName}
              onChange={e => setAddingSectionName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') setShowAddSection(false) }}
              placeholder="Section name..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              onClick={addSection}
              disabled={!addingSectionName.trim()}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
            <button onClick={() => setShowAddSection(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddSection(true)}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-all"
          >
            <Plus size={16} /> Add Section
          </button>
        )}
      </div>

      {/* Modals */}
      {showItemModal && (
        <ItemModal
          item={editingItem}
          templateId={id}
          sectionId={activeSection}
          onClose={() => setShowItemModal(false)}
          onSaved={handleItemSaved}
        />
      )}

      {showWeights && (
        <WeightsModal
          template={{ id, sections }}
          onClose={() => setShowWeights(false)}
          onSaved={handleWeightsSaved}
        />
      )}
    </div>
  )
}
