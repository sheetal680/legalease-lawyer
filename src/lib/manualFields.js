// Shared helpers for the "Template Details" step.
//
// A template may declare, in its `manual_fields` JSONB column, the blanks on
// the printed form that the app cannot fill from saved data. Each entry is
//   { token: '[CRIME_NUMBER]', label: 'Crime Number', type: 'text' }
// A template with no entries is "untagged" and skips the Details step
// entirely, behaving exactly as it did before this feature existed.

export const FIELD_TYPES = ['text', 'textarea', 'date', 'number', 'year']

// Printed forms usually pre-print the start of a year and leave the rest blank
// — "202_", sometimes "20__". The advocate should always be asked for a plain
// four-digit year; the field declares what the form already prints via
// `prefix`, and only the remaining digits are emitted into the document.
// A `year` field with no prefix emits the whole year, for a fully blank slot.
const YEAR_LENGTH = 4

// Defensive: manual_fields is hand-authored JSON, and a template row may
// predate the column. Anything malformed is dropped rather than crashing the
// drafting flow — a missing question is recoverable (the advocate types into
// the document), a white screen is not.
export function parseManualFields(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(f => f && typeof f.token === 'string' && /^\[[A-Z_][A-Z0-9_]*\]$/.test(f.token))
    .map(f => {
      const type = FIELD_TYPES.includes(f.type) ? f.type : 'text'
      const prefix = type === 'year' && typeof f.prefix === 'string' && /^\d{1,3}$/.test(f.prefix)
        ? f.prefix
        : null
      const printedLabel = typeof f.printedLabel === 'string' && f.printedLabel.trim()
        ? f.printedLabel.trim()
        : null
      const explicit = typeof f.hint === 'string' && f.hint.trim() ? f.hint.trim() : null
      // Mechanical guidance is generated, template-specific colour is written by
      // hand, and both are shown — a field can need each for different reasons
      // (the police station is on two pages AND has a printed "P.S." label).
      const hint = [yearGuidance(type, prefix), labelGuidance(printedLabel), explicit]
        .filter(Boolean).join(' ') || null
      return {
        token: f.token,
        label: typeof f.label === 'string' && f.label.trim() ? f.label.trim() : f.token,
        hint,
        type,
        prefix,
        printedLabel,
      }
    })
}

// Most blanks on a printed form sit next to a label the form already prints —
// "P.S. ______", "Dist. ______", "now lodged in ______ Prison". Typing the
// label back in produces "P.S. Governorpet P.S.". Declaring `printedLabel`
// makes the convention automatic when tagging: the wording is generated, so it
// stays identical across every template.
function labelGuidance(printedLabel) {
  if (!printedLabel) return null
  // Deliberately neutral about what the answer is: the same sentence has to
  // read correctly for a name ("P.S."), a number ("No.") and a phrase
  // ("Court of").
  return `The form already prints “${printedLabel}” beside this blank — ` +
         `no need to include it in your answer.`
}

// So tagging a pre-printed year slot needs only { type: 'year', prefix: '202' }
// — the explanation writes itself and stays consistent across templates.
function yearGuidance(type, prefix) {
  if (type !== 'year' || !prefix) return null
  // Use the current year as the example whenever it fits the slot, so the
  // sample the advocate reads is one they might actually type.
  const thisYear = String(new Date().getFullYear())
  const example = thisYear.startsWith(prefix) ? thisYear : prefix.padEnd(YEAR_LENGTH, '0')
  const remaining = YEAR_LENGTH - prefix.length
  const digits = remaining > 1 ? `${remaining} digits are` : 'digit is'
  return `Enter the full year, e.g. ${example}. The form already prints “${prefix}”, ` +
         `so only the remaining ${digits} filled in.`
}

export function hasManualFields(raw) {
  return parseManualFields(raw).length > 0
}

// The digits that actually go into a pre-printed year slot.
// Accepts either a full year ("2024" with prefix "202" -> "4") or, forgivingly,
// the suffix on its own ("4" -> "4"), so an advocate who types what they see on
// the paper still gets the right result.
export function yearSuffix(value, prefix) {
  const digits = (value ?? '').toString().replace(/\D/g, '')
  if (!digits) return ''
  if (!prefix) return digits
  if (digits.startsWith(prefix)) return digits.slice(prefix.length)
  if (digits.length <= YEAR_LENGTH - prefix.length) return digits
  return digits  // a year that doesn't match the pre-printed prefix; emit as typed
}

// Words, lowercased and stripped of punctuation, for comparing what was typed
// against a printed label: "P.S." and "p s" both reduce to ['ps'].
function words(s) {
  return (s ?? '').toString().toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean)
}

// True when the answer repeats the label the form already prints, at either
// end — "P.S. Governorpet" where the form prints "P.S." before the blank, or
// "Central Prison" where it prints "Prison" after it.
//
// Compared word by word rather than as a substring, so "Psychiatric" is not
// mistaken for a repeat of "P.S.".
export function labelDuplicated(value, printedLabel) {
  if (!printedLabel) return false
  const v = words(value)
  const target = words(printedLabel).join('')
  if (!target || !v.length) return false
  // Consume whole words only — never a partial one — so "Psychiatric ward" is
  // not read as a repeat of "P.S.", while "P.S.", "PS" and "p s" all are.
  const maxRun = Math.min(v.length - 1, 4)
  for (let k = 1; k <= maxRun; k++) {
    if (v.slice(0, k).join('') === target) return true
    if (v.slice(v.length - k).join('') === target) return true
  }
  return false
}

// True when the advocate typed a full year that can't sit in this slot —
// e.g. 1999 in a form that pre-prints "202". Surfaced as a gentle note on the
// Details page rather than a hard validation error, since every field is optional.
export function yearMismatch(value, prefix) {
  const digits = (value ?? '').toString().replace(/\D/g, '')
  if (!prefix || digits.length < YEAR_LENGTH) return false
  return !digits.startsWith(prefix)
}

// Turns raw form input into the string that goes into the document.
// Dates are rendered the same way [DATE] is elsewhere in the app, so a
// hand-answered date and an autofilled one look identical on the page.
export function formatAnswer(value, field) {
  // Tolerate being handed a bare type string, as an earlier version was.
  const f = typeof field === 'string' ? { type: field, prefix: null } : (field || {})
  const v = (value ?? '').toString().trim()
  if (!v) return ''
  if (f.type === 'year') return yearSuffix(v, f.prefix)
  if (f.type === 'date') {
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
    const formatted = formatAnswer(answers?.[f.token], f)
    if (formatted) map[f.token] = formatted
  }
  return map
}
