// a planted row for the inside-one-run ruling from Huron's own water: the traced water clipped to a box round the close's refusal
// at (−4326.715, −3328.738), kept only if it reproduces (live: stat.insideRun > 0 and builds; setInsideRunForward: refuses).
// Writes fixtures/huron-inside-run-crop.json. node scratch/cut-once/inside-run-crop.mjs
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Clipper, ClipType, PolyType, PolyFillType, Paths } = clipperLib
const G = await import('./gate.mjs'), C3 = await import('./cand3.mjs')
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/huron-traced.json', import.meta.url), 'utf8')), src = G.ip(d.traced), cx = -4326715, cy = -3328738
for (const half of [15000, 25000, 40000, 60000]) {
  const box = [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half]].map(([X, Y]) => new IntPoint(X, Y)), c = new Clipper(), o = new Paths()
  c.AddPaths(src, PolyType.ptSubject, true); c.AddPath(box, PolyType.ptClip, true); c.Execute(ClipType.ctIntersection, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  let live, mut; C3.setInsideRunForward(false); try { live = C3.openCloseProvenance(o, d.fineM, 'crop').stat.insideRun || 0 } catch (e) { live = 'REFUSED ' + String(e.message).slice(0, 80) }
  C3.setInsideRunForward(true); try { C3.openCloseProvenance(o, d.fineM, 'crop'); mut = 'built' } catch (e) { mut = 'REFUSED ' + String(e.message).slice(0, 80) }
  C3.setInsideRunForward(false); console.log(JSON.stringify({ halfM: half / 1000, rings: o.length, pts: o.reduce((t, r) => t + r.length, 0), live, mut }))
  if (live > 0 && mut.startsWith('REFUSED')) { fs.writeFileSync(new URL('./fixtures/huron-inside-run-crop.json', import.meta.url), JSON.stringify({ note: `Huron's traced water clipped to ±${half / 1000} m round (-4326.715, -3328.738) (inside-run-crop.mjs)`, fineM: d.fineM, paths: o.map(r => r.map(q => [q.X, q.Y])) })); console.log('written'); break } }
