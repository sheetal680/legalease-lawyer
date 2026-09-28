// The courts reference list, read from the database rather than hardcoded.
//
// A client's court used to be typed by hand against a static map in
// courts.js. It is now picked from this table, which means every client
// carries the court's *type* as well as its name — so documents can be
// filtered by the kind of court they belong in.
//
// Rows are added by scripts/seedCourts.js in the admin repo (edit
// scripts/data/courts.js, re-run the script). Nothing here writes.

import { supabase } from './supabase'

// Mirrors the CHECK constraint on both courts.court_type and
// clients.court_type. If this list and the constraint ever disagree, the
// database is right and this is stale.
export const COURT_TYPES = [
  'Supreme Court',
  'High Court',
  'District & Subordinate',
  'Tribunal & Special',
  'Family Court',
]

export async function listCourts() {
  return supabase
    .from('courts')
    .select('id, court_type, court_name, area')
    .order('area')
    .order('court_name')
    // PostgREST caps an unbounded select at 1000 rows and says nothing about
    // it. The table already holds ~720, so without this the list would start
    // silently losing courts off the end as more are added — and a court
    // missing from the picker is invisible, not an error.
    .limit(5000)
}

// Distinct areas, sorted. Derived from the rows rather than stored separately
// so a newly seeded court brings its area along with it automatically.
export function areasOf(courts) {
  return [...new Set(courts.map(c => c.area))].sort((a, b) => a.localeCompare(b))
}

// Court names available under the current filters.
//
// Deduplicated. The same court name legitimately appears under more than one
// area — a city listed under two spellings, a court serving a district and its
// seat — and the name already carries its place ("Labour Court, Vijayawada"),
// so repeats are the same entry twice, not two choices. Leaving them in also
// gave the picker duplicate React keys, which made the rendered list disagree
// with the filter: typing "labour" showed courts with no "labour" in the name.
export function courtNamesFor(courts, { area, type } = {}) {
  return [...new Set(
    courts
      .filter(c => (!area || c.area === area) && (!type || c.court_type === type))
      .map(c => c.court_name)
  )]
}

export function findCourt(courts, { name, area } = {}) {
  if (!name) return null
  const hits = courts.filter(c => c.court_name === name && (!area || c.area === area))
  // Without an area a name can be ambiguous across districts; returning the
  // single hit only when there is exactly one keeps the caller from silently
  // picking the wrong district's court.
  return hits.length === 1 ? hits[0] : null
}

// ── Template court matching ────────────────────────────────────────
//
// A template's court_types says which kinds of court the form is filed in.
// NULL means untagged, and untagged means valid EVERYWHERE — never nowhere.
// A form nobody has classified yet must still be reachable: a missing tag is
// an absence of knowledge, not a statement that the form belongs in no court.
//
// The database refuses to store an empty array for the same reason, so NULL is
// the only untagged representation. This still treats a non-array or an empty
// one as untagged, because the cost of being wrong in that direction is a
// template the advocate has to scroll past, and the cost of being wrong the
// other way is a form that has silently vanished when they need it.
export function templateAllowedInCourtType(template, courtType) {
  const types = template?.court_types
  if (!Array.isArray(types) || types.length === 0) return true
  // No court chosen on the client yet — filtering by nothing hides nothing.
  if (!courtType) return true
  return types.includes(courtType)
}

// Filters a template list for a client's court. Passing no court type, or a
// client with no court recorded, returns the list untouched.
export function templatesForCourtType(templates, courtType) {
  if (!courtType) return templates
  return templates.filter(t => templateAllowedInCourtType(t, courtType))
}
