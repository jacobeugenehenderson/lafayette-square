// walk-new.mjs — read-only: for each walk station over the limit only after the sweep, where its walk lies: inside the block (iA) or on the road side of ②, and what answers there
import { readFileSync } from 'fs'
import { resolve } from 'path'
const [dumpF, defF, aF, bF] = process.argv.slice(2), dump = JSON.parse(readFileSync(dumpF, 'utf8')), { buildDeformer } = await import(resolve(defF))
const D = buildDeformer({ town: 'hipointedemun', tiles: dump.tiles, ink: dump.ink, bands: dump.bands, stencil: dump.stencil, raw: () => 0, line: { step: 1, heightAt: () => 0 }, limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 } })
const A = JSON.parse(readFileSync(aF, 'utf8')), B = JSON.parse(readFileSync(bF, 'utf8')), near = (L, p) => L.some(s => Math.hypot(s.at[0] - p[0], s.at[1] - p[1]) < 0.5)
for (const s of B.filter(s => !near(A, s.at))) { const out = []
  for (const f of [0, 0.5, 1]) { const d = s.walk[0] + f * (s.walk[1] - s.walk[0]), x = s.at[0] + s.n[0] * d, z = s.at[1] + s.n[1] * d, s0 = { ...D.stats }; D.heightAt(x, z)
    const k = Object.keys(D.stats).filter(k => D.stats[k] !== s0[k] && k !== 'rays').join('+') || 'memo', e = D.explain(x, z); out.push(`${k}${e.inBlock === false ? '/road side' : ''}`) }
  console.log(`${s.key} at (${s.at.map(v => v.toFixed(1)).join(', ')}) fall ${(s.fall * 100).toFixed(1)}% · walk ${s.walk.map(v => v.toFixed(1)).join('–')} m · front/mid/back: ${out.join(' · ')}`) }
