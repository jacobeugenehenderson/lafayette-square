#!/usr/bin/env node
/**
 * APRON FORENSIC — SPEC vs LIVE GEOMETRY.
 *
 * The apron SPEC is on disk (src/data/ribbons.json → junctionMap.nodes[].apron).
 * The apron GEOMETRY is computed live in tileGround.js and never serialized in
 * constructed form. This probe runs the REAL buildTileGround with the scene's
 * authored blockCustoms (Rule 1) and captures the [E3.2] census line, so the
 * spec count and the geometry count can be compared side by side.
 *
 * Usage: node scratch/apron-live-census.mjs [--scene lafayette-square]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTileGround } from '../src/lib/tileGround.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scene = process.argv.includes('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : 'lafayette-square'
const ribbonsPath = scene === 'lafayette-square'
  ? path.join(ROOT, 'src/data/ribbons.json')
  : path.join(ROOT, 'cartograph/data', scene, 'clean/ribbons.json')
const ribbons = JSON.parse(fs.readFileSync(ribbonsPath, 'utf8'))
const designP = path.join(ROOT, 'public/looks', scene, 'design.json')
const design = fs.existsSync(designP) ? JSON.parse(fs.readFileSync(designP, 'utf8')) : {}

// ── SPEC side (artifact) ────────────────────────────────────────────────
const nodes = ribbons.junctionMap?.nodes || []
const byLegs = new Map()
let specApron = 0, specCont = 0, specTaper = 0, specAny = 0
for (const n of nodes) {
  const L = (n.legs || []).length
  const rec = byLegs.get(L) || { n: 0, apron: 0, cont: 0, taper: 0, any: 0, gated: 0 }
  rec.n++
  if (n.apron) { rec.apron++; specApron++ }
  if (n.continuity?.length) { rec.cont++; specCont++ }
  if (n.deTaper?.length) { rec.taper++; specTaper++ }
  const any = !!(n.continuity?.length || n.deTaper?.length || n.apron)
  if (any) { rec.any++; specAny++ }
  byLegs.set(L, rec)
}
console.log(`SPEC (src/data/ribbons.json → junctionMap) — ${scene}`)
console.log(`  nodes ${nodes.length} · apron ${specApron} · continuity ${specCont} · deTaper ${specTaper} · any-construction ${specAny}`)
console.log(`  legs | nodes | apron | cont | taper | any  (any = the :3548 filter's TRUE branch)`)
for (const L of [...byLegs.keys()].sort((a, b) => a - b)) {
  const r = byLegs.get(L)
  console.log(`  ${String(L).padStart(4)} | ${String(r.n).padStart(5)} | ${String(r.apron).padStart(5)} | ${String(r.cont).padStart(4)} | ${String(r.taper).padStart(5)} | ${String(r.any).padStart(3)}`)
}

// apron spec shape — what fields does an apron carry?
const withApron = nodes.filter(n => n.apron)
const keys = new Set()
for (const n of withApron) for (const k of Object.keys(n.apron)) keys.add(k)
console.log(`\n  apron spec object keys: {${[...keys].join(', ')}}`)
if (withApron[0]) console.log(`  sample: ${JSON.stringify(withApron[0].apron).slice(0, 200)}`)
const legKeys = new Set()
for (const n of nodes) for (const l of (n.legs || [])) for (const k of Object.keys(l)) legKeys.add(k)
console.log(`  leg keys: {${[...legKeys].join(', ')}}`)

// ── LIVE side (constructed geometry) ────────────────────────────────────
console.log(`\nLIVE (buildTileGround, authored blockCustoms):`)
const lines = []
const realLog = console.log
console.log = (...a) => { lines.push(a.join(' ')) }
let pr
try {
  pr = buildTileGround(ribbons, {
    curbWidth: 0.381,
    blockCustoms: design.blockCustoms || null,
    blockLandUse: design.blockLandUse || null,
    cornerRadiusScale: Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1,
    cornerRadiusOverrides: design.cornerRadiusOverrides || null,
    cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null,
    emitArtifact: true,
  })
} finally { console.log = realLog }
for (const l of lines) if (/E3\.2|E3\.3|THRU|A07|producer/i.test(l)) console.log('  ' + l.trim())
console.log(`  tiles built: ${pr?.tiles?.length ?? pr?._shapeArtifact?.length ?? 'n/a'}`)
console.log(`  build result keys: ${Object.keys(pr || {}).slice(0, 40).join(', ')}`)
