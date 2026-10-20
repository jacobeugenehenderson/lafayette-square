# BRIEF — the classifier

**You are the dispatched agent. Name yourself:** one word, yours, and not one a RUNNING session holds (check with
`ListAgents`, then `/rename`). **Agent: FRESH**: the work needs eyes not anchored by the months of chain-world work.
Boz is your report line (`SendMessage`).

*Jacob, 2026-10-19 ("write the master classifier brief"); written by Boz. §5 was ruled by Jacob on 2026-10-19;
Pass A landed as 6429ac08 and 42bcc360. It depends on `scratch/style-guide/STYLE-GUIDE.draft.md`, which is a draft and replaces nothing yet.*

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
  - ⛔ **Never a street name, never a list, never a distance lookup** (the second wall, `PIPELINE §6a`).
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
2. One island class for every median and sliver: no walk, no lawn, its surface set by the town norm.
3. Slivers: by topology first (a face bounded by a divided pair), with ①'s centreline-to-centreline width as a back-up selector.
4. An untagged dead end is BLUNT; turning_circle/turning_loop selects round.
5. The guide's per-class walk/lawn widths become the kit house style (towns override in norms). Also the 6 in kerb and perpendicular cuts, already ruled.
6. Offset junctions: no spacing constant. Jacob's addition: "street name should dictate whether it's in the same chain". Boz's reading, not yet confirmed with Jacob: two T's form one offset junction when the two stubs carry the same street name (one street jogging across), otherwise two T's. A name groups; it never makes a class.
7. Keep `indoor` and `services-area`, and add them to the guide.
8. A named service road is NOT a lot aisle by default. The name can't decide it, though, so show Jacob a few cases (Holiday/Willow/Lagoon Lane, Holden St, Bluff Terrace) and propose a tag-based rule.
9. Mixed classes under one name are RED only across networks (e.g. a footway in a street chain). Within a network, each piece carries its own class.
10. Motorway/trunk: one `highway` class with a lamp sub-key.

## 5a · This dispatch: Pass A, classification only (until §5 is ruled)

- **Read first:**
  1. `CLAUDE.md` Layer 0, `ORIENTATION.md`, `README.md §⭐ START HERE`;
  2. this brief;
  3. `scratch/style-guide/CLASSIFIER-SITES.md` and `AUDIT.md`;
  4. `STYLE-GUIDE.draft.md` §0, §1 and §4. This is the vocabulary; it is a draft and replaces nothing.
  5. `PIPELINE` step 3 and §6a.
- **Build:**
  - the one vocabulary table;
  - `class` · `classRung` · `classReason` on every chain, decided in `skeleton.js` before `groupByName` /
    `seedSection`; an unknown class refuses by name;
  - the check's Pass A part, mutation-tested.
- ⛔ **Change no paint.** The consumers keep their behaviour until §5 is ruled; say in each commit that the old sites
  still stand.
- **Then STOP and report:**
  - the class counts per town;
  - the rewiring plan per consumer (its symbol → the class column it reads → the old site it deletes);
  - the §5 ruling each step needs.
- **Where:** a worktree at `.claude/worktrees/classifier`, on a new branch `classifier` from
  `docs/conformance-2026-09-21`.
  - ⚠ `boz/hpdm-gate` has diverged from it (about 80 commits each way; `tileGround.js` differs by about 1,100 lines),
    so touch `tileGround.js` not at all without asking Boz.
  - ⛔ Not the legacy chain shape pass (a separate retirement).
  - ⛔ Not derive's `roadId`.
- **The house rules:** `CLAUDE.md`, plus the machine-wide heavy-job gate:
  - start at ≥70% free and load <8, abort <30%, explicit heap;
  - ask Boz before a heavy run;
  - a one-town skeleton + derive pour is heavy.

  ⛔ Never write `cartograph/data/lafayette-square/clean/`, nor any town's `clean/`, without Boz. No bake, Publish,
  Stage or Promote. Commit by pathspec, never push, and name the register in every commit.

## 6 · Done when

- §1 confirmed against the code and §5 ruled.
- Both passes built, the check GREEN on all five towns or every red named and owned, the old sites deleted.
- Pictures for Jacob: Commercial Street, an island in JH, a plaza in HPDM, and a tagged versus untagged dead end.
- **Register:**
  - `OPERATIONS`: the vocabulary, how to override a class, and what refuses;
  - `FEATURES`: the kit recognises what each piece of street-scape is.

  The superseded rulings move to the Diary when the guide is accepted, not before.
