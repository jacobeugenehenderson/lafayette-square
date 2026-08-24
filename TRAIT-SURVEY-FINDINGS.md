# TRAIT SURVEY — what the world actually records about trees

**Answers `BRIEF-tree-trait-survey.md`. Research output only — no schema, no collection, no code.**
Every field list below was observed on a page or API response that was actually fetched, and the URL
or endpoint is given. Anything not directly observed is marked **unconfirmed** and left at that.

> ⛔ This is a survey of *sources*, not a proposal. §2 is the three-column mapping the brief asked
> for. §3 recommends one or two sources to build on; the schema decision is Jacob's.

---

## 0. HEADLINE

- **7 sources carry genuine field-per-trait data with fixed term lists.** Three of them are
  unauthenticated JSON APIs that can be walked today with no key and no scraping.
- **SURPLUS is by far the biggest column** — roughly **120+ coded traits** exist across these
  sources that we have no axis for, and a dozen or so are directly renderable.
- **Two of our axis families are true GAPs**: the four `bark.*` scalar detail knobs
  (`groove_depth`, `plate_size`, `scale_frequency`, `exfoliation_density`) and `leaf.face`.
  Bark is universally recorded as a **pattern term**, never as a magnitude. Those are authoring
  knobs, not research targets.
- **The single best fit for the Arborist is Cal Poly's SelecTree** — a per-cultivar urban/street-tree
  database with fixed term lists for shape, bark texture, leaf form, leaflet shape and arrangement,
  exposed through an open JSON API. Measured: **89/89** distinct species names in the LS park census
  return at least one SelecTree record.

---

## 1. SOURCES

### 1.1 ⭐ SelecTree (Cal Poly UFEI) — **best structural fit; licence unresolved**

**What it is.** The Urban Forest Ecosystems Institute's tree-selection database at California
Polytechnic State University, San Luis Obispo. Urban/landscape trees, **including cultivars as
separate records**.

**Access — CONFIRMED, open unauthenticated JSON API** (the site is a React SPA; these are the
endpoints its own bundle calls, found in `https://selectree.calpoly.edu/static/js/main.38be97fb.js`):

| endpoint | returns |
|---|---|
| `GET /api/tree/search-characteristics` | **every controlled vocabulary in the system, as arrays** |
| `GET /api/tree/detail/{tree_id}` | the full 82-field record for one taxon |
| `GET /api/tree/search-by-name-multiresult?region=&searchTerm=…&activePage=1&resultsPerPage=…&sort=` | name search; `totalResults` = **2087** taxa with no term |
| `GET /api/tree/glossary` | **51 glossary entries — one per characteristic, with its definition** |

No key, no rate limit encountered, CORS-open. There is **no bulk file**; the corpus is walked
record-by-record (2,087 calls).

**Observed record schema — 82 keys**, from a census of 40 records (`/api/tree/detail/{100+37n}`):

```
tree_id · family · memo · fragrance · native_range · photolocations · display · pacific_island
california_native · ethnobotanical_info · pi_invasive · invasive_text · ca_invasive · schoolyard
schoolyard_use_notes · soil_ph_low · soil_ph_high · planting_area · shade_tolerant
branch_strength_low · branch_strength_high · root_damage_potential · biogenic_emissions
deer_palatable · height_high · height_memo · width_high · growth_rate_high · water_use
salt_tolerance · fruit_size · fruit_color · fruit_type · flower_showiness · bark_color
leaf_arrangement · leaf_form · leaflet_shape · foliage_fall_color · foliage_type · redirect_tree_id
utility_friendly · wind_resistance · suitability_map · future_suitability_map · sex_explanation · sex
has_redirect · primary_common · primary_taxon · other_taxa · other_common · genericCommonNames
images · landscape_application · landscape_use · sunset_zone · formatted_sunset_zones · usda_zone
soil_texture · disease_resistant · disease_susceptibility · pest_resistant · pest_susceptibility
health_hazard · attracts_wildlife · fruit_value · fruiting_time · flower_time · flower_color
foliage_growth_color · bark_texture · tree_shape · litter_type · climate_adapted_regions
appraisal_text · app_grrating · app_lcant · appraisal · external_resources · champ_count · message
```

**The controlled vocabularies, verbatim from `/api/tree/search-characteristics`:**

