// rebase-overlay-measures.js — one-shot E1 overlay re-base (Lye, 2026-06-05).
//
// E1 makes the skeleton seed the WIDTH BASE (custom survey.json → OSM lanes
// → AASHTO, baked per side in skeleton.js). For the base to reach the render,
// overlay.json must hold TWEAKS ONLY — but historically it accumulated a
// measure on every chain (220/220 on LS): migrate-overlay.js broadcast
// name-keyed measures onto every chain, and _saveOverlay (pre-E1) persisted
// every chain's loaded baseline back to disk. Those machine values shadow the
// base everywhere (South 18th renders pavementHW=2 — a stale machine default
// — while survey.json holds the measured 5.73 sidewalk datum).
//
// This script deletes overlay measures that are MACHINE-GENERATED, keeping
// every operator-authored one. NO value is hand-edited; classification is a
// deterministic fingerprint over the data (the D1 repair discipline):
//
//   A. LEGACY-EQUAL  — the measure (or its pavementHW floats) replays the
//      legacy centerlines.json machine measure for the name (the
//      migrate-overlay broadcast source). South 18th's hw=2 lives here.
//   B. GENERATOR-REPLAY — the measure deep-≈ defaultMeasure(type, survey)
//      output for the street (the survey-float-as-asphalt conflation era:
//      survey pavementHalfWidth fed in verbatim as asphalt — West 18th's
//      15.616… m "asphalt").
//   C. FORMULA  — per side: sidewalk == SV_SIDEWALK and treelawn + pavementHW
//      + CURB + SV_SIDEWALK/2 lands exactly on a survey sidewalk distance
//      (the defaultSideMeasure formula, ANY-hw era). Operator drags cannot
//      produce this: applyKindToMeasure moves pavementHW without compensating
//      treelawn, so a tweak breaks the sum (verified against measureModel.js).
//   D. TYPE-DEFAULT — pavementHW is a TYPE_PAVEMENT_HW constant with default
//      ped fields (SV_TREELAWN/SV_SIDEWALK, the lawn shape, or terminal:none).
//
// A measure is dropped only when BOTH sides classify as machine. Carriageway
// entries (divided roads): the D1-zeroed inboard (pavementHW 0) counts as
// machine-shaped; the OUTER side decides — an authored outer (lafayette-
// avenue-6's reclaimed 6.70, Truman's sections) keeps the whole entry.
// Dropped measures fall through to the seed base at the next bake
// (computeStreetMeasure; carriageways re-normalize via innerEdgeAssign).
// Entries are kept on disk (name/caps/etc.) even when their measure is
// removed — runtime overlay presence keeps the legacy centerlines tier dead.
//
// Run:    node cartograph/rebase-overlay-measures.js [--root <repoRoot>] [--dry-run]
// Reads:  <root>/cartograph/data/<scene>/clean/overlay.json
//         <root>/cartograph/data/<scene>/clean/skeleton.json
//         <root>/cartograph/data/<scene>/raw/survey.json
//         <root>/cartograph/data/<scene>/raw/centerlines.json
// Writes: overlay.json in place, after a timestamped backup.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defaultMeasure, CURB_WIDTH, SV_TREELAWN, SV_SIDEWALK } from '../src/cartograph/streetProfiles.js'

const FT = 0.3048
const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const rootIdx = argv.indexOf('--root')
const ROOT = rootIdx >= 0 ? argv[rootIdx + 1] : join(dirname(fileURLToPath(import.meta.url)), '..')
const SCENE = process.env.SCENE || 'lafayette-square'

const CLEAN = join(ROOT, 'cartograph', 'data', SCENE, 'clean')
const RAW = join(ROOT, 'cartograph', 'data', SCENE, 'raw')
const OVERLAY_PATH = join(CLEAN, 'overlay.json')

const overlay = JSON.parse(readFileSync(OVERLAY_PATH, 'utf-8'))
const skeleton = JSON.parse(readFileSync(join(CLEAN, 'skeleton.json'), 'utf-8'))
const survey = existsSync(join(RAW, 'survey.json'))
  ? (JSON.parse(readFileSync(join(RAW, 'survey.json'), 'utf-8')).streets || {})
  : {}
