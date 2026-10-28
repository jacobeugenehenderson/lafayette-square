// READ-ONLY: does an embankment's own footprint ring pass the coast's verifier? edge lengths and ringViolations at the ink width.
import { readFileSync, existsSync } from 'node:fs'
const ROOT = new URL('../../', import.meta.url).pathname, D = process.argv[2] || ROOT + 'cartograph/data', t = process.argv[3] || 'provincetown', step = +(process.argv[4] || 0.9987867588490528)
const S = await import(ROOT + 'cartograph/structures.mjs'), Dv = await import(ROOT + 'cartograph/derive.js'), SP = await import(ROOT + 'src/cartograph/streetProfiles.js')
const CF = await import(ROOT + 'cartograph/coastFile.mjs'), { outlineCorner, INK_EPS } = await import(ROOT + 'src/lib/tileGround.js')
const d = `${D}/${t}`, ov = existsSync(`${d}/clean/overlay.json`) ? JSON.parse(readFileSync(`${d}/clean/overlay.json`, 'utf8')).streets || {} : {}
let std = null; const stdF = () => std ??= SP.highwayStandard(JSON.parse(readFileSync(ROOT + 'references/registry.json', 'utf8')), SP.townState(JSON.parse(readFileSync(`${d}/raw/osm.json`, 'utf8'))), new Map())
const e = S.embankmentFootprints(JSON.parse(readFileSync(`${d}/clean/skeleton.json`, 'utf8')).streets, { overlay: ov, std: stdF, tessellate: Dv.tessellateAdaptive, stepM: step })
const acuteAt = (o, p, q) => outlineCorner(o, [{ to: p }, { to: q }], INK_EPS).bad
for (const r of e.rings) { const L = r.map((p, i) => Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1])).sort((a, b) => a - b)
  const v = CF.ringViolations(r, acuteAt, 2 * INK_EPS)
  console.log(`ring ${r.length} v · edges < 10 mm ${L.filter(x => x < 0.01).length}, < step ${L.filter(x => x < step).length}, shortest ${L.slice(0, 5).map(x => (x * 1000).toFixed(1)).join(', ')} mm · violations ${v.length} (${[...new Set(v.map(x => x.kind))].map(k => k + ' ' + v.filter(x => x.kind === k).length).join(', ')})${v.length ? ' first @' + v.slice(0, 4).map(x => '(' + x.at.map(c => c.toFixed(2)).join(', ') + ')').join(' ') : ''}`) }
// what-if (not a patch): the footprint brought to the trace's resolution by the coast's own edge rule, then the verifier again
const res = CF.toResolution(e.rings, step, { acuteAt, clear: 2 * INK_EPS })
for (const r of res.rings) { const L = r.map((p, i) => Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1])); const v = CF.ringViolations(r, acuteAt, 2 * INK_EPS)
  console.log(`after toResolution: ring ${r.length} v · removed ${res.removed.length} (largest move ${(Math.max(0, ...res.removed.map(q => q.devM)) * 1000).toFixed(1)} mm, ${res.removed.reduce((t, q) => t + q.m2, 0).toFixed(3)} m²) · held ${res.held.length} · edges < step ${L.filter(x => x < step).length} · violations ${v.length} (${[...new Set(v.map(x => x.kind))].map(k => k + ' ' + v.filter(x => x.kind === k).length).join(', ')})`) }
