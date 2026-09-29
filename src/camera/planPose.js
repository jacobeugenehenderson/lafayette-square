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
/** The camera view offset (CSS px) that centres the frame in the free region. */
export const insetOffset = (inset) => ({ x: (inset.right - inset.left) / 2, y: (inset.bottom - inset.top) / 2 })
