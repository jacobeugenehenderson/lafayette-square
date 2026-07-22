// scratch/overhead-band-coverage.mjs — how much of each baked overhead-impostor
// band is actually opaque? A band whose alpha coverage is ~0 is a FAILED capture:
// the disc renders empty and that species' canopy disappears in Browse.
//
// Usage: node scratch/overhead-band-coverage.mjs [lookName]
// Written 2026-07-22 chasing "are the impostors there or not".
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const look = process.argv[2] || 'lafayette-square'
const root = path.join('public/baked', look, 'trees/overhead')

const stats = (file) => {
  const png = PNG.sync.read(fs.readFileSync(file))
  const { data, width, height } = png
  let opaque = 0, alphaSum = 0, lumSum = 0
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    alphaSum += a
    if (a > 12) { opaque++; lumSum += (data[i] + data[i + 1] + data[i + 2]) / 3 }
  }
  const px = width * height
  return {
    coverage: opaque / px,
    meanAlpha: alphaSum / px / 255,
    meanLum: opaque ? lumSum / opaque : 0,
  }
}

const rows = []
for (const sp of fs.readdirSync(root).sort()) {
  const dir = path.join(root, sp)
  if (!fs.statSync(dir).isDirectory()) continue
  for (const band of ['canopy', 'mid', 'branch']) {
    const f = path.join(dir, `${band}.albedo.png`)
    if (!fs.existsSync(f)) { rows.push({ sp, band, missing: true }); continue }
    rows.push({ sp, band, bytes: fs.statSync(f).size, ...stats(f) })
  }
}

console.log('species'.padEnd(22), 'band'.padEnd(7), 'coverage', ' meanA', '  lum', '  bytes')
for (const r of rows) {
  if (r.missing) { console.log(r.sp.padEnd(22), r.band.padEnd(7), 'MISSING'); continue }
  const flag = r.coverage < 0.005 ? '  ⛔ EMPTY' : r.coverage < 0.02 ? '  ⚠️ sparse' : ''
  console.log(
    r.sp.padEnd(22), r.band.padEnd(7),
    (r.coverage * 100).toFixed(2).padStart(7) + '%',
    r.meanAlpha.toFixed(3).padStart(6),
    r.meanLum.toFixed(0).padStart(5),
    String(r.bytes).padStart(8), flag,
  )
}
