#!/usr/bin/env node
/**
 * claims-shader-fragments-declare-what-they-use — EVERY IDENTIFIER A GLSL FRAGMENT USES
 * MUST BE DECLARED IN THE BLOCK IT COMPILES WITH.
 *
 * ⛔ THE DEFECT (2026-09-03, "the trees are gone"). treeAtlasMaterial composes its shaders
 * from string constants: a COMMON block of uniform/attribute declarations, and a BEGIN
 * block of vertex code, concatenated at onBeforeCompile. Nothing binds the two halves —
 * they are held together by a `+`. Five new uniforms were declared in the MESH common
 * block while the code reading them lived in the CARD's BEGIN block, so the card program
 * referenced five undeclared uniforms.
 *
 * ⭐⭐ WHY THIS NEEDS A CHECK AT ALL, AND WHY THE SHADER IS SPECIAL: a link failure here
 * does not throw, does not warn where anyone is looking, and does not render a broken
 * tree. It renders NO tree. "Wrong" and "absent" are the same picture, and absent looks
 * exactly like "the feature is off" — which is how a whole canopy disappeared and the
 * cause was a variable declared 1400 lines from where it was used.
 *
 * ⭐ Nothing is enumerated: the pairs are read out of the source by matching which COMMON
 * constant each BEGIN constant is concatenated with at its injection site. A new material
 * is covered the day it is written.
 *
 *   node scratch/claims-shader-fragments-declare-what-they-use.mjs
 *   exit 0 = every fragment's identifiers are declared · exit 2 = a program would not link
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const FILE = 'src/components/treeAtlasMaterial.js'
const src = readFileSync(path.join(ROOT, FILE), 'utf8')

// The GLSL string constants, by name. A block may be written as a CONCATENATION of
// an already-declared block plus its own text (`const HERO_VERT_COMMON =
// OVERHEAD_WIND_COMMON + <backtick>…`) — that is how a material adds its own varyings to a
// shared block without either duplicating the shared text or declaring identifiers
// into a sibling material that cannot write them. Resolve the prefix, or the check
// reads the additions and misses everything they were added to.
const blocks = new Map()
for (const m of src.matchAll(/const ([A-Z0-9_]+) = ((?:[A-Z0-9_]+ \+ )*)`([\s\S]*?)`/g)) {
  const prefix = m[2].split('+').map(t => t.trim()).filter(Boolean).map(n => blocks.get(n) ?? '').join('\n')
  blocks.set(m[1], prefix + m[3])
}

// Injection sites pair a COMMON with the code injected alongside it. BOTH shader
// halves are covered: the vertex half (`'#include <common>' + X` / `'#include
// <begin_vertex>' + Y`) and the FRAGMENT half (`'#include <common>' + X` /
// `'#include <map_fragment>' + Y`).
//
// ⛔ THE FRAGMENT HALF WAS INVISIBLE HERE UNTIL 2026-09-03, and the omission had the
// shape this whole check exists to catch: the instrument reported ✅ across the board
// while covering only half of what it claimed to cover. It could not see the fragment
// side because that side was written as INLINE template literals rather than named
// constants, and this file reads named constants. The cards' fragment blocks were
// promoted to named constants so they fall under the check — an instrument's silence
// is not evidence of absence, and the fix is to make it REACH the thing.
const pairs = []
for (const line of src.split('\n')) {
  const c = line.match(/'#include <common>'\s*\+\s*([A-Z0-9_]+)/)
  if (c) pairs.push({ common: c[1], begins: [] })
  const b = line.match(/'#include <(?:begin_vertex|map_fragment)>'\s*\+\s*(.+)$/)
  if (b && pairs.length) {
    for (const n of b[1].matchAll(/([A-Z0-9_]{4,})/g)) if (blocks.has(n[1])) pairs[pairs.length - 1].begins.push(n[1])
  }
}
if (!pairs.length) {
  console.error('⛔ PIN BROKEN — no #include injection sites found in ' + FILE + '. Re-anchor this check.')
  process.exit(2)
}

const declaredIn = (glsl) => new Set([
  ...[...glsl.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map(m => m[1]),
  ...[...glsl.matchAll(/attribute\s+\w+\s+(\w+)\s*;/g)].map(m => m[1]),
  ...[...glsl.matchAll(/varying\s+\w+\s+(\w+)\s*;/g)].map(m => m[1]),
  ...[...glsl.matchAll(/^\s*(?:float|vec2|vec3|vec4|mat3|mat4|int|bool)\s+(\w+)\s*\(/gm)].map(m => m[1]),
])
// three.js supplies these; they are never declared in our fragments.
const BUILTIN = new Set(['uTime', 'position', 'normal', 'uv', 'modelMatrix', 'instanceMatrix',
  'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition', 'transformed',
  // three's own varyings, declared by the chunks it injects around ours — `vMapUv`
  // comes from <map_pars_fragment> whenever the material carries a `map`, which every
  // card material does. Ours never declare these and must not.
  'vMapUv', 'vUv', 'vNormal', 'vViewPosition', 'vColor'])

let failed = 0
console.log('Every identifier a GLSL fragment uses must be declared in the block it compiles with\n')
for (const { common, begins } of pairs) {
  const c = blocks.get(common)
  if (!c) { console.log(`  ⛔ ${common} — no such GLSL constant`); failed++; continue }
  const decl = declaredIn(c)
  for (const bname of begins) {
    const b = blocks.get(bname)
    if (!b) continue
    // strip comments so a mention in prose is not a use
    const code = b.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    const localDecl = declaredIn(code)
    const locals = new Set([...code.matchAll(/(?:float|vec2|vec3|vec4|mat3|mat4|int|bool)\s+(\w+)\s*[=;]/g)].map(m => m[1]))
    // u… = uniform, a… = attribute, v… = VARYING. The varyings were not checked
    // until 2026-09-03, and a varying is the easiest of the three to get wrong: it
    // has to be declared in BOTH halves, and a fragment reading one the vertex half
    // never declared is the same silent non-link as a missing uniform.
    const used = new Set([...code.matchAll(/\b([uav][A-Z]\w+)\b/g)].map(m => m[1]))
    const missing = [...used].filter(u => !decl.has(u) && !localDecl.has(u) && !locals.has(u) && !BUILTIN.has(u)).sort()
    if (missing.length) {
      failed++
      console.log(`  ⛔ ${bname} + ${common} — ${missing.length} identifier(s) USED BUT NOT DECLARED:`)
      for (const u of missing) console.log(`       ${u}`)
      console.log(`     ⇒ this program does not link, and a non-linking tree shader draws NOTHING.`)
    } else {
      console.log(`  ✅ ${bname.padEnd(24)} + ${common} — all identifiers declared`)
    }
  }
}
console.log()
if (failed) { console.log(`⛔ ${failed} fragment pairing(s) would fail to link.`); process.exit(2) }
console.log('✅ every fragment declares what it uses.')
