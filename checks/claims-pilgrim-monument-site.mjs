#!/usr/bin/env node
/**
 * "DOES THE SET-PIECE STAND WHERE AND AS TALL AS THE DOSSIER SAYS?" For every instance
 * that declares `setPiece.kind === 'pilgrim-monument'` (Provincetown today).
 *
 * Reads the SAME module the renderer draws from (`src/setpieces/pilgrimMonument.js`), so it
 * measures what ships, not a copy. It checks:
 *   A. The D/C table has not moved. The dossier PDF is not in the repo, so its values are
 *      pinned here with page cites, AND its own stated arithmetic is re-derived (8″ per face
 *      per wash, the −5′ datum shift, the 3′3″ balcony projection, the 1′ shoulder).
 *   B. The placeholder profile reads that table: contiguous from the original ground to
 *      Z = 0 and up, the washes at the table's Z, and the top at 252′7.5″.
 *   C. The site is the mapped footprint: the instance ring equals raw/osm.json's way, and
 *      the mapped square agrees with the dossier's 28′ plinth to within its 6″ shoulder
 *      per face (1′ overall). A bigger miss means OSM mapped something else.
 *   D. The seat sits on the lidar: Z = 0 is the lowest terrain under the plinth, and the
 *      terrain's spread there fits the plinth's documented 5′ depth. ⛔ Fails loudly if it
 *      doesn't: the site would need grading the kit cannot fake.
 *   (C also checks the printed label: `setPiece.name` must be the way's OSM `name`.)
 *   E. No slab building stands inside the plinth. That catches the tower extruding as a
 *      plain box beside the set-piece, WHICHEVER source brings it (MSBF, OSM, a pour fix),
 *      with no id list. Fix: add the named ids to `building-overrides.json` `hide`.
 *
 *   F. The masonry (the `pilgrim-granite` surface): its physics params resolve to registry
 *      findings; every course lies inside the cited range; a bed falls at each wash; the table
 *      runs from Z = 0 to the top; a MEASURED segment has exactly its counted courses; and the
 *      running bond sits inside Baker's limits (lap 1–1½ × depth, length ≤ 4–5 × depth).
 *      Every limit is READ from its finding, never restated.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-pilgrim-monument-site.mjs [--self-test]
 *    --self-test mutates the table, the footprint and the slab, and asserts each is caught.
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../cartograph/terrainLoad.js'
import {
  DOSSIER, INFERRED, FT, ft, placeholderStages, siteFromFootprint, plinthSamplePoints,
  seatOnTerrain, lonLatToLocal, courseBeds,
} from '../src/setpieces/pilgrimMonument.js'
import { SURFACES, resolveSurfaceParams } from '../cartograph/surfaces.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const eq = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol

// ── A. the table ────────────────────────────────────────────────────────────
function checkTable(d) {
  const f = []
  const pin = [
    ['originalGroundZ', d.originalGroundZ, ft(-5), 'p.1'],
    ['foundationTopSq', d.foundationTopSq, ft(28), '§3'],
    ['baseSq', d.baseSq, ft(27), '§1'],
    ['wash1.z', d.wash1.z, ft(16, 3), '§1'], ['wash1.sq', d.wash1.sq, ft(25, 8), '§1'],
    ['wash2.z', d.wash2.z, ft(28, 11), '§1'], ['wash2.sq', d.wash2.sq, ft(24, 4), '§1'],
    ['wash3.z', d.wash3.z, ft(39, 4), '§1'], ['wash3.sq', d.wash3.sq, ft(23), '§1'],
    ['gargoyle1Z', d.gargoyle1Z, ft(189), '§5'],
    ['balcony.z', d.balcony.z, ft(204, 4), '§5'], ['balcony.sq', d.balcony.sq, ft(29, 6), '§5'],
    ['belfryTopSq', d.belfryTopSq, ft(21, 4), '§5'],
    ['topZ', d.topZ, ft(252, 7.5), 'p.1'],
  ]
  for (const [k, got, want, cite] of pin) if (!eq(got, want)) f.push(`${k} = ${got}′, dossier ${cite} says ${want}′`)
  // The dossier's own arithmetic: each wash takes 8″ off each face (16″ overall).
  const sq = [d.baseSq, d.wash1.sq, d.wash2.sq, d.wash3.sq]
  for (let i = 1; i < sq.length; i++) if (!eq(sq[i - 1] - sq[i], 16 / 12)) f.push(`wash ${i} is not a 16″ reduction`)
  // Wash Z = the original-ground figure (21′3″, 33′11″, 44′4″) minus the 5′ datum shift.
  for (const [w, orig] of [[d.wash1, ft(21, 3)], [d.wash2, ft(33, 11)], [d.wash3, ft(44, 4)]])
    if (!eq(w.z, orig + d.originalGroundZ)) f.push(`a wash Z is not its original-ground value − 5′`)
  if (!eq(d.balcony.sq - d.wash3.sq, 2 * ft(3, 3))) f.push('balcony is not a 3′3″ projection per face past the 23′ shaft')
  if (!eq(d.foundationTopSq - d.baseSq, 1)) f.push('foundation top is not 1′ wider than the base')
  return f
}

// ── B. the profile ──────────────────────────────────────────────────────────
function checkProfile(stages, d) {
  const f = []
  const by = Object.fromEntries(stages.map(s => [s.name, s]))
  if (!eq(stages[0].z0, d.originalGroundZ)) f.push(`profile starts at ${stages[0].z0}′, not the original ground`)
  const top = Math.max(...stages.map(s => s.z1))
  if (!eq(top, d.topZ)) f.push(`profile top ${top}′ ≠ ${d.topZ}′ (252′7.5″)`)
  const stack = stages.filter(s => s.name !== 'balcony')
  for (let i = 1; i < stack.length; i++) if (!eq(stack[i].z0, stack[i - 1].z1)) f.push(`gap/overlap between ${stack[i - 1].name} and ${stack[i].name}`)
  for (const [n, z] of [['wash1', d.wash1.z], ['wash2', d.wash2.z], ['shaft', d.wash3.z]])
    if (!by[n] || !eq(by[n].z0, z)) f.push(`${n} does not start at the table's ${z}′`)
  if (!by.balcony || !eq(by.balcony.z1, d.balcony.z) || !eq(by.balcony.sq, d.balcony.sq)) f.push('balcony deck is not the table\'s 29′6″ at 204′4″')
  if (!by.plinth || !eq(by.plinth.sq, d.foundationTopSq) || !eq(by.plinth.z1, 0)) f.push('plinth is not 28′ square topping out at Z = 0')
  return f
}

// ── F. the coursing ─────────────────────────────────────────────────────────
const REGISTRY = JSON.parse(readFileSync(join(ROOT, 'references/registry.json'), 'utf8'))
function checkCoursing(beds, registry = REGISTRY, d = DOSSIER, matSrc = null) {
  const f = []
  const { values, absent } = resolveSurfaceParams('pilgrim-granite', registry)
  for (const name of ['courseHeightIn', 'courseCount', 'jointIn', 'face', 'stoneLength', 'jointShade'])
    if (values[name] == null) f.push(`pilgrim-granite.${name} does not resolve (${absent.join('; ')})`)
  const ch = values.courseHeightIn?.courseHeight_in, cnt = values.courseCount
  if (!ch) return f
  if (!beds) beds = courseBeds({ minIn: ch.min, maxIn: ch.max }, d, undefined, cnt ? [cnt] : [])
  const h = beds.slice(1).map((z, i) => (z - beds[i]) * 12)
  const out = h.filter(x => x < ch.min - 1e-6 || x > ch.max + 1e-6)
  if (out.length) f.push(`${out.length} course(s) outside the cited ${ch.min}–${ch.max}″: ${out.slice(0, 3).map(x => x.toFixed(2)).join(', ')}″`)
  if (!eq(beds[0], 0) || !eq(beds.at(-1), d.topZ)) f.push(`course table runs ${beds[0]}′–${beds.at(-1)}′, not 0–${d.topZ}′`)
  for (const [n, w] of [['wash1', d.wash1.z], ['wash2', d.wash2.z], ['wash3', d.wash3.z]])
    if (!beds.some(z => eq(z, w, 1e-6))) f.push(`no bed at ${n} (${w}′)`)
  if (cnt) {
    const inSeg = beds.filter(z => z > cnt.fromZ_ft + 1e-6 && z <= cnt.toZ_ft + 1e-6).length
    if (inSeg !== cnt.courses) f.push(`measured ${cnt.courses} courses ${cnt.fromZ_ft}′–${cnt.toZ_ft}′, table has ${inSeg}`)
  }
  const sl = values.stoneLength, byId = new Map(registry.findings.map(x => [x.id, x]))
  const lap = byId.get('f-baker-bond-lap')?.value?.lap_depths, mx = byId.get('f-baker-ashlar-max-length')?.value?.maxLength_depths
  if (sl && lap && mx) {
    if (sl.lap_depths < lap.min || sl.lap_depths > lap.max) f.push(`bond lap ${sl.lap_depths}× is outside Baker §202's ${lap.min}–${lap.max}×`)
    if (sl.stoneLength_depths > mx.min) f.push(`stone length ${sl.stoneLength_depths}× exceeds Baker §200's hard-stone ${mx.min}×`)
    if (sl.stoneLength_depths < 2 * sl.lap_depths - 1e-9) f.push(`stone length ${sl.stoneLength_depths}× cannot carry a ${sl.lap_depths}× lap on both ends`)
  } else if (sl) f.push('stone length resolves but its Baker findings do not — its ancestry is broken')
  // ⛔ The joint must not hang on an authored value: read the shader's own source and prove the
  // joint term is applied to the albedo outside any authored factor.
  const mat = matSrc ?? readFileSync(join(ROOT, 'src/components/graniteMasonryMaterial.js'), 'utf8')
  if (!/diffuseColor\.rgb \*= mix\(1\.0, uJointShade, mJoint\(c\)\)/.test(mat)) f.push('the mortar joint is not drawn into the albedo from geometry: at the neutral authored values the joints would vanish')
  if (/mJoint[^;]*u(ReliefM|ToneVar)|u(ReliefM|ToneVar)[^;]*mJoint\(c\)\)/.test(mat.match(/diffuseColor\.rgb \*= mix\(1\.0, uJointShade[^;]*;/)?.[0] || '')) f.push('the joint albedo term is scaled by an authored value')
  const js = values.jointShade?.jointShade_x
  if (!(js > 0 && js < 1)) f.push(`joint shade ${js} is not a darkening multiple in (0, 1)`)
  return f
}

// ── C/D/E. the site ─────────────────────────────────────────────────────────
function slabFootprints(look) {
  const jp = join(ROOT, 'public/baked', look, 'buildings.json')
  if (!existsSync(jp)) return null
  const j = JSON.parse(readFileSync(jp, 'utf8'))
  const buf = readFileSync(join(ROOT, 'public/baked', look, j.bin))
  const all = new Float32Array(buf.buffer, buf.byteOffset + j.footprintByteOffset, j.footprintPointCount * 2)
  return j.buildings.map(b => {
    const [s, e] = b.footprintRange, ring = []
    for (let i = s; i < e; i++) ring.push([all[2 * i], all[2 * i + 1]])
    return { id: b.id, ring }
  })
}
const inPoly = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }

function checkSite(inst, { osmRing, way, terrain, slab }) {
  const f = [], info = []
  const sp = inst.setPiece
  // C. the ring is OSM's
  if (!osmRing) f.push(`raw/osm.json has no building way ${sp.osmWay}`)
  else if (osmRing.length !== sp.footprint.length || osmRing.some((p, i) => p[0] !== sp.footprint[i][0] || p[1] !== sp.footprint[i][1]))
    f.push(`instance footprint differs from OSM way ${sp.osmWay} — re-copy it from raw/osm.json`)
  if (!way) f.push(`raw/osm.json has no way ${sp.osmWay}`)
  else if (sp.name !== way.tags?.name) f.push(`setPiece.name "${sp.name}" ≠ OSM way ${sp.osmWay}'s name "${way.tags?.name}"`)
  const site = siteFromFootprint(sp.footprint.map(([lon, lat]) => lonLatToLocal(inst.geography, lon, lat)))
  const plinthM = DOSSIER.foundationTopSq * FT
  const [shortM, longM] = site.sidesM
  info.push(`site (${site.x.toFixed(2)}, ${site.z.toFixed(2)}) · yaw ${(site.yaw * 180 / Math.PI).toFixed(1)}° · mapped ${shortM.toFixed(2)} × ${longM.toFixed(2)} m vs plinth ${plinthM.toFixed(2)} m square`)
  // The SHORT side is tested: the mapped ring runs long on one axis (cause not established),
  // and the dossier, not the map, sets the size. The map is trusted for position + rotation.
  if (Math.abs(shortM - plinthM) > 1 * FT) f.push(`mapped footprint's short side ${shortM.toFixed(2)} m is more than the 1′ shoulder off the dossier's 28′ (${plinthM.toFixed(2)} m): is way ${sp.osmWay} the tower?`)
  // D. the seat
  if (!terrain) f.push(`${inst.lookId} has no terrain — cannot seat the set-piece`)
  else {
    const seat = seatOnTerrain(terrain.getElevationRaw, site)
    const depthM = -DOSSIER.originalGroundZ * FT
    info.push(`seat Z=0 at ${seat.groundRaw.toFixed(2)} m raw · spread under plinth ${seat.spread.toFixed(2)} m (plinth depth ${depthM.toFixed(2)} m) · grid step ${terrain.stepM.toFixed(2)} m`)
    if (!(seat.spread <= depthM)) f.push(`terrain spread ${seat.spread.toFixed(2)} m under the plinth exceeds its ${depthM.toFixed(2)} m depth: a corner would float`)
    if (!(seat.spread <= terrain.stepM)) f.push(`seat is not within one grid step of the terrain at the footprint`)
    const top = seat.groundRaw + (Math.max(...placeholderStages().map(s => s.z1)) * FT)
    info.push(`top at ${top.toFixed(2)} m raw = ${((top - seat.groundRaw) / FT).toFixed(3)}′ above the base (252.625′ wanted)`)
  }
  // E. nothing else stands in the plinth
  if (!slab) f.push(`no baked slab buildings for ${inst.lookId}`)
  else {
    const sq = plinthSamplePoints(site).slice(1)
    const hits = slab.filter(b => b.ring.some(([x, z]) => inPoly(x, z, sq)) || inPoly(site.x, site.z, b.ring))
    info.push(`slab buildings inside the plinth: ${hits.length}`)
    if (hits.length) f.push(`slab buildings extrude inside the set-piece's plinth: ${hits.map(h => h.id).join(', ')} — add them to building-overrides.json "hide"`)
  }
  return { f, info }
}

// ── run ─────────────────────────────────────────────────────────────────────
async function loadInstances() {
  const dir = join(ROOT, 'src/instances')
  const out = []
  for (const n of readdirSync(dir).filter(n => n.endsWith('.js') && n !== 'registry.js')) {
    const m = (await import(join(dir, n))).default
    if (m?.setPiece?.kind === 'pilgrim-monument') out.push(m)
  }
  return out
}
function contextFor(inst) {
  const osm = JSON.parse(readFileSync(join(ROOT, 'cartograph/data', inst.lookId, 'raw/osm.json'), 'utf8'))
  const way = osm.buildings.find(b => b.osmId === inst.setPiece.osmWay)
  const osmRing = way ? way.coords.slice(0, -1).map(c => [c.lon, c.lat]) : null
  const t = loadSceneTerrain(inst.lookId)
  const meta = JSON.parse(readFileSync(join(ROOT, 'cartograph/data', inst.lookId, 'clean/terrain.json'), 'utf8'))
  const terrain = t && { getElevationRaw: t.getElevationRaw, stepM: (meta.bounds.maxX - meta.bounds.minX) / (meta.width - 1) }
  return { osmRing, way, terrain, slab: slabFootprints(inst.lookId) }
}

const insts = await loadInstances()
if (!insts.length) { console.error('⛔ FAIL — no instance declares a pilgrim-monument set-piece; nothing was checked.'); process.exit(1) }

if (process.argv.includes('--self-test')) {
  const inst = insts[0], ctx = contextFor(inst)
  const site = siteFromFootprint(inst.setPiece.footprint.map(([lon, lat]) => lonLatToLocal(inst.geography, lon, lat)))
  const CNT = resolveSurfaceParams('pilgrim-granite', REGISTRY).values.courseCount
  const CB = () => courseBeds({ minIn: 18, maxIn: 30 }, DOSSIER, undefined, [CNT])
  const cases = [
    ['top moved 1″', () => checkTable({ ...DOSSIER, topZ: DOSSIER.topZ + 1 / 12 }).length],
    ['wash 2 moved', () => checkTable({ ...DOSSIER, wash2: { ...DOSSIER.wash2, z: ft(33, 11) } }).length],
    ['profile top short', () => checkProfile(placeholderStages(DOSSIER, INFERRED).slice(0, -1), DOSSIER).length],
    ['profile ignores table', () => checkProfile(placeholderStages({ ...DOSSIER, wash1: { z: 17, sq: DOSSIER.wash1.sq } }), DOSSIER).length],
    ['footprint drifted', () => checkSite({ ...inst, setPiece: { ...inst.setPiece, footprint: inst.setPiece.footprint.map(([a, b]) => [a + 1e-6, b]) } }, ctx).f.length],
    ['terrain cliff', () => checkSite(inst, { ...ctx, terrain: { ...ctx.terrain, getElevationRaw: (x) => x > site.x ? 10 : 0 } }).f.length],
    ['label renamed', () => checkSite({ ...inst, setPiece: { ...inst.setPiece, name: 'Pilgrim Tower' } }, ctx).f.length],
    ['a course over range', () => { const b = CB(); b.splice(12, 1); return checkCoursing(b).length }],
    ['bed off a wash', () => { const b = CB().map(z => (z > 16 && z < 16.5 ? z + 0.1 : z)); return checkCoursing(b).length }],
    ['table off the measured count', () => checkCoursing(courseBeds({ minIn: 18, maxIn: 30 }, DOSSIER, undefined, [{ ...CNT, courses: 9 }])).length],
    ['lap outside Baker', () => checkCoursing(null, { findings: REGISTRY.findings.map(x => x.id === 'd-pilgrim-stone-length' ? { ...x, value: { stoneLength_depths: 2.5, lap_depths: 2 } } : x) }).length],
    ['stone over Baker max', () => checkCoursing(null, { findings: REGISTRY.findings.map(x => x.id === 'd-pilgrim-stone-length' ? { ...x, value: { stoneLength_depths: 6, lap_depths: 1.25 } } : x) }).length],
    ['joints only in the relief', () => checkCoursing(null, REGISTRY, DOSSIER, readFileSync(join(ROOT, 'src/components/graniteMasonryMaterial.js'), 'utf8').replace(/diffuseColor\.rgb \*= mix\(1\.0, uJointShade, mJoint\(c\)\);/, '')).length],
    ['joint shade gone', () => checkCoursing(null, { findings: REGISTRY.findings.filter(x => x.id !== 'd-pilgrim-joint-shade') }).length],
    ['finding gone', () => checkCoursing(null, { findings: REGISTRY.findings.filter(x => x.id !== 'f-pilgrim-course-height') }).length],
    ['box in plinth', () => checkSite(inst, { ...ctx, slab: [...ctx.slab, { id: 'mutant-box', ring: [[site.x - 1, site.z - 1], [site.x + 1, site.z - 1], [site.x + 1, site.z + 1], [site.x - 1, site.z + 1]] }] }).f.length],
  ]
  let bad = 0
  for (const [n, run] of cases) { const caught = run() > 0; if (!caught) bad++; console.log(`${caught ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

let failed = 0
const tf = [...checkTable(DOSSIER), ...checkProfile(placeholderStages(), DOSSIER), ...checkCoursing()]
const nC = (() => { const v = resolveSurfaceParams('pilgrim-granite', REGISTRY).values, ch = v.courseHeightIn?.courseHeight_in; return ch ? courseBeds({ minIn: ch.min, maxIn: ch.max }, DOSSIER, undefined, v.courseCount ? [v.courseCount] : []).length - 1 : 0 })()
console.log(tf.length ? `⛔ table/profile/coursing:\n   ${tf.join('\n   ')}` : `✅ table: every D/C value matches the dossier; profile reads it, top 252′7.5″; ${nC} courses inside the cited range, a bed at each wash, 8 measured courses base→wash 1, running bond inside Baker`)
failed += tf.length
for (const inst of insts) {
  const { f, info } = checkSite(inst, contextFor(inst))
  console.log(`${f.length ? '⛔' : '✅'} ${inst.lookId}:\n   ${[...info, ...f.map(x => '⛔ ' + x)].join('\n   ')}`)
  failed += f.length
}
process.exit(failed ? 1 : 0)
