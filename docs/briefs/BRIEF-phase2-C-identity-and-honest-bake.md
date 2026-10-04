# BRIEF — Phase 2 · C: Identity has one source, and the bake refuses what it can't honestly freeze

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-04
evict-when: the kit's apps read identity from the baked manifest and instance.js owns only "which town is this authoring page"; one townTenant; a missing or unreadable design refuses the bake; one design authority per town; seeded designs carry no other town's values; manifest.json#files lists only published files; claims-no-town-carries-the-mould and claims-the-ward-reads-what-the-manifest-bakes are green and mutation-tested
-->

**Boz drafted this 2026-10-04 from Thread's continuity map; Jacob dispatches.** Phase 2, tranche 2, package **C**. Runs in parallel
with **A** and **D**.

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, yours, and not one a RUNNING session holds** (`ListAgents`; ask Jacob to
`/rename`). **Agent: FRESH.**
- The kit, and the Ward where identity is read (`~/Desktop/dev.nosync/theward`, pushed to `theward-player`). ⛔ No pours or bakes;
  `node scripts/bake-in-flight.mjs` before saving anything the dev servers import (`serve.js` restarts on save). Ports: 5173 / 5180.
- ⛔ **Changing an existing town's `design.json` or `scene.json` is DATA**: list each value, change it only on Jacob's go.
- ⚠️ **Coordinate with A on `instance.js`**: A collapses the duplicate page-town resolver into the store, and you shrink
  `instance.js` to that job. Agree who edits it first (`ListAgents` → `SendMessage`).
- Commit only your own paths. **Three-part fix** (`CLAUDE.md`); the commit names its register.

## Read first

1. **The spec**: the Phase 2 text at the end of `cartograph/_archive/BRIEF-runtime-continuity-DELIVERED-2026-10-04.md`, sections **Identity / Instance
   Continuity** and **Bake**: *"Remove unnecessary copied authorities. Eliminate accidental inheritance from another Ward. Unknown
   values remain explicitly unknown rather than borrowing defaults."* *"Bake the answer, not the machinery."*
2. **The map**: `scratch/runtime-continuity/MAP.md` **§3** (`instance.js`, whole), **§1** Stage → Bake and Bake → Player rows,
   **§2** duplicate authorities 1, 6, 7 and silent substitutions (bake, LS-mould constants).
3. **Rulings:** every backend keys a town by its sealed **opaque id** (`cartograph/data/<map>/town-id.json`, 2026-10-04); ⭐ **the Ward
   reads the identity fields the manifest bakes** (Jacob, 2026-10-04): `cary`, `commerce`, `legal`, `contact`, `profile`, `modules`
   each get a Ward reader as the feature using it is built. Until then they're "baked, awaiting a reader", ⛔ **not dropped**.

## The work

1. **The kit's apps read identity from the baked manifest, as the Ward does.** The Ward never loads `instance.js`; it reads
   `manifest.identity` (copied from `src/instances/<map>.js` by `cartograph/bake-manifest.mjs`). ⇒ Stage, Preview and the legacy
   player read the same, and `instance.js` shrinks to "which town is this authoring page" (map §3's smallest remainder).
2. **One `townTenant`.** There are two: the Ward's `town.js` and the kit's `instance.js`. One goes.
3. **The bake refuses what it can't freeze honestly.** `serve.js` `bakeDesign` turns a missing or unreadable `design.json` into `{}`
   (*"every consumer degrades to its default"*); `bake-ground.js` does the same; `bake-buildings.js#loadSceneTerrain || flat` silently
   bakes flat terrain. ⇒ each refuses loudly, naming what it lacked. ⛔ No fallback.
4. **One design authority per town.** The bake reads `DESIGN` (the Look's) **and** `SCENE_DESIGN` (the town's): `terrainExag`, trees,
   `groveThreshold`, `water` and the lamp zone tester come from the town's file, and the two are the same file only while look id = map
   id. Read `docs/briefs/BRIEF-dirty-graph-declares-what-it-reads.md` first; it owns part of this. Decide which fields are the town's
   and which the Look's, and say it in the code.
5. **No other town's values in a seed.** `serve.js#SCENE_KEYED_DESIGN_FIELDS` doesn't strip `parkTitlePos`, so Huron carries LS's
   `[-22.48,-97.31]` (baked into `huron/labels.json` as `setPieceTitles['lafayette-park']`). Make the strip list structural (declare
   or refuse, as `checks/claims-look-seed-scene-clean.mjs` already does for its fields). The existing copies: list for Jacob.
6. **`manifest.json#files` lists only what is published** (some entries are never uploaded: map §1, rot).
7. **Three town names → one.** The instance module's `name`, `branding.title`, the looks index's `name` ("HiPointe-DeMun" vs
   "Hi-Pointe–DeMun"), plus the page title in `staging/player/towns.json`. One authority, the rest read it.

## The chain

- **Trusts:** `src/instances/<map>.js`, `town-id.json`, the identity registry; the bake route and `bake-manifest.mjs`.
- **Trusted by:** the Ward (`manifest.identity`), Stage, Preview, Operations and the Apps Script tenant (by `townId`), Promote.

## Can the instrument see it?

`claims-no-town-carries-the-mould` (map §7 #2): every `design.json` and `scene.json` fails when a value equals LS's in a non-LS town.
`claims-the-ward-reads-what-the-manifest-bakes` (map §7 #8): lists baked identity fields with no Ward reader as "awaiting a reader".
Mutation-test both, and the bake refusals (delete a design in a scratch copy, the bake must refuse). ⛔ Never test a refusal against a
live town's files.

## Deliverable

The seven rows; the checks; the data lists for Jacob. **Read the spec, the map rows and the code, tell Jacob what you found, then
build. If the code contradicts this brief, stop and flag him.**
