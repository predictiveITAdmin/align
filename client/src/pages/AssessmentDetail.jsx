import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle, ChevronDown, ChevronRight, MessageSquare,
  AlertTriangle, LayoutTemplate, Plus, Ticket, FileText, X, BookOpen,
  Lightbulb, ClipboardList, Eye, ChevronsUpDown, GitCompare, Rows3, AlignJustify,
  ShieldCheck, Clock
} from 'lucide-react'
import { AlignmentScore } from '../components/AlignmentBadge'
import RecEditModal from '../components/RecEditModal'
import { api } from '../lib/api'

const COLOR_HEX = {
  satisfactory:    '#22c55e',
  needs_attention: '#f59e0b',
  at_risk:         '#ef4444',
  not_applicable:  '#9ca3af',
  acceptable_risk: '#3b82f6',
}
const COLOR_STYLES = {
  satisfactory:    { pill: 'bg-green-500 text-white', light: 'bg-green-50 text-green-800 border-green-200', hover: 'hover:bg-green-50 hover:border-green-300 hover:text-green-700', ring: 'ring-green-400' },
  needs_attention: { pill: 'bg-amber-500 text-white', light: 'bg-amber-50 text-amber-800 border-amber-200', hover: 'hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700', ring: 'ring-amber-400' },
  at_risk:         { pill: 'bg-red-500 text-white',   light: 'bg-red-50 text-red-800 border-red-200',       hover: 'hover:bg-red-50 hover:border-red-300 hover:text-red-700',   ring: 'ring-red-400' },
  not_applicable:  { pill: 'bg-gray-400 text-white',  light: 'bg-gray-50 text-gray-600 border-gray-200',    hover: 'hover:bg-gray-50 hover:border-gray-300 hover:text-gray-600', ring: 'ring-gray-300' },
  acceptable_risk: { pill: 'bg-blue-500 text-white',  light: 'bg-blue-50 text-blue-800 border-blue-200',    hover: 'hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700', ring: 'ring-blue-400' },
}

async function createRecFromAssessmentItem(item, assessmentId, clientId, isStandardsBased) {
  if (isStandardsBased) {
    const rec = await api.post('/recommendations', {
      client_id: clientId,
      title: item.standard_name || item.title,
      kind: 'recommendation',
      status: 'draft',
      priority: item.priority || 'medium',
      type: 'remediation',
    })
    return rec.data
  }
  const answerRes = await api.put(`/assessments/${assessmentId}/answers/${item.id}`, {
    response_id: item.selected_response_id || undefined,
    internal_notes: item.internal_notes || undefined,
    public_notes: item.public_notes || undefined,
  })
  const answerId = answerRes.data?.id
  const rec = await api.post('/recommendations', {
    client_id: clientId,
    assessment_answer_id: answerId || undefined,
    title: item.title,
    kind: 'recommendation',
    status: 'draft',
    priority: 'medium',
    type: 'remediation',
  })
  return rec.data
}

