/**
 * readiness.js — the readiness dashboard, a VIEW over the matcher
 * (Forest Builder Stage 1B, §8). Generalizes roster-coverage.js's have-vs-need
 * from per-species to PER-PART (Chassis · Bark · Leaves), granular + visual.
 *
 * A species is green-Chassis IFF matcher(dossier,'chassis') returns a workable
 * option — so the dashboard stays honest as parts ingest (it's not a separate
 * bookkeeping system; it's the matcher, summarized). Three jobs (§8):
 *   1. the 10 priority species' per-part status (🟢 in-hand / 🟡 stretch / 🔴 gap)
 *   2. "buildable today" — UNCAPPED (every species green on all parts, §1.8)
 *   3. the shopping list — which part to procure for the blocked ones (§10)
 *
 * Reads the §7.1 part-index (Stage 1A's seam) with a fixture fallback, the
 * ratified rubric + dossiers. roster-coverage.js / leaf-pack-bindings.json are
 * untouched (read context only). No writes (pure read), like /coverage.
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { matcher } from './matcher.js'

const RUBRIC = 'arborist/rubric.json'
const DOSSIERS = 'arborist/dossiers'
const PART_INDEX = 'arborist/state/part-index.json'
const PART_INDEX_FIXTURE = 'arborist/state/part-index.fixture.json'
const PART_TYPES = ['chassis', 'bark', 'leaf']
const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'))

function loadParts() {
  const path = existsSync(PART_INDEX) ? PART_INDEX : PART_INDEX_FIXTURE
  if (!existsSync(path)) return { parts: [], source: 'none' }
  return { parts: readJSON(path).parts || [], source: path }
}
const STATUS = (m) => (m.totalWorkable > 0 ? 'have' : m.options.some(o => o.verdict === 'stretch' && o.score > 0.2) ? 'stretch' : 'gap')
const GLYPH = { have: '🟢', stretch: '🟡', gap: '🔴' }
// effective = the WORSE of the live matcher and the author's declared availability.
// The matcher sees only size+silhouette (it can't tell a placeholder pack from a
// vendor one, or that the pine-needle pack is wrong for cypress) → the author's
// declared floor catches quality/stand-in gaps; the live matcher catches the
// reverse (a declared 'have' the assets don't actually back, e.g. a missing bark).
const RANK = { gap: 0, stretch: 1, have: 2 }
const worseStatus = (a, b) => (RANK[a] <= RANK[b] ? a : b)

export function computeReadiness() {
  const rubric = readJSON(RUBRIC)
  const { parts, source } = loadParts()
  const dossierFiles = readdirSync(DOSSIERS).filter(f => f.endsWith('.json'))
  const species = []

  for (const f of dossierFiles) {
    const dossier = readJSON(join(DOSSIERS, f))
    const row = { key: dossier.key, canonicalId: dossier.canonicalId, count: dossier.count || 0, inventoryNames: dossier.inventoryNames || [], parts: {}, declared: dossier.partAvailability || {} }
    for (const pt of PART_TYPES) {
      const m = matcher(rubric, dossier, pt, parts)
      const status = STATUS(m)
      const declared = (dossier.partAvailability || {})[pt] || null
      const effective = declared ? worseStatus(status, declared) : status
      const ready = effective === 'have'
      const best = m.options[0] || null
      row.parts[pt] = {
        status: effective, liveStatus: status, declared, ready,
        glyph: GLYPH[effective], liveGlyph: GLYPH[status],
        totalWorkable: m.totalWorkable,
        preselect: m.preselect,
        best: best ? { partId: best.partId, verdict: best.verdict, score: best.score, provisional: best.provisional } : null,
        diverges: declared && declared !== status,
      }
    }
    row.buildableClean = PART_TYPES.every(pt => row.parts[pt].status === 'have')      // all vendor-quality
    row.buildableWithStandins = PART_TYPES.every(pt => row.parts[pt].status !== 'gap') // no hard blocker
    species.push(row)
  }

  species.sort((a, b) => b.count - a.count)
  // BLOCKERS (🔴 — can't build at all) vs UPGRADES (🟡 — buildable now with a
  // stand-in/placeholder, quality is Stage 2/3). Splitting these is the honest
  // answer to "which are the real gaps": a 🔴 must be procured to build; a 🟡 is polish.
  const blockers = [], upgrades = []
  for (const s of species) for (const pt of PART_TYPES) {
    const cell = s.parts[pt]
    if (cell.status === 'have') continue
    const item = { species: s.key, part: pt, liveStatus: cell.liveStatus, declared: cell.declared }
    if (cell.status === 'gap') blockers.push({ ...item, reason: cell.liveStatus === 'gap' ? 'no matchable asset' : 'author-flagged gap (matcher optimistic)' })
    else upgrades.push({ ...item, reason: 'stand-in / placeholder in hand; vendor-quality piece is the Stage-2/3 polish' })
  }

  return {
    _doc: 'Forest Builder readiness dashboard (§8) — a view over the matcher. 🟢 have (vendor-quality) / 🟡 stretch (stand-in or placeholder, buildable, quality TBD) / 🔴 gap (no asset). Effective status = worse(live matcher, author declared).',
    partIndexSource: source,
    partCount: parts.length,
    speciesCount: species.length,
    buildableClean: species.filter(s => s.buildableClean).map(s => s.key),        // uncapped (§1.8)
    buildableWithStandins: species.filter(s => s.buildableWithStandins).map(s => s.key),
    blockers,   // 🔴 — the real gaps to procure
    upgrades,   // 🟡 — Stage-2/3 quality polish
    species,
  }
}

/** A plain-text dashboard for the CLI / eye. */
export function renderReadiness(r) {
  const L = []
  L.push(`Readiness — ${r.speciesCount} species over ${r.partCount} parts (${r.partIndexSource})`)
  L.push(`${'species'.padEnd(22)} ${'cnt'.padStart(3)}  Chassis  Bark  Leaves   build`)
  for (const s of r.species) {
    const cell = (pt) => `${s.parts[pt].glyph}${s.parts[pt].diverges ? '*' : ' '}`
    const b = s.buildableClean ? 'CLEAN' : s.buildableWithStandins ? 'stand-in' : '🔴'
    L.push(`${s.key.padEnd(22)} ${String(s.count).padStart(3)}    ${cell('chassis')}     ${cell('bark')}    ${cell('leaf')}      ${b}`)
  }
  L.push(`\nbuildable CLEAN (vendor-quality, ${r.buildableClean.length}): ${r.buildableClean.join(', ') || '—'}`)
  L.push(`buildable with stand-ins (${r.buildableWithStandins.length}): ${r.buildableWithStandins.join(', ') || '—'}`)
  L.push(`\n🔴 BLOCKERS — real gaps to procure (${r.blockers.length}):`)
  for (const x of r.blockers) L.push(`   ${x.species} / ${x.part} — ${x.reason}`)
  L.push(`\n🟡 UPGRADES — Stage-2/3 quality polish (${r.upgrades.length}):`)
  for (const x of r.upgrades) L.push(`   ${x.species} / ${x.part}`)
  L.push(`\n(* = live matcher diverges from the author's declared availability)`)
  return L.join('\n')
}

// CLI: node arborist/readiness.js  → print the dashboard for the eye.
if (process.argv[1] && process.argv[1].endsWith('readiness.js')) {
  console.log(renderReadiness(computeReadiness()))
}
