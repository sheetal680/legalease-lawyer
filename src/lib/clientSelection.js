// Keeps the selected client alive across the drafting flow.
//
// The flow used to carry the client only in React Router's in-memory
// location.state. That is destroyed by anything that remounts the app: a
// refresh, typing a URL directly, a mobile browser discarding and restoring
// the tab, or opening a step in a second tab. When it was lost the editor
// still rendered — silently missing court, case number and party names — which
// is worse than not rendering at all, because the document looks finished.
//
// So the client id is carried three ways, in priority order:
//   1. location.state    — normal in-app navigation
//   2. ?client= in the URL — survives a refresh, a typed URL, a second tab
//   3. sessionStorage     — survives a refresh that dropped the query string
//
// The URL is the one that covers a second tab; sessionStorage is per-tab and
// only backstops the same tab.

const KEY = 'legalease.selectedClientId'

// Storage can throw outright in private modes and locked-down browsers, so
// every access is guarded — losing the fallback is survivable, crashing the
// drafting flow is not.
export function rememberClient(id) {
  if (!id) return
  try { sessionStorage.setItem(KEY, id) } catch { /* storage unavailable */ }
}

export function recallClient() {
  try { return sessionStorage.getItem(KEY) || null } catch { return null }
}

export function forgetClient() {
  try { sessionStorage.removeItem(KEY) } catch { /* storage unavailable */ }
}

// Resolves the client id for a drafting-flow page and re-records whatever it
// found, so the next step still has it even if that step is reached fresh.
export function resolveClientId(state, search) {
  const fromState = state?.clientId
  if (fromState) { rememberClient(fromState); return fromState }

  try {
    const fromUrl = new URLSearchParams(search || '').get('client')
    if (fromUrl) { rememberClient(fromUrl); return fromUrl }
  } catch { /* malformed query string */ }

  return recallClient()
}

// Appends ?client=<id> to a path so the selection survives in the address bar.
export function withClient(path, clientId) {
  if (!clientId) return path
  return `${path}${path.includes('?') ? '&' : '?'}client=${encodeURIComponent(clientId)}`
}

// The template id needs the same treatment as the client id. Carrying only the
// client meant a refresh on the editor kept the client but lost the template,
// so the page bailed out with "No template selected" — the flow was still
// broken by a refresh, just one step further along.
export function withTemplate(path, templateId) {
  if (!templateId) return path
  return `${path}${path.includes('?') ? '&' : '?'}template=${encodeURIComponent(templateId)}`
}

export function withFlow(path, clientId, templateId) {
  return withTemplate(withClient(path, clientId), templateId)
}

// Unlike the client, the template is not remembered in storage: it is a
// per-document choice, and silently resurrecting the last one on a bare URL
// would be surprising. The URL is enough to survive a refresh.
export function resolveTemplateId(state, search) {
  if (state?.templateId) return state.templateId
  try {
    return new URLSearchParams(search || '').get('template') || null
  } catch {
    return null
  }
}
