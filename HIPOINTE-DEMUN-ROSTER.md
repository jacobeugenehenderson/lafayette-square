# Hi-Pointe – DeMun — Neighborhood Roster (comprehensive intake)

**The "see what's there" inventory for the second pour.** Every building that renders in the map, grounded in authoritative data and classified into the Lafayette Square content taxonomy (the Society Pages system). This is the customer-review menu — *what exists*, by category — before any per-place enrichment (hours, photos, menus). It's HiPointe-DeMun's analog of `BUSINESS_LISTINGS.md`, but building-first and machine-seeded.

> **Status: v0.4 (2026-07-05) — conformed to `NEIGHBORHOOD-INPUTS §5.1.1`, + building-use (§2.1) + historic-district flag (§5.1) + the first fully-elaborated place cards.** Three layers joined by the slab building id (`msbf-*`, verified 2089/2089): **Layer 0 = `content/profile.json`** (installation profile) · **Layer 1 = `content/roster.json`** (building ledger, all 2,089 visible buildings, with `use` + `in_historic_district`) · **Layer 2 = `content/listings.json`** (225 business listings, 0..N per building — 33 mixed-use). Plus `content/menus.json` (menus keyed by listing id), `content/nr-inventory.json`, `content/county-land-use-codes.csv`. Seeded by spatial-joining **OSM POIs + STL City & County assessor parcels + the NR nomination** onto the baked building set. Names/addresses/use are a *best guess, fully overridable* via place cards (`§0.0`). Content **home** rides the blank-app decoupling arc (that agent reads this exact shape).
>
> ⚠️ **STALE STATS BELOW — regenerate.** The counts in this doc (2,089 buildings; parcel-match rates like "1,893/2,089"; "no-parcel" tallies) predate **(a)** the Extent re-pour that cut the baked set to **1,281**, and **(b)** the **2026-07-08 parcel-frame fix**. Before that fix the assessor parcels were stranded ~800 m off the buildings, so **every address in the joined roster was wrong** (buildings labeled with a far parcel's address — e.g. Barrio's building read "1140 Blendon Pl"). Parcels now reproject in-frame (`cartograph/INTAKE.md`; `[[feedback_all_frame_dependent_raw_must_reproject]]`) and `bake-content` was re-run (frame-alignment now 88%, 0 orphans, addresses correct). Treat the numeric tables here as pre-fix historical until regenerated from the current bake.
>
> **⭐ Self-contained installation (§5.1.2).** The entire HPDM payload lives under `cartograph/data/hipointe-demun/content/` — roster · listings · menus · profile · **photos (`content/photos/<slug>/`)** — and references *nothing* outside itself. Listing photo paths are **instance-relative** (`photos/<slug>/NN.jpg`); the reader roots them per-look. HPDM has no knowledge of LS or any other installation — no shared asset root, no slug disambiguation. **Four cards fully elaborated** (Barrio · Louie · Sasha's · Clementine's) with menus, history, hosted photos.

---

## 1. What this covers — and why it's all in

Per LS doctrine, **every building is a place card** — three kinds (business / resident / auto-synthesized-bare) and *"nothing in the neighborhood is a dead pixel"* (`ls/PLACE-CARDS.md`). So this roster is **all 2,089 visible buildings**, not just businesses: the ~165 named features become directory listings; the rest are architectural auto-cards (year, stories, sqft, zoning, historic status — all grounded from the assessor).

**The extent is the real historic district, not over-reach.** The committed membership (Big Bend · Forest Park Pkwy · Skinker · Clayton Rd, r≈1,251 m) closely traces the **Hi-Pointe–DeMun Historic District** boundary. It spans three municipalities:

