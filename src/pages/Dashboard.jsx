import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ACTIONS = [
  { label: 'Add Associate', path: '/add-associate', icon: '👨‍💼', desc: 'Register a new associate advocate' },
  { label: 'Add Client', path: '/add-client', icon: '👤', desc: 'Add a new client to your database' },
  { label: 'Choose Client', path: '/choose-client', icon: '📋', desc: 'Select client and prepare a document' },
  { label: 'Choose Template', path: '/choose-template', icon: '📄', desc: 'Pick a template to start drafting' },
]

export default function Dashboard() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white px-6 py-4 flex items-center justify-between shadow-md">
        <div>
          <h1 className="text-xl font-bold">LegalEase</h1>
          <p className="text-blue-200 text-sm">{profile?.firm_name}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="font-semibold text-sm">{profile?.full_name}</p>
            <p className="text-blue-300 text-xs">{profile?.bar_council_number}</p>
          </div>
          <button onClick={() => navigate('/profile-setup')} className="text-blue-200 hover:text-white text-sm underline">
            Edit Profile
          </button>
          <button onClick={handleSignOut} className="bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm transition">
            Sign Out
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome back, {profile?.full_name?.split(' ')[0]}</h2>
        <p className="text-gray-500 mb-8">What would you like to do today?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {ACTIONS.map(a => (
            <button key={a.path} onClick={() => navigate(a.path)}
              className="card text-left hover:shadow-md hover:border-blue-200 transition-all group cursor-pointer">
              <div className="text-4xl mb-3">{a.icon}</div>
              <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition">{a.label}</h3>
              <p className="text-gray-500 text-sm mt-1">{a.desc}</p>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
