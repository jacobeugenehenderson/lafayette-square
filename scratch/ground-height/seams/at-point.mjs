// at-point.mjs — at one (x, z): the tile whose ring holds it (by geometry), the iA piece, each evidence region of that
// piece within 10 mm (its class and distance), and each painted lawn/walk/curb item within 10 mm (class, LU key,
// distance). READ-ONLY.   node scratch/ground-height/seams/at-point.mjs <dump inputs.json> x z [x z …]
import { readFileSync } from 'fs'
const [dumpP, ...xs] = process.argv.slice(2), dump = JSON.parse(readFileSync(dumpP))
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const dSeg = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)) : 0; return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) }
const dRing = (x, z, r) => { let m = Infinity; for (let i = 0, j = r.length - 1; i < r.length; j = i++) m = Math.min(m, dSeg(x, z, r[j], r[i])); return m }
const keyOf = []; if (dump.lawnKeys) for (const [k, n] of dump.lawnKeys) for (let i = 0; i < n; i++) keyOf.push(k)
const mm = (v) => (v * 1000).toFixed(2) + ' mm'
for (let i = 0; i < xs.length; i += 2) { const x = +xs[i], z = +xs[i + 1]
  console.log(`(${x}, ${z})`)
  dump.tiles.forEach((t, ti) => { if (!t.ring || !pip(x, z, t.ring)) return
    console.log(`  tile ${ti} (${t.producer}) holds it · in iA: ${(t.iA || []).filter(r => r.length >= 3).reduce((c, r) => c ^ pip(x, z, r), false)}`)
    ;(t.evidenceByPiece || []).forEach((parts, pi) => { if (!parts) return
      for (const e of parts) for (const r of e.rings) { const d = dRing(x, z, r); if (d < 0.01) console.log(`     piece ${pi} evidence ${e.lu}${e.ev && e.ev !== e.lu ? '/' + e.ev : ''} ring edge ${mm(d)} away · inside ${pip(x, z, r)}`) } })
  })
  for (const cls of ['walk', 'lawn', 'curb']) dump.bands[cls].forEach((it, j) => { for (const r of [it.outer || it, ...(it.holes || [])]) { const d = dRing(x, z, r); if (d < 0.01) console.log(`  painted ${cls}${cls === 'lawn' ? ' ' + keyOf[j] : ''} #${j} edge ${mm(d)} away · inside ${pip(x, z, r)}`) } })
  if (dump.stencil) console.log(`  disc edge ${mm(dRing(x, z, dump.stencil))} away`)
}
