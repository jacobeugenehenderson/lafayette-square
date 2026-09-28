#!/usr/bin/env node
/**
 * "DOES A LIVE PALETTE DRAG DRAW EXACTLY WHAT A RE-BAKE WOULD?"
 *
 * WHY (BRIEF-live-building-palette, Jacob 2026-09-27: "live retint for every town"). Stage recolours a town's
 * buildings live by recomputing each building's tint in the player (SlabBuildings) instead of re-baking. That is
 * only honest if the player's computation IS the bake's. Both import ONE module, src/lib/buildingTint.js; this
 * check proves it on every baked town: with the palettes the town was baked with, the module reproduces every
 * baked wall and roof colour in buildings.bin EXACTLY (float32). A live drag is that same function with other
 * palettes, so it equals a re-bake.
 *
 * Also:
 *   · a FIXED tint (an operator's override colour) never moves when the palette does;
 *   · no second copy of the tint rules exists (hashStr / roofTintFor / the palette pick) outside the module;
 *   · the towns still on buildings.json v2 are LISTED — a v2 slab draws, but its live retint refuses (Warden's
 *     ruling 2026-09-28); the v2 path is deleted when this list is empty.
 *
 * ⛔ READ-ONLY. Usage: node checks/claims-live-palette-equals-the-bake.mjs [--self-test]
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, relative } from 'path'
import { buildingColors, tintSourceFor } from '../src/lib/buildingTint.js'

const ROOT = new URL('..', import.meta.url).pathname
const BAKED = join(ROOT, 'public/baked')

// The palettes a town's buildings were baked with: its scene.json (v3 carries wallPalettes); a v2 bake recorded
// only the base palette, so its wall palettes are read from the Look's design.json (drift since the bake shows up
// as a mismatch, and is said).
function palettesOf(town, manifest) {
  const scene = JSON.parse(readFileSync(join(BAKED, town, 'scene.json'), 'utf8'))
  const design = existsSync(join(ROOT, 'public/looks', town, 'design.json')) ? JSON.parse(readFileSync(join(ROOT, 'public/looks', town, 'design.json'), 'utf8')) : {}
  return { palette: scene.palette, wallPalettes: manifest.version >= 3 ? (scene.wallPalettes ?? {}) : (design.wallPalettes ?? {}) }
}

export function auditTown(town, manifest, bin, palettes, colorsFor = buildingColors) {
  const out = { town, checked: 0, bad: [] }
  const groupOf = (kind, id) => manifest.groups.find(g => g.kind === kind && g.id === id)
  for (const e of manifest.buildings) {
    const tint = manifest.version >= 3 ? e.tint : tintSourceFor({ wallMaterial: e.wallMaterial }, palettes)
    if (!tint) { out.bad.push(`${e.id}: no tint source in a v${manifest.version} index`); continue }
    const want = colorsFor(e.id, tint, e.roofMaterial, palettes)
    for (const [kind, id, rgb] of [['wall', e.wallMaterial, want.wall], ['roof', e.roofMaterial, want.roof]]) {
      const r = e.ranges?.[kind]; if (!r) continue
      const g = groupOf(kind, id); if (!g) { out.bad.push(`${e.id}: no ${kind} group "${id}"`); continue }
      const colors = new Float32Array(bin, g.colorByteOffset, g.vertexCount * 3)
      const [start, count] = r
      for (let v = start; v < start + count; v++) {
        for (let c = 0; c < 3; c++) if (colors[v * 3 + c] !== Math.fround(rgb[c])) {
          if (out.bad.length < 5) out.bad.push(`${e.id} ${kind} vertex ${v}: baked ${colors.slice(v * 3, v * 3 + 3).map(x => x.toFixed(4)).join(',')} ≠ module ${rgb.map(x => x.toFixed(4)).join(',')}`)
          out.mismatch = (out.mismatch || 0) + 1
          v = start + count; break
        }
      }
      out.checked++
    }
  }
  return out
}

// ── no second copy of the tint rules
function copies() {
  const hits = []
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (n === 'node_modules' || n === '_archive' || n.startsWith('.')) continue; if (statSync(p).isDirectory()) walk(p); else if (/\.(m?js|jsx)$/.test(n)) {
    const s = readFileSync(p, 'utf8'); const rel = relative(ROOT, p)
    if (rel === 'src/lib/buildingTint.js') continue
    if (/function\s+(hashStr|roofTintFor|effectiveBuildingColor)\s*\(/.test(s) || /\[\s*hashStr\([^)]*\)\s*%\s*\w+\.length\s*\]/.test(s)) hits.push(rel)
  } } }
  walk(join(ROOT, 'src')); walk(join(ROOT, 'cartograph'))
  return hits
}

const towns = readdirSync(BAKED).filter(t => existsSync(join(BAKED, t, 'buildings.json')) && existsSync(join(BAKED, t, 'scene.json')))
function load(t) {
  const manifest = JSON.parse(readFileSync(join(BAKED, t, 'buildings.json'), 'utf8'))
  const buf = readFileSync(join(BAKED, t, manifest.bin))
  return { manifest, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
}

if (process.argv.includes('--self-test')) {
  const t = towns.find(x => x === 'huron') || towns[0]
  const { manifest, bin } = load(t), pal = palettesOf(t, manifest)
  const cases = [
    ['the module picks another slot', () => auditTown(t, manifest, bin, pal, (id, tint, roof, p) => buildingColors(id + 'x', tint, roof, p)).mismatch > 0],
    ['the roof recipe drifts', () => auditTown(t, manifest, bin, pal, (id, tint, roof, p) => { const c = buildingColors(id, tint, roof, p); return { ...c, roof: c.roof.map(x => x * 1.01) } }).mismatch > 0],
    ['a fixed tint follows the palette', () => { const b = { id: 'x', tint: { fixed: '#123456' } }; return buildingColors(b.id, b.tint, 'slate', { palette: ['#ff0000'] }).wall.join() === buildingColors(b.id, b.tint, 'slate', { palette: ['#00ff00'] }).wall.join() ? false : true }],
  ]
  // The third case asserts the property directly: it is "caught" when a fixed tint DOES move, so invert it.
  cases[2][1] = () => buildingColors('x', { fixed: '#123456' }, 'slate', { palette: ['#ff0000'] }).wall.join() !== buildingColors('x', { fixed: '#123456' }, 'slate', { palette: ['#00ff00'] }).wall.join()
  let bad = 0
  for (const [n, run, expectCaught = true] of cases) { const r = run(); const ok = n.startsWith('a fixed') ? !r : r; if (!ok) bad++; console.log(`${ok ? '✅ caught' : '⛔ MISSED'} — ${n}`) }
  process.exit(bad ? 1 : 0)
}

let failed = 0
const v2 = []
for (const t of towns) {
  const { manifest, bin } = load(t)
  if (manifest.version < 3) v2.push(t)
  const r = auditTown(t, manifest, bin, palettesOf(t, manifest))
  if (r.bad.length) { failed++; console.log(`⛔ ${t} (v${manifest.version}): ${r.mismatch ?? r.bad.length} mismatch(es) over ${r.checked} ranges\n     ${r.bad.join('\n     ')}`) }
  else console.log(`✅ ${t} (v${manifest.version}): the module reproduces all ${r.checked} baked wall/roof ranges exactly`)
}
const fixedMoves = buildingColors('x', { fixed: '#123456' }, 'slate', { palette: ['#ff0000'] }).wall.join() !== buildingColors('x', { fixed: '#123456' }, 'slate', { palette: ['#00ff00'] }).wall.join()
if (fixedMoves) { failed++; console.log('⛔ a fixed tint moves with the palette') } else console.log('✅ a fixed tint never moves with the palette')
const dup = copies()
if (dup.length) { failed++; console.log(`⛔ a second copy of the tint rules: ${dup.join(', ')} — import src/lib/buildingTint.js`) } else console.log('✅ one tint module')
console.log(`ⓘ  still on buildings.json v2 (draw; live retint refuses until re-baked): ${v2.join(', ') || 'none — delete the v2 path'}`)
if (failed) { console.log(`\n⛔ FAIL — ${failed}`); process.exit(1) }
console.log('\n✅ a live palette drag draws what a re-bake would, on every baked town')
