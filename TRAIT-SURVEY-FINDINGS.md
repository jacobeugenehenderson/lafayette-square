# TRAIT SURVEY — what the world actually records about trees

**Answers `BRIEF-tree-trait-survey.md`. Research output only — no schema, no collection, no code.**
Every field list below was observed on a page or API response that was actually fetched, and the URL
or endpoint is given. Anything not directly observed is marked **unconfirmed** and left at that.

> ⛔ This is a survey of *sources*, not a proposal. §2 is the three-column mapping the brief asked
> for. §3 recommends one or two sources to build on; the schema decision is Jacob's.

---

## 0. HEADLINE

- **13 sources carry genuine field-per-trait data with fixed term lists.** Six are unauthenticated
  APIs or open bulk files that can be walked today with no key and no scraping.
- **SURPLUS is by far the biggest column** — roughly **150 coded traits** across these sources that
  we have no axis for; ~55 of them are directly renderable.
- **Only 5 clean GAPs**: the four `bark.*` scalar detail knobs (`groove_depth`, `plate_size`,
  `scale_frequency`, `exfoliation_density`) and `leaf.face`. Bark is universally recorded as a
  **pattern term**, never as a magnitude. Those are authoring knobs, not research targets.
- ⭐⭐ **The brief's instruction to look outside botany paid for itself twice.** `chassis.density` and
  `chassis.lean` were both drafted as GAPs from the botanical sources — and both are formal fields in
  the **ISA tree-risk standard**: `Density: Sparse · Average · Dense` (two of our three words verbatim)
  and `Lean ____°` with a `Corrected` flag (our `correct`/`morph` dual, exactly).
- **Recommended: NC State Plant Toolbox (vocabulary) + SelecTree (coverage and cultivars)**, with
  **USDA PLANTS** taken for three specific public-domain fields. Measured: **89/89** distinct species
  names in the LS park census return at least one SelecTree record.
- ⚠️ **Two of the three recommended sources have unresolved reuse terms.** That is an email, not a
  scraping decision.

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

---

### 1.18 ⭐⭐ FORESTRY & ARBORICULTURAL VOCABULARIES — **the brief was right; this section changed two verdicts**

The brief's steer that crown density is a formal forestry metric and that lean lives in tree-risk
standards is **confirmed**. Both were about to be written down as GAPs and both are ALIGNED.

#### 1.18a USFS FIA — National Core Field Guide v9.5 (Sept 2025) + FIADB v9.4 (Aug 2025)
`https://research.fs.usda.gov/sites/default/files/2026-04/v9-5_sep2025_fg_nfi_natl.pdf` ·
`https://research.fs.usda.gov/sites/default/files/2025-08/wo-v9-4_Aug2025_UG_FIADB_database_description_NFI.pdf`
Access: **FIA DataMart**, `https://apps.fs.usda.gov/fia/datamart/datamart.html` — per-state CSV and
SQLite, no login, US federal work (explicit licence text **unconfirmed**).

**Crown variables — the ones that matter, verbatim with their code lists:**

| FIADB field | guide § | vocabulary |
|---|---|---|
| ⭐ **`CDENCD` Crown density** | P3 | **5-percent classes**: `00`=0% · `05`=1–5% · `10`=6–10% … `95`=91–95% · `99`=96–100% |
| ⭐ **`TRANSCD` Foliage transparency** | P3 | same 5-percent class scheme |
| **`CDIEBKCD` Crown dieback** | 5.21 | same 5-percent class scheme |
| ⭐ **`CCLCD` Crown class** | 5.18 | `1` Open grown · `2` Dominant · `3` Codominant · `4` Intermediate · `5` Overtopped |
| ⭐ **`UNCRCD` Uncompacted live crown ratio** | 5.19 | `00`–`99` percent |
| **`CR` Compacted crown ratio** | 5.20 | `00`–`99` percent |
| ⭐ **`CLIGHTCD` Crown light exposure** | — | `0` no direct sunlight · `1` full light from top or 1 side · `2` top + 1 side · `3` top + 2 sides · `4` top + 3 sides · `5` top + 4 sides |
| `CPOSCD` Crown position | P3 | `1` Superstory · `2` Overstory · `3` Understory · `4` Open canopy |
| `CVIGORCD` Crown vigor (saplings) | — | `1` UNCRCD ≥35, <5% dieback, ≥80% normal foliage · `2` neither · `3` 1–20% normal foliage |
| `DECAYCD` Decay class | 5.25 | 1–5, defined by a five-column table (Limbs/branches · Top · % Bark Remaining · Sapwood · Heartwood) |
| `TREECLCD` Tree class | — | `2` Growing stock · `3` Rough cull · `4` Rotten cull |
| `DAMLOC1` Damage location | 5.22 | `0` No damage · `1` Roots (exposed) and stump · `2` Roots, stump, lower bole · `3` Lower bole · `4` Lower and upper bole · `5` Upper bole · `6` Crownstem · `7` Branches · `8` Buds and shoots · `9` Foliage |
| `DAMTYP1` Damage type | 5.22 | `01` Canker/gall · `02` Conk/fruiting body/advanced decay · `03` Open wound · `04` Resinosis/gumosis · `05` Crack or seam · `11` Broken bole · `12` Broom on root/bole · `13` Broken/dead root · `20` Vines in the crown · `21` Loss of apical dominance, dead terminal · `22` Broken or dead branches · `23` Excessive branching/brooms · `24` Damaged shoots/buds/foliage · `25` Discoloration of foliage · `31` Other |
| `MIST_CL_CD` Dwarf mistletoe | 5.28 | Hawksworth `0`–`6` |
| `DAMAGE_AGENT_CD1/2/3` | 5.22 | `0` · `10000` General insects · `11000` Bark beetles · `12000` Defoliators · `14000` Sucking insects · `15000` Boring insects · `19000` General diseases · `21000` Root/butt diseases · `22000` Cankers · `22500` Stem decays · `23000` Parasitic/Epiphytic · `24000` Decline complexes/Dieback · `25000` Foliage diseases · `26000` Stem rusts · `27000` Broom rusts · `30000` Fire · `41000` Wild animals · `42000` Domestic animals · `50000` Abiotic · `60000` Competition · `70000` Human activities · `71000` Harvest · `90000` Other · `99000` Unknown |

⛔ **There is NO `LEAN` field in FIA.** Lean appears only as a threshold criterion — a standing dead
tree must *"lean less than 45 degrees from vertical"* (`STANDING_DEAD_CD`). **Confirmed by grep:
"transparency" returns 0 hits in the core guide** — CROWN DENSITY / FOLIAGE TRANSPARENCY / CROWN LIGHT
EXPOSURE / CROWN POSITION / CROWN VIGOR are **Phase 3** variables, present in FIADB but collected under
a separate P3 protocol whose current home is **unconfirmed**.

**`REF_SPECIES` (Ch. 11.5) — every field named in the brief exists**, verbatim in order:
`SPCD · COMMON_NAME · SHARED_COMMON_NAME_IND · GENUS · SPECIES · VARIETY · SUBSPECIES ·
SCIENTIFIC_NAME · SPECIES_SYMBOL · E_/W_/C_/P_SPGRPCD · MAJOR_SPGRPCD · STOCKING_SPGRPCD ·
FOREST_TYPE_SPGRPCD · JENKINS_SPGRPCD · JENKINS_SAPLING_ADJUSTMENT · SITETREE · SFTWD_HRDWD ·
WOODLAND · WOOD_SPGR_GREENVOL_DRYWT (+_CIT) · BARK_SPGR_GREENVOL_DRYWT (+_CIT) · MC_PCT_GREEN_WOOD
(+_CIT) · MC_PCT_GREEN_BARK (+_CIT) · BARK_VOL_PCT (+_CIT) · CWD_DECAY_RATIO1..5 · DWM_CARBON_RATIO ·
CARBON_RATIO_LIVE · DRYWT_TO_GREENWT_CONVERSION`
⭐ **`BARK_VOL_PCT` — bark volume as a percent of the bole — is a per-species number, and it is the
only quantitative bark trait found anywhere in this survey.**
`MAJOR_SPGRPCD` = `1` Pines · `2` Other softwoods · `3` Soft hardwoods · `4` Hard hardwoods.
`JENKINS_SPGRPCD` = `1` Cedar/larch · `2` Douglas-fir · `3` True fir/hemlock · `4` Pine · `5` Spruce ·
`6` Aspen/alder/cottonwood-willow · `7` Soft maple/birch · `8` Mixed hardwood · `9` Hard maple/oak/
hickory/beech · `10` Juniper/oak/mesquite. ⚠️ `SFTWD_HRDWD`'s letter domain is described but **not
enumerated in the code table — unconfirmed**.

#### 1.18b ⭐⭐⭐ Urban FIA Field Manual v9.5 (PNW 2026) — **the kit's own vocabulary, in a federal manual**
`https://research.fs.usda.gov/sites/default/files/2026-03/pnw-2026_v9-5_pnw_urban_fia_field_manual.pdf`

- ⭐⭐ **`STREET TREE` (7.6.0.11)** is a defined field with a **verbatim geometric definition**:
  *"a MAINTAINED AREA TREE, natural or planted, that is located within 8 ft. of the edge of a
  maintained surfaced road (as measured from the pith of the tree to the edge of the flat surface of
  the road). Trees located in the space between the edge of the road and the sidewalk, or within a
  median strip between roads regardless of distance from the road are also defined as STREET TREES."*
  ⭐ **That is a rule the kit could evaluate directly against its own section geometry** — and it
  explicitly names the median case.
- **`CROWN LIGHT EXPOSURE` (7.4.2.1)** — crown in four vertical quarters; a quarter counts only if its
  uncompacted live crown ratio ≥35%. `0`–`5`. **For lean >45° do not count quarters facing the ground.**
- ⭐ **`URBAN SPECIFIC DAMAGE VARIABLE 1–7` (7.5.1.1–7)** — the arboricultural damage vocabulary:
  `0` None · `1` Stem Girdling · `2` Bark Inclusion · `3` Severe Topping or Poor Pruning ·
  `4` Excessive Mulch · `5` Conflict with Roots · `6` Conflict with Tree Crown · `7` Improper Planting.
- **`URBAN NONFOREST LAND USE` (4.7.0.3)** — 30 codes: `100` Agricultural · `110` Cropland · `120`
  Pasture · `130` Idle farmland · `140` Orchard/Nursery · `150` Christmas tree plantation · `160`
  Maintained wildlife opening · `170` Windbreak/Shelterbelt · `200` Rangeland · `300` Developed ·
  `310` Cultural · `311` Residential · `312` Multi-family residential · `313` Institutional ·
  `314` Commercial/Industrial · `316` Cemetery · **`320` Rights-of-way** · `321` Transportation ·
  `322` Utility · `330` Recreation · `331` Park · `332` Golf courses · `340` Mining and wasteland ·
  `400` Other · `410` Nonvegetated · `420` Wetland · `430` Beach · `450` Nonforest-Chaparral · `900`/`910`.
