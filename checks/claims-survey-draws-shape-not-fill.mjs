#!/usr/bin/env node
// CLAIM — SURVEY DRAWS SHAPE, NOT FILL, AS SMOOTH LINES (cartograph/SURVEY.md §4 "What is NOT Survey (→ Section): … ADA pads", §7
// "Survey = SHAPE; Section = FILL"; Jacob, 2026-10-28, LS: the ① ink drew as hatches — "These are supposed to be smooth vector
// lines, tints" — and Survey's blue curb showed the ramp cuts).
//   (A) ① was a 0.8 m mitred polylineRibbon round each 10 mm ink strip (SurveyorOverlay#protoNavy): both its sides stroked, and
//       miters clamped at 6 × 0.4 m spiking at every sharp turn. Now ①'s ring edges are hairlines (overlayGeom.js#ringsToEdgeGeo).
//   (B) Survey's blue line was ③'s curb BAND (tg.curb, struck by sectionOpen and cut at every curb ramp) and its fill. Now it is
//       ②'s curb line, the iA rings (tg.block), and Survey mounts no Section layer.
//   (1) SOURCE: protoNavy is ringsToEdgeGeo(protopolygon.rings), drawn as lineSegments, with no polylineRibbon.
//   (2) SOURCE: BlockGeometryV2Debug's Survey branch draws its curb line from tg.block, and mounts no tileGeos.curb, curbCut,
//       crosswalk, sidewalk or treelawn.
//   (3) LS's frozen ①: ringsToEdgeGeo puts every vertex ON its ring, where polylineRibbon(ring, 0.4) throws vertices more than
//       1 m off it.
//   (4) LS's live build (frozen ①, the Look's authoring; Zob's row): tg.block holds a ring round Benton Place's island (88.5,
//       −323.8), and ringsToEdgeGeo(tg.block) draws every one of its edges, holes and islands included.
//   ⛔ A tree without LS's inputs is RED by name, never skipped.
//   MUTANTS (always run): protoNavy back on polylineRibbon → (1) RED · the Survey branch mounting tg.curb → (2) RED · the curb line
//   struck from tg.curb → (2) RED.
//   node checks/claims-survey-draws-shape-not-fill.mjs
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const SO = readFileSync(join(ROOT, 'src/cartograph/SurveyorOverlay.jsx'), 'utf8'), BG = readFileSync(join(ROOT, 'src/cartograph/BlockGeometryV2Debug.jsx'), 'utf8')

