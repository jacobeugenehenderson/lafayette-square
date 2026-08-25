> ⛔ **RETIRED 2026-08-25.** The hydration it briefed SHIPPED. The live procedure — all
> eight stages, every guard, and the one remaining fallback — is
> **`arborist/ARCHITECTURE.md` §The species pipeline**. Kept for the design record only
> (`feedback_it_already_exists_find_what_broke_it`): archived is retired for CURRENCY, not
> for truth.

# BRIEF — hydrate the dossiers: PILOT (first 20 species)

**This is a PILOT, and its real deliverable is a MEASURED RESOLVE RATE, not 20 files.**
Jacob: *"we do the first 20 to get our sea legs before we attempt the big corpus."*
⭐ Ultimately we want **all 84, then every town.** This run tells us whether the machinery is
ready for that — and which axes need more aliases before it is.

▶ Route first (`CLAUDE.md`): `arborist/ORIENTATION.md §2` (the join) · `PROPOSAL-rubric-axes.md`
(the 31 axes, approved + executed) · `TRAIT-SURVEY-FINDINGS.md` (the sources, all six verified).

---

## 0. ⛔⛔ THE ONE ARCHITECTURAL RULE — YOU DO NOT WRITE DOSSIERS

**Emit RAW SOURCE VALUES. A script resolves them.**
```json
{ "species": "Oak, Pin", "source": "ncsu", "field": "bark_attachment", "value": "Fissured" }
```
⛔ **Never emit one of our tokens. Never map a value yourself. Never write to
`arborist/dossiers/`.** Hand off a single JSONL of raw observations.

