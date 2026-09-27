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
  // Phase 6 (Halo 2026-05-20): per-modulator strength map, recomputed
  // every time the evaluator runs. Read by ModulatorEditor's live
  // strength indicator. Map: { [modulatorId]: 0..1 }.
  activeStrengths: {},
  // An operator's CHOICE of weather (Stage's Weather switch) is a pure function of the
  // choice: it lands at once, and nothing the previous weather left behind survives it.
  // `requestSnap` arms it (a one-shot, not a time window, so a late frame or a slow fetch
  // cannot miss it); the directive driver consumes it on the first frame that sees the
  // new directive and bumps `snapEpoch`. Every holder of accumulated weather state
  // (snow cover, wetness, wind, cloud drift) resets when `snapEpoch` moves.
  // ▶ node checks/claims-the-light-follows-the-weather.mjs ⑤
  snapPending: false,
  snapEpoch: 0,
  requestSnap: () => set({ snapPending: true }),
  setRawDirective: (d) => set({ rawDirective: d }),
  setTweenedDirective: (d) => set({ tweenedDirective: d }),
  setActiveStrengths: (s) => set({ activeStrengths: s }),
}))

export default useAtmosphere
