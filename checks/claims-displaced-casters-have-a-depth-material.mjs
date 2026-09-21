#!/usr/bin/env node
/**
 * claims-displaced-casters-have-a-depth-material
 *
 * ⛔ THE CLASS: a mesh that CASTS a shadow is drawn into the shadow map with
 * three's own MeshDepthMaterial — NOT with its render material. So any vertex
 * displacement done in the render material's shader (`transformed.y += …`,
 * `transformed += …`) is INVISIBLE to the shadow pass, and the caster is
 * recorded at a position it is not drawn at.
 *
 * Found 2026-09-20 on huron: `SlabBuildings` lifts every building by the
 * per-vertex attribute `aCentroidY` (the foundation riser, 1.41–13.40 m) times
 * uExag 1.5 — up to 20.10 m — on buildings ~22 m tall. The shadow copies sat
 * buried in the terrain, so nothing could shadow the ground and the town had NO
 * cast shadows at all. The shadow map looked populated; it held the town in the
 * wrong place.
 *
 * ⭐ Scales with relief and with riser height, so it is WORST on the hilliest
 * town and mildest on flat LS — i.e. invisible exactly where we look first.
 *
 * The fix is `mesh.customDepthMaterial` carrying the SAME displacement.
 *
 * READS THE SOURCE — never a copied list. Run: node checks/claims-displaced-casters-have-a-depth-material.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(js|jsx)$/.test(e)) out.push(p)
  }
  return out
}

// A file CASTS if it turns castShadow on (prop, or imperative assignment).
const CASTS = /castShadow(?!\s*[={]\s*false)(?!\s*=\s*false)/
// A file DISPLACES if a shader string writes to `transformed`.
const DISPLACES = /transformed(\.[xyz])?\s*(\+=|-=|=)/
const HAS_DEPTH = /customDepthMaterial/

const offenders = []
const ok = []
for (const f of walk(SRC)) {
  const src = readFileSync(f, 'utf8')
  if (!CASTS.test(src) || !DISPLACES.test(src)) continue
  const rel = relative(ROOT, f)
  if (HAS_DEPTH.test(src)) ok.push(rel)
  else {
    const line = src.split('\n').findIndex(l => DISPLACES.test(l)) + 1
    offenders.push(`${rel}:${line}`)
  }
}

for (const o of ok) console.log(`  ok    ${o}`)
if (!offenders.length) {
  console.log(`\n✅ every shadow-casting file that displaces vertices supplies customDepthMaterial (${ok.length} checked)`)
  process.exit(0)
}
console.error('\n⛔ SHADOW-CASTING MESHES THAT DISPLACE VERTICES WITH NO customDepthMaterial:')
for (const o of offenders) console.error('   ' + o)
console.error('\nThe shadow pass uses three\'s MeshDepthMaterial and will record these casters')
console.error('at their UN-displaced positions. Give the mesh a customDepthMaterial that repeats')
console.error('the same displacement (see SlabBuildings.jsx for the worked example).')
process.exit(1)
