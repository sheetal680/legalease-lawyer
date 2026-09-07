// Saved documents — frozen copies of a drafted document, filed against a client.
//
// A saved document is a SNAPSHOT, not a draft. Its `content` is the fully
// rendered HTML at the moment of saving, with every autofill token already
// replaced and the page-setup markers re-attached, so it can be viewed and
// re-exported later without the template row, the client record, or the
// replacement pass. That matters legally: a document filed in court must keep
// saying what it said on the day it was filed, even if the client's details are
// corrected afterwards.

import { supabase } from './supabase'
import {
  parseDocumentHtml, parsePageMargin, parsePageFont, loadFontAssets,
  renderPdf, renderDocx, buildFilename,
} from './documentExport'

// "Memo of Appearance (Criminal) — 7 September 2026"
export function buildSavedName(templateName, when = new Date()) {
  const date = when.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  return `${templateName || 'Document'} — ${date}`
}

export function formatSavedDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

export async function listSavedDocuments(clientId) {
  return supabase
    .from('saved_documents')
    .select('id, name, template_name, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
}

export async function fetchSavedDocument(id) {
  return supabase.from('saved_documents').select('*').eq('id', id).single()
}

export async function deleteSavedDocument(id) {
  return supabase.from('saved_documents').delete().eq('id', id)
}

// Re-export a frozen copy. The snapshot carries its own page-setup markers, so
// nothing here consults the template — the same call works for a document whose
// template was deleted after it was saved.
export async function exportSaved(doc, clientName, kind) {
  const blocks = parseDocumentHtml(doc.content)
  const margin = parsePageMargin(doc.content)
  const font = parsePageFont(doc.content)
  const fontAssets = await loadFontAssets(font)
  const filename = buildFilename(doc.name, clientName, kind === 'pdf' ? 'pdf' : 'docx')

  if (kind === 'pdf') {
    const { overflow } = renderPdf(blocks, filename, { margin, font, fontAssets })
    return { overflow }
  }
  await renderDocx(blocks, filename, { margin, font, fontAssets })
  return { overflow: false }
}
