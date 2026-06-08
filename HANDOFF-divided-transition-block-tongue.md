# HANDOFF — The divided-transition block tongue (the 3 marked "weird protrusions")

**State:** dispatch-ready. **Goal:** kill the thin **blue block-silhouette tongues** at the 3 marked corners — where a divided avenue meets a cross-street and the carriageway stub extrudes a thin spike into the block. **It is a DATA/FRAME issue, determined — fix it in the frame, invisibly, NOT downstream in `tileGround` construction** (`SURVEY §7`: when the root is data/skeleton, fix it in the frame; never a user control).

**Agent:** a cartograph **skeleton/frame** specialist. `isolation: worktree`. **Domain:** the frame — `cartograph/skeleton.js` and/or the prebake (`derive.js`/`promote-ribbons.js`); the divided↔undivided transition. **NOT** `tileGround.js` as the cure.

> **Read first (the determination is done — don't re-derive, build the fix):**
> - This brief's "The root — DETERMINED" below (raw-OSM-vs-weld traced 2026-06-08, with way IDs).
> - `SKELETON.md §5b` (the divided avenue shattered at the cross-street — the degenerate-corner structure) + **§5d** (the special-sauce rule: *outer curb runs straight through, median opens inward*) + **§5c/§5e** (the **reverted** "consolidate the skeleton" attempts — read these so you don't repeat them).
> - `SURVEY.md §7` (data/skeleton-root doctrine) + `[[feedback_geometry_bugs_may_be_data_bugs]]`.
> - The frozen hook: `phase.spineAtStart/spineAtEnd` (`SKELETON.md §2`) — each carriageway endpoint already carries its spine's id at the transition, computed once in `skeleton.js` (commit `61930d7`). **Use it; don't re-derive by node-matching.**

---

## The root — DETERMINED (it's the DATA, not our weld)

The 3 marked protrusions all sit at a **divided→undivided transition that raw OSM digitizes on the cross-street node.** Traced via each stub chain's `sources` → the raw `ground.highway[]` ways in `cartograph/data/lafayette-square/raw/osm.json`:

| transition node | raw OSM at the node |
|---|---|
| **Lafayette × Mississippi `[166,222]`** | bidi **spine** way `1349812902` (`oneway=no`) **ends** here; **carriageway-A** way `1349812898` (`oneway=yes`) **starts** here; **carriageway-B** way `1349812900` (`oneway=yes`) **ends** here |
| **Park × S-18th `[424,-89]`** | spine `1349901199` ends; cwA `354388958` ends; cwB `624311867` starts — all at the node |
| **Park × S-Jefferson `[-355,-254]`** | spine `1349901201` ends; both Park **and** S-Jefferson arrive divided (deg-6) |

So **OSM models each divided avenue as one bidirectional way (undivided side) + two oneway ways (divided side), all three sharing the cross-street junction node.** The carriageway "stubs" are the data, not a weld artifact. Our skeleton carries them faithfully (`phase: spine / carriageway-A / carriageway-B`), but we have **no pass that handles the transition** — so `tileGround.extractFaces` walks the stub, and the block silhouette (the offset of that face) extrudes the **thin blue tongue**. Clean (non-self-intersecting), which is why the band-fold fix left it and `SELFINT=0` is still true.

**Marks → nodes:** #1 `[177,202]` = Lafayette×Mississippi · #0 `[450,-92]` = Park×S-18th · #2 `[-343,-244]` = Park×S-Jefferson. (Block-ring vertices cram into the thin marked zones — 16 in the 4 m-wide #1 strip, 12 in the 1.6 m-tall #2 strip.)

---

## The fix — at the frame, transition-handling (the rule is already written)

`SKELETON §5d` (the "special sauce"): at a divided↔undivided transition, **the outer curb runs straight through** (the spine's outer edge continues into the carriageway's outer edge), and **the median opens inward.** The thin wedge that's currently extruding as a block tongue is the **inner / median side** — it should open as **median** (open road), not extrude as block. The frame already has the link (`phase.spineAt*`) and median machinery (`derive.js` medians/corridors; the median "emerges" as a face).

**Task — forensic-first, then fix (don't skip the first step):**
1. **Pin the exact face/op that makes the tongue.** At one transition node (start with Lafayette×Mississippi), trace what `extractFaces` walks near the node: is the tongue the **thin median wedge** (carriageway-A inner ⊕ carriageway-B inner where the median width ≈ 0 at the node) mis-emerging as a block face rather than a median, or the **outer wedge** between the carriageway and the cross-street? Confirm *which* before fixing. (The median is supposed to emerge as a face — find why it doesn't here, at the zero-width end.)
2. **Fix at the frame.** Make the transition resolve so the wedge is median/road, not block — keeping the two carriageways. Likely options to evaluate (your call after step 1): handle the transition in `skeleton.js` after `repairDividedPairs` (the median opens from the spine end), or stamp the transition at prebake so the median face covers the zero-width wedge, using `phase.spineAt*`. The split the canon wants: **the transition is decided once in the frame**, the construction just consumes it (`PREBAKE §5`).
3. **Verify the wedge becomes median and the outer block runs straight through** at all 3 nodes.

---

## ⛔ Boundaries (heed the reverted history)

- **The two-carriageway model is LOCKED** (`SKELETON §0/§5`). Do **NOT** collapse the carriageways to a single spine, synthesize a median coupler, or delete a carriageway. Median **emerges**, never authored.
- **Do NOT patch `tileGround.js` construction as the cure** — that's "patching chains deeper downstream," and the §5c/§5e attempts that did corner-gate / asphalt-stroke surgery were **reverted** (they regressed the 18th corridor / didn't hold). The construction may *consume* a frozen frame fact (like it consumes `spineAt*`), but the decision lives in the frame.
- **Don't flatten real geometry** — only the divided-transition wedge at these `spine + cwA + cwB` nodes; a genuine block elsewhere must be untouched.
- **Two-step rebuild** (`skeleton.js` → `pipeline.js` → `promote-ribbons.js`) to see the change; the skeleton is a needsRebuild input.

## Validation (Jacob's eye, live :5173 Survey — the gate)

- The **blue block tongues gone** at all 3 marks (#0 Park×S-18th, #1 Lafayette×Mississippi, #2 Park×S-Jefferson) — the block edge runs clean, no thin spike.
- **Both carriageways still present**; the **median opens** at each transition (the emergent median face is there, just no longer a block tongue).
- **No regression** to other divided transitions or the **18th corridor** (check explicitly — the E3.4-revert lesson). Machine A/B the rest of the map for byte-identical block silhouette away from the 3 nodes.
- ⚠️ Proxies are labelled-proxy only; the operator's eye is the gate (`[[feedback_proxy_render_is_not_the_operator_eye]]`).

## Coordination

- **Branch off trunk `cartograph-looks-pass-ab` @ `11482d7`** (clean, pushed — post-bookkeeping), **own worktree** (`isolation: worktree`).
- This is **frame** work (`skeleton.js` / `derive.js` / `promote-ribbons.js`). Two other fixes are parked on their own branches and touch **different files** — no collision: `band-fold-fix@8e1e414` (`tileGround.js`, the SELFINT hygiene — landed-and-confirmed) and `t3-corner-handles` (`CornerEditHandles.jsx` + store + a small `tileGround.js` corner-set emit — implemented, pending eye). You won't touch `tileGround.js` as the cure, so even the `tileGround` overlap with those is moot.
- ⚠️ **The 3 protrusions are CLEAN geometry, not self-intersections** — `band-fold-fix` (SELFINT 59→0) does **not** address them; they persisted past it on Jacob's eye (hard-refreshed). Don't expect the band-fold work to have helped here.
- Do **not** merge or rebase the other branches; ignore them. Re-baked artifacts as needed on your branch.
- **Report:** which wedge (step 1), the frame intervention chosen + why, the 3-node before/after, and the 18th-corridor check.

## On landing (Boz)

- Fold into `SKELETON §5b/§5d` (the transition handling, now done at the frame) — record that the determination was **DATA** (OSM digitizes the transition on the cross-node), not our weld, with the way IDs. Flip the relevant BACKLOG row. Retire this brief → NOTES. Note this is the same divided-transition family as the long false-corner arc, finally fixed at the frame layer the canon pointed to.
