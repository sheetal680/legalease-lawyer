// Shared helpers for the "Template Details" step.
//
// A template may declare, in its `manual_fields` JSONB column, the blanks on
// the printed form that the app cannot fill from saved data. Each entry is
//   { token: '[CRIME_NUMBER]', label: 'Crime Number', type: 'text' }
// A template with no entries is "untagged" and skips the Details step
// entirely, behaving exactly as it did before this feature existed.

export const FIELD_TYPES = ['text', 'textarea', 'date', 'number']

// Defensive: manual_fields is hand-authored JSON, and a template row may
// predate the column. Anything malformed is dropped rather than crashing the
// drafting flow — a missing question is recoverable (the advocate types into
// the document), a white screen is not.
export function parseManualFields(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(f => f && typeof f.token === 'string' && /^\[[A-Z_][A-Z0-9_]*\]$/.test(f.token))
    .map(f => ({
      token: f.token,
      label: typeof f.label === 'string' && f.label.trim() ? f.label.trim() : f.token,
      hint: typeof f.hint === 'string' && f.hint.trim() ? f.hint.trim() : null,
      type: FIELD_TYPES.includes(f.type) ? f.type : 'text',
    }))
}

export function hasManualFields(raw) {
  return parseManualFields(raw).length > 0
}

// Turns raw form input into the string that goes into the document.
// Dates are rendered the same way [DATE] is elsewhere in the app, so a
// hand-answered date and an autofilled one look identical on the page.
export function formatAnswer(value, type) {
  const v = (value ?? '').toString().trim()
  if (!v) return ''
  if (type === 'date') {
    const d = new Date(v + 'T00:00:00')
    if (Number.isNaN(d.getTime())) return v
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  return v
}

// { '[CRIME_NUMBER]': '123' } — only non-empty answers. Anything omitted falls
// through to the existing "strip unmatched tokens to empty" rule, so a skipped
// question leaves the blank blank rather than printing [BRACKET] text.
export function buildAnswerMap(fields, answers) {
  const map = {}
  for (const f of fields) {
    const formatted = formatAnswer(answers?.[f.token], f.type)
    if (formatted) map[f.token] = formatted
  }
  return map
}
