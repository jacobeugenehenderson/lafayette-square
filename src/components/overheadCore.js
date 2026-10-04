/**
 * overheadCore — the overhead impostor's DEEP CORE, baked into the lower bands at capture.
 *
 * From straight above, the canopy band hides most of the bands beneath it. So at the Grove capture
 * the region under the top band's silhouette is painted, in every lower band, with ONE solid canopy
 * colour (and one AO value). Sway, or a later Browse tilt, then reveals dark canopy, never ground
 * (Jacob's design, `arborist/BACKLOG.md` "THE OVERHEAD IMPOSTOR, REDESIGNED").
 *
 * ⭐ The core is drawn INSIDE the band's existing picture: no ring geometry (it adds triangles back,
 * and the tree-cost forensic measured triangles, not pixels, as the cost) and no new sampler.
 *
 * - SHAPE = the top band's silhouette at 1:1 (Jacob, 2026-10-04: "a 1:1 for now"): its opaque
 *   pixels plus every transparent pixel the outside cannot reach (the gaps INSIDE the crown).
 * - COLOUR = the median of the top band's own opaque albedo; AO = the median of its AO under them.
 *   Read off the capture, never a constant. "Deeper" comes from the runtime's per-band brightness
 *   ramp (`OverheadSpecies`), which already darkens the lower bands.
 *
 * Pure (typed arrays in, typed arrays mutated): no DOM, no GL, so a check can run it in Node.
 * Buffers are WebGL readbacks (RGBA8, bottom-up); every band shares the frame, so the orientation
 * never matters as long as all are read the same way.
 */

// The overhead bands' cutout threshold, shared by the runtime material and the core's silhouette:
// the core must cover exactly what the top band draws.
export const OVERHEAD_ALPHA_TEST = 0.4

/**
 * The top band's silhouette: opaque pixels plus enclosed transparent ones.
 * @returns {Uint8Array} 1 = inside the silhouette
 */
export function silhouetteMask(rgba, w, h, alphaTest = OVERHEAD_ALPHA_TEST) {
  const cut = Math.round(alphaTest * 255)
  const n = w * h
  const solid = new Uint8Array(n)
  for (let i = 0; i < n; i++) solid[i] = rgba[i * 4 + 3] > cut ? 1 : 0
  // Flood the OUTSIDE from the frame's border through transparent pixels; whatever it can't reach
  // is inside the crown.
  const outside = new Uint8Array(n)
  const stack = []
  const seed = (i) => { if (!solid[i] && !outside[i]) { outside[i] = 1; stack.push(i) } }
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1) }
  while (stack.length) {
    const i = stack.pop(), x = i % w
    if (x > 0) seed(i - 1)
    if (x < w - 1) seed(i + 1)
    if (i >= w) seed(i - w)
    if (i < n - w) seed(i + w)
  }
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = outside[i] ? 0 : 1
  return mask
}

// Median of one byte channel over the pixels `pick` admits, by histogram.
function median(rgba, n, channel, pick) {
  const hist = new Uint32Array(256)
  let count = 0
  for (let i = 0; i < n; i++) if (pick(i)) { hist[rgba[i * 4 + channel]]++; count++ }
  if (!count) return null
  let acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc * 2 >= count) return v }
  return 255
}

/**
 * Paint the deep core into every band below the top, in place.
 * @param {Array<{key:string, albedo:{data:Uint8Array,width:number,height:number}, ao:{data:Uint8Array,width:number,height:number}}>} bands  bottom→top
 * @returns {Array<object|null>} per band, the manifest's `core` record (null for the top band)
 */
export function bakeOverheadCore(bands) {
  if (!Array.isArray(bands) || bands.length < 2) throw new Error(`[overheadCore] needs ≥2 bands (bottom→top), got ${bands?.length}`)
  const top = bands[bands.length - 1]
  const { data: tA, width: w, height: h } = top.albedo
  const cut = Math.round(OVERHEAD_ALPHA_TEST * 255)
  const n = w * h
  const opaque = (i) => tA[i * 4 + 3] > cut
  const rgb = [0, 1, 2].map((c) => median(tA, n, c, opaque))
  if (rgb[0] == null) throw new Error(`[overheadCore] top band "${top.key}" has no opaque pixel — no silhouette to core under`)
  const mask = silhouetteMask(tA, w, h)
  const { data: tAO, width: aw, height: ah } = top.ao
  // The AO page is a different size; sample the albedo grid nearest-neighbour.
  const toAlbedo = (j) => { const x = j % aw, y = (j / aw) | 0; return ((y * h / ah) | 0) * w + ((x * w / aw) | 0) }
  const ao = median(tAO, aw * ah, 0, (j) => opaque(toAlbedo(j)))
  let px = 0
  for (let i = 0; i < n; i++) px += mask[i]
  const coverage = px / n

  return bands.map((b, k) => {
    if (k === bands.length - 1) return null
    if (b.albedo.width !== w || b.albedo.height !== h) throw new Error(`[overheadCore] band "${b.key}" is ${b.albedo.width}×${b.albedo.height}, the top is ${w}×${h} — one frame or no core`)
    if (b.ao.width !== aw || b.ao.height !== ah) throw new Error(`[overheadCore] band "${b.key}" AO is ${b.ao.width}×${b.ao.height}, the top's is ${aw}×${ah}`)
    const A = b.albedo.data
    for (let i = 0; i < n; i++) if (mask[i]) { const o = i * 4; A[o] = rgb[0]; A[o + 1] = rgb[1]; A[o + 2] = rgb[2]; A[o + 3] = 255 }
    const O = b.ao.data, an = aw * ah
    for (let j = 0; j < an; j++) if (mask[toAlbedo(j)]) { const o = j * 4; O[o] = O[o + 1] = O[o + 2] = ao; O[o + 3] = 255 }
    return { shape: 'top-silhouette', ratio: 1, rgb, ao, coverage: +coverage.toFixed(4) }
  })
}
