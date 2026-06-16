// D6a final gate: wired offset (default) vs legacy carve (iaCarveLegacy).
import fs from 'fs'
import path from 'path'
const ROOT = process.cwd()
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const marks = JSON.parse(fs.readFileSync(path.join(ROOT, 'cartograph/data/lafayette-square/clean/marker_strokes.json')))
const target = Object.values(marks[0]).filter(p => p && typeof p.x === 'number').map(p => [p.x, p.z])
const OPT = { stencil: null, curbWidth: 0.15, smooth: 0, emitArtifact: true }
const off = buildTileGround(ribbons, { ...OPT }).filter ? null : null
const Aoff = buildTileGround(ribbons, { ...OPT })._shapeArtifact
const Aleg = buildTileGround(ribbons, { ...OPT, iaOffset: false })._shapeArtifact

function distToRings(pt, rings) { let best = Infinity; for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1; let t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); best = Math.min(best, Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy))) } return best }
function score(rings) { const ds = target.map(p => distToRings(p, rings)); return { mean: ds.reduce((a, b) => a + b, 0) / ds.length, max: Math.max(...ds) } }
const near = (rings) => rings && rings.some(r => r.some(p => p[0] > 150 && p[0] < 200 && p[1] > 140 && p[1] < 230))

console.log('=== (1) Lafayette×Mississippi vs Jacob’s drawn line ===')
for (let i = 0; i < Aoff.length; i++) { const o = Aoff[i].iA, l = Aleg[i].iA; if (!near(o) && !near(l)) continue; const so = score(o); if (so.mean > 5) continue; console.log(`tile ${i}: legacy mean ${score(l).mean.toFixed(2)}/max ${score(l).max.toFixed(2)}  →  offset mean ${so.mean.toFixed(2)}/max ${so.max.toFixed(2)}`) }

console.log('\n=== (2) map-wide blast radius (per-tile max dev, offset vs legacy) ===')
function dev(P, Q) { let mx = 0; for (const r of P) for (const v of r) mx = Math.max(mx, distToRings(v, Q)); return mx }
const b = { '≤0.10': 0, '0.10–0.50': 0, '0.50–2.0': 0, '2.0–5.0': 0, '>5.0': 0 }
for (let i = 0; i < Aoff.length; i++) { const d = Math.max(dev(Aoff[i].iA, Aleg[i].iA), dev(Aleg[i].iA, Aoff[i].iA)); if (d <= 0.1) b['≤0.10']++; else if (d <= 0.5) b['0.10–0.50']++; else if (d <= 2) b['0.50–2.0']++; else if (d <= 5) b['2.0–5.0']++; else b['>5.0']++ }
for (const [k, v] of Object.entries(b)) console.log(`   ${k.padEnd(12)} ${v} tiles`)

console.log('\n=== (3) straight-run litmus (chain→iA, dev from depth) ===')
function litmus(A) {
  let v = 0
  for (const tile of A) { if (!tile?.iA?.length) continue; let xn = 1e9, xx = -1e9, yn = 1e9, yx = -1e9; for (const p of tile.ring) { xn = Math.min(xn, p[0]); xx = Math.max(xx, p[0]); yn = Math.min(yn, p[1]); yx = Math.max(yx, p[1]) } if (Math.hypot(xx - xn, yx - yn) > 250) continue
    const edges = []; for (const r of tile.iA) for (let i = 0; i < r.length; i++) edges.push([r[i], r[(i + 1) % r.length]])
    for (const run of tile.runs || []) { const poly = run.poly; if (!poly || poly.length < 2) continue; let L = 0; for (let i = 1; i < poly.length; i++) L += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); if (L < 22) continue; const hwL = run.measure?.left?.pavementHW || 0, hwR = run.measure?.right?.pavementHW || 0; if (hwL < 0.5 && hwR < 0.5) continue
      let worst = 0, along = 0
      for (let i = 1; i < poly.length; i++) { const a = poly[i - 1], bb = poly[i]; const sl = Math.hypot(bb[0] - a[0], bb[1] - a[1]) || 1; const fx = (bb[0] - a[0]) / sl, fy = (bb[1] - a[1]) / sl
        for (let d = 0; d <= sl; d += 0.5) { const aA = along + d; if (aA < 9 || aA > L - 9) continue; const O = [a[0] + (bb[0] - a[0]) * (d / sl), a[1] + (bb[1] - a[1]) * (d / sl)]
          for (const [nrm, hw] of [[[-fy, fx], hwL], [[fy, -fx], hwR]]) { if (!(hw > 0.5)) continue; let best = Infinity; for (const [A1, B1] of edges) { const ex = B1[0] - A1[0], ey = B1[1] - A1[1]; const den = ex * nrm[1] - ey * nrm[0]; if (Math.abs(den) < 1e-9) continue; const tt = ((A1[0] - O[0]) * nrm[1] - (A1[1] - O[1]) * nrm[0]) / den; const uu = ((A1[0] - O[0]) * ey - (A1[1] - O[1]) * ex) / den; if (tt >= 0 && tt <= 1 && uu > 0.1 && uu < hw + 4.5 && uu < best) best = uu } if (best < Infinity) worst = Math.max(worst, Math.abs(best - hw)) } }
        along += sl }
      if (worst > 0.75) v++ }
  }
  return v
}
console.log(`   legacy carve: ${litmus(Aleg)} violations`)
console.log(`   offset (D6a): ${litmus(Aoff)} violations`)