| field | n | terms |
|---|---|---|
| `tree_shape` (multi) | 12 | Columnar · Conical · Irregular · Palm · Prostrate · Pyramid · Rounded · Shrub · Sprawling · Sword Palm · Vase · Weeping |
| `bark_texture` (multi) | 17 | Blocky · Corky · Exfoliating · Fibrous · Fissured · Furrowed · Mottled · Papery · Peeling · Ridged · Rough · Scaly · Smooth · Spiny · Striated · Warty · Wrinkled |
| `leaf_form` | 5 | Bipinnately Compound · Palmately Compound · Pinnately Compound · Simple · Trifoliate |
| `leaf_arrangement` | 5 | Alternate · Alternate/Whorled · Opposite · Opposite/Whorled · Whorled |
| `leaflet_shape` | 17 | Diamond-shaped · Elliptic · Fan-shaped · Heart-shaped · Linear · Needle · Oblanceolate · Oblong · Obovate · Oval · Ovate · Palmately-lobed · Scale-like · Sickle-shaped · Spear-shaped · Spines · Triangular |
| `foliage_growth_color` ("New Growth Color", multi) | 19 | Blue Green · Bluish Green · Bronze · Dark Green · Gray Green · Green · Light Green · Light to Medium Green · Medium Green · Pale green · Peach · Pink · Pink-purple · Purple · Reddish · Silver · Variegated · Yellow · Yellow Green |
| `foliage_type` | 3 | Deciduous · Evergreen · Partly Deciduous |
| `litter_type` (multi) | 8 | Bark · Dry Fruit · Flowers · Fruit · Leaf · Leaves · Twigs · Wet Fruit |
| `fruit_type` | 15 | Achene · Acorn · Berry · Capsule · Cone · Drupe · Fleshy Cone · Follicle · Hesperidium · Legume · Multiple Fruit · Nut · Pome · Samara |
| `fruit_size` | 12 | Inconspicuous · Very Small · Very Small to Small · Very Small to Large · Small · Small to Medium · Medium · Medium to Large · Large · Large to Very Large · Very Large |
| `flower_color` (multi) | 21 | Blue · Brown · Chartreuse · Cream · Crimson · Golden · Green · Lavender · Lilac · Maroon · Orange · Pale Purple · Peach · Pink · Purple · Red · Red/Pink · Rose · White · Yellow · Yellow-Green |
| `flower_showiness` | 3 | Inconspicuous · Low · Showy |
| `flower_time` / `fruiting_time` (multi) | 4 | Fall · Spring · Summer · Winter |
| `branch_strength_low/high` | 5 | Weak · Medium Weak · Medium · Medium Strong · Strong |
| `root_damage_potential` | 3 | Low · Moderate · High |
| `biogenic_emissions` | 3 | Low · Moderate · High |
| `water_use` | 4 | VL · L · M · H (glossary: Very Low / Low / Medium / High) |
| `salt_tolerance` | 3 | Low · Moderate · High |
| `wind_resistance` | 4 | Lowest · Medium Low · Medium High · Highest |
| `health_hazard` (multi) | 4 | Allergy · Irritant · None Known · Poisonous |
| `attracts_wildlife` (multi) | 6 | Bees · Birds · Butterflies · Hummingbirds · Mammals · Squirrels |
| `planting_area` | 4 | 2 to 4 · 4 to 7 · >7 · Urban areas (parkway width, feet) |
| `soil_texture` (multi) | 3 | Clay · Loam · Sand |
| `landscape_use` (multi) | 6 | Bonsai · Espalier · Hedged · Pleached · Pollarding · Topiary |
| `landscape_application` (multi) | 55 | Accent · Bank Stabilization · Barrier · Buffer Strip · Lawn Tree · Park Tree · Parking Lot · Patio Tree · **Street Tree** · Screen · Shade Tree · Specimen · Windbreak · Xerophytic · … ⚠️ **dirty** — contains typo duplicates ("Coastal Stree Tree", "Street Trees", "garden tree") |
| `pest_susceptibility` / `disease_susceptibility` (multi) | 144 / 116 | free-ish taxon names; ⚠️ **dirty**, with casing and punctuation duplicates |
| `climate_adapted_regions` | 6 | Inland Empire · Inland Valleys · Interior West · Northern California Coast · Southern California Coast · Southwest Desert |

