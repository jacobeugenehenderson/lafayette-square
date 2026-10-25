// node --import ./scratch/zob-2026-10-22/crease-census/reg.mjs scratch/zob-2026-10-22/crease-census/fixture.mjs   (light)
// A planted edge from (−10, −1) to (10, 1) m (the line z = x/10) and two crease cells below it, each with one vertex in the
// √2/2-step band: at (7, 0) units, 0.697 step off the line, the line runs through [6.5, 7.5) at z 0.65–0.75, missing the
// pixel [−0.5, 0.5) ⇒ BAND ONLY; at (5005, 500), 0.497 step off, the line runs at z 500.45–500.55, inside [499.5, 500.5) ⇒
// THE SQUARE. Expected: 2 T-join inserts into the edge, 1 in the square, 1 band only. Must also refuse to count nothing.
import clipperLib from 'clipper-lib'
import { cutCreases } from '../../../cartograph/kerbLift.mjs'
import { startCensus, line, entersPixel } from './census.mjs'
const T = startCensus(), IP = (x, y) => new clipperLib.IntPoint(x, y)
const groups = [{ key: 'asphalt', items: [{ outer: [[-10, -1], [10, 1], [10, 10], [-10, 10]], holes: [] }] }]
const cells = [[IP(7, 0), IP(6, -5), IP(8, -5)], [IP(5005, 500), IP(5004, 495), IP(5006, 495)]]
cutCreases(groups, cells)
console.log(line('planted', T))
// the census's own square test, on the two hand-computed points
const sq = [entersPixel([-10000, -1000], [10000, 1000], [7, 0]), entersPixel([-10000, -1000], [10000, 1000], [5005, 500])]
const ok = T.done && T.tjoin === 2 && T.square === 1 && T.bandOnly === 1 && !sq[0] && sq[1]
console.log(`${ok ? '✅' : '⛔'} planted: expected 2 · 1 · 1 (square test by hand: (7,0) ${sq[0]} must be false, (5005,500) ${sq[1]} must be true)`)
process.exit(ok ? 0 : 1)
