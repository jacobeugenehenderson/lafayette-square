// ONE TRACE of a PTown wide-fill refusal (BRIEF-provincetown-pours-on-the-port §2.2, class 1): the traced water cropped to a window
// centred on the site, through the candidate (cand3.mjs, its STAGES), stage by stage against the definition (clipper, 1000× finer).
// node scratch/cut-once/widefill-trace.mjs X Y [W m]   (metres)
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, PolyTree, Paths, JoinType, EndType } = clipperLib
const C3 = await import('./cand3.mjs')
const [X, Y, W = 30] = process.argv.slice(2).map(Number), d = JSON.parse(fs.readFileSync(new URL('./fixtures/provincetown-traced.json', import.meta.url), 'utf8')), step = d.fineM, h = step / 2 * 1000
const clip = (pp, x0, y0, x1, y1) => { const c = new Clipper(), o = new Paths(); c.AddPaths(pp, PolyType.ptSubject, true); c.AddPath([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([a, b]) => new IntPoint(a, b)), PolyType.ptClip, true); c.Execute(ClipType.ctIntersection, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const src = d.traced.map(p => p.map(([a, b]) => new IntPoint(a, b))), cx = X * 1000, cy = Y * 1000, crop = clip(src, cx - W * 500, cy - W * 500, cx + W * 500, cy + W * 500)
fs.writeFileSync(new URL('./fixtures/ptown-widefill-crop.json', import.meta.url), JSON.stringify({ note: `PTown traced water, ${W} m round (${X}, ${Y})`, fineM: step, paths: crop.map(p => p.map(q => [q.X, q.Y])) }))
const F = 1000, up = (pp) => pp.map(p => p.map(q => new IntPoint(q.X * F, q.Y * F)))
const off = (pp, dl) => { const co = new ClipperOffset(2), o = new Paths(); co.AddPaths(pp, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, dl); return o }
const op = (t, a, b) => { const c = new Clipper(), o = new Paths(); c.AddPaths(a, PolyType.ptSubject, true); if (b) c.AddPaths(b, PolyType.ptClip, true); c.Execute(t, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const A = (pp) => +(pp.reduce((t, q) => t + Clipper.Area(q), 0) / F / F / 1e6).toFixed(3), ar = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.X * q.Y - q.X * p.Y } return +(a / 2e6).toFixed(3) }
let why = null; try { C3.openCloseProvenance(crop, step, 'widefill') } catch (e) { why = String(e.message).slice(0, 260) }
console.log('refusal:', why)
const P = up(op(ClipType.ctUnion, crop)), Hf = h * F, dErode = off(P, -Hf), dOpen = op(ClipType.ctIntersection, off(dErode, Hf), P), dDil = off(dOpen, Hf), dClosed = op(ClipType.ctUnion, [...dOpen, ...off(dDil, -Hf)])
const S = C3.STAGES, ours = { erode: S.erode, open: S.open, dilate: S.dilate, closedK: S.closedK }, def = { erode: dErode, open: dOpen, dilate: dDil, closedK: dClosed }
for (const st of ['erode', 'open', 'dilate', 'closedK']) { const o = ours[st] ? up(ours[st]) : []
  const co = op(ClipType.ctDifference, o, def[st]), dn = op(ClipType.ctDifference, def[st], o)
  console.log(`${st}: ours ${ours[st]?.length ?? '—'} ring(s) [${(ours[st] || []).map(ar).join(', ')}] · def ${def[st].length} [${def[st].map(q => +(Clipper.Area(q) / F / F / 1e6).toFixed(3)).join(', ')}] · ours−def ${A(co)} m² · def−ours ${A(dn)} m²`) }
