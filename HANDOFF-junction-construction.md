# HANDOFF — Construct the junction at EVERY node (intersection-everywhere)

**Status: SCOPED, ready to design (2026-06-16). Branch `curb-offset-draw`.** The last open SHAPE bug family — the one *hard polygon* we still let emerge. ⛔ **ROUTE FIRST** (per `CLAUDE.md`): `ORIENTATION.md` → `README §⭐ START HERE` → this in full → **`cartograph/OSM2STREETS-GROUNDING.md` §1.4 (the trim-back algorithm) + §3.2/§3.3 (what it dissolves) + §4.2 (the port spec) — the SPINE** → `POLYGON-FIRST.md §3` (the curb-as-offset / D6a) → `SKELETON.md §5d/§5e` (intersection-variable/street-simple; the stub cure) → `cartograph/_archive/JUNCTION-CURE-PLAN.md` (the prior forensic). The EYE is the gate (`feedback_proxy_render_is_not_the_operator_eye`).

> The median was this campaign's sibling — **DONE by derivation** (walked face, `RIBBONS §1`+§3.5), which proved construction is the *last* resort. The junction is different: the standard's verdict (`OSM2STREETS §3.2`) is that the intersection genuinely **was never constructed** — independent butt-capped chain strokes meet mid-air and `filletRing` rounds whatever falls out. This is the one place construction is the right tool. **But still gate on the derivation-first check (§3) before building each artifact class** — the junction-curb bump *looked* like it needed a constructed corner and was actually a survey/`roadId` fix.

---

## 1. The goal (the osm2streets standard, `OSM2STREETS §1.4`)

At **every** junction node, run the trim-back algorithm: **(1) thicken** each road ±half-width; **(2) collide** the thickened edges of different legs; **(3) trim** each leg back to the farthest collision (a `trimStart/trimEnd` distance, non-destructive); **(4) assemble** the intersection polygon by walking adjacent leg pairs **clockwise** around the node — corners = identified leg pairs, never whatever stroke happens to fall there. A leg fully consumed by trim is **absorbed into the node** (`internal_junction_road` — the general form of the §5e stub cure). Roads meet the polygon **perpendicularly by construction**, so a butt-cap-meeting-a-flank, a width-step scallop, a stub fillet **cannot be expressed.**

