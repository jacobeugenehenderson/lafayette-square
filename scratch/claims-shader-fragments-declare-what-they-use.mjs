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

// The GLSL string constants, by name.
const blocks = new Map()
for (const m of src.matchAll(/const ([A-Z0-9_]+) = `([\s\S]*?)`/g)) blocks.set(m[1], m[2])

// Injection sites pair a COMMON with a BEGIN: `'#include <common>' + X` and
// `'#include <begin_vertex>' + Y (+ Z…)`. Read the pairing, never restate it.
const pairs = []
for (const line of src.split('\n')) {
  const c = line.match(/'#include <common>'\s*\+\s*([A-Z0-9_]+)/)
  if (c) pairs.push({ common: c[1], begins: [] })
  const b = line.match(/'#include <begin_vertex>'\s*\+\s*(.+)$/)
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
  'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition', 'transformed'])

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
    const used = new Set([...code.matchAll(/\b([ua][A-Z]\w+)\b/g)].map(m => m[1]))
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
