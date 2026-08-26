import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { resolveClientId, withClient } from '../lib/clientSelection'
import { useAuth } from '../context/AuthContext'

const OPTIONS = [
  { id: 'advocate', icon: '⚖️', label: 'Main Advocate', desc: 'Your details (auto-filled)' },
  { id: 'advocate-associates', icon: '👥', label: 'Main Advocate + Associates', desc: 'Add associates to the document' },
  { id: 'associate-only', icon: '👨‍💼', label: 'Associate Only', desc: 'Select one associate' },
]

export default function DocumentSetup() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { state, search } = useLocation()
  const clientId = resolveClientId(state, search)

  const [client, setClient] = useState(null)
  const [allAssociates, setAllAssociates] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState(null)
  const [pickedIds, setPickedIds] = useState([])
  const [loadError, setLoadError] = useState(null)

  // Deliberately does NOT redirect. Choose Client is the page the advocate
  // almost always arrives from, so bouncing back to it renders as "the button
  // did nothing" — an invisible failure with no way to tell whether the click
  // was lost, the client was lost, or the row was bad. Standing still and
  // saying so is diagnosable; a silent return to the previous page is not.
  useEffect(() => {
    if (!clientId) return
    loadData()
  }, [clientId])

  async function loadData() {
    setLoading(true)
    const [cRes, aRes] = await Promise.all([
      supabase.from('clients').select('*').eq('advocate_id', user.id).eq('id', clientId).single(),
      supabase.from('associates').select('*').eq('advocate_id', user.id).order('full_name'),
    ])
    if (cRes.error) { setLoadError('That client could not be loaded.'); setLoading(false); return }
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

  const isValid =
    mode === 'advocate' ||
    (mode === 'advocate-associates' && pickedIds.length > 0) ||
    (mode === 'associate-only' && pickedIds.length === 1)

  function handleContinue() {
    if (!isValid) return
    navigate(withClient('/choose-template', clientId), {
      state: {
        clientId,
        partyConfig: { mode, associateIds: pickedIds },
      },
    })
  }

  // Either no client reached this page, or the one that did could not be
  // loaded. Both are shown here rather than redirected away: this page is
  // normally entered from Choose Client, so returning there looks like the
  // button simply did nothing.
  if (!clientId || loadError) return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1e3a5f] text-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="text-white/70 hover:text-white text-lg">←</button>
        <h1 className="text-lg font-bold">Document Setup</h1>
      </header>
      <div className="max-w-2xl mx-auto p-6">
        <div className="card text-center py-10">
          <p className="text-lg font-semibold text-gray-800">
            {loadError || 'No client selected'}
          </p>
          <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
            A document needs the client’s court, case number and party details,
            so pick the client before choosing a template.
          </p>
          <button onClick={() => navigate('/choose-client')} className="btn-primary mt-5">
            Choose a client
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
      <header className="bg-[#1e3a5f] text-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="text-white/70 hover:text-white text-lg">←</button>
        <h1 className="text-lg font-bold">Document Setup</h1>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        <h2 className="text-xl font-bold text-[#1e3a5f] mb-1">For client: {client?.full_name}</h2>
        <p className="text-gray-500 text-sm mb-6">Choose who should appear as the signing advocate on this document.</p>

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
          Continue to Choose Template →
        </button>
      </div>
    </div>
  )
}
