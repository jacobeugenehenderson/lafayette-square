// claims-the-overhead-core-is-baked.mjs — DOES THE GROVE BAKE THE OVERHEAD IMPOSTOR'S DEEP CORE, AND IS ITS ABSENCE LOUD?
//
// The overhead redesign (docs/briefs/BRIEF-overhead-impostor-redesign.md): at capture, every band below the top is painted,
// under the top band's silhouette (1:1), with one canopy colour and one AO value read off the capture
// (src/components/overheadCore.js). Holds:
//   ① the silhouette is the top band's opaque pixels PLUS the gaps the outside cannot reach — and nothing outside it;
//   ② the colour is the top band's own median opaque albedo, the AO its median AO; the lower bands are painted there,
//      opaque, and left untouched elsewhere (AO pages at their own size included);
//   ③ the Grove sends it: OverheadBaker runs the blank guard on the RAW capture, then bakeOverheadCore, then encodes;
//   ④ the server persists `core` per band, and the runtime says so, loudly, when a lower band carries none;
//   ⑤ (report, not a gate) per town, how many PLACED species are cored — the re-bake is the operator's.
//
// ▶ MUTATION-TEST IT:
//     · overheadCore.js silhouetteMask: return `solid` (skip the flood) → ① RED
//     · arborist/serve.js: delete the `...(b.core ? { core: b.core } : {})` line → ④ RED
//
//   node checks/claims-the-overhead-core-is-baked.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8')
const { silhouetteMask, bakeOverheadCore, OVERHEAD_ALPHA_TEST } = await import(pathToFileURL(path.join(REPO, 'src/components/overheadCore.js')))
let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }
const ok = (m) => console.log(`   ✅ ${m}`)

// A synthetic crown: an opaque ring (r 10..24) around a transparent hole, in a 64² frame; optionally a slit to the outside.
const W = 64
const crown = ({ slit = false, rgbAt = () => [40, 90, 30] } = {}) => {
  const d = new Uint8Array(W * W * 4)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const r = Math.hypot(x - 32, y - 32), i = (y * W + x) * 4
    const inRing = r >= 10 && r <= 24 && !(slit && y === 32 && x > 32)
    if (inRing) { const c = rgbAt(x, y); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255 }
  }
  return d
}
const at = (m, x, y) => m[y * W + x]

console.log('① the silhouette')
{
  const m = silhouetteMask(crown(), W, W)
  at(m, 32, 32) === 1 ? ok('an enclosed gap is inside the silhouette') : bad('the enclosed centre gap was left out — the core would be hollow')
  at(m, 32 + 15, 32) === 1 ? ok('the opaque ring is inside') : bad('an opaque pixel is outside the silhouette')
  at(m, 1, 1) === 0 && at(m, 32 + 28, 32) === 0 ? ok('the outside stays outside') : bad('the silhouette leaked past the crown')
  const s = silhouetteMask(crown({ slit: true }), W, W)
  at(s, 32, 32) === 0 ? ok('a gap the outside reaches is not filled (1:1, no closing)') : bad('a gap open to the outside was filled')
}

console.log('② the paint')
{
  // Top: left half of the ring one colour, right half another, so the median is checkable (more pixels on the right).
  const top = crown({ rgbAt: (x) => (x < 28 ? [10, 20, 30] : [200, 150, 100]) })
  const AO = 32
  const topAO = new Uint8Array(AO * AO * 4).fill(77)
  const low = new Uint8Array(W * W * 4).fill(5)
  const lowAO = new Uint8Array(AO * AO * 4).fill(9)
  const cores = bakeOverheadCore([
    { key: 'mid', albedo: { data: low, width: W, height: W }, ao: { data: lowAO, width: AO, height: AO } },
    { key: 'canopy', albedo: { data: top, width: W, height: W }, ao: { data: topAO, width: AO, height: AO } },
  ])
  const c = cores[0]
  cores[1] === null ? ok('the top band carries no core') : bad('the top band was given a core')
  c && c.rgb.join() === '200,150,100' ? ok(`the colour is the top's median opaque albedo (${c.rgb})`) : bad(`core colour ${c?.rgb} ≠ the top's median 200,150,100`)
  c && c.ao === 77 ? ok('the AO is the top\'s median AO') : bad(`core AO ${c?.ao} ≠ 77`)
  const p = (x, y) => [...low.slice((y * W + x) * 4, (y * W + x) * 4 + 4)].join()
  p(32, 32) === '200,150,100,255' ? ok('the lower band is painted, opaque, inside the silhouette') : bad(`inside the silhouette the lower band reads ${p(32, 32)}`)
  p(1, 1) === '5,5,5,5' ? ok('outside it, the lower band is untouched') : bad(`outside the silhouette the lower band changed to ${p(1, 1)}`)
  lowAO[(16 * AO + 16) * 4] === 77 && lowAO[0] === 9 ? ok('the AO page (its own size) is painted in the same region only') : bad(`AO page: centre ${lowAO[(16 * AO + 16) * 4]}, corner ${lowAO[0]}`)
  let threw = false
  try { bakeOverheadCore([{ key: 'mid', albedo: { data: low, width: W, height: W }, ao: { data: lowAO, width: AO, height: AO } }, { key: 'canopy', albedo: { data: new Uint8Array(W * W * 4), width: W, height: W }, ao: { data: topAO, width: AO, height: AO } }]) } catch { threw = true }
  threw ? ok('an empty top band throws (no silhouette, no core)') : bad('an empty top band baked a core silently')
  OVERHEAD_ALPHA_TEST > 0 && OVERHEAD_ALPHA_TEST < 1 ? ok(`one cutout threshold (${OVERHEAD_ALPHA_TEST}) shared by the core and the runtime`) : bad('OVERHEAD_ALPHA_TEST is out of range')
}

