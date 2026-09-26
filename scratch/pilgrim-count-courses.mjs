#!/usr/bin/env node
/**
 * Count the granite courses on Carpenter's 1908 construction plate, "40 feet above the base"
 * (The Pilgrims and Their Monument, 1911; plate facing p.150 = PDF page 207 of the IA scan).
 * Reproduces the measured finding `m-pilgrim-courses-base-to-wash1` in references/registry.json.
 *
 * Method: render the page at 400 ppi (grey), average a vertical strip of the sunlit face
 * across its width, and find the dark bed-joint rows as local minima. The courses between
 * the ground line and the first wash are counted.
 *
 *   node scratch/pilgrim-count-courses.mjs "<path to the IA scan PDF>"
 * Needs `pdftoppm` (poppler). The PDF is Jacob's local copy; it is not committed.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const pdf = process.argv[2]
if (!pdf) { console.error('usage: node scratch/pilgrim-count-courses.mjs <carpenter-1911.pdf>'); process.exit(2) }
const dir = mkdtempSync(join(tmpdir(), 'pilgrim-'))
execFileSync('pdftoppm', ['-f', '207', '-l', '207', '-r', '400', '-gray', pdf, join(dir, 'p')])
const buf = readFileSync(join(dir, 'p-207.pgm'))

// P5 PGM: "P5\n<w> <h>\n<max>\n" then bytes.
const head = buf.toString('latin1', 0, 64).match(/^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/)
const [W, H] = [+head[1], +head[2]], off = head[0].length
const px = (x, y) => buf[off + y * W + x]
if (W !== 2150 || H !== 3317) throw new Error(`unexpected page size ${W}×${H} — not the IA scan this finding was measured on`)

// The sunlit face, left of the door (pixel box at 400 ppi, from the page render).
const X0 = 900, X1 = 1100, Y0 = 640, Y1 = 1790
const prof = []
for (let y = Y0; y < Y1; y++) { let s = 0; for (let x = X0; x < X1; x++) s += px(x, y); prof.push(s / (X1 - X0)) }
const sm = prof.map((_, i) => { let s = 0, n = 0; for (let k = -3; k <= 3; k++) if (prof[i + k] != null) { s += prof[i + k]; n++ } return s / n })
const mins = []
for (let i = 10; i < sm.length - 10; i++) {
  const win = sm.slice(i - 10, i + 11)
  if (sm[i] === Math.min(...win) && Math.max(...win) - sm[i] > 12) mins.push(Y0 + i)
}
// Ground line = the lowest bed; first wash = the setback at y≈1311 on this page.
const GROUND = mins.at(-1), WASH1 = mins.find(y => y >= 1300 && y <= 1320)
const beds = mins.filter(y => y >= WASH1 && y <= GROUND)
const courses = beds.length - 1
console.log(`bed rows (px): ${mins.join(' ')}`)
console.log(`base (y ${GROUND}) → first wash (y ${WASH1}): ${courses} courses; px heights ${beds.slice(1).map((y, i) => y - beds[i]).join(' ')}`)
console.log(`over 16′3″ (195″): mean course ${(195 / courses).toFixed(1)}″`)
