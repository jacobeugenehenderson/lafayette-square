# BRIEF — the coastal hood: shoreline, water, and the outer zone

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20
evict-when: git grep -q 'WATER_EDGE_SKEL' -- src/lib/tileGround.js && node -e "const m=require('./cartograph/data/huron/clean/map.json');process.exit((m.layers.water||[]).length?0:1)" || echo LANDED
-->

> ⭐ **DONE MEANS:** Jacob's eye confirms, on huron, that (a) the lake draws as a filled positive
> object, (b) the land between the last street and the shore draws as land, and (c) the waterfront
> streets are painted as STREETS — pavement, curb, sidewalk — not left as bare centerlines.
> ⛔ (c) is the one that is NOT verified. (a) and (b) were confirmed on screen 2026-09-20.
> ⛔ **This brief is NOT done when the geometry is right.** It was right, on screen, while the
> streets were still unpainted — which is exactly how this arc has failed four times.

**Written 2026-09-20 by Strand, as a handover.** Written *because* the author's context stopped
being trustworthy: six errors in one session, all the same shape — read one site, form a model,
report it as established. Everything below that is a CLAIM is marked as one. Everything marked
MEASURED has a command or a number you can re-derive.

⛔ **Do not trust this document over the code.** It is a map of where to look, not a source.

---

## ⛔⛔ 0 · THE READ-IN. Do this BEFORE you open a single source file.

The author skipped it for an entire session and it cost a day. The gate is `CLAUDE.md` §"Before you
diagnose" and it is not decorative: **the single most expensive error of the session — treating the
shoreline like the disc — is answered head-on in `ORIENTATION.md`, which was never opened.**

1. **`ORIENTATION.md`, end to end.** The universal first read. In particular the compound-shape
   doctrine: *the rim is an EDGE OF THE DRAWING, never an absence.* A shoreline is the same kind of
   thing. If you take one idea from it, take that one.
2. **`README.md §⭐ START HERE`** + its cross-cutting feature index.
3. **`cartograph/RIBBONS.md §1` — ALL OF IT, to the end of the section.**
   ⛔⛔ **THE TRAP, AND IT IS THE ONE THAT COST THE DAY:** the author read to **line 1055** and
   stopped. The correction that invalidates the preceding text begins at **1059**:
   > *"THIS SECTION USED TO SAY the mint 'unites the whole grid and then INTERSECTS' and that a rim
   > edge 'comes out owned' by `__boundary__`. Both are ROT"* — and **0 of LS's 275 block faces
   > carry a single `__boundary__` label.**
   ⭐ Read to **~line 1100**, past the stamp-last ruling AND past the 2026-09-20 addition
   ("AND THAT RULE IS ABOUT **THE CIRCLE**, NOT ABOUT CLOSING A FACE"), which exists *because* of
   this session's failure.
4. **`cartograph/PIPELINE.md §5` (the Wall)** — lines vs shapes, and *"who writes the frozen file:
   THE BROWSER DOES."* That last part matters: `shape.json` answers "what did Survey last draw",
   never "what does the construction do now." **Check the mtime before trusting the file.**
5. **`EXTENT-DESIGN.md §3.3`** — the size/centroid model. **R15, the living boundary: the radius is
   live-editable with NO re-pour.** This is the constraint that killed the first attempt.
6. **`ROADMAP` H-2 · H-4** — the tickets. H-2 is three independent gaps, not one: ① acquire the
   water (done), ② the picker offers it (not started), ③ the map draws it (this brief).

⭐ **And read `mintProtopolygon`'s header in `src/lib/tileGround.js` AFTER RIBBONS §1, not before.**
It carried ROT for two weeks; it was excised 2026-09-20 (`515ef78b`,
`_archive/PROTO-rim-owned-ROT-2026-09-20.md`). The header is now correct, but the habit of reading
it as gospel is what went wrong.

---

## 1 · THE RULINGS, in Jacob's words

- *"Water doesn't matter; it's the shoreline."* We are not drawing water for its own sake. **The land
  has to stop.**
