#!/usr/bin/env node
/**
 * "IS THERE ONE BLUR LADDER?"
 *
 * WHY (2026-10-22, Boz's blur census). Post-FX shares ONE downsample ladder — DownsamplePyramid.jsx, exposed through
 * `_pyramidRefs.levels` — and every blur consumer (CustomBloom, RomanceDoF) takes its character off it. A second ladder is
 * a second full-screen downsample chain: the weight the pyramid exists to pay once, and a blur that drifts from the
 * shared one. ONE sibling is sanctioned: HeroLadder.jsx, a scissored ladder of the hero object ALONE that DoF subtracts
 * from the shared rung (its header says why). It is a sibling only because it reads the shared ladder.
 *
 * A LADDER is read, never listed: a file that builds a render target PER RUNG (`new WebGLRenderTarget` pushed into an
 * array, returned from a map / Array.from, or stored at an index). A single target, or a ping-pong pair, is not one.
 * Fails when:
 *   · DownsamplePyramid.jsx does not build a ladder, or does not publish it on `_pyramidRefs.levels`
 *   · ANY other file under src/ builds a ladder, except the named sibling
 *   · the sibling is named here but no longer builds a ladder, or does not read `_pyramidRefs` (a stale row, or an
 *     independent second blur wearing the sibling's name)
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-one-blur-ladder.mjs [--self-test]
 */
import { readFileSync } from 'fs'
import { join, relative } from 'path'
import { walk } from './_imports.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const PYRAMID = 'src/components/DownsamplePyramid.jsx'
const SIBLINGS = { 'src/components/HeroLadder.jsx': 'the hero object alone, subtracted from the shared rung by RomanceDoF' }

const code = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
const TARGET = /new\s+(?:THREE\.)?WebGLRenderTarget\b/g
// Built per rung: pushed into an array, returned by a map / Array.from callback, or stored in an indexed slot. (A loop's
// mere nearness is not the signal: WindSheet disposes in a forEach just above the ping-pong pair it builds.)
const RUNG = [/\.push\s*\(\s*$/, /(?:\.map|Array\.from)\s*\([^;]{0,160}=>\s*(?:\{[^;]*)?$/, /\[\s*\w+\s*\]\s*=\s*$/]
export function buildsLadder(src) {
  const c = code(src)
  for (const m of c.matchAll(TARGET)) { const before = c.slice(Math.max(0, m.index - 200), m.index); if (RUNG.some(r => r.test(before))) return true }
  return false
}

export function audit(files, siblings = SIBLINGS) {
  const f = []
  const pyr = files.find(x => x.path === PYRAMID)
  if (!pyr) return { f: [`${PYRAMID} does not exist — the shared ladder is gone`] }
  if (!buildsLadder(pyr.src)) f.push(`${PYRAMID} no longer builds a ladder`)
  if (!/_pyramidRefs\.levels\.current\s*=/.test(code(pyr.src))) f.push(`${PYRAMID} does not publish its rungs on _pyramidRefs.levels`)
  for (const x of files) {
    if (x.path === PYRAMID || !buildsLadder(x.src)) continue
    if (!siblings[x.path]) f.push(`${x.path} builds a second blur ladder — sample the shared one (${PYRAMID}, _pyramidRefs.levels), or name it a sibling here with the reason`)
    else if (!/\b_pyramidRefs\b/.test(code(x.src))) f.push(`${x.path} is the named sibling but does not read _pyramidRefs — an independent second blur`)
  }
  for (const p of Object.keys(siblings)) {
    const x = files.find(y => y.path === p)
    if (!x || !buildsLadder(x.src)) f.push(`${p} is named a sibling ladder but ${x ? 'builds none' : 'does not exist'} — retire the row`)
  }
  return { f }
}

const files = walk(SRC).map(p => ({ path: relative(ROOT, p), src: readFileSync(p, 'utf8') }))

if (process.argv.includes('--self-test')) {
  const swap = (path, fn) => files.map(x => x.path === path ? { ...x, src: fn(x.src) } : x)
  const plant = (src) => [...files, { path: 'src/components/PlantedBlur.jsx', src }]
  const cases = [
    ['a third file pushes a ladder', () => audit(plant(`for (let i = 0; i < 6; i++) {\n  w = w / 2\n  this.t.push(new THREE.WebGLRenderTarget(w, h, {}))\n}`))],
    ['a third file maps a ladder', () => audit(plant(`const levels = sizes.map(s => new WebGLRenderTarget(s, s))`))],
    ['a third file indexes a ladder', () => audit(plant(`for (let i = 0; i < n; i++) targets[i] = new THREE.WebGLRenderTarget(w >> i, h >> i)`))],
    ['the sibling is not named', () => audit(files, {})],
    ['the sibling stops reading the shared ladder', () => audit(swap('src/components/HeroLadder.jsx', s => s.replace(/_pyramidRefs/g, '_ownRefs')))],
    ['the sibling is deleted', () => audit(files.filter(x => x.path !== 'src/components/HeroLadder.jsx'))],
    ['the pyramid stops publishing', () => audit(swap(PYRAMID, s => s.replace(/_pyramidRefs\.levels\.current\s*=/g, '_gone =')))],
    ['the pyramid builds one target', () => audit(swap(PYRAMID, s => s.replace(/for\s*\(let i = 0; i < PYRAMID_LEVELS; i\+\+\)/, 'if (true)').replace(/this\.targets\.push\(/g, 'this.targets = (')))],
  ]
  const clean = [['a single target is not a ladder', () => audit(plant(`const rt = new THREE.WebGLRenderTarget(512, 512)`))]]
  let bad = audit(files).f.length ? 1 : 0
  if (bad) console.log(`⛔ the live tree is RED — self-test needs a green baseline`)
  for (const [n, run] of cases) { const c = run().f.length > 0; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  for (const [n, run] of clean) { const c = run().f.length === 0; if (!c) bad++; console.log(`${c ? '✅ clean' : '⛔ FALSE RED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

const { f } = audit(files)
const others = files.filter(x => x.path !== PYRAMID && buildsLadder(x.src)).map(x => x.path)
console.log(`ladders under src/: ${PYRAMID}${others.length ? ' · ' + others.join(' · ') : ''}`)
if (f.length) { console.log(`⛔ FAIL (${f.length})\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ one blur ladder (DownsamplePyramid); the one sibling (HeroLadder) reads it')
