/**
 * marchingSquares.mjs — the one tracer of a sampled field's zero line (bake-coast: the lidar at the line).
 */
/**
 * MARCHING SQUARES over one tile's grid: the closed loops of f ≤ 0 (wet). The grid is padded with a DRY ring so every
 * loop closes inside the tile; loops are returned unoriented and must be filled EVEN-ODD (a hole is a loop inside a loop).
 * ⛔ A SENTINEL IS NOT A VALUE (Zob, 2026-10-26: Huron's 22 coast touches were crossings interpolated against bake-coast's
 * −Number.EPSILON). A node with no height carries a KIND, never a stored stand-in: DECK (wet; the crossing is exactly where
 * the edge meets the deck's ring, `deckCross`, else the deck end, counted), NO_RETURN (wet, in coverage, no value) and
 * NO_COVERAGE (dry, no value) and DRY_BY_RULE (dry whatever its height: a hollow the water does not reach): the crossing
 * at the edge's MIDPOINT, the line somewhere on it, its error at most step/2.
 * Two sentinels of one side never cross; only a sentinel edge between wet and dry does.
 * @param f     Float32Array (nx × nz, row-major by z), x0/z0 the first sample's town metres, step metres; NaN at a sentinel
 * @param kind  Uint8Array of the same size (0 = a value, else KIND.*), or null when every node is a value
 * @param tally counts the crossings each sentinel decided ({ deck, deckEnd, noReturn, noCoverage })
 */
export const KIND = { VALUE: 0, DECK: 1, NO_RETURN: 2, NO_COVERAGE: 3, DRY_BY_RULE: 4 }
export function wetLoops(f, nx, nz, x0, z0, step, { kind = null, deckCross = null, tally = null } = {}) {
  const NX = nx + 2, NZ = nz + 2, g = new Float32Array(NX * NZ).fill(1), gk = new Uint8Array(NX * NZ)   // the dry pad
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { g[(j + 1) * NX + i + 1] = f[j * nx + i]; if (kind) gk[(j + 1) * NX + i + 1] = kind[j * nx + i] }
  for (let k = 0; k < NX * NZ; k++) if (!gk[k] && !Number.isFinite(g[k])) throw new Error(`⛔ wetLoops: a node with no value and no kind (${g[k]}) — a sentinel must be named, never stored`)
  const X = (i) => x0 + (i - 1) * step, Z = (j) => z0 + (j - 1) * step
  const val = (i, j) => g[j * NX + i]
  const wet = (i, j) => { const k = gk[j * NX + i]; return k === KIND.DECK || k === KIND.NO_RETURN || (k === KIND.VALUE && g[j * NX + i] <= 0) }
  // an edge's crossing point and its key: 'h' edges join (i,j)-(i+1,j), 'v' edges join (i,j)-(i,j+1)
  const pt = new Map()
  const cross = (kind, i, j) => {
    const key = `${kind}${i},${j}`
    if (!pt.has(key)) {
      const [bi, bj] = kind === 'h' ? [i + 1, j] : [i, j + 1], ka = gk[j * NX + i], kb = gk[bj * NX + bi]
      const pa = [X(i), Z(j)], pb = [X(bi), Z(bj)]
      if (!ka && !kb) { const a = val(i, j), b = val(bi, bj), t = a / (a - b); pt.set(key, [pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1])]) }
      else if (ka === KIND.DECK || kb === KIND.DECK) {
        const [d, o] = ka === KIND.DECK ? [pa, pb] : [pb, pa], c = deckCross ? deckCross(d, o) : null
        if (!deckCross) throw new Error('⛔ wetLoops: a DECK node and no deckCross to find its edge')
        if (c) { pt.set(key, c); if (tally) tally.deck = (tally.deck || 0) + 1 } else { pt.set(key, d); if (tally) tally.deckEnd = (tally.deckEnd || 0) + 1 } }
      else { pt.set(key, [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2])
        if (tally) { const which = { [KIND.NO_RETURN]: 'noReturn', [KIND.NO_COVERAGE]: 'noCoverage', [KIND.DRY_BY_RULE]: 'dryByRule' }[ka || kb]; tally[which] = (tally[which] || 0) + 1 } }
    }
    return key
  }
  const saddleMean = (i, j) => { let t = 0, n = 0
    for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) if (!gk[b * NX + a]) { t += val(a, b); n++ }
    return n ? t / n : -1 }
  const segs = []
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const tl = wet(i, j), tr = wet(i + 1, j), br = wet(i + 1, j + 1), bl = wet(i, j + 1)
    const code = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0)
    if (code === 0 || code === 15) continue
    const T = () => cross('h', i, j), R = () => cross('v', i + 1, j), Bm = () => cross('h', i, j + 1), L = () => cross('v', i, j)
    switch (code) {
      case 1: case 14: segs.push([L(), Bm()]); break
      case 2: case 13: segs.push([Bm(), R()]); break
      case 3: case 12: segs.push([L(), R()]); break
      case 4: case 11: segs.push([T(), R()]); break
      case 6: case 9: segs.push([T(), Bm()]); break
      case 7: case 8: segs.push([L(), T()]); break
      // saddles: the cell's mean over its VALUED corners decides which diagonal pair joins (a sentinel has no height to
      // average); with none valued, the wet pair joins
      case 5: { const m = saddleMean(i, j)
        if (m <= 0) { segs.push([L(), T()]); segs.push([Bm(), R()]) } else { segs.push([L(), Bm()]); segs.push([T(), R()]) } break }
      case 10: { const m = saddleMean(i, j)
        if (m <= 0) { segs.push([L(), Bm()]); segs.push([T(), R()]) } else { segs.push([L(), T()]); segs.push([Bm(), R()]) } break }
    }
  }
  // stitch: every edge key is shared by exactly two segments (the pad guarantees it)
  const at = new Map()
  segs.forEach((s, k) => { for (const e of s) (at.get(e) || at.set(e, []).get(e)).push(k) })
  const used = new Uint8Array(segs.length), loops = []
  for (let k0 = 0; k0 < segs.length; k0++) {
    if (used[k0]) continue
    const loop = []
    let k = k0, from = segs[k0][0]
    while (!used[k]) {
      used[k] = 1
      const to = segs[k][0] === from ? segs[k][1] : segs[k][0]
      loop.push(pt.get(from))
      from = to
      const nxt = at.get(to).find(q => !used[q])
      if (nxt === undefined) break
      k = nxt
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}
