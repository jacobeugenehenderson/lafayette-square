// claims-anchors-know-their-terrain.mjs — DO GROUND ANCHORS KNOW WHICH HEIGHTFIELD THEY CAME FROM?
//
// Trees and lamps are seated by a baked per-object anchor (groundSampler) and lifted by it at
// runtime. A terrain re-bake that moves the datum leaves every anchor bound to its placements
// and uniformly wrong (LS, 2026-09-24: every tree +0.9 m). The guard:
//   ① terrainIdentity separates heightfields: the same field → the same key; a datum shift,
//      one changed sample, or other bounds → a different key;
//   ② both anchor bakes stamp it (bake-tree-anchors, bake-lamps);
//   ③ ONE VERDICT (src/lib/anchorGate.js), read on both sides (Boz ruled, 2026-10-29): the runtimes (InstancedTrees,
//      BakedLamps) refuse a town whose anchors fail it, by name, drawing none of its trees or lamps, and Publish refuses the
//      slab before anything is committed or uploaded (cartograph/anchorGate.mjs), so the runtime refusal is the backstop.
//      The verdict, planted: a good anchor file passes; no placementKey, another one, no terrain, another terrain, another
//      length, a non-number anchor, a lamp without groundRaw: each refused;
//   ④ what ships: every slab on disk passes the same verdict Publish applies;
//   ⑤ NO FIELD FALLBACK: no consumer resolves an anchor by sampling (getElevation* inside a groundPairs resolver), and
//      treeGroundRaw (the fallback) is gone.
//
// ▶ MUTANTS (--mutants), each RED: the verdict ignoring another heightfield → ③ · Publish's guard removed → ③ ·
//   a field fallback put back in a resolver → ⑤.
//
//   node checks/claims-anchors-know-their-terrain.mjs [--mutants]
import fs from 'fs'
import path from 'path'
import os from 'os'
import { pathToFileURL } from 'url'
import { terrainIdentity } from '../src/lib/terrainCommon.js'

let red = 0
const bad = m => { red++; console.log(`   ⛔ ${m}`) }

console.log('① THE IDENTITY SEPARATES HEIGHTFIELDS')
{
  const base = { width: 3, height: 3, bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, data: Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]) }
  const same = { ...base, data: Float32Array.from(base.data) }
  const shifted = { ...base, data: base.data.map(v => v + 0.9) }
  const one = { ...base, data: Float32Array.from(base.data) }; one.data[4] += 0.01
  const moved = { ...base, bounds: { ...base.bounds, maxX: 11 } }
  const k = terrainIdentity(base)
  terrainIdentity(same) === k ? console.log('   ✅ same field → same key') : bad('identical fields got different keys')
  terrainIdentity(shifted) !== k ? console.log('   ✅ datum shift (+0.9 m everywhere) → different key') : bad('a datum shift kept the key')
  terrainIdentity(one) !== k ? console.log('   ✅ one sample changed → different key') : bad('a changed sample kept the key')
  terrainIdentity(moved) !== k ? console.log('   ✅ other bounds → different key') : bad('other bounds kept the key')
  terrainIdentity(null) === 'none' ? console.log("   ✅ no terrain → 'none'") : bad("no terrain is not 'none'")
}

