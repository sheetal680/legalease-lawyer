import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function AddTemplate() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) return toast.error('Enter a template name')
    if (!file) return toast.error('Select a .docx or .pdf file')
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['docx', 'pdf'].includes(ext)) return toast.error('Only .docx and .pdf files are allowed')

    setLoading(true)
    try {
      // 1. Upload file to Supabase Storage
      const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`
      const { error: uploadError } = await supabase.storage
        .from('templates')
        .upload(fileName, file, { contentType: file.type })
      if (uploadError) throw uploadError

      // 2. Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('templates')
        .getPublicUrl(fileName)

      // 3. Save to admin_templates
      const { error: dbError } = await supabase.from('admin_templates').insert({
        name: name.trim(),
        content: null,
        file_url: publicUrl,
        file_type: ext,
      })
      if (dbError) throw dbError

      toast.success('Template uploaded!')
      navigate('/admin')
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => navigate('/admin')}
          className="text-sm text-gray-400 hover:text-blue-900 mb-6 block"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-blue-900 mb-6">Upload Template</h1>

        <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-sm border-2 border-gray-100 p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Vakalatnama, Bail Application"
              required
              disabled={loading}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-blue-900 transition-colors disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-2">
              File (.docx or .pdf)
            </label>
            <label
              className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                file ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              } ${loading ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input
                type="file"
                accept=".docx,.pdf"
                className="hidden"
                onChange={e => setFile(e.target.files[0] || null)}
                disabled={loading}
              />
              {file ? (
                <div className="text-center px-4">
                  <div className="text-2xl mb-1">{file.name.endsWith('.pdf') ? '📄' : '📝'}</div>
                  <p className="text-sm font-semibold text-blue-900 break-all">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-3xl mb-2">☁️</div>
                  <p className="text-sm text-gray-600">Click to select a file</p>
                  <p className="text-xs text-gray-400 mt-1">.docx or .pdf only</p>
                </div>
              )}
            </label>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-900 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-60 hover:bg-blue-800 transition-colors"
            >
              {loading ? 'Uploading…' : 'Upload Template'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              disabled={loading}
              className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3.5 rounded-xl text-sm disabled:opacity-60 hover:border-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
