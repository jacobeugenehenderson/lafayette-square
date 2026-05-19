# Meteorologist — Notes

Historical decisions + EOD records for the cloud + weather authoring track. Append-only; nothing here is current punchlist (see `BACKLOG.md` for that).

---

## 2026-05-20 — Kit-level clock + calendar anchor (ADR, in flight)

**Decision direction (in flight, not yet shipped):** time-of-day AND date/season are kit-level primitives. ONE anchor, ONE pump, N consumer UIs. No per-helper anchors.

**Why this matters now.** The seed-from-physics sky direction (above-this-entry, parked) needs `dayOfYear` to drive seasonal sun-path. Arborist's seasonal tree variants (winter bare, fall colors, etc.) need the same. Meteorologist's `whenBlock.season` matching in the Almanac evaluator needs it. Three helpers, one piece of state — must be shared or it drifts.

**The shape:**

```
src/hooks/
  useTimeOfDay.js          (exists — kit primitive, owns current minute-of-day,
                            isLive flag, scrub semantics)
  useCalendar.js           (NEW — owns current date, day-of-year, season)

src/components/
  ClockCalendarPump.jsx    (NEW — when mounted in live mode, ticks both stores
                            from wall time. Production scenes mount; authoring
                            tabs skip + let scrub UIs drive instead.)

# Each helper hosts its own scrub UI over the shared state:
src/cartograph/   — DawnTimeline (exists, TOD scrub) + DateScrubber (NEW, date scrub)
src/meteorologist/— DawnTimeline mounted in Teacup; Condition editor honors season match
src/arborist/     — reads useCalendar.season to pick tree variant (future)
```

**The principle:**
- **Shared anchor:** one source of truth per concept (clock; calendar). Lives in `src/hooks/`.
- **Shared pump:** one driver component that ticks the anchor from wall time when in live mode.
- **Per-helper UI:** each helper renders its own scrub affordance over the shared state. UIs aren't shared; the state IS.
- **Live vs. scrub semantics:** anchor carries `isLive`. Production mounts the pump in live mode. Authoring tabs leave the pump off (or mount in scrub mode) — operator drives via scrub UI.

**Rejected alternative:** each helper mints its own clock/calendar store. Drifts the moment two tabs disagree; production would need to multicast to N stores; authoring across helpers becomes incoherent. The activeLookId pattern (one canonical Cartograph store, consumed by Arborist + Meteorologist) is the precedent.

**Phasing (orchestrated by Meteorologist for cross-helper coordination):**

1. **Land `useCalendar` + `ClockCalendarPump`** (kit-primitive baby brief, queued in `scratch/handoff-2026-05-20-kit-clock-calendar-primitive.md`). Document the doctrine.
2. **Cartograph adds `DateScrubber`** next to DawnTimeline. Cross-helper brief to Cartograph coordinator.
3. **Meteorologist consumes useCalendar** in the Condition editor (whenBlock.season eligibility); I do this directly post-step-1, no baby.
4. **Arborist consumes useCalendar** for seasonal tree variant selection. Cross-helper brief to Arborist coordinator. Pairs naturally with their year-round trees work.
5. **Production runtime mounts `<ClockCalendarPump mode="live">`** — Scene.jsx + LafayetteScene.jsx. After 1-4 land.

Cross-tab sync (BroadcastChannel) is a v2 nice-to-have; per-tab independence is fine for v1.

---

## 2026-05-20 — Phase 4b.1 shipped: `<Atmosphere />` raymarched cloud shader

The heaviest single piece of the project landed in one baby commit. `<Atmosphere />` replaces `<CloudDome />` in `CanaryScene` with a volumetric raymarched shader implementing all five photoreal levers per the HANDOFF principles. Uniforms hardcoded to `cumulus_humilis` values; preset-driven binding queued for Phase 4b.2.

**Commit:** `d1c66fe` on `cartograph-looks-pass-ab` (parent `6a3fd29` from Phase 4a).

