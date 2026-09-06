# Stage-doc openings, excised 2026-09-06 — the narrative scrub

**Why these were cut.** Eight docs described the same progression, and each opened by
re-explaining what its stage *is*. That re-explanation is where they contradicted each other;
the deep detail below it mostly did not. Jacob, 2026-09-06: *"We have a huge corpus of docs, and
I think that's the problem. The agents self-confuse."* The single narrative is now
`cartograph/PIPELINE.md`; each doc below keeps detail only.

⛔ **Archived, not deleted — and not superseded wholesale.** Anything here that is a RULING rather
than a description was carried into `PIPELINE.md`. If you find something here that is live and is
*not* in the spine, that is a bug in the scrub: put it in the spine.

---

## from `SKELETON.md` — lines 11–19 as of 2026-09-06

## 0. Why the skeleton is "the most important document"

Jacob's words: *"Skeleton is **THE most important document** in the cartograph."* Meant literally — the skeleton is the keystone **file** (`skeleton.json`) *and* the special sauce / IP. Two load-bearing facts follow:

- **It is a black box for the user.** Survey originally existed as *user controls for the skeleton*, but those controls were too complex and not very helpful. We've changed methods elsewhere in the product, but the **Skeleton remains the Skeleton**: the operator does not edit the skeleton's graph; they *fortify* on top of it (widths, caps, corner radius — the Survey/Measure overlay). **If the skeleton is right, Survey shrinks to thin fortification.** *("The Skeleton is The First Bake."* — `[[project_skeleton_is_the_first_bake]]`.)
- **It is the wall's anchor.** By the time the operator leaves Survey we should be holding an *extremely-simplified, polygon-ready frozen dataset*, and chains should be **dead** (`PIPELINE.md §5 (the Wall)`). The closer `skeleton.json` is to polygon-ready at birth, the earlier the Data Wall sits — that gap is the app's standing architectural debt.

---

---

## from `PREBAKE.md` — lines 9–19 as of 2026-09-06

## 0. What prebake is

Prebake takes the frozen `skeleton.json` (+ raw OSM + operator overlay) and compiles it into **`ribbons.json`** — the single geometry document the Survey tool authors against and the live 2D view renders from. *"The First Bake."*

Two facts, both load-bearing for the program:

- **Today it is a thin, two-source compile.** It freezes street **chains** (from the skeleton) *and* parcel **faces** (polygonized from **raw OSM**, used only for land-use color) into one file. The real block-shape polygon is **not** produced here — Survey re-derives it from the chains on every build (§4).
- **This is where the Data Wall belongs — for correctness *and* perf.** "Polygon-first" means the chain→polygon conversion happens **once, in prebake**, and the polygon substrate is **frozen** here. Correctness: Survey receives polygons, so the false corner can't be re-born (`SURVEY.md §5.1`). Perf: Survey stops re-deriving the whole map every edit, so live authoring can recompute **only the activated blocks** (`SURVEY.md §4.1`). Elevating prebake from *compile* to *polygon-ization* **is** the wall-move.

---

---

## from `SURVEY.md` — lines 9–19 as of 2026-09-06

## 0. What Survey is

Survey takes the Skeleton's lab-clean centerlines + IX nodes and turns them into the **polygon world**: it forms **Tiles**, strokes the chains **outward** into a hardscape silhouette to make **Blocks**, authors the **corner shapes**, and **freezes** all of it. Two load-bearing facts:

- **SHAPE only — there is no notion of pedestrian depth in Survey.** Treelawn/sidewalk widths, ADA pads — that is **Section** (FILL). Survey authors the asphalt/curb silhouette and the corner geometry; Section strokes *inward* off the frozen curb. (`ARCHITECTURE §2.1`.)
- **The Skeleton is a black box; Survey fortifies on top of it.** The operator does not edit the centerline graph — they author a thin overlay of widths/caps/corner-radius keyed to the Skeleton's identities. **If the Skeleton is right, Survey shrinks to thin fortification** (`SKELETON.md §0`).

It is the middle of the three tools — **Survey · Section · Stage** — and it raises **wall #1** (chains die here; `[[project_two_bakes_two_walls]]`).

---

---

## from `SECTION.md` — lines 9–21 as of 2026-09-06

## 0. What Section is

Section takes Survey's **frozen hardscape silhouette** — the curb edge (`iA`) and its corner shape — and authors the **pedestrian profile** on top of it: the strips between the curb and the property line, the way the ribbon bends around a corner, the ADA ramp pad, the treelawn wrap on a round dead-end. Four load-bearing facts:

- **Section = FILL; Survey = SHAPE.** Survey owns the asphalt/curb silhouette + the corner *radius*; Section owns the treelawn/sidewalk depths, the corner *fills*, the ADA pads, the cap wraps, and the strip materials. (`ARCHITECTURE §2.1`, `SURVEY §0`.)
- **It strokes INWARD off a FROZEN edge.** Survey strokes the chains *outward* into the curb line and freezes it; Section offsets *inward* from that frozen `iA`. It never touches a chain — **that is the whole point of the Wall** (`PIPELINE.md` §5 (the Wall)).
- **⭐ Always populate best-effort, then override.** Every edge gets a sane default with *no operator action* (§3.1); authoring is purely *override* on top — toggle a treelawn, tune a depth, ctrl-click-swap a strip (§3.2). The operator never starts from blank; they correct.
- **∴ FILL authoring is live and cheap.** Because the heavy thing (the silhouette) is frozen, an override only re-strokes the interior — it must **not** recompute the outline. *"Section strokes a frozen edge, so ped-width drags are live and cheap"* (`HANDOFF-tile-T3-authoring.md §18`). This responsiveness is the **reason** the silhouette is frozen (§4).

It is the third of the three tools — **Survey · Section · Stage** — and the **first pure consumer**: past the Wall, it reads the frozen shape and never derives geometry from chains.

---

---

## from `POLYGON-FIRST.md` — lines 9–23 as of 2026-09-06

## 0. Why this doc exists (the reckoning, 2026-06-09)

The program built walls, sequenced bakes, and a whole vocabulary around freezing chaotic OSM chains *once* into rigid polygons that every downstream consumer trusts. It mostly worked. But the **street curb** — the most visible polygon on the map — was never actually frozen from the frame. *(2026-07 status update: two of the specifics below have since moved — see the ⤷ notes — but the core defect stands: the curb is minted by the live producer, not built once from the frozen frame.)* It is still **re-stroked live by `buildTileGround`** and snapshotted, so it is a photograph of a chain-stroke, not a function of the frozen frame.
> ⤷ **The construction changed (D6a landed):** `iA` is no longer the `tile.ring − aFill` union-carve — it is the **per-edge parallel offset** (`offsetRingVariable`, `chain ⊕ pavementHW`, `src/lib/tileGround.js:2728/2810`; the carve survives only as a degenerate fallback `legacyBlock`). So the "d"-bulge-from-the-carve framing is superseded (the divided-"d" instance was separately cured at the frame, `fd38c70`).
> ⤷ **The consumer/idle side froze (2026-07-15):** Survey/Design no longer "re-derives every frame" — it now **consumes the frozen `shape.json` via `sectionOpen`** for idle display; only the **element under the operator's hand** re-strokes live (`BlockGeometryV2Debug.jsx`, the load-forensic work). What remains RED is the **producer** minting the freeze from chains at bake/edit — Check C below.

**How it slipped through, precisely:**
1. **The curb geometry was *deliberately excluded* from the freeze**, on a wrong premise. The polygon-ization was cut into three layers (`PREBAKE-POLYGONIZATION-PLAN.md §1`): **L1** topology (= D2, done — `derive.js:3922`), **L2** corner identity (= D3, parked), and **L3 the stroked curb line** — *"NOT L3 … asphalt offsets + fillets stay in Survey's live reshape."* The premise was that the live reshape is a benign "offset by width, round by radius." It isn't — it's the `tile.ring − asphalt-union` carve, where the junction strokes leak the chains back in. **The freeze stopped one layer short of the layer that leaks.**
2. **The Section wall *masked* it.** A curb *was* frozen — the bake's `_shapeArtifact` carries `iA` per tile (`SURVEY.md:63`), and `sectionOpen` reads it chain-free (`PIPELINE.md` §5 (the Wall)). But that frozen curb is a **downstream snapshot of the live re-stroke** (same engine, baked later — bulge and all), and **Survey never consumes it.** "We have a frozen curb behind the wall" was true and false at once, and nothing made the contradiction visible.
3. **The doctrine was *described*, not *enforced*.** The one place it's structurally guaranteed is `sectionPass`/`sectionOpen` — they have **no chain in lexical scope**, so Section physically *cannot* re-derive (`tileGround.js:581`, `:825`). Everywhere else "chains die" was a principle you had to remember. The producer never had to. **Names that don't reduce to a test are how "done" got claimed over an unfrozen curb.**

We are not at zero. The gap is named, the mechanism is understood, and below it becomes a check.

---

---
