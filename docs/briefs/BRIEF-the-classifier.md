# BRIEF — the classifier

<!-- BRIEF-STATE
status: OPEN
dispatched: no (§5b, step 7 — OPEN). Pass A was dispatched to Tally and delivered (§5a, in the Diary).
written: 2026-10-19 · §5b 2026-10-20
evict-when: RULING: Pass A, step 7 (resolvePedDepths, the shared surface, island paint) and Pass B have landed, and Jacob has seen the pictures after step 7.
-->

**You are the dispatched agent. Name yourself:** one word, yours, and not one a RUNNING session holds (check with
`ListAgents`, then `/rename`). **Agent: FRESH**: the work needs eyes not anchored by the months of chain-world work.
Boz is your report line (`SendMessage`).

*Jacob, 2026-10-19 ("write the master classifier brief"); written by Boz. §5 was ruled by Jacob on 2026-10-19;
Pass A landed as 6429ac08 and 42bcc360. It depends on the street style guide, canon since 2026-10-20: `cartograph/STYLE-GUIDE.md`.*

## 0 · What this is for

The style guide's method is **classify → symbolise → join; data selects, never measures; the operator overrides.** The
audit of the code against it (▶ `scratch/style-guide/AUDIT.md`, Lath, 0af6df9f) found 23 OPPOSITE rows, and nearly all of
them have one root: **the pour never classifies.** What it does not recognise, it draws as an ordinary residential street.
This brief builds the missing step: **one closed vocabulary, decided once, carried as data, read by every consumer.**
The vocabulary is the guide's; the brief is the plumbing.

It is **not** a new engine and not a rewrite. The pieces exist, scattered; this collects them into one table and one
place, and **deletes each old site in the same commit** that replaces it.

## 1 · Premises (from the audit; confirm each against the code before building, and say what you found)

The row numbers are AUDIT.md's.
- **At least eight silent residential fallbacks** (worst 1; Lath re-checked by symbol, 2026-10-19):
  - `skeleton.js` `seedSection` and `chainHighway` (`|| 'residential'`);
  - `derive.js` `mapHighwayToStreetType` (default `'residential'`; it also maps `living_street`, `path` and `track` to
    `'residential'`), and its inline duplicate in the alley-trim ROW reach;
  - `streetProfiles.js` `measureFromSeed` and `defaultSideMeasure` (`TYPE_PAVEMENT_HW[type] || residential`);
  - `standards.js` `getStreetSpec`;
  - `src/cartograph/measureModel.js` `defaultMeasure(st.type || 'residential')`.

  So `living_street` gets a curb, a lawn and a walk (1.f, 3.a, 3.d). Footway, service, pedestrian and cycleway chains
  paint no band (`terminal 'none'`), but they get a residential carriageway. Per-town counts: ▶ `node -e` over
  `clean/skeleton.json`, `highway` vs `seed.seededClass`.
- **A name makes a street.** `skeleton.js` `groupByName` has no class test and no area test. A named plaza, footway,
  pedestrian or service way becomes a chain with a residential carriageway (worst 2; 1.g, 1.h, 1.j, 9.a).
- **`area` is read nowhere** in `skeleton.js`, `derive.js` or `src/lib` (1.h).
- **Class does not reach the band.** `tileGround.js` `resolvePedDepths` reads only `pedRealm === false`. A side whose
  profile says `terminal:'none'` still paints 1.5 + 1.5 (worst 3), and every class paints the same 1.5 / 1.5 (1.b2–1.d2).
- **No feature class at ①.**
  - Medians and slivers paint as blocks: there is no width rung, only `tooNarrow` (worst 7; 4.i).
  - Island and nose rules have no consumer (worst 8).
  - Every degree-1 tip is `round` (`caps?.[k]?.cap || 'round'`, at two sites in `tileGround.js`; worst 9).
  - `turning_circle` / `turning_loop` **is fetched and never read.** It is in `osm.json` `pois` for Huron, JH and
    PTown. LS's and HPDM's `osm.json` predate the bucket and need a re-fetch. The gap is the READ: a pois → tip join,
    by lon/lat, since ways keep no node ids.
