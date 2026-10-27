// claims-the-drawn-raw-is-one-function.mjs — DOES EVERY READER OF THE DRAWN GROUND READ A VERTEX'S PIN THE SAME WAY?
//
// ⭐ THE INVARIANT (Jacob, 2026-10-27: "yes pin the coast"; Boz's order, step 1): a ground vertex may carry its own raw
// height (ground.json `drawnRaw`, a group's `drawnRawByteOffset`; drawnGround.js#drawnPinsOf), with has = 0 the sentinel
// "read the field". The shader and the CPU must read it by ONE rule, or the movers, the trees and the revetment stand on a
// shore the GPU does not draw. This check holds:
//   ⓪ THE TWINS AGREE: drawnGround.js's `DRAWN_RAW_GLSL` (`_drawnRaw`, `_drawnSlope`), EVALUATED, returns what its JS twin
//      `drawnRaw` returns, on a pinned vertex, an unpinned one, and an unpinned one whose stored raw is garbage (NaN, a
//      height): the sentinel is never read as a height;
//   ① THE SHADER'S VARIANT IS MADE FROM THE ONE SNIPPET: terrainShader.js's drawn displacement is TERRAIN_DISPLACE_PERVERTEX
//      with `_terrainRaw(_tuv)` read through `_drawnRaw`, and its normal TERRAIN_NORMAL with the slope read through
//      `_drawnSlope`; the displaced vertex (the snippet's own expression, evaluated) equals drawnGround's heightAt there;
//   ② partsAt READS THE PINS: on a synthetic ground, a pinned vertex reads its pin, a point inside reads the barycentric of
//      the pin and the field, an unpinned vertex reads the field, and a manifest with no `drawnRaw` record reads the field;
//   ③ THE GROUND DRAWS WITH THEM: BakedGround sets `aDrawnRaw` from drawnPinsOf, every ground patchTerrain call (BakedGround,
//      gravelPathMaterial) passes `drawn`, and no module but drawnGround.js decodes `drawnRawByteOffset`;
//   ④ EVERY READER OF ground.bin's LAYOUT IS NAMED: each file in src/, cartograph/ and checks/ that reads `vertexByteOffset`
//      is in the table below with its role, and the role is READ from its source: `drawn` imports the drawn ground,
//      `xz` reads no height field at all. An unnamed reader is RED: a new reader must say how it reads a pin.
//
// ▶ MUTANTS, built in (`--mutants`): each edits the source text this check reads and must turn a section RED —
//     · the GLSL twin reads the field always                          → ⓪ RED
//     · the JS twin ignores the sentinel (reads the stored raw)       → ⓪ RED
//     · partsAt back to the field at the corners                      → ② RED
//     · the drawn displacement made from nothing (target text gone)   → ① RED
//     · BakedGround's FadeMesh drops `drawn`                          → ③ RED
//     · an unnamed reader of the layout                               → ④ RED
//
//   node checks/claims-the-drawn-raw-is-one-function.mjs [--mutants]
// Read-only (the mutants are imported from a temporary copy). Exits 1 when a reader can read a pin differently.
import fs from 'fs'
import os from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { pathToFileURL } from 'url'

const DG = 'src/lib/drawnGround.js', SHADER = 'src/utils/terrainShader.js'
const BG = 'src/components/BakedGround.jsx', GRAVEL = 'src/components/gravelPathMaterial.js'
const read = (f) => fs.readFileSync(f, 'utf8')

