# Classifier sites — `BRIEF-the-classifier.md` §1 checked against the code, and the rewiring surface

*Lath, 2026-10-19, for Boz. Read-only: greps and reads of the files named; nothing poured. Symbols, not lines.*

## 1 · The §1 premises

| # | Premise | Verdict | What the code says |
|---|---|---|---|
| 1 | Three silent residential fallbacks | **CONFIRMED, UNDERSTATED: at least 8 live** | See §2 |
| 2 | A name makes a street | **CONFIRMED** | `skeleton#groupByName` takes every built way (after `NOT_BUILT`). The only screen before chaining is `EXCLUDE_FROM_STREETS`. `STREET_CLASSES` / `PATH_CLASSES` test only the `unnamed` remainder. A mixed-class name group takes `skeleton#chainHighway`'s length-weighted vote over `CLASS_RANK`. |
| 2b | *(missed)* A second per-name list | **LIVE** | `skeleton.js` `EXCLUDE_FROM_STREETS` = {'MetroLink Green Line', '21st Street Cycle Track'}: LS proper nouns, on every town's pour. `VALIDATION_NAMES` is log-only. |
| 3 | `area` read nowhere | **CONFIRMED** | No read of the `area` tag in `skeleton.js`, `derive.js`, `fetch.js`, `pipeline.js`, `src/lib`, `src/cartograph`. Every `.area` hit is a computed polygon area. |
| 4 | Class does not reach the band | **CONFIRMED** | `tileGround#resolvePedDepths` reads only `baseMeasure[side].pedRealm === false`; otherwise `STD_TREELAWN` / `ADA_SIDEWALK`. |
| 5a | Medians and slivers paint as blocks | **CONFIRMED** | The only floor is the PROTO③ `tooNarrow` counter (paints all land use). |
| 5b | Every degree-1 tip is `round` | **CONFIRMED** | `caps?.[k]?.cap \|\| 'round'` at two sites in `tileGround.js`. Tips come from `detectTileCaps`. |
| 5c | `fetch.js` keeps tip nodes as `[lon, lat]` only (A09) | **REFUTED as worded** | Geometry nodes come back untagged, but `fetch.js` queries `LIGHT_NODES = ['highway']` **with tags** into `osm.json` `pois` (`osmType:'node'`, `tags`, `coords[1]`). The gap is the **read**: nothing in `skeleton.js` or `tileGround.js` reads `pois` (`derive.js` reads it only for `street_lamp`). Way features keep no node ids, so a tip join is by lon/lat (both rounded 1e7 from the same node). |
| 6 | `LOOP_STREET_NAMES` is live | **CONFIRMED** | Defined once in `derive.js`, read 7 times. |
| 7 | A chain carries no class field | **CONFIRMED** | PTown's 423 chains: `highway`, `oneway`, `layer`, `bridge`, `tunnel`, `gradeSeparated`, `phase`, `segments`, `caps`, `seed` (with `seed.seededClass`, the seed's own class)… `tags` rides only on the 47 `synthetic` chains, so for a named chain a downstream consumer has only `highway`. |

`turning_circle` / `turning_loop` in `pois`, per town:

```
for t in lafayette-square hipointedemun huron jacksonheights provincetown; do node -e "const p=require('./cartograph/data/$t/raw/osm.json').pois||[];const c={};for(const x of p)if(/^turning_/.test(x.tags?.highway))c[x.tags.highway]=(c[x.tags.highway]||0)+1;console.log('$t',p.length,JSON.stringify(c))"; done
```

On 2026-10-19: Huron 13 + 1 loop; JH 14; PTown 19 + 16 loops. LS and HPDM have `pois` = 0: their `osm.json` predates the bucket, and they need a re-fetch.

## 2 · The residential fallbacks (live)

1. `skeleton#seedSection`: `STD_SECTION[base] ? base : 'residential'`
2. `skeleton#chainHighway`: `best || sourceTags?.highway || 'residential'`
3. `derive#mapHighwayToStreetType`: `default: 'residential'`. It also maps tertiary → `'secondary'` and unclassified / living_street / path / track → `'residential'`.
4. `derive.js`, the alley-trim ROW reach: an **inline duplicate** of (3), the ternary ending `: 'residential'`, in the `else` after `isHighwayClass(f.tags?.highway)`, feeding `defaultMeasure(type, correctedSurvey[name])`.
5. `streetProfiles#measureFromSeed`: `TYPE_PAVEMENT_HW[type] || TYPE_PAVEMENT_HW.residential`
6. `streetProfiles#defaultSideMeasure`: the same `||`, plus its closing "neither side surveyed" residential treelawn + sidewalk. It is live via `derive#computeStreetMeasure` (seedless branch), site 4, and `streetProfiles#getHalfWidth`.
7. `standards#getStreetSpec`: `tags?.highway || 'residential'`; `default:` → `STANDARDS.streets.residential`. Live: `derive.js` `crossSection(getStreetSpec(…)).pavement` (×3), plus bike and parking lanes.
8. `src/cartograph/measureModel.js`: `defaultMeasure(st.type || 'residential')` (browser).

