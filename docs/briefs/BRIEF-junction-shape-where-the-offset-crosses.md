# BRIEF — Where the offset crosses itself: roundabout islands, junction corners, and the km-long spurs

<!-- BRIEF-STATE
status: OPEN
dispatched: yes (2026-09-24, Plumb)
written: 2026-09-24
evict-when: claims-the-ground-covers-every-block is green on huron + LS, and each instance below is either fixed at its construction root with a check that goes red on it (mutation-tested), or has a named cause and a ruling; Jacob has eyed Huron's US 6 roundabout and Provincetown's bay
-->

**Status:** DISPATCHED 2026-09-24 by Jacob (Boz drafted it).
**Phase 1 is forensic, with no `src/` edits.** You report the cause of each instance and your plan to Jacob, and build only after he agrees.

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, your own.**
**Agent: FRESH.** The canon on ①/②/ease is deep and settled; read it, don't re-derive it.

- Phase 1: read anything; run read-only probes in `scratch/`; a pour only in a scratch worktree on cloned data (that is how Gantry measured, 2026-09-24).
- ⛔ No edits to `cartograph/data/`, `public/baked/` or the live checkout's pour path while another session's pour may run. **Announce when your pour-path copy is NOT committed** (standing rule since 2026-09-24: a pour reads the working tree, and one caught a half-finished edit).

## What Jacob saw

**Huron, US 6 roundabout** (`primary-101`, centre ≈ (−89, 53); US 6 here is `highway=primary` + `expressway=yes` ⇒ no pedestrian realm, curb kept):

> *"The protopolygon needs to be smoothed in several ways/places (islands around the roundabout) and the sidewalks/corners are completely dysfunctional. The self intersection ix isn't working either."*

- Screenshot, rendered: `/var/folders/f0/s8b4_tl12j71dth951dnfkfh0000gn/T/TemporaryItems/NSIRD_screencaptureui_mehdse/Screenshot 2026-09-24 at 7.24.08 PM.png`
- Screenshot, Survey ① outline: `/var/folders/f0/s8b4_tl12j71dth951dnfkfh0000gn/T/TemporaryItems/NSIRD_screencaptureui_yjCP2G/Screenshot 2026-09-24 at 7.25.00 PM.png`
  - the thin spiked wedge islands between the slip roads and the ring;
  - a small closed teardrop at the top junction;
  - an outline that crosses itself where the SE slip road merges.

**Provincetown, the same class at a larger scale.** Gantry located it by construction, 2026-09-24:
- tile 13 = the bay, a 157 km² block (① block 38);
- its **② curb ring** carries straight edges of **5.3 km and 9.3 km**, plus out-and-back spike pairs of **3.4 km and 1.6 km**;
- all start at the `breakwater` footway's tip, (−830, 1660)/(−700, 2126);
- its **① ring is clean**, the longest edge being the real 1,187 m US 6 segment;
- it is live-only: not on disk, but it would freeze into `shape.json` at a bake.

Gantry's reading (**not measured**) is miter spurs off the breakwater's hairpin dead-end tip, which the fold-spur pass doesn't drop, then bridged to the frame by the self-union.

**Huron, the sky-through holes: the ③ instance.** Gantry measured them in baked `ground.bin`, 2026-09-24. They're pre-existing: identical before H-3 step 3.
- **The four holes that no partition group covers:**
  - (−86.4, 27.5) 1.94 m²
  - (−76.3, 32.3) 1.38 m²
  - (−75.3, 16.4) 1.13 m²
  - (−77.2, 15.9) 0.94 m²
- Each lies **inside its tile's ② curb ring** (tiles 110 and 108). Running the real frozen painter `sectionPassProtoTile` on that tile, the point is in **none** of its outputs (curb, sidewalk, treelawn, LU).
- ⇒ **The Section painter does not tile its own block** at those corners. The mechanism inside the painter is **not established**.
- **It is kit-wide.** In both huron and LS, most tiles leave some area painted by nobody. ⛔ **Re-derive it, never quote it:** run `node checks/claims-the-ground-covers-every-block.mjs` (Gantry, `906d3493`; red on huron + LS; `--selftest`).
  - ⭐ **A lead, measured only on a synthetic block:** ped bands plus **eased** corners leave one ~5 cm-wide piece **per corner, at the tangent points**. Square corners leave none, and so does a block with no ped bands. So look first at the corner arc and tangent windows in `sectionPassProtoTile`. Whether this is also what causes the real, larger holes is **not established**.
  - A large single hole is a separate instance: huron tile 120 (`island`), 51.5 m² at (−2364, −244).
  - `claims-t-junctions` reported 0 on this bake because a hole with sound borders on every side has no vertex on a wrong edge. **That check is blind to an absence; this one is the gate.**

