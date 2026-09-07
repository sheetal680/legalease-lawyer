import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { withClient } from '../lib/clientSelection'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const ACTIONS = [
  { label: 'Add Client', path: '/add-client', icon: '👤' },
  { label: 'Add Associate', path: '/add-associate', icon: '👨‍💼' },
  { label: 'Choose Template', path: '/choose-template', icon: '📄' },
]

// One stored value. Renders an em dash rather than nothing when a field is
// blank, so a half-filled record reads as "not recorded" instead of looking
// like the layout broke.
function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">{label}</dt>
      <dd className="text-sm text-gray-800 break-words">{value || '—'}</dd>
    </div>
  )
}

function Details({ children }) {
  return <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">{children}</dl>
}

// Sections open independently — opening one never closes another, so two
// records can be compared side by side without fighting the accordion.
function Section({ icon, title, count, open, onToggle, children }) {
  return (
    <div className="rounded-xl border-2 border-gray-100 bg-white overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-gray-50 transition">
        <span className="text-2xl shrink-0">{icon}</span>
        <h3 className="font-bold text-[#1e3a5f]">
          {title}
          {count !== null && <span className="font-medium text-gray-400"> ({count})</span>}
        </h3>
        {/* The rotation lives on a wrapping span, not the <svg>: Tailwind's
            rotate-180 resolved to `rotate: 0deg` here, and an inline transform
            on the SVG itself computed back to the identity matrix. Rotating an
            ordinary element sidesteps both. */}
        <span
          className="ml-auto shrink-0 inline-flex text-[#1e3a5f]"
          style={{ transform: `rotate(${open ? 180 : 0}deg)`, transition: 'transform 200ms' }}>
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 sm:px-5 py-4">
          {children}
        </div>
      )}
    </div>
  )
}

// Case-insensitive substring match across any of the given fields.
function matches(query, fields) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some(f => f && String(f).toLowerCase().includes(q))
}

function NoMatches({ term }) {
  return (
    <p className="text-sm text-gray-400 py-2">
      No matches for &ldquo;{term.trim()}&rdquo;.
    </p>
  )
}