- *"The shoreline is cut and made into a closed polygon by the final radial stamp, it doesn't
  replace it."* ⛔ **The radius is SSoT and sacrosanct. The circle stamps LAST.**
- *"The water should go to the edge of the bb just like the roads and everything else."*
- *"It is both; we see the difference between land and water, and the geometry creates the water
  field and on the other side (land-ward side) closes the rest of the LU polygons, especially the
  dead-ends."*
- *"The water is a positive object which will require shading and not just the empty half of the
  composition. We have 360 degrees of circle filled with map."*
- *"In a map, why would the area between a street and a coastline… not exist? Yes it's a face, yes,
  it's LU."*
- *"Each of the blue centerlines is forbidden from being a chain, and instead is ringed polygon. At
  the bb, that uninterrupted polygon hits the bb and merges there… it encounters the shore side of
  the split shoreline chain and joins there too… thus creating one large continuous zone with the
  streets, grout, dead ends, cul de sacs, etc etc etc already there."*
- On the doc rule being under-specified rather than wrong: *"I think 'the rule' is not helping.
  Perhaps we elaborate the rule?"*

---

## 2 · WHAT IS BUILT (committed, in order)

| commit | what |
|---|---|
| `e02fafe4` | **fetch.js acquires OSM relations.** Lake Erie is relation 4039900; its member ways carry NO tags, so no tag query could ever reach them. Members scoped to the envelope (`way(r.rels)(bbox)`) — unscoped pulls 94,124 nodes for one town. |
| `f7c394db` | **`unreadableFace()`** — a compound or clipped feature does not vote and is reported (`osm-vocabulary.mjs`). |
| `515ef78b` | **The doc fix.** `RIBBONS §1` now distinguishes the circle from ground truth; the ROT excised from the mint header. |
| `00c6bfe2` | **`coastline.mjs` + `bb − (water ∪ ink)`** in one boolean. |
| `a709a858` · `20f3d203` | **The water draws**, in every view including Survey. |
| `404b44fb` | **The outer zone is an ordinary compound block**, not a class of its own. |

### MEASURED (re-derivable, not quoted from memory)
- Huron disc 39.34 km² = **20.22 blocks+ink + 13.96 water + 5.17 outer zone.**
- Water clipped to the disc = **13.96 km²**, agreeing with an independent ray-parity probe
  (`scratch/water-disc-coverage.mjs`) that shares no code with the carve.
- LS: **275 → 276** blocks. Huron: **204 → 205**.
- **0 of 204 Huron block faces carry a `__water__` edge** ⇒ no editable surface abuts the coast, so
  no authoring slot can key to it. The coast is inert past the Wall **by construction**.
- A degree-1 spur strokes to **one closed 50-point ring of 5.68 m²** — a spike is a POLYGON in this
  step. ⛔ The "zero-width slit" model (`PREBAKE §4.0`) is the superseded graph-face construction;
  the author cited it three times and was wrong each time.

---

## 3 · ⛔ THE FIVE CONSTRUCTIONS THAT FAILED, AND WHY

Do not re-derive these. Each cost hours.

1. **Water as a replacement boundary.** Carved the disc up front, wrote the result into
   `neighborhood_boundary.json`, made the renderer prefer it. **Inverted the SSoT** — a radius edit
   could no longer reshape the drawing (R15). Also minted **19 spurious perimeter blocks**, the
   "weird odd shapes" `RIBBONS §1` rejects. Reverted: `dcfe9d18`, `9bbc3bc7`.
2. **Coast stroked as a chain.** ⛔ **The chain stroke is only safe for OPEN polylines.** Measured on
   closed input: square (5 pts) → **1 ring, the FILLED square**; circle (200 pts) → a correct
   annulus; Lake Erie (1,899 pts) → **3 fragments**. The band never sealed.
3. **Water as a closed subject in the ink.** Lake becomes ink correctly (+40.11 km²) but does **not
   partition the land** — the coastal strip stays connected laterally around the street mesh.
