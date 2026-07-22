import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

// ── Placeholder replacement ──────────────────────────────────────
function applyReplacements(html, advocate, client, associates) {
  const fmt = (v) => v || ''
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  let result = html
  const map = {
    '[ADVOCATE_NAME]': fmt(advocate?.full_name),
    '[FIRM_NAME]': fmt(advocate?.firm_name),
    '[ADVOCATE_ADDRESS]': fmt(advocate?.address),
    '[ADVOCATE_PHONE]': fmt(advocate?.phone),
    '[ADVOCATE_EMAIL]': fmt(advocate?.email),
    '[BAR_COUNCIL_NO]': fmt(advocate?.bar_council_number),
    '[CLIENT_NAME]': fmt(client?.full_name),
    '[CLIENT_ADDRESS]': fmt(client?.address),
    '[CLIENT_PHONE]': fmt(client?.phone),
    '[CLIENT_EMAIL]': fmt(client?.email),
    '[CASE_NUMBER]': fmt(client?.case_number),
    '[PARTY_TYPE]': fmt(client?.party_type),
    '[COURT_PLACE]': fmt(client?.court_place),
    '[COURT_NAME]': fmt(client?.court_name),
    '[DATE]': today,
    '[TODAY]': today,
  }

  // Replace associate placeholders
  if (associates && associates.length > 0) {
    map['[ASSOCIATE_NAME]'] = associates.map(a => a.full_name).join(', ')
    map['[ASSOCIATE_BAR_NO]'] = associates.map(a => a.bar_council_number).filter(Boolean).join(', ')
    associates.forEach((a, i) => {
      map[`[ASSOCIATE_NAME_${i + 1}]`] = fmt(a.full_name)
      map[`[ASSOCIATE_BAR_NO_${i + 1}]`] = fmt(a.bar_council_number)
    })
  }

  Object.entries(map).forEach(([placeholder, value]) => {
    result = result.split(placeholder).join(value || placeholder)
  })
  return result
}

// ── Modal ────────────────────────────────────────────────────────
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  )
}

