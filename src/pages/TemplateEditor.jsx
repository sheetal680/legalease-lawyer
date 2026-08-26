import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import RichTextEditor from '../components/RichTextEditor'
import { parseDocumentHtml, parsePageMargin, parsePageFont, loadFontAssets, renderPdf, renderDocx, buildFilename } from '../lib/documentExport'
import { parseManualFields, buildAnswerMap } from '../lib/manualFields'
import { resolveClientId, resolveTemplateId, withClient } from '../lib/clientSelection'
import toast from 'react-hot-toast'

// ── Placeholder replacement ──────────────────────────────────────
// `manualAnswers` carries the answers given on the Template Details step, keyed
// by token. They join the same single replacement pass as the autofilled data,
// so a hand-answered blank and an autofilled one are indistinguishable in the
// output. Tokens with no answer fall through to the strip-to-empty rule below.
function applyReplacements(html, advocate, client, associates, manualAnswers) {
  const fmt = (v) => v || ''
  const now = new Date()
  const today = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  let result = html
  const map = {
    '[ADVOCATE_NAME]': fmt(advocate?.full_name),
    '[FIRM_NAME]': fmt(advocate?.firm_name),
    '[ADVOCATE_ADDRESS]': fmt(advocate?.address),
    '[ADVOCATE_PHONE]': fmt(advocate?.phone),
    '[ADVOCATE_EMAIL]': fmt(advocate?.email),
    '[BAR_NUMBER]': fmt(advocate?.bar_council_number),
    '[BAR_COUNCIL_NO]': fmt(advocate?.bar_council_number),  // legacy alias
    '[CLIENT_NAME]': fmt(client?.full_name),
    '[CLIENT_ADDRESS]': fmt(client?.address),
    '[CLIENT_PHONE]': fmt(client?.phone),
    '[CLIENT_EMAIL]': fmt(client?.email),
    '[CASE_NUMBER]': fmt(client?.case_number),
    '[PARTY_TYPE]': fmt(client?.party_type),
    '[COURT_PLACE]': fmt(client?.court_place),
    '[COURT_NAME]': fmt(client?.court_name),
    '[DATE]': today,
    '[TODAY]': today,  // legacy alias
    // Split date parts, for printed forms whose blanks read
    // "___ day of ______ 202_" rather than taking one formatted string.
    '[DAY]': String(now.getDate()),
    '[MONTH]': now.toLocaleDateString('en-IN', { month: 'long' }),
    '[YEAR]': String(now.getFullYear()),
    // Trailing digit(s) that complete a pre-printed "202" on the form.
    '[YEAR_LAST]': String(now.getFullYear()).slice(3),
  }

  // Replace associate placeholders
  if (associates && associates.length > 0) {
    const assocName = a => fmt(a.full_name || a.name)
    map['[ASSOCIATE_NAME]'] = associates.map(assocName).filter(Boolean).join(', ')
    map['[ASSOCIATE_BAR_NUMBER]'] = associates.map(a => a.bar_council_number).filter(Boolean).join(', ')
    map['[ASSOCIATE_BAR_NO]'] = map['[ASSOCIATE_BAR_NUMBER]']  // legacy alias
    associates.forEach((a, i) => {
      map[`[ASSOCIATE_NAME_${i + 1}]`] = assocName(a)
      map[`[ASSOCIATE_BAR_NUMBER_${i + 1}]`] = fmt(a.bar_council_number)
      map[`[ASSOCIATE_BAR_NO_${i + 1}]`] = fmt(a.bar_council_number)  // legacy alias
    })
  }

  // Conditional tokens: which side of "Between ... Versus" the client's name goes on,
  // based on client.party_type. Used by forms (e.g. the High Court Vakalatnama) that
  // print separate Petitioner/Respondent blank lines. The app only ever stores
  // 'Plaintiff' or 'Defendant' (see AddClient.jsx) — those map onto the printed
  // form's Petitioner/Respondent lines respectively.
  const partyType = client?.party_type || ''
  map['[CLIENT_NAME_IF_PETITIONER]'] = partyType === 'Plaintiff' ? fmt(client?.full_name) : ''
  map['[CLIENT_NAME_IF_RESPONDENT]'] = partyType === 'Defendant' ? fmt(client?.full_name) : ''

  // Applied last so a Template Details answer wins over a same-named autofill
  // token, but only where the advocate actually typed something (buildAnswerMap
  // omits blanks, so skipping a question can never wipe out autofilled data).
  Object.assign(map, manualAnswers || {})

  Object.entries(map).forEach(([placeholder, value]) => {
    result = result.split(placeholder).join(value)
  })

  // Any bracketed token that isn't one of the tokens above (i.e. no data source
  // exists for it) is stripped to empty rather than left as visible [BRACKET] text.
  result = result.replace(/\[[A-Z_][A-Z0-9_]*\]/g, '')

  return result
}