// ④'s table: every reader of ground.bin's layout and how it reads a height. `drawn` — through the drawn ground (a pin, else
// the field) · `xz` — positions only, no height field · `writer` — the bake that writes it · `buildings` — reads buildings.bin's
// own layout (the same field names) · `field-diagnostic` — sizes a defect it reports from the field, gating nothing on height ·
// `water` — reads the water sheet's own y (the sheet stands at its level and carries no pins), never a ground vertex's height.
const READERS = {
  'src/lib/drawnGround.js': 'drawn', 'src/components/BakedGround.jsx': 'drawn', 'cartograph/bake-ground.js': 'writer',
  'src/lib/roofTop.js': 'buildings', 'src/components/SlabBuildings.jsx': 'buildings', 'cartograph/bake-buildings.js': 'buildings',
  'src/harness/lab/stage.js': 'xz', 'cartograph/bake-ground-ao.js': 'xz',
  'checks/claims-the-walk-is-level-across.mjs': 'drawn', 'checks/claims-the-road-meets-itself-across-its-centreline.mjs': 'drawn',
  'checks/claims-the-stripe-lies-on-its-road.mjs': 'drawn', 'checks/claims-the-drawn-raw-is-one-function.mjs': 'drawn',
  'checks/claims-the-shore-meets-the-field-at-high.mjs': 'drawn',
  'checks/claims-the-ground-has-no-cross-polygon-t-junctions.mjs': 'field-diagnostic',
  'checks/claims-the-shore-is-closed.mjs': 'field-diagnostic',
  'checks/claims-the-shore-says-what-it-is-made-of.mjs': 'water', 'checks/claims-a-level-body-has-one-surface.mjs': 'water',
  'checks/claims-the-water-is-one-polygon.mjs': 'xz', 'checks/claims-the-horizon-takes-the-towns-cover.mjs': 'xz',
  'checks/claims-the-ground-tiles-without-a-gap.mjs': 'xz', 'checks/claims-the-ground-is-painted-once.mjs': 'xz',
  'checks/claims-the-coast-runs-on-past-the-rim.mjs': 'xz', 'checks/claims-no-tree-stands-on-drawn-hardscape.mjs': 'xz',
  'checks/claims-crop-rows-derived-per-field.mjs': 'xz', 'checks/claims-coplanar-groups-do-not-overlap.mjs': 'xz',
  'checks/claims-a-closed-stripe-keeps-its-hole.mjs': 'xz',
}
const FIELD = /getElevationRaw|getElevation\b|_terrainRaw|makeElevationSampler|loadSceneTerrain|terrain\.bin/
const DRAWN = /makeDrawnGround|drawnPinsOf|drawnRawOf/

// a narrow GLSL → JS rewrite of exactly the constructs DRAWN_RAW_GLSL uses; anything else throws, so a rewrite cannot pass
function twins(glsl) {
  const fn = (name) => { const m = glsl.match(new RegExp(`(?:float|vec2) ${name}\\(([^)]*)\\) \\{ return ([^;]+); \\}`))
    if (!m) throw new Error(`⛔ DRAWN_RAW_GLSL no longer defines \`${name}(…) { return …; }\` on one line`)
    const args = m[1].split(',').map(a => a.trim().split(/\s+/)[1])
    const body = m[2].replace(/pin\.zw \* exag/, '({ x: pin.z * exag, y: pin.w * exag })')
    if (/\b(vec[234]|mix|clamp|texture2D)\b/.test(body)) throw new Error(`⛔ construct this check cannot evaluate: ${m[2]}`)
    // eslint-disable-next-line no-new-func
    return new Function(...args, `return ${body}`) }
  return { _drawnRaw: fn('_drawnRaw'), _drawnSlope: fn('_drawnSlope') }
}

// a synthetic ground: two triangles over a 10 m square, vertex 1 pinned; returns { manifest, bin }
function synthetic({ pinned = true, record = true } = {}) {
  const P = new Float32Array([0, 0, 0, 10, 0, 0, 10, 0, 10, 0, 0.2, 10]), I = new Uint32Array([0, 1, 2, 0, 2, 3])
  const pin = new ArrayBuffer(16); new Uint32Array(pin, 0, 1)[0] = 1; new Float32Array(pin).set([7.25, 0.5, -0.25], 1)
  const parts = [P.buffer, I.buffer, ...(pinned ? [pin] : [])], len = parts.reduce((t, b) => t + b.byteLength, 0)
  const bin = new ArrayBuffer(len), u8 = new Uint8Array(bin); let off = 0; for (const b of parts) { u8.set(new Uint8Array(b), off); off += b.byteLength }
  const g = { id: 'lot', kind: 'face', renderOrder: 0, vertexCount: 4, vertexByteOffset: 0, indexCount: 6, indexByteOffset: P.byteLength,
    ...(pinned ? { drawnRawByteOffset: P.byteLength + I.byteLength, drawnRawCount: 1 } : {}) }
  return { manifest: { bbox: { min: [0, 0, 0], max: [10, 0, 10] }, groups: [g], ...(record ? { drawnRaw: { format: 'synthetic' } } : {}), groundShape: { terrain: true } }, bin }
}
const field = (x, z) => 1 + 0.1 * x + 0.05 * z

