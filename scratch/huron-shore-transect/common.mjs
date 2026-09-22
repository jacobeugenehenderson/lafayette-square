import fs from 'fs'
export const ROOT = new URL('../../', import.meta.url).pathname
export const geo = JSON.parse(fs.readFileSync(`${ROOT}/cartograph/data/huron/geography.json`, 'utf8'))
export const osm = JSON.parse(fs.readFileSync(`${ROOT}/cartograph/data/huron/raw/osm.json`, 'utf8'))
export const localToWgs84 = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]

// The 5 m bake, as the control. heights are normalized local-min = 0.
const tj = JSON.parse(fs.readFileSync(`${ROOT}/cartograph/data/huron/clean/terrain.json`, 'utf8'))
const _tbuf = fs.readFileSync(`${ROOT}/cartograph/data/huron/clean/terrain.bin`)
const tb = new Float32Array(_tbuf.buffer, _tbuf.byteOffset, _tbuf.length / 4)
export const baked = {
  meta: tj,
  stepX: (tj.bounds.maxX - tj.bounds.minX) / (tj.width - 1),
  stepZ: (tj.bounds.maxZ - tj.bounds.minZ) / (tj.height - 1),
  get(x, z) {
    const { bounds, width, height } = tj
    const gx = (x - bounds.minX) / this.stepX, gz = (z - bounds.minZ) / this.stepZ
    if (gx < 0 || gz < 0 || gx > width - 1 || gz > height - 1) return NaN
    const i = Math.round(gz) * width + Math.round(gx)
    const v = tb[i]
    return Number.isFinite(v) ? v + tj.baseElev : NaN
  },
  inside(x, z) {
    const b = tj.bounds
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
  },
}

export const M_TO_FT = 3.28084
export const resample = (coords, spacing) => {
  const out = []
  let carry = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1]
    const dx = b.x - a.x, dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    if (len === 0) continue
    let t = carry
    while (t < len) {
      out.push({ x: a.x + dx * (t / len), z: a.z + dz * (t / len), tx: dx / len, tz: dz / len })
      t += spacing
    }
    carry = t - len
  }
  return out
}
