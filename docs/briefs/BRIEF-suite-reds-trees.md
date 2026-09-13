# BRIEF — the tree/arborist reds in the check suite

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-13
evict-when: npm test 2>&1 | grep -qE "^(checks/)?claims-(anchors-follow-the-placements|atlas-uv-rect-survives-the-bake|leaf-pack-cells-agree|verify-taxon|every-shadowed-placement-renders)" || echo LANDED
-->

**Status: OPEN, UNDISPATCHED. Written 2026-09-13. ⛔ Jacob dispatches — do not self-dispatch.**
**Evicts to `_archive/` dated the day its acceptance passes. The eviction condition is in the
`BRIEF-STATE` block above and `checks/claims-a-brief-declares-how-it-dies.mjs` reads it.**

---

## Why this brief exists

`npm test` was wired 2026-09-13 having never been run as a suite. First run **80/125 green**, and a
cluster of the reds are tree/arborist: placement anchors, atlas UV rects, leaf-pack cells, taxon
verification, shadowed placements, materials writes, matched axes.

⛔ **Derive the set; do not quote one from this brief.**

```
npm test                  # the RED list prints at the end
npm test -- --list        # what runs, runs nothing
```

The shape-layer reds are a separate brief (`BRIEF-suite-reds-shape.md`) — ⛔ don't take those.

---

## Who you are + the bounds

You are a fresh specialist. **Name yourself — one word, yours.** `Agent: FRESH` — the tree arc
closed 2026-08-28 and no warm context covers the suite.

- **Write bounds:** `arborist/`, `src/components/` tree files, and the checks themselves.
  ⛔ Canon off-limits unless a fix makes a doc false — then **stop and flag**.
- ⛔ **Do not touch `docs/briefs/`, `_archive/`, or the memory directory.**
- ⛔ **Do not run a pour or a capture without saying so first** — some are `local-effect` tier and
  write to disk; that is why they are not in the default run.

---

## ⭐⭐ THE FIRST QUESTION FOR EVERY RED

> **IS THE INSTRUMENT WRONG, OR IS THE PRODUCT WRONG?**

**Measured 2026-09-13: of 12 reds examined closely, 6 were defects in the CHECK.** One was a
fence-detection bug that made a check walk into tables it is built to skip; one was a literal doc
list that reported success about a corpus it had stopped reading; one flagged a doc that does not
exist *because nobody has written it yet.* `[[feedback_the_instrument_is_where_the_defect_lives]]`

⛔ **Mutation-test every check you fix** — break what it asserts, watch it go red, restore.
`[[project_the_check_is_the_deliverable_mutation_test_it]]`

---

## ⛔ Three standing tree rulings you must not violate

1. **THE MESH PATH IS NOT A FALLBACK — the impostors ARE the tree.** ⛔ Never propose "just use the
   mesh" as a cure. `[[feedback_the_mesh_path_is_not_a_fallback]]`
2. **`y:0` IS A SENTINEL, NOT A POSITION.** The 2026-08-28 "missing impostors" were **underground**,
   not absent, and the lift belongs in the **shader**. `[[project_a_sentinel_is_not_a_value]]`
3. **Rank by PLACED demand, not roster census** — and one tree can carry **two library ids**, where
   the fallback picks the uncomposed one. `[[project_placed_demand_not_roster_demand]]` ·
   `[[project_one_tree_two_library_ids]]`

⚠️ **`atlasKind` has a known `/stem/` substring bug** — `[[project_atlaskind_classifier_substring_bug]]`.
If an atlas/UV red points there, that is likely the root and it is already diagnosed.

---

## Route first — BOTH the canon and the code

- **Canon:** `arborist/ARCHITECTURE.md` (the tree-render reality at LS) · `arborist/FEATURES.md` ·
  `SLAB-CONTRACT.md` for what the bake owes the runtime · `TREE-INTAKE.md` for the per-town pipeline.
  ⭐ **And the `arborist/_archive/` design record before forming any hypothesis** — archived means
  retired for *currency*, not *truth*.
- **Code:** `src/components/treeAtlasMaterial.js` · `HeroImpostorTrees.jsx` · `OverheadTrees.jsx` ·
  the arborist bake and capture scripts.

### ⛔ The chain — what this trusts and what trusts this
Upstream: the **capture** (`captureImpostor.js`, deliberately flat-lit — that is CORRECT) and the
**census** that decides what is placed. Downstream: the **slab**, and the operator's eye in Browse
and the hero shot. ⭐ **A fix visible in one surface and not the other is the recurring failure** —
name which surface your eye-gate happens on.

### Two open items that overlap this cluster, already diagnosed — inherit, don't re-derive
- **The capture-frame fix has not propagated** and will not on its own: `drain-on-bake` re-captures
  only what is DIRTY, and the fix changed the *measurement*, not the `captureKey` fingerprint, so it
  skips every already-captured species. Remedy for the kit: **fold a capture-code version into
  `captureKey`.** See `docs/briefs/HANDOFF-tree-render-2026-08-28.md` item 0.
- **`BRIEF-impostor-light-participation.md` is OPEN** (verified 2026-09-13: the cards are still
  `MeshBasicMaterial` in both `HeroImpostorTrees.jsx` and `OverheadTrees.jsx`). If a red touches
  impostor lighting, that brief owns it — ⛔ don't fix it here, flag the overlap.

---

## The work

1. **Triage every tree red into: instrument defect · real product defect · stale baked artifact.**
   Report the split before fixing anything.
2. **Fix the instrument defects first.**
3. **Real defects: fix at source. ⛔ No fallbacks** — a plausible-looking success is the worst
   outcome for a kit, because the operator sees a map and never learns it is wrong.
4. **Stale-artifact reds: say so and stop.** A re-bake or a re-capture is an operator gesture.

## Acceptance

1. `npm test` shows **no tree/arborist red**, or each remaining one is documented as a real defect
   with a board line and a receipt.
2. **Every check you fixed has been mutation-tested** — per check, say what you broke to prove it.
3. ⛔ **No check was made green by narrowing what it looks at.**
4. ⛔ **No eye-gate on the operator's view until the work is ready** — harness first.
   `[[feedback_dont_eye_gate_an_unready_construction]]`

## Registers (`CLAUDE.md`, part 2 of every fix)

- A change to what trees look like or which are placed reaches **`arborist/FEATURES.md`**; a new
  operator gesture reaches **`arborist/OPERATIONS.md`** ⚠️ *(which does not exist yet — if your fix
  needs it, that is the moment to say so, not to write it silently into another doc)*.
- ⛔ **The commit message names the register it reached, or says "reaches no register" outright.**
