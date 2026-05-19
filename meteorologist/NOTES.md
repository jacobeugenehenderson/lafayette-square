# Meteorologist — Notes

Historical decisions + EOD records for the cloud + weather authoring track. Append-only; nothing here is current punchlist (see `BACKLOG.md` for that).

---

## 2026-05-19 — Reversal: in-Stage editor housing → standalone shell

**Reversed:** the prior locked decision *"Authoring location: Inside Stage, triggered from Sky and Light → Clouds row → 'launch meteorologist.' NOT a separate `/meteorologist` app"* (recorded below in the 2026-05-18 entry "In-Stage editor housing").

**New decision:** Meteorologist runs as a **standalone app at `/meteorologist.html`**, mirroring Arborist's shape. Stage retains a Clouds TodChannel row in Sky & Light (per-Look preset-id authoring) plus a "launch meteorologist →" deep-link, but the Meteorologist authoring shell is its own page.

**Why the prior rationale dissolved.** The in-Stage decision was driven by *"the Teapot author needs clouds rendered against a real sun + sky gradient + post-FX, and reproducing that stack outside Stage would be duplication + parity-drift risk."* That's a sharp concern about *reproducing* — but Meteorologist instead **consumes** Stage's published `scene.json` artifacts and mounts the same shared `<CelestialBodies>` consumer Stage and Preview already mount. There is no reproduction; the sky is real, sourced from Cartograph's bake, no fork. With consume-not-reproduce as the boundary, the original concern doesn't apply.

**What changed in the design surface during the planning session that produced this reversal.** A long planning conversation (2026-05-18 evening) iterated through layout questions and surfaced:

1. **Vocabulary lands as Teapot | Conditions.** Two co-equal top-level libraries, not nested. The per-cloud workstage is a "Teacup." Schemas keep internal names (Almanac stays Almanac in code); UI uses operator-facing vocabulary.
2. **Slot tabs are CLOUD CHAMBER | GROUND**, mirroring Arborist's slot tabs. Cloud Chamber for tuning shape; Ground for verifying scale against a hero tree.
3. **The TOD card is the right-rail topper in both modes.** Reuses `src/cartograph/TodChannel.jsx` unchanged; imports `src/tokens/design.css` for the shared palette. Same primitive, no copy.
4. **Every cloud-shader parameter is a TodChannel.** 13 params × 7 TOD slots per cloud = ~91 authored values per Teapot entry, sparsely filled. Autosave-on-edit; no Save button, anywhere.
5. **Rain / snow / lightning are modifier flags, not species or variants.** Capabilities live on the cloud preset; expression live on the per-cloud-in-condition config in the Condition editor.
6. **Conditions ship as editable + revertable presets** (same pattern Cartograph uses for material colors, TOD curves, etc.). Per-condition Revert restores ship defaults.
7. **The canary scene** swaps from the legacy 4-way-corner toy to a purpose-built `CanaryScene.jsx` (flat ground + one fancy hero tree + imported Look sky). The hero tree is intentionally a high-LOD asset we wouldn't ship in a populated scene — Meteorologist gets to spend GPU budget here because there's exactly one tree.
8. **The Look picker imports Stage's sky.** The active Look's published `scene.json` feeds `<CelestialBodies>` — switching Looks swaps the sky envelope. Same Teapot edit can be evaluated under multiple Looks.

`INTERFACE.md` (introduced this session) is the canonical layout reference; `ARCHITECTURE.md §2` documents the consume-from-Stage pattern; `SPEC.md`'s locked-decisions table was patched in this commit.

**What survives unchanged.** The schemas, the validator, the pipeline scripts, the runtime contract (`<Atmosphere />` is still the eventual v3 consumer of `presets.json` + `almanac.json`), the v1 CloudDome shipper, the SC.6 coupler scaffolding from 2026-05-13, the entire spade-work inventory in `BACKLOG.md`. The reversal is about the editor's housing, not about what gets built.

---

## 2026-05-18 — Doc structure promoted to standalone

Meteorologist's documentation was promoted to a standalone quartet (`README.md` / `ARCHITECTURE.md` / `SPEC.md` / `BACKLOG.md` / `NOTES.md`, plus topical addenda `CANON.md` + `STAGE_MIGRATION.md`). Previously, the spade-work inventory, v1 cut decision, weather-pack roadmap, and SC.6 ship-history lived inside `cartograph/BACKLOG.md`. The cartograph BACKLOG retains a one-line pointer plus the SC.6 ship-line (load-bearing for the slab-completeness narrative); everything else moved here or to `BACKLOG.md`.

