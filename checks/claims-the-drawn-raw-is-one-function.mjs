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
//      of the triangles CONTAINING a point, (a) the top renderOrder's is read, (a′) exact containment before the tolerance, (a″)
//      in a crack the nearer, and
//      (b) none containing is null, at a per-edge tolerance derived from the positions' float32 (1e-5 m out is null; float32
//      rounding off an edge is in; 0.1 mm past a sliver's short side is out);
//   ③ THE GROUND DRAWS WITH THEM: BakedGround sets `aDrawnRaw` from drawnPinsOf, every ground patchTerrain call (BakedGround,
//      gravelPathMaterial) passes `drawn`, and no module but drawnGround.js decodes `drawnRawByteOffset`;
//   ④ EVERY READER OF ground.bin's LAYOUT IS NAMED: each file in src/, cartograph/ and checks/ that reads `vertexByteOffset`
//      is in the table below with its role, and the role is READ from its source: `drawn` imports the drawn ground,
//      `xz` reads no height field at all. An unnamed reader is RED: a new reader must say how it reads a pin;
//   ⑤ EVERY RUNTIME READER OF THE GROUND'S HEIGHT IS NAMED (Ward-seat review, 2026-10-27): each file in src/ and cartograph/
//      that reads the drawn ground (setDrawnGround's consumers, groundSampler) or lifts by the field (patchTerrain, the
//      TERRAIN_* snippets, `_terrainRaw`), with its role read from its source: `drawn` reads the drawn ground (or lifts with
//      `drawn`), `anchored` lifts by a per-instance anchor (`aGround`) the drawn ground supplied, `debug` reads the field
//      only inside its named overlay (tested), `inland (<town>)` is TESTED on that town's slab (no bed, no pins, so drawn raw
//      = field), and the field roles name where the field is still read and why (the water tint: Ward review (c));
//      and the revetment's drape, built at the drawn ground, is lifted by it (`drawn`), never the field.
//
// ▶ MUTANTS, built in (`--mutants`): each edits the source text this check reads and must turn a section RED —
//     · the GLSL twin reads the field always                          → ⓪ RED
//     · the JS twin ignores the sentinel (reads the stored raw)       → ⓪ RED
//     · partsAt back to the field at the corners                      → ② RED
//     · partsAt letting the later of one renderOrder win over the nearer (a″, and the 3e-7 row) → ② RED
//     · partsAt choosing the most inside whatever its renderOrder (a) · no exact stage (a′) · its tolerance typed at 1e-4, or 0, or one for all edges (b) → ② RED
//     · the drawn displacement made from nothing (target text gone)   → ① RED
//     · BakedGround's FadeMesh drops `drawn`                          → ③ RED
//     · an unnamed reader of the layout                               → ④ RED
//     · an unnamed runtime reader of the ground's height              → ⑤ RED
//     · the revetment's drape lifted by the field again               → ⑤ RED
//     · an inland role on a coastal town · WindSheet's field read outside its overlay → ⑤ RED
//
//   node checks/claims-the-drawn-raw-is-one-function.mjs [--mutants]
// Read-only (drawnGround.js's mutants are loaded from copies in the OS temp dir). Exits 1 when a reader can read a pin differently.
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

