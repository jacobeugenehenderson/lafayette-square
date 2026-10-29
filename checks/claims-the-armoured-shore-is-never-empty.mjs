// claims-the-armoured-shore-is-never-empty.mjs — IS THERE A WALL AT EVERY DISTANCE?
//
// ⭐⭐ THE INVARIANT: every armoured face of every baked town yields FAR-FIELD
// geometry. Not "some shore has stone near the camera" — every armoured face, with
// no camera in the picture at all.
//
// ⛔⛔ WHY IT EXISTS. The revetment shipped gating BOTH its loops on a 90 m camera
// radius, so past that there was no bed and no stone: the wall did not degrade with
// distance, it VANISHED. Jacob, 2026-09-23: "IRL a wall doesn't disappear when it
// gets far away." That breaks his own close-inspection ruling — generate near the
// camera, ⛔ never an LOD that degrades to nothing. Nobody chose that behaviour; the
// radius was inherited from a harness that only ever looked close, and it was the
// only mechanism present. This check is what stops it coming back.
//
// ⛔ IT READS WHAT THE PLAYER MOUNTS: since 2026-10-29 the far layer is BAKED
// (cartograph/bake-revetment-far.js → revetment-far.json + its bins), so this reads the
// baked table against revetmentFromSlab's faces of the same slab. (It used to rebuild the
// far layer itself WITHOUT the drawn ground, which the player never did, so it could not
// see the player's far build.) A coastal town with no baked far shore is RED.
//
// ⚠️ HONEST LIMIT, SAID RATHER THAN PAPERED OVER: this proves the geometry EXISTS for
// every armoured metre. It does NOT prove pixels reach the screen at hero distance —
// that needs a render, and this brief is explicit that "does it look like rock" is not
// checkable and one must not write a check that pretends. The pixel question is an
// eye-gate and stays one.
//
// ⭐ MUTATION TEST: drop a face's chunks from revetment-far.json, bake at another
// FAR_OCTAVES than the bake script's, or filter a face out of revetmentFaces → RED.
//
//   node checks/claims-the-armoured-shore-is-never-empty.mjs         # every baked town
//   node checks/claims-the-armoured-shore-is-never-empty.mjs huron   # just that one
// Read-only. Exits 1 if any armoured face has no far-field geometry.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { revetmentFaces, loadRevetmentFar, FAR_FORMAT } from '../src/lib/revetmentFromSlab.js'
import { FAR_OCTAVES, NEAR_OCTAVES, drapeLattices } from '../src/lib/revetmentDrape.js'
import { MIN_ARMOUR_D50_M } from '../cartograph/shore-armour.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const only = process.argv.slice(2).find(a => !a.startsWith('--')) || null
// ⭐ NEAR-ONLY STONE (Zob, 2026-10-29): a near chunk that keeps stone where its far chunk keeps nothing is empty past the near
// radius — silent, unless named here. Read off the bake's own info table (every near chunk: nearTris, farTris). RED, by name,
// ⭐ EXCEPT ONE CLASS, BELOW THE FAR LAYER'S RESOLUTION (Boz ruled (b), 2026-10-29): armour narrower than one far step. The far
// builds a quad (I, I+1) only where both far stations are armoured; where one is bare, the near still builds the armoured near
// stations between, under one far step at that station. That is a level of detail, not a missing stone. Measured per chunk
// off the face's own lattices (revetmentDrape.js#drapeLattices): every armoured near station must lie in a far quad with a
// bare far station; its extent there is at most one far step. Any near-only chunk OUTSIDE that bound stays RED.
export const nearOnly = (info) => (info || []).filter(c => c.nearTris > 0 && !c.farTris)
/** { below, extentM, stepM } for a near-only chunk: is its armour within far quads beside a bare far station, and how far it runs */
export function belowFarStep(crestAt, G1, G3, c) {
  const nest = G3.nest / G1.nest, h = (G, i) => crestAt((G.s0 + ((G.s1 - G.s0) * i) / (G.nAlong - 1)) / G.total)
  let below = true, extentM = 0
  for (let I = c.far[0]; I < c.far[1]; I++) {
    const on = []; for (let i = I * nest; i <= (I + 1) * nest; i++) if (h(G3, i) >= MIN_ARMOUR_D50_M) on.push(i)
    if (!on.length) continue
    if (h(G1, I) >= MIN_ARMOUR_D50_M && h(G1, I + 1) >= MIN_ARMOUR_D50_M) below = false   // both far stations built: the far owed stone here
    extentM = Math.max(extentM, (on[on.length - 1] - on[0]) * G3.step)
  }
  return { below, extentM, stepM: G1.step }
}
if (process.argv.includes('--mutants')) {
  // the planted row: one near-only chunk in a table that otherwise has none must be named
  const planted = nearOnly([{ face: 'planted', k: 0, nearTris: 12, farTris: 0 }, { face: 'planted', k: 1, nearTris: 12, farTris: 30 }])
  console.log(`  mutant: a planted near-only row → ${planted.length === 1 && planted[0].k === 0 ? 'RED ✓' : 'GREEN ✗'}`)
  // the class's bound, planted: a 1 m heap end beside a bare far station is below it; armour over a whole far quad is not
  const face = (crest) => revetmentFaces({ version: 1, material: { riprapReposeDeg: 34 }, arcs: [{ index: 0, faces: ['left'], stations: crest }] })[0]
  const st = (L, on) => { const a = []; for (let s = 0; s <= L; s += 0.5) a.push({ x: s, z: 0, ...(on(s) ? { armour: true, crest: 1.5 } : { armour: false, crest: 0 }) }); return a }
  const judgeOf = (f, at) => { const [G1, G3] = drapeLattices({ poly: f.poly, crestAt: f.crestAt, crestBreaks: f.crestBreaks, octaves: [FAR_OCTAVES, NEAR_OCTAVES] })
    const I = Math.floor(at / G1.step); return belowFarStep(f.crestAt, G1, G3, { far: [Math.max(0, I - 1), I + 2] }) }
  const narrow = face(st(60, (s) => s >= 30.1 && s <= 30.4)), wide = face(st(60, (s) => s >= 25 && s <= 35))
  const a = judgeOf(narrow, 30.2), b = judgeOf(wide, 30)
  console.log(`  planted: armour under one far step beside a bare far station → ${a.below ? 'named, below the far step ✓' : 'RED ✗'} (${a.extentM.toFixed(2)} of ${a.stepM.toFixed(2)} m)`)
  console.log(`  mutant: a near-only chunk wider than a far step → ${!b.below ? 'RED ✓' : 'GREEN ✗'}`)
  // the format (Zob): the player refuses a far table of another format by name, and reads its own
  const said = [], load = (version) => loadRevetmentFar('planted', { manifest: { files: { 'revetment.json': 1, 'revetment-far.json': 1, 'revetment-far.bin': 1, 'revetment-far-unseen.bin': 1 } },
    fetchFile: async (f) => ({ ok: true, status: 200, json: async () => ({ version }), arrayBuffer: async () => new ArrayBuffer(0) }), say: (m) => said.push(m) })
  const old = await load(FAR_FORMAT - 1), cur = await load(FAR_FORMAT)
  const refused = old === null && said.some(m => m.includes(`format ${FAR_FORMAT - 1}`) && m.includes('re-run revetment-far')), read = cur?.far?.version === FAR_FORMAT
  console.log(`  mutant: a format-${FAR_FORMAT - 1} far table → ${refused ? 'refused by name, RED ✓' : 'READ ✗'} · format ${FAR_FORMAT} → ${read ? 'read ✓' : 'refused ✗'}`)
  if (!(planted.length === 1 && planted[0].k === 0) || !a.below || b.below || !refused || !read) process.exit(1)
}
let failed = false, towns = 0, without = 0

