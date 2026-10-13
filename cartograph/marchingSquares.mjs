/**
 * marchingSquares.mjs — the one tracer of a sampled field's zero line, shared by the bakes that trace one
 * (bake-coast: the lidar at high water · bake-shore-median: the lidar at the survey's water).
 */
/**
 * MARCHING SQUARES over one tile's grid: the closed loops of f ≤ 0 (wet). The grid is padded with a DRY ring so every
 * loop closes inside the tile; loops are returned unoriented and must be filled EVEN-ODD (a hole is a loop inside a loop).
 * @param f  Float32Array (nx × nz, row-major by z), x0/z0 the first sample's town metres, step metres
 */
export function wetLoops(f, nx, nz, x0, z0, step) {
  const NX = nx + 2, NZ = nz + 2, g = new Float32Array(NX * NZ).fill(1)   // the dry pad
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) g[(j + 1) * NX + i + 1] = f[j * nx + i]
  const X = (i) => x0 + (i - 1) * step, Z = (j) => z0 + (j - 1) * step
  const val = (i, j) => g[j * NX + i]
  // an edge's crossing point and its key: 'h' edges join (i,j)-(i+1,j), 'v' edges join (i,j)-(i,j+1)
  const pt = new Map()
  const cross = (kind, i, j) => {
    const key = `${kind}${i},${j}`
    if (!pt.has(key)) {
      const a = val(i, j), b = kind === 'h' ? val(i + 1, j) : val(i, j + 1), t = a / (a - b)
      pt.set(key, kind === 'h' ? [X(i) + t * step, Z(j)] : [X(i), Z(j) + t * step])
    }
    return key
  }
  const segs = []
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const tl = val(i, j) <= 0, tr = val(i + 1, j) <= 0, br = val(i + 1, j + 1) <= 0, bl = val(i, j + 1) <= 0
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
      // saddles: the cell's mean decides which diagonal pair joins
      case 5: { const m = (val(i, j) + val(i + 1, j) + val(i + 1, j + 1) + val(i, j + 1)) / 4
        if (m <= 0) { segs.push([L(), T()]); segs.push([Bm(), R()]) } else { segs.push([L(), Bm()]); segs.push([T(), R()]) } break }
      case 10: { const m = (val(i, j) + val(i + 1, j) + val(i + 1, j + 1) + val(i, j + 1)) / 4
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
