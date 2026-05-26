# Brief 29 — DETECTIVE (read-only): why adopted roster-species never reach the Grove

**You are the dispatched agent executing this brief.** Not the orchestrator. Boz drafted it; Jacob dispatched it.

**Name yourself — a name NOT already used.** Claimed: Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Vellum, Lintel, Gnomon, Corbel, Quartz, Sextant, Mistral, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Cant, Cadastre, Scion, Boz. (Cadastre=cartography, Scion=grafting, Cant=tilt — go elsewhere; a forensic/investigation word fits.)

## ⚠️ WRITE/COMMIT BOUNDARY — THIS IS READ-ONLY

**You touch NOTHING. No edits, no commits, no script runs that write to disk.** Your sole output is a **diagnosis report** (post it back to Jacob) naming the exact break + the precise fix scope. Boz/operator decide and dispatch the fix. The working tree is shared (operator's in-flight Stage files + Boz's docs) — do not add to it. Read code, read state, read git; reason; report. (Per the check-in-at-seams discipline: a detective reports, it doesn't repair.)

## The symptom

The operator adopted several species in the (Brief 26) roster-driven Salon, but **the Grove shows the same stale set it always has** — none of the adopted species appear.

## Boz's triage (confirm or refute — don't take it on faith)

- 7 species are adopted as `arborist/state/<slug>/compositions.json` — `maple_sugar`, `ash_green`, `maple_silver`, `oak_bur`, `blackgum`, `linden_american`, `birch` (Brief 26 slug canonical-ids). **Adopt persists.** ✓
- **NONE are published** — no `public/trees/<slug>/` for any. Composition-only.
- `public/looks/lafayette-square/design.json#/trees` is still the **stale 8 species** (`cedar_generic`, `broadleaf_rt3`, `acer_saccharum` [the old forest], `generic_*`, …) — no adopted species reached the roster.
- **Brief 26 (`83edde9`) touched SalonWorkstage.jsx / serve.js / useArboristStore.js / roster-coverage.js — NOT `generate-salon.js`.** `generate-salon.js` has no canonical-id / `park_species_map` / rosterName awareness (pre-26 publish code).
- Live `GET /grove` returns 39 published variants (the old set); In-Look = the stale 8.

**Boz's hypothesis:** Brief 26 shipped the navigator + adopt-persist but **never wired the publish→Grove bridge for the canonical-id model.** Composing/adopting writes `state/<slug>/compositions.json`, but nothing propagates it (publish `public/trees/<slug>` → `patchManifestForSalon` stamp `qualityOverride:4` → `syncLookRoster` → `design.json#/trees`) — so the Grove can never see it. Half-built.

## What to determine (the report)

1. **Is there a working Re-publish path for a roster-navigator slug species?** Trace the navigator's adopt + re-publish actions (`SalonWorkstage.jsx` `republishSalonSpecies` → `useArboristStore.js` → which `serve.js` endpoint → `generate-salon.js`). Does hitting Re-publish for `maple_sugar` actually run anything, and with the slug id?
2. **If `generate-salon.js` runs for a slug** — does it (a) read `state/<slug>/compositions.json`, (b) resolve a chassis + write `public/trees/<slug>/...`, (c) `patchManifestForSalon` stamp `qualityOverride:4`, (d) `syncLookRoster` add `{species:<slug>, variantId}` to `design.json#/trees`? Find the first hop that fails or is absent. (Per `[[feedback_data_flow_split_first_check]]` — the writer and reader keys must match.)
3. **Is it "operator never hit Re-publish" vs "Re-publish is broken/unwired for canonical-id"?** Distinguish definitively. (Composition-only state is consistent with *both* — the deciding evidence is whether the navigator even *exposes/wires* a working publish for these, and whether `generate-salon` would succeed if run.)
4. **Stale-backend check** (`[[feedback_node_watch_for_backend_hmr]]`): is the running `serve.js` (port 3334) the post-26/27 build, or stale? A stale backend would serve old `/salon/publish` + `/grove` logic regardless of the code. Confirm whether a backend restart is part of the picture.
5. **The `acer_saccharum` forest** still in `design.json#/trees` + published as the old forest (1 variant) — note whether the re-seed must also *replace* it (separate from the bridge bug, but relevant to "Grove looks wrong").

## Report shape

A short diagnosis: **the exact first broken hop**, whether it's a missing-wire (Brief 26 half-built) vs an operator-step-not-taken vs a stale backend, and the **precise fix scope** (which file/function needs what). Name it; don't fix it. If the fix is "wire `generate-salon.js` for canonical-id publish + roster sync," say which functions (`patchManifestForSalon`, `syncLookRoster`, the publish endpoint) need to learn the slug model.

## Read first

- `src/arborist/SalonWorkstage.jsx` (`republishSalonSpecies`, the adopt + publish actions) + `src/arborist/stores/useArboristStore.js` (the store action).
- `arborist/serve.js` — the `/salon/:species/publish` endpoint + `/grove` gate.
- `arborist/generate-salon.js` — `patchManifestForSalon` (~1388, stamps `qualityOverride:4`), `syncLookRoster` (~1432). **Pre-26 — does it know slugs?**
- `arborist/state/<slug>/compositions.json` (the adopted state) vs `public/trees/` (the published set) vs `design.json#/trees` (the roster).
- Brief 26 commit `83edde9` + `scratch/brief-26-...md` (the intended canonical-id model) + `scratch/brief-27-...md` (the Grove-population work that assumed publish⟹visible).
- Memory: `[[feedback_data_flow_split_first_check]]`, `[[feedback_node_watch_for_backend_hmr]]`.

## Dispatch posture

Read-only diagnostic, ~no LOC (a report). Safe to run anytime; touches nothing. Hand the report to Jacob; Boz scopes the fix from it.
