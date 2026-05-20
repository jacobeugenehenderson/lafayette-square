/**
 * useAtmosphere — single subscribable source for the resolved Almanac
 * directive (Phase 5a).
 *
 * Two slots:
 *   - rawDirective: the directive returned by selectDirective() — flips
 *     whenever the weather payload or operator override changes.
 *   - tweenedDirective: the per-frame interpolated directive that
 *     consumers (Atmosphere uniforms, InstancedTrees sway) actually
 *     read. Lerped over ~45s when rawDirective changes (see
 *     AtmosphereDirectiveDriver).
 *
 * Cross-helper memory: project_kit_helpers_pattern — Meteorologist
 * authors (Teapot presets, Almanac rules), Cartograph + Arborist
 * subscribe via the directive instead of authoring their own wind /
 * lighting state.
 */
import { create } from 'zustand'

const useAtmosphere = create((set) => ({
  rawDirective: null,
  tweenedDirective: null,
  setRawDirective: (d) => set({ rawDirective: d }),
  setTweenedDirective: (d) => set({ tweenedDirective: d }),
}))

export default useAtmosphere
