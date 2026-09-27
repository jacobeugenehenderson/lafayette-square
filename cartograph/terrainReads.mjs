/**
 * terrainReads.mjs — the VALUES the terrain bake reads beyond its raster, in one place.
 *
 * bake-terrain writes the bed under the water (BAKE.md "the bed"): its profile scale comes from the references
 * registry and the town may author its sand size and water clarity in its looks' design.json `water`. ⭐ The bake
 * reads them HERE, and serve.js declares the same call as the terrain step's value input (hashed like a file), so
 * the bake and the dirty-check cannot disagree about what was read — and a Stage slider elsewhere in design.json
 * does not re-bake the terrain. The list is fixed: every key below may be read on any run.
 */
import fs from 'fs'
import { join } from 'path'
import { CARTOGRAPH_DIR } from './config.js'

/** Registry findings the bed reads. */
export const TERRAIN_FINDINGS = ['f-cem-dean-a-table', 'f-cem-nj-beach-d50', 'r-bottom-visibility-default']
/** design.json `water` keys the bed reads. */
export const TERRAIN_WATER_KEYS = ['sandD50Mm', 'secchiM']

const ROOT = join(CARTOGRAPH_DIR, '..')

/** { water: [[lookId, {sandD50Mm?, secchiM?}], …], findings: {id: finding} } for a scene. */
export function terrainValueReads(scene) {
  const idx = JSON.parse(fs.readFileSync(join(ROOT, 'public', 'looks', 'index.json'), 'utf8'))
  const water = []
  for (const l of (idx.looks || []).filter(l => l.scene === scene)) {
    const p = join(ROOT, 'public', 'looks', l.id, 'design.json')
    const w = fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')).water || {}) : {}
    water.push([l.id, Object.fromEntries(TERRAIN_WATER_KEYS.filter(k => w[k] != null).map(k => [k, w[k]]))])
  }
  const reg = JSON.parse(fs.readFileSync(join(ROOT, 'references', 'registry.json'), 'utf8'))
  const findings = {}
  for (const id of TERRAIN_FINDINGS) {
    const f = reg.findings.find(x => x.id === id)
    if (!f) throw new Error(`⛔ the bed needs finding ${id} and references/registry.json has none`)
    findings[id] = f
  }
  return { water, findings }
}