export default function TemplateEditor() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { state } = useLocation()
  const { templateId, clientId } = state || {}
  const editorRef = useRef(null)

  const [template, setTemplate] = useState(null)
  const [client, setClient] = useState(null)
  const [associates, setAssociates] = useState([])
  const [allAssociates, setAllAssociates] = useState([])
  const [allClients, setAllClients] = useState([])
  const [htmlContent, setHtmlContent] = useState('')
  const [rawHtml, setRawHtml] = useState('')  // original parsed HTML (with placeholders)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)  // 'associate' | 'client' | 'advocate-info'

  // ── Load on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!templateId) { toast.error('No template selected'); navigate(-1); return }
    loadAll()
  }, [templateId])

  async function loadAll() {
    setLoading(true)
    const [tRes, aRes, cRes] = await Promise.all([
      supabase.from('admin_templates').select('*').eq('id', templateId).single(),
      supabase.from('associates').select('*').eq('advocate_id', user.id).order('full_name'),
      supabase.from('clients').select('*').eq('advocate_id', user.id).order('full_name'),
    ])
    if (tRes.error) { toast.error('Template not found'); navigate(-1); return }
    setTemplate(tRes.data)
    setAllAssociates(aRes.data || [])
    setAllClients(cRes.data || [])

    let selectedClient = null
    if (clientId) {
      selectedClient = (cRes.data || []).find(c => c.id === clientId) || null
      setClient(selectedClient)
    }

    await loadDocument(tRes.data, selectedClient)
    setLoading(false)
  }

  async function loadDocument(tmpl, selectedClient) {
    if (!tmpl.file_url) {
      const raw = tmpl.content || '<p>No content available.</p>'
      setRawHtml(raw)
      setHtmlContent(applyReplacements(raw, profile, selectedClient || client, associates))
      return
    }

    if (tmpl.file_type === 'docx') {
      try {
        const res = await fetch(tmpl.file_url)
        const buf = await res.arrayBuffer()
        const mammoth = await import('mammoth')
        const result = await mammoth.convertToHtml({ arrayBuffer: buf })
        const raw = result.value || '<p>Could not parse document.</p>'
        setRawHtml(raw)
        setHtmlContent(applyReplacements(raw, profile, selectedClient || client, associates))
      } catch (err) {
        toast.error('Could not load .docx file')
        setHtmlContent('<p>Error loading document.</p>')
      }
    } else {
      // PDF — show link instead
      setHtmlContent(`<div style="text-align:center;padding:40px">
        <p style="font-size:16px">This template is a PDF file.</p>
        <a href="${tmpl.file_url}" target="_blank" style="color:#1d4ed8;text-decoration:underline">Open PDF in new tab</a>
      </div>`)
    }
  }

  function reApply(newClient, newAssociates) {
    const updated = applyReplacements(rawHtml, profile, newClient || client, newAssociates || associates)
    setHtmlContent(updated)
    if (editorRef.current) editorRef.current.innerHTML = updated
  }

  // ── Sidebar actions ──────────────────────────────────────────
  const SIDEBAR = [
    {
      id: 'advocate',
      label: 'Main Advocate',
      icon: '⚖️',
      desc: 'Your details (auto-filled)',
      action: () => setModal('advocate-info'),
    },
    {
      id: 'advocate-associates',
      label: 'Main Advocate + Associates',
      icon: '👥',
      desc: 'Add associates to the document',
      action: () => setModal('associate'),
    },
    {
      id: 'associate-only',
      label: 'Associate Only',
      icon: '👨‍💼',
      desc: 'Select one associate',
      action: () => setModal('associate-single'),
    },
    {
      id: 'client',
      label: 'Add or Change Client',
      icon: '👤',
      desc: client ? `Current: ${client.full_name}` : 'No client selected',
      action: () => setModal('client'),
    },
  ]

  // ── Export PDF ───────────────────────────────────────────────
  function exportPDF() {
    const content = editorRef.current?.innerHTML || htmlContent
    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${template?.name || 'Document'}</title>
    <style>
      body { font-family: 'Times New Roman', serif; font-size: 12pt; margin: 1in; line-height: 1.6; color: #000; }
      p { margin: 0 0 0.5em; } table { width: 100%; border-collapse: collapse; }
      td, th { border: 1px solid #000; padding: 4px 8px; }
      @page { margin: 1in; } @media print { body { margin: 0; } }
    </style></head><body>${content}</body></html>`)
    win.document.close()
    setTimeout(() => { win.print() }, 500)
  }

  // ── Export Word ──────────────────────────────────────────────
  function exportWord() {
    const content = editorRef.current?.innerHTML || htmlContent
    const wordHTML = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>${template?.name || 'Document'}</title>
      <style>body{font-family:'Times New Roman',serif;font-size:12pt;margin:1in;}</style>
      </head><body>${content}</body></html>`
    const blob = new Blob(['﻿', wordHTML], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${template?.name || 'document'}.doc`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Word document downloaded!')
  }

  // ── Save to localStorage ─────────────────────────────────────
  function saveDocument() {
    const content = editorRef.current?.innerHTML || htmlContent
    const key = `le_doc_${templateId}_${clientId || 'no-client'}`
    localStorage.setItem(key, content)
    toast.success('Document saved locally!')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-blue-900 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0 shadow-md">
        <button onClick={() => navigate(-1)} className="text-blue-200 hover:text-white text-lg">←</button>
        <h1 className="text-base font-bold flex-1 truncate">{template?.name}</h1>
        <div className="flex items-center gap-2">
          <button onClick={saveDocument}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition">
            💾 Save
          </button>
          <button onClick={exportPDF}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm font-medium transition">
            📄 PDF
          </button>
          <button onClick={exportWord}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition">
            📝 Word
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-gray-200 flex-shrink-0 overflow-y-auto">
          <div className="p-3 border-b">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Fill Details</p>
          </div>
          <div className="space-y-1 p-2">
            {SIDEBAR.map(s => (
              <button key={s.id} onClick={s.action}
                className="w-full text-left p-3 rounded-lg hover:bg-blue-50 transition group">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-sm font-semibold text-gray-800 group-hover:text-blue-700">{s.label}</span>
                </div>
                <p className="text-xs text-gray-400 pl-7 leading-tight">{s.desc}</p>
              </button>
            ))}
          </div>
          {/* Status panel */}
          <div className="m-2 mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1 border">
            <p className="font-bold text-gray-700 mb-2">Current Selection</p>
            <p>👤 Advocate: <span className="text-gray-900">{profile?.full_name || '—'}</span></p>
            <p>📋 Client: <span className="text-gray-900">{client?.full_name || 'None'}</span></p>
            <p>👥 Associates: <span className="text-gray-900">{associates.length > 0 ? associates.map(a => a.full_name).join(', ') : 'None'}</span></p>
          </div>
        </aside>

        {/* Editor */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto bg-white shadow-md rounded-lg min-h-[800px]">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="p-12 min-h-[800px] focus:outline-none"
              style={{ fontFamily: "'Times New Roman', serif", fontSize: '12pt', lineHeight: '1.8', color: '#000' }}
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>
        </main>
      </div>

      {/* ── MODALS ── */}

      {/* Advocate Info */}
      {modal === 'advocate-info' && (
        <Modal title="Main Advocate Details" onClose={() => setModal(null)}>
          <div className="space-y-2 text-sm">
            {[
              ['Name', profile?.full_name],
              ['Firm', profile?.firm_name],
              ['Bar Council No.', profile?.bar_council_number],
              ['Address', profile?.address],
              ['Phone', profile?.phone],
              ['Email', profile?.email],
            ].map(([label, val]) => (
              <div key={label} className="flex gap-2">
                <span className="font-medium text-gray-600 w-32 flex-shrink-0">{label}:</span>
                <span className="text-gray-900">{val || '—'}</span>
              </div>
            ))}
            <p className="text-xs text-gray-400 mt-4 border-t pt-3">
              These details are automatically filled when the template is opened.
              To update them, go to Edit Profile from the Dashboard.
            </p>
          </div>
          <button onClick={() => setModal(null)} className="btn-primary w-full mt-4">Close</button>
        </Modal>
      )}

      {/* Associate Selector (multi) */}
      {modal === 'associate' && (
        <AssociateModal
          allAssociates={allAssociates}
          selected={associates}
          multi={true}
          onConfirm={(selected) => {
            setAssociates(selected)
            reApply(client, selected)
            setModal(null)
            toast.success(`${selected.length} associate(s) added`)
          }}
          onClose={() => setModal(null)}
        />
      )}

      {/* Associate Selector (single) */}
      {modal === 'associate-single' && (
        <AssociateModal
          allAssociates={allAssociates}
          selected={associates}
          multi={false}
          onConfirm={(selected) => {
            const arr = selected.slice(0, 1)
            setAssociates(arr)
            reApply(client, arr)
            setModal(null)
            toast.success('Associate selected')
          }}
          onClose={() => setModal(null)}
        />
      )}

      {/* Client Selector */}
      {modal === 'client' && (
        <Modal title="Select Client" onClose={() => setModal(null)}>
          {allClients.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No clients found.</p>
              <button onClick={() => navigate('/add-client')} className="btn-primary mt-3">Add Client</button>
            </div>
          ) : (
            <div className="space-y-2">
              {allClients.map(c => (
                <button key={c.id} onClick={() => {
                  setClient(c)
                  reApply(c, associates)
                  setModal(null)
                  toast.success(`Client: ${c.full_name}`)
                }}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    client?.id === c.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                  }`}>
                  <p className="font-semibold text-gray-900">{c.full_name}</p>
                  <p className="text-xs text-gray-500">{c.case_number} · {c.party_type} · {c.court_name || c.court_place || ''}</p>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

// ── Associate selection modal ────────────────────────────────────
function AssociateModal({ allAssociates, selected, multi, onConfirm, onClose }) {
  const [picked, setPicked] = useState(selected.map(a => a.id))

  function toggle(id) {
    if (multi) {
      setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
    } else {
      setPicked([id])
    }
  }

  function confirm() {
    const result = allAssociates.filter(a => picked.includes(a.id))
    onConfirm(result)
  }

  return (
    <Modal title={multi ? 'Select Associates' : 'Select Associate'} onClose={onClose}>
      {allAssociates.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p>No associates found.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {allAssociates.map(a => (
              <button key={a.id} onClick={() => toggle(a.id)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  picked.includes(a.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-${multi ? 'sm' : 'full'} border-2 flex-shrink-0 ${
                    picked.includes(a.id) ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                  }`}>
                    {picked.includes(a.id) && <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{a.full_name}</p>
                    {a.bar_council_number && <p className="text-xs text-gray-500">{a.bar_council_number}</p>}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <button onClick={confirm} className="btn-primary w-full" disabled={picked.length === 0}>
            Confirm Selection ({picked.length})
          </button>
        </>
      )}
    </Modal>
  )
}
