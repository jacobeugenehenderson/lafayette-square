/**
 * Per-slot cameras for the CanaryScene. Each slot corresponds to a
 * production-app viewpoint the operator is authoring for. Cameras
 * are intentionally static — the operator scrubs cloud params + TOD,
 * not the camera. (Earlier in-cloud-orbit experiment surfaced that
 * unbounded navigation makes spatial bearing impossible; pinning the
 * cameras to the production views fixes the "where am I?" problem.)
 *
 * BROWSE — pure overhead, mirrors production SHOTS.browse (90° down,
 *   up:[0,0,-1], fov 45-ish). The operator sees the cloud field from
 *   above the way the deployed app's Browse shot will. Ground + tree
 *   hidden (these slot views are about reading the sky, not the
 *   landscape).
 *
 * GROUND — eye-level on the ground plane, backed off ~25m from the
 *   hero tree at slight upward tilt. Looks up at the cloud overhead
 *   in scale + perspective. Mirrors what users see standing in the
 *   neighborhood. Tree + ground shown; orbit modestly enabled to
 *   inspect from a couple of angles.
 *
 * `orbit` field: true → OrbitControls active with min/max clamps;
 *   false → camera locked, all input disabled. Browse is locked
 *   because it's the production overhead; tilt-pan-orbit there
 *   would diverge from what's shipped.
 */

export const CANARY_CAMERAS = {
  browse: {
    // True 90° overhead, mirrors production SHOTS.browse.
    // Camera at y=4000 looking straight down at the origin; slab
    // sits at y∈[1200, 1700], so we're 2300-2800m above the cloud
    // tops. At fov 50 this frames roughly a 2300m wide patch of the
    // slab — enough to show 2-12 cumulus puffs depending on coverage.
    position:   [0, 4000, 0],
    target:     [0, 0, 0],
    up:         [0, 0, -1],   // pure overhead needs camera-up in the ground plane
    fov:        50,
    showGround: false,
    orbit:      false,
  },
  ground: {
    // Backed off ~25m at ~1.7m above ground. Tree canopy target at 8m
    // puts the full tree silhouette in the upper-middle of frame for
    // typical 12-18m broadleaves.
    //
    // lockDolly: orbit is constrained to a horizontal circular dolly —
    // camera Y stays at eye level (1.7m), radius stays at the starting
    // distance (~29m), only azimuth changes as the operator drags.
    // Zoom + pan disabled; pitch locked to the upward tilt at the
    // canopy. CanaryScene derives the polar/radius lock values from
    // the initial position/target so changing the starting framing
    // auto-updates the dolly geometry.
    position:   [-22, 1.7, 18],
    target:     [0, 8, 0],
    fov:        45,
    showGround: true,
    orbit:      true,
    lockDolly:  true,
  },
}
