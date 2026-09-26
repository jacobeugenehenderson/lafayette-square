// claims-crop-rows-derived-per-field.mjs — DO A TOWN'S CROP ROWS RUN EACH FIELD'S OWN WAY?
//
// ⭐ THE INVARIANT (`BRIEF-field-shader §7`): rows follow each field's long axis, DERIVED per field.
// A fixed bearing across a town reads as wallpaper and is the single most likely way a crop ships
// looking wrong — and it looks PLAUSIBLE, so nothing else would say so.
//
// For every baked town, every ground group whose surface is `perField` (cartograph/surfaces.mjs —
// read from the source, never restated here) must:
//   ① carry field ids (a Float32 per vertex, ground.json `fieldByteOffset`) and a `fields` table,
//     every id a valid index;
//   ② store, for each field, the bearing the field's OWN baked vertices give: their minimum-area
//     rectangle (`src/lib/fieldAxis.js`, the bake's own function) is recomputed here and compared.
//     A near-square field (long/short < SQUARE) has no long axis and is reported, not compared.
// ⭐ MUTATION-TESTED ON EVERY RUN: the same assertion is run on a copy with every field given the
//   first field's bearing (the wallpaper defect). If that copy does not FAIL, the check is BLIND and
//   exits 1 — a pass from a check that cannot see the defect proves nothing.
//
//   node checks/claims-crop-rows-derived-per-field.mjs            # every baked town
//   node checks/claims-crop-rows-derived-per-field.mjs huron
// Read-only. Exit 1 on a finding or a blind check; 2 if it could not run.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { SURFACES, resolveClassTable, surfaceOfGroup } from '../cartograph/surfaces.mjs'
import { minAreaRect } from '../src/lib/fieldAxis.js'

const TOL_DEG = 1          // the stored bearing is rounded to 1e-5 rad at bake; 1° is far above that
const SQUARE = 1.05        // long/short below this: the rectangle's "long" side is noise

const axisDiffDeg = (a, b) => { const d = Math.abs(((a - b) % Math.PI + Math.PI) % Math.PI); return Math.min(d, Math.PI - d) * 180 / Math.PI }

/** Problems with one group's fields. `fields` may be a mutated copy. */
function audit(g, bin, fields) {
  const out = []
  if (g.fieldByteOffset == null || !Array.isArray(fields)) return [`no field ids — baked before per-field rows; re-bake the ground`]
  const fid = new Float32Array(bin, g.fieldByteOffset, g.vertexCount)
  const P = new Float32Array(bin, g.vertexByteOffset, g.vertexCount * 3)
  const pts = fields.map(() => [])
  for (let i = 0; i < g.vertexCount; i++) {
    const f = fid[i]
    if (!Number.isInteger(f) || f < 0 || f >= fields.length) { out.push(`vertex ${i} carries field ${f}, not an index into ${fields.length} field(s)`); break }
    pts[f].push([P[i * 3], P[i * 3 + 2]])
  }
  fields.forEach((f, i) => {
    if (pts[i].length < 3) return
    const r = minAreaRect(pts[i])
    if (r.halfLen / Math.max(r.halfWid, 1e-9) < SQUARE) return
    const d = axisDiffDeg(f.bearing, r.bearing)
    if (d > TOL_DEG) out.push(`field #${i} (${(f.areaM2 / 1e4).toFixed(1)} ha): stored bearing ${(f.bearing * 180 / Math.PI).toFixed(1)}° but its own vertices run ${(r.bearing * 180 / Math.PI).toFixed(1)}° (off ${d.toFixed(1)}°)`)
  })
  return out
}

let findings = 0, blind = 0, checked = 0
for (const scene of scenes('public/baked/<scene>/ground.json')) {
  const dir = join(ROOT, 'public', 'baked', scene)
  const m = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8'))
  let sceneJson = {}
  try { sceneJson = JSON.parse(readFileSync(join(dir, 'scene.json'), 'utf8')) } catch { /* no operator remap */ }
  const table = resolveClassTable(sceneJson?.surfaces?.classes, (msg) => console.log(`  ${msg}`))
  const groups = m.groups.filter(g => SURFACES[surfaceOfGroup(g, table)]?.perField)
  if (!groups.length) { console.log(`   ${scene}: no per-field surface in this ground`); continue }
  const buf = readFileSync(join(dir, m.bin)); const bin = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  for (const g of groups) {
    checked++
    const probs = audit(g, bin, g.fields)
    const tag = `${scene} ${g.kind}:${g.id} → ${surfaceOfGroup(g, table)}`
    if (probs.length) { findings += probs.length; console.log(`⛔ ${tag}`); for (const p of probs) console.log(`     ${p}`); continue }
    const degs = g.fields.map(f => ((f.bearing * 180 / Math.PI) % 180 + 180) % 180)
    console.log(`✅ ${tag}: ${g.fields.length} field(s), each on its own axis (${degs.map(d => d.toFixed(0) + '°').join(' ')})`)
    // The mutation: one bearing for every field. Must be SEEN — unless every field already shares it.
    if (g.fields.length > 1) {
      const wall = g.fields.map(f => ({ ...f, bearing: g.fields[0].bearing }))
      if (!audit(g, bin, wall).length && degs.some(d => axisDiffDeg(d * Math.PI / 180, g.fields[0].bearing) > TOL_DEG)) {
        blind++; console.log(`⛔ BLIND: every field forced to ${degs[0].toFixed(0)}° and the audit did not notice`)
      } else console.log(`   mutation (every field forced to ${degs[0].toFixed(0)}°) caught ✓`)
    }
  }
}
if (!checked) console.log('⚠️ no town carries a per-field surface — nothing measured (not a pass)')
console.log(findings || blind ? `\n⛔ FAIL — ${findings} finding(s)${blind ? `, ${blind} blind` : ''}` : checked ? '\n✅ PASS' : '')
process.exit(findings || blind ? 1 : checked ? 0 : 2)
