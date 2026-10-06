#!/usr/bin/env node
/**
 * "DOES EVERY NEON FIELD REACH A DRAWING, AND IS THE TUBE NEVER INFLATED?" — BRIEF-neon-reads-at-every-distance §2.
 *
 * WHY THIS EXISTS (2026-10-06). The tube used to be inflated in its vertex shader to a 2.5 px floor, so a 2 m pipe
 * blew out overhead and the "realistic" tube was never the size of a tube. It is now two drawings — a physical tube
 * and a fixed-width screen-space line — handed off by on-screen size. Three ways that breaks quietly:
 *   1. a channel field the panel shows but no drawing reads (a knob that does nothing),
 *   2. a pixel-sized term creeping back into the TUBE's vertex shader (the inflate, returned),
 *   3. a town's baked scene.json still carrying fields the channel no longer has — its neon then draws the flat
 *      defaults at every slot, a plausible-looking night that is not the town's day. Re-bake its scene step.
 *
 * ⭐ READS THE SOURCE, DOES NOT RESTATE IT: the field keys come from skyLightChannels.js, the driver, materials and
 * shaders are lifted out of NeonBands.jsx, the towns are whatever public/baked/ holds.
 *
 *   node checks/claims-neon-two-drawings.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { NEON_FIELD_KEYS, kitDayChannel } = await import(join(ROOT, 'src/cartograph/skyLightChannels.js'))
const { neon: U } = await import(join(ROOT, 'src/preview/neonState.js'))
const src = readFileSync(process.env.NEON_SRC || join(ROOT, 'src/components/NeonBands.jsx'), 'utf8')   // NEON_SRC: a mutated copy, for the mutation test

let failed = 0
const check = (ok, what, detail = '') => { console.log(`  ${ok ? '✅ pass' : '❌ FAIL'}  ${what}${!ok && detail ? `\n           ${detail}` : ''}`); if (!ok) failed++ }
const between = (s, a, b) => { const i = s.indexOf(a); if (i < 0) return null; const j = s.indexOf(b, i + a.length); return j < 0 ? null : s.slice(i, j) }

// 1. every field → the driver → a uniform → a material or the geometry poll
const driver = between(src, 'export function NeonDriver', '\n}\n')
check(!!driver, 'NeonDriver found in NeonBands.jsx')
const writes = {}   // field key → uniform name
for (const m of (driver || '').matchAll(/_neonUniforms\.(\w+)\.value\s*=\s*v\.(\w+)/g)) writes[m[2]] = m[1]
for (const k of NEON_FIELD_KEYS) {
  const u = writes[k]
  check(!!u, `field "${k}" is written by NeonDriver`, 'a panel knob with no driver write does nothing')
  if (!u) continue
  check(u in U, `field "${k}" → neonState.${u} exists`)
  const read = new RegExp(`_neonUniforms\\.${u}\\b`, 'g')
  const reads = [...src.matchAll(read)].length - 1   // minus the driver's own write
  check(reads >= 1, `neonState.${u} is read by a drawing (a material uniform or the tube's rebuild poll)`)
}
for (const [k, u] of Object.entries(writes)) check(NEON_FIELD_KEYS.includes(k), `the driver writes only channel fields ("${k}" → ${u})`)

// 2. the tube is never inflated: its vertex shader carries no pixel-sized term that moves a vertex
const tubeVert = between(src, 'const VERT = /* glsl */`', '\n`')
check(!!tubeVert, 'the tube vertex shader (VERT) found')
if (tubeVert) {
  const body = tubeVert.slice(tubeVert.indexOf('void main'))
  const posLine = body.split('\n').find((l) => /\bvec3 lifted\s*=/.test(l)) || ''
  check(/=\s*position\s*\+\s*vec3\(0\.0,\s*aCentroidY \* uExag,\s*0\.0\)/.test(posLine),
    'the tube vertex is its swept position plus the terrain lift, nothing else', `found: ${posLine.trim() || '(no `vec3 lifted =` line)'}`)
}
// the line is the drawing that holds a pixel width
const lineVert = between(src, 'const LINE_VERT = /* glsl */`', '\n`')
check(!!lineVert && /uLinePx/.test(lineVert), 'the line vertex shader widens by uLinePx')

// 3. the kit's day keys every field at every slot, and no baked town carries a field the channel lacks
const kit = kitDayChannel('neon')
for (const [slot, tuple] of Object.entries(kit.values)) {
  const missing = NEON_FIELD_KEYS.filter((k) => !(k in tuple))
  check(missing.length === 0, `the kit day's ${slot} keys every neon field`, `missing: ${missing.join(', ')}`)
}
const baked = join(ROOT, 'public/baked')
for (const town of readdirSync(baked)) {
  const f = join(baked, town, 'scene.json')
  if (!existsSync(f)) continue
  const neon = JSON.parse(readFileSync(f, 'utf8')).neon
  if (!neon?.values) { check(false, `${town}: scene.json carries a neon channel`); continue }
  const stale = new Set(), absent = new Set()
  for (const tuple of Object.values(neon.values)) {
    for (const k of Object.keys(tuple)) if (!NEON_FIELD_KEYS.includes(k)) stale.add(k)
    for (const k of NEON_FIELD_KEYS) if (!(k in tuple)) absent.add(k)
  }
  check(stale.size === 0 && absent.size === 0, `${town}: baked neon matches the channel's fields`,
    `retired: ${[...stale].join(', ') || '—'} · missing: ${[...absent].join(', ') || '—'} → re-bake its scene step (node cartograph/bake-scene.js --look=${town} --scene=${town})`)
}

console.log(failed ? `\n❌ ${failed} failed` : '\n✅ all passed')
process.exit(failed ? 1 : 0)
