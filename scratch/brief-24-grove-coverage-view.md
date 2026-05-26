# Brief 24 — Grove coverage view (roster-anchored "have vs need")

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

**Name yourself — and it MUST be a name not already used in this project.** Babies here pattern-match to names in the code/notes and pick collisions; Jacob has had to redirect repeated misfires.

**Names already claimed — do NOT reuse:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Vellum, Lintel, Gnomon, Corbel, Quartz, Sextant, Mistral, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Boz.

**Collision warning — Brief 3A may be running concurrently.** Another baby may be dispatched at the same time as you (Brief 3A, the deformer). To avoid you both picking the same name: 3A is steered toward verbs / knots / currents / foodstuffs. **You take the ledger / cartography / counting domain** — a word about inventories, maps, tallies, indices, almanacs, registers. Pick something novel in that space and state it in your first message; sign your commits with it.

---

## Why this brief exists

The Arborist now has a deep chassis library (241 chassis, 46 source species) but no way to see it **against what the Lafayette Square roster actually needs**. The operator wants to seed the Grove with a representation of every tree the park expresses, then QC them and obtain models for the gaps — and today that comparison only exists as a hand-written markdown doc (`arborist/ROSTER-COVERAGE.md`). This brief makes that comparison **live in the Grove**: a roster-anchored coverage view showing, for every species the park is *supposed to* have, whether we have it, how (literal model vs cousin composite), or whether it's a gap to obtain.

**Read `arborist/ROSTER-COVERAGE.md` first — it is your spec and your seed data.** It carries the coverage classification, the recommended recipes, the name-canonicalization merges, and the gap list. This brief turns that static doc into a live read-only Grove panel that derives the same join from data.

## Read first

- `arborist/ROSTER-COVERAGE.md` — the spec + the join logic, by hand. Your view reproduces this live.
- `src/arborist/Grove.jsx` — the surface you extend. Today it reads `public/looks/<look>/design.json#/trees`, shows per-Look roster tiles, toggles membership, fires bake. Understand its current data fetch + tile render before adding the view toggle.
- `arborist/serve.js` — where you add ONE new **read-only** endpoint. Mirror an existing `GET` handler's shape (e.g. `/salon/:species/chassis`, `/inventory`). Mounted under `/api/arborist`.
- Data sources for the join (all read-only):
  - `src/data/park_trees.json` — the park inventory (756 placements, field `species` = messy common names). This is "what we're supposed to have." **Counts come from here.**
  - `public/trees/_chassis/*.meta.json` — `source.species`, `heightRange`, `morphology` per chassis. "What we literally have."
  - `arborist/state/<species>/compositions.json` — authored/seeded compositions (which chassis is bound to which target species). "What's been composed."
  - `public/trees/index.json` + `public/trees/<species>/manifest.json` — what's actually **published** (vs only composed-on-disk).
  - `src/data/park_species_map.json` — the (⚠️ stale, dated 2026-04-29) common-name → library-id map. Use as a hint, NOT ground truth — the recipes in `ROSTER-COVERAGE.md` supersede it.
- Memory: `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`, `[[project_doped_artifact_placecard_edit_pattern]]`, `[[feedback_load_bearing_files_serial_dispatch]]`.

## Goal

A **view toggle in the Grove** — `Gallery (by model)` ↔ `Coverage (by roster need)`:

- **Gallery / by-model** — what we *have*: the existing per-model browse (keep/relocate today's tile view here).
- **Coverage / by-need (the new work)** — **roster-anchored**: one row per *canonicalized* park species, sorted by placement count descending. Each row shows:
  - placement count (from `park_trees.json`),
  - **coverage class** badge: 🟢 **literal** (a composition/chassis whose `source.species` IS the species) / 🟡 **composite** (covered by a cousin chassis) / 🔴 **gap** (no composition, no acceptable cousin),
  - the covering composition(s) / chassis if any (name + variant count),
  - **current routing**: what `src/data/park_species_map.json` maps this park-name to today — and a **flag when the map entry is missing, or points at a library species that no longer exists / isn't published.** This makes the coverage view double as the **map-refresh worktable**: `bake-trees.js#pickVariant` uses this map to fan the 89 park-names onto the ~25–30 published library species, and the map is stale (2026-04-29). You DISPLAY current-routing-vs-available; the operator edits the map by hand (it's curation). Read-only — do not write `park_species_map.json`.
  - recommended recipe hint (leaf pack + height) where derivable — optional, pull from `ROSTER-COVERAGE.md`.

