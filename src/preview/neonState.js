/**
 * neonState — module-scoped uniforms for the runtime neon overlay
 * (Path B). The NeonBands shader holds stable references to these
 * objects; CartographApp's NeonPump writes their `.value` each frame
 * from the per-Look TOD-resolved triple. Mirrors `lampGlowState.js`.
 */

export const neon = {
  coreUniform:     { value: 0 },
  tubeUniform:     { value: 0 },
  bleedUniform:    { value: 0 },
  emissiveUniform: { value: 4 },
  // Tube radius (meters) — animated like the others, but NOT a shader
  // uniform: vertex positions in the merged tube mesh depend on it, so
  // changes trigger a BufferGeometry rebuild rather than a uniform
  // write. NeonBands' useFrame reads this each frame, quantizes to the
  // slider step (0.05 m), and rebuilds only when the quantized value
  // changes. Mutated by NeonPump in Stage (live store resolution) and
  // by NeonBands' useEffect in production (scene.json baseline).
  tubeRadiusUniform: { value: 1.0 },
}
