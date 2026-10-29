#!/usr/bin/env node
// CLAIM — THE HERO LADDER TAKES THE HERO OUT BY ITS COVERAGE (2026-10-28, Ferrule; Zob's plan PASS with four edits).
// Depth of field takes the sharp hero back out of the shared blur (HeroLadder.jsx). Its pixels were a STEP on each pixel's
// one depth sample, so an edge pixel whose sample said "hero" put its whole mixed colour, sky included, into the hero at
// coverage 1, and the subtraction cut the sky's share out of the background beside it (LS, on valid depth: −19 … +29
// luminance within 8 px of the Arch). Now:
//   (1) SOURCE, HeroLadder.jsx: level 0 reads the mask's alpha (the hero drawn alone, antialiased: its coverage), less
//       where the scene is nearer than the hero box's nearest corner (uHeroNear, derived per frame in dofDriver.js — no
//       tolerance), and only while the hero is in focus at its own distance (objectLaw(uHeroGround)). No depth step.
//   (2) SOURCE: the mask draws the hero with its OWN materials (so where it is drawn, terrain lift included): a camera on
//       layer 31 alone, no override material; and a hero on screen that nothing draws is said by name and not taken out.
//   (3) PER TOWN, every registered map: each object its Look's keyframes focus has
//       something that draws it — the Arch's `focus:arch` mesh, the town's set-piece (named `focus:<buildingId>` by
//       SetPiece.jsx), or a slab building with geometry in the town's baked buildings.json. A town whose keys focus
//       NOTHING is N/A by name. A focus nothing draws is RED by name.
// THE BROWSER RECEIPTS (in the commit): IoU of the mask against the depth-classed hero, the halo beside the Arch, the
// slab-path spans, the mask's GPU-fenced cost.
//   MUTANTS (always run): heroTap back on the depth step → (1) RED · the mask drawn with an override material → (2) RED ·
//   a planted town whose key focuses an id nothing draws → (3) RED.
//   node checks/claims-the-hero-matte-is-coverage.mjs
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const HL = readFileSync(join(ROOT, 'src/components/HeroLadder.jsx'), 'utf8')

const judgeTap = (s) => { const a = s.indexOf('vec4 heroTap(vec2 uv) {'), tap = a < 0 ? '' : s.slice(a, s.indexOf('\n  }\n', a))
  return /texture2D\(uMask, uv\)\.a/.test(tap) && /step\(uHeroNear, depthToDistance\(depthAt\(uv\)\)\)/.test(tap) && /objectLaw\(uHeroGround\)/.test(tap) && !/blurAmount\(/.test(tap) }
const judgeDraw = (s) => { const a = s.indexOf('_drawMask(renderer, rect, meshes) {'), d = a < 0 ? '' : s.slice(a, s.indexOf('\n  render(renderer', a))
  const r = s.slice(s.indexOf('\n  render(renderer'))
  return /layers\.set\(31\)/.test(d) && /mesh\.layers\.enable\(31\)/.test(d) && /renderer\.render\(scene, this\._maskCam\)/.test(d) && !/overrideMaterial/.test(d)
    && /nothing draws it/.test(r) && /_heroLadderRefs\.on\.current = want && !!meshes\?\.length/.test(r) }
row(judgeTap(HL), `(1) level 0 is the hero's coverage, less what stands in front, while in focus — no depth step: ${judgeTap(HL)}`)
row(judgeDraw(HL), `(2) the mask draws the hero with its own materials (layer 31, no override) and a hero nothing draws is said: ${judgeDraw(HL)}`)

// (3) per town
const { registeredMaps, instanceForMap } = await import('../src/instances/registry.js')
const ARCH = readFileSync(join(ROOT, 'src/components/GatewayArch.jsx'), 'utf8'), SP = readFileSync(join(ROOT, 'src/components/SetPiece.jsx'), 'utf8')
const archNamed = /name="focus:arch"/.test(ARCH), setPieceNamed = /focusName=\{`focus:\$\{id\}`\}/.test(SP)
// the baked slab is not in every tree: it is read where it is (this tree, else the main checkout's public/baked)
const bakedOf = (look) => [join(ROOT, 'public/baked', look, 'buildings.json'), join(ROOT, '../../../public/baked', look, 'buildings.json')].find(existsSync)
const judgeTown = (town, look, design, setPieceId, buildingsJson) => {
  const ids = new Set()
  for (const k of design.heroKeyframes || []) if (typeof k?.focus === 'string' && k.focus) ids.add(k.focus)
  if (!ids.size) return { na: 'no keyframe names a focus object' }
  const why = []
  for (const id of ids) {
    if (id === 'arch') { if (!archNamed) why.push('arch: GatewayArch names no focus:arch mesh'); continue }
    if (id === setPieceId) { if (!setPieceNamed) why.push(`${id}: SetPiece.jsx does not name the set-piece focus:<id>`); continue }
    if (!buildingsJson) { why.push(`${id}: a slab building, and this tree has no baked buildings.json for ${look}`); continue }
    const b = buildingsJson.buildings?.find(x => x.id === id), r = b?.ranges
    if (!b) why.push(`${id}: no such building in ${look}'s slab`)
    else if (!(r?.wall || r?.roof || r?.foundation)) why.push(`${id}: the slab built no geometry for it`)
  }
  return { ids: [...ids], why }
}
const towns = registeredMaps()
for (const t of towns) { const inst = instanceForMap(t), look = inst?.look ?? t, dp = join(ROOT, 'public/looks', look, 'design.json')
  if (!existsSync(dp)) { row(false, `(3) ${t}: no Look at public/looks/${look}/design.json — NOT checked`); continue }
  const bj = bakedOf(look), J = judgeTown(t, look, JSON.parse(readFileSync(dp, 'utf8')), inst?.setPiece?.buildingId, bj ? JSON.parse(readFileSync(bj, 'utf8')) : null)
  if (J.na) console.log(`➖ (3) ${t}: N/A — ${J.na}`)
  else row(!J.why.length, `(3) ${t}: focuses ${J.ids.join(', ')} — ${J.why.length ? J.why.join(' · ') : 'each has something that draws it'}`) }

// MUTANTS
for (const [name, m, judge] of [
  ['heroTap back on the depth step', HL.replace('float m = texture2D(uMask, uv).a * (1.0 - inFront) * inFocus;', 'float m = 1.0 - step(0.02, clamp(blurAmount(depthToDistance(depthAt(uv)), uv), 0.0, 1.0) / max(uMaxBlur, 1e-4));'), judgeTap],
  ['the mask drawn with an override material', HL.replace('    try { renderer.render(scene, this._maskCam) }', '    scene.overrideMaterial = this._white\n    try { renderer.render(scene, this._maskCam) }'), judgeDraw],
]) { if (m === HL) { row(false, `mutant (${name}): its anchor is not in HeroLadder.jsx — re-aim it`); continue }
  row(!judge(m), `mutant: ${name} → ${judge(m) ? 'still GREEN — the row proves nothing' : 'RED as it must be'}`) }
{ const J = judgeTown('planted', 'planted', { heroKeyframes: [{ focus: 'nothing-draws-this' }] }, null, { buildings: [{ id: 'other', ranges: { wall: [0, 3] } }] })
  row(J.why?.length > 0, `mutant: a planted town whose key focuses what nothing draws → ${J.why?.length ? 'RED as it must be' : 'still GREEN — the row proves nothing'}`) }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the hero ladder takes the hero out by its coverage')
process.exit(red ? 1 : 0)
