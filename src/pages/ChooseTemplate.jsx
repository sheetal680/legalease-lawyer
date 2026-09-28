import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { resolveClientId, withFlow } from '../lib/clientSelection'
import { templatesForCourtType } from '../lib/courtsReference'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

// Second step of the flow: the client is already chosen, and the forms shown
// here are narrowed to the ones actually filed in that client's court.
export default function ChooseTemplate() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { state, search: qs } = useLocation()
  const partyConfig = state?.partyConfig || null
  const clientId = resolveClientId(state, qs)

  const [templates, setTemplates] = useState([])
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!clientId) { setLoading(false); return }
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function loadAll() {
    setLoading(true)
    const [tRes, cRes] = await Promise.all([
      supabase.from('admin_templates')
        .select('id, name, file_url, file_type, created_at, manual_fields, court_types')
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('*').eq('advocate_id', user.id).eq('id', clientId).maybeSingle(),
    ])
    if (tRes.error) toast.error(tRes.error.message)
    setTemplates(tRes.data || [])
    if (cRes.error || !cRes.data) setLoadError('That client could not be found.')
    else setClient(cRes.data)
    setLoading(false)
  }

  function openTemplate(t) {
    navigate(withFlow('/document-setup', clientId, t.id), {
      state: { clientId, templateId: t.id, partyConfig },
    })
  }

  const courtType = client?.court_type || null

  // Filtering narrows; it must never empty the page. If the client has no
  // court type recorded, or the court type matches nothing, every template is
  // shown with a note saying why — an advocate who cannot reach a form is
  // blocked from doing their job, which is far worse than one extra scroll.
  const matching = templatesForCourtType(templates, courtType)
  const filterApplied = !!courtType && matching.length > 0
  const pool = filterApplied ? matching : templates

  // "High Court" already ends in the word; "District & Subordinate" does not.
  const courtPhrase = courtType && (/Court$/.test(courtType) ? courtType : `${courtType} courts`)

  let noticeText = null
  if (filterApplied) {
    noticeText = `Showing forms for the ${courtPhrase}.`
  } else if (!courtType) {
    noticeText = 'Showing all forms — this client has no court type recorded, '
      + 'so there is nothing to narrow the list by.'
  } else if (templates.length > 0) {
    noticeText = `Showing all forms — no form is tagged for the ${courtPhrase} yet.`
  }

  const q = search.trim().toLowerCase()
  const shown = q ? pool.filter(t => t.name?.toLowerCase().includes(q)) : pool

  const Header = () => (
    <header className="bg-blue-900 text-white px-6 py-4 flex items-center gap-3">
      <button
        onClick={() => navigate('/choose-client')}
        className="text-blue-200 hover:text-white text-lg">←</button>
      <h1 className="text-lg font-bold">Choose Template</h1>
    </header>
  )

  // Reached without a client. Shown rather than bounced: a silent redirect back
  // to the page just left reads as "the button did nothing", with no clue which
  // part failed.
  if (!clientId || loadError) return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto p-6">
        <div className="card text-center py-10">
          <p className="text-lg font-semibold text-gray-800">{loadError || 'No client selected'}</p>
          <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
            Pick the client first — which forms apply depends on the court their case sits in.
          </p>
          <button onClick={() => navigate('/choose-client')} className="btn-primary mt-5">
            Choose a client
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-4xl mx-auto p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No templates available</p>
            <p className="text-sm mt-1">Ask your admin to upload templates.</p>
          </div>
        ) : (
          <>
          <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Drafting for</p>
          <h2 className="text-xl font-bold text-[#1e3a5f] leading-snug">{client?.full_name}</h2>
          <p className="text-sm text-gray-500 mb-4">
            Case No.: {client?.case_number || '—'}
            {client?.court_name ? <> &middot; {client.court_name}</> : null}
          </p>

          {noticeText && (
            <div className={`rounded-lg px-4 py-3 mb-4 text-sm ${
              filterApplied
                ? 'bg-blue-50 text-[#1e3a5f] border border-blue-100'
                : 'bg-amber-50 text-amber-900 border border-amber-100'
            }`}>
              {noticeText}
              {filterApplied && (
                <span className="text-gray-500"> {pool.length} of {templates.length}.</span>
              )}
            </div>
          )}

          {/* qa-input pins the font to 16px so iOS Safari does not zoom the
              viewport when the field takes focus. */}
          <input
            className="input-field qa-input mb-4"
            placeholder="Search templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {shown.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No matches for &ldquo;{search.trim()}&rdquo;.</p>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map(t => (
              <button key={t.id} onClick={() => openTemplate(t)}
                className="card text-left hover:shadow-md hover:border-blue-200 transition-all group cursor-pointer">
                <div className="text-3xl mb-3">{t.file_type === 'pdf' ? '📕' : '📘'}</div>
                <h3 className="font-bold text-gray-900 group-hover:text-blue-700 transition leading-tight">{t.name}</h3>
                <p className="text-xs text-gray-400 mt-1 uppercase">{t.file_type || 'template'}</p>
                <span className="inline-block mt-3 text-xs text-blue-700 font-semibold group-hover:underline">Open →</span>
              </button>
            ))}
          </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}