const DG = 'src/lib/drawnGround.js', SHADER = 'src/utils/terrainShader.js'
const BG = 'src/components/BakedGround.jsx', GRAVEL = 'src/components/gravelPathMaterial.js', REV = 'src/components/SlabRevetment.jsx'
const read = (f) => readFileSync(join(ROOT, f), 'utf8')
// the drawn ground under test, through ONE loader: the real module, or a mutant's copy in the OS temp dir (`--mutants`)
const DG_HOME = join(ROOT, 'src/lib/drawnGround.js')
const load = async (moduleUrl) => import(moduleUrl)
const DG_EDIT = { a: null, b: null }   // the mutation's edit, set before its copy is made
const dgMutant = () => { const dgSrc = readFileSync(DG_HOME, 'utf8'), { a, b } = DG_EDIT
  if (!dgSrc.includes(a)) throw new Error(`⛔ mutant target gone: ${a}`)
  const dgCopy = join(mkdtempSync(join(tmpdir(), 'drawn-raw-')), 'drawnGround.mjs')
  writeFileSync(dgCopy, dgSrc.replace(a, b))
  return pathToFileURL(dgCopy).href }

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
  'checks/claims-the-shore-is-closed.mjs': 'drawn',
  'checks/claims-the-shore-says-what-it-is-made-of.mjs': 'water', 'checks/claims-a-level-body-has-one-surface.mjs': 'water',
  'checks/claims-the-water-is-one-polygon.mjs': 'xz', 'checks/claims-the-horizon-takes-the-towns-cover.mjs': 'xz',
  'checks/claims-the-ground-tiles-without-a-gap.mjs': 'xz', 'checks/claims-the-ground-is-painted-once.mjs': 'xz',
  'checks/claims-the-coast-runs-on-past-the-rim.mjs': 'xz', 'checks/claims-no-tree-stands-on-drawn-hardscape.mjs': 'xz',
  'checks/claims-crop-rows-derived-per-field.mjs': 'xz', 'checks/claims-coplanar-groups-do-not-overlap.mjs': 'xz',
  'checks/claims-a-closed-stripe-keeps-its-hole.mjs': 'xz',
}
// ⑤'s table: every runtime reader of the ground's height (src/ and cartograph/), by role
const RUNTIME = {
  'src/lib/drawnGround.js': 'home', 'src/utils/elevation.js': 'home', 'src/utils/terrainShader.js': 'home',
  'src/components/BakedGround.jsx': 'drawn', 'src/components/gravelPathMaterial.js': 'drawn', 'src/components/SlabRevetment.jsx': 'drawn',
  'src/camera/ShotFlight.jsx': 'drawn', 'src/components/Scene.jsx': 'drawn', 'src/stage/StageApp.jsx': 'drawn', 'src/cartograph/CartographApp.jsx': 'drawn',
  'src/components/Movers.jsx': 'drawn', 'src/components/UserDot.jsx': 'drawn', 'src/components/PilgrimMonument.jsx': 'drawn', 'src/setpieces/pilgrimMonument.js': 'drawn',
  'cartograph/groundSampler.js': 'drawn', 'cartograph/bake-lamps.js': 'drawn', 'cartograph/bake-tree-anchors.js': 'drawn', 'cartograph/bake-revetment-far.js': 'drawn', 'cartograph/bake-buildings.js': 'drawn',
  'src/components/InstancedTrees.jsx': 'anchored', 'src/components/StreetLights.jsx': 'anchored', 'src/components/InstancedBoulders.jsx': 'anchored', 'src/components/treeAtlasMaterial.js': 'anchored',
  'src/components/WindSheet.jsx': 'debug: the field, in the "Show on map" overlay only, not the slab',
  'src/components/waterMaterial.js': 'field: the water tint at the shore, Ward review (c), open (BACKLOG)',
  'src/components/LafayetteParkBody.jsx': 'inland: no pins, drawn raw = field (lafayette-square)',
  'src/lib/useSurfaceMaterial.js': 'field: the authoring view, not the slab', 'src/cartograph/MapLayers.jsx': 'field: the authoring view, not the slab',
}
const RUNTIME_READ = /drawnGroundParts|drawnGroundY|streetEyeY|onDrawnGround|setDrawnGround|makeDrawnGround|groundSampler|patchTerrain\(|patchTerrainAtCentroidRaw|patchTerrainInstancedBaked|TERRAIN_DISPLACE|_terrainRaw\(/
const DRAWN_RUNTIME = /makeDrawnGround|drawnPinsOf|drawnRawOf|drawnGroundParts|drawnGroundY|streetEyeY|groundSampler|drawn: (?:true|!!)|patchTerrain\([^)]*\bdrawn \}/   // the last: a factory passing its caller's `drawn` on (③ reads the caller)
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
  return { manifest: { bbox: { min: [0, 0, 0], max: [10, 0, 10] }, groups: [g, { id: 'bed', kind: 'mat', vertexCount: 0, vertexByteOffset: 0, indexCount: 0, indexByteOffset: 0 }], ...(record ? { drawnRaw: { format: 'synthetic' } } : {}), groundShape: { terrain: true } }, bin }
}
const field = (x, z) => 1 + 0.1 * x + 0.05 * z
// a ground of plain triangles: [{ id, renderOrder, y, tri: [[x, z] ×3] }] → { manifest, bin } (no pins)
function triangles(list) {
  const bufs = [], groups = []; let off = 0
  for (const { id, renderOrder, y, tri } of list) {
    const P = new Float32Array(tri.flatMap(([x, z]) => [x, y, z])), I = new Uint32Array([0, 1, 2])
    groups.push({ id, kind: 'mat', renderOrder, vertexCount: 3, vertexByteOffset: off, indexCount: 3, indexByteOffset: off + P.byteLength })
    bufs.push(P.buffer, I.buffer); off += P.byteLength + I.byteLength }
  const bin = new ArrayBuffer(off), u8 = new Uint8Array(bin); let o = 0; for (const b of bufs) { u8.set(new Uint8Array(b), o); o += b.byteLength }
  const xs = list.flatMap(g => g.tri.map(p => p[0])), zs = list.flatMap(g => g.tri.map(p => p[1]))
  return { manifest: { bbox: { min: [Math.min(...xs), 0, Math.min(...zs)], max: [Math.max(...xs), 0, Math.max(...zs)] }, groups }, bin }
}

