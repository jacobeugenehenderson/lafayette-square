/**
 * neonState — module-scoped uniforms for the runtime neon overlay
 * (Path B). The NeonBands shader holds stable references to these
 * objects; they are written each frame from the TOD-resolved neon channel — by CartographApp's NeonPump in
 * Stage, by NeonBands.jsx#NeonDriver in production and Preview. Mirrors `lampGlowState.js`.
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
  // changes. Written by NeonPump (Stage) and NeonDriver (production).
  tubeRadiusUniform: { value: 1.0 },
  // Screen-relative size band (radius, device px). Real shader uniforms — the
  // NeonBands vertex shader clamps each tube's on-screen radius to
  // [screenFloor, screenCeil] so it never goes sub-pixel far away nor reads as a
  // fat pipe up close. screenCeil = 0 → no ceiling. Written by NeonPump (Stage)
  // and NeonDriver (production), same as the four intensity uniforms.
  screenFloorUniform: { value: 2.5 },
  screenCeilUniform:  { value: 0 },
}
