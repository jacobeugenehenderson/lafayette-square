/**
 * CLAIM: trees, lamps and labels thin out over the SAME band the ground fades on —
 * a dissolve, never an on/off cut — and a scene that authored no fade gets no band
 * invented for it.
 *
 * ⭐ THE RECEIPT. The fade-SSoT work deleted the stored `fade: {inner, outer}` from
 * every neighborhood_boundary.json because it was a copy of numbers derivable from
 * `radius`. `neighborhood-membership.mjs` read that field with `?? R` on BOTH sides,
 * so both fallbacks fired at once and fadeIn === fadeOut === R. `density()` collapsed
 * to 1-inside / 0-outside — the exact on/off dichotomy the module's own header quotes
 * Jacob ruling against. Measured on HPDM before the fix: 34 lamps and 1,417 derived
 * trees had stopped thinning.
 *
 * ⛔⛔ THE CLASS, AND IT HAS NOW BITTEN FOUR TIMES IN ONE ARC: a `??` (or a falsy
 * gate, or a deleted argument) turning an ABSENCE into a plausible default, with no
 * error and a believable picture. bake-ground's manifest predicate · a normalizing
 * comment · the building material · this. ⭐ The deletion commit found ONE consumer of
 * the removed field and there were FOUR — the other three reach it through
 * makeMembership. A grep for the field name would have found them; nothing did.
 *
 * ⭐ AND THE OTHER HALF, WHICH IS THE OPPOSITE ERROR: deriving unconditionally would
 * INVENT a band for a scene that authored none. `toy` has no fadeBand, and that
 * absence is read as a value across the kit. This check pins BOTH directions,
 * because the fix for one is the bug for the other.
 *
 * ▶ node checks/claims-objects-dissolve-with-the-ground.mjs
 */
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { makeMembership } from '../cartograph/neighborhood-membership.mjs'
import { deriveFade } from '../cartograph/boundaryRecords.mjs'
import { readFileSync } from 'fs'

let fails = 0
const ok = (c, m) => { console.log(`${c ? '  ✅' : '  ❌'} ${m}`); if (!c) fails++ }
const h = (s) => console.log(`\n${s}`)

const DATA = 'cartograph/data'
const scenes = readdirSync(DATA)
  .filter(s => existsSync(join(DATA, s, 'neighborhood_boundary.json')))
  .sort()

// ⚠️ THE DISSOLVE ONLY EXISTS WHERE `isInside` IS FALSE. density() returns 1 for
// anything inside the neighborhood proper, and "proper" is the boundary-STREET
// POLYGON. A scene with NO polygon falls back to `hypot <= R`, so the disc itself is
// the neighborhood and the band — which lies INSIDE the disc — is entirely shadowed.
// ⭐⭐ THAT IS A STANDING FINDING, NOT A CHECK BUG: on those scenes the dissolve has
// never run, and their zero-regression reading earlier today meant UNREACHABLE, not
// CORRECT. Only hipointe-demun carries a polygon, of six scenes. bake-trees already
// warns about it ("no boundary-street polygon — the disc is standing in for the
// neighborhood") and evidently nobody reads that line.
h('A. where a dissolve can exist at all, it RAMPS')
for (const s of scenes) {
  const p = join(DATA, s, 'neighborhood_boundary.json')
  const nb = JSON.parse(readFileSync(p, 'utf8'))
  if (!Number.isFinite(nb.fadeBand)) continue
  const m = makeMembership(p)
  const want = deriveFade(nb.radius, nb.fadeBand)
  // makeMembership measures from the ORIGIN. ⚠️ Probe several bearings, not one:
  // a scene with EXCLUSION loops (staging has them) can have the +X ray land inside
  // one, where isInside is correctly false — a single probe would read that as a
  // broken ramp when it is an authored hole doing its job.
  const atBearing = (r, deg) => {
    const a = deg * Math.PI / 180
    return m.density(r * Math.cos(a), r * Math.sin(a))
  }
  const BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315]
  const at = (r) => Math.max(...BEARINGS.map(d => atBearing(r, d)))
  const mid = (want.inner + want.outer) / 2

  ok(want.outer - want.inner === nb.fadeBand,
    `${s.padEnd(26)} band width ${want.outer - want.inner} m === fadeBand ${nb.fadeBand}`)
  ok(BEARINGS.every(d => atBearing(want.outer + 1, d) === 0), `${s.padEnd(26)} past the rim → 0 on every bearing`)

  if (!m.hasPolygon) {
    console.log(`  ⚠️  ${s.padEnd(26)} NO boundary-street polygon → isInside is the whole disc, so the`)
    console.log(`      ${''.padEnd(26)} band ${want.inner}–${want.outer} is shadowed and the dissolve CANNOT run here.`)
    console.log(`      ${''.padEnd(26)} Not a failure — a standing gap. Authoring a polygon is what turns it on.`)
    ok(at(mid) === 1, `${s.padEnd(26)} …and midband reads 1 on at least one unexcluded bearing, confirming shadowing rather than a broken ramp`)
    continue
  }
  // With a polygon, outside-the-polygon-but-inside-R is where the ramp lives.
  const ramped = BEARINGS.map(d => atBearing(mid, d)).filter(v => v > 0 && v < 1)
  ok(ramped.length > 0,
    `${s.padEnd(26)} midband r=${mid} → ${ramped.length}/8 bearings ramp (e.g. ${(ramped[0] ?? 0).toFixed(3)}) — a RAMP, not 0 or 1`)
}

