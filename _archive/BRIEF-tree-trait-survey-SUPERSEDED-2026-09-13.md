# BRIEF — survey the world's tree-trait data BEFORE we design the table

**Research task. Output is a written survey + a mapping, NOT a filled table.**
⛔ Do not start collecting species values. That is phase 2 and it depends on this.

---

## 0. THE INVERSION — why this brief exists

We have 19 axes in `arborist/rubric.json`. **We invented them.** Writing a research
brief against them would bake our blind spots into a one-time, expensive collection.

⭐ **Jacob, 2026-08-24: "look into the data out in the world and find what we have access
to, and then see how that aligns with our axes — AND leaves additional knobs for future
functionality if we decide."**

⇒ **The world's formalized records are the source of truth for what is knowable about a
tree. Our axes are a guess at what we need.** Find the former, then compare.

---

## 1. WHAT TO FIND

Structured, **field-per-trait** tree data — not prose descriptions we parse. For each source:

- **Fields it actually carries**, verbatim, with their controlled vocabularies
- **Species coverage** — does it cover North American street trees, and how deep
- **Access** — API / bulk download / scrape-only; licence and attribution terms
- **Granularity** — e.g. is "bark" one field or several; is habit a term or a code
- **Authority** — who maintains it, how it is cited

⛔ **VERIFY, DO NOT ASSUME.** Report the fields you actually observed and say where you saw
them. A plausible-sounding schema that turns out to be wrong is worse than a short list.

**Candidate starting points (unverified — confirm or discard each):**
USFS *Silvics of North America* · USDA PLANTS · Missouri Botanical Garden Plant Finder
(St. Louis — same region as our first town) · arboretum plant-finders (Morton, Arnold) ·
TRY Plant Trait Database · GBIF / Encyclopedia of Life trait records · i-Tree / OpenTreeMap
species lists · municipal street-tree inventories · standard dendrology keys.
⭐ Also look for the **arboricultural / forestry** vocabularies, not just botanical ones —
crown density and crown ratio are FIA metrics; lean and age class appear in tree-risk
assessment standards. Those cover things pure botany does not.

---

## 2. THEN MAP IT AGAINST OUR AXES

Our 19, verbatim:
```
chassis.habit  chassis.size  chassis.lean  chassis.density
bark.type  bark.color  bark.groove_depth  bark.plate_size
bark.scale_frequency  bark.exfoliation_density
leaf.silhouette  leaf.ways  leaf.size  leaf.face  leaf.color
leaf.season  leaf.occupancy
overlay.type  tree.age
```
▶ `node -e "const r=require('./arborist/rubric.json');const a=r.axes||r;for(const x of (Array.isArray(a)?a:Object.values(a)))if(x&&x.id)console.log(x.id, JSON.stringify(x.values||x.enum||x.options||null))"`

**Produce a three-column verdict for every axis and every source field:**

| verdict | meaning |
|---|---|
| **ALIGNED** | a source field maps to our axis. Give the field name and its vocabulary, and say whether their terms ≡ ours or need aliases. |
| **GAP** | our axis exists and nothing out there records it. Say so plainly — it means it is an authoring knob, not a research target. |
| ⭐ **SURPLUS** | the world records something we have **no axis for**. **This is the most valuable output of the brief.** Name it, describe it, and say what it would let us do. |

⭐⭐ **JACOB'S STEER, AND IT IS THE POINT OF THE WHOLE BRIEF: "if there are a lot more than
19 then so much the better."** ⛔ **Do NOT trim the survey to fit our axes. Do not stop at
19, or 40.** A trait that has a controlled vocabulary and covers our species is worth
recording even if nothing in the app reads it today — collection is the expensive step and it
happens ONCE. **Breadth now is cheaper than a second pass later.**
⭐ Assume the SURPLUS column is the biggest one. `leaf.face` turned out to be
**adaxial/abaxial**, exhaustively described; crown density is a formal forestry metric; lean
and age class live in tree-risk standards. Several axes we assumed were "ours" have real
vocabularies — **expect the same in reverse: traits nobody here thought to ask for.**

---

## 3. THE RULES THAT CONSTRAIN THE ANSWER

- ⛔ **No confidence scores.** *(Jacob's ruling.)* "Botanicals are exhaustively described;
  if we can't get a ≡ then we just don't promote the species." A value either resolves into
  a controlled vocabulary or the cell is empty. Empty = the species stays RED. No partial
  credit, no heuristic middle.
- ⭐ **Controlled vocabularies are the prize.** A source with free text is worth much less
  than one with a fixed term list, because a fixed list can be aliased into ours once and
  then never interpreted again (`arborist/vocabulary.mjs`).
- ⛔ **Do not design our schema in this brief.** Report what exists. The schema decision is
  Jacob's, and he makes it after seeing the SURPLUS column.

---

## 4. WHY IT MATTERS — the state this unblocks

The Arborist is a parts MIXER: ask for a species, compose it from chassis + bark + leaf on
hand (`arborist/ORIENTATION.md §1`). The join between demanded species and held parts is the
app's real backlog, and it is empty. Measured 2026-08-24:

- **180** distinct raw species names in the LS census; **20** resolve to anything we know.
  ⭐ **160 do not — that is the red list, and it is the row list for phase 2.**
  ▶ `arborist/vocabulary.mjs` — `resolveSpecies()` / `searchSpecies()`
- **4 of 239** chassis have a ratified habit; **0 of 9** bark and **0 of 18** leaf packs are
  ratified at all.
- London Plane is heavily represented in Lafayette Square and appears in **no** look, **no**
  grove, and **no** library row — because nothing could name it.

⇒ A trait table keyed to controlled vocabularies is what lets the mixer answer *"what does
this species need"* without a human deciding it species-by-species.

---

## 5. DELIVERABLE

A written survey: sources found (with observed fields + vocabularies + access terms), the
three-column mapping, and a short recommendation of which one or two sources to build on and
why. **No table, no collection, no schema.** Then Jacob decides.

⛔ **`vocabulary.mjs` is the intake contract.** Whatever is recommended must be expressible as
terms that resolve through it, or it becomes a 20th set of names nobody can match — which is
the exact problem this whole thread started with.
