#!/usr/bin/env node
// Does a doc's `file.js:NNN` citation still point at what the doc says it does?
//
// Method, and it READS the source rather than restating it: for every doc line
// carrying a `<file>:<line>` citation, take the backticked identifiers on that
// same doc line and ask whether ANY of them appears within ±WINDOW lines of the
// cited line in the cited file. A citation with no identifier to check is
// reported UNCHECKABLE, never counted as passing.
//
//   node scratch/claims-doc-code-citations.mjs [--window=8] [doc ...]
//
// Default docs = the eight that describe the nodes→Section progression.

import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const args = process.argv.slice(2)
const WINDOW = Number((args.find(a => a.startsWith('--window=')) || '--window=8').split('=')[1])
const DOCS = args.filter(a => !a.startsWith('--'))
const docs = DOCS.length ? DOCS : [
  'cartograph/PIPELINE.md', 'cartograph/SKELETON.md',
  'cartograph/PREBAKE.md', 'cartograph/SURVEY.md', 'cartograph/SECTION.md',
  'cartograph/RIBBONS.md', 'cartograph/POLYGON-FIRST.md',
  // 'cartograph/WALL.md' was retired 2026-09-06 into PIPELINE.md (`_archive/WALL-2026-09-06.md`).
]

// Resolve a bare basename to a real path, once, via git ls-files.
const tracked = execSync('git ls-files', { encoding: 'utf-8' }).split('\n').filter(Boolean)
const byBase = new Map()
for (const p of tracked) {
  const b = p.split('/').pop()
  if (!byBase.has(b)) byBase.set(b, [])
  byBase.get(b).push(p)
}
const fileCache = new Map()
const linesOf = (p) => {
  if (!fileCache.has(p)) fileCache.set(p, readFileSync(p, 'utf-8').split('\n'))
  return fileCache.get(p)
}

const CITE = /([A-Za-z0-9_.-]+\.(?:js|jsx|mjs|cjs)):(\d+)/g
const TICK = /`([^`]+)`/g

let ok = 0, bad = 0, unresolved = 0, uncheckable = 0
const rows = []

for (const doc of docs) {
  if (!existsSync(doc)) { console.error(`  ?? missing doc ${doc}`); continue }
  const dl = readFileSync(doc, 'utf-8').split('\n')
  for (let i = 0; i < dl.length; i++) {
    const line = dl[i]
    CITE.lastIndex = 0
    let m
    while ((m = CITE.exec(line))) {
      const [, base, nStr] = m
      const n = Number(nStr)
      const cands = byBase.get(base) || []
      if (cands.length !== 1) { unresolved++; rows.push([doc, i + 1, `${base}:${n}`, cands.length ? 'AMBIGUOUS' : 'NO-SUCH-FILE', '']); continue }
      const path = cands[0]
      const src = linesOf(path)
      if (n > src.length) { bad++; rows.push([doc, i + 1, `${base}:${n}`, 'PAST-EOF', `file has ${src.length} lines`]); continue }
      // identifiers named on this doc line, minus the citation itself
      TICK.lastIndex = 0
      const ids = new Set()
      let t
      // ⛔ The citation's OWN filename stem is not an identifier to look for:
      // `tileGround.js:1234` splits into "tileGround" + "js", and "tileGround"
      // will never appear at line 1234 of tileGround.js. Counting it made every
      // citation whose doc line names no other symbol read STALE when the honest
      // verdict is UNCHECKABLE. (Found by spot-checking this script's own output,
      // 2026-09-06 — an instrument error wearing a finding's clothes.)
      const stems = new Set()
      { let c; const C2 = new RegExp(CITE.source, 'g')
        while ((c = C2.exec(line))) stems.add(c[1].replace(/\.(js|jsx|mjs|cjs)$/, '')) }
      while ((t = TICK.exec(line))) {
        for (const w of t[1].split(/[^A-Za-z0-9_$]+/)) {
          // ⛔ Only look for things that are actually SYMBOL-SHAPED. A bare
          // English word on the doc line ("shape", "ring", "side", "tile") will
          // match somewhere inside any ±8-line window of this codebase, so
          // counting it turns the check into a rubber stamp: it passed
          // `BlockGeometryV2Debug.jsx:562` on the word "shape" when the thing
          // that line is cited FOR lives at :638. camelCase / PascalCase /
          // snake_case, or a long word, or nothing.
          const symbolShaped = /[a-z][A-Z]/.test(w) || /_/.test(w) || (/^[A-Z]/.test(w) && w.length >= 6) || w.length >= 11
          if (symbolShaped && !/^\d/.test(w) && !w.endsWith('js') && !stems.has(w)) ids.add(w)
        }
      }
      if (!ids.size) { uncheckable++; rows.push([doc, i + 1, `${base}:${n}`, 'UNCHECKABLE', 'no identifier on the doc line']); continue }
      const lo = Math.max(0, n - 1 - WINDOW), hi = Math.min(src.length, n + WINDOW)
      const hay = src.slice(lo, hi).join('\n')
      const hit = [...ids].find(id => hay.includes(id))
      if (hit) { ok++; rows.push([doc, i + 1, `${base}:${n}`, 'OK', hit]) }
      else {
        // where DOES it live? report the first definition site of any named id.
        let where = ''
        for (const id of ids) {
          const j = src.findIndex(l => new RegExp(`(function|const|let|export)\\s+${id}\\b`).test(l))
          if (j >= 0) { where = `${id} is at ${path}:${j + 1}`; break }
        }
        bad++
        rows.push([doc, i + 1, `${base}:${n}`, 'STALE', where || `none of [${[...ids].join(', ')}] within ±${WINDOW}`])
      }
    }
  }
}

for (const [doc, dline, cite, verdict, note] of rows) {
  if (verdict === 'OK' && !process.env.SHOW_OK) continue
  console.log(`${verdict.padEnd(12)} ${doc}:${dline}  →  ${cite}   ${note}`)
}
const total = ok + bad + unresolved + uncheckable
console.log(`\n${total} citations across ${docs.length} docs (±${WINDOW} lines)`)
console.log(`  OK           ${ok}`)
console.log(`  STALE        ${bad}`)
console.log(`  unresolved   ${unresolved}`)
console.log(`  UNCHECKABLE  ${uncheckable}   (no identifier on the doc line — cannot be verified, and should not be trusted)`)
process.exitCode = bad ? 1 : 0
