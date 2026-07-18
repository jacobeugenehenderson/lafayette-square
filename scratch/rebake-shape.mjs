// Focused shape.json re-bake (shape freeze only, no slab) — replicates
// bake-ground.js buildTileBakeShape's buildTileGround call with the AUTHORED
// design params, so shape.json carries the current shape + the dead-end cap
// identity (roundTips.skelId/capEnd, threaded by the cap work). The in-app
// Survey-exit freeze didn't persist shape.json (mtime stale), so this
// regenerates it deterministically. Lightweight — no triangulation/slab.
//   run: node scratch/rebake-shape.mjs
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
import { STREET_SMOOTH } from '../src/lib/smoothCenterline.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
import { loadSceneStencil as _loadSceneStencil } from '../cartograph/sceneStencil.js'

const ROOT = process.cwd()
const scene = 'lafayette-square', look = 'lafayette-square'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const design = JSON.parse(fs.readFileSync(`public/looks/${look}/design.json`, 'utf8'))
const stencil = _loadSceneStencil(ROOT, scene)
const surveyPath = `cartograph/data/${scene}/raw/survey.json`
const surveyStreets = fs.existsSync(surveyPath) ? (JSON.parse(fs.readFileSync(surveyPath, 'utf8')).streets || null) : null

const orig = console.log; console.log = () => {}
const pr = buildTileGround(ribbons, {
  stencil: stencil.clipPolygon,
  reportGlean: true,
  surveyStreets,
  curbWidth: Number.isFinite(design.curbWidth) ? design.curbWidth : CURB_WIDTH,
  smooth: STREET_SMOOTH,
  blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1,
  cornerRadiusOverrides: (design.cornerRadiusOverrides && typeof design.cornerRadiusOverrides === 'object') ? design.cornerRadiusOverrides : null,
  cornerCornerRadiusOverrides: (design.cornerCornerRadiusOverrides && typeof design.cornerCornerRadiusOverrides === 'object') ? design.cornerCornerRadiusOverrides : null,
  blockCustoms: (design.blockCustoms && typeof design.blockCustoms === 'object') ? design.blockCustoms : null,
  emitArtifact: true,
})
console.log = orig

const out = { tiles: pr._shapeArtifact, highway: pr.highway || [] }
fs.writeFileSync('public/baked/lafayette-square/shape.json', JSON.stringify(out))

// verify: roundTips now carry cap identity
let rt = 0, withId = 0
for (const t of out.tiles) for (const r of (t.roundTips || [])) { rt++; if (r.skelId && r.capEnd) withId++ }
console.log(`wrote shape.json — ${out.tiles.length} tiles, roundTips ${rt}, WITH cap identity ${withId}`)
