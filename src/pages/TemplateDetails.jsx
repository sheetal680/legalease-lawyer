import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { parseManualFields, yearMismatch, labelDuplicated } from '../lib/manualFields'
import { resolveClientId, resolveTemplateId, withFlow } from '../lib/clientSelection'
import toast from 'react-hot-toast'

// Q&A step between Choose Template and the Editor. Asks only for the blanks a
// template declares in `manual_fields` — never for anything already known from
// the advocate/client records, which keep autofilling silently.
//
// Every question is optional by design: a skipped question leaves that blank
// empty in the document, which is exactly the behaviour before this page
// existed. Nothing here locks the document — the advocate can still edit
// freely in the editor afterwards.
export default function TemplateDetails() {
  const navigate = useNavigate()
  const { state, search } = useLocation()
  const { partyConfig } = state || {}
  const clientId = resolveClientId(state, search)
  const templateId = resolveTemplateId(state, search)

  const [template, setTemplate] = useState(null)
  const [fields, setFields] = useState([])
  // Restored from router state so Editor → Back → Details keeps the answers.
  const [answers, setAnswers] = useState(state?.manualAnswers || {})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!templateId) { toast.error('No template selected'); navigate('/choose-template', { replace: true }); return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])

  async function load() {
    const { data, error } = await supabase
      .from('admin_templates')
      .select('id, name, manual_fields')
      .eq('id', templateId)
      .single()

    if (error) { toast.error('Template not found'); navigate(-1); return }

    const parsed = parseManualFields(data.manual_fields)
    // Belt and braces: if this page is reached for a template that turns out to
    // have no questions, don't strand the advocate on an empty form.
    if (parsed.length === 0) {
      navigate(withFlow('/template-editor', clientId, templateId), { replace: true, state: { templateId, clientId, partyConfig } })
      return
    }

    setTemplate(data)
    setFields(parsed)
    setLoading(false)
  }

  function setAnswer(token, value) {
    setAnswers(prev => ({ ...prev, [token]: value }))
  }

  function goToEditor() {
    navigate(withFlow('/template-editor', clientId, templateId), {
      state: { templateId, clientId, partyConfig, manualAnswers: answers },
    })
  }

  const answeredCount = fields.filter(f => (answers[f.token] ?? '').toString().trim()).length

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white px-4 sm:px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(withFlow('/document-setup', clientId, templateId), { state: { clientId, templateId, partyConfig } })}
          className="text-blue-200 hover:text-white text-lg shrink-0"
          aria-label="Back to Document Setup">←</button>
        <h1 className="text-lg font-bold">Template Details</h1>
      </header>

      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="card mb-5">
          <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Filling in</p>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-snug mt-1">{template?.name}</h2>
          <p className="text-sm text-gray-500 mt-3">
            Answer only what you know. Every question is optional — anything you skip is
            simply left blank in the document, and you can still type it in the editor.
          </p>
          <p className="text-xs text-gray-400 mt-2">{answeredCount} of {fields.length} answered</p>
        </div>

        <div className="space-y-4">
          {fields.map(f => (
            <div key={f.token} className="card">
              <label htmlFor={f.token} className="block text-sm font-semibold text-gray-800">
                {f.label}
                <span className="ml-2 text-xs font-normal text-gray-400">Optional</span>
              </label>
              {f.hint && <p className="text-xs text-gray-500 mt-1">{f.hint}</p>}

              {f.type === 'textarea' ? (
                <textarea
                  id={f.token}
                  rows={3}
                  value={answers[f.token] || ''}
                  onChange={e => setAnswer(f.token, e.target.value)}
                  /* qa-input pins the font to 16px so iOS Safari doesn't zoom
                     the viewport when the field takes focus. */
                  className="input-field qa-input mt-2 resize-y"
                />
              ) : (
                <input
                  id={f.token}
                  type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                  inputMode={f.type === 'number' || f.type === 'year' ? 'numeric' : undefined}
                  /* A year is asked for in full (2024) even when the form only
                     leaves room for its last digit — the slot's pre-printed
                     part is stripped at render time, not by the advocate. */
                  maxLength={f.type === 'year' ? 4 : undefined}
                  placeholder={f.type === 'year' ? '2024' : undefined}
                  value={answers[f.token] || ''}
                  onChange={e => setAnswer(f.token, e.target.value)}
                  className="input-field qa-input mt-2"
                />
              )}

              {labelDuplicated(answers[f.token], f.printedLabel) && (
                <p className="text-xs text-amber-700 mt-1.5">
                  “{f.printedLabel}” is already printed on the form, so this would read
                  it twice. You can leave it out.
                </p>
              )}

              {f.type === 'year' && yearMismatch(answers[f.token], f.prefix) && (
                <p className="text-xs text-amber-700 mt-1.5">
                  This form pre-prints “{f.prefix}”, so {String(answers[f.token]).replace(/\D/g, '')} does not
                  fit that slot. It will still be filled in as typed.
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pb-8">
          <button
            onClick={() => navigate(withFlow('/document-setup', clientId, templateId), { state: { clientId, templateId, partyConfig } })}
            className="btn-secondary w-full sm:w-auto">
            Back
          </button>
          <button onClick={goToEditor} className="btn-primary w-full sm:w-auto">
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
