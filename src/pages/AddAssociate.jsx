import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function AddAssociate() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name: '', bar_council_number: '' })
  const [loading, setLoading] = useState(false)

  function handle(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.full_name.trim()) return toast.error('Full name is required')
    setLoading(true)
    const { error } = await supabase.from('associates').insert({
      name: form.full_name.trim(),
      full_name: form.full_name.trim(),
      bar_council_number: form.bar_council_number.trim() || null,
      advocate_id: user.id,
    })
    setLoading(false)
    if (error) return toast.error(error.message)
    toast.success('Associate added!')
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="text-blue-200 hover:text-white text-lg">←</button>
        <h1 className="text-lg font-bold">Add Associate</h1>
      </header>
      <div className="max-w-2xl mx-auto p-6">
        <div className="card">
          <form onSubmit={handleSave} className="space-y-4">
            {/* Associate Details */}
            <h3 className="font-semibold text-gray-700 border-b pb-2">Associate Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input name="full_name" className="input-field" placeholder="Adv. Ravi Shankar"
                  value={form.full_name} onChange={handle} disabled={loading} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Bar Council Number</label>
                <input name="bar_council_number" className="input-field" placeholder="AP/5678/2021"
                  value={form.bar_council_number} onChange={handle} disabled={loading} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => navigate('/dashboard')} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" className="btn-primary flex-1" disabled={loading}>
                {loading ? 'Saving…' : 'Save Associate'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