**What it dissolves (one move):** junction-curb bumps · 4-way sliver corners · the 53-instance width-step family *and its future members at any node* · the perpendicular-join protrusions (T-mouth bulges, Benton's stem) · the visible effect of all 46 doglegs (the through-chain is trimmed back *past* the OSM node excursion, so the bent tip is cut off — `§3.3`) · the false-corner regression class (corner-by-identity everywhere) · the divided median's clean termination at the node (the nose rounds *with* the junction, no teardrop). **Lands in PREBAKE** (`PREBAKE.md §5`) — the intersection records become frozen facts of the polygon substrate.

## 2. ⭐ GROUND TRUTH — what E3 already builds vs the gap (forensic 2026-06-16, `derive.js`/`tileGround.js`)

**The metadata is universal; the geometry is divided-only.** This is the whole delta — most of the machinery exists, it just doesn't fire at plain nodes.

| layer | BUILT | GAP |
|---|---|---|
| **junction map at every node** (`derive.js:3486–3991`) | ✅ every degree≥3 node gets a record — 7 kinds (`divided-transition`, `continuation`, `same-corridor-join`, `branch`, `corridor-terminus`, `pendant-tip`, **`plain`** = the catch-all), full `legs` | — |
| **clockwise-adjacency corner pairs** (`:3891–3932`) | ✅ computed + **frozen for ALL nodes** (`cornersAdjacent[]`) | ⛔ **NOT consumed** — `filletRing` still corners emergent strokes; the fillet-identity gate is off (`tileGround.js:2113`) |
| **apron** (intersection polygon) | ✅ semantic kinds + multi-kind nodes (`:3935–3966`) | ⛔ **solo `plain` nodes skip** — *"plain nodes carry no construction yet"* (`:3943`). Plain Ts / 4-ways get NO apron |
| **trim / de-taper window** | ✅ divided-transition nodes, via **nose-stations** (`:3207–3260`, `NOSE_GAP=2 m`) | ⛔ **divided-only + wrong derivation** — no **edge-collision** trim; plain Ts, skew/Y crossings get NO trim |
| **continuity pairs** (one physical curb through the node) | ✅ semantic kinds | ⛔ plain nodes = 0 pairs → the two cross-street curbs are NOT stamped as one curb |
| **corner construction** (`tileGround.js:1865`) | ✅ divided-transition **stubs** only | ⛔ not the universal adjacency gate |
| **`innerSign`** | ⚠️ perpendicular foot-vote (`:3450–3464`) | port to **face-adjacency** (which half-edge bounds the median face) — kills the E3.4 foot-vote bug class (datum, not construction) |

**Consumer path (works, just under-fed):** `consumeJM` gate (`tileGround.js:1470`) → `junctionClipFor`/`cornerCutFor`/`thruClipFor` (`:2050–2191`) land the apron/window/corner polys into `aFill` per tile by bbox-identity (the proven E2 consume-by-identity pattern). **Extending coverage feeds the SAME consumer — no new consumption path.**

## 3. ⭐ The derivation-first gate (the banked lesson — do this BEFORE constructing each class)
Both recent hard cases dissolved by fixing the *derivation*, not by constructing (junction-curb bump = `continuesAs` `roadId`; median = widths). So for each plain-junction artifact class, **probe the topology first** (`scratch/` harness, the operator's eye on the lit Survey app): is it genuinely an un-constructed-intersection artifact, or a survey/datum/name-seam issue that dissolves upstream? Construct only what survives the probe. The standard says plain Ts/4-ways *are* un-constructed — but confirm per class, don't assume (the brief's recommended fix was wrong twice this month).

## 4. The deltas to close (the build, smallest-first)
1. **Consume `cornersAdjacent`** — the corner pairs are already frozen at every node; flip the fillet-identity gate (`tileGround.js:2113`) so `filletRing` corners *identified* leg pairs, not emergent strokes. Lowest-risk, no new producer code, and likely clears a chunk of the corner artifacts alone. **Probe + eye first.**
2. **Edge-collision trim (general)** — replace/supplement the divided-only nose-station trim with the standard's thicken→collide→trim (any two legs, any angle). Produces a `trimStart/trimEnd` per leg at every node. Subsumes the de-taper windows; covers plain Ts + skew crossings.
3. **Apron-everywhere** — drop the `plain`-node skip (`derive.js:3943,3948`); construct the intersection polygon at every real-intersection node by clockwise corner-pair assembly. Legs fully consumed by trim → absorbed into the node.
4. **Continuity at plain nodes** — stamp the through-curb pairs so the cross-street curb is one physical curb through the node (feeds the window construction).
5. **`innerSign` → face-adjacency** (E3.4, datum) — port while in there; the foot-vote can't be authoritative.
6. **Freeze in prebake** — the intersection records ride the existing `ribbons.json.junctionMap` freeze (already serialized `:3969`); the new coverage just populates more of it.

Each lands in the existing producer (`derive.js [E3.1]`) + the existing consumer (`tileGround.js [E3.2/E3.3]`) — promotion, not new architecture.

## 5. Acceptance (Jacob's eye, lit Survey app — the gate; + detectors RED-until-true)
- **`junction-band`** (built, `scratch/correctness-detector.mjs`) → throat slivers at degree≥3 nodes drive to 0 (the HALF-A scoreboard; the defect is pervasive — ~60 junctions, grid worse than curated).
- **`curb-bump`** (built) → >20° turn between short `iA` curve-samples at a node → 0.
- **Eye:** no bump / sliver / scallop / protrusion at any intersection on the lit map; the divided median terminates cleanly (rounded nose, no teardrop); plain Ts and 4-ways read as constructed corners.
- **Grid-safe:** a simple block face is untouched (it already derives correctly); only junction tiles change. **Rebuild-gated** (`derive.js` → `ribbons.json` → re-freeze `shape.json` → bake) — and per the solo-repo rule, commit the bakes too (ask first).

## 6. Risks / what's hard (flag before building)
- **Perf / the whole-map rebuild** — the junction builder reads every leg at a node + a final `unionRings` melts all tiles (`POLYGON-FIRST §3, D6d`). Apron-everywhere multiplies that. The block-local edit/re-freeze loop (D6d) may need to land alongside or the authoring loop gets slow.
- **Auto-consolidation of intersection clusters is unsolved everywhere** (`OSM2STREETS §3.4`) — divided-transition-on-a-cross-street is genuinely hard; may need the manual `junction=intersection`-style hint for the worst clusters.
- **"Huge intersections" from the general trim** (the standard's own caveat in the ramp case) — `on_off_ramp` needs the custom 2-thick-1-thin logic, not the general trim, or ramps blow up.
- **Relocating corner identity risks regressing the working live fix** (`9c275ce` is clean on the eye) — gate the promotion, don't cleanup-refactor (`BACKLOG §HARDENING` D3).
- The aesthetic layer stays OURS — the standard's polygons are *correct, not beautiful*; our authored radii + fillet kit + the 3-S Section painter ride on top.

## 7. Locks (do not reopen)
Two-carriageway model (NO merge-to-spine — osm2streets' `MergeDualCarriageways` is experimental + we *want* two carriageways + emergent median); concentric-ribbon FILL (`sectionPass`); custom > OSM > AASHTO widths; the median is DERIVED (`RIBBONS §1`). **Separate layers, NOT junction geometry (future, need OSM node-tag ingestion — we're ways-only):** refuge islands (footway layer) + signal hardware (instanced assets).

## 8. Forensic basis (read; do not re-derive)
- `cartograph/OSM2STREETS-GROUNDING.md` §1.4/§3.2/§4.2 — the standard method + the port spec. **The spine.**
- The 2026-06-16 E3-state forensic (§2 above) — what's actually built vs the gap, with line numbers.
- `cartograph/_archive/JUNCTION-CURE-PLAN.md` + `_archive/TRUMAN-FORENSICS.md` — the prior junction forensics (apron = intersection polygon, etc.).
- The junction-curb bump (`HANDOFF-curve-primitive-skeleton.md`) + the median (`RIBBONS §1`) — the two proofs that fixing the derivation can dissolve a "needs construction" symptom (the §3 gate).

---

## 9. ⭐ The cul-de-sac probe (2026-06-16, Boz) — the notch is the CURB-RETURN, not the apron

The turning-circle cul-de-sacs (Saint Vincent, Park Place) render with a **notched ROW** — the symptom Jacob marked. Worked it as the contained probe case for this brief; the derivation-first gate (§3) earned its keep three times:

- **(a) Smooth circles — LANDED** (`skeleton.js` `fitClosedLoopCircle`, `CURVE_LOOP_CIRCLE_TOL`): a closed loop that circle-fits (SV/Park ≈0.2% residual; Benton 73% + Waverly 52% fall through) is emitted as ≤90° bezier ARCS between its pinned vertices. SV/Park now smooth (0 bends >12°). Jacob: likes the smooth arcs. Grid + Benton baseline byte-identical.
- **(b) The loop-weld scatter — LANDED** (`derive.js` IX-snap, `closedLoopStreet`): SV had NO E3 node at all. At the skeleton SV-0-end / SV-2-start / SV-2-end coincide exactly, but the IX-snap pulled only ONE onto a computed intersection vertex 2.2 cm away → the loop OPENED → the node scattered across two mm-buckets → degree<3 → no junction. Fix: when the snap moves one weld endpoint, drag its twin. SV E3 node now present (Park already had one). General + Benton-safe. **This was a genuine upstream weld bug — keep regardless.**
- **(c) Apron at the cul-de-sac plain node — TRIED, REVERTED (wrong layer).** Enabled the fan-apron for the cul-de-sac nodes (diameter-gated to SV/Park; Benton-safe). The aprons built, but the notch was **unchanged** on Jacob's eye. **Why:** the apron fills junction *asphalt*; the notch is in the *block-ROW / curb*. Different layer.
- **⭐ THE ACTUAL DEFECT (ground truth, Jacob's marks + the live-curb harness `scratch/culdesac-curb-probe.mjs`):** the cul-de-sac ROW should be a **keyhole** — the two straight stem-corridor curb edges flaring **tangentially** into the bulb circle. The two notches ARE the two **curb-returns** at those tangent points (stem/west side; the far/east arc is already clean — r climbs 11.9→12.6 m smoothly). This is the **live CURB construction** (`buildTileGround`, the concentric-curb / `HANDOFF-concentric-curb-curved-streets.md` family) — NOT the frozen `tile.ring` (clean in JSON), NOT the asphalt apron. The fix = construct a smooth tangent curb-return where the straight stem curb meets the bulb arc, instead of the notch.
- **Marks = durable ground truth** (`marker_strokes.json`, 2026-06-16): #2 SV bulb arc + #1/#3 SV stem edges + #0 Park bulb. The target keyhole.

▶ **NEXT:** the curb-return construction at the bulb↔stem tangent (live curb). Not yet pinned to an exact `buildTileGround` site — the notch is a *subtle shape* on the stem side, not a gross kink. (a)+(b) are validated and kept; (c) reverted.

---
*Scoped 2026-06-16. Supersedes the old construct-hard-polygons campaign (the median half retired by derivation; only the junction remained — this is its dedicated brief). The single idea: promote E3's divided-transition construction — apron, edge-collision trim, corner-by-adjacency — to EVERY node; the metadata already spans every node, only the geometry is divided-only. The field had the names: this is the osm2streets trim-back, in our vocabulary.*
