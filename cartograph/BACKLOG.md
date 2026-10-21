# Cartograph Backlog

> **STATE + forward-work only** (`docs/agents/BOZ.md` doc architecture). No diary (→ `NOTES.md` + git), no how-it-works (→ Reference: `SKELETON` / `PREBAKE` / `SURVEY` / `SECTION` / `RIBBONS` / `ARCHITECTURE` / `PIPELINE` / `STAGE` / `PREVIEW` / `BAKE`). **When an arc lands it LEAVES here:** *fact* → Reference, *why* → `ARCHITECTURE` Decisions, *narrative* → `NOTES`, *dispatch brief* → `_archive/handoffs/` (dated). Landed work is NOT logged here.

Active trunk `curb-offset-draw` (→ staging via `staging.yml`; the old `cartograph-looks-pass-ab` trunk was retired 2026-07-08, `26a62407`). **Production is NOT pre-slab:** `origin/main` = `7b2ae01e` (2026-06-30) already ships the LS slab, the full looks pass, the 7-slot TOD day-cycle, and the Publish ceremony. It is a **clean fast-forward with no divergence** — **hundreds of commits behind head and widening** — the trunk has not shipped since June 30 (`git rev-list --count origin/main..HEAD` is the live number; it was 59 on 2026-07-05 and 559 on 2026-08-04). ⛔ Don't re-record the count here — it is stale the day after it's written. The remaining marriage-leap is **incremental** — which commits to push — not "wait for the whole platform." ⚠️ *A stale local `main` fossil sits at April 27 — `git fetch` before trusting it.*

---

## ▶ Forward list (2026-10-20 night) — LS · HPDM · PTown · Huron first

> Jacob, 2026-10-20: *"LS, HPDM, PTown, and Huron are absolutely more presently important, and getting the Ward in solid
> shape."* JH waits until its extent is set up. The goal for the ground is `project_what_improving_the_ground_means`
> (no splinters or holes · correctly drawn fields · continuous walks, lawns and curbs with correct ramps · markings ·
> the revetment · no splitting over terrain · a smaller ground). ⛔ **Bake, then look.** A full check board never gates a
> bake; a check pins down what was seen. The rulings behind these items are in `cartograph/STYLE-GUIDE.md`.