const legacy = existsSync(join(RAW, 'centerlines.json'))
  ? (JSON.parse(readFileSync(join(RAW, 'centerlines.json'), 'utf-8')).streets || [])
  : []

const skelById = new Map((skeleton.streets || []).map(s => [s.id, s]))
const legacyMeasureByName = new Map()
for (const ls of legacy) {
  if (ls.name && ls.measure && !legacyMeasureByName.has(ls.name)) legacyMeasureByName.set(ls.name, ls.measure)
}
const surveyByName = new Map(Object.values(survey).map(s => [s.name, s]))

// Replay of derive.js's mapHighwayToStreetType (the types defaultMeasure saw).
function mapType(highway) {
  switch (highway) {
    case 'motorway': return 'motorway'
    case 'motorway_link': return 'motorway_link'
    case 'trunk': return 'trunk'
    case 'trunk_link': return 'motorway_link'
    case 'primary': case 'primary_link': return 'primary'
    case 'secondary': case 'secondary_link':
    case 'tertiary': case 'tertiary_link': return 'secondary'
    case 'service': return 'service'
    case 'footway': return 'footway'
    case 'cycleway': return 'cycleway'
    case 'pedestrian': return 'pedestrian'
    case 'steps': return 'steps'
    default: return 'residential'
  }
}
// TYPE_PAVEMENT_HW replay (not exported by streetProfiles — values pinned).
const TYPE_HW = [
  2 * 10 * FT / 2 + 7 * FT, 2 * 11 * FT / 2 + 7 * FT, 4 * 11 * FT / 2 + 8 * FT,
  7.5 * FT, 3 * FT, 5 * FT, 5 * FT, 4 * FT,
  3 * 12 * FT / 2 + 10 * FT, 16 * FT / 2, 16 * FT / 2,
]

const near = (a, b, eps = 1e-3) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < eps
const sideEq = (a, b) => !!a && !!b
  && near(a.pavementHW, b.pavementHW) && near(a.treelawn || 0, b.treelawn || 0)
  && near(a.sidewalk || 0, b.sidewalk || 0)
  && (a.terminal || 'sidewalk') === (b.terminal || 'sidewalk')
const measureEq = (a, b) => !!a && !!b && sideEq(a.left, b.left) && sideEq(a.right, b.right)

// Side SHAPE tests. The generator (defaultSideMeasure) can only emit a few
// ped shapes; an operator edit leaves them (applyKindToMeasure moves fields
// independently — a drag breaks the formula sum / produces unique floats).
const FORMULA = (sd, svDists) => {
  // positive evidence: treelawn lands the side EXACTLY on a survey sidewalk
  // distance through the generator's own formula (works for ANY hw era —
  // raw, lamp-corrected, or the max(2,…) floor)
  const tl = sd.treelawn || 0
  return near(sd.sidewalk || 0, SV_SIDEWALK)
    && svDists.some(d => near(tl + sd.pavementHW + CURB_WIDTH + SV_SIDEWALK / 2, d))
}
const LEGACY_SIDE = (sd, lm) => !!lm && (sideEq(sd, lm.left) || sideEq(sd, lm.right))
const MACHINE_SHAPE = (sd) => {
  // shapes the generator emits when it has no per-side sidewalk datum (or
  // the datum sits inside the curb — the clamp): carry no positive evidence
  // on their own, but cannot veto a machine verdict either
  const tl = sd.treelawn || 0, sw = sd.sidewalk || 0
  if (near(sd.pavementHW, 0) && near(tl, 0)) return true                       // zeroed (D1 inboard)
  if (near(tl, SV_TREELAWN) && near(sw, SV_SIDEWALK)) return true              // AASHTO defaults
  if (near(tl, 0) && near(sw, 3 * FT) && sd.terminal === 'lawn') return true   // park-edge lawn
  if (near(tl, 0) && near(sw, 0) && sd.terminal === 'none') return true        // pavement-only
  if (near(tl, 0) && near(sw, SV_SIDEWALK)) return true                        // treelawn-clamped
  return false
}

const entriesAll = Object.entries(overlay.streets || {})
const byName = new Map()
for (const [id, e] of entriesAll) {
  if (!e.name) continue
  if (!byName.has(e.name)) byName.set(e.name, [])
  byName.get(e.name).push({ id, e })
}