⚠️ The bay is about to become water (Revetment's work), which will delete this face. **That hides the instance; it does not fix the class.** Reproduce it on the current data first, then keep it as a fixture.

## Not in scope

- **Whether an expressway keeps its curb:** `references/` question `q-atgrade-expressway-edge`, open. (Jacob also flagged *"You can also see: Curb"* on the same screenshot; the curb on US 6 is that question, not yours. If a curb shows on a highway in the H-3 classes, that **is** a defect: tell Boz.)
- **The owed roundabout brief** (A19: HPDM's unwelded split roundabout pieces).

## The canon you must read first, and the rulings that bind the fix

`ORIENTATION` → `README §START HERE` → **`cartograph/RIBBONS.md`**, in particular:

- **`§1` "SHARP. ROUNDING HAPPENS ONCE, DOWNSTREAM"** (2026-09-05): ① is sharp by ruling. **Jacob's "smoothed" is not a request to round ①.**
- **`§1` "② IS ① MINUS ITS DEPTH BANDS, THEN THE EASE"** (2026-09-25; the offset→union→ease construction it replaced is in `cartograph/_archive/RIBBONS-offset-union-ease-2026-09-25.md`).
- **"SELF-INTERSECTION MEANS THE FEATURE IS GONE, NOT THAT IT DRAWS CROSSED"** (2026-09-06). It goes to zero **where it crosses**.
  - ⭐ This section also names the open gap: *"the current implementation is coarser — a self-intersection anywhere on a ring reverts the whole ring to sharp."*
  - Jacob's *"the self intersection ix isn't working"* may be that gap, or a different one. **Establish which.**
- **"SMOOTHNESS IS ACHIEVED BY CONSTRUCTION, NEVER BY CLEANUP"** (2026-08-13). ⛔ **The forbidden shape:** *a smoother, a simplifier, a snap, a clamp, or any guard that fires when a construction degenerates and substitutes something plausible.*
  - A "spur guard" on ② is exactly that, and it was offered and **declined 2026-09-24**.
  - **Smoothness is the detector, never the fix.**
- **"AN OFFSET IS MEASURED FROM A LEG, NEVER FROM A CAP"**, and **the nodes are bezier intentions** (blunt cap turns, rounded cap eases).
- **`§6.1` G12 thin-feature degeneracy ("thorns")**: the spiked wedge islands may be this class.
- `SKELETON.md` on dead ends and couplers (the breakwater tip is a dead end), and memory `project_dead_end_cap_is_an_end_coupler`.

**Code:**
- `src/lib/tileGround.js`: `mintProtopolygon`, `offsetRingVariable`, `unionRingLabelled`, `easeContour`, `SPUR_COS`, `protoShapeTiles`, `sectionOpen`;
- `cartograph/derive.js` (the mint call);
- the Survey wireframe `BlockGeometryV2Debug`.

**Confirm the canon's claims against the code and say what you found.** ⛔ If they disagree, stop and flag it.

## Phase 1 deliverable, in chat to Jacob

For **each** instance (the wedge islands · the teardrop · the SE merge crossing · the corners at the expressway × town-street junction · the unpainted holes · Provincetown's spurs):

1. **Where it enters:** ① (mint), ② (offset / union / ease) or ③ (section fill). Locate it by coordinate → the tile whose ring contains it → the arc and its owner. ⛔ Never locate by nearest chain.
2. **The measured cause**, or *"cause not established."* ⛔ Write only the number, never an explanation you haven't measured.
3. **Is it the class the canon already names** (the whole-ring revert, G12 thorns, the reversal divergence, a dead-end cap), or new?
4. **The root fix, by construction**, and the rulings it respects.
5. **The check that goes red on it in a town nobody has looked at.**
   - ⛔ No threshold picked for LS or Huron. A limit must be derived from the scene (a ② edge's owning ① edge, the local width), never a constant that happens to be right for town #1 (CLAUDE.md Layer 0, Class D).
   - Mutation-test it: seen to FAIL before it counts.

⭐ **The existing checks passed on both towns while this was on screen.** Name which checks should have caught each instance and why they didn't: `claims-survey-and-section-agree`, `claims-marked-corners`, `claims-spur-leg-offset`, `claims-the-ease-is-the-corner`, and any other from `ls checks | grep -i corner`. **The blind check is half the finding.**

## Coordination

This checkout is shared: Gantry (highways, ground), Revetment (terrain, coast), Boz.
- Commit only your own paths or hunks (the `update-index` method in the pathspec memory note).
- ⛔ No stash, reset, rebase or branch switch.
- Report to Boz; Jacob rules.
