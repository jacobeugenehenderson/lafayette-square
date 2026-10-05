// Forensic (Sward): pieces whose ground is MIXED — part under a mapped field, part under residential parcels /
// houses. For each piece of a town's baked shape: its class, the share under mapped fields (ribbons.fields), under
// residential-coded parcels (the declared well, read by the live reader), and the buildings (msbf) standing in it.
// 10 m grid. Usage: node scratch/huron-median-lu/mixed-blocks.mjs [town]
import fs from 'fs'
import { classifyUseFromText } from '../../cartograph/parcel-landuse.mjs'
const town = process.argv[2] || 'huron'
const S = JSON.parse(fs.readFileSync(`public/baked/${town}/shape.json`)), rib = JSON.parse(fs.readFileSync(`cartograph/data/${town}/clean/ribbons.json`))
const P = JSON.parse(fs.readFileSync(`cartograph/data/${town}/raw/oh_parcels.json`)).parcels
const B = JSON.parse(fs.readFileSync(`cartograph/data/${town}/raw/msbf.json`)).buildings.filter(b => b.coords?.length >= 3).map(b => [b.coords.reduce((a, q) => a + q.x, 0) / b.coords.length, b.coords.reduce((a, q) => a + q.z, 0) / b.coords.length])
const A = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2 }
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const bb = r => { let b = [Infinity, -Infinity, Infinity, -Infinity]; for (const [x, z] of r) b = [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)]; return b }
const fields = (rib.fields || []).map(f => ({ ...f, bb: bb(f.ring) }))
const res = P.filter(p => p.rings?.[0]?.length >= 3 && classifyUseFromText(String(p.land_use_code)).use === 'residential').map(p => ({ r: p.rings[0], bb: bb(p.rings[0]) }))
const inAny = (x, z, L) => L.some(o => x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && pip(x, z, o.ring || o.r))
const STEP = 10
S.tiles.forEach((t, ti) => t.iA.forEach((r, k) => {
  const a = A(r); if (a < 5e4) return
  const b = bb(r); let n = 0, fld = 0, rs = 0, both = 0
  for (let x = b[0]; x <= b[1]; x += STEP) for (let z = b[2]; z <= b[3]; z += STEP) { if (!pip(x, z, r)) continue; n++
    const f = inAny(x, z, fields), q = inAny(x, z, res); if (f) fld++; if (q) rs++; if (f && q) both++ }
  const houses = B.filter(([x, z]) => x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3] && pip(x, z, r)).length
  if (fld && rs) console.log(`tile ${String(ti).padStart(3)} piece #${k} ${(a / 1e4).toFixed(1).padStart(6)} ha class ${t.luByPiece[k].padEnd(13)} · under mapped fields ${Math.round(100 * fld / n)}% · under residential parcels ${Math.round(100 * rs / n)}% (both ${Math.round(100 * both / n)}%) · ${houses} buildings`)
}))