4. **Two-stage land frame (`rect − water`, result fed back as subject).** Clipper returns the chop as
   a **FLAT LIST** — 4-point outer + the coast as a hole — and re-entering those as subject paths
   **loses the hole's orientation**, so the frame silently refilled to the plain rectangle. Every
   measurement taken against it was measuring an un-chopped rect. ⭐ One boolean cannot lose a hole.
5. **A separate `remainder` class.** Correct instinct, wrong shape: it is just a block. Deleted in
   `404b44fb`.

⭐ **The through-line:** the coast only divides a region it CROSSES, and the ink frame (~20 km, bloated
by highway tails Overpass returns whole) is not the bb (a clean 9.9 km square). Close against the bb.

---

## 4 · THE OPEN QUESTION — and it is an EYE-GATE, not a measurement

**Do the fringe streets now paint?** Jacob's screenshot showed the waterfront streets as bare blue
centerlines with no pavement, while blocks inland had full asphalt/curb/sidewalk.

⛔ **The artifact cannot answer this.** `map.json`'s `block`/`lot`/`sidewalk` come from the
`derive.js` face walk (`polygonize` → `classify` → `blockFaces`, ~12 call sites), **not from ①**.
① reaches the screen through the browser's Survey/V2 path and `shape.json`. Huron is re-poured with
`404b44fb`; **look at it.** If the blue centerlines by the shore still have no pavement, the outer-zone
change did not do it — that is a live possibility, not a formality.

**The theory it rests on (CLAIM, structurally verified, not observed):** ② offsets a block inward
from all its edges including holes, so the zone's street-holes should paint. It cannot produce the
frame-sized curb ring that once turned Survey solid blue, because `freezeCurbEdgeFacts` builds facts
only from `runs`, runs come from the chain world via `streetIdx`, and a `__boundary__`/`__water__`
edge has no run ⇒ no fact ⇒ `depthAt` returns **0**.

---

## 5 · THE THREE BLOCK PRODUCERS — know which you are looking at

| | status |
|---|---|
| `derive.js` face walk — `polygonize`→`classify`→`blockFaces` | **LIVE.** Produces most of `map.json`. Superseded by ruling (2026-08-12) but load-bearing. ⛔ Replacing it is the standing program (`PIPELINE §5`), **not** a cleanup. |
| ① punch-out — `mintProtopolygon` | **LIVE**, and the ruled substrate. Reaches screen via `shape.json`. |
| `src/lib/substrateWalk.js` | ⛔ **DEAD.** 525 lines, one importer (`tileGround.js:46`), gated on `opts.substrateTiles ?? SUBSTRATE_TILES==='1'` — **nothing passes either.** `PREBAKE.md:75` and `ROADMAP A17` both say so. Its stale fixture `src/data/ribbons.json.pre-promote-2026-08-21` (2.6 MB) is read by nothing. **Excision candidate — take `A17`'s citing line with it.** |

---

## 6 · CAUTIONS

- ⛔ **Never `git commit -a`.** Multiple sessions share this tree. Commit by explicit path.
- `b44daa6c` renamed 30 scene→map identifiers across 51 files. `derive.js` is in that set.
- ⛔ **A timeout in `checks/run.mjs` is UNMEASURED, not a state.** Do not diff two suite runs through
  the timeout bucket.
- `public/looks/index.json` and `checks/README.md` were dirty from other sessions, not this work.
- ⭐ **Check that a pour EXITED, not just that the file has fields.** A crashed pour leaves the
  previous `map.json` in place and it reads as "the change did nothing." That happened four times.

---

## 7 · OWED

- The eye-gate above.
- **Shading.** The water is a flat fill; Jacob asked for a positive object that "will require
  shading." Geometry first, material after he confirms the shape.
- **Colour** for unparcelled land — tabled by Jacob, deliberately unresolved.
- `MapLayers.jsx:616` still skips ALL OSM `natural=water` on every scene, to avoid double-drawing
  LS's grotto, which is served by a hardcoded `src/data/lafayette-square/park_water.json`. ⇒ **No
  town but LS can draw OSM water.** Separate from this arc's water (which comes from the coast chop)
  and worth its own ticket.
