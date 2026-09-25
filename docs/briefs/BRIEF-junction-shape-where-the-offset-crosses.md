# BRIEF — Where the offset crosses itself: roundabout islands, junction corners, and the km-long spurs

<!-- BRIEF-STATE
status: OPEN
dispatched: yes (2026-09-24, Plumb)
written: 2026-09-24
evict-when: claims-the-ground-covers-every-block is green on huron + LS, and each instance below is either fixed at its construction root with a check that goes red on it (mutation-tested), or has a named cause and a ruling; Jacob has eyed Huron's US 6 roundabout and Provincetown's bay
-->

**State (2026-09-25, Plumb):** ② DONE — `5221da1c` (② = ① minus its depth bands; width steps taper), `890cd9cf`.
Roundabout teardrop, wedge tips and SE-merge lobe fixed; `claims-the-curb-never-enters-the-road` + `claims-expressway-edge-follows-speed`
are the gates. ⛔ OPEN: ③'s sky holes (`SECTION §4` OPEN — a partition proposal awaits Jacob) · ①'s Provincetown needle (below).

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, your own.**
**Agent: FRESH.** The canon on ①/②/ease is deep and settled; read it, don't re-derive it.

- A pour only in a scratch worktree on cloned data; no heavy job while `node scripts/bake-in-flight.mjs` is not quiet.
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

⭐ **Measured (Plumb, 2026-09-24): NOT the breakwater.** ① block 38 carries NEEDLE HOLES — rings whose vertices lie ON a
chain's centreline (`provincetown-marina-0`, `fishermen-s-wharf`), one vertex turning ~180°; dilating that hole throws a
miter apex kilometres out. Under ② it is now a chord (bounded), but ① still emits the needle. ⛔ OPEN, cause in ① not
established. Not caught by `claims-proto-tip-has-two-apexes` (the needles are not at chain tips).

**Huron, the sky-through holes: the ③ instance.** Gantry measured them in baked `ground.bin`, 2026-09-24. They're pre-existing: identical before H-3 step 3.
- **The four holes that no partition group covers:**
  - (−86.4, 27.5) 1.94 m²
  - (−76.3, 32.3) 1.38 m²
  - (−75.3, 16.4) 1.13 m²
  - (−77.2, 15.9) 0.94 m²
- Each lies **inside its tile's ② curb ring** (tiles 110 and 108). Running the real frozen painter `sectionPassProtoTile` on that tile, the point is in **none** of its outputs (curb, sidewalk, treelawn, LU).
- ⇒ **The Section painter does not tile its own block** at those corners. The mechanism inside the painter is **not established**.
- **It is kit-wide.** In both huron and LS, most tiles leave some area painted by nobody. ⛔ **Re-derive it, never quote it:** run `node checks/claims-the-ground-covers-every-block.mjs` (Gantry, `906d3493`; red on huron + LS; `--selftest`).
  - ⭐ **Mechanism measured on the synthetic eased block:** `SECTION §4` OPEN ("the bands are an area mask"). Whether it is also the real, larger holes' cause is **not established**.
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
- **"SELF-INTERSECTION MEANS THE FEATURE IS GONE, NOT THAT IT DRAWS CROSSED"** (2026-09-06) — built for ②, still open for ③.
- **"SMOOTHNESS IS ACHIEVED BY CONSTRUCTION, NEVER BY CLEANUP"** (2026-08-13). ⛔ **The forbidden shape:** *a smoother, a simplifier, a snap, a clamp, or any guard that fires when a construction degenerates and substitutes something plausible.*
  - A "spur guard" on ② is exactly that, and it was offered and **declined 2026-09-24**.
  - **Smoothness is the detector, never the fix.**
- **"AN OFFSET IS MEASURED FROM A LEG, NEVER FROM A CAP"**, and **the nodes are bezier intentions** (blunt cap turns, rounded cap eases).
- **`§6.1` G12 thin-feature degeneracy ("thorns")**: the spiked wedge islands may be this class.
- `SKELETON.md` on dead ends and couplers (the breakwater tip is a dead end), and memory `project_dead_end_cap_is_an_end_coupler`.

**Code:**
- `src/lib/tileGround.js`: `mintProtopolygon` (①), `taperWorkingCopy` + `offsetRingByRects` (②), `sectionPassProtoTile` (③);
- `cartograph/derive.js` (the mint call);
- the Survey wireframe `BlockGeometryV2Debug`.

**Confirm the canon's claims against the code and say what you found.** ⛔ If they disagree, stop and flag it.

## Coordination

This checkout is shared: Gantry (highways, ground), Revetment (terrain, coast), Boz.
- Commit only your own paths or hunks (the `update-index` method in the pathspec memory note).
- ⛔ No stash, reset, rebase or branch switch.
- Report to Boz; Jacob rules.
