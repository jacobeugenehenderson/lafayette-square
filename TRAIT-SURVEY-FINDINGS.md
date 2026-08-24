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

### 1.9 ⭐⭐ NC State Extension Gardener Plant Toolbox — **the most granular morphology schema found**

**Access — CONFIRMED.** No documented API and no bulk download, but the advanced-search page loads its
vocabularies by AJAX from two **open, unauthenticated, no-parameter JSON endpoints** (traced out of
`https://plants.ces.ncsu.edu/static/plants/js/main.f27e08c0e70a.js`):

- `https://plants.ces.ncsu.edu/ajax_filters/` → **288 vocabulary rows** (the gardener/landscape search)
- `https://plants.ces.ncsu.edu/ajax_id_filters/` → **249 rows** (the plant-**ID** search — this is where
  the bark / stem / leaf-morphology vocabularies live)

Row shape: `[section, field_key, printed_label, option_value, id, live_count, "", query_param, null, null]`.
⭐ **The counts are live**, so a check can re-derive them instead of quoting a number into a doc.
Records are plain server-rendered HTML at `/plants/{slug}/`. `robots.txt` returns **404** (no crawl
policy published).

**Record field list — verbatim, canonical order (read off `Quercus alba`;** fields render only when
populated, so no single page shows all of them):

`Genus · Species · Family · Uses (Ethnobotany) · Life Cycle · Recommended Propagation Strategy ·
Country Or Region Of Origin · Distribution · Fire Risk Rating · Wildlife Value · Play Value ·
Edibility · Particularly Resistant To (Insects/Diseases/Other Problems) · Dimensions`
**Whole Plant Traits:** `Plant Type · Woody Plant Leaf Characteristics · Habit/Form · Growth Rate · Maintenance · Texture`
**Cultural Conditions:** `Light · Soil Texture · Soil pH · Soil Drainage · Available Space To Plant · NC Region · USDA Plant Hardiness Zone`
**Fruit:** `Fruit Color · Fruit Value To Gardener · Display/Harvest Time · Fruit Type · Fruit Length · Fruit Width · Fruit Description`
**Flowers:** `Flower Color · Flower Inflorescence · Flower Value To Gardener · Flower Bloom Time · Flower Size · Flower Description`
**Leaves:** `Woody Plant Leaf Characteristics · Leaf Color · Leaf Feel · Leaf Value To Gardener · Deciduous Leaf Fall Color · Leaf Type · Leaf Arrangement · Leaf Shape · Leaf Margin · Hairs Present · Leaf Length · Leaf Width · Leaf Description`
**Bark:** `Bark Color · Surface/Attachment · Bark Plate Shape · Bark Description`
**Stem:** `Stem Color · Stem Is Aromatic · Stem Surface · Stem Form · Stem Cross Section · Stem Buds · Stem Bud Terminal · Stem Bud Scales · Stem Lenticels · Stem Description`
**Landscape:** `Landscape Location · Landscape Theme · Design Feature · Attracts · Resistance To Challenges · Problems`
**Poison (conditional):** `Poisonous to Humans · Poison Severity · Poison Symptoms · Poison Toxic Principle · Causes Contact Dermatitis · Poison Part`
**Prose:** `Common Name(s) · Previously known as · Phonetic Spelling · Description · Seasons of Interest · Quick ID Hints · Insects, Diseases, and Other Plant Problems · Cultivars / Varieties · Tags`

⚠️ Exact label variants matter: it is **`Surface/Attachment`** (not "Surface/Texture"),
**`Bark Plate Shape`**, **`Stem Is Aromatic`**, **`Woody Plant Leaf Characteristics`**.

**The controlled vocabularies — verbatim:**

