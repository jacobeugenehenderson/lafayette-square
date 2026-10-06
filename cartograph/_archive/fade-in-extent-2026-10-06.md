# The edge fade's Extent-era text — superseded 2026-10-06

Jacob ruled (2026-10-06) that the edge's **Fade band** and **Ruffle** are Stage controls, per Look, and that geometry
never reads the fade (the clip is the radius exactly). The live text is `cartograph/ARCHITECTURE.md` "the circle has one
origin" and `cartograph/OPERATIONS.md` Stage › Horizon › Edge. Retired verbatim:

## ARCHITECTURE.md

- ✅ **THE CIRCLE HAS ONE ORIGIN, AND THE FADE DERIVES FROM IT** (ruled by Jacob 2026-09-20; *"the street fade should be SSoT, 0 reason to add more and more layers where we have a hard and fast rule"*). The disc stores **`radius`, `center`, `fadeBand`** and nothing else about its edge. `fade.inner = radius − fadeBand`, `fade.outer = radius` — **INWARD**, derived at every read, never stored. `streetFade` is **deleted**, not reconciled: there is one fade and one schedule.
  - ⭐ **The band is the ONE knob** — how wide the feather is. 200 m kit-wide; LS's 134 was an unauthored migration default and moved with the ruling.
  - ⚠️ **The band is PER TOWN.** *"Over water the horizon should barely fade; water is usually a pretty hard line"* — a lakeshore town wanting a hard edge is just a **small `fadeBand`**, which the one knob already gives. But a town that meets water on one side and land on the others would need a **per-direction** band, and that is a **new mechanism, not built**.

## OPERATIONS.md

Under Radius (once the town is committed): **Fade band** — how wide the soft edge is, in metres (the one fade knob) — and **Ruffle** — 0 a clean circle, up to 1 a strongly scalloped edge. Both save as you drag (no pour); the 2D map follows at once, Stage at the ground's next bake.

The distance: the Arch or the backdrop where the town has one, and the air between. *(Was "Hero & Horizon"; the
horizon ground disc is gone — the town's edge is the neighborhood fade, set in Extent: **Fade band** + **Ruffle**.)*

## ROADMAP.md (the ruling's board line, landed)

- **✅ RULED (Jacob, 2026-10-06): the edge's Fade band and Ruffle are STAGE controls, not Extent's.** They live in Extent today (`ExtentApp.jsx#EdgeFadeRows`, stored in `neighborhood_boundary.json` as `fadeBand` / `fadeRuffle`, its own hint saying *"shows in Stage at the next Bake"*). ⇒ move both to Stage as **per-Look** channels; **Ruffle survives and is TOD-animatable**; Extent keeps the **radius** (it cuts the geometry — authoring) and shows the fade as a **read-only** ring. ⭐ The 2026-09-20 one-knob ruling (`ARCHITECTURE` "the circle has one origin") stands: one source, now in the Look. ⚠️ Every reader of `fadeBand` moves with it (MapLayers, AerialTiles, the stencil, the bake). Owner: Flare, after Jackson Heights' bake. S–M.
