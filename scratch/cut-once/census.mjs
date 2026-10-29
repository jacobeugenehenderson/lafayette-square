// THE FULL REFUSAL CENSUS (BRIEF-provincetown-pours-on-the-port §2.1): a DIAGNOSTIC, scratch only; nothing in the kit catches a refusal.
// The traced water (trace-now.mjs's fixture) through the KIT's open/close (cartograph/openClose.mjs#partsOf, #openCloseCutOnce: what
// structures.mjs#openCloseAtStep runs per part), reporting EVERY refusal, not the first:
//   1 each part whole; a part that builds is done
//   2 a refused part on a grid of TILE m; a refusing tile is split in four, down to MIN m, so a tile's first refusal cannot hide a
//     second: each refusing LEAF is recorded (a refusing tile whose four children all build is recorded at its own size: the
//     refusal needs more than a child holds)
//   3 UNTILED: each distinct site (class + site to 1 m) re-run in a window of WIN m CENTRED on it, so no tile edge is near it:
//     the same class within 1 m → REAL; it builds, or refuses elsewhere → a TILING ARTEFACT (named as such, with what it did)
// → the table: class · real sites · artefacts · m² of the real sites' leaves · each real site
// node scratch/cut-once/census.mjs [provincetown] [--tile=500] [--min=62.5] [--win=250]
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Clipper, ClipType, PolyType, PolyFillType, Paths } = clipperLib
const K = await import('../../cartograph/openClose.mjs')
const arg = (k, d) => +(process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d)
const TILE = arg('tile', 500) * 1000, MIN = arg('min', 62.5) * 1000, WIN = arg('win', 250) * 1000
const scene = process.argv.slice(2).find(a => !a.startsWith('--')) || 'provincetown'
const d = JSON.parse(fs.readFileSync(new URL(`./fixtures/${scene}-traced.json`, import.meta.url), 'utf8')), step = d.fineM
const src = d.traced.map(p => p.map(([X, Y]) => new IntPoint(X, Y)))
const classOf = (msg) => { const s = msg.replace(/^\[[^\]]*\]\s*/, '').replace(/^⛔\s*/, '')
  const clause = /carries tags .*?: ([\w-]+)\. Refusing/.exec(s)?.[1] || (/no forward order fits/.test(s) ? 'no forward order fits both neighbours' : null)
  return (s.split(/\.\s|: the eroded segment|\(detail/)[0].replace(/\([^)]*\)/g, '(…)').replace(/-?\d+(\.\d+)?/g, '#') + (clause ? ` · ${clause}` : '')).slice(0, 120) }
