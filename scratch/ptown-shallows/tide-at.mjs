// IS PROVINCETOWN'S BEIGE HARBOUR WATER OR EXPOSED BED? (Argon, read-only.) The level the page's water stands at, at a
// town minute, against the bed — through the page's own modules (waterLevel.mjs tidePhase / waterLevels).
//   node scratch/ptown-shallows/tide-at.mjs [--town=provincetown] [--at=2026-10-07T18:00:00Z]
import { readFileSync } from 'node:fs'
import { tidePhase, waterLevels } from '../../cartograph/waterLevel.mjs'
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d
const town = arg('town', 'provincetown'), at = new Date(arg('at', '2026-10-07T18:00:00Z'))
const T = JSON.parse(readFileSync(`public/baked/${town}/terrain.json`, 'utf8')), man = JSON.parse(readFileSync(`public/baked/${town}/manifest.json`, 'utf8'))
const G = JSON.parse(readFileSync(`public/baked/${town}/ground.json`, 'utf8')), st = G.stencil
const data = new Float32Array(readFileSync(`public/baked/${town}/terrain.bin`).buffer.slice(0))
const W = waterLevels(T.water)
const phase = tidePhase(at, T.water, man.tide)
console.log(`${town} at ${at.toISOString()}: tide phase ${phase.toFixed(3)} (0 = ${W.lowName}, 1 = ${W.highName})`)
// the day's phase, hourly, so the minute is seen in its tide
const day = []; for (let h = 0; h < 24; h++) { const d = new Date(at); d.setUTCHours(at.getUTCHours() - 14 + h, 0, 0, 0); day.push(`${String(h).padStart(2, '0')}h ${tidePhase(d, T.water, man.tide).toFixed(2)}`) }
console.log('town-hourly phase (00h = 14 h before):', day.join(' · '))
const { minX, maxX, minZ, maxZ } = T.bounds, sx = (maxX - minX) / (T.width - 1), sz = (maxZ - minZ) / (T.height - 1), cellHa = sx * sz / 1e4
const vis = T.bed.visibleToM, c = st.center, R = st.radius
const ha = { aboveHigh: 0, exposedNow: 0, shallowWater: 0, deepWater: 0 }, depths = []
for (let j = 0; j < T.height; j++) for (let i = 0; i < T.width; i++) {
  const x = minX + i * sx, z = minZ + j * sz
  if (Math.hypot(x - (c[0] ?? c.x), z - (c[1] ?? c.z)) > R) continue
  const b = data[j * T.width + i]; if (!Number.isFinite(b)) continue
  const hi = W.highAt(x, z), lvl = W.levelAt(x, z, phase)
  if (b > hi) ha.aboveHigh += cellHa
  else if (b > lvl) ha.exposedNow += cellHa
  else if (b > lvl - vis) { ha.shallowWater += cellHa; depths.push(lvl - b) }
  else ha.deepWater += cellHa
}
const q = (a, f) => a.length ? +[...a].sort((x, y) => x - y)[Math.floor(f * (a.length - 1))].toFixed(2) : null
console.log(`levels: low ${W.range.low.map(v => v.toFixed(2)).join('…')} m · high ${W.range.high.map(v => v.toFixed(2)).join('…')} m (terrain zero) · visibility ${vis} m`)
console.log('inside the disc, ha:', Object.fromEntries(Object.entries(ha).map(([k, v]) => [k, +v.toFixed(1)])), `· shallow-water depth p10/p50/p90 m: ${q(depths, .1)} / ${q(depths, .5)} / ${q(depths, .9)}`)
// --map: one pixel per terrain cell — grey above high · ORANGE exposed now · blue by sheet alpha (light = see-through) · dark blue at full alpha
if (process.argv.includes('--map')) {
  const { default: sharp } = await import('sharp')
  const img = Buffer.alloc(T.width * T.height * 3)
  for (let j = 0; j < T.height; j++) for (let i = 0; i < T.width; i++) {
    const x = minX + i * sx, z = minZ + j * sz, k = (j * T.width + i) * 3, b = data[j * T.width + i]
    const inDisc = Math.hypot(x - c[0], z - c[1]) <= R, hi = W.highAt(x, z), lvl = W.levelAt(x, z, phase)
    let col
    if (b > hi) col = [150, 150, 150]
    else if (b > lvl) col = [235, 140, 30]
    else { const a = Math.min(1, (lvl - b) / vis); col = [Math.round(200 - 170 * a), Math.round(225 - 165 * a), Math.round(255 - 115 * a)] }
    if (!inDisc) col = col.map((v) => Math.round(v * 0.4))
    img[k] = col[0]; img[k + 1] = col[1]; img[k + 2] = col[2]
  }
  const out = `scratch/ptown-shallows/${town}-${at.toISOString().slice(0, 16).replace(/:/g, '')}.png`
  await sharp(img, { raw: { width: T.width, height: T.height, channels: 3 } }).resize({ width: 1000 }).png().toFile(out)
  console.log('map:', out, '(north = up if +z is south; z grows downward in the image)')
}
