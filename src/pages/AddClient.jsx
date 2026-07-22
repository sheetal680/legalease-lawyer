import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getCourtsForCity } from '../lib/courts'
import toast from 'react-hot-toast'

export default function AddClient() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '', address: '', phone: '', email: '',
    case_number: '', party_type: '', court_place: '', court_name: '',
  })
  const [courts, setCourts] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const list = getCourtsForCity(form.court_place)
    setCourts(list)
    if (list.length > 0 && !list.includes(form.court_name)) {
      setForm(f => ({ ...f, court_name: '' }))
    }
  }, [form.court_place])

  function handle(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.full_name.trim()) return toast.error('Client name is required')
    if (!form.case_number.trim()) return toast.error('Case number is required')
    if (!form.party_type) return toast.error('Select Plaintiff or Defendant')
    setLoading(true)
    const { error } = await supabase.from('clients').insert({
      advocate_id: user.id,
      full_name: form.full_name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      case_number: form.case_number.trim(),
      party_type: form.party_type,
      court_place: form.court_place.trim() || null,
      court_name: form.court_name || null,
    })
    setLoading(false)
    if (error) return toast.error(error.message)
    toast.success('Client added!')
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="text-blue-200 hover:text-white text-lg">←</button>
        <h1 className="text-lg font-bold">Add Client</h1>
      </header>
      <div className="max-w-2xl mx-auto p-6">
        <div className="card">
          <form onSubmit={handleSave} className="space-y-4">
            {/* Personal Details */}
            <h3 className="font-semibold text-gray-700 border-b pb-2">Client Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input name="full_name" className="input-field" placeholder="Mr. / Mrs. Full Name"
                  value={form.full_name} onChange={handle} disabled={loading} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea name="address" className="input-field resize-none" rows={2} placeholder="Door No., Street, City, State - Pincode"
                  value={form.address} onChange={handle} disabled={loading} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input name="phone" className="input-field" placeholder="+91 98765 43210"
                  value={form.phone} onChange={handle} disabled={loading} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input name="email" type="email" className="input-field" placeholder="client@email.com"
                  value={form.email} onChange={handle} disabled={loading} />
              </div>
            </div>

            {/* Case Details */}
            <h3 className="font-semibold text-gray-700 border-b pb-2 mt-2">Case Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Case Number <span className="text-red-500">*</span></label>
                <input name="case_number" className="input-field" placeholder="O.S. 123/2024"
                  value={form.case_number} onChange={handle} disabled={loading} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Party Type <span className="text-red-500">*</span></label>
                <select name="party_type" className="input-field" value={form.party_type} onChange={handle} disabled={loading}>
                  <option value="">Select…</option>
                  <option value="Plaintiff">Plaintiff</option>
                  <option value="Defendant">Defendant</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Court Place</label>
                <input name="court_place" className="input-field" placeholder="Type city (e.g. Vijayawada)"
                  value={form.court_place} onChange={handle} disabled={loading} />
                {form.court_place.length >= 2 && courts.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No courts found — you can still type the court name below.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Court Name</label>
                {courts.length > 0 ? (
                  <select name="court_name" className="input-field" value={form.court_name} onChange={handle} disabled={loading}>
                    <option value="">Select court…</option>
                    {courts.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input name="court_name" className="input-field" placeholder="Enter court name manually"
                    value={form.court_name} onChange={handle} disabled={loading} />
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => navigate('/dashboard')} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" className="btn-primary flex-1" disabled={loading}>
                {loading ? 'Saving…' : 'Save Client'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
