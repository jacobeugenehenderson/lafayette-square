# BRIEF — The Arborist as a Fashion Plates kit for trees

<!-- BRIEF-STATE
status: OPEN
dispatched: 2026-09-25, to Marram (session lafayette-square-nosync-89)
written: 2026-09-25
evict-when: every plate in the library is labelled and browsable by trait; each town's Grove lists its FIA-ranked likely species with each one composed, suggested or missing; composing a species is a plate-swap Jacob can ratify; and at least two towns' groves look visibly distinct, built from what the library already holds.
-->

**Status:** dispatched to **Marram**, who works with Jacob directly in its window. Boz drafted it 2026-09-25.

## Jacob, in his words

> *"The point of the Arborist is to create likely groves."* · *"It's meant to be a fashion plates-style kit for trees."*
> *"We were already on this track, we just had everything set up for human analysis and I just could never get to it. Theoretically, all the groves could be very different from each other and each map could look really distinct with the groves we already have."*

## What it is

A tree is an outfit of interchangeable **plates**:
- the **skeleton** (trunk and branch chassis: the silhouette, the habit);
- the **bark**;
- the **leaf or needle**;
- the **crown** (density, colour, season).

A **species is one combination of plates**, recorded with its provenance per plate: **S**ame species, same **G**enus, or **T**rait only.

The machinery exists: the Salon composes, the Grove holds a town's roster, dossiers carry each species' traits, and the rubric ranks near matches. **What's missing is the analysis Jacob never had time for:** labelling the plates and doing the matching. That's your job. **Jacob's is to steer and ratify.**

## The work, in order

1. **The plate shelf (Category A, approved):**
   - every chassis, bark and leaf is labelled by species or genus and by trait;
   - the embedded vendor barks and leaves are indexed;
   - the rubric holes are filled (`conical`, `fissured`, `scale`);
   - the raw species directories are chassis-ized.

   Browsable by trait. A check: every plate names its species or genus, or says why not.
2. **The likely-grove list per town:** FIA by county, most common first (`scripts/15-fia-tree-mix.mjs`, ruled 2026-09-25). Each species shows **composed / suggested / missing**.
   - ⚠️ A sample-size rule is owed (huron's county has one plot per species): widen county → survey unit → state, loudly; the minimum is Jacob's call.
   - ⚠️ So is his ruling on **street trees vs woods** (FIA samples forest).
3. **Build, then swap:** for each listed species the kit BUILDS it from the best plates by evidence (S > G > T, trusting filenames), marked `auto` with per-plate provenance. The operator swaps any plate later.
   - ⚠️ **Owed rulings:** does a suggested species ship immediately as **unratified**, or wait for his ratification? And which dossier sources are allowed? (USDA PLANTS + the USFS Urban Tree Database are federal and cleared; NCSU and SelecTree need his OK.)
4. **Distinct towns:** show two towns' groves side by side, built only from what the library holds, so the claim that every map can look distinct is **seen**, not asserted.

**Priority for showing Provincetown:** pitch pine, black oak (its exact leaf exists) and scarlet oak. The fastest same-species builds are black locust and white willow.

## Bounds

- ✅ **RULED 2026-09-25 (Jacob):** *"Let's assume filenames are helpful and use chassis pieces we already have and then a human operator can look at the tree the system builds and swap out any element for something better."* So the system BUILDS each species automatically from existing plates (trusting filenames and meta), and it ships marked **auto**. The operator reviews the built tree and swaps any plate. There's no ratification gate before a tree appears.
- A plate-swap or new composition that changes what ships says so, and needs a Salon republish + a Grove re-capture.
- `arborist/serve.js` runs under `--watch`: run `node scripts/bake-in-flight.mjs --quiet` before saving what it imports.
- Record rulings in `arborist/ARCHITECTURE.md`, net-down.

## Read first

- `arborist/ARCHITECTURE.md`;
- `arborist/README`;
- `TREE-INTAKE.md`;
- `INTAKE-CATALOGUE §1`;
- your own piece inventory (2026-09-25).
