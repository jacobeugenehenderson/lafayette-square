// make.mjs — an anchored, read-only probe copy of loess/perp-depths' tileGround.js (44b3ab2f). Adds side records only:
// each leg extension's walk ring with its leg's span and the other leg's (by construction: spanOfSrc of the edge legExt
// was struck from), and the walk cells bandPiecesOfTile cuts with. Every anchor must match exactly once, or it throws.
import { readFileSync, writeFileSync } from 'fs'
const WT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/perp-depths'
let s = readFileSync(`${WT}/src/lib/tileGround.js`, 'utf8')
const rep = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`anchor ×${n}: ${a.slice(0, 60)}`); s = s.replace(a, b) }
s = s.replace(/from '\.\/([^']+)'/g, `from '${WT}/src/lib/$1'`).replace(/from '\.\.\/([^']+)'/g, `from '${WT}/src/$1'`)
rep(`import clipperLib from 'clipper-lib'`, `import clipperLib from '${WT}/node_modules/clipper-lib/clipper.js'`)
rep(`const walkX = [], envX0 = [], walkCut = [], ends = []`, `const walkX = [], envX0 = [], walkCut = [], ends = [], __ext = []`)
rep(`if (w) walkX.push(w); if (e2) envX0.push(e2)`,
  `if (w) { walkX.push(w); __ext.push({ ring: w, span: spanOfSrc(p.si, i), other: spanOfSrc(p.si, atEnd ? c.after : c.before), at: p.ring[atEnd ? (i + 1) % p.ring.length : i] }) }; if (e2) envX0.push(e2)`)
rep(`  const BP = wantPieces ? bandPiecesOfTile({`, `  globalThis.__EXT = __ext\n  const BP = wantPieces ? bandPiecesOfTile({`)
rep(`  cut('walk', sectors.length ? differenceRings(walk0, sectors) : walk0, cellsBetween(LV_wf, LV_wt, 'the walk'), LV_wt)`,
  `  const __cells = cellsBetween(LV_wf, LV_wt, 'the walk'); globalThis.__MEASURE?.(globalThis.__EXT || [], __cells.map(c => ({ span: c.span, reg: c.whole ? (c.whole.inner.length ? xorRegion(c.whole.outer, c.whole.inner) : [c.whole.outer]) : (c.poly.length >= 3 ? [c.poly] : []) })), walk0, { intersectRings, unionRings, differenceRings, signedArea }); globalThis.__EXT = null
  cut('walk', sectors.length ? differenceRings(walk0, sectors) : walk0, __cells, LV_wt)`)
writeFileSync(new URL('./tileGround.probe.mjs', import.meta.url), s)
console.log('probe written')
