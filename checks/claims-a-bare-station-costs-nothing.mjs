// claims-a-bare-station-costs-nothing.mjs — THE DRAPE DOES NO WORK IT THROWS AWAY, AND A CHUNK COSTS ITS OWN LENGTH.
//
// Two claims about src/lib/revetmentDrape.js#revetmentDrape (BRIEF-the-far-shore-is-not-built-at-load, Step 1), each READ
// off the module's own output on every coastal town's slab (public/baked/<town>/: the ground, terrain and revetment.json
// the player reads), with the drawn ground as groundAt exactly as SlabRevetment.jsx builds it:
//   1. A BARE STATION COSTS NOTHING. The source's own `if (bare) return false` (stationRow) is removed from a copy; the copy and the module
//      must build the same bytes (position, normal, index) for every armoured face, whole AND in the near layer's chunks
//      (`stations`), at the far layer's octaves (1) and the near layer's (3, sampled chunks). A bare column keeps no vertex
//      and a quad needs three kept corners, so skipping it can change nothing; if it ever does, the skip is wrong.
//   2. A CHUNK IS SIZED TO ITS STATIONS. Its built grid (`stats.gridVerts`) is at most its own stations plus the normal
//      margin, times nAcross — never the face's — and the chunks' triangles, taken together, are the whole build's.
// ⛔ No town found is RED, never a quiet pass: a check that ran on nothing proves nothing.
// ▶ node checks/claims-a-bare-station-costs-nothing.mjs [--slab=<dir holding <town>/>] [--mutants]
//   --mutants: a widened skip, a whole-face allocation and a mis-offset vertex each turn it RED.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { makeDrawnGround } from '../src/lib/drawnGround.js'
import { makeElevationSampler } from '../src/lib/terrainCommon.js'
import { revetmentFaces, toeFor } from '../src/lib/revetmentFromSlab.js'
import { drapeChunks } from '../src/lib/shoreChunks.js'
import { MIN_ARMOUR_D50_M } from '../cartograph/shore-armour.mjs'
import { isWaterGroupId } from '../src/components/waterMaterial.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = join(ROOT, 'src/lib/revetmentDrape.js')
const SLAB = process.argv.find(a => a.startsWith('--slab='))?.slice(7) ?? join(ROOT, 'public/baked')
const SKIP = '  if (bare) return false\n'
const NEAR_SAMPLE = 40          // every 40th near-layer chunk per face: octaves 3 over a whole shore is minutes

// a copy of the module with one edit, its imports made absolute so it loads from the OS temp dir
const copyOf = (a, b) => { const src = readFileSync(HOME, 'utf8')
  if (!src.includes(a)) throw new Error(`⛔ mutant target gone from revetmentDrape.js: ${JSON.stringify(a)}`)
  const out = join(mkdtempSync(join(tmpdir(), 'drape-')), 'revetmentDrape.mjs')
  writeFileSync(out, src.replace(a, b).replace("from 'three'", `from '${import.meta.resolve('three')}'`)
    .replace("from '../../cartograph/shore-armour.mjs'", `from '${pathToFileURL(join(ROOT, 'cartograph/shore-armour.mjs')).href}'`)
    .replace("from './farQuant.js'", `from '${pathToFileURL(join(ROOT, 'src/lib/farQuant.js')).href}'`))
  return import(pathToFileURL(out).href) }

const towns = existsSync(SLAB) ? readdirSync(SLAB).filter(t => ['revetment.json', 'ground.json', 'ground.bin', 'terrain.json', 'terrain.bin'].every(f => existsSync(join(SLAB, t, f)))) : []
const fixtures = towns.map(t => {
  const rd = (f) => readFileSync(join(SLAB, t, f)), ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  const tj = JSON.parse(rd('terrain.json')), T = makeElevationSampler({ ...tj, data: new Float32Array(ab(rd('terrain.bin'))) }, 1)
  const D = makeDrawnGround(JSON.parse(rd('ground.json')), ab(rd('ground.bin')), { groups: g => !isWaterGroupId(g.id) && g.partition !== false, rawAt: T.getElevationRaw })
  // off the drawn mesh, the field (drawnGroundParts' offMesh), as the player reads it
  const groundAt = (x, z) => { const p = D.partsAt(x, z); return p ? p.raw + p.y : T.getElevationRaw(x, z) }
  const floorM = tj.bed?.visibleToM ?? 0
  const faces = revetmentFaces(JSON.parse(rd('revetment.json'))).filter(f => f.anyArmour).map(f => {
    const waterY = f.levelM ?? 0, toeFloor = Math.max(floorM, f.lowM != null ? waterY - f.lowM + MIN_ARMOUR_D50_M : 0)
    return { ...f, toeAt: toeFor(f, groundAt, toeFloor, waterY), berm: f.toeBerm, groundAt, waterY } })
  return { town: t, faces }
})

const bytes = (x) => x ? Buffer.from(x.buffer, x.byteOffset, x.byteLength) : Buffer.alloc(0)
const same = (p, q) => ['position', 'normal'].every(k => bytes(p.geometry.attributes[k]?.array).equals(bytes(q.geometry.attributes[k]?.array)))
  && bytes(p.geometry.index?.array).equals(bytes(q.geometry.index?.array))
