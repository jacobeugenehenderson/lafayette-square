// Per species: how bright its leaf picture is (between-tree spread) and how much the AO swings inside a crown
// (within-tree spread), both as the card shader sees them (alphaTest 0.4). Reads the source PNGs beside the KTX2 pages.
import fs from 'fs'; import path from 'path'; import { PNG } from 'pngjs'
const scene = process.argv[2]
const root = `public/baked/${scene}/trees/hero-impostor`
const trees = JSON.parse(fs.readFileSync(`public/baked/${scene}/trees.json`))
const count = {}; for (const i of trees.instances) count[i.species] = (count[i.species] || 0) + 1
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))]
const rows = []
for (const sp of fs.readdirSync(root)) {
  const dir = path.join(root, sp); if (!fs.statSync(dir).isDirectory()) continue
  const L = [], AO = []
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^(az\d+)_leaf0\.albedo\.png$/); if (!m) continue      // the FRONT leaf shell — what the eye sees
    const al = PNG.sync.read(fs.readFileSync(path.join(dir, f)))
    const aoF = path.join(dir, `${m[1]}_leaf0.ao.png`); const ao = fs.existsSync(aoF) ? PNG.sync.read(fs.readFileSync(aoF)) : null
    for (let i = 0; i < al.width * al.height; i += 7) {           // every 7th pixel
      const k = i * 4; if (al.data[k + 3] < 0.4 * 255) continue
      L.push(0.2126 * lin(al.data[k]) + 0.7152 * lin(al.data[k + 1]) + 0.0722 * lin(al.data[k + 2]))
      if (ao) { const x = i % al.width, y = (i - x) / al.width   // the AO page is smaller — sample it by UV
        AO.push(ao.data[(Math.floor(y * ao.height / al.height) * ao.width + Math.floor(x * ao.width / al.width)) * 4] / 255) }
    }
  }
  if (!L.length) continue
  L.sort((a, b) => a - b); AO.sort((a, b) => a - b)
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length
  rows.push({ sp, trees: count[sp] || 0, albedo: mean(L), aoMean: AO.length ? mean(AO) : NaN, ao10: pct(AO, 0.1), ao90: pct(AO, 0.9) })
}
rows.sort((a, b) => b.trees - a.trees)
const f = (v) => (Number.isFinite(v) ? v.toFixed(3) : '  -  ')
console.log(`${scene}  (front leaf shell; albedo = mean linear luminance; relight = 0.34 + 0.66·AO at clear weather)`)
console.log('species              trees  albedo  AO p10  AO mean  AO p90   lit p10  lit p90  (albedo × relight)')
for (const r of rows) {
  const rl = (ao) => 0.34 + 0.66 * ao
  console.log(`${r.sp.padEnd(20)} ${String(r.trees).padStart(5)}  ${f(r.albedo)}   ${f(r.ao10)}   ${f(r.aoMean)}    ${f(r.ao90)}    ${f(r.albedo * rl(r.ao10))}   ${f(r.albedo * rl(r.ao90))}`)
}
const al = rows.map((r) => r.albedo)
console.log(`between species: albedo ${Math.min(...al).toFixed(3)}–${Math.max(...al).toFixed(3)} (×${(Math.max(...al) / Math.min(...al)).toFixed(1)})`)