**Granularity notes — measured, and they matter:**
- **`bark_texture` is MULTI-VALUED.** `Platanus × hispanica 'Bloodgood'` = `["Exfoliating","Smooth"]`;
  `Quercus oblongifolia` = `["Furrowed","Ridged","Scaly"]`. The world does **not** treat bark as one
  term. Our `bark.type` is single-valued.
- ⚠️ **`bark_color` is NOT a controlled vocabulary.** It is a free string composing a colour palette:
  observed values include `"Dark Gray, Light Gray, Reddish Brown"`, `"Striking, Cream or Light Gray"`,
  `"Reddish-Gray to Brown"`. It appears in the glossary but not in `search-characteristics`.
- ⚠️ **There is NO fall-colour value.** `foliage_fall_color` is a **boolean flag** (0/1) meaning
  "has distinctly different fall foliage". `Acer rubrum 'Armstrong'` → `foliage_fall_color: 1`,
  and no colour recorded anywhere. `foliage_growth_color` is *new growth*, not autumn.
- **Cultivar-level habit is real.** `Acer rubrum 'Armstrong'` is `tree_shape: ["Columnar"]` while the
  species reads otherwise — the source records that a cultivar changes the silhouette.
- Size is `height_high` / `width_high` (feet, maxima only — no minimum, no typical) and
  `growth_rate_high` in inches/year (glossary bands: Slow ≤12 · Slow-Moderate 12–24 · Moderate 24 ·
  Moderate-Fast 24–36 · Fast ≥36).

**Coverage — MEASURED.** 2,087 taxa. Every NA street-tree genus probed is present *with cultivars*:
`Platanus` 12 · `Acer saccharum` 10 · `Ulmus americana` 3 · `Gleditsia triacanthos` 9 · `Tilia` 15 ·
`Ginkgo` 6 · `Zelkova` 5 · `Celtis occidentalis` 2 · `Quercus palustris` 1 · `Liriodendron` 3.
⭐ **Against the LS census** (`cartograph/data/lafayette-square/clean/park_census.json`, 756 records,
**89 distinct raw species names**): **89/89 returned at least one SelecTree record.** A control query
(`searchTerm=zzzqqqxx`) returns `totalResults: 0`, so the search is not a catch-all.
⚠️ **But top-hit ≠ correct taxon.** `Hackberry → Celtis australis` (not *occidentalis*),
`Birch → Prunus serrula`. The species are *present*; picking the right one still needs our own
name resolution — which is exactly what `vocabulary.mjs` does.
⚠️ Bias: the list is Californian in emphasis (Sunset zones, CA-native flags, PG&E branch-strength
provenance), even though eastern species are present.

**Authority / licence.** Maintained by UFEI, Cal Poly SLO. ⛔ **No open-data licence found.**
`https://ufei.calpoly.edu/about-ufei/` carries only a disclaimer, verbatim: *"No warranties or
guarantees as to the accuracy of the data and information derived from this web site are expressed or
implied."* There is no copyright grant, no CC licence, and **no citation template** on the pages
fetched. **Reuse terms are unconfirmed and would need to be asked for** (ufei@calpoly.edu).

---

### 1.2 ⭐ USDA PLANTS — Conservation Plant Characteristics — **public domain, 83 coded fields**

**Access — CONFIRMED, open unauthenticated REST API.** The old `plantsorig.sc.egov.usda.gov`
characteristics host is dead (DNS failure) and the CSV download URL now serves an Angular shell, but
the backing service is live and its Swagger is public:

- `https://plantsservices.sc.egov.usda.gov/swagger/v1/swagger.json` — "Plants Services API", 42 endpoints
- `GET /api/PlantProfile?symbol=ACRU` → `Id` (e.g. 92846), plus `GrowthHabits`
- `GET /api/PlantCharacteristics/{id}` → long-form rows:
  `{"PlantCharacteristicName":"Growth Rate","PlantCharacteristicValue":"Rapid","PlantCharacteristicCategory":"Morphology/Physiology","CultivarName":null,"SynonymName":null}`
- `GET /api/characteristicSearchResultsDownload` → **2,268 rows / 2,186 unique accepted symbols**
  — ⚠️ names only, **no trait columns**. There is no single-file bulk trait dump; the corpus is
  walked per-taxon (~2,186 calls).
- `GET /api/GrowthHabitSearch` → `Forb/herb · Graminoid · Lichenous · Nonvascular · Shrub · Subshrub · Tree · Vine`