| field | n | terms |
|---|---|---|
| `Plant Type` | 26 | Annual · Bulb · Carnivorous · Cool Season Vegetable · Edible · Epiphyte · Fern · Ground Cover · Herb · Herbaceous Perennial · Houseplant · Native Plant · Ornamental Grasses and Sedges · Perennial · Poisonous · Rose · Shrub · Succulent · **Tree** · Turfgrass · Vegetable · Vine · Warm Season Vegetable · Water Plant · Weed · Wildflower |
| ⭐ **`Woody Plant Leaf Characteristics`** | 4 | Broadleaf Evergreen · Deciduous · Needled Evergreen · Semi-evergreen |
| ⭐⭐ **`Habit/Form`** | 24 | Arching · Ascending · Broad · Cascading · Climbing · Clumping · Columnar · Conical · Creeping · Dense · Erect · Horizontal · Irregular · Mounding · Multi-stemmed · Multi-trunked · Open · Oval · Prostrate · Pyramidal · Rounded · Spreading · Vase · Weeping |
| `Growth Rate` | 3 | Slow · Medium · Rapid |
| ⭐ `Texture` | 3 | Fine · Medium · Coarse |
| `appendage` (ID tool) | 4 | Prickles · Spines · Tendrils · Thorns |
| ⭐ **`Bark Color`** | 9 | Black · Dark Brown · Dark Gray · Green · Light Brown · Light Gray · Orange · Red/Burgundy · White |
| ⭐⭐ **`Surface/Attachment`** (bark) | 15 | Bumpy · Exfoliating · Fissured · Furrowed · **Lenticels** · Papery · **Patchy** · Peeling · Ridges · Scaly · **Shaggy** · **Shiny** · **Shredding** · Smooth · **Spongy** |
| ⭐⭐⭐ **`Bark Plate Shape`** | 6 | **Diamond · Irregular · Oval · Rectangle · Round · Square** |
| `Stem Color` | 14 | Black · Blue · Brown/Copper · Cream/Tan · Gold/Yellow · Gray/Silver · Green · Insignificant · Orange · Pink · Purple/Lavender · Red/Burgundy · Variegated · White |
| `Leaf Color` | 14 | (same 14-colour palette) |
| ⭐ **`Leaf Feel`** | 12 | Fleshy · Glossy · Leathery · Papery · Prickly · Rough · Rubbery · Slippery · Smooth · Soft · Velvety · Waxy |
| `Leaf Value To Gardener` | 6 | Edible · Fragrant · Good Cut · Good Dried · Long-lasting · Showy |
| ⭐⭐ **`Deciduous Leaf Fall Color`** | 9 | Brown/Copper · Cream/Tan · Gold/Yellow · Gray/Silver · Insignificant · Orange · Pink · Purple/Lavender · Red/Burgundy |
| `Leaf Type` | 5 | Compound (Pinnately , Bipinnately, Palmately) *[sic]* · Fronds · Needles · Sheath · Simple |
| `Leaf Arrangement` | 5 | Alternate · Opposite · Other/more complex · Rosulate · Whorled |
| ⭐⭐ **`Leaf Shape`** | 25 | Acicular · Auriculate · Cordate · Cuneate · Deltoid · Elliptical · Filiform · Lanceolate · Linear · Oblanceolate · Oblong · Obovate · Obtuse · Orbicular · Ovate · Palmasect · Palmatifid · Peltate · Pinnatifid · Pinnatisect · Reniform · Rhomboidal · Spatulate · Subcordate · Subulate |
| ⭐⭐ **`Leaf Margin`** | 12 | Crenate · Crenulate · Dentate · Denticulate · Doubly Crenate · Doubly Dentate · Doubly Serrate · Entire · Lobed · Serrate · Sinuate · Undulate |
| `Hairs Present` | 2 | No · Yes |
| ⭐ `Leaf Length` / `Leaf Width` | 4 each | < 1 inch · 1-3 inches · 3-6 inches · > 6 inches |
| `Flower Inflorescence` | 11 | Catkin · Corymb · Cyme · Head · Insignificant · Panicle · Raceme · Solitary · Spadix · Spike · Umbel |
| `Flower Shape` | 15 | Bell · Cross · Crown · Cup · Dome · Funnel · Irregular · Lipped · Radial · Saucer · Star · Trumpet · Tubular · Urn · Wheel |
| `Flower Petals` | 10 | 2-3 rays/petals · 4-5 · 6 · 7-20 · >20 · asymmetrical petals · Bracts · Colored Sepals · fused petals · Tepals |
| `Fruit Type` | 13 | Achene · Aggregate · Berry · Capsule · Caryopsis · Drupe · Follicle · Legume · Nut · Pome · Samara · Schizocarp · Siliqua |
| `Light` | 4 | Dappled Sunlight · Deep shade (<2 h) · Full sun (6+ h) · Partial Shade (2–6 h) |
| `Soil Texture` | 5 | Clay · High Organic Matter · Loam (Silt) · Sand · Shallow Rocky |
| `Soil Drainage` | 7 | Frequent Standing Water · Good Drainage · Moist · Occasional Flooding · Occasionally Dry · Occasionally Wet · Very Dry |
| `Available Space To Plant` | 7 | <12 in · 12 in–3 ft · 3–6 ft · 6–12 ft · 12–24 ft · 24–60 ft · >60 ft |
| ⭐ `Landscape Location` | 19 | Coastal · Container · Hanging Baskets · Houseplants · Lawn · Meadow · Naturalized Area · Near Septic · Patio · Pond · Pool/Hardscape · Recreational Play Area · Riparian · Rock Wall · Slope/Bank · Small Space · Vertical Spaces · **Walkways** · Woodland |
| ⭐ `Design Feature` | 15 | Accent · Barrier · Border · Flowering Tree · Foundation Planting · Hedge · Mass Planting · Screen/Privacy · Security · Shade Tree · Small groups · Small Tree · Specimen · **Street Tree** · Understory Tree |
| `Attracts` | 12 | Bats · Bees · Butterflies · Frogs · Hummingbirds · Moths · Pollinators · Predatory Insects · Reptiles · Small Mammals · Songbirds · Specialized Bees |
| ⭐ `Resistance To Challenges` | 24 | Black Walnut · **Compaction** · Deer · Diseases · Drought · Dry Soil · Erosion · Fire · **Foot Traffic** · Heat · Heavy Shade · Humidity · Insect Pests · **Pollution** · Poor Soil · Rabbits · **Salt** · Slugs · Squirrels · **Storm damage** · **Urban Conditions** · Voles · Wet Soil · Wind |
| ⭐ `Problems` | 16 | Allelopathic · Contact Dermatitis · Frequent Disease Problems · Frequent Insect Problems · Invasive Species · Malodorous · **Messy** · Poisonous to Humans · Problem for Cats/Children/Dogs/Horses · Short-lived · Spines/Thorns · **Weak Wood** · Weedy |

