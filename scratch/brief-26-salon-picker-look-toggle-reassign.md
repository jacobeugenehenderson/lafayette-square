# Brief 26 (REWRITTEN 2026-05-25) — Roster-driven Salon: navigate by roster species → compose-or-unavailable

> **This supersedes the prior "Look-only toggle + chassis species reassignment" draft.** The operator reframed the authoring model: the unit is the **roster species** (what the park needs), not the library species. Picking any chassis for a roster species *is* the assignment, so the old `speciesOverride`/relabel concept is dissolved. Prior draft preserved in git history (commit before this rewrite).

**You are the baby executing this brief.** Not the orchestrator, not a router. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

**Name yourself — a name NOT already used.** Pattern-matching to code/notes names causes collisions Jacob has had to redirect.

**Names already claimed — do NOT reuse:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Vellum, Lintel, Gnomon, Corbel, Quartz, Sextant, Mistral, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Cant, Cadastre, Boz. (Cant=tilt/joinery, Cadastre=ledger/cartography — go elsewhere.)

---

## The model

**The Salon's authoring unit flips from LIBRARY species → ROSTER species.** The operator navigates the park's roster (what Lafayette Square actually needs), and for each roster species authors a **full composition** — or marks it **not-available**.

- **Top nav = the Roster Species list** (canonicalized park species from the `GET /coverage` data — Brief 24). **This replaces the current "SPECIES" dropdown.** Each entry shows: placement count, coverage badge (🟢 literal / 🟡 composite / 🔴 gap), and authored state (composed / not-available).
- **Click a roster species → an inside authoring view:**
  - **Candidate "pick" pulldown** = the chassis that could serve it. A **toggle** scopes it: **"recommended"** (ranked fit for this roster species — literal + good cousins, from `ROSTER-COVERAGE.md` recipes / the coverage candidate logic) vs **"show all chassis"** (the entire library, including unlabeled bundle-splits + generics — so a `garden_mix` that's really a Weeping Willow is reachable here).
  - **Full composition controls**: chassis + **bark + leaves + height** — the existing Salon composition controls, re-parented under the roster species.
  - **Not-available**: pick no chassis (no acceptable sub, or operator rejects all) → the roster species renders **no tree** (deliberate gap; coverage shows it unmet).
- **The composition is library-level → reusable across Looks.** Authoring it once publishes a reusable composition (existing publish model: `public/trees/<species>`); any Look containing this roster species routes to it. Not Look-bound.

This unifies three things into one surface: the SPECIES dropdown, the coverage list (becomes the navigator), and the old reassignment idea (picking any chassis *is* the binding — no separate relabel).

## The keying spine — SETTLED: canonical-id-per-roster-species (operator decision 2026-05-25)

Every roster species has exactly **one canonical library-species-id** — its botanical home, regardless of which chassis serves it:
- Maple, Sugar → `acer_saccharum` · Oak, Pin → `quercus_palustris` · Willow, Weeping → `salix_babylonica` · Ash, Green → `fraxinus_pennsylvanica` (canonical id **exists even with no chassis yet**).
- This is a **hand-curated registry** (roster common-name → canonical id — curation, no auto-guess) that lives in / extends **`park_species_map.json`**, which is also the bake routing. The canonical id is the single routing target (not a fallback list).

**Composing a roster species:**
1. writes the composition (chassis + bark + leaves + height) under its **canonical id** (`state/<canonical>/compositions.json` → `public/trees/<canonical>`), and
2. ensures `park_species_map[<rosterName>] = <canonical>` so `bake-trees.js#pickVariant` routes that species' placements there.

**Rules that follow:**
- **The chassis is free geometry.** Any chassis can serve the canonical id (`garden_mix` geometry published as `salix_babylonica`). The chassis's own `source.species` keys NOTHING — it's just the picked model. (This is why the old `speciesOverride` is gone.)
- **Each roster species is its own canonical species.** Pin Oak and Willow Oak are *separate* compositions under separate canonical ids even if both pick the same oak chassis. Cousins share chassis *geometry* (the atlas dedups it); the compositions stay distinct (own bark/leaves/height). No more "all oaks collapse to one."
- **Candidate list is computed live** (recommended + show-all), NOT stored as routing — routing needs only the one canonical id.
- **Gap species:** the canonical id exists (botanical), the composition is **not-available** until a chassis is acquired + picked → renders no tree.
- **No procedural-filler fallback** — a roster species is explicitly composed or not-available (matches the operator's removal of fillers from the roster).

**Canonical-id minting — DECIDED (operator 2026-05-25): Option 1, slug-default with existing-entry precedence.**
> **canonical id = `park_species_map[rosterName]` if an entry already exists, else a deterministic slug minted from the canonical roster name** (`'Oak, Pin'` → `oak_pin`, `'Ash, Green'` → `ash_green`).

- Mechanical slug of the operator's *own roster name* — **no botanical guessing** (the brief's `quercus_palustris`-style examples were illustrative, NOT a mandate to invent latin). Distinct per roster species (Pin Oak ≠ Willow Oak ✓ spine). Nothing blocks — every species gets an id on first compose. **Renameable to a botanical id anytime** by editing `park_species_map` (operator curates the ~10 literals when he wants).
- **Existing-entry precedence** keeps the `acer_saccharum` smoke-test composition: point `'Maple, Sugar'` at it; the slug-default only mints for roster species with no existing map entry.
- This is fine *because the chassis is free geometry* — the id was never going to match the chassis's botanical name (`garden_mix` under a willow key), so `oak_pin` holding oak-chassis geometry is no stranger than the library's existing `broadleaf_03` / `garden_mix` ids.
- **Surface the `park_species_map` shape you land on** (list vs single canonical) in the commit body — implementation detail, not a re-opened design question.

## Goal — two sub-phases (ship + verify each, per `[[feedback_d3_bundling_failure_modes]]`)

### 26a — Roster-species navigator + candidate computation + composition/routing wiring (data/nav)
- The roster-species list as the top nav (reuse the `GET /coverage` join, Brief 24 — lift the shared join/effective-species helper rather than forking).
- Per-species candidate computation: **recommended** (the coverage literal/cousin candidates, ranked) vs **all** (full chassis library).
- The compose action: writes the composition under the resolved library-species-id + the routing entry. The not-available state.

### 26b — Inside full-composition authoring view (UI)
- Re-parent the existing Salon composition controls (chassis + bark + leaves + height) under the selected roster species.
- The candidate pulldown + **recommended / show-all toggle**.
- The not-available control.
- Coverage badge + state reflected live as the operator composes.

## What this does NOT do (scope walls)

- **Do NOT break the Grove.** The Grove still curates *which compositions are in a given Look* (per-Look roster membership) — that's the production/curation side. This brief is the *authoring/compose* side. Keep them distinct.
- **Keep the existing composition publish model** (`generate-salon` → `public/trees/<species>` → Looks roster via `design.json#/trees`). You're re-parenting the *navigation*, not forking the publish.
- **No runtime / shader / slab touch** — no `treeAtlasMaterial.js` / `InstancedTrees.jsx` / `bake-look.js` / `bake-trees.js` / `trees-atlas.json`. Authoring-UI + composition-state + routing-map only.
- **Forests stay suppressed** (Brief 23 / `_chassis-forests.json`); Brief 23a stays dormant. Procedural/LiDAR stay out of candidates (sources per 18A/18B) — confirm "show all" is chassis-level and doesn't pull them in.
- **Do NOT bake provenance** (literal/composite → slab) — that's Brief 25.

## Relationship to Brief 24 (committed, Cadastre `95ef2dc`)

Brief 24's `GET /coverage` + `CoverageView.jsx` are the read-only diagnostic. THIS brief turns that roster list into the **live authoring navigator**. Reuse/evolve the `/coverage` join + the canonicalization (`roster-name-canon.json`); lift the shared effective-species + candidate helper into one module. **The Brief 24 "clickable→Salon addendum" is SUPERSEDED by this** — the roster row *is* the navigator; don't build a separate deep-link to the HAVE species.

## Read first

- `src/arborist/SalonWorkstage.jsx` — the current SPECIES dropdown + chassis/bark/leaves controls you re-parent. (Brief 3A `8010c8e` + Cadastre's Brief 24 work are committed — rebase onto them.)
- `src/arborist/CoverageView.jsx` + `arborist/serve.js` `GET /coverage` (Cadastre) — the roster join you evolve into the navigator.
- `arborist/serve.js` `/salon/*` + `arborist/generate-salon.js` (`listSalonSpecies`, composition publish) — the publish path you keep.
- `src/data/park_species_map.json` — the routing map (the spine; likely evolves here).
- `arborist/ROSTER-COVERAGE.md` (esp. §1 recipes + §6 stale-roster finding) — the recommended-candidate source + the why.
- Memory: `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`, `[[feedback_geometry_briefs_need_artifact_inspection]]`, `[[feedback_d3_bundling_failure_modes]]`, `[[feedback_load_bearing_files_serial_dispatch]]`, `[[project_doped_artifact_placecard_edit_pattern]]`, `[[project_authoring_is_live_production_is_static]]`.

## Acceptance criteria

1. Top nav is the **roster-species list** (the "SPECIES" dropdown is gone); each row shows count + coverage badge + composed/not-available state.
2. Clicking a roster species opens the inside view: candidate pulldown with a **recommended ↔ show-all** toggle + full composition controls (chassis + bark + leaves + height) + a **not-available** option.
3. Picking **any** chassis (incl. an unlabeled split / generic via "show all") composes the roster species and sets its routing; it publishes as a **library composition reusable by other Looks**.
4. **Not-available** → that roster species renders no tree (deliberate gap), reflected in coverage.
5. The keying is implemented per the **settled canonical-id-per-roster-species spine** (above), via one shared helper; `park_species_map` stays the routing source of truth (roster-name → canonical id).
6. Grove Look-curation behavior intact; existing composition publish path intact; **no runtime/slab/shader touch**.
7. `serve.js` `node --check` clean; vite build clean. Docs: `FEATURES.md` (Salon section rewrite) + `NOTES.md` dated entry + `ROSTER-COVERAGE.md` note that the navigator is now the authoring surface.

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`: the keying spine is **settled** (canonical-id-per-roster-species, above) — implement it, don't re-open it; only surface the list-vs-single `park_species_map` shape choice in your commit body. If re-parenting the composition controls ripples into the publish path or the Grove's roster-membership model, surface it rather than chasing it. If "show all" candidates can't cleanly exclude procedural/LiDAR at chassis granularity, say so.

## Dispatch posture

Big restructure of the Salon's core navigation. **Serialize after Cadastre's Brief 24 work has committed** (shares `CoverageView.jsx` / `serve.js` / the Arborist app shell). 3A (`8010c8e`) already committed. Sub-phase **26a (nav + wiring) before 26b (authoring UI)**. The keying spine is **settled** (canonical-id-per-roster-species). ~500–700 LOC across `SalonWorkstage.jsx` + `serve.js` + `generate-salon.js` + the routing map + the navigator component. Authoring-only — no slab/runtime risk.
