<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26 · REWRITTEN 2026-10-04 as the shore MEDIAN (Jacob, Huron punch list); the 09-26 body is in cartograph/_archive/BRIEF-the-shore-is-closed-2026-09-26.md
evict-when: every town with water carries the shore median as a baked, inspectable region; every point of it holds a treatment from the grain continuum; a render-side walk of every shore finds zero views of the sky dome or a building foundation riser, and is seen to FAIL when one treatment is removed; Jacob has walked Huron and Provincetown at the water's edge, near and far.
-->

# The shore median: the space between the coast chain's two sides, and what fills it

**You are the dispatched agent. Name yourself: one word, yours, and not one a RUNNING session holds** (`ListAgents`, then
ask Jacob to `/rename`). **Agent: FRESH.** The shore's earlier agents (Strand, Revetment, Loam) are gone, and this brief
changes the representation they built on, so a warm context would carry the old frame.

## The ask (Jacob, 2026-10-04, verbatim)

> *"The shoreline is a 2D concept. The protopolygon already splits chains into two sided chains; I am bringing that up so
> that we can determine, fundamentally, where the shoreline is as opposed to the waterline. I believe this is the median
> problem revisited. The revetment itself is challenging to discuss without first really determining the space it's
> supposed to occupy; if we take as a granted that 'boulders would only go in a space this big' there are many spaces
> smaller than that in ever growing/shrinking median space. Right now that means lots of gaps where we have neither
> revetment nor gravel or sand or anything. The revetment currently stops abruptly in a rather hard line, then there is
> exposed geometry between the shoreline and itself. I think we need a material that can anticipate that median, and fill
> it with size-appropriate objects. Where it's widest, we have boulders which give way to rocks which in turn become
> gravel which is finally sand. Perhaps someday we have a way to select 'steel' or 'concrete' as a replacement for
> boulders; perhaps we have a knob that says 'Long Island beaches only get to this level of small-grain sand/is gravel'."*

And from the punch list: **"Nothing fits" must never mean "nothing exists."** · no valid shoreline condition may expose
the void · **study before deployment** — ⛔ do not close gaps by extending revetment geometry by hand or adding filler to
one Ward · proving grounds **Huron and Provincetown**, neither encoded as the special case.

## The rulings (Jacob, 2026-10-04)

1. **The median is the space between the coast chain's own two sides, and its edges have nothing to do with water.**
   ①'s two-sided split of the coastline gives a LAND side and a WATER side (`ROADMAP H-4`); the median is the space
   between them, the road median's construction. *(Jacob chose this, option (a), over (b) the bed / visible depth;
   relayed by Shingle 2026-10-04. It replaces Boz's first draft, which put the outer edge at visible depth below the
   lowest water.)*
2. **The water moves inside the median and never bounds it.** Huron stays at its mean / recorded average level; its
   "tide" comes in with storms, and that touches only the wet look. ⇒ No low-water sourcing for Huron, and Provincetown's
   high-water flood landward of the drawn shore (208 ha at MHW, `terrain.json` `water.flood`) is no longer a contradiction.
3. **The treatment continues under the water to visible depth** (Jacob, 2026-10-04: *"that would be ideal, yes"*, given
   before ruling 1 was corrected). ⚠️ How that relates to the median's water-independent edges is not ruled; ask before
   building it.
4. **The grain continuum is a TRANSITION, not a map over the whole shore.** Boulders → rocks → gravel → sand: one treatment
   hands off to the next **as the space narrows**. The finest end is a surface, so there is no width at which nothing is
   drawn.
5. **Regime is a separate axis that bounds the grain range:** stone today; steel or concrete may replace boulders; a beach
   may cap the coarsest grain or omit large objects.
   ⚠️ **OWED — confirm with Jacob before building any regime control.** On 2026-09-21 he ruled *"no authored parameters —
   derive"* for the revetment (`BRIEF-boulder-revetment §6`). Boz's reading, NOT yet ratified: the regime is **derived** by
   default from the predicates that already exist (`shore-armour.mjs` `HARD_TAGS` / `SOFT_TAGS` / `SOFT_LU`), and the knob
   is an operator **override** on that default. Ask; don't assume.

