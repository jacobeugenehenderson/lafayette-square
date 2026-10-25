# The Kit's Street Style Guide

*Canon from 2026-10-20 (moved in from `scratch/style-guide/STYLE-GUIDE.draft.md`, Jacob: build the style guide around
the permitted sources). An entry marked **RULED** is Jacob's ruling and binds the kit. An entry without it is a
proposal (`[P]`) still open; §15 lists the open questions, and §14 the conflicts with older canon, each to be settled
there and never by quiet edit. Forward work from the rulings lives in `cartograph/BACKLOG.md` (§ "Forward list").*

> **How to read the tags on a value.**
> `[F f-id]` a finding in `references/registry.json`, quoted from a permitted source ·
> `[R r-id]` or `[R doc §]` a ruling of Jacob's ·
> `[H r-house-id]` the kit house standard (Jacob approved the table on 2026-10-17) ·
> `[C file#symbol]` what the code does today ·
> `[P]` this draft's proposal, open for Jacob; with no `[F]` beside it, a `[P]` is also `[U]` ·
> `[U]` no permitted source is cited: our own design choice. Beside an `[R]` or `[H]` tag it is a choice Jacob has
> ruled; alone, one nobody has made yet. ⛔ A `[U]` is never a citation, and neither is `[C]`, `[R]` or `[H]` alone.
> **Sourcing (re-anchored 2026-10-20 on the permitted set):** a cited value reads `[F f-id → source-id, section]`,
> where `source-id` is a `permitted` row of `references/registry.json` and the section is the finding's `where`. A value
> inside a cited range cites that range; a value outside it keeps its draft value and is listed under §16 "Contradictions".
> A number from a census carries the command that reproduces it. Re-run it rather than quoting it.

---

## 0 · The method (one page)

**We do not promise survey truth. We draw a legible, beautiful picture of a street, the way a cartographer does.**
Jacob: *"these are all design and aesthetic choices we're making, we're not promising anybody 'truth' … build our own
style guide around it."* The data can't carry ground truth anyway: no town marks its right-of-way in its parcels
(90–98% of street samples lie in no parcel in every town, ▶ `node scratch/footprint-census/row-parcels.mjs <scene>`).
OSM `width` means different things in different towns (▶ `node scratch/footprint-census/width-vs-parcels.mjs <scene>`).
And on an authored street the parcel line is usually 1–2 m past the back of the street (LS p50 +0.93 m over 39 sides,
HPDM p50 +2.01 m over 8 sides, ▶ `node scratch/footprint-census/authored-vs-data.mjs <town> <look>`).

So the kit does three things, in this order:

1. **CLASSIFY.** Every piece of street-scape is one *type* out of a closed vocabulary (§1–§13 below). A type is decided
   by what the thing **is**, read from tags and topology: a living street, a median, a dead end, a plaza. It is never
   decided from a measured dimension standing in for an identity.
