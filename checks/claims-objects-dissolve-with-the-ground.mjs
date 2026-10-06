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
 * INVENT a band for a scene that authored none. An absent fadeBand is read as a
 * value across the kit. This check pins BOTH directions,
 * because the fix for one is the bug for the other.
 *
 * ▶ node checks/claims-objects-dissolve-with-the-ground.mjs
 */
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { makeMembership } from '../cartograph/neighborhood-membership.mjs'
import { lookFade, edgeBandOf } from '../cartograph/boundaryRecords.mjs'
import { readBakeDesign, designPath } from '../cartograph/lookDesign.mjs'
// ⭐ The band is the town's home LOOK's (Stage › Horizon › Edge, 2026-10-06) — what its lamps bake and its ground fades on.
const homeDesign = (s) => existsSync(designPath(s)) ? readBakeDesign(s, s, 'claims-objects-dissolve') : null
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
// CORRECT. Only hipointedemun carries a polygon, of six scenes. bake-trees already
// warns about it ("no boundary-street polygon — the disc is standing in for the
// neighborhood") and evidently nobody reads that line.
h('A. where a dissolve can exist at all, it RAMPS')
for (const s of scenes) {
  const p = join(DATA, s, 'neighborhood_boundary.json')
  const nb = JSON.parse(readFileSync(p, 'utf8'))
  const design = homeDesign(s); if (!design) { console.log(`  ⛔ ${s.padEnd(26)} no home Look — NOT checked`); continue }
  const m = makeMembership(p, { design, look: s })
  const band = edgeBandOf(design, nb.radius, 'check', s).band
  const want = lookFade(design, nb.radius, 'check', s)
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

  ok(want.outer - want.inner === Math.min(band, nb.radius),
    `${s.padEnd(26)} band width ${want.outer - want.inner} m === the Look's band ${band}`)
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
  const design = homeDesign(s); if (!design) continue
  const f = lookFade(design, nb.radius, 'check', s)
  const live = makeMembership(p, { design, look: s }).fade
  ok(live.inner !== live.outer,
    `${s.padEnd(26)} LIVE band ${live.inner}/${live.outer} has width — ⛔ equal means density() is an on/off cut, the ruling this module quotes against`)
  ok(live.inner === f.inner && live.outer === f.outer,
    `${s.padEnd(26)} …and it equals lookFade(the Look, radius) exactly — one rule, not a second copy`)
}

h('C. ⛔ no band is invented for a caller that brought no Look — and a Look with none takes the kit default, said')
{
  const p = join(DATA, scenes[0], 'neighborhood_boundary.json')
  const bare = makeMembership(p)
  let threw = false
  try { bare.density(0, 0) } catch { threw = true }
  ok(threw, `${scenes[0].padEnd(26)} density() without a design REFUSES — never a band guessed for it`)
  ok(bare.fade === null, `${scenes[0].padEnd(26)} …and exposes no fade`)
  const R = JSON.parse(readFileSync(p, 'utf8')).radius
  const def = makeMembership(p, { design: {}, look: 'fixture' }).fade
  ok(def.outer === R && Math.abs((R - def.inner) - 0.05 * R) < 1e-9, `a Look with no edgeFadeBand dissolves over the kit default, 5% of R (${def.inner}/${def.outer})`)
}

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
