import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const NAV_LINKS = [
  { label: 'Add Client', path: '/add-client', icon: '👤' },
  { label: 'Add Associate', path: '/add-associate', icon: '👨‍💼' },
]

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [clients, setClients] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, address, phone, email, case_number, party_type, court_name, court_place, created_at')
      .eq('advocate_id', user.id)
      .order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setClients(data || [])
    setLoading(false)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  function goTo(path) {
    setSidebarOpen(false)
    navigate(path)
  }

  const q = search.toLowerCase()
  const filtered = clients.filter(c =>
    [c.full_name, c.case_number, c.court_name, c.court_place, c.party_type, c.phone, c.email, c.address]
      .some(field => field?.toLowerCase().includes(q))
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu"
            className="text-[#1e3a5f] hover:text-[#c9a84c] transition p-1 -ml-1">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-[#1e3a5f]">LegalEase Advocate</h1>
        </div>
        <button onClick={handleSignOut}
          className="bg-[#1e3a5f] hover:bg-[#16293f] text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
          Sign Out
        </button>
      </header>

      {/* Sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar drawer */}
      <aside className={`fixed top-0 left-0 h-full w-72 bg-[#1e3a5f] z-50 shadow-2xl transform transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <div>
            <h2 className="text-white font-bold text-lg">LegalEase</h2>
            <p className="text-[#c9a84c] text-xs">Advocate Portal</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="text-white/60 hover:text-white text-2xl leading-none">×</button>
        </div>
        <nav className="p-3 space-y-1">
          {NAV_LINKS.map(link => (
            <button key={link.path} onClick={() => goTo(link.path)}
              className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-lg text-white/90 hover:bg-white/10 hover:text-[#c9a84c] transition">
              <span className="text-xl">{link.icon}</span>
              <span className="font-medium">{link.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="max-w-6xl mx-auto p-6">
        <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">Choose Clients</h2>

        <div className="mb-4">
          <input className="input-field" placeholder="Search by name, case number, court, party, phone, email or address…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            {clients.length === 0 ? (
              <>
                <p className="text-lg font-medium mb-2">No clients yet</p>
                <button onClick={() => navigate('/add-client')} className="btn-primary mt-2">Add First Client</button>
              </>
            ) : (
              <p>No clients match your search.</p>
            )}
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1e3a5f]/5 border-b-2 border-[#1e3a5f]/10">
                    <th className="px-4 py-3 text-left font-semibold text-[#1e3a5f] whitespace-nowrap">Client Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-[#1e3a5f] whitespace-nowrap">Case No.</th>
                    <th className="px-4 py-3 text-left font-semibold text-[#1e3a5f] whitespace-nowrap">Party</th>
                    <th className="px-4 py-3 text-left font-semibold text-[#1e3a5f] whitespace-nowrap">Court</th>
                    <th className="px-4 py-3 text-left font-semibold text-[#1e3a5f] whitespace-nowrap">Court Place</th>
                    <th className="px-4 py-3 text-left font-semibold text-[#1e3a5f] whitespace-nowrap">Phone</th>
                    <th className="px-4 py-3 text-left font-semibold text-[#1e3a5f] whitespace-nowrap">Email</th>
                    <th className="px-4 py-3 text-left font-semibold text-[#1e3a5f] whitespace-nowrap">Address</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-[#c9a84c]/5 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{c.full_name}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.case_number || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {c.party_type ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            c.party_type === 'Plaintiff' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                          }`}>{c.party_type}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[180px]">{c.court_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[140px]">{c.court_place || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.phone || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.email || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px]">{c.address || '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate('/document-setup', { state: { clientId: c.id } })}
                          className="bg-[#1e3a5f] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#16293f] transition whitespace-nowrap">
                          Choose Template →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