**Shape:** 3 files. Created `src/components/Atmosphere.jsx` (mount + uniform plumbing + `useFrame` ticker), `src/components/atmosphere-materials.js` (shader factory with inline GLSL template literals). Modified `src/meteorologist/CanaryScene.jsx` to swap `<CloudDome />` for `<Atmosphere />`.

### Levers landed

All five, per the HANDOFF-clouds-day3-clouddome-v2.md "Tune to principles" checklist:

1. **Domain warping** — single-pass 3D FBM domain warp; cauliflower lobes emerge from `worldPos + warpAmp × noise(worldPos × warpFreq)`. CloudDome's 2D math adapted to 3D value-noise on a volumetric lattice.
2. **Vertical density gradient** — smoothstep profile `floor=smoothstep(0,0.1,h) * ceil=1-smoothstep(0.6,1,h)`; cumulus reads as flat-based, not spherical.
3. **Three-tier lighting** — density-gradient `cloudNormal()` via ε-separated samples; `dot(normal, sunDir)` lerps between three colors (sun-side warm, body neutral, shadow-side cool×ambientFloor).
4. **Self-shadowing** — 6-step toward-sun shadow march; `exp(-shadowDensity × shadowStrength)` falloff multiplies lit color.
5. **Silver lining** — Mie forward-scatter at thin sun-facing edges; `smoothstep(0.7, 1.0, vdotS) × edgeFactor × edgeSilver × sunScatter`.

### Notable disclosures

- **`frustumCulled={false}` on the slab mesh.** R3F's auto-cull would drop the slab when the camera is inside the volume at a tilt (e.g. CLOUD CHAMBER's `[0, 200, 300]` looking up to `[0, 600, 0]`). Catching this was real defensiveness; without it the cloud would blink out on certain orientations.
- **`SLAB_BASE_ALT / SLAB_THICKNESS / SLAB_HALF_XZ` exported** so `<boxGeometry args>` and `uSlabMin / uSlabMax` uniforms share a single source of truth. Good hygiene; saves the next phase from drift.
- **Inlined GLSL as template literals** in `atmosphere-materials.js` rather than separate `.glsl` files. Brief allowed either; inlining is lighter.
- **Option A for sun direction** — hardcoded warm-noon `(0, 0.7, 0.7).normalize()` + `#ffe6c8` / `#9faab8` sky base. `useSceneJson` not imported; `lookId` prop accepted on `<Atmosphere />` for Phase 4b.2 signature continuity but currently unused. Phase 4b.2 wires it.
- **`CloudCoverSeed` retained but neutered** — Atmosphere ignores `useSkyState`, so the Phase-4a seed does nothing. Comes out in Phase 4b.3 alongside the broader CloudDome retirement.

### Self-flagged debug pointer

The baby surfaced an unusually thoughtful potential failure mode in the commit body: **`eps = 30m` in `cloudNormal()` vs `uWarpFreq = 0.001` (1/m → ~1000m noise wavelength).** A 30m step is 3% of one wavelength; the gradient direction should still be right, but **at density edges** (where the FBM-vs-threshold clipping produces a sharp 0-density boundary) one ε-sample can land outside the cloud and read 0, giving a degenerate normal that manifests as flat-color patches. Easy retune if the visual review surfaces this; first place to check if "three-tier lighting" reads as "uniform gray."

### Debug-order primer (for when Jacob eyeballs)

If the cloud doesn't render as expected, debug in this order:

1. **Cloud invisible / empty box** → FBM doesn't cross the `density - (1 - coverage)` threshold. Check FBM range; raw value-noise FBM often returns `[-0.5, 0.5]` not `[0, 1]`, needing a `* 0.5 + 0.5` remap.
2. **Cloud fully opaque sphere** → alpha-accumulation multiplier (`0.005` placeholder) too high. Halve it.
3. **Cloud uniform gray blob** → three-tier blend collapsed. Temporary debug uniform that returns `normal * 0.5 + 0.5` as RGB; if NaN-purple or uniform, `cloudNormal` is broken (eps/wavelength is the candidate fix).
4. **Cloud renders wrong place / disappears at some angles** → slab intersection broken, OR logdepth chunks missing (Atmosphere included them; verify with `console.log` in shader compile).

