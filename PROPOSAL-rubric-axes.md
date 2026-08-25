# PROPOSAL — the rubric axes, rebuilt on standard botanical vocabulary

**STATUS: PROPOSAL. Does NOT overwrite `arborist/rubric.json`.** Jacob reads, then we cut over.
**Evidence:** `TRAIT-SURVEY-FINDINGS.md` (13 sources) · vocabularies pulled live from the two
open NC State endpoints, 2026-08-24.

---

## 0. THE TWO RULINGS THIS IS BUILT ON

**① Nothing to preserve.** *(Jacob: "we don't have anything worth preserving; we are trying to
finally finish the foundation so we can finally publish an actual grove.")* Only **~6 green
trees** exist, so a full re-label costs almost nothing. **Adopt wholesale, don't alias.**

**② ⭐ INDUSTRY-NEUTRAL TERMS.** *(Jacob: "attempt to use industry neutral terms to avoid
copyright issues.")* The **terms are not anyone's property** — `Cordate`, `Lanceolate`,
`Serrate`, `Fissured`, `Lenticels` are centuries-old botanical Latin that every source uses
because that is what the words ARE. What IS proprietary is the **curation**: which fifteen a
given database chose to group under one heading, or bucketing colour as "Brown/Copper".
> **THE RULE: prefer terms attested across MULTIPLE independent sources. A term in 3+ is
> standard vocabulary — take it. A term unique to ONE source is that source's editorial
> selection — take the CONCEPT and derive our own list.**
⭐ It is also better data: a term everyone uses resolves from any source we add later.

---

## 1. ⛔ THE REAL DEFECT IS CONFLATION, NOT SIZE

Our `leaf.silhouette` holds `palmate · lobed · heart · ovate · compound · needle · scale · fan ·
star · lanceolate` — **four different axes jammed into one.** `lobed` is a **margin**;
`compound` is a **type**; `heart`/`ovate`/`lanceolate` are **shapes**.

**A maple is `shape: Deltoid` AND `margin: Lobed`. One token can only say one of them, so the
other is silently thrown away.** No number of extra terms fixes that — it has to split.

---

## 2. THE SPLITS

| today | becomes | terms | attestation |
|---|---|---|---|
| `leaf.silhouette` (10, mixed) | **`leaf.type`** | Simple · Compound-pinnate · Compound-bipinnate · Compound-palmate · Needle · Scale · Frond | standard [3+] |
| | **`leaf.shape`** | Acicular · Cordate · Deltoid · Elliptical · Lanceolate · Linear · Oblanceolate · Oblong · Obovate · Orbicular · Ovate · Reniform · Rhomboid · Spatulate | standard Latin [3+] |
| | **`leaf.margin`** | Entire · Serrate · Doubly-serrate · Dentate · Doubly-dentate · Crenate · Lobed · Sinuate · Undulate · Spinose | standard Latin [3+] |
| `leaf.ways` (5) | **`leaf.arrangement`** | Alternate · Opposite · Whorled · Rosulate · Fascicled | ≡ already [3+] |
| `bark.type` (8) | **`bark.texture`** | Smooth · Fissured · Furrowed · Ridged · Plated · Scaly · Shaggy · Exfoliating · Papery · Lenticellate · Mottled · Fibrous · Warty | standard dendrology [3+] |
| | **`bark.plate_geometry`** | *(⚠️ see §4 — concept borrowed, list to be derived)* | ⛔ single-source |
| `bark.color` (unbuilt, "sample-pending") | **`bark.color`** | *(⚠️ see §4 — define against gradient ramps, not word buckets)* | ⛔ editorial |
| `chassis.habit` (9) | **`chassis.habit`** | Columnar · Fastigiate · Oval · Ovoid · Rounded · Spreading · Vase · Weeping · Pyramidal · Conical · Irregular · Multi-stem · Arching · Ascending · Horizontal | standard [3+] |

⭐ `leaf.size` should also split — **length and width are separate**, and the aspect ratio *is*
the species read (the survey notes MLA records `LAMINAR L:W RATIO` explicitly). A leaf card has
two dimensions; our one scalar cannot describe it.

---

## 3. ⭐ NEW AXES WORTH ADDING NOW (from the ~150 surplus — the highest-value few)

| axis | terms | why it earns its place |
|---|---|---|
| **`leaf.foliage_type`** | Deciduous · Broadleaf-evergreen · Needled-evergreen · Semi-evergreen · Deciduous-conifer | ⭐⭐ **We have NO axis for this at all.** `taxodium_distichum` is a *deciduous conifer* and nothing in the rubric can say so — the bald-cypress `winter: null` note in its dossier is a workaround for a missing axis. |
| **`crown.base_height`** / **`crown.ratio`** | scalar (m or %) | ⭐⭐ Where the canopy STARTS up the trunk. The most visible fact about a street tree, and **the hero impostor records already carry `canopyBaseNorm` with no data source behind it.** |
| **`crown.texture`** | Fine · Medium · Coarse | ⭐ Three independent sources agree on the same 3-term scale — the survey calls it the closest thing to a settled vocabulary it found. |
| **`overlay.fruit_type`** | Samara · Acorn · Drupe · Legume · Pome · Cone · Capsule · Nut · Berry | Our `overlay.type: fruit` is ONE BIT. A samara and an acorn are different props. |
| **`overlay.appendage`** | Prickles · Spines · Tendrils · Thorns | Our `thorns` is one value; these are four distinct geometries. |
| **`overlay.conspicuous`** | bool per flower/fruit/fall | ⭐ Decides whether an overlay is worth spawning AT ALL — a gate we have no data for. |

---

## 4. ⛔ THREE THINGS TO DERIVE OURSELVES, NOT COPY

1. **Plate geometry.** The concept (bark plates have a describable shape) is real and useful for
   the gradient-map work. But the six-term list found is **single-source curation** — derive our
   own from standard dendrology.
2. **Colour buckets.** `Brown/Copper`, `Gray/Silver` are editorial groupings, not botanical
   terms. ⭐ **Define `bark.color` against the actual gradient-map ramps** (`bark.gradientStops`)
   rather than word buckets — the renderer wants a ramp, not a noun.
3. **Anything appearing in exactly one source.** Take the idea, write our own terms.

---

## 5. MIGRATION

- **~6 green trees.** Re-labelling is a rounding error. ⛔ Do it in one cut, not by aliasing.
- `arborist/vocabulary.mjs` already resolves terms per axis and returns `resolved:false` rather
  than guessing — the new axes drop straight in; `TERM_ALIASES` gains entries, loses nothing.
- ⭐ **This is on the critical path for the TREE RENDER BUG, not adjacent to it.** The species
  with no hero impostor are the botanical/roster twins — `quercus_alba`/`oak_white`,
  `acer_saccharum`/`maple_sugar`, `tilia_americana`/`linden_american`, `betula_pendula`/`birch`.
  The roster twin has a capture; the botanical one does not. **The join is showing up as a
  render defect**, and one key fixes both.

---

## 6. FOR JACOB

1. **Adopt §2 wholesale?** (My read of your ruling: yes.)
2. **Which of §3's new axes make the first cut** — all six, or `foliage_type` + `crown.base_height` only?
3. **`bark.color` as a gradient ramp rather than a term list** — agree?
4. ⚠️ **`leaf.silhouette` currently carries `star` and `fan`.** Neither is standard; `fan` is
   ginkgo (flabellate) and `star` is probably sweetgum (a lobed shape). Both look like
   descriptions of two specific trees rather than vocabulary. **Retire them?**
