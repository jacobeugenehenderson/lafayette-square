/**
 * distanceField.mjs — the Euclidean distance transform every baked distance channel shares
 * (Felzenszwalb–Huttenlocher). ONE copy: bake-coast-distance.js (the water) and bake-ground-ao.js
 * (the ground rules' building and paving distances) both import it.
 */

// 1-D squared distance transform, in place over `f` (length n).
export function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]) }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]] }
}

/** Squared distance (in texels²) from every texel to the nearest SEED texel (seed[k] = 1). */
export function squaredDistance2d(seed, W, H) {
  const g = new Float64Array(W * H)
  for (let k = 0; k < W * H; k++) g[k] = seed[k] ? 0 : 1e20
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
  for (let i = 0; i < W; i++) { for (let j = 0; j < H; j++) f[j] = g[j * W + i]; edt1d(f, H, d, v, z); for (let j = 0; j < H; j++) g[j * W + i] = d[j] }
  for (let j = 0; j < H; j++) { for (let i = 0; i < W; i++) f[i] = g[j * W + i]; edt1d(f, W, d, v, z); for (let i = 0; i < W; i++) g[j * W + i] = d[i] }
  return g
}
