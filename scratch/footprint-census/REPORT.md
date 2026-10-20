# Footprint × painted-ground census (2026-10-18, read-only)

Question (Jacob): footprints sit on treelawn / sidewalk / curb / asphalt. (A) real building at the street edge, default ped band too deep there; (B) footprint wrong (e.g. aerial-parallax trace). Measured below; mechanisms not measured are marked "cause not established".

## What was measured

- **Ground** = the served slab's painted partition, as triangles: `public/baked/<town>/ground.json` (v1) + `ground.bin`, every group with `partition: true` (non-partition overlays, e.g. PTown/Huron `mat:water`, excluded because they double-cover). Partition area matches the stencil disc to within 0.03–0.3% in every town (printed per town below). Classes: asphalt = `mat:asphalt`+`stripe`/`edgeline`/`bikelane`; highway = `mat:highway`; curb = `mat:curb`+`curbCut`; sidewalk = `mat:sidewalk`; treelawn = `mat:treelawn:*`; alley, path (`footway`/`cycleway`/`path`/`steps`) reported apart; everything else (all `face:*` and other mats) = non-street ground.
- **Footprints** = `public/baked/<town>/buildings.json` (v3) + the `buildings.bin` footprint section. Source from the id: `msbf-*` Microsoft ML footprints; `osm-*` OSM; `bin-*` NYC footprint well with BIN ids (JH); `bldg-*` LS's curated `src/data/buildings.json` (no per-building source recorded in the slab).
- **Authoring:** the slab is measured as served. `public/looks/<town>/design.json` blockCustoms: LS 27 keys, HPDM 6, PTown 0, Huron 0, JH design.json is `{}`. So PTown, Huron and JH are measured with no authored blocks, i.e. kit-default bands. I did not check whether the LS/HPDM slabs reflect their current blockCustoms.
- **Area** is exact: Sutherland–Hodgman clip of each footprint by each candidate triangle, XZ plane.
- **Depth** = for footprint sample points (vertices, edge points every 0.25 m, interior 0.25 m grid) lying in asphalt/highway/curb/sidewalk/treelawn, the max distance to the nearest non-street partition triangle (the property-line side). Resolution about 0.18 m. Cap 40 m. Limitation: where a footprint reaches more than halfway across a narrow street, the nearest non-street ground can be the opposite lot, so depth there is a lower bound.
- **Independent property line** = assessor parcels, `cartograph/data/<town>/raw/*_parcels.json` (LS/HPDM St. Louis city + county, PTown MassGIS L3, Huron Ohio statewide, JH MapPLUTO). Registration check (`parcelcheck.txt`): 99.0–100% of footprint area falls inside a parcel in every town.
- **OSM twins** = for MSBF footprints, `cartograph/data/<town>/clean/map.json` `buildings[].joinRings` (the OSM rings the prebake joined to that MSBF building), measured against the same painted ground.

Probes (all under `scratch/footprint-census/`): `census.mjs <town>` → `<town>.json` · `summarize.mjs` → `summary.md` · `commercial.mjs` → `commercial.md`/`commercial.json` · `parcelcheck.mjs <town>` → `parcelcheck.txt`. Each town runs in about 1–6 s at under 750 MB RSS.

