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
