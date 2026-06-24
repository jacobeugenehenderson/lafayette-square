/**
 * DownsamplePyramid — the shared, re-bracketable blur pyramid resource.
 *
 * ONE expensive downsample, paid once, SAMPLED by many cheap consumers:
 *   - custom bloom (Phase 1)  — bright-knee + intensity on the blurred scene
 *   - RomanceDoF  (Phase 2)   — full-scene blur lerped by CoC
 * Consumers share the pyramid TEXTURE, never each other's RESULT — so each
 * stays independently authorable + measurable (coupling = non-starter,
 * CHANNEL-ECONOMY-FORENSIC §2 #2). This pass is a PURE RESOURCE: no effect
 * logic, no look. It reads the current scene color and publishes a blurred
 * full-scene mip texture.
 *
 * ── Why a full-scene pyramid (not bloom's bright-pass one) ──────────────────
 * Stock `BloomEffect` thresholds FIRST, then builds its mip pyramid from the
 * bright-pass — a pyramid of only the bright pixels, useless to DoF (which
 * blurs everything). DoF needs the full scene; the full scene is the only
 * source rich enough for BOTH. So the share forces bloom from threshold→blur
 * to blur→threshold (the knee moves into the custom-bloom composite). That's a
 * mechanism change with an eye-gate (re-tune the bloom channel in Stage);
 * see HANDOFF-real-dof Phase 1.
 *
 * ── The "degree" IS the per-device bracket ─────────────────────────────────
 * `levels` / `radius` (and, later, a render-resolution scale) are the dial that
 * makes Preview's device-tier ladder and this blur pyramid ONE structure:
 * desktop = full degree (this module's defaults); the phone rungs dial it down.
 * Mobile/desktop stops being a forked channel set and becomes a bracket
 * position on the ladder. (Memory: preview-equals-pyramid-tier-ladder.) Phase 1
 * wires only the DESKTOP bracket; the dial is exposed for the per-device arc.
 *
 * Reuses the library's `MipmapBlurPass` (Karis 13-tap down + tent up) as the
 * blur kernel — the same primitive bloom builds internally, here exposed as a
 * standalone, shareable pass. Mounted as a raw `Pass` child of `<EffectComposer>`
 * with `needsSwap=false` so the main color buffer passes through untouched.
 */

import { useMemo, useEffect, forwardRef } from 'react'
import { Pass, MipmapBlurPass } from 'postprocessing'

// Shared handle — the pass publishes its result texture here; the custom bloom
// Effect (Phase 1) and RomanceDoF (Phase 2) read it in their per-frame update().
// Stage / Preview / production are separate entry points (one composer per
// page), so a module singleton is safe — same idiom as _dofRefs / _lampGlow.
// It holds the pass's render-target texture (a STABLE object), populated each
// frame, so consumers can bind it once and never see null.
export const _pyramidRefs = {
  texture: { current: null },
}

// Desktop bracket. The re-bracket knobs (the tier ladder's rungs):
//   • levels / radius  — the blur WIDTH (and look); 8 / 0.85 match stock bloom.
//   • resolutionScale  — the COST dial. The pyramid renders at this fraction of
//     screen res; both consumers sample it by UV (resolution-independent) and
//     both are blurry, so a lower base res is visually ~free but cuts cost
//     quadratically (0.5 → ¼ the pixels). Lower further on the phone rungs.
export const PYRAMID_DESKTOP = Object.freeze({ levels: 8, radius: 0.85, resolutionScale: 0.5 })

class DownsamplePyramidPass extends Pass {
  constructor({ levels = PYRAMID_DESKTOP.levels, radius = PYRAMID_DESKTOP.radius, resolutionScale = PYRAMID_DESKTOP.resolutionScale } = {}) {
    super('DownsamplePyramid')
    // Side-resource: do NOT consume/replace the main color buffer. With
    // needsSwap=false the composer hands the SAME buffer to the next pass, so
    // the custom bloom reads the untouched scene color and samples our texture
    // for its blur — sharing the pyramid, never the result.
    this.needsSwap = false
    this.resolutionScale = resolutionScale
    this.mipmap = new MipmapBlurPass()
    this.mipmap.levels = levels
    this.mipmap.radius = radius
    // Publish the (stable) result texture immediately so a consumer mounting
    // the same frame binds a real handle, not null. Filled on first render().
    _pyramidRefs.texture.current = this.mipmap.texture
  }

  // The blurred full-scene mip texture consumers sample.
  get texture() { return this.mipmap.texture }

  // ── The bracket degree (per-device dial; desktop = full) ──────────────────
  get levels() { return this.mipmap.levels }
  set levels(v) { this.mipmap.levels = v }
  get radius() { return this.mipmap.radius }
  set radius(v) { this.mipmap.radius = v }

  render(renderer, inputBuffer /* , outputBuffer, deltaTime, stencilTest */) {
    // Build the full-scene down/up pyramid from the current scene color.
    this.mipmap.render(renderer, inputBuffer)
    // Re-publish (the RT texture object is stable, but cheap insurance against
    // a levels-change swapping targets).
    _pyramidRefs.texture.current = this.mipmap.texture
  }

  setSize(width, height) {
    // Render the pyramid at resolutionScale × screen res — the COST dial. Both
    // consumers sample by UV (resolution-independent) and both are blurry, so a
    // lower base res is ~free visually but cuts cost quadratically. The first
    // real rung of the device-tier bracket (memory: preview-equals-pyramid).
    const s = this.resolutionScale || 1
    this.mipmap.setSize(Math.max(1, Math.round(width * s)), Math.max(1, Math.round(height * s)))
  }

  initialize(renderer, alpha, frameBufferType) {
    // frameBufferType carries the composer's HDR (HALF_FLOAT) type through to
    // the mip targets — the pyramid must stay HDR so bloom highlights bloom.
    this.mipmap.initialize(renderer, alpha, frameBufferType)
  }

  dispose() {
    this.mipmap.dispose()
    if (_pyramidRefs.texture.current === this.mipmap.texture) {
      _pyramidRefs.texture.current = null
    }
    super.dispose()
  }
}

export { DownsamplePyramidPass }

// React mount — a raw Pass child of <EffectComposer> (r3f adds any
// `instanceof Pass` child standalone, in JSX order). Place it AFTER the scene
// render (and N8AO, to match bloom's current input) and BEFORE the custom
// bloom that samples it.
export const DownsamplePyramid = forwardRef(function DownsamplePyramid(
  { levels, radius, resolutionScale } = {}, ref,
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pass = useMemo(() => new DownsamplePyramidPass({ levels, radius, resolutionScale }), [])
  // Live-adjust the bracket degree without remounting (the per-device dial).
  useEffect(() => {
    if (levels != null) pass.levels = levels
    if (radius != null) pass.radius = radius
  }, [pass, levels, radius])
  return <primitive ref={ref} object={pass} dispose={null} />
})
