# BRIEF — retire the legacy shape pass

<!-- BRIEF-STATE
status: LANDED
dispatched: Lintel
written: 2026-10-19
evict-when: git merge-base --is-ancestor 27af35f2 main
-->

**You are the dispatched agent. Name yourself:** one word, yours, and not one a RUNNING session holds (check with
`ListAgents`, then `/rename`). **Agent: FRESH**: this is mostly deletion, and it needs someone who won't be tempted to
keep the old path "just in case." Boz is your report line (`SendMessage`).

*Jacob, 2026-10-19 ("write the retirement brief for the legacy pass"); written by Boz from Lath's trace (2026-10-19).*

## 0 · What and why

Since 2026-09-06 the ground's producer is ①②③ (`PIPELINE` step 3, *"AND IT IS THE PRODUCER, FOR SURVEY AND
SECTION"*):
- ① the protopolygon;
- ② the curb offset;
- ③ the bands.

The switch was done by **overwriting outputs, not removing the old path.** So inside `buildTileGround`
(`src/lib/tileGround.js`) the pre-① **legacy chain shape pass** still runs on every bake and in the Designer, and
everything it feeds is then overwritten. That pass is:
- the face walk (`extractFaces`) → per-tile chain runs → `strokeOpen` (curb by outward offset);
- E3.2 `jPolys` (junction windows and aprons) and E3.3 `jCornerCuts`;
- the through-node pass (`thruWins`) and the median clip;
- `sectionPass` over the legacy `shapeTiles`.

Jacob's standing rule for this final pass: *"if we see defunct wiring or duplicative efforts, we should take this chance
to clean out and not just layering on"* (`CLAUDE.md`, fix in three parts, part 1).

## 1 · Premises: Lath's trace. Confirm each against the code before deleting anything, and say what you found

- **Every live path is proto.**
  - `bake-ground.js` defaults `proto = true`; the opt-outs `--legacy` / `--no-proto` have no caller (grep cartograph,
    scripts, src, checks, package.json, .github).
  - `serve.js`'s Bake runs `bake-ground.js` without `--legacy`.
  - Publish / Stage / Promote spawn no ground build.
  - `buildTileBakeShape` passes `protoProducer: true` and throws rather than substitute.
  - The Designer (`BlockGeometryV2Debug.jsx`) passes `protoProducer: true, protoArtifact: true`.
- **What `protoProducer` overwrites:**
  - from `sectionOpen(protoShapeTiles…)`: asphalt, curb, sidewalk, block, crosswalk\*, curbCut\* / cornerArcs /
    curbCutRamps, treelawnByLu and luByClass;
  - cornerFillets / cornerSet ← protoCornerSet;
  - `_shapeArtifact` ← `protoShapeTiles`.

  The ①②③ block (`if (opts.protoProducer || opts.protoArtifact)`) reads none of jPolys / jCornerCuts / thruWins /
  medianClipFor / the legacy shapeTiles.
- **Outputs proto does NOT swap:** highway, grout, inkShore, hwyDisclosure. Lath: these don't touch `junctionMap`.
  ⚠ **Not yet established:** whether any of them is computed FROM the legacy face walk or chain loop. Map every
  returned field to its producer before deleting; anything the legacy pass produces that proto doesn't replace is a
  STOP.
- **`junctionMap` readers** (all of them): the legacy pass (`consumeJM` → the four items above); `substrateWalk.js`
  `walkSubstrate` via `electSubstrateTiles`, which is dead (`opts.substrateTiles` / `SUBSTRATE_TILES`, never set);
  `promote-ribbons.js` (a count print); and checks.
- **The one live residual:** if ② yields no corner arcs, `buildTileGround` keeps the legacy cornerFillets / cornerSet,
  with the warning *"② produced NO corner arcs … Not swapping."* That is a fallback.
- **Also in the legacy path:** a *"Live fallback (pre-D2, no frozen artifact)"* dead-end cap identity, and a stale
  comment calling ① *"OPT-IN … byte-identical unless asked"* (it is the default).
- ⛔ **Keep:** derive's `roadId` (the same-corridor-join union). It is live at ② (`protoRoadKey` → `classifyCornerLegs`
  → `sameRoad`, bend vs junction).

## 2 · The work