⚠️ **The stem block is NOT exposed in either filter endpoint** — `Stem Surface`, `Stem Form`,
`Stem Cross Section`, `Stem Buds`, `Stem Bud Terminal`, `Stem Bud Scales`, `Stem Lenticels`,
`Stem Is Aromatic` are record fields whose **full option lists are unconfirmed**. Values observed
in situ (samples, not the vocabulary): Stem Surface {Smooth (glabrous), Hairy (pubescent)} ·
Stem Form {Straight, Zig Zags} · Stem Lenticels {Conspicuous} · Stem Bud Scales {Enclosed in more
than 2 scales, Enclosed in a single cap like scale}.

**Coverage.** 4,701 plants; **Tree = 1,047**. `Street Tree` **175** · Shade Tree 297 · Small Tree 230 ·
Understory Tree 86 · Flowering Tree 370. `Urban Conditions` 176 · `Salt` 456 · `Pollution` 303 ·
`Compaction` 81. North-Carolina-framed (the `NC Region` field is province-specific) but the taxon list
is general eastern-NA plus ornamentals — **the right region for Lafayette Square.**

**Granularity — the highest of any source in this survey.** Bark is **four** fields, stem is **ten**,
leaf is **thirteen**. This is a morphological key, not a garden blurb.

**Authority / licence.** NC State Extension / N.C. Cooperative Extension, Center for Integrated Pest
Management, with Extension Master Gardener curation. Help page, verbatim: *"We strongly encourage you
to cite or reference the Plant Toolbox as you would any other publication."* Recommended citation,
verbatim: **"Plant Toolbox. 2019 onwards. North Carolina Extension Gardener Plant Toolbox, N.C.
Cooperative Extension."** ⚠️ **No explicit licence grant on the trait text** — reuse beyond citation is
**unconfirmed**. Photos are individually CC-licensed.

