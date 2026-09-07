import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { resolveClientId } from '../lib/clientSelection'
import {
  listSavedDocuments, fetchSavedDocument, deleteSavedDocument,
  formatSavedDate, exportSaved,
} from '../lib/savedDocuments'
import toast from 'react-hot-toast'

// A client's file: everything saved from the editor for them. Read-only — a
// saved document is a frozen copy, so there is nothing here to edit.
export default function ClientReport() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { state, search } = useLocation()
  const clientId = resolveClientId(state, search)

  const [client, setClient] = useState(null)
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [viewing, setViewing] = useState(null)      // the frozen copy on screen
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (!clientId) { setLoading(false); return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function load() {
    setLoading(true)
    const [cRes, dRes] = await Promise.all([
      supabase.from('clients').select('*').eq('advocate_id', user.id).eq('id', clientId).single(),
      listSavedDocuments(clientId),
    ])
    if (cRes.error) { setLoadError('That client could not be loaded.'); setLoading(false); return }
    if (dRes.error) toast.error(dRes.error.message)
    setClient(cRes.data)
    setDocs(dRes.data || [])
    setLoading(false)
  }

  async function view(row) {
    setBusyId(row.id)
    const { data, error } = await fetchSavedDocument(row.id)
    setBusyId(null)
    if (error) { toast.error('Could not open that document'); return }
    setViewing(data)
  }

  async function download(row, kind) {
    setBusyId(row.id)
    try {
      const { data, error } = await fetchSavedDocument(row.id)
      if (error) { toast.error('Could not open that document'); return }
      const { overflow } = await exportSaved(data, client?.full_name, kind)
      if (overflow) toast.error('Warning: content ran past the page — the file may be clipped.')
      else toast.success(kind === 'pdf' ? 'PDF downloaded!' : 'Word document downloaded!')
    } finally {
      setBusyId(null)
    }
  }

  async function reallyDelete(row) {
    setBusyId(row.id)
    const { error } = await deleteSavedDocument(row.id)
    setBusyId(null)
    setConfirmDelete(null)
    if (error) { toast.error(`Could not delete: ${error.message}`); return }
    setDocs(d => d.filter(x => x.id !== row.id))
    if (viewing?.id === row.id) setViewing(null)
    toast.success('Document deleted')
  }

  const Header = () => (
    <header className="bg-[#1e3a5f] text-white px-4 sm:px-6 py-4 flex items-center gap-3">
      <button onClick={() => navigate('/dashboard')}
        className="text-white/70 hover:text-white text-lg shrink-0"
        aria-label="Back to dashboard">←</button>
      <h1 className="text-lg font-bold">Client Report</h1>
    </header>
  )

  if (!clientId || loadError) return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto p-6">
        <div className="card text-center py-10">
          <p className="text-lg font-semibold text-gray-800">{loadError || 'No client selected'}</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary mt-5">Back to dashboard</button>
        </div>
      </div>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <h2 className="text-xl font-bold text-[#1e3a5f]">{client?.full_name}</h2>
        <p className="text-sm text-gray-500 mb-6">Case No.: {client?.case_number || '—'}</p>

        <div className="rounded-xl border-2 border-gray-100 bg-white p-4 sm:p-5">
          <h3 className="font-semibold text-gray-700 border-b pb-2 mb-3">
            Saved Documents
            <span className="font-medium text-gray-400"> ({docs.length})</span>
          </h3>

          {docs.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              Nothing saved yet. Draft a document and use <span className="font-semibold text-gray-500">Save</span> in
              the editor to file a copy here.
            </p>
          ) : (
            <div className="space-y-2">
              {docs.map(d => (
                <div key={d.id} className="rounded-lg border border-gray-200 p-3">
                  <p className="font-semibold text-gray-900 text-sm break-words">{d.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Saved {formatSavedDate(d.created_at)}</p>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={() => view(d)} disabled={busyId === d.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition">
                      View
                    </button>
                    <button onClick={() => download(d, 'pdf')} disabled={busyId === d.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition">
                      PDF
                    </button>
                    <button onClick={() => download(d, 'docx')} disabled={busyId === d.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition">
                      Word
                    </button>
                    <button onClick={() => setConfirmDelete(d)} disabled={busyId === d.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 transition ml-auto">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Frozen copy, read-only ─────────────────────────────── */}
      {viewing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex flex-col" onClick={() => setViewing(null)}>
          <div className="bg-white w-full max-w-4xl mx-auto my-4 rounded-lg flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">{viewing.name}</p>
                <p className="text-xs text-gray-500">Saved copy — read-only</p>
              </div>
              <button onClick={() => setViewing(null)}
                className="ml-auto text-gray-400 hover:text-gray-700 text-2xl leading-none shrink-0"
                aria-label="Close">×</button>
            </div>
            {/* doc-surface keeps the paper white regardless of device dark mode,
                the same rule the editor's page uses. */}
            <div className="doc-surface overflow-auto p-4 sm:p-8"
              style={{ fontFamily: "'Times New Roman', serif", fontSize: '12pt', lineHeight: 1.8, color: '#000' }}
              dangerouslySetInnerHTML={{ __html: viewing.content }} />
          </div>
        </div>
      )}

      {/* ── Delete confirmation ────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900">Delete this document?</h3>
            <p className="text-sm text-gray-600 mt-2 break-words">{confirmDelete.name}</p>
            <p className="text-sm text-gray-500 mt-2">This cannot be undone.</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => reallyDelete(confirmDelete)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg font-semibold transition">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