⭐ **WHY THIS IS STRUCTURAL AND NOT A MATTER OF TRUST:** the kit has NO confidence scores
*(Jacob's ruling)* — a value either resolves into a closed vocabulary or the cell stays EMPTY and
the species stays RED. Under a "fill the table" instruction any model will map an unfamiliar
term to the nearest plausible token. If you can only emit raw values and `arborist/vocabulary.mjs`
decides, **an unmappable value CANNOT become a wrong token.** The rule enforces itself.

⇒ **An unresolved cell is a SUCCESS of this design, not a failure of your work.** Report it.

---

## 1. THE ROWS — first 20, in DEMAND ORDER
▶ `curl -s localhost:3334/coverage | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);j.species.slice(0,20).forEach((s,i)=>console.log(String(i+1).padStart(2),String(s.count).padStart(4),s.species,'|',(s.mergedFrom||[]).join(' / ')))})"`

⭐ **20 rows is 12% of species but 63% of placements** (10 rows = 45% · 30 = 74% · 50 = 84%). Demand order is the work queue — it is
why the first 20 is most of the map, not a sample.
⚠️ **These numbers CHANGED on 2026-08-24 and the earlier ones were wrong.** Coverage read only
`park_census.json` — 756 of 5,127 placements, **15% of the town** — so the demand order was
computed from a fraction of the data (`ORIENTATION §6`: *"the census is several WELLS, not one
file"*). It now reads every well: **172 rows, 6,767 placements.** ⭐ Under the true order
`Oak, Pin` is **#2 at 459** — the species Jacob's eye picked out as wrongly yellow.
⚠️ Use `mergedFrom` for searching: the census spells one tree several ways, and the resolver has
already merged them. Search each source with whichever spelling it is likely to know.

---

## 2. THE COLUMNS — 31 axes, but only ~24 are yours
▶ `node -e "const r=require('./arborist/rubric.json');r.axes.forEach(a=>console.log(a.id,a.kind,JSON.stringify(a.values||null)))"`

⛔ **DO NOT collect these seven — they are AUTHORED, not researched.** No source has them and a
value you find is a coincidence, not evidence:
`leaf.growthway` (a rendering directive, "as-modeled" is a real value) · `leaf.face` ·
`leaf.occupancy` · `bark.color` (being redefined as a gradient ramp) · `bark.groove_depth` ·
`bark.plate_size` · `bark.scale_frequency` · `bark.exfoliation_density`
⭐ The four `bark.*` scalars are **confirmed gaps** — bark is universally recorded as a PATTERN
TERM, never a magnitude.

**Highest value, because nothing in the kit can currently say them:**
`leaf.foliage_type` (⭐ `taxodium_distichum` is a DECIDUOUS CONIFER and the rubric could not
express it until today) · `crown.base_height` / `crown.ratio` (⭐⭐ the hero impostor records
already carry `canopyBaseNorm` **with no data source behind it**) · `leaf.type` + `leaf.shape` +
`leaf.margin` (the three that were conflated into one until today).

---

## 3. SOURCES — verified. ⛔ Read `TRAIT-SURVEY-FINDINGS.md` before fetching anything.
- **NC State Plant Toolbox** — the vocabulary source. 4 bark fields, 13 leaf, 10 stem.
  Vocabularies are two open endpoints: `plants.ces.ncsu.edu/ajax_filters/` ·
  `/ajax_id_filters/`. Labels differ from prose — ⛔ **key on `field_key`, never a copied label.**
- **SelecTree (Cal Poly)** — coverage + cultivars. **89/89** of the LS census resolves.
- **USDA PLANTS** — public domain. Take `Foliage Porosity Summer/Winter` + `Height at 20 Years`.
- **Urban Tree Database** — measured dimensions, no licence question. For crown height/base.
- ⛔ **Oregon State: DO NOT FETCH.** `Disallow: /` names ClaudeBot + `ai-train=no`. A named refusal.
- ⛔ **Morton / MOBOT: schema shape only, never content.** Non-commercial / no-download.

⭐ **Licence position, settled:** take the FACTS, never the COMPILATION. A trait value is a fact
about a tree; their pages, prose and record set are theirs. ⛔ **Do not bulk-mirror any source.**
20 species of values is using facts. Sources get credited in inputs acknowledgements.

---

## 3a. ⭐ HARDNESS AND TOLERANCE — Jacob's ruling, 2026-08-24
The dossier `required` schema is `{ target, hardness, tol }`. **No source supplies hardness or
tol** — they are authored judgement, and the ruling is:

> **`hard` for the IDENTITY axes · `soft` for everything else.**

| hardness | axes | meaning |
|---|---|---|
| **`hard`, tol 0** | `leaf.type` · `leaf.shape` · `chassis.habit` | get these wrong and it is **not that tree**. A part missing the tag cannot satisfy it. |
| **`soft`, tol 1** (enum) / **0.4** (scalar) | everything else | flexes. ⭐ A part that is untagged on a soft axis is **never disqualified** — it reads as unknown, which is what lets ratify-as-you-go converge instead of stalling. |

⛔ **You do not set these — the resolving script does.** They are listed so you understand why a
missing value is survivable on most axes and fatal on three.

## 4. DELIVERABLE
1. **`scratch/dossier-raw-observations.jsonl`** — one raw observation per line, schema in §0.
   Include EVERY value you find, even ones you doubt map to anything.
2. **A short report** (in your reply, not a new doc):
   - per species: fields found / fields missing
   - **per axis: how many of the 20 got a value** ⭐ *this is the number the pilot exists for*
   - **every source term you saw that you suspect will not resolve** — that list becomes the
     alias work before the corpus run
   - which source answered which axis best, and any that were never answerable

⛔ **No files under `arborist/`. No dossiers. No schema changes.** ⛔ Mark anything you could not
verify as unconfirmed rather than inferring it — this repo has been burned all week by confident
claims that were not measured.

---

## 5. WHAT HAPPENS NEXT (not your job, but it shapes your output)
A script resolves your JSONL through `vocabulary.mjs` into the 31 axes and writes the dossiers.
Cells that do not resolve stay empty and the species stays RED — visibly, in demand order.
Then the alias tables get widened from your "will not resolve" list, and **the same pipeline runs
the remaining 64 rows, and after that every town.**
⇒ ⭐ **Which is why the resolve rate matters more than the 20 files.**
