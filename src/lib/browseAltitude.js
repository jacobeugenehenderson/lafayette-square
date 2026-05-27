// Overhead Browse-camera altitude that frames `bounds` (w×h, metres) at `fov`
// for the given viewport aspect (width/height). Pure math — no THREE, no Stage
// module — so production (Scene.jsx) and authoring (StageApp / Preview) share
// ONE formula instead of the prior inlined copy. `padding` (~1.05) leaves a
// small margin around the framed footprint. Crops on the binding axis.
export function browseAltitude(aspect, fov, bounds, padding = 1.05) {
  const tan = Math.tan((fov * Math.PI) / 360)
  const altForH = (bounds.h * padding) / (2 * tan)
  const altForW = (bounds.w * padding) / (2 * tan * Math.max(aspect, 1e-6))
  return Math.max(altForH, altForW)
}
