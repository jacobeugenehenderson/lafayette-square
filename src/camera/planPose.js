/**
 * planPose — how high the plan camera stands so a frame's circle fits the region the app's UI leaves free, and the view
 * offset that centres it there. Pure: ShotFlight flies by it, and checks/claims-the-plan-frames-all-it-is-given.mjs
 * projects by it, so the check measures the runtime's own fit.
 *   inset = { top, right, bottom, left } CSS px the app covers · W, H = the canvas's CSS size · fov = vertical degrees
 *   pad   = the margin, a multiple of the radius (the town's browse padding; SHOTS_FLAT_DEFAULTS 1.05)
 */
export function planAltitude(radius, { fov, pad, W, H, inset }) {
  const fh = Math.max(0.05, (H - inset.top - inset.bottom) / H), fw = Math.max(0.05, (W - inset.left - inset.right) / W)
  const tanH = Math.tan((fov * Math.PI) / 360)
  return (radius * pad) / (tanH * Math.min(fh, (W / H) * fw))
}
/** The region the app's UI leaves free, as the padding that bounds it: the inset itself, or `{ why }` when there is no
 *  region (top + bottom ≥ H, or left + right ≥ W) — the host measured its UI wrong, and a caller says so by name. The
 *  splash (TownSplash) centres in it, as the plan does through insetOffset. A canvas with no size yet (0×0: not laid
 *  out) is no verdict: null, the region not yet known — never a refusal (staging, 2026-10-28: every cold load refused
 *  "108,0,0,440 … of the 0×0 canvas", then drew the mark correctly a frame later). */
export function freeRegion(inset, W, H) {
  if (!(W > 0 && H > 0)) return null
  const i = { top: 0, right: 0, bottom: 0, left: 0, ...(inset || {}) }
  if (i.top + i.bottom >= H || i.left + i.right >= W) {
    return { why: `viewInset ${i.top},${i.right},${i.bottom},${i.left} (top,right,bottom,left) leaves no region of the ${W}×${H} canvas free` }
  }
  return i
}
/** The camera view offset (CSS px) that centres the frame in the free region. */
export const insetOffset = (inset) => ({ x: (inset.right - inset.left) / 2, y: (inset.bottom - inset.top) / 2 })
