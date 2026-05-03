/**
 * atlas-pack.js — skyline rectangle packer for the per-Look tree atlas.
 *
 * Given a list of rects (with original index preserved via the input order),
 * returns the smallest atlas dimensions and per-rect placements. Tighter
 * than the previous uniform-grid approach because each tile occupies its
 * actual content dimensions rather than the worst-case cell.
 *
 * Algorithm: skyline bottom-left. Sort tallest-first; for each rect, scan the
 * skyline and pick the placement with the lowest top edge (ties → leftmost),
 * then update the skyline. Width is bounded by `maxWidth`; the final atlas
 * is trimmed to the actual used extent (no PoT rounding).
 */

export function packSkyline(rects, opts = {}) {
  const maxWidth = opts.maxWidth ?? 4096
  if (rects.length === 0) return { width: 0, height: 0, placements: [] }

  const order = rects
    .map((r, i) => ({ w: r.w, h: r.h, i }))
    .sort((a, b) => (b.h - a.h) || (b.w - a.w))

  let skyline = [{ x: 0, y: 0, w: maxWidth }]
  const placements = new Array(rects.length)
  let usedW = 0, usedH = 0

  for (const r of order) {
    const fit = findFit(skyline, r.w, r.h, maxWidth)
    if (!fit) throw new Error(`atlas-pack: rect ${r.w}×${r.h} doesn't fit within maxWidth=${maxWidth}`)
    placements[r.i] = { x: fit.x, y: fit.y, w: r.w, h: r.h }
    if (fit.x + r.w > usedW) usedW = fit.x + r.w
    if (fit.y + r.h > usedH) usedH = fit.y + r.h
    skyline = updateSkyline(skyline, fit.x, r.w, fit.y + r.h)
  }

  return { width: usedW, height: usedH, placements }
}

function findFit(skyline, w, h, maxWidth) {
  let best = null
  for (let i = 0; i < skyline.length; i++) {
    const x = skyline[i].x
    if (x + w > maxWidth) continue
    let y = skyline[i].y
    let widthLeft = w
    let j = i
    while (widthLeft > 0 && j < skyline.length) {
      if (skyline[j].y > y) y = skyline[j].y
      widthLeft -= skyline[j].w
      j++
    }
    if (widthLeft > 0) continue
    if (!best || y < best.y || (y === best.y && x < best.x)) best = { x, y }
  }
  return best
}

function updateSkyline(skyline, x, w, newY) {
  const xEnd = x + w
  const out = []
  for (const seg of skyline) {
    const segEnd = seg.x + seg.w
    if (segEnd <= x || seg.x >= xEnd) { out.push(seg); continue }
    if (seg.x < x) out.push({ x: seg.x, y: seg.y, w: x - seg.x })
    if (segEnd > xEnd) out.push({ x: xEnd, y: seg.y, w: segEnd - xEnd })
  }
  out.push({ x, y: newY, w })
  out.sort((a, b) => a.x - b.x)
  const merged = []
  for (const seg of out) {
    const last = merged[merged.length - 1]
    if (last && last.y === seg.y && last.x + last.w === seg.x) last.w += seg.w
    else merged.push({ ...seg })
  }
  return merged
}
