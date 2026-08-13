#!/usr/bin/env node
/**
 * ⛔ THE CLAIM UNDER TEST: "a re-pour keeps the whole backend attached to the buildings."
 *
 * ⭐ WHY IT IS NOT A COUNT. `A01`'s ticket exists because `promote-ribbons.js`'s clobber
 * guard compares COUNTS, so a same-count different-geometry promote passes SILENTLY —
 * 57 streets came back with different points under a guard that saw 7 identical totals.
 * A building guard that counts 1082 → 1082 would repeat that defect on the one artifact
 * where it costs the most. ⇒ this diffs the ID SET and the POSITIONS. The count is
 * printed as context and is never the verdict.
 *
 * ⭐ WHY IDENTITY OUTRANKS GEOMETRY. `ORIENTATION`: a neighborhood is "a collection of
 * structures connected by people-run accounts… enlivened by their soft contents", and
 * "losing soft contents outranks losing geometry". Content, claims, cards and anchors
 * all key off `projectId`. A building whose ring shifts 2 cm is cosmetic; a building
 * whose id vanishes takes its residents' posts with it. LOST is therefore the loudest
 * class here, and it is fatal on its own.
 *   Precedent, not hypothesis: a frame-origin move once took a hood from 84 anchors to 5.
 *   The origin may GROW or SHRINK; it must NEVER MOVE (`EXTENT-DESIGN`).
 *
 * ⛔ NOT A MEMBERSHIP CHECKER. Whether a building SHOULD be in the hood is
 * `cartograph/membership.mjs` + `scratch/a08-membership-equivalence.mjs`. This asks only
 * whether the re-pour CHANGED the answer. Run both; they fail differently.
 *
 * USAGE — the baseline must be taken BEFORE the re-pour, or there is nothing to compare
 * against (`feedback_verify_the_baseline_before_comparing_to_it`):
 *
 *   node scratch/claims-building-identity-survives-repour.mjs --scene lafayette-square --snapshot
 *   node cartograph/pipeline.js --scene=lafayette-square
 *   node scratch/claims-building-identity-survives-repour.mjs --scene lafayette-square --against
 *
 * Snapshots land in scratch/_snapshots/<scene>-buildings.json (gitignored territory;
 * they are evidence for one run, not an artifact).
 *
 * Exit 0 = identity intact · 1 = identity changed · 2 = NOT MEASURED (nothing to compare,
 * or the scene carries no such artifact). ⛔ 2 is never "pass" — a scene that cannot be
 * measured must not read as a clean one.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SNAP_DIR = path.join(ROOT, 'scratch', '_snapshots')

// Retired for currency, not truth: these two were poured for a pitch that has been made
// (Jacob, 2026-08-13). ⛔ Never size a class on them — report CHILLERED, never a number,
// so a future reader cannot mistake "out of scope" for "measured and fine".
const CHILLERED = new Set(['ksi-y-m-yn', 'centrum'])

const argv = process.argv.slice(2)
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] ?? true) : d }
const MODE = argv.includes('--snapshot') ? 'snapshot' : argv.includes('--against') ? 'against' : null
const MOVE_TOL = Number(arg('--tol', 0.01))   // m — below this a vertex moved by grid snap, not by a reprojection

function scenesFrom() {
  const explicit = arg('--scene')
  if (explicit && explicit !== true) return [explicit]
  const dir = path.join(ROOT, 'cartograph', 'data')
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(s => fs.existsSync(mapPathOf(s))) : []
}
const mapPathOf = (scene) => path.join(ROOT, 'cartograph', 'data', scene, 'clean', 'map.json')
const snapPathOf = (scene) => path.join(SNAP_DIR, `${scene}-buildings.json`)

/** Identity + placement, per building. `ring` is the poured footprint; `projectId` is
 *  the key every content join uses. Centroid rather than ring[0] so a re-ordered but
 *  geometrically identical ring does not read as movement. */
function readBuildings(scene) {
  const p = mapPathOf(scene)
  if (!fs.existsSync(p)) return { ok: false, why: 'no clean/map.json' }
  let m
  try { m = JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return { ok: false, why: `unreadable: ${e.message}` } }
  const list = Array.isArray(m.buildings) ? m.buildings : null
  if (!list) return { ok: false, why: 'artifact carries no `buildings` array' }
  const out = new Map()
  let unkeyed = 0
  for (const b of list) {
    const id = b.projectId ?? b.id ?? null
    if (id == null) { unkeyed++; continue }
    const ring = b.ring || b.footprint || b.coords || []
    let sx = 0, sz = 0, n = 0
    for (const v of ring) {
      const x = Array.isArray(v) ? v[0] : v?.x, z = Array.isArray(v) ? v[1] : v?.z
      if (Number.isFinite(x) && Number.isFinite(z)) { sx += x; sz += z; n++ }
    }
    out.set(String(id), {
      cx: n ? +(sx / n).toFixed(4) : null,
      cz: n ? +(sz / n).toFixed(4) : null,
      nv: ring.length,
      elev: Number.isFinite(b.elev) ? +b.elev.toFixed(3) : null,
    })
  }
  return { ok: true, buildings: out, unkeyed, total: list.length }
}