2. **SYMBOLISE.** Each type has one **drawn form**. That is its cross-section, its materials, and its chosen
   dimensions. The dimensions are chosen for **looks and legibility at the close camera**. They are *informed* by
   permitted manuals (a value's ancestry), never imported from them as truth. A type's form is the same in every town
   unless the town's **norm** (`norms.json`) says otherwise.
3. **JOIN.** Where types meet (a junction, a corner, a cap, a transition, the rim), a **join rule** says how the forms
   connect. The join is the band bent, never a constructed primitive (`RIBBONS §1` invariant 1; `/ORIENTATION.md` §3, the ribbons).

**The canvas all three are drawn on: the protopolygon ①** *(added by Boz at Jacob's note, 2026-10-19; `/ORIENTATION.md`
§3, ruled 2026-08-12)*. Every street centreline is stroked to a **hairline width** and all are united into one
closed compound path; **the holes are the blocks.** It reads no width and no authoring; every edge carries the street
and side that made it, and every crossing carries the two streets that met there. *A corner is a crossing you read,
not an angle you compute.* ⭐ **Because the stroke has thickness, a dead end closes into a real notch instead of a
zero-width slit.** A graph-face walk (what shipped before) goes out along a spur and back over the same vertices, so
every dead-end tip was a slit. Giving the dead end thickness at ① is one of the project's primary innovations. CLASSIFY
labels ①'s edges; SYMBOLISE offsets them (② the curb, ③ the bands); JOIN reads ①'s crossings and notches.

**Data selects; it never measures** *(RULED, Jacob 2026-10-20)*. A tag or a topology picks *which style applies*. It does not set a dimension.
`highway=living_street` selects the shared-street form. `width=6` does not set the carriageway to 6 m. ⚠️ This is the
draft's central proposal, and it **conflicts** with live precedent, which lets data measure in places
(see Conflict C1 in §14).

**The operator overrides anything.** The override is first-class, never a defect (`CLAUDE.md` Layer 0 q3;
`ORIENTATION` "the override is the product"). The ladder is the one the kit already uses everywhere:
**authored → data (selects a style) → town norm → kit house style.** A missing rung says so **by name, per pour**,
and never silently becomes the kit default (`BRIEF-the-street-ends-at-the-parcel §2`; Layer 0 q2).

**Two rules every entry obeys.**
- *Town #2.* A type is detected from tags and topology that exist in any town. ⛔ Never from a street name, never from a
  list of instances, never from a constant that happened to be right for LS (Layer 0, Class D).
- *Fails loudly.* When the data can't classify a thing, the pour prints it as **unclassified**, by place. It does not
  draw it as `residential` (today it does, §1.1).

---

## Contents

1. Street classes · 2. The cross-section stack · 3. Curbless / shared streets · 4. Divided roads, medians, islands,
narrow slivers · 5. Junctions (T, cross, skew, multi-leg, offset) · 6. Corners: radius vs perpendicular ·
7. Curb ramps and crossings · 8. Dead ends and caps · 9. Plazas and `area=yes` · 10. Grade separation and bridges ·
11. Driveways and lot access · 12. The rim · 13. Where streets meet parcels and buildings ·
14. Conflicts register · 15. Open for Jacob (top 10) · 16. Sources, and what was not read ·
17. Wrong notions being faithfully rendered · 18. The road's paint (centre stripe, edge lines)

---

## 1 · Street classes

**Conception.** A street class is a cartographer's road symbol. It is a line type in a legend: "local street",
"arterial", "alley". It tells the reader what kind of place the street is, not its measured size. Professionals
conceive the classes functionally: through-movement vs access. The OSM `highway=*` key is already that legend, and
it is present on every way.

**Drawn form: the class table.** `[C]` is today's seed (`cartograph/skeleton.js` `STD_SECTION` / `seedSection`);
`[P]` is this draft's house style.

| class (`highway=`) | kit type | carriageway | curb | treelawn | walk | notes |
|---|---|---|---|---|---|---|
| `motorway`, `trunk`, `*_link` | **highway** | swept from lanes: 12 ft lanes `[F f-interstate-lane-width → fhwa-interstate-design, page text]`, shoulders 10 ft right `[F f-interstate-right-shoulder → fhwa-interstate-design, page text]` / 4 ft left `[F f-interstate-left-shoulder → fhwa-interstate-design, page text]`, ramps `[R r-manuals-disagree-take-smaller]` | none `[R RIBBONS §1, "the shipped curb path builds NO highway curb"]` | — | — | built by H-3, no handle moves it (`OPERATIONS` "Highways") |
| `primary` | arterial | lanes × 11 ft `[C]` `[F f-massdot-lane-widths → massdot-design-guide, Ch 5 §5.3.3.3 / §5.3.4.2: arterials and major collectors 11–12 ft]`; no parking `[C]` `[U]` | yes | 4 ft `[C]` `[U]` (inside MassDOT's common 2–6 ft, below its preferred 5 ft: §16 X3) | 8 ft `[C]` `[F f-caltrans-sidewalk-width → caltrans-hdm, Index 105.2: main street 8 ft, on CA State highways]` | `expressway=yes` → no ped realm `[R skeleton.js#isExpressway, 2026-09-23]` |
| `secondary` | collector | lanes × 11 ft `[C]` `[F f-massdot-lane-widths → massdot-design-guide, Ch 5 §5.3.3.3 / §5.3.4.2]` | yes | 4 ft `[C]` `[U]` (§16 X3) | 6 ft `[C]` `[F f-massdot-sidewalk-width → massdot-design-guide, Ch 5 §5.3.1.1: min 5 ft]` | see the defect note on ped dims below |
| `tertiary` | collector | lanes × 10 ft `[C]` `[F f-massdot-lane-widths → massdot-design-guide, Ch 5 §5.3.3.3: normal range 10–12 ft]` | yes | 4 ft `[C]` `[U]` (§16 X3) | 6 ft `[C]` `[F f-massdot-sidewalk-width → massdot-design-guide, Ch 5 §5.3.1.1]` | |
| `residential`, `unclassified`, `road` | local | lanes × 10 ft `[C]` `[F f-massdot-lane-widths → massdot-design-guide, Ch 5 §5.3.3.3]` + 2 × 8 ft parking `[C]` `[F f-massdot-parking-lane → massdot-design-guide, Ch 5 §5.3.3.2: min 7 ft, 8 ft high-turnover]` | yes | 5 ft `[F f-massdot-buffer-width]` | 5 ft `[F f-massdot-sidewalk-width]` | `road` is in `STREET_CLASSES` but has no `STD_SECTION` row (seeds as residential) |
| `living_street` | **shared street** (§3) | `[P]` one surface, edge to edge | **none** `[P]` | **none** `[P]` | none (shared) `[P]` | today: becomes residential silently `[C]` |
| `pedestrian` (linear) | **pedestrian street** `[P]` | one paved surface, edge to edge `[P]` | none `[P]` | none | — | today: a PATH class, stroked as ink inside a block `[C skeleton.js PATH_CLASSES; derive.js paths]` |
| `pedestrian` + `area=yes` | **plaza** (§9) | — | — | — | — | |
| `service` + `service=alley` | **alley** | 15 ft paved `[C standards.js STANDARDS.alley]` `[U]` | none `[C BRIEF-corner-ramps-and-kerb §3 step 5]` | — | — | cut at the asphalt `[R derive.js, Jacob 2026-09-08]` |
| `service` + `driveway` | **driveway** (§11) | — | — | — | — | today: a PATH class `[C]` |
| `service` + `parking_aisle`, `drive-through` | **lot aisle** `[P]` | paved, within its lot `[P]` | none | — | — | not established what the pour draws today |
| `service` with no `service=*` | **service road** `[R Jacob 2026-10-19 #8: not a lot aisle by default; the tag-based case table is Tally's proposal, interim]` | local's section, pending house values | — | — | — | e.g. Huron's Holiday/Willow/Lagoon Lane (`access=private`), PTown's Holden St, Bluff Terrace |
| indoor ways (tags per `src/cartograph/streetClass.js` on branch `classifier`) | **indoor** `[R Jacob 2026-10-19 #7]` | drawn form not ruled `[U]` | — | — | — | 2–36 per town |
| services-area ways (tags per `streetClass.js`) | **services area** `[R Jacob 2026-10-19 #7]` | drawn form not ruled `[U]` | — | — | — | Huron |
| `footway`, `cycleway`, `path`, `steps`, `track`, `bridleway` | **path** | ink inside a block `[C ROADMAP, paths]` | — | — | — | `footway=sidewalk` is evidence, not ink (§2) |
| `proposed`, `construction`, `planned`, `abandoned`, `razed` | **not built** | dropped from the network, printed `[C skeleton.js NOT_BUILT]` | | | | |
| anything else | **unclassified (loud)** `[P]` | not drawn as a street; printed by id `[P]` | | | | today: residential `[C]` |

**What picks it.** `highway=*` on every way. `service=*`, `area=yes`, `expressway=yes`, `junction=roundabout`,
`oneway`, `lanes`. Per-town counts:
- `highway` on road ways is present by definition.
- `living_street`: PTown's Commercial Street is 6 of 7 ways (`scratch/footprint-census/REPORT.md` "Commercial
  Street"). In the other towns: not measured.
- `lanes` coverage per town: not measured in the two reports.
- Named footways reach `streets[]` in HPDM (Forest Park trails) and none in LS (`ROADMAP`, ▶ `node checks/claims-named-way-becomes-street.mjs`).

**Override.** Survey's **Type** pulldown (residential / secondary / primary / service, `SURVEY §4`) writes
`overlay.type`. Whether a type change re-seeds the cross-section: not established. Per-edge width
(`blockCustoms[skelId][side][segOrd].pavementHW`), ped depths and materials override any class value.

**Precedent.**
- `STD_SECTION` (`skeleton.js`) carries the comment "NACTO-by-class … AASHTO truck radii deferred [U]". NACTO is
  `not-permitted-without-permission` (its terms read 2026-10-20) and AASHTO `prohibited`, so under
  `references/README.md` rules 1 and 5 neither can be the ancestry. **Re-sourced 2026-10-20** from the permitted set:
  the lane widths, the parking lane and the 6–8 ft walks now cite MassDOT / Caltrans findings in the table above; the
  4 ft treelawn and "no parking" on arterials stay `[U]`; the local strips are 5 ft, cited (§16).
- `isExpressway` (`skeleton.js`, Jacob 2026-09-23): `expressway=yes` on every source way → no treelawn, no walk; curb
  kept. Whether an at-grade expressway takes a curb at all: `q-atgrade-expressway-edge`, **open**
  (`[F f-caltrans-curb-avoided-40mph → caltrans-hdm, Index 303.1 + Table 303.1]`, `[F f-massdot-sloped-edging-over-45 → massdot-design-guide, Ch 5 §5.5.3]`).
- Not-built classes are dropped and printed (`skeleton.js`, 2026-09-06).
- Named ways become street chains whatever their class (`ROADMAP` "THE MECHANISM — keyed on the word UNNAMED").
- ⚠️ **CONFLICT 1.1, a fallback in the classifier.** `seedSection`: `const cls = STD_SECTION[base] ? base : 'residential'`.
  Any class without a row becomes residential silently. That is Layer 0 q2, and it is exactly why Commercial Street
  paints as a curbed street with a lawn (`BRIEF-the-street-ends-at-the-parcel §1`).
- ⚠️ **CONFLICT 1.2, three cross-section tables.** `skeleton.js STD_SECTION` (parking 8 ft, lawn 5 ft, corner R 4.5 m),
  `cartograph/standards.js STANDARDS` (parking 7 ft, lawn 4.5 ft, corner R 15 ft = 4.57 m, "Based on City of St. Louis
  standards, AASHTO … To customize for a different city, swap this file"), and `tileGround.js` (`STD_TREELAWN = 1.5`,
  `ADA_SIDEWALK = 1.5`). The class-specific ped dims in `STD_SECTION` do not reach the paint: PTown's `secondary`
  Commercial Street way paints 1.5 m lawn / 1.5 m walk (`REPORT.md` per-way table), not 4 ft / 6 ft. Which table is
  live for which field: partly established (`SECTION §3.1` says `resolvePedDepths` defaults both strips to 1.5 m).
  `standards.js`'s attribution ("City of St. Louis standards, AASHTO") rests on two non-permitted sources
  (`stl-city-standard-details` not-permitted, `aashto-gdhs-7` prohibited). Both parking values (7 ft and 8 ft) sit inside
  `[F f-massdot-parking-lane → massdot-design-guide, Ch 5 §5.3.3.2]`; its 4.5 ft lawn and 15 ft radius are `[U]`.
- ⚠️ **CONFLICT 1.3, `highway=pedestrian` is a path.** It is in `PATH_CLASSES`, so a pedestrian street does not bound
  blocks and draws at `STANDARDS.path.width` 4 ft `[U]` unless named. A named one becomes a street chain. Neither is
  "a pedestrian street". This is from reading `skeleton.js` and `derive.js`; not seen on a render.

**Open for Jacob.**
- ~~Q1.a~~ **RULED [R Jacob 2026-10-20]:** an unknown class refuses by name, never residential. The operator fixes it by picking a class (the Type pulldown, ⛔ not built yet); authored class outranks data.
- **RULED [R Jacob 2026-10-20]: street** (bounds blocks, paved shared surface). Was: - Q1.b Is a linear `highway=pedestrian` a *street* (it bounds blocks, drawn as a paved shared surface) or a *path*?
  This draft proposes street.
- Q1.c Re-found the class table on house rulings (`r-house-*`) so every value has ancestry, or keep `[U]` and disclose.

---

## 2 · The cross-section stack

**Conception.** A street cross-section is read from the centreline outward: **carriageway** (travel lanes + parking) ·
**curb** · **treelawn** (the planted buffer, a.k.a. furnishing zone) · **walk** · **frontage** (the strip between the
walk and the building or lot). Professionals treat the ped side as zones with purposes (buffer, clear path, frontage),
not as measured strips. PROWAG's concept is a **pedestrian access route** of a minimum clear width
`[F f-prowag-par-clear-width → prowag-2023, 36 CFR 1190 app. R302.2]`. MassDOT's is a sidewalk plus an optional
landscape buffer `[F f-massdot-buffer-width → massdot-design-guide, Ch 5 §5.3.1.1]`.

**Drawn form.** The kit's form is already settled and is good cartography. Keep it:
- **Mono-width ribbon, strips variable.** One total depth per block, so the band's inner edge is a clean concentric
  wrap; what varies per edge is the divider and the materials `[R SECTION §1, §3.3; RIBBONS §1 invariant 4]`.
- **Two strips always, equal width; presence swaps the material, never the width.** Treelawn-Y reads curb → TL → SW →
  LU. Treelawn-N reads curb → SW → TL(LU colour) → LU `[R SECTION §3.1]`.
- **The FILL spans curb → block centre.** There is no hard property line; LU is the remainder `[R SECTION §3.3]`.

| layer | house value | informed by |
|---|---|---|
| lane (local) | 3.05 m (10 ft) | `[C STD_SECTION]`; `[F f-massdot-lane-widths → massdot-design-guide, Ch 5 §5.3.3.3: "normal range … between 10 and 12 feet"]`. (Caltrans HDM's 11 ft urban minimum, `f-caltrans-lane-width-urban-11`, is scoped to conventional State highways and is not applied here) |
| lane (collector/arterial) | 3.35 m (11 ft) | `[C STD_SECTION]`; `[F f-massdot-lane-widths → massdot-design-guide, Ch 5 §5.3.3.3 / §5.3.4.2: arterials and major collectors 11–12 ft]`; `[F f-caltrans-lane-width-urban-11 → caltrans-hdm, Index 301.1, first exception: 11 ft min]` |
| lane (highway) | 3.66 m (12 ft) | `[F f-interstate-lane-width → fhwa-interstate-design, page text]`, `[F f-caltrans-lane-width → caltrans-hdm, Index 301.1]` |
| parking lane | 2.44 m (8 ft) | `[C STD_SECTION]`; `[F f-massdot-parking-lane → massdot-design-guide, Ch 5 §5.3.3.2: min 7 ft, high-turnover 8 ft]`; `standards.js` says 7 ft (Conflict 1.2), also inside that range |
| curb, top width | 6 in (0.1524 m) | `[F f-massdot-curb-width → massdot-design-guide, Ch 6 §6.7]` "typically 6 inches wide". Kit default `streetProfiles.js#KIT_CURB_WIDTH`; a town's Look may author its own, and every bake prints which rung decided (Jacob, 2026-10-20: "6 inches everywhere") |
| kerb height | 0.15 m (6 in) | `[H r-house-kerb-height]`; `[F f-massdot-curb-heights → massdot-design-guide, Ch 5 §5.5.3: "Six inch curbs are typically used along roadways"]`; `[F f-caltrans-curb-heights → caltrans-hdm, Index 303.2 + Table 303.1: vertical 4–8 in, Type A 6 in]`; LS norm 0.15 m. ⚠️ NOT BUILT: `curb-cut-norm.mjs` kit = 0 |
| treelawn | 5 ft (1.524 m) | `[F f-massdot-buffer-width → massdot-design-guide, Ch 5 §5.3.1.1: preferred ≥ 5 ft]`. Kit default: `streetClass.js` local row (`LOCAL_SECTION`); the painter draws it for every class until classifier step 7 |
| walk | 5 ft (1.524 m) | `[F f-massdot-sidewalk-width → massdot-design-guide, Ch 5 §5.3.1.1: min 5 ft]`; ≥ PROWAG 48 in clear `[F f-prowag-par-clear-width → prowag-2023, R302.2]`. Kit default: the local row, as treelawn. Caltrans's 6 ft at the curb `[F f-caltrans-sidewalk-width → caltrans-hdm, Index 105.2]` is scoped to CA State highways and not adopted |
| walk, commercial frontage `[P]` | 2.4 m (8 ft) | `[F f-massdot-sidewalk-width → massdot-design-guide, Ch 5 §5.3.1.1: unbuffered commercial desirable 8 ft]`; `[F f-caltrans-sidewalk-width → caltrans-hdm, Index 105.2: main street 8 ft, on CA State highways]`. ⛔ Not built; what selects "commercial" is open (Q2.b) |
| walk cross-slope | ≤ 1:48 | `[F f-prowag-par-slopes → prowag-2023, R302.5.1]`; in all four US `norms.json` |
| lawn slope | ≤ 1:3.5 | `[R r-lawn-slope-design-choice]` `[U]`, an aesthetic choice |
| frontage | the LU remainder | `[R SECTION §3.3]` |

**What picks it.**
- **Carriageway.** Today: `lanes` × the class lane, else 1 or 2 lanes by `oneway`, plus parking on residential
  (`seedSection`). OSM `width` is read nowhere (`BRIEF-the-street-ends-at-the-parcel §1`, Lath). Width-tag coverage:
  LS none; HPDM 9 residential segments; JH 58; PTown present on Commercial Street (`REPORT.md`; ▶
  `node scratch/footprint-census/width-vs-parcels.mjs <scene>`).
- **Treelawn Y/N.** Read from LS's hand survey only (`raw/survey.json`, `SECTION §3.1`, `OPERATIONS` "Section").
  ▶ `node checks/claims-the-survey-reaches-the-measure.mjs <scene>`. Every other town gets the standard pair.
- **Sidewalk presence (evidence available, unread).** OSM `footway=sidewalk` ways vs 2× road centreline length:
  LS 53.4% · HPDM 48.7% · PTown 5.5% · Huron 6.5% · JH 74.4%. Road ways with any `sidewalk*` tag, as a share of road
  length: LS 3.9% · HPDM 16.4% · PTown 3.0% · Huron 1.4% · JH 48.2%. `kerb*` on road ways: 0 in every town.
  ▶ `node --max-old-space-size=4000 scratch/sidewalk-evidence/census.mjs <scene>`. Nothing in the pour reads
  `sidewalk=*` today.
- **Lawn vs walk-at-kerb.** The census's centreline-to-footway gap is not interpretable without imagery (its
  §4: "Whether a gap value means treelawn or sidewalk-at-kerb on the ground" — not measured).

**Override.** Survey: per-edge `pavementHW` (asphalt-edge drag), symmetric/asymmetric, whole-chain/per-block.
Section: per-edge `treelawn` / `sidewalk` depths, strip-material swap (both LU = an open field), Revert, per-edge
re-seed (⌃-click) (`OPERATIONS` "Section"). Look: `curbWidth`. Town: `norms.json` kerb, walk, lawn.

**Precedent.**
- "Ribbon monowidth, strips variable" is sacrosanct (`SECTION §3.3` invariants).
- Width steps taper, not step `[R r-width-step-tapers]` (10:1 borrowed from `[F f-caltrans-terminal-widening-taper → caltrans-hdm, Index 206.2(3)]`).
- Authored widths are ground truth, "only ever edited against the aerial photo" (`BRIEF-the-street-ends-at-the-parcel §3e`).
- A whole-street width edit fans across blocks (memory index §B).
- ⚠️ **CONFLICT 2.1, data measuring.** `BRIEF-the-street-ends-at-the-parcel §2` makes the width tag **size** the
  carriageway (behind a sanity rung) and the parcel line **cap** the band's depth. Under this draft's method a tag
  *selects* (e.g. "narrow street" vs "standard street") and the class table sizes. Same ladder, different rung content.
  See C1.
- ⚠️ **CONFLICT 2.2, the "sidewalk default rule".** `[R r-sidewalk-default-rule]` (2026-09-23) says each town uses
  its own state manual's sidewalk width where permitted (MA: MassDOT), derived where manuals agree, never below PROWAG.
  The live paint is 5 ft (1.524 m) everywhere (one kit value, the local row). Either the rule is an aspiration, or 1.5 m is the derived agreement and it isn't
  disclosed per pour. Which one: not established.

**Open for Jacob.**
- ~~Q2.a~~ **RULED [R Jacob 2026-10-20]:** a style per class, built on the permitted sources. `r-sidewalk-default-rule` (state manual per town, 2026-09-23) retires.
- **RULED [R Jacob 2026-10-20]: the abutting land use** (commercial → the commercial walk); the town norm overrides. Was: - Q2.b What selects a commercial-frontage walk: LU on the abutting piece, the building line, or a town norm?
- **RULED [R Jacob 2026-10-20]: yes**, `sidewalk=no` selects no walk on that side; authoring overrides. Was: - Q2.c Should OSM `sidewalk=no` / `sidewalk:<side>=no` *select* "no walk on that side"? It is presence, which is
  selection, not measurement.

---

## 3 · Curbless / shared streets

**Conception.** A shared street is **one surface** that people and cars share at walking speed. It has no curb, no
lawn, and no separate walk; the edges are a change of paving, not a step. OSM: `living_street` is "a road with very
low speed limits and other pedestrian friendly traffic rules", where pedestrians have "higher or equal right of way",
and it "must represent a special road category indicated by some traffic sign" (OSM wiki, Tag:highway=living_street).
PROWAG's ramp-free edge concept is the **blended transition** `[F f-prowag-curb-ramp-per-crosswalk → prowag-2023,
R203.6.1.1]`.

**Drawn form `[P]`.**
- Parts: one **shared surface** from building line to building line (asphalt or the town's paving material), plus a
  thin **edge band** at each side in a contrasting paving where the walk would be: 0.3 m `[U]`, chosen for legibility,
  no source. No curb stroke, no kerb riser, no treelawn.
- Join: where a shared street meets a curbed street, the curbed street's curb **returns** round the corner and stops at
  the tangent; the shared surface runs flush into the junction. The kerb drop is the existing flush taper
  (`norms.json kerb.taperRun`, LS 1.0 m `[R LS norms.json, 2026-10-06]` `[U]`).
- Width: the shared surface reaches the **frontage** (§13), so its width is decided by what lies either side, not by
  a lane count. ⛔ It does not take `lanes × lane + parking` (that gives Commercial Street 7.92 m with a curb at 4.0 m).

**What picks it.** `highway=living_street`; `highway=pedestrian` (linear, Q1.b); `living_street=yes` on another class
(OSM wiki). Also `sidewalk=no` with no `footway=sidewalk` nearby, as a *candidate* `[P]`. Counts: PTown Commercial
Street 6 of 7 ways `living_street`, none carry `sidewalk*` or `kerb*` (`REPORT.md`). Other towns: not measured.
Kerb nodes near Commercial Street: 18 (11 lowered, 5 flush, 1 raised, 1 no).

**Override.** The street's type (Survey). Per-edge materials (Section) can already paint "both LU" (an open field) or,
per the deferred `SW+SW` case, both walk (`RIBBONS §1`, 2026-08-14, "DEFERRED — an ASPIRATION").

**Precedent.**
- `BRIEF-the-street-ends-at-the-parcel §2`: "a `living_street` / `pedestrian` way gets no curb and no treelawn by
  default (the curbless flush slope that already exists, `OPERATIONS` 'Curb cuts')". Queued, not built.
- `OPERATIONS` "Kerb height": "where NO curb is drawn (alleys, shoulders) the block slopes flush over `taperRun`".
- Huron norm: "much of Huron has no curbs — so no kerb key: kit 0" `[R huron/norms.json, 2026-10-06]`.
- **RULED [R Jacob 2026-10-20]: Huron is mixed: curbs on the bigger streets, none on local streets,** as a per-class kerb rule in Huron's norm (authorable per street). ⛔ Not built: the norm has no per-class kerb today.
- ⚠️ **CONFLICT 3.1.** Huron's curblessness is encoded as **the absence of a kerb key**, which only meant "flat" while
  the kit kerb was 0. `[H r-house-kerb-height]` makes the kit kerb 6 in. When that is built, every Huron street gains a
  6 in kerb unless Huron's norm says otherwise. Curblessness needs to be a **declared** value (kerb height 0), not an
  absent one.
- ⚠️ **CONFLICT 3.2.** Commercial Street's `width=6` tag is "the width of the carriageway from kerb to kerb or edge to
  edge" (OSM wiki, Key:width). On a curbless street "edge to edge" plausibly means building-face to building-face.
  Measured: parcel line at median 3.4–3.9 m from the centreline on the `width=6` ways, about half of 6 m
  (`REPORT.md`). That fits "edge to edge" but the reading is not established.

**Open for Jacob.**
- **RULED [R Jacob 2026-10-20] (supersedes the one-surface form below as the kit default):** Jacob looked at Commercial Street:
  "sidewalks on both sides of varying relief; brick sidewalks against paved streets" (superseding the 10-18 "no meaningful
  sidewalk or curbs"). So the living-street style is: a narrow paved carriageway; a walk on BOTH sides to the building line
  (street-wall frontage, §13); no tree lawn; a LOW kerb by town norm (default low, not 6 in), authored per stretch where
  the relief varies; walk material by town norm (PTown: brick). A true one-surface street stays possible: kerb flush and
  walk material = road, by norm or authoring. Q3.b is answered by this (to the building line). Was: - Q3.a Ratify the shared-street form: no curb, no lawn, one surface, an edge band. Edge band yes/no, and its width.
- Q3.b Does a shared street reach the building line (§13) or stop at a drawn frontage?
- **RULED [R Jacob 2026-10-20]: the town norm; kit default a pale paver/brick tone, not asphalt.** Work: develop a materials set the operator picks from ("cobblestone" and so on). Was: - Q3.c What paving does a shared street use: asphalt, or a town material (brick or setts read as "shared")?

---

## 4 · Divided roads, medians, islands and narrow slivers

**Conception.** These are all **islands**: paved or planted positive space that is neither a travel lane nor a lot.
A **median** separates opposing traffic along a road. A **channelising island** splits turning traffic at a junction.
A **refuge** is an island a crossing passes through. A **narrow sliver** between two carriageways is a median or an
island, **never a block with frontage**. Nobody fronts it, nobody walks along it, and in dense towns it is usually all
concrete. MUTCD: "An island may be designated by curbs, pavement edges, pavement markings, channelizing devices"
`[F f-mutcd-island-means → mutcd-11r1, §3J.01 ¶04]`. Caltrans: medians at or below 22 ft (4 lanes) / 30 ft (6+ lanes)
"should be paved" `[F f-caltrans-paved-median → caltrans-hdm, Index 305.5(1)]` (a highway rule, used here only to
inform that narrow medians are paved).

**Drawn form.**
- **Divided road.** Two carriageways, each its own centreline, each emitting its half-width to both sides; the median
  is the face between them `[R RIBBONS §3.1, §1 2026-08-14]`. The **ped walk goes at each carriageway's OUTER curb**;
  the median is a median `[R Jacob 2026-10-07, RIBBONS §3.5 via memory index §C]`.
- **Median.** Curbed all the way round `[R RIBBONS §1, 2026-09-06 "the median is otherwise a BLOCK — curb on each side"]`.
  No walk along it `[R RIBBONS §1, 2026-09-06 "no sidewalk"]`. Surface by **town norm**: `planted` (grass, today's
  `luRemainder`) or `paved` (concrete) `[P]`. A median a crosswalk passes through carries a **cut-through refuge**,
  ≥ 60 in clear `[F f-prowag-refuge-clear-width → prowag-2023, R302.2.1]`, ≥ 6–7 ft deep in the direction of travel
  (`[F f-caltrans-refuge-width → caltrans-hdm, Index 405.4(3): 6 ft]`, `[F f-massdot-refuge-island → massdot-design-guide,
  Ch 6 §6.7: 7 ft]`), with 24 in warning strips `[F f-prowag-refuge-warning-layout → prowag-2023, R305.1.4, R305.2.4]`.
- **Island minimums `[H]`.** Curbed only where at least 1.22 m (4 ft) wide `[H r-house-curbed-min-width]`
  `[F f-caltrans-island-min-size → caltrans-hdm, Index 405.4(1): curbed divisional island ≥ 4 ft wide]`,
  `[F f-massdot-raised-median → massdot-design-guide, Ch 5 §5.5.1.1: raised part ≥ 4 ft]`. Raised only if at least
  4.65 m² (50 sq ft) `[H r-house-island-min-area]` `[F f-caltrans-island-min-size → caltrans-hdm, Index 405.4(1): ≥ 50 sq ft]`,
  `[F f-massdot-island-min-size → massdot-design-guide, Ch 6 §6.7: ≥ 50 sq ft urban]`. Below either, it is **painted**
  (a flush hatched area, `[F f-mutcd-flush-island-markings → mutcd-11r1, §3J.03 ¶01–02]`), not a curbed island.
- **The nose.** See Conflict 4.1. This draft proposes `[H r-house-nose-radius]` `[U]` (a semicircle of 0.61 m at the
  1.22 m cut; the ruling records that no finding states a nose radius) for medians and islands, and the ordinary
  corner rounding where a median end meets a crossing street.
- **Narrow sliver `[P]`.** Any face bounded by roadway on every street-facing side that is narrower than **three of
  the town's walk widths** `[R RIBBONS §3.5, 2026-10-18 guess rung]` `[U]` is classed **island**, not block: no walk, no
  lawn band, no LU choice, surface by the town's median norm. Above that width it stays a block.

**What picks it.** Topology, not tags. OSM has no median tag (`OSM-FORENSICS` ② "no median tag at all"). The
divided carriageways come from `oneway` + pairing in `skeleton.js` (class + topology gates). Refuges:
`crossing:island=yes` (LS 31, `OSM-FORENSICS`; other towns not measured). JH also has a city `MEDIAN` layer
(`BRIEF-nyc-adapter`, step 5 open). Median surface: no tag measured; the NYC `MEDIAN` layer, and `surface=*` on
islands, not measured.

**Override.** Survey: per-side `pavementHW` on each carriageway (which moves the median edge), corner existence and
radius at the nose. Section: materials on the median's edges. ⛔ The Anchor (centre/edge) pulldown is on the
retirement list (0 authored anywhere) `[R RIBBONS §1 retirement list]`.

**Precedent.** The ruling history is the richest seam in the corpus, and it contradicts itself:
- 2026-08-14 (`RIBBONS §1`): "A MEDIAN IS A BLOCK … we treat it exactly the same." No median-specific ped rule.
- 2026-08-12 (`RIBBONS §1` "the ped rule is replaced by the ladder"): the median joins `gleanTreelawn`'s ladder like any
  block.
- 2026-09-06 (`RIBBONS §1` "CONTRADICTED"): "A MEDIAN IS A SPECIAL CASE TYPE OF BLOCK; NO SIDEWALK." Its text says the
  section below it must not be acted on until settled.
- 2026-10-07 (memory index §C; `RIBBONS §3.5`): ped at each carriageway's outer curb, median is median; "collapse the
  two opposite-label impls to one + a check". Dispatched to Sill.
- 2026-10-18 (`RIBBONS §3.5`): "a median is curbed all the way round and its end takes the SAME rounding as every
  other corner — no nose rule of its own"; "A block too narrow for a walk carries none … a block narrower than three of
  the town's own walk widths gets no walk." The guess rung is unbuilt; today every non-expressway side gets
  `ADA_SIDEWALK`.
- The inboard-side oracle may be inverted (`RIBBONS §1`, 2026-09-04, OPEN); Huron's median noses paint walk + lawn
  (2026-10-07 Sill, ▶ `node checks/claims-every-junction-corner-has-a-curb-cut-source.mjs huron --live --selftest`).
- Loop bodies (Benton, Waverly) enclose a grass median, inner side no walk (`LOOP-STREETS §2`).
- ⚠️ **CONFLICT 4.1, the nose.** `[H r-house-nose-radius]` (2026-10-17): the nose is a 0.61 m semicircle, and the
  curbed nose ends where the island narrows to 4 ft. `RIBBONS §3.5` (2026-10-18): the median end takes "the SAME
  rounding as every other corner — no nose rule of its own". These are different shapes. The later one may supersede;
  the registry still holds the earlier one as answered.
- ⚠️ **CONFLICT 4.2, the median's surface.** The precedent paints every median as `luRemainder` grass
  (`RIBBONS §3.5` "Grass: the tile's `luRemainder`"). Jacob's conception for JH is "likely all concrete". There is no
  median-surface rung at all.
- ⚠️ **CONFLICT 4.3, "nothing decides divided" vs "a median is a median".** The 2026-08-14 ruling says a median is just
  a block and nothing decides "divided". The 2026-10-07 ruling needs the walk to know which curb is outer. This draft
  resolves it by **classifying the face** (an island class), not by classifying the road. That still needs a
  discriminator the polygon can carry; the "two sides face each other" test was tried and reverted (`RIBBONS §3.5`).
- ⚠️ **CONFLICT 4.4, the threshold's unit.** "Three of the town's walk widths" scales with the walk, which is good.
  But the walk is 5 ft everywhere today, so the threshold is 4.572 m everywhere. That is a constant in disguise until
  walks vary by town (Layer 0 "THE TELL").

**Open for Jacob.**
- ~~Q4.a~~ **RULED [R Jacob 2026-10-18, confirmed Jacob 2026-10-20]:** ordinary corner rounding; no nose rule of its own. On a narrow end the half-leg bound makes the two corners meet as a semicircle by itself.
- **RULED [R Jacob 2026-10-20]: kit default paved below the sliver threshold, planted above; the town norm overrides.** - Q4.b **Half RULED [R Jacob 2026-10-20]:** the surface is the town's norm. OPEN: the kit default when a town says nothing. This draft proposes kit default `paved` below
  the sliver threshold and `planted` above it, the town norm overriding both.
- ~~Q4.c~~ **RULED [R Jacob 2026-10-19, refined Jacob 2026-10-20]:** every median and sliver is ONE island class: no lawn, no LU, and ⛔ no procedural ring walk. Walk and ramps on an island are incidental to crosswalks: where a crossing or a sidewalk passes through an island, it gets the walk and ramps that crossing needs (the refuge), and nothing else. Was: "a narrow sliver is an island, not a block" as a *class*, which decides no walk, no lawn and no LU in one
  step, instead of today's "a block with zero-width ped".

---

## 5 · Junctions: T, cross, skew, multi-leg and offset

**Conception.** A junction is where two or more **different** streets meet. A cartographer draws the streets clean
and lets the junction interior be whatever the legs make it. Jacob's own statement is the best one in the corpus:
*"There's a lot of variability inside the geometry of the intersections themselves but the streets and corners are
simpler; the hard distinction to find is between them"* (`SKELETON §5d`, "the special sauce"). Professionals prefer
right-angle crossings; Caltrans says no less than 75° where a right angle can't be had `[F f-caltrans-intersection-angle →
caltrans-hdm, Index 403.3]`.

**Drawn form.**
- **Join rule: the legs decide.** A corner whose two legs are **different roads** is a junction corner: curb arc,
  curb cuts, crosswalks. The **same road** (`roadId` OR `throughId` agrees) is a **bend**: walk and lawn bend through,
  no pad, no cut `[R BRIEF-corner-ramps-and-kerb §0a items 2–3, 2026-10-06; SECTION §6.1]`.
- **T.** Two corners on the stem side; the through side's kerb runs straight. Far-kerb crosswalk by town norm:
  kit `none`, LS `cut` (`OPERATIONS` "Crosswalks"; `BRIEF-corner-ramps-and-kerb §3 step 3`).
- **Cross.** Four corners; four crosswalks square across the street, centred on their cuts (`crosswalksSquareAcross`).
- **Skew.** The same rules. The crosswalk stays square to the street it crosses, not to the corner
  (`SECTION §6.1`, "at an oblique corner, not square to the crossed street" for the perpendicular walk extension).
  The acute corner takes the ordinary radius `[P]`. Below 75° the corner is still drawn; the angle informs nothing in
  the kit today `[U]`.
- **Multi-leg (5+).** The interior is variable by design. Each pair of adjacent different-road legs makes one corner.
  A degree-5 node at a divided transition is bookkeeping, not geometry (`SKELETON §5c`): the divided corridor counts
  as ONE road at the corner, rounding its two outer-edge legs, never the carriageway stubs `[R SKELETON §5e]`.
- **Offset (jog).** Two Ts a short distance apart on one through street. Drawn as two Ts. ⛔ Never consolidated into one
  crossing `[P]`. Each T's crosswalks are drawn on their own. What happens where the two Ts' curb returns overlap:
  not established.
- **Name change on a through road** is a through-node, not a corner `[R RIBBONS §3.3, the 18th/Dolman restoration]`.
- **Roundabout.** One welded ring (A19, delivered 2026-10-03). NCHRP 672 is `not-permitted-without-permission`, so it is
  not a source (`q-roundabout-geometry`). **Re-sourced to the permitted set:** Caltrans ranges, CA only:
  inscribed circle 105–150 ft single-lane (CA Legal vehicle) `[F f-caltrans-roundabout-icd → caltrans-hdm, Index 405.10(3)]`;
  splitter island ≥ 50 ft long, ≥ 6 ft wide at the crossing `[F f-caltrans-splitter-island → caltrans-hdm, Index 405.10(12)]`.
  For MO, OH, MA and NY the ring's geometry is `[U]`.

**What picks it.** Node degree from the skeleton (`kindOf`: dead end 1 / T 3 / cross 4 / Y 5+, `SKELETON` node table),
and leg identity off the frozen stamp. Counts per scene: ▶ the `SKELETON` node-table command. The junction corners
per town: LS 558 · HPDM 791 · PTown 594 · Huron 937 · JH 2640 (`scratch/sidewalk-evidence/REPORT.md §3`). Offset-T
pairs: not measured.

**Override.** Survey: ⌥-click a corner = "not a corner" / "a corner here" `[R SECTION §6.1, 2026-10-07]`; corner radius
per corner, per IX, global. Section: cut style per corner.

**Precedent.**
- Intersection variable, street/corner simple (`SKELETON §5d`).
- The divided corridor is one road at the corner (`SKELETON §5e`; `RIBBONS §3.1`).
- Through-node if either union agrees (`RIBBONS §3.3`, ▶ `node checks/claims-uturn-outer-edge-walk.mjs`).
- Across-intersection consolidation in `skeleton.js` was a red herring for the live defect (`SKELETON §5c/§5e`).
- Mouth co-claim at dead-end junctions (`SECTION §6.3`).
- ⚠️ **CONFLICT 5.1, junction as a constructed thing.** `SKELETON §5e`'s 2026-06-06 note proposes "construct the junction
  at prebake … one apron per node". `_archive/PIPELINE-superseded-2026-10-21.md` step 6 says "If you find yourself constructing a corner shape, stop."
  These are about different layers (the asphalt apron vs the band's corner), but the word "construct" is in both.
  Not a ruling conflict as far as established; flagged for reading.

**Open for Jacob.**
- **RULED [R Jacob 2026-10-20]: always two Ts geometrically.** The street NAME carries continuity (one street through the jog, for labels and authoring), per Jacob's chain ruling. Was: - Q5.a Offset T pairs: always two Ts, or does a jog under some distance read as one skewed crossing?
- **RULED [R Jacob 2026-10-20]: no, for now; revisit after the pictures.** Was: - Q5.b Skew: should an acute corner (< 75°) take a larger radius, the way a real kerb does? `[U]`

---

## 6 · Corners: radius vs perpendicular

**Conception.** A corner is **two things in two tools**: its **shape** (how round the curb is) and its **fill** (how the
walk and lawn bend round it) `[R SECTION §6; ARCHITECTURE §2.1]`. There are two cartographic styles of fill. In a
**radius (diagonal) corner** the walk bends round the arc and meets the kerb at one apex ramp. In a **perpendicular
corner** each leg's walk runs straight on to the kerb, the two walks meet in an L, and the lawn fills between.

**Drawn form.**
- **Shape.** Curb arc radius 15 ft (4.572 m) × the Look's global scale, the local row's `cornerR`
  `[F f-caltrans-corner-radii → caltrans-hdm, Index 405.8: 15–25 ft at minor cross streets]`, with per-IX and per-corner
  overrides. A corner may ease no further than half its own leg. ⚠️ The per-class radii in `streetClass.js` (tertiary 5,
  secondary 6, primary 7.5 m) are frozen into seeds but read by nothing; ② uses the local row for every corner until
  classifier step 7.
- **Radius (diagonal) fill.** The band bent round the arc; the pad is concrete tangent to tangent; TL↔TL lawn stops
  blunt at the tangents; SW↔TL slides the deep leg to the kerb on its own leg (`slopeLen = 2 ×` depth to travel)
  `[R SECTION §6.1, §4]`.
- **Perpendicular fill.** "There is no bend at all, only straight extension thru" `[R SECTION §6.1, Jacob 2026-10-18]`:
  each walk runs straight on to the kerb, in line with its leg; they meet in an L; only the curb rounds; the leg's outer
  strip (lawn) fills the rest; no pad.
- **Bend (same road).** Walk and lawn bend through; no pad; no cut, unless Survey makes it a corner.
- **Rim / shore corner.** A corner flanked by `__water__` or `__boundary__` is no corner: no pad, no cut
  `[R SECTION §6.1]`.

**What picks it.** The curb-cut style picks the fill: perpendicular cuts → perpendicular corner; diagonal → radius
corner. Evidence: the recorded kerb drops (mid third = diagonal; both outer thirds = perpendicular). The data decides
style on LS 15.1% · HPDM 5.9% · PTown 0.7% · Huron 0.1% · JH 9.2% of junction corners
(`scratch/sidewalk-evidence/REPORT.md §3`). Where it decides on LS: 78 diagonal, 6 perpendicular, matching LS's
authored diagonal norm.

**Override.** Survey: radius (global ×, per IX, per corner; to-centre = square R = 0), corner existence. Section: cut
style per corner (writes `cut` in `cornerCornerRadiusOverrides`), ⌃-click clears.

**Precedent.**
- The corner is the band bent, never a constructed primitive (`RIBBONS §1` invariant 1; `/ORIENTATION.md` §3, the ribbons).
- `jtMiter`, never `jtRound` (`SURVEY §3`) — ⛔ but `RIBBONS §3.3` says `filletRing`, the jtMiter doctrine and the
  miter limit "retire under §1's 2026-09-04 grout ruling".
- ① is sharp; rounding happens once, downstream `[R RIBBONS §1, 2026-09-05]`.
- "Treelawn never wraps the kerb" is a DEFAULT, never a gate (`SECTION §6.1`, 2026-09-08).
- ⚠️ **CONFLICT 6.1, the radius's ancestry.** `SURVEY §3` calls the 4.5 m baseline "AASHTO"; `OPERATIONS` says
  "`1×` = AASHTO/NACTO baseline"; `skeleton.js` says "NACTO-by-class". The registry prohibits AASHTO as an authority
  and NACTO is `not-permitted-without-permission` (terms read 2026-10-20). Resolved 2026-10-20: the base is now 15 ft (4.572 m), cited to Caltrans's minimum below, no longer `[U]`. The permitted set gives a range, not a value: Caltrans 15–25 ft at minor cross streets
  `[F f-caltrans-corner-radii → caltrans-hdm, Index 405.8]`; MassDOT and FHWA size the radius to the design vehicle
  (`[F f-massdot-corner-radius-method → massdot-design-guide, Ch 6 §6.7]`, `[F f-sa13027-corner-radius-method →
  fhwa-sa-13-027, §4.4 p. 4-12]`). It needs a house ruling (e.g.
  `r-house-corner-radius`) to have ancestry.
- ⚠️ **CONFLICT 6.2, two fill styles, one picker.** The perpendicular-corner geometry (10-18) is ruled. Whether the
  corner's FILL follows its CUT style automatically, or is a separate authored choice: not established.

**Open for Jacob.**
- **RULED [R Jacob 2026-10-20]: 15 / 20 / 25 ft** (4.572 / 6.096 / 7.620 m) local / collector / arterial, the ends and middle of `f-caltrans-corner-radii`; every corner authorable. - Q6.a **Half RULED [R Jacob 2026-10-20]:** radii differ by class (local 15 ft), and every corner stays authorable, to allow for reality. OPEN: the collector and arterial values (pile 2). Was: a house corner radius per class, with ancestry: local 15 ft (4.572 m, ruled 2026-10-20), collector 6 m, arterial 7.5 m `[P]`, or one value?
  (6 m and 7.5 m fall inside Caltrans's 15–25 ft at minor cross streets, `f-caltrans-corner-radii`.)
- **RULED [R Jacob 2026-10-20]: one picker**: the cut style picks the fill. Was: - Q6.b Does a corner's fill style follow its cut style (one picker), or are they two knobs?

---

## 7 · Curb ramps and crossings

**Conception.** A **curb cut** is where the kerb drops. A **crosswalk** is the band of paint joining two cuts across a
street. Vocabulary is ruled: "curb cut" is the drop; "ramp" stays the pad and the leg slope
(`BRIEF-corner-ramps-and-kerb`, 2026-10-06). PROWAG requires "one curb ramp or blended transition … for each
crosswalk" at a corner `[F f-prowag-curb-ramp-per-crosswalk → prowag-2023, R203.6.1.1]`; a single apex ramp only in
alterations `[F f-prowag-apex-ramp-alterations-only → prowag-2023, R203.6.1.1 Exception]`.

**Drawn form.**
- Cut: 1.5 m wide (LS and Huron norms; ≥ PROWAG's 48 in run `[F f-prowag-curb-ramp-geometry → prowag-2023, R304.2.1–R304.2.6, R304.4.1, R304.5.1.1]`),
  0.6 m warning strip (LS and Huron AUTHORED norms; kept by ruling, since LS is never re-poured: 1 cm under PROWAG's 24 in (0.61 m) minimum
  `[F f-prowag-perpendicular-ramp-dws → prowag-2023, R305.1.4, R305.2.1]`; §16 X5). Ramp 1:12, flares 1:10 (LS norm; at PROWAG's
  maxima, `[F f-prowag-curb-ramp-geometry → prowag-2023, same]`).
- Crosswalk: square across the street, centred on its cut, kerb to kerb. No cut ⇒ no crosswalk. Paint by town norm:
  `lines` (LS 3.0 m wide, 0.3 m lines) or `continental` (LS 3.0 m, 0.6 m bars `[U]`); width ≥ MUTCD min 6 ft and line
  width inside MUTCD's 6–24 in `[F f-mutcd-crosswalk-width → mutcd-11r1, §3C.03 ¶05–06]`. Huron: no markings `[R huron/norms.json]`.
- Mid-block crossings: not established (not covered by the canon read).

**What picks it.** Ladder: operator → recorded kerbs (`raw/osm_kerbs.json`) → town `norms.json` → state → kit
(`OPERATIONS` "Curb cuts"; `cartograph/curb-cut-norm.mjs`). A crossing gives the crosswalk's **station, never the
cut's style** `[R Boz 2026-10-06, curb-cut-evidence.mjs header]`. Evidence per town: kerb nodes LS 454 · HPDM 434 ·
PTown 23 · Huron 21 · JH 3661 (2264 `unspecified`); `footway=crossing` ways LS 332 · HPDM 345 · PTown 140 ·
Huron 92 · JH 1996. LS's and HPDM's `osm.json` have no crossing nodes (no `pois` key), an intake gap
(`scratch/sidewalk-evidence/REPORT.md §2`). Town norms: LS diagonal · Huron perpendicular · HPDM, PTown none set ·
JH has **no `norms.json`**.

**Override.** Section: per-corner cut style; `blockCustoms[…].curbCuts.{start,end}` per leg (read by the painter,
"written by nothing today", `BRIEF-corner-ramps-and-kerb §3 step 4`).

**Precedent.**
- `[R r-curb-ramp-default-perpendicular]` (2026-10-17): the kit default is perpendicular, plus a town-wide switch
  (not built).
- ⚠️ **CONFLICT 7.1, kit rung.** The code: `curb-cut-norm.mjs` step 5, "the kit: 'none'", with the comment "⛔ The kit
  default is NONE, never a style: any concrete style is a constant that is right for some town and wrong for
  another". The ruling: kit = perpendicular. The ruling post-dates the code; it is an unbuilt ruling, and the code
  comment states the opposite doctrine.
- ⚠️ **CONFLICT 7.2, Layer 0 neutral default vs a house style.** Layer 0 Class D says a value is "the town's authored
  value with a NEUTRAL default". A style guide is, by design, a non-neutral kit default. Jacob's 2026-10-17 house
  standard rulings already moved this way. This draft assumes the house style is the intended kit rung, **disclosed
  per pour** ("kit house style"), so it's not a silent fallback. That reading needs Jacob's ratification (C2).

**Open for Jacob.**
- **RULED [R Jacob 2026-10-20]: JH gets its own norm:** medians paved (all); perpendicular cuts where the kerb data doesn't pick; ladder (high-visibility) crosswalks; no tree lawn (walk to the curb). Was: - **RULED [R Jacob 2026-10-20]: a crossing is a third eligibility test for a ramp** (beside "two streets meet" and "the walk run straight on ends in the road"). Where the town's crossing data covers a corner, it decides: a recorded crossing ⇒ ramp, none ⇒ no ramp. Where the data is silent, the town norm decides (Huron: every junction corner), and the pour prints that the norm decided. Authoring overrides both. ⚠️ LS and HPDM carry no crossing nodes today (an intake gap, ROADMAP / BRIEF-corner-ramps-and-kerb pois line): re-fetch them, keeping what we take in. Queued after the 2026-10-20 bake (Loess's corner work).
- Q7.a JH has no `norms.json`. JH records `kerb` on 3661 nodes and NYC publishes `CURB_CUT`. Does JH get a norm, or
  ride the kit rung?
- ~~Q7.b~~ **RULED [R Jacob 2026-10-20]:** a style-guide value is the kit rung, a disclosed house style. Each value cites a permitted source or is marked [U] as our own choice, and every pour prints which rung decided (as the curb and the imperial defaults already do).

---

## 8 · Dead ends and caps (bulbs, shoulders)

**Conception.** A dead end is a street that stops. Its end is drawn in one of three styles: a **bulb** (a turning
circle, round), a **blunt** end (square), or **open** (the street runs off, e.g. into a lot). The **shoulders** are the
two points where the street's straight curb turns into the bulb.

**Construction (where the dead end comes from).** ⭐ The dead end is **given thickness in the protopolygon ①**
*(Boz, at Jacob's note 2026-10-19)*. The centreline is stroked to a hairline before the punch-out, so the spur is a
two-sided **notch** in its block, never the zero-width out-and-back slit a graph-face walk produces (`_archive/PIPELINE-superseded-2026-10-21.md` step 3a;
the slit history is in `RIBBONS §1` and `cartograph/_archive/A0-deadend-history-2026-08-11.md`). Its two sides and its
tip carry their owner `{skelId · side · segOrd}` from the mint. ② offsets those labelled edges to the curb; the cap
style below decides how the tip's offset is drawn, and ③ folds the band round it. ⛔ The cap is never patched in the
fill (`SECTION §6.3`). *For the library trials:* a stroked open path's end type (Clipper's butt / square / round
`EndType`) is the hairline tip, which is where the trials should look first.

**Drawn form.**
- Cap styles: `round` (circle cap) · `blunt` (flat) · `none` (connected) (`SURVEY §4`).
- Bulb radius: not established in the canon I read; it comes from the stroke (`SURVEY §3` step 2: "round tips get a
  circle cap"). `[U]` for a house value. The permitted set has none: Caltrans defines a cul-de-sac but gives no
  geometry and defers local streets to local standards `[F f-caltrans-culdesac-no-geometry → caltrans-hdm, Index 62.3(8)
  + Index 308.1]`; MassDOT defers local roads to municipal requirements `[F f-massdot-local-roads-municipal →
  massdot-design-guide, Ch 5 §5.3.4.4]`, and those municipal sources are not permitted (§16).
- Fill: the ribbon folds round the cap; the bulb has no halves and carries ONE cross-section, the cap owner's
  `[R r-cap-bulb-no-halves; SECTION §6.3]`. A round cap keeps the treelawn wrapping; a blunt cap goes all walk
  (`SECTION §1`). The cap is a coupler, not a corner; **every shoulder gets a ramp**, zero-length when the legs agree
  `[R r-cap-every-shoulder-ramp; SECTION §6.3 2026-09-07]`.
- A road may be authored with different widths per side; the cap follows (Nicholson Place, `SECTION §6.3`).

**What picks it.** `highway=turning_circle` / `turning_loop` on the tip node selects round. LS: 20 nodes in the bbox,
13 of 17 placeable at 0.0 m on a degree-1 tip (`INTAKE §Cul-de-sacs`). ⚠️ The ingest fetches the tag and drops it
(`fetch.js` keeps `[lon, lat]` only), so nothing reads it today (`ROADMAP A09`). Other towns: not measured. Dead-end
detection excludes alleys and service (`derive.js`, "Only true streets").

**Override.** Survey cap pulldown Start/End; Section cap flip (`capFlip` inverts the materials; no per-cap revert).

**Precedent.**
- `[R r-cap-default-from-data]` (2026-06-13): the cap is data-derivable; the chooser is a stopgap. Unbuilt.
- The mouth is a co-claim, an identity defect; ⛔ do not FILL-patch it (`SECTION §6.3`).
- Dead-end tips are zero-width slits in the face walk; the cure is the missing second mouth corner (`SECTION §6.3`
  2026-07-30; `RIBBONS §1` punch-out ruling 2026-08-12).
- Jacob 2026-08-06: the selector stays as an end-state authoring tool (`INTAKE §Cul-de-sacs`).

**Open for Jacob.**
- **RULED [R Jacob 2026-10-20]: three end styles:** `round` (semicircle, radius growable, easing back onto the street at the
  shoulders with the corner easing and the half-leg bound) · `squared` (today's blunt: the end plus a half-width) ·
  `flush` (NEW: stops exactly at the chain's end). OSM `turning_circle` selects round. Measured 2026-10-20: ① ε = 5 mm
  per side with a butt end; no style today ends at the chain end; "None (connected)" silently draws round.
  **Sidewalks at an end (Jacob: "two sidewalks go to the end and simply cut off"):** proposed per-end ped behaviour,
  `wrap` (the band folds round the end) or `cut off` (each side's walk stops at the end line); defaults round → wrap,
  flush and squared → cut off **[R Jacob 2026-10-20]**; authorable.
  **Islands inside loop cul-de-sacs:** data selects: buildings or parcels inside → a block; none → the island class **[R Jacob 2026-10-20]**.
  Was: - Q8.a A house bulb radius, or keep "whatever the stroke makes"? Real turning circles are much wider than the street;
  a stroke cap is exactly the street's half-width.
- **RULED [R Jacob 2026-10-20]: blunt by default; keep OSM `turning_circle` (fetch drops it today) so tagged bulbs are round.** OPEN with Q8.a: the cap controller (pile 3). Was: - Q8.b An untagged dead end: round or blunt by default? This draft proposes **blunt** `[P]` (a cartographer shows
  "the street stops" plainly; a bulb asserts a turnaround the data didn't record).

---

## 9 · Plazas and `area=yes`

**Conception.** A plaza is a **paved place**, an area not a line. It is positive space: neither a block interior nor a
travel street. OSM: `highway=pedestrian` + `area=yes` is "the most common way to map the pedestrian area of a square or
plaza"; roads crossing it are mapped normally (OSM wiki, Tag:highway=pedestrian). The corpus already names it
the "third category": "Medians, concrete aprons/expanses on thoroughfares, traffic islands, refuge islands, plazas.
Paved/landscaped positive space" (`OSM-FORENSICS` ①).

**Drawn form `[P]`.** A filled area of the town's plaza paving, flush, no curb at its edge where it meets a walk; a curb
where it meets a carriageway. Its boundary is its own ring; it is never stroked as a line and never bounds blocks as a
street. Streets crossing it keep their carriageway.

**What picks it.** `area=yes` on `highway=pedestrian` (or `footway`, `service`); `place=square`; NYC `PLAZA`. LS has 9
`highway=pedestrian, area=yes` ways (`OSM-FORENSICS`). Other towns: not measured; HPDM's St. Louis Walk of Fame is one.

**Override.** Not established; there is no plaza authoring today.

**Precedent.**
- `ROADMAP` (2026-10-18): named `area=yes` ways (plazas, terraces, a service yard) "enter as street chains"; HPDM's Walk
  of Fame is circle-fit 18.9 m off its trace and crosses Delmar with no node.
  ▶ `node checks/claims-named-way-becomes-street.mjs` · `node checks/claims-a-fitted-loop-stays-on-its-road.mjs`.
- `OSM-FORENSICS` ⑤: resolved by ingest (plazas from existing tags).
- ⚠️ **CONFLICT 9.1.** The precedent's mechanism decides street-ness by **name**, not class; an area is then drawn as a
  closed street. That is a wrong notion faithfully rendered (§17).

**Open for Jacob.**
- **RULED [R Jacob 2026-10-20]: yes, plaza is its own type** (an area fill). Was: - Q9.a Ratify "plaza" as its own type (an area fill), never a chain.
- **RULED [R Jacob 2026-10-20]: the town norm, one kit default paving; the operator can pick a material ("cobblestone") for the area.** Was: - Q9.b Plaza material: one kit paving, or per town?

---

## 10 · Grade separation and bridges

**Conception.** A road on a different level from the block grid is drawn as its own object, over or under, and does not
cut the ground into blocks. A surface bridge carrying an ordinary street over a rail cut is still that street.

**Drawn form.**
- Grade-separated roads leave the face graph and are drawn flat as their own swept object `[R ARCHITECTURE §7
  "Grade separation"; ORIENTATION "settled"]`. Highways are built from their lanes `[R OPERATIONS "Highways"]`.
- Land bounded **partly** by them is a block; **entirely** by them is **verge**: "grass, no curb, no sidewalk, no LU
  choice" `[R r-highway-verge]` (unbuilt per `ARCHITECTURE §7`, H-3). Junction residuals are raised islands
  (`d-jr-raised`, derived from `f-mutcd-island-means` and `f-sa13027-island-raised-or-flush`). Gores are flush neutral
  areas `[F f-mutcd-gore-neutral-area → mutcd-11r1, §3B.08 ¶05]`.
- A surface bridge (Mississippi, Nebraska) stays `gradeSeparated: false` and keeps bounding blocks.
- Bridge decks over water: deck findings exist (`[F f-fhwa-concrete-deck-min → fhwa-lrfd-steel-example, Design Step 2 (S9.7.1.1)]` 7 in;
  `[F f-usfs-timber-deck-min → usfs-timber-bridges, Ch 8 p 8-63]` 5½ in). How they
  draw: not established in the canon read.

**What picks it.** `layer`, `bridge`, `tunnel`, and limited-access class (`gradeSeparated = entirelyOffGrade ‖
(limited-access && !twoWayMotorway)`, `SKELETON` table). A nodeless crossing is grade separation only where OSM says
so (▶ `node checks/claims-a-nodeless-crossing-is-grade-separated.mjs`). Per town: not measured here.

**Override.** None: "No handle moves it" (`OPERATIONS` "Highways"); an override is refused, printed, kept.

**Precedent.** As above. ⛔ No conflict found.

**Ruled (Jacob, 2026-10-21, Q10.a):** "Eventually, we'll want to build out the geometry (or whatever) for the
overpasses/bridges, etc. because the elevated trains also happen in that milieu." ⇒ bridges, overpasses, elevated rail
(JH's 7 train) and structures over water (piers, docks: `cartograph/_archive/BRIEF-the-shore-is-closed-2026-09-26.md`
"STRUCTURES OVER WATER") are ONE off-the-ground family, built later as geometry; never stamped into the ground. Unbuilt.

---

## 11 · Driveways and lot access

**Conception.** A driveway is where a lot meets the street. On the map it is a **dropped kerb** and an **apron** of
paving across the walk and lawn, from the kerb to the lot. It is a small thing that makes a residential street read as
inhabited. OSM: "a service road leading to a residence … property or place of business" (Tag:highway=service);
`kerb=lowered` / `flush` "are often found at crossing and driveways" (Key:kerb).

**Drawn form `[P]`.** A curb cut (no warning strip; it's not a crossing) at the driveway's meeting with the road, and a
walk-coloured apron across the lawn strip only (the walk runs through unchanged). Apron width 3.0 m `[U]`. The
driveway itself, inside the lot, is lot paving or nothing.

**What picks it.** `service=driveway` ways meeting a road; kerb nodes that are not on a crossing (`notOnCrossing`
unbound: LS 62 · HPDM 252 · PTown 6 · Huron 0 · JH 133, `scratch/sidewalk-evidence/REPORT.md §2`). Whether those
nodes are driveways: not established. NYC `CURB_CUT` may include driveway cuts: not established.

**Override.** None today.

**Precedent.** None found. `service` is a path class (`skeleton.js PATH_CLASSES`). Lamps avoid driveways
(`BRIEF-street-lamps-derived` line 48).

**Open for Jacob.** Q11.a Are driveways in the style at all (they are a lot of small marks), and if so, from data only
(no invented driveways)?

---

## 12 · The rim (the map is a closed disc)

**Conception.** The neighbourhood is **one closed shape, a compound path**: the circle is the outer contour, and the
streets and fills run out and close against it. The fade is applied last, as a look `[R ARCHITECTURE "THE COMPOUND
SHAPE", 2026-08-08]`. "The rim is an edge of the drawing, never an absence."

**Drawn form.** A block at the rim is continuous: street edges most of the way round, the circle for the rest. A rim
edge has no walk of its own and no curb; it must not break the band for its neighbours (`ARCHITECTURE`). Streets
trail past the face fade (`streetFade`). A corner flanked by `__boundary__` is no corner (`SECTION §6.1`).

**What picks it.** `neighborhood_boundary.json` (centre + radius); `__boundary__` closing edges (31 of LS's 101 tiles,
`RIBBONS §3.2`).

**Override.** The boundary is authored in Extent. Rim treatment: none, by ruling: "the most foolproof / guaranteed /
easy version", never tuned by eye.

**Precedent.** `ARCHITECTURE` compound shape; `A10` (rim run dropped vs kept at zero depth: "That difference is the whole
defect", measured 34 of 584 runs on LS). Whether A10 is now fixed: not established.

**Open for Jacob.** None. This entry is settled doctrine.

---

## 13 · Where streets meet parcels and buildings

**Conception.** The street ends where the private realm begins. A cartographer shows that edge as the **frontage**:
the walk meets either a building face (a commercial street, no setback) or a front yard. The frontage is a *style*
too: a "street wall" street versus a "garden" street.

**Drawn form `[P]`.** Two frontage styles, picked per edge:
- **Garden frontage.** Today's form: band to its mono-width, LU remainder behind it.
- **Street-wall frontage.** The walk runs **to the building line**; no lawn strip; the band's depth is whatever lies
  between the curb and the building. ⛔ No ped band under a building.

**What picks it.** Building footprints and parcels, which exist in all five towns (`BRIEF-the-street-ends-at-the-parcel
§3b`). This draft proposes that the data **selects** the style (a building within one band-depth of the curb ⇒
street-wall) and does not measure the depth. Measured symptom (`scratch/footprint-census/REPORT.md`):
- Footprints intruding into painted street ground: JH 0.6% · HPDM 5.4% · Huron 10.0% · LS 11.5% · PTown 34.9%.
- Painted sidewalk inside a parcel: JH 5.3% · LS 21.6% · HPDM 41.4% · Huron 48.7% · PTown 75.6%.
- ▶ `node scratch/footprint-census/census.mjs <town>` · `summarize.mjs` · `parcelcheck.mjs`.
- Mechanism: "cause not established" (REPORT).

**Override.** Section depth and materials; per-building activate/hide (membership).

**Precedent.**
- `BRIEF-the-street-ends-at-the-parcel §2`: the parcel line is the back of the street "only where the street lies in
  the GAP between parcels (its ROW)"; the band's total depth is at most curb → property line. ROW-ness read off the
  data (codes), never shape. Check `claims-the-street-ends-at-the-parcel.mjs`.
- `SECTION §3.3`: "there is no hard 'property line' cap".
- ⚠️ **CONFLICT 13.1.** The brief caps the band at the parcel line; `SECTION §3.3` has no property line. And the brief's
  own measurement says the parcel line is **not** the back of an authored street (LS p50 +0.93 m, only 4 of 39 sides
  within 0.5 m). Under this draft's method the parcel *selects* (is there room for a lawn?) and the style sizes.
- ⚠️ **CONFLICT 13.2.** The brief treats the authored edges as "the test set for the data rung". Under "data selects"
  there is no rung that measures, so the test becomes: does the selected style match the authored one?

**RULED [R Jacob 2026-10-20]:** the parcels and footprints SELECT the frontage style, never size it (C1). Two styles: garden and
street-wall. Street-wall is picked by a building within one band depth of the curb (scales with the style; no constant).
The walk takes the style's width, and **a building cuts it off: nothing is painted under a building** (a join rule, not a
measurement). Authoring overrides per side. Was: **Open for Jacob.** Q13.a Does the parcel line *size* the band (the brief), or *select* the frontage style (this
draft)?

---

## 14 · Conflicts register

| # | between | where |
|---|---|---|
| **C1** | "data selects, never measures" (this draft, Jacob 2026-10-19 framing) vs data that measures today: LS `survey.json` widths (`stampCustomWidths`), the brief's width tag sizing the carriageway and parcel line capping the band, NYC planimetric curbs as "ground truth" | `BRIEF-the-street-ends-at-the-parcel §2`; `SECTION §3.1`; `BRIEF-nyc-adapter` "As EVIDENCE for checks" |
| **C2** | a kit house style vs Layer 0 Class D's "neutral default" and `curb-cut-norm.mjs`'s "the kit default is NONE, never a style" | `CLAUDE.md` Layer 0; `curb-cut-norm.mjs` header; `r-house-*`, `r-curb-ramp-default-perpendicular` |
| C3 | unknown class → residential silently (a fallback) | `skeleton.js seedSection` |
| C4 | median rulings 08-14 (a block, same treatment) · 09-06 (special block, no walk) · 10-07 (walk at outer curb) · 10-18 (narrow → no walk; nose = ordinary rounding) | `RIBBONS §1`, `§3.5` |
| C5 | nose: house 0.61 m semicircle (10-17) vs ordinary corner rounding (10-18) | `r-house-nose-radius`; `RIBBONS §3.5` |
| C6 | median surface: always grass (`luRemainder`) vs "JH likely all concrete" | `RIBBONS §3.5`; Jacob's brief to this draft |
| C7 | kit kerb 6 in (house) vs Huron's curblessness encoded as an absent key; and code kit = 0 | `r-house-kerb-height`; `huron/norms.json`; `curb-cut-norm.mjs` |
| C8 | kit curb-cut perpendicular (ruled) vs `none` (code) | `r-curb-ramp-default-perpendicular`; `curb-cut-norm.mjs` |
| C9 | AASHTO/NACTO attributions on live values (4.5 m corner, class table) vs registry rules 1 and 5. Re-sourced 2026-10-20 where a permitted finding exists (lanes, parking, 6–8 ft walks); the 4.5 m radius, the 4 ft lawn and the 1.5 m strips stay `[U]` (§16) | `SURVEY §3`; `OPERATIONS` "corner-radius kit"; `skeleton.js` comment; `standards.js` header |
| C10 | three cross-section tables (`STD_SECTION`, `standards.js`, `tileGround` constants), class ped dims not reaching paint | `skeleton.js`, `standards.js`, `tileGround.js` |
| C11 | `r-sidewalk-default-rule` (state-manual widths per town) vs 1.5 m everywhere | registry; `tileGround.js` |
| C12 | street-ness by NAME (named footways and plazas become streets) vs by class | `ROADMAP`; `skeleton.js` step 1 |
| C13 | `highway=pedestrian` is a path vs a pedestrian street | `skeleton.js PATH_CLASSES` |
| C14 | `LOOP_STREET_NAMES = new Set(['Benton Place', 'Mackay Place'])` in `derive.js`: a named instance list (Layer 0 q1). Whether still live on the pour path: not established | `derive.js` |
| C15 | parcel line caps the band vs "no hard property line" | `BRIEF-the-street-ends-at-the-parcel`; `SECTION §3.3` |
| C16 | the task asked this draft to read AASHTO, NACTO, NYC SDM and St. Louis guides; `references/README.md` rule 1 forbids reading any source not `permitted`. Terms checked 2026-10-20: AASHTO prohibited; NACTO, NYC SDM, the St. Louis city and county manuals, MoDOT EPG all not permitted without permission. None was read | §16 |

---

## 15 · Open for Jacob — the top 10

1. **RULED [R Jacob 2026-10-20]: data SELECTS, never measures. "Choose only; the style decides, authoring handles fidelity."** A tag, parcel or footprint picks which style applies; the style sets every dimension; real measurements live in authoring (LS's survey is LS's authoring). Was: **C1: does data select or measure?** If it selects, the width tag, parcel line and LS survey become style pickers,
   and the brief's §2 rung changes content. If it measures, this draft's method sentence is wrong.
2. **C2: is a style-guide value the kit rung?** That is, a disclosed, non-neutral kit house style, replacing "neutral
   default" in Layer 0 Class D for street-scape.
3. **The median, once:** ratify a single island class for narrow slivers and medians (no walk, no lawn, no LU; surface
   by town norm) and supersede the 08-14 / 09-06 / 10-07 / 10-18 stack (C4, C6).
4. **The nose:** house semicircle or ordinary rounding (C5).
5. **Shared streets:** `living_street` (and linear `pedestrian`) drawn curbless, one surface, to the frontage; and
   "unknown class" fails loudly instead of becoming residential (C3, C13).
6. **RULED [R Jacob 2026-10-20]: the kit kerb is the house 6 in, built in classifier step 7; Huron curbs only its bigger streets (`kerb.byClass`); the kit taper run is height × 12 (ADA 2010 §405.2, 1:12). Perpendicular cuts are the kit rung (cba287c4).** Was: **Kerb and cut kit rungs:** build the house 6 in kerb and perpendicular cuts, and first give Huron an explicit
   `kerb.height = 0` so it doesn't gain kerbs (C7, C8).
7. **JH's norm:** JH has no `norms.json`. Median surface, cut style, crosswalk paint, treelawn presence.
8. **Ancestry for the class table and the 4.5 m radius:** house rulings, or `[U]` disclosed (C9, C10, C11).
9. **Frontage styles:** garden vs street-wall, picked by the building line, instead of a parcel-line cap (C15).
10. **RULED [R Jacob 2026-10-20]: build on the permitted set; no permission letters.** Was: **The reading rule (C16):** the terms checks are done (2026-10-20) and none of NACTO, the NYC Street Design Manual,
    MoDOT's EPG or the St. Louis city/county standards is permitted. Whether to ask any of them for written permission
    (NACTO names nacto@nacto.org) is Jacob's call.

---

## 16 · Sources, and what was not read

**Cited, permitted (via the registry's extracted findings, `references/registry.json`; no manual re-read for this
pass):** MUTCD 11th Ed. Rev. 1 (`mutcd-11r1`); PROWAG 2023 (`prowag-2023`); MassDOT PDDG (`massdot-design-guide`);
FHWA SA-13-027 (`fhwa-sa-13-027`); FHWA Interstate design (`fhwa-interstate-design`); FHWA LRFD steel example
(`fhwa-lrfd-steel-example`); USFS timber bridges (`usfs-timber-bridges`); Caltrans HDM (`caltrans-hdm`, permitted on
Jacob's 2026-09-23 approval; its cover reads "© 2019 … All Rights Reserved", the same question that holds
`caltrans-standard-plans`, still pending Jacob). The 2010 ADA Standards (`ada-2010-standards`) became `permitted` at the
2026-10-20 terms check (a DOJ federal work; Jacob's approval not yet recorded); no finding has been extracted from them,
so nothing here cites them.

**Re-anchored 2026-10-20 (Boz's terms agent).** What changed:
- *Re-sourced from a non-permitted source to the permitted set:* the class lane widths (10 / 11 ft, from "NACTO-by-class"
  in `skeleton.js`) → `f-massdot-lane-widths`, `f-caltrans-lane-width-urban-11`; the parking lane (8 ft `STD_SECTION`,
  7 ft `standards.js` "City of St. Louis standards, AASHTO") → `f-massdot-parking-lane`; the 8 ft and 6 ft class walks
  → `f-caltrans-sidewalk-width`, `f-massdot-sidewalk-width`; the roundabout (NCHRP 672) → Caltrans ranges for CA only,
  `[U]` elsewhere; the corner radius ("AASHTO/NACTO baseline") → a Caltrans range it sits just under, value `[U]`.
- *Already-cited values given their source and section:* every `[F …]` tag now names its `source-id` and the finding's
  `where`; the house rulings on kerb height and island minimums gained the findings that state those values directly.
- *Marked `[U]`:* the 4 ft class treelawn, "no parking" on arterials, the 15 ft alley,
  the 4 ft path, the 0.6 m warning strip (an authored town norm) and 0.6 m continental bars, the 1.0 m flush taper,
  the 0.61 m nose, the three-walk-width sliver threshold, the 1:3.5 lawn slope, plus the values that were `[U]` already
  (0.3 m edge band, 3.0 m apron, bulb radius, the < 75° skew radius). A `[P]` with no `[F]` is also `[U]` (legend).

**Contradictions — a permitted source disagrees with a draft value. Each draft value is kept, for Jacob:**
- **X1, X2 resolved 2026-10-20:** treelawn and walk are now 5 ft (1.524 m), the MassDOT values (Jacob: "yes to imperial").
- **X3** class treelawn 4 ft (primary / secondary / tertiary) vs MassDOT's preferred ≥ 5 ft (same finding as X1);
  inside its common 2–6 ft.
- **X4 resolved 2026-10-20:** the corner radius is now 15 ft (4.572 m), Caltrans's minor-street minimum.
- **X5** warning strip 0.6 m vs PROWAG "Detectable warning surfaces shall extend 24 inches (610 mm) minimum"
  (`f-prowag-perpendicular-ramp-dws`, R305.1.4). Under by 1 cm. Kept: it is the towns' authored norm, and LS is never re-poured.
- *Not a contradiction, noted:* Caltrans HDM's 11 ft urban lane minimum (`f-caltrans-lane-width-urban-11`) is scoped
  to conventional State highways; the kit's 10 ft local lane is inside MassDOT's 10–12 ft normal range.

**Read on the web this session:** the OpenStreetMap wiki pages Tag:highway=living_street, Tag:highway=pedestrian,
Key:width, Key:sidewalk, Key:kerb, Tag:highway=service. ⚠️ The registry's `osm` source is the map data
(`openstreetmap.org/copyright`); whether it covers the wiki's text is for Jacob to confirm. Quotes above are short and
attributed.

**Not read, by `references/README.md` rule 1 (terms as of 2026-10-20; the quotes are on each registry row):**
- AASHTO Green Book: `prohibited` ("forbids the entry of AASHTO content into any AI tool"), and rule 5 bars any finding
  standing on its authority.
- NACTO Urban Street Design Guide: `not-permitted-without-permission` (personal use only; no download or commercial use
  without written permission).
- NCHRP 672 (roundabouts): `not-permitted-without-permission`.
- NYC DOT Street Design Manual: `not-permitted-without-permission`.
- St. Louis city standard details and Revised Code, St. Louis County design criteria: `not-permitted-without-permission`;
  traffic-calming guidelines `unchecked-no-terms-found` (not re-checked).
- MoDOT EPG: `not-permitted-without-permission`; ODOT L&D: pending waiver; Caltrans Standard Plans: not permitted
  (cover notice, pending Jacob).
- Huron, Erie County, Provincetown and Cape Cod Commission local standards: `not-permitted-without-permission`.

So this draft's conceptions for those sources' subjects (shared streets, plazas, frontage zones, NYC medians) come from
the permitted findings, the OSM wiki, and the canon. Where a conception has no such source, it is marked `[P]` or `[U]`.

**Canon read:** `ORIENTATION.md`; `README.md`; `CLAUDE.md` Layer 0; `cartograph/{_archive/PIPELINE-superseded-2026-10-21, SURVEY, SKELETON, SECTION,
RIBBONS, OPERATIONS, ARCHITECTURE (compound shape, grade separation), LOOP-STREETS, INTAKE (cul-de-sacs),
OSM-FORENSICS (third category)}.md`; `ROADMAP.md` (named-way entry); briefs `the-street-ends-at-the-parcel`,
`corner-ramps-and-kerb`, `a-curbed-nose-has-a-source`, `junction-shape-where-the-offset-crosses`, `nyc-adapter` (grep);
`references/README.md` + registry; the four `norms.json`; code `skeleton.js` (`STD_SECTION`, `seedSection`, class sets),
`standards.js`, `derive.js` (alleys, paths, `LOOP_STREET_NAMES`), `curb-cut-norm.mjs` header, `tileGround.js` constants.
**Reports:** `scratch/footprint-census/REPORT.md`, `scratch/sidewalk-evidence/REPORT.md` (read, not re-run).

---

## 17 · Wrong notions being faithfully rendered (the "narrow blocks" class)

Each is a precedent that draws a thing *correctly by its own rule*, where the rule mis-conceives what the thing is.

1. **A narrow sliver is a block.** Medians and slivers get the block treatment (curb, LU grass remainder, a walk unless
   the unbuilt guess rung stops it). Huron's median noses already paint walk + lawn. `RIBBONS §3.5`, `§1` (2026-08-14).
2. **A living street is a residential street.** `seedSection` falls back to residential, so PTown's Commercial Street
   gets an 8.0 m carriageway, a 0.15 m curb, a 1.5 m lawn and a 1.5 m walk, with the property line at 7.15 m against a
   parcel line at 3.4–3.9 m. `skeleton.js`; `BRIEF-the-street-ends-at-the-parcel §1`.
3. **A named plaza is a street.** Named `area=yes` ways enter as street chains (HPDM's Walk of Fame, circle-fit 18.9 m
   off its trace). `ROADMAP`.
4. **A pedestrian street is a path.** `highway=pedestrian` is in `PATH_CLASSES`, so unnamed it draws as 4 ft ink inside
   a block. `skeleton.js`; `derive.js`. (From the code; not seen on a render.)
5. **Every median is grass.** `luRemainder`, with no surface rung, including JH where Jacob expects concrete.
   `RIBBONS §3.5`.
6. **Curblessness is "no kerb key".** Huron's no-curb intent rides on an absence that the house kerb will fill.
   `huron/norms.json`.
7. **Every street has a lawn outside LS.** With no survey, every edge seeds the standard pair, painted TL → SW; this is
   how Commercial Street and the PTown secondary got lawns. `SECTION §3.1`; `OPERATIONS` ("their ped sections are
   AASHTO guesses end to end"). How often this is wrong in JH: not measured.
8. **The street's back is a constant depth.** The band ends at curb + 3.0 m whatever stands there; buildings sit on
   walk and lawn (PTown 34.9% of footprints). `SECTION §3.3`; footprint census.

---

## 18 · The road's paint: the centre stripe and the edge lines

**Conception.** The centre line separates OPPOSING traffic and is yellow; an edge line marks a roadway's edge, white on
the right and yellow on the left of a one-way roadway `[F f-mutcd-centre-line → mutcd-11r1, §3B.01 ¶01]`
`[F f-mutcd-edge-lines → mutcd-11r1, §3B.09 ¶02–03]`. Code: `src/cartograph/streetMarkings.js` (the kinds, the ladder, the
look) · `tileGround.js#roadMarkings` (drawn from the sealed centreline and ②'s labelled kerb, never the chains).

**The kinds** (Jacob, 2026-10-25: *"stripe kinds look right"*): centre `none` · single broken yellow · double solid yellow ·
solid + broken yellow, MUTCD's two-lane family `[F f-mutcd-centre-kinds → mutcd-11r1, §3B.01 ¶04]`; a single solid yellow is
not a centre line `[same, ¶05]`. Edge: yellow left · white right · white parking edge.

**What picks it** (each street prints its rung per pour, `derive.js` `[paint]`). Authored (Survey's street-keyed slot,
reserved) → data → town norm (`norms.json` → `markings`) → the type's house style (`streetClass.js` `marking`).
- *No residential stripes* (Jacob, 2026-10-25: *"no residential stripes, double yellow OK for default otherwise"*):
  local, living street, service, alley, driveway, lot aisle and paths are unmarked unless the data says `lane_markings=yes`.
  `unclassified` (a `local` road) is unmarked — Boz's call, vetoable by Jacob. tertiary and above are marked.
- Centre, a two-way street: `overtaking=no` → double solid · `=yes` → broken · one direction `=no` → solid + broken, solid on
  that side · lanes 2 + 1 → solid + broken, solid on the two-lane side `[F f-mutcd-three-lane → mutcd-11r1, §3B.01 ¶08]` ·
  four or more lanes → double solid `[F f-mutcd-four-lane → mutcd-11r1, §3B.01 ¶06]` · else the norm · else double solid.
  `lane_markings=no` unmarks anything. A one-way has none. Grade-separated is EXCLUDED, outside the vocabulary (§10).
- Edges (Jacob: *"both lines default"*): a one-way roadway of a marked type — a divided carriageway is one — takes both. A
  town norm may drop them, since edges may be omitted where curbs or parking delineate the roadway `[F f-mutcd-edge-omit →
  mutcd-11r1, §3B.10 ¶05]`. A two-way street takes none.
- ⛔ Width and traffic volume are never read (§0): MUTCD's warrant is by class, width and ADT `[F f-mutcd-centre-warrant →
  mutcd-11r1, §3B.02 ¶01–02]`; only its class half survives, as the type's house style. Measured 2026-10-25 (raw osm.json,
  six towns): no road carries `overtaking*` or `divider`, and `lane_markings` is mostly `no` — the passing rungs select
  nothing today.

**Joins** (Jacob, 2026-10-25: *"I think I would be ok to stop lines at intersections"*). The stripe is kept only where both
sides of its street have frontage; an edge line is struck from one kerb leg, which ends at its corner arc. So every line
stops at an approach and runs on along a T's far side `[F f-mutcd-edge-at-intersections → mutcd-11r1, §3B.11 ¶07–08]`; no
dotted extension. ① has no driveways, across which edge lines continue anyway `[same, ¶09]`.

**Drawn form** (the house look, `MARKING_LOOK`; a town norm overrides). Line 4 in, the normal line's lower bound
`[F f-mutcd-line-width → mutcd-11r1, §3A.04 ¶02]` · double-line space 4 in, at most twice a line `[same, ¶03]` · broken
10 ft on, 30 ft off `[same, ¶06]` · edge line 1 ft in from the kerb face `[U]`, a look. The parking edge sits at the side's
parking depth, `measure[side].parking`: the type's parking lane, the data (`parking:*`) selecting presence; it never moves the
curb (▶ `node checks/claims-the-road-paint-reads-its-marks.mjs`, part P).

**Open.** Survey controls for the parking depth and the per-street kind override (BACKLOG). Bike lanes still draw from
the raw way (BACKLOG).

*End of draft.*