### Phase 4b.1 verification status

Module compile + dev server + validator all clean. **Visual verification deferred to Jacob's eyes** (HANDOFF checklist items 1–5 + 9). Phase 4b.2 brief should NOT be drafted until this verification passes — TodChannel binding is meaningful only if the shader works.

### What's queued

- **Phase 4b.2 (next)** — TodChannel uniform binding. Replace hardcoded uniforms with per-frame `resolveGroupAtMinute(activePreset.params[paramKey], currentMinute)` reads. Slider scrubs in Teacup's right rail visibly affect the viewport. Animated channels lerp between keyframes.
- **Phase 4b.3** — Retire `CloudDome.jsx` + `SpriteClouds.jsx` per `STAGE_MIGRATION.md`. Swap production mount sites. CloudCoverSeed comes out. HANDOFF-clouds-day3-clouddome-v2.md retires.
- **Phase 3b** — Promote directive numerics to TodChannel + add cloud capabilities + per-cloud-in-condition expression flags. Lands after 4b so the temporal modulation is visually validatable.
- **Phase 5** — Fixtures + Almanac evaluator hot-mount + fallback editor + cloud preset gallery + mobile quality tier + multi-preset blending + camera orbit.

### Lessons that didn't make it to memory yet

- **Prescriptive briefs work for shader sprints.** Phase 4b.1's brief was significantly more prescriptive than Phases 1–4a — explicit uniform list, code-shape sketches per lever, fallback path if all five didn't land in one session, debug-order primer. Result: all five levers landed cleanly in one commit with no scope drift. Inverse-proportional: the more variance the work has, the more prescriptive the brief should be.
- **`frustumCulled={false}` is a class of fix.** Any time geometry is bigger than expected for its position OR the camera is inside the geometry, R3F's auto-cull will misbehave. Worth keeping in mind as a candidate when geometry "should be visible" but isn't.

---

## 2026-05-19 EOD — From zero to viewport in one day (Phases 1 → 4a)

A single planning + execution arc took Meteorologist from "five docs and a validator" to "standalone app with both authoring surfaces live + viewport rendering." Five commits, four baby agents, two architectural reversals, and five new memory entries. End-of-day state captured in `README.md`'s Status section.

### What shipped

| Commit | Phase | Scope |
|---|---|---|
| `0330a3e` | doc structure | Excised Meteorologist content from cartograph docs; introduced the quartet (ARCHITECTURE / BACKLOG / NOTES) |
| `b5accb3` | doc structure | `INTERFACE.md` + standalone-shell reversal (see entry below) |
| `47c5de0` | **Phase 1** | Scaffold + read-only library views (`/meteorologist.html` + serve.js port 3335) |
| `95bad99` | **Phase 2** | Teacup workstage + 13 cloud-param TodChannels (schema relaxed to `oneOf [number, animatableValue]`; existing presets migrated) |
| `5fd8f78` | Phase 2 chrome | Glass-panel + section-heading on the cards (fixed by importing `src/index.css` instead of tokens-only — see memory `feedback_kit_helper_css_import_index_not_tokens`) |
| `98f3781` | **Phase 3** | Condition editor (When + Directive + Clouds-in-condition + per-condition Revert via `almanac.defaults.json`) |
| `6a3fd29` | **Phase 4a** | CanaryScene viewport (sky-from-active-Look + hero tree + flat ground + placeholder CloudDome) |

### Architectural reversal: in-Stage → standalone shell

Earlier in the day the SPEC's locked decision *"Authoring location: Inside Stage … NOT a separate `/meteorologist` app"* was reversed. The original rationale (don't reproduce Stage's sky stack) collapsed once it became clear that Meteorologist could **consume** Stage's published `scene.json` artifacts via the existing `<CelestialBodies>` consumer, rather than reproduce them. The full reversal entry is the next section down (with the prior in-Stage entry preserved-and-marked-SUPERSEDED).

