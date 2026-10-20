# Audit of STYLE-GUIDE.draft.md against the code

*Lath, 2026-10-19, for Boz. Read-only: reads, greps and one pure-function call (`resolvePedDepths`). Nothing poured,
baked or rendered. The code is `docs/conformance-2026-09-21` at `4d916f30` (main is an ancestor). Where
`boz/hpdm-gate` differs, it says so. Code is cited by symbol, not line. The draft is not edited.*

**Verdicts.** **DOES**: the code draws it as the guide says. **SET UP**: the mechanism or rung exists, and only a
value, a selector or the wiring is missing. **OPPOSITE**: the code draws something else (a guide value marked `[P]`
counts here when the code draws a contrary value). **ABSENT**: no code, and nothing contrary drawn. **n/a**: not
audited, with the reason. "Producer → paint" names where the value is made and where it reaches the slab or editor.

---

## Totals

| verdict | rows |
|---|---|
| DOES | 45 |
| SET UP | 11 |
| OPPOSITE | 23 |
| ABSENT | 3 |
| n/a | 4 |
| **all** | **86** |

▶ Recount: `grep -E '^\| [0-9]+\.[a-z0-9]+ ' scratch/style-guide/AUDIT.md | awk -F'|' '{print $4}' | grep -c '\*\*OPPOSITE\*\*'`
(likewise for each verdict). The §17 table is counted separately: 7 confirmed, 1 refuted as worded.

## The 10 worst opposites (most silent in a town nobody has looked at, first)

1. **An unknown or row-less class becomes `residential`, silently, at three sites.** These are `skeleton.js#seedSection`
   (`STD_SECTION[base] ? base : 'residential'`), `derive.js#mapHighwayToStreetType` (`default: return 'residential'`)
   and `streetProfiles.js#measureFromSeed` / `defaultSideMeasure` (`TYPE_PAVEMENT_HW[type] || TYPE_PAVEMENT_HW.residential`).
   `living_street` is in `STREET_CLASSES` but has no `STD_SECTION` row, so it seeds lanes + 2 × 8 ft parking with a
   curb, lawn and walk (row 1.f).
2. **A named way of any class becomes a street chain.** `skeleton.js#groupByName` groups every way that has a `name`
   tag. No class test and no `area` test exist, so a named plaza, footway, pedestrian street or service way gets a
   residential seed carriageway (rows 1.g, 1.h, 9.a).
3. **A side the profile says has no ped realm still paints a 3 m ped band.** `streetProfiles.js#measureFromSeed` gives
   a non-`SIDEWALK_ELIGIBLE` type (`pedestrian`, `service`, `footway`, …) `terminal:'none'`, treelawn 0, sidewalk 0.
   But `tileGround.js#resolvePedDepths` reads only `pedRealm === false`. Pure call on `{terminal:'none', treelawn:0,
   sidewalk:0}` → `{tl:1.5, sw:1.5, hasTL:false}`. Whether such a side reaches a pour's paint: not measured.
4. **Every unsurveyed street paints a lawn.** The seed's class ped dims are all ≥ 1.22 m, and
   `tileGround.js#gleanGap` thresholds at `TREELAWN_YN_THRESHOLD = 0.6`. So every unsurveyed, non-expressway side
   gleans treelawn-Y and paints curb → TL → SW. Pure call on the secondary and primary seeds → `hasTL:true` (row 2.n,
   §17.7).
5. **The kit curb cut is `'none'` and the code argues for it.** `curb-cut-norm.mjs#resolveKind`'s kit is
   `{ style: 'none' }`, and its header states the opposite doctrine to `r-curb-ramp-default-perpendicular`: "The kit
   default is NONE, never a style" (row 7.d).
6. **The kit kerb is 0 m.** `curb-cut-norm.mjs#resolveCurbCutNorm` uses `kerb: …{ height: 0 }`, against
   `r-house-kerb-height` (6 in). Huron's flatness rides on the absent key (row 2.g; see §C).
7. **A narrow sliver, or a median the tile pass does not detect, is painted as a block** with walk + lawn + LU. No
   width rung exists; the only floor is `tileGround`'s "too narrow for even the curb → all LU" (`tooNarrow`)
   (row 4.i, §17.1).
