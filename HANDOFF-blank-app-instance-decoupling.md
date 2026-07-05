# HANDOFF / SPEC — Blank Canonical App (instance + content decoupling)

> **Status: SPEC / catalog (2026-07-04, Boz). Not yet dispatched.** The productization-frontier arc. This is the running worklist of LS-hardwires; it *becomes* the brief when we pick it up. Related: `plans/front-front-end-and-productization.md`, Couplers §6 (the INSTANCE module).

## The goal (Jacob, 2026-07-04)
**"A blank canonical app that loads looks. LS in a non-LS look environment is a red herring."** The app is a **generic reader** of a slab; LS is just `?look=lafayette-square`. Everything in the reader that hardcodes LS's identity is **drift** to remove — not to protect. This is settled doctrine, not a new idea:
- `slab-is-the-instance-identity` — "the reader isn't load-bearing on being LS-specific… anything in the reader that hardcodes the instance's identity (the literal `'lafayette-square'`, `LATITUDE=38.6160`, `St. Louis`) is drift."
- `hardwires-come-out-when-channels-install` — LS constants come out in "their own dedicated coupler (§6 INSTANCE module)."
- `slab-render-vs-content-boundary` — **the key nuance that splits the work:** `src/data/buildings.json` does TWO jobs — a **render record** (→ the slab, already look-driven) and a **content record** (name/listings/historic → a per-instance **content layer**, NOT the slab). This arc is the **content + instance** half; the **render** half (building geometry/hide) is the roster arc.

## The two gates (non-negotiable)
1. **LS renders byte-identical** — LS-as-a-look must produce exactly today's LS.
2. **The townie app keeps reading LS content unchanged** — place cards, listings, residences, search all still work for LS. Additive before destructive; prove parity before cutting (Ward's sequence in the ledger note).

## The catalog — LS-hardwires in the reader (the worklist)
*(Verified 2026-07-04. Each is a place the "generic reader" still pretends to be LS.)*

### A. Content layer — `src/data/buildings.json` (the ~10 consumers)
The content record read directly by the app instead of a per-instance content sidecar:
`Controls.jsx`, `LafayetteScene.jsx`, `SceneNeon.jsx`, `GlassSearch.jsx`, `SidePanel.jsx`, `useListings.js`, `heroSubject.js` (Stage fallback), `StageApp.jsx`, `CheckinPage.jsx`, `CartographApp.jsx` — all `import … from '../data/buildings'` (wrapper `src/data/buildings.js` → `buildings.json`). **Target:** a per-instance content sidecar the loaded look points at; the render path already reads the slab (`SlabBuildings`). This is the "separate brief" `slab-render-vs-content-boundary` explicitly names ("geometry-source + deploy-bundled content sidecar, zero GPU benefit").

### B. Hero roster — `SurveyorPanel.jsx` (the one Jacob spotted)
`SurveyorPanel.jsx:3` imports `../data/landmarks.json` (LS's 87), and `:29` hardcodes a **`'Gateway Arch'`** entry — so the Hero Subject Picker shows LS's cast on *every* scene. **Target:** the picker defaults **empty + upload-a-prop** per scene (the `§10` brought-GLB path), listing the **loaded scene's** buildings (`useSlabBuildingIndex` is already scene-aware). The Gateway Arch becomes a **per-scene hero prop** (LS keeps it; this install reuses it — placed east/closer/bigger for drama), not a hardcoded universal option.

### C. Instance constants — `'lafayette-square'`, lat/lon, St. Louis
Scattered scene defaults + geography hardcodes. **Target:** the INSTANCE module (Couplers §6, `src/instance.js` is the seed) — one config the reader reads, no literals.

### D. Render-source hardwire — `bake-buildings.js:62` (handled by the roster arc, noted here)
`if (scene === 'lafayette-square')` load `src/data/buildings.json` for the RENDER record. Retired in `HANDOFF-building-roster-editor.md` (make LS's render source per-look). Listed here for completeness; do NOT double-own it.

## Sequence (when dispatched)
Additive before destructive, parity-gated at each cut: (1) INSTANCE module reads for the literals; (2) per-instance content sidecar; (3) migrate the ~10 content consumers to read the loaded look's content (LS's mirrors byte-identical); (4) Hero roster → scene-driven + per-scene prop. Each step proves both gates before the next.

## Boundaries
- This is the **content + instance** arc. The **render/geometry** hardwires (building hide, `bake-buildings.js:62`) belong to the roster arc — don't cross the streams.
- Worktree; canon is Boz's; flag drift.
