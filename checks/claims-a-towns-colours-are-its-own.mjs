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
 *   · no neon consumer (NeonBands, SceneNeon, the Identity panel's swatches) nor the manifest bake reads CATEGORY_HEX — the colour
 *     comes from categoryColor.js;
 *   · ONE source per category, TWO derived forms (Jacob, 2026-09-28): `neon` (the map's tubes) and `detail` (the pastel
 *     for chips, dots, accents). The neutral hues cover EVERY category of the taxonomy (read from tokens/categories.js)
 *     and stay DISTINCT in both forms (categories must still be told apart);
 *   · an authored category's neon is the Look's hex EXACTLY, its detail derived from it; an unauthored one draws the
 *     neutral — never another town's;
 *   · every baked manifest's taxonomy.categories[].neon / detail / colorAuthored equal what its own scene.json gives;
 *   · LISTS the towns whose scene.json predates the palette bake (no `neonAuthored`) — they keep the old palette until
 *     their scene is re-baked; the pre-palette branch is deleted when the list is empty.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-a-towns-colours-are-its-own.mjs [--self-test]
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import CATEGORIES from '../src/tokens/categories.js'
import { categoryNeon, categoryDetail, detailOf, isAuthoredCategory, NEUTRAL_CATEGORY_HUE, neutralNeon } from '../src/lib/categoryColor.js'

const ROOT = new URL('..', import.meta.url).pathname
const BAKED = join(ROOT, 'public/baked')
const CONSUMERS = ['src/components/NeonBands.jsx', 'src/components/SceneNeon.jsx', 'src/cartograph/IdentityPanel.jsx', 'cartograph/bake-manifest.mjs']
const code = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

export function audit({ sources, towns, hues = NEUTRAL_CATEGORY_HUE, neonOf = categoryNeon }) {
  const f = [], preBake = []
  for (const [path, src] of Object.entries(sources)) if (/\bCATEGORY_HEX\b/.test(code(src))) f.push(`${path} reads CATEGORY_HEX — a town's category colour comes from src/lib/categoryColor.js`)
  const ids = Object.keys(CATEGORIES)
  const missing = ids.filter(id => hues[id] == null); if (missing.length) f.push(`the neutral default has no hue for ${missing.join(', ')}`)
  for (const [form, of] of [['neon', (id) => neutralNeon(id)], ['detail', (id) => detailOf(neutralNeon(id))]]) {
    const seen = new Map()
    for (const id of Object.keys(hues)) { const k = of(id); if (seen.has(k)) f.push(`the neutral ${form} form gives ${seen.get(k)} and ${id} the same colour (${k}) — categories must be told apart`); seen.set(k, id) }
  }
  const hueSeen = new Map(); for (const [id, h] of Object.entries(hues)) { if (hueSeen.has(h)) f.push(`the neutral hues give ${hueSeen.get(h)} and ${id} the same hue (${h}°)`); hueSeen.set(h, id) }
  // The rule, on a fixture Look: authored → its hex exactly (detail derived); unauthored → the neutral.
  const look = { materialColors: { neon_dining: '#123456' }, neonAuthored: ['dining'] }
  if (neonOf('dining', look) !== '#123456') f.push('an authored category\'s neon is not the Look\'s hex exactly')
  if (categoryDetail('dining', look) !== detailOf('#123456')) f.push('an authored category\'s detail is not derived from its neon')
  if (neonOf('parks', look) !== neutralNeon('parks')) f.push('an unauthored category does not draw the neutral default')
  for (const t of towns) {
    if (!Array.isArray(t.scene?.neonAuthored)) { preBake.push(t.id); continue }
    for (const c of t.manifest?.taxonomy?.categories || []) {
      if (c.neon === undefined || c.detail === undefined) { f.push(`${t.id}: manifest category ${c.id} carries no neon/detail`); continue }
      if (c.neon !== neonOf(c.id, t.scene)) f.push(`${t.id}: manifest ${c.id} neon ${c.neon} ≠ its scene's ${neonOf(c.id, t.scene)}`)
      if (c.detail !== detailOf(neonOf(c.id, t.scene))) f.push(`${t.id}: manifest ${c.id} detail ${c.detail} is not derived from its neon`)
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
    ['the neutral default loses a category', () => audit({ sources, towns, hues: Object.fromEntries(Object.entries(NEUTRAL_CATEGORY_HUE).slice(1)) })],
    ['two categories share a neutral hue', () => audit({ sources, towns, hues: { ...NEUTRAL_CATEGORY_HUE, arts: NEUTRAL_CATEGORY_HUE.dining } })],
    ['an unauthored category draws another town\'s palette', () => audit({ sources, towns, neonOf: (id, s) => (id === 'parks' ? '#3DAF8A' : categoryNeon(id, s)) })],
    ['a manifest neon disagrees with its scene', () => audit({ sources, towns: [{ id: 'x', scene: { materialColors: {}, neonAuthored: [] }, manifest: { taxonomy: { categories: [{ id: 'dining', neon: '#000000', detail: detailOf('#000000'), colorAuthored: false }] } } }] })],
    ['a manifest detail is stored, not derived', () => audit({ sources, towns: [{ id: 'x', scene: { materialColors: {}, neonAuthored: [] }, manifest: { taxonomy: { categories: [{ id: 'dining', neon: neutralNeon('dining'), detail: '#BBBBBB', colorAuthored: false }] } } }] })],
  ]
  let bad = 0
  for (const [n, run] of cases) { const c = run().f.length > base; if (!c) bad++; console.log(`${c ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

const { f, preBake } = audit({ sources, towns })
console.log(`ⓘ  scenes baked before the town palette (they keep the old palette until their scene is re-baked): ${preBake.join(', ') || 'none — delete the pre-palette branch in categoryColor.js'}`)
if (f.length) { console.log(`⛔ FAIL — ${f.length}\n   ${f.join('\n   ')}`); process.exit(1) }
console.log('✅ a town\'s category colours are its own — authored, or the neutral default; never another town\'s')
