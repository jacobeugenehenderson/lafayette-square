/**
 * Static camera setups for the CanaryScene per slot tab.
 *
 * CLOUD CHAMBER — close framing, no ground. Looks up at the cloud against
 *   the sky envelope. Good for tuning intrinsic shape against atmospheric
 *   lighting without scene-scale interference.
 *
 * GROUND — eye level, mid-distance. One hero tree anchors scale +
 *   perspective. Good for verifying the cloud reads at LS scale with a
 *   real-world reference object in frame.
 *
 * No orbit controls in Phase 4a — values are starting points. If the
 * framings read wrong, retune here. Phase 5 may add a camera-orbit
 * affordance once the cloud + sky pipeline is stable.
 */

export const CANARY_CAMERAS = {
  chamber: {
    position:   [0, 200, 300],
    target:     [0, 600, 0],
    fov:        35,
    showGround: false,
  },
  ground: {
    position:   [-8, 1.7, 6],   // 1.7m = adult eye height
    target:     [0, 8, 0],      // tree canopy ~8m up
    fov:        50,
    showGround: true,
  },
}
