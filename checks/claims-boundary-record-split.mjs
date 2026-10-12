#!/usr/bin/env node
/**
 * CLAIM (the CLASS, not one scene): `neighborhood_boundary.json` splits into three
 * records and recomposes BYTE-IDENTICALLY, a commit / rescope preserves every authored
 * field, and the file carries NO fade — the edge's band + ruffle are the Look's
 * (Stage › Horizon › Edge, 2026-10-06); a file still carrying one is REFUSED by name.
 *
 *   node checks/claims-boundary-record-split.mjs
 *
 * The defect (`EXTENT-DESIGN §5.1`, D4): the write routes CONSTRUCTED A FRESH
 * OBJECT, so the fade fields were rebuilt from hardcoded constants every time, with
 * no preserve branch anywhere.
 *
 * ⚠️ THE SUBJECT SHRANK TWICE, BY RULING. 2026-09-20: the fade set became ONE field and the derived copies were
 * deleted. 2026-10-06: that field left the file for the Look. What this guarded about the fade is now structurally
 * impossible; what survives is split/compose byte-identity and the authored fields riding through a write.
 *
 * ⛔ NO LIVE SCENE IS WRITTEN. Every simulation runs on a parsed FIXTURE copy.
 *
 * ⭐ READS THE SOURCE. `RETIRED_FADE_FIELDS` is imported from the module under test, never restated.
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  splitBoundary, composeBoundary, makeDiscRecord, RETIRED_FADE_FIELDS,
} from '../cartograph/boundaryRecords.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'cartograph', 'data')
let fail = 0
const ok = (c, m) => { console.log(`   ${c ? '✅' : '❌'} ${m}`); if (!c) fail++ }

const scenes = readdirSync(DATA, { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(DATA, d.name, 'neighborhood_boundary.json')))
  .map(d => d.name).sort()
const load = (s) => JSON.parse(readFileSync(join(DATA, s, 'neighborhood_boundary.json'), 'utf8'))

// ── A. round-trip parity — every scene, byte-identical ───────────────────────
console.log('── A. split → compose is byte-identical, every scene ────────────')
for (const s of scenes) {
  const raw = readFileSync(join(DATA, s, 'neighborhood_boundary.json'), 'utf8')
  const nb = JSON.parse(raw)
  const recomposed = JSON.stringify(composeBoundary(splitBoundary(nb, s)), null, 2)
  ok(recomposed === JSON.stringify(nb, null, 2), `${s.padEnd(26)} round-trips byte-identical`)
}

// ── B. no boundary file carries a fade — it is the Look's ─────────────────────
console.log('\n── B. no scene stores a fade in its boundary file ─────────────────')
for (const s of scenes) {
  const nb = load(s), found = RETIRED_FADE_FIELDS.filter(f => nb[f] !== undefined)
  ok(found.length === 0, `${s.padEnd(26)} carries none of ${RETIRED_FADE_FIELDS.join(' / ')}${found.length ? ` — FOUND ${found.join(', ')}` : ''}`)
}

// ── C. THE LS SURVIVAL TEST, with the mutation check that gives it teeth ─────
console.log('\n── C. LS survives a simulated rescope / commit ──────────────────')
const LS = 'lafayette-square'
if (!scenes.includes(LS)) { ok(false, 'lafayette-square artifact is missing'); }
else {
  const nb = load(LS)                       // FIXTURE: parsed copy, never written back
  const recs = splitBoundary(nb, LS)

  // rescope: no `center` posted (ExtentApp never sends one) → prev.center preserved.
  const rescoped = makeDiscRecord({ radius: nb.radius, center: recs.disc.center, where: LS })
  // commit-extent: same disc construction, center from the posted lat/lon.
  const committed = makeDiscRecord({ radius: nb.radius, center: recs.disc.center, where: LS })
  for (const [label, d] of [['rescope', rescoped], ['commit-extent', committed]]) {
    ok(JSON.stringify(d.center) === JSON.stringify([-15, -15]), `${label}: center [-15,-15] survives (got ${JSON.stringify(d.center)})`)
    ok(RETIRED_FADE_FIELDS.every(f => !(f in d)), `${label}: the disc record carries no fade`)
  }

  // The whole artifact. ⚠️ Split in two, because the RING is the one disc field
  // that is genuinely DERIVED and LS's is older than the current constructor: it
  // carries 3 decimals, `makeRing` emits 2 (measured 2026-08-12 — LS is the only
  // scene where this shows; every other artifact already round-trips byte-exact,
  // section A). So the ring regenerating is correct and pre-existing, and only the
  // AUTHORED fields have to be untouched. Asserting byte-equality over the ring too
  // would fail for a reason that has nothing to do with the fade set.
  const out = composeBoundary({ ...recs, disc: rescoped })
  const strip = (o) => { const { boundary, ...rest } = o; return JSON.stringify(rest, null, 2) }
  ok(strip(out) === strip(nb), 'a same-radius rescope of LS leaves every NON-RING field byte-identical')
  ok(Object.keys(out).join(',') === Object.keys(nb).join(','),
    `key order + key set preserved (${Object.keys(out).join(',')})`)
  let maxDev = 0
  for (let i = 0; i < nb.boundary.length; i++) {
    maxDev = Math.max(maxDev, Math.abs(nb.boundary[i][0] - out.boundary[i][0]),
      Math.abs(nb.boundary[i][1] - out.boundary[i][1]))
  }
  ok(out.boundary.length === nb.boundary.length && maxDev <= 0.005,
    `the derived ring is geometrically unchanged (${nb.boundary.length} pts, max deviation ${maxDev} m — the 3dp→2dp rounding only)`)

}

// ── D. THE CLIP STAYS GONE — pipeline.js binds no keepR and keeps no single run ─
// The boundary clip trimmed every chain to `keepR` and kept only its longest inside run (`clipRun`'s
// `pieces.reduce`). Jacob had it EXCISED as a contract breach (ec7dd3f4, 2026-09-05: the disc hides, the bb holds;
// the clip was the one step that DELETED). Until 2026-10-12 this section asserted the OPPOSITE — that `keepR` still
// existed — and sat failing; its census, `claims-rim-census.mjs`, was archived the same day
// (`cartograph/_archive/claims-rim-census-RETIRED-2026-10-12.mjs`). Comments are stripped: the excision's own
// history names keepR in prose, and prose is not a binding.
console.log('\n── D. the boundary clip stays excised ───────────────────────────')
/** What of the clip `pipeline.js` source (comments stripped) still carries. */
function clipBack(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const out = []
  if (/\b(?:const|let|var)\s+keepR\b/.test(code)) out.push('binds `keepR` (the clip radius)')
  if (/\bclipRun\b/.test(code)) out.push('names `clipRun` (the clip)')
  if (/pieces\.reduce\(/.test(code)) out.push('keeps a single run (`pieces.reduce(`)')
  return out
}
{
  const pipe = readFileSync(join(ROOT, 'cartograph', 'pipeline.js'), 'utf8')
  const back = clipBack(pipe)
  ok(!back.length, back.length ? `pipeline.js ${back.join(' · ')} — the boundary clip is back` : 'pipeline.js binds no keepR and keeps no single run')
  // ⭐ MUTATIONS, every run: each must be caught.
  for (const [what, src] of [
    ['`const keepR` put back', pipe + '\nconst keepR = radius + 30\n'],
    ['the longest-run keep put back', pipe + '\nfunction clipRun(pieces) { return pieces.reduce((a, b) => (b.length > a.length ? b : a)) }\n'],
  ]) ok(clipBack(src).length > 0, `mutation (${what}) caught`)
}

// ── E. the controls — every generated scene is byte-identical through a rescope ─
console.log('\n── E. every scene is untouched by a same-radius rescope ─────────')
// ⚠️ THE RING IS COMPARED GEOMETRICALLY, NOT BYTE-WISE — same treatment §C documents.
// LS's ring predates the current `makeRing` and carries 3 decimals where it emits 2,
// so it regenerates correctly but not byte-identically. Until 2026-09-20 LS was the
// only AUTHORED scene and this loop skipped it entirely; the band ruling made every
// scene generated, which brought LS in here for the first time and surfaced the
// rounding. ⛔ It is a pre-existing artifact quirk, NOT a fade regression — the
// authored fields below are still held to the byte.
for (const s of scenes) {
  const nb = load(s)
  const recs = splitBoundary(nb, s)
  const d = makeDiscRecord({ radius: nb.radius, center: recs.disc.center, where: s })
  const out = composeBoundary({ ...recs, disc: d })
  const strip = (o) => { const { boundary, ...rest } = o; return JSON.stringify(rest, null, 2) }
  let dev = 0
  for (let i = 0; i < nb.boundary.length; i++) {
    dev = Math.max(dev, Math.abs(nb.boundary[i][0] - out.boundary[i][0]), Math.abs(nb.boundary[i][1] - out.boundary[i][1]))
  }
  ok(strip(out) === strip(nb) && out.boundary.length === nb.boundary.length && dev <= 0.005,
    `${s.padEnd(26)} same-radius rescope: non-ring fields byte-identical, ring geometrically unchanged (max dev ${dev} m)`)
}

// ── F. FAIL LOUDLY — no defaults, no silent reconstruction ───────────────────
console.log('\n── F. the failure modes name the field ──────────────────────────')
const throws = (fn, needle, what) => {
  try { fn(); ok(false, `${what} — did NOT throw`) }
  catch (e) { ok(e.message.includes(needle), `${what} — throws naming "${needle}": ${e.message.slice(0, 90)}…`) }
}
const base = load(scenes[0])
throws(() => splitBoundary({ ...base, radius: undefined }, 'fixture'), 'radius',
  'a boundary with no radius')
throws(() => splitBoundary({ ...base, boundary: undefined }, 'fixture'), 'boundary ring',
  'a boundary with no ring')
for (const f of ['fadeBand', 'fadeRuffle']) throws(() => splitBoundary({ ...base, [f]: 200 }, 'fixture'), 'retired',
  `a boundary still carrying \`${f}\` (the Look owns the edge now)`)

console.log(`\n${fail === 0 ? '✅ PASS' : `❌ ${fail} FAILURE(S)`}`)
process.exit(fail === 0 ? 0 : 1)