async function run(src, log) {
  let red = 0
  const bad = (sec, msg) => { red++; log(`   ⛔ ${sec} ${msg}`) }
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'drawn-raw-')), mod = join(dir, 'drawnGround.mjs')
  fs.writeFileSync(mod, src[DG])
  const D = await import(pathToFileURL(mod).href + `?t=${Date.now()}${Math.random()}`)
  fs.rmSync(dir, { recursive: true, force: true })

  // ⓪ the twins agree, the sentinel never read as a height
  const T = twins(D.DRAWN_RAW_GLSL)
  const cases = [[[1, 7.25, 0.5, -0.25], 3.1], [[0, 0, 0, 0], 3.1], [[0, NaN, NaN, NaN], 3.1], [[0, 99, 4, 4], -2.5], [[1, -0.5, 0, 0], 12]]
  let n0 = 0
  for (const [pin, f] of cases) {
    const pins = Float32Array.from(pin), want = pin[0] > 0.5 ? Math.fround(pin[1]) : f
    const gpu = T._drawnRaw({ x: pins[0], y: pins[1], z: pins[2], w: pins[3] }, f), cpu = D.drawnRaw(pins, 0, f)
    if (!(gpu === cpu && cpu === want)) bad('⓪', `pin (${pin.join(', ')}) over field ${f}: GPU ${gpu} · CPU ${cpu} · the rule ${want}`)
    const sl = T._drawnSlope({ x: pins[0], y: pins[1], z: pins[2], w: pins[3] }, { x: 0.3, y: -0.2 }, 1.5)
    const wantS = pin[0] > 0.5 ? [pins[2] * 1.5, pins[3] * 1.5] : [0.3, -0.2]
    if (Math.abs(sl.x - wantS[0]) > 1e-9 || Math.abs(sl.y - wantS[1]) > 1e-9) bad('⓪', `slope for pin (${pin.join(', ')}): (${sl.x}, ${sl.y}), the rule (${wantS.join(', ')})`)
    n0++
  }
  log(`   ⓪ ${n0} cases: GLSL _drawnRaw / _drawnSlope = JS drawnRaw; has = 0 reads the field whatever is stored`)

  // ② partsAt reads the pins
  { const { manifest, bin } = synthetic(), G = D.makeDrawnGround(manifest, bin, { rawAt: field })
    const at1 = G.partsAt(10, 0), mid = G.partsAt(8, 1), at3 = G.partsAt(0, 10)
    // (8, 1) in triangle 0-1-2: barycentric a = 0.2, b = 0.7, c = 0.1
    const wantMid = 0.2 * field(0, 0) + 0.7 * 7.25 + 0.1 * field(10, 10)
    if (!at1 || Math.abs(at1.raw - 7.25) > 1e-6) bad('②', `the pinned vertex reads ${at1?.raw}, its pin is 7.25`)
    if (!mid || Math.abs(mid.raw - wantMid) > 1e-5) bad('②', `inside, (8, 1) reads ${mid?.raw}; the barycentric of the pin and the field is ${wantMid.toFixed(5)}`)
    if (!at3 || Math.abs(at3.raw - field(0, 10)) > 1e-6) bad('②', `an unpinned vertex reads ${at3?.raw}, the field there is ${field(0, 10)}`)
    const old = synthetic({ record: false }), O = D.makeDrawnGround(old.manifest, old.bin, { rawAt: field })
    if (Math.abs(O.partsAt(10, 0).raw - field(10, 0)) > 1e-6) bad('②', `a ground with no drawnRaw record read a pin: ${O.partsAt(10, 0).raw}`)
    if (!D.predatesThePin(old.manifest) || D.predatesThePin(manifest)) bad('②', 'predatesThePin does not tell a pinned ground from an older one')
    const R = D.drawnRawOf(manifest, manifest.groups[0], bin, field)
    if (Math.abs(R[1] - 7.25) > 1e-6 || Math.abs(R[0] - field(0, 0)) > 1e-6) bad('②', `drawnRawOf reads (${R[0]}, ${R[1]}), want (${field(0, 0)}, 7.25)`)
    log(`   ② partsAt: pin ${at1?.raw?.toFixed(3)} · inside ${mid?.raw?.toFixed(4)} (want ${wantMid.toFixed(4)}) · unpinned ${at3?.raw?.toFixed(3)} · an older ground reads the field`)

    // ① the shader's drawn variant, made from the one snippet, evaluated at the pinned vertex
    const S = src[SHADER]
    const grab = (name) => { const m = S.match(new RegExp(`(?:export )?const ${name} = \`([\\s\\S]*?)\``)); if (!m) throw new Error(`⛔ ${name} not found in ${SHADER}`); return m[1] }
    const call = (name) => { const m = S.match(new RegExp(`export const ${name} = drawnFrom\\((\\w+),\\s*'([^']*)',\\s*'([^']*)'`)); return m && { from: m[1], a: m[2], b: m[3].replace(/\\n/g, '\n') } }
    const dc = call('TERRAIN_DISPLACE_PERVERTEX_DRAWN'), nc = call('TERRAIN_NORMAL_DRAWN')
    if (!dc || dc.from !== 'TERRAIN_DISPLACE_PERVERTEX') bad('①', 'TERRAIN_DISPLACE_PERVERTEX_DRAWN is not made by drawnFrom from TERRAIN_DISPLACE_PERVERTEX')
    if (!nc || nc.from !== 'TERRAIN_NORMAL') bad('①', 'TERRAIN_NORMAL_DRAWN is not made by drawnFrom from TERRAIN_NORMAL')
    if (dc) {
      const base = grab('TERRAIN_DISPLACE_PERVERTEX')
      if (!base.includes(dc.a)) bad('①', `the drawn displacement's target \`${dc.a}\` is not in TERRAIN_DISPLACE_PERVERTEX: drawnFrom would throw at load`)
      else {
        const made = base.replace(dc.a, dc.b), m = made.match(/transformed\.y \+= (.+);/)
        if (!m || !/_drawnRaw\(aDrawnRaw, _terrainRaw\(_tuv\)\)/.test(m[1])) bad('①', `the drawn displacement does not read the field through _drawnRaw: \`${m?.[1]}\``)
        else {
          // eslint-disable-next-line no-new-func
          const y = new Function('_drawnRaw', '_terrainRaw', 'aDrawnRaw', '_tuv', 'uExag', `return ${m[1]}`)
          const pins = D.drawnPinsOf(manifest, manifest.groups[0], bin), E = 1.5
          for (const v of [1, 3]) { const x = [0, 10, 10, 0][v], z = [0, 0, 10, 10][v]
            const gpu = y(T._drawnRaw, () => field(x, z), { x: pins[v * 4], y: pins[v * 4 + 1], z: pins[v * 4 + 2], w: pins[v * 4 + 3] }, null, E)
            const cpu = G.heightAt(x, z, E) - G.partsAt(x, z).y
            if (Math.abs(gpu - cpu) > 1e-5) bad('①', `vertex ${v}: the shader lifts it ${gpu.toFixed(5)} m, drawnGround's heightAt reads ${cpu.toFixed(5)} m`) }
        }
      }
    }
    if (nc) { const base = grab('TERRAIN_NORMAL')
      if (!base.includes(nc.a)) bad('①', `the drawn normal's target \`${nc.a}\` is not in TERRAIN_NORMAL`)
      else if (!/_h = _drawnSlope\(aDrawnRaw, _h, uExag\);\s*vec3 _tn =/.test(base.replace(nc.a, nc.b))) bad('①', 'the drawn normal does not read its slope through _drawnSlope before composing')
    }
    log(`   ① the drawn displacement and normal are made from TERRAIN_DISPLACE_PERVERTEX / TERRAIN_NORMAL; the lifted vertex = heightAt`)
  }

  // ③ the ground draws with them
  { const B = src[BG], Gv = src[GRAVEL]
    if (!/drawnPinsOf\(manifest, g, bin\)[\s\S]{0,200}setAttribute\('aDrawnRaw'/.test(B)) bad('③', 'BakedGround does not set aDrawnRaw from drawnPinsOf')
    const calls = [...B.matchAll(/patchTerrain\(([^)]*)\)/g)].map(m => m[1]).filter(a => /perVertex: true/.test(a))
    const missing = calls.filter(a => !/drawn: !!geometry\.attributes\.aDrawnRaw/.test(a))
    if (!calls.length || missing.length) bad('③', `${missing.length} of ${calls.length} ground patchTerrain call(s) in BakedGround do not pass drawn: ${missing.join(' | ')}`)
    if (!/makeGravelPathMaterial\(\{[^}]*drawn: !!geometry\.attributes\.aDrawnRaw/.test(B) || !/patchTerrain\(mat, \{[^}]*\bdrawn\b/.test(Gv)) bad('③', 'the gravel ground is not drawn with its pins (BakedGround → makeGravelPathMaterial → patchTerrain)')
    // decoding = a typed array opened at the section (writing it, as the bake and a fixture do, is not)
    const decoders = src.files.filter(f => f !== DG && /new (?:Uint32|Float32|Int32)Array\([^)]*drawnRawByteOffset/.test(src.text(f)))
    if (decoders.length) bad('③', `drawnRawByteOffset is decoded outside drawnGround.js: ${decoders.join(', ')}`)
    log(`   ③ BakedGround: aDrawnRaw from drawnPinsOf · ${calls.length} ground patchTerrain call(s) pass drawn · gravel too · one decoder`)
  }

  // ④ every reader of the layout named, its role read from its source
  { const readers = src.files.filter(f => /vertexByteOffset/.test(src.text(f)))
    const unnamed = readers.filter(f => !(f in src.readers)), gone = Object.keys(src.readers).filter(f => !readers.includes(f))
    if (unnamed.length) bad('④', `reads ground.bin's layout and is not named here (say how it reads a pin): ${unnamed.join(', ')}`)
    if (gone.length) bad('④', `named here and no longer reads the layout (evict the row): ${gone.join(', ')}`)
    const wrong = []
    for (const f of readers.filter(f => f in src.readers)) { const t = src.text(f), role = src.readers[f]
      if (role === 'drawn' && !DRAWN.test(t)) wrong.push(`${f} is 'drawn' and does not read the drawn ground`)
      if (role === 'xz' && FIELD.test(t)) wrong.push(`${f} is 'xz' and reads a height field (${t.match(FIELD)[0]})`)
      if (role === 'water' && !/groups\.(find|filter)\([^)]*water/.test(t)) wrong.push(`${f} is 'water' and reads no water group`) }
    for (const w of wrong) bad('④', w)
    const by = {}; for (const f of readers) by[src.readers[f] ?? '?'] = (by[src.readers[f] ?? '?'] || 0) + 1
    log(`   ④ ${readers.length} readers of ground.bin's layout: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  }
  return red
}

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src', 'cartograph', 'checks'], { encoding: 'utf8' }).split('\n')
  .filter(f => /\.(m?js|jsx)$/.test(f) && !f.includes('/_archive/') && !f.includes('/data/') && fs.existsSync(f))
const base = () => ({ [DG]: read(DG), [SHADER]: read(SHADER), [BG]: read(BG), [GRAVEL]: read(GRAVEL), files, readers: { ...READERS }, text: (f) => read(f) })
const quiet = []   // the mutants' own lines, kept out of the report
const red = await run(base(), (s) => console.log(s))
console.log(red ? `⛔ RED — ${red} finding(s)` : '✅ GREEN — one rule for a pinned vertex, CPU and GPU, and every reader of the layout named')

if (process.argv.includes('--mutants')) {
  const swap = (s, a, b) => { if (!s.includes(a)) throw new Error(`⛔ mutant target gone: ${a}`); return s.replace(a, b) }
  const M = [
    ['the GLSL twin reads the field always', (S) => { S[DG] = swap(S[DG], 'return pin.x > 0.5 ? pin.y : field;', 'return field;') }],
    ['the JS twin ignores the sentinel', (S) => { S[DG] = swap(S[DG], "pins !== null && pins[v * 4] > 0.5 ? pins[v * 4 + 1] : field", "pins !== null && !Number.isNaN(pins[v * 4 + 1]) ? pins[v * 4 + 1] : field") }],
    ['partsAt back to the field at the corners', (S) => { S[DG] = swap(S[DG], 'drawnRaw(pins, a, rawAt(ax, az)) * wa + drawnRaw(pins, b, rawAt(bx, bz)) * wb + drawnRaw(pins, c, rawAt(cxx, czz)) * wc', 'rawAt(ax, az) * wa + rawAt(bx, bz) * wb + rawAt(cxx, czz) * wc') }],
    ['the drawn displacement made from nothing', (S) => { S[SHADER] = swap(S[SHADER], "'transformed.y += _terrainRaw(_tuv) * uExag;', 'transformed.y += _drawnRaw", "'transformed.y += _terrainRaw(_uv) * uExag;', 'transformed.y += _drawnRaw") }],
    ["BakedGround's FadeMesh drops drawn", (S) => { S[BG] = swap(S[BG], 'patchTerrain(mat, { perVertex: true, terrainNormals: true, drawn: !!geometry.attributes.aDrawnRaw })', 'patchTerrain(mat, { perVertex: true, terrainNormals: true })') }],
    ['an unnamed reader of the layout', (S) => { delete S.readers['src/harness/lab/stage.js'] }],
  ]
  let alive = 0
  for (const [name, mutate] of M) {
    const S = base(); mutate(S)
    const t = { ...S, text: (f) => (f in S && typeof S[f] === 'string') ? S[f] : read(f) }
    const r = await run(t, (s) => quiet.push(s)).catch(e => { quiet.push(e.message); return 1 })
    console.log(`  mutant: ${name} → ${r ? 'RED ✓' : 'GREEN ✗ (the check cannot see it)'}`)
    if (!r) alive++
  }
  if (alive) { console.log(`⛔ ${alive} mutant(s) survived`); process.exit(1) }
  console.log('✅ every mutant RED')
}
process.exit(red ? 1 : 0)