1. **Map, then delete.** List every symbol the legacy pass owns and every returned field it feeds. Delete in one
   coherent change:
   - the legacy chain loop, `consumeJM`, E3.2, E3.3, the through-pass, the median clip and `sectionPass` over legacy
     tiles;
   - the dead `electSubstrateTiles` / `walkSubstrate` / `tilesFromWalk` with `SUBSTRATE_TILES`;
   - the `--legacy` / `--no-proto` opt-outs and every `protoProducer` / `protoArtifact` branch that only existed to
     choose between the two. ① is not optional; the flags go.
   - the debug returns with no reader (`_jPolys`, `_jCornerCuts`, `_thruWins`, `_perRunMeta`).
2. **The residual becomes a refusal.** ② yielding no corner arcs throws by name. It never keeps legacy corners. The
   pre-D2 cap fallback goes the same way.
3. **`junctionMap` itself** (`derive.js`'s IIFE → `ribbons.junctionMap`, and `medians[].absorbedBy`): its last
   reader is gone after step 1, so delete the producer too.
   - ⚠ `derive.js` is also on the classifier's path (`BRIEF-the-classifier.md`, on branch `classifier`, from
     `docs/conformance-2026-09-21`). Check with Boz before editing `derive.js`. If the classifier is mid-edit there,
     the producer deletion waits for the merge, named in your report as the one leftover.
4. **The checks.**
   - `claims-preclip-walk`, `claims-coupler-totality`, `claims-deadend-populations` (P3) and
     `claims-node-pair-key-parity` read `junctionMap`.
   - Five checks call `buildTileGround` with no proto flag: `claims-proto-stack-reads-authoring`,
     `-physical-side-reconcile`, `-handle-rides-its-arc`, `-deadend-set-decomposition` and
     `-grout-is-a-valid-polygon`.

   For each: read what it asserts. Then repoint it to ①'s record, if the claim still matters, or retire it to the
   Diary with the reason. ⛔ A check that measured the legacy map was measuring a map nobody draws; say so in its
   retirement line.
5. **`cartograph/litmus-curb-parallel.mjs`** (Check A, cited in `CLAUDE.md` Layer 0 as the standing receipt) calls
   `buildTileGround` without proto.
   - Find out what it measures after the deletion, and report it.
   - Don't edit `CLAUDE.md`. The receipt is Boz's to re-arm, with a live one.

## 3 · Proof: the deletion changes nothing on screen

- **Before and after, per town** (LS, HPDM, Huron, PTown, JH), with authoring loaded:
  - run `buildTileGround` through the existing harness (`scratch/ground-budget/lattice-r1/sweep/run.sh`, or the
    `hpdm-gate/run.sh` bake entry, both using `swapset`'s `ENTRY`);
  - hash every returned field the bake consumes.
- **Every consumed field identical**, or each difference named and explained by measurement.
- JH refuses on its missing `curbWidth` (acf5fb70). That refusal is expected; prove JH by its refusal being unchanged.
- **The band check** (`BANDS_ALL=1 … --mutants`) shows the same rows as Lath's 2026-10-19 sweep.
- **Report** the wall-clock and peak memory saved per town. That is the point of the work, measured.

## 4 · Rules

- **Where:** a worktree at `.claude/worktrees/retire-legacy`, on a new branch `retire-legacy` from `boz/hpdm-gate`
  (`tileGround.js` there is the current one).
  - ⛔ Don't touch the classifier's files on its branch.
  - ⛔ Don't remove `.claude/worktrees/ward-kit`.
- **The heavy-job gate:** machine-wide, one heavy job at a time; start ≥70% free and load <8, abort <30%, explicit
  heap. Ask Boz before each heavy run; other sessions share the slot.
- ⛔ Never write any town's `clean/`. No bake, Publish, Stage or Promote. Commit by pathspec, never push.
- **Every commit** says what it removed, and names the register or "reaches no register".
- **Docs net-down:** the passages describing the legacy pass as live, in `PIPELINE`, `RIBBONS`, `SKELETON`,
  `POLYGON-FIRST`, `PREBAKE` and `checks/README` / `TIERS.json`, move to the Diary (`cartograph/_archive/`, dated),
  with refs repointed in the same breath.
  - ⚠ A passage that describes INTENT never built is an aspiration: surface it to Boz, never delete it.
- "Cause not established" wherever unmeasured. STOP and report any premise the code contradicts.

## 5 · Done when

- The legacy pass, `junctionMap` (or its producer, named as the one leftover) and the dead walk are gone. No proto
  flag remains.
- The no-arcs residual refuses.
- The proof in §3 holds on all five towns. The checks are repointed or retired.
- Check A's post-deletion behaviour is reported to Boz.
- **Register:** `OPERATIONS` loses the `--legacy` / `--no-proto` knobs (say so). `FEATURES` is unchanged: no capability
  changes.
