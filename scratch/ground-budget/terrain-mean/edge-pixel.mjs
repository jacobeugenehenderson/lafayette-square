// edge-pixel.mjs <scene> <i> <j> — for one terrain node, every pixel the check's exact quadrilateral and the bake's
// per-node affine (elevationSources.mjs#rasterToGrid) disagree about, with how far each lies from the box edge.
import { readFileSync } from 'fs'
import { join } from 'path'
import { elevationSpecs, openRasters, readWindow } from '../../../cartograph/elevationSources.mjs'
const [scene, I, J] = process.argv.slice(2), i = +I, j = +J
const root = new URL('../../../', import.meta.url).pathname, data = join(root, 'cartograph/data', scene)
const geo = JSON.parse(readFileSync(join(data, 'geography.json'))), tj = JSON.parse(readFileSync(join(data, 'clean/terrain.json')))
const toLL = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]
const B = tj.bounds, sx = (B.maxX - B.minX) / (tj.width - 1), sz = (B.maxZ - B.minZ) / (tj.height - 1)
const x = B.minX + i * sx, z = B.minZ + j * sz
const opened = await openRasters(elevationSpecs(data))
const win = await readWindow(opened, { cornersLL: [toLL(x - 10, z - 10), toLL(x + 10, z - 10), toLL(x + 10, z + 10), toLL(x - 10, z + 10)], quiet: true })
for (const S of win) {
  const P = (X, Z) => { const [px, py] = S.proj.to(...toLL(X, Z)); return [(px - S.x0) / S.rx, (py - S.y0) / S.ry] }
  const q = [P(x - sx / 2, z - sz / 2), P(x + sx / 2, z - sz / 2), P(x + sx / 2, z + sz / 2), P(x - sx / 2, z + sz / 2)]
  const par = [q[1][0] + q[3][0] - q[0][0] - q[2][0], q[1][1] + q[3][1] - q[0][1] - q[2][1]]   // how far the 4th corner is off the parallelogram
  const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1]], e2 = [q[3][0] - q[0][0], q[3][1] - q[0][1]], det = e1[0] * e2[1] - e1[1] * e2[0]
  const sg = Math.sign((q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]))
  let nQ = 0, nA = 0
  for (let b = Math.floor(Math.min(...q.map(p => p[1]))) - 1; b <= Math.ceil(Math.max(...q.map(p => p[1]))) + 1; b++)
    for (let a = Math.floor(Math.min(...q.map(p => p[0]))) - 1; a <= Math.ceil(Math.max(...q.map(p => p[0]))) + 1; a++) {
      const cr = [0, 1, 2, 3].map(e => { const p = q[e], r = q[(e + 1) % 4]; return sg * ((r[0] - p[0]) * (b - p[1]) - (r[1] - p[1]) * (a - p[0])) / Math.hypot(r[0] - p[0], r[1] - p[1]) })
      const inQ = cr.every(c => c >= 0)
      const u = ((a - q[0][0]) * e2[1] - (b - q[0][1]) * e2[0]) / det, v = (e1[0] * (b - q[0][1]) - e1[1] * (a - q[0][0])) / det
      const inA = u >= 0 && u < 1 && v >= 0 && v < 1
      nQ += inQ; nA += inA
      if (inQ !== inA) console.log(`  ${S.label.slice(0, 30)} pixel (${a}, ${b}) v ${S.band[b * S.winW + a]?.toFixed(3)}: quad ${inQ ? 'IN' : 'out'} (edge distances ${cr.map(c => c.toExponential(2)).join(', ')} px) · affine ${inA ? 'IN' : 'out'} (u ${u.toFixed(9)}, v ${v.toFixed(9)})`)
    }
  if (nQ || nA) console.log(`${S.label.slice(0, 30)}: quad ${nQ} pixels · affine ${nA} · the 4th corner off the parallelogram by (${par.map(p => p.toExponential(2)).join(', ')}) px`)
}
