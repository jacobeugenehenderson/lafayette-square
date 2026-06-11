# Cartograph — Operations (the operator's manual)

> **The engineering/operator counterpoint to [FEATURES.md](FEATURES.md).** FEATURES is the *brochure* — what it is, why it's special (user/investor-facing). **This is the *manual* — here's the panel, here's the knob, here's when to turn it (operator-facing).** Same tools, two books: one sells it, one runs it. Reference-kind (eternal-present); **operator** audience (distinct from FEATURES = user/investor, and from ARCHITECTURE/PIPELINE/RIBBONS = developer).

> **Status: SEED (2026-06-01).** Populated **a-bit-at-a-time** as the reconceived tools land — the tile re-pour's **T3 authoring migration** reshapes the Survey/Section tools, so this doc fills in as those settle (don't bake stale figure-ground knobs in early). The content exists today, scattered; this consolidates it. **Sources to fold in:**
> - **`FEATURES.md` §"The three operator environments"** — the Designer/Stage/Preview walkthrough + the corner-authoring kit. *This operator/knobs content migrates **out** of FEATURES into here* — purifying FEATURES to pure what/why.
> - **[`../HANDOFF-survey-section-tool-design.md`](../HANDOFF-survey-section-tool-design.md)** — the reconceived Survey/Section tool design (panels/handles/controls under the tile model). Becomes this doc's core once T3 lands.
> - **`RIBBONS.md` §5** — the Measure operator model (click-select, handles, translucency-focus, edit-row/edit-block, the strip-swap gesture).
> - **`README.md` + the bake CLI** — the command-line operations.

---

## The panels & their knobs *(to populate as T3 lands)*

### Survey — the hardscape-shape tool
*Asphalt-edge handle (`pavementHW` per side) · the 3-tier corner-R kit (global slider × per-IX × per-corner) · caps (round/blunt/none) · curb (global, editable, own material) · auto-smoothing (selected→raw, returns to smooth on `enter`). Per `HANDOFF-survey-section-tool-design.md`.*

### Section (was Measure) — the ped-profile tool
*Ped handles (treelawn/sidewalk widths) · strip-material swap (ctrl-click LU↔SW) · edit-row vs edit-block · the translucency-focus (selected translucent / context opaque — **by design**, RIBBONS §5).*

### Stage — the look tool
*Surfaces (color/visibility per material) · Sky & Light · Post-FX · shots/Hero keyframes · the bake buttons (Stage→ / ↻). From FEATURES §Stage.*

**Make the night sky darker → Sky & Light ▸ Sky Layer Gain.** It's a gain on the sky dome only (lower = darker dome; 1.0 = unchanged). Scrub the clock to Night, then drag it down (LS sits ~0.2 at Night) until the dome reads right; lamps and lit windows are unaffected, so you can go dark without losing the city. Animate it across the day by filling TOD slots like any channel (LS holds ~1.0 daytime, eases down through Dusk to Night). Don't reach for the global **Exposure** knob to darken night — that dims the whole frame (buildings + ground), not just the sky. Reach for Sky Layer Gain when the *sky* is too bright; Exposure when the *whole image* is. Stars are intentionally not dimmed by it. Changes show live in Stage and reach Preview/production after a bake.

> Note (2026-06-07): bloom no longer auto-boosts at night — it's whatever you author in the Post-FX **Bloom** channel at that TOD. If you want a soft night haze, author it there; otherwise night relies on lamp glow (cheaper, intentional).

### Preview — the slab inspector
*GPU profiler · phone-mode · layer-toggle matrix · TOD scrub. Keystone Reference: `PREVIEW.md` (the model — what it inspects + how to read the numbers); `FEATURES.md §3` for the user-voiced summary.*

### CLI / bake operations
*The bake commands · the two-step `skeleton.js` → `pipeline.js` → `promote-ribbons.js` → `bake-ground.js` · dirty-skip discipline · the bake-target guard (unflagged → `lafayette-square`). From README + ARCHITECTURE.*

*Provenance: Boz, 2026-06-01. The operator-manual counterpoint to FEATURES; seeded, populated incrementally as the tile re-pour's tools settle.*
