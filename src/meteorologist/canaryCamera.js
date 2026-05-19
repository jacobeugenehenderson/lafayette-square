/**
 * Static starting cameras for the CanaryScene per slot tab. Operator
 * can free-orbit from here via <OrbitControls> mounted in CanaryScene.
 *
 * CLOUD CHAMBER — looks up at the cloud against the sky envelope. Good
 *   for tuning intrinsic shape against atmospheric lighting without
 *   scene-scale interference. Tree + ground hidden.
 *
 * GROUND — backed off ~25m from a 15-20m hero tree at slight upward
 *   tilt. The full tree silhouette fits in frame; operator can orbit to
 *   inspect any side. Ground plane + tree both visible.
 *
 * Tune here if the framings read wrong. Per-tree-species framing
 *   (different cameras for tall vs. compact species) is a Phase 5+
 *   refinement.
 */

export const CANARY_CAMERAS = {
  chamber: {
    position:   [0, 200, 300],
    target:     [0, 600, 0],
    fov:        35,
    showGround: false,
  },
  ground: {
    // Backed off ~25m at ~1.7m above ground. Tree canopy target at 8m
    // puts the full tree silhouette in the upper-middle of frame for
    // typical 12-18m broadleaves; orbit lets the operator inspect.
    position:   [-22, 1.7, 18],
    target:     [0, 8, 0],
    fov:        45,
    showGround: true,
  },
}
