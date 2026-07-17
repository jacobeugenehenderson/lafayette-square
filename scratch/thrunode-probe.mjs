#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// THRU-NODE PROBE (Lintel, 2026-07-16) · READ-ONLY
// Measures, at the tabled T-junction target set, whether the through-node
// window is BUILT (spans the node) and whether the through-frontage's ped band
// runs continuous past the mouth. The RED→GREEN eye-proxy for the :2461 gate
// fix (HANDOFF-thrunode-gate-fix.md / THRUNODE-GATE-FINDINGS.md).
//   node scratch/thrunode-probe.mjs
// ─────────────────────────────────────────────────────────────────────────
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const { buildTileGround, sectionPassTile } = await import(path.join(ROOT, 'src/lib/tileGround.js'))

const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const bnd = JSON.parse(fs.readFileSync(path.join(ROOT, 'cartograph/data/lafayette-square/neighborhood_boundary.json')))
const design = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/looks/lafayette-square/design.json')))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])

const build = (thruTNode) => buildTileGround(ribbons, {
  stencil: clip, smooth: 0, curbWidth: design.curbWidth,
  blockLandUse: design.blockLandUse || null, cornerRadiusScale: design.cornerRadiusScale ?? 1,
  blockCustoms: design.blockCustoms || null, emitArtifact: true, thruTNode,
})
const streets = ribbons.streets
const jmNodes = ribbons.junctionMap?.nodes || []

// ── geometry helpers ────────────────────────────────────────────────────────
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const signedArea = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
const ringBBox = (r) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of r) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) } return [x0, y0, x1, y1] }
const nearRing = (r, p) => { let m = Infinity; for (const v of r) { const d = dist(v, p); if (d < m) m = d } return m }
const NODE_SNAP = 2.0

// ── graph degree (same node model as the detector) ──────────────────────────
const reps = []
const node = (p) => { for (const q of reps) if (dist(p, q.p) < NODE_SNAP) return q; const q = { p, deg: 0 }; reps.push(q); return q }
for (const s of streets) { if (!s?.points?.length) continue; node(s.points[0]).deg++; node(s.points[s.points.length - 1]).deg++ }
for (const s of streets) for (let i = 1; i < (s.points?.length || 0) - 1; i++) { for (const q of reps) if (dist(s.points[i], q.p) < NODE_SNAP) { q.deg += 2; break } }
const degAt = (p) => { for (const q of reps) if (dist(p, q.p) < NODE_SNAP) return q.deg; return 0 }

// through-legs (interior vertex) / terminating-legs at a node coordinate
function legsAt(p) {
  const through = [], term = []
  for (const s of streets) {
    const pts = s.points; if (!pts) continue
    for (let i = 0; i < pts.length; i++) {
      if (dist(pts[i], p) < NODE_SNAP) {
        const interior = i > 0 && i < pts.length - 1
        ;(interior ? through : term).push({ skelId: s.skelId, name: s.name, side: null })
      }
    }
  }
  return { through, term }
}

const jmAt = (p) => jmNodes.map(n => ({ n, d: dist(n.at, p) })).sort((a, b) => a.d - b.d)[0]

// tiles whose runs carry a given skelId (either side), near the node
function tilesWithSkelNear(tiles, skelId, p, reach = 16) {
  const out = []
  for (let ti = 0; ti < tiles.length; ti++) {
    const t = tiles[ti]; if (!t?.runs) continue
    const hasSkel = t.runs.some(r => r.skelId === skelId)
    if (!hasSkel) continue
    let near = false
    for (const r of (t.iA || [])) { if (nearRing(r, p) < reach) { near = true; break } }
    if (near) out.push(ti)
  }
  return out
}

// window(s) spanning the node
function winsAtNode(thruWins, p, reach = 6) {
  return thruWins.filter(w => nearRing(w, p) < reach)
}

// ped throat slivers at the node (mirror the detector's junction-band measure)
const cw = design.curbWidth
const stripMat = { outer: 'LU', inner: 'SW' }
function pedSliversAt(tiles, tis, p, throatR = 14, sliverArea = 8) {
  let slivers = 0, worst = Infinity, count = 0
  for (const ti of tis) {
    const sp = sectionPassTile(tiles[ti], cw, stripMat, null)
    const flat = (byLu) => Object.values(byLu || {}).flat()
    const rings = [...flat(sp.tlByLu), ...sp.Wacc].filter(r => r && r.length >= 3)
    for (const r of rings) {
      if (nearRing(r, p) >= throatR) continue
      const a = Math.abs(signedArea(r)); count++
      if (a < sliverArea) { slivers++; if (a < worst) worst = a }
    }
  }
  return { slivers, worst: isFinite(worst) ? +worst.toFixed(1) : null, count }
}

const TARGETS = [
  ['Kennett Place × S 18th', [386.5, 149.0]],
  ['Mackay × Hickory',       [29.3, -434.9]],
  ['Rutger × S 18th',        [453.6, -197]],
  ['Mississippi-Alley × S18', [440.4, -148]],
  ['Carroll × S 18th',       [394.5, 99]],
]

const OFF = build(false), ON = build(true)
const tOff = OFF._shapeArtifact || [], tOn = ON._shapeArtifact || []
console.log(`\n═══ THRU-NODE PROBE (A/B: thruTNode off→on) ═══`)
console.log(`   windows total: ${(OFF._thruWins || []).length} → ${(ON._thruWins || []).length};  tiles ${tOff.length}\n`)
for (const [name, p] of TARGETS) {
  const deg = degAt(p)
  const { through, term } = legsAt(p)
  const jm = jmAt(p)
  const e3 = jm && jm.d < NODE_SNAP ? ((jm.n.continuity?.length || 0) > 0 || (jm.n.deTaper?.length || 0) > 0 || !!jm.n.apron) : '?'
  const winsOff = winsAtNode(OFF._thruWins || [], p), winsOn = winsAtNode(ON._thruWins || [], p)
  const frontage = through.map(t => ({ skel: t.skelId, tiles: tilesWithSkelNear(tOn, t.skelId, p) }))
  const allTisOff = [...new Set(through.flatMap(t => tilesWithSkelNear(tOff, t.skelId, p)))]
  const allTisOn = [...new Set(frontage.flatMap(f => f.tiles))]
  const pedOff = pedSliversAt(tOff, allTisOff, p)
  const pedOn = pedSliversAt(tOn, allTisOn, p)
  console.log(`▶ ${name}  @(${p})`)
  console.log(`    deg=${deg}  through=[${through.map(t => t.skelId).join(', ')}]  term=[${term.map(t => t.skelId).join(', ')}]  jm=${JSON.stringify(jm?.n.kinds)}  E3=${e3}`)
  console.log(`    through-frontage tiles: ${frontage.map(f => f.skel + '→[' + f.tiles.join(',') + ']').join('  ')}`)
  console.log(`    WINDOW @ node:   off=${winsOff.length}  →  on=${winsOn.length}   ${winsOn.length && !winsOff.length ? '(now spans the mouth ✔ — cure a: asphalt)' : ''}`)
  console.log(`    ped throat slivers(<8m²): off=${pedOff.slivers}(worst ${pedOff.worst}m²)  →  on=${pedOn.slivers}(worst ${pedOn.worst}m²)   ${pedOn.slivers >= 2 ? '❌ STILL FRAGMENTED (cure b NOT delivered)' : '✅ coherent'}`)
  console.log('')
}
