#!/usr/bin/env node
/**
 * "DOES A LIVE DOT — THE VISITOR, A COURIER — STAND WHERE IT IS, IN ANY TOWN, DRAWN BY THE TOWN?"
 *
 * WHY (Warden, 2026-09-28; Jacob: the visitor's live dot must come to the Ward, "knowing we'll also have courier dots
 * eventually"). The old player drew the visitor (UserDot) and couriers (CourierDots) as one-offs; the courier layer
 * projected with the BOOT town's geography and stood every dot at a fixed 35 m (a Class-D constant: afloat on flat
 * Lafayette Square, buried on a hill). ONE live-marker layer in <Town>: the app supplies positions (it owns
 * geolocation and permission), the town projects, judges "inside" by its own disc, and draws each kind's look.
 *
 * Asserts:
 *   · src/lib/movers.js#placeMovers (pure): projects lat/lon through the TOWN's place (townPlace's formula), judges
 *     inside by the town's disc, reports every mover (none vanish); with no disc every mover is outside, said;
 *     it THROWS on an unknown kind, on `heading`/`accuracy` (not designed — nothing would draw them), on a courier
 *     without a boolean `active`, on a missing id or a non-finite lat/lon, and on a duplicate id;
 *   · <Town> takes `movers` + `onMovers` and mounts src/components/Movers.jsx; the layer reads the place through
 *     townPlace and never INSTANCE; each dot rides the drawn ground (elevation × exaggeration), no fixed height;
 *   · the kinds are exactly 'you' (UserDot's look) and 'courier' (CourierDots' look), and the old player's two
 *     components say they are frozen until the cutover.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-a-mover-stands-where-it-is.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const fails = []
const eq = (what, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`) }
const throws = (what, fn, re) => { try { fn(); fails.push(`${what}: did not throw`) } catch (e) { if (re && !re.test(e.message)) fails.push(`${what}: threw "${e.message}" — it should name ${re}`) } }
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null)

// ── the pure layer ───────────────────────────────────────────────────────────────────
let lib = null
try { lib = await import('../src/lib/movers.js') } catch (e) { fails.push(`src/lib/movers.js cannot be imported: ${e.message}`) }
if (lib && typeof lib.placeMovers !== 'function') { fails.push('src/lib/movers.js exports no placeMovers'); lib = null }
if (lib) {
  const place = { lat: 42.05, lon: -70.19, latToMeters: 111120, lonToMeters: 82660 }
  const disc = { center: [0, 0], radius: 1000 }
  const r = lib.placeMovers([
    { id: 'me', kind: 'you', lat: 42.051, lon: -70.189 },
    { id: 'c1', kind: 'courier', lat: 42.2, lon: -70.19, active: true },
  ], place, disc)
  const me = r.find((m) => m.id === 'me'), c1 = r.find((m) => m.id === 'c1')
  eq('placeMovers keeps every mover', r.map((m) => m.id), ['me', 'c1'])
  if (me) {
    eq('x = (lon − place.lon) · lonToMeters', Math.round(me.x * 100) / 100, Math.round((-70.189 - -70.19) * 82660 * 100) / 100)
    eq('z = (place.lat − lat) · latToMeters', Math.round(me.z * 100) / 100, Math.round((42.05 - 42.051) * 111120 * 100) / 100)
    eq('inside the disc', me.inside, true)
  }
  if (c1) { eq('outside the disc', c1.inside, false); eq('a courier keeps its state', c1.active, true) }
  const none = lib.placeMovers([{ id: 'me', kind: 'you', lat: 42.051, lon: -70.189 }], place, null)
  eq('no disc → outside', none[0]?.inside, false)
  throws('unknown kind', () => lib.placeMovers([{ id: 'x', kind: 'drone', lat: 42, lon: -70 }], place, disc), /drone/)
  throws('heading', () => lib.placeMovers([{ id: 'x', kind: 'you', lat: 42, lon: -70, heading: 90 }], place, disc), /heading/)
  throws('accuracy', () => lib.placeMovers([{ id: 'x', kind: 'you', lat: 42, lon: -70, accuracy: 12 }], place, disc), /accuracy/)
  throws('courier without active', () => lib.placeMovers([{ id: 'x', kind: 'courier', lat: 42, lon: -70 }], place, disc), /active/)
  throws('no id', () => lib.placeMovers([{ kind: 'you', lat: 42, lon: -70 }], place, disc), /id/)
  throws('bad lat', () => lib.placeMovers([{ id: 'x', kind: 'you', lat: NaN, lon: -70 }], place, disc), /lat/)
  throws('duplicate id', () => lib.placeMovers([{ id: 'x', kind: 'you', lat: 42, lon: -70 }, { id: 'x', kind: 'you', lat: 42, lon: -70 }], place, disc), /x/)
  eq('the kinds', Object.keys(lib.MOVER_KINDS || {}).sort(), ['courier', 'you'])
}

// ── the wiring ───────────────────────────────────────────────────────────────────────
const town = code(read('src/components/Town.jsx') || '')
if (!/\bmovers\b/.test(town) || !/\bonMovers\b/.test(town)) fails.push('Town.jsx takes no `movers` / `onMovers`')
if (!/<Movers\b/.test(town) || !/from '\.\/Movers\.jsx'/.test(town)) fails.push('Town.jsx does not mount <Movers>')
const layer = read('src/components/Movers.jsx')
if (!layer) fails.push('src/components/Movers.jsx does not exist')
else {
  const c = code(layer)
  if (/\bINSTANCE\b/.test(c)) fails.push('Movers.jsx reads INSTANCE — the town drawn is townPlace(), never the boot town')
  if (!/townPlace/.test(c)) fails.push('Movers.jsx does not project through townPlace')
  if (!/getElevationRaw\([^)]*\)\s*\*\s*terrainExag/.test(c)) fails.push('Movers.jsx does not seat its dots on the drawn ground (elevation × exaggeration)')
  // The old courier line was `position={[x, 35, z]}`: a world x, then a literal height (a local [0, 0, -0.01] is fine).
  if (/position=\{\[\s*[A-Za-z_][\w.]*\s*,\s*\d+(\.\d+)?\s*,/.test(c)) fails.push('Movers.jsx stands a dot at a fixed height')
}
for (const f of ['src/components/UserDot.jsx', 'src/components/CourierDots.jsx']) {
  if (!/frozen/i.test(read(f) || '') || !/cutover/i.test(read(f) || '')) fails.push(`${f} does not say it is the old player's, frozen until the cutover (Town's layer is src/components/Movers.jsx)`)
}

if (fails.length) { console.error(`⛔ ${fails.length} failure(s):`); for (const f of fails) console.error('   ' + f); process.exit(1) }
console.log('✅ a live dot stands where it is, in any town, drawn by the town')