The whole feature is **read-only**: a new `serve.js` endpoint computes the roster↔chassis↔composition join and returns JSON; `Grove.jsx` renders it behind the toggle. No writes, no bake, no runtime/shader touch.

**Provenance derived on the fly** — `literal` iff a covering chassis's `meta.source.species` matches the target species id; else `composite`; else `gap`. Do NOT persist or bake a provenance field — that's a deliberately separate follow-up (Brief 25, serialized behind 3A because it touches `generate-salon.js`).

## What this explicitly does NOT do (scope walls)

- **Do NOT touch any of Brief 3A's files** — `treeAtlasMaterial.js`, `InstancedTrees.jsx`, `SalonWorkstage.jsx`, `SpecimenViewport.jsx`, `generate-salon.js`. Staying off them is what keeps you parallel-safe with 3A. Your surface is `Grove.jsx` + a read-only `serve.js` endpoint + (optionally) a new small component + one canonicalization JSON.
- **Do NOT persist or bake provenance.** Derive it live. (Brief 25 wires it to the slab — not you.)
- **Do NOT auto-create or write compositions.** Seeding the Grove is the operator's gesture (or a later seeder brief). You only *display* coverage.
- **Do NOT edit** `park_trees.json` or `park_species_map.json`.
- **Do NOT touch the LS runtime or the slab.** This is a Grove authoring-UI panel only — no `bake-look` / `bake-trees` / `trees-atlas.json` involvement.

## The canonicalization problem (surface, don't guess)

The roster names are messy duplicates (`Baldcypress` vs `Cypress, Bald`; `serviceberry, downy` vs `downy serviceberry`; `Oak, Pin` vs `Oak, Pin (restricted use)`; casing). The coverage list must merge these or it double-counts. **This is curation, not auto-guess** (per the `park_species_map.json` doc comment: "the kind of curation no auto-guess gets right"). Ship a small, hand-seeded, operator-editable merge table — `arborist/roster-name-canon.json` (`{ "<raw name>": "<canonical name>" }`) — seeded from the merges already listed in `ROSTER-COVERAGE.md` §intro. Apply it in the endpoint. Unmerged raw names pass through as their own canonical name (visible, so the operator can spot a missing merge).

## Inspection points (surface findings before building the view)

1. **Grove's current data flow** — how does it fetch + render tiles today, and where does a view toggle slot in cleanly without disturbing the existing roster-curation behavior?
2. **Published-vs-composed signal** — what in `index.json` / `manifest.json` distinguishes "this species is published to the library" from "a composition exists on disk but isn't published"? The coverage view should be able to show that distinction (a composed-but-unpublished species is "have, but not baked").
3. **Cousin detection** — how do you decide a species is 🟡composite-covered vs 🔴gap? First pass: a species is composite-covered if `park_species_map.json` maps it to a library id that has a chassis/composition, OR `ROSTER-COVERAGE.md` §1 lists a stand-in. Otherwise gap. Surface your chosen rule before building — getting literal/composite/gap boundaries right is the whole value.

## Acceptance criteria

