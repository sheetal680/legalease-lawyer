import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function ProfileSetup() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    firm_name: profile?.firm_name || '',
    bar_council_number: profile?.bar_council_number || '',
    address: profile?.address || '',
    phone: profile?.phone || '',
    email: profile?.email || user?.email || '',
  })
  const [loading, setLoading] = useState(false)

  function handle(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.full_name || !form.firm_name || !form.bar_council_number) {
      return toast.error('Name, Firm Name and Bar Council Number are required')
    }
    setLoading(true)
    const { error } = await supabase.from('advocate_profiles').upsert({
      id: user.id,
      ...form,
      updated_at: new Date().toISOString(),
    })
    setLoading(false)
    if (error) return toast.error(error.message)
    toast.success('Profile saved!')
    await refreshProfile()
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-lg p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Complete Your Profile</h1>
        <p className="text-sm text-gray-500 mb-6">This information will appear on your documents.</p>
        <form onSubmit={handleSave} className="space-y-4">
          {[
            { label: 'Full Name', name: 'full_name', placeholder: 'Adv. Arshith Kumar' },
            { label: 'Firm / Practice Name', name: 'firm_name', placeholder: 'Arshith Legal Associates' },
            { label: 'Bar Council Number', name: 'bar_council_number', placeholder: 'AP/1234/2020' },
            { label: 'Office Address', name: 'address', placeholder: 'Door No. 1-2-3, MG Road, Vijayawada' },
            { label: 'Phone Number', name: 'phone', placeholder: '+91 98765 43210' },
            { label: 'Email Address', name: 'email', placeholder: 'adv@lawfirm.com' },
          ].map(f => (
            <div key={f.name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <input name={f.name} className="input-field" placeholder={f.placeholder}
                value={form[f.name]} onChange={handle} disabled={loading} />
            </div>
          ))}
          <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
            {loading ? 'Saving…' : 'Save & Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
