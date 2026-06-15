# Cartograph — Operations (the operator's manual)

> **The engineering/operator counterpoint to [FEATURES.md](FEATURES.md).** FEATURES is the *brochure* — what it is, why it's special (user/investor-facing). **This is the *manual* — here's the panel, here's the knob, here's when to turn it (operator-facing).** Same tools, two books: one sells it, one runs it. Reference-kind (eternal-present); **operator** audience (distinct from FEATURES = user/investor, and from ARCHITECTURE/PIPELINE/RIBBONS = developer). Engineer-internals behind these knobs live in `ARCHITECTURE.md`; the geometry in `RIBBONS.md`.

> **Status: populated 2026-06-14** (the operator-knob content migrated out of FEATURES, purifying FEATURES to pure what/why). Still grows as the tile re-pour's **T3 authoring migration** reshapes the Survey/Section tools — fill in as those settle.

---

## Survey — the hardscape-SHAPE tool

The hardscape silhouette: centerlines, smoothing, caps, anchor, road metadata, corner radius, curb.

- **Asphalt-edge handle** — `pavementHW` per side (the half-width of pavement).
- **Auto-smoothing** — a selected chain shows its raw points for editing; returns to the smooth curve on `enter`. Street smoothing rides **one knob** (`STREET_SMOOTH`) so the navy centerline and the curb are one curve by construction — never two copies kept in sync by hand (`SKELETON.md §3.5`).
- **Caps** — round / blunt / none, per dead-end (a free per-dead-end authoring choice; `SECTION.md §6`/D6a + G8 govern the *fill*).
- **Curb** — global width, its own material.
- **The corner-radius kit — three layers that stack at every intersection** (Blocks ▸ Shape):
  1. **Global `Corners` slider** — multiplies every IX radius for the active Look. `1×` = AASHTO/NACTO baseline; `>1` = bubblier; `0` = fully square (useful for sponsored "retro" mode). Dragging it *resets* both override maps on commit ("scale all corners to this × default").
  2. **`Edit corners` toggle → per-IX dot** — a big blue dot at each IX center; drag the radial distance from cursor to IX to set that IX's radius (homogenizes the IX). Right-click an IX dot = **revert that IX** (clears its per-IX + per-corner overrides) without touching the rest of the map.
  3. **Per-corner cyan dots** — adjust a single corner alone, for true corner cases.
  - **Color coding:** blue/cyan = default · gold = operator-authored · white = mid-drag. Resolution at render: per-corner → per-IX → data-default, all × the global scale. All three layers persist per-Look to `design.json`; bake reads the same maps. Per-corner identity uses leg-pair keys so authoring survives chain-edit churn.
- **Revert to Data** (NEXT, `BACKLOG`) — strip the SHAPE overrides back to the skeleton's surveyed base widths.

## Section (was Measure) — the ped-profile tool

The pedestrian cross-section, stroked **inward** off the frozen curb (LU = the remainder).

- **Ped handles** — treelawn / sidewalk widths per edge.
- **Strip-material swap** — ctrl-click an LU↔SW strip to flip it.
- **Edit-row vs edit-block** — author one frontage-edge or a whole block.
- **Translucency-focus** — the selected element renders translucent / context opaque (by design, `RIBBONS.md §5`).
- **Revert to Default** — footer button (whole-scene) · **⌃-click a ped handle** = per-edge re-seed to the calculated best-effort (gleaned treelawn-Y/N + ADA defaults). Field-scoped so it never wipes Survey (`SECTION.md §8`).

## Stage — the look tool

Materials, color, visibility, shaders, sky, post-FX, neon, camera — the per-Look aesthetic, baked into the slab.

- **Surfaces** — color / visibility per material · **Sky & Light** · **Post-FX** · shots / Hero keyframes.
- **Sky Layer Gain** — *"how dark is the night sky."* Dims (or lifts) **just the sky dome** on a TOD curve — bands, sun/moon glow, horizon scatter together. It is exposure scoped to the sky layer: the global **Exposure** knob darkens the *whole frame* (buildings + ground + sky), whereas Sky Layer Gain touches only the dome — so deep night goes genuinely dark while street lamps and lit windows stay where authored. Stars are not affected. LS authors ~1.0 by day dipping to ~0.2 at Night; default 1.0 leaves an unauthored Look unchanged. **Reach for Sky Layer Gain when the *sky* is too bright; Exposure when the *whole image* is.** *(Note 2026-06-07: bloom no longer auto-boosts at night — author it in the Post-FX **Bloom** channel; night otherwise leans on lamp glow, cheaper and intentional.)*
- **Hero shot** — an authored camera **bounce**: the camera sweeps a Catmull-Rom path Start → (mids) → End → back, looking at the resolved hero subject. **Start/End are permanent anchors**; insert optional **Mid** keyframes (only mids are deletable). Capture button is playhead-keyed: in a gap → **Add Keyframe**; parked on a dot → **Update Keyframe** (match-aware — reads "✓ Keyframe set" until you move the camera). FOV is a per-keyframe animated channel; an `easing` knob shapes the sweep. Replays identically in Stage / Preview / production via `heroAnim.js`.
- **Bake buttons** — Designer's **"Stage →"** = navigate to your last Stage shot immediately, bake async in the background (the slab refreshes when done). Stage's **"↻"** = bake in place, stay put. Both accept **⌥-click to force a full rebuild** (bypass the dirty-check). A small orange dot lights when authoring edits exist since the last bake (indicator only — never disables the action).
- **Alley end-cap dial** (Paths ▸ Shape) — a 3-segment toggle controlling how **all** alleys in the active Look terminate: `square` (flush) / `rounded` (rounded-rectangle pad) / `round` (true semicircle). Stored as `design.alleyCap`. Other path kinds use per-kind defaults and carry no operator surface.
- **Tube-radius slider** (Neon) — per-Look `tubeRadius` (0.1–3.0 m, default 1.0). Unlike the color/intensity channels it drives geometry, so it rebuilds the merged mesh on change (step-quantized so a drag doesn't churn).
- **Stage drag semantics** — Browse: LEFT-drag = pan, ⌥+LEFT (or RIGHT) = orbit. Hero/Street: LEFT = rotate, ⌥+LEFT = pan (they're inspection shots). Designer's "Stage →" always lands on Browse so the camera transition is continuous with the overhead view.

## Preview — the slab inspector

GPU profiler · phone-mode · layer-toggle matrix · TOD scrub. Walks the *shipping* render with a profiler strapped on. Keystone Reference: **`PREVIEW.md`** (the model — what it inspects + how to read the numbers).

## CLI / bake operations

- The two-step build: `node skeleton.js` → `node pipeline.js` → `node promote-ribbons.js` → `node bake-ground.js` (the pipeline does **not** re-run the extractor — `[[feedback_skeleton_pipeline_two_step]]`).
- The bake is incremental (dirty-skipped); `?force=1` on the URL (or ⌥-click a bake button) forces a full rebuild.
- **The bake-target guard:** an unflagged bake targets `lafayette-square`.
- Server edits (`cartograph/serve.js`) require a `carto` restart — the browser + bake scripts auto-pick-up, but the long-lived server does not (`ARCHITECTURE.md`).

*Provenance: Boz 2026-06-01 (seed); populated 2026-06-14 from the FEATURES operator-knob migration. The operator-manual counterpoint to FEATURES.*
