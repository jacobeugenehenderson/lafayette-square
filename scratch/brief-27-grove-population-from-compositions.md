# Brief 27 — Grove population from Salon compositions (retire the rating gate; update on Re-publish)

**You are the baby executing this brief.** Not the orchestrator, not a router. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

**Name yourself — a name NOT already used.** (Cadastre owns the Grove coverage view + Brief 26 and is the natural *warm* baby for this if available — if you ARE Cadastre continuing, keep your name and skip this section.)

**Names already claimed — do NOT reuse:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Vellum, Lintel, Gnomon, Corbel, Quartz, Sextant, Mistral, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Cant, Cadastre, Boz.

---

## Why this brief exists

The Grove's population is the **old regime**. Today (`src/arborist/Grove.jsx`): it's a *"gallery of every **rated** variant in the library"* — the operator sets a `qualityOverride` (Fill / Mid / Hero) on a variant in a workstage, it appears under **"All Rated,"** then they manually toggle **"Add to Look"** → it lands in `design.json#/trees` → shows under **"In Look."** Empty-state copy literally says *"rate variants in a species workstage (Fill / Mid / Hero) and they'll show up in the Grove."*

Under the **new roster-driven regime** (Brief 26): the operator composes per roster species, and **saving + re-publishing a composition IS the intent** — the separate "rate it, then add it" dance is obsolete. **The Grove should be populated by the Salon compositions and update on Re-publish.** Its role narrows to (a) per-Look membership (which composed species are in which Look — compositions are library-level/reusable) and (b) the bake gesture. The "All Rated" browse gallery is superseded by the coverage view (Brief 24) + the Salon navigator (Brief 26).

## Decided (operator 2026-05-25)

- **The Grove updates on Re-publish**, NOT on Adopt. Re-publish *stages to the library* (`public/trees/<canonical>` + `syncLookRoster` → `design.json#/trees`); the Grove reads that published/roster state. Adopt-only (unpublished) compositions do not appear — consistent with the authoring/production split (`[[project_authoring_is_live_production_is_static]]` / Brief 14: Adopt=author → Re-publish=stage-to-library → Grove-bake=ship-to-slab).

## Pre-dispatch inspection (Scion, 2026-05-25) — read before coding

Brief 26 landed (`83edde9`); dependency gate clear. Inspection findings that **resize this brief**:

- **The Grove visibility gate is `serve.js#/grove` line ~295 (`if (quality < 2) continue`), reading RAW manifests via `scanBakedManifests()` — NOT `index.json`.** `Grove.jsx#filterQuality` is a *secondary, optional* UI filter (defaults 0=off); `build-index.js#effQuality<2` gates the *runtime* path, not the Grove. Three gates, only the serve.js one is load-bearing for the Grove. (Classic `[[feedback_data_flow_split_first_check]]`: Grove reads file X, gate lives in endpoint Y.)
- **`quality >= 2` IS the de-facto "published" signal.** `patchManifestForSalon` (`generate-salon.js` ~1395) stamps **`qualityOverride: 4`** on every Salon-published variant; raw ingested vendor chassis (e.g. `acer_rubrum`, `abies_concolor` — `source:glb`, quality 0, with LODs) stay at 0. So the rating gate and the published-not-raw-chassis gate are the **same line**. **Removing `quality < 2` floods the Grove with unpublished chassis** — do NOT remove it; reframe it.
- **Acceptance criteria 1, 2, 4 are ALREADY functionally wired.** Re-publish → `patchManifestForSalon` stamps 4 → passes serve.js gate → `syncLookRoster` adds `{species,variantId}` to `design.json#/trees` → store `looksRosters` → `Grove.jsx#inLook` shows it In-Look, no manual rate step. The real remaining work is **criterion 3**: retire the *UI rating-gate affordances + stale mental model*, not a data rewire.
- **`bake-trees.js#pickVariant` does NOT read `qualityOverride`** — it reads the resolved `v.quality` from `index.json` (line ~187) for the hero-lottery `maxQ` tiering. `qualityOverride` is consumed only in `build-index.js` (gate + the `quality` value it writes). Under one-composition-per-roster-species the lottery is effectively vestigial (publish Heroes everything to 4; usually one candidate per species) — **but that's the deferred bake-trees question, not this brief.** So the EditorCard rating ladder STAYS (only authoring surface for the still-consumed field); only its *visibility-gate* role is retired.

**Scope as executed:** UI + copy in `Grove.jsx` (remove `filterQuality` control, rewrite empty-state/scope copy to compose-and-republish, relabel "All Rated"→"All Published", fix doc comment) + a comment reframe at `serve.js#/grove` (gate is published-not-rated). **An explicit `v.published` marker** (decoupling the gate from the rating *value* entirely, so a hand-downrated composition stays visible) is a clean generate-salon schema addition — **deferred to follow-up**, named here, not built (would touch the publish/bake path; out of scope wall).

## Goal