- **`i-TREE LAND USE` (4.8.0.1)** — `10` Agriculture · `20` Residential · `21` Multi-family · `22`
  Institutional · `23` Commercial/Industrial · `24` Unused · `25` Cemetery · `30` Transportation ·
  `31` Utility · `40` Park · `41` Golf Course · `50` Water/wetland · `60` Other. ⭐ **Each code carries
  an explicit list of which URBAN NONFOREST LAND USE codes it is valid with — a published crosswalk
  between two land-use vocabularies**, which is exactly the artefact the kit's own land-use work needs.
- ⚠️ Urban FIA tables are **not** in the NFI FIADB description; the urban database schema is **unconfirmed**.

#### 1.18c ⭐⭐⭐ ISA Basic Tree Risk Assessment Form (TRAQ) — **`chassis.density` and `chassis.lean`, verbatim**
`https://www.isa-arbor.com/Portals/0/Assets/PDF/Certification-Applications/ISA-Basic-Tree-Risk-Assessment-Form-Instructions.pdf`
© 2025 ISA. Verbatim: *"This Basic Tree Risk Assessment Form supersedes any previous version used in
the TRAQ class."* Licence: all rights reserved, but *"Tree risk assessors are welcome to use this Form
in their practice… this Form may be used as presented or adapted for specific requirements."*

**§4 Crown — the block that matters:**
- ⭐⭐⭐ **`Density`: `Sparse` · `Average` · `Dense`** — **three terms, and two of the three are ours
  verbatim.** Our `chassis.density` is `sparse · medium · dense`. `Average` → `medium` is a one-row alias.
- **`Tree Health`: `Dead` · `Poor` · `Fair` · `Good`**
- **`Foliage`: `None (dead)` · `None (seasonal)` · `Normal ___%` · `Chlorotic ___%` · `Necrotic ___%`**
- **`Relative size crown/trunk`: `Small` · `Medium` · `Large`**
- flags: `Unbalanced` · `Crown dieback` · `Excessive end weight` · `Vines/mistletoe/moss`
- **`Wind Exposure`: `Protected` · `Partial` · `Full` · `Wind funneling`**
- ⭐ **`Pruning`: `Topped` · `Thinned` · `Lion tailed` · `Raised` · `Other`** — the *human* history
  written into a crown's shape, as a closed vocabulary
- **`Live crown ratio (LCR)` ___%** — *"LCR = (crown height/tree height) × 100"*

**§6 Trunk — the lean field:**
- ⭐⭐⭐ **`Lean ____°`** — an angle from vertical, *"visually estimated or measured with a digital level
  such as found in cell phone apps"* — **plus a binary `Corrected` flag.**
  ⭐⭐ **That is our `chassis.lean` dual, in the world's own form.** Their `Corrected` checkbox and our
  `mode: correct | morph` are the same distinction: has the tree already compensated for its lean, or
  is it still leaning? ⚠️ **There is no lean DIRECTION field on the Basic form** — our `azimuthDeg` has
  no counterpart; direction is captured implicitly via the Target Zone. **Lean direction as a coded
  TRAQ field is unconfirmed.**
- also: `Codominant stems #___` · `Included bark` · `Decay` · `Conks/mushrooms` · `Cavity opening (% circ.)` ·
  `Poor taper` · `Dead/missing bark` · `Cracks` · `Ooze` · `Lightning damage` · `Response growth`

**§2 Target:** `Target Zone` = `Drip line` · `1 × Ht` · `1.5 × Ht` · `>1.5 × Ht`;
`Occupancy Rate` = `Rare` · `Occasional` · `Frequent` · `Constant`.
**§7 Roots/soil:** `Soil:` `Often saturated` · `Limited volume` · **`Pavement/compaction`**.
**§8–9 risk terms:** `Likelihood of Failure` = Improbable · Possible · Probable · Imminent ·
`Likelihood of Impact` = Very low · Low · Medium · High · `Likelihood of Failure & Impact` = Unlikely ·
Somewhat likely · Likely · Very likely · `Consequences` = Negligible · Minor · Significant · Severe ·
`Risk Rating` = Low · Moderate · High · Extreme · `Tree Part` = Branches · Trunk · Root Collar · Roots · Soil.
(Both 4×4 matrices were read off the form.)

**ANSI A300 (Part 9)-2011** (verified text, PG&E-hosted copy) defines the *terms and levels*, not the
matrices: `crown area`, **`crown density`**, **`crown symmetry`**, `live crown ratio`, `included bark`,
`reaction wood`, `buttress roots`, `target`, `tree risk`. §93.4 Levels 1/2/3, with Level 3 listing
**"Lean assessment"** among its methods. ⚠️ Current edition is **2017** (sold by TCIA); whether any term
list changed is **unconfirmed**.

#### 1.18d i-Tree — ⛔ the downloadable species list is four columns; the values are not published
- `https://www.itreetools.org/documents/864/i-Tree_Eco_species_list_1.17.2023.csv` — **10,556 rows**,
  header verbatim: `"ID","Code","Scientific Name","Common Name"`. **That is all of it.** No leaf type,
  no LAI, no leaf-on/off, no growth rate, no longevity, no tolerances, no BVOC.
- The **per-species schema does exist** — Eco v6 *Guide to International Projects*, "Table 1—Species
  fields for i-Tree Database": `Genus Name · Species Name · Family · Order · Class · Common Name ·
  Growth Form · Percent Leaf Type · Leaf Type` (all required) + `Growth Rate` (in/yr) · `Longevity`
  (years) · `Height at Maturity` (ft) · `Native Continent` (optional). ⚠️ **Their dropdown values are
  unconfirmed** (the submission app is a JS shell). ⛔ **No drought/salt/shade tolerance field exists.**
- ⚠️ **Leaf On / Leaf Off Day of Year are LOCATION fields, not species fields** — Table 2, verbatim:
  *"Day of the year (1-365) in spring when frost ends locally"*. **A correction to a natural assumption.**
- ⭐⭐ **i-Tree Species Selector Methods** (Nowak, Feb 2008,
  `https://www.itreetools.org/species/resources/SpeciesSelectorMethod.pdf`) — 1,585 species, and it
  carries **the most render-shaped ordinal set in the whole survey**: six particle-capture scores,
  each **0–2**:
  - **Crown density**: Open `0` / medium `1` / dense `2`
  - **Crown texture**: Coarse `0` / Medium `1` / Fine `2`
  - **Leaf complexity**: Simple `0` / pinnate·palmate compound·trifoliate `1` / bi-·tri-pinnate `2`
  - **Leaf size**: >4″ `0` / 2–4″ `1` / <2″ `2`
  - **Leaf surface roughness**: dull·smooth·glossy·glabrous `0` / ciliate·silky·velvety·pubescent·
    glaucous·waxy `1` / rough·resinous·tomentose·scabrous·scaly·villous `2`
  - **Leaf margins**: entire·spiny·sinuate·undulate `0` / crenate·dentate·incised·lobed·serrate `1` /
    ciliate·serrulate·double serrate·filamentous `2`
  plus `Leaf persistence` = deciduous / semi-deciduous / evergreen · median height and crown width at
  maturity (**crown height = 0.78 × median height**, height:width clamped 0.5–2.0, LAI clamped 1–15) ·
  a 7-value water-use class (`H`1.50 · `MH`1.25 · `M`1.00 · `ML`0.75 · `L`0.50 · `LVL`0.35 · `VL`0.20) ·
  isoprene and monoterpene base emission factors · pollutant sensitivity `S`/`I`/`S/I` ·
  **pollen allergenicity 1–10** (Ogren 2000).
  ⚠️ **Appendix A publishes only scientific + common name. The attribute VALUES are not published.**
  ⚠️ i-Tree's own docs disagree on species count (6,500+ vs "over 7,000" vs 10,556 vs 1,585).
  **Cause not established.**
- **Eco Field Guide v6.0** field vocabulary (for completeness): Crown Light Exposure `0`–`5` ·
  `Percent Crown Missing` at 5%-interval midpoints (3, 8, 13, 18…) · **22 crown-health dieback classes** ·
  Maintenance Recommended (6) · Maintenance Task (7) · **Sidewalk Conflict** `0–¾″` · `¾–1½″` · `1½″` ·
  **Utility Conflict** `No lines` · `Present and no potential conflict` · `Present and conflicting` ·
  Land use (14 single-letter codes) · Ground cover (11 classes).
  Licence: *"i-Tree software is in the public domain"*, use governed by a EULA; no CC licence.

#### 1.18e ⭐ Urban Tree Database (McPherson et al., **RDS-2016-0005**) — **open, and it has crown geometry**
`https://www.fs.usda.gov/rds/archive/catalog/RDS-2016-0005` · DOI `10.2737/RDS-2016-0005`
**Licence, verbatim:** *"These data were collected using funding from the U.S. Government and can be
used without additional permissions or fees."* Access constraints: **"None"**. Citation requested.
**Coverage:** 17 cities, 13 states, 1998–2012. `TS3_Raw_tree_data.csv` = **14,487 measured trees**,
175 distinct scientific names; `TS6` = 2,402 growth-coefficient rows.

⭐ **`TS3` carries per-tree crown geometry**, header verbatim:
`DbaseID,Region,City,Source,TreeID,Zone,Park/Street,SpCode,ScientificName,CommonName,TreeType,address,
street,side,cell,OnStreet,FromStreet,ToStreet,Age,DBH (cm),TreeHt (m),CrnBase,CrnHt (m),CdiaPar (m),
CDiaPerp (m),AvgCdia (m),Leaf (m2),Setback,TreeOr,CarShade,LandUse,Shape,WireConf,dbh1…dbh8`

⭐⭐ **`Shape` is a coded CROWN FORM field**: `1` cylinder · `2` ellipsoid/spherical · `3` paraboloid ·
`4` inverted paraboloid · `−1` not collected. ⚠️ **A value `5` occurs 43 times and is undefined in the
metadata — unconfirmed.**
⭐ **`Tree Type`** is a 3-character habit+size code: `BD` broadleaf deciduous · `BE` broadleaf evergreen ·
`CE` coniferous evergreen · `PE` palm evergreen, third char `S` small <8 m · `M` medium 8–15 m ·
`L` large >15 m. Observed: BDL BDM BDS BEL BEM BES CEL CEM CES PEL PEM PES.
`WireConf`: `0` no lines · `1` present, no conflict · `2` present, conflicting · `3` potential conflict.
`Setback`: `1` 0–8 m · `2` 8.1–12 m · `3` 12.1–18 m · `4` >18 m.
`LandUse`: `1` single-family residential · `2` multi-family · `3` industrial/institutional/commercial ·
`4` park/vacant · `5` small commercial · `6` transportation corridor.
`TS6` predicts, keyed on dbh / cdia / age: **`crown dia` · `crown ht` · `leaf area` · `tree ht` · `age`
· `dbh`** via 12 named equation forms (`TS4`). ⚠️ `TS6` writes `CenFla` where `TS1` writes `Cen Fla` —
a real join hazard. ⚠️ `side`'s documented domain (F/M/S/P) **does not match the data**.
⛔ Not present: BVOC, tolerances, longevity, growth-rate class, leaf-on/off, pollution removal.