**Doc/code mismatch found on the way:** `SLAB-CONTRACT.md §2.3` says ground indices are "absolute into the same buffer's position array (not group-relative)". In every served ground.bin, the indices are **group-local** (each group's min index is 0), which is how `src/components/BakedGround.jsx` reads them (`new Float32Array(bin, g.vertexByteOffset, …)`). Reading them as absolute gives a partition area 129× the disc on LS. Which side is wrong is for Boz.

## Overview

| town | footprints | intruding (>0.01 m² in street realm) | deepest reach lawn/walk only | deepest reach curb/road | depth ≥ 3 m | median depth (intruding) | street-realm footprint samples inside a parcel | footprints > 1 m past the parcel line |
|---|---|---|---|---|---|---|---|---|
| lafayette-square | 1082 | 124 (11.5%) | 91 | 33 | 33 | 1.87 | 92.1% | 7 |
| hipointedemun | 1446 | 78 (5.4%) | 33 | 45 | 45 | 3.71 | 87.9% | 14 |
| provincetown | 3057 | 1066 (34.9%) | 495 | 571 | 570 | 3.18 | 94.8% | 92 |
| huron | 3700 | 369 (10.0%) | 247 | 121 | 118 | 1.79 | 92.0% | 41 |
| jacksonheights | 9852 | 64 (0.6%) | 56 | 8 | 8 | 0.60 | 74.6% (93.2% for `bin`) | 4 |

Painted street ground lying inside an assessor parcel, area-weighted by triangle centroid, within the building bbox (`parcelcheck.txt`):

| town | treelawn | sidewalk | curb | asphalt |
|---|---|---|---|---|
| lafayette-square | 18.3% | 21.6% | 14.2% | 19.8% |
| hipointedemun | 36.2% | 41.4% | 30.7% | 29.2% |
| provincetown | 68.1% | 75.6% | 63.1% | 47.6% |
| huron | 35.1% | 48.7% | 27.8% | 15.0% |
| jacksonheights | 2.3% | 5.3% | 1.6% | 2.5% |

## Per town

## lafayette-square

ground: `public/baked/lafayette-square/ground.json` v1 groundKey 68fd341f (2026-10-06T07:48:24.752Z), 41 groups; partition area 2493063 m² vs disc 2499652 m²
buildings: `public/baked/lafayette-square/buildings.json` v3 (2026-10-06T22:35:04.160Z), 1082 footprints

| source | n | n asphalt | n highway | n curb | n sidewalk | n treelawn | n alley | n path | m² asphalt | m² highway | m² curb | m² sidewalk | m² treelawn | m² alley | m² path |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bldg | 1082 | 31 | 0 | 33 | 111 | 77 | 48 | 0 | 487 | 0 | 152 | 1332 | 999 | 179 | 0 |
| ALL | 1082 | 31 | 0 | 33 | 111 | 77 | 48 | 0 | 487 | 0 | 152 | 1332 | 999 | 179 | 0 |

Intrusion depth past the property-line side (footprints with street-realm overlap > 0.01 m²; depth = max distance of a footprint sample in asphalt/highway/curb/sidewalk/treelawn to the nearest non-street ground):

| source | n intruding | 0–0.5 | 0.5–1 | 1–2 | 2–3 | 3–5 | 5– | deepest: treelawn | sidewalk | curb | road |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bldg | 124 | 31 | 22 | 15 | 23 | 13 | 20 | 13 | 78 | 2 | 31 |
| ALL | 124 | 31 | 22 | 15 | 23 | 13 | 20 | 13 | 78 | 2 | 31 |

footprint area total 200297 m²; in street realm 2970 m² (1.48%). Samples outside any ground triangle: 0

Assessor-parcel test (stl_parcels.json; 2178 rings in the building bbox): of the footprint samples lying in the painted street realm, how many fall INSIDE a parcel (band painted over parcel land) vs OUTSIDE every parcel (footprint past the parcel line, or a parcel gap); "beyond" = the deepest such outside sample's distance to the nearest parcel edge.

| source | n intruding | street samples in parcel | outside | footprints w/ any outside | beyond 0–0.5 | 0.5–1 | 1–2 | 2–3 | 3–5 | 5– |
|---|---|---|---|---|---|---|---|---|---|---|
| bldg | 124 | 47643 (92.1%) | 4063 | 46 | 28 | 11 | 4 | 3 | 0 | 0 |
| ALL | 124 | 47643 (92.1%) | 4063 | 46 | 28 | 11 | 4 | 3 | 0 | 0 |

Worst 10 by depth:

| id | src | address | depth m | class at max | at (x,z) | m² asph/hwy/curb/walk/lawn | fp m² | street samples in parcel % | beyond parcel m | OSM twin depth m |
|---|---|---|---|---|---|---|---|---|---|---|
| bldg-0422 | bldg | 2001 PARK AV | 7.45 | asphalt | 234.7, -211.4 | 24.7/0.0/5.3/57.1/53.1 | 270.8 | 82 | 1.55 |  |
| bldg-0417 | bldg | 4 MISSISSIPPI ALLEY | 6.31 | asphalt | 274.4, -198.6 | 14.1/0.0/1.9/7.3/7.3 | 63.81 | 100 |  |  |
| bldg-0418 | bldg | 2 MISSISSIPPI ALLEY | 6.28 | asphalt | 279, -197.1 | 13.1/0.0/1.7/6.8/6.8 | 60.13 | 100 |  |  |
| bldg-0383 | bldg | 1901 PARK AV | 5.92 | asphalt | 328.9, -180.8 | 21.5/0.0/3.2/12.7/12.7 | 73.26 | 100 |  |  |
| bldg-0421 | bldg | 1312 MISSISSIPPI AV | 5.88 | asphalt | 266.1, -200.8 | 25.0/0.0/5.2/20.3/18.0 | 68.8 | 100 |  |  |
| bldg-0424 | bldg | 2007 PARK AV | 5.74 | asphalt | 216.8, -216.4 | 16.3/0.0/2.8/10.8/10.8 | 48.18 | 100 |  |  |
| bldg-0373 | bldg | 2031 PARK AV | 5.7 | asphalt | 162.6, -233.7 | 41.7/0.0/7.0/27.6/26.3 | 114.32 | 100 |  |  |
| bldg-0372 | bldg | 2028 RUTGER ST | 5.64 | asphalt | 151.4, -244 | 12.5/0.0/2.2/5.9/0.0 | 20.54 | 80 | 0.64 |  |
| bldg-0371 | bldg | 2028 RUTGER ST | 5.61 | asphalt | 149, -244.8 | 13.4/0.0/2.3/4.1/0.0 | 19.82 | 78 | 0.6 |  |
| bldg-0423 | bldg | 2003 PARK AV | 5.45 | asphalt | 226.5, -213 | 15.2/0.0/2.9/11.3/11.3 | 47.16 | 100 |  |  |

## hipointedemun

ground: `public/baked/hipointedemun/ground.json` v1 groundKey ce6c3ddc (2026-10-11T06:00:02.552Z), 44 groups; partition area 6036909 m² vs disc 6061141 m²
buildings: `public/baked/hipointedemun/buildings.json` v3 (2026-10-11T14:00:37.201Z), 1446 footprints

| source | n | n asphalt | n highway | n curb | n sidewalk | n treelawn | n alley | n path | m² asphalt | m² highway | m² curb | m² sidewalk | m² treelawn | m² alley | m² path |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| msbf | 1281 | 40 | 0 | 43 | 68 | 62 | 35 | 82 | 2440 | 0 | 393 | 2739 | 2519 | 527 | 2648 |
| osm | 165 | 2 | 0 | 1 | 2 | 1 | 3 | 6 | 5 | 0 | 2 | 12 | 6 | 13 | 97 |
| ALL | 1446 | 42 | 0 | 44 | 70 | 63 | 38 | 88 | 2445 | 0 | 394 | 2751 | 2525 | 540 | 2745 |

Intrusion depth past the property-line side (footprints with street-realm overlap > 0.01 m²; depth = max distance of a footprint sample in asphalt/highway/curb/sidewalk/treelawn to the nearest non-street ground):

| source | n intruding | 0–0.5 | 0.5–1 | 1–2 | 2–3 | 3–5 | 5– | deepest: treelawn | sidewalk | curb | road |
|---|---|---|---|---|---|---|---|---|---|---|---|
| msbf | 75 | 10 | 7 | 6 | 9 | 15 | 28 | 7 | 25 | 3 | 40 |
| osm | 3 | 0 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 | 2 |
| ALL | 78 | 10 | 7 | 7 | 9 | 16 | 29 | 7 | 26 | 3 | 42 |

footprint area total 510428 m²; in street realm 8116 m² (1.59%). Samples outside any ground triangle: 6

Assessor-parcel test (stl_parcels.json, stlco_parcels.json; 2004 rings in the building bbox): of the footprint samples lying in the painted street realm, how many fall INSIDE a parcel (band painted over parcel land) vs OUTSIDE every parcel (footprint past the parcel line, or a parcel gap); "beyond" = the deepest such outside sample's distance to the nearest parcel edge.

| source | n intruding | street samples in parcel | outside | footprints w/ any outside | beyond 0–0.5 | 0.5–1 | 1–2 | 2–3 | 3–5 | 5– |
|---|---|---|---|---|---|---|---|---|---|---|
| msbf | 75 | 58982 (88.3%) | 7804 | 22 | 6 | 4 | 3 | 3 | 4 | 2 |
| osm | 3 | 180 (34.2%) | 347 | 2 | 0 | 0 | 2 | 0 | 0 | 0 |
| ALL | 78 | 59162 (87.9%) | 8151 | 24 | 6 | 4 | 5 | 3 | 4 | 2 |

MSBF footprints vs their OSM twins (same building, hand-traced; clean/map.json joinRings), same painted ground. 1120 of 1281 MSBF footprints have ≥1 twin.

| MSBF depth bin | n MSBF intruding w/ twin | twin also intrudes | twin depth median | twin depth ≤ MSBF−1 m | MSBF intruding, no twin |
|---|---|---|---|---|---|
| 0–0.5 | 9 | 4 | 0.00 | 0 | 1 |
| 0.5–1 | 6 | 3 | 0.39 | 0 | 1 |
| 1–2 | 5 | 3 | 4.17 | 2 | 1 |
| 2–3 | 8 | 6 | 1.98 | 3 | 1 |
| 3–5 | 14 | 10 | 3.48 | 7 | 1 |
| 5– | 26 | 24 | 5.56 | 17 | 2 |

street-realm m² over the twinned set: MSBF 7880 vs OSM twins 6005 (footprint m²: MSBF 458394 vs twins 468274)

Worst 10 by depth:

| id | src | address | depth m | class at max | at (x,z) | m² asph/hwy/curb/walk/lawn | fp m² | street samples in parcel % | beyond parcel m | OSM twin depth m |
|---|---|---|---|---|---|---|---|---|---|---|
| msbf-9265 | msbf |  | 12.45 | asphalt | 205.5, -784 | 509.5/0.0/54.7/256.9/257.7 | 4938.09 | 100 |  | 11.61/3.36/4.93/6.74 |
| msbf-922 | msbf |  | 8.87 | asphalt | -441.55, 92.42 | 431.8/0.0/22.9/97.6/92.7 | 2425.71 | 100 |  | 6.34 |
| msbf-4179 | msbf | 1031 Bellevue Avenue | 8.82 | asphalt | -333.72, 962.74 | 47.7/0.0/6.8/188.3/37.9 | 7421.38 | 37 | 3.73 | 0/0/8.86 |
| msbf-6533 | msbf |  | 8.33 | asphalt | 294.58, -576.64 | 76.1/0.0/6.5/25.4/25.4 | 5016.14 | 100 |  | 0/0/4.53 |
| msbf-3377 | msbf |  | 8.27 | asphalt | -98.84, -651.9 | 272.6/0.0/27.0/96.9/121.7 | 3871.24 | 100 |  | 6.28 |
| msbf-1481 | msbf |  | 7.97 | asphalt | 200.77, -660.73 | 195.9/0.0/27.5/101.5/114.7 | 4964.01 | 100 |  | 7.6 |
| msbf-7731 | msbf | 6336 Alamo Avenue | 7.8 | asphalt | 170.9, 850.8 | 53.2/0.0/5.1/20.1/20.1 | 120.47 | 91 | 0.93 | 5.39 |
| osm-1308664136 | osm |  | 7.74 | asphalt | 581, -442.3 | 4.1/0.0/0.0/0.0/0.0 | 4.13 | 100 |  |  |
| msbf-509 | msbf |  | 7.61 | asphalt | 499.1, -761 | 25.7/0.0/4.3/18.0/16.9 | 3196.39 | 100 |  | 8.05 |
| msbf-3273 | msbf |  | 7.33 | asphalt | 209.9, -755 | 51.1/0.0/9.1/35.8/36.0 | 4620.44 | 100 |  | 4.57/0/0/0 |

## provincetown

ground: `public/baked/provincetown/ground.json` v1 groundKey 2f08b9d7 (2026-10-11T09:43:16.442Z), 52 groups; partition area 87903510 m² vs disc 87914643 m²
buildings: `public/baked/provincetown/buildings.json` v3 (2026-10-11T14:01:35.342Z), 3057 footprints

| source | n | n asphalt | n highway | n curb | n sidewalk | n treelawn | n alley | n path | m² asphalt | m² highway | m² curb | m² sidewalk | m² treelawn | m² alley | m² path |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| msbf | 1878 | 367 | 0 | 384 | 691 | 536 | 0 | 26 | 7272 | 0 | 585 | 10527 | 7248 | 0 | 262 |
| osm | 1179 | 164 | 0 | 181 | 365 | 285 | 0 | 10 | 2099 | 0 | 208 | 4350 | 2681 | 0 | 143 |
| ALL | 3057 | 531 | 0 | 565 | 1056 | 821 | 0 | 36 | 9372 | 0 | 794 | 14876 | 9929 | 0 | 405 |

Intrusion depth past the property-line side (footprints with street-realm overlap > 0.01 m²; depth = max distance of a footprint sample in asphalt/highway/curb/sidewalk/treelawn to the nearest non-street ground):

| source | n intruding | 0–0.5 | 0.5–1 | 1–2 | 2–3 | 3–5 | 5– | deepest: treelawn | sidewalk | curb | road |
|---|---|---|---|---|---|---|---|---|---|---|---|
| msbf | 694 | 41 | 53 | 113 | 101 | 210 | 176 | 3 | 305 | 15 | 371 |
| osm | 372 | 22 | 22 | 73 | 71 | 124 | 60 | 3 | 184 | 18 | 167 |
| ALL | 1066 | 63 | 75 | 186 | 172 | 334 | 236 | 6 | 489 | 33 | 538 |

footprint area total 413189 m²; in street realm 34971 m² (8.46%). Samples outside any ground triangle: 54

Assessor-parcel test (ma_parcels.json; 4869 rings in the building bbox): of the footprint samples lying in the painted street realm, how many fall INSIDE a parcel (band painted over parcel land) vs OUTSIDE every parcel (footprint past the parcel line, or a parcel gap); "beyond" = the deepest such outside sample's distance to the nearest parcel edge.

| source | n intruding | street samples in parcel | outside | footprints w/ any outside | beyond 0–0.5 | 0.5–1 | 1–2 | 2–3 | 3–5 | 5– |
|---|---|---|---|---|---|---|---|---|---|---|
| msbf | 694 | 421971 (93.9%) | 27260 | 163 | 47 | 37 | 60 | 16 | 3 | 0 |
| osm | 372 | 166637 (96.9%) | 5298 | 55 | 25 | 17 | 11 | 1 | 0 | 1 |
| ALL | 1066 | 588608 (94.8%) | 32558 | 218 | 72 | 54 | 71 | 17 | 3 | 1 |

MSBF footprints vs their OSM twins (same building, hand-traced; clean/map.json joinRings), same painted ground. 1806 of 1878 MSBF footprints have ≥1 twin.

| MSBF depth bin | n MSBF intruding w/ twin | twin also intrudes | twin depth median | twin depth ≤ MSBF−1 m | MSBF intruding, no twin |
|---|---|---|---|---|---|
| 0–0.5 | 40 | 26 | 0.78 | 0 | 1 |
| 0.5–1 | 53 | 42 | 1.26 | 0 | 0 |
| 1–2 | 110 | 86 | 1.74 | 25 | 3 |
| 2–3 | 98 | 85 | 2.09 | 30 | 3 |
| 3–5 | 201 | 195 | 3.17 | 101 | 9 |
| 5– | 171 | 168 | 4.76 | 113 | 5 |

street-realm m² over the twinned set: MSBF 25020 vs OSM twins 22240 (footprint m²: MSBF 296370 vs twins 289283)

Worst 10 by depth:

| id | src | address | depth m | class at max | at (x,z) | m² asph/hwy/curb/walk/lawn | fp m² | street samples in parcel % | beyond parcel m | OSM twin depth m |
|---|---|---|---|---|---|---|---|---|---|---|
| msbf-1189 | msbf | 495 Commercial Street | 9.87 | asphalt | 747.9, -607.2 | 135.2/0.0/2.9/23.9/19.0 | 430.46 | 99 | 0.69 | 0/7.6 |
| msbf-564 | msbf | 8 Soper Street | 9.43 | asphalt | -592.77, 909.69 | 43.1/0.0/1.2/34.6/9.9 | 113.87 | 91 | 1.3 | 4.62/8.63 |
| msbf-893 | msbf | 27 Mechanic Street | 9.35 | asphalt | -749.3, 685.6 | 57.9/0.0/2.0/22.2/8.8 | 101.32 | 98 | 1.13 | 7.03 |
| msbf-184 | msbf | 51 Pleasant Street | 9.22 | asphalt | -747.9, 385.48 | 73.2/0.0/2.1/25.7/14.0 | 129.38 | 100 |  | 9.12 |
| msbf-269 | msbf | 111 Commercial Street | 9.17 | asphalt | -423.3, 773.6 | 38.4/0.0/1.7/17.0/13.7 | 86.58 | 95 | 1.2 | 8.1 |
| msbf-1438 | msbf | 131 Commercial Street | 8.84 | asphalt | -427.9, 656.8 | 55.4/0.0/2.2/20.1/16.5 | 112.28 | 96 | 0.66 | 8.39 |
| msbf-674 | msbf |  | 8.82 | asphalt | 13.61, 15.19 | 278.0/0.0/14.7/176.3/165.0 | 1903.41 | 89 | 3.63 | 2.9/2.47/7.18/0.07/2.8/0/7.57/1.95 |
| osm-164024988 | osm |  | 8.81 | asphalt | 48.1, -121.4 | 69.3/0.0/2.1/10.6/13.7 | 95.72 | 94 | 0.23 |  |
| msbf-2205 | msbf | 132 Commercial Street | 8.75 | asphalt | -436.74, 655.12 | 57.7/0.0/1.3/13.0/13.0 | 131.15 | 93 | 0.65 | 1.77/7.76 |
| msbf-1634 | msbf |  | 8.74 | asphalt | -251.9, 277.3 | 151.9/0.0/4.9/48.7/46.2 | 269.14 | 81 | 1.83 | 6.05/5.78 |

## huron

ground: `public/baked/huron/ground.json` v1 groundKey 22b9f11d (2026-10-11T06:43:10.492Z), 50 groups; partition area 39237333 m² vs disc 39346943 m²
buildings: `public/baked/huron/buildings.json` v3 (2026-10-11T14:01:23.254Z), 3700 footprints

| source | n | n asphalt | n highway | n curb | n sidewalk | n treelawn | n alley | n path | m² asphalt | m² highway | m² curb | m² sidewalk | m² treelawn | m² alley | m² path |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| msbf | 3678 | 103 | 0 | 118 | 356 | 212 | 1 | 11 | 2258 | 0 | 435 | 4116 | 2394 | 1 | 170 |
| osm | 22 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ALL | 3700 | 103 | 0 | 118 | 356 | 212 | 1 | 11 | 2258 | 0 | 435 | 4116 | 2394 | 1 | 170 |

Intrusion depth past the property-line side (footprints with street-realm overlap > 0.01 m²; depth = max distance of a footprint sample in asphalt/highway/curb/sidewalk/treelawn to the nearest non-street ground):

| source | n intruding | 0–0.5 | 0.5–1 | 1–2 | 2–3 | 3–5 | 5– | deepest: treelawn | sidewalk | curb | road |
|---|---|---|---|---|---|---|---|---|---|---|---|
| msbf | 369 | 78 | 49 | 63 | 61 | 61 | 57 | 12 | 235 | 19 | 102 |
| osm | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ALL | 369 | 78 | 49 | 63 | 61 | 61 | 57 | 12 | 235 | 19 | 102 |

footprint area total 832230 m²; in street realm 9203 m² (1.11%). Samples outside any ground triangle: 676

Assessor-parcel test (oh_parcels.json; 5031 rings in the building bbox): of the footprint samples lying in the painted street realm, how many fall INSIDE a parcel (band painted over parcel land) vs OUTSIDE every parcel (footprint past the parcel line, or a parcel gap); "beyond" = the deepest such outside sample's distance to the nearest parcel edge.

| source | n intruding | street samples in parcel | outside | footprints w/ any outside | beyond 0–0.5 | 0.5–1 | 1–2 | 2–3 | 3–5 | 5– |
|---|---|---|---|---|---|---|---|---|---|---|
| msbf | 369 | 143106 (92.0%) | 12378 | 80 | 28 | 11 | 23 | 8 | 10 | 0 |
| osm | 0 | 0 (0.0%) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ALL | 369 | 143106 (92.0%) | 12378 | 80 | 28 | 11 | 23 | 8 | 10 | 0 |

MSBF footprints vs their OSM twins (same building, hand-traced; clean/map.json joinRings), same painted ground. 170 of 3678 MSBF footprints have ≥1 twin.

| MSBF depth bin | n MSBF intruding w/ twin | twin also intrudes | twin depth median | twin depth ≤ MSBF−1 m | MSBF intruding, no twin |
|---|---|---|---|---|---|
| 0–0.5 | 5 | 2 | 0.00 | 0 | 73 |
| 0.5–1 | 0 | 0 |  | 0 | 49 |
| 1–2 | 2 | 2 | 1.50 | 1 | 61 |
| 2–3 | 2 | 1 | 1.57 | 1 | 59 |
| 3–5 | 2 | 2 | 4.04 | 0 | 59 |
| 5– | 3 | 3 | 10.27 | 0 | 54 |

street-realm m² over the twinned set: MSBF 1511 vs OSM twins 1587 (footprint m²: MSBF 148852 vs twins 218929)

Worst 10 by depth:

| id | src | address | depth m | class at max | at (x,z) | m² asph/hwy/curb/walk/lawn | fp m² | street samples in parcel % | beyond parcel m | OSM twin depth m |
|---|---|---|---|---|---|---|---|---|---|---|
| msbf-1089 | msbf | 1 UNIVERSITY DR | 12.9 | asphalt | -2707.35, -385.22 | 415.3/0.0/33.3/145.6/136.7 | 3376.77 | 100 |  | 12.54 |
| msbf-476 | msbf |  | 10.21 | asphalt | -2707.04, -214.71 | 202.1/0.0/19.7/63.9/118.6 | 2064.29 | 100 |  | 10.27 |
| msbf-2015 | msbf |  | 10.09 | asphalt | -2020.9, -1970.1 | 43.6/0.0/3.7/6.0/2.2 | 55.48 | 60 | 3.04 |  |
| msbf-4392 | msbf |  | 9.45 | asphalt | -1979.7, -1939.5 | 57.0/0.0/5.9/14.7/11.3 | 95.21 | 84 | 1.21 |  |
| msbf-4192 | msbf | 1 UNIVERSITY DR | 9.23 | asphalt | -2735.9, -389.2 | 142.2/0.0/9.9/39.1/39.1 | 323.14 | 100 |  | 8.87 |
| msbf-3974 | msbf |  | 8.86 | asphalt | 1791.93, 888.33 | 31.9/0.0/3.9/8.6/22.9 | 74.43 | 100 |  |  |
| msbf-2350 | msbf |  | 8.35 | asphalt | 74.99, -598.69 | 36.3/0.0/3.6/22.8/1.6 | 64.99 | 100 |  |  |
| msbf-1991 | msbf | 33 POPLAR ST | 8.17 | asphalt | -1979, -1931.4 | 40.8/0.0/9.8/30.4/26.4 | 244.27 | 88 | 1.27 |  |
| msbf-1850 | msbf |  | 8.16 | asphalt | -2021.7, -1962.1 | 51.0/0.0/7.3/20.4/16.8 | 110.43 | 75 | 1.88 |  |
| msbf-3696 | msbf | 2008 SHORE DR | 7.9 | asphalt | -2198.2, -1972.2 | 58.9/0.0/6.9/27.4/23.7 | 165.24 | 49 | 4.18 |  |

## jacksonheights

ground: `public/baked/jacksonheights/ground.json` v1 groundKey ba532180 (2026-10-07T06:26:21.758Z), 49 groups; partition area 8916970 m² vs disc 8940875 m²
buildings: `public/baked/jacksonheights/buildings.json` v3 (2026-10-07T06:26:51.489Z), 9852 footprints

| source | n | n asphalt | n highway | n curb | n sidewalk | n treelawn | n alley | n path | m² asphalt | m² highway | m² curb | m² sidewalk | m² treelawn | m² alley | m² path |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bin | 9800 | 7 | 0 | 7 | 58 | 18 | 117 | 8 | 357 | 0 | 17 | 572 | 215 | 795 | 211 |
| osm | 52 | 1 | 0 | 1 | 1 | 1 | 1 | 1 | 184 | 0 | 4 | 97 | 36 | 0 | 28 |
| ALL | 9852 | 8 | 0 | 8 | 59 | 19 | 118 | 9 | 541 | 0 | 22 | 669 | 251 | 795 | 239 |

Intrusion depth past the property-line side (footprints with street-realm overlap > 0.01 m²; depth = max distance of a footprint sample in asphalt/highway/curb/sidewalk/treelawn to the nearest non-street ground):

| source | n intruding | 0–0.5 | 0.5–1 | 1–2 | 2–3 | 3–5 | 5– | deepest: treelawn | sidewalk | curb | road |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bin | 63 | 24 | 20 | 10 | 2 | 4 | 3 | 5 | 51 | 0 | 7 |
| osm | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 1 |
| ALL | 64 | 24 | 20 | 10 | 2 | 4 | 4 | 5 | 51 | 0 | 8 |

footprint area total 1276863 m²; in street realm 1483 m² (0.12%). Samples outside any ground triangle: 100

Assessor-parcel test (nyc_parcels.json; 10743 rings in the building bbox): of the footprint samples lying in the painted street realm, how many fall INSIDE a parcel (band painted over parcel land) vs OUTSIDE every parcel (footprint past the parcel line, or a parcel gap); "beyond" = the deepest such outside sample's distance to the nearest parcel edge.

| source | n intruding | street samples in parcel | outside | footprints w/ any outside | beyond 0–0.5 | 0.5–1 | 1–2 | 2–3 | 3–5 | 5– |
|---|---|---|---|---|---|---|---|---|---|---|
| bin | 63 | 20998 (93.2%) | 1542 | 13 | 10 | 0 | 3 | 0 | 0 | 0 |
| osm | 1 | 7 (0.1%) | 5620 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| ALL | 64 | 21005 (74.6%) | 7162 | 14 | 10 | 0 | 3 | 0 | 0 | 1 |

Worst 10 by depth:

| id | src | address | depth m | class at max | at (x,z) | m² asph/hwy/curb/walk/lawn | fp m² | street samples in parcel % | beyond parcel m | OSM twin depth m |
|---|---|---|---|---|---|---|---|---|---|---|
| osm-515886191 | osm |  | 9.27 | asphalt | -475.23, 978.08 | 184.5/0.0/4.5/97.3/36.2 | 534.72 | 0 | 15.09 |  |
| bin-4029791 | bin |  | 8.55 | asphalt | -529.92, 935.08 | 91.2/0.0/3.7/36.5/36.5 | 968.39 | 94 | 1.94 |  |
| bin-4447505 | bin |  | 6.56 | asphalt | -526.1, 932.5 | 47.6/0.0/2.1/21.0/21.0 | 169.05 | 100 |  |  |
| bin-4029808 | bin |  | 6.45 | asphalt | -495.13, 927.83 | 64.8/0.0/3.0/29.0/29.0 | 232.33 | 100 |  |  |
| bin-4029790 | bin |  | 4.96 | asphalt | -524.08, 949.13 | 44.6/0.0/1.7/15.5/12.6 | 95.63 | 94 | 0.27 |  |
| bin-4029809 | bin |  | 4.95 | asphalt | -490.78, 944.38 | 96.1/0.0/4.4/43.0/29.9 | 173.32 | 100 |  |  |
| bin-4553075 | bin |  | 4.58 | asphalt | -563.9, 968 | 12.5/0.0/1.4/13.5/13.5 | 188.81 | 100 |  |  |
| bin-4529527 | bin | 72-32 BROADWAY | 3.26 | asphalt | -565.5, 966 | 0.2/0.0/0.9/10.5/12.1 | 211.18 | 100 |  |  |
| bin-4028768 | bin |  | 2.19 | treelawn | -281.3, 100.1 | 0.0/0.0/0.0/52.3/11.8 | 1798.98 | 100 |  |  |
| bin-4470625 | bin | 31-49 93 ST | 2.18 | treelawn | 898.9, -361.3 | 0.0/0.0/0.0/7.0/1.0 | 29.22 | 99 | 0.12 |  |

## Provincetown — Commercial Street

### Commercial Street ways (raw/osm.json ground.highway)

| osmId | highway | oneway | lanes | width | surface | maxspeed | sidewalk*/kerb*/footway* | other | nodes |
|---|---|---|---|---|---|---|---|---|---|
| 9497432 | secondary |  | 2 | 7 | asphalt | 30 mph | (none) | cycleway=no ref=MA 6A | 70 |
| 9497504 | living_street | yes | 1 | 9.1 | asphalt | 25 mph | (none) | bicycle=yes cycleway=shared_lane foot=yes | 23 |
| 48968039 | living_street | yes | 1 | 9.1 | asphalt | 15 mph | (none) | access=yes bicycle=yes cycleway=no foot=yes | 2 |
| 235710753 | living_street | yes | 1 | 6 | asphalt | 20 mph | (none) | bicycle=yes cycleway=no foot=yes | 49 |
| 235712539 | living_street | yes | 1 | 6 | asphalt | 15 mph | (none) | bicycle=yes cycleway=shared_lane foot=yes | 15 |
| 295175180 | living_street | yes | 1 | 6 | asphalt | 15 mph | (none) | access=yes bicycle=yes cycleway=shared_lane cycleway:smoothness=intermediate cycleway:surface=asphalt foot=yes | 117 |
| 633904942 | living_street | yes | 1 | 9.1 | asphalt | 15 mph | (none) | access=yes bicycle=yes cycleway:both=no foot=yes | 2 |

footway=sidewalk ways with any node within 20 m of a Commercial Street centreline: 61 — 275948871 (149 m), 416807989 (92 m), 592762661 (176 m), 654841697 (128 m), 1234936268 (97 m), 1485893995 (113 m), 1485893996 (41 m), 1485893998 (40 m), 1485894001 (31 m), 1485894002 (39 m), 1485894004 (123 m), 1485894006 (22 m), 1485894008 (49 m), 1485894011 (27 m), 1485894012 (8 m), 1485894014 (61 m), 1485894016 (59 m), 1485894018 (25 m), 1485894020 (17 m), 1485894022 (78 m), 1485894024 (55 m), 1485894026 (56 m), 1486114914 (227 m), 1486114915 (42 m), 1486114917 (123 m), 1486114921 (161 m), 1486114923 (99 m), 1486114926 (129 m), 1486114932 (89 m), 1489305067 (28 m), 1489305068 (24 m), 1489305070 (106 m), 1489310645 (168 m), 1489310646 (49 m), 1489310649 (79 m), 1489310650 (66 m), 1489310652 (11 m), 1489310654 (60 m), 1489310656 (10 m), 1489310658 (30 m), 1489310660 (65 m), 1489310662 (22 m), 1489310664 (29 m), 1489310666 (30 m), 1489310668 (82 m), 1489310670 (95 m), 1489310672 (28 m), 1489310674 (51 m), 1489310676 (53 m), 1489310678 (88 m), 1489310680 (38 m), 1489310683 (12 m), 1489310685 (27 m), 1489547666 (55 m), 1489547668 (20 m), 1489547670 (80 m), 1489547672 (110 m), 1489547676 (192 m), 1489547678 (25 m), 1489547680 (256 m), 1489547682 (187 m)
footway=crossing ways within 20 m: 58
kerb nodes (raw/osm_kerbs.json) within 20 m: 18 — 4930656328 kerb=lowered, 5648313074 kerb=lowered, 5648313079 kerb=flush, 5648313082 kerb=flush, 5648313083 kerb=flush, 5648313084 kerb=flush, 5648313085 kerb=flush, 13621921551 kerb=no, 13621921553 kerb=raised, 13623535865 kerb=lowered, 13623535866 kerb=lowered, 13651183056 kerb=lowered, 13651183073 kerb=lowered, 13651183075 kerb=lowered, 13651183077 kerb=lowered, 13651183078 kerb=lowered, 13651183080 kerb=lowered, 13651183081 kerb=lowered
Commercial Street centreline length: 5483 m

### Footprints whose baked neon.frontage names COMMERCIAL STREET: 626 (msbf 393, osm 233)

median centreline→nearest footprint point: 10.07 m · median centreline→first curb: 4 m · median painted treelawn 1.5 m · sidewalk 1.5 m · median centreline→end of painted street realm (property-line side) along the same ray: 7.15 m
median centreline→first assessor parcel along the same ray: 3.9 m (rays reaching a parcel within 20 m: 623) · painted property line beyond the parcel line: 555 rays (>0.5 m); face nearer than the parcel line: 32
face nearer the centreline than the painted property line: 182 of 626

Per way (fronting footprints): tagged width vs painted 2×(centreline→curb), and band depths (medians):

| way | highway | tagged width | n | 2×curbAt | tl | sw | property line at | parcel line at | face at | faces inside band |
|---|---|---|---|---|---|---|---|---|---|---|
| 9497432 | secondary | 7 | 10 | 8.10 | 1.5 | 1.5 | 7.15 | 11.65 | 18.01 | 0 |
| 9497504 | living_street | 9.1 | 118 | 8.00 | 1.5 | 1.5 | 7.15 | 5.2 | 10.05 | 26 |
| 48968039 | living_street | 9.1 | 2 | 31.40 | 3.3 | 0 | null | 3.75 | 25.49 | 0 |
| 235710753 | living_street | 6 | 173 | 8.00 | 1.5 | 1.5 | 7.15 | 3.9 | 9.72 | 48 |
| 235712539 | living_street | 6 | 41 | 8.00 | 1.5 | 1.5 | 7.15 | 3.4 | 9.09 | 15 |
| 295175180 | living_street | 6 | 280 | 8.00 | 1.5 | 1.5 | 7.15 | 3.4 | 9.8 | 92 |
| 633904942 | living_street | 9.1 | 2 | 8.00 | 1.5 | 1.5 | 7.15 | 4.5 | 37.8 | 1 |

(property-line distance − face distance) histogram, m — positive = face sits inside the painted band:

| -Infinity..0 | 0..1 | 1..2 | 2..3 | 3..5 | 5..Infinity |
|---|---|---|---|---|---|
| 391 | 22 | 37 | 35 | 63 | 25 |

Painted classes along the ray (class@distance from OSM centreline, m), 25 nearest faces:

| id | address | way | centre→face | parcel at | runs |
|---|---|---|---|---|---|
| msbf-957 | 75 Commercial Street | 295175180 | 0 | 2.6 | asphalt@0.1 curb@6.5 sidewalk@6.9 |
| msbf-2471 | 213 Commercial Street | 295175180 | 0 | 4.05 | asphalt@0.1 curb@3.15 treelawn@3.3 sidewalk@4.8 lot:commercial@6.3 |
| msbf-674 |  | 295175180 | 0.23 | 4.3 | asphalt@0.1 curb@3.7 treelawn@3.85 sidewalk@5.35 lot:commercial@6.85 |
| msbf-273 | 21 Commercial Street | 295175180 | 0.41 | 1.75 | asphalt@0.1 curb@4 treelawn@4.15 sidewalk@5.65 lot:residential@7.15 |
| msbf-1438 | 131 Commercial Street | 295175180 | 0.9 | 1.6 | asphalt@0.1 curb@4 treelawn@4.15 sidewalk@4.25 treelawn@5.75 lot:residential@7.15 |
| msbf-932 |  | 295175180 | 1.02 | 1.85 | asphalt@0.1 curb@4 treelawn@4.15 sidewalk@5.65 lot:residential@7.15 |
| msbf-1995 | 71 Commercial Street | 295175180 | 1.13 | 2.45 | asphalt@0.1 curb@4 treelawn@4.15 sidewalk@5.65 lot:residential@7.15 |
| msbf-1108 | 155 Commercial Street | 295175180 | 1.17 | 2.4 | asphalt@0.1 curb@4 treelawn@4.15 sidewalk@5.65 lot:underived@7.15 |
| msbf-1173 | 501 Commercial Street | 235710753 | 1.18 | 3.75 | asphalt@0.1 curb@4.35 treelawn@4.5 sidewalk@6 lot:residential@7.5 |
| msbf-2239 | 359 Commercial Street | 235710753 | 1.25 | 3.15 | asphalt@0.1 curb@4 treelawn@4.15 sidewalk@5.65 lot:commercial@7.15 |
| msbf-1279 | 557 Commercial Street | 9497504 | 1.34 | 1.5 | asphalt@0.1 curb@4 treelawn@4.15 sidewalk@5.65 lot:residential@7.15 |
| msbf-1265 | 449 Commercial Street | 235710753 | 1.38 | 2.2 | asphalt@0.1 curb@4 treelawn@4.15 sidewalk@5.65 lot:commercial@7.15 |
| msbf-706 | 119 Commercial Street | 295175180 | 1.51 | 4 | asphalt@0.1 curb@4.25 treelawn@4.4 sidewalk@5.9 lot:residential@7.4 lot:institutional@18.2 |
| msbf-1891 | 485 Commercial Street | 235710753 | 1.66 | 2 | asphalt@0.1 curb@4 treelawn@4.15 sidewalk@5.65 lot:residential@7.15 |
| msbf-2165 |  | 235710753 | 1.69 | 2.45 | asphalt@0.1 curb@4 treelawn@4.15 sidewalk@5.65 lot:commercial@7.15 |

## What the numbers suggest: measured vs. not

**Measured**
1. **Intruding footprints stay inside their parcels.** In every town, 88–95% of the footprint area that lies in the painted street realm also lies inside an assessor parcel (JH `bin` 93%; the JH 74.6% overall comes from one OSM footprint). Footprints reaching more than 1 m past the parcel line: LS 7 · HPDM 14 · PTown 92 · Huron 41 · JH 4. So in most intrusions the painted band or road extends onto parcel land; the footprint does not leave its parcel.
2. **How much painted street lies on parcel land differs by town, and the intrusion rate follows it.** Painted sidewalk inside parcels: JH 5% → LS 22% → HPDM 41% → Huron 49% → PTown 76%. Share of footprints that intrude: JH 0.6% → HPDM 5.4% → Huron 10.0% → LS 11.5% → PTown 34.9%.
3. **A second, independent footprint source intrudes too (PTown).** For intruding MSBF footprints with an OSM twin, the twin also intrudes in 195 of 201 (3–5 m bin) and 168 of 171 (>5 m bin), with median twin depth 3.17 m and 4.76 m. MSBF still reaches at least 1 m deeper than its twin in 101 of 201 and 113 of 171 of those. Street-realm area over the twinned set: MSBF 25,020 m² vs OSM 22,240 m².
4. **Commercial Street.** Tags: 6 of 7 ways are `living_street`, all are one-way with `lanes=1`, `width` is 6 or 9.1, and no way carries a `sidewalk*` or `kerb*` tag. Within 20 m of it there are 61 `footway=sidewalk` ways and 18 kerb nodes (11 lowered, 5 flush, 1 raised, 1 no). The painted section is the same on every way: carriageway 8.0 m (curb 4.0 m from the OSM centreline) whether the tag says 6 or 9.1; curb 0.15 m; treelawn 1.5 m; sidewalk 1.5 m; property-line side at 7.15 m. The assessor parcel line sits at a median 3.4–3.9 m on the `width=6` ways, and the painted property line lies more than 0.5 m past it on 555 of 623 rays. 182 of 626 fronting faces are nearer the centreline than the painted property line; 32 are more than 0.5 m nearer than the parcel line.
5. **Depth class alone does not separate A from B.** Many of the deepest road-reaching cases are 100% inside a parcel, and their OSM twin is just as deep (e.g. HPDM msbf-9265: 509 m² on asphalt, twin 11.6 m; Huron 1 UNIVERSITY DR: 12.9 m, twin 12.5 m).

**Not measured: cause not established**
- Why the painted carriageway is 8.0 m where OSM says `width=6`: cause not established. I did not read the band-depth or road-width code.
- Why the painted band lands on parcel land: cause not established.
- Roof-lean (parallax) offset of MSBF footprints: not measured. The MSBF-deeper-than-twin difference could come from that or from tracing differences. Cause not established.
- Whether a parcel layer includes right-of-way parcels: not established (PTown and JH alleys are about 99% inside parcels). That would inflate the in-parcel shares.
- What the asphalt is under the large deep cases (service drive, internal road; which OSM way produced it): not measured.
- The LS worst cases (Park Av / Mississippi Alley, 5.5–7.5 m into asphalt, 100% in-parcel) are in an authored town. I did not check whether the authoring at those blocks is intended.
