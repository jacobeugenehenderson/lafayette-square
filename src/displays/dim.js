/**
 * A set-piece's uplights while its displays are lit. Tiny and separate, so <SetPieceUplights>, which every set-piece
 * mounts, never pulls a plugin's engine into a town's main bundle.
 *
 * `uplightTarget`: how far the floods go while a display is LIT (glow or show): its `dimUplights` of what the Look
 * authored (Jacob, 2026-10-31: "it's only during the show/glow that the lights need to dim"). Off, exactly as authored
 * (1); a display that authors no dimUplights leaves them alone (1).
 * `uplightScale`: the deepest dim any of a set-piece's displays asks for right now (1 with none).
 * ▶ node checks/claims-a-display-dims-its-set-piece-only-while-lit.mjs
 */
export const uplightTarget = (mode, display) => (mode === 'off' ? 1 : display.dimUplights ?? 1)
export const uplightScale = (dim) => { let k = 1; for (const v of Object.values(dim?.byDisplay || {})) k = Math.min(k, v); return k }