#### 1.18f Municipal street-tree inventories — five verified schemas

| city | rows | licence | the fields that matter |
|---|---|---|---|
| **NYC** 2015 TreesCount (`uvpi-gqnh`) | **683,788** | ⚠️ `license` is **null** in the view metadata | `status` {Alive 652,173 · Stump 17,654 · Dead 13,961} · `health` {Good · Fair · Poor · blank-when-dead} · **`curb_loc` {OnCurb · OffsetFromCurb}** · `steward` {None · 1or2 · 3or4 · 4orMore} · `guards` {None · Helpful · Harmful · Unsure} · **`sidewalk` {Damage · NoDamage}** · `user_type` · 9 problem flags + a concatenated `problems` string {None, Stones, BranchLights, RootOther, TrunkOther, BranchOther, WiresRope, MetalGrates, TrunkLights} · `tree_dbh` (circumference ÷ 3.14159) |
| **San Francisco** (`tkzw-k3nq`) | 198,436 | ✅ **ODC PDDL** | ⭐ **`qSiteInfo`** = a compound `"<site> : <container>"` string, 34 distinct — sites {Sidewalk: Curb side · Sidewalk: Property side · Median · Front Yard · Side Yard · Back Yard · Unaccepted Street · Hanging basket}, containers {Cutout · Yard · Pot · Hanging Pot · Silva Cell}; dominant = `Sidewalk: Curb side : Cutout` 156,191 · `qLegalStatus` (13) · `PlantType` · `qCaretaker` (27) · `PlotSize` |
| **Washington DC** (UFA, ArcGIS layer 23) | 221,979 | ⚠️ `copyrightText` empty — **unconfirmed** | ⭐⭐ **the only inventory with LiDAR crown geometry**: `MBG_WIDTH` · `MBG_LENGTH` · **`MBG_ORIENTATION`** · `CROWN_AREA` · `PERIM` · `MAX_CROWN_HEIGHT` · `MIN_CROWN_BASE` · `DTM_MEAN`. Plus `TBOX_L`/`TBOX_W` · `CONDITION` {Excellent · Good · Fair · Poor · Dead} · `TBOX_STAT` (8) · `WIRES` {None · Low Voltage · High Voltage · Both} · `CURB`/`SIDEWALK` {Permanent · Temporary · None · Flexipave} · `ELEVATION` {Level · Raised · Raised with Structure · Below Grade · Grate · Unknown} |
| **Cambridge MA** (`82zb-7qc9` / ArcGIS) | 43,164 | ✅ **ODC PDDL v1.0** | ⭐ the only one with **`TreeWellLength`/`TreeWellWidth`/`TreeWellDepth`** + `TreeWellCover` {Tree Grate · Flexi-Pave} · `StructuralSoil` · `Biochar_Added` · `SolarRating` · `ExposedRootFlare` · `ADACompliant` · **`TreeGrateActionReq`** {1 Priority Removal · 2 Priority Maintenance · 3 Ok Inspect Annually, <2″ clearance · 4 Good No Action} · `SiteType` (11) · `Location` (12, incl. `Street Tree` 21,908 · `Planting Strip` · `Back of Sidewalk`) · `RemovalReason` (10) |
| **Melbourne** (Urban Forest) | 82,064 | ✅ **CC BY 4.0** | thinnest schema. ⭐ `located_in` {**Park** 48,262 · **Street** 33,802} · `age_description` {Mature · Semi-mature · Unestablished} · `useful_life_expectency` {<10 · 11–20 · 21–30 · 31–40 · >41 years} |

**OpenTreeMap (`otm-core`)** — `https://raw.githubusercontent.com/OpenTreeMap/otm-core/master/opentreemap/treemap/models.py`.
⭐⭐ **The key structural fact: OTM separates `Plot` (a planting site) from `Tree`**, with the geometry on
the plot and the plot able to exist with no tree — verbatim `_terminology = {'singular': _('Planting
Site')}`. `Plot` has only `width`, `length`, `owner_orig_id`. `Tree` has `species`, `diameter`,
`height`, `canopy_height`, `date_planted`, `date_removed` — **no condition, health or sidewalk field in
core; all of that is a per-instance UDF.** `Species` carries `otm_code`, `is_native`,
`flowering_period`, `fruit_or_nut_period`, `fall_conspicuous`, `flower_conspicuous`, `palatable_human`,
`has_wildlife_value`, `max_diameter` (default 200), `max_height` (default 800). Default UDF
`Stewardship` choices — Plot: `Enlarged · Changed to Include a Guard · Changed to Remove a Guard ·
Filled with Herbaceous Plantings`; Tree: `Watered · Pruned · Mulched, Had Compost Added, or Soil
Amended · Cleared of Trash or Debris`. ⚠️ LICENSE file **not fetched — unconfirmed**.

⛔ **TreePlotter (PlanIT Geo) has NO published schema.** The API tutorial states verbatim that *"The API
responses will contain the back end names of fields"* — **field names are per-customer.** Only the
entity model is public (Trees · Inspections · Work Records · Work Orders · Service Requests).
**Any "TreePlotter standard field list" would be invention.**

#### 1.18g ⭐ Eight cross-cutting observations from the inventory schemas

These are about *how the world models a street tree*, and several bear directly on the kit:

1. ⭐⭐ **Two different objects are being inventoried and the schemas disagree about which.** NYC is
   per tree point (stumps and dead trees are rows); SF, DC and Cambridge are per **site**
   (`Permitted Site` · `TBOX_STAT: Open/Proposed` · `SiteType: Planting Site/Retired`); OTM makes the
   split explicit and structural. **A schema that cannot represent an empty site cannot represent half
   of what these cities record.**
2. **Site geometry is carried under five different names**: NYC has no bed dimensions but a **stated
   point-placement convention** — *"a tree identified as being on the curb will have the point placed
   2.5 feet from the blockface line; a tree identified as being offset will have the point placed 12
   feet from the curb line"* — and `block_id` links to a **blockface**, *"a slightly simplified curb
   line … for one side of a street between two intersections."* ⭐⭐ **That is the kit's own side-chain
   concept, in a municipal data dictionary.** SF `PlotSize` + container token; DC `TBOX_L`/`TBOX_W`;
   Cambridge `TreeWell{Length,Width,Depth}`; OTM `Plot.width`/`Plot.length`; UTD `Setback` bands.
3. ⚠️⚠️ **Sidewalk/curb relationship is modelled three incompatible ways under the same words.**
   NYC `sidewalk` = *damage state*; DC `SIDEWALK` = *material/permanence*; Cambridge = ADA compliance
   + a graded grate clearance; i-Tree = a 3-band *lift measurement*. ⛔ **Never join across cities on
   field name.**
4. **Overhead-wire conflict is the one near-consensus field**, in four flavours; UTD's `WireConf`
   codes and i-Tree's Utility Conflict labels are the *same* vocabulary, one coded and one spelled.
5. **Health vocabularies are small and nearly aligned** (`Good/Fair/Poor` ± `Dead`/`Excellent`), but
   ⛔ **FIA uses 5% numeric classes and never a word grade — the two traditions do not interconvert.**
   OTM core, SF and Melbourne have no health field at all.
6. ⭐ **Crown light exposure is the most portable trait in the entire survey** — `0`–`5`, identical
   across FIA `CLIGHTCD`, Urban FIA CLE and i-Tree Eco CLE.
7. ⭐⭐ **The trait a renderer actually wants — crown footprint — exists in exactly two places:** DC's
   LiDAR bounding box, and the UTD's measured `CdiaPar`/`CDiaPerp`/`AvgCdia`/`CrnHt`/`CrnBase` plus
   TS6's dbh-keyed equations. **Everywhere else it must be modelled from DBH.**
8. ⚠️ **Free text where a vocabulary was intended recurs everywhere** — Cambridge `SiteRetiredReason`
   (622 distinct values), `WateringResponsibility` (72), DC `VICINITY` (≥2,000). And DC has **editor
   usernames leaking into six coded columns** (`jbuff`, `jconlon`, …), a column-misalignment class in
   the source editing workflow. ⭐ A cautionary note for our own intake: *a controlled vocabulary that
   is not enforced becomes free text within a few years.*

---

## 2. THE MAPPING — ALIGNED · GAP · ⭐ SURPLUS

### 2.1 ALIGNED — our axis, and the source field that fills it

