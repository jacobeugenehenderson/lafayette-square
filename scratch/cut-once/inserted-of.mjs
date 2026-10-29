// is a point a vertex the noding INSERTED (cand3.mjs#INSERTED: a hot pixel, src null), and into which emitted segment?
// node scratch/cut-once/inserted-of.mjs <fixture> x,y …   (units)
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { openCloseProvenance, INSERTED, ORIGIN } from './cand3.mjs'
const { IntPoint } = clipperLib
const d = JSON.parse(fs.readFileSync(new URL(`./fixtures/${process.argv[2] === 'huron' ? 'huron-traced' : 'ptown-deck-inputs'}.json`, import.meta.url), 'utf8'))
const src = process.argv[2] === 'huron' ? d.traced.map(p => p.map(([X, Y]) => new IntPoint(X, Y))) : d.inputs.flat().map(p => p.map(q => new IntPoint(q.X, q.Y)))
try { openCloseProvenance(src, d.fineM, process.argv[2]) } catch (e) { console.log('(run refused:', String(e.message).slice(0, 70), '…)') }
for (const a of process.argv.slice(3)) { const all = INSERTED.get(a) || []; console.log(a, all.length ? `inserted in: ${all.map(x => x.who).join(' · ')}` : 'not noding-inserted'); const ins = all[0], seg = ins?.seg
  const dSeg = seg ? (() => { const [x, y] = a.split(',').map(Number), ex = seg[1][0] - seg[0][0], ey = seg[1][1] - seg[0][1], L2 = ex * ex + ey * ey, t = Math.max(0, Math.min(1, ((x - seg[0][0]) * ex + (y - seg[0][1]) * ey) / L2)); return Math.hypot(x - seg[0][0] - t * ex, y - seg[0][1] - t * ey).toFixed(3) })() : null
  console.log(a, ins ? `INSERTED by the noding in ${ins.who}, into the emitted segment ${JSON.stringify(seg)}, ${dSeg} u from it` : 'not noding-inserted', '· origin', ORIGIN.get(a) || '—') }