8. **Island rules have no consumer.** No code reads `r-house-curbed-min-width`, `r-house-island-min-area` or
   `r-house-nose-radius`. A junction residual paints all-walk strips (`blockClass === 'jr'` → `matOuter/matInner:'SW'`),
   and a median end takes the ordinary fillet (4.5 m × scale) (rows 4.g, 4.h).
9. **Every untagged dead end is round.** `skeleton.js` stamps `s.caps[end].cap = 'round'` at every degree-1 tip.
   `tileGround` resolves authored `capEnds ?? caps.cap ?? round`. `turning_circle` / `turning_loop` is read nowhere in
   `cartograph/` or `src/lib/`. The guide's `[P]` default is blunt (row 8.d).
10. **Alleys are trimmed against a different street edge than the one painted, and the loop names skip it.**
    `derive.js`'s alley trim (`_rowBufferPaths` → `streetROWUnion`) sizes the street from `centerlines.json` or
    `streetProfiles#defaultMeasure` (`TYPE_PAVEMENT_HW`, 7 ft parking) + `CURB_WIDTH`, not the seed the slab paints.
    Its own comment says that source "disagrees on two thirds of streets". It skips `LOOP_STREET_NAMES` by name
    (row 1.i2, §A).

---

## §A — `derive.js` `LOOP_STREET_NAMES`: is it on the live pour path?

**Yes, it is live: it runs on every pour. It reaches the slab through the alley trim, and found by grep, nowhere else.**

- **Where it runs.** `LOOP_STREET_NAMES = new Set(['Benton Place', 'Mackay Place'])` sits inside
  `derive.js#deriveLayers`. `pipeline.js#main` calls that on every pour and writes the result to `clean/map.json`
  `layers`. The set is defined once and used 7 times.
- **What it feeds**, use by use:
  - The grid-street union that cuts derive's blocks, the loop cut, the frontage patch, and the name-keyed loop
    medians (`allBlockPaths.push(medPaths[i])`). All of these go to the `block` / `sidewalk` / `lot` / `parcel` layers.
  - The dead-end points.
  - The dead-end tip circles.
  - The alley trim (`_rowBufferPaths`).
- **Who reads those layers.**
  - The slab bake (`bake-ground.js`, `mapLayers.*`) reads only `parking_lot`, `leisure`, `natural`, `water`,
    `barrier`, `centerStripe`, `parkingLine` and `bikeLane`, plus `ribbons` (`ribbons.alleys` / `ribbons.paths` →
    `buildPathRibbons`).
  - `layers.block` / `layers.parcel` are read by `serve.js` (the marker lookup) and by two checks
    (`claims-a-parcel-keeps-all-its-parts`, `claims-vacant-is-said-only-by-a-well`). No slab reader was found.
- **Where it reaches the slab.** Through `ribbons.alleys`: an alley meeting Benton or Mackay Place is not trimmed by
  that street.
- **The loop median the slab paints is chosen by geometry, not by the name list.** `deriveLayers`'s
  `LOOP_SNAP` / `LOOP_MIN_MED` closed-body test emits `kind:'median'`, and `tileGround` routes it to `median`. That
  path holds in town #2. The name list duplicates it on derive's own layers.
- **Doc rot.** `LOOP-STREETS.md` §4 cites `derive.js:1416` and seven other line numbers. The definition has moved
  (it is in `deriveLayers` now), and the doc's "dereferenced 8×" lists 7 sites.

## §B — The cross-section tables, per field: which one reaches the paint

There are **four** tables, not three. The fourth is `src/cartograph/streetProfiles.js`: `TYPE_PAVEMENT_HW`,
`SV_TREELAWN` 4.5 ft, `SV_SIDEWALK` 5 ft and `CURB_WIDTH`.