- **Two per-street lists are live**, both LS proper nouns on every town's pour:
  - `derive.js` `LOOP_STREET_NAMES` (worst 10);
  - `skeleton.js` `EXCLUDE_FROM_STREETS` ('MetroLink Green Line', '21st Street Cycle Track').
- **The rewiring surface:** about 40 sites in 14 files read the raw `highway` tag themselves or keep their own class
  set. Among them are about 13 copies of a "highway" or "major" set (`skeleton` · `derive` · `standards` ·
  `streetProfiles` · three in `tileGround` · `seed-centerlines` · `survey` · `extend-centerlines` · lamps · `serve.js`
  label tiers · the browser panels). They collapse to columns of the one table. The site list is in
  `scratch/style-guide/CLASSIFIER-SITES.md` (Lath, 2026-10-19); re-derive it by grep before building. ⚠ `PRE_A19_UNNAMED` is an authoring-key ordering, so it must
  survive as ordering.
- **What a chain carries today** (▶ `node -e` on any `clean/skeleton.json`): `highway` (the raw tag), `oneway`, `layer`,
  `bridge`, `tunnel`, `gradeSeparated`, `phase`, `segments`, `caps`, and so on. There is **no class field**. Each
  consumer re-interprets `highway` itself.

## 2 · The design: two passes, because classes come from two kinds of evidence

### Pass A · WAY CLASS, from tags, in the skeleton, before ① is minted
- **Where:** `skeleton.js`, before `groupByName` and before `seedSection`, over every OSM way the pour admits.
- **Input:** the way's tags. Plus node tags where a class needs them, e.g. `turning_circle` on a tip, which is
  already in `pois` (§1). LS's and HPDM's re-fetches are Jacob's.
- **Vocabulary:** the guide's §1 list (street classes, living street, pedestrian, alley, service, lot aisle, plaza /
  `area=yes`, path, highway and link, not-built). It is closed: a way whose tags match no entry **refuses the pour by
  name**, never becomes `residential`.
- **Output:** `chain.class`, plus `classRung` (`authored | data | norm | kit`) and `classReason` (the tag or tags that
  decided it).
- **Rules:**
  - A name may **group** ways into one chain only within one class. It never **makes** a class.
  - An area class (plaza) never becomes a chain; it enters as an area fill (guide §9).

### Pass B · FEATURE CLASS, from ①'s topology, still width-free
- **Where:** at the mint or immediately after it (`tileGround.js` `mintProtopolygon`, or a pure pass over its output),
  before ② reads a width.
- **Vocabulary:**
  - **faces:** block · island/median · sliver *(see Q-B1)*;
  - **tips:** dead end × cap style;
  - **crossings:** junction kind (T · cross · skew · multi-leg · offset · name change · through-node);
  - the rim.
- **Evidence:** ①'s labels only.
  - A face bounded entirely by street-owned edges of a divided pair is an island.
  - A degree-1 tip with its tag picks a cap style.
  - Leg count and the angles at a crossing give the junction kind.
  - ⛔ **Never a street name, never a list, never a distance lookup** (the second wall, `cartograph/_archive/PIPELINE-superseded-2026-10-21.md §6a`).
- **Output:** a class on every face, tip and crossing, carried in the frozen record beside the existing
  `labels / owners / crossings`. It is read by ②/③ and the paint, never re-derived downstream.

### Both passes
- **The ladder:** authored → data → town norm → kit house style.
  - Authoring a class is an override keyed exactly as authoring is today (`skelId · side · segOrd`; a face by its ①
    identity, ⛔ never a tile index).
  - A missing rung prints **by name, per pour**.
- **The consumers rewired to read the class**, each with its old site deleted:
  - `seedSection` reads the class's section;
  - `resolvePedDepths` reads the class's band;
  - the cap reads the tip class;
  - the median paint reads the face class;
  - the alley trim reads the class, and `LOOP_STREET_NAMES` goes.