---

### 1.10 Morton Arboretum Tree & Plant Finder — **best street-tree vocabulary, unusable licence**

Record attribute block (identical across the three tree pages fetched): `Common names · Family
(English) · Family (botanic) · Planting site · Tree or plant type · Foliage · Native locale · Size
range · Mature height · Mature width · Light exposure · Hardiness zones · Soil preference · Drought
tolerance · Other tolerances · Season of interest · Flower color and fragrance · Shape or form ·
Growth rate · Transplants well · Planting considerations · Wildlife · Has cultivars`. Bark is a
**prose section**, not a field.

Facets are server-rendered checkboxes in the HTML (126 inputs), so the vocabulary is directly readable:
- ⭐⭐ **`tp_planting_site`: City parkway · Residential and parks · Restricted sites · Under utility
  lines · Wide median** — the only genuinely street-tree-native facet in any source surveyed
- `tp_plant_shape` (17): Arching · Broad · Columnar · Creeping · Irregular · Mounded · Multi-stemmed ·
  Narrow · Open · Oval · Pyramidal · Round · Thicket-forming · Upright · Vase-shaped · Vining · Weeping
- `tp_size_range` (tree bands): Compact tree (10-15 ft) · Small tree (15-25 ft) · Medium tree (25-40 ft) ·
  Large tree (more than 40 ft)
- `tp_tolerances`: Alkaline soil · clay soil · Dry sites · Occasional drought · Occasional flooding ·
  **Road salt** · Wet sites
- `tp_seasons_of_interest` (12): early/mid/late × winter, spring, summer, fall
- `tp_growth_rate`: Fast · Moderate · Slow · `tp_drought_tolerance`: Sensitive · Moderately sensitive ·
  Moderately tolerant · Tolerant
- ⭐ `tp_plant_considerations` (11, from their taxonomy sitemap): aggressive · commonly planted ·
  dangerous thorns · excessive sucker growth · highly susceptible to ice damage · intolerant of
  pollution · marginally hardy · may be difficult to find in nurseries · **messy fruit/plant parts** ·
  **roots prone to invading sewer pipes** · **weak wood and branch structure**
- `tp_wildlife` (20): birds · browsers · butterflies · cavity-nesting birds · game birds · game mammals ·
  hummingbirds · insect pollinators · insect-eating birds · large/medium/small mammals · migrant birds ·
  moths · nesting birds · sapsuckers · seed-eating birds · songbirds · water birds

**Coverage.** 1,087 species URLs in `plant-sitemap.xml`; **274 tagged Tree**. City parkway 101 · Wide
median 110 · Under utility lines 31 · Road salt 174. Chicago-calibrated.
⛔ **Licence — the blocker.** Terms are all-rights-reserved, verbatim: *"we grant you a non-exclusive,
non-transferable, revocable, limited license to access this Website for your own personal,
non-commercial use"* · *"Material on this Website must not otherwise be reproduced, republished,
licensed, sold, transferred, or distributed either online or offline, without our prior written
permission."* `robots.txt` is permissive, **but robots.txt permissiveness is not a reuse grant.**
⇒ **Adopt the schema shape; do not ingest the content.**

---

### 1.11 Arnold Arboretum — accession records, **no trait vocabulary** (but real measured dimensions)