| field | class | the value painted | producer → paint | dead tables for this field |
|---|---|---|---|---|
| carriageway half-width | residential · unclassified · living_street · road · any row-less or named-other class | (lanes, or 1 / 2 by `oneway`) × 10 ft + 2 × 8 ft parking, ÷ 2 | `STD_SECTION` → `seedSection` → `seed.pavementHW` → `measureFromSeed` → ribbons measure → `tileGround` | `STANDARDS.streets.*` (derive's own layers only); `TYPE_PAVEMENT_HW` (alley trim + no-seed fallback only) |
| | tertiary | lanes × 10 ft, **no parking** | same | the `parking: 8 ft` on the tertiary and secondary rows is dead: `seedSection` adds parking only for residential/unclassified |
| | secondary · primary | lanes × 11 ft, no parking | same | as above |
| | motorway · trunk · links | `highwaySection` from lanes + `references/registry.json` | `derive.js#computeStreetMeasure` → `measureFromSeed(seed, type, hs)`; throws without a section | `STD_SECTION` has no row; never read |
| | any surveyed side (LS) | `min(seed.pavementHW, room)` per `fromSurveyDist` / `fromRowHalf` | `skeleton.js#stampCustomWidths` with **`CURB_WIDTH` and `SV_SIDEWALK`** (streetProfiles) | — |
| | authored | `blockCustoms` / overlay measure | wins over all | — |
| curb width | all | the Look's `curbWidth`. ⚠️ On this branch `buildTileGround` still substitutes `CURB_WIDTH` when it is absent (`Number.isFinite(opts.curbWidth) ? … : CURB_WIDTH`). The no-substitute ruling (`acf5fb70`) is **only on `boz/hpdm-gate`** | Look → `bake-ground` / editor → `buildTileGround` | `STD_SECTION.curb 0.15` (no reader of `seed.curb`); `STANDARDS.curb.width` (derive layers + the loop-median inset) |
| treelawn depth | every class, every town | **1.5 m** | `tileGround.js#STD_TREELAWN` via `resolvePedDepths` | `STD_SECTION.treelawn` 4–5 ft and `SV_TREELAWN` reach only the glean **Y/N** (`gleanGap` ≥ 0.6), never a depth; `STANDARDS.treeLawn` (derive layers) |
| walk depth | every class, every town | **1.5 m** | `tileGround.js#ADA_SIDEWALK` via `resolvePedDepths` | `STD_SECTION.sidewalk` 5 / 6 / 8 ft (never a depth); `STANDARDS.sidewalk` (derive layers); `SV_SIDEWALK` (survey arithmetic only) |
| ped, zeroed | expressway (`pedRealm:false`) · detected median tiles | 0 | `skeleton.js#isExpressway` → `resolvePedDepths`; `tileGround` `isMedianTile` | — |
| corner radius | every class | **4.5 m** × `cornerRadiusScale`, then per-IX / per-corner overrides | `tileGround.js#buildTileGround` `baseR` (`opts.cornerR` has **no caller**); `buildBlockGeometryV2.js#R_CLASS_DEFAULT` | `STD_SECTION.cornerR` 4.5 / 5 / 6 / 7.5 (no reader of `seed.cornerR`); `STANDARDS.intersection.curbReturnRadius` 15 ft (derive's `roundCorners` on its own blocks) |
| alley width | `service=alley` | 15 ft | `STANDARDS.alley.pavedWidth` → `ribbons.alleys` → `bake-ground` `buildPathRibbons` | — |
| alley trim | | the asphalt edge from `centerlines.json` or `defaultMeasure` (`TYPE_PAVEMENT_HW`) + `CURB_WIDTH` | `derive.js` `_rowBufferPaths` | not the painted seed edge (worst opposite 10) |
| path widths | footway 5 ft · path + pedestrian 4 ft · cycleway 5 ft · steps 5 ft | as given | `STANDARDS.*.width` → `ribbons.paths` → `buildPathRibbons`, clipped to parcel interiors | — |

**Answer.** The **carriageway** is `STD_SECTION`'s (or the highway section, or the survey stamp). The **ped depths** and
the **corner radius** are `tileGround`'s constants, the same for every class. **Alleys and paths** are `standards.js`'s.
`streetProfiles.js` reaches the paint through LS's survey arithmetic and the alley trim. The class ped dims in
`STD_SECTION` reach the paint as one bit, treelawn Y/N, which is always Y.

## §C — The kerb and cut rulings against the code, and Huron's missing kerb key

- **Kerb height, 6 in kit (`r-house-kerb-height`): OPPOSITE.**
  - `resolveCurbCutNorm` uses `kerb: resolveKind('kerb', …, { height: 0 })`. The comment above `validateKerb` says
    "Kit = 0: a town that authors nothing stays one flat plane".
  - Consumers: `bake-ground.js` (`kerbH`, which throws without ramp slopes when cuts exist), `kerbLift.mjs#kerbPlan`
    (throws without `taperRun` when there is curbless edge), and `bake-buildings.js`.
  - The derive pour prints the rung: `[kerb] height … — from <source>`.
- **Cut style, perpendicular kit (`r-curb-ramp-default-perpendicular`): OPPOSITE.**
  - The kit is `{ style: 'none' }`, and the header states "never a style".
  - The style machinery exists (`CURB_CUT_STYLES`, `validate`). A kit style would also need kit `width` /
    `warningDepth`, which `validate` demands of any non-`none` style ("the jurisdiction's standard, never the kit's").
  - The town-wide switch: ABSENT (row 7.g).
- **Huron's missing kerb key: confirmed.**
  - `huron/norms.json` has `curbCuts` (perpendicular) and `crosswalks` (none), but **no `kerb`**.
  - `cartograph/states/*.mjs` carry no `norms` at all, so Huron resolves to the kit `{ height: 0 }`.
  - JH has **no `norms.json`**, so it gets kit cuts `none`, crosswalks `none` and kerb 0.
  - ⚠️ **The guide's consequence ("every Huron street gains a 6 in kerb") is not what this code would do.** If the kit
    kerb became 0.1524 m with nothing else changed, Huron's bake would **throw**, not curb silently:
    - its perpendicular cuts have no `rampSlope` / `flareSlope` (`bake-ground` throws);
    - its curbless edges have no `taperRun` (`kerbLift#kerbPlan` throws).
  - It would gain kerbs silently only if the kit rung also supplied slopes and a run. The fix the guide names still
    holds: an explicit `kerb.height: 0` in Huron's norm, declared rather than absent.
- **Curb top width, 6 in.**
  - Not a kit value: the Look authors it.
  - Looks on this branch: LS, HPDM, Huron and Altadena 0.381 · PTown 0.1524 · JH and kit-default none.
  - The guide's "recommended 0.15" is matched by 1 of the 5 towns with a curb.
  - See §B for the `CURB_WIDTH` substitute still live on this branch.

---

## Per entry

`| row | the guide says | verdict | the code (producer → paint) |`

### §0 Method

| row | the guide says | verdict | the code |
|---|---|---|---|
| 0.1 | classify from tags and topology, a closed vocabulary, never a dimension | **OPPOSITE** | unnamed ways are classed by tag (`STREET_CLASSES` / `PATH_CLASSES`), but named ways are classed by having a name (`groupByName`), and three sites fall back to residential (worst 1, 2) |
| 0.2 | one drawn form per type, the same in every town | **SET UP** | the per-class seed exists; the paint is one form everywhere (1.5 / 1.5 / 4.5) because the class ped dims and radii have no reader (§B) |
| 0.3 | the join is the band bent | **DOES** | the corners are the band; perpendicular corners re-fill a sector of the band (`sectionPassProtoTile`), constructing no primitive |
| 0.4 | data selects, never measures | **OPPOSITE** | the survey stamp measures (`stampCustomWidths`); `lanes` multiplies a lane width (`seedSection`). OSM `width` is read nowhere in the pour (only `structures.mjs` reads `tags.width`) |
| 0.5 | each missing rung says so by name, per pour | **SET UP** | cuts, crosswalks and kerb print their `source` (derive `[kerb] … from`); ped depths, carriageway and corner radius name no rung |
| 0.6 | unclassified prints loudly, never residential | **SET UP** | unnamed ways in neither set are printed and kept out of `streets[]`; `road` is warned. Named ways and row-less street classes (`living_street`) go residential silently |

### §1 Street classes

| row | the guide says | verdict | the code |
|---|---|---|---|
| 1.a | motorway / trunk / links: swept from lanes, no handle | **DOES** | `measureFromSeed` throws without `highwaySection`; an overlay on a highway is refused and printed (`computeStreetMeasure` caller, `hwyRefused`). The no-curb claim was not re-verified |
| 1.b1 | primary carriageway: lanes × 11 ft, no parking | **DOES** | `STD_SECTION.primary` → `seedSection` |
| 1.b2 | primary TL 4 ft / walk 8 ft `[C]` | **OPPOSITE** | paints 1.5 / 1.5 (`resolvePedDepths`); the seed dims decide only Y/N |
| 1.c1 | secondary carriageway: lanes × 11 ft | **DOES** | as 1.b1 |
| 1.c2 | secondary TL 4 ft / walk 6 ft `[C]` | **OPPOSITE** | as 1.b2 (pure call → 1.5 / 1.5) |
| 1.d1 | tertiary carriageway: lanes × 10 ft | **DOES** | `STD_SECTION.tertiary`; note that `mapHighwayToStreetType` maps tertiary → `secondary` for `SIDEWALK_ELIGIBLE` |
| 1.d2 | tertiary TL 4 ft / walk 6 ft `[C]` | **OPPOSITE** | as 1.b2 |
| 1.e | residential / unclassified / road: 10 ft lanes + 2 × 8 ft parking, 1.5 / 1.5 | **DOES** | `seedSection`; `road` seeds residential and is warned (`⚠️ highway=road … seeds it as residential`) |
| 1.f | living_street: one shared surface, no curb or lawn `[P]` | **OPPOSITE** | residential seed + `SIDEWALK_ELIGIBLE` residential → curb, lawn, walk |
| 1.g | linear pedestrian: a pedestrian street `[P]` | **OPPOSITE** | unnamed: a path ribbon at `STANDARDS.path.width` 4 ft, clipped to parcel interiors (`derive` `paths` filter → `buildPathRibbons`). Named: a chain with a residential carriageway and `terminal:'none'`, which still paints 1.5 / 1.5 (worst 3) |
| 1.h | pedestrian + `area=yes`: plaza | **OPPOSITE** | `area` is read nowhere in `skeleton.js` / `derive.js` / `src/lib`; named → chain (§9) |
| 1.i1 | alley: 15 ft paved, no curb | **DOES** | `STANDARDS.alley.pavedWidth` → `ribbons.alleys` → slab |
| 1.i2 | alley cut at the asphalt | **OPPOSITE** | trimmed at an asphalt edge from a different table, and loop streets are skipped by name (worst 10) |
| 1.j | lot aisle, paved within its lot `[P]` | **OPPOSITE** | resolves the guide's "not established": an unnamed `service` that is not `service=alley` is in no derive ink filter, so it **draws nothing**; a named one becomes a street chain |
| 1.k | paths: ink inside a block; `footway=sidewalk` is evidence, not ink | **DOES** | derive `footways` excludes `footway=sidewalk` / `crossing`; sidewalk ways are read only by `stampCustomWidths` to resolve LS survey sides |
| 1.l | not-built classes dropped and printed | **DOES** | `skeleton.js` `NOT_BUILT` |
| 1.m | anything else: unclassified (loud) `[P]` | **SET UP** | as 0.6 |

- **Override: the Type pulldown.** `SurveyorPanel` writes `type`, but the pour's measure is computed from `s.highway`
  (`computeStreetMeasure(s.name, { highway: s.highway }, …)`). Whether `type` reaches the paint by another route: not
  established.

### §2 The cross-section stack

| row | the guide says | verdict | the code |
|---|---|---|---|
| 2.a | mono-width, two equal strips; presence swaps material | **DOES** | `resolvePedDepths` (1.5 = 1.5; `hasTL` orders the strips) |
| 2.b | the fill spans curb → block centre, LU remainder | **DOES** | `tileGround` `luRemainder` |
| 2.c | lane local 10 ft · collector / arterial 11 ft | **DOES** | `STD_SECTION`. ⚠️ The guide's §2 says collector = 11 ft, but tertiary (a collector in §1) is 10 ft in code and in §1 |
| 2.d | highway lane 12 ft | **DOES** | `highwaySection` reads the registry (`highwayStandard`); not re-run |
| 2.e | parking lane 8 ft | **DOES** | `STD_SECTION`, residential / unclassified only; the 7 ft values (`standards.js`, `TYPE_PAVEMENT_HW`) reach derive's layers and the alley trim only |
| 2.f | curb top 0.15 m, authored, no substitute | **SET UP** | authored in the Look; ⚠️ the `CURB_WIDTH` substitute is still in `buildTileGround` on this branch (§B, §C) |
| 2.g | kerb height 0.15 m kit | **OPPOSITE** | kit 0 (§C); LS's 0.15 m norm DOES |
| 2.h | treelawn 1.5 m | **DOES** | `STD_TREELAWN` |
| 2.i | walk 1.5 m | **DOES** | `ADA_SIDEWALK` |
| 2.j | commercial-frontage walk 2.4 m `[P]` | **OPPOSITE** | 1.5 m on every frontage |
| 2.k | walk cross-slope ≤ 1:48 | **SET UP** | `curb-cut-norm.mjs#resolveWalkNorm`; its header: "NOT frozen into the pour: Section paints nothing from it" |
| 2.l | lawn slope ≤ 1:3.5 | **SET UP** | `resolveLawnNorm`, the same |
| 2.m | frontage = the LU remainder | **DOES** | as 2.b |
| 2.n | "Treelawn Y/N read from LS's hand survey only; every other town gets the standard pair" | **OPPOSITE** (the claim as worded) | every other town gets **Y**, from the seed's class dims passing `gleanGap` (worst 4), not a neutral pair |
| 2.o | `sidewalk=*` read nowhere in the pour | **DOES** (the claim) | only `extend-centerlines.js` (a fetch-side tool) reads it |
| 2.p | `r-sidewalk-default-rule` (state-manual widths) | **OPPOSITE** | one constant, `ADA_SIDEWALK`, in every state |

### §3 Shared streets

| row | the guide says | verdict | the code |
|---|---|---|---|
| 3.a | one surface; no curb, lawn or walk | **OPPOSITE** | as 1.f |
| 3.b | edge band 0.3 m | **ABSENT** | — |
| 3.c | the curbed street's curb returns and stops; flush taper | **SET UP** | `kerbLift.mjs#kerbPlan` slopes curbless edges flush over `kerb.taperRun` (LS 1.0 m); nothing classes a shared street to use it |
| 3.d | width reaches the frontage, not lanes × lane | **OPPOSITE** | `seedSection` lanes + parking |

### §4 Divided roads, medians, islands, slivers

| row | the guide says | verdict | the code |
|---|---|---|---|
| 4.a | two carriageways; the median is the face between | **DOES** | `tileGround` `isDividedMedian` (carriageway runs sharing a `pairKey`) |
| 4.b | ped at each carriageway's outer curb; the median carries none | **DOES** where detected | `isMedianTile` → `tl = sw = 0`; undetected medians: see 4.i |
| 4.c | median curbed all the way round | **n/a** | not audited (would need a render or the curb ring) |
| 4.d | median surface by town norm (planted / paved) | **SET UP** | medians paint their own group, `mat: median` (`bake-ground`), coloured by the Look's `layerColors.median` (`BlockGeometryV2Debug` `colorFor('median')`): **per Look, not `luRemainder` LU**. No planted / paved norm exists |
| 4.e | refuge ≥ 60 in where a crosswalk passes | **ABSENT** | `crossing:island` is read nowhere |
| 4.f | refuge warning strips | **ABSENT** | — |
| 4.g | curbed only ≥ 1.22 m; raised only ≥ 4.65 m², else painted | **OPPOSITE** | no consumer; a JR paints all-walk strips (`blockClass 'jr'`) |
| 4.h | nose: 0.61 m semicircle (or ordinary rounding, per 10-18) | **OPPOSITE** (to 10-17; matches 10-18) | the median end takes the ordinary fillet; no nose rule. Counted once, as OPPOSITE |
| 4.i | a narrow sliver is an island | **OPPOSITE** | no width rung; only `tooNarrow` (narrower than the curb → all LU) (worst 7) |

### §5 Junctions

| row | the guide says | verdict | the code |
|---|---|---|---|
| 5.a | the legs decide corner vs bend (`roadId` / `throughId`) | **DOES** | `throughId` in `skeleton.js` / `derive.js` / `tileGround.js` |
| 5.b | T far kerb by norm (kit none, LS cut) | **DOES** | `curb-cut-norm.mjs` `FAR_KERB`, `validateCrosswalk` |
| 5.c | crosswalks square across, centred on their cuts | **DOES** | `crosswalksSquareAcross` (`tileGround` → `bake-ground`) |
| 5.d | skew: same rules, ordinary radius, angle informs nothing | **DOES** | `baseR` is uniform; no angle term |
| 5.e | multi-leg: a divided corridor is one road at the corner | **n/a** | not audited |
| 5.f | offset jog: two Ts, never consolidated | **n/a** | not audited |
| 5.g | a name change is a through-node | **DOES** | `skeleton.js` name-transition pass (`continuesAs`), `throughId` |
| 5.h | roundabout: one welded ring | **DOES** | `skeleton.js#weldRoundabouts`; `onewayOf` reads `junction=roundabout` |

### §6 Corners

| row | the guide says | verdict | the code |
|---|---|---|---|
| 6.a | radius 4.5 m × scale, per-IX / per-corner overrides | **DOES** | `buildTileGround` `baseR` / `scale` / `ixOverrides` / `cornerOverrides`. The guide's "not established" resolves: `STD_SECTION`'s per-class radii are **not consumed** (no reader of `seed.cornerR`; no caller passes `opts.cornerR`) |
| 6.b | radius fill: the band bent round the arc | **DOES** | the band pass (`filletRings` on the curb line) |
| 6.c | perpendicular fill: straight extension, an L, lawn fills | **DOES** | `sectionPassProtoTile`: `R.perp` sectors re-filled with the two legs' landings; a lawn wedge only when both legs carry TL; logs `perpWedgeLawn` / `perpWedgeConcrete` |
| 6.d | a bend: no pad, no cut | **DOES** | as 5.a |
| 6.e | a rim / shore corner is no corner | **DOES** | `__boundary__` / `__water__` handling in `tileGround` |
| 6.f | "whether fill follows cut style: not established" (Q6.b) | **DOES** (one picker) | the perpendicular fill is driven by `curbCutsOnJunctionCorners`' `perp` list, i.e. by the corner's resolved cut style. Conflict 6.2 is answered by the code |

### §7 Curb ramps and crossings

| row | the guide says | verdict | the code |
|---|---|---|---|
| 7.a | cut 1.5 m, warning 0.6 m | **DOES** for LS and Huron | the town norm; `validate` throws on a style without dims |
| 7.b | ramp 1:12, flares 1:10 | **DOES** for LS | `validateKerb` → `ratio`; Huron has no kerb (§C) |
| 7.c | crosswalk square, kerb to kerb; no cut ⇒ no crosswalk; paint by norm | **DOES** | `validateCrosswalk`, `byCorner`; `tileGround` returns no crosswalks when `norm.style === 'none'` |
| 7.d | kit default perpendicular | **OPPOSITE** | kit `'none'` (§C) |
| 7.e | ladder: operator → evidence → town → state → kit | **DOES** | `resolveKind`; evidence from `curb-cut-evidence.mjs`. ⚠️ No state file carries `norms`, so the state rung is empty everywhere |
| 7.f | JH has no `norms.json` | **DOES** (the claim) | confirmed |
| 7.g | a town-wide style switch | **SET UP** | the per-corner `cut` override exists (Section); no town-wide knob |

### §8 Dead ends and caps

| row | the guide says | verdict | the code |
|---|---|---|---|
| 8.a | cap styles round / blunt / none | **DOES** | `capEnds` (overlay) over `s.caps` |
| 8.b | the bulb has one cross-section; every shoulder gets a ramp | **n/a** | not audited (the shoulder-ramp extent is a pending ruling) |
| 8.c | bulb radius = the stroke | **DOES** | round cap at the street's half-width |
| 8.d | `turning_circle` selects round; untagged → blunt `[P]` | **OPPOSITE** | the tag is read nowhere; untagged → **round** at every degree-1 tip (worst 9). `r-cap-default-from-data` is half-built: from degree, not the tag |

### §9 – §13

| row | the guide says | verdict | the code |
|---|---|---|---|
| 9.a | a plaza is an area fill, never a chain | **OPPOSITE** | `area` unread; named → chain (`groupByName`) |
| 10.a | grade-separated roads leave the face graph | **DOES** | `skeleton.js#gradeFields` / `gradeSeparated` |
| 10.b | verge: grass, no curb, no walk (guide: "unbuilt per ARCHITECTURE §7") | **DOES** | **built**: `tileGround`'s region classifier (H-3 step 4) classes `verge` / `jr` / `block`; a verge's edges are bare (`bareAt` → `blockClass === 'verge'`). The draft's "unbuilt" is stale: `ARCHITECTURE §7` or the draft is rot. Whether a verge paints grass: not established |
| 10.c | a surface bridge stays at grade | **DOES** | `gradeSeparated` is false off limited access / `layer` / `bridge` |
| 11.a | driveway: a dropped kerb + apron `[P]` | **SET UP** | evidence exists (`curb-cut-evidence.mjs` `notOnCrossing`), but nothing draws a driveway; unnamed `service=driveway` draws nothing |
| 12.a | a rim edge: no walk, no curb, owns its arc at zero depth | **DOES** | `tileGround` `noPed` (`aBase <= 1e-6`), the A10 comment |
| 12.b | a corner flanked by `__boundary__` is no corner | **DOES** | as 6.e |
| 13.a | garden frontage = today's form | **DOES** | as 2.b |
| 13.b | street-wall frontage `[P]` | **OPPOSITE** | the band is a constant 3 m behind the curb, whatever stands there (§17.8) |

---

## §17 — The "wrong notions", confirmed or refuted

| # | the notion | verdict | the code |
|---|---|---|---|
| 1 | a narrow sliver is a block | **CONFIRMED** | no width rung; a median is zeroed only when `isMedianTile` detects it; the Huron noses (cited check, not re-run) |
| 2 | a living street is residential | **CONFIRMED, and wider** | three fallback sites, not one (worst 1). The guide's own numbers disagree: §3 says 7.92 m carriageway, curb at 4.0 m; §17.2 says 8.0 m and a property line at 7.15 m. From the seed (1 lane + 2 × 8 ft, PTown curb 0.1524, 1.5 + 1.5): half-width 3.96, back of walk 7.11 m. The 7.15: not reproduced here, cause not established |
| 3 | a named plaza is a street | **CONFIRMED** | `groupByName` has no class or `area` test |
| 4 | a pedestrian street is a path | **CONFIRMED** (unnamed) | 4 ft path ribbon. Named → a residential chain with a 3 m ped band (worst 3) |
| 5 | every median is grass (`luRemainder`) | **REFUTED as worded** | a detected median paints its own `median` group in the Look's `median` colour, not the LU remainder. What holds: **one colour per Look, with no planted / paved rung**, and undetected medians paint as blocks |
| 6 | curblessness is "no kerb key" | **CONFIRMED** | the consequence differs: building the 6 in kit makes Huron's bake **throw**, not curb silently (§C) |
| 7 | every street outside LS has a lawn | **CONFIRMED** | `gleanGap` on the seed dims (pure call, worst 4) |
| 8 | the street's back is a constant depth | **CONFIRMED** | `STD_TREELAWN + ADA_SIDEWALK` = 3.0 m behind the curb on every non-zeroed side |

**Further wrong notions the audit found** (not in the draft):
- **9.** A type the profile says has no ped realm still gets one (worst 3).
- **10.** The alley's street is not the painted street (worst 10).
- **11.** Every dead end is a turnaround (worst 9).
- **12.** A tertiary is a secondary to `mapHighwayToStreetType`, but not to `seedSection`. Two vocabularies classify the
  same way differently.

## Errors of fact in the draft (for its author)

- **§2 "curb, top width"** says `acf5fb70` removed the substitute. It is on `boz/hpdm-gate` only; this branch still
  substitutes (§B).
- **§6 "not established"** about the per-class radii: they are not consumed (6.a). Q6.b is answered by the code (6.f).
- **§1 lot aisle "not established"**: it draws nothing unnamed, and a chain named (1.j).
- **§10 verge "unbuilt"**: it is built (10.b).
- **§17.5**: the median is its own material (above).
- **§3.1 / §15.6**: Huron would throw, not curb silently (§C).
- **§2's table** gives collector lanes as 11 ft; tertiary is 10 ft (2.c).
- **§8's three tables** are four (§B).
