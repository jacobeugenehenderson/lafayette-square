#!/usr/bin/env node
/**
 * claims-the-ground-has-no-cross-polygon-t-junctions
 *
 * ⛔ THE CLASS: a vertex lying in the middle of a neighbour's edge. The runtime lifts
 * every ground vertex by the DEM; the neighbour's edge chords straight past it, and
 * the difference opens as a crack you can see foundations through — invisible from
 * overhead, glaring at street level. The ground was conforming only WITHIN a polygon,
 * and the flattened ground's shared edges run almost entirely BETWEEN groups (land
 * use ↔ sidewalk ↔ curb ↔ asphalt). ROADMAP H-21.
 *
 * ⭐ A crack is a BOUNDARY vertex lying on a BOUNDARY edge of the UNION of the groups
 * the bake stamps `partition: true` — two unshared chains running along each other.
 * The detector is `findTJunctions` in cartograph/groundConformity.js, the same one the
 * bake refuses to write past. It reads ground.bin, so it covers towns nobody opened.
 *
 * READS THE ARTIFACTS — the partition comes from the manifest's own stamp, the
 * exaggeration from the slab's scene.json over terrainCommon's neutral default.
 * ⛔ An UNSTAMPED slab (baked before 2026-09-23) FAILS: nothing can say which groups
 * the guarantee spans. Its count is measured over every group and labelled so.
 *
 * Run: node checks/claims-the-ground-has-no-cross-polygon-t-junctions.mjs
 *      node checks/claims-the-ground-has-no-cross-polygon-t-junctions.mjs --dir=<slab dir>
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { findTJunctions, ON_EDGE_M } from '../cartograph/groundConformity.js'
import { makeElevationSampler, DEFAULT_V_EXAG } from '../src/lib/terrainCommon.js'

const ROOT = new URL('..', import.meta.url).pathname
const BAKED = join(ROOT, 'public/baked')
const VISIBLE_M = 0.05   // report how many cracks open wider than this, at the town's exag

const dirArg = process.argv.find(a => a.startsWith('--dir='))?.slice(6)
const dirs = dirArg ? [dirArg]
  : readdirSync(BAKED).map(l => join(BAKED, l)).filter(d => existsSync(join(d, 'ground.json')))

function readJSON(p) { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }

let fail = 0, ok = 0, phantom = 0
for (const dir of dirs) {
  const look = basename(dir)
  if (!dirArg && !existsSync(join(ROOT, 'public/looks', look))) {
    console.warn(`⚠️  ${look}: baked output with NO public/looks/${look}/ — phantom, nothing reads it. Not checked.`)
    phantom++
    continue
  }
  const m = readJSON(join(dir, 'ground.json'))
  const bin = readFileSync(join(dir, m.bin || 'ground.bin'))
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
  const stamped = m.groups.every(g => typeof g.partition === 'boolean')
  const groups = m.groups
    .filter(g => !stamped || g.partition)
    .map(g => ({
      id: g.id,
      positions: new Float32Array(ab, g.vertexByteOffset, g.vertexCount * 3),
      indices: new Uint32Array(ab, g.indexByteOffset, g.indexCount),
    }))

  // The crack's height is the terrain's departure from the straight edge at the vertex.
  let lift = null, exag = null
  const tj = readJSON(join(dir, 'terrain.json'))
  if (tj && existsSync(join(dir, 'terrain.bin'))) {
    const tb = readFileSync(join(dir, 'terrain.bin'))
    const data = new Float32Array(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength))
    exag = readJSON(join(dir, 'scene.json'))?.terrainExag ?? DEFAULT_V_EXAG
    lift = makeElevationSampler({ ...tj, data }, exag).getElevation
  }

  const r = findTJunctions(groups, lift)
  const label = stamped ? `${groups.length} partition groups` : `ALL ${groups.length} groups (unstamped — partition unknown)`
  if (r.total === 0 && stamped) {
    console.log(`  ok    ${look}  0 T-junctions across ${label}`)
    ok++
    continue
  }
  fail++
  console.error(`⛔ ${look}: ${r.total} T-junctions across ${label} — ${r.within} within a group, ${r.cross} between groups`)
  if (!stamped) console.error(`   unstamped: baked before the partition was recorded; the guarantee cannot be proven on it.`)
  if (lift && r.found.length) {
    const cr = r.found.map(f => f.crack).sort((a, b) => a - b)
    const q = p => cr[Math.min(cr.length - 1, Math.floor(p * cr.length))].toFixed(3)
    const w = r.found.reduce((a, f) => (f.crack > a.crack ? f : a))
    console.error(`   crack height at exag ${exag} (m): median ${q(0.5)} · p95 ${q(0.95)} · max ${q(1)} · ${cr.filter(c => c > VISIBLE_M).length} over ${VISIBLE_M} m`)
    console.error(`   worst: ${w.crack.toFixed(3)} m at (${w.x.toFixed(2)}, ${w.z.toFixed(2)}) — a ${w.vertexGroup} vertex on a ${w.edgeLen.toFixed(1)} m ${w.edgeGroup} edge`)
  } else if (r.found.length) {
    const f = r.found[0]
    console.error(`   first: (${f.x.toFixed(2)}, ${f.z.toFixed(2)}) — a ${f.vertexGroup} vertex on a ${f.edgeLen.toFixed(1)} m ${f.edgeGroup} edge (no terrain on this slab)`)
  }
  console.error(`   top pairs (vertex → edge): ${[...r.pairs].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  console.error(`   ▶ node cartograph/bake-ground.js --scene=${look} --look=${look}`)
}

console.log(`\n${ok} crack-free · ${fail} failing · ${phantom} phantom  (on-edge tolerance ${ON_EDGE_M * 1000} mm)`)
if (fail) { console.error('⛔ FAIL'); process.exit(1) }
process.exit(0)
