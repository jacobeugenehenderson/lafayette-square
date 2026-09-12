// Read a BAKED ground.json + ground.bin (the slab the live site renders) and expose its
// triangles per group. ⛔ Not a restatement of the bake — it parses the artifact.
import fs from 'fs'
export function loadSlab (dir) {
  const g = JSON.parse(fs.readFileSync(`${dir}/ground.json`, 'utf8'))
  const bin = fs.readFileSync(`${dir}/ground.bin`)
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
  const out = new Map()
  for (const grp of g.groups) {
    const pos = new Float32Array(ab, grp.vertexByteOffset, grp.vertexCount * (g.componentsPerVertex || 3))
    const idx = new Uint32Array(ab, grp.indexByteOffset, grp.indexCount)
    out.set(`${grp.kind}:${grp.id}`, { pos, idx, color: grp.color, cpv: g.componentsPerVertex || 3 })
  }
  return { meta: g, groups: out }
}
export function trisIn (grp, x0, z0, x1, z1) {
  const { pos, idx, cpv } = grp, tris = []
  for (let t = 0; t < idx.length; t += 3) {
    const p = []
    for (let k = 0; k < 3; k++) { const b = idx[t + k] * cpv; p.push([pos[b], pos[b + 2]]) }
    if (p.some(q => q[0] >= x0 && q[0] <= x1 && q[1] >= z0 && q[1] <= z1)) tris.push(p)
  }
  return tris
}
