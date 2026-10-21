// make.mjs — an anchored, read-only probe copy of loess/perp-depths' tileGround.js (was 44b3ab2f; now whatever the worktree holds). Adds side records only:
// each leg extension's walk ring with its leg's span and the other leg's (by construction: spanOfSrc of the edge legExt
// was struck from), and the walk cells bandPiecesOfTile cuts with. Every anchor must match exactly once, or it throws.
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const WT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')   // the worktree this probe sits in
let s = readFileSync(`${WT}/src/lib/tileGround.js`, 'utf8')
const rep = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`anchor ×${n}: ${a.slice(0, 60)}`); s = s.replace(a, b) }
s = s.replace(/from '\.\/([^']+)'/g, `from '${WT}/src/lib/$1'`).replace(/from '\.\.\/([^']+)'/g, `from '${WT}/src/$1'`)
rep(`import clipperLib from 'clipper-lib'`, `import clipperLib from '${WT}/node_modules/clipper-lib/clipper.js'`)
rep(`const walkX = [], envX0 = [], walkCut = [], ends = []`, `const walkX = [], envX0 = [], walkCut = [], ends = [], __ext = []`)
rep(`if (w) walkX.push(w); if (e2) envX0.push(e2)`,
  `if (w) { const A = st.iaArc?.[p.si] || [], nn = p.ring.length, cArc = A[c.q]; walkX.push(w); __ext.push({ ring: w, span: spanOfSrc(p.si, i), other: spanOfSrc(p.si, atEnd ? c.after : c.before), at: p.ring[atEnd ? (i + 1) % p.ring.length : i], role: atEnd ? 'before' : 'after', cArc, vS: A[i] ?? null, vE: A[(i + 1) % nn] ?? null, edgeInArc: A[i] != null && A[i] === A[(i + 1) % nn], cap: st.iaCap?.[p.si]?.[i] ?? null, stampLeg: (stamps[p.si] || [])[i] ?? null, stampArc: (stamps[p.si] || [])[c.q] ?? null, run: (() => { const t = (stamps[p.si] || [])[i], R0 = t == null ? null : runs[t]; return R0 ? { t, skelId: R0.skelId, side: R0.side, segOrd: R0.segOrd, roadId: R0.roadId ?? null, throughId: R0.throughId ?? null } : null })(), mid: (() => { const a = p.ring[i], b = p.ring[(i + 1) % p.ring.length]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] })(), nr: legFrame(p, i, atEnd)?.nr ?? null, edgeLen: legFrame(p, i, atEnd)?.len ?? null }) }; if (e2) envX0.push(e2)`)
rep(`  const BP = wantPieces ? bandPiecesOfTile({`, `  globalThis.__EXT = __ext; globalThis.__RAMPS = perpPieces\n  const BP = wantPieces ? bandPiecesOfTile({`)
// (b) the walk cut's own decomposition of the extensions' ground: held by a cell · outside the disc · each byRects face · left
rep(`      for (const f of [...R0.faces, ...R1.faces.map(f => ({ ...f, why: f.why + ' (within TOL)' }))]) {`,
  `      for (const f of [...R0.faces, ...R1.faces.map(f => ({ ...f, why: f.why + ' (within TOL)' }))]) { __faces.push(f);`)
rep(`    if (!L.length || !(ar(L) > 1e-6)) return\n`, `    globalThis.__CUT0?.({ cls, B, held, L0, L, intersectRings, unionRings, differenceRings, signedArea })\n    if (!L.length || !(ar(L) > 1e-6)) return\n`)
rep(`    const ri = cells[0]?.ri ?? null, left = []`, `    const ri = cells[0]?.ri ?? null, left = [], __faces = []`)
rep(`    // the part of it a perpendicular corner's legs' extensions or cuts make`,
  `    globalThis.__CUT1?.({ cls, faces: __faces, left })
    // the part of it a perpendicular corner's legs' extensions or cuts make`)
rep(`  cut('walk', sectors.length ? differenceRings(walk0, sectors) : walk0, cellsBetween(LV_wf, LV_wt, 'the walk'), LV_wt)`,
  `  const __cells = cellsBetween(LV_wf, LV_wt, 'the walk'); globalThis.__MEASURE?.(globalThis.__EXT || [], globalThis.__RAMPS || [], __cells.map(c => ({ span: c.span, reg: c.whole ? (c.whole.inner.length ? xorRegion(c.whole.outer, c.whole.inner) : [c.whole.outer]) : (c.poly.length >= 3 ? [c.poly] : []) })), walk0, { intersectRings, unionRings, differenceRings, signedArea }); globalThis.__EXT = null
  cut('walk', sectors.length ? differenceRings(walk0, sectors) : walk0, __cells, LV_wt)`)
// (2) every tile's pieces, with the parts and the label function, for the wider census
rep(`  return { pieces, seams, census, edgeDepths }\n}`, `  globalThis.__PIECES?.({ st, parts, spanOfSrc, pieces, signedArea })\n  return { pieces, seams, census, edgeDepths }\n}`)
writeFileSync(new URL('./tileGround.probe.mjs', import.meta.url), s)
console.log('probe written')
