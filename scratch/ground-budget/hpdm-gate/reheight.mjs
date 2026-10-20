// reheight.mjs — a SCRATCH copy of a slab whose baked terrain part (aRaw) is re-heighted by another deformer on the SAME
// mesh (not re-refined): every vertex of every group with an aRaw takes D (null → the terrain, as bake-ground draws it).
// For the slab-only checks (road crease, stripe, walls) as a preview by count. Nothing served; writes only --out.
//   node --max-old-space-size=6000 reheight.mjs --slab=<dir> --dump=<producer dump with ink> --deformer=<groundDeformer.mjs> --out=<dir> [--line=<lineHeight.mjs>]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs'
import { join, resolve } from 'path'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const dir = arg('slab'), out = arg('out'), gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = Buffer.from(readFileSync(join(dir, gj.bin)))
const town = gj.look, design = readBakeDesign(town, town, 'reheight'), T = loadSceneTerrain(town), raw = T.getElevationRaw
const walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null)
const blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM, sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
const rib = JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets
const dump = JSON.parse(readFileSync(arg('dump'), 'utf8'))
if (!Array.isArray(dump.ink)) throw new Error('reheight: the dump carries no ink — re-run the producer with make-producer.mjs')
const { buildDeformer } = await import(resolve(arg('deformer')))
// --line=<lineHeight module>: another line lookup (default the worktree's)
const { lineHeights } = await import(resolve(arg('line') || '.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'))
const LH = lineHeights({ streets: rib, raw, sigma }), line = { step: LH.step, heightAt: (id, p) => { if (id === '__water__') throw new Error('reheight: a coast — the high water is not wired here'); return LH.heightAt(id, p) } }
const t0 = Date.now()
// --pieces: pass the dump's band pieces (a band-blend deformer); BAND_WEIGHTS=equal for the counterfactual
const D = buildDeformer({ town, tiles: dump.tiles, ink: dump.ink, bands: dump.bands, stencil: dump.stencil, raw, line, ...(process.argv.includes('--pieces') ? { pieces: dump.bandPieces } : {}), limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: T.exag, blend, sigma, ...(process.env.BAND_WEIGHTS ? { bandWeights: process.env.BAND_WEIGHTS } : {}) } })
let n = 0, moved = 0, worst = 0
for (const g of gj.groups) { if (g.rawByteOffset == null) continue
  const P = new Float32Array(buf.buffer, buf.byteOffset + g.vertexByteOffset, g.vertexCount * 3), R = new Float32Array(buf.buffer, buf.byteOffset + g.rawByteOffset, g.vertexCount)
  for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2], d = D.heightAt(x, z), h = Math.fround(d ?? raw(x, z))
    const dv = Math.abs(h - R[v]); if (dv > 1e-4) moved++; if (dv > worst) worst = dv; R[v] = h; n++ } }
mkdirSync(out, { recursive: true })
writeFileSync(join(out, gj.bin), buf); copyFileSync(join(dir, 'ground.json'), join(out, 'ground.json')); copyFileSync(join(dir, 'shape.json'), join(out, 'shape.json'))
if (D.unownedSites) { const by = new Map(); for (const u of D.unownedSites) { const k = `${u.why}`; by.set(k, (by.get(k) || 0) + 1) }
  console.log(`reheight: unowned (null → the terrain drawn): ${D.unownedSites.length} · ${[...by].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${v} × ${k}`).join(' · ')}`)
  writeFileSync(join(out, 'unowned.json'), JSON.stringify(D.unownedSites)) }
console.log(`reheight: ${n} vertices · ${moved} moved > 0.1 mm · worst ${worst.toFixed(3)} m raw · stats ${JSON.stringify(D.stats)} · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
