// READ-ONLY PROBE — THE WATER TINT READS THE FIELD, NOT THE PINNED GROUND (BACKLOG, Ward-seat review (c), 2026-10-27).
// Two shader readers take depth as `level − _terrainRaw` (the FIELD): waterMaterial.js#makeWaterMaterial's tint (wDepth → wSeen,
// wTint) and #makeWaterAbsorption's colour shift. The ground is DRAWN at its pins. Within one terrain cell of ①'s line, inside
// ①'s water, at every drawn ground vertex: |drawnRaw − field|, and what the VIEWER SEES with the field's depth vs the drawn
// ground's depth, at the sheet's LOW, mid and HIGH (uPhase 0, ½, 1). THE GATE (Boz's ruling, 2026-10-27): the composite
// diffuseColor.a (mix(wDeepA, a·wTint, wSeen), at both ends of the ripple alpha, Fresnel floor at a straight-down view) and
// makeWaterAbsorption's T/T.g (worst channel), each under one 8-bit step (1/255). wSeen is printed, not judged: it is 1 at any
// depth under V − F, so near the line it cannot see a disagreement. Over one step on the POST-bake slab = a second shoreline.
// The shader's constants are READ from waterMaterial.js's source, never typed here; V, F and the deep see-through are the
// town's OWN look (public/baked/<town>/scene.json surfaces.params.water, as BakedGround passes it to WaterSurface, clamped as
// WaterSurface clamps it; the kit's WATER_LOOK_DEFAULTS where the look authors none, which is WaterSurface's own rule).
// The readers are readers.mjs; a planted pair is judged first (a disagreement must be OVER, an agreement UNDER).
//   node scratch/water-tint/probe.mjs <town> [--root=<worktree>] [--mutants]
// --mutants: readers.mjs copied to the OS temp dir with the drawn depth replaced by the field's in ONE reader; the planted
// disagreement must then fail to read OVER (the probe RED), or the mutant survived.
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const town = process.argv[2], ROOT = arg('root') ?? new URL('../../', import.meta.url).pathname
if (!town) throw new Error('usage: probe.mjs <town> [--root=<worktree>]')
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href)
const { waterFace } = await imp('cartograph/coastFile.mjs')
const { waterLevels } = await imp('cartograph/waterLevel.mjs')
const { drawnRawOf, predatesThePin } = await imp('src/lib/drawnGround.js')
const { makeElevationSampler } = await imp('src/lib/terrainCommon.js')

