// why-at.mjs — the deformer's D and WHY at given points (a make-why.mjs copy). node why-at.mjs --dump=… --why=… --at='x,z;x,z'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const town = 'hipointedemun', T = loadSceneTerrain(town), raw = T.getElevationRaw, design = readBakeDesign(town, town, 'why-at'), walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null)
const sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM, blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM
const LH = lineHeights({ streets: JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets, raw, sigma }), dump = JSON.parse(readFileSync(arg('dump'), 'utf8'))
const { buildDeformer } = await import(resolve(arg('why')))
const D = buildDeformer({ town, tiles: dump.tiles, bands: dump.bands, stencil: dump.stencil, raw, line: { step: LH.step, heightAt: LH.heightAt }, limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: T.exag, blend, sigma } })
for (const [x, z] of arg('at').split(';').map(p => p.split(',').map(Number))) { const w = D._why(x, z), t = w.why?.t != null ? dump.tiles[w.why.t] : null, run = t && w.why.stamp != null ? t.runs[w.why.stamp] : null
  console.log(`(${x}, ${z}): D ${w.v?.toFixed(3)} · terrain ${raw(x, z).toFixed(3)} · ${w.why?.branch ?? (w.v == null ? 'null' : '—')} · owner ${w.owner} ${run ? `(${run.skelId}·${run.side}·${run.segOrd})` : w.why?.arc != null ? `(arc ${w.why.arc})` : ''} · station d ${w.why?.d?.toFixed(2)} · line there ${run ? LH.heightAt(run.skelId, [x, z])?.toFixed(3) : '—'}`) }
