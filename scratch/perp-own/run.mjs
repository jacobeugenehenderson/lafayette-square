// run.mjs <scene> — read-only, on loess/perp-depths (44b3ab2f), authoring loaded via the worktree's own feed().
//  (1) the producer's census: refusedPerp / refusedPerpM2 summed over tiles (and refused / refusedM2 for scale)
//  (2) per leg extension (its painted walk, ext ∩ walk): area inside walk cells of the OTHER leg's span, of its OWN span,
//      of any third span, and in no cell. An extension "runs into the other leg's cell" when the first is > 0.
const WT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/perp-depths'
const scene = process.argv[2]
const { feed } = await import(`${WT}/scratch/_proto-feed.mjs`)
const { buildTileGround } = await import('./tileGround.probe.mjs')
const ar = (rs, sa) => rs.reduce((t, r) => t + sa(r), 0)   // signed sum: holes subtract
const E = []
globalThis.__MEASURE = (ext, cells, walk, { intersectRings, unionRings, signedArea }) => {
  const A = (rs) => Math.abs(ar(rs, signedArea))
  for (const x of ext) {
    const g = intersectRings([x.ring], walk); const tot = A(g); if (!(tot > 0)) { E.push({ ...x, tot: 0, other: 0, own: 0, third: 0, none: 0 }); continue }
    const by = (pred) => { const R = cells.filter(c => pred(c.span)).flatMap(c => c.reg); return R.length ? A(intersectRings(g, unionRings(R))) : 0 }
    const all = cells.flatMap(c => c.reg), inAny = all.length ? A(intersectRings(g, unionRings(all))) : 0
    E.push({ span: x.span, otherSpan: x.other, at: x.at, tot, other: by(s => s === x.other), own: by(s => s === x.span), third: by(s => s !== x.span && s !== x.other), none: tot - inAny })
  }
}
const f = feed(scene); if (!f) process.exit(2)
const prev = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
let R; try {
  R = buildTileGround(f.ribbons, { smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth,
    blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides,
    cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1 })
} finally { console.log = prev; console.warn = pw }
const T = R.protoBandPieces || []
const S = { refused: 0, refusedM2: 0, refusedPerp: 0, refusedPerpM2: 0 }
for (const t of T) for (const k of Object.keys(S)) S[k] += t.census?.[k] || 0
console.log(`${scene} · authoring slots ${f.slots} · tiles with pieces ${T.length}`)
console.log(`(1) refused ${S.refused} region(s) ${S.refusedM2.toFixed(3)} m² · of them refusedPerp ${S.refusedPerp} region(s) ${S.refusedPerpM2.toFixed(3)} m²`)
const pos = E.filter(e => e.tot > 0), into = pos.filter(e => e.other > 0), into1 = pos.filter(e => e.other > 0.01), third = pos.filter(e => e.third > 0)
const sum = (a, k) => a.reduce((t, e) => t + e[k], 0)
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN }
console.log(`(2) leg extensions ${E.length} (with painted walk ${pos.length}) · painted ${sum(pos, 'tot').toFixed(2)} m²: in own-leg cells ${sum(pos, 'own').toFixed(2)} · in the OTHER leg's cells ${sum(pos, 'other').toFixed(2)} · in a third span's cells ${sum(pos, 'third').toFixed(2)} · in no cell ${sum(pos, 'none').toFixed(2)}`)
console.log(`    extensions entering the other leg's cell: ${into.length} (> 0.01 m²: ${into1.length}) · area p50 ${q(into.map(e => e.other), .5)?.toFixed?.(4)} max ${Math.max(0, ...into.map(e => e.other)).toFixed(4)} m² · entering a third span's cell: ${third.length}`)
for (const e of into.sort((a, b) => b.other - a.other).slice(0, 4)) console.log(`      ${e.other.toFixed(4)} m² · leg ${e.span} → other ${e.otherSpan} · tangent (${e.at[0].toFixed(1)}, ${e.at[1].toFixed(1)})`)
console.log(`    peak rss ${(process.memoryUsage().rss / 1e9).toFixed(2)} GB`)
