/**
 * Static starting cameras for the CanaryScene per slot tab. Operator
 * can orbit from here via <OrbitControls> mounted in CanaryScene with
 * per-slot distance clamps.
 *
 * CLOUD CHAMBER — camera INSIDE the cloud slab at altitude 1450m
 *   (the slab's vertical center), orbiting a fixed point at slab
 *   center. Backside rendering means every direction shows shader
 *   output; the operator becomes a fixed observer suspended in the
 *   cloud field, spinning to inspect it. OrbitControls clamps keep
 *   the camera within the cloud volume. Tree + ground hidden.
 *
 * GROUND — eye-level on the ground plane, backed off ~25m from a
 *   typical 12-20m hero tree at slight upward tilt. Looking up at
 *   the cloud overhead in proper scale + perspective. The "from
 *   where users will see it" view.
 *
 * Mental model split:
 *   CHAMBER = specimen examination at the cloud's authored altitude
 *   GROUND  = in-place QA against environmental context
 */

export const CANARY_CAMERAS = {
  chamber: {
    // Inside the cloud slab (y=1200..1700), target locked to slab
    // center. Starting position 250m forward of center; operator
    // orbits with distance clamps to stay in the cloud volume.
    position:   [0, 1450, 250],
    target:     [0, 1450, 0],
    fov:        75,
    showGround: false,
    minDistance: 50,
    maxDistance: 500,
  },
  ground: {
    // Backed off ~25m at ~1.7m above ground. Tree canopy target at 8m
    // puts the full tree silhouette in the upper-middle of frame for
    // typical 12-18m broadleaves; orbit lets the operator inspect.
    position:   [-22, 1.7, 18],
    target:     [0, 8, 0],
    fov:        45,
    showGround: true,
    minDistance: 8,
    maxDistance: 80,
  },
}