- **Deleted when each lands:**
  - every residential fallback in §1 (all eight; Pass A is not done while one is open);
  - `EXCLUDE_FROM_STREETS`;
  - `groupByName` as a classifier;
  - `PATH_CLASSES` / `STREET_CLASSES` as separate filters (they become rows of the one table);
  - `detectTileCaps` as a source of identity;
  - the degree-1 `round` default;
  - `tooNarrow` as the only median floor;
  - `LOOP_STREET_NAMES`.

  The four cross-section tables (AUDIT §8) collapse to the one the class reads.

## 3 · The check (the deliverable)

`checks/claims-every-feature-is-classified.mjs`, which reads the frozen record and the vocabulary table, never a copy
of either.
- **It prints, per town:**
  - the count per class and per rung;
  - every **unclassified** way, face or tip, by place;
  - every **contradiction**, e.g. a living street with a curb, a plaza as a chain, an island painted with a walk.
- **RED** on any unclassified feature or contradiction.
- **Mutation-tested:** a residential fallback put back, a name-made chain, and a dropped tip tag must each read RED.
- **The external oracle** (instrument only, never a producer): osm2streets' Terminus / DualCarriageway /
  intersection_kind, joined by OSM way id (Loess's T1, `scratch/osm2streets-trial/`, 86dcdce9 / d5aa65b7). Its
  disagreements are the first test set for Pass B.
  - ⚠ The npm build (0.1.4) has no blocks and drops closed ways, so it can't judge medians, blocks or loop streets.
  - ⚠ T1 found that our own two records disagree: `junctionMap` arms ≠ the skeleton's `junctions` degree at 29–210
    nodes per town (▶ `node scratch/osm2streets-trial/jm-legs-vs-degree.mjs`). Pass B takes junction kind from ①'s
    crossings, never from `junctionMap`.
  - On a `--proto` bake, `junctionMap` reaches nothing painted or frozen. It feeds only the legacy chain shape pass,
    which still runs and is then overwritten by ①②③ (Lath, 2026-10-19). Retiring that pass is its own item, not
    this brief's.
  - ⚠ **derive's `roadId` (the same-corridor-join union) is live at ②**: `protoRoadKey` stamps it onto ②'s runs, and
    `classifyCornerLegs` → `sameRoad` uses it to decide bend versus junction (pad and cut). It is the evidence Pass B's
    "name change / through-node" class must read or supersede. ⛔ Never delete it blind.

## 4 · Order

1. **Pass A first.** It is the smaller pass, and Commercial Street (PTown) proves it: living street → a shared surface,
   no curb and no lawn.
2. **Pass B second**, faces before tips before crossings.
3. **For each step:** the code and the deletion in one commit, the check green or each red named, pictures for Jacob
   (before and after, images beside the HTML). One heavy job at a time, by the standing gate.

## 5 · Ruled (Jacob, 2026-10-19, relayed by Boz; recorded verbatim)

1. C1: data SELECTS a style, never measures. lanes/width no longer size the carriageway.
   *Clarified (Jacob, 2026-10-19): "lanes picks the configuration." `width` in metres stays unread.*
   *Boz, interim, pending Jacob on turn lanes: a configuration is any positive-integer lane count the data gives;
   carriageway = count × the class's house lane width. Only a `lanes` value that is not a positive integer refuses,
   by place. Odd counts get no turn-lane treatment yet. An untagged chain keeps 2 lanes (1 if one-way) as the KIT
   rung, carried over from today, not newly ruled, and disclosed per pour. (An earlier line here gave "1, 2, 4 or
   6 lanes … refuses" as Jacob's; that was Boz's illustration, not a ruling.)*
   *Jacob, 2026-10-20: "a lane is a lane for now, but if that's information we're getting we need to make sure and
   not just throw it away." Widened the same day: "We need to make sure we are keeping as much as we take in. This
   is a persistent annoyance." So every chain carries its source ways' full tags per segment (`chain.ways`,
   `chain.segmentWays`, documented in `streetClass.js`). Nothing is dropped except by a named rule that prints per
   pour. Paint reads only the class.*
2. One island class for every median and sliver: no walk, no lawn, its surface set by the town norm.
3. Slivers: by topology first (a face bounded by a divided pair), with ①'s centreline-to-centreline width as a back-up selector.
4. An untagged dead end is BLUNT; turning_circle/turning_loop selects round.
5. The guide's per-class walk/lawn widths become the kit house style (towns override in norms). Also the 6 in kerb and perpendicular cuts, already ruled.
6. Offset junctions: no spacing constant. Jacob's addition: "street name should dictate whether it's in the same chain". Boz's reading, not yet confirmed with Jacob: two T's form one offset junction when the two stubs carry the same street name (one street jogging across), otherwise two T's. A name groups; it never makes a class.
7. Keep `indoor` and `services-area`, and add them to the guide.
8. A named service road is NOT a lot aisle by default. The name can't decide it, though, so show Jacob a few cases (Holiday/Willow/Lagoon Lane, Holden St, Bluff Terrace) and propose a tag-based rule.
9. Mixed classes under one name are RED only across networks (e.g. a footway in a street chain). Within a network, each piece carries its own class.
10. Motorway/trunk: one `highway` class with a lamp sub-key.

## 5b · The next dispatch: step 7, the painter and ② read the class (OPEN, not dispatched)

*Planned by Tally, 2026-10-20, read-only against integration/2026-10-20. Jacob's rulings for it: "yes to all four"
(2026-10-20, relayed by Boz) and the taper run (same night). §5a, the Pass A dispatch, was delivered and is in the
Diary: `cartograph/_archive/BRIEF-the-classifier-5a-pass-A-dispatch-DELIVERED-2026-10-20.md`. The shared surface and
the island paint named in this brief's evict-when are Pass B's (`cartograph/BACKLOG.md`, the 2026-10-20 forward list).*

**Already true (confirm against the code before building):**
- Pass A is landed: every chain carries `class` · `classRung` · `classReason`; ribbon streets carry `class` (513ce90a).
- `streetClass.js#LOCAL_SECTION` = the local row, `street(10, 8, 1.524, 1.524, 4.572)`, the kit's one home for the ped
  depths and the corner radius (Lintel, 4a67bcf8). For now, `resolvePedDepths` and ②'s `baseR` read it for EVERY
  street ("uniform until classifier step 7" at each site). The other rows are frozen into seeds and read by neither.
- `tileGround.js` reads no `.class` anywhere; `protoBase` maps skelId → measure only.
- LS's ribbons are `src/data/ribbons.json` (`scene.js#ribbonsPathOf`, declared), written by `promote-ribbons.js` from
  `clean/map.json`. Its 321 streets carry `highway` and the old `type`, no `class`. LS's frozen `clean/skeleton.json`
  has no class either, but every chain has `sources`: all 321 ribbon skelIds match a chain, and all source ways are in
  `raw/osm.json` (0 missing, 2026-10-20).
- The kerb is one scalar per town: `curb-cut-norm.mjs` `validateKerb` / `resolveKind('kerb', …, { height: 0 })`;
  `bake-ground.js` lifts `kerbH`; `kerbLift.mjs#kerbPlan` tapers flush wherever no curb ring is drawn and throws
  without `taperRun`. Norms: LS authors `{ height 0.15, rampSlope 1:12, flareSlope 1:10, taperRun 1 }`; HPDM, Huron
  and PTown have no kerb key; JH has no `norms.json`.

**Ruled (Jacob, 2026-10-20):**
- a · One `streetClass.json` per town, `skelId → { class, rung, reason }`, built by the pour's own classify
  functions. Every town's painter reads class from that file and nowhere else; a missing file or class THROWS.
  Until LS's exists, step 7 refuses LS by name.
- b · A two-class corner takes the LARGER leg's radius.
- c · The house 6 in kit kerb is built in this step. Huron curbs only its bigger streets (`kerb.byClass`).
- Radii 15 / 20 / 25 ft (local / collector / arterial; the guide maps primary = arterial, secondary and tertiary =
  collector), every corner authorable. The half-leg bound on easing stays.
- The kit taper run is DERIVED, height / rampSlope (1:12, ADA 2010 Standards §405.2): a 6 in kerb gives 1.83 m. A
  town norm may still author it (LS's 1.0 m stays LS's).

**Build (by symbol):**
- **A · the class record.**
  1. `scene.js` gains `streetClassPathOf(scene)`, shaped like `ribbonsPathOf`: the town's declared path, else
     `data/<scene>/clean/streetClass.json`. LS declares `cartograph/data/lafayette-square/streetClass.json` (outside
     `clean/`, tracked).
  2. The record is `{ scene, from: { skeleton, osm, sha256 of each }, classes: { skelId: { class, rung, reason } } }`,
     built by `skeleton.js`'s own `classifyWay` + `classFields`, exported; no copy of the rule.
  3. derive writes it beside `ribbons.json` for poured towns.
  4. For a frozen town, a light script `cartograph/classify-frozen.mjs <scene>` reads the frozen skeleton's `sources`
     and `raw/osm.json` and writes only the declared path. It refuses a target inside `clean/` and refuses any chain
     whose source way is missing from raw.
  5. `buildTileGround` takes `opts.streetClass`. `bake-ground.js` and `src/cartograph/BlockGeometryV2Debug.jsx` (the
     live Survey caller) load it through the resolver; `serve.js` serves it per Look. A missing file, or a ribbon
     skelId absent from it, throws by scene and skelId.
- **B · the painter and ② read the class.**
  6. `streetClass.js` rows: `cornerR` local 4.572 · tertiary and secondary 6.096 · primary 7.620, each citing
     `f-caltrans-corner-radii`. Add `classPed(cls)` and `classCornerR(cls)`; both throw on an unknown class, never
     fall to local. `LOCAL_SECTION` stays only for `skeleton.js`'s survey stamp (C1 doesn't reach it).
  7. `resolvePedDepths(baseMeasure, side, custom, cls)` reads `classPed(cls)`; `resolveProtoMeasure` passes the
     run's class from the record (a skelId → class map built beside `protoBase`).
  8. ②'s base radius: a junction corner takes `max(classCornerR(legA), classCornerR(legB))`; a bend takes its own
     chain's class. Only the two class-seed returns change; per-corner and per-IX overrides, the half-leg bound and
     the clamped-authored print stay. The log prints corners by class pair.
  9. `derive.js`'s `STANDARDS.sidewalk.width + STANDARDS.treeLawn.width` sites (8) and `standards.js`'s
     `LOCAL_SECTION`-backed `STANDARDS.*` are replaced by `classPed` of the street's class, and deleted.
