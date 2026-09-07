// Uploaded case files — scans, photographs of physical documents, and files
// received from others, filed against a client.
//
// Bytes live in the private `case-files` bucket; this module is the index and
// the access layer over them. Nothing is ever served from a public URL: reads
// go through short-lived signed URLs, so a leaked path is not a leaked
// document.

import { supabase } from './supabase'

export const BUCKET = 'case-files'

// Matches the bucket's own server-side limit. The checks here exist to give a
// useful message before a 25 MB upload is attempted and rejected — the real
// boundary is enforced by Storage, not by this file.
export const MAX_BYTES = 25 * 1024 * 1024
export const MAX_LABEL = '25 MB'

// Photos of physical documents are the common case, so HEIC is included:
// iPhones shoot HEIC by default and an advocate should not have to convert.
const TYPES = [
  { mime: 'application/pdf', ext: ['pdf'], label: 'PDF' },
  { mime: 'application/msword', ext: ['doc'], label: 'Word' },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: ['docx'], label: 'Word' },
  { mime: 'image/jpeg', ext: ['jpg', 'jpeg'], label: 'Image' },
  { mime: 'image/png', ext: ['png'], label: 'Image' },
  { mime: 'image/heic', ext: ['heic'], label: 'Image' },
  { mime: 'image/heif', ext: ['heif'], label: 'Image' },
]

export const ACCEPT_ATTR = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.heif,' +
  TYPES.map(t => t.mime).join(',')

const extOf = name => (name.split('.').pop() || '').toLowerCase()

// Browsers disagree about the MIME type of .doc and .heic — Chrome often
// reports an empty string for HEIC — so the extension is the fallback rather
// than trusting file.type alone and rejecting a legitimate photo.
export function describeType(file) {
  const byMime = TYPES.find(t => t.mime === file.type)
  if (byMime) return byMime
  return TYPES.find(t => t.ext.includes(extOf(file.name))) || null
}

export function isSupported(file) {
  return !!describeType(file)
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function kindOf(mime, fileName = '') {
  if (mime === 'application/pdf') return 'pdf'
  if (mime?.startsWith('image/')) return 'image'
  const e = extOf(fileName)
  if (e === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'heic', 'heif'].includes(e)) return 'image'
  return 'other'
}

// Storage keys are <advocate>/<client>/<uuid>-<safe name>. The advocate id
// leads because the bucket policies authorise on that first path segment.
// The random prefix means two uploads of "scan.pdf" cannot collide.
function storagePath(advocateId, clientId, fileName) {
  const safe = fileName.replace(/[^\w.\-]+/g, '_').slice(-80)
  const unique = (crypto.randomUUID?.() || Math.random().toString(36).slice(2))
  return `${advocateId}/${clientId}/${unique}-${safe}`
}

export async function listFiles(clientId) {
  return supabase
    .from('uploaded_files')
    .select('id, file_name, storage_path, mime_type, size_bytes, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
}

// Uploads one file and indexes it. Returns { error } with a message already
// worded for the advocate rather than a raw Storage error.
export async function uploadOne(file, { advocateId, clientId }) {
  if (!isSupported(file)) {
    return { error: `“${file.name}” is not a supported file type. Upload a PDF, Word document, or a photo (JPG, PNG or HEIC).` }
  }
  if (file.size > MAX_BYTES) {
    return { error: `“${file.name}” is ${formatSize(file.size)} — larger than the ${MAX_LABEL} limit.` }
  }

  const path = storagePath(advocateId, clientId, file.name)
  const type = describeType(file)
  // file.type can be empty for HEIC; fall back to the type matched by extension
  // so Storage does not reject it against the bucket's allowed_mime_types.
  const contentType = file.type || type.mime

  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType, upsert: false })
  if (up.error) return { error: `Could not upload “${file.name}”: ${up.error.message}` }

  const ins = await supabase.from('uploaded_files').insert({
    advocate_id: advocateId,
    client_id: clientId,
    file_name: file.name,
    storage_path: path,
    mime_type: contentType,
    size_bytes: file.size,
  })
  if (ins.error) {
    // The object is already in Storage; without this the row would be missing
    // while the bytes stayed behind as an orphan nobody can see or reach.
    await supabase.storage.from(BUCKET).remove([path])
    return { error: `Could not record “${file.name}”: ${ins.error.message}` }
  }
  return { error: null }
}

// Short-lived signed URL. `download` makes the browser save rather than
// display, which is what Word files need — there is nothing to render.
export async function signedUrl(path, { download = false, fileName } = {}) {
  return supabase.storage.from(BUCKET).createSignedUrl(path, 60, {
    download: download ? (fileName || true) : false,
  })
}

// Storage object first, then the row. In that order a failure leaves a row
// pointing at nothing — visible, and retrying deletes it. The other order
// would leave bytes nobody can see or reach: a true orphan.
export async function deleteFile(row) {
  const rm = await supabase.storage.from(BUCKET).remove([row.storage_path])
  if (rm.error) return { error: `Could not delete the stored file: ${rm.error.message}` }
  const del = await supabase.from('uploaded_files').delete().eq('id', row.id)
  if (del.error) return { error: `File removed from storage, but the record could not be deleted: ${del.error.message}` }
  return { error: null }
}