`https://gis.arboretum.harvard.edu/arcgis/rest/services/Maps/Explorer/MapServer`, layer 26 "Plant
Center": **142 fields, 16,406 records**, open unauthenticated ArcGIS REST, `maxRecordCount: 100000`
(the whole inventory in one call). Fields are curatorial: accession number/date, `Plant Source`,
`Provenance`, `Collector`, `Country`/`Locality`/`Latitude`/`Longitude`/`ALTITUDE`/`ASPECT`/`SOIL_TYPE`/
`HABITAT`, `Condition`, **`DBH`, `Height`, `Spread`, `Circumference`, `Measurement Date`**, nomenclature.

**The only trait-shaped field is `HABIT`**, complete distinct vocabulary 6 values + null:
`Geophyte · Herbaceous · Intermediate (shrub/tree) · Shrub · Tree · Vine`. No bark, leaf, flower,
season, tolerance, zone, growth-rate or form field exists. Their curatorial doc confirms the richer
observations live internally in **BG-BASE**, unpublished.

**Licence:** *"All data are protected by copyright 2020 The President and Fellows of Harvard College"*,
as-is, asking that *"any derived works give the Arnold Arboretum proper credit and notification."*
⭐ **Verdict: useless as a trait vocabulary, valuable as a dimensional ground-truth set** — 16,406
georeferenced live specimens with measured DBH / height / spread, i.e. real evidence for
`chassis.size` and for what a *mature* vs *young* specimen actually measures.

---

### 1.12 RHS Find a Plant — rich facets, **nothing granted, wrong units**

Record fields: `Time to Maturity · Max Spread · Max Height · soil {Chalk, Clay, Loam, Sand} · Moisture ·
pH · Position · Aspect · Exposure · Hardiness (H-code)`, a **`Season` × {Stem, Flower, Foliage, Fruit}
colour grid**, `Family · Native to GB/Ireland · Foliage · Habit · Potentially harmful · Plant Range`,
plus prose `Cultivation / Propagation / Pruning / Pests / Diseases`.

⭐ Notable vocabularies: **`Colour by type` = 16 colours × {Flower, Foliage, Fruit, Stem}** and
**`Colour by season` = the same 16 × {Spring, Summer, Autumn, Winter}** (Silver · Grey · Black · Brown ·
Bronze · Cream · Gold · Yellow · Orange · Red · Pink · Purple · Green · Blue · White · Variegated);
`Habits` (12): Bushy · Climbing · Clump forming · Columnar upright · Floating · Matforming · Pendulous
weeping · Spreading branched · Submerged · Suckering · Trailing · Tufted; `Foliage` {Deciduous,
Evergreen, Semi evergreen}; `Time to ultimate height` {1 year … more than 50 years}.

⛔ **Disqualifying for our purposes:** height/spread are **coarse bands with an open top** — a 15 m
Zelkova and a 35 m plane are both *"Higher than 12 metres"*. Hardiness is UK H-codes.
⛔ **Licence:** no site-wide terms page exists (`/terms-of-use`, `/copyright`, `/terms` all 404);
footer "© The Royal Horticultural Society 2026". Nothing granted. `robots.txt` disallows `/api/`.

### 1.13 Oregon State Landscape Plants — ⛔ **ClaudeBot is disallowed. Do not ingest.**

Only ~7 machine-readable fields (`Common name · Pronunciation · Family · Genus · Synonyms · Type ·
Native to Oregon`); everything else — habit, bark, leaves, tolerances, height — is **unlabelled prose**.
Its identification-key facets are decent (leaf attachment, leaf/leaflet characteristics incl. *Unlobed ·
Lobed rounded · Lobed pointed · Margin more or less smooth · Margin not smooth · Margin with obvious
spines*; conifer growth form *Pyramidal/Conical · Globose · Weeping · Dwarf · Columnar*), but
`robots.txt` carries **`User-agent: ClaudeBot` / `Disallow: /`** plus
`Content-Signal: search=yes,ai-train=no,use=reference` and an explicit EU 2019/790 rights reservation.
⛔ **Not to be ingested programmatically without written permission from OSU Horticulture.**

### 1.14 Missouri Botanical Garden Plant Finder — ⚠️ **NOT VERIFIED**