Minor: `streetProfiles#osmHierarchyScore` defaults to `30`, which is residential's score.

### What each town seeds as another class

```
for t in lafayette-square hipointedemun huron jacksonheights provincetown; do node -e "const s=require('./cartograph/data/$t/clean/skeleton.json');const c={};for(const x of s.streets){if(x.highway.replace(/_link\$/,'')===x.seed?.seededClass)continue;const k=x.highway+'→'+x.seed?.seededClass;c[k]=(c[k]||0)+1};console.log('$t',JSON.stringify(c))"; done
```

The motorway and trunk rows don't reach the paint: `measureFromSeed` takes `highwaySection` for a highway class. Every other row does. For footway, service, pedestrian, cycleway and steps, the paint reads `terminal:'none'` (`SIDEWALK_ELIGIBLE` = residential / secondary / primary on the mapped type), but the asphalt half-width is the seed's residential carriageway. path, track, living_street and elevator map to `'residential'`, so they also get a lawn and a walk.

## 3 · The rewiring surface: every site that reads raw `highway` or keeps its own class vocabulary

Found by grepping for comparisons on `highway`, `Set([...class names...])`, `switch (highway)` and `isHighwayClass`. Comments excluded.

### The pour

**`cartograph/skeleton.js`**
- `NOT_BUILT`
- `STREET_CLASSES`, `PATH_CLASSES`, `isStreetClass`
- `PRE_A19_UNNAMED`: an authoring-key ordering, and it must survive as ordering (`checks/claims-authored-skelids-keep-their-ways.mjs`)
- `CARRIAGEWAY_CLASSES`, `CLIP_SCALE_CLASSES` (the divided-pair gate)
- `LIMITED_ACCESS` (`gradeFields`, `weldHighwayChains`, the `isHwy` test)
- the motorway-only test before `gradeFields`
- the `a.highway !== b.highway` hold in the highway weld
- the roundabout ring's class set (`ring.map(m => m.highway)`)
- `CLASS_RANK` / `chainHighway`
- `seedSection`'s `_link` strip
- `EXCLUDE_FROM_STREETS`

**`cartograph/derive.js`**
- `mapHighwayToStreetType`
- the inline ternary (§2.4)
- `calibrateFromLamps`'s vehicular list (no caller: dead)
- the alley filter (`service` + `service=alley`)
- the path filters: footway minus crossing/sidewalk, cycleway, steps, path | pedestrian
- `!== 'service'` before the bike and parking lanes
- `isHighwayClass` in `computeStreetMeasure`, in the overlay-on-highway test, and in the inner-edge flat set
- two inline `HWY` sets (ramp flares)
- `LOOP_STREET_NAMES`

**`cartograph/standards.js`**
- `getStreetSpec`'s switch

**`src/cartograph/streetProfiles.js`**
- `HIGHWAY_MAINLINE`, `HIGHWAY_RAMP`, `isHighwayClass`
- `SIDEWALK_ELIGIBLE`
- `TYPE_PAVEMENT_HW`
- `highwaySection`'s class test
- `osmHierarchyScore`

**`src/lib/tileGround.js`** (three copies of the highway set)
- `HWY_CLASS`, in the vertex / grade-sep pass
- `HIGHWAY_CLASSES`, in the highway-ribbon pass
- `rampTerminalFlares`' `hwyClasses` parameter
- the `/_link$/` mainline test

**Other pour scripts**
- `cartograph/seed-centerlines.js`: `mapType`, `vehicularTypes`, the alley filter
- `cartograph/survey.js`: `vehTypes`
- `cartograph/extend-centerlines.js`: `vehicular`, `PATHS`

### Paint-adjacent and non-ground

- `cartograph/lamp-spacing.mjs`: `GROUP_OF` / `CARRIAGE` (living_street counts as `'ordinary'`), with `derive-lamps.mjs` reading it via `groupOf`
- `cartograph/curb-cut-evidence.mjs`: `ROAD`
- `cartograph/serve.js`: `OSM_LABEL_MAJOR` plus three `MAJOR` copies (label tiers)
- `cartograph/bake-ground-ao.js` `PAVED`, `src/lib/buildPathRibbons.js` `ORGANIC_PATH_KINDS`, and `src/cartograph/BlockGeometryV2Debug.jsx` `PATH_KINDS`: kind or material names downstream of derive, not tags. Listed because they repeat the vocabulary.
- `src/cartograph/MeasurePanel.jsx`, `SurveyorPanel.jsx`: `st.type || 'residential'` (display), plus the `measureModel.js` fallback (§2.8)

About 40 sites over 14 files. The highway-set and "major" copies (about 13) become columns of the one table.

## 4 · For the brief's delete list

- Add `EXCLUDE_FROM_STREETS`, the inline ternary, `defaultMeasure` / `defaultSideMeasure`'s residential default, `getStreetSpec`'s default, `chainHighway`'s `|| 'residential'` and `measureModel.js`'s `|| 'residential'`.
- Pass A's tip input is already in intake for three of five towns. A09 is a `pois` → tip join plus a re-fetch for LS and HPDM.
