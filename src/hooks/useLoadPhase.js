import { create } from 'zustand'

/**
 * Phased scene loading — gates component mounting so the GPU isn't
 * overwhelmed on mobile by mounting everything on the first frame.
 *
 * Phase 0: Camera, sky, sun/moon, weather, tickers (immediate)
 * Phase 1: VectorStreets (SVG ground map)        (+100ms)
 * Phase 2: LafayettePark, LafayetteScene         (+300ms)
 * Phase 3: CloudDome, UserDot, GatewayArch, StreetLights (+500ms)
 * Phase 4: PostProcessing                         (+400ms)
 */
const useLoadPhase = create((set, get) => ({
  phase: 0,
  _started: false,

  /** Call once after Canvas mounts to begin the phase sequence */
  start: () => {
    if (get()._started) return
    set({ _started: true })
    setTimeout(() => set({ phase: 1 }), 100)
    setTimeout(() => set({ phase: 2 }), 400)
    setTimeout(() => set({ phase: 3 }), 900)
    setTimeout(() => set({ phase: 4 }), 1300)
  },
}))

export default useLoadPhase
