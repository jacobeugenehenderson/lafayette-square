# Publish only publishes; Extent ends at its own work — superseded register text (retired 2026-11-01)

Moved verbatim when Publish stopped running the Foundry, the Foundry stopped asking before a code-caused re-run (the press is the consent; the held pour's question stays), and Extent stopped pouring (Boz's rulings, Jacob 2026-11-01: "3 discrete functions: Stage, Preview, and Publish"). Live text: `cartograph/OPERATIONS.md` § Extent and § Publish; `cartograph/FOUNDRY.md` §2; `cartograph/ARCHITECTURE.md` (Extent).

## from `cartograph/OPERATIONS.md`

## Extent — define a new neighborhood and run the Foundry (no CLI)

## from `cartograph/OPERATIONS.md`

define any neighborhood by eye on a labeled aerial, then run the Foundry to make its rendered 3D Slab in one click — the whole intake→3D arc as one tool, no terminal.**

## from `cartograph/OPERATIONS.md`

The flow, top to bottom (the cheap edits auto-save; the one heavy op — **Foundry** — is explicit and folds Commit into the Foundry run):

## from `cartograph/OPERATIONS.md`

9. **Foundry.** The one heavy button: **apply the extent, then run the Foundry.** On a first run it commits (writes the disc to `neighborhood_boundary.json` and marks the scene committed; ⛔ it **never** re-centers the frame or reprojects: `EXTENT-DESIGN §3.3`); on a committed scene it re-scopes in place. Then the Foundry runs (derive → ribbons → the Slab) and opens Plan **in Survey** (▶ `node checks/claims-extent-lands-in-survey.mjs`). The run is LONG: derive processes the whole fetched area, so frame tight (step 3).
   - ⭐ **What changed** shows beside the button: *"This Foundry run changed the street layout: tiles 138→132 · …"*. Pressing Foundry is the decision to accept that change; it is never applied silently.
   - ⛔ **A failure shows beside the button too, naming the step**, and everything the Foundry run wrote is restored: boundary, draft, `map.json`, the ribbons and Plan camera. One consistent state either way (▶ `node checks/claims-a-failed-apply-leaves-one-state.mjs`).

## from `cartograph/OPERATIONS.md`

When they differ, the panel says *"draft X m · applied Y m → run the Foundry to apply it"*, and the Foundry button is live for that reason

## from `cartograph/OPERATIONS.md`

Membership and loops, too, reach Plan and the Slab only after a Foundry run.

## from `cartograph/OPERATIONS.md`

- **Publish** runs the Foundry first only when the Foundry owes a step, then freezes the manifest (**this is where…

## from `cartograph/FOUNDRY.md`

- **A pipeline re-run caused by CODE, one of those DATA files, GEOGRAPHY or the REGISTRY asks first** — and on LS (held) so does a first `promote-ribbons` with no record, since it rewrites the committed `src/data/ribbons.json`: the route answers 428 with what changed, and BakeModal offers *Run every step* / *Cancel*. An authoring edit re-runs it without asking.

## from `cartograph/ARCHITECTURE.md`

- **The Pour** (`POST /:scene/pour` + `onPour` in ExtentApp + `pourMap` in `api.js`): `pipeline.js` (boundary-clipped; `--skip-elevation` unless the town's Looks agree on `pour.elevation: true`, else it refuses by name — recorded as map.json `argvRead`, so a toggle asks to re-pour) → `promote-ribbons.js --scene=<s>` → ensure a Look bound to the scene (`createLook` now forwards `scene`) → `setActiveLook` → `bakeLook(force)` (ground/buildings/lamps/scene/AO) → load fresh ribbons → `setShot('designer')`. **Scene-generic is verified** — `pipeline.js`/`promote-ribbons.js`/the whole bake all run for a non-default scene off its own OSM buildings + land-use (+ STL parcels when in STL); the old bake-route "scene-specific pipeline not yet implemented" comment was conservative. Guarded per-scene (`_seedsInFlight`). It is **long** — the derive processes the whole fetched area *before* the clip, so a wide fetch is both slow and heavy.

