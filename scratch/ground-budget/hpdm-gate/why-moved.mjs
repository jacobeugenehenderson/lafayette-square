// why-moved.mjs — read-only: for ped/face vertices the sweep moved (ped-moved.json), which branch answers now (tile? in iA? ink?)
import { readFileSync } from 'fs'
import { resolve } from 'path'
const dump = JSON.parse(readFileSync(process.argv[2], 'utf8')), { buildDeformer } = await import(resolve(process.argv[3])), L = JSON.parse(readFileSync(process.argv[4], 'utf8'))
const D = buildDeformer({ town: 'hipointedemun', tiles: dump.tiles, ink: dump.ink, bands: dump.bands, stencil: dump.stencil, raw: () => 0, line: { step: 1, heightAt: () => 0 }, limits: { walkMax: 0.02, lawnMax: null, exag: 1, blend: 1, sigma: 1 } })
const by = new Map(), ex = []
for (const [d, g, x, z] of L) { const s0 = { ...D.stats }; D.heightAt(x, z); const k = Object.keys(D.stats).filter(k => D.stats[k] !== s0[k] && k !== 'rays').join('+') || 'memo'
  const e = D.explain(x, z), key = `${d >= 0.1 ? '≥10cm' : '<10cm'} ${k}${e.inBlock === false ? ' (outside iA)' : ''}`; by.set(key, (by.get(key) || 0) + 1); if (d >= 0.1 && ex.length < 6) ex.push(`${g} (${x.toFixed(2)}, ${z.toFixed(2)}) ${k} d② ${e.d?.toFixed(3)}`) }
console.log([...by].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')); console.log(ex.join('\n'))