| Municipality | Buildings | Character |
|---|---:|---|
| **St. Louis (City)** | 700 | Hi-Pointe proper — the McCausland/Cutter/Central commercial node + residences |
| **Clayton** | 580 | DeMun apartment district + Concordia Seminary + Wash U south campus |
| **Richmond Heights** | 615 | South of Clayton Rd — Dale/Wise/Delta (incl. SSM St. Mary's, the Schnucks node) |
| (unmatched to a parcel) | 194 | edge/degenerate footprints — no assessor record |

**⭐ The campus is a delivery goldmine, not filler.** The Wash U **South 40** dorm complex + fraternity houses + the academic halls (333 university/institutional buildings) are a dense, high-frequency **Cary delivery market** (students ordering to dorms). They're kept and first-class.

---

## 2. Category summary (the Society Pages directory, all buildings)

| Category | Buildings | Named listings |
|---|---:|---:|
| residential | 1,274 | 14 |
| community | 372 | 114 |
| unclassified | 183 | 0 |
| services | 162 | 18 |
| vacant | 55 | 0 |
| parks | 29 | 5 |
| dining | 5 | 5 |
| arts | 4 | 4 |
| shopping | 4 | 4 |
| hospitality | 1 | 1 |
| **Total** | **2,089** | **165** |

> `unclassified` = parcel matched but land-use code didn't map, or no parcel. `community/institutional` and `community/university` are the campus + seminary + churches/schools. Residential (1,274) is the bulk — the auto-card substrate.

### 2.1 Building use — the structural classification (every building)

A confident per-building **use** (the field `use` / `use_subtype` in the ledger), from the assessor land-use codes, refined by OSM tags for named institutions and by spatial context for the coarse-coded exempt buildings. This is the "know a multi-unit residential from a commercial space" pass — and it gets churches / campus / medical for free.

| Use | Buildings |
|---|---:|
| Single-family residential | 1212 |
| Multi-unit residential | 350 |
| Commercial | 175 |
| Institutional — medical | 86 |
| Institutional — campus (Wash U / Concordia) | 82 |
| Vacant | 60 |
| Park | 33 |
| Institutional — church | 27 |
| Institutional — school | 25 |
| Institutional — cultural | 22 |
| Unknown (no data) | 8 |
| Parking structure | 6 |
| Industrial | 2 |
| Institutional — civic | 1 |
| **Total** | **2089** |

- **The distinction that matters:** single-family (1212) vs **multi-unit residential** (350) vs **commercial** (175) — cleanly separated by the assessor codes.
- **104 mixed-use mini-networks** — residential buildings that also host businesses (e.g. the 923 De Mun apartment block with four ground-floor salons). These carry both a residential `use` and their Layer-2 business listings.
- **Confidence:** 1744 high (land-use code or OSM tag) · 10 medium · 335 low (spatial-inferred / no-parcel). Every value is overridable (`§0.0`).
- **Fixed at source:** named landmarks whose footprint mis-joined a neighbor's single-family parcel (Cheshire Inn, the Theatre, Schnucks, the Concordia/Wash U halls) are classified from their **OSM signal**, not the wrong parcel — so they read commercial / cultural / campus correctly.

---

## 3. Neighborhood overview (the narrative for the pitch)

**Hi-Pointe–DeMun** is a 1920s streetcar-era district straddling the St. Louis city limit and Clayton, at the southwest corner of Forest Park. It is a **National Register Historic District** (below) with unusually high integrity — median building year **1926**, brick-and-limestone, terra-cotta and slate roofs, leaded glass.

- **DeMun** sits on land once owned by French fur trader **Jules DeMun** and his wife **Isabelle Gratiot DeMun** (great-granddaughter of St. Louis founder Pierre Laclède). The residential plan was laid out by landscape architect **Henry Wright** (co-planner of Radburn, NJ) and completed ~1923 — a "new town" design of inward-facing streets, curved traffic-calming pathways, and central greens. Its three-story brick apartments around **DeMun Park** define the district. **DeMun Avenue** is the walkable commercial spine (restaurants, bars, coffee shops).
- **Hi-Pointe** (the City side) centers on the **Hi-Pointe Theatre** (1922, built by the Warner Bros. Circuit) — the **oldest continually operating single-screen movie theater in St. Louis**, now owned by the nonprofit Cinema St. Louis — plus the **Cheshire Inn** (a Tudor landmark, 1887 parcel), **Stevenson's Hi-Pointe** historic service station, and the McCausland/Cutter/Central retail node.
- **Concordia Seminary** — founded 1839, on its 72-acre Clayton campus since 1926; **Collegiate Gothic**, largest Protestant seminary in the U.S. at its dedication. **Luther Tower** (156 ft, architect Charles Klauder, 1966). **Concordia Historical Institute** is on-grounds.
- **Washington University South Campus + South 40** — the residential heart of Wash U undergraduate life, on the district's east edge.

---

## 4. The named directory (165 listings)

Every named feature OSM surfaced inside the visible set, classified into `category/subcategory`, with assessor address/year and the National-Register (`NR`) flag. **These are the candidate place-card listings.**

#### arts/cinema (3)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| AMC Esquire 7 | 6706 Clayton Road | RICHMOND HEIGHTS | 1929 |  | ✓ |
| Hi-Pointe Backlot | 1002 Hi Pointe Place | St. Louis | 1950 |  | ✓ |
| Hi-Pointe Theatre | 1005 McCausland Avenue | St. Louis | 1950 |  | ✓ |

#### arts/museum (1)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Mildred Lane Kemper Art Museum | 1 Brookings Drive | — | — |  |  |

#### community/churches (12)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Bethel Lutheran Church | 6800 WYDOWN BLVD | CLAYTON | 1927 |  |  |
| Central Seventh Day Adventist | 5 North Skinker Boulevard | — | — |  |  |
| Chapel of Saint Timothy and Saint Titus | 1131 BELLEVUE AVE | RICHMOND HEIGHTS | 1925 |  |  |
| Eighth Church of Christ, Scientist | 6221 Alexander Drive | — | — |  |  |
| Graham Chapel | 60 ABERDEEN PL | CLAYTON | 1929 |  |  |
| Memorial Presbyterian Church | 201 South Skinker Boulevard | — | — |  |  |
| Our Lady of Lourdes Parish | 7148 Forsyth Boulevard | CLAYTON | 1928 |  |  |
| St. Mark's Evangelical Lutheran Church | 6337 Clayton Road | St. Louis | 1911 |  |  |
| The Church of St. Michael and St. George | 6345 Wydown Boulevard | CLAYTON | 1925 |  |  |
| Vedanta Society of St. Louis | 205 South Skinker Boulevard | — | — |  |  |
| Washington University Catholic Student Center | 6304 NORTHWOOD AVE 1 | CLAYTON | 1925 |  |  |
| Wydown United Church | 6501 Wydown Boulevard | CLAYTON | 1919 | NR-C |  |

#### community/events-venue (1)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Whittemore House | — | — | — |  |  |

#### community/library (4)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Gaylord Music Library | 6500 Forsyth Boulevard | — | — |  |  |
| Kristine Kay Hasse Memorial Library | 7246 WISE AVE | RICHMOND HEIGHTS | 1925 |  |  |
| Missouri Historical Society Library and Research Center | 225 South Skinker Boulevard | — | — |  |  |
| Olin Library | 47 ABERDEEN PL | CLAYTON | 1920 |  |  |

#### community/organizations (2)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Chabad at Washington University in St. Louis | 7018 Forsyth Boulevard | — | — |  |  |
| Hillel at Washington University in St. Louis | 6300 Forsyth Boulevard | St. Louis | 1929 | NR |  |

#### community/other (13)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Academy Building | 310,199 Melville Avenue | CLAYTON | 1947 |  |  |
| Ann W. Olin Women's Building | 9 WYDOWN TER | CLAYTON | 1924 |  |  |
| Campus Lutheran Ministry | 6800 WYDOWN BLVD | CLAYTON | 1927 |  |  |
| Greener Cleaners | 6340 Clayton Road | St. Louis | 1955 |  |  |
| Lucy and Stanley Lopata House | — | — | — |  |  |
| Millbrook Apartment 1 | — | — | — |  |  |
| Norman K. Probstein Municipal Golf Course Club House | — | — | — |  |  |
| Physical Plant | 6600 CLAYTON RD | RICHMOND HEIGHTS | 1995 |  |  |
| Rockwell House | 6800 WYDOWN BLVD | CLAYTON | 1927 |  |  |
| The St Louis Artists' Guild | 1 Oak Knoll Park | RICHMOND HEIGHTS | 1961 |  |  |
| Tool Shed | 625 S SKINKER BLVD | St. Louis | 1929 | NR |  |
| Vedanta Society Annex | South Skinker Boulevard | — | — |  |  |
| Village East | — | — | — |  |  |

#### community/schools (15)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Clayton Child Center | 1 Oak Knoll Park | RICHMOND HEIGHTS | 1905 |  |  |
| Dunbar House | — | — | — |  |  |
| Filmore House | — | — | — |  |  |
| Forsyth School | — | — | — |  |  |
| Gerdine House | 625 S SKINKER BLVD | St. Louis | 1929 | NR |  |
| Last House | 665 S SKINKER BLVD | St. Louis | 1962 | NR |  |
| New House | — | — | — |  |  |
| Next House | 665 S SKINKER BLVD | St. Louis | 1962 | NR |  |
| Our Lady of Lourdes School | 7157 Northmoor Drive | CLAYTON | 1916 |  |  |
| Ralph M. Captain Elementary School | 6345 Northwood Avenue | St. Louis | 1916 |  |  |
| Rand Center | — | — | — |  |  |
| Science Building | — | — | — |  |  |
| The St. Michael School of Clayton | 6345 Wydown Boulevard | CLAYTON | 1925 |  |  |
| The Wilson School | 6312 ALAMO AVE | CLAYTON | 1923 | NR-C |  |
| Wydown Middle School | 6500 Wydown Boulevard | CLAYTON | 1946 | NR-C |  |

#### community/university (108)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Alpha Delta Phi | 6500 WYDOWN BLVD | CLAYTON | — |  |  |
| Anheuser-Busch Hall | 6701 CLAYTON RD | CLAYTON | 2016 |  |  |
| Bauer Hall | 6500 WYDOWN BLVD | CLAYTON | — |  |  |
| Bayer Laboratory | 45 ARUNDEL PL | CLAYTON | 2015 |  |  |
| Beaumont House | — | — | — |  |  |
| Beaumont Pavillion | 27 ABERDEEN PL | CLAYTON | 1924 |  |  |
| Bixby Hall | 2 ARUNDEL PL | St. Louis | 1921 |  |  |
| Blewett Hall | — | — | — |  |  |
| Brauer Hall | — | — | — |  |  |
| Brohm Hall - Dorm C | 1125 YALE AVE | RICHMOND HEIGHTS | 1954 |  |  |
| Brookings Hall | 28 ABERDEEN PL | CLAYTON | 1916 |  |  |
| Brown Hall | 28 ARUNDEL PL | CLAYTON | 1922 |  |  |
| Bryan Hall | 5 WYDOWN TER | CLAYTON | 1922 |  |  |
| Buenger Hall - Dorm D | 1125 YALE AVE | RICHMOND HEIGHTS | 1954 |  |  |
| Busch Hall | 28 ABERDEEN PL | CLAYTON | 1916 |  |  |
| Busch Laboratory | 49 ARUNDEL PL | CLAYTON | 1917 |  |  |
| Charles F. Knight Center | 6500 WYDOWN BLVD | CLAYTON | — |  |  |
| Compton Laboratory | 6358 ALEXANDER DR | CLAYTON | 1930 |  |  |
| Concordia Historical Institute | 1209 BELLEVUE AVE | RICHMOND HEIGHTS | 1924 |  |  |
| Concordia Seminary | 1131 BELLEVUE AVE | RICHMOND HEIGHTS | 1925 |  |  |
| Crow Hall | 6364 ALEXANDER DR | CLAYTON | 1928 |  |  |
| Cupples I Hall | 28 ABERDEEN PL | CLAYTON | 1916 |  |  |
| Cupples II Hall | 400 DE MUN AVE | CLAYTON | — |  |  |
| Danforth House | — | — | — |  |  |
| Danforth University Center | 75 ARUNDEL PL | CLAYTON | 1922 |  |  |
| Dardick House | — | — | — |  |  |
| Dauten House | — | — | — |  |  |
| Duncker Hall | 36 ABERDEEN PL | CLAYTON | 1922 |  |  |
| Dunham Student Activity Center | 6600 CLAYTON RD | RICHMOND HEIGHTS | 1995 |  |  |
| Eads Hall | 36 ABERDEEN PL | CLAYTON | 1922 |  |  |
| Earl E. and Myrtle E. Walker Hall | — | — | — |  |  |
| East Building | 6621 CLAYTON RD | CLAYTON | 1920 |  |  |
| Environmental Health and  Safety Facility | 1 WYDOWN TER | CLAYTON | 1923 |  |  |
| Environmental Services Building | 1209 BELLEVUE AVE | RICHMOND HEIGHTS | 1924 |  |  |
| Givens Hall | 2 ARUNDEL PL | St. Louis | 1921 |  |  |
| Goldfarb Hall | 28 ARUNDEL PL | CLAYTON | 1922 |  |  |
| Goldfarb Plant Growth Facility | 53 ARUNDEL PL | CLAYTON | 1923 |  |  |
| Green Hall | — | — | — |  |  |
| Gregg House | — | — | — |  |  |
| Hamsini House | 6500 WYDOWN BLVD | CLAYTON | — |  |  |
| Hamsini House | 33 DARTFORD AVE | CLAYTON | 1910 |  |  |
| Hillman Hall | 16 ARUNDEL PL | St. Louis | 1913 |  |  |
| Hitzeman House | 6515 SAN BONITA AVE 1W | CLAYTON | 1927 |  |  |
| Hitzeman House | 6500 WYDOWN BLVD | CLAYTON | — |  |  |
| Holmes Lounge | 36 ABERDEEN PL | CLAYTON | 1922 |  |  |
| Hurd House | 6501 CLAYTON RD | CLAYTON | 1946 |  |  |
| Jack C. Taylor Library | 6800 Wydown Boulevard | CLAYTON | 1979 |  |  |
| January Hall | 36 ABERDEEN PL | CLAYTON | 1922 |  |  |
| Jolley Hall | 5 WYDOWN TER | CLAYTON | 1922 |  |  |
| Jubel Hall | — | — | — |  |  |
| Kappa Sigma | 6600 WYDOWN BLVD | CLAYTON | — |  |  |
| Knight Hall | 6500 WYDOWN BLVD | CLAYTON | — |  |  |
| Koenig House | 801 SEMINARY PL | CLAYTON | 1945 |  |  |
| Lee House | — | — | — |  |  |
| Lien House | 801 SEMINARY PL | CLAYTON | 1945 |  |  |
| Life Sciences Building | 53 ARUNDEL PL | CLAYTON | 1923 |  |  |
| Liggett House | 801 SEMINARY PL | CLAYTON | 1945 |  |  |
| Loeber Hall | 1201 BELLEVUE AVE | RICHMOND HEIGHTS | 2005 |  |  |
| Log Cabin | 7222 WISE AVE | RICHMOND HEIGHTS | 1925 |  |  |
| Lopata Hall | 400 DE MUN AVE | CLAYTON | — |  |  |
| Louderman Hall | 5 WYDOWN TER | CLAYTON | 1922 |  |  |
| Mallinckrodt Student Center | 65 ARUNDEL PL | CLAYTON | 1920 |  |  |
| McDonnell Hall | 39 ARUNDEL PL | CLAYTON | 1927 |  |  |
| McKelvey Hall | — | — | — |  |  |
| McMillan Hall | 26 WYDOWN TER | CLAYTON | 1926 |  |  |
| McMillen Laboratory | 5 WYDOWN TER | CLAYTON | 1922 |  |  |
| Medaille Hall | 6600 CLAYTON RD | RICHMOND HEIGHTS | 1995 |  |  |
| Millbrook Building | 6475 WYDOWN BLVD | CLAYTON | 1922 |  |  |
| Mudd House | 6602 SAN BONITA AVE | CLAYTON | 1927 |  |  |
| Music Classroom Building | — | — | — |  |  |
| Myers House | 6531 SAN BONITA AVE | CLAYTON | 1927 |  |  |
| Nemerov House | — | — | — |  |  |
| O. Fuerbringer Hall - Dorm B | 1125 YALE AVE | RICHMOND HEIGHTS | 1954 |  |  |
| Park House | 6624 SAN BONITA AVE | CLAYTON | 1925 |  |  |
| Power House (maintenance building) | 1204 SUNSET AVE | RICHMOND HEIGHTS | 1926 |  |  |
| Radiochemistry Building | 2 WYDOWN TER | CLAYTON | 1924 |  |  |
| Rebstock Hall | 49 ARUNDEL PL | CLAYTON | 1917 |  |  |
| Ridgley Hall | 36 ABERDEEN PL | CLAYTON | 1922 |  |  |
| Rutledge House | — | — | — |  |  |
| Ryan Hall | 6633 CLAYTON RD | CLAYTON | 1940 |  |  |
| Saint Josephs Hall | 6600 CLAYTON RD | RICHMOND HEIGHTS | 1995 |  |  |
| Schnuck Pavilion | 7 ABERDEEN PL | St. Louis | 1914 |  |  |
| Scott Rudolph Hall | 257 WOODBOURNE DR | St. Louis | 1928 | NR |  |
| Seigle Hall | 103 ABERDEEN PL | CLAYTON | 1920 |  |  |
| Sever Hall | 400 DE MUN AVE | CLAYTON | — |  |  |
| Shanedling House | — | — | — |  |  |
| Shepley House | 6701 SAN BONITA AVE | CLAYTON | 1978 |  |  |
| Sieck Hall | 6420 CLAYTON RD | RICHMOND HEIGHTS | 1922 |  |  |
| Sigma Alpha Epsilon | 33 DARTFORD AVE | CLAYTON | 1910 |  |  |
| Somers Family Hall | 46 ARUNDEL PL | CLAYTON | 1917 |  |  |
| Steinberg Hall | 2 ARUNDEL PL | St. Louis | 1921 |  |  |
| Stix International House | 6470 Forsyth Boulevard | — | — |  |  |
| Sumers Welcome Center | 8 ABERDEEN PL | St. Louis | 1916 |  |  |
| Tech Den | 6214 Forsyth Boulevard | — | — |  |  |
| Theta Xi | 6500 WYDOWN BLVD | CLAYTON | — |  |  |
| Thomas H. Eliot House | 6531 SAN BONITA AVE | CLAYTON | 1927 |  |  |
| Tietjens Hall | — | — | — |  |  |
| Umrath Hall | 65 ARUNDEL PL | CLAYTON | 1920 |  |  |
| Umrath House | 801 SEMINARY PL | CLAYTON | 1945 |  |  |
| Urbauer Hall | 400 DE MUN AVE | CLAYTON | — |  |  |
| Ursula Cotta Hall | 6701 San Bonita Avenue | RICHMOND HEIGHTS | 1900 |  |  |
| Washington University - South 40 | 801 SEMINARY PL | CLAYTON | 1945 |  |  |
| Washington University South Campus | 6501 Clayton Road | RICHMOND HEIGHTS | 1923 |  |  |
| Weil Hall | 1 ARUNDEL PL | St. Louis | 1922 |  |  |
| Wheeler House | 901 CONCORDIA LN 2N | CLAYTON | 1930 |  |  |
| Whitaker Hall | — | — | — |  |  |
| Wilson Hall | 39 ARUNDEL PL | CLAYTON | 1927 |  |  |
| Wrighton Hall | 6450 WYDOWN BLVD | CLAYTON | — |  |  |

#### dining/bars (1)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Sasha's Wine Bar | 706 De Mun Avenue | CLAYTON | 1930 |  | ✓ |

#### dining/cafes (5)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Café Bergson | 75 ARUNDEL PL | CLAYTON | 1922 |  | ✓ |
| Kaldi's Coffee Roasting Co. | 700 De Mun Avenue | CLAYTON | 1925 |  | ✓ |
| Panera Bread | 6734 Clayton Road | RICHMOND HEIGHTS | 1905 |  | ✓ |
| Seedz Cafe | 710 De Mun Avenue | CLAYTON | — |  | ✓ |
| Starbucks | 7036 Clayton Avenue | St. Louis | 1899 |  | ✓ |

#### dining/desserts (1)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Clementine's Naughty & Nice Creamery | 730 De Mun Avenue | CLAYTON | 1920 |  | ✓ |

#### dining/restaurants (7)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Barrio | 740 De Mun Avenue | CLAYTON | 1920 |  | ✓ |
| Chinese Express | 7022 Clayton Avenue | St. Louis | 1950 |  | ✓ |
| DeMun Oyster Bar | 740 De Mun Avenue | CLAYTON | 1920 |  | ✓ |
| Hi-Pointe Drive-In | 1033 McCausland Avenue | St. Louis | 2018 |  | ✓ |
| Ibby's | 75 ARUNDEL PL | CLAYTON | 1922 |  | ✓ |
| Louie | 706 De Mun Avenue | CLAYTON | 1930 |  | ✓ |
| Qdoba | 6701 Clayton Road | RICHMOND HEIGHTS | 1907 |  | ✓ |

#### hospitality/hotels (1)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Cheshire Inn | 6300 Clayton Road | St. Louis | 1887 |  | ✓ |

#### parks/parks (2)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Henry Wright Park | 6424 Alamo Avenue | RICHMOND HEIGHTS | 1958 |  |  |
| Oak Knoll Park | 1 Oak Knoll Park | RICHMOND HEIGHTS | 1905 |  |  |

#### parks/pavilions (2)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Picnic Pavilion 7 | 1310 FAIRMOUNT CT | St. Louis | 1946 |  |  |
| Picnic Pavilion 8 | 1330 KRAFT ST | St. Louis | 1950 |  |  |

#### parks/recreation (1)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Sports Court | 665 S SKINKER BLVD | St. Louis | 1962 | NR |  |

#### residential/apartments (12)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| 625 South Skinker Condominium | 625 South Skinker Boulevard | St. Louis | — |  |  |
| DeMun Pointe | 6451 Clayton Road | RICHMOND HEIGHTS | 1926 |  |  |
| Harbison House | — | — | — |  |  |
| Hi-Pointe Lofts | 6340 Clayton Road | St. Louis | 1955 |  |  |
| Hi-Pointe Lofts | 6340 Clayton Road | St. Louis | 1926 |  |  |
| Millbrook Apartment 2 | — | — | — |  |  |
| Millbrook Apartment 3 | — | — | — |  |  |
| Millbrook Apartment 4 | — | — | — |  |  |
| The Dorchester on Forest Park | 665 South Skinker Boulevard | St. Louis | 1907 |  |  |
| The Versailles Condominium | 701 South Skinker Boulevard | St. Louis | 1925 |  |  |
| Village House | — | — | — |  |  |
| Wiltshire Condominium | 725 South Skinker Boulevard | St. Louis | 1905 |  |  |

#### residential/houses (2)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| McCarthy House | 6481 Ellenwood Avenue | — | — |  |  |
| Wydown House | 6600 Wydown Boulevard | CLAYTON | 1940 |  |  |

#### services/automotive (1)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Stevenson's Hi-Pointe Service | 981 South Skinker Boulevard | St. Louis | 1941 |  | ✓ |

#### services/beauty (4)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Abigail's On De Mun | 923 De Mun Avenue | CLAYTON | 1925 |  | ✓ |
| Kathy Taylor Salon | 923 De Mun Avenue | CLAYTON | 1925 |  | ✓ |
| Samantha's Other Place | 927 De Mun Avenue | CLAYTON | 1925 |  | ✓ |
| Strands Hair Salon | De Mun Avenue | CLAYTON | 1925 |  | ✓ |

#### services/financial (3)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Busey Bank | 7230 DALE AVE | RICHMOND HEIGHTS | 1958 |  | ✓ |
| Commerce Bank | 6369 Clayton Road | RICHMOND HEIGHTS | 1927 |  | ✓ |
| Lindell Bank | 6900 Clayton Avenue | St. Louis | 1941 |  | ✓ |

#### services/fitness (3)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Casa Bagus | 6318 Clayton Road | St. Louis | 1914 |  |  |
| Eldon E Pederson Fieldhouse | 1215 HIGHLAND TER | RICHMOND HEIGHTS | 1925 |  |  |
| Sumers Recreation Center | 6800 WYDOWN BLVD | CLAYTON | 1927 |  | ✓ |

#### services/health (8)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| 1027 Medical Building | 1027 Bellevue Avenue | RICHMOND HEIGHTS | 1907 |  |  |
| 1031 Medical Building | 1428 RANKIN DR | RICHMOND HEIGHTS | 1898 |  |  |
| 1035 Medical Building | 1035 Bellevue Avenue | RICHMOND HEIGHTS | 1940 |  |  |
| 6400 Medical Building | 6420 Clayton Avenue | RICHMOND HEIGHTS | 1921 |  |  |
| Big Bend Professional Building | 6744 Clayton Road | RICHMOND HEIGHTS | 1954 |  |  |
| SSM Health St. Mary's Hospital - St. Louis | 6420 Clayton Avenue | RICHMOND HEIGHTS | 1921 |  |  |
| SSM Health St. Mary's Hospital: Hospital Building | 6420 Clayton Avenue | RICHMOND HEIGHTS | 1921 |  |  |
| Total Access Urgent Care | 1005 South Big Bend Boulevard | RICHMOND HEIGHTS | 1912 |  | ✓ |

#### services/parking (7)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| 6400 Medical Building Parking | 6420 Clayton Avenue | RICHMOND HEIGHTS | 1921 |  |  |
| Hospital Parking | 7108 HORNER AVE | RICHMOND HEIGHTS | 1975 |  |  |
| Shepley Drive Garage | — | — | — |  |  |
| Snow Way Parking Garage | 6500 WYDOWN BLVD | CLAYTON | — |  |  |
| Throop Parking Facility | 6475 WYDOWN BLVD | CLAYTON | 1922 |  |  |
| Wallace Drive Garage | 801 SEMINARY PL | CLAYTON | 1945 |  |  |
| West Parking Garage | 1428 RANKIN DR | RICHMOND HEIGHTS | 1898 |  |  |

#### shopping/grocery (2)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Mobil Mart | 1405 SILVERTON PL | RICHMOND HEIGHTS | 1911 |  | ✓ |
| Schnucks | 6600 Clayton Road | RICHMOND HEIGHTS | 1926 |  | ✓ |

#### shopping/pharmacy (1)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| Walgreens | 6733 Clayton Road | RICHMOND HEIGHTS | 1952 |  | ✓ |

#### shopping/retail (3)

| Name | Address | Muni | Year | Historic | ✎ |
|---|---|---|---|---|---|
| How Sweet Is This Candy Shoppe | 804 De Mun Avenue | CLAYTON | — |  | ✓ |
| Office Depot | 1024 South Big Bend Boulevard | RICHMOND HEIGHTS | 2022 |  | ✓ |
| Porter Paints | 6701 Clayton Road | RICHMOND HEIGHTS | 1907 |  | ✓ |

---

## 5. The historic backbone — HiPointe-DeMun HAS the completist well

This is the pleasant surprise for the second pour. `NEIGHBORHOOD-INPUTS §4.1` warned that per-building historic status (style/architect/period/contributing) *"does not exist for a normal town."* **Hi-Pointe–DeMun is not a normal town** — it is a documented National Register district, exactly the completist luck LS rode:

- **Hi-Pointe–DeMun Historic District** — NRHP **#05000370** (listed May 7, 2005), boundary increase **#06001207** (March 22, 2007).
- **552 contributing buildings** across 105.5 acres (441 original + 111 in the 2007 increase).
- The **NR nomination document** (250 pp., Missouri SHPO) has been **fetched and its "Exhibit 5" building survey extracted** → `content/nr-inventory.json` (**221 buildings** with construction date, architectural **style**, and contributing status). This is HiPointe-DeMun's `inventory/` corpus.
- **65 visible buildings** are already attributed with NR **style + contributing** (geometry-joined NR → parcel → building). Style rollup: Craftsman, Prairie Influence, Tudor Revival/Jacobethan, Colonial Revival, Italian Renaissance, Spanish.
- Combined with the **153** assessor-flagged buildings, **216 buildings** now carry a historic signal.
- **Coverage caveat:** the automated NR→building join reaches ~30% (OCR'd house numbers + a parcel-coverage gap in the northern DeMun blocks). Per §0.0, the remainder is a **place-card override** job — a guardian/resident can correct their building's address/attribution — so the corpus is the source of truth and the join improves as addresses are fixed.

### 5.1 Historic-district membership — the flag (LS `architecture.district` convention)

The completist join is only ~30% per-building, which *understates* how historic the neighborhood is — nearly every home sits **inside** the NR district. So each building now carries **`in_historic_district`** + the LS-style `architecture` object (`district` · `contributing` · `nps_listed`/`nps_ref` · `style` · `year_built`), so a place card renders *"a contributing structure in the Hi-Pointe–DeMun Historic District, listed on the National Register."*

- **519 buildings in the historic district** — St. Louis 193 · Clayton 246 · no-parcel 80; **zero Richmond Heights** (the nomination is City + Clayton only, south of Clayton Rd is outside). The total lands right at the district's ~552-contributing scale.
- **Boundary method:** proximity to the two authoritative signals — the **City assessor's historic flag** (Hi-Pointe side) + **NR-contributing joins and the DeMun nomination streets** (Alamo/San Bonita/Southwood/Northwood/Rosebury/De Mun) — Richmond Heights hard-excluded.
- **Three honest tiers of certainty:** 64 confirmed contributing (NR join, `contributing: true`) · 153 City-assessor-flagged · 304 membership-only (`contributing: null`, `historic_status: "in historic district"` — in the boundary, per-building status TBD).

> **⭐ The single-family answer (Jacob, 2026-07-05):** of **1212 single-family homes**, **134 (11%)** are *individually* confirmed historic — but **292 (24%)** fall **within the district boundary**. The real designated share is the latter; the former is just the address-join floor.

---

## 6. Provenance & caveats (read before trusting a cell)

- **Authoritative:** parcel **address, year_built, sqft, zoning, historic_district flag** (STL City assessor + STL County assessor) — parcel containment join, 1,893/2,089 matched.
- **County building types** are authoritative (County LUC code table). **City fine-grained types** (AsrLandUse) are best-effort broad buckets — trust the address/year over the type label.
- **POI → building pairing is containment-first, else nearest 25 m.** A handful of landmark addresses may be off by one building (e.g. **Hi-Pointe Theatre's** true address is **1005 McCausland**, not the joined "1446 Cutter"). Names are real and in-neighborhood; verify the exact building on the map.
- **OSM undercounts small businesses** — the DeMun Ave and McCausland commercial strips have more current shops/restaurants than OSM tags. A directory-enrichment pass (Google/site visits, per LS's method) will add them.
- A few duplicate OSM names (e.g. *Hamsini House*, *Hitzeman House* appear twice) — dedupe during enrichment.

---

## 7. What "enrichment" looks like next (not done here)

Per `NEIGHBORHOOD-INPUTS §7` the long pole is content. From this grounded base:
1. **Pull the NR nomination (#05000370)** → per-building contributing-status/style/period for the 153+ historic buildings (the `inventory/` analog).
2. **Directory enrichment** (Tier ③) — for the named commercial listings: hours, phone, website, photos, menus (the LS place-card fields), + catch the OSM-missed DeMun/Hi-Pointe businesses.
3. **Bring the roster to the customer** — decide which listings get the full enhanced-card treatment vs. auto-card.

---

*Generated 2026-07-05. Backing data + full per-building schema: `cartograph/data/hipointe-demun/content/roster.json`. Sources: OpenStreetMap (ODbL), St. Louis City & County assessors (open), National Register of Historic Places / Wikipedia. Method: spatial join onto the baked visible building set (`scratch`-staged join scripts).*
