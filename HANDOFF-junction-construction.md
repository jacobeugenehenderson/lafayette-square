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

## 9. ✅ The cul-de-sac keyhole — RESOLVED (2026-06-16, committed `b11cf6b`)

The turning-circle cul-de-sacs (Saint Vincent, Park Place) rendered a **notched ROW** (Jacob's marks). **Resolved** — the verbose (a)–(f) journey + the durable lessons live in **[`cartograph/_archive/CULDESAC-KEYHOLE-FORENSIC-2026-06-16.md`](cartograph/_archive/CULDESAC-KEYHOLE-FORENSIC-2026-06-16.md)**. The live conclusion:

- **Root:** the frozen centerline `tile.ring` has an 84–98° sharp neck where the stem drives radially onto the bulb circle; the inward curb offset mitred it into a sub-20° notch (the `curb-bump` 20° gate misses it).
- **Fix (Jacob's boolean, live in `tileGround`):** the asphalt `aFill` is already `union(corridor, bulb-disk)`; morphologically **CLOSE** it (`offsetRings +RR/−RR`, round, `RR=3 m`) so the reflex mouth rounds into **tangent curb-returns**, then carve the curb from it. **Localized via a bounded splice** — `blockRings = (offset-base − disks) ∪ (keyhole ∩ disks)`, disk = `loopR+9 m` — because the bulb shares one `iA` ring with a neighborhood-spanning megatile; **grid-safe to 6 mm**. Detection: `fitLoopCircle` (R 3–12 m, mean radial dev < 0.3 m) → SV/Park in, Benton out. Default-on, browser-safe `opts.culDeSacKeyhole`.
- **Detector:** `correctness-detector.mjs` "CUL-DE-SAC KEYHOLE" gate (`culdesacNotchReport`) — a turning-circle `iA` vertex turning >16° between <3 m samples = RED. GREEN now; live guard.
- **Top lessons** (full set in the forensic): gate live code on `opts.*` not `process.env` (it crashed the browser); the proxy isn't the eye in *either* direction (it hid a micro-stutter AND a 473 m leak); `clipperLib.CleanPolygons` returns, doesn't mutate.
- **OPEN:** drop the `opts` flag once settled; re-freeze/bake only if Jacob wants it in the slab.

---

## 10. ⭐ Brief B — the perpendicular-join protrusion (the marked symptom this brief solves)

**This is "Brief B" of Jacob's pre-DataWall closeout (note #3) — it lands HERE, not a new pile.** The symptom: a path meeting another roughly perpendicularly at a **plain** junction throws a **spurious polygon lobe/bulge** at the meeting (the §1–8 work is exactly its fix). Marked ground-truth instance (2026-06-16): **Hickory Street near Benton, local `[20,-402]`** (`marker_strokes.json` stroke #4) — a *plain* T, NOT Benton's own stem. Same class as the old "bulge at the base of some T's" + Benton's stem-joint (`BACKLOG` line 42, RE-CLASSED).

> ⛔ **The original recon below was REFUTED on the marked case (the §3 derivation-first gate firing exactly as warned).** Kept one line for the lesson; the TRUE root + fix are in the LANDING block. **The marked `[20,-402]` is NOT a plain T and NOT a fillet lobe:** it's a `same-corridor-join` (Hickory ends into Mackay Place's two spine chains), already constructed (apron=YES, continuity=2, cornersAdjacent=3); the iA vertex there is *concave* (filletRing skips concave), and **0 plain nodes carry a convex fillet lobe map-wide** — so Delta 1 (flip the fillet-identity gate) would touch nothing here. The real root is a `roadId`/width datum at the same-corridor-join (see LANDING).

~~**Recon-confirmed root (2026-06-16):** plain nodes skip apron → `filletRing` rounds an emergent sharp vertex into a lobe; start with §4 Delta 1 (flip the fillet-identity gate).~~ **← REFUTED, see the banner above + LANDING.**

⚠️ **Coordination:** F is **edge-only + frozen → not a blocker** (interior faces byte-identical), so B can run **in parallel** with A & F. The one real serialization is **B↔C** — both rework the interior curb (`iA` / `filletRing` / `cornerAt`) — so run them in **separate git worktrees** or sequence B→C.

### §10 LANDING + SCOPE DECISION (2026-06-16, agent + Boz/Jacob call)
**✅ The marked case (#3) is FIXED + COMMITTED (branch `brief-b-tabs`, `591197a`).** Mechanism: extended the `roadId` union + width reconciliation to **same-corridor-join** pairs in `derive.js` (mirrors the junctionMap gate — same corridor, ends meet, continuation tangents; excludes divided A|B + cw↔spine) — all 11 same-corridor-join nodes now share a `roadId`, **9 width-steps → 0** (Mackay 3.96/5.49→5.49, Benton too). Root: the two chains of one road had no shared `roadId` + unreconciled per-chain widths, so the inward curb offset stepped at the node → two close 89° corners → filletRing terminated non-tangent → the 92° curb jog → asphalt tab → FILL slivers. Same family as the `continuesAs` junction-curb bump (`5c57ffc`); this join is topological (ends meet) not a name-seam, so it needed its own union. The curb runs **straight through the Hickory/Mackay throat + Benton** (data + shape + Jacob's eye verified; `scratch/briefB-*`). Net map-wide tabs 15→14. **Needs `ribbons.json` regen (done in-worktree) + re-freeze `shape.json` + bake — Jacob's go.**

**✅ #4 + #2 LANDED + COMMITTED (`brief-b-tabs`, `5113822`), both self-validating in `tileGround.js`:** **#4** strips the near-180° degenerate NEEDLES `filletRing` rejoins into the frozen curb (born post-fillet, so the pre-fillet strip can't see them; e.g. `[-421,-172]` 176°) via a POST-fillet `dropFoldSpurs` on iA, gated on a DIRECT needle-count + 0.5 m² area-preservation (`bandSliverCount` skips sub-1 m legs so it can't see them) → **iA self-int 15→11**, `curb-bump` 9 + `junction-band` 42 **unchanged (no regression)**. **#2** generalizes the median-only blockRings fold-spur strip to all tiles via a cheap has-spur pre-scan + the existing band-sliver self-validation — **dormant on the smooth=0 live map** (the offset path is already clean there) but correct for smooth>0/median/future; byte-identical where there's no spur. ⚠️ **#1 stadium seams + THRU width-steps NOT touched** (deferred→Brief C / out-of-scope, per the table).

**⭐ SCOPE DECISION — stop after the safe hygiene; the rest is deferred or out-of-scope** (the marked ask is met; the eye is the gate, not the tab count; the sub-0.15 m tabs are invisible/proxy-only; and further `tileGround` churn collides with Brief C). A rigorous before/after diff split the remaining 14 tabs into three groups:
| Group | Leg | Decision |
|---|---|---|
| **#4 degenerate needles** (<0.15 m) **+ #2 fold-spurs** | tiny | **DO NOW** — safe, self-validating hygiene; keeps the `junction-band`/`curb-bump` scoreboard honest; low collision with C. Then **STOP**. |
| **#1 stadium-union seams** (0.8–1.4 m) | real stroke geometry | **DEFER → fold into Brief C** (`freeze-the-curb`) — same `tileGround` curb-stroke region; one rework, not two fighting ones. Not on Jacob's marks. |
| **THRU width-step blends** (0.5–1.0 m) | datum | ⛔ **OUT OF SCOPE — by-design** (`JUNCTION-FINISH-FORENSIC §6`: "doing its designed job"). Do NOT "fix" at the drawing op — that reopens **Sextant's seed reconciliation** (settled). If one ever bothers the eye, it's a **survey-seed `pavementHW` datum edit**, a different layer. |

*Scoped 2026-06-16. Supersedes the old construct-hard-polygons campaign (the median half retired by derivation; only the junction remained — this is its dedicated brief). The single idea: promote E3's divided-transition construction — apron, edge-collision trim, corner-by-adjacency — to EVERY node; the metadata already spans every node, only the geometry is divided-only. The field had the names: this is the osm2streets trim-back, in our vocabulary.*
