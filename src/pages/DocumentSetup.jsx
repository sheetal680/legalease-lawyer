import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { hasManualFields } from '../lib/manualFields'
import {
  resolveClientId, resolveTemplateId, withClient, withFlow,
} from '../lib/clientSelection'
import { useAuth } from '../context/AuthContext'

const OPTIONS = [
  { id: 'advocate', icon: '⚖️', label: 'Main Advocate', desc: 'Your details (auto-filled)' },
  { id: 'advocate-associates', icon: '👥', label: 'Main Advocate + Associates', desc: 'Add associates to the document' },
  { id: 'associate-only', icon: '👨‍💼', label: 'Associate Only', desc: 'Select one associate' },
]

// Third step of the flow: the client and the template are both already
// chosen, so the only question left here is who signs the document.
export default function DocumentSetup() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { state, search } = useLocation()
  const templateId = resolveTemplateId(state, search)
  // Chosen two steps back. Both ids travel in the URL, so a refresh here keeps
  // the whole selection rather than half of it.
  const clientId = resolveClientId(state, search)

  const [template, setTemplate] = useState(null)
  const [client, setClient] = useState(null)
  const [allAssociates, setAllAssociates] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [mode, setMode] = useState(null)
  const [pickedIds, setPickedIds] = useState([])

  useEffect(() => {
    if (!templateId || !clientId) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, clientId])

  async function loadData() {
    setLoading(true)
    const [tRes, cRes, aRes] = await Promise.all([
      supabase.from('admin_templates').select('id, name, manual_fields').eq('id', templateId).single(),
      supabase.from('clients').select('*').eq('advocate_id', user.id).eq('id', clientId).maybeSingle(),
      supabase.from('associates').select('*').eq('advocate_id', user.id).order('full_name'),
    ])
    if (tRes.error) { setLoadError('That template could not be loaded.'); setLoading(false); return }
    setTemplate(tRes.data)
    if (cRes.error || !cRes.data) { setLoadError('That client could not be found.'); setLoading(false); return }
    setClient(cRes.data)
    setAllAssociates(aRes.data || [])
    setLoading(false)
  }

  function selectMode(id) {
    setMode(id)
    setPickedIds([])
  }

  function toggleAssociate(id) {
    if (mode === 'advocate-associates') {
      setPickedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
    } else if (mode === 'associate-only') {
      setPickedIds([id])
    }
  }

  const modeValid =
    mode === 'advocate' ||
    (mode === 'advocate-associates' && pickedIds.length > 0) ||
    (mode === 'associate-only' && pickedIds.length === 1)
  const isValid = !!client && modeValid

  function handleContinue() {
    if (!isValid) return
    // Whether the template asks questions decides the next step; both ids
    // travel in the URL from here on.
    const next = hasManualFields(template?.manual_fields) ? '/template-details' : '/template-editor'
    navigate(withFlow(next, clientId, templateId), {
      state: { clientId, templateId, partyConfig: { mode, associateIds: pickedIds } },
    })
  }

  const Header = () => (
    <header className="bg-[#1e3a5f] text-white px-6 py-4 flex items-center gap-3">
      <button onClick={() => navigate(withClient('/choose-template', clientId), { state: { clientId } })}
        className="text-white/70 hover:text-white text-lg">←</button>
      <h1 className="text-lg font-bold">Document Setup</h1>
    </header>
  )

  // No client reached this page. The client is now the first step of the flow,
  // so send them back to it rather than offering a picker here.
  if (!clientId) return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto p-6">
        <div className="card text-center py-10">
          <p className="text-lg font-semibold text-gray-800">No client selected</p>
          <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
            Pick the client first — the document needs their court and party details.
          </p>
          <button onClick={() => navigate('/choose-client')} className="btn-primary mt-5">
            Choose a client
          </button>
        </div>
      </div>
    </div>
  )

  // No template reached this page, or the one that did could not be loaded.
  // Shown rather than redirected: bouncing back to the page just left renders
  // as "the button did nothing", with no clue which part failed.
  if (!templateId || loadError) return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto p-6">
        <div className="card text-center py-10">
          <p className="text-lg font-semibold text-gray-800">{loadError || 'No template selected'}</p>
          <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
            Pick the form you need — the signing advocate is chosen here afterwards.
          </p>
          <button onClick={() => navigate(withClient('/choose-template', clientId), { state: { clientId } })}
            className="btn-primary mt-5">
            Choose a template
          </button>
        </div>
      </div>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-2xl mx-auto p-6">
        <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Drafting</p>
        <h2 className="text-xl font-bold text-[#1e3a5f] mb-1 leading-snug">{template?.name}</h2>
        <p className="text-gray-500 text-sm mb-6">
          For client: <span className="font-semibold text-gray-700">{client?.full_name}</span>
          {client?.case_number ? <span className="text-gray-400"> &middot; {client.case_number}</span> : null}
        </p>

        <h3 className="font-semibold text-gray-700 border-b pb-2 mb-4">Who signs this document?</h3>

        {/* ── Signing advocate ───────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 mb-6">
          {OPTIONS.map(o => (
            <button key={o.id} onClick={() => selectMode(o.id)}
              className={`text-left rounded-xl border-2 p-5 transition-all ${
                mode === o.id ? 'border-[#c9a84c] bg-[#c9a84c]/5' : 'border-gray-100 bg-white hover:border-gray-200'
              }`}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{o.icon}</span>
                <div>
                  <h3 className="font-bold text-[#1e3a5f]">{o.label}</h3>
                  <p className="text-gray-500 text-sm">{o.desc}</p>
                </div>
                <div className={`ml-auto w-5 h-5 rounded-full border-2 flex-shrink-0 ${
                  mode === o.id ? 'border-[#c9a84c] bg-[#c9a84c]' : 'border-gray-300'
                }`}>
                  {mode === o.id && <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
              </div>
            </button>
          ))}
        </div>

        {(mode === 'advocate-associates' || mode === 'associate-only') && (
          <div className="card mb-6">
            <h3 className="font-semibold text-gray-700 border-b pb-2 mb-3">
              {mode === 'advocate-associates' ? 'Select Associates' : 'Select Associate'}
            </h3>
            {allAssociates.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <p>No associates found.</p>
                <button onClick={() => navigate('/add-associate')} className="btn-primary mt-3">Add Associate</button>
              </div>
            ) : (
              <div className="space-y-2">
                {allAssociates.map(a => (
                  <button key={a.id} onClick={() => toggleAssociate(a.id)}
                    className={`w-full text-left p-3 rounded-lg border transition ${
                      pickedIds.includes(a.id) ? 'border-[#1e3a5f] bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-${mode === 'advocate-associates' ? 'sm' : 'full'} border-2 flex-shrink-0 ${
                        pickedIds.includes(a.id) ? 'border-[#1e3a5f] bg-[#1e3a5f]' : 'border-gray-300'
                      }`}>
                        {pickedIds.includes(a.id) && <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{a.full_name || a.name}</p>
                        <p className="text-xs text-gray-500">Bar Council No.: {a.bar_council_number || '—'}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={handleContinue} disabled={!isValid} className="btn-primary w-full">
          Continue →
        </button>
      </div>
    </div>
  )
}