const siteOf = (msg) => { const m = /\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/.exec(msg); return m ? [+m[1], +m[2]] : null }
const clip = (pp, x0, y0, x1, y1) => { const c = new Clipper(), o = new Paths(); c.AddPaths(pp.map(r => r.map(q => new IntPoint(q.X, q.Y))), PolyType.ptSubject, true)
  c.AddPath([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([X, Y]) => new IntPoint(X, Y)), PolyType.ptClip, true); c.Execute(ClipType.ctIntersection, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const m2 = (pp) => pp.reduce((t, q) => t + Clipper.Area(q), 0) / 1e6
const run = (pp, who) => { try { K.openCloseCutOnce(pp, step, who); return null } catch (e) { return String(e.message) } }
const t0 = Date.now(), leaves = [], stats = { parts: 0, partsBuilt: 0, tiles: 0, runs: 0 }
function quad(pp, x0, y0, x1, y1, depth) {
  const o = clip(pp, x0, y0, x1, y1); if (!o.length) return true; stats.runs++
  const why = run(o, `census ${depth}`); if (!why) return true
  if (x1 - x0 <= MIN) { leaves.push({ why, box: [x0, y0, x1, y1], m2: m2(o), size: (x1 - x0) / 1000 }); return false }
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
  const kids = [[x0, y0, mx, my], [mx, y0, x1, my], [x0, my, mx, y1], [mx, my, x1, y1]].map(b => quad(pp, ...b, depth + 1))
  if (kids.every(Boolean)) leaves.push({ why, box: [x0, y0, x1, y1], m2: m2(o), size: (x1 - x0) / 1000, parentOnly: true })
  return false }
const parts = K.partsOf(src, scene); stats.parts = parts.length
for (const pp of parts) { if (!run(pp, 'census part')) { stats.partsBuilt++; continue }
  const xs = pp[0].map(q => q.X), ys = pp[0].map(q => q.Y), X0 = Math.min(...xs), Y0 = Math.min(...ys), X1 = Math.max(...xs), Y1 = Math.max(...ys)
  for (let x = X0; x < X1; x += TILE) for (let y = Y0; y < Y1; y += TILE) { stats.tiles++; quad(pp, x, y, x + TILE, y + TILE, 0) } }
// distinct sites, then each UNTILED in a window centred on it
const sites = new Map()
for (const l of leaves) { const at = siteOf(l.why), c = classOf(l.why), key = `${c}|${at ? at.map(v => Math.round(v)).join(',') : l.box.join(',')}`
  const v = sites.get(key) || sites.set(key, { class: c, at, why: l.why, leaves: 0, m2: 0, parentOnly: 0, sizes: new Set() }).get(key); v.leaves++; v.m2 += l.m2; if (l.parentOnly) v.parentOnly++; v.sizes.add(l.size) }
for (const v of sites.values()) { if (!v.at) { v.verdict = 'no site in the message'; continue }
  const [cx, cy] = v.at.map(t => t * 1000), whole = parts.find(pp => clip(pp, cx - 1, cy - 1, cx + 1, cy + 1).length) || parts[0]
  const o = clip(whole, cx - WIN / 2, cy - WIN / 2, cx + WIN / 2, cy + WIN / 2), why = o.length ? run(o, 'census untiled') : 'empty'
  const at2 = why ? siteOf(why) : null
  v.verdict = !why ? 'ARTEFACT: builds untiled' : classOf(why) === v.class && at2 && Math.hypot(at2[0] - v.at[0], at2[1] - v.at[1]) < 1 ? 'REAL' : `untiled refuses OTHERWISE: ${classOf(why)} at ${JSON.stringify(at2)}` }
const byClass = new Map(); for (const v of sites.values()) { const c = byClass.get(v.class) || byClass.set(v.class, { real: [], other: [] }).get(v.class); (v.verdict === 'REAL' ? c.real : c.other).push(v) }
console.log(`\n=== ${scene}: ${stats.parts} part(s), ${stats.partsBuilt} built whole; ${stats.tiles} tile(s) of ${TILE / 1000} m, split to ${MIN / 1000} m: ${stats.runs} run(s), ${leaves.length} refusing leaf/leaves, ${sites.size} distinct site(s); untiled at ${WIN / 1000} m; ${((Date.now() - t0) / 1000).toFixed(0)} s`)
console.log('class | real sites | not real | m² of the real sites\' leaves | real sites')
for (const [c, v] of [...byClass].sort((a, b) => b[1].real.length - a[1].real.length)) console.log(`${c} | ${v.real.length} | ${v.other.length} | ${v.real.reduce((t, s) => t + s.m2, 0).toFixed(0)} | ${v.real.map(s => `(${s.at.join(', ')})`).join(' ')}`)
console.log('\nnot real:'); for (const v of sites.values()) if (v.verdict !== 'REAL') console.log(`  ${v.class} at ${JSON.stringify(v.at)} → ${v.verdict}`)
fs.writeFileSync(new URL(`./fixtures/${scene}-census.json`, import.meta.url), JSON.stringify({ stats, tile: TILE / 1000, min: MIN / 1000, win: WIN / 1000, sites: [...sites.values()].map(v => ({ ...v, sizes: [...v.sizes], m2: +v.m2.toFixed(1), why: v.why.slice(0, 600) })) }, null, 1))
