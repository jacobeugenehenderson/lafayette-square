# SURVEY-CONSTRUCTION-FORENSIC — the corner-registration gap + the 4 tension marks

**Agent:** Caliper (fresh, cold eyes). **Read-only** — no code/canon/bake touched. All renders are **labelled proxies**; the operator's eye is the gate. **Date:** 2026-06-08. **Trunk:** `cartograph-looks-pass-ab`.
**Method:** live build (`buildTileGround`, `smooth:0` — **the exact live Survey path**, confirmed `BlockGeometryV2Debug.jsx:273 streetSmooth = 0`). Authoritative instrumentation = tap inside a faithful copy of the stamping loop (`scratch/tg-instr.mjs` + `scratch/caliper-instr.mjs`), not a reconstruction. Mark proxies = `scratch/caliper-mark{0..3}.png` (±45 m) and `caliper-markZ{0..3}.png` (±16 m).

---

## TL;DR — three hypotheses in the brief, all partly KILLED

1. **"~136 real corners get no handle."** → The 136 is **inflated**. The coverage harness's `turnAt` is **convexity-blind**, so it counted **58 concave/reflex vertices** as "corners 18–160°." The true convex-sharp corner count on the tile rings is **544, not 602.** Real gap = **544 − 466 = 78**, of which **~77 are genuine** unstamped corners.
2. **"No Survey handle AND a dysfunctional Section bent-quad — one root, both tools."** → **KILLED as a code unification.** `sectionPass` **never reads `cornerFillets`** (`grep`: the only consumers are `BlockGeometryV2Debug.jsx` → the magenta authoring handle). An unstamped corner has **no Section-FILL consequence** via this path; the Section corner is independently the disk primitive (Plumb's Fix B). And the missing entry does **not delete the handle** — it falls the handle back from the achieved-arc midpoint to `c.Q`, a re-derived corner point (`CornerEditHandles.jsx:269-277`). The real defect is *handle-fidelity*, not *handle-absence*.
3. **The 4 marks are "a new / SVG-overdraw artifact."** → They are the **known band-fold / SELFINT class** (`RIBBONS §6.3`, `HANDOFF-band-fold-fix.md`). Jacob's "overdraw" read is *literally correct*: a self-intersecting band ring triangulates to an opaque blob (RIBBONS §6.3: "SELFINT triangulates as opaque artifact"). A **dispatch-ready fix already exists** (Option A, local capacity clamp).

**The corner gap and the 4 marks are DISTINCT code roots** (a keying failure vs a geometry self-intersection), sharing only the difficult *terrain* (junctions, divided-avenue perimeters, thin/acute tiles). The operator's visual unification is not a code unification — the false-corner discipline holds.

---

## (a) Taxonomy of the corner-registration gap

### The numbers (authoritative — `scratch/caliper-instr.mjs`, tap in `scratch/tg-instr.mjs:2010`)
| quantity | value | meaning |
|---|---|---|
| harness "corners 18–160°" | 602 | **convexity-blind** — over-counts |
| tile-ring **convex** sharp corners | **544** | the true handle-candidate denominator |
| concave/reflex vertices miscounted as corners | **58** | 602 − 544 — *correctly* get no handle |
| **fSink** — fillets actually achieved on the block rings | **560** | filletRing rounded 560 corners |
| within-tile **key collisions** (two fillets → one key → overwrite) | **93** | 560 → 467 distinct keys |
| `cornerFillets` stamped (global) | **466** | one further cross-tile merge |
| **tile-ring sharp corners with NO fillet apex mapped** | **77** | the genuine unstamped set |

The mechanism: `filletRing` runs on `blockRings = differenceRings([tile.ring], aFill)` (`tileGround.js:1994`) — **not** `tile.ring`. The junction windows (E3.2), through-windows (THRU), aprons and the asphalt difference reshape the curb line, so the **block ring carries more corners than the centerline tile ring** (560 fillets vs 544 corners). Each achieved fillet's apex is then snapped back to the **nearest** tile-ring sharp corner by `nearestCornerVertexIndex` (`:2006`) — a **non-injective nearest-neighbour assignment with no 1:1 guarantee.** It both **collides** (multiple apexes pile onto one node → 93 overwrites) and **orphans** (genuine corners left with no apex → 77). These are two faces of one mechanism.

### Buckets (the 77)
| bucket | count | tiles | why | leverage |
|---|---|---|---|---|
| **A — whole-tile sliver collapse** | 12 | #19, #88, #89, #97 (17–1158 m²) | block ring drops below the `>0.5 m²` filter (`:1994`) → tile emits 0 fillets | **low — largely correct** (no real block to handle) |
| **B — apex→node re-keying on big junction blocks** | ~55 | park #0 (−10), #12 (−6), #45/#46 (−4), #4/#5 (−3), … | block-ring corners (window/apron/offset) are non-injectively snapped to tile-ring nodes (`:2006`); 93 collisions overwrite, orphaning genuine corners | **the real bug** |
| **C — small-tile partial** | ~10 | #21, #68, #71, #76, #90, #99, #100 (150–5800 m²) | same re-keying, on thin tiles where the block ring is present but corner-dense | medium |

The unmapped points trace the **divided-avenue / junction perimeters** — e.g. tile #0's orphans run `[-920.6,58.5],[-822,74.7],[-727.5,89.4],[-623.3,105.6]…` along the park edge; several points appear twice (near-coincident corner pairs at junction stations).

### Section consequence of an unstamped corner — **NONE via `cornerFillets`**
`sectionPass` builds its corner FILL as a vertex-centred disk (`tileGround.js:746-760`, Plumb) and **does not consume `cornerFillets`.** So the registration gap **does not** "mis-build the Section bent-quad." The only consequence is in **Survey authoring**: the magenta handle falls back from the achieved-arc midpoint to `c.Q` (`CornerEditHandles.jsx:276`) — it sits at a re-derived geometric corner instead of the real (window-reshaped) curb arc, and a radius drag there tunes against an arc the bake won't reproduce. "One-corner-truth" is locally broken at ~65 junction corners — a **fidelity** degradation, not a missing handle.

---

## (b) The 4 marks — each classified (labelled proxies)

Every mark **co-locates with a self-intersecting offset ring** detected geometrically (`scratch/caliper-marks.mjs` flags crossings in red). All four are the **band/offset self-intersection ("overdraw") class** — inward Clipper offsets of `iA` folding where the local corridor is too thin or too acute. The op is `offsetRings(iA, −delta, bandJoin)` — ped bands in `sectionPass` (`:653`), the curb stroke (`:2043`), and the asphalt union `Aacc` (`:2042/:2075`).

| # | centroid | proxy verdict | exact ring / op | root |
|---|---|---|---|---|
| **0** | `[450,−92]` | a **thin asphalt finger/wedge** along a block edge at a shallow-angle junction; the 44-pt asphalt ring self-crosses (2×) under the stroke (`Z0.png`) | **asphalt union** `Aacc = differenceRings(tile.ring, iA)` + stadium union (`:2042`, `:2075`) | acute-junction asphalt self-intersection — the **asphalt-side sibling** of the iW fold (corridor too thin where two stadiums meet at a shallow angle) |
| **1** | `[177,202]` (park, Mississippi×Lafayette, **old false-corner node**) | **curve-and-cut + sidewalk fold** at the curb just below the divided-avenue corner; 133-pt sidewalk ring self-crosses; a thin median taper wedge sits just above (`Z1.png`) | **ped-band** `iW = offsetRings(iA, −WB)` in `sectionPass` (`:653`) at a **T-mouth neck** | `iW`-fold — **Root A (T-mouth)** of `HANDOFF-band-fold-fix.md`. *Not* an E3.3 corner-identity residual; the curb silhouette is the divided-transition curb, and the band folds inward at the local neck |
| **2** | `[706,302]` (east) | the **cleanest case**: a small **floating self-intersecting sidewalk loop/teardrop** detached above the curb at a junction corner (`mark2.png`, `Z2.png`) | **ped-band** `iW = offsetRings(iA, −WB)` (`:653`) | `iW`-fold — **Root A/B**. The deepest offset crossed itself into a closed loop = the textbook 76–180° sidewalk reversal |
| **3** | `[−344,−244]` (southwest) | a **thin curb needle/spike** shooting out of a junction corner; two curb rings self-cross (2× each) at the stroke (`mark3.png`, `Z3.png`) | **curb stroke** `Cacc = differenceRings(iA, offsetRings(iA, −cw))` (`:2043`); a **coincident-fill-seam needle** (the class the `:1989-1993` comment names but only drops when `<0.5 m²`) | curb-offset self-intersection — same family, **curb-side** (shallower `iC` offset folds / a zero-width seam needle survives into a larger ring) |

**Caveats (proxy honesty):** proxies are drawn **without the boundary stencil** (Survey passes one); the marks are all **interior** band/curb/asphalt rings, unaffected by the perimeter G9 fill. `smooth:0` matches the live Survey exactly. The self-intersection counts include one map-spanning 480-pt asphalt ring (6 crossings) that is a **global red herring** — its crossings are at *other* distant junctions, not these marks; the *local* flagged rings (listed above) are the real artifacts and they sit under the strokes.

---

## (c) One root or many? — **DISTINCT roots, shared terrain**

| | corner-registration gap | the 4 marks |
|---|---|---|
| **failure type** | keying / correspondence | geometry self-intersection |
| **op** | apex→tile-node snap `nearestCornerVertexIndex` (`:2006`) + sliver drop (`:1994`) | inward offset `offsetRings(iA, −delta)` (`:653`, `:2043`, asphalt `:2042`) |
| **symptom** | handle falls back to `c.Q` (off the curb arc) | opaque overdraw blob (SELFINT triangulation) |
| **guard that sleeps** | none — the snap has no injectivity check | per-tile capacity guard (`:2024-2041`) is **whole-tile**, blind to a **local** neck |
| **fix already scoped?** | no | **yes** — `HANDOFF-band-fold-fix.md` Option A |

They **share only the terrain**: both worsen exactly where `iA`'s curb geometry departs from the clean centerline tile ring — junctions, divided-avenue perimeters, thin/acute tiles. Mark #1 sits at the same park-perimeter node where tile #0 sheds the most orphan corners, but that is **co-incidence of difficult geometry, not a shared op.** Treating them as one fix would repeat the false-corner error (operator's visual unification ≠ code unification).

