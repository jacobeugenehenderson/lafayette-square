# osm2streets grounding — our road model vs. the standard

> **What this doc is FOR, now that its headline items have landed:** a **grounding reference** — the
> standard's model, vocabulary and algorithms, read against ours. Its §1/§2 concept map and §4.3
> vocabulary table are the live part. The bugs it diagnosed in §3 are **closed**; they are kept only
> as the worked example of *reading our defect in standard terms*, which is the method the doc exists
> to teach. ⛔ Do not re-forensic them.

**Deliverable of `HANDOFF-osm2streets-grounding.md` (Macadam, 2026-06-06). Web-grounded reference — no code touched.** The field's reference implementation for OSM→street-geometry is **osm2streets** (the A/B Street project, `github.com/a-b-street/osm2streets`, Apache-2.0, Rust core + `osm2streets-js` WASM): lanes, road casings, intersection polygons, dual carriageways, blocks. Read against our `SKELETON.md` / `PREBAKE.md` / `_archive/JUNCTION-CURE-PLAN.md` / `LOOP-STREETS.md` / `RIBBONS.md` / `skeleton.js` / `tileGround.js`, plus a fresh forensic on the South-18th mis-pair (raw OSM tags, this session).

> **Verdict up front.** The standard model **independently validates our two deepest doctrines** — the emergent median (their `DualCarriageway` block kind: *"space between one-way roads"*) and tiles-as-graph-faces (their `Block`, computed by the same half-edge walk). The two places we had diverged were exactly where our worst bug families lived, and **both divergences have since been closed by porting the standard's method** (§4.2): **(1) constructing the intersection positively** — every node a first-class object, roads *trimmed back* to an explicit intersection polygon (ours: `junctionMap` + the E3.2 window/apron construction, generalized to every node 2026-06-07, `9c275ce`); **(2) detecting dual carriageways from the data model + topology** rather than geometry alone (ours: `carriagewayGates` in `skeleton.js` — class gate, `*_link`/`service` exclusion, split/rejoin trace, geometry demoted to confirmation). **E3 was us re-deriving the standard intersection algorithm by hand** — apron = intersection polygon, de-taper window = trim distance, corner identity = their corner-assembly step. Right cure, non-standard vocabulary; the coverage gap is what the port closed. **Standing recommendation: don't adopt the library; align vocabulary as docs are touched** (§4.1, §4.3). And one consolation: even the reference implementation ships dual-carriageway *merging* as an experimental opt-in full of TODOs — our locked two-carriageway model is the standard-compatible choice.

---

## 1. The standard model, plainly

### 1.1 The data model — `StreetNetwork`

- **`Road`** = a segment between **exactly two `Intersection`s**. Fields: `reference_line` ("the original OSM geometry, slightly smoothed"), `center_line` (the physical center of all lanes incl. sidewalks), `trim_start`/`trim_end` (how much the centerline is cut back at each intersection; negative = extend), and `lane_specs_ltr` — the **cross-section as an ordered left-to-right lane list** (travel lanes, parking, bike, **sidewalks, buffers, medians, verges**), each with type/direction/width. `total_width() = Σ lane widths`. The cross-section lives **on the road**, not in a separate overlay.
- **`Intersection`** = a first-class object at **every** node, with a `kind`: `MapEdge` (hits the boundary) / `Terminus` (dead end) / `Connection` (roads joined, no traffic interaction — our name-transition) / `Fork` (merge/diverge, no stop line) / `Intersection` (real conflict). Movements are computed per intersection and drive the classification.
- Both roads and intersections keep **opaque ids + lists of source OSM objects** — transformations make the OSM↔object mapping increasingly complex, so identity is explicitly *not* the OSM id (cf. our `skelId` + `sources`).

### 1.2 The import pipeline (`streets_reader`)

**Extract → Split → Clip → Match**: parse OSM, **split ways at every shared node into Roads between Intersections** (the *inverse* of our weld — see §2), clip to boundary, attach crossings/barriers. Lane specs parsed from tags at extract time.

### 1.3 Simplification is structural, not vertex-level

There is no RDP pass over centerlines. Simplification operates on the **graph**:

