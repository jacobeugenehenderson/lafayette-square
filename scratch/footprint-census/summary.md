
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
