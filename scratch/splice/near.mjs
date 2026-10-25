// Splice probe: at a coordinate, the ① block-ring vertices (with owners) and the MINT's chains (tessellated skeleton, as
// remint.mjs builds them) that pass within R metres: nearest vertex, end or interior, caps degree.
//   CARTOGRAPH_SCENE=<s> RIBP=<frozen ribbons> node scratch/splice/near.mjs --data=<root> --ribbons=<re-mint> --at=x,z [--r=1]
import fs from 'fs'; import { join } from 'path'
const A = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const scene = process.env.CARTOGRAPH_SCENE, root = A('data') || '.', at = A('at').split(',').map(Number), R = +(A('r') || 1)
const { tessellateAdaptive } = await import('../../cartograph/derive.js')
const rb = JSON.parse(fs.readFileSync(process.env.RIBP, 'utf8')), sk = JSON.parse(fs.readFileSync(join(root, 'cartograph/data', scene, 'clean/skeleton.json'), 'utf8'))
const simp = new Map((sk.streets || []).map(st => [st.id, tessellateAdaptive((st.points || []).map(q => (Array.isArray(q) ? [q[0], q[1]] : [q.x, q.z])), st.segments)]))
const d = (p) => Math.hypot(p[0] - at[0], p[1] - at[1]), f = (p) => `(${p[0].toFixed(4)}, ${p[1].toFixed(4)})`
for (const s of rb.streets) { const P = simp.get(s.skelId ?? s.name); if (!P) continue
  let bi = -1, bd = Infinity; P.forEach((p, i) => { if (d(p) < bd) { bd = d(p); bi = i } })
  let sd = Infinity; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((at[0] - a[0]) * dx + (at[1] - a[1]) * dz) / L2)) : 0; sd = Math.min(sd, Math.hypot(a[0] + t * dx - at[0], a[1] + t * dz - at[1])) }
  if (sd > R) continue
  const end = bi === 0 ? `start deg ${s.caps?.start?.degree}` : bi === P.length - 1 ? `end deg ${s.caps?.end?.degree}` : `interior ${bi}/${P.length - 1}`
  console.log(`chain ${s.skelId} gs=${!!s.gradeSeparated} passes ${(sd * 1000).toFixed(1)} mm · nearest vertex ${f(P[bi])} ${(bd * 1000).toFixed(1)} mm, ${end}`) }
const P = JSON.parse(fs.readFileSync(A('ribbons'), 'utf8')).protopolygon
const rs = [...P.blocks.map((r, k) => [r, P.blockLabels[k], 'b' + k]), ...(P.blockHoles || []).flatMap((hs, k) => (hs || []).map((h, j) => [h, P.blockHoleLabels?.[k]?.[j], `h${k}.${j}`]))]
for (const [r, L, id] of rs) { const near = r.map((v, i) => i).filter(i => d(r[i]) < Math.max(0.05, R / 20)); if (!near.length) continue
  const lo = Math.min(...near) - 1, hi = Math.max(...near) + 1
  for (let i = lo; i <= hi; i++) { const j = (i + r.length) % r.length, o = P.owners[L[j]], q = r[(j + 1) % r.length]
    console.log(`  ring ${id} [${j}] ${f(r[j])} → edge ${(Math.hypot(q[0] - r[j][0], q[1] - r[j][1]) * 1000).toFixed(2)} mm ${o?.skelId}|${o?.side}|${o?.segOrd} src ${o?.srcIdx}`) } }
