/**
 * CLAIM: the circle has ONE origin, and the fade is DERIVED from it.
 *
 *   radius, center, fadeBand   AUTHORED — the only stored circle facts
 *   fade.inner = radius        DERIVED, never stored
 *   fade.outer = radius + band DERIVED, never stored — ADDITIVE
 *   streetFade                 DELETED
 *
 * ⭐ WHY THIS CHECK AND NOT A THRESHOLD. Before 2026-09-20 one circle had FOUR
 * definitions — the stored literals, boundary.js's `?? 134/+42/+108` defaults,
 * boundaryRecords' `200/140/160`, and a fourth copy in AerialTiles.jsx — and every
 * stored field was `??`, so a literal always won and the derivation was dead code.
 * `fade.outer === radius` held EXACTLY in all five fade-carrying scenes: six numbers
 * per town, all derivable, all stored. Move the radius and five of them lie.
 *
 * ⛔ The class this catches in a town nobody has looked at: a scene that STORES a
 * fade number. It does not matter whether the number is currently right — a stored
 * derived value is a second origin, and it goes wrong silently the moment the radius
 * moves. This reads the artifacts and the live formula; it restates neither.
 *
 * ▶ node checks/claims-fade-derives-from-radius.mjs
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { readdirSync } from 'fs'
import { tmpdir } from 'os'
import { deriveFade, DEFAULT_FADE_BAND, classifyFade, FADE_FIELDS, deriveFadeBoundary, pointInRing } from '../cartograph/boundaryRecords.mjs'
import { loadSceneStencil } from '../cartograph/sceneStencil.js'

let fails = 0
const ok = (cond, msg) => { console.log(`${cond ? '  ✅' : '  ❌'} ${msg}`); if (!cond) fails++ }
const h = (s) => console.log(`\n${s}`)

const DATA = 'cartograph/data'
const scenes = readdirSync(DATA).filter(s => existsSync(join(DATA, s, 'neighborhood_boundary.json'))).sort()

// ── A. NO SCENE STORES A DERIVED FADE FIELD ────────────────────────────────
// The three fields that were stored copies of derivable numbers. Their absence is
// the invariant; their presence is the whole defect class, in any town.
h('A. no scene stores a derived fade field (innerFadeOffset / fade / streetFade)')
const DERIVED_AND_MUST_NOT_BE_STORED = ['innerFadeOffset', 'fade', 'streetFade']
for (const s of scenes) {
  const nb = JSON.parse(readFileSync(join(DATA, s, 'neighborhood_boundary.json'), 'utf8'))
  const stored = DERIVED_AND_MUST_NOT_BE_STORED.filter(f => nb[f] !== undefined)
  ok(stored.length === 0,
    `${s.padEnd(26)} stores none of them${stored.length ? ` — FOUND ${stored.join(', ')}, a second origin for the circle` : ''}`)
}

// ── B. THE ONE KNOB IS SANE WHERE PRESENT ──────────────────────────────────
h('B. fadeBand is the one stored fade fact, finite and non-negative')
for (const s of scenes) {
  const nb = JSON.parse(readFileSync(join(DATA, s, 'neighborhood_boundary.json'), 'utf8'))
  if (nb.fadeBand === undefined) { console.log(`  ·  ${s.padEnd(26)} no fadeBand — absence is LEGAL and READ (no dissolve)`); continue }
  ok(Number.isFinite(nb.fadeBand) && nb.fadeBand >= 0, `${s.padEnd(26)} fadeBand=${nb.fadeBand}`)
}

// ── C. THE FORMULA IS ADDITIVE ─────────────────────────────────────────────
// Read off the live function, not restated: the feather starts AT the rim.
h('C. deriveFade is additive — the feather starts at the rim and lives outside it')
for (const R of [180, 892, 3539]) {
  const f = deriveFade(R, 200)
  ok(f.inner === R, `R=${R}: fade.inner === radius (${f.inner})`)
  ok(f.outer === R + 200, `R=${R}: fade.outer === radius + band (${f.outer})`)
}
ok(deriveFade(1000).outer === 1000 + DEFAULT_FADE_BAND, `default band applies when none is given (${DEFAULT_FADE_BAND} m)`)

// ── D. A RADIUS MOVE CANNOT STRAND THE FADE ────────────────────────────────
// The reason the whole arc exists: the radius is live-editable, and five stored
// numbers used to keep pointing at the old circle after it moved.
h('D. the fade follows a moved radius (the defect that started this)')
for (const s of scenes) {
  const nb = JSON.parse(readFileSync(join(DATA, s, 'neighborhood_boundary.json'), 'utf8'))
  if (nb.fadeBand === undefined) continue
  const before = deriveFade(nb.radius, nb.fadeBand)
  const after = deriveFade(nb.radius + 500, nb.fadeBand)
  ok(after.inner === before.inner + 500 && after.outer === before.outer + 500,
    `${s.padEnd(26)} radius +500 → fade moves with it (${before.inner}/${before.outer} → ${after.inner}/${after.outer})`)
}

// ── E. THE UNAUTHORED-FADE BRANCH — NO LOCAL WITNESS, SO A FIXTURE ─────────
// ⛔ No scene on disk has a boundary and no fadeBand, so this branch CANNOT be
// eye-gated and is not claimed to be. It is reachable by any town poured before its
// fade is authored — the kit case. Ruled 2026-09-20: no fade ⇒ no scale-out.
h('E. unauthored-fade branch: no fade ⇒ targetR = radius, NO +50 (fixture)')
const tmp = join(tmpdir(), `fade-ssot-fixture-${process.pid}`)
try {
  const R = 300
  const ring = []
  for (let i = 0; i < 256; i++) { const a = (i / 256) * 2 * Math.PI; ring.push([R * Math.cos(a), R * Math.sin(a)]) }

  const write = (scene, nb) => {
    const d = join(tmp, 'cartograph', 'data', scene)
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'neighborhood_boundary.json'), JSON.stringify(nb))
  }
  write('unauthored', { version: 2, center: [0, 0], radius: R, boundary: ring })
  write('authored',   { version: 2, center: [0, 0], radius: R, fadeBand: 200, boundary: ring })

  const un = loadSceneStencil(tmp, 'unauthored')
  const au = loadSceneStencil(tmp, 'authored')

  const reach = (st) => Math.round(Math.max(...st.clipPolygon.map(([x, z]) => Math.hypot(x, z))))
  ok(un.faceFade === null, 'no fadeBand → faceFade null (no dissolve; manifest.stencil stays null)')
  ok(reach(un) === R, `no fadeBand → clip reaches radius exactly: got ${reach(un)} m, want ${R} (a +50 scale-out here protects a feather that does not exist)`)
  ok(au.faceFade.outer === R + 200, `fadeBand 200 → fade.outer ${au.faceFade.outer}`)
  ok(reach(au) === R + 250, `fadeBand 200 → clip reaches fade.outer + 50 (${reach(au)} m)`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// ── F. THE FADE SET IS ONE FIELD ───────────────────────────────────────────
h('F. the fade set is one field, and classify reads it')
ok(FADE_FIELDS.length === 1 && FADE_FIELDS[0] === 'fadeBand', `FADE_FIELDS = [${FADE_FIELDS.join(', ')}]`)
ok(classifyFade({ radius: 892, boundary: [] }).kind === 'absent', 'no fadeBand → absent (legal)')
ok(classifyFade({ radius: 892, fadeBand: 200 }).kind === 'generated', 'fadeBand === default → generated')
ok(classifyFade({ radius: 892, fadeBand: 134 }).kind === 'authored', 'fadeBand !== default → authored (the operator turned the knob)')
let threw = false
try { classifyFade({ radius: 892, fadeBand: -5 }, 'fixture') } catch { threw = true }
ok(threw, 'a negative fadeBand throws — a feather cannot run inward')

// ── G. IF IT FADES, IT IS DRAWN OUT TO WHERE THE FADE ENDS ─────────────────
// ⭐ THE RULE, in Jacob's words: "the edge should feather and the buildings
// shouldn't" · "an outer band of dissolving ground with no buildings in it is what
// we want." A population either FADES — and must then be drawn out to fade.outer —
// or it does not, and is culled at membership. There is no third option, and the
// two culls must therefore be genuinely different shapes.
//
// ⛔ WHY THIS IS THE CLASS AND NOT A LOOK NOTE: the inward fade used to hide the
// polygon's hard cut from the inside. Moving it outward without moving the cull
// leaves the feather running over empty space — it fails on EVERY town at once, and
// it looks like "the fade stopped working" rather than "the cull is in the wrong
// place." This pins the relationship, not the appearance.
h('G. the fade-extent cull reaches the fade, and membership does not')
{
  const R = 400, band = 200
  const ring = []
  for (let i = 0; i < 256; i++) { const a = (i / 256) * 2 * Math.PI; ring.push([R * Math.cos(a), R * Math.sin(a)]) }
  const fadeRing = deriveFadeBoundary(ring, [0, 0], R, band)
  const inMembership = (x, z) => pointInRing(x, z, ring)
  const inFadeExtent = (x, z) => pointInRing(x, z, fadeRing)

  // A point in the feather band: outside membership, inside the fade extent.
  const mid = R + band / 2
  ok(inMembership(mid, 0) === false, `a point at R+${band / 2} is OUTSIDE membership (buildings stop here)`)
  ok(inFadeExtent(mid, 0) === true, `…and INSIDE the fade extent (ground/streets/landscape still drawn)`)

  // Past the fade, nothing is drawn by either.
  const past = R + band + 10
  ok(inFadeExtent(past, 0) === false, `a point past fade.outer is outside the fade extent too (${past} m)`)

  // Inside the disc both agree — the extent is a superset, never a replacement.
  ok(inMembership(R / 2, 0) && inFadeExtent(R / 2, 0), 'inside the disc both culls agree')

  // The extent must actually reach fade.outer, not some other radius.
  const reach = Math.round(Math.max(...fadeRing.map(([x, z]) => Math.hypot(x, z))))
  ok(reach === R + band, `the fade extent reaches fade.outer exactly (${reach} m, want ${R + band})`)
}

console.log(fails === 0 ? '\n✅ all claims hold' : `\n❌ ${fails} claim(s) FAILED`)
process.exit(fails === 0 ? 0 : 1)