**Licence — verbatim from the PLANTS Help Document (2022), p.3:** *"Our plant information, including
the distribution maps, lists, and text, is not copyrighted and is free for any use."* **Public
domain** — images are carved out and may be copyrighted.

**Citation — verbatim template:** *USDA, NRCS. [YEAR]. The PLANTS Database (http://plants.usda.gov,
[DAY MONTH YEAR]). National Plant Data Team, Greensboro, NC USA.*

**Coverage.** Help doc, verbatim: *"We have Characteristics for about 2000 conservation plant species
and 500 cultivars."* Measured 2,186 unique accepted taxa. **Trees ≈ 610** — estimated from a 150-symbol
random sample scored against `PlantProfile.GrowthHabits` (42/150 = 28%); a sample, not an exact count.
⚠️ **The population is "NRCS conservation plants", not "North American street trees."** Expect gaps in
ornamentals and street-tree cultivars — the opposite bias to SelecTree.

**Fields — 83 total; a tree record carries 82.** The renderable subset, with vocabularies verbatim:

| field | values |
|---|---|
| **Shape and Orientation** | Climbing · Columnar · Conical · Decumbent · Erect · Irregular · Oval · Prostrate · Rounded · Semi-Erect · Vase |
| **Growth Form** | Bunch · Colonizing · Multiple Stems · Rhizomatous · Single Crown · Single Stem · Stoloniferous · Thicket Forming |
| **Foliage Color** | Dark Green · Green · Gray-Green · Red · White-Gray · Yellow-Green |
| **Foliage Texture** | Fine · Medium · Coarse |
| ⭐ **Foliage Porosity Summer** | Porous · Moderate · Dense |
| ⭐ **Foliage Porosity Winter** | Porous · Moderate · Dense |
| **Fall Conspicuous** | Yes · No |
| **Leaf Retention** | Yes · No |
| **Growth Rate** | Slow · Moderate · Rapid |
| **Height, Mature (feet)** | numeric |
| ⭐ **Height at 20 Years, Maximum (feet)** | numeric |
| **Lifespan** | Short (<100 yr) · Moderate (100–250) · Long (>250) |
| **Bloom Period** | Spring · Early Spring · Mid Spring · Late Spring · Summer · Early Summer · Mid Summer · Late Summer · Fall · Winter · Late Winter · Indeterminate |
| **Flower Color** | Blue · Brown · Green · Orange · Purple · Red · White · Yellow |
| **Flower Conspicuous** | Yes · No |
| **Fruit/Seed Color** | Black · Blue · Brown · Green · Orange · Purple · Red · White · Yellow |
| **Fruit/Seed Conspicuous** | Yes · No |
| **Fruit/Seed Persistence** | Yes · No |
| **Active Growth Period** | Spring · Spring & Fall · Spring & Summer · Spring Summer & Fall · Summer · Summer & Fall · Fall · Fall Winter & Spring · Year-round |
| **Shade Tolerance** | Intolerant · Intermediate · Tolerant |
| **Coppice Potential / Resprout Ability / Fire Resistant / Known Allelopath** | Yes · No |
| **Toxicity** | None · Slight · Moderate · Severe |
| **C:N Ratio** | Low (<23) · Medium (23–59) · High (>59) |
| **Drought / Fire / Hedge / Anaerobic / CaCO3 Tolerance** | None · Low · Medium · High |
| **Salinity Tolerance** | None (0–2 dS/m) · Low (2.1–4.0) · Medium (4.1–8.0) · High (>8.0) |
| **Moisture Use** | Low · Medium · High |
| **pH Min/Max · Precipitation Min/Max · Temperature Min (°F) · Frost Free Days Min · Root Depth Min (in)** | numeric |
| **Adapted to Coarse / Medium / Fine Textured Soils** | Yes · No (3 fields) |
| **Fruit/Seed Abundance** | None · Low · Medium · High |
| **Fruit/Seed Period Begin / End** | Spring · Summer · Fall · Winter · Year-round |
| **Seed Spread Rate · Vegetative Spread Rate** | None · Slow · Moderate · Rapid |
| **Seedling Vigor** | Low · Medium · High |
| **Commercial Availability** | No known source · Routinely available · Contracting only · Field collections only |
| **Propagated by** Bare Root / Bulb / Container / Corm / Cuttings / Seed / Sod / Sprigs / Tubers | Yes · No (9 fields) |
| **Suitability/Use** — Berry/Nut/Seed · Christmas Tree · Fodder · Lumber · Naval Store · Nursery Stock · Post · Pulpwood · Veneer Product | Yes · No |
| **Fuelwood Product** | Low (<28) · Medium (28–35) · High (>35) lb/ft³ green wood |
| **Palatable Browse / Graze Animal · Protein Potential** | Low · Moderate · High |