async function run(D, src, log) {
  let red = 0
  const bad = (sec, msg) => { red++; log(`   ⛔ ${sec} ${msg}`) }

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
    // a point 3e-7 m inside triangle 0-1-2 is within the float32 tolerance of its LATER neighbour 0-2-3 too (≈ 1.9e-7 m there):
    // the containing triangle wins, never the neighbour extrapolated (Huron's 5.7 µm, 2026-10-27)
    { const qx = 5, qz = 5 - 3e-7, A = [0, 0], Bv = [10, 0], Cv = [10, 10], den = (Bv[1] - Cv[1]) * (A[0] - Cv[0]) + (Cv[0] - Bv[0]) * (A[1] - Cv[1])
      const wa = ((Bv[1] - Cv[1]) * (qx - Cv[0]) + (Cv[0] - Bv[0]) * (qz - Cv[1])) / den, wb = ((Cv[1] - A[1]) * (qx - Cv[0]) + (A[0] - Cv[0]) * (qz - Cv[1])) / den, wc = 1 - wa - wb
      const want = wa * field(0, 0) + wb * 7.25 + wc * field(10, 10), got = G.partsAt(qx, qz)?.raw
      if (!(Math.abs(got - want) < 1e-12)) bad('②', `a point inside one triangle and within the tolerance of its neighbour reads ${got}; its own triangle gives ${want} (the neighbour extrapolated)`) }
    // (a) THE TOP renderOrder AMONG THE CONTAINING: a small top triangle over a large lower one. At (1.2, 1.2) the lower holds the
    // point more deeply (smallest weight 0.06 against 0.05), and still the top is drawn there.
    { const T2 = triangles([{ id: 'low', renderOrder: 0, y: 0, tri: [[0, 0], [20, 0], [0, 20]] }, { id: 'top', renderOrder: 5, y: 1, tri: [[1, 1], [5, 1], [1, 5]] }])
      const G2 = D.makeDrawnGround(T2.manifest, T2.bin, { rawAt: field }), p = G2.partsAt(1.2, 1.2), q = G2.partsAt(10, 2)
      if (p?.group !== 'top' || p?.y !== 1) bad('②', `(a) where two groups contain (1.2, 1.2) it reads ${p?.group} (y ${p?.y}); the top renderOrder is drawn there`)
      if (q?.group !== 'low') bad('②', `(a) where only the lower contains (10, 2) it reads ${q?.group}`) }
    // (a′) EXACT FIRST: a top triangle whose edge (x = 10) lies 5e-7 m from (10 − 5e-7, 1), inside the float32 tolerance there
    // (≈ 9.5e-7 m), does NOT beat the lower triangle that holds the point exactly: the raster draws the lower one there.
    { const T4 = triangles([{ id: 'low', renderOrder: 0, y: 0, tri: [[0, 0], [20, 0], [0, 20]] }, { id: 'top', renderOrder: 5, y: 1, tri: [[10, 0], [15, 0], [10, 5]] }])
      const G4 = D.makeDrawnGround(T4.manifest, T4.bin, { rawAt: field }), p = G4.partsAt(10 - 5e-7, 1)
      if (p?.group !== 'low') bad('②', `(a′) a point held exactly by the lower triangle, 5e-7 m off the top one's edge, reads ${p?.group}: within the tolerance alone, the top beat the triangle that holds it`) }
    // (a″) IN A CRACK, THE NEARER: two triangles of one renderOrder, 2 ulp apart (x = 1 and x = 1 + 2⁻²²), a point 0.5 ulp past
    // the first and 1.5 past the second: neither holds it exactly, both admit it, and the nearer (the most inside) is read.
    { const u = 2 ** -23, T5 = triangles([{ id: 'near', renderOrder: 0, y: 0, tri: [[0, 0], [1, 0], [1, 1]] }, { id: 'far', renderOrder: 0, y: 1, tri: [[1 + 2 * u, 0], [2, 0], [1 + 2 * u, 1]] }])
      const G5 = D.makeDrawnGround(T5.manifest, T5.bin, { rawAt: field }), p = G5.partsAt(1 + 0.5 * u, 0.5)
      if (p?.group !== 'near') bad('②', `(a″) in a crack the point 0.5 ulp past one triangle and 1.5 past the other reads ${p?.group}, not the nearer`) }
    // (b) NONE CONTAINING IS null, at a tolerance DERIVED from float32: 1e-5 m past the only triangle's edge is outside it (a
    // typed 1e-4 slack admitted it, extrapolated), while a point past the hypotenuse by float32 rounding alone (4.4e-7 m) is in.
    { const T3 = triangles([{ id: 'one', renderOrder: 0, y: 0, tri: [[0, 0], [10, 0], [0, 10]] }]), G3 = D.makeDrawnGround(T3.manifest, T3.bin, { rawAt: field })
      const out = G3.partsAt(5, -1e-5), rounded = G3.partsAt(Math.fround(0.0074), Math.fround(10 - 0.0074))
      if (out !== null) bad('②', `(b) a point 1e-5 m outside every triangle reads ${out?.raw} (extrapolated), not null`)
      if (rounded === null) bad('②', '(b) a point off the edge by float32 rounding alone reads null: the tolerance is below the positions\' own precision')
      // PER EDGE: a sliver 10 m × 1 mm; 0.1 mm past its SHORT side is outside (one tolerance from the least altitude admitted
      // 9.5 mm there: Huron's bed over shore, 2026-10-27)
      const T6 = triangles([{ id: 'sliver', renderOrder: 0, y: 0, tri: [[0, 0], [10, 0], [10, 1e-3]] }]), G6 = D.makeDrawnGround(T6.manifest, T6.bin, { rawAt: field })
      const past = G6.partsAt(10 + 1e-4, 5e-4)
      if (past !== null) bad('②', `(b) a point 0.1 mm past a sliver's short side reads ${past?.raw}: the tolerance is not per edge`) }
    log(`   ② partsAt: pin ${at1?.raw?.toFixed(3)} · inside ${mid?.raw?.toFixed(4)} (want ${wantMid.toFixed(4)}) · unpinned ${at3?.raw?.toFixed(3)} · an older ground reads the field · the containing triangle wins over an extrapolated neighbour · (a) the top renderOrder among the containing · (a′) exact before the tolerance · (a″) in a crack, the nearer · (b) none containing is null, at a float32 tolerance`)

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
  // ⑤ every runtime reader of the ground's height named, its role read from its source; the drape lifted by the drawn ground
  { const rt = src.files.filter(f => !f.startsWith('checks/') && RUNTIME_READ.test(src.text(f)))
    const unnamed = rt.filter(f => !(f in src.runtime)), gone = Object.keys(src.runtime).filter(f => !rt.includes(f))
    if (unnamed.length) bad('⑤', `reads the ground's height and is not named here (say how it reads a pin): ${unnamed.join(', ')}`)
    if (gone.length) bad('⑤', `named here and no longer reads the ground's height (evict the row): ${gone.join(', ')}`)
    for (const f of rt.filter(f => f in src.runtime)) { const t = src.text(f), role = src.runtime[f]
      if (role === 'drawn' && !DRAWN_RUNTIME.test(t)) bad('⑤', `${f} is 'drawn' and reads no drawn ground`)
      if (role === 'anchored' && !/aGround|patchTerrainInstancedBaked/.test(t)) bad('⑤', `${f} is 'anchored' and carries no aGround`)
      // 'debug': every field read sits inside the named overlay, so nothing of it is the slab
      if (role.startsWith('debug')) { const at = t.indexOf('function WindSheetDebug('), reads = [...t.matchAll(/_terrainRaw\(/g)].map(m => m.index)
        if (at < 0 || !reads.length || reads.some(i => i < at)) bad('⑤', `${f} is 'debug' and reads the field outside its WindSheetDebug overlay`) }
      // 'inland (<town>)': a FACT tested on that town's slab: no bed (no ①'s water) and no pins, so its drawn raw IS the field
      if (role.startsWith('inland')) { const town = role.match(/\(([^)]+)\)$/)?.[1], gp = town && join(ROOT, 'public/baked', town, 'ground.json')
        if (!gp || !existsSync(gp)) bad('⑤', `${f} is 'inland' for ${town}, whose slab is not on disk to test it`)
        else { const g = JSON.parse(readFileSync(gp, 'utf8')), bed = g.groups.some(q => q.kind === 'mat' && q.id === 'bed'), pinned = g.groups.some(q => q.drawnRawByteOffset != null)
          if (bed || pinned) bad('⑤', `${f} is 'inland' for ${town}, and its slab has ${bed ? 'a bed (①\'s water)' : ''}${bed && pinned ? ' and ' : ''}${pinned ? 'pinned groups' : ''}: its drawn raw is not the field`) } } }
    const R = src[REV]
    // the drape's pins are revetmentDrape.js#drapeRaws over the drawn raw (the bake's own: the far's row lerped where a near chunk meets it)
    if (!/drapeRaws\(built, \(x, z\) => drawnGroundParts\(x, z\)\.raw\)/.test(R) || !/setAttribute\('aDrawnRaw'/.test(R)) bad('⑤', 'the revetment drape is not made ground-relative to the drawn ground, carried as its pin (aDrawnRaw)')
    const drapes = [...R.matchAll(/patchTerrain\((?:drape\.material|d), \{([^}]*)\}\)/g)].map(m => m[1])
    if (drapes.length !== 2 || drapes.some(a => !/drawn: true/.test(a))) bad('⑤', `the drape's ${drapes.length} lift(s) do not all pass drawn: true (${drapes.join(' | ')})`)
    const by = {}; for (const f of rt) by[(src.runtime[f] ?? '?').split(':')[0]] = (by[(src.runtime[f] ?? '?').split(':')[0]] || 0) + 1
    log(`   ⑤ ${rt.length} runtime readers of the ground's height: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ')} · the drape lifted by the drawn ground (${drapes.length} materials)`)
  }
  return red
}