console.log('③ the Grove sends it')
{
  const s = src('src/arborist/OverheadBaker.jsx')
  const iGuard = s.indexOf('alphaCoverage(r.albedo)'), iCore = s.indexOf('bakeOverheadCore(readbacks)'), iPng = s.indexOf('readbackToPng(readbacks[')
  iGuard > 0 && iCore > iGuard && iPng > iCore ? ok('blank guard on the raw capture → bakeOverheadCore → encode') : bad(`OverheadBaker order is wrong or drifted (guard ${iGuard}, core ${iCore}, encode ${iPng})`)
  ;/core: cores\[k\]/.test(s) ? ok('each band\'s core record rides the POST') : bad('the core record is not sent')
  const rt = src('src/components/OverheadTrees.jsx')
  ;/alphaTest: OVERHEAD_ALPHA_TEST/.test(rt) ? ok('the runtime cuts at the same threshold') : bad('the runtime overhead material has its own alphaTest')
}

console.log('④ persisted, and its absence is loud')
{
  const s = src('arborist/serve.js')
  const h = s.slice(s.indexOf("POST /overhead/:look/:species"), s.indexOf("POST /hero-impostor/"))
  ;/\.\.\.\(b\.core \? \{ core: b\.core \} : \{\}\)/.test(h) ? ok('serve.js writes `core` into the band record') : bad('serve.js drops the core — every capture would read as stale')
  const rt = src('src/components/OverheadTrees.jsx')
  ;/slice\(0, -1\)\.filter\(\(b\) => !b\.core\)/.test(rt) && /console\.error\(`\[overhead\] ⛔/.test(rt) ? ok('OverheadTrees errors on a lower band without a core') : bad('the runtime is silent about a missing core')
}

console.log('⑤ placed species still carrying pre-core captures (report; the re-bake is the operator\'s)')
// ⭐ The denominator is the species PLACED in the town (trees.json), not every overhead record: the atlas also holds
// records for roster species no tree uses, and counting them read HPDM 7/17 when all 7 placed species were cored.
for (const town of fs.readdirSync(path.join(REPO, 'public/baked'))) {
  const f = path.join(REPO, 'public/baked', town, 'trees-atlas.json'), t = path.join(REPO, 'public/baked', town, 'trees.json')
  if (!fs.existsSync(f) || !fs.existsSync(t)) continue
  const oh = JSON.parse(fs.readFileSync(f, 'utf8')).overheadBySpecies || {}
  const placed = [...new Set((JSON.parse(fs.readFileSync(t, 'utf8')).instances || []).map((i) => i.species))].filter(Boolean)
  if (!placed.length) continue
  const noRecord = placed.filter((sp) => !oh[sp])
  const stale = placed.filter((sp) => oh[sp] && (oh[sp].bands || []).slice(0, -1).some((b) => !b.core))
  const cored = placed.length - noRecord.length - stale.length
  console.log(`   ${stale.length || noRecord.length ? '⚠️ ' : '✅'} ${town}: ${cored}/${placed.length} placed species cored`
    + (stale.length ? ` — ${stale.length} awaiting a Grove re-bake` : '')
    + (noRecord.length ? ` — ${noRecord.length} with no overhead record at all (${noRecord.join(', ')})` : ''))
}

console.log(red ? `\n⛔ ${red} claim(s) RED` : '\n✅ the overhead core is baked, sent, persisted, and loud when absent')
process.exit(red ? 1 : 0)