console.log('② BOTH BAKES STAMP IT')
for (const f of ['cartograph/bake-tree-anchors.js', 'cartograph/bake-lamps.js']) {
  const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')
  ;/terrain\.identity/.test(src) && /terrain:\s*\{\s*key:|terrain:\s*terrainStamp|terrain:\s*anchoring\.terrain/.test(src)
    ? console.log(`   ✅ ${f}`) : bad(`${f} does not stamp terrain.identity into its output`)
}

console.log('③ ONE VERDICT, AT THE RUNTIME AND AT PUBLISH')
const text = (f) => fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')
function sides(src) {
  const out = []
  for (const [f, fn, refuse] of [['src/components/InstancedTrees.jsx', 'treeAnchorsVerdict', /instances: \[\]/], ['src/components/BakedLamps.jsx', 'lampAnchorsVerdict', /j = null/]]) {
    const t = src[f] ?? text(f)
    new RegExp(`${fn}\\(\\{[^}]*terrainId: currentTerrainIdentity\\(\\)[\\s\\S]{0,200}if \\(!v\\.ok\\)[\\s\\S]{0,120}console\\.error\\([\\s\\S]{0,400}${refuse.source}`).test(t)
      ? out.push([true, `${f}: ${fn} against the live heightfield; refused by name, none drawn`]) : out.push([false, `${f}: no refusal through ${fn} against the live heightfield`])
  }
  const sv = src['cartograph/serve.js'] ?? text('cartograph/serve.js'), pub = sv.indexOf("path.match(/^\\/looks\\/([^/]+)\\/publish$/)"), guard = sv.indexOf('slabAnchorRefusals(', pub), add = sv.indexOf('git add', pub)
  pub > 0 && guard > pub && add > guard && /if \(unanchored\.length\) throw/.test(sv.slice(guard, add))
    ? out.push([true, 'cartograph/serve.js: Publish refuses a slab by slabAnchorRefusals before it commits or uploads']) : out.push([false, 'cartograph/serve.js: Publish does not refuse a slab by slabAnchorRefusals before git add'])
  return out
}
for (const [ok, m] of sides({})) ok ? console.log(`   ✅ ${m}`) : bad(m)
const gateOf = async (src) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-gate-')), f = path.join(d, 'anchorGate.mjs'); fs.writeFileSync(f, src); return import(pathToFileURL(f).href) }
function planted(G) {
  const inst = [{ x: 1, z: 2 }, { x: 3, z: 4 }], key = G.placementKeyOf(inst), T = 'abcd1234', good = { anchors: [1.5, 2.5], placementKey: key, terrain: { key: T } }
  const refuse = [['no file', null], ['no placementKey', { ...good, placementKey: undefined }], ['another placementKey', { ...good, placementKey: '00000000' }],
    ['no terrain identity', { ...good, terrain: undefined }], ['another heightfield', { ...good, terrain: { key: 'ffffffff' } }], ['another length', { ...good, anchors: [1.5] }], ['a non-number anchor', { ...good, anchors: [1.5, null] }]]
  const out = [[G.treeAnchorsVerdict({ doc: good, instances: inst, terrainId: T }).ok, 'a good tree anchor file passes']]
  for (const [what, doc] of refuse) out.push([!G.treeAnchorsVerdict({ doc, instances: inst, terrainId: T }).ok, `tree anchors with ${what} → refused`])
  out.push([G.lampAnchorsVerdict({ doc: { terrain: { key: T }, lamps: [{ groundRaw: 1 }] }, terrainId: T }).ok, 'good lamp anchors pass'])
  out.push([!G.lampAnchorsVerdict({ doc: { terrain: { key: T }, lamps: [{ groundRaw: 1 }, { x: 0 }] }, terrainId: T }).ok, 'a lamp without groundRaw → refused'])
  out.push([!G.lampAnchorsVerdict({ doc: { terrain: { key: 'ffffffff' }, lamps: [{ groundRaw: 1 }] }, terrainId: T }).ok, 'lamps on another heightfield → refused'])
  return out
}
const GATE = fs.readFileSync('src/lib/anchorGate.js', 'utf8')
for (const [ok, m] of planted(await gateOf(GATE))) ok ? console.log(`   ✅ planted: ${m}`) : bad(`planted: ${m}`)

console.log('④ WHAT SHIPS — every slab on disk, by the verdict Publish applies')
const SLAB = process.argv.find(a => a.startsWith('--slab='))?.slice(7) ?? 'public/baked'
const { slabAnchorRefusals } = await import('../cartograph/anchorGate.mjs')
for (const look of fs.existsSync(SLAB) ? fs.readdirSync(SLAB).filter(d => fs.statSync(path.join(SLAB, d)).isDirectory()) : []) {
  const r = slabAnchorRefusals(path.join(SLAB, look), look)
  r.length ? bad(`${look}: Publish would refuse it — ${r.map(u => `${u.what}: ${u.why}`).join(' · ')}`) : console.log(`   ✅ ${look}`)
}

console.log('⑤ NO FIELD FALLBACK')
function fallbacks(src) {
  const out = []
  for (const f of ['src/components/InstancedTrees.jsx', 'src/components/HeroImpostorTrees.jsx', 'src/components/OverheadTrees.jsx', 'src/components/StreetLights.jsx', 'src/utils/elevation.js']) {
    const t = src[f] ?? text(f)
    for (const m of t.matchAll(/groundPairs\(([^\n]*)/g)) if (/getElevation|drawnGround|treeGroundRaw/.test(m[1])) out.push(`${f}: a groundPairs resolver samples the ground (${m[1].slice(0, 80)})`)
    if (/export function treeGroundRaw/.test(t)) out.push(`${f}: treeGroundRaw, the field fallback, is back`)
  }
  return out
}
const fb = fallbacks({}); fb.length ? fb.forEach(bad) : console.log('   ✅ every anchored consumer resolves through anchoredRaw; no resolver samples the ground')

if (process.argv.includes('--mutants')) {
  console.log('── mutants (each must turn it RED)')
  let alive = 0
  const one = (name, red) => { console.log(`   mutant: ${name} → ${red ? 'RED ✓' : 'GREEN ✗'}`); if (!red) alive++ }
  const a = "  if (doc.terrain.key !== terrainId) return { ok: false, why: `tree-anchors.json was sampled from another heightfield"
  if (!GATE.includes(a)) bad('mutant anchor gone from src/lib/anchorGate.js')
  else one('the verdict ignoring another heightfield', planted(await gateOf(GATE.replace(a, '  if (false) return { ok: false, why: `'))).some(([ok]) => !ok))
  const sv = text('cartograph/serve.js'), g = 'if (unanchored.length) throw'
  one("Publish's guard removed", !sides({ 'cartograph/serve.js': sv.replace(g, 'if (false) throw') }).every(([ok]) => ok))
  const st = text('src/components/StreetLights.jsx'), r = "groundPairs(allLamps, l => anchoredRaw(l, 'lamp'))"
  one('a field fallback put back in a resolver', st.includes(r) && fallbacks({ 'src/components/StreetLights.jsx': st.replace(r, "groundPairs(allLamps, l => (typeof l.groundRaw === 'number' ? l.groundRaw : getElevationRaw(l.x, l.z)))") }).length > 0)
  if (alive) red++
}

console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
