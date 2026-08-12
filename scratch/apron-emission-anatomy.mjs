#!/usr/bin/env node
/**
 * APRON FORENSIC part 2 — what does the junction construction actually EMIT?
 *
 * `buildTileGround` exposes `_jPolys` (the window polys + aprons + absorbed
 * median rings, exactly the array tileGround.js builds at :2913) and
 * `_jCornerCuts`. This probe reads them LIVE — constructed geometry, not spec —
 * and asks: are they closed rings? per-side or per-node? do they carry any
 * (skelId, side)? Then it cross-checks the 45-spec / 34-built apron gap against
 * the fan-size arithmetic in the code (fan = 2·legs − pairsBuilt).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTileGround } from '../src/lib/tileGround.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json'), 'utf8'))
const design = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/looks/lafayette-square/design.json'), 'utf8'))

const realLog = console.log
console.log = () => {}
const pr = buildTileGround(ribbons, {
  curbWidth: 0.381, blockCustoms: design.blockCustoms || null, blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: design.cornerRadiusScale ?? 1, cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null, emitArtifact: true,
})
console.log = realLog

const J = pr._jPolys || []
console.log(`_jPolys (LIVE constructed geometry): ${J.length} objects`)
console.log(`  typeof first: ${Array.isArray(J[0]) ? 'Array (bare ring)' : typeof J[0]}`)
console.log(`  first element of first ring: ${JSON.stringify(J[0]?.[0])}`)
const nonArray = J.filter(r => !Array.isArray(r)).length
const anyProps = J.filter(r => Array.isArray(r) && Object.keys(r).some(k => !/^\d+$/.test(k)))
console.log(`  objects carrying named props (skelId/side/etc): ${anyProps.length + nonArray}`)
const vcount = J.map(r => r.length)
console.log(`  vertex counts: min ${Math.min(...vcount)} · max ${Math.max(...vcount)} · median ${vcount.slice().sort((a,b)=>a-b)[vcount.length>>1]}`)
const closedExplicit = J.filter(r => r[0][0] === r[r.length-1][0] && r[0][1] === r[r.length-1][1]).length
console.log(`  rings whose last vertex repeats the first: ${closedExplicit} (0 = implicitly-closed ring convention, i.e. AREAS not paths)`)
const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i+1)%r.length; a += r[i][0]*r[j][1] - r[j][0]*r[i][1] } return a/2 }
const areas = J.map(area)
console.log(`  signed areas: all positive? ${areas.every(a => a > 0)} · min ${Math.min(...areas).toFixed(2)} m² · max ${Math.max(...areas).toFixed(2)} m²`)
console.log(`  _jCornerCuts: ${(pr._jCornerCuts||[]).length} quads (subtractive)`)
console.log(`  _thruWins: ${(pr._thruWins||[]).length} rings`)

// ── the 45 → 34 apron gap, against the code's own fan arithmetic ───────────
// tileGround.js :3211 marks BOTH halves of every BUILT continuity pair into
// pairedSides; :3233 skips those leg-sides in the width fan; :3209 pushes ONE
// fanAnchor per built pair. So fan size = 2·legs − pairsBuilt, and :3244 needs
// >= 3. tip-wrap pairs (:2992) are skipped and mark nothing.
const nodes = ribbons.junctionMap?.nodes || []
let predictedNoApron = 0, predictedApron = 0
const rows = []
for (const n of nodes) {
  if (!n.apron) continue
  const legs = (n.legs || []).length
  const pairs = (n.continuity || []).filter(p => p.source !== 'tip-wrap').length
  const fan = 2 * legs - pairs
  if (fan < 3) { predictedNoApron++; rows.push([legs, pairs, fan, (n.legs||[]).map(l=>l.chain).join('+')]) }
  else predictedApron++
}
console.log(`\nAPRON SPEC → GEOMETRY, predicted by the code's fan arithmetic (fan = 2·legs − pairsBuilt, needs >= 3):`)
console.log(`  apron specs: ${nodes.filter(n=>n.apron).length}`)
console.log(`  predicted BUILT: ${predictedApron} · predicted SUPPRESSED (fan < 3): ${predictedNoApron}`)
console.log(`  (live census above reported the actual built count)`)
for (const r of rows.slice(0, 15)) console.log(`    legs=${r[0]} pairs=${r[1]} fan=${r[2]}  ${r[3]}`)

// ── the 158 bare degree-2 nodes ────────────────────────────────────────────
const deg2 = nodes.filter(n => (n.legs||[]).length === 2)
const bare = deg2.filter(n => !(n.continuity?.length || n.deTaper?.length || n.apron))
console.log(`\nDEGREE-2 NODES: ${deg2.length} · bare (the :3548 filter's FALSE branch) ${bare.length}`)
const kinds = new Map()
for (const n of bare) { const k = (n.kinds||['(none)']).join('+'); kinds.set(k, (kinds.get(k)||0)+1) }
console.log(`  bare deg-2 by kinds:`); for (const [k,v] of [...kinds].sort((a,b)=>b[1]-a[1])) console.log(`    ${v.toString().padStart(4)}  ${k}`)
const kinds2 = new Map()
for (const n of deg2.filter(n => (n.continuity?.length || n.deTaper?.length || n.apron))) { const k = (n.kinds||['(none)']).join('+'); kinds2.set(k, (kinds2.get(k)||0)+1) }
console.log(`  SPEC'd deg-2 by kinds:`); for (const [k,v] of [...kinds2].sort((a,b)=>b[1]-a[1])) console.log(`    ${v.toString().padStart(4)}  ${k}`)

// deg-1 nodes: what does their spec actually contain?
const deg1 = nodes.filter(n => (n.legs||[]).length === 1)
const tipwrapOnly = deg1.filter(n => (n.continuity||[]).every(p => p.source === 'tip-wrap') && !n.apron && !n.deTaper?.length)
console.log(`\nDEGREE-1 (dead end) NODES: ${deg1.length}`)
console.log(`  whose ONLY construction is 'tip-wrap' continuity (skipped at tileGround.js:2992, left to G8 caps): ${tipwrapOnly.length}`)
console.log(`  with an apron: ${deg1.filter(n=>n.apron).length} · with deTaper: ${deg1.filter(n=>n.deTaper?.length).length}`)
