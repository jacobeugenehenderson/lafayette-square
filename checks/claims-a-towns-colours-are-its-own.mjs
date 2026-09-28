#!/usr/bin/env node
/**
 * "ARE A TOWN'S CATEGORY COLOURS — ITS NEON, ITS CHIPS — ITS OWN?"
 *
 * WHY (BRIEF-town-palette; Jacob, 2026-09-27: "the neon is meant to convey things about the neighborhood, not the
 * portal"). Every town drew Lafayette Square's Victorian palette (tokens/categories.js#CATEGORY_HEX) through a fallback:
 * no town had authored the channel that already existed — the Look's materialColors.neon_<category>, Stage › Surfaces ›
 * Neon. src/lib/categoryColor.js now decides a category's colour: the Look's, else the kit's NEUTRAL default.
 *
 * Asserts, reading the sources and the baked artifacts:
 *   · no neon consumer (NeonBands, SceneNeon, Stage's swatches) nor the manifest bake reads CATEGORY_HEX — the colour
 *     comes from categoryColor.js;
 *   · the neutral default covers EVERY category of the taxonomy (read from tokens/categories.js) with DISTINCT colours
 *     (categories must still be told apart);
 *   · a category the Look authored draws that colour; one it did not draws the neutral default — never another town's;
 *   · every baked manifest's taxonomy.categories[].color / colorAuthored equal what its own scene.json gives;
 *   · LISTS the towns whose scene.json predates the palette bake (no `neonAuthored`) — they keep the old palette until
 *     their scene is re-baked; the pre-palette branch is deleted when the list is empty.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-a-towns-colours-are-its-own.mjs [--self-test]
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import CATEGORIES from '../src/tokens/categories.js'
import { categoryHex, isAuthoredCategory, NEUTRAL_CATEGORY_HEX } from '../src/lib/categoryColor.js'

const ROOT = new URL('..', import.meta.url).pathname
const BAKED = join(ROOT, 'public/baked')
const CONSUMERS = ['src/components/NeonBands.jsx', 'src/components/SceneNeon.jsx', 'src/cartograph/CartographSurfaces.jsx', 'cartograph/bake-manifest.mjs']
const code = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

export function audit({ sources, towns, neutral = NEUTRAL_CATEGORY_HEX, hexOf = categoryHex }) {
  const f = [], preBake = []
  for (const [path, src] of Object.entries(sources)) if (/\bCATEGORY_HEX\b/.test(code(src))) f.push(`${path} reads CATEGORY_HEX — a town's category colour comes from src/lib/categoryColor.js`)
  const ids = Object.keys(CATEGORIES)
  const missing = ids.filter(id => !neutral[id]); if (missing.length) f.push(`the neutral default has no colour for ${missing.join(', ')}`)
  const seen = new Map(); for (const [id, hex] of Object.entries(neutral)) { const k = hex.toLowerCase(); if (seen.has(k)) f.push(`the neutral default gives ${seen.get(k)} and ${id} the same colour (${hex}) — categories must be told apart`); seen.set(k, id) }
  // The rule, on a fixture Look: authored → its colour; unauthored → neutral.
  const look = { materialColors: { neon_dining: '#123456' }, neonAuthored: ['dining'] }
  if (hexOf('dining', look) !== '#123456') f.push('an authored category does not draw the Look\'s colour')
  if (hexOf('parks', look) !== neutral.parks) f.push('an unauthored category does not draw the neutral default')
  for (const t of towns) {
    if (!Array.isArray(t.scene?.neonAuthored)) { preBake.push(t.id); continue }
    for (const c of t.manifest?.taxonomy?.categories || []) {
      if (c.color === undefined) { f.push(`${t.id}: manifest category ${c.id} carries no color`); continue }
      if (c.color !== hexOf(c.id, t.scene)) f.push(`${t.id}: manifest ${c.id} color ${c.color} ≠ its scene's ${hexOf(c.id, t.scene)}`)
      if (c.colorAuthored !== isAuthoredCategory(c.id, t.scene)) f.push(`${t.id}: manifest ${c.id} colorAuthored ${c.colorAuthored} ≠ its scene's`)
    }
  }
  return { f, preBake }
}

const sources = Object.fromEntries(CONSUMERS.filter(p => existsSync(join(ROOT, p))).map(p => [p, readFileSync(join(ROOT, p), 'utf8')]))
const towns = readdirSync(BAKED).filter(t => existsSync(join(BAKED, t, 'scene.json'))).map(id => ({
  id,
  scene: JSON.parse(readFileSync(join(BAKED, id, 'scene.json'), 'utf8')),
  manifest: existsSync(join(BAKED, id, 'manifest.json')) ? JSON.parse(readFileSync(join(BAKED, id, 'manifest.json'), 'utf8')) : null,
}))

if (process.argv.includes('--self-test')) {
  const base = audit({ sources, towns }).f.length
  const cases = [
    ['a neon consumer reads CATEGORY_HEX again', () => audit({ sources: { ...sources, 'src/components/NeonBands.jsx': 'import { CATEGORY_HEX } from "x"; CATEGORY_HEX[k]' }, towns })],
    ['the neutral default loses a category', () => audit({ sources, towns, neutral: Object.fromEntries(Object.entries(NEUTRAL_CATEGORY_HEX).slice(1)) })],
    ['two categories share a neutral colour', () => audit({ sources, towns, neutral: { ...NEUTRAL_CATEGORY_HEX, arts: NEUTRAL_CATEGORY_HEX.dining } })],
    ['an unauthored category draws another town\'s palette', () => audit({ sources, towns, hexOf: (id, s) => (id === 'parks' ? '#3DAF8A' : categoryHex(id, s)) })],
    ['a manifest colour disagrees with its scene', () => audit({ sources, towns: [{ id: 'x', scene: { materialColors: {}, neonAuthored: [] }, manifest: { taxonomy: { categories: [{ id: 'dining', color: '#000000', colorAuthored: false }] } } }] })],
  ]
  let bad = 0
  for (const [n, run] of cases) { const c = run().f.length > base; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

const { f, preBake } = audit({ sources, towns })
console.log(`ⓘ  scenes baked before the town palette (they keep the old palette until their scene is re-baked): ${preBake.join(', ') || 'none — delete the pre-palette branch in categoryColor.js'}`)
if (f.length) { console.log(`⛔ FAIL — ${f.length}\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ a town\'s category colours are its own — authored, or the neutral default; never another town\'s')
