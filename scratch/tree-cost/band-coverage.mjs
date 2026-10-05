// Per town × species: how much of each overhead band draws, and how much of the lower bands sits under the canopy
// band's silhouette (the core: what a punched-out hole could save). Reads the baked band PNGs (Grain, 2026-10-04).
//   node scratch/tree-cost/band-coverage.mjs [town…]
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { silhouetteMask, OVERHEAD_ALPHA_TEST } from '../../src/components/overheadCore.js'
const towns = process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square', 'huron', 'provincetown']
const cut = Math.round(OVERHEAD_ALPHA_TEST * 255)
const pct = (x) => (100 * x).toFixed(0).padStart(3) + '%'
for (const town of towns) {
  const base = path.join('public/baked', town)
  const atlas = JSON.parse(fs.readFileSync(path.join(base, 'trees-atlas.json'), 'utf8'))
  const placed = {}
  for (const i of JSON.parse(fs.readFileSync(path.join(base, 'trees.json'), 'utf8')).instances) placed[i.species] = (placed[i.species] || 0) + 1
  console.log(`\n== ${town}  (frame-area fractions; "core" = under the canopy band's filled silhouette)`)
  console.log('   species          trees  canopy  core | lower band: opaque · of which in core · rim | cored?')
  let wTop = 0, wCore = 0, wLowOpq = 0, wLowCore = 0, wN = 0
  for (const [sp, n] of Object.entries(placed).sort((a, b) => b[1] - a[1])) {
    const rec = atlas.overheadBySpecies?.[sp]; if (!rec) { console.log(`   ${sp.padEnd(16)} ${String(n).padStart(5)}  — no overhead record`); continue }
    const read = (key) => PNG.sync.read(fs.readFileSync(path.join(base, 'trees/overhead', sp, `${key}.albedo.png`)))
    const bands = rec.bands.map((b) => ({ key: b.key, png: read(b.key), cored: !!b.core }))
    const top = bands[bands.length - 1].png, N = top.width * top.height
    const mask = silhouetteMask(top.data, top.width, top.height)
    let topOpq = 0, core = 0
    for (let i = 0; i < N; i++) { if (top.data[i * 4 + 3] > cut) topOpq++; core += mask[i] }
    const lows = bands.slice(0, -1).map((b) => {
      let opq = 0, inCore = 0
      for (let i = 0; i < N; i++) if (b.png.data[i * 4 + 3] > cut) { opq++; if (mask[i]) inCore++ }
      return `${b.key} ${pct(opq / N)} · ${pct(opq ? inCore / opq : 0)} · ${pct((opq - inCore) / N)}`
    })
    let lowOpqSum = 0, lowCoreSum = 0
    for (const b of bands.slice(0, -1)) for (let i = 0; i < N; i++) if (b.png.data[i * 4 + 3] > cut) { lowOpqSum++; if (mask[i]) lowCoreSum++ }
    wTop += n * topOpq / N; wCore += n * core / N; wLowOpq += n * lowOpqSum / N; wLowCore += n * lowCoreSum / N; wN += n
    console.log(`   ${sp.padEnd(16)} ${String(n).padStart(5)}  ${pct(topOpq / N)}  ${pct(core / N)} | ${lows.join('  |  ')} | ${bands.slice(0, -1).every((b) => b.cored) ? 'yes' : 'NO'}`)
  }
  const drawn = (wTop + wLowOpq) / wN, saved = wLowCore / wN
  console.log(`   ⇒ tree-weighted: fragments drawn per tree = ${drawn.toFixed(2)} frame-areas; a punched core (both lower bands) would remove ${saved.toFixed(2)} (${pct(saved / drawn)} of them)`)
}
