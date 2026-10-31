/**
 * Stage's preview of a town's displays: per display id, { mode: 'off' | 'glow' | 'show', at: performance.now() when
 * pressed }. 'off' hangs the strands unlit (Jacob, 2026-10-31: "there's no way to preview it with the lights off").
 * Absent means LIVE (the display's own season and schedule, on the town's clock). Written ONLY by Stage's Displays
 * section; nothing that plays a town for the public writes it, so a visitor never sees a preview.
 */
import { create } from 'zustand'

const useDisplayPreview = create((set) => ({
  modes: {},
  setMode: (id, mode) => set((s) => {
    const modes = { ...s.modes }
    if (mode === 'live') delete modes[id]
    else modes[id] = { mode, at: performance.now() }
    return { modes }
  }),
}))

export default useDisplayPreview