Rationale: Meteorologist is its own helper app per the publish-loop pattern. Treating it as a cartograph subsection blurred the helper boundary and made the cartograph BACKLOG harder to navigate. Standalone docs match Arborist's shape (and Cartograph's own).

---

## 2026-05-13 — SC.6: Meteorologist clouds shipped (coupler scaffolding)

**Shipped in commit `4176340`** as part of the Slab Completeness sweep.

Coupler scaffolding installed without building the v3 `<Atmosphere />` runtime:

- `scene.clouds: {preset, overrides}` channel baked by `bake-scene.js`
- `src/lib/almanac-eval.js` evaluator interface — pure function `selectDirective(weather, almanac, presets, override)`, no production consumer yet (forward-compat for v3)
- `public/clouds/{presets,almanac}.json` continues to ship — the earlier cleanout plan's "strip" verdict was reversed

v1 keeps procedural `CloudDome.jsx` as the actual production renderer; no operator UI in v1.

**Parity audit clean** — `CloudDome` mounted identically across `Scene.jsx` / `CartographApp.jsx` / `PreviewApp.jsx` (no fork).

The 12/12 self-test from the SC.6 session lived in an ad-hoc node REPL — see BACKLOG item 4 for the move into `src/lib/__tests__/`.

---

## 2026-05-13 — Strip-vs-wire decision (closed: wired)

**Question.** `public/clouds/{presets, almanac}.json` were published but never consumed in production; `CloudDome.jsx` was fully procedural. Per the slab-completeness principle (memory `project_slab_carries_full_authored_product`):

- If the Sky & Light clouds panel authors anything, the slab must carry it → wire `<Atmosphere />` per `README.md`.
- If not, strip the panel — don't ship authored-but-unconsumed UI.

**Resolution.** Wired. SC.6 installed the channel + evaluator + bake path; the artifacts continue to ship. The v3 `<Atmosphere />` runtime remains the eventual production consumer; until it lands, `CloudDome` does the rendering and the channel sits forward-compatible (consumers ignore unknown fields per the bake's additive contract).

This reversed the earlier (pre-2026-05-13) cleanout plan, which had a "strip" verdict in deliberation. Reasoning that flipped it: the Sky & Light card is shipping clouds-row authoring regardless; the operator's mental model already treats clouds as part of the authored product; the channel scaffolding is cheap; future Meteorologist work plugs in mechanically. The opposite path — strip now, re-add later — would have meant tearing out and re-installing the bake channel + evaluator twice.

---

## In-Stage editor housing (architectural decision — SUPERSEDED 2026-05-19, see top of file)

> ⚠ **Superseded.** This decision was reversed on 2026-05-19; Meteorologist now runs as a standalone app at `/meteorologist.html`. The entry below is kept for posterity — it documents the rejected alternatives that were considered when the in-Stage decision was first locked, and the reversal rationale at the top of this file explains why the consume-from-Stage realization invalidated it.

Meteorologist has **no separate app shell** at `/meteorologist.html`. Its authoring UI lives inside Cartograph Stage's Sky & Light card.

Rejected alternatives (do not re-litigate unless circumstances meaningfully change):

- **Standalone `/meteorologist.html` shell** with its own three-mode editor (Library / Almanac Editor / Fake-weather). Rejected because reproducing Stage's sun-position + sky-gradient + post-FX stack inside the shell would duplicate code and create parity-drift risk against the very rendering context the Teapot author needs to see clouds against.
- **Three-tier Designer/Stage/Preview split internal to Meteorologist**, mirroring Cartograph's. Rejected because there is no Designer-side concern: no spatial geometry, no per-Look styling distinction at the helper level. The "shape vs look" split that justifies Cartograph's two modes has no analog here.

The publish-loop pattern still holds (one helper, canonical artifacts, decoupled runtime consumer); only the editor's housing differs. See `ARCHITECTURE.md §1` for the current statement.

---

## Validator status (as of 2026-05-04)

`npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json` → `ok: 52 presets, 16 rules`. Last confirmed clean 2026-05-18 during doc-restructure work.

Schemas registered in `pipeline/validate.js`:

- `preset.schema.json` + `presets-file.schema.json`
- `almanac.schema.json`
- `weather-payload.schema.json`
- `directive.schema.json`

Cross-schema invariants enforced in `validateLibrary()`:

1. Preset id uniqueness within `presets.json`.
2. Every almanac directive references presets that exist + are enabled (`enabled !== false`).
3. Cloud-blend weights in any single directive sum to ≤ 1.0001.
