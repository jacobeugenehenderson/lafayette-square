# SPAR — Skeleton forensic: the West 18th ↔ Dolman name-transition kink

**2026-06-13. Read-only skeleton forensic (agent Spar).** Captured by Boz from Spar's final message — Spar's sandbox blocked file writes; every number is reproducible from read-only `node -e` over `cartograph/data/lafayette-square/{clean/skeleton.json, raw/osm.json}`.

## Verdict

**West 18th ↔ Dolman IS a genuine skeleton-level defect — the §5a dog-leg mechanism firing at a NAME-TRANSITION node**, a class no prior fix ever touched. The other four flagged junctions (Carroll, Hickory St, Hickory Lane, Grattan) are **NOT** skeleton defects — clean centerlines, no name-transition; their fragmentation is downstream junction-band FILL (`THROAT-JUNCTION-FINDINGS.md`, `SECTION §7`). **Do not chase those in `skeleton.js`.**

## What the skeleton produces

West 18th/Dolman is a **U/horseshoe of three chains** joined at two degree-2 name-transition nodes, both legs dead-ending at the top:
`south-18th-street-3` →(NODE A)→ `west-18th-street` (the U-bottom) →(NODE B)→ `dolman-street-1`.

The road **is carried through correctly as continuous**: `continuesAs` links chain→chain, both joints are in `nameTransitions[]`, and the transition nodes are correctly **not** emitted as false junctions (degree-2, skipped). So the bug is **NOT** "the road got split into two chains at the name change." The topological invariant *"a name-transition keeps a road continuous"* is already satisfied **topologically**.

Provenance (per the warning): West 18th is `source:'osm'` (the uncurated U-bottom connector); South 18th & Dolman are `source:'survey'`. Not conflated.

## The mechanism — the actual mistake (numeric)

**RDP runs per-chain, so it cannot see across the name boundary; at the joint it deletes the curve-rounding vertices and `junctionKeys` pins the bare node as a hard corner:**

- **Node B (W18th↔Dolman):** raw OSM turn = **15.6°** (gently distributed — 15.6/17.5/9.9/14.6° across vertices every ~2–3 m) → RDP skeleton turn = **46.5°**. The apex got **facetted into one hard kink.**
- **Node B sits 3.31 m off the chord** of its own two skeleton neighbours — the *same magnitude* as the canonical §5a doglegs (South 18th 3.32 m, Geyer 3.07 m, S Jefferson 4.13 m).
- **Proof of what RDP dropped:** node B's shoulder vertices deviate **less than eps (1.0 m)** from their local chord — Dolman side 0.79/0.71 m, West-18th side 0.62/0.62 m — so RDP drops all four shoulders, while `junctionKeys` **force-keeps node B itself.** The rounding vanishes; the protected node stands alone as a 46.5° corner. (`west-18th-street` 9→5 pts, `dolman-street-1` 18→8.)

This is the §5a dog-leg exactly — *junction-protected RDP forced to keep a node sitting 3–4 m off its through-neighbours' chord* — except the protected node here is a **name-transition**, not a T.

## Why no prior fix caught it

The reverted §5a through-junction straightener (`scratch/through-junction-straightener.patch`) **cannot fire here**: it requires `through.length === 1` (the node is an *interior* pass-through of one street). At a name-transition node **both** chains have the node as an **endpoint** → `through.length === 0` → skipped. The class was never in scope. And `simplifyRDP` (`skeleton.js:1473`) is called once per `s.points` with no view of `continuesAs`, so it simplifies each chain as if it *ended* at the joint.

## The fix (the kit rule to build)

**Name-transition continuity must extend from TOPOLOGY to GEOMETRY.** `continuesAs` carries the road through the graph, but RDP still treats the two chains as independent at the joint. The fix = **transition-aware simplification**: at each `nameTransitions[]` node, run RDP across the **concatenated `chainA + chainB`** (do *not* force-keep the joint as a hard per-chain endpoint), so the joint inherits the chain interior's smoothness tolerance and the **rounding shoulders survive**. Then split back into the named chains at the preserved transition point (keep `continuesAs` / per-fe names / widths).

⚠️ **Discriminator — this is PRESERVE, not STRAIGHTEN.** At the U-apex the road genuinely turns hard (~135° total around the bottom) — *straighten-to-chord (§5a) is the WRONG fix for this apex; the road really curves.* The defect is that the turn got **facetted into one 46.5° vertex instead of keeping its raw rounding.** The rule is **"simplify across the name-transition join, not per-chain" (preserve smoothness)** — distinct from §5a's straighten-to-chord. (This is also why the earlier arc-*refit* was wrong: it MOVED the path; this KEEPS the path and keeps the rounding the data already has.)

## Acceptance gate

Add a **name-transition-smoothness invariant** to the detector (`SIEVE/LOOM/THROAT` suite): flag any `nameTransitions[]` node whose turn jumps above the chain's ambient max-turn (a *facetting jump*). This is the geometric form of the Sieve/Loom-named *"a name-transition keeps a road continuous"* invariant — and the RED-until-true gate for the fix.

## Key code locations

- `cartograph/skeleton.js:1473` — per-chain `simplifyRDP` (the blind spot)
- `cartograph/skeleton.js:1439–1441` — `junctionKeys` force-keep (pins the bare node)
- `cartograph/skeleton.js:1602–1615` — `nameTransitions[]` + `continuesAs` stamping (where the join is known)
- `SKELETON.md §5a` — the dog-leg mechanism this generalizes
- `scratch/through-junction-straightener.patch` — the reverted T-only fix that structurally can't reach this class

---
*Relation to `HANDOFF-round-skeleton-corners.md`: same family — the W18/Dolman corner is hard because RDP **threw away** the rounding the raw data has. The general corner-round ADDS rounding; this fix PRESERVES rounding at name-transition joints. The showstopper is this one.*