// ── the shader's own expressions, read from its source (a mismatch here refuses: the probe would be measuring something else)
const WM = readFileSync(join(ROOT, 'src/components/waterMaterial.js'), 'utf8')
const need = (re, what) => { const m = WM.match(re); if (!m) throw new Error(`⛔ waterMaterial.js no longer carries ${what} — the probe's reading of the shader is stale. Refusing.`); return m }
need(/float wDepth = mix\(max\(0\.0, vLevel - _terrainRaw\(wUV\)\), uVisibleM, wPast\);/, 'wDepth = level − _terrainRaw')
need(/float wSeen = 1\.0 - smoothstep\(uVisibleM - uFadeM, uVisibleM, wDepth\);/, 'wSeen\'s smoothstep')
const kT = +need(/float wTint = 1\.0 - exp\(-([\d.]+) \* \(([\d.]+) \/ uVisibleM\) \* wDepth\);/, 'wTint\'s Beer–Lambert').slice(1).reduce((a, b) => a * b, 1)
need(/float depth = max\(0\.0, vAbsLevel - _terrainRaw\(uv\)\);/, 'the absorption pass\'s depth')
const AW = need(/const PURE_WATER_ABSORPTION = '([^']+)'/, 'PURE_WATER_ABSORPTION')[1].split(',').map(Number)
const kSecchi = +need(/vec3 k = max\(0\.0, ([\d.]+) \/ uVisibleM - aw\.g\) \+ aw;/, 'the absorption k')[1]
need(/vec3 T = exp\(-2\.0 \* k \* depth\);/, 'T = exp(−2 k depth)')
need(/T = min\(vec3\(1\.0\), T \/ T\.g\);/, 'T / T.g')
const DEF = need(/export const WATER_LOOK_DEFAULTS = \{ clarity: ([\d.]+), deepSeeThrough: ([\d.]+) \}/, 'WATER_LOOK_DEFAULTS').slice(1).map(Number)
const ripple = need(/diffuseColor\.a = mix\(([\d.]+), ([\d.]+), smoothstep\(0\.3, 0\.6, ripple\)\);/, 'the ripple alpha').slice(1).map(Number)
need(/float wDeepA = mix\(mix\(1\.0, diffuseColor\.a, clamp\(uDeepSee, 0\.0, 1\.0\)\), 1\.0, wPast\);/, 'wDeepA')
need(/diffuseColor\.a = mix\(wDeepA, diffuseColor\.a \* wTint, wSeen\);/, 'the composite mix(wDeepA, a·wTint, wSeen)')
const n0 = +need(/float wF0 = pow\(\(([\d.]+) - 1\.0\) \/ \(\1 \+ 1\.0\), 2\.0\);/, 'the Fresnel F0')[1], F0 = ((n0 - 1) / (n0 + 1)) ** 2
need(/diffuseColor\.a = max\(diffuseColor\.a, wF0 \+ \(1\.0 - wF0\) \* pow\(1\.0 - wCosV, 5\.0\)\);/, 'the Fresnel floor')
const BG = readFileSync(join(ROOT, 'src/components/BakedGround.jsx'), 'utf8'), WS = readFileSync(join(ROOT, 'src/components/WaterSurface.jsx'), 'utf8')
if (!BG.includes('look={scene?.surfaces?.params?.water}')) throw new Error('⛔ BakedGround no longer passes scene.surfaces.params.water as the water look — the probe would read the wrong look. Refusing.')
if (!WS.includes('Math.min(1, Math.max(0, look?.clarity ?? WATER_LOOK_DEFAULTS.clarity))') || !WS.includes('Math.min(1, Math.max(0, look?.deepSeeThrough ?? WATER_LOOK_DEFAULTS.deepSeeThrough))')) throw new Error('⛔ WaterSurface reads the look differently now. Refusing.')

// ── the town
const gp = join(ROOT, 'public/baked', town, 'ground.json'), bp = join(ROOT, 'public/baked', town, 'ground.bin'), mp = join(ROOT, 'cartograph/data', town, 'clean/map.json')
for (const p of [gp, bp, mp]) if (!existsSync(p)) throw new Error(`⛔ ${town}: ${p} is missing. NOT MEASURED.`)
const gj = JSON.parse(readFileSync(gp, 'utf8'))
if (predatesThePin(gj)) throw new Error(`⛔ ${town}: its ground predates the pin (no drawnRaw record), so drawn = field everywhere and nothing is measured. ▶ re-bake the ground. NOT MEASURED.`)
if (!gj.drawnRaw?.pinned) throw new Error(`⛔ ${town}: the ground pins nothing (drawnRaw.pinned ${gj.drawnRaw?.pinned}). NOT MEASURED.`)
const tj = JSON.parse(readFileSync(join(ROOT, 'public/baked', town, 'terrain.json'), 'utf8')), tb = readFileSync(join(ROOT, 'public/baked', town, 'terrain.bin'))   // the viewer's
if (!tj.bed) throw new Error(`⛔ ${town}: terrain.json carries no bed, so the shader does not shade by depth (uVisibleM = 0). NOT MEASURED.`)
const T = makeElevationSampler({ ...tj, data: new Float32Array(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength)) }, 1), L = waterLevels(tj.water)
const cellM = Math.max((tj.bounds.maxX - tj.bounds.minX) / (tj.width - 1), (tj.bounds.maxZ - tj.bounds.minZ) / (tj.height - 1))
const look = JSON.parse(readFileSync(join(ROOT, 'public/baked', town, 'scene.json'), 'utf8')).surfaces?.params?.water ?? null
const clamp01 = (x) => Math.min(1, Math.max(0, x)), clarity = clamp01(look?.clarity ?? DEF[0]), deepSee = clamp01(look?.deepSeeThrough ?? DEF[1])
const V = tj.bed.visibleToM * clarity, F = tj.bed.fadeOverM * clarity
const K = { V, F, kT, kSecchi, AW, ripple, F0, deepSee }
const rings = waterFace(JSON.parse(readFileSync(mp, 'utf8')), 'water-tint probe')
if (!rings.length) throw new Error(`⛔ ${town}: ①'s water face is empty. NOT MEASURED.`)

