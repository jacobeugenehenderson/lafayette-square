/**
 * sceneStencilState — the ACTIVE scene's disc (center + radius), published by
 * whoever loaded the baked ground bundle.
 *
 * ⭐ WHY. `ground.json#stencil` is the only per-Look record of the silhouette
 * that is actually SERVED to the renderer (scene.json has no radius, and
 * cartograph/data/<look>/neighborhood_boundary.json is not a public asset).
 * BakedGround already reads it; consumers that need the scene's SIZE — the
 * sun's shadow frustum, above all — had no way to ask, so they carried a
 * hardcoded number instead. `CelestialBodies` shipped ±900, which is Lafayette
 * Square's 892 m radius plus 8 m of slack, and every larger town silently lost
 * its cast shadows outside that box.
 *
 * ⛔ NO FALLBACK BY DESIGN. An unset stencil means "we do not know how big this
 * scene is" — consumers must fail loudly, never substitute a default, because a
 * plausible-looking wrong shadow is worse than a visibly missing one.
 *
 * Module-scope + subscriber set, mirroring onTerrainReload / groundColorState.
 */
let _stencil = null
const _subs = new Set()

/** @param {{center:[number,number], radius:number}|null} s */
export function setSceneStencil(s) {
  const next = (s && Number.isFinite(s.radius) && s.radius > 0) ? s : null
  if (next === _stencil) return
  _stencil = next
  for (const cb of _subs) cb(_stencil)
}

export function getSceneStencil() { return _stencil }

/** Subscribe; fires immediately with the current value. Returns an unsubscribe. */
export function onSceneStencil(cb) {
  _subs.add(cb)
  cb(_stencil)
  return () => _subs.delete(cb)
}

// ── Shadow-frustum geometry — ONE definition, two consumers ────────────────
// CelestialBodies sizes the sun's shadow camera from this; StageShadows uses
// the same numbers to convert the operator's PENUMBRA IN METRES into the
// texels drei's PCSS actually consumes. ⛔ If these two ever disagree the
// softness silently stops meaning metres, so they read the same function.
export const SHADOW_MAP_SIZE = 4096

/** Half-width of the sun's ortho shadow box, in metres. null = unknown. */
export function shadowHalfExtent(s) {
  if (!s || !Number.isFinite(s.radius)) return null
  const cx = s.center?.[0] ?? 0
  const cz = s.center?.[1] ?? 0
  // + the disc's offset from origin (the frustum is centred on the light→origin
  // axis, not on the disc) + a margin so the rim is never clipped.
  return s.radius + Math.hypot(cx, cz) + 100
}

/** Metres of world per shadow-map texel for this scene. null = unknown. */
export function shadowMetresPerTexel(s) {
  const half = shadowHalfExtent(s)
  return half == null ? null : (2 * half) / SHADOW_MAP_SIZE
}

/**
 * The authored cap on how coarse a sun-shadow texel may get, in METRES PER TEXEL.
 * ⭐ Published here because it is now shared vocabulary: `CelestialBodies` derives the
 * shadow box's maximum half-extent from it, and `PostProcessing` converts the authored
 * penumbra against it. ⛔ Two derivations of one physical fact is what produced both the
 * tree-height bug and the capture-frame bug — one publisher, many readers.
 * 0 / Infinity = uncapped (the town-wide fit).
 */
export function shadowMaxMetresPerTexel() {
  if (typeof window === 'undefined') return 0
  const v = Number(window.__maxMPerTexel)
  return Number.isFinite(v) && v > 0 ? v : 0
}
