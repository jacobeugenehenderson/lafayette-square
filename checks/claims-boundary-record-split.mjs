#!/usr/bin/env node
/**
 * CLAIM (the CLASS, not one scene): `neighborhood_boundary.json` splits into three
 * records and recomposes BYTE-IDENTICALLY, and an AUTHORED fade set survives a
 * commit / rescope that would previously have regenerated it from constants.
 *
 *   node scratch/claims-boundary-record-split.mjs
 *
 * The defect (`EXTENT-DESIGN §5.1`, D4): the write routes CONSTRUCTED A FRESH
 * OBJECT, so `innerFadeOffset` / `fade` / `streetFade` were rebuilt from hardcoded
 * constants every time, with no preserve branch anywhere. Lafayette Square is the
 * ONLY scene carrying an authored fade set — every other v2 scene is exactly the
 * formula — so no scene but the production one reveals it, and LS has never been
 * poured. First touch of the Extent tool, four authored values gone, silently.
 *
 * ⭐ THE GATE MUST DISTINGUISH AUTHORED FROM GENERATED, which is why the controls
 * matter as much as LS: `lafayette-square-staging` is radius 850 → streetFade.outer
 * 1010 = 850+160, machine-generated to the metre. A gate that preserves LS's 1000
 * AND leaves staging byte-identical has proven it can tell them apart.
 *
 * ⛔ NO LIVE SCENE IS WRITTEN. Every simulation runs on a parsed FIXTURE copy of an
 * artifact; LS in particular is production and is ruled conformed LAST.
 *
 * ⭐ READS THE SOURCE. `generatedFade` is imported from the module under test, not
 * restated, so the "what the constructor would have produced" arm cannot drift from
 * the formula it is measuring against (CLAUDE.md §PRUNE #1).
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  splitBoundary, composeBoundary, makeDiscRecord, generatedFade, sameFade, classifyFade,
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

// ── B. the census the gate depends on — who is authored, who is generated ────
console.log('\n── B. fade provenance, DERIVED against the live formula ─────────')
const prov = {}
for (const s of scenes) {
  const nb = load(s)
  const { kind } = classifyFade(nb, s)
  prov[s] = kind
  const sf = nb.streetFade ? `${nb.streetFade.inner}/${nb.streetFade.outer}` : '—'
  console.log(`   ${s.padEnd(26)} R=${String(nb.radius).padStart(5)}  ifo=${String(nb.innerFadeOffset ?? '—').padStart(4)}  streetFade=${sf.padEnd(11)} → ${kind.toUpperCase()}`)
}
const authored = scenes.filter(s => prov[s] === 'authored')
ok(authored.length >= 1, `at least one AUTHORED scene exists (else the gate is theatre) — ${authored.join(', ') || 'NONE'}`)
ok(scenes.some(s => prov[s] === 'generated'), 'at least one GENERATED control exists')

// ── C. THE LS SURVIVAL TEST, with the mutation check that gives it teeth ─────
console.log('\n── C. LS survives a simulated rescope / commit ──────────────────')
const LS = 'lafayette-square'
if (!scenes.includes(LS)) { ok(false, 'lafayette-square artifact is missing'); }
else {
  const nb = load(LS)                       // FIXTURE: parsed copy, never written back
  const recs = splitBoundary(nb, LS)

  // ⭐ MUTATION CHECK FIRST. If the constructor's formula already produced LS's
  // values, this fixture is not exercising anything and every assertion below is
  // theatre. Prove the divergence before trusting the survival.
  const wouldHaveBeen = generatedFade(nb.radius)
  ok(!sameFade(recs.disc.fade, wouldHaveBeen),
    `fixture is live: old constructor would write ifo=${wouldHaveBeen.innerFadeOffset}, ` +
    `streetFade ${wouldHaveBeen.streetFade.inner}/${wouldHaveBeen.streetFade.outer} — ` +
    `artifact has ${recs.disc.fade.innerFadeOffset}, ` +
    `${recs.disc.fade.streetFade.inner}/${recs.disc.fade.streetFade.outer}`)
  ok(recs.disc.fadeOrigin === 'authored', 'LS fade set classifies as AUTHORED')

  // rescope: no `center` posted (ExtentApp never sends one) → prev.center preserved.
  const rescoped = makeDiscRecord({ radius: nb.radius, center: recs.disc.center, prior: recs.disc, where: LS })
  // commit-extent: same disc construction, center from the posted lat/lon.
  const committed = makeDiscRecord({ radius: nb.radius, center: recs.disc.center, prior: recs.disc, where: LS })

  for (const [label, d] of [['rescope', rescoped], ['commit-extent', committed]]) {
    ok(d.fade.innerFadeOffset === 134, `${label}: innerFadeOffset 134 survives (got ${d.fade.innerFadeOffset})`)
    ok(d.fade.streetFade.outer === 1000, `${label}: streetFade.outer 1000 survives (got ${d.fade.streetFade.outer})`)
    ok(d.fade.streetFade.inner === 800, `${label}: streetFade.inner 800 survives (got ${d.fade.streetFade.inner})`)
    ok(d.fade.fade.inner === 758, `${label}: fade.inner 758 survives (got ${d.fade.fade.inner})`)
    ok(d.fade.fade.outer === 892, `${label}: fade.outer 892 survives (got ${d.fade.fade.outer})`)
    ok(JSON.stringify(d.center) === JSON.stringify([-15, -15]), `${label}: center [-15,-15] survives (got ${JSON.stringify(d.center)})`)
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

  // ── D. derived: keepR cannot move ──────────────────────────────────────────
  // pipeline.js floors the content clip at the disc radius. Read the shape from
  // the source rather than restating it, so this cannot vouch for a moved line.
  const pipe = readFileSync(join(ROOT, 'cartograph', 'pipeline.js'), 'utf8')
  const keepLine = pipe.split('\n').find(l => /const\s+keepR\s*=/.test(l))
  ok(!!keepLine, 'pipeline.js still binds `const keepR =` (else re-point this check)')
  if (keepLine) console.log(`      ${keepLine.trim()}`)
  const keepR = Math.max(rescoped.fade.streetFade.outer, rescoped.radius) + 30
  ok(keepR === 1030, `keepR stays 1030 after the simulated rescope (got ${keepR})`)
}

// ── E. the controls — every generated scene is byte-identical through a rescope ─
console.log('\n── E. generated scenes are untouched (the authored/generated gate) ──')
for (const s of scenes) {
  if (prov[s] !== 'generated') { console.log(`   ·  ${s.padEnd(26)} skipped (${prov[s]})`); continue }
  const nb = load(s)
  const recs = splitBoundary(nb, s)
  const d = makeDiscRecord({ radius: nb.radius, center: recs.disc.center, prior: recs.disc, where: s })
  const out = composeBoundary({ ...recs, disc: d })
  ok(JSON.stringify(out, null, 2) === JSON.stringify(nb, null, 2), `${s.padEnd(26)} same-radius rescope is byte-identical`)
}

// ── F. FAIL LOUDLY — no defaults, no silent reconstruction ───────────────────
console.log('\n── F. the failure modes name the field ──────────────────────────')
const throws = (fn, needle, what) => {
  try { fn(); ok(false, `${what} — did NOT throw`) }
  catch (e) { ok(e.message.includes(needle), `${what} — throws naming "${needle}": ${e.message.slice(0, 90)}…`) }
}
const base = load(scenes.find(s => prov[s] === 'generated'))
throws(() => splitBoundary({ ...base, streetFade: undefined }, 'fixture'), 'streetFade',
  'a PARTIAL fade set (streetFade removed)')
throws(() => splitBoundary({ ...base, radius: undefined }, 'fixture'), 'radius',
  'a boundary with no radius')
throws(() => splitBoundary({ ...base, boundary: undefined }, 'fixture'), 'boundary ring',
  'a boundary with no ring')
throws(() => splitBoundary({ ...base, fade: { inner: 1 } }, 'fixture'), 'fade',
  'a fade band missing `outer`')

// ⛔ authored fade + a radius change is UNKNOWABLE — it must stop, not guess.
if (scenes.includes(LS)) {
  const recs = splitBoundary(load(LS), LS)
  throws(() => makeDiscRecord({ radius: recs.disc.radius + 50, center: recs.disc.center, prior: recs.disc, where: LS }),
    'AUTHORED fade set', 'an AUTHORED fade set with a CHANGED radius')
  // …but the same change on a GENERATED scene is ordinary and must still work.
  const g = splitBoundary(load(scenes.find(s => prov[s] === 'generated')), 'ctl')
  const moved = makeDiscRecord({ radius: g.disc.radius + 50, center: g.disc.center, prior: g.disc, where: 'ctl' })
  ok(sameFade(moved.fade, generatedFade(g.disc.radius + 50)),
    'a GENERATED scene still regenerates its fade on a radius change (no new refusal)')
}

// ── G. the absent fade set stays absent and legal (toy) ──────────────────────
console.log('\n── G. an ABSENT fade set is a value, not a hole ─────────────────')
const absent = scenes.filter(s => prov[s] === 'absent')
if (!absent.length) console.log('   ·  no scene currently carries an absent fade set')
for (const s of absent) {
  const nb = load(s)
  ok(splitBoundary(nb, s).disc.fade === null, `${s}: absence survives the reader without throwing`)
  ok(JSON.stringify(composeBoundary(splitBoundary(nb, s)), null, 2) === JSON.stringify(nb, null, 2),
    `${s}: absence survives the round-trip (no fade manufactured)`)
}

console.log(`\n${fail === 0 ? '✅ PASS' : `❌ ${fail} FAILURE(S)`}`)
process.exit(fail === 0 ? 0 : 1)
