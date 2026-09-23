#!/usr/bin/env node
/**
 * claims-a-closed-stripe-keeps-its-hole
 *
 * ⛔ THE CLAIM: a line painted around a CLOSED loop — a turning-circle's centre stripe, a roundabout's,
 * a fence round a yard — bakes as a BAND with a HOLE in it, never as a filled disc.
 *
 * ⭐ WHY (2026-09-23, Keel's forensic, `docs/briefs/BRIEF-closed-loop-disc-forensic.md`): the bake
 * buffers every map.json line into one thin ring (`polylineToRing`). Along a closed line that ring
 * is an ANNULUS. `clipAllToStencil` clipped bare rings into a flat `Paths` and pushed every path as a
 * bare ring — so the annulus's outer AND inner edges both triangulated SOLID. Stage drew a yellow
 * disc at every Huron court and over the US 6 roundabout island. ⛔ Invisible on LS: its one closed
 * stripe lies outside the stencil, so town #1 could never have shown it.
 *
 * TWO PARTS, and they catch different things:
 *  A. THE CODE — every closed line in the town's map.json, buffered as ONE ring and handed to the
 *     REAL `clipAllToStencil`. Net area out must not exceed the band's own area. Needs no bake, so it
 *     goes red the moment the fix is reverted (the mutation test). ⚠️ The buffer here is this
 *     check's own two-sided offset, not `polylineToRing` (which bake-ground does not export): what
 *     is under test is the clip, and the shape class it must survive is "one ring that is an annulus".
 *  B. THE ARTIFACT — for every closed line whose layer is BAKED (its group is in ground.json) and
 *     whose interior lies inside the stencil: does that group's geometry cover the loop's interior?
 *     Covered = a disc. This is what the operator sees; it goes green only after a re-bake.
 *
 * ⛔ Nothing is skipped silently: a loop with no clear interior, or outside the stencil, is COUNTED
 *    and printed, never folded into a pass.
 *
 * Run: node checks/claims-a-closed-stripe-keeps-its-hole.mjs [scene…]
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { scenes, ROOT } from './_scenes.mjs'
import { loadSceneStencil } from '../cartograph/sceneStencil.js'
import { clipAllToStencil } from '../src/lib/ribbonsGeometry.js'

// map.json line layer → the ground.json group bake-ground paints it into (`pushMat` keys).
// ⚠️ `barrier` splits by `item.kind` (fence / wall / retaining_wall / hedge), so its group is per item.
const LINE_LAYERS = { centerStripe: () => 'stripe', parkingLine: () => 'edgeline', bikeLane: () => 'bikelane', barrier: (it) => it.kind }
const HW = 0.10        // band half-width for part A; the claim is about topology, not the width
const SLACK = 1.05     // part A: net area out may exceed the band by rounding, never by a filled hole

const area = r => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; s += p[0] * q[1] - q[0] * p[1] } return s / 2 }
const netArea = it => Array.isArray(it) ? Math.abs(area(it)) : Math.abs(area(it.outer)) - (it.holes || []).reduce((s, h) => s + Math.abs(area(h)), 0)
const pip = (p, R) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) { const [xi, zi] = R[i], [xj, zj] = R[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) c = !c } return c }
const inTri = (p, a, b, c) => { const d = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]); const d1 = d(p, a, b), d2 = d(p, b, c), d3 = d(p, c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) }
const stamp = p => `${p} (${statSync(join(ROOT, p)).mtime.toISOString()})`

function band(c, hw) {   // one ring: left side forward, right side back — the annulus, for a closed line
  const n = c.length, L = [], R = []
  for (let i = 0; i < n; i++) {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1
    L.push([c[i][0] - dz / l * hw, c[i][1] + dx / l * hw]); R.push([c[i][0] + dz / l * hw, c[i][1] - dx / l * hw])
  }
  return [...L, ...R.reverse()]
}

let findings = 0
for (const scene of scenes('cartograph/data/<scene>/clean/map.json')) {
  const mapP = `cartograph/data/${scene}/clean/map.json`
  const map = JSON.parse(readFileSync(join(ROOT, mapP), 'utf8'))
  const st = loadSceneStencil(ROOT, scene)
  console.log(`\n== ${scene}   ${stamp(mapP)}`)
  if (!st.clipPolygon) { console.log('   NOT CHECKED — no stencil (neighborhood_boundary.json has no boundary)'); continue }

  const loops = []
  for (const [layer, groupOf] of Object.entries(LINE_LAYERS)) {
    for (const it of (map.layers?.[layer] || [])) {
      const c = (it.coords || []).map(p => [p.x ?? p[0], p.z ?? p[1]])
      if (c.length > 3 && Math.hypot(c[0][0] - c.at(-1)[0], c[0][1] - c.at(-1)[1]) < 1e-3) loops.push({ layer, group: groupOf(it), c, name: it.name || it.kind || '' })
    }
  }

  // ── A. the code ──
  let aBad = 0
  for (const L of loops) {
    const ring = band(L.c, HW), want = Math.abs(area(ring))
    const m = new Map([['x', [ring]]]); clipAllToStencil(m, new Map(), st.clipPolygon)
    const got = m.get('x').reduce((s, it) => s + netArea(it), 0)
    if (got > want * SLACK + 0.5) { aBad++; if (aBad <= 5) console.log(`   ⛔ A ${L.layer} "${L.name}": band ${want.toFixed(1)} m² clipped to ${got.toFixed(1)} m² — the hole was filled`) }
  }
  console.log(`   A (clipAllToStencil): ${loops.length} closed line(s) · hole FILLED ${aBad}`)
  findings += aBad

  // ── B. the baked artifact ──
  const gP = `public/baked/${scene}/ground.json`, bP = `public/baked/${scene}/ground.bin`
  if (!existsSync(join(ROOT, gP)) || !existsSync(join(ROOT, bP))) { console.log(`   B NOT CHECKED — no ${gP} / ground.bin`); continue }
  console.log(`   ${stamp(gP)} · ${stamp(bP)}`)
  const g = JSON.parse(readFileSync(join(ROOT, gP), 'utf8')), buf = readFileSync(join(ROOT, bP))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const groups = new Map()
  const groupGeom = id => {
    if (groups.has(id)) return groups.get(id)
    const G = g.groups.find(x => x.id === id)
    const v = G ? { pos: new Float32Array(ab, G.vertexByteOffset, G.vertexCount * 3), idx: new Uint32Array(ab, G.indexByteOffset, G.indexCount) } : null
    groups.set(id, v); return v
  }
  const covers = (G, p) => { for (let t = 0; t < G.idx.length; t += 3) { const V = k => [G.pos[G.idx[t + k] * 3], G.pos[G.idx[t + k] * 3 + 2]]; if (inTri(p, V(0), V(1), V(2))) return true } return false }
  const sc = g.stencil, inStencil = p => sc && Math.hypot(p[0] - sc.center[0], p[1] - sc.center[1]) < sc.radius
  const tally = { disc: 0, clean: 0, notBaked: 0, outside: 0, noInterior: 0 }
  for (const L of loops) {
    const G = groupGeom(L.group); if (!G) { tally.notBaked++; continue }
    let cx = 0, cz = 0; for (const p of L.c) { cx += p[0]; cz += p[1] } cx /= L.c.length; cz /= L.c.length
    if (!inStencil([cx, cz])) { tally.outside++; continue }
    if (!pip([cx, cz], L.c) || Math.min(...L.c.map(p => Math.hypot(p[0] - cx, p[1] - cz))) < 1) { tally.noInterior++; continue }
    if (covers(G, [cx, cz])) { tally.disc++; if (tally.disc <= 5) console.log(`   ⛔ B ${L.group} "${L.name}" at (${cx.toFixed(1)}, ${cz.toFixed(1)}): the loop's interior is painted — a disc`) }
    else tally.clean++
  }
  console.log(`   B (baked ground): DISC ${tally.disc} · hole kept ${tally.clean} · layer not baked ${tally.notBaked} · outside stencil ${tally.outside} · no clear interior ${tally.noInterior}`)
  findings += tally.disc
}
console.log(findings ? `\n⛔ ${findings} closed line(s) fill their hole` : '\n✓ every closed line keeps its hole')
process.exit(findings ? 1 : 0)
