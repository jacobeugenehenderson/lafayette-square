/**
 * Static camera setups for the CanaryScene per slot tab.
 *
 * CLOUD CHAMBER — close framing, no ground. Camera below and offset
 *   from the cumulus_humilis slab (y∈[1200, 1700]), looking up at the
 *   cloud volume against the sky envelope. Good for tuning intrinsic
 *   shape against atmospheric lighting without scene-scale interference.
 *
 * GROUND — eye level, camera tilted upward toward the cloud layer.
 *   Ground plane + hero tree still mount in the scene but sit below
 *   the lower edge of frame at cumulus altitude — see "Tree + cloud
 *   coexistence" note below. Phase 4b.1 prioritizes cloud visibility;
 *   tree-as-scale-reference framing returns when we re-balance against
 *   the cloud altitude.
 *
 * Tree + cloud coexistence:
 *   Real cumulus base sits at 1200m. An 8m hero tree at any normal
 *   camera distance subtends a near-horizon elevation while the cloud
 *   subtends ~85–89°. Fitting both in one frame requires extreme wide
 *   angles (fov > 110°) with severe distortion. Phase 4a's tree-anchored
 *   ground framing was designed before <Atmosphere /> was wired to the
 *   real cumulus altitude. Two paths forward — neither in Phase 4b.1's
 *   scope:
 *     (a) Lower the canary slab altitude for in-scene tuning (breaks
 *         physical accuracy but easier to frame).
 *     (b) Replace the Ground framing entirely with a horizon-style
 *         view (e.g., camera elevated on a building), so tree + cloud
 *         compose naturally in a tilted forward gaze.
 *
 * No orbit controls in Phase 4a/4b — values are starting points. If
 * the framings read wrong, retune here. Phase 5 may add a camera-orbit
 * affordance once the cloud + sky pipeline is stable.
 */

export const CANARY_CAMERAS = {
  chamber: {
    // Below the slab (y=850, slab base y=1200), offset to one side so
    // the cloud volume reads as a 3D mass rather than a flat ceiling.
    // Frustum upper edge sits ~52° elevation — the slab's vertical
    // extent (16°–35° from this vantage) lands comfortably in-frame.
    position:   [0, 850, 1200],
    target:     [0, 1450, 0],
    fov:        50,
    showGround: false,
  },
  ground: {
    // Eye height (1.7m), close to the tree. Target pulled high above
    // the horizon so the gaze tilts up into the cumulus layer. Tree
    // and ground plane mount but sit below the lower frame edge at
    // this tilt — see header note. Goal for Phase 4b.1 is to see the
    // cloud field overhead from an at-grade vantage.
    position:   [-15, 1.7, 20],
    target:     [0, 400, -100],
    fov:        70,
    showGround: true,
  },
}
