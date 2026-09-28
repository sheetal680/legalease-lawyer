import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { listCourts, areasOf, courtNamesFor, findCourt } from '../lib/courtsReference'
import SearchableSelect from '../components/SearchableSelect'
import toast from 'react-hot-toast'

export default function AddClient() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '', address: '', phone: '', email: '',
    case_number: '', party_type: '',
    court_area: '', court_name: '', court_type: '',
  })
  const [courts, setCourts] = useState([])
  const [courtsError, setCourtsError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    listCourts().then(({ data, error }) => {
      if (!alive) return
      if (error) { setCourtsError(error.message); return }
      setCourts(data || [])
    })
    return () => { alive = false }
  }, [])

  const areas = areasOf(courts)
  const courtNames = courtNamesFor(courts, { area: form.court_area })

  // Picking a court settles all three values at once: the type and the area
  // are properties of the court, not separate things to ask the advocate for.
  function chooseCourt(name) {
    const court = findCourt(courts, { name, area: form.court_area })
    setForm(f => ({
      ...f,
      court_name: name,
      court_area: court?.area ?? f.court_area,
      court_type: court?.court_type ?? '',
    }))
  }

  // Narrowing the area can strand a court that belongs to a different one, so
  // the court is dropped rather than left contradicting the area beside it.
  function chooseArea(area) {
    setForm(f => {
      const stillValid = !f.court_name ||
        courts.some(c => c.court_name === f.court_name && (!area || c.area === area))
      return {
        ...f,
        court_area: area,
        court_name: stillValid ? f.court_name : '',
        court_type: stillValid ? f.court_type : '',
      }
    })
  }

  function handle(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.full_name.trim()) return toast.error('Client name is required')
    if (!form.case_number.trim()) return toast.error('Case number is required')
    if (!form.party_type) return toast.error('Select Plaintiff or Defendant')
    setLoading(true)
    const { error } = await supabase.from('clients').insert({
      firm_owner_id: user.id,
      advocate_id: user.id,
      full_name: form.full_name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      case_number: form.case_number.trim(),
      party_type: form.party_type,
      court_type: form.court_type || null,
      court_area: form.court_area || null,
      court_name: form.court_name || null,
      // court_place is the older column and is what [COURT_PLACE] renders into
      // documents. Kept in step with court_area so that token keeps resolving
      // for clients created from here on.
      court_place: form.court_area || null,
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
                <label htmlFor="court-area" className="block text-sm font-medium text-gray-700 mb-1">Court Area</label>
                <SearchableSelect
                  id="court-area"
                  value={form.court_area}
                  onChange={chooseArea}
                  options={areas}
                  placeholder="Search area…"
                  disabled={loading}
                  emptyHint="No area matches."
                />
              </div>
              <div>
                <label htmlFor="court-name" className="block text-sm font-medium text-gray-700 mb-1">Court Name</label>
                <SearchableSelect
                  id="court-name"
                  value={form.court_name}
                  onChange={chooseCourt}
                  options={courtNames}
                  placeholder={form.court_area ? `Search courts in ${form.court_area}…` : 'Search courts…'}
                  disabled={loading}
                  emptyHint="No court matches — it may need adding to the courts list."
                />
                {/* The type is a property of the court, not a separate
                    question, so it is shown once a court is chosen rather
                    than asked for. */}
                {form.court_type && (
                  <p className="text-xs text-gray-500 mt-1">
                    Court type: <span className="font-semibold text-[#1e3a5f]">{form.court_type}</span>
                  </p>
                )}
              </div>
            </div>

            {courtsError && (
              <p className="text-xs text-amber-600">
                Could not load the courts list ({courtsError}). You can still save the client and set the court later.
              </p>
            )}

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