| our axis | source field(s) | their vocabulary | alias work needed |
|---|---|---|---|
| **`chassis.habit`** (vase · columnar · oval · spreading · weeping · multi-stem · pyramidal · rounded · irregular) | **SelecTree `tree_shape`** (12) · **NC State `Habit/Form`** (24) · **USDA `Shape and Orientation`** (11) · Morton `tp_plant_shape` (17) · RHS `Habits` (12) · ⭐⭐ **UTD `TS3.Shape`**: `1` cylinder · `2` ellipsoid/spherical · `3` paraboloid · `4` inverted paraboloid *(⚠️ an undefined `5` occurs 43×)* · ⭐ **UTD `Tree Type`** `BD`/`BE`/`CE`/`PE` × `S`/`M`/`L` · **Arnold `HABIT`** (6: Geophyte · Herbaceous · Intermediate (shrub/tree) · Shrub · Tree · Vine) | see §1 | ⭐ **Nearly free.** All nine of ours appear verbatim or under an alias `vocabulary.mjs` already carries: `Conical`/`Pyramid`→`pyramidal` (alias `conic`/`conical` present) · `Multi-stemmed`/`Multi-trunked`/`Clumping`→`multi-stem` (aliases present) · `Erect`/`Ascending`→`columnar` (`erect`,`upright` present) · `Broad`/`Horizontal`→`spreading` (both present) · `Cascading`/`Pendulous weeping`→`weeping`. **Missing aliases to add:** `arching`, `mounding`, `open`(→irregular, already present), `dense`, `narrow`, `thicket-forming`, `sprawling`, `prostrate`, `decumbent`, `semi-erect`, `creeping`, `palm`, `sword palm`. ⚠️ **Their lists are richer than ours (24 vs 9).** Aliasing *into* nine is lossy but deterministic — which is exactly what the no-confidence-score rule wants. |
| **`chassis.size`** ([2,35] m) | **SelecTree `height_high`/`width_high`** (ft, maxima) · **USDA `Height, Mature (feet)`** + ⭐ `Height at 20 Years, Maximum (feet)` · **NC State `Dimensions`** (a min–max range) · **i-Tree `Height at Maturity`** + Species Selector's median height/crown width (**crown height = 0.78 × median height**, h:w clamped 0.5–2.0) · ⭐⭐ **UTD `TS3`** measured `TreeHt`/`CrnBase`/`CrnHt`/`CdiaPar`/`CDiaPerp`/`AvgCdia`/`Leaf (m2)` for **14,487 real street trees**, plus `TS6` dbh-keyed equations predicting `crown dia`·`crown ht`·`leaf area`·`tree ht` · ⭐⭐ **DC UFA** LiDAR `MBG_WIDTH`/`MBG_LENGTH`/`MBG_ORIENTATION`/`CROWN_AREA`/`MAX_CROWN_HEIGHT`/`MIN_CROWN_BASE` for 221,979 trees · **Arnold** measured `DBH`/`Height`/`Spread` · ⭐ **UTD `Tree Type`** 3-char code with an explicit size class: `S` <8 m · `M` 8–15 m · `L` >15 m | numeric | ⭐⭐ **This is the best-evidenced axis in the survey.** Not one authority but *measured populations* — and two sources give **crown width and crown base separately from total height**, which our single height scalar plus `canopyRadiusM` only half-expresses. ⭐ **UTD's `TS6` is a growth curve, not a number** — it predicts crown dimensions from dbh, i.e. it can render a *young* and an *old* specimen of the same species from one equation. |
| ⭐⭐⭐ **`chassis.density`** (sparse · medium · dense) | ⭐⭐⭐ **ISA/TRAQ Crown `Density`: `Sparse · Average · Dense`** · ⭐⭐ **i-Tree Species Selector `Crown density`: `Open`(0) · `medium`(1) · `dense`(2)** · ⭐⭐ **USDA `Foliage Porosity Summer`/`Winter`**: `Porous · Moderate · Dense` · **FIA `CDENCD`** (5% classes 00–99) · **ANSI A300 Pt.9 defines `crown density` as a term** · NC State `Texture` · EOL relays the USDA pair | closed 3-term (FIA: 20 numeric classes) | ⭐⭐⭐ **The strongest alignment in the survey — and it was about to be called a GAP.** TRAQ's list is *two of our three words verbatim*; `Average`→`medium` and `Open`/`Porous`→`sparse` are two alias rows. ⚠️ **What we would be conflating, and it is worth a ruling:** our axis is *wood* density (branch fill in the silhouette); TRAQ's and i-Tree's is the **crown as seen**, and USDA's is *foliage* porosity. ⭐ **USDA's WINTER porosity is the wood one** — a deciduous tree's winter porosity IS its bare-branch fill — so the clean split is **winter → `chassis.density`, summer → `leaf.occupancy`**. ⚠️ FIA's 5% numeric classes do **not** interconvert with any word grade; do not mix the traditions. |
| **`bark.type`** (smooth · furrowed · plated · scaly · ridged · exfoliating · fibrous · mottled) | ⭐⭐ **SelecTree `bark_texture`** (17, **multi-valued**) · ⭐⭐ **NC State `Surface/Attachment`** (15) · FLOPO bark terms | see §1 | ⭐ **Excellent.** Every one of our 8 has a direct or aliased partner. Already in `TERM_ALIASES`: `fissured`→furrowed, `platy`/`blocky`→plated, `striate`→ridged, `flaking`/`peeling`/`papery`/`shaggy`→exfoliating, `patchy`→mottled. **Missing aliases to add:** `Ridges`→ridged, `Corky`, `Rough`, `Spiny`, `Warty`, `Wrinkled`, `Bumpy`, `Shiny`, `Shredding`, `Spongy`, `Lenticels`. ⚠️⚠️ **Their field is MULTI-VALUED and ours is single-valued** — `Platanus` is `["Exfoliating","Smooth"]`, `Quercus oblongifolia` is `["Furrowed","Ridged","Scaly"]`. Collapsing to one term is a real information loss and needs a stated rule (or a second axis). |
| **`bark.color`** (tint band) | ⭐ **NC State `Bark Color`** (9 closed terms) · SelecTree `bark_color` (⚠️ free compound string) · FLOPO `bark color` + colour value terms | NC State: Black · Dark Brown · Dark Gray · Green · Light Brown · Light Gray · Orange · Red/Burgundy · White | ⭐ **NC State's 9-term list is the only clean bark-colour vocabulary found.** SelecTree's is unusable as-is (`"Dark Gray, Light Gray, Reddish Brown"`, `"Striking, Cream or Light Gray"`). |
| **`leaf.silhouette`** (palmate · lobed · heart · ovate · lanceolate · compound · fan · star · needle · scale) | ⭐⭐ **NC State `Leaf Shape`** (25) + **`Leaf Type`** (5) · **SelecTree `leaflet_shape`** (17) + `leaf_form` (5) · ⭐⭐⭐ **MLA `LAMINAR SHAPE` + `LOBATION` + `BASE SHAPE` + `APEX SHAPE`** · OSU leaf/leaflet characteristics | see §1 | ⭐ Good but **structurally different**: the world separates **compound-ness** (`Leaf Type`/`leaf_form`) from **leaflet outline** (`Leaf Shape`/`leaflet_shape`), and separates **lobation** from **shape** again. Our single 10-term axis mixes all three (`compound` and `palmate` and `lobed` are not the same kind of fact). ⚠️ **This is the axis most in need of a decision** — aliasing 25 shapes into 10 is doable, but `Palmatifid`/`Palmasect`/`Pinnatifid`/`Pinnatisect` collapsing to `lobed` throws away exactly the distinction between a maple and a plane that `vocabulary.mjs`'s own header calls out as unfixable. |
| **`leaf.ways`** (alternate · all-one-direction · opposite · sprays · clusters) | **SelecTree `leaf_arrangement`** (5) · **NC State `Leaf Arrangement`** (5) · ⭐ **MLA #14 `LEAF ATTACHMENT`** (alternate · decussate · opposite · whorled) · OSU leaf attachment | closed | ⭐ **Direct.** `Whorled`→`clusters` (alias present) · `Alternate/Whorled`, `Opposite/Whorled`, `Rosulate`, `Other/more complex`, `decussate` need aliases. ⚠️ **`all-one-direction` and `sprays` are OURS, not botany's** — they describe *card orientation in the renderer*, not attachment. Those two are GAPs inside an otherwise ALIGNED axis. |
| **`leaf.size`** ([0.5, 30] cm) | ⭐⭐⭐ **MLA #17 `LAMINAR SIZE`** (Webb 1955 classes, by **area**: leptophyll <25 mm² · nanophyll 25–225 · microphyll 225–2,025 · notophyll 2,025–4,500 · mesophyll 4,500–18,225 · macrophyll 18,225–164,025 · megaphyll >164,025) · **NC State `Leaf Length`/`Leaf Width`** (4 bands each) · **EOL `leaf area`** (numeric) | closed classes / bands | ⭐ Two mismatches worth naming: the formal class system is by **AREA**, ours is a linear **extent**; and NC State gives **length AND width separately**, which is more useful for a leaf card than a single scalar. |
| **`leaf.color`** (band) | **NC State `Leaf Color`** (14-colour palette) · **SelecTree `foliage_growth_color`** (19, = *new growth*) · **USDA `Foliage Color`** (6) · **RHS `Colour by season` × Foliage** | closed | ⭐ RHS's **season × part colour grid** is the right *shape* for this axis (see SURPLUS). |
| **`leaf.season`** ([0,365] curve) | ⭐⭐⭐ **USA-NPN phenophases** (20 leaf phases + dated observations) · ⭐⭐ **NC State `Deciduous Leaf Fall Color`** (9 closed terms) · **SelecTree `foliage_type`** (Deciduous/Evergreen/Partly Deciduous) + `foliage_fall_color` (bool) · **USDA `Active Growth Period`** (9) + `Fall Conspicuous` (Y/N) + `Leaf Retention` (Y/N) · **USA-NPN `functional_type`** (Deciduous broadleaf · Semi-evergreen broadleaf · Drought deciduous broadleaf · Evergreen conifer · Deciduous conifer …) · Morton `tp_seasons_of_interest` (early/mid/late × 4) | mixed | ⭐⭐ **This axis is well served, from two directions:** NC State gives the *fall colour value* (which SelecTree does not); USA-NPN gives the *timing*. ⚠️ Our axis is a curve; every source gives either a class or an observation set. Deriving a curve is an aggregation, not a lookup. |
| ⭐⭐ **`leaf.occupancy`** ([0.25, 0.95]) | ⭐⭐ **USDA `Foliage Porosity Summer`** (`Porous · Moderate · Dense`) · ⭐⭐ **TRAQ `Foliage`: `Normal ___%` / `Chlorotic ___%` / `Necrotic ___%`** and `Crown dieback` flag · ⭐⭐ **FIA `TRANSCD` foliage transparency** and **`CDIEBKCD` crown dieback**, both in 5% classes · **i-Tree Eco `Percent Crown Missing`** (5%-interval midpoints) and **22 crown-health dieback classes** · NC State `Habit/Form` values `Dense`/`Open` | closed 3-term, or 20 numeric classes | ⭐⭐ **Much better served than expected.** ⭐ **`TRANSCD` is literally "how much light passes through the foliated crown" as a percentage — that is our `[0.25,0.95]` scalar, in the world's units.** Ordinal→scalar for the word grades needs a stated mapping, not interpolation. **See the `chassis.density` note — summer porosity belongs here, winter porosity belongs there.** |
| **`overlay.type`** (flowers · fruit · thorns · seasonal-props · none) | **SelecTree `fruit_type`** (15) + `flower_showiness` (3) + `flower_color` (21) + `fruit_size` (12) · **USDA `Flower Conspicuous`** / `Fruit/Seed Conspicuous` / `Fruit/Seed Persistence` (Y/N) · **NC State `appendage`** (Prickles · Spines · Tendrils · Thorns) + `Problems` → `Spines/Thorns` · `Flower Inflorescence` (11) | closed | ⭐ **All four of our non-`none` values are directly derivable**, and *conspicuousness* is recorded separately from *presence* — which is the distinction an overlay actually needs (a tree has flowers; only a showy one deserves an overlay). |
| ⭐⭐ **`tree.age`** ([0,1] young↔mature) | **USDA `Lifespan`** (Short <100 yr · Moderate 100–250 · Long >250) · **USDA `Height at 20 Years, Maximum`** vs `Height, Mature` · ⭐⭐⭐ **UTD `TS6` growth equations** — `age` is both an independent and a predicted variable, over 12 named equation forms, per species per climate region · **UTD `TS3.Age`** measured per tree (0 = newly planted) · ⭐ **Melbourne `age_description`** {`Mature` · `Semi-mature` · `Unestablished`} and `useful_life_expectency` {`<10` · `11–20` · `21–30` · `31–40` · `>41 years`} · **i-Tree `Longevity`** (years) + `Growth Rate` (in/yr) · **FIA `BHAGE`/`TOTAGE`** · **RHS `Time to ultimate height`** · **NC State `Problems`→`Short-lived`** | mixed | ⭐⭐⭐ **Our axis is a 0–1 dial; the world has an actual growth model.** UTD's `TS6` predicts height, crown diameter, crown height and leaf area *as functions of age or dbh*, fitted per species per climate region — that is a far better basis for an age dial than a knob, and it would age the tree *correctly* rather than by uniform scaling. ⭐ Melbourne's 3-term `age_description` is the cheapest usable ordinal. |

