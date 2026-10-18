// walk-why.mjs — read-only: for each walk station over the limit only under a variant (its --json against the base's), the fall
// of D ITSELF across the walk (front · middle · back, asked of the variant deformer) against the drawn fall the gate measured on
// the FIXED mesh: D within the limit and the mesh over it ⇒ the mesh was refined for another D (chord error); D over ⇒ D's own.
//   node walk-why.mjs <base walk json> <variant walk json> <dump.json> <variant groundDeformer.mjs>
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const [aF, bF, dumpF, defF] = process.argv.slice(2), A = JSON.parse(readFileSync(aF, 'utf8')), B = JSON.parse(readFileSync(bF, 'utf8')), dump = JSON.parse(readFileSync(dumpF, 'utf8'))
const town = 'hipointedemun', T = loadSceneTerrain(town), raw = T.getElevationRaw, E = T.exag, design = readBakeDesign(town, town, 'ww'), walkN = resolveWalkNorm(town, null), lawn = resolveLawnNorm(town, null).slopeMax
const sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM, blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM
const LH = lineHeights({ streets: JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets, raw, sigma })
const { buildDeformer } = await import(resolve(defF))
const D = buildDeformer({ town, tiles: dump.tiles, ink: dump.ink, bands: dump.bands, stencil: dump.stencil, raw, line: { step: LH.step, heightAt: (id, p) => LH.heightAt(id, p) }, limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawn, exag: E, blend, sigma } })
const near = (L, p) => L.some(s => Math.hypot(s.at[0] - p[0], s.at[1] - p[1]) < 0.5), lim = walkN.crossSlopeMax
const by = new Map(); let n = 0
for (const s of B.filter(s => !near(A, s.at))) { n++
  const pt = (d) => [s.at[0] + s.n[0] * d, s.at[1] + s.n[1] * d], [w0, w1] = s.walk, wm = (w0 + w1) / 2
  const h = [w0, wm, w1].map(d => D.heightAt(...pt(d)))
  if (h.some(v => v == null)) { by.set('D null at a walk point', (by.get('D null at a walk point') || 0) + 1); continue }
  const fall = Math.max(Math.abs(h[1] - h[0]) / (wm - w0), Math.abs(h[2] - h[1]) / (w1 - wm)) * E
  const k = fall > lim * 1.0001 ? `D ITSELF over the limit (D fall ${(fall * 100).toFixed(1)}% class ${fall > 0.05 ? '> 5%' : '≤ 5%'})` : 'D within the limit — the FIXED mesh chords it (refined for another D)'
  by.set(k.replace(/ \(D fall [^c]*class/, ' (class'), (by.get(k.replace(/ \(D fall [^c]*class/, ' (class')) || 0) + 1) }
console.log(`stations over only under the variant: ${n} · ${[...by].map(([k, v]) => `${k} ${v}`).join(' · ')}`)
