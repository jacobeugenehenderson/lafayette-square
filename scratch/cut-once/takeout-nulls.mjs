// the take-out's tagged booleans on the v5 PTown fixture, deck by deck: how many edges of each result carry no birth line.
// node scratch/cut-once/takeout-nulls.mjs
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint } = clipperLib
const K = await import('../../cartograph/openClose.mjs')
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8')), coast = fx('ptown-coast'), sd = fx('ptown-street-decks')
const toP = (r) => r.map(([x, z]) => new IntPoint(Math.round(x * 1000), Math.round(z * 1000)))
const water = coast.water.flatMap(bd => [bd.outer, ...bd.holes]), cellU = coast.fineM * 1000
const nulls = (rs) => `${rs.reduce((t, r) => t + r.filter(q => q.tag == null).length, 0)} of ${rs.reduce((t, r) => t + r.length, 0)}`
const waterT = K.tagOwn(water.map(toP)), decksT = sd.rings.map(d => K.tagOwn([toP(d)]))
const w0 = K.boolOf('minus', waterT, decksT.flat(), 'w0'); console.log('w0', nulls(w0))
const D = decksT[0], g2 = K.growBy(D, 2 * cellU, 'd0'); console.log('grow 2 cells', nulls(g2))
const loc = K.boolOf('intersect', w0, g2, 'loc'); console.log('loc', nulls(loc))
const nul = []; loc.forEach(r => r.forEach((q, i) => { if (q.tag == null && nul.length < 4) { const w = r[(i + 1) % r.length]; nul.push([[q.X, q.Y], [w.X, w.Y]]) } })); console.log(JSON.stringify(nul))
// deck 0's own edges and loc's edges near the refusal (210589.41, 219339.52), with their lines
const at = [210589, 219340], near = (q) => Math.hypot(q.X - at[0], q.Y - at[1]) < 3000
D[0].forEach((q, i) => { const w = D[0][(i + 1) % D[0].length]; if (near(q) || near(w)) console.log('D', i, [q.X, q.Y], '→', [w.X, w.Y], 'len', Math.hypot(w.X - q.X, w.Y - q.Y).toFixed(1)) })
loc.forEach((r, k) => r.forEach((q, i) => { const w = r[(i + 1) % r.length]; if (near(q) || near(w)) console.log('loc', k, i, [q.X, q.Y], '→', [w.X, w.Y], 'line', JSON.stringify(q.tag)) }))