// qa-input pins the font to 16px: .input-field is text-sm, and anything under
// 16px makes iOS Safari zoom the viewport when the field takes focus.
function SearchBox({ value, onChange, placeholder }) {
  return (
    <input
      className="input-field qa-input mb-3"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
}

function Empty({ message, action }) {
  return (
    <p className="text-sm text-gray-400 py-2">
      {message} Use the <span className="font-semibold text-gray-500">{action}</span> action to add one.
    </p>
  )
}

export default function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()

  const [associates, setAssociates] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  // All collapsed on arrival; each toggles on its own.
  const [open, setOpen] = useState({ advocate: false, associates: false, clients: false, reports: false })
  const [associateSearch, setAssociateSearch] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [reportSearch, setReportSearch] = useState('')

  // Keyed on `user` rather than firing once on mount: the route guard happens
  // to resolve auth before this page renders, but relying on that means a null
  // user here throws instead of simply waiting.
  useEffect(() => {
    if (!user) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadData() {
    const [aRes, cRes] = await Promise.all([
      supabase.from('associates').select('*').eq('advocate_id', user.id).order('full_name'),
      supabase.from('clients').select('*').eq('advocate_id', user.id).order('full_name'),
    ])
    if (aRes.error || cRes.error) toast.error((aRes.error || cRes.error).message)
    setAssociates(aRes.data || [])
    setClients(cRes.data || [])
    setLoading(false)
  }

  // Collapsing a section clears its search, so reopening starts clean rather
  // than showing a filtered subset the advocate has long forgotten typing.
  function toggle(key) {
    const closing = open[key]
    setOpen(o => ({ ...o, [key]: !o[key] }))
    if (closing) {
      if (key === 'associates') setAssociateSearch('')
      if (key === 'clients') setClientSearch('')
      if (key === 'reports') setReportSearch('')
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  // Filtered views for display only — the section counts stay on the full
  // lists, because the count answers "how many do I have", not "how many am I
  // looking at".
  const shownAssociates = associates.filter(a =>
    matches(associateSearch, [a.full_name, a.name, a.bar_council_number]))
  const shownReportClients = clients.filter(c =>
    matches(reportSearch, [
      c.full_name, c.case_number, c.party_type, c.court_name,
      c.court_place, c.phone, c.email, c.address,
    ]))
  const shownClients = clients.filter(c =>
    matches(clientSearch, [
      c.full_name, c.case_number, c.party_type, c.court_name,
      c.court_place, c.phone, c.email, c.address,
    ]))

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#1e3a5f]">LegalEase Advocate</h1>
        <button onClick={handleSignOut}
          className="bg-[#1e3a5f] hover:bg-[#16293f] text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
          Sign Out
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* Actions come first in source order so they land on top when the
            columns stack on a phone; on desktop `order` puts them right. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Actions ─────────────────────────────────────────── */}
          <div className="space-y-4 lg:order-2">
            {ACTIONS.map(a => (
              <button key={a.path} onClick={() => navigate(a.path)}
                className="w-full text-left rounded-xl border-2 border-gray-100 bg-white hover:border-[#c9a84c] transition-all p-5 group">
                <div className="flex items-center gap-4">
                  <span className="text-3xl shrink-0">{a.icon}</span>
                  <h3 className="font-bold text-[#1e3a5f] group-hover:text-[#c9a84c] transition">{a.label}</h3>
                  <span className="ml-auto text-[#1e3a5f] group-hover:text-[#c9a84c] transition text-xl">&rarr;</span>
                </div>
              </button>
            ))}
          </div>

          {/* ── Stored data ─────────────────────────────────────── */}
          <div className="space-y-4 lg:col-span-2 lg:order-1">

            <Section icon="⚖️" title="Main Advocate" count={null}
              open={open.advocate} onToggle={() => toggle('advocate')}>
              {profile ? (
                <Details>
                  <Field label="Name" value={profile.full_name} />
                  <Field label="Bar Council No." value={profile.bar_council_number} />
                  <Field label="Firm" value={profile.firm_name} />
                  <Field label="Phone" value={profile.phone} />
                  <Field label="Email" value={profile.email} />
                  <Field label="Address" value={profile.address} />
                </Details>
              ) : (
                <p className="text-sm text-gray-400 py-2">No profile details recorded.</p>
              )}
            </Section>

            <Section icon="👨‍💼" title="Associates" count={loading ? '…' : associates.length}
              open={open.associates} onToggle={() => toggle('associates')}>
              {associates.length === 0 ? (
                <Empty message="No associates yet." action="Add Associate" />
              ) : (
                <>
                <SearchBox value={associateSearch} onChange={setAssociateSearch}
                  placeholder="Search associates..." />
                {shownAssociates.length === 0 ? <NoMatches term={associateSearch} /> : (
                <div className="space-y-3">
                  {shownAssociates.map(a => (
                    <div key={a.id} className="rounded-lg border border-gray-200 p-3">
                      <Details>
                        <Field label="Name" value={a.full_name || a.name} />
                        <Field label="Bar Council No." value={a.bar_council_number} />
                      </Details>
                    </div>
                  ))}
                </div>
                )}
                </>
              )}
            </Section>

            <Section icon="👤" title="Clients" count={loading ? '…' : clients.length}
              open={open.clients} onToggle={() => toggle('clients')}>
              {clients.length === 0 ? (
                <Empty message="No clients yet." action="Add Client" />
              ) : (
                <>
                <SearchBox value={clientSearch} onChange={setClientSearch}
                  placeholder="Search clients..." />
                {shownClients.length === 0 ? <NoMatches term={clientSearch} /> : (
                <div className="space-y-3">
                  {shownClients.map(c => (
                    <div key={c.id} className="rounded-lg border border-gray-200 p-3">
                      <Details>
                        <Field label="Name" value={c.full_name} />
                        <Field label="Case No." value={c.case_number} />
                        <Field label="Party" value={c.party_type} />
                        <Field label="Court" value={c.court_name} />
                        <Field label="Court Place" value={c.court_place} />
                        <Field label="Phone" value={c.phone} />
                        <Field label="Email" value={c.email} />
                        <Field label="Address" value={c.address} />
                      </Details>
                    </div>
                  ))}
                </div>
                )}
                </>
              )}
            </Section>

            <Section icon="📁" title="Client Reports" count={clients.length}
              open={open.reports} onToggle={() => toggle('reports')}>
              {clients.length === 0 ? (
                <Empty message="No clients yet." action="Add Client" />
              ) : (
                <>
                <SearchBox value={reportSearch} onChange={setReportSearch}
                  placeholder="Search clients..." />
                {shownReportClients.length === 0 ? <NoMatches term={reportSearch} /> : (
                <div className="space-y-2">
                  {shownReportClients.map(c => (
                    <button key={c.id}
                      onClick={() => navigate(withClient('/client-report', c.id), { state: { clientId: c.id } })}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-[#c9a84c] transition group">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{c.full_name}</p>
                          <p className="text-xs text-gray-500">Case No.: {c.case_number || '—'}</p>
                        </div>
                        <span className="ml-auto shrink-0 text-[#1e3a5f] group-hover:text-[#c9a84c] transition">&rarr;</span>
                      </div>
                    </button>
                  ))}
                </div>
                )}
                </>
              )}
            </Section>

          </div>
        </div>
      </main>
    </div>
  )
}
