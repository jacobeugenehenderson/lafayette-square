// heightAt across one drawn triangle at 0.25 m, beside the linear surface the runtime draws (Brace, 2026-10-13, Boz's probe).
//   node --max-old-space-size=8000 scratch/ground-budget/tri-probe.mjs <dump dir> '[[x,z],[x,z],[x,z]]'
import { readFileSync } from 'fs'
const R = new URL('../../', import.meta.url).pathname
const [dir, triS] = process.argv.slice(2), tri = JSON.parse(triS)
const { loadSceneTerrain } = await import(R + 'cartograph/terrainLoad.js')
const { buildDeformer } = await import(R + 'cartograph/groundDeformer.mjs')
const meta = JSON.parse(readFileSync(dir + '/meta.json', 'utf8')), T = loadSceneTerrain(meta.scene)
const D = buildDeformer({ ...JSON.parse(readFileSync(dir + '/deform.json', 'utf8')), raw: T.getElevationRaw })
const H = (x, z) => D.heightAt(x, z) ?? T.getElevationRaw(x, z)
const Hv = tri.map(([x, z]) => H(x, z))
// longest edge
const L = [0, 1, 2].map(i => { const a = tri[i], b = tri[(i + 1) % 3]; return { i, len: Math.hypot(b[0] - a[0], b[1] - a[1]) } }).sort((p, q) => q.len - p.len)[0]
const a = tri[L.i], b = tri[(L.i + 1) % 3], ha = Hv[L.i], hb = Hv[(L.i + 1) % 3]
console.log(`tri ${JSON.stringify(tri)} · vertex heightAt ${Hv.map(h => h.toFixed(3))} · longest edge ${L.len.toFixed(2)} m`)
console.log(`along the longest edge, every 0.25 m (printed every 1 m): s · heightAt · linear · drawn−heightAt · raw · station d · H · bands`)
let worst = { e: 0 }
for (let s = 0; s <= L.len + 1e-9; s += 0.25) {
  const f = s / L.len, x = a[0] + f * (b[0] - a[0]), z = a[1] + f * (b[1] - a[1])
  const h = H(x, z), lin = ha + f * (hb - ha), e = lin - h
  if (Math.abs(e) > Math.abs(worst.e)) worst = { e, s, x, z }
  if (Math.abs(s - Math.round(s)) < 1e-9) { const ex = D.explain(x, z)
    console.log(`  ${s.toFixed(2).padStart(6)} ${h.toFixed(3).padStart(8)} ${lin.toFixed(3).padStart(8)} ${e.toFixed(3).padStart(7)} ${T.getElevationRaw(x, z).toFixed(3).padStart(8)}  d ${ex.d?.toFixed(2) ?? '-'} H ${ex.H?.toFixed(3) ?? '-'} ${ex.outside ? 'outside' : ex.deep ? 'deep' : JSON.stringify(ex.bands)?.slice(0, 90)}`) }
}
console.log(`edge worst: drawn−heightAt ${worst.e.toFixed(3)} m at s ${worst.s} (${worst.x.toFixed(2)}, ${worst.z.toFixed(2)})`)
// interior grid at 0.25 m (barycentric over the triangle's bbox)
const [p0, p1, p2] = tri, det = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])
let iw = { e: 0 }, n = 0
const xs = tri.map(p => p[0]), zs = tri.map(p => p[1])
for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.25) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.25) {
  const u = ((x - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (z - p0[1])) / det, v = ((p1[0] - p0[0]) * (z - p0[1]) - (x - p0[0]) * (p1[1] - p0[1])) / det
  if (u < 0 || v < 0 || u + v > 1) continue
  n++; const e = Hv[0] + u * (Hv[1] - Hv[0]) + v * (Hv[2] - Hv[0]) - H(x, z); if (Math.abs(e) > Math.abs(iw.e)) iw = { e, x, z }
}
console.log(`interior: ${n} points · worst drawn−heightAt ${iw.e.toFixed(3)} m at (${iw.x?.toFixed(2)}, ${iw.z?.toFixed(2)})`)
const ex = D.explain(iw.x, iw.z); console.log(`  there: heightAt ${H(iw.x, iw.z).toFixed(3)} · raw ${T.getElevationRaw(iw.x, iw.z).toFixed(3)} · explain ${JSON.stringify(ex).slice(0, 300)}`)