⚠️ **Doc/API name drift:** the Help PDF says *"Height at Base Age, Maximum"* and *"Height at
Maturity"*; the API returns `Height at 20 Years, Maximum (feet)` and `Height, Mature (feet)`. **Key
on the API strings.**
⚠️⚠️ **Default-value trap — the single biggest hazard in this source.** Many booleans are documented
as *scored by default*, not observed: *"Woody plants are scored 'None' here by default"* (Bloat),
*"Plants other than trees and shrubs are scored 'No' by default"* (Coppice Potential, Post Product).
**A `No` on those fields frequently means "not applicable", not "measured false".**
⚠️ Values are explicitly approximations — Help doc, verbatim: *"Characteristics data values are best
viewed as approximations since they are primarily based on field observations and estimates from the
literature, not precise measurements or experiments."*
⚠️ Cultivar dimension exists (`Andropogon gerardii` returned 790 rows = 79 fields × 9 cultivars +
species rows). Deduplicate on `CultivarName IS NULL` for species-level traits.
⚠️ Filter parameter names for `characteristicSearchResultsDownload` are **unconfirmed** (a
`?GrowthHabit=Tree` attempt returned a byte-identical response).

---

### 1.3 ⭐ USA National Phenology Network (USA-NPN) — **the only source that gives `leaf.season` a real curve**

**Access — CONFIRMED, open unauthenticated JSON API** at `https://services.usanpn.org/npn_portal/`
(note: `www.usanpn.org/npn_portal/...` 404s; the `services.` host is the live one):

- `GET /phenophases/getPhenophases.json` → **205 phenophases**, each
  `{phenophase_id, phenophase_name, phenophase_category, pheno_class_id}`
- `GET /phenophases/getPhenophaseDefinitionDetails.json?phenophase_id=56` → the **prose definition**,
  verbatim for id 56: *"In at least 3 locations on the plant, the very first green tip of a young leaf
  has visibly moved out of the leaf bud."*
- `GET /species/getSpecies.json` → **1,940 species**, each with `functional_type`, `species_type[]`,
  ITIS TSN, and full taxonomic hierarchy
- Observation download endpoints exist for the raw dated observations (**unconfirmed** — I did not
  fetch an observation payload).

**Vocabularies observed verbatim:**
- `phenophase_category` (10): Leaves · Flowers · Fruits · Needles · Pollen cones · Seed cones ·
  Activity · Reproduction · Development · Method
- **Leaf phenophases** (the ones that matter): Breaking leaf buds · All leaf buds broken · Emerging
  leaves · Young unfolded leaves · First leaf · Early season leaf expansion · 75% leaf elongation ·
  ≥75% of full leaf size · Full leaf · Leaves · Colored leaves · 50% of leaves colored · ≥50% of
  leaves colored · All leaves colored · First leaf fallen · Falling leaves · 50% of leaves fallen ·
  ≥50% of leaves fallen · All leaves fallen · All leaves withered
- ⭐ `functional_type` (19): **Evergreen broadleaf · Semi-evergreen broadleaf · Deciduous broadleaf ·
  Drought deciduous broadleaf · Evergreen conifer · Deciduous conifer · Pine · Cactus · Forb ·
  Semi-evergreen forb · Evergreen forb · Graminoid · Algae** (+ animal types)
- `species_type` (~46): Deciduous · Evergreen · Coniferous · Ornamental · Invasive Plants · Allergen ·
  Crop · Vine · Cloned · Focal · … (plus campaign tags)

**Coverage.** 1,940 species. `Platanus occidentalis`, `Platanus acerifolia`, `Platanus racemosa`,
`Acer saccharum`, `Ulmus americana`, `Gleditsia triacanthos`, `Ginkgo biloba` all present.

**Authority / licence.** USA-NPN National Coordinating Office (Univ. of Arizona / USGS). re3data lists
it as open access under Creative Commons; the **exact CC variant is unconfirmed** — the
`usanpn.org/data/agreement` URL 404s and the terms page was not reached.

