#!/usr/bin/env node
/**
 * claims-identity-colours-obey-the-policy.mjs — DOES EVERY COLOUR A TOWN SETS MEET THE CONTRAST POLICY, BY EVERY PATH?
 *
 * The policy (src/lib/colourPolicy.js; Jacob via Warden, 2026-09-28): what sits on the player's grounds is HARD — the
 * accent ≥ 7:1, every category's chip ≥ 3:1 — and cannot be saved otherwise; the neon tube and lit tint are the map's;
 * meaning distance is advisory. Two paths set a colour, and both must refuse a hard failure:
 *   · the PANEL — the store's setIdentityChannel and setCategoryNeon call assertHardPolicy (read off the store's code);
 *     the Identity panel reads accentPolicy / neonPolicy to offer the nearest passing colour;
 *   · the BAKE — cartograph/bake-scene.js calls assertHardPolicy, so a hand-edited design.json fails the bake.
 * And the data: every live Look's authored accent and category colours pass today (a retired scene, by its own
 * RETIRED.md, is not a town). And the policy itself: it refuses a failing accent, and its nearest passing colour passes
 * at the same hue.
 * ⚠️ Measured 2026-09-28: a chip is drawn at HSL lightness 0.64 whatever its neon, so on the player's near-black grounds
 *    it cannot fall under 3:1 — the neon half of the hard tier is vacuous today, and this check says so.
 * ⭐ MUTATION-TESTED EVERY RUN: a bake or a store setter without the call must fail; a failing accent must be refused.
 *
 *   node checks/claims-identity-colours-obey-the-policy.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = await import(join(ROOT, 'src/lib/colourPolicy.js'))
const { rgbToOklab, oklabToOklch, hexToRgb } = await import(join(ROOT, 'src/lib/colourMath.js'))
const { CONTRAST } = await import(join(ROOT, 'src/tokens/playerChrome.js'))
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const fails = []

// 1. The data: every live Look.
const index = JSON.parse(read('public/looks/index.json')).looks
for (const l of index) {
  const scene = l.scene ?? l.id
  if (existsSync(join(ROOT, 'cartograph/data', scene, 'RETIRED.md'))) { console.log(`   ${l.id}: retired (its own RETIRED.md), not a town`); continue }
  const p = `public/looks/${l.id}/design.json`
  if (!existsSync(join(ROOT, p))) continue
  const d = JSON.parse(read(p))
  try { P.assertHardPolicy({ identity: d.identity || {}, materialColors: d.materialColors || {} }, p); console.log(`   ${l.id}: passes${d.identity?.accent ? ` (accent ${d.identity.accent} ${P.accentPolicy(d.identity.accent).contrast}:1)` : ''}`) }
  catch (e) { fails.push(e.message) }
}

// 2. The paths call the policy.
const bakeCalls = (src) => /assertHardPolicy\(/.test(code(src))
const storeCalls = (src) => {
  const c = code(src), out = []
  for (const setter of ['setIdentityChannel', 'setCategoryNeon']) {
    const body = c.slice(c.indexOf(`${setter}:`), c.indexOf('\n  },', c.indexOf(`${setter}:`)))
    if (!body || !/assertHardPolicy\(/.test(body)) out.push(`the store's ${setter} does not call assertHardPolicy — the panel could save a colour the policy refuses`)
  }
  return out
}
const bake = read('cartograph/bake-scene.js'), store = read('src/cartograph/stores/useCartographStore.js'), panel = read('src/cartograph/IdentityPanel.jsx')
if (!bakeCalls(bake)) fails.push('cartograph/bake-scene.js does not call assertHardPolicy — a hand-edited design.json would bake')
fails.push(...storeCalls(store))
if (!/accentPolicy|neonPolicy/.test(code(panel))) fails.push('IdentityPanel.jsx reads no colour policy — it cannot offer the nearest passing colour')

// 3. The policy refuses, and its nearest colour passes at the same hue.
let refused = false
try { P.assertHardPolicy({ identity: { accent: '#555555' } }, 'probe') } catch { refused = true }
if (!refused) fails.push('assertHardPolicy accepted an accent at 2.5:1')
const hue = (hex) => oklabToOklch(rgbToOklab(hexToRgb(hex)))[2]
for (const probe of ['#806020', '#3A3A8A', '#8B1E1E', '#1E6B3A']) {
  const a = P.accentPolicy(probe)
  if (a.ok) continue
  if (!a.nearest) { fails.push(`${probe}: no nearest passing accent offered`); continue }
  if (P.groundContrast(a.nearest) < CONTRAST.text) fails.push(`${probe} → ${a.nearest}: the "nearest passing" accent does not pass`)
  const dh = Math.abs(((hue(a.nearest) - hue(probe) + 540) % 360) - 180)
  if (dh > 3) fails.push(`${probe} → ${a.nearest}: the nearest passing accent moved hue by ${dh.toFixed(1)}°`)
}
console.log(`   chips: every category's chip is drawn at HSL L 0.64 — the lowest a chip can measure on the grounds is ${Math.min(...['#000000', '#1A44FF', '#FF0000', '#00FF00', '#6E1AFF'].map((h) => P.neonPolicy(h).detailContrast))}:1, so today the 3:1 chip floor cannot fail`)

// Mutations.
const m1 = !bakeCalls(bake.replace(/assertHardPolicy\(/g, 'noPolicy('))
const m2 = storeCalls(store.replace(/assertHardPolicy\(/g, 'noPolicy(')).length === 2
console.log(`   mutation (bake without the policy) ${m1 ? 'caught ✓' : 'NOT caught'} · (store setters without it) ${m2 ? 'caught ✓' : 'NOT caught'}`)
if (!m1) fails.push('MUTATION NOT CAUGHT: a bake without assertHardPolicy passes')
if (!m2) fails.push('MUTATION NOT CAUGHT: store setters without assertHardPolicy pass')

for (const f of fails) console.log(`⛔ ${f}`)
console.log(fails.length ? `\n⛔ FAIL — ${fails.length}` : '\n✅ PASS — every colour a town sets meets the hard contrast tier, by the panel and by the bake')
process.exit(fails.length ? 1 : 0)