// ── Template Item Row ─────────────────────────────────────────────────────────
function TemplateItemRow({ item, assessmentId, clientId, onAnswered, viewMode, displayMode, itemsCollapsed, comparisonAnswer }) {
  const [showNotes,     setShowNotes]     = useState(false)
  const [creatingRec,   setCreatingRec]   = useState(false)
  const [newRecId,      setNewRecId]      = useState(null)
  const [internalNotes, setInternalNotes] = useState(item.internal_notes || '')
  const [publicNotes,   setPublicNotes]   = useState(item.public_notes || '')
  const [vcioNotes,     setVcioNotes]     = useState(item.vcio_notes || '')
  const [saving,        setSaving]        = useState(false)
  const [selectedId,    setSelectedId]    = useState(item.selected_response_id || null)
  const [selectedColor, setSelectedColor] = useState(item.selected_color || null)
  const [selectedLabel, setSelectedLabel] = useState(item.selected_label || null)
  const [linkedRecs,    setLinkedRecs]    = useState(item.recommendations || [])
  const [hoveredRespId, setHoveredRespId] = useState(null)
  const notesSaveTimer = useRef(null)

  async function handleAddRec() {
    if (creatingRec) return
    setCreatingRec(true)
    try {
      const itemWithNotes = { ...item, selected_response_id: selectedId, internal_notes: internalNotes, public_notes: publicNotes }
      const rec = await createRecFromAssessmentItem(itemWithNotes, assessmentId, clientId, false)
      setNewRecId(rec.id)
      setLinkedRecs(prev => [...prev, rec])
    } catch (err) { console.error('Failed to create rec:', err) } finally { setCreatingRec(false) }
  }

  async function selectResponse(response) {
    if (saving) return
    setSaving(true)
    setSelectedId(response.id)
    setSelectedColor(response.color_code)
    setSelectedLabel(response.label)
    try {
      await api.put(`/assessments/${assessmentId}/answers/${item.id}`, {
        response_id: response.id,
        internal_notes: internalNotes || null,
        public_notes: publicNotes || null,
        vcio_notes: vcioNotes || null,
      })
      onAnswered(item.id, response)
    } catch (err) { console.error(err) } finally { setSaving(false) }
  }

  function saveNotes() {
    if (!selectedId) return
    api.put(`/assessments/${assessmentId}/answers/${item.id}`, {
      response_id: selectedId,
      internal_notes: internalNotes || null,
      public_notes: publicNotes || null,
      vcio_notes: vcioNotes || null,
    }).catch(console.error)
  }

  function handleChange(field, value) {
    if (field === 'internal') setInternalNotes(value)
    else if (field === 'public') setPublicNotes(value)
    else setVcioNotes(value)
    clearTimeout(notesSaveTimer.current)
    notesSaveTimer.current = setTimeout(saveNotes, 1200)
  }

  const s = selectedColor ? COLOR_STYLES[selectedColor] : null
  const borderColor = selectedColor ? COLOR_HEX[selectedColor] : 'transparent'
  const isVcioView = viewMode === 'vcio'
  const isFull = displayMode === 'full'
  const cmpStyle = comparisonAnswer ? COLOR_STYLES[comparisonAnswer.color_code] : null

  return (
    <div className="bg-white px-5 py-3.5 transition-colors" style={{ borderLeft: `3px solid ${borderColor}` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-snug">{item.title}</p>
          {item.description && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}

          {!isVcioView && !itemsCollapsed && (
            <>
              {isFull ? (
                <div className="mt-2.5 space-y-1">
                  {(item.responses || []).map(resp => {
                    const rs = COLOR_STYLES[resp.color_code] || COLOR_STYLES.satisfactory
                    const isSel = selectedId === resp.id
                    return (
                      <div key={resp.id}
                        onClick={() => !saving && selectResponse(resp)}
                        className={`flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors
                          ${isSel ? `${rs.light} border` : 'hover:bg-gray-50 border border-transparent'}`}>
                        <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center
                          ${isSel ? 'border-current' : 'border-gray-300'}`}>
                          {isSel && <div className="w-2 h-2 rounded-full bg-current" />}
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${rs.pill}`}>{resp.label}</span>
                        {resp.description && <span className="text-xs text-gray-600 leading-relaxed">{resp.description}</span>}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(item.responses || []).map(resp => {
                      const rs = COLOR_STYLES[resp.color_code] || COLOR_STYLES.satisfactory
                      const isSel = selectedId === resp.id
                      return (
                        <button key={resp.id}
                          onClick={() => selectResponse(resp)} disabled={saving}
                          onMouseEnter={() => setHoveredRespId(resp.id)}
                          onMouseLeave={() => setHoveredRespId(null)}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all
                            ${isSel ? `${rs.pill} border-transparent ring-2 ${rs.ring} ring-offset-1` : `bg-white border-gray-200 text-gray-500 ${rs.hover}`}
                            ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white/60' : 'bg-current'}`} />
                          {resp.label}
                        </button>
                      )
                    })}
                  </div>
                  {hoveredRespId && (() => {
                    const hovered = (item.responses || []).find(r => r.id === hoveredRespId)
                    const hs = hovered ? COLOR_STYLES[hovered.color_code] : null
                    return hovered?.description ? (
                      <p className={`mt-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${hs?.light || 'bg-gray-50 border-gray-100 text-gray-600'}`}>
                        {hovered.description}
                      </p>
                    ) : null
                  })()}
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
          {comparisonAnswer && (
            <span title={`Previous: ${comparisonAnswer.label}`}
              className={`text-xs px-2 py-0.5 rounded-full border opacity-60 ${cmpStyle?.light}`}>
              ↩ {comparisonAnswer.label}
            </span>
          )}
          {selectedId && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${s?.light}`}>{selectedLabel}</span>
          )}
          <button onClick={() => setShowNotes(v => !v)} title="Notes & Details"
            className={`p-1.5 rounded-lg transition-colors ${showNotes ? 'text-primary-600 bg-primary-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
            <MessageSquare size={14} />
          </button>
          <button onClick={handleAddRec} disabled={creatingRec} title="Add Recommendation"
            className={`p-1.5 rounded-lg transition-colors ${creatingRec ? 'text-blue-600 bg-blue-50 opacity-60' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
            <ClipboardList size={14} />
          </button>
        </div>
      </div>

      {showNotes && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
          {item.scoring_instructions && (
            <div className="flex gap-2 p-2.5 bg-violet-50 border border-violet-100 rounded-lg">
              <BookOpen size={13} className="text-violet-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-violet-700 mb-0.5">Scoring Instructions</p>
                <p className="text-xs text-violet-600">{item.scoring_instructions}</p>
              </div>
            </div>
          )}
          {item.remediation_tips && (
            <div className="flex gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg">
              <Lightbulb size={13} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-700 mb-0.5">Remediation Tips</p>
                <p className="text-xs text-amber-600">{item.remediation_tips}</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Internal Notes</label>
              <textarea value={internalNotes} onChange={e => handleChange('internal', e.target.value)}
                placeholder="Visible to your team only..." rows={3}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-400 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Client-Facing Notes</label>
              <textarea value={publicNotes} onChange={e => handleChange('public', e.target.value)}
                placeholder="Visible on the client report..." rows={3}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-400 resize-none" />
            </div>
          </div>
          {isVcioView && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">vCIO Business Analysis</label>
              <textarea value={vcioNotes} onChange={e => handleChange('vcio', e.target.value)}
                placeholder="Business context, impact, strategic notes for the executive summary..."
                rows={4} className="w-full px-2.5 py-1.5 border border-primary-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-400 resize-none bg-primary-50/30" />
            </div>
          )}
        </div>
      )}

      {newRecId && (
        <RecEditModal recId={newRecId} onClose={() => setNewRecId(null)} onSaved={() => {}} />
      )}

      {linkedRecs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {linkedRecs.map(r => (
            <button key={r.id} onClick={() => setNewRecId(r.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-full hover:bg-blue-100 transition-colors">
              <ClipboardList size={10} /> {r.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Standards-Based Item Row ─────────────────────────────────────────────────
function StandardsItemRow({ item, assessmentId, clientId, onAnswered, displayMode, comparisonAnswer }) {
  const [showNotes,     setShowNotes]     = useState(false)
  const [showDetail,    setShowDetail]    = useState(false)
  const [creatingRec,   setCreatingRec]   = useState(false)
  const [newRecId,      setNewRecId]      = useState(null)
  const [internalNotes, setInternalNotes] = useState(item.internal_notes || '')
  const [publicNotes,   setPublicNotes]   = useState(item.public_notes || '')
  const [saving,        setSaving]        = useState(false)
  const [selectedId,    setSelectedId]    = useState(item.response_id || null)
  const [selectedLevel, setSelectedLevel] = useState(item.selected_level || null)
  const [selectedLabel, setSelectedLabel] = useState(item.selected_label || null)
  const [hoveredRespId, setHoveredRespId] = useState(null)
  const notesSaveTimer = useRef(null)

  async function selectResponse(response) {
    if (saving) return
    setSaving(true)
    setSelectedId(response.id)
    setSelectedLevel(response.level)
    setSelectedLabel(response.label)
    try {
      await api.put(`/assessments/${assessmentId}/items/${item.id}`, {
        response_id: response.id,
        internal_notes: internalNotes || null,
        public_notes: publicNotes || null,
      })
      onAnswered(item.id, response)
    } catch (err) { console.error(err) } finally { setSaving(false) }
  }

  function saveNotes() {
    api.put(`/assessments/${assessmentId}/items/${item.id}`, {
      response_id: selectedId || undefined,
      internal_notes: internalNotes || null,
      public_notes: publicNotes || null,
    }).catch(console.error)
  }

  function handleChange(field, value) {
    if (field === 'internal') setInternalNotes(value)
    else setPublicNotes(value)
    clearTimeout(notesSaveTimer.current)
    notesSaveTimer.current = setTimeout(saveNotes, 1200)
  }

  async function handleAddRec() {
    if (creatingRec) return
    setCreatingRec(true)
    try {
      const rec = await createRecFromAssessmentItem(item, assessmentId, clientId, true)
      setNewRecId(rec.id)
    } catch (err) { console.error(err) } finally { setCreatingRec(false) }
  }

  const borderColor = selectedLevel ? COLOR_HEX[selectedLevel] || 'transparent' : 'transparent'
  const s = selectedLevel ? COLOR_STYLES[selectedLevel] : null
  const cmpStyle = comparisonAnswer ? COLOR_STYLES[comparisonAnswer.level] : null
  const isFull = displayMode === 'full'

  return (
    <div className="bg-white px-5 py-3.5 transition-colors" style={{ borderLeft: `3px solid ${borderColor}` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
              item.priority === 'high' ? 'bg-red-100 text-red-700'
              : item.priority === 'medium' ? 'bg-amber-100 text-amber-700'
              : 'bg-gray-100 text-gray-600'
            }`}>{item.priority?.[0]?.toUpperCase()}</span>
            {item.level_tier && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                item.level_tier === 'level_1' ? 'bg-sky-100 text-sky-700' : 'bg-indigo-100 text-indigo-700'
              }`}>{item.level_tier === 'level_1' ? 'L1' : 'L2'}</span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              item.delivery_method === 'automated' ? 'bg-emerald-100 text-emerald-700'
              : item.delivery_method === 'remote_human' ? 'bg-blue-100 text-blue-700'
              : 'bg-orange-100 text-orange-700'
            }`}>{item.delivery_method === 'automated' ? 'Auto' : item.delivery_method === 'remote_human' ? 'Remote' : 'Onsite'}</span>
          </div>
          <button onClick={() => setShowDetail(v => !v)} className="text-left group">
            <p className="text-sm font-medium text-gray-900 leading-snug group-hover:text-primary-600">{item.standard_name}</p>
          </button>
          {item.standard_description && !showDetail && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.standard_description}</p>
          )}

          {showDetail && (
            <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
              {item.standard_description && <p className="text-xs text-gray-600">{item.standard_description}</p>}
              {item.question_text && (
                <div><p className="text-xs font-semibold text-gray-500">Question</p><p className="text-xs text-gray-700">{item.question_text}</p></div>
              )}
              {item.business_impact && (
                <div><p className="text-xs font-semibold text-gray-500">Business Impact</p><p className="text-xs text-gray-700">{item.business_impact}</p></div>
              )}
              {item.technical_rationale && (
                <div><p className="text-xs font-semibold text-gray-500">Technical Rationale</p><p className="text-xs text-gray-700">{item.technical_rationale}</p></div>
              )}
            </div>
          )}

          {/* Response buttons */}
          {isFull ? (
            <div className="mt-2.5 space-y-1">
              {(item.responses || []).map(resp => {
                const rs = COLOR_STYLES[resp.level] || COLOR_STYLES.satisfactory
                const isSel = selectedId === resp.id
                return (
                  <div key={resp.id}
                    onClick={() => !saving && selectResponse(resp)}
                    className={`flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors
                      ${isSel ? `${rs.light} border` : 'hover:bg-gray-50 border border-transparent'}`}>
                    <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center
                      ${isSel ? 'border-current' : 'border-gray-300'}`}>
                      {isSel && <div className="w-2 h-2 rounded-full bg-current" />}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${rs.pill}`}>{resp.label}</span>
                    {resp.description && <span className="text-xs text-gray-600 leading-relaxed">{resp.description}</span>}
                  </div>
                )
              })}
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(item.responses || []).map(resp => {
                  const rs = COLOR_STYLES[resp.level] || COLOR_STYLES.satisfactory
                  const isSel = selectedId === resp.id
                  return (
                    <button key={resp.id}
                      onClick={() => selectResponse(resp)} disabled={saving}
                      onMouseEnter={() => setHoveredRespId(resp.id)}
                      onMouseLeave={() => setHoveredRespId(null)}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all
                        ${isSel ? `${rs.pill} border-transparent ring-2 ${rs.ring} ring-offset-1` : `bg-white border-gray-200 text-gray-500 ${rs.hover}`}
                        ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white/60' : 'bg-current'}`} />
                      {resp.label}
                    </button>
                  )
                })}
              </div>
              {hoveredRespId && (() => {
                const hovered = (item.responses || []).find(r => r.id === hoveredRespId)
                const hs = hovered ? COLOR_STYLES[hovered.level] : null
                return hovered?.description ? (
                  <p className={`mt-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${hs?.light || 'bg-gray-50 border-gray-100 text-gray-600'}`}>
                    {hovered.description}
                  </p>
                ) : null
              })()}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
          {/* Inherited answer badge - shows when this response was carried from a prior assessment */}
          {item.inherited_from_id && selectedId && (
            <span title={`Answer inherited from: ${item.inherited_from_name}`}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
              ↩ Inherited
            </span>
          )}
          {comparisonAnswer && (
            <span title={`Previous: ${comparisonAnswer.label}`}
              className={`text-xs px-2 py-0.5 rounded-full border opacity-60 ${cmpStyle?.light}`}>
              ↩ {comparisonAnswer.label}
            </span>
          )}
          {selectedId && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${s?.light}`}>{selectedLabel}</span>
          )}
          <button onClick={() => setShowNotes(v => !v)} title="Notes"
            className={`p-1.5 rounded-lg transition-colors ${showNotes ? 'text-primary-600 bg-primary-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
            <MessageSquare size={14} />
          </button>
          <button onClick={handleAddRec} disabled={creatingRec} title="Add Recommendation"
            className={`p-1.5 rounded-lg transition-colors ${creatingRec ? 'text-blue-600 bg-blue-50 opacity-60' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
            <ClipboardList size={14} />
          </button>
        </div>
      </div>

      {/* Framework cross-reference badges */}
      {item.framework_tags && item.framework_tags.length > 0 && (
        <div className="ml-0 mt-1.5 flex flex-wrap gap-1">
          {item.framework_tags.map((tag, idx) => (
            <span key={idx} title={tag.framework_reference || tag.framework}
              className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200">
              <ShieldCheck size={9} /> {tag.framework}
              {tag.framework_reference && tag.framework_reference.length < 30 && (
                <span className="text-gray-400">· {tag.framework_reference}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Evidence examples - shown in expanded detail */}
      {showDetail && item.evidence_examples && item.evidence_examples.length > 0 && (
        <div className="mt-2 ml-8 p-3 bg-amber-50 border border-amber-100 rounded-lg">
          <p className="text-xs font-semibold text-amber-700 mb-1">Example Evidence</p>
          <ul className="text-xs text-amber-800 space-y-0.5">
            {item.evidence_examples.map((ev, idx) => <li key={idx}>• {ev}</li>)}
          </ul>
        </div>
      )}

      {showNotes && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          {item.inherited_from_id && (
            <div className="mb-3 p-2 bg-violet-50 border border-violet-100 rounded-lg text-xs text-violet-700">
              <strong>Inherited answer</strong> — this response was carried from <em>{item.inherited_from_name}</em>.
              Select a new response to override for this assessment.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Internal Notes</label>
              <textarea value={internalNotes} onChange={e => handleChange('internal', e.target.value)}
                placeholder="Visible to your team only..." rows={3}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-400 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Client-Facing Notes</label>
              <textarea value={publicNotes} onChange={e => handleChange('public', e.target.value)}
                placeholder="Visible on the client report..." rows={3}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-400 resize-none" />
            </div>
          </div>
        </div>
      )}

      {newRecId && <RecEditModal recId={newRecId} onClose={() => setNewRecId(null)} onSaved={() => {}} />}
    </div>
  )
}

// ── Main Assessment Detail ────────────────────────────────────────────────────
export default function AssessmentDetail() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const fromClient = searchParams.get('from_client')
  const [assessment,        setAssessment]        = useState(null)
  const [sections,          setSections]          = useState([])
  const [domains,           setDomains]           = useState([])
  const [loading,           setLoading]           = useState(true)
  const [completing,        setCompleting]        = useState(false)
  const [expandedSections,  setExpandedSections]  = useState({})
  const [answeredItems,     setAnsweredItems]      = useState({})
  const [activeTab,         setActiveTab]         = useState('assessment')
  const [displayMode,       setDisplayMode]       = useState('compact')
  const [itemsCollapsed,    setItemsCollapsed]    = useState(false)
  const [showComparison,    setShowComparison]    = useState(false)
  const [comparisonAnswers, setComparisonAnswers] = useState({})
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [prevAssessment,    setPrevAssessment]    = useState(null)

  useEffect(() => {
    api.get(`/assessments/${id}`).then(res => {
      const data = res.data
      setAssessment(data)
      if (data.sections) {
        // Template-based
        setSections(data.sections)
        const expanded = {}
        const answered = {}
        for (const s of data.sections) {
          expanded[s.id] = true
          for (const item of s.items || []) {
            if (item.selected_response_id) {
              answered[item.id] = { color_code: item.selected_color, label: item.selected_label, is_aligned: item.selected_is_aligned }
            }
          }
        }
        setExpandedSections(expanded)
        setAnsweredItems(answered)
      } else if (data.domains) {
        // Standards-based with hierarchy
        setDomains(data.domains)
        const expanded = {}
        const answered = {}
        for (const dom of data.domains) {
          expanded[dom.domain_id || 'uncategorized'] = true
          for (const cat of dom.categories || []) {
            for (const item of cat.items || []) {
              if (item.response_id) {
                answered[item.id] = { level: item.selected_level, label: item.selected_label, is_aligned: item.selected_is_aligned }
              }
            }
          }
        }
        setExpandedSections(expanded)
        setAnsweredItems(answered)
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!showComparison || Object.keys(comparisonAnswers).length > 0) return
    setComparisonLoading(true)
    api.get(`/assessments/${id}/comparison`)
      .then(res => {
        setComparisonAnswers(res.data?.data || {})
        setPrevAssessment(res.data?.previous_assessment || null)
      })
      .catch(console.error)
      .finally(() => setComparisonLoading(false))
  }, [showComparison, id])

  const handleAnswered = useCallback((itemId, response) => {
    setAnsweredItems(prev => ({ ...prev, [itemId]: { ...response } }))
  }, [])

  async function completeAssessment() {
    setCompleting(true)
    try {
      const res = await api.post(`/assessments/${id}/complete`)
      setAssessment(res.data)
    } catch (err) { console.error(err) } finally { setCompleting(false) }
  }

  // Compute totals
  const isTemplate = !!assessment?.template_id
  const isStandards = !isTemplate && domains.length > 0

  let totalItems = 0
  let answeredCount = Object.keys(answeredItems).length
  if (isTemplate) {
    totalItems = sections.reduce((sum, s) => sum + (s.items?.length || 0), 0)
  } else if (isStandards) {
    for (const dom of domains) {
      for (const cat of dom.categories || []) {
        totalItems += (cat.items?.length || 0)
      }
    }
  }
  const progressPct = totalItems > 0 ? Math.round((answeredCount / totalItems) * 100) : 0
  const misalignedCount = Object.values(answeredItems).filter(a => a.is_aligned === false).length

  function collapseAll() {
    const collapsed = {}
    if (isTemplate) sections.forEach(s => { collapsed[s.id] = false })
    else domains.forEach(d => { collapsed[d.domain_id || 'uncategorized'] = false })
    setExpandedSections(collapsed)
  }
  function expandAll() {
    const expanded = {}
    if (isTemplate) sections.forEach(s => { expanded[s.id] = true })
    else domains.forEach(d => { expanded[d.domain_id || 'uncategorized'] = true })
    setExpandedSections(expanded)
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading assessment...</div>
  if (!assessment) return <div className="text-center py-20 text-gray-400">Assessment not found</div>

  const typeLabels = {
    onboarding_phase1: 'Onboarding Phase 1',
    onboarding_phase2: 'Onboarding Phase 2',
    recurring_review: 'Recurring Review',
    ad_hoc: 'Full Assessment',
  }

  return (
    <div>
      <Link to={fromClient ? `/clients/${fromClient}?tab=assessments` : '/assessments'}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 mb-4 transition-colors">
        <ArrowLeft size={16} /> {fromClient ? 'Back to Client' : 'Back to Assessments'}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{assessment.name || 'Assessment'}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
            <span>{assessment.client_name}</span>
            {assessment.template_name && (
              <><span className="text-gray-300">·</span>
              <span className="inline-flex items-center gap-1"><LayoutTemplate size={13} />{assessment.template_name}</span></>
            )}
            {!isTemplate && assessment.assessment_type && (
              <><span className="text-gray-300">·</span>
              <span className="inline-flex items-center gap-1"><ShieldCheck size={13} />{typeLabels[assessment.assessment_type] || assessment.assessment_type}</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Score</p>
            <AlignmentScore score={assessment.overall_score} size="lg" />
          </div>
          {assessment.status !== 'completed' && (
            <button onClick={completeAssessment} disabled={completing}
              className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors disabled:opacity-50">
              <CheckCircle size={16} /> {completing ? 'Completing...' : 'Complete Assessment'}
            </button>
          )}
          {assessment.status === 'completed' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-green-50 text-green-700 border border-green-200">
              <CheckCircle size={15} /> Completed
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">{answeredCount} of {totalItems} answered</span>
            {misalignedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                <AlertTriangle size={13} /> {misalignedCount} not aligned
              </span>
            )}
          </div>
          <span className="text-sm font-semibold text-gray-900">{progressPct}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button onClick={collapseAll}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <ChevronsUpDown size={13} /> Collapse all
          </button>
          <button onClick={expandAll}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <Rows3 size={13} /> Expand all
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowComparison(v => !v)}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors
              ${showComparison ? 'bg-violet-600 text-white border-violet-600' : 'text-gray-500 hover:text-gray-800 border-gray-200 hover:bg-gray-50'}`}>
            <GitCompare size={13} />
            {comparisonLoading ? 'Loading...' : 'Comparison'}
          </button>
          {showComparison && prevAssessment && (
            <span className="text-xs text-gray-400">
              vs. {new Date(prevAssessment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setDisplayMode('compact')}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 transition-colors
                ${displayMode === 'compact' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              <Rows3 size={12} /> Compact
            </button>
            <button onClick={() => setDisplayMode('full')}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 border-l border-gray-200 transition-colors
                ${displayMode === 'full' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              <AlignJustify size={12} /> Full
            </button>
          </div>
        </div>
      </div>

      {/* Tabs for template mode */}
      {isTemplate && (
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
          <button onClick={() => setActiveTab('assessment')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'assessment' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <ClipboardList size={14} /> Assessment
          </button>
          <button onClick={() => setActiveTab('vcio')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'vcio' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Eye size={14} /> vCIO Analysis
            {misalignedCount > 0 && <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">{misalignedCount}</span>}
          </button>
        </div>
      )}

      {/* ── Template Assessment Tab ─────────────────────────────────────── */}
      {isTemplate && activeTab === 'assessment' && (
        <div className="space-y-3">
          {sections.map(section => {
            const sectionAnswered = section.items.filter(i => answeredItems[i.id]).length
            const isOpen = expandedSections[section.id]
            return (
              <div key={section.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 cursor-pointer bg-gray-100 hover:bg-gray-200/70 transition-colors"
                  onClick={() => setExpandedSections(p => ({ ...p, [section.id]: !p[section.id] }))}>
                  <span className="text-gray-500">{isOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 text-sm">{section.name}</h3>
                    {section.description && <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{sectionAnswered}/{section.items.length} answered{section.weight > 0 ? ` · ${section.weight}% weight` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sectionAnswered === section.items.length && section.items.length > 0 && (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle size={12} /> Done</span>
                    )}
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: section.items.length > 0 ? `${(sectionAnswered / section.items.length) * 100}%` : '0%' }} />
                    </div>
                  </div>
                </div>
                {isOpen && (
                  <div className="divide-y divide-gray-100">
                    {section.items.length === 0
                      ? <p className="px-5 py-4 text-sm text-gray-400 text-center">No items in this section.</p>
                      : section.items.map(item => (
                          <TemplateItemRow key={item.id} item={item} assessmentId={id}
                            clientId={assessment.client_id} onAnswered={handleAnswered}
                            viewMode="assessment" displayMode={displayMode}
                            itemsCollapsed={itemsCollapsed}
                            comparisonAnswer={showComparison ? (comparisonAnswers[item.id] || null) : null}
                          />
                        ))
                    }
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Template vCIO Tab ───────────────────────────────────────────── */}
      {isTemplate && activeTab === 'vcio' && (() => {
        const misalignedSections = sections.map(s => ({
          ...s,
          items: s.items.filter(i => answeredItems[i.id]?.is_aligned === false),
        })).filter(s => s.items.length > 0)
        return misalignedSections.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
            <CheckCircle size={40} className="mx-auto mb-3 text-green-400" />
            <p className="text-base font-medium text-gray-600">No misaligned items yet</p>
            <p className="text-sm text-gray-400 mt-1">Complete the assessment to see items needing attention here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-1">
              <p className="text-sm text-amber-800">
                <span className="font-semibold">vCIO Business Analysis</span> — {misalignedCount} misaligned items to review.
              </p>
            </div>
            {misalignedSections.map(section => (
              <div key={section.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 bg-gray-100 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800 text-sm">{section.name}</h3>
                  <span className="text-xs text-red-500 font-medium">{section.items.length} not aligned</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {section.items.map(item => (
                    <TemplateItemRow key={item.id} item={item} assessmentId={id}
                      clientId={assessment.client_id} onAnswered={handleAnswered}
                      viewMode="vcio" displayMode={displayMode} itemsCollapsed={itemsCollapsed}
                      comparisonAnswer={showComparison ? (comparisonAnswers[item.id] || null) : null}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── Standards-Based Assessment ─────────────────────────────────── */}
      {isStandards && (
        <div className="space-y-3">
          {domains.map(domain => {
            const domKey = domain.domain_id || 'uncategorized'
            const isOpen = expandedSections[domKey]
            let domTotal = 0, domAnswered = 0
            for (const cat of domain.categories || []) {
              for (const item of cat.items || []) {
                domTotal++
                if (answeredItems[item.id]) domAnswered++
              }
            }
            return (
              <div key={domKey} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 cursor-pointer bg-gray-100 hover:bg-gray-200/70 transition-colors"
                  onClick={() => setExpandedSections(p => ({ ...p, [domKey]: !p[domKey] }))}>
                  <span className="text-gray-500">{isOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 text-sm">{domain.domain_name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {domAnswered}/{domTotal} answered · {domain.categories?.length || 0} categories
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {domAnswered === domTotal && domTotal > 0 && (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle size={12} /> Done</span>
                    )}
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: domTotal > 0 ? `${(domAnswered / domTotal) * 100}%` : '0%' }} />
                    </div>
                  </div>
                </div>

                {isOpen && (domain.categories || []).map(cat => (
                  <div key={cat.category_id}>
                    <div className="px-5 py-2 bg-gray-50 border-y border-gray-100 flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{cat.category_name}</h4>
                      <span className="text-xs text-gray-400">{cat.items?.length || 0} standards</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {(cat.items || []).map(item => (
                        <StandardsItemRow key={item.id} item={item} assessmentId={id}
                          clientId={assessment.client_id} onAnswered={handleAnswered}
                          displayMode={displayMode}
                          comparisonAnswer={showComparison ? (comparisonAnswers[item.standard_id] || null) : null}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
