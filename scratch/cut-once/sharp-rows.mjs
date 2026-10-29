// the SHARPNESS GATE's own rows (gate.mjs#sharpCorners, #classifySharp), on constructed outputs, so each mutant has a row to go RED on:
//  (1) P's own 20° tip, output = P with P's edge lines → a P corner, no error
//  (2) the same tip vertex, the output's two edges on OTHER lines through it → NOT a P corner; the definition (P's open/close keeps
//      the tip squared, not sharp) lacks it → 1 error.  Mutant setPCornerByVertex → 0 errors, RED
//  (3) a method-made 20° spike on a square's wall → 1 error. Mutant setDefinitionAlways (every corner the definition's) → 0, RED
// node scratch/cut-once/sharp-rows.mjs
const G = await import('./gate.mjs')
const R = (pts) => pts.map(([X, Y]) => ({ X, Y })), lines = (r) => r.map((q, i) => [[q.X, q.Y], [r[(i + 1) % r.length].X, r[(i + 1) % r.length].Y]])
const tip = R([[0, 0], [20000, 3527], [0, 7053]]), sq = R([[0, 0], [20000, 0], [20000, 20000], [0, 20000]])
const other = R([[0, 1000], [20000, 3527], [0, 6053]])
const spike = R([[0, 0], [20000, 0], [20000, 20000], [10500, 20000], [10000, 22836], [9500, 20000], [0, 20000]])
const rows = [['P tip, P edges', tip, [tip], [lines(tip)], 0], ['P tip vertex, other lines', tip, [other], [lines(other)], 1], ['spike on a wall', sq, [spike], [lines(spike)], 1]]
let red = 0
for (const [mut, hook] of [[false, null], [true, 'setPCornerByVertex'], [true, 'setDefinitionAlways']]) { G.setPCornerByVertex(hook === 'setPCornerByVertex'); G.setDefinitionAlways(hook === 'setDefinitionAlways')
  for (const [nm, P, out, tags, want] of rows) { const sc = await G.classifySharp(G.sharpCorners(out, [P], tags), [P], 0.9988)
    const ok = sc.errors.length === want; if (!mut && !ok) red++
    console.log(mut ? `MUTANT ${hook}` : 'LIVE', nm, 'errors', sc.errors.length, mut ? (ok ? '(not caught here)' : '→ RED') : ok ? '✅' : `⛔ want ${want}`) } }
G.setPCornerByVertex(false); G.setDefinitionAlways(false); process.exitCode = red ? 1 : 0