⭐ **Why it matters:** it is the only source that could yield an *empirical, regionalised day-of-year*
for leaf-out and leaf-fall per species, rather than a hand-authored guess. Our `leaf.season` axis is a
`[0,365]` curve; this is the world's data for exactly that curve. ⚠️ It is *observation* data, not a
per-species table — deriving a species curve would be an aggregation, and how well it aggregates for a
given species is **unconfirmed**.

---

### 1.4 ⭐ Manual of Leaf Architecture (LAWG, 1999) — **the deepest leaf vocabulary that exists**

**What it is.** The Smithsonian-published, community-standard controlled terminology for describing
angiosperm leaves — 57 numbered database fields, most with a closed term list. Fetched and text-extracted
from `https://personal.ems.psu.edu/~pwilf/1999_MLA.pdf`. Citation, verbatim from the document:
*"Manual of Leaf Architecture - morphological description and categorization of dicotyledonous and
net-veined monocotyledonous angiosperms by Leaf Architecture Working Group. 65p."* ©1999 Smithsonian
Institution, ISBN 0-9677554-0-9.

**The relevant fields, verbatim from the manual's field list (pp. 9–10):**

| # | field | terms |
|---|---|---|
| 14 | **LEAF ATTACHMENT** | alternate · decussate · opposite · whorled |
| 15 | **LEAF ORGANIZATION** | palmately compound · pinnately compound · simple · ternate · bipinnate · tripinnate |
| 16 | PETIOLE FEATURES | striations · pulvinate · base swollen (+ text) |
| 17 | ⭐ **LAMINAR SIZE** (Webb 1955 classes, by leaf **area**) | leptophyll <25 mm² · nanophyll 25–225 · microphyll 225–2,025 · notophyll 2,025–4,500 · mesophyll 4,500–18,225 · macrophyll 18,225–164,025 · megaphyll >164,025 |
| 18 | **LAMINAR SHAPE** | elliptic · oblong · obovate · ovate · special |
| 19 | LAMINAR SYMMETRY | asymmetrical · base asymmetrical · symmetrical |
| 20 | LAMINAR L:W RATIO | numeric |
| 21/22 | BASE ANGLE / APEX ANGLE | acute · obtuse · wide obtuse · circular (base only) |
| 23 | **BASE SHAPE** | complex · concave · concavo-convex · convex · cordate · cuneate · decurrent · hastate · lobate · rounded · sagittate · truncate |
| 24 | POSITION OF PETIOLAR ATTACHMENT | marginal · peltate-central · peltate-eccentric |
| 25 | **APEX SHAPE** | acuminate · complex · convex · emarginate · lobed · retuse · rounded · straight · truncate |
| 26 | ⭐ **MARGIN TYPE** | crenate · dentate · entire · erose · revolute · serrate |
| 27 | ⭐ **LOBATION** | unlobed · bilobed · palmately lobed · pinnately lobed |
| 28 | 1° VEIN CATEGORY | basal acrodromous · basal actinodromous · campylodromous · flabellate · palinactinodromous · parallelodromous · pinnate · suprabasal acrodromous · suprabasal actinodromous |
| 29 | 2° VEIN CATEGORY | basal acrodromous · brochidodromous · cladodromous · craspedodromous · eucamptodromous · festooned brochidodromous · festooned semicraspedodromous · interior · intramarginal vein · reticulodromous · semicraspedodromous · suprabasal acrodromous · weak brochidodromous |
| 30–46 | agrophic veins · basal vein count · 2° spacing/angle · inter-2° · 3°/4°/5° category, course, angle, variability · areolation · FEVs · marginal ultimate venation · **leaf rank** (1r–4r) | full coded lists in the manual |
| 47–53 | **tooth characters** — # of orders (1·2·3) · teeth/cm · spacing (regular·irregular) · **shape** (a 25-value matrix cv/st/cc/fl/rt × cv/st/cc/fl/rt) · **sinus** (angular·rounded) · **apex** (foraminate · mucronate · non-specific glandular · papillate · setaceous · simple · spherulate · spinose) |
| 54 | ⭐ **LEAF TEXTURE** | chartaceous w/ cuticle · chartaceous w/o cuticle · coriaceous w/ cuticle · coriaceous w/o cuticle · membranaceous w/ cuticle · membranaceous w/o cuticle · not apparent |
| 55 | STOMATA | 32 coded types (actinocytic … tetracytic) |
| 56 | **CUTICULAR FEATURES** | hair bases · multicellular hairs · papillae · peltate hairs · simple hairs · stellate hairs · striations · thickened areas · trichomes · unicellular hairs |