// A legacy centerlines measure is MACHINE only when it fingerprints as one
// (the lamp-floor/formula class — South 18th's hw=2). The legacy era's
// Measure tool also wrote genuine OPERATOR values there (name-keyed:
// Missouri's unique asymmetric floats); those are authored data and every
// broadcast copy of them stays. Without this gate, "equal to legacy" would
// conflate broadcast-FROM-legacy with legacy-was-machine.
const legacyIsMachine = new Map()
for (const [name, lm] of legacyMeasureByName) {
  const sv = surveyByName.get(name) || null
  const svDists = sv ? [sv.sidewalkLeft, sv.sidewalkRight].filter(Number.isFinite) : []
  const sides = [lm.left, lm.right].filter(Boolean)
  // generator invariant: ONE hw across sides + ≥1 side carrying positive
  // formula evidence + every side formula-or-machine-shape
  const sharedPav = sides.length < 2 || near(lm.left.pavementHW, lm.right.pavementHW)
    || near(lm.left.pavementHW, 0) || near(lm.right.pavementHW, 0)
  const anyFormula = sides.some(sd => FORMULA(sd, svDists))
  const allMachine = sides.every(sd => FORMULA(sd, svDists) || MACHINE_SHAPE(sd))
  let machine = sharedPav && anyFormula && allMachine
  // or: the whole legacy measure replays the current generator verbatim
  if (!machine && sv) {
    machine = ['residential', 'secondary', 'primary'].some(t => measureEq(lm, defaultMeasure(t, sv)))
  }
  legacyIsMachine.set(name, machine)
}

// ── Pass 1: direct fingerprints ───────────────────────────────────────────
// A. legacy-equal · B. current-generator replay · C. free-hw formula evidence
//    (≥1 side formula-positive, every side formula-or-machine-shape, pav
//    shared L/R as the generator requires) · D. machine-float + machine-shape
let kept = 0, dropped = 0, noMeasure = 0
const keptList = [], droppedList = []
const verdicts = new Map()           // id → 'drop' | 'keep'
const machinePavByName = new Map()   // name → Set of pav floats proven machine

const recordMachinePav = (name, m) => {
  if (!machinePavByName.has(name)) machinePavByName.set(name, new Set())
  const set = machinePavByName.get(name)
  for (const sd of [m.left, m.right]) {
    if (sd && Number.isFinite(sd.pavementHW) && sd.pavementHW > 0) set.add(+sd.pavementHW.toFixed(9))
  }
}

for (const [id, entry] of entriesAll) {
  const m = entry.measure
  if (!m) { noMeasure++; continue }
  const name = entry.name
  const sv = surveyByName.get(name) || null
  // legacy values participate only when the legacy measure itself proved machine
  const lm = legacyIsMachine.get(name) ? legacyMeasureByName.get(name) : null
  const legacyHWs = lm ? [lm.left?.pavementHW, lm.right?.pavementHW].filter(Number.isFinite) : []
  const svDists = sv ? [sv.sidewalkLeft, sv.sidewalkRight].filter(Number.isFinite) : []
  const svFloats = sv ? [sv.pavementHalfWidth, sv.sidewalkLeft, sv.sidewalkRight].filter(Number.isFinite) : []
  const skel = skelById.get(id)
  const type = mapType(skel?.highway)
  const sides = [m.left, m.right].filter(Boolean)

  // A. exact copy of a machine legacy measure (the broadcast)
  let machine = lm ? measureEq(m, lm) : false
  // B. current-generator replay (the survey-float-as-asphalt conflation era)
  if (!machine && sv) machine = measureEq(m, defaultMeasure(type, sv))
  // C. formula evidence at any hw: the generator shares ONE hw across sides
  if (!machine && sides.length === 2 && svDists.length) {
    const sharedPav = near(m.left.pavementHW, m.right.pavementHW)
      || near(m.left.pavementHW, 0) || near(m.right.pavementHW, 0)
    const anyFormula = sides.some(sd => FORMULA(sd, svDists))
    const allMachine = sides.every(sd => FORMULA(sd, svDists) || MACHINE_SHAPE(sd))
    if (sharedPav && anyFormula && allMachine) machine = true
  }
  // D. machine pavement float (TYPE constant / raw survey float / legacy
  //    float) with machine ped shapes on every side — or a side that is a
  //    verbatim copy of a legacy centerlines side (the broadcast smear
  //    landed legacy SIDES on divided carriageways' outer keys)
  if (!machine) {
    const pavPool = [...TYPE_HW, ...svFloats, ...legacyHWs]
    machine = sides.every(sd =>
      LEGACY_SIDE(sd, lm)
      || ((MACHINE_SHAPE(sd) || FORMULA(sd, svDists))
        && (near(sd.pavementHW, 0) || pavPool.some(v => near(sd.pavementHW, v)))))
  }

  if (machine) { verdicts.set(id, 'drop'); recordMachinePav(name, m) }
}

