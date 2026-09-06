# BRIEF — the rim census: the chain population, before anything is turned on

**READ-ONLY. Measure only. ⛔ Turn nothing on, fix nothing, edit no `src/`. ⛔ Do not propose the fix —
the design below is RULED and is not yours to revisit.**

## The ruled design (Jacob, 2026-09-05) — this is context, not a question
- **The circle is a line segment like the streets.** It joins the **same** expand-and-unite. ⛔ There is
  no separate boundary construction and no sliver hazard from a boundary that lies on top of a street —
  at ε, two co-located lines unite into one line.
- **⛔ NO STREET IS CHOPPED AT THE CHAIN LEVEL.** The chains are the **full bb**. The chains + the circle
  make the protopolygon.
- **The outer edge lives under the fade, so it can be almost anything** — whatever is easiest. Build the
  whole bb of streets and blocks and **only SHOW the stamped circle.** ⇒ the rim is a **rendering**
  question, not an authoring one: there is no unauthorable rim edge to solve and no sidewalk-termination
  rule to invent, because nobody sees it.
- **⭐ "The edge gets faded but AFTER it's drawn."** The fade is a look, applied last.
- **Fragmented chains are a SKELETON defect** (welding fragments is what the skeleton is for), not a
  consequence of restoring anything.

## ⭐ THE FINDING THIS CENSUS EXISTS TO SIZE
`cartograph/pipeline.js:172` — **`keepR = max(fadeOuter, discR) + 30`**. The clip **fuses two different
jobs into one radius**: *what is the neighborhood* and *what do we ship*. And it answers both with a
number derived from **`fadeOuter`, a render knob** — so the fade reaches **backwards** to decide what
gets drawn at all. `clipRun` (`:196`) then trims each polyline and **keeps only the longest inside run,
silently discarding the rest.** ⇒ **Chop at the BAKE, never at the chain.** Size what that costs today.

## ⛔ ROUTE FIRST — read to the section, and open the code, before forming a plan
`ORIENTATION.md` → `README §⭐ START HERE` → `cartograph/PREBAKE.md §2.5` + **`§2.5a`** →
`cartograph/RIBBONS.md §1` ("✅ THE OUTER POLYGON — SETTLED" · the grout ruling · STATE OF THE BUILD).
**Code:** `cartograph/pipeline.js` `:140`–`:280` (`keepR` `:172`, `clipRun` `:196`) ·
`cartograph/derive.js:4632–4648` · `scratch/gate-a-grout-holes.mjs`.

## ⭐ PREMISES ARE CLAIMS. Confirm each at the line and SAY WHAT YOU FOUND. If the code contradicts this
brief, **STOP AND FLAG IT** — that is the work, not an interruption of it.
- **P1** The clip runs after `deriveLayers`, before the `map.json` write, gated on a bare `existsSync`.
- **P2** `clipRun` keeps only the longest inside run and discards the rest silently.
- **P3** The clip manufactures rim tips at exactly `keepR`, which the cap machinery then rounds — so a
  chopped street renders as a cul-de-sac.
- **P4** `keepR` is a circle whose radius comes from `fadeOuter`, while `RIBBONS §1` settles the outer
  polygon as the raw `neighborhood_boundary.json` and rejected letting a render knob decide topology.
- **P5** Gate A subtracts the grout from a stencil of the **frozen tile rings**, which are *post-clip* —
  so the grout currently inherits the clip's damage.

## The four questions. Numbers only.
⛔ **Never write the EXPLANATION of a number — only the number.** If a mechanism is not measured, write
**"cause not established"** and stop.

1. **POPULATION.** Chains in the bb; how many survive the clip **whole** / **clipped** / **dropped
   entirely**. Count the discarded runs and their total length. **This is the bill the clip is charging.**
2. **FRAGMENTS — as a skeleton defect.** How many chains have **≥2 inside runs**, and what are the gap
   lengths? Report it as skeleton fragmentation to be welded. ⛔ Do not frame it as a risk of restoring.
3. **THE FADE COUPLING.** What is `fadeOuter` on each scene, what `keepR` does it produce, and **how many
   chains does that specific number decide the fate of?** If `discR` dominates on some scenes and
   `fadeOuter` on others, say which and by how much — that is the difference between a latent coupling
   and a live one.
4. **THE SHIPPING BILL.** What is the clip actually buying? `PREBAKE §2.5` claims `map.json` 180 → 52 MB,
   ribbons 22 → 8 MB, streets 2117 → 300 on a wide fetch. **Reproduce it or mark it unreproducible.**
   This is the number that tells us where the bake-time crop has to land.

## Scenes
Run **`lafayette-square`, `hipointe-demun`, `altadena`**. ⛔ **`ksi-y-m-yn` and `centrum` are DEAD** — if
a sweep reports them that output is **noise**, and ⛔ **not a licence for a skip list.**

## Rules
- ⛔ **NO FALLBACKS.** A scene missing an input is reported **LOUDLY by name** and skipped, never
  defaulted. A silent substitution inside a census is the defect.
- ⛔ **Re-derive every number; quote none from a doc, including this one.** Every figure carries the
  command that reproduces it.
- ⛔ **A difference between blocks is the product**, never by itself evidence of a bug. Measure with the
  scene's authored state loaded (`design.json` / `blockCustoms`), never with authoring off.

## Deliverable — ⭐ ONE CHECK, NOT A DOCUMENT
`scratch/claims-rim-census.mjs`, which **reads the source** rather than restating it, prints all four
answers, and can be re-run. **No new `.md`.** Reply with **≤10 lines**: the four headline numbers plus
anything that contradicted P1–P5. The corpus is already the problem; do not add to it.