for (const look of readdirSync(join(ROOT, 'public', 'baked'), { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name).sort()) {
  if (only && look !== only) continue
  const p = join(ROOT, 'public', 'baked', look, 'revetment.json')
  if (!existsSync(p)) { console.log(`  ${look.padEnd(18)} no revetment.json — nothing to cover`); without++; continue }
  const doc = JSON.parse(readFileSync(p, 'utf8'))
  const armoured = revetmentFaces(doc).filter(f => f.anyArmour)
  if (!armoured.length) { console.log(`  ${look.padEnd(18)} no armoured shore — nothing to cover`); without++; continue }

  towns++
  const fp = join(ROOT, 'public', 'baked', look, 'revetment-far.json')
  if (!existsSync(fp)) { console.log(`  ⛔ ${look.padEnd(18)} ${armoured.length} armoured face(s) and NO revetment-far.json — the far shore was never baked, and the player draws no shore. ▶ the revetment-far step`); failed = true; continue }
  const far = JSON.parse(readFileSync(fp, 'utf8'))
  if (far.version !== FAR_FORMAT) { console.log(`  ⛔ ${look}: revetment-far.json is format ${far.version ?? 'none'}, and the player reads ${FAR_FORMAT} — it draws no shore from it. ▶ re-run revetment-far for ${look}`); failed = true; continue }
  if (far.farOctaves !== FAR_OCTAVES) { console.log(`  ⛔ ${look}: revetment-far.json was baked at octaves ${far.farOctaves}, the bake script's FAR_OCTAVES is ${FAR_OCTAVES} — re-bake`); failed = true; continue }
  const trisOf = new Map()
  for (const c of far.chunks) trisOf.set(c.face, (trisOf.get(c.face) || 0) + c.tris)
  let tris = 0
  const emptyFaces = [], coveredArcs = new Set()
  for (const f of armoured) {
    const t = trisOf.get(f.key) || 0
    if (t > 0) { tris += t; coveredArcs.add(f.arcIndex); continue }
    emptyFaces.push(f.key)
  }
  // ⛔⛔ COVERED vs CLAIMED, AND THIS ASSERTION IS THE POINT OF THE CHECK.
  // The first cut only asked "did every face I was HANDED produce geometry", which
  // cannot see a face that never arrived. Mutation-tested: dropping one arc inside
  // revetmentFromSlab left 2.8 km of shore with no geometry at all and this check went
  // GREEN — while printing "5137 m of 7957 m" on the same line. A number beside a
  // verdict is not an assertion. ⭐ The armoured metres come from the ARTIFACT, which
  // the adapter cannot silently shrink, so the two disagree the moment a face is lost.
  // ⚠️ Summed over unique ARCS: a two-faced arc yields two faces for one armoured
  // length, and per-face summing would double-count it into a false pass.
  const claimed = doc.totals?.armouredM ?? 0
  let covered = 0
  for (const a of doc.arcs || []) if (coveredArcs.has(a.index)) covered += a.armouredM || 0
  const shortfall = claimed - covered
  // a town heads ⛔ when any of its shore is empty at distance, near-only chunks included: the first line read is the verdict
  const latt = new Map(armoured.map(f => [f.key, f]))
  const lattOf = new Map(), lat = (k) => { if (!lattOf.has(k)) { const f = latt.get(k); lattOf.set(k, drapeLattices({ poly: f.poly, crestAt: f.crestAt, crestBreaks: f.crestBreaks, octaves: [FAR_OCTAVES, NEAR_OCTAVES] })) } return lattOf.get(k) }
  const judged = nearOnly(far.info).map(c => { const [G1, G3] = lat(c.face); return { ...c, ...belowFarStep(latt.get(c.face).crestAt, G1, G3, c) } })
  const lone = judged.filter(c => !c.below), fine = judged.filter(c => c.below)
  const good = emptyFaces.length === 0 && shortfall <= Math.max(1, claimed * 0.01) && lone.length === 0
  console.log(`  ${good ? '✅' : '⛔'} ${look}/revetment  ${armoured.length} armoured face(s) · far layer at octaves ${FAR_OCTAVES} (baked) · ` +
    `${tris.toLocaleString()} tris covering ${covered.toFixed(0)} m of ${claimed} m armoured`)
  for (const e of emptyFaces) console.log(`       ⛔ NO FAR GEOMETRY: face ${e} — this stretch is empty at distance`)
  if (shortfall > Math.max(1, claimed * 0.01)) {
    console.log(`       ⛔ ${shortfall.toFixed(0)} m OF ARMOURED SHORE IS UNACCOUNTED FOR. The artifact claims ${claimed} m; ` +
      `the faces reaching the far layer cover ${covered.toFixed(0)} m. A face is being dropped before it is ever built.`)
  }
  if (!Array.isArray(far.info)) { console.log(`       ⛔ ${look}: revetment-far.json has no info table (the near layer's index) — baked before it existed. ▶ re-bake`); failed = true }
  if (fine.length) console.log(`       ⚠️ ${fine.length} near-only chunk(s), ${fine.reduce((s, c) => s + c.nearTris, 0).toLocaleString()} near tris: armour below one far step (widest ${Math.max(...fine.map(c => c.extentM)).toFixed(2)} m, under that chunk's far step), the far layer's own resolution`)
  for (const c of lone) console.log(`       ⛔ NEAR-ONLY STONE: chunk ${c.face}#${c.k} keeps ${c.nearTris} near tris and NO far ones — empty past the near radius (its armour runs where both far stations are built)`)
  if (lone.length) console.log(`       ⛔ ${lone.length} near-only chunk(s), ${lone.reduce((s, c) => s + c.nearTris, 0).toLocaleString()} near tris, are empty at distance`)
  if (!good) failed = true
}

console.log(`\n  ${towns} town(s) with armoured shore · ${without} without`)
console.log('  ⚠️ proves the geometry exists for every armoured metre — NOT that it reaches the screen. That is an eye-gate.')
if (failed) { console.log('\n⛔ part of an armoured shore has no far-field geometry — the wall vanishes at distance there'); process.exit(1) }
console.log('\n✅ every armoured face has far-field geometry at every distance')