Nothing on missouribotanicalgarden.org was fetched. **Everything about MOBOT in this survey is
unconfirmed** — no field list, no facet vocabularies, no licence text. Given St. Louis is the
first town's own region, **this is the one outstanding item and should be re-run.**

---

### 1.15 Ontologies — vocabulary without values

| source | what it is | verdict |
|---|---|---|
| ⭐ **FLOPO** (Flora Phenotype Ontology) | 35,440 terms, version `2026-07-31`, **CC0 1.0**, `purl.obolibrary.org/obo/flopo.owl`. Text-mined from digitised Floras — which is why it has the bark vocabulary nothing else does. Terms verbatim: `FLOPO:0000010` bark phenotype · `0000386` **bark texture** · `0000891` **bark color** · `0000385` bark smooth · `0000981` bark rough · `0000397` **bark grooved** · `0002040` bark scaly · `0002355` bark flaky · `0002390` **bark hardness** · `0001651` **bark structure** · `0001562` **bark complexity** · `0000207` bark pilosity · `0000206` bark glabrous. Leaf: `0000149` leaf shape · `0003589` leaf lamina shape · `0006028` leaf base shape · `0016878` leaf apex shape · `0015408` leaf margin shape · `0004263` palmate leaf shape · `0023274` pinnate leaf shape · `0014757` simple leaf shape. | ⭐ **The best free vocabulary for bark.** ⚠️ EQ-style: "bark smooth" is a *term*, not a value of "bark texture". **No species table.** |
| **Plant Trait Ontology (TO)** | 6,194 terms, **CC BY 4.0**, `purl.obolibrary.org/obo/to.owl`. `TO:0000492` leaf shape · `TO:0001116` leaflet shape · `TO:0006063` leaf margin serrated · `TO:0000875` leaf lamina splitting · `TO:0002725` life cycle habit · `TO:0002756` shoot growth angle | ⚠️ **Crop-phenotype oriented, thin on trees.** A TO search for `bark` returns **zero TO terms**; for `habit`, only *shoot growth angle* and *life cycle habit* — **there is no plant-habit term in TO**. `crown` returns *root* crown. |
| **Plant Ontology (PO)** | anatomy, not traits. `PO:0004518` **bark** · `PO:0025142` leaf tip · `PO:0009006` shoot system · inflorescence block `PO:0030115–0030135` (raceme, catkin, panicle, corymb, umbel…) | anatomy vocabulary only |
| **PPO** (Plant Phenology Ontology) | **CC BY 3.0**. `PPO:0001014` unfolding true leaf · `0001019` mature true leaf · `0001017` senescing true leaf · `0001063` senesced true leaf · `0002017` unfolded true leaf presence | seasonal *state*, not species morphology |
| ⛔ **TOP Thesaurus** | **The domain is gone.** `top-thesaurus.org` fetched 2026-08-24 serves a **lawn-care affiliate site** ("Rooted in Knowledge"); `/annotationInfo` and `/characteristics` 404. What it was, verbatim from the Garnier et al. 2017 record: *"TOP provides names, definitions, units, synonyms and related terms for about 850 plant characteristics."* | ⛔ **Treat as a citation target, not a usable vocabulary.** ⚠️ The Wayback snapshot exists but was not fetchable and is **unconfirmed**. Live successor worth a look: the **AusTraits Plant Dictionary** (CC-BY-4.0, resolvable per-trait URIs, fields: label/description/type/units/allowable ranges/measured structure) — Australia-scoped. |

### 1.16 Trait aggregators

**TRY Plant Trait Database.** Verbatim from `try-db.org/TryWeb/Database.php`: *"2661 traits"*,
*"305,000 plant taxa"*, *"15 million trait records"* (homepage shows 15,409,681 / 305,594; v6 released
2022-10-13, v7 imports finished July 2025). *"Trait names are standardized conforming the standards of
the TOP Thesaurus of Plant Characteristics."* ⚠️ **Note the circularity** — that standard's website is
gone (§1.15).

