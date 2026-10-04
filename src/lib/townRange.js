/**
 * townRange — the far end of a metre slider comes from the TOWN, never from Lafayette Square.
 *
 * ⛔ Class D (CLAUDE.md Layer 0 q1): Browse Altitude stopped at 2000 m, Focus distance at 600 m and Penumbra
 * at 60 m. On LS (radius 892 m) all three were roomy; on Provincetown (radius 5290 m) the town's own Browse
 * fit is ~14 km up, most of the town is past 600 m from the Hero camera, and Penumbra's real ceiling was a
 * hidden ~6 m. The value stays AUTHORED; only the slider's reach is derived, so no Look renders differently.
 *
 * A field declares a derived max with a string: `max: 'town.browseAltitude'` · `max: 'render.penumbra'`.
 * `withRanges(fields, ranges)` turns those into numbers for the panel. ⛔ No fallback: when the town's size
 * is unknown the slider collapses to its min and its label says so — never a guessed range.
 * ▶ node checks/claims-stage-controls-are-live.mjs (④ fails a metre slider with a literal max)
 */
import { getSceneStencil, shadowMaxMetresPerTexel, shadowMetresPerTexel } from '../components/sceneStencilState.js'
import { browseSquareAltitude } from '../camera/browseFrame.js'

/** Texels of penumbra the PCSS sample budget can carry (StageShadows clamps to this). One model, two readers. */
export const penumbraBudgetTexels = (samples) => Math.max(8, samples * 1.5)

/** The metres a shadow-map texel stands for in StageShadows' conversion: the authored cap, else the town-wide texel. */
export function penumbraMetresPerTexel(stencil = getSceneStencil()) {
  const capped = shadowMaxMetresPerTexel()
  return (capped > 0 && Number.isFinite(capped)) ? capped : shadowMetresPerTexel(stencil)
}

const ceilTo = (v, step) => Math.ceil(v / step) * step

/**
 * The derived maxima, or null when the town's size is unknown.
 * @param boundary  the active town's neighborhood_boundary ({ center:[x,z], radius })
 * @param aspect    viewport width / height; fov the Browse camera's fov in degrees
 * @param samples   the shadow channel's current Samples
 */
export function townRanges({ boundary, aspect = 1, fov = 45, samples = 16 } = {}) {
  const R = boundary?.radius
  if (!(R > 0) || !Array.isArray(boundary.center)) return null
  const [cx, cz] = boundary.center
  const mpt = penumbraMetresPerTexel()
  return {
    // Twice the height that fits the town's disc whole (the Browse frame's own fit), so the operator can pull back past it.
    'town.browseAltitude': ceilTo(2 * browseSquareAltitude(R, { fov, W: aspect, H: 1 }), 100),
    // The widest penumbra the current sample budget renders; above it StageShadows clamps.
    'render.penumbra': mpt > 0 ? Math.max(1, +(penumbraBudgetTexels(samples) * mpt).toFixed(1)) : null,
  }
}

/** Resolve string maxima in a field list against `ranges`; an unresolvable one collapses loudly. */
const _warned = new Set()
export function withRanges(fields, ranges) {
  return fields.map(f => {
    if (typeof f.max !== 'string') return f
    const v = ranges?.[f.max]
    if (Number.isFinite(v) && v > f.min) return { ...f, max: v }
    if (!_warned.has(f.max)) { _warned.add(f.max); console.error(`[townRange] ⛔ ${f.label}: no ${f.max} for this town — its slider is collapsed until the town's size is known`) }
    return { ...f, max: f.min, label: `${f.label} — town size unknown` }
  })
}
