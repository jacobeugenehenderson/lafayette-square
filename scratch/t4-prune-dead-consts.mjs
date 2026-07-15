/**
 * t4-prune-dead-consts — [T4 2026-07-14] throwaway
 *
 * Iteratively removes component-scope `const X = …` declarations that nothing
 * references, to a fixpoint. Used once to prune the memos orphaned by deleting
 * the figure-ground render branch. Balanced paren/brace/bracket scan from the
 * declaration start, so multi-line useMemo bodies come out whole.
 *
 * Refuses to touch a KEEP-listed name. Prints every removal for review.
 * usage: node scratch/t4-prune-dead-consts.mjs <file> [--apply]
 */
import { readFileSync, writeFileSync } from 'fs'

const FILE = process.argv[2]
const APPLY = process.argv.includes('--apply')

// Live outputs + anything with a side effect — never prune these even if the
// reference counter thinks they're unused.
const KEEP = new Set(['isTileScene'])

const stripped = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')

// Walk from the `const` line until every (, [, { opened has closed and we're at
// a statement end. Returns [startLine, endLine] inclusive, 0-indexed.
function declRange(lines, start) {
  let depth = 0, inStr = null
  for (let i = start; i < lines.length; i++) {
    const l = lines[i]
    for (let j = 0; j < l.length; j++) {
      const c = l[j], prev = l[j - 1]
      if (inStr) { if (c === inStr && prev !== '\\') inStr = null; continue }
      if (c === "'" || c === '"' || c === '`') { inStr = c; continue }
      if (c === '/' && l[j + 1] === '/') break
      if ('([{'.includes(c)) depth++
      else if (')]}'.includes(c)) depth--
    }
    if (depth <= 0) return [start, i]
  }
  throw new Error('unbalanced from line ' + (start + 1))
}

let src = readFileSync(FILE, 'utf8')
const removed = []
for (let round = 1; round <= 12; round++) {
  const lines = src.split('\n')
  const code = stripped(src)
  const decls = []
  lines.forEach((l, i) => {
    const m = l.match(/^  const (\w+)\s*=/)
    if (m && !KEEP.has(m[1])) decls.push({ name: m[1], line: i })
  })
  const dead = decls.filter(d =>
    (code.match(new RegExp('\\b' + d.name + '\\b', 'g')) || []).length <= 1)
  if (!dead.length) { console.log(`fixpoint after ${round - 1} round(s)`); break }
  // Remove bottom-up so earlier ranges stay valid.
  const ranges = dead.map(d => ({ ...d, r: declRange(lines, d.line) }))
    .sort((a, b) => b.r[0] - a.r[0])
  for (const { name, r } of ranges) {
    removed.push({ name, lines: r[1] - r[0] + 1, round })
    lines.splice(r[0], r[1] - r[0] + 1)
  }
  src = lines.join('\n')
  console.log(`round ${round}: removed ${dead.length} — ${dead.map(d => d.name).join(', ')}`)
}

console.log(`\n${removed.length} declarations, ${removed.reduce((a, b) => a + b.lines, 0)} lines`)
if (APPLY) { writeFileSync(FILE, src); console.log('APPLIED to ' + FILE) }
else console.log('(dry run — pass --apply)')
