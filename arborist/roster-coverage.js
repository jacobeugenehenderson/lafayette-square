/**
 * roster-coverage.js — the shared roster↔library↔routing join (Brief 24
 * Cadastre, lifted into a module for Brief 26 per AC5 "one shared helper").
 *
 * Computes, live + read-only, the comparison hand-maintained in
 * ROSTER-COVERAGE.md: one row per CANONICALIZED Lafayette Square park species
 * (cartograph/data/lafayette-square/clean/park_census.json, merged via roster-name-canon.json), each tagged
 * literal / composite / gap with covering library species + park_species_map
 * routing. Brief 24's `GET /coverage` is a thin wrapper over computeCoverage().
 *
 * Brief 26 (Roster-driven Salon) additions, per the SETTLED keying spine
 * (canonical-id-per-roster-species, operator decision 2026-05-25):
 *   - `canonicalId` per roster species = a deterministic SLUG of the canonical
 *     roster name (`Oak, Pin` → `oak_pin`). One distinct id per roster species
 *     (Pin Oak ≠ Willow Oak), no botanical auto-guess. This is the on-disk key
 *     compositions are authored under (`state/<canonicalId>/compositions.json`
 *     → `public/trees/<canonicalId>`). The operator may later hand-rename an
 *     entry to a botanical id in park_species_map.json.
 *   - `recommendedChassis` = chassis names whose `source.species` is one of the
 *     roster species' covering library ids (the literal/cousin candidates). The
 *     navigator's "recommended ↔ show-all" toggle intersects this with the full
 *     chassis catalog.
 *   - `authoringState` = 'composed' (an authored composition exists under the
 *     canonical id) / 'not-available' (operator marked it a deliberate gap —
 *     park_species_map[rosterName] === []) / 'unauthored' (neither).
 *
 * No writes here (pure read). The routing write (park_species_map) lives in
 * serve.js's POST /coverage/:rosterName/routing.
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { listChassis } from './generate-salon.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT        = join(__dirname, '..')
const STATE_DIR   = join(__dirname, 'state')
const PUBLIC_TREES = join(ROOT, 'public', 'trees')
const ROSTER_CANON = join(__dirname, 'roster-name-canon.json')
// Roster + routing are per-NEIGHBOURHOOD (scene): each scene keeps its own census
// + species-map under cartograph/data/<scene>/. Only scenes with a clean
// park_census.json yield a roster; others read empty (honest zero) until their
// census source is wired. DEFAULT_SCENE keeps pre-scene callers working.
export const DEFAULT_SCENE = 'lafayette-square'
export const parkMapForScene = (scene) => join(ROOT, 'cartograph', 'data', scene, 'tree-species-map.json')
const parkTreesForScene = (scene) => join(ROOT, 'cartograph', 'data', scene, 'clean', 'park_census.json')
const INDEX_PATH   = join(PUBLIC_TREES, 'index.json')

function readJsonOrNull(p) {
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null }
}

// Deterministic canonical-id slug from a canonical roster name. Brief 26's
// settled keying spine: `Oak, Pin` → `oak_pin`, `Ash, Green` → `ash_green`,
// `Maple, Red 'October Glory'` → `maple_red_october_glory`. Distinct per
// roster species; not a latin claim (the operator can rename to a botanical
// id in park_species_map.json afterward).
export function slugifyRoster(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// Token-match identity heuristic (Brief 24 chosen rule): literal iff the park
// name's distinctive tokens (genus stopword removed) all appear in a routed
// library id's id/label/scientific text; bare-genus names fall back to the
// genus token. Imperfect on cultivars; a wrong map entry surfaces as composite.
const GENUS_STOP = new Set([
  'maple', 'oak', 'pine', 'linden', 'birch', 'elm', 'spruce', 'willow',
  'juniper', 'cypress', 'locust', 'poplar', 'cottonwood', 'dogwood',
  'magnolia', 'cherry', 'ash', 'fir', 'beech', 'plane', 'sycamore',
])
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const toks = (s) => norm(s).split(' ').filter(Boolean)

export async function computeCoverage(scene = DEFAULT_SCENE) {
  const PARK_TREES = parkTreesForScene(scene)
  const PARK_MAP   = parkMapForScene(scene)
  // ── Roster (what we're supposed to have) ────────────────────────────────
  const trees = readJsonOrNull(PARK_TREES)?.trees || []
  const canon = readJsonOrNull(ROSTER_CANON)?.canon || {}
  const canonize = (raw) => canon[raw] || raw
  const byCanon = new Map()   // canonical -> { count, rawNames:Set }
  for (const t of trees) {
    const raw = t.species || 'unknown'
    const c = canonize(raw)
    if (!byCanon.has(c)) byCanon.set(c, { count: 0, rawNames: new Set() })
    const e = byCanon.get(c)
    e.count++
    e.rawNames.add(raw)
  }

  // ── Routing (park_species_map, keyed by raw name) ───────────────────────
  const speciesMap = readJsonOrNull(PARK_MAP)?.map || {}

  // ── Library (what we literally have) ────────────────────────────────────
  const idx = readJsonOrNull(INDEX_PATH)?.species || []
  const libById = new Map()   // libId -> { label, scientific }
  const published = new Set()
  for (const s of idx) {
    published.add(s.species)
    libById.set(s.species, { label: s.label || null, scientific: s.scientific || null })
  }
  const chassis = await listChassis()
  const chassisCountBySpecies = new Map()      // libId -> n
  const chassisSpeciesByName = new Map()       // chassisName -> source.species
  const chassisNamesBySpecies = new Map()      // libId -> [chassisName]
  for (const c of chassis) {
    const sp = c.source?.species || null
    chassisSpeciesByName.set(c.name, sp)
    if (sp) {
      chassisCountBySpecies.set(sp, (chassisCountBySpecies.get(sp) || 0) + 1)
      if (!chassisNamesBySpecies.has(sp)) chassisNamesBySpecies.set(sp, [])
      chassisNamesBySpecies.get(sp).push(c.name)
    }
  }
  // Authored compositions on disk (may be unpublished). dir name = library
  // species id; literal-per-composition = bound chassis's source.species === id.
  const compositionsBySpecies = new Map()      // libId -> [{slot,name,chassis,literal}]
  let stateEntries = []
  try { stateEntries = readdirSync(STATE_DIR, { withFileTypes: true }) } catch {}
  for (const ent of stateEntries) {
    if (!ent.isDirectory()) continue
    const comp = readJsonOrNull(join(STATE_DIR, ent.name, 'compositions.json'))
    const list = Array.isArray(comp?.compositions) ? comp.compositions : []
    if (!list.length) continue
    compositionsBySpecies.set(ent.name, list.map(co => ({
      slot: co.slot ?? null,
      name: co.name || null,
      chassis: co.chassis || null,
      literal: !!(co.chassis && chassisSpeciesByName.get(co.chassis) === ent.name),
    })))
  }
  const libExists = (id) =>
    published.has(id) || (chassisCountBySpecies.get(id) || 0) > 0 || compositionsBySpecies.has(id)

  const libText = (id) => {
    const e = libById.get(id)
    return norm([id, e?.label, e?.scientific].filter(Boolean).join(' '))
  }
  const literalMatch = (parkName, routedExisting) => {
    const ptoks = toks(parkName)
    const distinct = ptoks.filter(t => !GENUS_STOP.has(t))
    const need = distinct.length ? distinct : ptoks
    for (const id of routedExisting) {
      const text = libText(id)
      const words = text.split(' ').filter(Boolean)
      const concat = text.replace(/\s+/g, '')
      const ok = need.every(t =>
        words.some(w => w === t || w.includes(t) || t.includes(w)) || concat.includes(t))
      if (ok) return id
    }
    return null
  }

  // ── Forest Builder per-part readiness (§8) — folded in for dossier-backed
  // species. The matcher's Chassis·Bark·Leaves status, keyed back to the roster
  // by the dossier's inventoryNames. Defensive: coverage still works if the
  // Forest Builder data (rubric / part-index / dossiers) is absent.
  const fbByRoster = new Map()
  try {
    const { computeReadiness } = await import('./readiness.js')
    for (const r of computeReadiness().species) {
      const fb = { parts: r.parts, buildableClean: r.buildableClean, buildableWithStandins: r.buildableWithStandins }
      for (const inv of (r.inventoryNames || [])) fbByRoster.set(canonize(inv), fb)
    }
  } catch { /* Forest Builder data not present — skip the per-part fold */ }

  // ── Join ────────────────────────────────────────────────────────────────
  const species = []
  for (const [canonical, { count, rawNames }] of byCanon) {
    // Routed library ids: union across merged raw names, order-preserving.
    const routed = []
    let hasMapKey = false
    for (const raw of rawNames) {
      if (raw in speciesMap) hasMapKey = true
      for (const id of (speciesMap[raw] || [])) if (!routed.includes(id)) routed.push(id)
    }
    const routing = routed.map(id => ({
      libId: id,
      label: libById.get(id)?.label || null,
      published: published.has(id),
      chassisCount: chassisCountBySpecies.get(id) || 0,
      compositionCount: (compositionsBySpecies.get(id) || []).length,
      dangling: !libExists(id),
    }))
    const routedExisting = routed.filter(libExists)
    const dangling = routing.filter(r => r.dangling).map(r => r.libId)

    const coverage = routedExisting.length === 0
      ? 'gap'
      : (literalMatch(canonical, routedExisting) ? 'literal' : 'composite')

    const covering = routedExisting.map(id => ({
      libId: id,
      label: libById.get(id)?.label || null,
      published: published.has(id),
      chassisCount: chassisCountBySpecies.get(id) || 0,
      compositions: compositionsBySpecies.get(id) || [],
    }))

    // ── Brief 26 fields ────────────────────────────────────────────────────
    const canonicalId = slugifyRoster(canonical)
    // Recommended chassis = chassis whose source.species is one of the covering
    // (routed-existing) library ids — the literal/cousin candidates for this
    // roster species. De-duped, order follows covering (literal-ish first).
    const recommendedChassis = []
    for (const id of routedExisting) {
      for (const cn of (chassisNamesBySpecies.get(id) || [])) {
        if (!recommendedChassis.includes(cn)) recommendedChassis.push(cn)
      }
    }
    // Authoring state under the canonical id.
    const authored = compositionsBySpecies.get(canonicalId) || []
    const hasAuthoredChassis = authored.some(c => c.chassis)
    // not-available marker: an EMPTY routing array authored against any of this
    // species' raw names (operator's deliberate "no tree" gesture).
    const markedNotAvailable = [...rawNames].some(
      raw => (raw in speciesMap) && Array.isArray(speciesMap[raw]) && speciesMap[raw].length === 0,
    )
    const authoringState = hasAuthoredChassis ? 'composed'
      : (markedNotAvailable ? 'not-available' : 'unauthored')
    const publishedCanonical = published.has(canonicalId)

    species.push({
      species: canonical,
      count,
      mergedFrom: [...rawNames].sort(),
      coverage,
      covering,
      routing,
      mapMissing: !hasMapKey,
      dangling,
      // Forest Builder per-part readiness (§8) — null unless this roster species
      // has a dossier; { parts:{chassis,bark,leaf}, buildableClean, buildableWithStandins }.
      forestBuilder: fbByRoster.get(canonical) || null,
      // Brief 26
      canonicalId,
      recommendedChassis,
      authoringState,
      publishedCanonical,
    })
  }
  species.sort((a, b) => b.count - a.count || a.species.localeCompare(b.species))

  const summary = {
    totalPlacements: trees.length,
    canonicalSpecies: species.length,
    rawNames: new Set(trees.map(t => t.species || 'unknown')).size,
    literal:   species.filter(s => s.coverage === 'literal').length,
    composite: species.filter(s => s.coverage === 'composite').length,
    gap:       species.filter(s => s.coverage === 'gap').length,
    merges:    Object.keys(canon).length,
    composed:     species.filter(s => s.authoringState === 'composed').length,
    notAvailable: species.filter(s => s.authoringState === 'not-available').length,
  }
  return { summary, species }
}