const tris = (d) => { const P = d.geometry.attributes.position?.array, I = d.geometry.index?.array, out = []
  if (!P || !I) return out
  for (let t = 0; t < I.length; t += 3) out.push([0, 1, 2].map(c => `${P[I[t + c] * 3]},${P[I[t + c] * 3 + 1]},${P[I[t + c] * 3 + 2]}`).sort().join('|'))
  return out.sort() }

// every build the claims judge: [label, lattice, drape args]; the chunks are the player's (shoreChunks.js#drapeChunks), the near
// ones meeting the far on its rows (conform), as SlabRevetment builds them
function builds(M, f) {
  const out = []
  const [G1, G3] = M.drapeLattices({ poly: f.poly, crestAt: f.crestAt, crestBreaks: f.crestBreaks, toeAt: f.toeAt, berm: f.berm, octaves: [M.FAR_OCTAVES, M.NEAR_OCTAVES] })
  const args = (G, stations, conform = null) => ({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, globals: G, stations, conform })
  out.push({ label: `${f.key} far whole`, G: G1, a: args(G1, null) })
  const chunks = drapeChunks(G1, G3)
  for (const c of chunks) out.push({ label: `${f.key} far chunk ${c.far[0]}`, G: G1, chunkOf: 'far', a: args(G1, c.far) })
  for (const c of chunks) if (c.k % NEAR_SAMPLE === 0) out.push({ label: `${f.key} near chunk ${c.near[0]}`, G: G3, a: args(G3, c.near, G1) })
  return out
}

async function judge(M, ref, say) {
  if (!fixtures.length) { say(false, `no coastal town's slab under ${SLAB} (revetment.json + ground + terrain): nothing was checked`); return }
  for (const { town, faces } of fixtures) {
    let n = 0, diff = 0, firstDiff = null, oversized = 0, firstOver = null, unionBad = 0, firstUnion = null
    for (const f of faces) {
      const mine = builds(M, f), theirs = builds(ref, f)
      const farChunks = [], whole = {}
      for (let k = 0; k < mine.length; k++) {
        const b = mine[k], d = M.revetmentDrape(b.a), e = ref.revetmentDrape(theirs[k].a); n++
        if (!same(d, e)) { diff++; firstDiff ??= b.label }
        if (b.a.stations) { const [i0, i1] = b.a.stations, rows = Math.min(b.G.nAlong - 1, i1 + 1) - Math.max(0, i0 - 1) + 1
          if (d.stats.gridVerts > rows * b.G.nAcross) { oversized++; firstOver ??= `${b.label}: ${d.stats.gridVerts} > ${rows} × ${b.G.nAcross}` } }
        if (b.chunkOf === 'far') farChunks.push(...tris(d)); else if (!b.a.stations) whole.tris = tris(d)
      }
      farChunks.sort()
      if (farChunks.join('\n') !== whole.tris.join('\n')) { unionBad++; firstUnion ??= `${f.key}: chunks ${farChunks.length} tris vs whole ${whole.tris.length}` }
    }
    say(diff === 0, `${town}: claim 1, ${n} builds over ${faces.length} faces (whole, far chunks, near chunks) are byte-identical with the bare skip removed${diff ? ` — ${diff} differ, first ${firstDiff}` : ''}`)
    say(oversized === 0, `${town}: claim 2, every chunk's built grid is its own stations + margin${oversized ? ` — ${oversized} oversized, first ${firstOver}` : ''}`)
    say(unionBad === 0, `${town}: claim 2, the far chunks' triangles are the whole face's${unionBad ? ` — ${unionBad} faces differ, first ${firstUnion}` : ''}`)
  }
}

const M = await import(pathToFileURL(HOME).href)
const REF = await copyOf(SKIP, '')       // the module without its skip: what claim 1 compares against
const bad = []
console.log('── the drape does no work it throws away (revetmentDrape.js)')
await judge(M, REF, (ok, what) => { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad.push(what) })

if (process.argv.includes('--mutants')) {
  console.log('── mutants (each must turn it RED)')
  const MUT = [
    ['the skip widened past bare', SKIP, '  if (h < MIN_ARMOUR_D50_M * 1.5) return false\n'],
    ['the grid sized to the whole face', '  const nRows = bld1 - bld0 + 1\n', '  const nRows = nAlong\n'],
    ['a vertex written at its global index', '    const o = (r0 + j) * 3', '    const o = (i * nAcross + j) * 3'],
  ]
  let alive = 0
  for (const [name, a, b] of MUT) { const red = []; await judge(await copyOf(a, b), REF, (ok, what) => { if (!ok) red.push(what) })
    console.log(`  mutant: ${name} → ${red.length ? 'RED ✓' : 'GREEN ✗'}`); if (!red.length) alive++ }
  if (alive) bad.push(`${alive} mutant(s) survived`)
}
console.log(bad.length ? `⛔ ${bad.length} failed` : '✅ a bare station costs nothing, and a chunk costs its own length')
process.exit(bad.length ? 1 : 0)
