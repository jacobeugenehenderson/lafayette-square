// Splice fixture: booleanLabelled at a BASE commit vs the working tree, for every argument shape the THREE non-mint
// callers pass (the over-union: `false`, as a tree · the two ② differences: `true`, with and without a payload). The
// mint's own shape (`{ sameStroke, preserveCollinear }`, R and D) changes by design and is not judged here; the mutant
// shows the opt-in option bites. Writes two temp copies of tileGround.js beside it (exporting booleanLabelled) and
// removes them.
//   node scratch/splice/bl-fixture.mjs [--base=<commit>]   (default e8149227, the brief's base)
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const base = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'e8149227'
const tail = '\nexport { booleanLabelled as __bl }\n'
const OLD = 'src/lib/__splice_old.js', NEW = 'src/lib/__splice_new.js'
writeFileSync(OLD, execFileSync('git', ['show', `${base}:src/lib/tileGround.js`], { encoding: 'utf8', maxBuffer: 1 << 26 }) + tail)
writeFileSync(NEW, readFileSync('src/lib/tileGround.js', 'utf8') + tail)
let bad = 0, flat = false
try {
  const [O, N] = await Promise.all([import('../../' + OLD), import('../../' + NEW)])
  const { default: clipperLib } = await import('clipper-lib'), CT = clipperLib.ClipType
  // rings with exactly-collinear vertices (midpoints on straight edges) and overlaps, so the collinear drop is exercised
  const sq = (x, y, s) => [[x, y], [x + s / 2, y], [x + s, y], [x + s, y + s / 2], [x + s, y + s], [x, y + s]]
  const A = sq(0, 0, 10), B = sq(5, 5, 10), C = sq(2, 2, 3), lab = (r, k) => r.map((_, i) => k * 100 + i)
  const cases = [
    ['union, no ledger', [CT.ctUnion, [A, B], [lab(A, 1), lab(B, 2)], [], null, false]],
    ['union, no ledger, as a tree (the over-union)', [CT.ctUnion, [A, B], [lab(A, 1), lab(B, 2)], [], null, false, true]],
    ['difference, ledger true (a ② difference)', [CT.ctDifference, [A, B], [lab(A, 1), lab(B, 2)], [C], [lab(C, 3)], true]],
    ['difference, ledger true, payload (a ② difference)', [CT.ctDifference, [A], [lab(A, 1)], [C], [lab(C, 3)], true, false, { subject: [A.map((_, i) => i)], clip: [C.map(() => 'c')] }]],
  ]
  for (const [name, args] of cases) { const a = JSON.stringify(O.__bl(...args)), b = JSON.stringify(N.__bl(...args)); if (a !== b) bad++; console.log(`${a === b ? '✅ identical' : '⛔ DIFFERS '} ${name}`) }
  const on = N.__bl(CT.ctUnion, [A, B], [lab(A, 1), lab(B, 2)], [], null, { sameStroke: () => false, preserveCollinear: true }), off = N.__bl(CT.ctUnion, [A, B], [lab(A, 1), lab(B, 2)], [], null, { sameStroke: () => false })
  flat = on.rings[0].length === off.rings[0].length
  console.log(`   ${flat ? '⛔' : '✅'} mutant: preserveCollinear ON keeps ${on.rings[0].length} vertices, OFF ${off.rings[0].length} (must differ)`)
} finally { unlinkSync(OLD); unlinkSync(NEW) }
console.log(bad || flat ? `\n⛔ RED — a non-mint caller's output moved vs ${base}, or the option does not bite` : `\n✅ GREEN — the three non-mint callers are byte-identical to ${base}`)
process.exit(bad || flat ? 1 : 0)