// the readers (readers.mjs, or a mutant's copy), and the planted pair they must tell apart
const RHOME = new URL('./readers.mjs', import.meta.url)
const load = async (u) => import(u)
const STEP = 1 / 255
const planted = (M) => { const R = M.readers(K), over = M.errors(R, K, 0.374, 0), same = M.errors(R, K, 0.374, 0.374)
  return { over, same, ok: over.alpha > STEP && over.shift > STEP && same.alpha === 0 && same.shift === 0 } }
const M = await load(RHOME.href), P0 = planted(M), R = M.readers(K)
console.log(`planted: field 0.374 m vs drawn 0 → alpha ${(P0.over.alpha * 255).toFixed(2)} · shift ${(P0.over.shift * 255).toFixed(2)} steps (must be OVER) · equal depths → ${(P0.same.alpha * 255).toFixed(2)} / ${(P0.same.shift * 255).toFixed(2)} (must be 0): ${P0.ok ? '✅' : '⛔'}`)
if (!P0.ok) throw new Error('⛔ the probe cannot tell the planted pair apart. Refusing to measure.')
if (process.argv.includes('--mutants')) {
  const src = readFileSync(RHOME, 'utf8')
  for (const [what, a, b] of [['alpha reads the field for the drawn depth', 'R.alpha(dD, a)', 'R.alpha(dF, a)'], ['the absorption reads the field for the drawn depth', 'R.shift(dD)[c]', 'R.shift(dF)[c]']]) {
    if (!src.includes(a)) throw new Error(`⛔ mutant target gone: ${a}`)
    const copy = join(mkdtempSync(join(tmpdir(), 'water-tint-')), 'readers.mjs'); writeFileSync(copy, src.replace(a, b))
    const p = planted(await load(pathToFileURL(copy).href))
    console.log(`  mutant · ${what}: ${p.ok ? '⛔ SURVIVED (the planted disagreement still reads OVER)' : `RED ✅ (alpha ${(p.over.alpha * 255).toFixed(2)} · shift ${(p.over.shift * 255).toFixed(2)} steps on the planted disagreement)`}`)
    if (p.ok) process.exitCode = 1 } }

// ①'s line: every ring edge, hashed by cell; inside ①'s water: even-odd over the rings (outers and holes)
const H = new Map(), key = (i, j) => i * 73856093 ^ j * 19349663
for (const r of rings) for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length]
  for (let i = Math.floor(Math.min(a[0], b[0]) / cellM) - 1; i <= Math.floor(Math.max(a[0], b[0]) / cellM) + 1; i++)
    for (let j = Math.floor(Math.min(a[1], b[1]) / cellM) - 1; j <= Math.floor(Math.max(a[1], b[1]) / cellM) + 1; j++) { const h = key(i, j); (H.get(h) || H.set(h, []).get(h)).push([a, b]) } }