h('B. ⛔ the band is NOT zero-width — the regression, pinned directly')
for (const s of scenes) {
  const p = join(DATA, s, 'neighborhood_boundary.json')
  const nb = JSON.parse(readFileSync(p, 'utf8'))
  if (!Number.isFinite(nb.fadeBand)) continue
  const f = deriveFade(nb.radius, nb.fadeBand)
  const live = makeMembership(p).fade
  ok(live.inner !== live.outer,
    `${s.padEnd(26)} LIVE band ${live.inner}/${live.outer} has width — ⛔ equal means density() is an on/off cut, the ruling this module quotes against`)
  ok(live.inner === f.inner && live.outer === f.outer,
    `${s.padEnd(26)} …and it equals deriveFade(radius, fadeBand) exactly — one rule, not a second copy`)
}

h('C. ⛔ a scene with NO authored fadeBand gets NO band invented')
let sawAbsent = false
for (const s of scenes) {
  const p = join(DATA, s, 'neighborhood_boundary.json')
  const nb = JSON.parse(readFileSync(p, 'utf8'))
  if (Number.isFinite(nb.fadeBand)) continue
  sawAbsent = true
  const m = makeMembership(p)
  ok(m.hasFade === false, `${s.padEnd(26)} hasFade false — the absence is READ, not filled`)
  // ⛔ ASSERT THE BAND ITSELF, not its behaviour. On a polygon-less scene isInside
  // covers the whole disc and shadows the band, so an invented one is INVISIBLE to
  // density() — a probe-only check passes while the bug is present. Measured: that
  // is exactly what happened to the first draft of this check.
  ok(m.fade.inner === m.radius && m.fade.outer === m.radius,
    `${s.padEnd(26)} band is degenerate (${m.fade.inner}/${m.fade.outer}) — ⛔ deriving here would invent ${deriveFade(nb.radius, undefined).inner} → ${deriveFade(nb.radius, undefined).outer}, which density() CANNOT see`)
  // Just inside the radius must be fully dense; just outside, gone. A hard cut IS
  // the intended behaviour when no fade is authored.
  ok(m.density(nb.radius - 1, 0) === 1 && m.density(nb.radius + 1, 0) === 0,
    `${s.padEnd(26)} hard cut at the radius — ⛔ deriving here would invent a dissolve 0 → ${nb.radius} the author never asked for`)
}
if (!sawAbsent) console.log('  ·  every scene on disk authors a fadeBand — the absent branch is unexercised')

h('D. every consumer of makeMembership is accounted for')
// Read the importers from source so a NEW consumer cannot appear unnoticed.
const roots = ['cartograph', 'arborist', 'src']
const importers = []
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '_archive' || e.name.startsWith('.')) continue
    const f = join(d, e.name)
    if (e.isDirectory()) walk(f)
    else if (/\.(mjs|js|jsx)$/.test(e.name)) {
      const src = readFileSync(f, 'utf8')
      if (/from\s+['"].*neighborhood-membership\.mjs['"]/.test(src)) importers.push(f)
    }
  }
}
for (const r of roots) if (existsSync(r)) walk(r)
console.log(`      importers: ${importers.join(', ') || 'none'}`)
ok(importers.length >= 3,
  `${importers.length} consumer(s) read this module — ⭐ the deletion that caused the regression checked ONE`)

console.log(fails === 0 ? '\n✅ all claims hold' : `\n❌ ${fails} claim(s) FAILED`)
process.exit(fails === 0 ? 0 : 1)
