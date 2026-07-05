# NOTE → Boz — building render/content finding (roster-editor arc)

> **⚠️ RE-SCOPED by Boz, 2026-07-04 — read this first.** The recommendation below ("unify the
> Building Ledger / make poured match LS") is **set aside**. It was still LS-centric. The real frame:
> a **blank canonical app that loads looks**, where LS is just `?look=lafayette-square`
> (`slab-is-the-instance-identity`). The unlock is the **render/content boundary**
> (`slab-render-vs-content-boundary`): `src/data/buildings.json` does two jobs — a **render record**
> (footprint/materials/stories → slab, look-driven) and a **content record** (name/historic/listings →
> per-instance content, NOT slab). **This arc is render-only.** Narrowed arc: (1) make LS a look at the
> **render** level — emit LS's render fields to `cartograph/data/lafayette-square/buildings.json`,
> `loadBuildings` reads a per-look render record uniformly, retiring the `:62` name-check; LS's
> `src/data/buildings.json` CONTENT and the ~10 townie imports stay put. (2) live footprint overlay.
> (3) toggle-hide → per-look **overrides sidecar** (`hidden` as a field; seed stays regenerable,
> `feedback_effective_payload_layering`) + serve write route + bake filter. (4) gate: LS byte-identical,
> townie untouched. Decoupling the content layer + the INSTANCE module = the **next** program (blank app), NOT this.
> **The FINDING below (schema gap, two hardwires, dual-consumption) stands; the unify recommendation does not.**

---

# (original note — recommendation superseded) unify the Building Ledger FIRST

> From: Ward (fresh builder on `HANDOFF-building-roster-editor.md`). Date: 2026-07-04.
> **Decision (Jacob, 2026-07-04):** don't build the per-building roster editor on the current thin
> poured-building model. **Unify the building document first** (LS-shaped, per-scene, pour-seeded),
> kill the LS hardwires, then the roster editor rides on the unified doc. This note flags the
> brief reshape for your doc-close — I'm not touching canon.

## What surfaced (the finding)
The roster brief assumed the poured building model was fine to bolt onto. It isn't — the two paths
carry different documents:

| LS (`src/data/buildings.json`, 1082) | Poured (`clean/map.json → adaptMapBuildings`, hipointe 2112) |
|---|---|
| `id, name, footprint, position, size, color, stories, address, historic_status, zoning, building_sqft, architecture, wall_material, roof_material` | `ring, msbfId, tags{height}, elev` — `bake-buildings` **heuristics** color/roof/stories on the fly |

Two **hardwires** encode LS as a special path, not a dataset:
- `bake-buildings.js:62` — `if (scene === 'lafayette-square')` load `src/data/buildings.json`, else adapt `map.json`.
- `bake-buildings.js:567` — `if (scene !== 'lafayette-square')` run the boundary cull (LS's curated set is skipped).

Jacob: *"no hard wiring — I want to go back and do this for LS too."* Right call. LS should be install #1,
not a code branch (`feedback_no_parallel_pipeline_for_scenes`, `project_hardwires_come_out_when_channels_install`).

## The decision, framed
**This is §5.1 (the Building Ledger).** Promote the building record to a **per-scene document every
scene has**, in LS's schema, **pour-seeded as best-guess** (materials from tags, stories from height,
`historic_status: unknown`), operator-overridable (§0.0). Then:
- Both hardwires retire — `loadBuildings` always reads `data/<scene>/buildings.json`.
- The roster editor's **hidden** state is a **field/override on the ledger**, not a bespoke
  `hidden_buildings.json` (answers the brief's open persistence question).
- It's the substrate §5.1 needs anyway.

## The gate that makes it an ARC (why it's your call, not a quiet refactor)
`src/data/buildings.json` is **dual-consumed** — the slab bake **and** the townie app read it for
content (place cards, residences — `NEIGHBORHOOD-INPUTS §4.1`). So the per-scene ledger is the shared
**SHAPE + CONTENT** record. Two hard gates:
1. **LS bake stays byte-identical.**
2. **Townie app keeps reading LS building content unchanged.**

## Proposed safe sequence (LS-protective; additive before destructive)
1. Define the unified ledger schema (= LS's, generalized).
2. Pour **emits** `data/<scene>/buildings.json` (best-guess) — additive; prove hipointe bakes identically from its own ledger.
3. Unify `loadBuildings`, drop both hardwires; prove **LS byte-identical + townie-parity**.
4. Roster editor's hide = a field on the ledger (the original §5.2 slice, now on solid ground).

## What I need from you (doc-close)
- Bless the re-scope: **ledger-unification is now the foundation; the roster editor is step 4.**
- Promote **§5.1 / §5.2** from "named, not specced" to a real workstream (they're now being built).
- Decide the **per-scene ledger home** (`cartograph/data/<scene>/buildings.json`? and where LS's lives given the townie coupling) + the **overrides model** (fields-in-doc vs per-scene sidecar mirroring `buildingOverrides.json`).
- Note the two hardwires as a tracked retirement (`bake-buildings.js:62` + `:567`).

## Status
- **Done + valid either way:** the cull-relax (`bake-buildings.js:572`, `.every`→`.some`, keep-if-intersects) — the poured-scene rim-bald fix. Survives into the unified model (still runs on whatever doc). Worktree `roster-editor`, uncommitted.
- **Paused:** the roster overlay/selection build, pending this re-scope + your close.
- Housekeeping this session: the leftover **`demo` scene removed** (data + baked slab + Look + `index.json` entry); 7 canon docs still mention `demo` — your domain to trim.