**⛔ FOR JACOB FIRST (Ward's find, 2026-10-21 ~00:50): HPDM PRODUCTION SERVES ST. LOUIS CITY ASSESSOR FIELDS.**
`https://hipointedemun.online/baked/hipointedemun/content/roster.json` (200, 1.66 MB) carries appraised_value, year_built,
building_sqft, units and zoning on all 1,446 records. The City's GIS terms forbid redistribution without written permission
(`scratch/data-licences/REGISTER.md` row 4, gap #1); none is on record. The kit's own check names these fields as
withheld (`claims-intake-is-lossless`, DROPS `served-parcel-privacy`), but the bake never implemented it. Tonight: the
withholding goes into `bake-content.js` (Truss, with LS's first roster); nothing on production is touched. Your calls:
(1) take `content/roster.json` off production now? **Ward recommends AGAINST:** with no roster the Ward's Society falls back to
listings only and prints "hasn't published its buildings yet", so HPDM's register drops from 1,446 buildings to 147
listed places on the partner's domain before the meeting; the exposure has been live since 07-07. Fast-track the
withheld roster instead. Taking it down stays a legitimate choice if you weigh the terms more heavily. (2) the
re-bake + Publish + Promote (Boz + Ward), on the Thursday path.
⚠️ A SECOND EXPOSURE, source ESTABLISHED (Zob): `src/data/buildings.json` (LS's curated file, bundled into the old LS player
on lafayette-square.com) carries year_built 1,013 · building_sqft 1,036 · **assessed_value 1,009** of 1,082 buildings,
from the City Assessor (`scripts/11-merge-all.py#enrich_buildings` ← `scripts/03-fetch-stl-parcels.py`, since ce97343d).
`assessed_value` has no reader outside src/data (dead weight). year_built is read by PlaceCard etc. bake-content's
withholding doesn't reach this file. Your call: strip the withheld fields from it (and which, since year_built is shown).
⚠️ AND A RULING (Zob): roster records still serve `prominence.signals`, per-building PERCENTILES of appraised_value /
building_sqft / units. Interim tonight (Boz, reversible, no visible change): strip those per-field signals; the score
and rank stay; they still embed the withheld fields in aggregate, in roster.json and in every served listing's
`prominence_rank` (Zob: nothing downstream reads `signals`, so the strip breaks nothing). Yours: (a) drop withheld fields
from prominence upstream (ranks move) or (c) rule a percentile isn't redistribution.
**Ward's two approvals for you (each ~2 min, in Ward's specialist's window):** (1) fast-forward theward `ward/no-district`
(047b391: the card's district row removed + `checks/the-ward-never-says-district.mjs`) onto main, then Ward publishes it
to staging. The specialist's session refused the commit to main (a permission prompt), and nobody bypassed it. (2) the
:5173 okay for the rose/Tower-Light branch. Staging still serves 883b03f, WITH the district line.
✅ RULED (Jacob, 2026-10-21 ~01:30): "Buildings can be listed as historic; and perhaps we can do historic neighborhoods but
we are not orchestrated around that." Historic status is a BUILDING's property. Town membership is Jacob's authoring
(Extent), never a district. The district concept was agent-introduced (162a084b, 266d3505) and never ruled. ⇒ the card's
"Historic district" line comes off (Ward); a building may show its own listing. The district-naming work below is
superseded: Truss's interim (1cfc3f47) and Plumb's LS declaration (9477fdd8) stay unmerged; the code-carry fix is moot.
⚠️ HISTORIC DISTRICT NAMES ARE MIS-ASSIGNED, a kit class, LIVE ON HPDM (Zob, measured): fetch-parcels reduces the City's
district CODES to booleans, so with one declared district every flagged parcel takes its name. HPDM: 81 buildings
(Wydown, Woodbourne, Buena Vista, Fauquier, Skinker …, no declared street, no NR match) are named "Hi-Pointe–DeMun
Historic District", likely other districts. LS's declaration (Plumb, 9477fdd8, correct in itself) is HELD: it would
name ≤ 80 at-risk LS buildings the same way. The fix: carry the code (fetch-parcels → sources.js codes → districtOf by
code; a foreign code gets no name) + a City parcels re-fetch for LS and HPDM + the City's code→name table (source not
established). Your call for Thursday: (i) leave HPDM's 81 as served, (ii) interim: a flag with no code match names no
district (HPDM's 81 lose the wrong name; LS stays unnamed), or (iii) the full fix first.
**Ward recommends (ii) for Thursday, then (iii):** the Ward shows only the district NAME (Facts.jsx), so the 81 cards just
lose a line and say nothing false. The partner knows their district's boundary; a Wydown house labelled HPDM's district is
what they'd spot first. I agree. (ii) is PREPARED: Truss, `1cfc3f47` on `truss/district-flag-interim`, unmerged (HPDM dry run: named 598 → 517, the 81
unnamed, in-district unchanged; check `claims-a-flag-names-no-district`, safe tier). Zob reviews; it merges on your yes.
The National Register as a replacement source (Zob, measured): HPDM's nr-inventory keeps a "Built" year on 253 of 1,446
after the withholding (OCR'd, accuracy not measured). LS's "NPS" data is mostly INFERRED from the assessor year
(nps_style_inferred on 741; 32 buildings actually named with pages); the nomination spreadsheets give ≤ 80 plausible
years (18 explicitly parsed), and no code reads them. Withholding LS's assessor years also removes the basis of those
741 inferred style labels. Terms of an NR nomination are not established: no registry entry; LS's nomination PDF is
committed (`assets/lafayette-square-hd.pdf`) with no licence-register row. Next: Zob's LS Inputs gap census → the
LS reapplication plan (Jacob: "reapply all we can to LS"; data packs differ per town; the Inputs tab shows them).

**⭐ RULED (Jacob, 2026-10-21 morning): "HPDM assessor fields is 0% priority. The app has to look good and 'work'. I doubt
anybody will even click on cards. The map needs to DRAW and play."** ⇒ the roster/assessor items below are parked; first
Thursday job: Ward checks production HPDM + LS as a visitor (draw, play, load); that decides whether a new bake is needed.

**🌅 MORNING 2026-10-21: the ground for Thursday, and your calls (Boz).** Nothing pushed, published or baked into `public/`.
- **HPDM, unowned ped vertices (#40): 269 → 38 on integration** (measured on producer dumps, Mitre; B1 merged 9ca3f6cf). Merged overnight:
  fix B (a perpendicular leg's region is its painted faces) · the deformer's both-sides read plus its narrow station
  trigger (Kerf) · the verge span depth (Truss). Left: 52 "beyond" on tiles 134/55 and tile 32's 67 cm² fix-B hole. Both
  trace to ONE question: the deformer reads pre-flatten paint (`byMaterial`, your 10-11 ruling, 6be9cbaf), not the
  drawn plane. A drawn-geometry form that keeps your ruling's ownership is specified and waits on one probe (Mitre; Zob
  reviewed). PROBE RESULT (Mitre, HPDM): census 91 → 89, but 692 held owners move and held heights shift up to 0.75 m;
  tile 32 closes; class 3 doesn't move (53 → 53). NOT YET ATTRIBUTABLE (Zob): 57 of the input's 177 slits are its own
  un-noded overlay edges. RERUN noded (Zob): census 90; owners still move. The top Δh are where TODAY's paint and the
  plane disagree: an even-odd walk with winding 0, a 1 cm lawn sliver, and curb ground held by a LOWER face in the plane
  (a possible plane defect). TRACED (Zob): no plane defect (a sub-unit rounding at an edge, and a sampling artefact in his
  instrument). PARKED: today's input is the 10-11 ruling as built; the gain is one census point. Open, cause not established:
  (a) the input's ray skips a walk its own plane holds; (b) a treelawn edge moves 216 mm into face:institutional near
  (−91.6, −654.6), the ease split suspected. Class 3 is B1's source fix (PLACED,
  Mitre: bake-ground's `clipAllToStencil` re-clips the already-stamped ① paint to the exact chord, a second cut; candidate
  skips it on the recorded stamp, overlays keep their one cut). ⭐ BUILT and MEASURED (Mitre, mitre/b1-rim-vertices, HPDM
  A/B): class 3 53 → 0; census 91 → 38, 0 newly unowned; tile 55's gate point reads walk; fade and ink identical. STOPPED:
  tile 44's 67.65 mm is a self-crossing painter ring (lawn #443) that the old second clip had repaired (17 such; 241 more
  self-cross today). The painter's exit is already a Clipper union, and a Clipper re-union can't reach 0 (StrictlySimple:
  258 → 32). RULED: cut-once lands with the 17 newly exposed rings named (attribution proven town-wide first) and a loud
  census of self-crossing band rings. Both done (Mitre): 18 rings named; the 1–10 cm tail 822 → 3, all rim-side; census
  `bandSelfCrossings` 257. ✅ MERGED 9ca3f6cf (Zob: merge). no-edge-is-drawn-twice is RED at integration too (pre-existing).
  Interior near-miss changes > 5 m from the rim are named in the merge, cause not established. The self-crossing source (257 rings) is its own piece (Mitre, after Thursday).
  (Mitre, next), then tile 32's slit at its source (PLACED, PARKED: offsetRingByRects' slanted join at a perpendicular
  tangent vs walkCut's float edge, two copies of one line; the fix is walkCut from the band's own join edge via edgeLabels;
  being checked as the same class as tile 170's 12). Truss's plane noding: its curb pinch refusal is FIXED
  (b0d8c9bb: a hole that touches its one outer stays its own). Rebased on B1 (tip 106094ad), with one new refusal fixed
  (an item wholly below the lattice: its holes go with it, the flatten's orphan rule, counted). Gate: LS ✅ · HPDM ✅ · Huron
  after PTown. Waits on the combined LS bake to land.
- **LS #39 (kerb step):** 22.1 m bare on the real baseline (Truss). On the whole stack (Truss's noding + Plumb's crease
  split, polyline mitre and ownership finder, refinement off): **1.03 m**, all sub-cm. The Mississippi stripe straddle was a DEFECT (a
  verge span edge given depth 0), fixed and merged; your "confine the stripe" call is moot. Plumb's branch isn't
  landable yet: checks being ported, and 43 m of LS rim-side stretches are the rim brief's B1 residue (the paint's rim edge and
  the rim ring rounded twice, 1–1.35 mm apart). RULED: no tolerance in the rim read; the fix is at the source (B1, Mitre).
- **PTown census** running on b8e7b868 (Kerf). **Huron census done** (older code): only #40, 96% on tile 6; 2.7 h of
  ground baking.
- ❓ **Your calls, each with its numbers in the lines below:**
  (1) LS's 1.03 m sub-cm M2: a ridge rule, ON_EDGE_M derived, or a listed allowance at flushTol.
  (2) The narrow-block ridge, with five finger tips to eye.
  (3) Should the rim stand instead of taper?
  (4) The mitred taper at a bend, for your eye.
  (5) r-highway-verge: 77 of 115 verges are verge only through a surface-bridge "span". Verge or block/JR? And who is
      "highway" (three readings)?
  (6) A hairline median (0.24–0.31 m, I-64 at Oakland): draw it as verge?
  (7) HPDM's "no street reaches" points: 29 of the 38 (Mitre, all traced: tile 170 ×16, 152 ×5, 211 ×5, 215 ×3; lawn
      ground with lot between it and every street's band). What height do they take? This ruling gates HPDM's bake. The
      other 9 (Mitre, placed): rim back-corner 6 (tiles 24, 89, 177, 198, 200, 202; next) · painter wedge/slit 2 (tiles
      8, 93; tile 32's family) · back-edge rounding 1 (tile 159).
  (8) None needed now: the deformer reading the drawn plane was measured and PARKED (one census point; your 10-11 read stands).
- **REFUSAL CENSUS (Kerf; record-and-continue in a sandbox; files `.claude/worktrees/kerf/scratch/ground-budget/step7/census/`):**
  · ⭐ **HPDM TRUE LIST** (integration 1e6958f2 + the noded rim; ground only, 16 min): ONE refusal, **269 unowned ped vertices
    at EXACT positions**, the full list in `.claude/worktrees/kerf/scratch/ground-budget/step7/census-truelist/hipointedemun/
    ground.unowned.json`; top tiles 67 · 134 · 189 · 170 · 183 · 55. No flatten, deformer, rim or kerb refusal. Zob's classes
    (none in a leg region): **(1+2) 183 points, a non-band 'lot' strip interrupts the band** between the nearest station and the
    point (arc 117, run 66); next: identify the strip; if it's authored land use, the deformer's ray rule is a RULING for Jacob
    · **(3) 59 rays from beyond the rim** on tiles 134/55, where the noded rim and the painted band disagree by METRES on 29
    (Mitre next) · **(4) 27 lot-first** at tile 189: the painted curb's road edge cm inside ② (Mitre next).
    Fix B BUILT (Mitre, mitre/leg-faces 2213998d): tiles 67/74/211/47 → 69 of 74 owned, each by its leg; paint byte-identical;
    MERGED fc264a14 (Zob: merge); the town count waits on the slot after Huron. Jacob's 'no street reaches' ruling is
    sized at ~6 points (Zob's tile-170 re-cut: tile 170 ×2, 215 ×3, 93 ×1); points fix B doesn't own may rejoin it. Open, cause not established: tile 211's 5 (a lawn piece in
    leg r6's cell rect) · tile 47's 6 painted-walk points in no band piece.
    BOTH-SIDES READ MERGED d08e14b5 (Kerf; Zob measured in memory): HPDM unowned 269 → 183 (86 by both sides; 6 seam
    splits take the leg-crossing mean, listed). Follow-ups merged 89bed22f: splits are 3, ≤ 0.0085 mm (the 2.2 cm was double
    counting). ⭐ HPDM unowned at integration e1c6861d: 97 (Zob, in memory; fix B and the merges since own 86 more). The
    station trigger, NARROW form (e35c537e): owns exactly the 6 left along a boundary, nothing else (WIDE also takes one
    corner point on tile 159); held points unchanged. MERGED 0942a899 with its narrowness row → 85 (in memory). What
    remains (Zob, binned at 91): 57 from BEYOND the rim (tiles 134 ×33, 55 ×19: Mitre's class 3) · ~25 perpendicular-corner
    (tile 170 ×16, 211, 152) · Jacob's 4 here of 6 · back-edge rounding 1 (tile 159).
    Tile 170 (Mitre, HEAD ba02b826): fix B owns 10 of 26, including Jacob's pair at (−230.56, −508.73); the 16 left are in
    no perpendicular rect (12 'band but no piece', possibly a stale-dump mismatch; 4 the tile-211 shape). Class 3 needs a fresh
    producer dump: Mitre's slot run, right after Huron. ⭐ MEASURED at HEAD ba02b826 (Mitre, fresh producer dump, 3.08 GB):
    HPDM 91 of the census's 269 unowned (faces vs rects: 177 → 91), 0 newly unowned, corner decisions unchanged. Left: 134 ×33,
    55 ×19 (class 3, shape confirmed on fresh paint), 170 ×16 (stale paint ruled out), 152 ×5, 211 ×5, 215 ×3, singles.
    ⛔ A fix-B REGRESSION: a 67 cm² walk strip on tile 32 at (251.0, 1048.4) that the rect held and no face does. Mitre fixes it
    first. Rim row: tile 52 (4 faces reach the rim). PLACED: the face is right; a 1 mm SLIT in the painted lawn (#618)
    makes the ray read lot. 232 such slits in HPDM's bands. ⭐ The deformer's bands are byMaterial (paint BEFORE
    flattenPaintStack); the mesh is drawn from the flattened, noded plane, so the height code reads different paint from
    the drawing (Mitre). Splitting byMaterial's pinches closes tile 32 but moves 14,338 held heights by ≤ 0.23 m: not
    landable. PREMISE (Zob): the switch to pre-flatten paint was deliberate (6be9cbaf, 10-11, Jacob's ruling: an overlay
    must not cut a walk off its street); no dependency forces it. Proposal being MEASURED (Zob, probe): the deformer reads
    (the flattened band ∪ painted ∩ the groups above it) after nodeThePlane, i.e. the ruling's ownership on the drawn geometry.
    Lands with Truss's noding if owners don't move; otherwise it goes to Jacob. CLASS 3 PLACED (Mitre): 53 of the 59 'beyond' are a 0.34–0.82 mm
    wedge between the painter's noded rim and byMaterial's bands (B1's shape again), so the same input question. One probe
    (Mitre runs it on Zob's definition, with the rims from the same plane). 6 others: back-edge ×2 (tiles 24, 89) · long lot
    after the rim ×4 (tiles 177, 198, 200, 202; cause not established).
  · HURON CENSUS DONE (Kerf, on 83652943, before fix B and the both-sides read): every step exits 0; the ONLY refusal is #40,
    19,655 unowned, 96% on tile 6 (18,855). Ground 5,196 s / 11.8 GB + ground-shore 4,591 s / 11.3 GB: 2.7 h of ground baking
    (Jacob: long bakes are not acceptable). Tile 6 re-measured at HEAD by Zob, in memory, at low priority (not Thursday).
    REVISED (Zob, measured): **~81 are a ray running ALONG a partition line** (the 'holes' were the instrument sampling along it;
    no ground is missing). bandsAlong reads one 10 µm side; on the land-use side it reads lot. Fix, being built (Kerf): read
    both sides at ±LATTICE; the band still decides. Of the rest · **~117 at PERPENDICULAR corners** (tiles 67, 74, 211, 47; walk painted past a
    tangent that no leg extension covers): a FIX by SECTION §6.1 (each leg's walk runs straight on; every piece its leg's), not a
    ruling. PLACED (Mitre): sub-mm rounding. The deformer's legs are the offset's FLOAT rects; the painted band is their 1 mm rounding, so a
    vertex on the band's outer edge falls 0.01–0.51 mm outside its leg ring (74 of 74 re-resolved). Fix (B), being built: hand the
    deformer the painted perpendicular FACES, tagged at construction, so both read the same rings (no distance) · **~26 band pieces no street reaches** (tile 170:
    footways, interior lawn; same question as Huron's interior walk: RULING for Jacob, what height they take) · **scrub
    painted over the band** (tile 189: a paint-order question; likely ruling: does OSM natural cover win over a ped band?).
  · **HPDM** (8189c609, 38 min, superseded by the true list above): ONE class left: the unowned-ped refusal (1,234 distinct 1-cm CELLS, both ground passes; ⚠️ the refusal rounds to 1 cm and logs only 15 examples, all of which re-resolve OWNED, so the true remainder is not established until the instrument keys exact positions and writes the full list (Kerf, being fixed); on real band-ring vertices, the rim merge moved 44 → 17 of ~190k (Zob). Mitre's "612 → 599" counted rounded points: retracted; first
    (-705.47,-491.22) tile 183, a cluster at (170.5,1254.9) tile 1). 0 must-stops; every later step clean (buildings 1,446 ·
    roster 1,446 + listings 196, 0 orphans · lamps · scene · trees · ground-ao · manifest: 880 files, 273.5 MB). Peak
    11.5 GB. The two ground passes are ~35 of the 38 minutes, and the second (ground-shore) does nothing for an inland
    town (the median wrote nothing). Not yet including Mitre's rim build (c4064ab5).
  · **PTown** (4713c478, before tonight's fixes): flatten ×13 → rim ×2 (fixed since) → the deformer memo hits V8's Map
    cap (Kerf's bound 2a2579ff, reviewed, merges on the LS identity gate).
  · **LS** (7ec93e8e, 15 min, ONE ground pass now: "SKIPPED (inland: no shore)"): TWO classes, both in ground: #39 the
    kerb STEP with no face and no taper (40 m; 6 group pairs incl. verge|stripe at (138, 423), vacant/underived/commercial/
    sidewalk|asphalt; Zob placed it: kerbLift.mjs#riserFromEdges, rule 8bd2751f). Zob's three questions, answered by Kerf on
    Zob's capture (metre-rounded points, ±2.5 m samples): 5 of the 6 pairs (vacant/underived/verge/commercial/sidewalk|asphalt)
    are ON a block-ring edge AND listed curbless, with no curb inboard, so the finder found them and the TAPER still didn't
    flatten them: neither of Zob's (a)/(b); cause not established, kerbLift's taperRegions is the place to look. verge|stripe
    differs: Mississippi's centre stripe straddles the block edge (the road lies only east of it; its west half sits on lifted
    verge), because `centreStripeRings` draws from the ribbon centreline and never reads the road's extent. Design call:
    confine the stripe to the road, or make the west half road (beside motorway_link 40) (Zob, measured). PLACED (Plumb, measured, all 14 bare vertices): M1 ×6, a curb leaving the block edge at < 26.6° that the
    finder's 1 mm-inboard read calls curbed while the riser's ownership read doesn't: RULED, the finder reads the partition's
    owner per stretch, one predicate shared with the riser (pending Zob's premise pass) · M2 ×8, 0.16–0.61 mm cracks between
    flushTol (1 lattice) and ON_EDGE_M (5 mm): HELD; re-measured after M1 (Zob: likely caused by the
    taper base sitting off the block line). M1 BUILDING (Plumb): one exported bare-edge predicate shared by the riser (on
    triangles) and the finder (on the noded stack); unmatched lifted|unlifted length refuses. STOPPED by Plumb (measured):
    the FLATTEN's output isn't noded (it re-clips after nodeAcrossGroups): 139 km of once-used interior edges on LS, 3.6 km
    after re-noding. RULED: the flatten nodes its output as its last step (Truss builds, Zob reviews), and Truss places the
    ≈80 m of lifted|unlifted that still won't match. M1 lands on top. ⛔ Not a second conformity pass.
    The 4.7 km (old 18.4 vs ownership 13.7 km) is the RIM (Plumb, by stretch). RULED: the rim keeps its taper (Jacob's Q1
    rule, kerbLift header); 'nothing across' is a named case, and the rim metres stay equal. verge|stripe: no exclusion; Zob
    writes 'a road marking lies inside its road' (RED on Mississippi), which gates M1's landing. ❓ Jacob: should the rim stand?
    The marking check (1e3ac0d0) on HPDM: RED, small: 5 of 162 stripes; one real site (706.4, 1104.8), 0.056 m²; four
    ~1e-4 m² at stripe ends; not a bake gate. PLACED (Zob): the stripe is right (Oakland Ave, on its centreline); a
    face:verge sliver (H-3, a junction residual's remainder by the Jack Buck motorway) lies INSIDE the carriageway, and the
    stripe exposes it. Owner: the junction-residual→verge assignment; cause not established.
    ⭐ ONE ROOT with LS's Mississippi straddle (Zob): both streets are bridge/layer 1 but gradeSeparated:false, and
    classifyHighwayBlocks' off-grade test (94002fae's overpass span) disagrees with gradeSeparated (ARCHITECTURE §7: surface
    bridges keep bounding blocks). Off-grade but not gradeSeparated: HPDM 46 · LS 11 · Huron 18. HPDM has no kerb (h=0), so no
    bump; LS lifts. The tags → paint-over-road step is being traced (Truss, LS). It may turn Jacob's stripe call into a
    defect. TRACED (Truss, LS): Mississippi's run is read as an OVERPASS SPAN, so blocks 145/167 are
    verge, and tileGround.js `mkDepth` gives a verge's span edge depth 0, so the verge reaches Mississippi's centreline (0.100 m
    from the stripe). #39's verge|stripe is a DEFECT, not a design call. RULED: a span edge takes its street's roadway depth
    (Truss builds; Zob reviews); the dead `skOffGrade || new Set()` is deleted. ❓ Jacob: r-highway-verge says 'ENTIRELY by
    highway'; is a block closed by a surface bridge verge (94002fae's span) or a block/JR? Counted (Truss): 77 of 115
    verge blocks are verge ONLY through the span (LS 29/42 · HPDM 30/54 · Huron 18/19). BUILT df0b7a4f (truss/verge-span-depth,
    MERGED, Zob reviewed): Mississippi clean (1.716 → 0 m²); LS 96 m² verge → asphalt. claims-verge-bare can't see it (it
    reads the baked shape and never judges where a span edge sits): Zob's live-producer check merged b6d6dcdc
    (claims-a-verge-span-edge-is-its-street-edge; LS/HPDM GREEN). Oakland's edge reads 3.8 m DEEPER: H's 12:1 taper of
    motorway-link-21 into Oakland, i.e. road (Zob); disclosed, not failed. Open, minor: a 0.34 m run owns that 33.7 m edge. HPDM Oakland mostly REMAINS (17.7 + 12.8 m²): a
    REMAINDER, placed (Truss): Oakland's carriageway is CLEAR with the fix; what's left is I-64's MEDIAN (0.24–0.31 m between
    its two carriageways), r-highway-verge's own output. ❓ Jacob: draw a hairline median as verge? Three readings of
    'highway' (mint: gradeSeparated · painter/classifier: the motorway/trunk class · span: bridge/layer) put a gs:true primary
    in 7 HPDM verges; it folds into the class question. LS: all 26 unchanged span-verges placed (19 outside the disc · 4 with the span edge outside · 3 under H paint, #90 incl.).
    Flatten output (Truss, placed): the 1.1 km 'has' residual is the flatten emitting sub-lattice necks/needles, and 'a point
    enters a ring once' rightly refuses them: RULED, split at the pinch and drop the sub-lattice part, counted like bowTies.
    The ease split is a second re-clip: node once, at the last. ⛔ A rerun of the prior 20k interior-triangle churn
    (conformAndRefine step 1) stops it. Measured (Truss, LS): all three re-clips mint (the flatten, the ease split, kerbLift's
    splitAtCreases). RULED: node + pinch cut ONCE at planGroup's input, every layer (residual 1.13 km, all pastBound). The
    crease split's ≈15 km (7.0 km same-group) is kerbLift's PRODUCER defect → Plumb, with M1.
  · claims-the-bands-are-held-by-their-owners is RED in HPDM, Huron and LS, PRE-EXISTING (Zob: identical at b50d4b3b and
    with fix B). The band pieces don't exactly tile the painted bands: mostly sub-cm² lattice residue, plus HPDM tile 181 walk
    2.25 m², Huron tile 105 lawn 4.99 m², HPDM tile 34's 9 wrong-owner seams. Cause not established; owner bandPiecesOfTile.
    PLACED (Zob): RED since birth (dac3525d, improved since), mostly INTERIOR (the rim lead is refuted), and DISJOINT
    from HPDM's #40 (nearest 152 m). Not Thursday. Start, when a builder is free: HPDM tile 181 walk, Huron tile 105 lawn.
    Same producer, a second label defect (Zob, measured): at a JR's sharp town↔highway corner, the town walk's mitred end
    takes the `__highway__` span's label (LS tiles 33/76, HPDM tile 20; 8 sites). No paint or height effect (the deformer
    owns those points by town rays; Δh ≤ 0.5 mm), but owner readers see it. claims-verge-bare, now judged by owner, reads it RED.
  · LS #39 M1 in the harness (Plumb, plumb/kerb-owner): one edgesAcross reader shared by the finder and the riser; the 6 M1 +
    2 wedge-born M2 are gone. splitAtCreases cuts each lifted polygon alone and never the road (6,365 road T-junctions,
    1,449 cross-group misses): Plumb fixes it FIRST, one cut through every polygon on the line. RULED: the rim is named
    POSITIVELY, never by absence (3,068 m of same-group edges would trench); within-group noding is asked of Truss/Zob.
    rimRings ≠ the stencil's once-used edges (2.87 vs 2.66 km): a finding for the rim brief (B).
    Zob: nodeAcrossGroups stays CROSS-GROUP ONLY (within-group re-opens the 10-20 fold, and can't close a sub-lattice gap).
    Direction being measured (Plumb): candidates are the block ring's own edges; the rim comes from ringOwner 'rim'/rimRings;
    anything else refuses. Measured (Plumb, exact keys): 83.6% of the block ring IS a paint edge; rimRings' rim edges match the
    block ring (4,529 m), but the flattened paint keeps only 2,868 m of them (≈2.4 km of rim vertices are lost in the re-clip;
    rim brief B). BUILT (Truss, truss/flatten-output-noded; Zob reviews, heavy run pending): nodeThePlane + splitAtPinches
    after the ease split [⛔ REFUSES HPDM at its pinch cut: mat:curb at (323.74, 1111.476), 'every vertex on another loop's
    ring' (Mitre's run); not landable until placed (Truss); gate on every town]: LS once-used 139 km → 1.78 km (all pastBound), a fixpoint, step-1 churn 199 triangles > 10 m (not
    the 20k). Zob: sound to merge, after the heavy run. REVISED (Zob, one reader): after nodeThePlane the bake's block
    and rim rings ARE the noded rings for every in-bake reader (the frozen rings untouched); pinches are cut by
    splitAtPinches (block ring exact 83.6% → 99.9%).
    The crease split (Plumb, cutCreases: every crossing computed and rounded ONCE, written into both edges): LS added
    unshared 30.2 km → 2.9 km. RULED in scope: MITRED tapers (neighbours share one crease at the bisector), since rectangles
    overlap at convex bends and leave h-wedges at reflex ones. ❓ Jacob: eye-gate the mitred taper at a bend.
    NARROW BLOCKS (Plumb): a finger narrower than 2 × run, where a taper reaches across the block; kerbCells has clipped it
    SILENTLY since 8bd2751f (LS: 147 rectangle vertices; mitre 134, 117 shared). RULED tonight: the clip stays, made LOUD
    (counted, with sites). ❓ Jacob: the ridge rule (run ≤ the block's half-width, the two sides meet); eye list: the finger
    tips (191.276, 461.413), (149.027, 437.185), (-634.945, 213.268), (324.619, 728.015), (422.640, 459.247).
    Mitre gates on LS (Plumb, harness): heights byte-identical > 1.5 m from a bend; reflex wedges 0; new-and-unexplained
    crossings 0; converging-crease points 191 → 83 (split-made total 370 → 259). Next: one shared crease computed once, then
    the mitre on the curbless POLYLINE (ruled). Both BUILT (Plumb, plumb/kerb-owner checkpoints): converging points
    191 → 71, all split-made 370 → 242; heights identical within one lattice rounding away from bends (gate restated). Only
    LS has a kerb (HPDM/Huron/PTown h = 0), so this tranche is LS's. STOPPED at 71; follow-up (named): an exact arrangement
    for the split, since Clipper invents crossings within half a step. ⭐ LS #39 ON THE WHOLE STACK (Plumb, rebased on Truss's
    9ee9e327, refinement off): 40 m → 1.03 m; M1 0, verge|stripe 0. BASELINE real bake at integration b8e7b868 (Truss,
    refinement on): refuses at #39 with 22.1 m bare; 2,866,250 triangles; 1,053 s; peak 11.4 GB. Left: one crease-born crack (0.18 mm, 0.95 m) and the
    ring-49 finger tip (4 mm, narrow block). ❓ Jacob: those stay a refusal tonight; a ridge rule, ON_EDGE_M's derived
    reach, or a listed allowance at flushTol? The rim by identity: 4,464 m; 185 m on the stencil in NO rim ring (42 of 148
    rimRings entries carry one). PLACED (Zob): nodeRimWithPaint returns null when a rim-edged tile mints nothing. RULED
    (Plumb builds): emit the entry for every rim-edged tile; absence there then refuses; the deformer's else-branch goes.
    B2 (one line rounded twice) is NOT rim-only: 694.8 m of LS interior block edge. Open, Class D, not ruled:
    groundConformity's ON_EDGE_M = 5 mm; Zob's derived form is √2/2·LATTICE + the float32 ulp at the town's max |coord|; the
    gap check is the only net if it shrinks. Vacant (-826, 190–196) doesn't
    reproduce without refinement: cause not established. Earlier owners named: the verge/junction-residual paint for the one. and #40
    unowned ped vertices (exact count in lafayette-square.census.json). Flatten and the deformer refuse nothing; every later
    step clean through manifest.
  · Merged tonight after the census began: the memo bound (1e6958f2), the shore-pass gate + exact unowned list (b88f7245),
    the re-gated finish clip (7ec93e8e), and Mitre's noded rim with (A) retired (8c891606, Zob-reviewed): HPDM rim class 0;
    unshared rim vertices 0 on HPDM and LS; tile 242's needles 0; no tile worse. ⚠️ B2's 1.41 mm GEOMETRIC pair still exists:
    accepted as harmless (the paint carries the shared crossing), NOT closed.
  · Running (Kerf), on a detached scratch merge of HEAD + 4be86489: HPDM's exact remaining list → Huron census → PTown census.
- **LS REAPPLICATION PLAN (Jacob, 2026-10-21: "reapply all we can to LS"; Zob's Inputs census, read from
  `cartograph/intake-rows.mjs#intakeStatusForMap` + each town's `sources.json`):**
  · *No ruling, normal path:* declare LS's `historicDistricts` in its sources.json (today the name lives only inline in
    `src/instances/lafayette-square.js`) → LS's roster (bake-content, Truss's merged change) → parcels + lamps refresh →
    the OSM re-fetch (all four §3.4 gates pass; LS's listings are hand-curated, so OSM doesn't change them).
  · *Needs Jacob:* the curated `src/data/buildings.json` assessor fields (City terms) · a City land-use code table
    (LS's is null) · NR nomination terms (and ≤ 80 plausible nomination years, not 1,013) · `content/profile.json` lifted
    from LS's inline profile (dual hydration, INTAKE-CATALOGUE A4) · LS's footprints/ids onto the kit wells (HELD
    plumbing: every `bldg-` id would change; move last).
  · *Keep, they're authoring:* survey.json / centerlines / measurements, the park polygon. Re-deriving them touches the
    measures under LS's 82 authored keys.
- **Re-fetch, measured (Zob):** LS safe (82/82 authored keys SAME; +1 address, +27 crosswalk records); HPDM breaks 2
  corner keys on unnamed (positional) ids, so after Thursday: stable ids first, then both re-fetches behind the gates.
- ⛔ **Not tonight:** HPDM skeleton re-pour (authoring key parity first) · step 7 (repaints; Jacob's eye) · the long
  check board (`feedback_bake_then_look_checks_dont_gate_bakes`).
- The day's work is on `integration/2026-10-20` only. Jacob rejected merging it into the main checkout
  (`docs/conformance-2026-09-21`) on 10-20, so ask him first. Nothing is pushed. The dev server runs the main
  checkout's code.

**LS's ground bake REFUSED on 63256183** (Lath, 2026-10-20; nothing written, `clean/` unchanged by sha): `[flatten] face:recreation: a hole below the lattice (3 vertices) that no painted ring holds by its probe, yet a ring of 47 vertices meets it, at (-703.5, -582.1)`, from `bakeGround` → `flattenPaintStack` → `itemsByMembership`. Cause not established; bisect a3426465 → 63256183 with a harness that stops at flatten (30 s, 0.9 GB per step).

**HPDM's derive REFUSED on 63256183** (Lath): `skeleton chain daniel-boone-expressway-0 carries no class — re-pour the skeleton`. HPDM, Huron and PTown skeletons predate the classifier (0 chains carry `class`). HPDM's re-pour waits for a key-parity check on its authoring (skelId+segOrd) and Jacob's eye; nothing was written.

**Ground regressions seen 2026-10-20, cause not established** (the board ran on a3426465 vs 754cef1d):
- `claims-band-is-one-ring` LS: severed 55 → 59. `claims-the-ground-covers-every-block` Huron: tile 24, 2 holes, 0.03 m².
  Look on the bake first; bisect light from a3426465 only if it shows.
- Sidewalk spikes where a treelawn ends near a T (HPDM wide view at (-156.7, 416.1), before and after perp-depths).

**Builds, planned and ruled (not started):**
- **Classifier step 7**: the plan, Jacob's rulings, the checks and mutants: `docs/briefs/BRIEF-the-classifier.md` §5b
  (OPEN, not dispatched). Repaints every unauthored arterial and collector edge (LS: 44 chains).
- Classifier Pass B: islands (walk and ramps only where a crossing passes), plazas, living street (both-side walks to
  the frontage, low kerb, no lawn), unknown class refuses → the Type pulldown.
- Frontage: garden vs street-wall, selected by a building within one band depth; nothing painted under a building.
- Materials: a pickable set (brick, cobblestone, pavers) for walks, shared streets and plazas; PTown walks brick.
- Dead ends: a `flush` style; growable round radius with shoulder easing; per-end wrap or cut-off; "None" must not
  silently draw round; cap length from both sides; restore `capFlip` on the ① path (`SECTION §6.3`).
- Ramps: the crossing as a third eligibility test (data where it covers, the town norm where silent).
- Intake: take in ALL of it (every element and tag a licence lets us hold; `fetch.js`'s `out skel` drops way-node
  tags), keep node ids, and a per-town holdings table every agent asks first. `claims-intake-is-lossless` now measures
  (LS: 2,092 way/key pairs and 6,379 building tags not carried). Carry `turning_circle`/`turning_loop` (ROADMAP A09).

**Open findings (cause not established):**
- ⚠️ TIER DRIFT from tonight's merges: `claims-the-ground-height-is-a-function-of-the-point` (since 1e6958f2) and `claims-the-height-code-owns-what-is-drawn` (since c5304a89) tiered LIVE, so `npm test` stopped running them (Mitre). `claims-the-height-code-owns-what-is-drawn` is SAFE again (8c891606); the other awaits Kerf's reshape (one mutated copy behind a switch; Zob tested it).
- The noded rim inserts a few crossings past √2/2 off the rim line: on the SHIPPING paint HPDM 1 (0.827 mm, tile 177), LS 2 (max 0.931 mm, tiles 42, 145); the painter's own count (`out.rimFar`), printed by the pour. Accepted. Why a crossing sits past the single-rounding bound: cause not established. (An earlier 10/5 came from a paint that no longer ships.)
- Tern's chained window (merged 336a9824) is a CORRECTION (Zob, measured on Mitre's dumps): every moved height is inside the disc (LS 108 · HPDM 686 · Huron 1,349), and of the 20 largest per town 41 are corrections, 1 a new error (LS (702.47, 23.90), 2.7 cm) and 18 indirect (≤ 0.022 m). The big ones (LS 1.05 m) were the rim class: the old window let 'beyond' swallow the band's entry. Optional guard against an unbounded chain: end a chain where `_inClass` at the gap's midpoint reads lot.
- bake-content's header says an overture town "PRESERVES listings.json"; the code produces and writes them, and `claims-an-external-base-survives-a-bake` pins that. Rot or an intent change, not established (Truss). The `producer !== 'osm'` census line misdescribes a hand-curated town.
- LS's `content/listings.json` meta says `count: 87` but holds 86 listings (Truss).
- serve.js's content step doesn't list `listings.json` as an input, so editing a hand-curated town's listings won't re-run its roster (Truss).
- `bake-shore-median.mjs` reads its shape from the SERVED path (`public/baked/<look>/shape.json`) even with `--out=`, so a scratch run traces the served shape (Kerf, read in source). Probably: read the shape beside `--out`. Small; not built.
- **Design call for Jacob:** a coastal Bake runs ground (--shore=pending) → shore-median → ground-shore, so TWO full ground passes (PTown ~87 + ~82 min, 10-11 timings). The median needs only the new shape.json, so shape → median → ONE ground pass would save a pass (Kerf). Moot if the median retires with the tern merge (7f4531d8, whose premise, the lidar coast, isn't on integration).
- Flatten's noding inserts thousands of vertices (LS 8,850 · HPDM 16,552; top pairs LS crosswalk→asphalt 1,443 · crosswalk→curb 1,377 · HPDM sidewalk→asphalt 2,208): producers draw shared lines twice. `ground.json#flatten.noded` is the census to drive to 0, producer by producer (Truss 2f50e565; Zob).
- ⭐ RIM SLIVERS, TWO SITES, ONE LATTICE MECHANISM (Zob, measured on HPDM tile 242 and LS): (a) LS's asphalt needle is born in
  the disc stamp in the sectionOpen finish (`cut`/`cutOwned` → `intersectRings(…, [MP.boundaryRing])`, Plumb). (b) HPDM's
  B2 wedge is NOT the disc cut: in `sectionPassProtoTile`, the lawn's operand (`less(env − Wp)`) carries a crossing minted
  262.9 m along a line it shares with the curb, PAST the rim, so its copy is tilted 0.416 mm; the oblique block cut (`inBlock`
  against the rim-cut iA) then magnifies that to a 1.41 mm pair. Fix candidate: cut the operands (pedOuter, luIn0, env) by
  the disc BEFORE the band differences, so a beyond-rim crossing never exists, or share one crossing per line. Not a cut
  added at the end. HPDM's B1 (341 points; Mitre: a 1.3 mm lot slice at the rim along the ray) is partly the same pair
  (one sample). The rest of B1 is a SECOND mechanism (Zob): the drawn rim sits up to √2/2 step off the stencil, a one-sided
  offset that the deformer's oblique ray (65° off normal) stretches to ~1.1 mm. A brief must cover both or say which it closes.
  ⛔ Not a deformer tolerance.
- ✅ The deformer's side now reads off iaFull (Mitre e5dc6b7b, merged): the old side was wrong on 91 rings; heights move (HPDM max 0.87 m), all checked maxes corrections; on Jacob's eye list.
- **Question for Jacob:** should the one-pad corner test read the CUT paint (it reads 'the paint already laid', which was uncut until the rim build)? Reading the cut paint would move HPDM's one-pads 138 → 236 and turn 234 cuts into 'not a corner'; Mitre kept it on the uncut construction (c4064ab5).
- Rim residue after the rim build: HPDM 16 / Huron 5 B1 points, where each class's own band-line × rim crossing rounds inside the rim (1.3–7.8 mm along oblique rays). Next: share those crossings too. No tolerance.
- **Ruling for Jacob:** who owns INTERIOR sidewalk paint no street band reaches (Huron 88 points of walk 41–48 m from any street; a path? a plaza?).
- PTown's shore-median.json is stale after its 2026-10-20 re-pour (walked on the old shoreline); its flatten is unmeasured until shore-median re-runs. Flatten's orphan/bow-tie drops stay until Huron and PTown measure 0.
- A perpendicular leg and its own arc's half name one run under two keys (`a<arc>/<t>` and the run): a duplicate owner, no pixel. HPDM 1,382 → 3,150 pieces (149 m²) after the leg-ownership build (Mitre, 3a55accb; `claims-the-bands-are-held-by-their-owners` row 6f reports it).
- `claims-handle-rides-its-arc`'s dark-sides row skips the boundary filter (191 of LS's 202 lie outside); fix with one
  rule: a side counts only if a tile lies on it, inside the boundary.
- PTown: 9 coincident twin chains (one twin's side goes dark); sides facing no tile (the marina footways).
- The Surveyor's asphalt drag resolves against `_v2FrontageEdges` while Measure moved to `_protoFrontageEdges`; both
  overlays skip silently when no frontage edge resolves.
- Perpendicular legs whose walk never meets the kerb, so no cut: Huron 2, HPDM 13 (live norm). `claims-proto-stack-reads-authoring` still carries the dead grout/protoProducer flags.
- Spur legs off their authored width; swap-mid-street RED; Huron bend row; PTown's 3 missing dead ends; LS highway-edge
  slivers; ② only warns on unresolved corner keys; `claims-band-is-one-ring` hardcodes 0.381; production LS rulemap 404.

**The checks themselves:** split a short pre-bake set (minutes) from the rest; the 35 runs that hit 600 s (mostly
`proto-*`, plus `the-curb-never-enters-the-road`) leave routine runs until made fast. Promote
`scratch/claims-attribution-is-per-town.mjs` (every baked town that owes a credit carries `sources.json`; it must
refuse on 0 slabs) and run it at bake.

**Download size:** `.bin` compression at the edge; hero AO PNG → KTX2 (9 of 10 LS species); PTown's 56 MB ground.

**Prop House, then signals** (Jacob: wanted soon, it sells the project): a read-only scout of the signal packs, then
the brief. Raw purchased files never go in git or anything public.

**Triage:** the two blocks retired tonight to `cartograph/_archive/BACKLOG-final-macro-list-2026-07-16-RETIRED-2026-10-20.md` (the 07-16 macro list and the June–July NOW frontier) may hold unbuilt items; check each against the code before treating it as done or dropped.

**Housekeeping:** the parked worktrees (zob-key-parity on zob/key-parity 67328231, from before 10-20; tern-coast, tern-frame, tern-revet, meridian-browse, gantry-expwy,
wellhead-joins, a0-deadend, classifier, hpdm-gate; ⚠ before removing hpdm-gate, resolve what links into it: a worktree's JH `clean/ribbons.json` was a symlink into `.claude/worktrees/hpdm-gate`, per Loess); unmerged branches loess/compound-ease (cd08f455, compound faces through hole subtraction; faces still go through SHARP: Huron 3, HPDM 8, JH 6) and loess/ls-scratch-pour (f39adb56, 6cd83c32, 37c3201b, d6cdabed); `ny.mjs` terms; weather fallbacks (missing
visibility read as clear).

**JH, after its extent is set up:** pre-authoring from NYC Planimetrics at the authored rung
(`project_authoritative_data_pre_authors`); `norms.json`; instance registration (needs Jacob's emoji); 122,837 m² of
band ground with no owner and "① AUTHORING ABSENT" (same before perp-depths); NYC credit.

---

## ⌒ WE HAVE NEVER TREATED A CONVEX CORNER — and ② is rounding 27 of them (2026-09-06)

**Jacob, on the ①-produced map:** *"a convex corner, which is something we've never done"* ·
*"we've never treated a convex corner."*

**Measured, LS in-disc: 27 corners are eased in the OPPOSITE sense to their ring** — they round
**outward**, wrapping an INSIDE corner. Attribution, so the history is honest: **6** were admitted
by rules that predate 2026-09-06 (1 owner-change, 5 `hard` on both sides) and **4** by that day's
`a.hard || b.hard` correction; the rest did not resolve to a rule under the probe used.

⭐ **THE DOCTRINE POINT, WHICH IS BIGGER THAN THE COUNT.** The authored radius is a **CURB RETURN** —
an *outside*-corner specification (the NACTO/AASHTO 4.50 m class seed, the dial the operator turns at
an intersection). An inside corner **has no authored value**, so applying the dial there invents a
specification. That is `RIBBONS §1`'s cap rule one level up: *"an offset is measured from a LEG,
never from a CAP; a cap has no authored value — it is what falls out."*
⇒ **What an inside corner should do is UNRULED.** Candidates: stay sharp · take its own (larger)
radius · take the band's inner offset for free. ⛔ Do not pick one by eye on LS.

### ⛔ ATTEMPTED AND REVERTED THE SAME DAY — read before rebuilding it
A guard was written to leave reflex vertices sharp and disclose the count. **It fired on almost
nothing** (ordinary corners 47 → 45, reflex 27 → 25) because **the ① block ring and the artifact
tile ring do not share a winding convention**, so the guard's convexity test and the probe's
measured the opposite thing. ⛔ **Get the winding convention pinned FIRST** — this repo carries both
shoelace conventions and `booleanLabelled` converts the outer "to the winding the consumer expects"
— then the guard is a few lines. Reverted rather than shipped, because a branch that changes nothing
is worse than no branch.
▶ Reproduce: count fillets whose signed turn opposes their ring's signed area, on the ARTIFACT tiles.

## 🎗 SKINNY MEDIANS ON PARK (2026-09-06, operator-marked)

Park Avenue's median blocks measure **6.0–8.7 m mean width** in ① (5 of them: `park-avenue-0+1`,
`-2`, `-5+7`, `-6+2`, `-7+5`), and ② then erodes each side by the authored half-width, so what
survives reads as a sliver.

⚠️ **Suspect the DATUM before the construction.** ①'s ink is struck at ε about the **CENTRELINE**
(`SKELETON §61`, corrected 2026-08-14: the chain points are at carriageway centrelines, *not* inner
edges), so a median block's boundary sits on the two centrelines and eroding it by a full
`pavementHW` per side double-counts the inboard lane. `derive.js` `innerEdgeAssign` exists to set a
carriageway's sides to `surveyHW/2` — ⛔ **whether ②'s `protoMeasureOf` honours that halving is NOT
measured.** That is the first question, and it is a datum question, not a corner one.
⛔ Do not "fix" this by widening the median — `RIBBONS §1`: a median is a block, and if the curbs
touch there is no block.

## 🕳 UNCLOSED BLOCKS AT THE RIM — a street that stops SHORT of its junction (2026-09-06)

**Symptom, operator-marked:** a chunk of the map inside the disc paints **nothing** — no block, no
curb, no sidewalk, no land use — while its neighbours draw normally. LS: the SW rim, mark at
`(-267,-793)`, **61% of a 144 m circle blank**.

⭐ **CAUSE ESTABLISHED, and it is the FRAME, not the producer.** ① makes a block from a HOLE in the
ink, so the ink has to close a loop. Papin Street **shares no vertex with South Jefferson** — it
stops short of it:

| chain | ends | short of | gap |
|---|---|---|---|
| `papin-street-0` | start | `south-jefferson-avenue-0` | **11.63 m** |
| `papin-street-5` | end | `south-jefferson-avenue-8` | **15.87 m** |

The aerial shows the road running through to the junction, so the road is real and the frame is
wrong. `ENDPOINT_SNAP` welds near-coincident endpoints at a few **centimetres**; 12–16 m is three
orders of magnitude past it, so nothing welds and the loop never closes.

⛔ **DO NOT CHASE THIS IN THE PRODUCER.** Everything downstream is behaving correctly — there is no
hole, so there is no block, so there is nothing to stroke. Ruled out by measurement on the way:
the fetch bbox (2236 × 2240 m against an 1784 m disc — it covers), prebake loss (skeleton and
ribbons agree exactly there), and the `touchesFrame` exterior drop (removing it changes nothing).

▶ **Home for the fix: `cartograph/extend-centerlines.js`** — the class is "a chain that stops short
of the junction it visibly reaches." Skeleton-layer, so it **needs a re-pour**, which is why it is
here and not in the corner arc.
⭐ **The kit form, and it is the deliverable:** a check that flags *any* chain endpoint sitting a
few metres from a chain it does not share a vertex with. That is town-#2 portable and needs no
operator who has already seen this street. ⛔ A per-street extension list is not a fix.
⚠️ **And it must not weld a GENUINE severance** — `OSM-FORENSICS §1.3` names Carroll Street as a
real one, and `ROADMAP A09`'s `highway=turning_circle` tag is the only arbiter we have for
severed-vs-fragmented. Distance alone yields a shortlist, never a verdict.

▶ Reproduce: `node checks/claims-marked-corners.mjs` is the WRONG lens (a corner classifier); use a
region count — ① blocks inside the mark vs drawn — and the endpoint-gap scan above.

## 📐 the kit-correctness track — shrink automation-debt (automate the eye)

> The SHAPE campaign: make the skeleton produce correct street geometry **automatically** so LS's *automation-debt* curated hand-fixes can be deleted and the auto-pipeline still holds. This is **kit-forward correctness** (town #2…N), distinct from the v1-render frontier above. **The law** (`NEIGHBORHOOD-INPUTS §0.0/§1.1`): every output is a best guess and overridable — automation should keep improving, but override is first-class, and *idiosyncratic* curated chains (features no source holds) are **kept**, not defects. The data question is CLOSED (no external street source helps — `INTAKE §5.1`); the lever is the skeleton's *interpretation*. North star: *Survey shows the perfected map straight from the skeleton.*

- **⭐⭐ The correctness detector IS the deliverable** (not the 35 fixes) — `POLYGON-FIRST §5`, harness `scratch/correctness-detector.mjs`. 8 invariants seeded; **`junction-band` is the recall instrument** (24/25 structurally-visible curated defects; the defect is pervasive ~60 junctions), **`width-step` the flagship** (the datum-step class). The 35 are mostly **topological** (loops/cul-de-sacs + seam datum-steps), not jagged curves — so the suite's centre of gravity is graph-level. Findings: `SIEVE-DETECTOR` · `LOOM-TOPO` · `THROAT-JUNCTION-FINDINGS`. The detector flags the class everywhere → CI gate → onboarding loop (run-suite → fix-class → green).
- **The open construction (the bug classes still to kill generally):**
  - **`HANDOFF-curve-primitive-skeleton.md` — curves as bezier primitives.** Ph1 (centerline beziers) + Ph2.1 (robust curve curb) landed; the junction-curb bump RESOLVED. ▶ **v2: loops + divided carriageways as closed/paired beziers** (the cul-de-sac faceting + Benton/Waverly/divided medians) — Benton-gated; add the `curve-faceting` detector. *(Absorbs the old round-skeleton-corners / concentric-curb / vector-curve framings.)*
  - ⛔ **`HANDOFF-junction-construction.md` — intersection-everywhere — CLOSED 2026-09-05** (Jacob: *"E3 is superseded; fold it in and close the campaign"*). Thicken→collide→trim→assemble **is polygonize-then-offset under construction vocabulary**; the grout does it without constructing. ▶ **`cartograph/RIBBONS.md §1`**; the file carries a closure banner naming what survived (`innerSign`→face-adjacency → `RIBBONS §3.5`; the `junction-band`/`curb-bump` detectors). ⚠️ **Its through-node subclass root still stands and is NOT superseded** — `tileGround.js` gates window construction on `dw`/`kink` and skips straight deg-3 T's (`scratch/THRUNODE-GATE-FINDINGS.md`, 2026-07-16); it is a real defect in the code the grout replaces, so it dies with that code or it does not. **Re-check it against the grout before assuming either.**
  - **`HANDOFF-band-fold-fix.md` — the G12 thorn clamp.** ⚠️ **NOT landed** (`8e1e414` stranded; `thinTile` orphaned to `bandJoin`, no depth clamp). The LOCAL capacity clamp (engage on partial-degeneracy without over-clamping). Two subclasses, both open. *(Absorbs the junction-band-thorns forensic.)*
  - **`HANDOFF-freeze-the-curb-in-the-first-bake.md` — freeze the curb geometry (the last unfrozen polygon).** D2 froze the tile *topology*; the **PRODUCER** still mints the curb by stroking chains and snapshotting it (the "d" bulge — its divided-transition instance landed `fd38c70`, but the program is the freeze). ⚠️ **Scope corrected 2026-07-31:** the **consumer** half is DONE — every non-Survey view reads the frozen `shape.json` (`PIPELINE.md` §5 (the Wall) ⚠️ *(was cited as `WALL.md §31` — a section that never existed)*, `PIPELINE §5 (the Wall)`); only Survey live-strokes, by design. What is red is **Check C** (producer chain-free), so this item is D6b/c only — smaller than the "the curb is not frozen" framing implied. Emit the clean parallel-offset curb once in prebake, consume it; only the element under the operator's hand re-strokes. ⚠️ **Rebuild-gated → PARKED.** Phase 2 (block-local edit loop) is the FILL-perf sibling of section-perf #1.
- **⭐ Land-use classification — the phantom park (data, not geometry; `RIBBONS §6.2`).** `classify.js` stamps `type='park'` on the FIRST containing overlay, and the bucket includes `landuse=grass` + `leisure=garden` — so residential lawns capture whole faces. Measured 2026-07-30: **512 of 895 overlays stamp park**; **25 of the 29 faces shipping `use='park'` are yards** (all via `landuse=grass`, 92,869 m²); worst is face#12, **136,234 m² captured by a 4,899 m² lawn**. ⛔ The canon's old "~3 LOC: drop `leisure=garden`" fix repairs **3 of 28** — the offender is **grass**. Fix = narrow to genuine parkland (`leisure=park`, `landuse=recreation_ground`), drop grass AND garden. ⚠️ Moves land use map-wide → prebake + rebake + Jacob's eye before it counts.
- **⛔ `layers.park[0]` is AUTHORED — do NOT delete it** (`RIBBONS §6.2a`). The 350×350 m 4-vertex square at the origin reads synthetic and is not: it is `clean/park-polygon.json`, deliberately preferred over the 65-vertex OSM trace so the corner plugs reconcile. **Measured aligned** — 9.20° vs the grid's 9–9.5°. Two real correctables instead: (a) it is **~8% small** (350 m vs OSM's ~365 m ⇒ the edge sits ~7 m inside the true park all round — fix `halfWidthMeters` if that is a slip); (b) **`PARK_CENTER` `{-15,-15}` disagrees with the polygon's `(0,0)` centre** by 21 m in the parcel-exclusion test (latent). *This object has tripped us repeatedly — the note exists so the next pass corrects it rather than deleting it.*
- **Skeleton fortification — name-aware weld** (`SKELETON §5b-bis`): weld 35 same-name fragments + straighten within-name kinks (St-Vincent/Papin artifacts vs Park-Place real bends). Partly addressed by the `roadId`/`continuesAs` union.
- **`HANDOFF-tile-T3-authoring.md` — polygonize Survey / migrate authoring onto tiles.** Move handles / corner-R / cap-selector / strip-swap / translucency off the dead figure-ground; activated-block live redraw (the sticky-tools fix); then **T4 deletes figure-ground**. *(Absorbs the design spine + the injective corner-handle slice.)* The **Survey · Section · Stage rename** rides this (don't rename code until implemented).
- **`HANDOFF-tile-feature-ledger.md`** — the tile re-pour definition-of-done ledger (tracking matrix; the construction side is ✅, T3/T4/slab-content remain).
- **Deferred SHAPE residuals** (`[[feedback_accept_the_long_tail]]`): the intersection-everywhere finish (better-but-not-perfect nodes — = the junction work) · the curve-and-cut class (a block edge curving-then-cutting near a junction).

**Landed → `_archive/handoffs/` + Reference (not logged here):** the pre-DataWall closeout (surface-and-wire G1/G3/G4, edge-of-map perimeter faces, divided-"d" curb, cul-de-sac keyhole, the walked-face median, intersection-everywhere `9c275ce`, the Section build, loops/dead-ends/cap-wrap/handle-float/alleys). The honest "done" test (code-landed ≠ eye-verified) lives in `DOC-CODE-COHERENCE.md`.

---

## 🛡 HARDENING — correct on the eye, not yet correct-by-construction
- **D3 — corner identity at divided transitions → freeze at prebake.** The false-corner cure is LIVE (`9c275ce`); doctrine wants the decision made once upstream as frozen topology (`PREBAKE §5`). Sibling of the curb-freeze. ⚠️ Relocating re-derives corners → gate it; don't cleanup-refactor.

## ⏭ NEXT

- **🚸 THE DEAD-END MOUTH CROSSING — the ped band closes across a spur's mouth and paints it as SIDEWALK, i.e. a crosswalk where none exists** *(flagged by Jacob 2026-08-10, on the eye, off the back of `A10` ③)*. **Section/FILL — ⛔ NOT `A0`, it does not touch the bulbs; don't bundle them.**
  - ⛔ **③ DID NOT CREATE IT — it made it LEGIBLE, and that distinction protects ③ from being "fixed" backwards.** Sidewalk area inside the frozen mouth discs is unmoved across the cure (re-derive: run `sectionPassTile` per tile before/after and intersect `Wacc` with a disc at each `st.mouths[].mid` / `.R`). What changed is that the ribbon around the mouth became continuous, so the crossing now reads as a closed loop around the spur instead of dissolving into broken green. **The old appearance was accidentally right for the wrong reason** — the arc fell to `luRemainder` and rendered as land use.
  - ⭐ **The cure keeps the arc PAINTED and changes its MATERIAL** (Jacob: *"this can literally be both ribbon sections set to tree lawn"*). ⛔ Not painting it re-opens the hole ③ closed, and `ARCHITECTURE §"The compound shape"` forbids reading an edge as an absence.
  - ⛔ **THE ARC IS NOT AUTHORABLE TODAY, so "just set both strips to LU" is not an operator gesture here.** The span that closes a mouth belongs to **the THROUGH street's run, not the spur's** — verify per scene by reading `shape.json`: for each `st.mouths[]`, the `st.runs[]` vertex nearest `.mid` carries the through street's `skelId` (a few are rim runs with no `skelId` at all). At `skelId|side|segOrd` granularity the flip would grass over the whole frontage segment.
  - **Shape of the fix:** default automatically from frozen facts — **a span lying inside a frozen mouth disc paints both strips LU** (③'s partition already isolates that span; the disc's own `R` is the only bound, no tuned distance) — and key the OVERRIDE on **the spur**, since a crossing is a property of the dead-end street and the spur *is* addressable; one scalar in its existing slot, the shape `capFlip` already has. **No new key space.**
  - ⭐ **The deliverable is the check** (`POLYGON-FIRST §5`): red-until-true, *no sidewalk strip is painted inside a mouth disc that carries no crossing* — per scene, no eye, because on town #2 nobody is looking at these.
  - ### ✅ THE OPEN QUESTION — *"flat no-crossing default, or gleaned from OSM?"* — **IS ALREADY ANSWERED ON THE BOARD: `ROADMAP A09`.** *(Boz, 2026-08-11.)*
    **We fetch the crossings and throw them away.** `fetch.js` asks Overpass for `node["highway"]` and `ingestElements` keeps only the coordinate — **`fetch.js:123` is `nodes[el.id] = [el.lon, el.lat]`, `el.tags` discarded.** A09 measured the LS bbox: **489 `crossing` nodes dropped** (alongside 763 `street_lamp`, 20 `turning_circle`, …). ⇒ **the glean is not an unknown, it is `A09`** — and this defect is a **second consumer** of that one fix, which is the argument for doing A09 rather than hand-defaulting here. ⛔ **Do not build a private crossing fetch for this ticket** (`project_census_is_the_union_of_its_wells`). ⭐ A09 already carries the same shape at the cap: *"the cap DEFAULT is derivable today; nobody ever wired it."*
  - ❓ **OPEN, Jacob's call:** flat *"a dead-end mouth carries no crossing"* default, or **gleaned** from crossing data (OSM `highway=crossing` / `footway=crossing` near the mouth) with no-crossing when silent — the kit-correct shape, and the same doctrine as `gleanTreelawn`, but it needs an intake trace first to confirm we still retain crossing nodes.
- **🔗 Boundary streets as PARTIAL edges (the spine case) — brief: `BRIEF-boundary-partial-edges.md`.** `computeBoundaryFromSelection` assumes one named corridor = one ring edge, so it demands every selected street have exactly two boundary neighbours. That's right for Księży Młyn (4 streets → 4 corners, closes) and wrong for a spine: Centrum's Piotrkowska runs *through* the district, touches dozens of junctions, and is reported interior even though the selection is correct. The model needs to become a cycle through corners where each edge is a RUN ALONG a street between two of them — a street may contribute several runs. **HPDM needs this** (two neighborhoods stacked). Must not regress `ksi-y-m-yn`.

- **📋 The Intake Manifest — brief: `BRIEF-intake-manifest.md`.** The last unbuilt step in the kit: a per-scene `intake.json` declaring every render-side input a pour *could* use, an Intake panel in the Extent tool (**Get** + **(?)** per row), and honest absence. **The manifest is ASPIRATIONAL** (Jacob, 2026-07-20) — a catalogue of what a town could have, not a checklist it must pass; an unacquired input means the feature simply isn't shown. The earlier "pour gate" framing is retracted in-brief. **Cartograph enumeration DONE 2026-07-20** (§5): floor = 4 inputs (Centrum poured on exactly those), ~16 elective, measured presence matrix (LS 25 · HPDM ~20 · KM 11 · Centrum 6). ⭐ **LS is *the* final-Boss dataset — the complete target, NOT an outlier** (Jacob): the panel lists every row for every town (a collection checklist); the render shows only what's been acquired. LS's seven unique inputs are *undocumented procedures*, not unrepeatable ones. **Scope is the CATALOGUE, all four domains** (cartograph + arborist + meteorologist + content, incl. "where on the net do I get this") while the *dependency* set stays the 4-input floor — cataloguing ≠ depending. Lens = **the universal player** (`ROADMAP C1`). The catalogue is also a **FEATURES artifact** (Jacob: "almost an oblique feature of the FEATURES doc"). ✅ **The three LS fallbacks this entry surfaced are EXCISED** (verified 2026-08-04): `bake-lamps.js` `loadAuthoredLamps` reads the per-scene well first, then LS's only `if (scene === 'lafayette-square')`, then `[]`; `bake-trees.js` resolves defaults against *this* scene and prints `no tree-species-map.json — species routing is EMPTY` on absence. For every town but LS, absence now means absence. The manifest work itself is unaffected. ⚠️ **Serialize with the partial-edges brief** — both rewrite `serve.js` + `ExtentApp.jsx`.

- ~~**🧹 Prune the stale worktrees (`.claude/worktrees/`)**~~ ✅ **SPENT — verified 2026-08-04.** `git worktree list` returns **2**: the main tree and `.claude/worktrees/pipeline-repro` (`repro-a01`). None of the four branches this item named has a worktree. ⭐ The load-bearing part was the *warning* — "any worktree dispatch is unreliable until this is cleaned." **That no longer applies; `isolation: worktree` is safe to use.** *(Delete this line at the next sweep.)*

- **⭐ "Revert to Data" buttons — Survey + Section.** Strip the authoring overlay back to base (Survey → skeleton surveyed widths; Section → the gleaned treelawn-Y/N × ADA calc). Mechanism partly exists; generalize + surface per-tool. `SECTION §8`.
- **Boundary residual** — the edge-of-map face-walk half landed; the cull/SSOT + the S1 elbow→fade residual are **subsumed into the Extent redesign** (`_archive/EXTENT-EXCAVATION-DIARY-2026-09-13.md`; the circle-SSOT model was retracted). Former brief archived → `cartograph/_archive/HANDOFF-boundary-trio-SUPERSEDED-2026-07-21.md`.
- **Slab-content remaining** — overlays + highway-class asphalt (alleys/footways landed `735f02c`/`543bdeb`).
- **Story-pass address-maps** — Meteorologist + Arborist (`[[project_story_pass_campaign]]`).

## 🖥 GPU-perf gotchas (live)
- **⚠️ Bake-ordering footgun:** a ground GEOMETRY re-bake (`bake-ground.js`) silently drops the AO `lightmap` → flat-lit slab. **Always run `bake-ground-ao.js` after** (the GUI `/bake` chains them; only manual CLI bakes hit this). Outstanding: make `bake-ground.js` preserve the lightmap or warn.
- **tri-cut follow-ups** (tri-cut LANDED, fact in `OPERATIONS §Ground tri-budget`): (1) ✅ **MOOT 2026-09-20** — `bake-ground.js` never held a hardcoded `1.5` (grep it); it reads the shared sampler via `terrainLoad.js`, which now resolves the town's AUTHORED `terrainExag`, so bake and runtime cannot drift; (2) expose `GROUND_REFINE_TOL_M` as an `INSTANCE.mobileQuality` tier → `mobile-profile`.

## ⏸ LATER / PARKED
- **⛔ OPEN: HPDM's ground bake THROWS on 534 walk vertices no painted band owns. It cannot ship until they are fixed or ruled (Jacob's morning decision; Boz 2026-10-12).** Census on 9d89fd43's deformer, by the widest lot gap on the best ② path: ≤5 mm 144 · 5 mm–5 cm 112 · 5–50 cm 243 · >50 cm 27 · no path 8. Every wide gap's midpoint is held by LAND-USE FILL (byFaceUse `face:<lu>`), except 2 clusters (garden, parking_lot) and 1 edgeline. It is never unpainted. Six located, two shapes: (a) a small land-use piece, about 4 m² and about 44 cm mean width, reaching the CURB (0.0 mm) between two pieces of the same band (tiles 138, 21; also 48 at 156 m², and 61 at 24 cm from the curb). Likely the unpainted-band class of `RIBBONS §6.1` G12, but NOT matched to its subclasses. (b) the block's own large land-use face (tiles 52, 114: 15,039 m² and 1,339 m²) between the ② band and a walk or lawn piece no ② ray reaches. Layer: Section's FILL, not SHAPE. Cause NOT established. ⛔ Don't touch the fill without the canon routed and Jacob's eye. ▶ `GAPS=1 SIDES=1 node --max-old-space-size=14000 scratch/ground-height/orphans.mjs hipointedemun <dump> <slab>` · `scratch/ground-height/seams/{wide-held,six}.txt` (Swale)
- **⛔ OPEN: no ground is painted twice (held at ZERO area, not waived; Boz 2026-10-12).** (1) Derive's land-use evidence regions overlap: HPDM 0.300 m² across 33 painted lawn pairs of different keys, the largest OSM residential #4224 over parcel vacant #4659 (0.20 m² in `ribbons.json` `landEvidence`, a 3 mm sliver). Suspected cause, NOT established: `layerLandEvidence` rounds each new crossing vertex to its 1 cm grid; settle it by replaying that one region. (2) A disjoint cut in `rekeyByPiece` (each class minus what earlier classes took, `underived` the rest) removed those overlaps but left 0.500 m² of sub-0.7 mm X|underived slivers plus an unexplained +4.0 m² of lawn, so it was reverted. Where the slivers are made is NOT established. Patch, gate and the parked check: `scratch/ground-height/seams/{disjoint-cut.patch, disjoint-gate.txt, claims-no-ground-is-painted-twice.mjs}`. ▶ `node scratch/ground-height/seams/lawn-overlap.mjs <dump>` (Swale) (3) In the DRAWN mesh (HPDM's scratch bands slab, dac3525d, 2026-10-18, Screed): residential triangles stack along (304.060, −1002.695) → (310.317, −1029.388). Edges there are used 3× (residential+residential+sidewalk) and 2× (residential+residential), and the exact gap check reads the long edge as a seam. Across the slab's partition, 5,596 edges / 8,210 m are used more than twice: asphalt×4 680 m · residential×2+sidewalk 567 m · underived×4 303 m · residential×4 223 m · … Whether each is ground painted twice or a degenerate fan: NOT established. ▶ `node scratch/ground-budget/tj-class/seam-pairs.mjs <slab>` and the non-manifold count in Screed's 2026-10-18 report.
- **⛔ OPEN: LS's ground bake is REFUSED on bare kerb steps (Boz 2026-10-12; LS HELD).** After the lift, lifted block still meets the road with no kerb face and no taper: 46 m (vacant|asphalt 28 · commercial|asphalt 6 · verge|asphalt 5 · treelawn:park|stripe 4 · institutional|asphalt 3 m), named by place in the throw. Cause not established. (Was 9,254 m before the crease split and the carried side; the asphalt|asphalt steps were road slivers misread by a centroid, now retired.) ▶ an offline LS bake (`bake-ground.js --out-dir=<scratch>`) prints it.
- **⛔ OPEN: asphalt INSIDE the lifted block — should it lift? (Boz 2026-10-12; its own question.)** On LS, asphalt polygons lie wholly inside the painter's block (`pr.block`), e.g. around (-867, 207): 196 m², raised with the block, and their edges against the road's asphalt are bare `asphalt|asphalt` steps. Whether such asphalt is road (stays down) or block (lifts) is not decided; cause of asphalt inside the block not established. ▶ `node scratch/ground-height/kerb-refine/asph/classify.mjs <lifted-asphalt dump>`.
- **OPEN: the kerb side of a ground polygon is still READ, at the polygon (`kerbLift.mjs#withSide`, a point just inside it) — A15's remaining recovery.** The painter's items carry no owner: `tileGround.js#sectionOpen` pools every tile's bands into one ring list per class and the bake's paint-stack flatten re-clips them. Close it by stamping each band with its block where the painter emits it and keeping the stamp through the flatten; the mesh already carries the side per triangle from there (`groundConformity.js#emit`).
- **LATENT: ③'s `band(a, b)` returns `[]` when `b` is empty, not `a` (`tileGround.js`, both twins: `sectionPassProtoTile` and the producer's strike; Boz 2026-10-12).** Today nothing reaches it, because the capacity guard keeps the innermost offset non-empty. Without the guard, a block narrower than its bands would lose its walk and lawn instead of keeping land use at the centre. Close it by making `a − ∅ = a`, then re-judge whether the guard is still needed.
- **LATENT: a slab with NO `ground.json`, or one that will not parse, ships silently (Swale; Boz 2026-10-12).** Nothing on Publish, Promote or the CLI upload requires or parses it: `scripts/upload-baked-to-r2.mjs#plan` reads it only to refuse `shore: "pending"` and passes the other two cases over as before, and `bake-manifest` parses only its content payload. Not decided: whether a slab without a ground is ever legitimate. ▶ `checks/claims-a-drawn-coast-never-bakes-shoreless.mjs` is where its row would go.
- **From the Ward pass, 2026-09-29** (details: `cartograph/_archive/BRIEF-ward-happening-on-the-place-card-DELIVERED-2026-09-29.md`, bottom sections):
  - **Distributed events** (Jacob: *"sponsors … Carnival in Provincetown or the Jinglebell Crawl"*): an event's own card that buildings opt in to, its lit roofs, and its sponsor. Design first (Nocturne); the ticker's tap target is already generic.
  - **A home as a place** (listing a home, posting at one) waits on the **resident-verification flows** (NEXT UP; `verify-resident` itself is closed, F-23, Apps Script @69). Jacob's stance: no ID checks for ordinary people.
  - **The monument has no roof seat** for the selection dot: `claims-every-building-has-a-roof-to-seat-on` is red on provincetown `osm-164024699` (a set piece). Seat it on the set piece's own top.
  - **Addresses: HPDM + altadena need a re-pour** (poured before the OSM twin join); the bake says so by name. ▶ `node checks/claims-every-building-has-an-address.mjs`.
  - **`claims-a-bake-step-declares-what-it-reads`**: the buildings step reaches `intake-rows.mjs` + 19 data names undeclared (Lintel, 2026-09-29).
  - **`claims-stage-preview-parity`**: its app censuses predate the 2026-09-29 Town/CelestialBodies edits and need re-taking with the running app.
- **Sky shaders under the logarithmic depth buffer** (Loupe, 2026-09-27). Stage/Preview run `logarithmicDepthBuffer:true`; hand-written ShaderMaterials without the logdepthbuf chunks fail the depth test (that hid the lantern Glow, fixed 36226b74). But ADDING the chunks to the sky shaders (CelestialBodies ×4, CloudDome, PlanetariumOverlay ×2) made the Hero STARS vanish on provincetown (71 programs compiled clean; not the far plane: star radius 49,601 m < far 60,000 m). Cause not established; reverted. Until it's understood, the sky shaders stay as they are and Wick's check ⑩ covers only near depth-tested shaders.
- **The landscape backdrop's Snowline slider runs 0–3000 m, a fixed range** (Loupe's Stage controls audit, 2026-09-26). It should derive from the backdrop's own relief, like the audit's other town-#1 ranges. `checks/claims-stage-controls-are-live.mjs` names it red. No landscape owner today.
- **⚠️ Sky-colour overrides are keyed by CLOCK HOUR (seasonal grid), not by TOD slot.** A sunset/dusk colour authored for one season won't track the slot in other seasons (the slot's clock time shifts with the season, the override doesn't follow). Future: **slot-keyed or per-season sky-colour authoring**. The Sky Builder is the current live tool. *(Known limitation surfaced 2026-06-28 while authoring the 7-slot TOD day — `bc9a74ea`/`986a4f8f`.)*
- **Onboarding / Intake** — ✅ **BUILT: the Extent tool** (author the **inclusion polygon** from the fetched street names; exclusion loops + per-building overrides as correction; one-click Bake). Committed on trunk `curb-offset-draw`, **not yet in prod**. **Altadena is the first hood poured fully end-to-end through it** (LS/HPDM predate the regime → bolt-on protections). ⭐ **Design of record: `EXTENT-DESIGN.md`** (2026-07-22) — supersedes the 2026-07-16 reconciliation. ⛔ **RETRACTED follow-on:** this entry used to call for *"excise the dormant street-selection code — `ExtentClickableStreets`, `computeBoundaryFromSelection`, the `sides` field."* **Do NOT do that — that code is the live mechanism** (retracted 2026-07-20; excising it is precisely the mistake `a05fc129` had to undo). Genuinely excised: `computeExtentCorners` + `/extent-corners` + `fetchExtentCorners` (`55df128a`). **Open follow-ons:** (a) **D4 residuals** — ✅ the `rescope` center-drop is FIXED (`71f5ff36`; it was the real cause of the "disc reverts to `[0,0]`" symptom). Still open: `ExtentApp.jsx:1145` short-circuits `keptCenter` when committed. ✅ **The fade half is CLOSED, ruled 2026-09-20** — it asked "how do fades scale with radius"; the answer is that they are **derived from it and never stored**. The disc now carries `radius` + `center` + `fadeBand` (the one knob); `fade` derives additively (`radius` → `radius + fadeBand`) and `streetFade` is deleted. A rescope has nothing to regenerate, so the question dissolved rather than being answered. `ARCHITECTURE §Extent`, ▶ `node checks/claims-fade-derives-from-radius.mjs`; (b) **retire the `src/data/*` name-imports** (13 static, 10 files) — until then **any second pour clobbers production LS** (`ARCHITECTURE §Extent`, the palimpsest warning; `EXTENT-DESIGN §2.1` + worklist step 4). ✅ **Lamps RESOLVED 2026-07-23 (`4db5c07c`) — union, not replace.** Investigating turned up a live regression: the two wells were *alternatives*, so LS's **80 authored Lafayette Park lamps had silently stopped baking** the day it gained an OSM fetch (the authored branch became unreachable). Now OSM 641 ∪ authored 80 − 33 dupes (<4 m) = 688 pre-clip, ~583 baked. LS's authored well still lives at `src/data/street_lamps.json` — **moving it to `data/lafayette-square/authored_lamps.json` retires one name-import + the last scene-name special case in `bake-lamps.js`** (the loader already prefers the per-scene path). ⚠️ **Not yet re-baked** — the slab still ships 536; needs an eye pass. `BAKE.md §4.5`; (c) **re-verify B8** (poured-scene browse framing, `DOC-CODE-COHERENCE B8`); (d) push to prod when the branch ships. `[[project_neighborhood_disc]]` · `[[project_intake_onboard_process]]` · `[[project_extent_disc_centroid_radius_bb_model]]`.
- **⭐ Custom street data — import + manage (KIT)** — generalize LS's `survey.json` (operator-measured widths, the base-width source: custom → OSM → AASHTO) into the Intake/Onboard flow. `SKELETON.md`.
- **Tile-bake footprint (P1) / curve-fineness (P3)** — profile before cutting (`tile-feature-ledger` E-rows).
- **Hosted bake service w/ auth** (v2+). · **Hero keyframe FOV regression · TAA post-pass** — not urgent.
- **⭐ Parcel-morphology as a classifier signal (`bake-content`)** — the assessor parcels (`raw/<scene>/stl_parcels.json`) already feed the content-pour's land-use *code*, but the lot **geometry** is untapped. Add urban-typology features — lot area · footprint:lot coverage · frontage:depth · corner-vs-interior · abutment/adjacency — to sharpen the use/category guess. Layers onto the existing recognizer (parcels already loaded), no rebuild; runs behind the pour = secret sauce. **When:** guess-quality becomes the bottleneck (thin-claim neighborhood, or a client wanting a pristine first-draft); the "Is This Your Building?" claim regime back-fills the residual today, so it's a sharpening, not a fix. *(Jacob, 2026-07-07.)*
- **Lot-anchored footprint geometry (parallax)** — anchor/center the MSBF building footprints to the assessor **lot boundary** to cut footprint-vs-ground misalignment on camera move. Render-side (`bake-buildings` refinement) — *distinct from the classifier* though it uses the same parcel data; keep the arcs separate. **When:** if footprint drift reads as a visible defect on the pan. *(Jacob, 2026-07-07 — mentally tinkering.)*

## ⏸ AWAITING JACOB (QC / eye)
- **The red "NOT the frozen shape" bar** (`ROADMAP A02`, built `b27ce690`) — **⚠️ built, never seen fire.** Outside Survey the app renders from the frozen `shape.json`; if that file is missing or fails to load it used to silently redraw the map from chains instead, looking normal. It now shows a red StatusBar bar. **Cannot be verified on LS or any current scene — all have the file.** ⭐ **Zero LS impact — this is insurance for pouring a NEW town**, so it is correctly *not* on the LS path. **Verify opportunistically:** the next time a pour's shape freeze fails or a fresh scene has no freeze yet, confirm the bar appears in Design/Measure (**not** Survey — Survey live-strokes by design and correctly shows nothing).
- **Grade-sep** faces-filtered + stroked-as-asphalt — live re-bake eye. · **Hero-tree LOD** → now the real-DoF cover. · **Render-conformance Ph4–7** — cold-review gate.
- **Section drag-fluidity** (section-perf) · **divided-"d" curb + perimeter faces** (eye-pending the Section/Stage re-bake).

## 🏛 STANDING CAMPAIGNS
- **⭐⭐ The correctness suite — DEFEAT hand-fixing** (the kit's correctness backbone) — see the kit-correctness track above; doctrine `POLYGON-FIRST §5`.
- **⭐ The doc-pristineness campaign (ACTIVE — pristine docs by v1).** The living Process (`docs/agents/BOZ.md`) + `DOC-CODE-COHERENCE`. Done: the HANDOFF prune (27→15); **the whole-corpus accord sweep (2026-06-30) — all non-SHAPE domains (root + cartograph + ls + arborist + meteorologist): stale first-reads bannered, ~10 dead pointers repointed, 3 HANDOFFs retired, orphans indexed (`NOTES.md` 2026-06-30)**. Open: codify the doc-currency mechanism (dated `verified` headers + currency-by-pointer) into `BOZ §3`; the gitignore-`_archive`/`git mv` archiving gotcha; the deferred physical archiving (RUNTIME-DELTA · ls-ARCHITECTURE diary tables · the misfiled cartograph sky-ADRs in `meteorologist/NOTES`). **✅ Drift corrected 2026-07-16 (night-shift standup):** `PIPELINE.md` §5 (the Wall) (was "nothing loads it back / stub" — Survey now consumes the frozen shape via `sectionOpen` for idle display, the 2026-07-14/15 load-forensic work) and `POLYGON-FIRST §0.1/§3-D6a` (was `iA = tile.ring − aFill` at `:1994` — D6a offset landed, `tileGround.js:2728`, carve is fallback only) both **repointed to current**; Check C (producer chain-free) genuinely still RED — that half was accurate and is preserved. **Still open (small live bug):** the **centerline overlay didn't re-hydrate on scene-switch** (stale HPDM lines over the LS map — `dual_hydration_paths_drift`); fix when a scene-switch/overlay-hydration path is next touched.
- **Slider ranges → 0 "Extreme"** (touch-as-you-go, `scratch/AUDIT-slider-ranges.md`). New channels (DoF/Focus/lantern/archLight) born to it.
- **Forensic audit + productization → Show Bible** — LANDED (`_archive/AUDIT-MATRIX-DIARY-2026-09-13.md` master matrix + `SHOW-BIBLE.md`). Remaining: execute the removal queue (🧊 **post-v1 only**); route Tier-1/2/4 into `plans/`; re-audit the held ribbons/corners zone; build out `OPERATIONS` as T3 lands.

## 🛠 LIVE HANDOFFS — the live briefs (dispatch layer)

> Honest labels (`DOC-CODE-COHERENCE §Landed-forensic`): `landed` = ancestor-of-HEAD + code-path-live · `eye-pending` = code-landed, unconfirmed on the lit app · `⚠️ NOT landed` = claimed but absent. The 12 landed/OBE/folded briefs are in `_archive/handoffs/` (dated).
>
> ⚠️ **Two different layers, two different homes.** `HANDOFF-*.md` (this table) live in the **gitignored `_handoffs/`** folder — local-only, not in git. Root **`BRIEF-*.md`** are git-tracked campaign briefs; when one lands it is captured below and **deleted** (git is its archive, `BOZ §3`).

### ✅ Retired BRIEFs — outcome captured; the file moves to `cartograph/_archive/`, dated (⚠️ early rows were DELETED and git holds those)

| Brief (deleted) | Outcome | Refs |
|---|---|---|
| **BRIEF-phase2-C-identity-and-honest-bake** | ✅ **LANDED 2026-10-04 (Seal)** → `_archive/BRIEF-phase2-C-identity-and-honest-bake-DELIVERED-2026-10-04.md`. Authoring reads identity from source, Preview and the Ward from the baked manifest, which the bake now writes (`b8e0c3f8`, `639cf7a8`); one `tenantOf`/`titleOf` (`src/lib/townRecord.js`), re-exported through `Town.jsx` (Ward `9fe915e`, pin `0bf9ec49`); the bake refuses a missing/unreadable design and flat terrain, and a town's fields come from one file (`8e5706f4`); seeds strip other towns' values, Huron's parkTitlePos and LS's browse box removed from source (`05c76f49`, `41bb298a`); `manifest.json#files` lists only published files (`8849a0da`); Altadena has its own identity (`49fc9fde`). ⏳ **Remains, clears on re-bake:** `claims-no-town-carries-the-mould` red on BAKED `scene.json` (browse box, 4 towns) and Huron's `labels.json`; manifests list unpublished files until their next bake. Altadena needs a mark (Jacob) and a re-bake. The 6 identity fields await Ward readers as features land. | ▶ `claims-a-bake-reads-design-through-one-reader` · `claims-no-town-carries-the-mould` · `claims-the-ward-reads-what-the-manifest-bakes` |
| **BRIEF-runtime-continuity** | ✅ **DELIVERED 2026-10-04 (Thread)** → `_archive/BRIEF-runtime-continuity-DELIVERED-2026-10-04.md` (⭐ **holds Jacob's Phase 2 spec verbatim**, the authority for tranche 2). The continuity map is `scratch/runtime-continuity/MAP.md` (+ probes): every handoff Designer → Stage → Bake → Preview → the Ward, fields classed, duplicate authorities / reconstructions / silent substitutions / rot listed, `instance.js` answered, the camera traced, 9 checks proposed. Its rows became **tranche 2: four briefs, `docs/briefs/BRIEF-phase2-{A-where-am-i,B-camera-authority,C-identity-and-honest-bake,D-preview-parity-and-live}.md`** (A, C, D in parallel; B after A). Rulings it produced: the Ward is traced in full; the map switcher is out of Phase 2; `browseFrame` is wired; the Ward reads the baked identity fields. | ▶ `scratch/runtime-continuity/MAP.md` |
| **BRIEF-rename-hpdm-to-its-address** | ✅ **LANDED 2026-10-04 (Tamp)** → `_archive/BRIEF-rename-hpdm-to-its-address-DELIVERED-2026-10-04.md`. HPDM is `hipointedemun` end to end (map, Ward, slab, Look, instance), **promoted to hipointedemun.online**; 196 listing ids byte-identical; `staging/hipointe-demun/…` 301s by data (`staging/renamed.json`); the old staging slab is swept. ⭐ **The class it closed: every backend now keys a town by a sealed OPAQUE id** (`cartograph/data/<map>/town-id.json`, Jacob's ruling) across the Apps Script tenant (@71), Operations (D1 + publish key), the Ward and the kit; the listing prefix comes from the registry. Each town's data moved once, counts equal before and after. ⏳ `LEGACY_LOOK_TENANT` holds LS alone, until its cutover. ⚠️ Owed: `apps-script/Code.js`'s one-shot migration section says *"DELETE THIS SECTION once migrateToTownIds() has run clean"*, and it has. | ▶ `node checks/claims-a-town-has-one-sealed-id.mjs` · `node checks/claims-the-legacy-look-table-dies-at-ls-cutover.mjs` |
| **BRIEF-roundabout-is-one-ring** | ✅ **LANDED 2026-10-03 (Gyre, `d9f367cd`)** → `_archive/BRIEF-roundabout-is-one-ring-DELIVERED-2026-10-03.md`. `weldRoundabouts` (`skeleton.js`, `SKELETON §3` step 7c) welds OSM's `junction=roundabout|circular` pieces into one closed chain, plus implied `oneway`. HPDM: 8 one-ring + 1 service path; every island a ① block owned by its loop; Jacob's eye in Survey: *"RAs look good."* ⏳ **LS · altadena · lafayette-square-staging still print STALE** until each is re-skeletoned. ⚠️ Open, noted by Gyre: a NAMED split roundabout could be mis-paired as divided by `analyzePhases` (no current scene has one); A19's named half looks unbuilt. | ▶ `node checks/claims-a-roundabout-is-one-ring.mjs` |
| **BRIEF-hpdm-identity-lock** | ✅ **LANDED.** `fetch-msbf.js` now consults a per-scene **centroid-keyed registry** (`msbf-identity.js` — `loadRegistry`/`assignIds`/`saveRegistry`): a known footprint keeps its permanent id, a new one appends off a persisted `highWater`, a dropped one stays reserved. **Nothing is ever renumbered** — verified 13,427→8,460 footprints, zero renumbers, 9/9 checks. This is `EXTENT-DESIGN §6` step 2 and the thing between HPDM and "safe to hand a customer." | `ca2db7ca` + `8c1b65ae`; fact → `ARCHITECTURE §Extent` "THE IDENTITY LOCK" |
| **BRIEF-dead-end-leg-flip-and-slope** | ✅ **BOTH THREADS LANDED 2026-07-22.** (a) **cap SLOPE** — the transition quad was *hard-coded* to one arrangement, correct only for a treelawn-Y leg and painted backwards for a walk-at-curb one; now derived per shoulder from each end's RESOLVED materials, smoothstep-eased. *(This is why smoothstepping alone read pixel-identical the cycle before — the shape was wrong, not the edge.)* (b) **LEG flip** — two roots closed: the ribbon folds on itself at a dead end (v2 emitted one fe under one side token, 46/50 caps) and both legs share a centreline under a symmetric claim stroke. Legs responding **56 → 93 of 100**. (c) Found while verifying: **width collapse** — `tileGround.js:3216` wrote both directed keys, leaving 22/48 chains one-sided. **Open tail:** 7 legs unresponsive, 7 caps no-visible-change (pre-existing), 10 asymmetric caps ACCEPTED by Jacob's eye. | fact → `SECTION.md §6` / `RIBBONS.md`; successor thread = the MOUTH co-claim |
| **BRIEF-dead-end-mouth-junction** *(retired-in-place — file KEPT, not deleted)* | ⛔ **RETIRED 2026-07-22 into `cartograph/_archive/BRIEF-polygon-asks-the-stamp-2026-07-30.md`** — do not dispatch separately. The mouth stub is a **CO-CLAIM, not a gap** (~15 m²/mouth across 2 layers), so it is an *identity* defect, not a fill one; the junction-band cannot gate it. ⛔ **Never FILL-patch it.** ⚠️ Waverly (loop×loop, E2/E3) is a **different class** — the mouth fix won't touch it. ⚠️ **The file stays at root** because its §3 measurements are the **evidence appendix** the stamp brief (ARCHIVED 2026-07-30) cites (`cartograph/_archive/BRIEF-polygon-asks-the-stamp-2026-07-30.md §141`); deleting it would strand an open campaign. Retire it when the stamp brief lands. *(Its §4 fix direction IS superseded — read §3 only.)* | harness `scratch/cap-mouth-classify.mjs`; live thread → `cartograph/_archive/BRIEF-polygon-asks-the-stamp-2026-07-30.md` |
| **BRIEF-extent-excavation-and-design** | ✅ **DELIVERED** — produced both of its artifacts: **`_archive/EXTENT-EXCAVATION-DIARY-2026-09-13.md`** (the evidence layer, agent Marl) and **`EXTENT-DESIGN.md`** (the design of record, ratified with Jacob 2026-07-22). The brief is fully superseded by its own outputs. | → `EXTENT-DESIGN.md` (design) · `_archive/EXTENT-EXCAVATION-DIARY-2026-09-13.md` (evidence) |
| **BRIEF-coastal-hood** | ✅ **LANDED 2026-09-20**, eye-gated by Jacob on huron. All three DONE criteria met: the lake draws as a filled positive object, the land between the last street and the shore draws as land, and the waterfront streets are painted as streets. ⭐ **The ruling that closed it: the coast is a CHAIN, and the frame is the bb.** The coast had been an **area clip** — one owner for all 1,177 of its edges, `side:'right'`, no landward side — so nothing could meet it; a street carries 4 owners for 2 points. Now two objects: the closed ring is the lake face (shoreline + bb), the OPEN arc is expanded at ε like any chain. And the frame moved from the ink bbox to the bb, which is what actually closed it — Overpass returns whole ways, so the ink bbox was 20.6 km against the shoreline's 9.9 km and the coast ended **4.2 km short of the frame**. ▶ coastal streets bounded only by the exterior **43 → 0**; largest block **341.87 km² (the frame itself) → 5.04 km²**; asphalt rings **20 → 410**. ⛔ **CARRY THE FAILED CONSTRUCTIONS — six now, each cost hours:** ① water as a replacement boundary (inverted the SSoT, R15; 19 spurious perimeter blocks) · ② the coast stroked as a CLOSED ring (square → filled, circle → annulus, Lake Erie → 3 fragments — the open arc is the safe case and is what we stroke) · ③ water as a closed subject in the ink (becomes ink, does not partition) · ④ two-stage `rect − water` fed back as subject (Clipper returns a FLAT LIST; re-entering loses the hole's orientation and the frame silently refills) · ⑤ a separate `remainder` class (it is just a block) · ⑥ **the area clip with no landward side** (drew correctly and could not be met — the one that survived longest, because it looks right). ⚠️ **Open tail, none of it evident on screen:** the non-coastal re-pour check (`ROADMAP` H-4 — every town's ink spills past its bb), water SHADING (unblocked now the shape is confirmed), `MapLayers.jsx` water skip (`H-8`), colour for unparcelled land (tabled). | `00c6bfe2` → `616810e5` (code) + `86c3520a` (FEATURES); doctrine → `RIBBONS.md §1`; open → `ROADMAP` H-4 |
| **BRIEF-shadows-are-ls-sized** | ✅ **LANDED 2026-09-20/21** → `_archive/BRIEF-shadows-are-ls-sized-DELIVERED-2026-09-21.md`. Both defects closed: ① every in-shader-displaced caster carries a `customDepthMaterial` — ⛔ **never a regression, the shadow pass had NEVER been correct for one**, worst on the hilliest town and mildest on flat LS; ② the frustum, the bias pair and the softness unit all read from the town instead of from LS's 892 m. ⭐ **The transferable decision: texel-snapping the POSITION is only half the job — the SIZE must be quantised too**, or every shadow edge in the scene jumps to a new grid at the same instant (a whole-frame flash, not judder). ⚠️ **Eye gate OWED — `ROADMAP` H-14.** ⛔ The frame rate is not this and is open (`H-9`). | `3dcb5dd3` + `ff8cf53a`; doctrine → `ARCHITECTURE §8 Cast shadows`; knob → `OPERATIONS §Light & Shadow`; capability → `FEATURES.md` |
| **BRIEF-subtract-the-overlays** | ✅ **LANDED AND THEN SUPERSEDED THE SAME NIGHT** → `_archive/BRIEF-subtract-the-overlays-DELIVERED-2026-09-21.md`. The pairwise cut landed and was eye-gated (*"That did it and it looks great"*) — face ∩ overlay to zero above 1%, and the slab got **smaller** (1.59M → 1.42M tris). ⭐ Jacob then relocated it: *"press it all down"* on the way out of 2D, so `flattenPaintStack` does the whole stack and **the pairwise cut was DELETED, not kept beside it.** ⭐ Its own hard-won rule survives as doctrine: **a key joins the shared plane only on a measurement comparing it against EVERYTHING already on the plane.** ⚠️ Its one wrong call: `stripe` cut and **194 m² survived** — cause not established, `ROADMAP` H-10. | `d793e4d4` → `4c630ebc` → `5a0d8bb9`; doctrine → `ARCHITECTURE §8`; operator half → `OPERATIONS §Bake` |
| **BRIEF-two-bodies-two-lights** | ✅ **LANDED 2026-09-20** → `_archive/BRIEF-two-bodies-two-lights-DELIVERED-2026-09-21.md`. The sun→moon position lerp is deleted; two lights at two real body positions, brighter casts, and the drawn orb no longer inherits a phantom azimuth at 83× too close. The check was **written red first**, as the brief demanded. ⭐ **It went further than asked, on Jacob's ruling that every light needs an operator knob:** the fixed fills became hemispheres (irradiance-only), which makes the invariant assertable — **only the sun and the moon have a specular lobe, so a bright path on water is EVIDENCE OF A REAL BODY.** ⛔ Every "sun path" screenshot before that night was `floorDir`, a fill nailed due north in every town for all time. ⚠️ **Eye gate OWED at the crossover hour, and night will look different — `ROADMAP` H-15.** | `972803ba` (brief) → `d360d749` + `5e655ecc`; register → `ls/FEATURES.md`; check → `claims-the-key-light-is-a-real-body.mjs` |
| **BRIEF-canon-sweep** | ✅ **RUN 2026-07-23** (this sweep). §1 FEATURES+OPERATIONS and §2 the Extent accord closed; §3 retirals captured here; §4 dead-end fold + BACKLOG trim done. Key finding: the 2026-07-20 retraction had **never landed in the procedures** — only the banners. | `dd197e06` + this commit; writeup → `NOTES.md` 2026-07-23 |

| Brief | Arc | Status |
|---|---|---|
| **park-path-unify** | unify park-path ribbon construction/render | dispatch-ready 2026-06-27 (was orphaned — indexed 2026-06-30); detail `scratch/PARK-PATH-FORENSIC.md` |
| ~~animator-unify~~ | drop the animate toggle, always show ToD chips | ✅ **LANDED + RETIRED** → `_archive/HANDOFF-animator-unify-LANDED-2026-06-28.md`. The shipped behaviour is canon in `OPERATIONS.md §"How to operate any TOD channel"` (chips always on, no arming step). *(The 2026-06-30 "no landing evidence, verify-then-act" note was stale — the archive says landed 2026-06-28.)* |
| **preview-measurement** | publish-confidence instrument | device-profile SSoT landed; **real per-tier numbers = the gate** |
| **render-conformance** | Stage↔Preview↔Production parity | Ph1–3 landed; Ph4–7 open (cold-review) |
| **mobile-profile** | what ships to mobile (3 homes) | sensing done; B/C/E open (Preview-authored inclusion) |
| **channel-variant-cascade** | per-shot + per-platform channel values | design-doc first; **lands LAST** (highest convergence) |
| **authoring-session-hardening** | restore-where-left · safe bake · one camera home | Ph1–3 landed; Ph4 (camera) + Ph5 (docs) open |
| **section-perf** | the FILL re-stroke perf | #1/#2/toggle landed; drag-fluidity eye-pending. ⚠️ Brief lives at `cartograph/_archive/HANDOFF-section-perf.md` (not `_handoffs/`) |
| **dead-end-cap-wrap-curb** | curb break wrapping the round cap | ⚠️ **no brief file exists** (index-only row — not dispatchable until one is drafted, `BOZ §3`). Detector-flagged sub-8 m² clusters (2026-07-22), **NO visible symptom** on Jacob's eye; low pri |
| **curve-primitive-skeleton** | curves as beziers | Ph1/2.1 landed; **v2 (loops/divided) open** |
| **junction-construction** | intersection-everywhere | metadata spans every node; geometry divided-only |
| **band-fold-fix** | G12 thorn clamp | ⚠️ **NOT landed** (`8e1e414` stranded) |
| **freeze-the-curb-in-the-first-bake** | freeze the curb polygon | "d" instance landed; the freeze program PARKED (rebuild-gated) |
| ~~boundary-trio~~ | circle-SSOT · crop-last · cull | ⛔ **SUPERSEDED 2026-07-21** → `_archive/HANDOFF-boundary-trio-SUPERSEDED-2026-07-21.md`. ⚠️ **Do not mine it for doctrine** — its "one idea" was *"the circle is the real boundary, derive the bbox from it,"* the baldest statement of the RETRACTED model in the repo, and it also called to "retire the manual toggles" (contradicting the durable per-building override). Live home: `EXTENT-DESIGN.md`. |
| **tile-T3-authoring** | authoring → Survey (off figure-ground) | open; gates T4 (delete figure-ground) + the rename |
| **tile-feature-ledger** | re-pour definition-of-done ledger | tracking; construction side ✅, T3/T4/slab-content open |
| **cloud-specialist** | cloud morphology renderer | TABLED (flagship IP; the agentic Tuner loop is the design — `meteorologist/TUNER.md`) |