The 4 marks **are** internally one class (the band-fold `iW`/offset self-intersection), with three flavours: ped-band fold (#1, #2), curb needle (#3), asphalt wedge (#0).

---

## (d) Fix loci — ranked by leverage

1. **The 4 marks → `HANDOFF-band-fold-fix.md` Option A (LOCAL capacity clamp).** Dispatch-ready, scoped op-by-op. Locus: `sectionPass`'s `iW = offsetRings(iA, −WB)` (`tileGround.js:653`) + the curb offset (`:2043`); detect the **local neck** (local inscribed reach < band depth) and clamp the deep offset **there** so the band **truncates to a clean edge** instead of folding past the medial axis. The existing per-tile guard (`:2024-2041`) is too coarse — it sleeps when the tile is globally in-spec while a local neck folds. **Mark #0 (asphalt) and #3 (curb) need the same local-neck logic applied to `Aacc`/`Cacc`,** not only the ped `iW`. *This single class fix kills all four marks and the ~49 repo-wide §6.3 residuals.*

2. **Bucket B/C corner re-keying (~65) → the stamping loop `tileGround.js:2004-2008`.** Make the apex→corner assignment **injective**: have each tile-ring sharp corner claim its *own* nearest achieved fillet (corner-driven), or key the fillet off the block-ring corner identity rather than a nearest tile-ring node — so junction-window fillets stop overwriting genuine corner fillets (93 collisions) and stop orphaning genuine corners (65). *Where, not how.* Medium leverage; improves handle fidelity on every divided-avenue/junction block.

3. **Bucket A sliver collapse (12, tiles #19/#88/#89/#97) → the `>0.5 m²` drop `tileGround.js:1994`.** **Likely accept** ([[feedback_accept_the_long_tail]] = triage, not abandon): these are 17–1158 m² slivers/median interiors with no real block to author. Revisit only if the operator's eye flags one.

---

## Evidence index
- Harness (verified counts): `scratch/cornerfillet-coverage.mjs` → 101 tiles / 985 vtx / 602 "corner"(blind) / 466 fillets.
- Convexity correction + per-tile deficit: `scratch/caliper-corners.mjs` → 544 convex / gap 78.
- Authoritative stamping tap: `scratch/tg-instr.mjs` (copy of `tileGround.js`, diagnostic at the `:2004` loop) + `scratch/caliper-instr.mjs` → fSink 560 / collisions 93 / unmapped 77 / whole-collapse 4.
- Mark proxies: `scratch/caliper-marks.mjs` (+`-zoom`) → `scratch/caliper-mark{0..3}.png`, `caliper-markZ{0..3}.png`; self-int detector flags the rings.
- Code: `tileGround.js` `filletRing:114-186`, `sharpCornerIndices:201-218`, `MIN_CORNER_LEG:97`/`FILLET_TURN_TOL:84`, blockRings `:1994`, fillet stamp loop `:2004-2008`, band offsets `:653`/`:2043`, asphalt `:2042/:2075`, capacity guard `:2024-2041`, corner-pad disk `:746-760`. `CornerEditHandles.jsx:234,269-277`. `BlockGeometryV2Debug.jsx:273,684,704`.
- Canon: `RIBBONS.md §6.3` (49 SELFINT residuals), `HANDOFF-band-fold-fix.md` (Option A, Roots A+B), `scratch/SECTION-FORENSIC.md` (corner disk primitive).