### Vocabulary landed

- **Teapot** (cloud preset library, 52 entries, primary unit of Teapot mode)
- **Teacup** (per-cloud workstage)
- **Conditions** (weather situations, 16 entries — internally still `almanac.json` for schema continuity)
- **Condition editor** (per-condition workstage)
- **CLOUD CHAMBER / GROUND** (two slot tabs for the viewport)

### Memory entries created today

All under `~/.claude/projects/.../memory/`:

1. `feedback_kit_helper_css_import_index_not_tokens.md` — new helpers must import `src/index.css`, not just `src/tokens/design.css`, to get utility classes.
2. `feedback_absence_means_inherit_in_authored_blocks.md` — UI needs engagement toggles + autosave needs empty-parent pruning when the schema has "absent → inherit" semantics.
3. `feedback_json_stringify_loses_handauthored_format.md` — `JSON.stringify(obj, null, 2)` reformats compact arrays on first PUT; mitigate via immutable `*.defaults.json` sibling.
4. `feedback_stash_isolate_per_file.md` (amended) — added "check `git status` for STAGED state before commit, not just working-tree diff" after Phase 4a baby caught a 10-file pre-staged index slip and self-recovered.

### Disclosure trail (load-bearing additions across the arc)

Each baby agent surfaced its scope-drift cleanly. Notable ones that became architecture:

- **Phase 2:** `_flushPendingSaves()` primitive (flush debounced autosave before any preset switch). Generalized in Phase 3 to drain both preset + rule timers.
- **Phase 2:** Cloud pulldown filtered by `kind` (cloud↔cloud, fog↔fog) — prevents nonsense cross-kind selection.
- **Phase 3:** Engage/off toggles on directive fields (absent vs zero distinction). Empty-parent pruning in `setRuleField`. Orphan preset ids render in red. All three → memory entry above.
- **Phase 4a:** `CloudCoverSeed` one-shot to make CloudDome visible (useSkyState defaults to 0 = empty sky); disappears in Phase 4b when `<Atmosphere />` reads from preset params directly.

### What's queued

Per `BACKLOG.md` and `README.md` Status:

- **Phase 4b.1** — `<Atmosphere />` v3 raymarched shader with 5 photoreal levers, statically bound to one test preset (`cumulus_humilis`). The biggest single piece of the project.
- **Phase 4b.2** — TodChannel uniform binding: scrubbing a slider visibly affects the viewport.
- **Phase 4b.3** — Retire `CloudDome.jsx` per `STAGE_MIGRATION.md`; production swap.
- **Phase 3b** — TodChannel promotion of directive numeric fields + cloud capabilities + per-cloud-in-condition expression flags. After 4b lands so the temporal modulation is visually validatable.
- **Phase 5** — Fixtures + Almanac evaluator hot-mount + fallback editor + cloud preset gallery + camera orbit controls.

Briefs for Phases 1-4a are in `scratch/handoff-2026-05-19-meteorologist-phase-{1,2,3,4a}-*.md`. Phase 4b.1 brief is not yet drafted; tomorrow's first orchestrator task.

### Lessons that didn't make it to memory

- **The right phasing emerged in conversation.** Phase 4 nearly became "one big Atmosphere phase"; splitting into 4a (architecture proof with CloudDome placeholder) + 4b.1/4b.2/4b.3 (shader / binding / retirement) only landed after thinking through what a baby's commit looks like at each step. The smaller the unit, the cleaner the verification — and shader work has the highest variance, so isolating it minimizes blast radius.
- **The standalone-shell reversal wasn't trivial.** What looked like "just change the housing" required patching SPEC.md's locked-decisions table, rewriting ARCHITECTURE.md §1 + adding §2 (consume-from-Stage), reframing INTERFACE.md, and documenting both the new direction and the SUPERSEDED prior direction in NOTES.md. Architectural reversals are cheap in conversation, expensive in docs — but doing the docs first paid off (every subsequent baby read the new state, not the old).

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
