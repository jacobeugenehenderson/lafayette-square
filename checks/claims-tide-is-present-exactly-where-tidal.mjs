// claims-tide-is-present-exactly-where-tidal.mjs — a tide where the water is tidal, and nowhere else (BRIEF-tide).
//
// ⭐ THE CLAIM: a town whose slab says its water is tidal (terrain.json `water.tidal === true`) publishes a tide clock
// in its manifest (`tide`: constituents + MSL above the datum); every other town publishes none — absent, never an
// empty or zero record. Read from the slab and the manifests on disk; nothing is restated here.
// A town with no manifest is REPORTED (NOT MEASURED), never skipped.
//   node checks/claims-tide-is-present-exactly-where-tidal.mjs
import fs from 'fs'
import path from 'path'

const BAKED = 'public/baked'
let failures = 0, unmeasured = 0
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : undefined)

const towns = fs.readdirSync(BAKED).filter((t) => fs.statSync(path.join(BAKED, t)).isDirectory())
if (!towns.length) { console.log('⛔ NOT MEASURED — no slab on disk'); process.exit(2) }
for (const t of towns) {
  const water = read(path.join(BAKED, t, 'terrain.json'))?.water
  const tidal = water?.tidal === true
  const m = read(path.join(BAKED, t, 'manifest.json'))
  if (!m) { unmeasured++; console.log(`  ·  ${t.padEnd(26)} NOT MEASURED — no manifest.json (${tidal ? 'tidal' : 'not tidal'})`); continue }
  const has = m.tide !== undefined
  const whole = has && Array.isArray(m.tide?.constituents) && m.tide.constituents.length > 0 && Number.isFinite(m.tide?.mslAboveDatumM)
  if (tidal && !whole) { failures++; console.log(`  ✗ ${t.padEnd(26)} tidal (station ${water.station?.id}) but its manifest ${has ? 'carries an incomplete tide' : 'has no tide'}`) }
  else if (!tidal && has) { failures++; console.log(`  ✗ ${t.padEnd(26)} not tidal, yet its manifest carries a tide`) }
  else console.log(`  ✓ ${t.padEnd(26)} ${tidal ? `tidal — ${m.tide.constituents.length} constituents, station ${m.tide.station}` : 'not tidal — no tide'}`)
}
console.log(`\n${failures ? `❌ ${failures} FAILURE(S)` : '✅ PASS'}${unmeasured ? ` · ${unmeasured} town(s) without a manifest reported` : ''}`)
process.exit(failures ? 1 : 0)
