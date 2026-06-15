# osm2streets grounding — our road model vs. the standard

**Deliverable of `HANDOFF-osm2streets-grounding.md` (Macadam, 2026-06-06). Web-grounded reference — no code touched.** The field's reference implementation for OSM→street-geometry is **osm2streets** (the A/B Street project, `github.com/a-b-street/osm2streets`, Apache-2.0, Rust core + `osm2streets-js` WASM): lanes, road casings, intersection polygons, dual carriageways, blocks. Read against our `SKELETON.md` / `PREBAKE.md` / `_archive/JUNCTION-CURE-PLAN.md` / `LOOP-STREETS.md` / `RIBBONS.md` / `skeleton.js` / `tileGround.js`, plus a fresh forensic on the South-18th mis-pair (raw OSM tags, this session).

> **Verdict up front.** The standard model **independently validates our two deepest doctrines** — the emergent median (their `DualCarriageway` block kind: *"space between one-way roads"*) and tiles-as-graph-faces (their `Block`, computed by the same half-edge walk). The two places we diverged from the standard are exactly where our worst bug families live: **(1) they construct the intersection positively** (every node is a first-class `Intersection` object; roads are *trimmed back* to an explicit intersection polygon) where our tile model's header says, verbatim, *"the IX is never constructed"* — that one divergence is the whole E3 family; **(2) they detect dual carriageways from the data model + topology** (name + `oneway` + a split/rejoin trace, highway class respected, ramps dispatched to a dedicated routine) where we detect from **geometry alone** — which is how a `motorway_link` ramp and a `service` drive, both named "South 18th Street," became a fabricated 3.2 m-median "divided road" (§3.1). **E3 is us re-deriving the standard intersection algorithm by hand** — apron = intersection polygon, de-taper window = trim distance, corner identity = their corner-assembly step. Right cure, non-standard vocabulary, partial coverage. **Recommendation: don't adopt the library; port two methods (intersection-everywhere at prebake, data-first divided detection) and align vocabulary** (§4). And one consolation: even the reference implementation ships dual-carriageway *merging* as an experimental opt-in full of TODOs — our locked two-carriageway model is the standard-compatible choice; only our *detector* is homegrown.

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
| **two-carriageway locked model, median emergent** | **default pipeline** (no merge) + **`DualCarriageway` block** | ✅ **Agreement.** Their merge-to-spine is the experimental path; the locked FEATURES §371 model is the standard-compatible one. |
| **`innerSign`** (global perpendicular-distance vote; E3.4 foot-vote fix) | *(no equivalent — falls out of the block walk)* | In the standard, "which side faces the median" is **face adjacency**: the `DualCarriageway` block is bounded by specific road *sides*. We already have half-edge side resolution in `extractFaces` — innerSign should be a face-adjacency fact, not a vote. |
| **tiles** (`extractFaces`, faces of the centerline graph) | **`Block`** (`walk_around`/`trace_polygon`) | ✅ Same algorithm, same idea. Their kind taxonomy (LandUse/RoadBundle/IntersectionBundle…) is a vocabulary we lack. |
| **"the IX is never constructed"** (tile header; asphalt = union of per-tile inward strips; junction emergent) | **`update_geometry`**: roads **trimmed back**, intersection polygon **constructed positively** at every node | ⚠️ **The defining divergence.** Their model *cannot* manufacture a stub fillet, a width-step scallop, or a butt-cap join — the geometry near the node is replaced by construction. Every E3 artifact lives in this gap. |
| **E3 node apron** | **intersection polygon** | Same object. Theirs exists at *every* node by construction; ours at 50 stamped nodes. |
| **E3 de-taper window** | **`trim_start`/`trim_end`** | Same number. Theirs computed by edge-collision at every node; ours from median-nose stations at width-discontinuity nodes only. |
| **E3 corner identity** ("which two legs corner") | **corner assembly** (adjacent road pairs in clockwise order; collision of untrimmed edges) | Same decision. Theirs is the *default algorithm*; ours is a stamped exception list. "The corner-builder cornered the wrong legs" (`SKELETON §5e`) is, in standard terms, "we had no corner assembly step." |
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

## 3. Our live bugs, in standard terms

### 3.1 The 18th mis-pair — geometric detection fired where the data model says no

**Forensics (this session, raw `osm.json` + `skeleton.json`):** the pair `28522831-166624144` = `south-18th-street-1` + `-4`, stamped `kind:'divided'`, `chainGap: 3.21`, and rendered `anchor: inner-edge`, `innerSign: -1`, `pairId` pointing at each other. The raw ways:

| way | highway | tags |
|---|---|---|
| 28522831 | **`motorway_link`** | name "South 18th Street", oneway, lanes 1 (an I-44 ramp segment carrying the street name) |
| 166624144 | **`service`** | name "South 18th Street", oneway |

A **freeway ramp and a service drive** became two "carriageways" of a fabricated 3.2 m-median divided road — and `makeStreet` (`skeleton.js:1452`) then stamped both `highway:'residential'`, because it takes the **name group's first fragment's tags** for the whole group (the same first-fragment flattening the D6 comment documents for `oneway` — fixed for oneway, still live for `highway`; it also defeats `gradeSeparated`, since `isLimitedAccess` sees "residential," not "motorway_link").

**Why ours fired:** `groupByName` buckets by name *only*; `scoreOnewayPair` is four geometric gates (antiparallel, length-ratio, gap ≤ **60 m**, station-overlap) with **no class gate, no connectivity gate**. Two oneway ways near each other with the same name *are* a divided road, by definition. A 60 m ceiling spans an entire block — any same-name oneway couplet, frontage road, ramp, or service alley inside it is a candidate.

**The standard would refuse this pair three independent ways:** (1) **class** — `motorway_link` ≠ `service`; every collapse/merge gate in osm2streets requires matching highway class; (2) **dispatch** — a `*_link` road at a 3-road node goes to the dedicated `on_off_ramp` geometry case, never into carriageway pairing; (3) **topology** — no `MultiConnection` split/rejoin signature (2 oneways + 1 bidi at a shared node, traced to a common rejoin) exists between a ramp and a service drive. Meanwhile the **genuine** divided pair on 18th (`-5`/`-6`: both `secondary`, lanes 3/2, split/rejoin sharing the node at `(658,-727)`, gap 11.0 m) passes both their detector and ours — the geometric gates aren't *wrong*, they're *insufficient alone*.

**Dissolves under the standard? Yes** — detection-layer, cheap, frame-side (§4.2 item 1).

### 3.2 The perpendicular-join artifact — "the intersection was never constructed"

`_archive/JUNCTION-CURE-PLAN.md` already found the one root: *"the junction silhouette is never CONSTRUCTED — it is EMERGENT from independent constant-width butt-capped chain strokes"* (`strokeOpen` per run → union → `filletRing` rounds whatever falls out; **53 width-step instances** map-wide). In standard terms this is simply: **we skipped the trim-back + intersection-polygon + corner-assembly step that the reference implementation runs at every node.** Their geometry *cannot* express a butt-cap meeting a flank mid-air: every road end is trimmed to the intersection polygon, the polygon's boundary is built from identified corner pairs, and a road whose length is consumed by trimming is **deleted into the junction** (`internal_junction_road`) — which is precisely the carriageway-stub story (`SKELETON §5e`, the false corner) handled as a *general rule*, not a special case.

E3 is the correct cure and is *already the standard algorithm in disguise*: **apron = intersection polygon · de-taper window = trim distance · corner identity = corner-pair assembly · "continuity pair" = their collapse-gate equality test.** Two honest deltas, both in the standard's favor: (a) **coverage** — E3 stamps ~86 nodes selected by width-discontinuity census; the standard constructs at *every* node, so the next artifact class (whatever it is) is pre-empted rather than censused after it bites; (b) **trim derivation** — theirs comes from edge *collision* (any two legs, any angle), ours from median-nose stations (divided transitions only) — collision-based trim generalizes to plain Ts and skew crossings with no new concept. **Dissolves under the standard? By construction.**

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

### 4.2 Port the methods? **Yes — two, both already half-built by E3.**

