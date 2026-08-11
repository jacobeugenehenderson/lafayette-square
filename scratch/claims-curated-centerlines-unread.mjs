#!/usr/bin/env node
/**
 * "DOES THE FRAME AGREE WITH THE AUTHORITATIVE GEOMETRY WE ALREADY PAID FOR?"
 *
 * `README §Data sources` lists **curated centerlines** — "hand-corrected
 * geometry where OSM was wrong" — as ✅ authoritative, one of seven named
 * inputs. `cartograph/rejoin-splits.js` exists to repair exactly the defect
 * below, writes into that file, and its backups sit in raw/ proving it ran.
 *
 * ⛔ `skeleton.js` READS ONLY `raw/osm.json` (line 1571, the single geometry
 *    read; `survey.json` at :1325 is widths). Its own header calls
 *    centerlines.json a "future" overlay. `derive.js` reads the file for
 *    MEASURES and CAP ENDS only, never for shape.
 *
 * ⇒ the correction exists, is authoritative, and never reaches the frame.
 *
 * THE CONSEQUENCE THIS MEASURES. Where OSM digitizes one street as two ways
 * with a hole (a bigger road crosses; the ways share no node), the frame keeps
 * the hole. Both stubs become degree-1 tips, the cap chooser gives them
 * `round`, and the map faithfully draws a cul-de-sac bulb at each — which is
 * `ROADMAP A0`'s headline symptom, arriving from the INTAKE, three stages
 * upstream of where A0 works. The curated polyline runs straight through the
 * hole and says the street continues.
 *
 * ⛔⛔ RETRACTED THE DAY IT WAS WRITTEN — THE CURATED FILE IS NOT AN ARBITER
 *   OF CONTINUITY. It draws Carroll Street continuous straight through Truman
 *   Parkway. Jacob, 2026-08-11: *"Carroll is severed by Truman — it's a cul de
 *   sac on one side and butts up to Truman on the other side."* ⇒ on the one
 *   row taken to the ground, the curated line is WRONG and the frame is RIGHT.
 *   **A row below is a DISAGREEMENT between two inputs, not a defect in the
 *   frame**, and this check cannot say which side is correct.
 *   ⭐ What survives, and it is worth keeping: the file is authoritative by
 *   `README §Data sources`, is repaired by a purpose-built tool, and the frame
 *   has never read it. That contradiction is real whichever way each row goes —
 *   either we are ignoring good geometry, or we are calling bad geometry
 *   authoritative in the README. Both are findings; neither is A0's.
 *
 * ⛔ THIS DOES NOT SAY THE WELD IS THE CURE. What sits in the hole is
 *    reported per instance, because it decides the answer: a hole spanned by
 *    a crossing street is a MISSING JUNCTION (welding it would draw pavement
 *    over that junction); an empty hole is a genuine fragment seam. The two
 *    are never merged into one number.
 *
 * ⛔ No fallback: a scene with no curated file is reported as its own class,
 *    never counted as agreement. No scene names in this source.
 *
 * Read-only. Writes nothing.
 *
 * Usage: node scratch/claims-curated-centerlines-unread.mjs [--scene=<name>]
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'cartograph/data')
const argScene = process.argv.find(a => a.startsWith('--scene='))?.split('=')[1]

// PROVE the read rather than restating it: lift skeleton.js's own geometry
// reads out of its source, so this cannot go stale if the file starts
// consuming the curated centerlines.
const skelSrc = readFileSync(resolve(ROOT, 'cartograph/skeleton.js'), 'utf8')
const readsCurated = /readFileSync\([^)]*centerlines\.json/.test(skelSrc)
console.log(`skeleton.js reads centerlines.json for geometry: ${readsCurated ? 'YES' : '⛔ NO'}`)
if (readsCurated) {
  console.log('   ⚠️  the premise of this check no longer holds — re-read skeleton.js before trusting the rows below.\n')
} else {
  console.log('   (its only geometry read is raw/osm.json; centerlines.json reaches derive.js for measures/caps only)\n')
}

const norm = n => (n || '').trim().toLowerCase()
const XY = p => Array.isArray(p) ? { x: p[0], z: p[1] } : { x: p.x, z: p.z }
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const segDist = (pts, q) => {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const a = XY(pts[i - 1]), b = XY(pts[i])
    const vx = b.x - a.x, vz = b.z - a.z, L = vx * vx + vz * vz
    let t = L ? ((q.x - a.x) * vx + (q.z - a.z) * vz) / L : 0
    t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(a.x + t * vx - q.x, a.z + t * vz - q.z))
  }
  return best
}

const scenes = (argScene ? [argScene] : readdirSync(DATA))
  .filter(s => existsSync(resolve(DATA, s, 'clean/skeleton.json')))

let spanned = 0, missingJunction = 0, emptySeam = 0, noCurated = 0

for (const scene of scenes) {
  const sk = JSON.parse(readFileSync(resolve(DATA, scene, 'clean/skeleton.json'), 'utf8'))
  const curPath = resolve(DATA, scene, 'raw/centerlines.json')
  if (!existsSync(curPath)) {
    console.log(`━━ ${scene}\n   ⚠️  NO curated centerlines — nothing to compare. Not counted as agreement.\n`)
    noCurated++
    continue
  }
  const curated = JSON.parse(readFileSync(curPath, 'utf8')).streets || []
  const chains = (sk.streets || []).filter(s => s?.points?.length >= 2)

  // every degree-1 tip in the frame, by name
  const tips = []
  for (const s of chains) {
    for (const which of ['start', 'end']) {
      if (s.caps?.[which]?.degree !== 1) continue
      tips.push({ id: s.id, which, name: norm(s.name), p: which === 'start' ? XY(s.points[0]) : XY(XY(s.points[s.points.length - 1])) })
    }
  }

  // Walk each curated polyline at fine stations and ask, per station, whether
  // ANY frame chain of that name covers it. An uncovered run bounded at BOTH
  // ends by a degree-1 tip of that name is a hole the frame left open.
  // ⛔ Never pair two tips by proximity — a street's own two ends are not a
  //    hole, and pairing them produced 484–922 m "gaps" in this check's first
  //    run. The station walk is what makes the span mean something.
  const STEP = 2.0      // m — fine against the smallest hole measured (8.1 m)
  const ON_CHAIN = 1.5  // m — a station is covered if a same-name chain runs through it
  const rows = []
  for (const cur of curated) {
    const pts = (cur.points || []).map(XY)
    if (pts.length < 2) continue
    const n = norm(cur.name)
    const mine = chains.filter(s => norm(s.name) === n).map(s => s.points.map(XY))
    if (!mine.length) continue

    // stations along the polyline
    const stations = []
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]
      const L = dist(a, b)
      for (let d = 0; d < L; d += STEP) {
        const t = d / L
        stations.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
      }
    }
    stations.push(pts[pts.length - 1])
    const covered = stations.map(q => mine.some(m => segDist(m, q) < ON_CHAIN))

    // uncovered runs with covered geometry on BOTH sides (interior holes only)
    let i = 0
    while (i < covered.length) {
      if (covered[i]) { i++; continue }
      let j = i
      while (j < covered.length && !covered[j]) j++
      const interior = i > 0 && j < covered.length
      if (interior) {
        const from = stations[i - 1], to = stations[j]
        const gap = dist(from, to)
        // ⭐ AT LEAST ONE shoulder must be a degree-1 tip — that floating stub
        //   IS the defect. Requiring BOTH reports zero on the real pattern and
        //   was this check's first-run bug: at a crossing, typically only one
        //   side floats and the other is properly joined to the crossing road
        //   at degree 3 (Carroll: west stub deg 1, east stub deg 3 on Truman).
        const ta = tips.find(t => t.name === n && dist(t.p, from) < ON_CHAIN)
        const tb = tips.find(t => t.name === n && dist(t.p, to) < ON_CHAIN)
        if ((ta || tb) && ta?.id !== tb?.id) {
          const mid = stations[Math.floor((i + j) / 2)]
          const crossers = chains
            .filter(s => norm(s.name) !== n)
            .map(s => ({ id: s.id, d: segDist(s.points.map(XY), mid), divided: s.phase?.kind === 'divided' }))
            .filter(c => c.d < gap / 2)
            .sort((x, y) => x.d - y.d)
          rows.push({ name: cur.name, a: ta, b: tb, gap, crossers, floats: [ta && "start-side", tb && "end-side"].filter(Boolean).join("+") })
        }
      }
      i = j
    }
  }

  const mj = rows.filter(r => r.crossers.length)
  const es = rows.filter(r => !r.crossers.length)
  spanned += rows.length; missingJunction += mj.length; emptySeam += es.length

  console.log(`━━ ${scene}`)
  console.log(`   curated streets ${curated.length} · frame chains ${chains.length} · degree-1 tips ${tips.length}`)
  console.log(`   ⛔ curated geometry SPANS a hole the frame left open : ${rows.length}`)
  console.log(`        of which MISSING JUNCTION (a street is in the hole) : ${mj.length}   ← ⛔ a weld here draws pavement over that junction`)
  console.log(`        of which EMPTY SEAM (nothing in the hole)          : ${es.length}   ← a genuine fragment weld`)
  for (const r of rows) {
    const tag = r.crossers.length
      ? `crossed by ${r.crossers[0].id}${r.crossers[0].divided ? ' [DIVIDED]' : ''} @ ${r.crossers[0].d.toFixed(1)} m`
      : '*** nothing in the hole ***'
    console.log(`      ${r.crossers.length ? "⛔" : "·"} ${r.name.padEnd(20)} ${(r.a ? r.a.id + " " + r.a.which : "(joined)").padEnd(26)} ↔ ${(r.b ? r.b.id + " " + r.b.which : "(joined)").padEnd(26)} hole ${r.gap.toFixed(1).padStart(5)} m  — ${tag}`)
  }
  console.log()
}

console.log(`═══ ${spanned} holes spanned by authoritative curated geometry · ${missingJunction} MISSING JUNCTION · ${emptySeam} EMPTY SEAM`
  + (noCurated ? ` · ${noCurated} scene(s) have no curated file` : ''))
console.log(`
⛔ Every one of these is a place the frame says the street ENDS and the file
   the README calls authoritative says it CONTINUES — with no mechanism that
   could ever reconcile them, because the frame does not read the file.
   ⛔ RETRACTED at Carroll: the curated line says continuous, the ground says
      severed, and the FRAME IS RIGHT there (Jacob, 2026-08-11). A row is a
      disagreement between inputs; this check cannot say which side wins.
   → README §Data sources · SKELETON §5b-bis · ROADMAP A0 · cartograph/rejoin-splits.js`)
