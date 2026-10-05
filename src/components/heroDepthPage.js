/**
 * heroDepthPage — the hero card's AO+DEPTH page, built from a shot's two readbacks (BRIEF-hero-card-depth; Jacob
 * ruled option 2, 2026-10-04: depth rides the AO page). One UNCOMPRESSED two-channel page: R = AO, G = depth toward
 * the camera (0.5 = the tree's axis, encoded over ± the record's `depth.halfM`). The runtime uploads it as RG8.
 *
 * ⛔ Built here, not through a 2D canvas resize: a canvas stores premultiplied alpha, so depth under transparent pixels
 * would be zeroed, and a box resize would blend crown depth with the empty background — pulling crown EDGES toward the
 * back, exactly where neighbouring crowns meet. So: AO is box-averaged as before; depth is averaged over COVERED
 * pixels only, then dilated a few pixels outward (mipmaps then never reach the background); alpha is written opaque.
 *
 * Pure (typed arrays in and out), so a check runs it in Node. Readbacks are WebGL's, bottom-up; the page is TOP-DOWN,
 * as an image file is.
 */

export const HERO_DEPTH_DILATE_PX = 4   // ≥ the mip levels that matter at a card's distance (2⁴ = 16 texels)

/**
 * @param {{data:Uint8Array,width:number,height:number}} ao     the shot's AO readback (R = AO)
 * @param {{data:Uint8Array,width:number,height:number}} depth  the shot's depth readback (R = depth, A = covered)
 * @param {number} target  the page's side in pixels (a divisor of the readbacks' side)
 * @returns {{data:Uint8ClampedArray,width:number,height:number}} RGBA, top-down, A = 255
 */
export function composeAoDepthPage(ao, depth, target) {
  if (!ao?.data || !depth?.data) throw new Error('[heroDepthPage] a shot without its AO or depth readback has no page')
  if (ao.width !== depth.width || ao.height !== depth.height) throw new Error(`[heroDepthPage] AO ${ao.width}² and depth ${depth.width}² differ — one frame or no page`)
  const S = ao.width, k = S / target
  if (!Number.isInteger(k) || k < 1) throw new Error(`[heroDepthPage] page ${target} does not divide the readback ${S}`)
  const N = target * target
  const aoOut = new Float32Array(N), dOut = new Float32Array(N), covered = new Uint8Array(N)
  for (let ty = 0; ty < target; ty++) for (let tx = 0; tx < target; tx++) {
    let aSum = 0, dSum = 0, dN = 0
    for (let y = ty * k; y < (ty + 1) * k; y++) for (let x = tx * k; x < (tx + 1) * k; x++) {
      const i = (y * S + x) * 4
      aSum += ao.data[i]
      if (depth.data[i + 3] > 127) { dSum += depth.data[i]; dN++ }
    }
    const t = ty * target + tx
    aoOut[t] = aSum / (k * k)
    if (dN) { dOut[t] = dSum / dN; covered[t] = 1 }
  }
  // Dilate depth into the background so a mip level never averages the crown with empty space.
  for (let pass = 0; pass < HERO_DEPTH_DILATE_PX; pass++) {
    const add = []
    for (let t = 0; t < N; t++) {
      if (covered[t]) continue
      const x = t % target, y = (t / target) | 0
      let s = 0, n = 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= target || yy >= target) continue
        const u = yy * target + xx
        if (covered[u]) { s += dOut[u]; n++ }
      }
      if (n) add.push([t, s / n])
    }
    for (const [t, v] of add) { dOut[t] = v; covered[t] = 1 }
  }
  const out = new Uint8ClampedArray(N * 4)
  for (let ty = 0; ty < target; ty++) for (let tx = 0; tx < target; tx++) {
    const t = ty * target + tx, o = ((target - 1 - ty) * target + tx) * 4   // bottom-up readback → top-down page
    out[o] = Math.round(aoOut[t]); out[o + 1] = Math.round(dOut[t] || 128); out[o + 2] = 0; out[o + 3] = 255
  }
  return { data: out, width: target, height: target }
}
