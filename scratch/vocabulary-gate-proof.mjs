/**
 * vocabulary-gate-proof.mjs — prove the `unknown` excision + the vocabulary gate,
 * WITHOUT pouring or baking anything.
 *
 * Runs the real `classify()` over each scene's real raw OSM + its real polygonized
 * faces, and reports what changed. Read-only: touches no artifact.
 *
 *   node scratch/vocabulary-gate-proof.mjs [scene ...]
 *
 * What it must show, per `osm-vocabulary.mjs`'s invariant:
 *   1. ZERO faces typed 'unknown' — the type no longer exists.
 *   2. The faces that WERE hijacked now carry an honest type from the size
 *      fallback (block / island / fragment), so derive.js's land-use ladder runs.
 *   3. The gate FIRES — the unreadable classes are named with their area.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { classify } from '../cartograph/classify.js'

const CART = new URL('../cartograph', import.meta.url).pathname
const scenes = process.argv.slice(2).length ? process.argv.slice(2)
  : ['lafayette-square', 'hipointe-demun', 'altadena']

// Re-derive the faces exactly as derive.js does is heavy; instead read the
// committed ribbons.faces, which IS classify()'s output from the last pour, and
// re-run classify over the same face rings to compare old vs new typing.
for (const scene of scenes) {
  let ribbons, osm
  try {
    // ⚠️ LS's artifact lives at the SHARED DEFAULT path, not under its own scene
    // folder — the palimpsest ORIENTATION warns about. Same convention as
    // `unknown-face-forensic.mjs:48`; without it LS silently SKIPs, which reads
    // as "LS is clean" when it simply was not measured.
    ribbons = JSON.parse(readFileSync(scene === 'lafayette-square'
      ? join(CART, '..', 'src', 'data', 'ribbons.json')
      : join(CART, 'data', scene, 'clean', 'ribbons.json')))
    osm     = JSON.parse(readFileSync(join(CART, 'data', scene, 'raw', 'osm.json')))
  } catch (e) {
    console.log(`\n  ${scene}: SKIP (${e.code || e.message})`)
    continue
  }

  // ⚠️ The artifact does NOT carry `area` — computing it from the ring is
  // required, not optional. A first cut of this harness used `f.area ?? 0`, got
  // 0 for every face, and every face fell to 'fragment' through the size
  // fallback — which reads exactly like the fix failing. The harness was wrong.
  const ar = (ring) => {
    let a = 0
    for (let i = 0, n = ring.length; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n]
      const px = p.x ?? p[0], pz = p.z ?? p[1], qx = q.x ?? q[0], qz = q.z ?? q[1]
      a += px * qz - qx * pz
    }
    return Math.abs(a / 2)
  }

  const faces = (ribbons.faces || []).map(f => ({
    ring: f.ring.map(p => Array.isArray(p) ? { x: p[0], z: p[1] } : p),
    absArea: ar(f.ring),
    // ⚠️ the artifact carries `use` (the propagated land-use), not `type`.
    // For a non-block face derive.js does `use = face.type` verbatim
    // (derive.js:3002) and only runs the LU ladder when type === 'block'
    // (:3003) — so `use === 'unknown'` IS the old classify type surviving.
    _was: f.use,
  }))
  if (!faces.length) { console.log(`\n  ${scene}: SKIP (no faces in artifact)`); continue }

  console.log(`\n${'═'.repeat(78)}\n  ${scene} — ${faces.length} faces\n${'═'.repeat(78)}`)

  const out = classify(faces, osm, scene)

  const wasUnknown = out.filter(f => f._was === 'unknown')
  const nowUnknown = out.filter(f => f.type === 'unknown')
  const moved = {}
  for (const f of wasUnknown) moved[f.type] = (moved[f.type] || 0) + 1

  console.log(`\n  ── VERDICT ──`)
  console.log(`  faces typed 'unknown' BEFORE : ${wasUnknown.length}`)
  console.log(`  faces typed 'unknown' NOW    : ${nowUnknown.length}  ${nowUnknown.length === 0 ? '✅ the type is gone' : '⛔ STILL PRESENT'}`)
  if (wasUnknown.length) {
    const area = wasUnknown.reduce((s, f) => s + f.absArea, 0)
    console.log(`  they were                    : ${Math.round(area).toLocaleString()} m²`)
    console.log(`  they are now                 : ${Object.entries(moved).sort((a,b)=>b[1]-a[1]).map(([t,c])=>`${t} ×${c}`).join(' · ')}`)
    const toBlock = moved.block || 0
    console.log(`  reaching derive's LU ladder  : ${toBlock}/${wasUnknown.length}  (only 'block' runs the ladder — derive.js:3003)`)
  }
}
console.log('')
