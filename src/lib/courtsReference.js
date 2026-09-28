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
}

// Distinct areas, sorted. Derived from the rows rather than stored separately
// so a newly seeded court brings its area along with it automatically.
export function areasOf(courts) {
  return [...new Set(courts.map(c => c.area))].sort((a, b) => a.localeCompare(b))
}

// Court names available under the current filters. Names are unique per area,
// so filtering by area first is what keeps the list short enough to scan.
export function courtNamesFor(courts, { area, type } = {}) {
  return courts
    .filter(c => (!area || c.area === area) && (!type || c.court_type === type))
    .map(c => c.court_name)
}

export function findCourt(courts, { name, area } = {}) {
  if (!name) return null
  const hits = courts.filter(c => c.court_name === name && (!area || c.area === area))
  // Without an area a name can be ambiguous across districts; returning the
  // single hit only when there is exactly one keeps the caller from silently
  // picking the wrong district's court.
  return hits.length === 1 ? hits[0] : null
}