// every source under src/, cartograph/ and checks/ (the data and the Diary apart), walked from disk
const walk = (d) => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory()
  ? (e.name === 'node_modules' || e.name === '_archive' || e.name === 'data' ? [] : walk(`${d}/${e.name}`))
  : /\.(m?js|jsx)$/.test(e.name) && !e.name.startsWith('__') ? [`${d}/${e.name}`] : [])
const files = ['src', 'cartograph', 'checks'].flatMap(walk).filter(f => existsSync(join(ROOT, f)))
const base = () => ({ [SHADER]: read(SHADER), [BG]: read(BG), [GRAVEL]: read(GRAVEL), [REV]: read(REV), files, readers: { ...READERS }, runtime: { ...RUNTIME }, text: (f) => read(f) })
const quiet = []   // the mutants' own lines, kept out of the report
const real = await load(pathToFileURL(DG_HOME).href)
const red = await run(real, base(), (s) => console.log(s))
console.log(red ? `⛔ RED — ${red} finding(s)` : '✅ GREEN — one rule for a pinned vertex, CPU and GPU, and every reader of the layout named')

if (process.argv.includes('--mutants')) {
  const swap = (s, a, b) => { if (!s.includes(a)) throw new Error(`⛔ mutant target gone: ${a}`); return s.replace(a, b) }
  // [name, an edit of drawnGround.js (copied and loaded), or an edit of the other sources this check reads as text]
  const M = [
    ['the GLSL twin reads the field always', ['return pin.x > 0.5 ? pin.y : field;', 'return field;']],
    ['the JS twin ignores the sentinel', ["pins !== null && pins[v * 4] > 0.5 ? pins[v * 4 + 1] : field", "pins !== null && !Number.isNaN(pins[v * 4 + 1]) ? pins[v * 4 + 1] : field"]],
    ['partsAt lets the later of two triangles of one renderOrder win though the other is nearer', ['if (ro > bestRO[q] || (ro === bestRO[q] && s.inside >= best[q].inside))', 'if (ro >= bestRO[q])']],
    ['partsAt choosing the most inside whatever its renderOrder', ['if (ro > bestRO[q] || (ro === bestRO[q] && s.inside >= best[q].inside))', 'if (best[q] === null || s.inside >= best[q].inside)']],
    ['partsAt with no exact stage (the tolerance alone decides)', ['const q = s.inside >= 0 ? 0 : 1', 'const q = 0']],
    ['partsAt with one tolerance from the least altitude', ['if (wa < -u * Math.hypot(cxx - bx, czz - bz) || wb < -u * Math.sqrt(d00) || wc < -u * Math.sqrt(d11)) return null', 'const m3 = Math.max(Math.hypot(cxx - bx, czz - bz), Math.sqrt(d00), Math.sqrt(d11)); if (wa < -u * m3 || wb < -u * m3 || wc < -u * m3) return null']],
    ['partsAt with a typed 1e-4 tolerance again', ['if (wa < -u * Math.hypot(cxx - bx, czz - bz) || wb < -u * Math.sqrt(d00) || wc < -u * Math.sqrt(d11)) return null', 'if (wa < -1e-4 || wb < -1e-4 || wc < -1e-4) return null']],
    ['partsAt with no tolerance (below the positions\' precision)', ['if (wa < -u * Math.hypot(cxx - bx, czz - bz) || wb < -u * Math.sqrt(d00) || wc < -u * Math.sqrt(d11)) return null', 'if (wa < 0 || wb < 0 || wc < 0) return null']],
    ['partsAt back to the field at the corners', ['drawnRaw(pins, a, rawAt(ax, az)) * wa + drawnRaw(pins, b, rawAt(bx, bz)) * wb + drawnRaw(pins, c, rawAt(cxx, czz)) * wc', 'rawAt(ax, az) * wa + rawAt(bx, bz) * wb + rawAt(cxx, czz) * wc']],
    ['the drawn displacement made from nothing', null, (S) => { S[SHADER] = swap(S[SHADER], "'transformed.y += _terrainRaw(_tuv) * uExag;', 'transformed.y += _drawnRaw", "'transformed.y += _terrainRaw(_uv) * uExag;', 'transformed.y += _drawnRaw") }],
    ["BakedGround's FadeMesh drops drawn", null, (S) => { S[BG] = swap(S[BG], 'patchTerrain(mat, { perVertex: true, terrainNormals: true, drawn: !!geometry.attributes.aDrawnRaw })', 'patchTerrain(mat, { perVertex: true, terrainNormals: true })') }],
    ['an unnamed reader of the layout', null, (S) => { delete S.readers['src/harness/lab/stage.js'] }],
    ["an unnamed runtime reader of the ground's height", null, (S) => { delete S.runtime['src/components/Movers.jsx'] }],
    ['an inland set piece on a coastal town', null, (S) => { S.runtime['src/components/LafayetteParkBody.jsx'] = 'inland: no pins, drawn raw = field (huron)' }],
    ['WindSheet reading the field outside its overlay', null, (S) => { S['src/components/WindSheet.jsx'] = read('src/components/WindSheet.jsx').replace('function WindSheetDebug(', '// _terrainRaw( early\nfunction WindSheetDebug(') }],
    ["the revetment's drape lifted by the field again", null, (S) => { S[REV] = swap(S[REV], 'patchTerrain(drape.material, { perVertex: true, drawn: true })', 'patchTerrain(drape.material, { perVertex: true })') }],
  ]
  let alive = 0
  for (const [name, edit, mutate] of M) {
    const S = base(); if (mutate) mutate(S)
    const t = { ...S, text: (f) => (f in S && typeof S[f] === 'string') ? S[f] : read(f) }
    let D = real; if (edit) { Object.assign(DG_EDIT, { a: edit[0], b: edit[1] }); D = await load(dgMutant()) }
    const r = await run(D, t, (s) => quiet.push(s)).catch(e => { quiet.push(e.message); return 1 })
    console.log(`  mutant: ${name} → ${r ? 'RED ✓' : 'GREEN ✗ (the check cannot see it)'}`)
    if (!r) alive++
  }
  if (alive) { console.log(`⛔ ${alive} mutant(s) survived`); process.exit(1) }
  console.log('✅ every mutant RED')
}
process.exit(red ? 1 : 0)