- **`CollapseDegenerateIntersections`** — remove a degree-2 intersection by fusing its two roads, gated on **lane specs + name + highway class + layer + placement all matching**, no crossing at the node, no turn restrictions, and never two oneways pointing at each other. (= our weld, with a much stricter gate list — we gate on `(signature, pairKey)` only; **we never check highway class or layer**.)
- **`CollapseShortRoads`** — roads entirely consumed by intersection trimming are marked `internal_junction_road` and **deleted into the intersection**. The manual OSM tag `junction=intersection` triggers consolidation; **automatic detection of what to consolidate is acknowledged unsolved** (threshold heuristics overshoot; fixed-point iteration exposes edge cases).
- **`RemoveDisconnectedRoads`**, **`SnapCycleways`/sidepath-zipping** (experimental — their version of our paths question).

### 1.4 Intersection geometry — the trim-back algorithm

The published algorithm (A/B Street "map geometry" docs; `osm2streets/src/geometry/`):

1. **Thicken** each road: project the centerline ± half-width (miter joins with a max-miter clamp → bevel on sharp bends).
2. **Collide**: find where the thickened edges of different roads at a node intersect.
3. **Trim**: for each collision, drop a perpendicular to the centerline; **trim the road back to the farthest such point** (stored as `trim_start/end`, not destructive).
4. **Assemble** the intersection polygon: walk **adjacent road pairs in clockwise order** around the node; vertices = the trimmed roads' end-cap corners + the collisions of the *original untrimmed* edges (edges extended back to find the true corner point). Sorting by angle around the shared OSM node; consolidated nodes average the original points and tie-break by distance.

Dispatch by case: `terminus` (dead-end cap) / `degenerate` (2 roads) / **`on_off_ramp`** (exactly 3 roads, ≥1 `*_link` class: 2 "thick" + 1 "thin"; the ramp is trimmed against the thick roads' edges with custom logic because the general trim "produces huge intersections") / `pretrimmed` / `general_case`. Boolean clipping was **considered and rejected** (3-way intersections don't overlap enough); curb/pavement-edge datasets noted as a future alternative.

