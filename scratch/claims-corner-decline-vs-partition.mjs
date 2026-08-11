#!/usr/bin/env node
/**
 * "IS THE DOMINANT CORNER DECLINE SITTING ON TILES THAT ALREADY OWN THEIR ARC?"
 *
 * `A7`: the ADA pad is declined 17–63% by town, and the leading reason on EVERY
 * town is `tile-gate:bandRem-empty` — a WHOLE-TILE condition that suppresses
 * every corner on that tile at once.
 *
 * ⭐ WHY IT MATTERS. `bandRem` is a LEFTOVER: it starts as `fullBand` and shrinks
 *   as each leg claims its sector, so the corner gets only what the legs did not
 *   take. On a PARTITIONED tile that question is already answered — the corner
 *   OWNS its arc (`cornerSpans`), the legs provably stopped at its two tangents
 *   because step-over and step-back are the same cut (A10 ③). So on a
 *   partitioned tile the gate is asking something ownership has already settled,
 *   and if it fires there it is discarding a pad the partition guarantees.
 *   ⛔ If instead the declines sit on UNPARTITIONED tiles, this is `A06`'s ground
 *   (the carve remainder, which has no partition at all) and A7's cure is a
 *   different one. **That is the whole question, and it decides the fix.**
 *
 * ⛔ `partitioned` is recomputed HERE from the frozen artifact, with the same
 *    exported `ringRunOwners`/`bandSpans` the construction uses — not read back
 *    from the thing under test. The construction contributes no opinion about
 *    which population a tile is in.
 * ⛔ No fallback: a tile whose dump cannot be classified is its own LOUD class.
 *
 * Read-only. Writes nothing.
 *
 * Usage: node scratch/claims-corner-decline-vs-partition.mjs [--scene <name>]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.env.CORNER_DUMP = '1'          // must precede the import — read at module init
const { sectionPassTile, cornerDump, ringRunOwners, bandSpans } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
if (!cornerDump?.on) {
  console.error('⛔ CORNER_DUMP is not armed — nothing measured. Refusing to print a zero.')
  process.exit(2)
}

const argScene = process.argv.includes('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : null
const STRIP_MAT = { outer: 'LU', inner: 'SW' }
const CW = 0.381

const scenes = (argScene ? [argScene] : fs.readdirSync(path.join(ROOT, 'public/baked')))
  .filter(s => fs.existsSync(path.join(ROOT, 'public/baked', s, 'shape.json')))

console.log('CORNER DECLINES vs THE PARTITION — is `bandRem-empty` firing where the corner already OWNS its arc?\n')

for (const scene of scenes) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/baked', scene, 'shape.json'), 'utf8'))
  const tiles = Array.isArray(raw) ? raw : raw.tiles
  if (!Array.isArray(tiles) || !tiles.length) { console.log(`── ${scene}: no tiles in shape.json — NOT MEASURED\n`); continue }
  const look = path.join(ROOT, 'public/looks', scene, 'design.json')
  const bc = fs.existsSync(look) ? (JSON.parse(fs.readFileSync(look, 'utf8')).blockCustoms || null) : null

  // independent classification, from the artifact
  const isPart = tiles.map(st => {
    if (!st?.iaEdge || !st?.runs) return false
    const own = ringRunOwners(st); if (!own) return false
    const sp = bandSpans(st, own); return !!(sp && sp.length)
  })

  const byReason = new Map()
  let unclassified = 0
  for (const [ti, st] of tiles.entries()) {
    cornerDump.rows.length = 0
    try { sectionPassTile(st, CW, STRIP_MAT, bc) }
    catch { unclassified += cornerDump.rows.length; cornerDump.rows.length = 0; continue }
    for (const r of cornerDump.rows) {
      const k = r.reason
      if (!byReason.has(k)) byReason.set(k, { part: 0, unpart: 0, tilesPart: new Set(), tilesUnpart: new Set() })
      const e = byReason.get(k)
      if (isPart[ti]) { e.part++; e.tilesPart.add(ti) } else { e.unpart++; e.tilesUnpart.add(ti) }
    }
    cornerDump.rows.length = 0
  }

  const nPart = isPart.filter(Boolean).length
  console.log(`── ${scene} ──  ${tiles.length} tiles · ${nPart} partitioned · ${tiles.length - nPart} not`)
  if (!nPart) console.log('   ⚠️  ZERO partitioned tiles — this scene\'s shape.json predates the stamp. NOT MEASURED, not clean.')
  const rows = [...byReason.entries()].sort((a, b) => (b[1].part + b[1].unpart) - (a[1].part + a[1].unpart))
  for (const [reason, e] of rows) {
    const tot = e.part + e.unpart
    console.log(`   ${reason.padEnd(38)} ${String(tot).padStart(5)}  │ on PARTITIONED tiles ${String(e.part).padStart(5)} (${e.tilesPart.size} tile(s))  │ on unpartitioned ${String(e.unpart).padStart(5)} (${e.tilesUnpart.size})`)
  }
  if (unclassified) console.log(`   ⛔ ${unclassified} dump row(s) UNCLASSIFIED — the tile threw. Named, never folded into a count.`)
  console.log()
}

console.log(`⭐ READ IT THIS WAY. A decline on a PARTITIONED tile is a pad thrown away on ground the
   partition already says the corner owns — the leftover model overruling the ownership model,
   and A7's cure is to stop gating there. A decline on an UNPARTITIONED tile is A06's ground
   (no partition exists to appeal to) and needs the carve remainder closed first.
   → ROADMAP A7 · A06 · A10 ③ · SECTION §6.9.4`)
