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
  // ⛔ KIT DEFECT FOUND 2026-08-14 (Tally), FIXED HERE: this read
  // `b.projectId ?? b.id` only. A scene whose buildings come from MSBF rather
  // than a curated project file keys on `msbfId`, so this guard reported
  // lafayette-square-staging as "0 keyed, 772 UNKEYED" — i.e. BLIND on exactly
  // the towns it exists to protect. LS carries projectId because LS is the mould.
  // EXTENT-DESIGN §3.3 names msbfId as the identity lock in its own words:
  // "on any re-fetch, retained footprints keep their msbfId and dropped ones keep
  // reserved numbers — verified". The guard was not checking the lock the canon
  // relies on. ⇒ surfaced to Boz as ASPIRATION (an identity lock documented as
  // verified, unenforced by the guard on any msbf scene), not settled by a doc edit.
  // ⭐ The NAMESPACE is recorded and asserted below — mixing key spaces across a
  // pour would make "0 lost" meaningless, so a namespace change is itself fatal.
  const keyOf = (b) => b.projectId != null ? ['projectId', b.projectId]
    : b.id != null ? ['id', b.id]
      : b.msbfId != null ? ['msbfId', b.msbfId] : [null, null]
  const spaces = new Set()
  for (const b of list) {
    const [space, id] = keyOf(b)
    if (id == null) { unkeyed++; continue }
    spaces.add(space)
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
  return { ok: true, buildings: out, unkeyed, total: list.length, keySpace: [...spaces].sort().join('+') || 'none' }
}


// ⭐⭐ GATE 1 (Tally, 2026-08-14) — THE FRAME ORIGIN, AS A CHECK RATHER THAN AN
// INSTRUCTION. EXTENT-DESIGN §3.3: the origin "may grow or shrink; it must NEVER
// MOVE … only moving the origin reprojects everything at once and re-orders
// identity (the 84→5 content death). 'Never move the center' is the whole content
// safeguard."
// ⛔ THAT SENTENCE PROTECTS US ONCE, IF THE RIGHT PERSON READS THE RIGHT DOC. A
// street-graph job never opens the Extent doc. So the constraint travels with the
// OPERATION instead of the subject: every pour, every town, forever.
// ⭐ WHAT THE ORIGIN ACTUALLY IS, and it is NOT the disc `center`: the frozen
// fetch centre plus its projection scalars, geography.json {lat, lon,
// lonToMeters, latToMeters} (serve.js:1493-1503 — the disc centre is stored
// OFF-ORIGIN precisely so the frame never moves). `bbox` is the fetch EXTENT and
// is allowed to grow or shrink, so it is deliberately NOT asserted — asserting it
// would forbid the two operations the doctrine permits.
function frameOrigin(scene) {
  const p = path.join(ROOT, 'cartograph', 'data', scene, 'geography.json')
  if (!fs.existsSync(p)) return { ok: false, why: `no geography.json at ${path.relative(ROOT, p)}` }
  let g
  try { g = JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return { ok: false, why: `geography.json unreadable: ${e.message}` } }
  const fields = ['lat', 'lon', 'lonToMeters', 'latToMeters']
  const missing = fields.filter(f => g[f] === undefined)
  if (missing.length) return { ok: false, why: `geography.json lacks ${missing.join(', ')}` }
  // BYTE-identical, not float-tolerant. A tolerance here is a licence to drift.
  const canon = JSON.stringify(Object.fromEntries(fields.map(f => [f, g[f]])))
  return { ok: true, canon, fields: Object.fromEntries(fields.map(f => [f, g[f]])) }
}
const showOrigin = (fo) => fo.ok
  ? `lat ${fo.fields.lat} · lon ${fo.fields.lon} · lonToMeters ${fo.fields.lonToMeters} · latToMeters ${fo.fields.latToMeters}`
  : `⛔ ${fo.why}`

function snapshot(scene) {
  const fo = frameOrigin(scene)
  console.log(`  FRAME ORIGIN  ${showOrigin(fo)}`)
  if (!fo.ok) { console.log(`  ⛔ NOT MEASURED — the origin cannot be read, so it cannot be protected.`); return 2 }
  const r = readBuildings(scene)
  if (!r.ok) { console.log(`  ⛔ NOT MEASURED — ${r.why}`); return 2 }
  fs.mkdirSync(SNAP_DIR, { recursive: true })
  fs.writeFileSync(snapPathOf(scene), JSON.stringify({
    scene, takenAgainst: 'pre-repour', total: r.total, unkeyed: r.unkeyed,
    frameOrigin: fo.canon, keySpace: r.keySpace,
    buildings: Object.fromEntries(r.buildings),
  }, null, 0))
  console.log(`  key space ..... ${r.keySpace}`)
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

  // ⛔ THE ORIGIN IS CHECKED FIRST AND ON ITS OWN. If it moved, every downstream
  // number in this report is measured in a different coordinate frame and is
  // meaningless — reporting "0 lost" under a moved origin would be the exact
  // plausible-looking success a kit must never produce.
  const fo = frameOrigin(scene)
  console.log(`  FRAME ORIGIN  ${showOrigin(fo)}`)
  if (!fo.ok) { console.log(`  ⛔ NOT MEASURED — the origin cannot be read, so it cannot be protected.`); return 2 }
  if (base.frameOrigin === undefined) {
    console.log(`  ⚠️ baseline predates the origin check — NOT MEASURED for origin drift (not "unchanged"). Re-snapshot to arm it.`)
  } else if (base.frameOrigin !== fo.canon) {
    console.log(`  ⛔⛔ FRAME ORIGIN MOVED — this is fatal and nothing below it is trustworthy.`)
    console.log(`      before ${base.frameOrigin}`)
    console.log(`      after  ${fo.canon}`)
    console.log(`      EXTENT-DESIGN §3.3: the origin may GROW or SHRINK, never MOVE. Moving it`)
    console.log(`      reprojects every coordinate and re-orders building identity — the 84→5`)
    console.log(`      content death. ⛔ Do not re-baseline to make this pass. Find what moved it.`)
    return 1
  } else {
    console.log(`  ✅ frame origin byte-identical across the pour (grow/shrink of bbox is permitted and not asserted)`)
  }

  const now = readBuildings(scene)
  if (!now.ok) { console.log(`  ⛔ NOT MEASURED — ${now.why}`); return 2 }

  console.log(`  key space ..... ${now.keySpace}${base.keySpace && base.keySpace !== now.keySpace ? `  ⛔ CHANGED from ${base.keySpace} — ids are not comparable across a namespace change` : ''}`)
  if (base.keySpace && base.keySpace !== now.keySpace) return 1
  if (now.buildings.size === 0) {
    console.log(`  ⛔ NOT MEASURED — 0 keyed buildings (${now.unkeyed} unkeyed). ⛔ This is not a pass.`)
    return 2
  }
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
