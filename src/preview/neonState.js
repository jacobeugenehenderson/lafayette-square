/**
 * neonState — module-scoped uniforms for the runtime neon (NeonBands.jsx). Both drawings' shaders hold stable
 * references to these objects; NeonBands.jsx#NeonDriver writes them every frame from the TOD-resolved neon channel, in
 * every app (Stage hands the driver its live channel). Mirrors `lampGlowState.js`. Initial values are the channel's
 * flat defaults, so nothing here restates a number.
 */
import { NEON_FLAT_DEFAULTS as D } from '../cartograph/skyLightChannels.js'

export const neon = {
  coreUniform:      { value: 0 },
  tubeUniform:      { value: 0 },
  bleedUniform:     { value: 0 },
  emissiveUniform:  { value: D.emissive },
  // The tube's radius, centimetres. Not a shader uniform: it drives vertex positions, so NeonBands polls it each
  // frame, quantizes it, and rebuilds the merged geometry on a step crossing.
  tubeCmUniform:    { value: D.tubeCm },
  // The far line's on-screen width, the hand-off size (both device px) and the line's brightness against the tube.
  linePxUniform:    { value: D.linePx },
  handoffPxUniform: { value: D.handoffPx },
  lineGainUniform:  { value: D.lineGain },
}
