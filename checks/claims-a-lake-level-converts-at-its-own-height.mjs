#!/usr/bin/env node
// CLAIM — A LAKE'S LEVEL IS CONVERTED TO NAVD88 AT ITS OWN HEIGHT, NEVER BY AN OFFSET ASKED AT HEIGHT 0.
//
// IGLD85 is a dynamic height: its difference from NAVD88 grows with height. At Huron (Lake Erie) VDatum gives −0.004 m at
// height 0 and +0.067 m at 174.354 m (Swash, 2026-10-25), and the old record (`igld85InNavd88M`, asked at s_z=0) placed the
// lake 7 cm low, which is a quarter of the shore band the coast is traced through. ASSERTS:
//   1. fetch-water-datums#igld85ToNavd88Points asks VDatum IGLD85 → NAVD88 AT EACH HEIGHT it is given (s_z = the height,
//      source frame IGLD85), and records what it answered: on a fake VDatum whose offset grows with height;
//   2. waterDatums#igld85ToNavd88 interpolates between the recorded heights, REFUSES outside them (Zob: never
//      extrapolate), and REFUSES a record with only the old single offset (never falls back to it);
//   3. waterDatums#waterRecord places a lake level through that conversion;
//   4. every lake town's raw/water-datums.json carries the conversion at its heights (a town without it is NAMED red).
// MUTANTS (each RED): s_z=0 in the VDatum call · the span test dropped · the reader falls back to igld85InNavd88M · waterRecord adds the old offset.
//
//   node checks/claims-a-lake-level-converts-at-its-own-height.mjs
import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ROOT } from './_scenes.mjs'
import { igld85ToNavd88Points } from '../cartograph/fetch-water-datums.mjs'
import { igld85ToNavd88, waterRecord } from '../cartograph/waterDatums.mjs'

const bad = []
const say = (ok, what) => { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad.push(what) }
const offsetAt = (h) => -0.004 + 0.071 * h / 174.354                      // a fake datum whose gap grows with height
const asked = []
const fetcher = async (url) => {
  const q = new URL(url).searchParams
  asked.push(q.get('s_z'))
  if (q.get('s_v_frame') !== 'IGLD85' || q.get('t_v_frame') !== 'NAVD88') return { json: async () => ({ errorCode: 400, message: 'wrong frames' }) }
  const h = +q.get('s_z')
  return { json: async () => ({ t_z: h + offsetAt(h) }) }
}

console.log('── 1. the conversion is asked at the lake\'s heights')
const H = [173.5, 174.354, 175.155]
const P = await igld85ToNavd88Points(-82.56, 41.39, H, { fetcher })
say(asked.map(Number).join() === H.join(), `VDatum asked at s_z = ${asked.join(', ')}`)
say(P.every(([h, n]) => Math.abs(n - (h + offsetAt(h))) < 1e-4), `recorded what it answered (${P.map(([h, n]) => `${h}→${n}`).join(', ')})`)

console.log('── 2. the reader interpolates, and refuses the old offset')
const conv = igld85ToNavd88({ igld85ToNavd88: { points: P } }, 'fixture')
say(Math.abs(conv(174.354) - (174.354 + offsetAt(174.354))) < 1e-4, `174.354 m IGLD85 → ${conv(174.354).toFixed(4)} m NAVD88`)
let threw = false
try { igld85ToNavd88({ igld85InNavd88M: -0.004 }, 'fixture') } catch { threw = true }
say(threw, 'a record with only the offset asked at height 0 REFUSES')
threw = false
try { conv(H[0] - 0.5) } catch { threw = true }
say(threw, `a height outside the recorded span (${H[0] - 0.5} m, below ${H[0]}) REFUSES, never extrapolated`)

console.log('── 3. the lake level is placed through it')
{
  const d = mkdtempSync(join(tmpdir(), 'lakeconv-')); mkdirSync(join(d, 'raw'))
  writeFileSync(join(d, 'raw', 'water-datums.json'), JSON.stringify({ kind: 'lake', igld85InNavd88M: 0, igld85ToNavd88: { points: P },
    station: { id: 'x', name: 'x' }, source: 'fixture', fetchedOn: 'now', levels: { mean: { igld85M: 174.354, what: 'mean' } } }))
  const R = waterRecord({ mapDir: d, scene: 'fixture', auth: { lakeLevel: { value: 'mean', from: 'fixture' } }, wgs84ToLocal: (a, b) => [a, b], zero: 0 })
  const v = R.datums.mean[0]
  say(Math.abs(v - (174.354 + offsetAt(174.354))) < 1e-3, `waterRecord places the mean at ${v} m NAVD88 (not ${174.354} + an old offset)`)
  rmSync(d, { recursive: true, force: true })
}

console.log('── 4. every lake town carries the conversion')
let lakes = 0
for (const t of readdirSync(join(ROOT, 'cartograph/data'))) {
  const p = join(ROOT, 'cartograph/data', t, 'raw/water-datums.json')
  if (!existsSync(p)) continue
  const D = JSON.parse(readFileSync(p, 'utf8'))
  if (D.kind !== 'lake') continue
  lakes++
  const pts = D.igld85ToNavd88?.points
  say(Array.isArray(pts) && pts.length >= 2, `${t}: ${pts ? pts.map(([h, n]) => `${h}→${n}`).join(', ') : 'NO conversion at its heights (▶ node cartograph/fetch-water-datums.mjs --scene=' + t + ')'}`)
}
if (!lakes) console.log('  (no lake town on this machine)')
if (bad.length) { console.log(`\n⛔ ${bad.length} claim(s) fail.`); process.exit(1) }
console.log('\n✅ A lake level is converted at its own height.')
