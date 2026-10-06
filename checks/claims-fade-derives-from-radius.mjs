/**
 * CLAIM: the circle has ONE origin, and the fade is DERIVED from it.
 *
 *   radius, center               AUTHORED in Extent — the disc; the radius cuts geometry
 *   edgeFadeBand                 AUTHORED per LOOK (Stage › Horizon › Edge, 2026-10-06), metres;
 *                                absent ⇒ 5% of the radius, said
 *   fade.inner = radius − band   DERIVED, never stored
 *   fade.outer = radius          DERIVED, never stored — INWARD
 *   streetFade                   DELETED
 *
 * ⛔ The radius CUTS the geometry, and that is intended. More content at the edge is
 * an Extent-tool gesture — pull the circle out — not a render change. ⛔ And the fade
 * never moves geometry: the clip is the radius, whatever the Look says (section E).
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
import { deriveFade, DEFAULT_FADE_BAND, classifyFade, FADE_FIELDS, edgeBandOf, lookFade, EDGE_DEFAULT_BAND_FRACTION } from '../cartograph/boundaryRecords.mjs'
import { readLookDesign, SEED_STRIPPED_FIELDS, TOWN_SCALED_LOOK_FIELDS } from '../cartograph/lookDesign.mjs'
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
h('B. the band is the LOOK\'s — finite and non-negative where authored; the kit default where not')
const looks = JSON.parse(readFileSync('public/looks/index.json', 'utf8')).looks.filter(l => l.scene && scenes.includes(l.scene))
for (const l of looks) {
  const d = readLookDesign(l.id, 'claims-fade-derives-from-radius')
  const R = JSON.parse(readFileSync(join(DATA, l.scene, 'neighborhood_boundary.json'), 'utf8')).radius
  if (d.edgeFadeBand === undefined) { const e = edgeBandOf(d, R, 'check', l.id); ok(e.source === 'default' && e.band === EDGE_DEFAULT_BAND_FRACTION * R, `${l.id.padEnd(26)} no edgeFadeBand → the kit default, ${e.band} m (5% of R ${R})`); continue }
  ok(Number.isFinite(d.edgeFadeBand) && d.edgeFadeBand >= 0, `${l.id.padEnd(26)} edgeFadeBand=${d.edgeFadeBand}`)
}
let negThrew = false
try { edgeBandOf({ edgeFadeBand: -5 }, 892, 'fixture') } catch { negThrew = true }
ok(negThrew, 'a negative edgeFadeBand throws — it would put fade.inner past the rim')
// ⭐ The kit default is read off the function on a fixture, because a town on disk that authors no band is rare: a
// FRACTION of the radius, so it scales with the town — never a width in metres right only for a town of one size.
for (const R of [892, 5290]) { const e = edgeBandOf({}, R, 'fixture', 'fixture')
  ok(e.source === 'default' && e.band === EDGE_DEFAULT_BAND_FRACTION * R && EDGE_DEFAULT_BAND_FRACTION === 0.05, `no band, R=${R} → the kit default ${e.band} m (5% of R)`) }

// ── C. THE FORMULA IS ADDITIVE ─────────────────────────────────────────────
// Read off the live function, not restated: the feather starts AT the rim.
h('C. deriveFade is inward — the feather finishes AT the rim')
for (const R of [180, 892, 3539]) {
  const f = deriveFade(R, 200)
  ok(f.outer === R, `R=${R}: fade.outer === radius (${f.outer})`)
  ok(f.inner === Math.max(0, R - 200), `R=${R}: fade.inner === radius − band, clamped at 0 (${f.inner})`)
}
ok(deriveFade(1000).inner === 1000 - DEFAULT_FADE_BAND, `default band applies when none is given (${DEFAULT_FADE_BAND} m)`)
ok(deriveFade(100, 400).inner === 0, 'a band wider than the radius clamps at 0 rather than going negative')

// ── D. A RADIUS MOVE CANNOT STRAND THE FADE ────────────────────────────────
// The reason the whole arc exists: the radius is live-editable, and five stored
// numbers used to keep pointing at the old circle after it moved.
h('D. the fade follows a moved radius (the defect that started this)')
for (const l of looks) {
  const d = readLookDesign(l.id, 'claims-fade-derives-from-radius')
  if (d.edgeFadeBand === undefined) continue   // a default band is a FRACTION of R, so it scales rather than translates
  const R = JSON.parse(readFileSync(join(DATA, l.scene, 'neighborhood_boundary.json'), 'utf8')).radius
  const before = lookFade(d, R, 'check', l.id), after = lookFade(d, R + 500, 'check', l.id)
  ok(after.inner === before.inner + 500 && after.outer === before.outer + 500,
    `${l.id.padEnd(26)} radius +500 → fade moves with it (${before.inner}/${before.outer} → ${after.inner}/${after.outer})`)
}

// ── E. THE FADE NEVER MOVES GEOMETRY — A FIXTURE, BOTH WAYS ──────────────
// ⛔ Ruled 2026-10-06 (a): the clip is the disc's ring at the radius exactly, whether or not a band exists anywhere.
// It reached `fade.outer + 50` when a band was set; a Look deciding how far geometry reaches is what this forbids.
h('E. the clip is the radius exactly, band or no band (fixture)')
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
  write('plain',     { version: 2, center: [0, 0], radius: R, boundary: ring })
  write('withband',  { version: 2, center: [0, 0], radius: R, fadeBand: 200, boundary: ring })
  const reach = (st) => Math.round(Math.max(...st.clipPolygon.map(([x, z]) => Math.hypot(x, z))))
  for (const sc of ['plain', 'withband']) {
    const st = loadSceneStencil(tmp, sc)
    ok(reach(st) === R, `${sc.padEnd(9)} clip reaches the radius exactly: ${reach(st)} m (want ${R})`)
    ok(!('faceFade' in st), `${sc.padEnd(9)} the stencil carries no fade — geometry does not read it`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// ── E2. A TOWN-SIZED BAND DOES NOT TRAVEL ──────────────────────────────────
h('E2. edgeFadeBand is stripped when a Look is seeded from another town\'s')
ok(TOWN_SCALED_LOOK_FIELDS.includes('edgeFadeBand') && SEED_STRIPPED_FIELDS.includes('edgeFadeBand'),
  'edgeFadeBand is a town-scaled Look field and in the seed strip — LS\'s 200 m never lands on a 5 km town')

// ── F. THE FADE SET IS ONE FIELD ───────────────────────────────────────────
h('F. the fade set is one field, and classify reads it')
ok(FADE_FIELDS.length === 1 && FADE_FIELDS[0] === 'fadeBand', `FADE_FIELDS = [${FADE_FIELDS.join(', ')}]`)
ok(classifyFade({ radius: 892, boundary: [] }).kind === 'absent', 'no fadeBand → absent (legal)')
ok(classifyFade({ radius: 892, fadeBand: 200 }).kind === 'generated', 'fadeBand === default → generated')
ok(classifyFade({ radius: 892, fadeBand: 134 }).kind === 'authored', 'fadeBand !== default → authored (the operator turned the knob)')
let threw = false
try { classifyFade({ radius: 892, fadeBand: -5 }, 'fixture') } catch { threw = true }
ok(threw, 'a negative fadeBand throws — it would invert the band (inner past outer)')

// ⚠️ A SECTION G LIVED HERE and is deliberately gone. It pinned "if a population
// fades it must be drawn out to fade.outer" — the precondition of the ADDITIVE band,
// which was tried and reverted on 2026-09-20. With an inward fade nothing needs reach
// past the rim, so the assertion is not merely unnecessary, it would be false.
// ⭐ The measurement that killed additive is NOT lost — it moved to its own check,
// where it keeps reporting even though the render no longer shows it:
// ▶ node checks/claims-fade-has-something-to-dissolve.mjs

console.log(fails === 0 ? '\n✅ all claims hold' : `\n❌ ${fails} claim(s) FAILED`)
process.exit(fails === 0 ? 0 : 1)