⭐ **The find: TRY File Archive dataset 3, "TRY - Categorical Traits Dataset", DOI `10.17871/TRY.3`,
rights "Public, CC.BY.3.0".** File `TRY_Categorical_Traits_Lookup_Table_2012_03_17_TestRelease.zip`.
Columns verbatim:
```
AccSpeciesID, AccSpeciesName, IPNI/TROPICOS, Genus, SpeciesEpithet, Family, PhylogeneticGroup,
PlantGrowthForm, Succulent, climber, Parasitic, Aquatic, Epiphyte, Crop, Palmoid, LeafType,
LeafPhenology, PhotosyntheticPathway, Woodiness, WoodinessDetail, LeafCompoundness, NumberOfLeaflets,
+ a paired "…Source" provenance column for each
```
⇒ the categorical morphology layer is exactly seven fields: **`PlantGrowthForm`, `LeafType`,
`LeafPhenology`, `Woodiness`, `WoodinessDetail`, `LeafCompoundness`, `NumberOfLeaflets`**.
⚠️ Dated **2012, "TestRelease"**. ⛔ **No leaf shape, no bark thickness, no bark texture, no crown form
anywhere in TRY that could be verified.** The premise that TRY is numeric ecophysiology holds.
**Access:** File Archive is effectively open — *"Data download from the TRY File Archive is
unrestricted … requires only a free registration"*; the main database is **request-based**
(`Request PIs only` / `File Requesters only` roles). Attribution: *"please cite the original
publication and additionally please cite the TRY File Archive data package."* Authority: Future Earth /
MPI Biogeochemistry / iDiv. ⚠️ Main-database policy PDF and any co-authorship requirement **unconfirmed**.

**⭐ EOL TraitBank — the widest predicate coverage for a NA street tree.** Fetched the live data tab
for *Acer saccharum* (EOL page 582247). Predicates carried, verbatim, with providers:
- *form:* `plant growth form` · `planthabit` (FEIS) · `primary growth form` · **`shape`** (USDA) ·
  `leaf arrangement` (Kubitzki) · `leaf color` · `flower color` · `fruit or seed color` ·
  **`foliage texture`** · **`foliage porosity summer`** · **`foliage porosity winter`** ·
  `shedability` · `leaf sheddability` · `life cycle habit`
- *measured:* `plant height` · `stem diameter` · **`leaf area`** · `leaf mass per area` · `seed mass` ·
  **`wood density`** (Global Wood Density Database)
- *silviculture (USDA PLANTS relayed):* `growth rate` · `life span` · `shade/drought/fire/salt/hedge/
  calcareous/anaerobic/low temperature/precipitation tolerance` · `fire resistance` · `moisture use` ·
  `soil ph` · `soil depth` · `bloom period` · `active growth period` · `seed period begin/end` ·
  `seed spread rate` · `vegetative spread rate` · `allelopathic effect` · `browse animal palatability` ·
  `fuelwood suitability` · `human/livestock toxicity`
- *other:* `geographic distribution` · `native range includes` · `habitat` · `is a component of`
  (US National Vegetation Classification) · `number of records in gbif` · biotic interactions

⚠️ **The predicate set is NOT cleanly controlled at the surface** — `shedability` (USDA) and
`leaf sheddability` (MADtraits) coexist with the same value; `plant growth form` and `planthabit` both
resolve to `tree` from different providers. **Deduplication is on the consumer.**
Model is Darwin Core `MeasurementOrFact` with `measurementType` as an ontology URI (TO/PATO/ENVO/UO/SIO).
⚠️ **No concrete predicate URI could be resolved live** (`eol.org/schema/terms/planthabit` → HTTP 500;
`eol.org/terms` → 404) — **unconfirmed**.
**Access:** bulk `https://editors.eol.org/other_files/SDR/traits_all.zip` (564.9 MB, `traits.csv`),
**CC BY 4.0**, attribution to original sources required; REST API and Neo4j Cypher also offered.
⚠️ eol.org sits behind a Cloudflare JS interstitial (WebFetch → 403; a real browser passes).
Hosted by Smithsonian NMNH. **Coverage of NA natives is the best of any source** because USDA PLANTS is
its backbone; introduced ornamentals (Ginkgo, Zelkova, *Pyrus calleryana*) are **unverified**.

