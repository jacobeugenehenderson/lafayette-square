# The Neon card's close-up sliders — superseded register text (retired 2026-11-02)

Moved here verbatim when the Neon card in Stage went from eight sliders to three (Jacob, 2026-11-02: "I don't think the
3D (close up) controls are useful at all at this point. Perhaps when we develop the street view but not presently… I
think we're looking for line width and brightness; maybe glow/emissive"). The five fields below are still the channel's:
each Look keeps what it authored and the renderer reads them; only their sliders left the card. Live text:
`cartograph/OPERATIONS.md` § Neon. Live code: `src/cartograph/skyLightChannels.js#NEON_FIELDS` (the card) and
`#NEON_FIELD_KEYS` (the channel). ▶ `node checks/claims-the-neon-card-shows-what-jacob-ruled.mjs`

## The five sliders, for the street view (as they were in `NEON_FIELDS`)

| key | label | min | max | step |
|---|---|---|---|---|
| `core` | Hot core | 0 | 1 | 0.02 |
| `tube` | Tube glow | 0 | 1 | 0.02 |
| `bleed` | Atmospheric bleed | 0 | 1 | 0.02 |
| `tubeCm` | Tube radius (cm) | 0.5 | 10 | 0.25 |
| `handoffPx` | Hand-off (px) | 1 | 32 | 0.5 |

The three kept were renamed: `lineGain` "Line brightness" → **Brightness**, `emissive` "Emissive" → **Glow**
(`linePx` stays "Line width (px)").

## from `cartograph/OPERATIONS.md` § Neon

**Neon** — the neon look as one grouped TOD channel, two drawings of one sign handed off by on-screen size. **Hot core / Tube glow / Atmospheric bleed** shape the tube; **Emissive** is how fast a sign reaches its full colour (it rolls off along the hue, never to white). **Tube radius (cm)** is the real glass tube, never inflated (kit day 1.5 cm, 0.75 at dawn) — the one field that rebuilds geometry, step-quantized so a drag doesn't churn. **Line width (px)** is the far line's on-screen width (kit 5). **Hand-off (px)** is the tube's on-screen diameter at which the line takes over (kit 5; the crossfade band is a constant). **Line brightness** balances the line against the tube (kit 1). Neon *colour* is chosen per category in **Identity** (the toolbar). **Testing (Look only, session-only):** **Neon on** lights every place (each on its own stretch), off shows none, and **Density** thins them to a share (a stable draw, so raising it only adds buildings) — it tests the neon, not the schedules; production runs each place on its own hours. Mounted in every scene's Look. *(Phase B will move Neon into the Light Sources card with Bloom + Lamps.)*