- **C · the kerb.**
  10. `curb-cut-norm.mjs`'s kit rung becomes the house kerb: height 0.1524 m (`r-house-kerb-height`), rampSlope 1:12,
      flareSlope 1:10, and taperRun = height / rampSlope, computed at that site with a comment citing ADA 2010
      §405.2. Add a registry finding `f-ada-ramp-running-slope`: the verbatim §405.2 text read from the source, its
      URL, the date and the reviewer; `approvedBy` left unset for Jacob. Every rung prints per pour.
  11. `validateKerb` accepts `byClass { class: height ≥ 0 }`. `resolveProtoMeasure`'s `curb` becomes per run: 0 where
      the run's class kerb is 0, so no curb ring is drawn there and `kerbPlan`'s curbless path tapers it flush. The
      bake's `kerbH` becomes per block edge from the same rule.
  12. Norms: Huron gets `kerb { byClass: { local: 0, living-street: 0 } }` on the kit height. HPDM and PTown take the
      kit kerb; JH takes the kit rung, disclosed. LS's authored 0.15 m is unchanged.

**Checks (each mutant must go RED):**
- `claims-a-look-authors-its-curb-width` §5, rewritten: every street row's `cornerR` equals its ruled value with its
  finding id; `resolvePedDepths` for a primary, secondary and local run returns that row; the base radius is no single
  constant. Mutants:
  - `LOCAL_SECTION.cornerR` back as the base radius;
  - `resolvePedDepths` ignoring class;
  - a missing class falling to local;
  - a literal 4.5 / 7.5 in a row;
  - the smaller leg's radius at a two-class corner;
  - a missing `streetClass.json` (the painter must throw);
  - a class read from ribbons' `highway` (a source scan for `.highway` / `.type` in the painter and ②, plus a run that
    deletes the record but keeps `highway` on ribbons, which must still throw);
  - `classify-frozen.mjs` writing into `clean/` (it must refuse).
