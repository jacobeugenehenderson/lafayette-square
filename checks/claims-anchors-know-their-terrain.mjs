// claims-anchors-know-their-terrain.mjs — DO GROUND ANCHORS KNOW WHICH HEIGHTFIELD THEY CAME FROM?
//
// Trees and lamps are seated by a baked per-object anchor (groundSampler) and lifted by it at
// runtime. A terrain re-bake that moves the datum leaves every anchor bound to its placements
// and uniformly wrong (LS, 2026-09-24: every tree +0.9 m). The guard:
//   ① terrainIdentity separates heightfields: the same field → the same key; a datum shift,
//      one changed sample, or other bounds → a different key;
//   ② both anchor bakes stamp it (bake-tree-anchors, bake-lamps);
//   ③ both runtimes refuse anchors stamped with another heightfield, loudly, naming the fix;
//   ④ what ships: every anchored artifact carries a stamp equal to its town's heightfield.
//
// ▶ MUTATION-TEST IT:
//     · terrainIdentity: skip the sample loop (hash size + bounds only)       → ① RED
//     · InstancedTrees: compare against a constant instead of the live key   → ③ RED
//   Put each back.
//
//   node checks/claims-anchors-know-their-terrain.mjs
import fs from 'fs'
import path from 'path'
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

console.log('③ BOTH RUNTIMES REFUSE A MISMATCH')
for (const [f, field] of [['src/components/InstancedTrees.jsx', 'anchorsDoc.terrain.key'], ['src/components/BakedLamps.jsx', 'j.terrain.key']]) {
  const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')
  const m = new RegExp(`const live = currentTerrainIdentity\\(\\)[\\s\\S]{0,600}${field.replace('.', '\\.')} !== live[\\s\\S]{0,400}console\\.error\\([\\s\\S]{0,500}re-bake`).test(src)
  m ? console.log(`   ✅ ${f}`) : bad(`${f}: no loud refusal comparing ${field} against the live heightfield`)
}

console.log('④ WHAT SHIPS')
const idOf = dir => {
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'terrain.json'), 'utf8')), b = fs.readFileSync(path.join(dir, 'terrain.bin'))
  return terrainIdentity({ ...j, data: new Float32Array(b.buffer, b.byteOffset, j.width * j.height) })
}
for (const look of fs.existsSync('public/baked') ? fs.readdirSync('public/baked') : []) {
  const dir = path.join('public/baked', look)
  const live = fs.existsSync(path.join(dir, 'terrain.bin')) ? idOf(dir) : 'none'
  for (const [file, anchored] of [['tree-anchors.json', d => Array.isArray(d.anchors) && d.anchors.length], ['lamps.json', d => d.lamps?.some(l => typeof l.groundRaw === 'number')]]) {
    const p = path.join(dir, file)
    if (!fs.existsSync(p)) continue
    const d = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (!anchored(d)) continue
    if (!d.terrain) bad(`${look}/${file}: no terrain identity — re-bake its anchors`)
    else if (d.terrain.key !== live) bad(`${look}/${file}: anchored on terrain ${d.terrain.key}, this slab's is ${live} — re-bake its anchors`)
    else console.log(`   ✅ ${look}/${file}: terrain ${live}`)
  }
}

console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