const lineDist = (x, z) => { const segs = H.get(key(Math.floor(x / cellM), Math.floor(z / cellM))); if (!segs) return Infinity; let d = Infinity
  for (const [a, b] of segs) { const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez, t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L2)) : 0; d = Math.min(d, Math.hypot(x - a[0] - t * ex, z - a[1] - t * ez)) } return d }
const boxes = rings.map(r => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) } return [x0, x1, z0, z1] })
const inWater = (x, z) => { let c = false; for (let k = 0; k < rings.length; k++) { const b = boxes[k]; if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue
  const r = rings[k]; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } } return c }

const gb = readFileSync(bp), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const phases = [0, 0.5, 1]
const acc = phases.map(() => ({ seen: { max: 0, at: null, over: 0 }, alpha: { max: 0, at: null, over: 0 }, shift: { max: 0, at: null, over: 0 } }))
let n = 0, pinned = 0, dMax = 0, dAt = null
const groups = gj.groups.filter(g => !/^water(:|$)/.test(g.id) && g.partition !== false)
for (const g of groups) {
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), DR = drawnRawOf(gj, g, AB, T.getElevationRaw)
  for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2]
    if (!(lineDist(x, z) <= cellM) || !inWater(x, z)) continue
    n++; const field = T.getElevationRaw(x, z), drawn = DR[v], d = Math.abs(drawn - field)
    if (d > 0) pinned++
    if (d > dMax) { dMax = d; dAt = [x, z, g.id] }
    phases.forEach((ph, i) => { const level = L.lowAt(x, z) + ph * (L.highAt(x, z) - L.lowAt(x, z))
      const dF = Math.max(0, level - field), dD = Math.max(0, level - drawn)
      const e = M.errors(R, K, dF, dD)
      for (const k of Object.keys(e)) { const a = acc[i][k]; if (e[k] > STEP) a.over++; if (e[k] > a.max) { a.max = e[k]; a.at = [x, z, dF, dD] } } }) } }

const f = (a) => `${(a.max * 255).toFixed(2)} steps${a.at ? ` @(${a.at[0].toFixed(2)}, ${a.at[1].toFixed(2)}) depth field ${a.at[2].toFixed(3)} / drawn ${a.at[3].toFixed(3)} m` : ''} · ${a.over} vertex(es) over one step`
console.log(`${town}: ①'s water, within one terrain cell (${cellM.toFixed(3)} m) of ①'s line: ${n.toLocaleString()} drawn ground vertices, ${pinned.toLocaleString()} where drawn ≠ field`)
console.log(`  max |drawnRaw − field| ${dMax.toFixed(4)} m${dAt ? ` @(${dAt[0].toFixed(2)}, ${dAt[1].toFixed(2)}) [${dAt[2]}]` : ''}`)
console.log(`  the town's look: ${look ? JSON.stringify(look) : 'none authored (scene.json surfaces.params.water) → WATER_LOOK_DEFAULTS'} ⇒ clarity ${clarity} · deep see-through ${deepSee} · uVisibleM ${V.toFixed(4)} m · uFadeM ${F.toFixed(4)} m · ripple alpha ${ripple.join('…')} · Fresnel floor F0 ${F0.toFixed(4)}`)
phases.forEach((ph, i) => { console.log(`  uPhase ${ph} (${['LOW', 'mid', 'HIGH'][i]}):`)
  console.log(`    GATE  diffuseColor.a (composite)        ${f(acc[i].alpha)}`)
  console.log(`    GATE  absorption T/T.g (worst channel)  ${f(acc[i].shift)}`)
  console.log(`    print wSeen (not judged)                ${f(acc[i].seen)}`) })
const worst = Math.max(...acc.flatMap(a => [a.alpha.max, a.shift.max]))
console.log(`  ⇒ THE GATE (what the viewer sees, under one 8-bit step): ${worst <= STEP ? 'UNDER — the shoreline holds' : `OVER (${(worst * 255).toFixed(2)} steps) — a second shoreline (judged only on a POST-bake slab): goes to Boz unpatched`}`)