## What the code does today — read in source by Boz 2026-10-04. ⛔ Confirm each before you trust it.

| what | where |
|---|---|
| armour is **binary**, decided by bank **height** against one stone's size: `armour: h >= MIN_ARMOUR_D50_M`, else `'below-one-course'` | `cartograph/shore-armour.mjs:200` (`shoreArmourFor` :164; `MIN_ARMOUR_D50_M = 0.5` :71) |
| stone size is a function of **height**, clamped 0.5–1.5 m | `cartograph/shore-armour.mjs:74` (`d50For`) |
| the bake labels a bare SHORE station from `shoreArmourFor` (above); `bake-revetment.js:563` is the breakwater/groyne walk's own `below-one-course` | `cartograph/bake-revetment.js` (`bakeRevetment` :188) |
| where armour stops, the heap tapers to nothing at `crest / tan(repose)` | `src/lib/revetmentFromSlab.js:62` (`crestAndEnds`) |
| the bed under the water, to visible depth | `cartograph/bake-terrain.js:571` (`writeBed`; visibility :586) |
| water levels and the tide clock (wired: `tidePhase` → `cartograph/tide.mjs` `tidePhaseClock`) | `cartograph/waterLevel.mjs:26` (`tidePhase`), `:39` (`waterLevels`); `BRIEF-tide.md` |
| the coast's id in the slab | `cartograph/shoreRuns.mjs:10` (`WATER_EDGE_SKEL`), `waterRuns` :13 |
| the shore is bare of curb/sidewalk | `src/lib/tileGround.js:4625`, `:4634` (`shoreAt`) |
| sand, and how far it reaches inland | `cartograph/surfaces.mjs:39` (`sand`), `:58` (`beachBandM`) |
| the renderers | `src/components/SlabRevetment.jsx:84` · `InstancedBoulders.jsx` · `src/lib/shoreChunks.js` |

⇒ **Boz's inference, unverified:** the grain is sized by **how tall the bank is**, while the ruling sizes it by **how wide
the space is**. If so, that is the root of "boulders only in a space this big," and it is a different input, not a
different threshold. Confirm or refute it in code before anything else.

## Measured 2026-10-04 (Boz): every shore check is GREEN, and Jacob sees sky

| check | Huron | Provincetown |
|---|---|---|
| `claims-the-shore-is-closed` | 11.96 km walked, none bare | 51.11 km walked, none bare |
| `claims-every-metre-of-drawn-shore-is-named` | 9.03 of 11.79 km armoured · bare: **1.37 km below-one-course**, 1.16 km soft-shore, 0.07 km stub | 2.03 of 50.39 km armoured · bare: **47.68 km soft-shore** |
| `claims-the-armoured-shore-is-never-empty` | ✅ — and it says itself it does NOT prove the geometry reaches the screen | ✅ |
| `claims-every-mapped-stone-structure-is-stone` · `claims-a-level-body-has-one-surface` | ✅ | ✅ |

⇒ **The instruments cannot see the defect.** `the-shore-is-closed` asks whether there is ground under a point on the
shore line — a heightfield question. The void is a **render** outcome: a ray passing between separately generated
geometry (revetment, ground, bed, building foundations). And `every-metre…-is-named` **passes a bare metre if its reason
has a name**, which the rulings above now forbid. Re-run all five yourself; don't quote this table.

## The chain — what this trusts, and what trusts it

- **Trusts:** ①'s two-sided coast chain (`ROADMAP H-4`) · the bed (`writeBed`) and the real floor (`BRIEF-bathymetry.md`)
  · the town's water levels (`waterLevel.mjs`; `BRIEF-tide.md` — levels ours, timing NOAA). The water level sets no edge (ruling 2).
- **Trusted by:** `bake-ground.js` (the `bed` ground group) · the revetment renderers · the sand surface and its ground
  rules (`surfaces.mjs` `duneGrass` reads `beachBandM`) · the water shader's shallows · future pier footings.
