import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function ChooseClient() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, case_number, party_type, court_name, court_place, created_at')
      .eq('advocate_id', user.id)
      .order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setClients(data || [])
    setLoading(false)
  }

  const filtered = clients.filter(c =>
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.case_number?.toLowerCase().includes(search.toLowerCase()) ||
    c.court_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="text-blue-200 hover:text-white text-lg">←</button>
        <h1 className="text-lg font-bold">Choose Client</h1>
      </header>
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-4">
          <input className="input-field" placeholder="Search by name, case number or court…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" />
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
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Client Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Case No.</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Party</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Court</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-blue-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.full_name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.case_number || '—'}</td>
                    <td className="px-4 py-3">
                      {c.party_type ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.party_type === 'Plaintiff' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>{c.party_type}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{c.court_name || c.court_place || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate('/choose-template', { state: { clientId: c.id } })}
                        className="bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-800 transition whitespace-nowrap">
                        Choose Template →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