// Machine legacy floats join the pool even when no entry replays them whole.
for (const [name, lm] of legacyMeasureByName) {
  if (!legacyIsMachine.get(name)) continue
  for (const v of [lm.left?.pavementHW, lm.right?.pavementHW]) {
    if (Number.isFinite(v) && v > 0) {
      if (!machinePavByName.has(name)) machinePavByName.set(name, new Set())
      machinePavByName.get(name).add(+v.toFixed(9))
    }
  }
}

// ── Pass 2: broadcast residue by float identity ───────────────────────────
// A pav float PROVEN machine on one chain of a name is machine on all of
// them (migrate-overlay / the save-broadcast spread one value verbatim).
// Applies only where every side is a machine shape — a side with edited ped
// fields keeps its entry. Operator-era values that merely repeat across
// chains are NOT residue (the legacy era was name-keyed: one authored value
// legitimately covers all chains), so bare repetition does not drop.
// NOTE: where the pool proves residue on a carriageway OUTER, this revises
// D1's "keep outer residue" disposition — E1 puts a real width base (the
// seed) underneath, so a stale machine outer no longer needs keeping as the
// only datum.
for (const [name, group] of byName) {
  const remaining = group.filter(({ id, e }) => e.measure && !verdicts.has(id))
  if (!remaining.length) continue
  const pool = machinePavByName.get(name) || new Set()
  if (!pool.size) continue
  for (const { id, e } of remaining) {
    const m = e.measure
    const sv = surveyByName.get(name) || null
    const lm = legacyIsMachine.get(name) ? legacyMeasureByName.get(name) : null
    const svDists = sv ? [sv.sidewalkLeft, sv.sidewalkRight].filter(Number.isFinite) : []
    const sides = [m.left, m.right].filter(Boolean)
    const residue = sides.every(sd => {
      if (LEGACY_SIDE(sd, lm)) return true
      if (!(MACHINE_SHAPE(sd) || FORMULA(sd, svDists))) return false
      if (near(sd.pavementHW, 0)) return true
      return pool.has(+sd.pavementHW.toFixed(9))
    })
    if (residue) verdicts.set(id, 'drop')
  }
}

// ── Apply ──────────────────────────────────────────────────────────────────
for (const [id, entry] of entriesAll) {
  const m = entry.measure
  if (!m) continue
  const tag = `${id}  L:${m.left?.pavementHW ?? '—'} R:${m.right?.pavementHW ?? '—'}`
  if (verdicts.get(id) === 'drop') {
    droppedList.push(tag)
    dropped++
    if (!dryRun) delete entry.measure
  } else {
    keptList.push(tag)
    kept++
  }
}

console.log(`overlay entries: ${Object.keys(overlay.streets || {}).length} (${noMeasure} without measure)`)
console.log(`\nDROPPED → seed base (${dropped} machine measures):`)
for (const t of droppedList) console.log(`  ${t}`)
console.log(`\nKEPT (operator-authored, ${kept}):`)
for (const t of keptList) console.log(`  ${t}`)

if (dryRun) {
  console.log('\n--dry-run: nothing written.')
} else {
  const backup = `${OVERLAY_PATH}.backup-${Date.now()}`
  copyFileSync(OVERLAY_PATH, backup)
  writeFileSync(OVERLAY_PATH, JSON.stringify(overlay, null, 2))
  console.log(`\nBackup: ${backup}`)
  console.log(`Wrote:  ${OVERLAY_PATH}`)
}