1. **Populate the Grove from published Salon compositions in the active Look's roster**, not from the "all rated variants" gallery. A composition that's been Re-published (and is in the Look's `design.json#/trees`) appears in the Grove; one that hasn't doesn't.
2. **On Re-publish, the composition appears in the Grove, in-Look.** `generate-salon.js#syncLookRoster` already adds Salon-published variants to `design.json#/trees` — confirm that's the wire and that the Grove reflects it without a manual "Add to Look" step for the active Look.
3. **Retire the rating gate for Grove visibility.** Visibility = published + in-roster, NOT `qualityOverride` Fill/Mid/Hero. Update the empty-state + scope copy accordingly.
4. **Keep per-Look membership** (toggle a composition in/out of a Look) — compositions are library-level; a Look rosters a subset. That stays; it's just no longer gated on a rating.

## What this does NOT do (scope walls)

- **Do NOT touch the bake gesture** — Grove bake → slab (`/atlas/bake`, Brief 14) is unchanged.
- **Do NOT remove `qualityOverride` if `bake-trees.js#pickVariant` still consumes it for substitution.** This brief decouples it from *Grove visibility* only. Whether the quality lottery is still meaningful under the new one-composition-per-roster-species regime (likely vestigial — no procedural fillers to out-rank) is a **separate** bake-trees question — surface it, don't resolve it here.
- **Do NOT touch the LS runtime / shaders / the slab artifacts.** Authoring-UI + roster-state only.
- **Do NOT rebuild the coverage view or the Salon navigator** — those are Briefs 24/26. Reuse, don't fork.

## Read first

- `src/arborist/Grove.jsx` — the `scope` ('look' / 'all'), `inLook`, `filterQuality`, the rated-variants list, the empty-state copy. This is the surface you rework.
- `arborist/generate-salon.js#syncLookRoster` (~line 1432) — the Re-publish → `design.json#/trees` wire. Confirm it carries the new canonical-id compositions (Brief 26).
- `arborist/serve.js` — the Grove's data source (variant list / `index.json`) + `/atlas/bake`.
- `arborist/build-index.js` — `effQuality = qualityOverride ?? quality` (the rating the old Grove gated on). Trace where it's still load-bearing before retiring the gate.
- **Brief 26** (`scratch/brief-26-...md`) — the canonical-id composition model this consumes. **27 depends on 26 having landed.**
- Memory: `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`, `[[feedback_d3_bundling_failure_modes]]`, `[[project_authoring_is_live_production_is_static]]`, `[[feedback_load_bearing_files_serial_dispatch]]`, `[[feedback_data_flow_split_first_check]]`.

## Inspection points (surface before building)

1. **Grove population path today** — exactly how the variant list + `inLook` + `filterQuality` build the visible set, so you swap the *gate* (rating → published-in-roster) without breaking the membership toggle or the bake button.
2. **`syncLookRoster` carries the new compositions** — confirm Re-published canonical-id compositions land in `design.json#/trees` in the shape the Grove reads. (Per `[[feedback_data_flow_split_first_check]]` — the Grove reads file X, publish writes file Y; verify they match.)
3. **`qualityOverride` downstream** — is it still consumed by `bake-trees.js#pickVariant`? Report yes/no so we know whether the rating control retires entirely (separate brief) or just stops gating Grove visibility. **→ RESOLVED (Scion): NO — `pickVariant` reads resolved `v.quality` from index.json, not `qualityOverride`. `qualityOverride` is consumed only in `build-index.js` (gate + value). Rating ladder stays (still feeds the lottery via index.json `quality`); only its Grove-visibility role retires. Full lottery-vestigiality = deferred bake-trees brief.**
4. **"All Rated" scope fate** — retire it (coverage view + Salon navigator supersede it) or repurpose it to "all published compositions (browse)"? Surface your recommendation. **→ DECIDED (Scion): repurpose to "All Published" — it remains the surface for adding a library composition to a Look it isn't yet in (compositions are library-level; a Look rosters a subset). Keep the scope toggle; drop only the Fill/Mid/Hero quality filter.**

## Acceptance criteria

1. The Grove's **In-Look** view is populated by **published Salon compositions in the active Look's roster** — not gated on `qualityOverride`.
2. **Re-publishing a Salon composition makes it appear in the Grove, in-Look**, with no separate "rate it" step.
3. The rating gate is removed from **Grove visibility**; empty-state + scope copy updated to the new regime (no "rate Fill/Mid/Hero" instruction).
4. Per-Look membership toggle (in/out of the active Look) still works.
5. `qualityOverride`'s downstream role in `bake-trees` is **reported** (kept-or-retire decision deferred to a separate brief).
6. The bake gesture, coverage view (Brief 24), and Salon navigator (Brief 26) are untouched / reused. No runtime/slab touch. `node --check` + vite build clean.
7. Docs: `FEATURES.md` Grove section rewrite + `NOTES.md` dated entry.

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`: if retiring the rating gate ripples into `bake-trees` substitution or `build-index`'s `effQuality`, surface it and stop at a clean wall rather than chasing it into the bake path. If the Grove's data source can't cleanly express "published compositions in-roster" without a `serve.js` change, name it.

## Dispatch posture

**Depends on Brief 26** (the canonical-id composition model + roster-driven publish) — dispatch **after 26 lands**. Shares `Grove.jsx` + `generate-salon.js` with 24/26 → serialize. **Cadastre is the natural warm baby** (owns the Grove coverage view + 26). Focused consumer-rework, ~150–250 LOC across `Grove.jsx` + possibly `serve.js`/`generate-salon.js`. Authoring-only — no slab/runtime risk.
