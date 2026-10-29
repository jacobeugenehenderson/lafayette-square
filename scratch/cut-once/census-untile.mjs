// census.mjs's unresolved sites ("untiled refuses OTHERWISE": the centred window met a nearer refusal first) re-run in smaller
// centred windows, so each is judged on its own. node scratch/cut-once/census-untile.mjs [provincetown]
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Clipper, ClipType, PolyType, PolyFillType, Paths } = clipperLib
const K = await import('../../cartograph/openClose.mjs')
const scene = process.argv[2] || 'provincetown', d = JSON.parse(fs.readFileSync(new URL(`./fixtures/${scene}-traced.json`, import.meta.url), 'utf8'))
const C = JSON.parse(fs.readFileSync(new URL(`./fixtures/${scene}-census.json`, import.meta.url), 'utf8'))
const parts = K.partsOf(d.traced.map(p => p.map(([X, Y]) => new IntPoint(X, Y))), scene)
const clip = (pp, x0, y0, x1, y1) => { const c = new Clipper(), o = new Paths(); c.AddPaths(pp.map(r => r.map(q => new IntPoint(q.X, q.Y))), PolyType.ptSubject, true)
  c.AddPath([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([X, Y]) => new IntPoint(X, Y)), PolyType.ptClip, true); c.Execute(ClipType.ctIntersection, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const siteOf = (msg) => { const m = /\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/.exec(msg); return m ? [+m[1], +m[2]] : null }
const head = (m) => m.replace(/^\[[^\]]*\]\s*⛔?\s*/, '').slice(0, 70)
for (const v of C.sites.filter(s => s.verdict.startsWith('untiled refuses OTHERWISE'))) { const [cx, cy] = v.at.map(t => t * 1000), whole = parts.find(pp => clip(pp, cx - 1, cy - 1, cx + 1, cy + 1).length) || parts[0], res = []
  for (const W of [100, 60, 30]) { const o = clip(whole, cx - W * 500, cy - W * 500, cx + W * 500, cy + W * 500); let why = null; try { K.openCloseCutOnce(o, d.fineM, 'untile') } catch (e) { why = String(e.message) }
    const at = why && siteOf(why); res.push(`${W} m: ${!why ? 'BUILDS' : at && Math.hypot(at[0] - v.at[0], at[1] - v.at[1]) < 1 ? `REAL (${head(why)})` : `other at ${JSON.stringify(at)} (${head(why)})`}`) }
  console.log(`${head(v.why)} at ${JSON.stringify(v.at)}\n   ${res.join('\n   ')}`) }