function snapshot(scene) {
  const r = readBuildings(scene)
  if (!r.ok) { console.log(`  ⛔ NOT MEASURED — ${r.why}`); return 2 }
  fs.mkdirSync(SNAP_DIR, { recursive: true })
  fs.writeFileSync(snapPathOf(scene), JSON.stringify({
    scene, takenAgainst: 'pre-repour', total: r.total, unkeyed: r.unkeyed,
    buildings: Object.fromEntries(r.buildings),
  }, null, 0))
  console.log(`  baseline written — ${r.buildings.size} keyed buildings${r.unkeyed ? `, ⚠️ ${r.unkeyed} UNKEYED (they cannot be tracked)` : ''}`)
  console.log(`  → ${path.relative(ROOT, snapPathOf(scene))}`)
  return 0
}

function compare(scene) {
  const sp = snapPathOf(scene)
  if (!fs.existsSync(sp)) {
    console.log(`  ⛔ NOT MEASURED — no baseline. Take one BEFORE the re-pour:`)
    console.log(`     node scratch/claims-building-identity-survives-repour.mjs --scene ${scene} --snapshot`)
    return 2
  }
  const base = JSON.parse(fs.readFileSync(sp, 'utf8'))
  const now = readBuildings(scene)
  if (!now.ok) { console.log(`  ⛔ NOT MEASURED — ${now.why}`); return 2 }

  const before = new Map(Object.entries(base.buildings))
  const after = now.buildings
  const lost = [...before.keys()].filter(k => !after.has(k))
  const gained = [...after.keys()].filter(k => !before.has(k))

  const moved = []
  let exact = 0, subTol = 0
  for (const [id, a] of after) {
    const b = before.get(id); if (!b) continue
    if (a.cx == null || b.cx == null) continue
    const d = Math.hypot(a.cx - b.cx, a.cz - b.cz)
    if (d === 0) exact++
    else if (d < MOVE_TOL) subTol++
    else moved.push({ id, d, dv: a.nv - b.nv, de: (a.elev ?? 0) - (b.elev ?? 0) })
  }
  moved.sort((x, y) => y.d - x.d)

  console.log(`  count ${before.size} → ${after.size}   (context only — never the verdict)`)
  console.log(`  identity   LOST ${lost.length}   GAINED ${gained.length}`)
  console.log(`  placement  exact ${exact} · <${MOVE_TOL}m ${subTol} · MOVED ${moved.length}`)
  if (moved.length) {
    console.log(`  worst movers:`)
    for (const m of moved.slice(0, 10))
      console.log(`     ${m.id.padEnd(14)} ${m.d.toFixed(3)} m   Δverts ${m.dv >= 0 ? '+' : ''}${m.dv}   Δelev ${m.de.toFixed(3)}`)
  }
  if (lost.length) {
    console.log(`  ⛔⛔ LOST IDS — these take their content with them:`)
    console.log(`     ${lost.slice(0, 20).join(' ')}${lost.length > 20 ? ` …+${lost.length - 20}` : ''}`)
  }
  if (gained.length) console.log(`  ⚠️  GAINED: ${gained.slice(0, 20).join(' ')}${gained.length > 20 ? ` …+${gained.length - 20}` : ''}`)

  // ⭐ A whole-set shift is the frame-origin failure and it is qualitatively different
  // from a few buildings moving: it reprojects everything at once and re-orders identity.
  if (moved.length && moved.length === (exact + subTol + moved.length)) {
    console.log(`  ⛔⛔ EVERY building moved — that is a FRAME-ORIGIN shift, not a geometry delta.`)
    console.log(`      The origin may grow or shrink; it must never MOVE. Stop and check the extent.`)
  }

  const bad = lost.length || gained.length || moved.length
  console.log(bad ? `  ⛔ FAIL — identity or placement changed.` : `  ✅ PASS — every id survived, nothing moved past ${MOVE_TOL} m.`)
  return bad ? 1 : 0
}

if (!MODE) {
  console.log('usage: --scene <name> (--snapshot | --against) [--tol 0.01]')
  process.exit(2)
}
console.log(`\nBUILDING IDENTITY ACROSS A RE-POUR — ${MODE === 'snapshot' ? 'taking baseline' : 'comparing to baseline'}\n`)
let worst = 0
for (const scene of scenesFrom()) {
  console.log(`══ ${scene}`)
  if (CHILLERED.has(scene)) { console.log('   ⛔ CHILLERED — not measured, and not a number. Skipping.\n'); continue }
  const rc = MODE === 'snapshot' ? snapshot(scene) : compare(scene)
  worst = Math.max(worst, rc)
  console.log('')
}
process.exit(worst)
