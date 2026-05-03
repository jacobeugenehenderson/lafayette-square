/**
 * neonState — module-scoped uniforms for the runtime neon overlay
 * (Path B). The NeonBands shader holds stable references to these
 * objects; CartographApp's NeonPump writes their `.value` each frame
 * from the per-Look TOD-resolved triple. Mirrors `lampGlowState.js`.
 */

export const neon = {
  coreUniform:  { value: 0 },
  tubeUniform:  { value: 0 },
  bleedUniform: { value: 0 },
}