**⛔ GBIF is not a trait source.** Verbatim from `techdocs.gbif.org/en/data-publishing/dataset-classes`,
the four and only supported classes are Metadata-only · Checklist · Occurrence · Sampling event.
There is no trait class. Traits can ride inside a checklist as extra columns but are neither indexed nor
searchable. (EOL ingests GBIF only as `number of records in gbif`.)

**⛔ Wikidata is unusable.** `P12616` "leaf morphology" exists (datatype Item, alias *"leaf shape"*,
maintained by WikiProject Plants) — and a SPARQL count `SELECT (COUNT(*)) WHERE {?s wdt:P12616 ?o}`
returns **52 statements, total, across all of Wikidata.** There is **no plant-habit / growth-form
property at all** (`wbsearchentities` for "plant habit" returns an empty array). DBpedia **unconfirmed**,
but derives from taxonomy-only plant infoboxes.

**Quick verdicts on the rest:**
- **BIEN** — R package `BIEN` on CRAN; search-derived figures of 54 traits / >25M records with
  `whole plant growth form` (330,047) the only categorical morphology field. ⚠️ **Licence not stated on
  any page fetched — unconfirmed.**
- **LEDA Traitbase** — 26 traits, ~3,000 species, **Northwest European flora**, herbaceous life-history.
  Project page 404s. ⚠️ Wrong region, wrong traits, possibly defunct.
- **Kew Seed Information Database** — live at `ser-sid.org` (SER/INSR with RBG Kew), >50,000 taxa,
  verbatim: *"All data contained in SID are publicly available under the terms of the Creative Commons
  CC BY 2.0."* **Seed only — irrelevant to bark/leaf/habit.**
- **GlobalTreeSearch / BGCI** — names and country distributions only, ~60,000 tree species, CSV,
  current file 1.10 (2026-05-29), DOI `10.13140/RG.2.2.16046.27208`. ⛔ **CC BY-NC-ND 4.0 — non-commercial
  AND no derivatives.** Useful as an "is it a tree?" gate; the licence is a blocker for a commercial kit.
- **World Flora Online** — ⚠️ TLS cert validation fails from here, so all claims are search-derived and
  **unconfirmed**: CC0 taxonomic backbone, Darwin Core Archive per family, Zenodo snapshots.
  **A name-resolution service, not a trait source.**

### 1.17 efloras / Flora of North America — **prose, definitively**

Fetched the live FNA treatment for *Quercus alba* (Vol. 3, `taxon_id=233501007`). One unbroken
paragraph of Latinate prose, verbatim: *"Trees , deciduous, to 25 m. Bark light gray, scaly. Twigs
green or reddish, becoming gray, 2-3(-4) mm diam., initially pubescent, soon glabrous."*
⭐ There **is** a conventional ordering — habit → Bark → Twigs → Buds → Leaves (petiole, blade, base,
margins, sinuses, veins, apex, surfaces) → fruit → cotyledons → chromosome count — a regularity you
could parse, but **it is not markup**: no tables, no field labels. Ranges are embedded with
parenthetical extremes: `(79-)120-180(-230) × (40-)70-110(-165) mm`.
⚠️ efloras.org has a **broken TLS chain** (WebFetch fails; a browser works), and **coverage is partial** —
Acer is FNA Vol. 12 and returned *"Can not find this taxon in database"*, so **sugar maple is simply
absent**. Licence **unconfirmed**.
⭐ **The useful connection: this is the corpus FLOPO was text-mined from. FLOPO is what you get when
someone has already done the NLP pass over prose like this.**

<!-- PENDING: forestry/arboricultural vocabularies (FIA, ISA/TRAQ, i-Tree, municipal inventories) -->