- `claims-the-pour-reads-the-towns-norm`, with mutants:
  - `byClass` ignored;
  - the kit kerb back to 0;
  - a literal taperRun at the kit rung;
  - the kit rampSlope changed without the kit taperRun moving with it.
- `claims-every-feature-is-classified --record`: every record entry equals what `classifyWay` gives from raw tags,
  and the record's hashes match its inputs (stale → RED).
- The existing `resolvePedDepths` callers (`claims-a-cap-carries-one-section`, `claims-a-frontage-can-ask-for-no-ped-band`)
  pass the class.
- `claims-references-are-sound` stays sound with the new finding row.

**Order:**
1. rows + resolvers;
2. the record + `classify-frozen.mjs`;
3. painter and ②;
4. derive;
5. kerb;
6. checks;
7. LS's record written (light);
8. re-derive HPDM, Huron, JH and PTown (heavy: Boz's slot, one town at a time, by the standing gate);
9. a paint diff per town;
10. pictures for Jacob.

**What will repaint:** every unauthored arterial and collector edge in every town (LS: 44 chains are primary or
secondary): walk 6 / 8 ft, lawn 4 ft, corners 20 / 25 ft. Also the towns gaining the 6 in kerb, and Huron's local
streets going curbless. Authored `blockCustoms` still win.

**Registers:**
- `FEATURES`: each street draws to its class (walk, lawn, corner radius and kerb), all overridable.
- `OPERATIONS`:
  - Corners: the 1× baseline is per class; a two-class corner takes the larger.
  - Section: unauthored depths are per class.
  - Kerb: the kit is 6 in, its taper run is height × 12 (ADA 2010 §405.2), and a town norm can set `kerb.byClass`.
  - Pour: `streetClass.json` per town; `classify-frozen.mjs` for a frozen town.
- To the Diary: the "uniform until classifier step 7" lines (`tileGround.js` ×2, `skeleton.js`, `RIBBONS`, `SECTION`,
  `standards.js`) and `STYLE-GUIDE.md` §6's ⚠️ about the unread per-class radii.

**The house rules** are §5a's (now in the Diary), and these bind this step:
- ⛔⛔ **Never write, move or regenerate `cartograph/data/lafayette-square/clean/`.** LS gets its record from
  `classify-frozen.mjs` outside `clean/`, and a ground bake only. No other town's `clean/` without Boz.
- `CLAUDE.md`, plus the heavy-job gate: start at ≥70% free and load <8; abort below 30%; set an explicit heap; ask Boz
  before a heavy run.
- No bake, Publish, Stage or Promote. Commit by pathspec, never push, name the register in every commit.
- Build only on Boz's go.
- ⛔ Not the legacy chain shape pass. ⛔ Not derive's `roadId`. Stay out of derive's junctionMap IIFE and `ribbons.tiles`.

## 6 · Done when

- §1 confirmed against the code and §5 ruled.
- Both passes built, the check GREEN on all five towns or every red named and owned, the old sites deleted.
- Pictures for Jacob: Commercial Street, an island in JH, a plaza in HPDM, and a tagged versus untagged dead end.
- **Register:**
  - `OPERATIONS`: the vocabulary, how to override a class, and what refuses;
  - `FEATURES`: the kit recognises what each piece of street-scape is.

  The superseded rulings move to the Diary when the guide is accepted, not before.
