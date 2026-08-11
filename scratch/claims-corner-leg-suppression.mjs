#!/usr/bin/env node
/**
 * "WHY DOES A CORNER FIND ONLY ONE LEG?"
 *
 * `A7`: 10% of LS's BUILT pads (33 of 331) have `legs !== 2`, which skips the
 * whole Idea A block — the concentric arc at `cMin` AND the ramp that slides the
 * deeper leg's walk to the curb. No ramp is what the operator sees as a HARD
 * STEP, on one side of the corner only.
 *
 * A leg declines to bid on FIVE predicates (`tileGround.js:1766`):
 *     e.noPed || tipped[i] || through[i] || isNameTransition(p, run) || isThruNode(p, run)
 * ⭐ Four of the five are the chain predicates `SECTION §7` lists and `A15` names
 *   as the stink — "none reads the curb". `noPed` is the RIM (A15: skelId null,
 *   34/34 set-identical with the no-asphalt set) — the neighbourhood's outer edge,
 *   not a street. Jacob, 2026-08-11: "there is curb everywhere we're looking."
 *   ⇒ if the suppressor at a working corner is NOT noPed, the leg is being
 *   dropped by a chain fact at a place with a perfectly good curb.
 *
 * This records WHICH predicate fired, per suppressed end. The construction is
 * patched on a COPY (the `claims-ia-source-stamp` pattern) and the anchor is
 * asserted to match exactly once, so the edit can never be silently unapplied.
 *
 * ⛔ Read-only with respect to the repo. Writes only its own instrumented copy.
 *
 * Usage: node scratch/claims-corner-leg-suppression.mjs [--scene <name>]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRCDIR = path.join(ROOT, 'src/lib')
const TG = path.join(SRCDIR, 'tileGround.js')

const ANCHOR = /          if \(e\.noPed \|\| tipped\[i\] \|\| through\[i\] \|\| isNameTransition\(p, run\) \|\| isThruNode\(p, run\)\) return/
const PATCH = `          if (e.noPed || tipped[i] || through[i] || isNameTransition(p, run) || isThruNode(p, run)) {
            if (globalThis.__legDump) globalThis.__legDump.push({
              p, why: [e.noPed && 'noPed', tipped[i] && 'tipped', through[i] && 'through',
                       isNameTransition(p, run) && 'nameTransition', isThruNode(p, run) && 'thruNode'].filter(Boolean),
              run: \`\${run.skelId}|\${run.side}|\${run.segOrd}\`,
            })
            return
          }`

let src = fs.readFileSync(TG, 'utf8')
const hits = src.match(new RegExp(ANCHOR.source, 'g')) || []
if (hits.length !== 1) {
  console.error(`⛔ INSTRUMENT ANCHOR DRIFTED — matched ${hits.length}×, expected 1.`)
  console.error('   The patch would be silently unapplied and every number below would be a FALSE GREEN.')
  process.exit(2)
}
src = src.replace(ANCHOR, PATCH)
src = src.replace(/(from\s*['"])(\.[^'"]*)(['"])/g, (_, a, sp, z) => a + path.resolve(SRCDIR, sp) + z)
const dir = path.join(ROOT, 'scratch/.leg-probe')
fs.mkdirSync(dir, { recursive: true })
const f = path.join(dir, 'tileGround.leg.mjs')
fs.writeFileSync(f, src)

process.env.CORNER_DUMP = '1'
const { sectionPassTile, cornerDump } = await import(f)
if (!cornerDump?.on) { console.error('⛔ CORNER_DUMP not armed — nothing measured.'); process.exit(2) }

const argScene = process.argv.includes('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : null
const scenes = (argScene ? [argScene] : fs.readdirSync(path.join(ROOT, 'public/baked')))
  .filter(s => fs.existsSync(path.join(ROOT, 'public/baked', s, 'shape.json')))

console.log('WHY A CORNER FINDS ONLY ONE LEG — the five suppressors, counted\n')

for (const scene of scenes) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/baked', scene, 'shape.json'), 'utf8'))
  const tiles = Array.isArray(raw) ? raw : raw.tiles
  if (!Array.isArray(tiles) || !tiles.length) { console.log(`── ${scene}: no tiles — NOT MEASURED\n`); continue }
  const lp = path.join(ROOT, 'public/looks', scene, 'design.json')
  const bc = fs.existsSync(lp) ? (JSON.parse(fs.readFileSync(lp, 'utf8')).blockCustoms || null) : null

  const why = {}, atOneLeg = {}
  let built = 0, oneLeg = 0
  for (const st of tiles) {
    globalThis.__legDump = []
    cornerDump.rows.length = 0
    try { sectionPassTile(st, 0.381, { outer: 'LU', inner: 'SW' }, bc) }
    catch { globalThis.__legDump = null; cornerDump.rows.length = 0; continue }
    const supp = globalThis.__legDump
    for (const s of supp) for (const w of s.why) why[w] = (why[w] || 0) + 1
    // which suppressions sit AT a corner that then built with < 2 legs
    for (const r of cornerDump.rows) {
      if (r.reason !== 'BUILT') continue
      built++
      if (r.legs === 2) continue
      oneLeg++
      const near = supp.filter(s => Math.hypot(s.p[0] - r.p[0], s.p[1] - r.p[1]) < 1)
      if (!near.length) { atOneLeg['(no suppression found at this node)'] = (atOneLeg['(no suppression found at this node)'] || 0) + 1; continue }
      for (const s of near) for (const w of s.why) atOneLeg[w] = (atOneLeg[w] || 0) + 1
    }
    globalThis.__legDump = null
    cornerDump.rows.length = 0
  }
  console.log(`── ${scene} ──  pads BUILT ${built} · of them with legs≠2: ${oneLeg}`)
  console.log(`   every leg suppression on the map : ${JSON.stringify(why)}`)
  console.log(`   ⭐ suppressions AT a legs≠2 corner: ${JSON.stringify(atOneLeg)}`)
  console.log()
}

console.log(`⭐ A suppression that is NOT \`noPed\` is a leg dropped at a place with a perfectly good
   curb — a CHAIN fact removing a leg from a POLYGON construction, which then stops being
   leg-responsive and lays no ramp. That is the hard step, on one side of the corner only.
   → ROADMAP A7 · A15 · SECTION §7 · §6.9.4`)