### 2.2 GAP — our axis, and nothing in the world records it

| our axis | verdict |
|---|---|
| ⛔ **`bark.groove_depth`** | **GAP.** No source records furrow depth as a magnitude. FLOPO has `bark grooved` as a *term*; nothing has a scale. |
| ⛔ **`bark.plate_size`** | **GAP for the magnitude** — ⭐ but NOT for the *shape*: **NC State `Bark Plate Shape` (Diamond · Irregular · Oval · Rectangle · Round · Square)** is a real closed vocabulary we have no axis for. See SURPLUS. |
| ⛔ **`bark.scale_frequency`** | **GAP.** `Scaly` exists as a term everywhere; a frequency exists nowhere. |
| ⛔ **`bark.exfoliation_density`** | **GAP.** `Exfoliating`/`Peeling`/`Papery`/`Shredding`/`Shaggy` are all *terms*; none is a magnitude. ⭐ Note that the term list itself is an implicit ordinal — `Papery` (birch) vs `Shredding` (juniper) vs `Exfoliating` (plane) read as different amounts. |
| ⛔ **`leaf.face`** (adaxial/abaxial two-tone) | **GAP as a colour pair.** Nothing surveyed records an underside colour as a field. ⭐ The *concept* is formalised — MLA #56 `CUTICULAR FEATURES` and NC State `Leaf Feel` (Glossy · Velvety · Waxy) and FLOPO `bark pilosity`/`glabrous` all encode surface character — but **no source gives front and back colours.** |
| ⭐⭐ **`chassis.lean`** — **VERDICT CORRECTED: partly ALIGNED, not a GAP** | **The brief was right and I was about to be wrong.** ⭐⭐⭐ **ISA/TRAQ §6 Trunk carries `Lean ____°` — an angle from vertical — plus a binary `Corrected` flag.** Their `Corrected` and our `mode: correct \| morph` are **the same distinction**: has the tree compensated for its lean, or is it still leaning? Our `angleDeg [0,15]` maps to their degree field directly. **ANSI A300 (Part 9) §93.4 lists "Lean assessment" as a Level 3 method**, so the concept is standardised. **Urban FIA** uses lean operationally too (*"for lean >45° do not count quarters facing the ground"*). ⛔ **But: (a) FIA has NO lean field** — only a 45° threshold in `STANDING_DEAD_CD`; (b) **no source records lean at SPECIES level** — it is per-specimen everywhere, which is correct and is what our axis already implies; (c) ⚠️ **`azimuthDeg` has no counterpart** — the TRAQ Basic form has no lean-direction field (direction is implicit in Target Zone). **Lean direction as a coded TRAQ field is unconfirmed.** ⇒ **The magnitude and the correct/morph split are ALIGNED to a real standard; the azimuth is a GAP; the species-level value is an authoring knob.** |
| ⚠️ **`leaf.ways` values `all-one-direction` and `sprays`** | **GAP.** These are renderer-card facts, not botanical attachment. Nothing records them. Authoring knobs. |
| ⚠️ **`bark.color` / `leaf.color` as continuous bands** | **Partial GAP.** The world gives *named colour terms* (9, 14, 16, 19-term palettes); it does not give a tint-band handle. Aliasing a term to a band value is a decision we make once. |

**⇒ The honest count after the forestry pass: 5 clean GAPs — the four `bark.*` scalars and
`leaf.face` — plus `chassis.lean`'s azimuth and two `leaf.ways` values. `chassis.lean` itself moved
OUT of the GAP column.** Every remaining GAP is an art-direction control, not a fact about a species.
That is a useful result: the Arborist's authoring surface and its research surface turn out to be
already cleanly separated, and **nobody needs to go looking for peeling-magnitude data that does not
exist.**

⚠️ **Worth stating plainly, because it nearly went the other way:** `chassis.density` and
`chassis.lean` were both drafted as GAPs from the botanical and horticultural sources alone. **Both
are formal, standardised, closed-vocabulary fields in the arboricultural and forestry literature** —
TRAQ's `Sparse · Average · Dense` is two-thirds our own wording, and TRAQ's `Lean °` + `Corrected`
is our `correct`/`morph` dual. **The brief's instruction to look outside botany is the reason this
survey has the right answer for two of nineteen axes.**

### 2.3 ⭐ SURPLUS — the world records these and we have no axis

**This is the largest column, as the brief predicted.** Grouped by whether a renderer could use it.

#### A. Directly renderable — a knob could read this tomorrow

| trait | source & vocabulary | what it would let us do |
|---|---|---|
| ⭐⭐⭐ **Foliage Porosity WINTER** | USDA, `Porous · Moderate · Dense` | **A separate winter silhouette.** Today `leaf.season` goes to bare and the tree is whatever the chassis is. This says how dense the *bare* crown reads — the difference between a winter hackberry and a winter plane. |
| ⭐⭐⭐ **Bark Plate Shape** | NC State, `Diamond · Irregular · Oval · Rectangle · Round · Square` | Picks a *bark tiling pattern*, not just a type. Diamond is ash; rectangle is persimmon/dogwood; irregular is oak. Our `bark.plate_size` scalar cannot express any of this. |
| ⭐⭐ **Leaf Margin** | NC State (12): Crenate · Crenulate · Dentate · Denticulate · Doubly Crenate · Doubly Dentate · Doubly Serrate · Entire · Lobed · Serrate · Sinuate · Undulate. MLA #26 (6) + tooth block #47–52 | The **edge** of the leaf card, independent of its outline. A serrated vs entire card at the same silhouette reads as a different species. |
| ⭐⭐ **Leaf Feel / texture** | NC State `Leaf Feel` (12): Fleshy · Glossy · Leathery · Papery · Prickly · Rough · Rubbery · Slippery · Smooth · Soft · Velvety · Waxy. MLA #54 `LEAF TEXTURE` (7, coriaceous/chartaceous/membranaceous × cuticle) | **A specularity/roughness dial for the leaf material.** Glossy magnolia vs matte oak is a shader fact we currently have no input for. |
| ⭐⭐ **Foliage Texture** (whole-plant) | USDA + NC State, `Fine · Medium · Coarse` | The coarseness a crown reads at from across the street — LOD/impostor-relevant, and orthogonal to both density and leaf size. |
| ⭐⭐ **Deciduous Leaf Fall Color** | NC State (9): Brown/Copper · Cream/Tan · Gold/Yellow · Gray/Silver · Insignificant · Orange · Pink · Purple/Lavender · Red/Burgundy | ⭐ **The fall anchor in `leaf.season` currently comes from a hand-written dossier hex.** This is the same fact, as a closed term, for 1,047 trees. Note `Insignificant` — an explicit "this tree does not colour", which SelecTree's boolean cannot say. |
| ⭐⭐ **Colour by SEASON × PART grid** | RHS: 16 colours × {Stem, Flower, Foliage, Fruit} × {Spring, Summer, Autumn, Winter} | ⭐ **This is the shape our `leaf.season` curve wants** — and it extends the idea to *stem* colour, which is a real winter read (red-twig, yellow willow) we have no axis for at all. |
| ⭐ **New Growth Color** | SelecTree `foliage_growth_color` (19) | A *spring* anchor distinct from summer green — bronze new oak, red new maple. Our season curve has a `spring` anchor filled by hand. |
| ⭐ **Stem/twig colour** | NC State `Stem Color` (14) · RHS stem colour by season | Winter twig read. No axis. |
| ⭐ **Stem Lenticels / bark Lenticels** | NC State `Surface/Attachment` → `Lenticels`; Wojtech's key makes lenticels one of seven top-level bark classes | Cherry/birch bark is *defined* by horizontal lenticels. Our `bark.type` calls it `smooth`. |
| ⭐ **Foliage type / functional type** | SelecTree (3): Deciduous · Evergreen · Partly Deciduous. NC State `Woody Plant Leaf Characteristics` (4): Broadleaf Evergreen · Deciduous · Needled Evergreen · Semi-evergreen. USA-NPN `functional_type` (19) incl. **Drought deciduous broadleaf**, **Deciduous conifer** | ⭐ **We have no axis for this at all**, and it is the single most consequential seasonal fact. `taxodium_distichum` is a *deciduous conifer*; nothing in the rubric can say so. |
| ⭐ **Flower Inflorescence** | NC State (11): Catkin · Corymb · Cyme · Head · Insignificant · Panicle · Raceme · Solitary · Spadix · Spike · Umbel. PO `PO:0030115–0030135` | Our `overlay.type: flowers` is one bit. A catkin and an umbel are different geometry. |
| ⭐ **Flower Shape / Petals** | NC State `Flower Shape` (15) · `Flower Petals` (10) | Same argument, one level finer. |
| ⭐ **Fruit Type / Size** | SelecTree `fruit_type` (15: Samara, Acorn, Drupe, Legume, Pome, Cone…) + `fruit_size` (12) · NC State `Fruit Type` (13) | Our `overlay.type: fruit` is one bit. A samara and an acorn are different props. |
| ⭐ **Conspicuousness, separate from presence** | USDA `Flower Conspicuous` / `Fruit/Seed Conspicuous` / `Fall Conspicuous` (Y/N) · SelecTree `flower_showiness` (Inconspicuous · Low · Showy) | ⭐ **Decides whether an overlay is worth spawning at all** — a gate we currently have no data for. |
| ⭐ **Fruit/Seed Persistence** | USDA (Y/N) | Whether fruit stays on through winter. Directly a winter-render fact. |
| ⭐ **Hairs Present / pubescence** | NC State (Y/N) · MLA #56 (hair bases · multicellular · papillae · peltate · simple · stellate · unicellular hairs · trichomes) · FLOPO `bark pilosity`/`bark glabrous` | Silhouette softness; leaf-edge shader. |
| ⭐ **Leaf Length AND Width separately** | NC State, 4 bands each | Our `leaf.size` is one scalar. A leaf card has two dimensions and the aspect ratio is the species read (MLA also records `LAMINAR L:W RATIO` explicitly). |
| ⭐ **Appendages** | NC State (4): Prickles · Spines · Tendrils · Thorns | Our `overlay.type: thorns` is one value; this is four distinct geometries. |

#### A′. Directly renderable — the forestry/arboricultural additions

