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

export function computeReadiness() {
  const rubric = readJSON(RUBRIC)
  const { parts, source } = loadParts()
  const dossierFiles = readdirSync(DOSSIERS).filter(f => f.endsWith('.json'))
  const species = []

  for (const f of dossierFiles) {
    const dossier = readJSON(join(DOSSIERS, f))
    const row = { key: dossier.key, canonicalId: dossier.canonicalId, count: dossier.count || 0, parts: {}, declared: dossier.partAvailability || {} }
    for (const pt of PART_TYPES) {
      const m = matcher(rubric, dossier, pt, parts)
      const status = STATUS(m)
      const best = m.options[0] || null
      row.parts[pt] = {
        status, glyph: GLYPH[status],
        totalWorkable: m.totalWorkable,
        preselect: m.preselect,
        best: best ? { partId: best.partId, verdict: best.verdict, score: best.score, provisional: best.provisional } : null,
        // divergence: the live matcher vs the Stage-0 author's declared availability
        declared: (dossier.partAvailability || {})[pt] || null,
        diverges: ((dossier.partAvailability || {})[pt] || null) && (dossier.partAvailability[pt] !== status),
      }
    }
    row.buildableToday = PART_TYPES.every(pt => row.parts[pt].status === 'have')
    species.push(row)
  }

  species.sort((a, b) => b.count - a.count)
  const buildableToday = species.filter(s => s.buildableToday).map(s => s.key)
  // shopping list: every blocked (🟡/🔴) cell → what to procure
  const shoppingList = []
  for (const s of species) for (const pt of PART_TYPES) {
    if (s.parts[pt].status !== 'have') shoppingList.push({ species: s.key, part: pt, status: s.parts[pt].status, need: s.parts[pt].declared })
  }

  return {
    _doc: 'Forest Builder readiness dashboard (§8) — a view over the matcher. status 🟢 have / 🟡 stretch / 🔴 gap, computed live from the part-index.',
    partIndexSource: source,
    partCount: parts.length,
    speciesCount: species.length,
    buildableToday,              // uncapped (§1.8)
    shoppingList,
    species,
  }
}

/** A plain-text dashboard for the CLI / eye. */
export function renderReadiness(r) {
  const L = []
  L.push(`Readiness — ${r.speciesCount} species over ${r.partCount} parts (${r.partIndexSource})`)
  L.push(`${'species'.padEnd(22)} ${'cnt'.padStart(3)}  Chassis  Bark  Leaves   buildable`)
  for (const s of r.species) {
    const cell = (pt) => `${s.parts[pt].glyph}${s.parts[pt].diverges ? '*' : ' '}`
    L.push(`${s.key.padEnd(22)} ${String(s.count).padStart(3)}    ${cell('chassis')}     ${cell('bark')}    ${cell('leaf')}      ${s.buildableToday ? 'YES' : '—'}`)
  }
  L.push(`\nbuildable today (${r.buildableToday.length}): ${r.buildableToday.join(', ') || '—'}`)
  L.push(`shopping list (${r.shoppingList.length}): ` + r.shoppingList.map(x => `${x.species}/${x.part}[${x.status}]`).join('  '))
  L.push(`(* = live matcher diverges from the dossier's declared availability)`)
  return L.join('\n')
}

// CLI: node arborist/readiness.js  → print the dashboard for the eye.
if (process.argv[1] && process.argv[1].endsWith('readiness.js')) {
  console.log(renderReadiness(computeReadiness()))
}