⛔ **Critical limitation:** the MLA is a **description scheme, not a dataset.** It tells you the term
list; it does **not** ship per-species values for North American street trees. Using it means adopting
its vocabulary and filling it from elsewhere. That still has real value — it is where `leaf.silhouette`
and `leaf.ways` could be given a *saturating*, citable term set instead of nine invented words.
**Licence:** ©1999 Smithsonian Institution, all rights reserved. **Terms are facts and freely usable;
reproducing the manual is not.**

---

### 1.5 Wojtech's bark key — a real 7-class bark vocabulary, but book-only

Michael Wojtech, *Bark: A Field Guide to Trees of the Northeast*, primary key. Quoted verbatim from
`https://extension.unh.edu/blog/2019/03/bark-great-way-identify-trees-winter`:

1. Peeling horizontally in curly strips · 2. Lenticels visible · 3. Smooth unbroken ·
4. Vertical cracks or seams in smooth bark · 5. Broken into vertical strips ·
6. Broken into scales or plates · 7. With ridges and furrows

⭐ Note what this key encodes that ours does not: **lenticels as their own class**, and **"vertical
cracks/seams in otherwise smooth bark"** as distinct from furrowed — that is beech/hornbeam, a real
visual read our 8-term `bark.type` collapses into `smooth`. ⛔ **Not machine-accessible** (copyrighted
book; no API, no dataset). Worth having as a vocabulary cross-check only.

---

### 1.6 USFS *Silvics of North America* (AH-654) — **PROSE. Discard.**

Fetched `https://www.srs.fs.usda.gov/pubs/misc/ag_654/volume_2/acer/rubrum.htm`. Narrative chapters,
no tables, no labelled trait fields. Headings verbatim: *Habitat · Native Range · Climate · Soils and
Topography · Associated Forest Cover · Life History · Reproduction and Early Growth · Sapling and Pole
Stages to Maturity · Special Uses · Genetics · Literature Cited.* Numeric facts sit inside sentences.
~200 species, 2 volumes, US federal → public domain. **Authoritative but not field-per-trait.**

### 1.7 USFS FEIS — headings are consistent, values are prose. **Marginal.**

`https://www.fs.usda.gov/database/feis/plants/tree/acerub/all.html`, verified against raw HTML. Heading
tokens present verbatim: `TAXONOMY · SYNONYMS · SCS PLANT CODE · ECOSYSTEMS · SAF COVER TYPES · KUCHLER ·
GENERAL BOTANICAL CHARACTERISTICS · RAUNKIAER LIFE FORM · REGENERATION PROCESSES · SITE CHARACTERISTICS ·
SUCCESSIONAL STATUS · SEASONAL DEVELOPMENT · POSTFIRE REGENERATION STRATEGY · FIRE REGIMES · IMMEDIATE
FIRE EFFECT ON PLANT · PLANT RESPONSE TO FIRE`. But values are prose with bracketed citations —
verbatim: *"Red maple is intolerant of fire; even large individuals can be killed by moderate fires [97]."*
Only three fields carry genuine controlled vocabularies: **RAUNKIAER LIFE FORM** (Phanerophyte ·
Chamaephyte · Hemicryptophyte …), **POSTFIRE REGENERATION STRATEGY**, and the numeric
**ECOSYSTEMS / SAF COVER TYPES / KUCHLER** classification codes. >1,000 NA species. FEIS has moved to
`https://www.feis-crs.org/feis`; **licence/citation terms unconfirmed.**

### 1.8 USDA PLANTS Fact Sheets / Plant Guides — **PROSE. Discard.**

Help doc, verbatim: *"Plant Guides are … more narrative."* Confirmed by extracting `pg_acru.pdf`:
*"The leaves are deciduous, opposite, long-petioled, blades 6-10 cm long…"* — free text throughout.
Public domain, but not a table.

---

<!-- PENDING: forestry/arboricultural vocabularies (FIA, ISA/TRAQ, i-Tree, municipal inventories);
     horticultural plant finders (MOBOT, Morton, Arnold, NC State Plant Toolbox);
     ontologies and aggregators (TO/PO, FLOPO, TOP, TRY, EOL TraitBank, GBIF, Wikidata, efloras). -->
