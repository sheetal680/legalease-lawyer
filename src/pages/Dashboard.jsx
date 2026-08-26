import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_LINKS = [
  { label: 'Add Client', path: '/add-client', icon: '👤' },
  { label: 'Add Associate', path: '/add-associate', icon: '👨‍💼' },
]

// The drafting flow now starts from the template, not the client — the client
// is picked on Document Setup once the template is known. So the dashboard has
// one job: start a document.
export default function Dashboard() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  function goTo(path) {
    setSidebarOpen(false)
    navigate(path)
  }

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
      <main className="max-w-3xl mx-auto p-6">
        <h2 className="text-2xl font-bold text-[#1e3a5f] mb-1">Draft a document</h2>
        <p className="text-gray-500 text-sm mb-6">
          Pick the form you need — you will choose the client and the signing advocate next.
        </p>

        <button
          onClick={() => navigate('/choose-template')}
          className="w-full text-left rounded-xl border-2 border-gray-100 bg-white hover:border-[#c9a84c] transition-all p-6 group">
          <div className="flex items-center gap-4">
            <span className="text-4xl">📄</span>
            <div>
              <h3 className="font-bold text-[#1e3a5f] text-lg group-hover:text-[#c9a84c] transition">Choose Template</h3>
              <p className="text-gray-500 text-sm">Browse the court forms and start drafting</p>
            </div>
            <span className="ml-auto text-[#1e3a5f] group-hover:text-[#c9a84c] transition text-xl">&rarr;</span>
          </div>
        </button>
      </main>
    </div>
  )
}