1. Grove has a working `Gallery ↔ Coverage` view toggle; the existing per-Look roster-curation behavior is preserved (regression-free).
2. Coverage view lists **every canonicalized park species**, sorted by placement count desc, each tagged 🟢literal / 🟡composite / 🔴gap with the covering composition/chassis named.
3. Counts reconcile to the roster: canonicalized totals sum to 756 placements; the merge table is applied and visible.
4. Gaps are surfaced (roster-anchored — the list shows what's *missing*, not just what we have).
5. Each row shows its **current `park_species_map.json` routing** and flags missing / dangling entries (map-refresh worktable). The map is DISPLAYED, never written.
6. Read-only: no writes to disk, no bake, no slab/runtime touch. New endpoint is a pure `GET`. (Renumber the remaining ACs accordingly.)
6. **Parallel-safe with 3A**: zero edits to 3A's five files (listed above). Verify with `git diff --name-only` before you commit.
7. Provenance is derived (literal = `source.species` matches target), not persisted.
8. `arborist/roster-name-canon.json` ships seeded + operator-editable; document it in `FEATURES.md` (Grove section) + a `NOTES.md` dated entry.

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`: if you touch a file, schema, or default not named here, or find the join needs data this brief didn't anticipate (e.g. the species_map being too stale to drive cousin-detection), disclose it in your status + commit body. If cousin-detection turns out to need real curation work beyond the merge table + species_map hint, say so and stop at a clean wall rather than guessing — the operator (Jacob) owns the literal/composite/gap judgment.

## Dispatch posture

Cold, **parallel-safe with Brief 3A** (disjoint files). Solo otherwise. ~200–350 LOC across `Grove.jsx` + a coverage component + one `serve.js` GET endpoint + the canon JSON + the join helper. The join logic already exists by hand in `ROSTER-COVERAGE.md` — your job is to compute it live and render it.

---

## ADDENDUM — ⛔ SUPERSEDED 2026-05-25 — back out (see below)

> The operator reframed the authoring model right after Cadastre absorbed this addendum. The clickable target here (coverage row → Salon on the *covering/HAVE library species*) is the **wrong unit** — the authoring unit is the **roster species**, and click-to-author now belongs to the roster navigator in **Brief 26** (rewritten). **Cadastre should back this deep-link out and keep only the committed read-only coverage view (`95ef2dc`).** The original addendum text is preserved below for history.

## ADDENDUM (ORIGINAL, superseded) — clickable coverage rows → open Salon (follow-up, same baby Cadastre, 2026-05-25)

**You're Cadastre, continuing your Brief 24 work.** The coverage view shipped and reads correctly. The operator wants it to become a **clickable worklist**: click a species row → land in the **Salon Workstage** with that species active, to visually inspect / recompose it.

**Concrete driver:** published `acer_saccharum` is a stale *forest* publish (1 variant, the old 17-trunk merged mesh) rather than the 18 corrected singles — so the operator clicks `acer_saccharum` in the coverage list, lands in the Salon, sees the forest, and recomposes it from a single chassis. The list is the punch-list for re-seeding the stale roster.

**Behavior:**
- A **covered row (🟢 literal / 🟡 composite)** is clickable → opens the Salon Workstage with the row's **covering library species** (the routed-to id you already compute, e.g. Pin Oak → `quercus_alba`) set as the **active species**. Navigate from Grove → Salon.
- A **gap row (🔴)** has no library species to open → not clickable (or visibly disabled / "no model — acquire"). Nothing to inspect.
- Target is the **covering/routed library species id**, NOT the park common-name.

**Mechanism:** row `onClick` → the store action(s) that (a) set the active Salon species and (b) `setSalonOpen(true)` / route to the Salon (you touched `Grove.jsx` + the Arborist app shell, so you know the seam). **Set the active species directly even if the Salon picker's current filter would exclude it** — e.g. `acer_saccharum` is LiDAR-filtered out of the Salon picker (Brief 15), but the operator still needs to land on it to inspect. Inspection is the point; surface this filter interaction in your report (Brief 26's "browse all" toggle is the durable fix for the filter, not your problem here).

**Scope walls (unchanged):** still read-only on coverage data; no writes; don't touch `generate-salon.js` / the runtime / the slab; keep the existing Gallery↔Coverage toggle + table behavior intact.

**Inspection point:** confirm the store seam that opens Salon + selects a species (you've seen it from the Grove side); confirm gap rows resolve to no valid target so they're correctly inert.

**AC:** clicking a covered row lands in the Salon on the correct covering species (even if filtered from the picker); gap rows don't navigate (or clearly indicate no model); the coverage view + Gallery toggle are otherwise unchanged; read-only preserved. Note the filter interaction in your commit body.