1. **Data-first divided detection (frame-side, cheap, geometry-affecting — A/B gate it).** Add the standard's gates *in front of* `scoreOnewayPair`: same (or compatible) highway class; **`*_link` and `service` fragments excluded from carriageway candidacy** (ramps are their own case — we can simply not pair them; we don't need their ramp geometry); **endpoint-connectivity requirement** — the pair must share split/rejoin nodes, directly or via short bridges (the `MultiConnection` trace, which our `phase.startNode`/`endNode` + node graph already make easy); tighten 60 m toward a plausible median ceiling; keep the four geometric gates as *confirmation*. And fix `makeStreet`'s first-fragment **class flattening** (`skeleton.js:1452` — per-chain dominant class over its own `sources`, the exact pattern of the D6 oneway fix; also repairs `gradeSeparated` for named ramps). This dissolves the 18th mis-pair class at the root.
2. **Intersection-everywhere at prebake (the E3 generalization — the standard algorithm, our vocabulary retired).** Promote E3.1's junction map from a censused exception list (~86 nodes) to the standard's invariant: **every junction node gets an intersection record** — kind (their five-way taxonomy maps cleanly onto our degree+name-transition facts), **per-leg trim distances computed by edge-collision** (subsumes de-taper windows; covers plain Ts, skew crossings, and the next un-censused artifact class), **an intersection polygon (apron) wherever kind = real intersection**, and **corner pairs by clockwise adjacency** (subsumes corner identities; `filletRing` corners identified legs only, everywhere). Legs fully consumed by trim are absorbed into the node (`internal_junction_road` — the general form of the §5e stub cure). This rides the proven E3 consume-by-identity pattern and lands naturally inside the PREBAKE polygon-ization program (`PREBAKE.md §5`) — the intersection records become frozen facts of the polygon substrate. Bonus port while in there: **`innerSign` as face adjacency** (which side's half-edge bounds the median face) instead of a perpendicular vote — the E3.4 foot-vote bug class can't exist in that formulation.

**What this dissolves:** the 53-step family *and its future members at any node*; the visible effect of all 46 doglegs (absorbed by trim, §3.3); the false-corner regression class (corner-by-identity everywhere); the 18th-class mis-pairs. **What it does not:** Section-layer band folds (`iW`, behind the Wall — own brief), width-datum quality (E1/E3.4 class — data, not construction), loop cross-section roles (L.3 — an authoring compile, §2's last row).

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

The win Jacob asked for — *correct vocabulary + standard methods* — costs almost nothing here because E3 already built the right machinery under homemade names. The honest summary for the record: **we independently re-derived ~80% of the standard pipeline** (faces, emergent medians, structural welds, junction protection, and finally — via four days of forensics — intersection construction itself); the 20% we hadn't re-derived yet (data-first detection, intersection-everywhere, corner-by-adjacency) is exactly where the open bug families live. The field had the names the whole time.

---

## Sources

- [osm2streets repo](https://github.com/a-b-street/osm2streets) · [docs/how_it_works.md](https://github.com/a-b-street/osm2streets/blob/main/docs/how_it_works.md) · [`transform/dual_carriageways.rs`](https://github.com/a-b-street/osm2streets/blob/main/osm2streets/src/transform/dual_carriageways.rs) · [`transform/collapse_intersections.rs`](https://github.com/a-b-street/osm2streets/blob/main/osm2streets/src/transform/collapse_intersections.rs) · [`geometry/`](https://github.com/a-b-street/osm2streets/tree/main/osm2streets/src/geometry) (incl. `on_off_ramp.rs`) · [`road.rs`](https://github.com/a-b-street/osm2streets/blob/main/osm2streets/src/road.rs) · [`block.rs`](https://github.com/a-b-street/osm2streets/blob/main/osm2streets/src/block.rs) · [`osm2streets-js/src/lib.rs`](https://github.com/a-b-street/osm2streets/blob/main/osm2streets-js/src/lib.rs)
- [A/B Street map-geometry doc](https://a-b-street.github.io/docs/tech/map/geometry/index.html) (the trim-back algorithm + consolidation, the canonical writeup)
- [OSM wiki: Relation:dual_carriageway](https://wiki.openstreetmap.org/wiki/Relation:dual_carriageway) · [OSM Help: Mapnik road cores and casings](https://help.openstreetmap.org/questions/10088/mapnik-rendering-road-cores-and-casings) (the two-pass paint dissolve)
- Ours: `SKELETON.md` · `PREBAKE.md` · `_archive/JUNCTION-CURE-PLAN.md` · `LOOP-STREETS.md` · `RIBBONS.md §1` · `skeleton.js` (`scoreOnewayPair`, `makeStreet`) · `src/lib/tileGround.js` (header, `extractFaces`, `filletRing`) · fresh forensics on `data/lafayette-square/raw/osm.json` + `clean/skeleton.json` + `src/data/ribbons.json` (the 18th pair)

---
*Macadam, 2026-06-06. Read-only specialist pass; raw/clean data read from the worktree (stadia-e34-datums state — E3.4 landed there, not yet on trunk at time of writing). ⛔ No canonical-doc edits beyond this file (Boz conforms).*