export default function TemplateEditor() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { state, search } = useLocation()
  const { partyConfig, manualAnswers } = state || {}
  const clientId = resolveClientId(state, search)
  const templateId = resolveTemplateId(state, search)
  const richEditorRef = useRef(null)

  const [template, setTemplate] = useState(null)
  const [client, setClient] = useState(null)
  const [associates, setAssociates] = useState([])
  const [htmlContent, setHtmlContent] = useState('')
  const [rawHtml, setRawHtml] = useState('')  // original parsed HTML (with placeholders)
  const [loading, setLoading] = useState(true)

  // ── Load on mount ────────────────────────────────────────────
  useEffect(() => {
    // navigate(-1) here used to drop the advocate wherever history happened to
    // point, which after a refresh is nowhere at all. Go somewhere known.
    if (!templateId) {
      toast.error('No template selected')
      navigate(withClient('/choose-template', clientId), { replace: true })
      return
    }
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

    // Every client-derived token — court, case number, party name — renders
    // empty when no client is attached. That produces a document which LOOKS
    // finished but has silently dropped half its details, so the editor refuses
    // to open at all rather than showing it. Sending the advocate back to pick
    // a client is recoverable; handing them a plausible-looking document that
    // is missing the court and the parties is not.
    const selectedClient = clientId
      ? (cRes.data || []).find(c => c.id === clientId) || null
      : null
    if (!selectedClient) {
      toast.error(clientId
        ? 'That client could no longer be found — please pick the client again'
        : 'Pick a client first — the document needs the court and party details')
      navigate('/choose-client', { replace: true })
      return
    }
    setClient(selectedClient)

    // Apply the advocate/associate configuration carried over from Document Setup
    let initialAssociates = []
    if (partyConfig?.associateIds?.length) {
      initialAssociates = (aRes.data || []).filter(a => partyConfig.associateIds.includes(a.id))
    }
    setAssociates(initialAssociates)

    await loadDocument(tRes.data, selectedClient, initialAssociates)
    setLoading(false)
  }

  async function loadDocument(tmpl, selectedClient, currentAssociates = associates) {
    // Answers from the Template Details step, formatted per their declared
    // field type (a date answer renders like [DATE] does elsewhere).
    const answerMap = buildAnswerMap(parseManualFields(tmpl.manual_fields), manualAnswers)

    if (tmpl.content && tmpl.content.trim().length > 0) {
      const raw = tmpl.content
      setRawHtml(raw)
      setHtmlContent(applyReplacements(raw, profile, selectedClient || client, currentAssociates, answerMap))
      return
    }

    if (!tmpl.file_url) {
      setRawHtml('')
      setHtmlContent('<p>No content available.</p>')
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
        setHtmlContent(applyReplacements(raw, profile, selectedClient || client, currentAssociates, answerMap))
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

  // ── Export PDF ───────────────────────────────────────────────
  // Builds a real vector PDF (jsPDF) from the parsed block model and saves
  // it directly — no window.print(), no dialog, no dependency on the
  // browser's own print pagination (which is what previously made the page
  // count unpredictable). Page breaks come from explicit block flags, not
  // CSS, so the output can't silently gain or lose a page.
  async function exportPDF() {
    const content = richEditorRef.current?.getHTML() || htmlContent
    const blocks = parseDocumentHtml(content)
    // The stored template declares its own page margin; the editor's copy no
    // longer carries the marker, so read it from the original template HTML.
    const margin = parsePageMargin(template?.content || content)
    const font = parsePageFont(template?.content || content)
    const fontAssets = await loadFontAssets(font)
    const filename = buildFilename(template?.name, client?.full_name, 'pdf')
    const { overflow } = renderPdf(blocks, filename, { margin, font, fontAssets })
    if (overflow) toast.error('Warning: content ran past the page — the PDF may be clipped.')
    else toast.success('PDF downloaded!')
  }

  // ── Export Word ──────────────────────────────────────────────
  // Builds a real .docx (the `docx` library, native OOXML paragraphs/runs)
  // instead of an HTML file wearing a .doc extension — opens natively in
  // Word with real alignment, indentation, and page breaks, not relying on
  // Word's legacy HTML import filter.
  async function exportWord() {
    const content = richEditorRef.current?.getHTML() || htmlContent
    const blocks = parseDocumentHtml(content)
    const margin = parsePageMargin(template?.content || content)
    const font = parsePageFont(template?.content || content)
    const fontAssets = await loadFontAssets(font)
    const filename = buildFilename(template?.name, client?.full_name, 'docx')
    await renderDocx(blocks, filename, { margin, font, fontAssets })
    toast.success('Word document downloaded!')
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

      {/* Editor */}
      <main className="flex-1 overflow-y-auto p-2 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <RichTextEditor
            ref={richEditorRef}
            content={htmlContent}
            style={{ fontFamily: "'Times New Roman', serif", fontSize: '12pt', lineHeight: '1.8', color: '#000' }}
          />
        </div>
      </main>
    </div>
  )
}