Two properties worth underlining: the **corner is constructed by identity** (which two roads' edges corner is decided by clockwise adjacency at the node — never by whatever stroke geometry happens to fall there), and roads meet the polygon **perpendicularly** by construction (acknowledged as a simplifying assumption — simulator-grade, not cartography-grade).

### 1.5 Dual carriageways

- **OSM data model**: two parallel `oneway=yes` ways, usually same `name`, same highway class. The `type=dual_carriageway` **relation** exists ("in use" status, exactly two ways, a renderer hint) but is sparse; `dual_carriageway=yes` likewise. Consumers mostly **infer**.
- **osm2streets detection** (`transform/dual_carriageways.rs`) is **data + topology first**: find a `MultiConnection` — an intersection with ≥3 roads where a same-`name` group contains **exactly 2 oneway roads + 1 bidirectional** (the split/rejoin signature); **trace** each oneway side, name-consistent, until the bidi resumes; require both sides to **terminate at the same intersection** with correct directions (side1 src→dst, side2 dst→src); then classify side roads as **branches** (leave the corridor) vs **bridges** (single roads linking the two sides). Geometry (angle checks) is a TODO — i.e., geometry is at most a *check*, never the *definition*.
- **`MergeDualCarriageways`** (collapse the pair to one spine) is **experimental, opt-in** (`dual_carriageway_experiment` flag in the JS API), explicitly incomplete ("TODO Just work on one right now"). The **default** standard pipeline keeps the two carriageways as two roads — and gets the median as an emergent **`DualCarriageway` block**.

### 1.6 Blocks — their name for our tiles

`block.rs`: a **`Block`** = a closed region bounded by road sides + intersections; computed by **`walk_around`** — start on a road side, walk the node's edges in clockwise order, no backtracking (the same half-edge/DCEL face walk as our `extractFaces`), then **`trace_polygon`** shifts the boundary roads' centerlines by half-width to the block side. Kinds: **`LandUseBlock`** ("between sidewalks, probably just buildings"), `RoadAndSidewalk`, `RoadAndCycleLane`, `CycleLaneAndSidewalk`, **`DualCarriageway`** ("space between one-way roads" — **the median, emergent, exactly our doctrine**), **`RoadBundle`** ("a segment of road and all sidepaths" — our corridor), **`IntersectionBundle`** ("a possibly complex junction; everything in between all the crossings" — our §5d "intersection interior is legitimately variable," as a first-class object).

### 1.7 Casing cartography, for completeness

The classic renderer answer to junction joins is **paint order**: draw *all* casings (wide dark line), then *all* fills (narrower light line) — every junction dissolves because fills overpaint casings (standard Mapnik/MapLibre two-pass technique). That trick is unavailable to anyone producing **geometry** rather than paint — vector consumers (osm2streets, us) must *construct* the junction instead. We are in the construction camp; the relevant standard is §1.4, not the paint trick.

---

## 2. Concept map — ours → standard

| Ours | Standard (osm2streets) | Same? Divergence notes |
|---|---|---|
| **chain / frame street** (welded, spans many junctions) | **`Road`** (between exactly two intersections) | Opposite granularity: they **split** at every node then selectively collapse; we **weld** then re-find junctions. Our `(skelId, side, segOrd)` per-fe addressing re-creates their Road granularity inside a chain — `segOrd`'s referent *is* a Road. Welding is fine for authoring identity; the cost is that junctions become *interior vertices* with no object of their own — the root of §3.2/§3.3. |
| **`junctions[]`** (typed by degree: deadend/T/cross/Y) | **`Intersection` + `IntersectionKind`** (MapEdge/Terminus/Connection/Fork/Intersection) | Ours is a *list of typed coordinates*; theirs is an *object with geometry, trims, movements*. Their kinds are semantic (traffic conflict?) not just degree. Our `nameTransitions`/degree-2 ≈ their `Connection`. |
| **weldChains + weldLongitudinal** | **`CollapseDegenerateIntersections`** | Their gate list: lanes + name + **highway class** + **layer** + placement + no crossing + no turn restrictions + not opposing oneways. Ours: `(signature, pairKey)` + oneway-flip guard. **We don't check class or layer** — see §3.1. |
| **`analyzePhases`/`scoreOnewayPair`** (antiparallel ≥0.6 · len-ratio ≥0.5 · gap ≤ **60 m** · station-overlap ≥0.4, within a *name group*) | **`MultiConnection` → trace** (2 oneways + 1 bidi at a node, same name, traced to a common rejoin; branches/bridges classified) | **The key divergence.** Ours is geometric with name as the only data input; theirs is data/topological with geometry as a TODO check. Ours has no class gate, no connectivity requirement, and a 60 m gap ceiling that spans a whole block. §3.1. |
| **two-carriageway locked model, median emergent** | **default pipeline** (no merge) + **`DualCarriageway` block** | ✅ **Agreement.** Their merge-to-spine is the experimental path; our locked two-carriageway model (`RIBBONS.md §3.1`) is the standard-compatible one. |
| **`innerSign`** (global perpendicular-distance vote; E3.4 foot-vote fix) | *(no equivalent — falls out of the block walk)* | In the standard, "which side faces the median" is **face adjacency**: the `DualCarriageway` block is bounded by specific road *sides*. We already have half-edge side resolution in `extractFaces` — innerSign should be a face-adjacency fact, not a vote. |
| **tiles** (`extractFaces`, faces of the centerline graph) | **`Block`** (`walk_around`/`trace_polygon`) | ✅ Same algorithm, same idea. Their kind taxonomy (LandUse/RoadBundle/IntersectionBundle…) is a vocabulary we lack. |
| **the junction construction** (asphalt = union of per-tile inward strips, PLUS the E3.2 window/apron construction on top) | **`update_geometry`**: roads **trimmed back**, intersection polygon **constructed positively** at every node | ⭐ **This WAS the defining divergence — and it is the one we closed.** An emergent-only junction *can* manufacture a stub fillet, a width-step scallop or a butt-cap join, and every E3 artifact lived in that gap. `tileGround.js` now trims runs back and constructs the junction at every stamped node. |
| **E3 node apron** | **intersection polygon** | Same object. Theirs exists at *every* node by construction; ours at every node the prebake stamps — `node -e "const r=require('./src/data/ribbons.json');console.log(r.junctionMap.nodes.length)"`. ⚠️ Stamp coverage is general; **apron *geometry* may still be narrower than the stamps** — see `RIBBONS §1` DOCTRINE, unresolved. |
| **E3 de-taper window** | **`trim_start`/`trim_end`** | Same number. Theirs computed by edge-collision at every node; ours from median-nose stations plus the through-node split/trim pass (`jTrims`, "intersections at EVERY node"). |
| **E3 corner identity** ("which two legs corner") | **corner assembly** (adjacent road pairs in clockwise order; collision of untrimmed edges) | Same decision, and ours is now the same *shape* of decision: corners come from **leg-adjacency at every node**, not a stamped exception list (`SKELETON §5e`). |
| **"perpendicular-join artifact" / fold-at-join / false corner** | *(no name — the standard can't produce it)* | The artifact class is **the absence of trim + assembly**. Nearest standard vocabulary: an *undissolved casing join* / *missing intersection construction*. |
| **dogleg** (46 through-junction off-chord nodes) | *(absorbed by trim)* | §3.3. |
| **junction-protected RDP** (eps 1.0/0.3, forced keeps) | *(nothing — `reference_line` "slightly smoothed"; simplification is structural)* | They never face the protect-vs-straighten tension at junctions because the node neighborhood is *replaced* by the intersection polygon — protection costs nothing visible. |
| **`*_link` / ramps** (named ramps fall into name groups; class flattened) | **`on_off_ramp` dedicated geometry case** (3 roads, thick/thick/thin) | §3.1 — the 18th ramp would be dispatched here, never paired. |
| **"loop street"** (Benton teardrop / Waverly couplet, `loopId` + roles) | *(does not exist)* | **Our artifact — as a geometry concept.** In the standard: Benton = ordinary Roads + a `Terminus`-free cycle whose interior is a **`LandUseBlock`**; Waverly = two oneway Roads whose between-space is a **`DualCarriageway` block**; "no sidewalk on the median side" = an **asymmetric `lane_specs_ltr`** on the road, not a role. The *authoring shorthand* (one click paints the loop's cross-sections) is legitimately ours; the geometry layer shouldn't know the word. L.3's role model should compile down to per-side lane composition, nothing else. |
| **`caps` round/butt** | `Terminus` kind + end-cap geometry | ✅ Equivalent. |
| **`gradeSeparated` excluded from face graph** | `layer` on roads; bridges/tunnels share no node | ✅ Same shared-vertex-only logic. |
| **width sourcing custom > OSM > AASHTO** (operator-measured `survey.json`) | `total_width = Σ` lane widths **from OSM tags** | Ours is *better for our product* (real measured curbs; OSM lane tags are sparse/wrong here — `tiger:reviewed=no` all over LS). Keep ours. They'd call our per-fe customs "edited lane specs." |
| **Section FILL** (curb/treelawn/sidewalk strips painted inward; `sectionPass`) | `lane_specs_ltr` includes sidewalks/verges, rendered as lane polygons | Theirs is flat lane polygons for simulation; our painter (concentric jtMiter offsets, materials, the 3-S split) has no counterpart. **Doesn't transfer; keep.** |
| **`skelId` stability + the Wall** (frozen artifact, authoring overlay) | opaque ids, *recomputed* per transformation; mutation API re-runs geometry | They are a *live* network editor; we freeze. **Their id model would break our overlay** — a core reason not to adopt (§4.1). |

---

## 3. The bugs this grounding diagnosed — ✅ all three closed. Kept as the worked example of reading a defect in standard terms.

### 3.1 The 18th mis-pair — geometric detection fired where the data model says no ✅ FIXED

⛔ **Closed — do not re-forensic.** A `motorway_link` ramp and a `service` drive, both named "South 18th Street," were paired into a fabricated 3.2 m-median "divided road," because `groupByName` bucketed by name only and `scoreOnewayPair` gated on geometry alone — antiparallel, length-ratio, gap, station-overlap — with **no class gate and no connectivity gate**. Two oneway ways near each other with the same name *were* a divided road, by definition.

⭐ **The forward rule, which is the part worth keeping:** *geometric similarity is confirmation, never detection.* The standard refuses that pair three independent data-first ways — matching highway **class**, `*_link` **dispatch** to a dedicated ramp case, and a **split/rejoin topology** requirement — and none of them look at geometry. That is now our gate too: `carriagewayGates` (`skeleton.js`) runs data-first with `scoreOnewayPair` demoted to confirmation, and the **genuine** 18th pair (`-5`/`-6`, both `secondary`) still pairs. `makeStreet`'s first-fragment class flattening is fixed with it. *(Detail: `LOOP-STREETS.md` header, `870a1fd`.)*

### 3.2 The perpendicular-join artifact — the intersection was not constructed ✅ CURED

`_archive/JUNCTION-CURE-PLAN.md` already found the one root: *"the junction silhouette is never CONSTRUCTED — it is EMERGENT from independent constant-width butt-capped chain strokes"* (`strokeOpen` per run → union → `filletRing` rounds whatever falls out; **53 width-step instances** map-wide). In standard terms this is simply: **we skipped the trim-back + intersection-polygon + corner-assembly step that the reference implementation runs at every node.** Their geometry *cannot* express a butt-cap meeting a flank mid-air: every road end is trimmed to the intersection polygon, the polygon's boundary is built from identified corner pairs, and a road whose length is consumed by trimming is **deleted into the junction** (`internal_junction_road`) — which is precisely the carriageway-stub story (`SKELETON §5e`, the false corner) handled as a *general rule*, not a special case.

E3 was the correct cure and is *the standard algorithm in disguise*: **apron = intersection polygon · de-taper window = trim distance · corner identity = corner-pair assembly · "continuity pair" = their collapse-gate equality test.** ⭐ **The delta the standard exposed — and the reason the cure was promoted — was COVERAGE, not method:** E3 originally stamped a *width-discontinuity census* of nodes, where the standard constructs at *every* node, so the next artifact class is pre-empted rather than censused after it bites. Generalizing to every node landed 2026-06-07 (`9c275ce`; `SKELETON §5e`) and the artifact family went with it. **The transferable lesson: a censused exception list is a coverage bug wearing a fix's clothes** — it handles the instances someone already found, which is exactly what `CLAUDE.md` Layer 0 forbids a kit to ship.

### 3.3 The dogleg — absorbed inside the intersection polygon

Our 46 through-junction kinks: junction-protected RDP must keep the node, and OSM digitized the node 3–4 m off the through-chord (`SKELETON §5a`). The reverted straightener attacked the *node position*. The standard never needs to: the through-road's centerline is **trimmed back** at the junction by roughly the cross-street's half-width (≥ 3.5–7.5 m on these streets) — *more* than the excursion — so the bent tip near the node is cut off, the road's visible edges are offsets of the **straight remainder**, and the kink's neighborhood is covered by the intersection polygon. The node position degrades into what it should be: the polygon's approximate center, not a vertex any curb passes through. **Dissolves under the standard? Yes, for the at-junction population (which is all 46 — they're *through-junction* kinks by definition).** The protection that saved the 79 Ts stops costing anything once junction neighborhoods are constructed — protect *and* trim is the resolution of §5a's tension.

### 3.4 What the standard has NOT solved (don't over-credit it)

- **Auto-consolidation** of intersection clusters is open there too — they lean on the manual `junction=intersection` tag; thresholds overshoot. Our divided-transition-on-the-cross-street consolidation problem is genuinely hard everywhere.
- **`MergeDualCarriageways` is experimental and TODO-laden** — single bridges only, no angle checks, "just work on one right now." Nobody has shipped the merge. We don't need it (we *want* two carriageways + emergent median), so this gap costs us nothing — but it kills any "just let osm2streets handle divided roads" fantasy.
- **Simulator-grade aesthetics**: perpendicular meeting assumption, "huge intersections" from general trim (their own words, in the ramp case), known funky-geometry edge cases, phantom collisions from short roads. Their polygons are *correct*, not *beautiful* — our authored curb radii, tight stylized corners, and the fillet kit remain our product layer on top of any ported skeleton.
- **No authoring model**: widths from OSM tags; ids unstable under transformation; mutation = recompute. The Wall (frozen substrate + overlay keyed to stable identities) has no counterpart — it is *our* architecture and the standard offers nothing to replace it.

---

## 4. Recommendation

### 4.1 Adopt the library? **No.**

`osm2streets-js` (WASM, runs in Node) could in principle replace prebake's geometry: feed OSM, get road polygons / intersection polygons / lane polygons / blocks as GeoJSON. Against it, decisively: **(a)** widths come from OSM lane tags — ours come from operator-measured `survey.json` (61/68 LS streets), the doctrine is custom > OSM > AASHTO, and LS's OSM tags are `tiger:reviewed=no`-grade; **(b)** its ids are opaque and transformation-dependent — our `skelId`-keyed overlay (`blockCustoms`, corner overrides, caps) and the frozen-Wall architecture require stable identity across rebuilds; **(c)** its geometry is simulator-grade where our entire product is the stylized look (authored radii, curb arcs, the 3-S Section painter — none of which it has); **(d)** the one transform we'd most want (dual-carriageway *handling*) is the one that's experimental there, and their *default* (keep two carriageways) is what we already do; **(e)** it ingests OSM XML upstream of where our intake/local-frame/boundary machinery lives. The fit fails on data flow, identity, and product target simultaneously. *(Worth keeping in the toolbox: StreetExplorer as an eyeball reference for any LS junction — and their `tests/` corpus of pathological junctions as toy-fixture inspiration.)*

### 4.2 Port the methods? **Yes — two. ✅ Both are landed; what remains is named below.**

1. **Data-first divided detection.** ✅ **LANDED** (`870a1fd`) — `carriagewayGates` (`skeleton.js`) runs *in front of* `scoreOnewayPair`: eligible-class set + exact class match, `*_link`/`service` excluded from carriageway candidacy, split/rejoin connectivity required; the four geometric gates demoted to confirmation. `makeStreet`'s first-fragment **class flattening** is fixed with it (per-chain dominant class over its own `sources` — the D6 oneway pattern; also repairs `gradeSeparated` for named ramps). ▶ **The one sub-clause NOT done:** *tighten `DIVIDED_MAX_GAP` (60 m) toward a plausible median ceiling.* ⛔ Don't budget the whole port — this is all that's left of it.
2. **Intersection-everywhere at prebake.** ✅ **LANDED** (`9c275ce`, 2026-06-07; `SKELETON §5e`) — the junction map is no longer a censused exception list; **every junction node gets an intersection record**, corners come from **leg-adjacency at every node**, and `tileGround.js`'s through-node pass splits and trims runs at each. `innerSign` is a face-adjacency fact rather than a perpendicular vote. ⛔⛔ **CORRECTED 2026-08-12 — this bullet was wrong in both halves, measured.** **(1)** *"What remains open is apron geometry coverage, **not the map**"* is **REFUTED: the MAP is thin at the ordinary cases.** Re-keyed to the geometric degree (`tileGround.js:2787`'s `nodeDeg` — ⛔ **`legs.length` is NOT the degree**; a `through` leg is two arms, and keying on it reports the opposite of the truth), **81 plain Ts and 48 plain crosses carry no construction field at all**, and dead ends carry only `tip-wrap`, which `:2992` explicitly continues past. The branch written to fix the straight uniform-width T — `[THRU-T]`, `tileGround.js:3589-3613` — is gated on `opts.thruTNode`, which **no producer ever passes: dead code in every pour.** So "intersection-everywhere" landed as a **stamp map**, not as construction. **(2)** The substrate question it deferred to is **no longer unruled** → ✅ **`RIBBONS.md §1`, ruled 2026-08-12** (the punch-out, walked over identity-carrying side-chains). ⭐ And this doc's own §2 row on `innerSign` — *"which side faces the median is face adjacency, not a vote"* — is a **falsifiable prediction of that ruling**: under one-side-per-chain there is nothing left to vote on.

**What the port dissolved:** the width-step family *and its future members at any node*; the visible effect of the through-junction doglegs (absorbed by trim, §3.3); the false-corner regression class; the 18th-class mis-pairs. **What it did not:** Section-layer band folds (`iW`, behind the Wall), width-datum quality (data, not construction), loop cross-section roles (an authoring compile, §2's last row).

### 4.3 Align concepts? **Yes — rename as docs are touched, not as a campaign.**

| retire | adopt |
|---|---|
| junction map | **intersection set** |
| node apron | **intersection polygon** |
| de-taper window | **trim distance** (`trimStart`/`trimEnd`) |
| corner identity | **corner pair** |
| divided pair (as detector output) | **dual carriageway** |
| "perpendicular-join artifact" | **un-constructed intersection** (the artifact = its absence) |
| "loop street" (in geometry code/docs) | **enclosed block** + per-side cross-section (keep "loop" as the *authoring* card's name only) |
| tile (when speaking to outsiders) | **block** (their `Block` is literally our tile) |

The win Jacob asked for — *correct vocabulary + standard methods* — cost almost nothing here because E3 had already built the right machinery under homemade names. The honest summary for the record: **we independently re-derived most of the standard pipeline** (faces, emergent medians, structural welds, junction protection, and finally — via four days of forensics — intersection construction itself); the part we had *not* re-derived (data-first detection, intersection-everywhere, corner-by-adjacency) was exactly where the open bug families lived, and porting those three is what closed them. ⭐ **The lesson that generalizes past this doc: when a bug family resists, check whether the field already named the construction you are missing** — the vocabulary table above is where to start, because a defect you cannot name is one you are re-deriving.

---

## Sources

- [osm2streets repo](https://github.com/a-b-street/osm2streets) · [docs/how_it_works.md](https://github.com/a-b-street/osm2streets/blob/main/docs/how_it_works.md) · [`transform/dual_carriageways.rs`](https://github.com/a-b-street/osm2streets/blob/main/osm2streets/src/transform/dual_carriageways.rs) · [`transform/collapse_intersections.rs`](https://github.com/a-b-street/osm2streets/blob/main/osm2streets/src/transform/collapse_intersections.rs) · [`geometry/`](https://github.com/a-b-street/osm2streets/tree/main/osm2streets/src/geometry) (incl. `on_off_ramp.rs`) · [`road.rs`](https://github.com/a-b-street/osm2streets/blob/main/osm2streets/src/road.rs) · [`block.rs`](https://github.com/a-b-street/osm2streets/blob/main/osm2streets/src/block.rs) · [`osm2streets-js/src/lib.rs`](https://github.com/a-b-street/osm2streets/blob/main/osm2streets-js/src/lib.rs)
- [A/B Street map-geometry doc](https://a-b-street.github.io/docs/tech/map/geometry/index.html) (the trim-back algorithm + consolidation, the canonical writeup)
- [OSM wiki: Relation:dual_carriageway](https://wiki.openstreetmap.org/wiki/Relation:dual_carriageway) · [OSM Help: Mapnik road cores and casings](https://help.openstreetmap.org/questions/10088/mapnik-rendering-road-cores-and-casings) (the two-pass paint dissolve)
- Ours: `SKELETON.md` · `PREBAKE.md` · `_archive/JUNCTION-CURE-PLAN.md` · `LOOP-STREETS.md` · `RIBBONS.md §1` · `skeleton.js` (`scoreOnewayPair`, `makeStreet`) · `src/lib/tileGround.js` (header, `extractFaces`, `filletRing`) · fresh forensics on `data/lafayette-square/raw/osm.json` + `clean/skeleton.json` + `src/data/ribbons.json` (the 18th pair)

---
*Macadam, 2026-06-06. Read-only specialist pass; raw/clean data read from the worktree (stadia-e34-datums state — E3.4 landed there, not yet on trunk at time of writing). ⛔ No canonical-doc edits beyond this file (Boz conforms).*
