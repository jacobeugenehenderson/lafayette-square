// spike-punchout-vs-facewalk.mjs — THE TWO SUBSTRATES, MEASURED SIDE BY SIDE.
//
// ⭐ THE POINT (Jacob, 2026-08-06): "blocks = boundary − stroked roads." Offset the
// paths, EXPAND the appearance so the centreline is gone, union with the extent
// boundary, take the compound path. After `expand` there is no chain left, so a
// centreline NODE CAN NEVER BE A RING VERTEX — which is the whole disease:
// `extractFaces` walks the centreline graph, so its rings ARE traversals and its
// vertices ARE nodes, and every coupler / mouth-disc / walk-ordinal-key /
// `cornerT`-collision workaround exists to manage that.
//
// ⛔ THIS CONSTRUCTION ALREADY EXISTS AND IS ALREADY RUNNING.
// `buildBlockGeometryV2` computes `blockSharp = differenceRings([stencil],
// asphaltSharp)` (:1702) on every Survey/Measure open — and then discards it. Its
// own return comment says the quiet part: "Diagnosis-only, opt-in ... Off by
// default so no consumer can start depending on it." The map is drawn from the
// face walk instead.
//
// THE DECIDING TEST is #3 below: does any block ring have a centreline node as a
// vertex? Face-walk tiles: by construction, always. Punch-out: must be zero.
//
//   node scratch/spike-punchout-vs-facewalk.mjs
// Read-only. No pour, no bake, no writes to any artifact.
import fs from 'fs'

const scene = 'lafayette-square'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const design = JSON.parse(fs.readFileSync(`public/looks/${scene}/design.json`, 'utf8'))
const nb = JSON.parse(fs.readFileSync(`cartograph/data/${scene}/neighborhood_boundary.json`, 'utf8'))

// the extent boundary = the outer polygon of the compound path
const sc0 = ((nb?.streetFade?.outer ?? nb.radius) + 50) / nb.radius
const [cx, cz] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])

const quiet = console.log; console.log = () => {}
const { buildBlockGeometryV2 } = await import('../src/lib/buildBlockGeometryV2.js')
const v2 = buildBlockGeometryV2(ribbons, {
  stencil,
  blockCustoms: design.blockCustoms || null,
  curbWidth: design.curbWidth ?? 0.15,
  blockLandUse: design.blockLandUse,
  __debugRings: true,          // ⭐ the flag that un-hides the punch-out
})
console.log = quiet

const punch = v2.__blockRings || []
const tiles = ribbons.tiles || []

const K = (p) => p[0].toFixed(2) + ',' + p[1].toFixed(2)
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]); return Math.abs(a / 2) }

// ── every centreline node (a vertex shared by >=2 chains, or any chain vertex) ──
const nodeSet = new Set(), allChainVerts = new Set()
{
  const seen = new Map()
  for (const s of ribbons.streets || []) {
    if (s.gradeSeparated) continue
    for (const [i, p] of s.points.entries()) {
      const k = K(p); allChainVerts.add(k)
      const e = seen.get(k) || { mid: 0, end: 0 }
      ;(i > 0 && i < s.points.length - 1) ? e.mid++ : e.end++
      seen.set(k, e)
    }
  }
  for (const [k, e] of seen) if (e.mid * 2 + e.end >= 3) nodeSet.add(k)   // junctions
}

const report = (label, rings) => {
  let dupRings = 0, dupVerts = 0, nodeHits = 0, chainVertHits = 0, verts = 0, tot = 0
  for (const r of rings) {
    if (!r || r.length < 3) continue
    tot++; verts += r.length
    const seen = new Set(); let dup = false
    for (const p of r) {
      const k = K(p)
      if (seen.has(k)) { dup = true; dupVerts++ }
      seen.add(k)
      if (nodeSet.has(k)) nodeHits++
      if (allChainVerts.has(k)) chainVertHits++
    }
    if (dup) dupRings++
  }
  console.log(`\n── ${label} ──`)
  console.log(`   rings                              : ${tot}`)
  console.log(`   total vertices                     : ${verts}`)
  console.log(`   ⛔ Check 1 — rings w/ repeated vertex: ${dupRings}   (repeats: ${dupVerts})`)
  console.log(`   ⭐ ring vertices ON A CENTRELINE NODE: ${nodeHits}`)
  console.log(`      ring vertices on ANY chain vertex : ${chainVertHits}`)
  return { tot, dupRings, nodeHits }
}

console.log(`spike — two substrates for ${scene}`)
console.log(`extent boundary: ${stencil.length} verts   ·   chains: ${(ribbons.streets || []).length}   ·   junction nodes: ${nodeSet.size}`)

const A = report('FACE WALK  (ribbons.tiles — today\'s substrate)', tiles.map(t => t.ring))
const B = report('PUNCH-OUT  (stencil − stroked roads — blockSharp)', punch)

console.log(`\n══ VERDICT ══`)
console.log(`   blocks:            face-walk ${A.tot}   →   punch-out ${B.tot}`)
console.log(`   Check 1 failures:  face-walk ${A.dupRings}   →   punch-out ${B.dupRings}` +
  (B.dupRings === 0 ? '   ✅ GREEN' : '   ⛔ still failing — the construction is NOT clean'))
console.log(`   node-on-ring:      face-walk ${A.nodeHits}   →   punch-out ${B.nodeHits}` +
  (B.nodeHits === 0 ? '   ✅ THE CENTRELINE IS GONE' : '   ⛔ nodes still on the ring — expand did not happen'))
console.log(`\n⚠️ This measures the SUBSTRATE only. It says nothing about how it renders —`)
console.log(`   the eye is the gate (R4), and a green gate has been judged worse before.`)