- ⭐ **The constraint crosses topics, so it belongs in a check:** *every point of the median holds a treatment.* That
  check travels with the operation, not with any one doc.

## The work, in order. Stop and report to Jacob at the end of each step.

0. **Confirm the premises.** Read this brief, `BRIEF-boulder-revetment.md` (all of it: §5 the cross-section, §6 the rulings
   and the predicate), `cartograph/BAKE.md`'s shore rule and the bed, and `ROADMAP H-4`. Open every code site above. Tell
   Jacob what you found, especially the height-vs-width inference. ⛔ If the code contradicts this brief, stop and flag.
1. **The median as a region, made visible.** Build it per town from the two edges in ruling 1. Make it independently
   visible as a **solid diagnostic region with every treatment off**, on the production surfaces (Stage/Preview — ⛔ not a
   scratch SVG or a parallel renderer). The view must let Jacob tell apart three failures:
   **(a)** the median geometry is missing or wrong · **(b)** a treatment failed to generate · **(c)** a bake/runtime
   seam or a precision failure.
2. **The void instrument — before any fix, and it must FAIL today.** A walk of every shore, from the water side and the
   land side, near and far, on the production render, counting views that reach the **sky dome** or a **building
   foundation riser**, each with its coordinate and which of (a)/(b)/(c) it is. Jacob already sees gaps, so a green first
   run means the instrument is wrong. Mutation-test it: remove one treatment and watch it go red. Derive the walk step
   from the terrain grid, not a constant.
3. **The treatment rules, on paper, to Jacob — before any build.** Grain as a function of local median width; the
   boulder → rock → gravel → sand handoffs; where placed objects hand off to a surface material (that seam is the
   still-open "revetment bottom edge" item from 2026-09-27, which this absorbs); how the regime bounds the range; the
   wet/dry look from the moving waterline. Every number carries a unit and a source; ⛔ no constant whose value happens
   to suit one town (`CLAUDE.md` Layer 0, Class D).
4. **Build, on Jacob's go.** Then the three-part fix: the binary armour gate and the "named bare passes" semantics are
   **removed**, not left beside the new path (`claims-every-metre-of-drawn-shore-is-named` changes meaning — rewrite it,
   don't leave it green beside the new check) · registers `cartograph/BAKE.md` (the shore rule), `OPERATIONS`,
   `FEATURES` · superseded text to the Diary.

## Can the instrument see the change?

The existing checks read **baked artifacts on disk**; the void is a **render** outcome. So step 2's instrument must look
at the rendered production surface, and a re-bake is needed before any artifact reflects a change. **Eye-gate surface:**
Preview, Huron and Provincetown, ⛔ from the water **and** from the street, close up (*"if it looks nice we'll get close
to it to show it off"*).

## Bounds

- ⛔ No pour or bake without Jacob's go in your window. LS is untouched (its pond is drawn outside the slab and is not
  walked — say so in the check's output, as the current one does).
- ⛔ No hand-extended revetment geometry, no per-Ward filler, no skip list.
- Commit only your own paths (`git commit -- <paths>`); the tree is shared. Ports 5173 / 5180; reuse the running servers.
- Surface scope drift; don't absorb it.

## Not this brief (homes elsewhere)

- **Piers and decks** — three rulings owed by Jacob (floating dock height · untagged pier material · metal decks); the
  record is in `cartograph/_archive/BRIEF-the-shore-is-closed-2026-09-26.md` ("STRUCTURES OVER WATER").
- **Water look** (horizon shimmer, foreground glint, ripple quantization, opacity, colour bias) — `BRIEF-water-glint.md` /
  `BRIEF-water-shader.md`.
- **Each town's water clarity** (`references/` q-water-clarity-per-town) · **real depth** — `BRIEF-bathymetry.md`.

**The instruction is confirm-then-build:** read both, tell Jacob what you found, and if the code contradicts this brief,
stop and flag him. **The stop is the deliverable, not a failure of the brief.**