| trait | source & vocabulary | what it would let us do |
|---|---|---|
| ⭐⭐⭐ **Crown SOLID FORM** | UTD `TS3.Shape`: `1` cylinder · `2` ellipsoid/spherical · `3` paraboloid · `4` inverted paraboloid | **This is not habit — it is the solid of revolution the crown approximates**, recorded per measured tree. A vase and an inverted paraboloid are the same tree described two ways, but only one of them is a *shape a renderer can build*. We have no axis for it and it is arguably closer to what the chassis actually is. ⚠️ Undefined value `5` occurs 43× — unconfirmed. |
| ⭐⭐⭐ **Crown ratio / crown base height** | FIA `UNCRCD` (00–99%) · `CR` compacted · TRAQ `Live crown ratio (LCR) = (crown height/tree height) × 100` · UTD `CrnBase`/`CrnHt` measured · DC `MIN_CROWN_BASE` | ⭐⭐ **Where the canopy STARTS up the trunk.** A street tree pruned up for clearance and a park tree with low branches are the same species and read completely differently. **Nothing in our 19 axes can say this**, and it is one of the most visible facts about a street tree. |
| ⭐⭐ **Crown class / light exposure** | FIA `CCLCD` (Open grown · Dominant · Codominant · Intermediate · Overtopped) · `CLIGHTCD` `0`–`5` (identical in Urban FIA and i-Tree Eco) | ⭐ **The most portable trait in the survey.** A tree's crown shape is a *consequence* of its light exposure — an open-grown specimen is symmetric, an overtopped one is drawn and one-sided. This is the causal input to canopy asymmetry, which `rubric.json` currently lists in `nonAxes` as deferred. |
| ⭐⭐ **Crown symmetry / unbalanced** | TRAQ `Unbalanced` flag · `Excessive end weight` · ANSI A300 Pt.9 defines **`crown symmetry`** as a standard term | Same point, as a directly authored flag. |
| ⭐⭐ **Foliage transparency** | FIA `TRANSCD`, 5% classes | Distinct from density: density is how much crown there is, transparency is how much light gets through it. Two separate dials the world keeps apart and we collapse into one. |
| ⭐⭐ **Pruning history** | TRAQ `Topped · Thinned · Lion tailed · Raised · Other` | ⭐⭐ **The human hand, as a closed 5-term vocabulary.** A topped tree and a raised tree are *made* shapes — for a street-tree kit this is arguably more explanatory of what you see than the species is. |
| ⭐⭐ **Urban-specific damage** | Urban FIA (7): `Stem Girdling · Bark Inclusion · Severe Topping or Poor Pruning · Excessive Mulch · Conflict with Roots · Conflict with Tree Crown · Improper Planting` | The visible pathologies of a street tree, coded by a federal manual. |
| ⭐⭐ **Foliage condition** | TRAQ `None (dead)` · `None (seasonal)` · `Normal %` · `Chlorotic %` · `Necrotic %` · FIA `CDIEBKCD` · i-Tree's 22 dieback classes · NYC `health` {Good·Fair·Poor} · DC `CONDITION` {Excellent·Good·Fair·Poor·Dead} | ⭐ **A sick tree is a distinct render.** ⭐⭐ And note **`None (seasonal)` is an explicit "bare because it is winter, not because it is dead"** — a distinction our `leaf.season` curve makes implicitly and no data field of ours records. |
| ⭐⭐ **Leaf surface roughness** | i-Tree Species Selector, 3 ordinal bands with their member terms: `dull·smooth·glossy·glabrous` 0 / `ciliate·silky·velvety·pubescent·glaucous·waxy` 1 / `rough·resinous·tomentose·scabrous·scaly·villous` 2 | ⭐ **A ready-made 3-band collapse of a messy botanical vocabulary into a shader-sized dial** — and it aliases NC State's 12-term `Leaf Feel` straight into it. |
| ⭐⭐ **Crown texture (whole-crown)** | i-Tree Species Selector: `Coarse` 0 · `Medium` 1 · `Fine` 2 (matches USDA/NC State `Foliage Texture`) | Three independent sources agree on the same 3-term scale. That is as close to a settled vocabulary as this survey found. |
| ⭐ **Leaf complexity as an ordinal** | i-Tree Species Selector: `Simple` 0 · `pinnate/palmate compound, trifoliate` 1 · `bi-/tri-pinnate` 2 | A compact way to express compound-ness that does not fight `leaf.silhouette`. |
| ⭐ **Leaf size as a 3-band ordinal** | i-Tree Species Selector: `>4″` 0 · `2–4″` 1 · `<2″` 2 | Cheaper than a scalar and directly bindable to leaf-card scale. |
| ⭐ **Codominant stems / included bark** | TRAQ `Codominant stems #___` · `Included bark` | ⭐ **The count of trunks.** Our `chassis.habit` has `multi-stem` as one word; this is an integer plus the structural defect that comes with it. |
| ⭐ **Bark volume percent** | FIA `REF_SPECIES.BARK_VOL_PCT` | ⭐ **The only quantitative bark trait anywhere in this survey** — bark as a percent of bole volume, per species. Not our `groove_depth`, but the closest thing to a bark magnitude that exists. |
| ⭐ **Wood specific gravity** | FIA `WOOD_SPGR_GREENVOL_DRYWT` + `BARK_SPGR_GREENVOL_DRYWT` (each with a `_CIT` citation column) · EOL/GWDD `wood density` | Physical numbers behind wood/branch character, with provenance. |
| ⭐ **Softwood/hardwood + species group** | FIA `SFTWD_HRDWD` · `MAJOR_SPGRPCD` {Pines · Other softwoods · Soft hardwoods · Hard hardwoods} · `JENKINS_SPGRPCD` (10 groups) | ⭐⭐ **A ready-made FALLBACK LADDER.** Jenkins groups (Soft maple/birch · Hard maple/oak/hickory/beech · Aspen/alder/cottonwood-willow …) are exactly the granularity at which a *parts mixer* could substitute — "no sugar-maple parts, but this is Jenkins group 9, use the hard-maple chassis". ⛔ **That is a substitution rule the world already publishes, and it is deterministic, not a confidence score.** ⚠️ `SFTWD_HRDWD`'s letter domain unconfirmed. |
| ⭐ **Decay class** | FIA `DECAYCD` 1–5, defined by a 5-column table (Limbs/branches · Top · % Bark Remaining · Sapwood · Heartwood) | ⭐ **A snag/dead-tree ladder.** Class 1 = *"All present / Pointed / 100 / Intact; sound…"* → class 5 = *"None / Broken / Less than 20 / Gone / Sloughing, cubical, soft, dark brown"*. If the kit ever renders a dead tree, this is the vocabulary. |
| ⭐ **Damage location + type** | FIA `DAMLOC1` (10 positions, Roots→Foliage) · `DAMTYP1` (16 types incl. `Open wound`, `Crack or seam`, `Conk/fruiting body`, `Broom`, `Vines in the crown`, `Loss of apical dominance`, `Discoloration of foliage`) | Where on the tree, and what kind — both closed lists. Directly a decal/variant vocabulary. |
| ⭐ **Vines / mistletoe / moss** | TRAQ flag · FIA `MIST_CL_CD` (Hawksworth 0–6) · FIA `DAMTYP1: 20 Vines in the crown` | An overlay class we do not have. |
| ⭐ **Wind exposure** | TRAQ: `Protected · Partial · Full · Wind funneling` | ⭐ **A per-site input to the wind animation.** The Arborist already has a wind/motion story; this is the world's 4-term vocabulary for how exposed a given tree is. |
| ⭐ **Leaf persistence, three-valued** | i-Tree Species Selector: `deciduous · semi-deciduous · evergreen` (default in-leaf season **180 days**; evergreen factor 365 ÷ in-leaf days) | Third independent confirmation of the 3-term foliage-type vocabulary — and it comes with an explicit day-count model. |
| ⭐ **Pollen allergenicity** | i-Tree Species Selector, `1`–`10` (Ogren 2000, 1 = most allergy-free) | Product surface. Notable that it is a fine-grained published ordinal. |

#### B. Structural / siting — no direct render, but real product surface