const judgeA = (s) => { const a = s.indexOf('const protoNavy = useMemo('), b = a < 0 ? -1 : s.indexOf('}, [protopolygon])', a), body = a < 0 || b < 0 ? '' : s.slice(a, b)
  return /ringsToEdgeGeo\(rings\./.test(body) && !/polylineRibbon\(/.test(body) && /<lineSegments geometry=\{protoNavy\}/.test(s) }
const judgeB = (s) => { const a = s.indexOf('if (surveyActive) {'), b = a < 0 ? -1 : s.indexOf('\n  }\n', a), branch = a < 0 || b < 0 ? '' : s.slice(a, b)
  const fill = ['tileGeos?.curb ', 'tileGeos?.curb)', 'tileGeos.curb}', 'tileGeos?.curbCut', 'tileGeos?.crosswalk', 'tileGeos?.sidewalk', 'tileGeos?.treelawn'].filter(t => branch.includes(t))
  return { fill, ok: /curbLine: ringsToEdgeGeo\(tg\.block,/.test(s) && /<lineSegments geometry=\{tileGeos\.curbLine\}/.test(branch) && !fill.length } }
row(judgeA(SO), `(1) Survey's ① is ringsToEdgeGeo(protopolygon.rings) as lineSegments, with no polylineRibbon: ${judgeA(SO)}`)
{ const J = judgeB(BG); row(J.ok, `(2) Survey's curb line is ②'s (tg.block, iA), and its branch mounts no Section layer${J.fill.length ? ` — it mounts ${J.fill.join(', ')}` : ''}: ${J.ok}`) }

const RIB = join(ROOT, 'src/data/ribbons.json'), S = 'lafayettesquare'
if (!existsSync(RIB) || !existsSync(join(ROOT, 'cartograph/data', S)) || !existsSync(join(ROOT, 'public/looks', S, 'design.json'))) row(false, `LS's inputs (src/data/ribbons.json, cartograph/data/${S}, its Look) are not in this tree — (3) and (4) NOT checked`)
else {
  const ribbons = JSON.parse(readFileSync(RIB, 'utf8')), P = ribbons.protopolygon
  const { ringsToEdgeGeo, polylineRibbon } = await import('../src/cartograph/overlayGeom.js')
  const segd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
  const offRing = (geo, ring) => { const r = [...ring, ring[0]], pos = geo.attributes.position.array; let m = 0
    for (let k = 0; k < pos.length; k += 3) { let d = Infinity; for (let i = 0; i + 1 < r.length; i++) d = Math.min(d, segd([pos[k], pos[k + 2]], r[i], r[i + 1])); m = Math.max(m, d) } return m }
  let lineMax = 0, ribFar = 0
  for (const ring of P.rings) { lineMax = Math.max(lineMax, offRing(ringsToEdgeGeo([ring], 0.1), ring)); const g = polylineRibbon([...ring, ring[0]], 0.4, 0.1); if (g && offRing(g, ring) > 1) ribFar++ }
  row(lineMax < 1e-3 && ribFar > 0, `(3) LS's ① (${P.rings.length} rings): ringsToEdgeGeo's farthest vertex ${(lineMax * 1000).toFixed(2)} mm off its ring · polylineRibbon(ring, 0.4) throws vertices more than 1 m off on ${ribFar} ring(s)`)
  const tg = await import('../src/lib/tileGround.js'), { readBakeDesign, bakeCurbWidth } = await import('../cartograph/lookDesign.mjs'), { curbedMinWidthOf } = await import('../cartograph/curbedMinWidthOf.mjs')
  const { loadSceneStencil } = await import('../cartograph/sceneStencil.js'), { STREET_SMOOTH } = await import('../src/lib/smoothCenterline.js')
  const design = readBakeDesign(S, S, 'claims-survey-draws-shape-not-fill'), quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
  let g = null, why = null
  try { g = quiet(() => tg.buildTileGround(ribbons, { stencil: loadSceneStencil(ROOT, S).clipPolygon, curbWidth: bakeCurbWidth(design, 'claims-survey-draws-shape-not-fill'), curbedMinWidth: curbedMinWidthOf(S), smooth: STREET_SMOOTH,
    blockLandUse: design.blockLandUse || null, cornerRadiusScale: Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1, cornerRadiusOverrides: design.cornerRadiusOverrides || null,
    cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null, blockCustoms: design.blockCustoms || null })) } catch (e) { why = String(e.message) }
  if (why) row(false, `(4) LS's live build REFUSED in this tree — NOT checked: ${why.slice(0, 160)}`)
  else {
  const ISLAND = [88.5, -323.8], inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) c = !c } return c }
  const B = g.block || [], round = B.filter(r => inRing(ISLAND, r)), geo = ringsToEdgeGeo(B, 0.05), edges = B.reduce((t, r) => t + r.length, 0)
  row(round.length >= 1 && geo && geo.attributes.position.count / 2 === edges, `(4) LS's live build: ${round.length} ring(s) of tg.block round Benton Place's island (88.5, −323.8) · Survey's curb line draws ${geo ? geo.attributes.position.count / 2 : 0} of tg.block's ${edges} edges (${B.length} rings)`)
  }
}

// MUTANTS: the source text, edited
for (const [name, edit, judge] of [
  ['protoNavy back on polylineRibbon', () => SO.replace('return ringsToEdgeGeo(rings.filter(r => Array.isArray(r) && r.length >= 2), 0.1)', 'return polylineRibbon(rings[0], 0.4, 0.1)'), (s) => judgeA(s)],
  ['the Survey branch mounting tg.curb', () => BG.replace("        {curbVisible && tileGeos?.curbLine && (", "        {curbVisible && tileGeos?.curb && (<mesh geometry={tileGeos.curb} />)}\n        {curbVisible && tileGeos?.curbLine && ("), (s) => judgeB(s).ok],
  ['the curb line struck from tg.curb', () => BG.replace('curbLine: ringsToEdgeGeo(tg.block,', 'curbLine: ringsToEdgeGeo(tg.curb,'), (s) => judgeB(s).ok],
]) { const m = edit(), base = name.startsWith('protoNavy') ? SO : BG
  if (m === base) { row(false, `mutant (${name}): its anchor is not in the source — re-aim it`); continue }
  row(!judge(m), `mutant: ${name} → ${judge(m) ? 'still GREEN — the row proves nothing' : 'RED as it must be'}`) }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ survey draws shape, not fill, as smooth lines')
process.exit(red ? 1 : 0)
