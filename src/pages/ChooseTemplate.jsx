import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { withTemplate } from '../lib/clientSelection'
import toast from 'react-hot-toast'

export default function ChooseTemplate() {
  const navigate = useNavigate()
  // The template is now chosen BEFORE the client, so this page knows nothing
  // about a client and must not pretend to.
  const { state } = useLocation()
  const partyConfig = state?.partyConfig || null
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTemplates()
  }, [])

  async function loadTemplates() {
    const { data, error } = await supabase
      .from('admin_templates')
      .select('id, name, file_url, file_type, created_at, manual_fields')
      .order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setTemplates(data || [])
    setLoading(false)
  }

  // Every template now goes to Document Setup next, where the client and the
  // signing advocate are chosen. Whether the template has questions decides
  // what comes AFTER that, not what comes now.
  function openTemplate(t) {
    navigate(withTemplate('/document-setup', t.id), { state: { templateId: t.id, partyConfig } })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-blue-200 hover:text-white text-lg">←</button>
        <h1 className="text-lg font-bold">Choose Template</h1>
      </header>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => (
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
      </div>
    </div>
  )
}