| trait | source | note |
|---|---|---|
| ⭐⭐ **Planting site** | Morton `tp_planting_site`: City parkway · Residential and parks · Restricted sites · Under utility lines · Wide median | ⭐⭐ **This is the only vocabulary in the whole survey that speaks the kit's own language** — it is keyed to *where in the street section the tree stands*. A kit that pours neighbourhoods and places trees in a parkway could use this directly as a placement filter. |
| ⭐⭐ **Design Feature / Landscape Location** | NC State `Design Feature` (15, incl. **Street Tree**, Shade Tree, Small Tree, Understory Tree) · `Landscape Location` (19, incl. **Walkways**) | Same idea, second source. `Street Tree` = 175 species is effectively a ready-made candidate list for town #2. |
| ⭐ **Available Space To Plant** | NC State (7 bands) · SelecTree `planting_area` (2–4 ft · 4–7 ft · >7 ft · Urban areas) | ⭐ **Parkway width in feet.** The kit already knows the parkway width from the section — this is a join it could actually make. |
| ⭐ **Utility friendly** | SelecTree `utility_friendly` (bool) · Morton `Under utility lines` | Overhead-wire clearance. |
| ⭐ **Root Damage Potential** | SelecTree (Low · Moderate · High) · Morton `roots prone to invading sewer pipes` | Sidewalk heave — a *visible* street condition. |
| ⭐ **Branch Strength / Weak Wood** | SelecTree `branch_strength_low`/`_high` (Weak · Medium Weak · Medium · Medium Strong · Strong) · NC State `Problems`→`Weak Wood` · Morton `weak wood and branch structure`, `highly susceptible to ice damage` | Storm-damage character; also a plausible input to a "battered specimen" variant. |
| ⭐ **Litter Type** | SelecTree (8): Bark · Dry Fruit · Flowers · Fruit · Leaf · Leaves · Twigs · Wet Fruit · NC State `Problems`→`Messy` · Morton `messy fruit/plant parts` | ⭐ **Ground scatter.** What falls under the tree is a renderable ground-decal fact and we have no axis for it. |
| ⭐ **Resistance to urban challenges** | NC State (24): **Compaction · Foot Traffic · Pollution · Salt · Storm damage · Urban Conditions** + Deer/Drought/Heat/Wind… · Morton `Road salt` · SelecTree `salt_tolerance`, `wind_resistance` | The urban-tolerance axis a street-tree kit would want when choosing species for a town it has never seen. |
| ⭐ **Growth Rate** | USDA (Slow·Moderate·Rapid) · NC State (Slow·Medium·Rapid) · Morton (Slow·Moderate·Fast) · SelecTree `growth_rate_high` (in/yr, banded) | Feeds `tree.age` as a *rate*, which our 0–1 dial has no way to express. |
| ⭐ **Lifespan** | USDA (Short<100 · Moderate 100–250 · Long>250 yr) · NC State `Short-lived` | Same. |
| ⭐ **Shade Tolerance** | USDA (Intolerant · Intermediate · Tolerant) · SelecTree `shade_tolerant` | Where in a canopy a species plausibly sits — an understory/overstory placement fact. |
| ⭐ **Native locale / range** | Morton `tp_native_locale` · SelecTree `native_range`, `california_native` · USDA distribution · EOL `native range includes` | ⭐⭐ **The portability lever.** A kit pouring town #2 needs to know which species belong *there*. This is the single most kit-relevant surplus after planting site. |
| ⭐ **Hardiness zone** | USDA zones everywhere; SelecTree carries **both** `usda_zone` and Sunset `sunset_zone`; NC State 1a–13b | Same argument. Geographic gating for a town nobody has looked at. |
| ⭐ **Wood density** | EOL / Global Wood Density Database (numeric) · USDA `Fuelwood Product` (lb/ft³ bands) | A real physical number behind `chassis.density` if we ever wanted one. |
| ⭐ **Health hazard / toxicity / allergen** | SelecTree `health_hazard` (Allergy · Irritant · None Known · Poisonous) · USDA `Toxicity` (None·Slight·Moderate·Severe) · NC State poison block (6 fields) · USA-NPN `species_type`→`Allergen` | Product surface, not render. |
| ⭐ **Invasiveness** | SelecTree `ca_invasive`/`pi_invasive` · NC State `Problems`→`Invasive Species` · USA-NPN `species_type`→`Invasive Plants` | Ditto — and a plausible authoring warning. |
| ⭐ **Biogenic emissions (VOC)** | SelecTree (Low · Moderate · High) | i-Tree-lineage metric. Not renderable; notable that it exists. |
| ⭐ **Attracts wildlife** | SelecTree (6) · NC State `Attracts` (12) · Morton `tp_wildlife` (20) | Ambient-life / fauna hooks. |
| ⭐ **Commercial availability** | USDA (No known source · Routinely available · Contracting only · Field collections only) | Would tell an operator whether a species they picked is plantable in reality. |
| ⭐ **Fragrance** | SelecTree `fragrance` (bool) · NC State `Flower/Leaf Value To Gardener`→`Fragrant` · RHS `Noted for fragrance` | — |
| ⭐ **Transplants well / Maintenance** | Morton `Transplants well` · NC State `Maintenance` (High·Low·Medium) · i-Tree Eco Maintenance Recommended (6) + Maintenance Task (7) | — |
| ⭐ **Sex / dioecy** | SelecTree `sex`, `sex_explanation` | Ginkgo. Determines whether the fruit overlay applies at all. |
| ⭐⭐⭐ **STREET TREE, as a geometric rule** | ⭐ **Urban FIA 7.6.0.11**, verbatim: *"within 8 ft. of the edge of a maintained surfaced road (as measured from the pith of the tree to the edge of the flat surface of the road). Trees located in the space between the edge of the road and the sidewalk, or within a median strip between roads regardless of distance from the road are also defined as STREET TREES."* · NC State `Design Feature: Street Tree` · Cambridge `Location: Street Tree` · Melbourne `located_in: Street\|Park` | ⭐⭐ **A federal manual defines "street tree" as a distance from the road edge — and names the MEDIAN case explicitly.** The kit already knows its own road edges and its own medians. **This is a rule it could evaluate, not a label it would have to be told.** |
| ⭐⭐ **Planting-site geometry** | Cambridge `TreeWellLength`/`Width`/**`Depth`** + `TreeWellCover` {Tree Grate · Flexi-Pave} + `StructuralSoil` · DC `TBOX_L`/`TBOX_W` · SF `qSiteInfo` container {Cutout · Yard · Pot · Silva Cell} · OTM `Plot.width`/`Plot.length` · UTD `Setback` (4 bands) | ⭐ **The tree pit itself is a renderable object** — a grate, a cutout, a flexi-pave surround. We have no concept of it at all, and it is right at the point where the tree meets the sidewalk the kit already draws. |
| ⭐⭐ **Point-placement convention** | ⭐ **NYC data dictionary**, verbatim: *"a tree identified as being on the curb will have the point placed 2.5 feet from the blockface line; a tree identified as being offset will have the point placed 12 feet from the curb line"* + `curb_loc` {OnCurb · OffsetFromCurb} | ⭐⭐ **A published offset-from-curb rule keyed to a two-value vocabulary** — i.e. exactly the placement decision the kit makes, already standardised, with the blockface as the reference line. |
| ⭐ **Empty and proposed sites** | SF `qLegalStatus: Permitted Site` · DC `TBOX_STAT: Open/Proposed/Conflict` · Cambridge `SiteType: Planting Site/Proposed Tree` · OTM's `Plot`-without-`Tree` | ⭐ **The world models the gap in the row of trees.** A pour that only knows about trees cannot render a street the way a census records it. |
| ⭐ **Sidewalk conflict, as a lift measurement** | i-Tree Eco: `0–¾″` · `¾–1½″` · `1½″` · NYC `sidewalk {Damage · NoDamage}` · Cambridge `ExposedRootFlare`, `TreeGrateActionReq` {…`<2″ clearance`} | Root heave is a *visible* sidewalk deformation and there is a 3-band vocabulary for its magnitude. |
| ⭐ **Stewardship / guards** | NYC `steward` {None · 1or2 · 3or4 · 4orMore} · `guards` {None · Helpful · Harmful · Unsure} · OTM Plot Stewardship {Enlarged · Changed to Include a Guard · Changed to Remove a Guard · Filled with Herbaceous Plantings} · Tree Stewardship {Watered · Pruned · Mulched… · Cleared of Trash or Debris} | ⭐ **Tree guards, mulch rings, planted beds** — street furniture around the trunk, as closed vocabularies. All renderable, none of it in our rubric. |
| ⭐ **Land use, with a published crosswalk** | ⭐⭐ Urban FIA `URBAN NONFOREST LAND USE` (30 codes) ↔ **`i-TREE LAND USE` (13 codes), with each i-Tree code listing the FIA codes it is valid with** · i-Tree Eco's own 14 single-letter classes · UTD `LandUse` (6) | ⭐⭐ **A published crosswalk between two land-use vocabularies is exactly the artefact the kit's own land-use arc needs** — it is the worked example of aliasing one controlled vocabulary into another without a confidence score. |
| ⭐ **Ground cover under the tree** | i-Tree Eco, 11 classes: Bare soil · Building · Cement · Tar · Rock · Duff/mulch · Grass · Unmaintained grass · Herbs · Other impervious · Water (to nearest 5%, summing to 100) | What the ground reads as under the canopy — a ground-material vocabulary at exactly the granularity the kit paints. |
| ⭐ **Species substitution ladder** | ⭐ i-Tree Streets `SppValueAssignment` — maps each species to a reference species or a `<TreeType> OTHER` bucket (`CEL OTHER`, `BDL OTHER`) · FIA `JENKINS_SPGRPCD` | ⭐⭐ **This is the join the Arborist's backlog is missing, solved by someone else.** 160 unmatched species is a matching problem; `SppValueAssignment` is a *published, deterministic* rule for "when you do not have this species, use that one". |

#### C. Deep morphology — no renderer today, but formally coded and cheap to carry

MLA gives ~40 more coded characters we have no axis for and could record once: `LAMINAR SYMMETRY` ·
`BASE ANGLE` / `APEX ANGLE` · `BASE SHAPE` (12) · `APEX SHAPE` (9) · `POSITION OF PETIOLAR ATTACHMENT` ·
`LAMINAR L:W RATIO` · the full **venation hierarchy** (1°–5° category, course, angle, spacing,
areolation, FEVs, marginal ultimate venation, **LEAF RANK 1r–4r**) · the **tooth block** (# of orders,
teeth/cm, spacing, a 25-value tooth-shape matrix, sinus angular/rounded, 8 apex types) · `STOMATA` (32) ·
`CUTICULAR FEATURES` (10). NC State adds the whole **stem block** — `Stem Form` (Straight · Zig Zags),
`Stem Buds`, `Stem Bud Terminal`, `Stem Bud Scales`, `Stem Cross Section`, `Stem Is Aromatic` — which is
the winter-twig identification key. TRY adds `Woodiness` / `WoodinessDetail` / `NumberOfLeaflets`.

⭐ **`NumberOfLeaflets` deserves a call-out**: for a compound leaf that is the difference between an ash
card and a locust card, and it is a plain integer.

**⇒ Rough count: ~55 SURPLUS traits are directly or plausibly renderable, ~35 more are product/siting
surface, and 60+ more are formally coded deep morphology — call it 150, conservatively. Against 19
axes, of which 14 are ALIGNED and 5 are GAPs that turn out to be authoring knobs.** Jacob's steer
held completely: there are a great many more than 19, and the interesting ones are not the ones we
guessed.

⭐⭐ **The three most surprising surpluses, if only three are read:**
1. **Crown base height / live crown ratio** — where the canopy *starts up the trunk*. Recorded by FIA,
   TRAQ, the UTD and DC. **Nothing in our 19 axes can express it, and on a street tree it is one of
   the most visible facts there is** (a tree pruned up for truck clearance vs one branching at 2 m).
2. **Pruning history as a closed vocabulary** — `Topped · Thinned · Lion tailed · Raised`. For a
   street-tree kit, the human hand may explain more of what you see than the species does.
3. **The species substitution ladder** — i-Tree Streets' `SppValueAssignment` and FIA's Jenkins groups.
   **The Arborist's stated backlog is 160 unmatched species; this is a published, deterministic rule
   for exactly that problem**, with no confidence score anywhere in it.

---

## 3. RECOMMENDATION — build on **NC State Plant Toolbox** first, **SelecTree** second

### The two, and why

**① ⭐⭐ NC State Extension Gardener Plant Toolbox — the vocabulary source.**
- **Granularity is unmatched**: bark is 4 fields (including `Bark Plate Shape`, which exists nowhere
  else), leaf is 13, stem is 10. Every other horticultural source treats bark as one prose sentence.
- **Its vocabularies come out as JSON from two open endpoints with no parameters** — the entire
  controlled-vocabulary layer is one `curl` away, and it carries **live counts**, so a check reads it
  rather than restating it (the `PRUNE AS YOU GO` rule's own pattern).
- **Region is right**: eastern North America plus ornamentals, `Tree = 1,047`, `Street Tree = 175`.
- **It invites citation.** Verbatim: *"We strongly encourage you to cite or reference the Plant Toolbox
  as you would any other publication."*
- ⚠️ **The one open question is reuse.** There is no explicit licence grant on the trait text. **Ask
  before ingesting at scale** — the citation language is an invitation, not a grant.

**② ⭐ SelecTree (Cal Poly UFEI) — the coverage and cultivar source.**
- **89/89** of the LS census's distinct species names return a record. **2,087 taxa, cultivars as
  first-class records** — and cultivar-level habit is real (`Acer rubrum 'Armstrong'` = Columnar).
  That matters because a street census names cultivars.
- `bark_texture` is **multi-valued** (17 terms) — richer than anything else found.
- Full open JSON API including a **glossary endpoint that defines all 51 characteristics**, i.e. the
  authority for its own vocabulary ships with the data.
- ⚠️ **No open-data licence.** Only a warranty disclaimer. **Reuse terms must be asked for**
  (ufei@calpoly.edu). Californian in emphasis. `bark_color` is not a controlled vocabulary and there
  is no fall-colour value.

### Why not the others

- **USDA PLANTS** is the only one that is unambiguously **public domain**, has 83 coded fields, and
  contributes two traits nothing else has (`Foliage Porosity Summer`/`Winter`). ⭐ **Take it as the
  third source specifically for those two fields plus `Height at 20 Years` — but not as the spine**,
  because its ~610 trees are NRCS conservation plants, not street trees, and its `No`-by-default
  booleans are a trap.
- **EOL TraitBank** has the widest predicate list and a clean **CC BY 4.0** bulk file — but its
  predicates are un-deduplicated across providers (`shedability` vs `leaf sheddability`), and its
  backbone *is* USDA PLANTS, so it mostly re-serves ①/③ with extra ambiguity.
- **Morton** has the best *street-tree* vocabulary in existence (`City parkway`, `Wide median`,
  `Under utility lines`) but is **all-rights-reserved, non-commercial**. ⭐ **Adopt its schema shape;
  do not ingest its content.**
- **TRY** yields exactly seven categorical morphology fields from a 2012 test release. **Skip.**
- **Wikidata** (52 leaf-shape statements globally), **GBIF** (no trait class), **Silvics**, **FEIS**,
  **efloras**, **Plant Guides** (all prose), **Kew SID** (seed only), **BGCI** (CC BY-NC-ND) — **skip.**
- **Oregon State** — ⛔ **ClaudeBot disallowed. Do not ingest.**
- **MOBOT is unverified** and, being St. Louis, is the highest-value thing still unchecked.

### ⭐ And a fourth, for a different job: the **Urban Tree Database (RDS-2016-0005)**

It is not a trait vocabulary and should not be treated as one. It is **14,487 measured street trees**
with height, crown base, crown height, two crown diameters and leaf area — plus **2,402 fitted growth
equations** predicting those from dbh or age, per species per climate region. **Licence, verbatim:
*"can be used without additional permissions or fees."*** ⭐ **If `tree.age` and `chassis.size` are ever
to be more than dials, this is the evidence base for them — and it is the only recommended source with
no licence question at all.** *(Only the zip is served; per-file URLs 404.)*

### ⛔ And one that must be named as a dead end so nobody re-derives it

**i-Tree looks like the obvious source for a street-tree kit and it is not.** Its downloadable species
master is **four columns** — `"ID","Code","Scientific Name","Common Name"` — and nothing else. The rich
per-species attributes (LAI, BVOC, tolerances, pollution removal, growth rate) are **published as
methods and withheld as values**. ⚠️ i-Tree's own docs quote four different species counts (6,500+ /
"over 7,000" / 10,556 / 1,585). **Cause not established.** ⭐ What i-Tree *is* good for is its
**vocabularies** — the Species Selector's six 0–2 ordinals and the Streets `SppValueAssignment`
substitution table — which are usable without the values.

### How this lands in `vocabulary.mjs` — the intake-contract check

⛔ The brief's binding constraint: *"whatever is recommended must be expressible as terms that resolve
through `vocabulary.mjs`, or it becomes a 20th set of names nobody can match."* Measured against the
live `TERM_ALIASES`:

- **`chassis.habit`** — NC State's 24 and SelecTree's 12 alias into our 9 with **~13 new alias rows**
  (`arching`, `mounding`, `dense`, `narrow`, `thicket-forming`, `sprawling`, `prostrate`, `decumbent`,
  `semi-erect`, `creeping`, `ascending`, `palm`, `sword palm`). `conical`, `erect`, `broad`,
  `horizontal`, `clumping`, `multi-stemmed`, `open` are **already there**.
- **`bark.type`** — the 15+17 terms alias into our 8 with **~11 new rows**; `fissured`, `platy`,
  `blocky`, `flaking`, `peeling`, `papery`, `shaggy`, `patchy`, `striate` are **already there**.
- **`leaf.ways`** — 4 new rows (`decussate`, `rosulate`, `alternate/whorled`, `opposite/whorled`);
  `whorled` already aliases to `clusters`.
- ⚠️ **`leaf.silhouette` is the one that does not fall out cleanly.** 25 NC State shapes + 5 leaf types +
  17 SelecTree leaflet shapes have to collapse into 10 tokens that mix *compound-ness*, *lobation* and
  *outline*. `resolveTerm`'s `contains` pass will resolve many of them by accident and some of those
  will be wrong (`Palmatifid` contains neither `palmate` nor `lobed` as a word; `Oblanceolate` contains
  `lanceolate` and would resolve — correctly here, but by luck). **This axis needs a ruling, not an
  alias table.**

⭐ **Everything else in the SURPLUS column arrives as a NEW closed term set, which is the cheap case** —
a new axis with a source-supplied vocabulary needs no aliasing at all, because there is nothing to
reconcile it against yet. That is the argument for collecting breadth now: the traits we already have
axes for are the expensive ones.

### The things to settle before phase 2

1. ⚠️ **`bark.type` is single-valued and the world's is multi-valued.** `Platanus` is
   `["Exfoliating","Smooth"]`. Either we pick a collapse rule or we widen the axis. **Not a research
   question — a design one.**
2. ⚠️ **`leaf.silhouette` conflates three orthogonal facts** that every external source keeps apart
   (compound-ness · lobation · outline). Aliasing into 10 tokens will silently mis-resolve.
3. ⚠️ **`chassis.density` means *wood* in our rubric and *crown* in every source.** TRAQ, i-Tree and
   USDA all describe the crown as seen; our axis's `orthogonality` note explicitly separates wood-fill
   from `leaf.occupancy`. The clean reading is **USDA winter porosity → `chassis.density`, summer
   porosity → `leaf.occupancy`** — but that is a ruling, not a lookup, and it should be made before
   any value is collected against either axis.
4. ⚠️⚠️ **`rubric.json`'s `nonAxes` may be answerable after all.** Canopy asymmetry is deferred there
   as needing per-branch data we do not have. But **FIA `CCLCD` (crown class) and `CLIGHTCD` (crown
   light exposure) are the *cause* of asymmetry**, recorded as 5- and 6-value codes — an overtopped,
   one-side-lit tree is asymmetric for a reason the world already codes. ⛔ **Not a proposal — a flag
   that the exclusion was reasoned from "we have no limb graph", and the world reaches the same effect
   without one.**

### Licence position, plainly

| source | status |
|---|---|
| **USDA PLANTS** | ✅ **Public domain** — *"not copyrighted and is free for any use"* (images excepted) |
| **USA-NPN** | ✅ Open access, CC (⚠️ exact variant unconfirmed) |
| **EOL TraitBank** | ✅ **CC BY 4.0**, attribute original sources |
| **Kew SID** | ✅ CC BY 2.0 (seed only) |
| **FLOPO / TO / PO / PPO** | ✅ CC0 / CC BY |
| **TRY File Archive** | ✅ CC BY 3.0 for dataset 3; free registration |
| ⭐ **Urban Tree Database (RDS-2016-0005)** | ✅ **"can be used without additional permissions or fees"**, citation requested |
| **USFS FIA DataMart** | ✅ US federal work, no login (⚠️ explicit licence text unconfirmed) |
| **SF · Cambridge street-tree data** | ✅ **ODC PDDL** |
| **Melbourne Urban Forest** | ✅ **CC BY 4.0** |
| **NC State Plant Toolbox** | ⚠️ **Citation invited, reuse unstated — ASK** |
| **SelecTree** | ⚠️ **No licence found, disclaimer only — ASK** |
| **i-Tree** | ⚠️ *"software is in the public domain"*, use governed by a **EULA**; no CC licence |
| **ISA TRAQ form** | ⚠️ © ISA all rights reserved, but *"may be used as presented or adapted"*; the BMP and course are commercial |
| **NYC TreesCount · DC UFA · OpenTreeMap** | ⚠️ **Nothing asserted at the endpoint** (`license` null / `copyrightText` empty / LICENSE not fetched) |
| **Arnold Arboretum** | ⚠️ Credit + notification requested |
| **TreePlotter** | ⛔ **No published schema at all** — fields are per-customer |
| **Morton** | ⛔ All-rights-reserved, **non-commercial only** |
| **RHS** | ⛔ Nothing granted |
| **BGCI GlobalTreeSearch** | ⛔ CC BY-**NC-ND** |
| **Oregon State** | ⛔ **ClaudeBot disallowed, `ai-train=no`** |

⛔ **Two of the three recommended sources have unresolved reuse terms. That is a question for Jacob to
answer with an email, not something to resolve by scraping quietly.**

---

## 4. WHAT REMAINS UNVERIFIED

- ⚠️⚠️ **Missouri Botanical Garden Plant Finder — nothing fetched. The highest-value gap, being
  St. Louis.** No field list, no facet vocabularies, no licence text. Everything anyone believes about
  MOBOT's schema is currently unverified.
- **Licences to ask about, not guess at:** NC State (reuse unstated), SelecTree (none found),
  NYC (`license` null), DC (`copyrightText` empty), OpenTreeMap (LICENSE not fetched), FIA DataMart
  (no explicit text), BIEN, efloras.
- **Vocabularies known to exist but not enumerated:** NC State's **stem block** (`Stem Surface`,
  `Stem Form`, `Stem Cross Section`, `Stem Buds`, `Stem Bud Terminal`, `Stem Bud Scales`,
  `Stem Lenticels`, `Stem Is Aromatic`) — record fields, absent from both filter endpoints;
  i-Tree's `Growth Form` / `Leaf Type` / `Percent Leaf Type` / `Native Continent` dropdowns (behind a
  JS app); FIA `SFTWD_HRDWD`'s letter domain.
- **Documents not reached:** the current FIA **Phase 3 crown-indicator** collection protocol (the
  crown density–foliage transparency card); the **Urban FIADB** table schema; **ANSI A300 (Part 9)-2017**
  (only the 2011 text was verified — whether any term list changed is unknown); TOP Thesaurus's
  archived content; TRY's main-database policy.
- **Data defects observed but not explained** — *cause not established for any of these:*
  UTD `TS3.Shape = 5` occurs 43 times and is undefined in the metadata · UTD `TS3.side`'s documented
  domain (F/M/S/P) does not match the data · `TS6` writes `CenFla` where `TS1` writes `Cen Fla` ·
  i-Tree quotes four different species counts · DC UFA has **editor usernames in six coded columns** ·
  NYC's `problems` token `BranchShoe` was not isolated.
- **Miscellaneous unresolved:** any live EOL predicate URI (500/404); World Flora Online (TLS failure);
  efloras licence; LEDA's status; DBpedia entirely; SelecTree filter-parameter names beyond those
  observed; the exact USA-NPN CC variant; whether a single-file bulk USDA Characteristics CSV exists.
