# HANDOFF — the ground refine must scale to a CDP (Altadena won't bake with terrain)

**Agent: FRESH** (not Boz — do the job and the gate, nothing more).
**Route first** (CLAUDE.md): `ORIENTATION.md` → `README §⭐ START HERE` → **`HANDOFF-altadena-pour.md` §OPEN #1** (the arc this came out of) → `cartograph/bake-ground.js:50-106` (the refine doctrine — **read it before forming a plan**).
**Worktree.** Isolate. **Surface scope drift** — if the answer isn't where I've pointed you, say so rather than forcing it into my framing.

---

## The job, in one line

**Make the ground refine produce a sane mesh for a CDP-sized hood, so Altadena can be poured with terrain instead of flat.** Jacob's ruling (2026-07-15): *"The neighborhood should not be poured flat. The elevation data should be baked in the step between the Design tools and the Stage."* Everything for that is done **except this.**

## The state (verified — don't re-derive)

- **Altadena's elevation is fetched and baked.** `data/altadena/raw/elevation.tif` (434 MB, USGS `n35w119`) · `clean/terrain.{json,bin}` (1750×1750 @ 5 m, elev 221→1,701 m, 0 misses, **0.7 s**). Nothing to do here.
- **`bake-terrain.js` is already scene-generic and already runs between Design and Stage** — exactly where Jacob wants it. *"No installation is privileged: LS bakes through the exact same path as every poured town."* **Altadena was flat only because nobody had fetched its DEM.**
- **`ground.bin` is currently 43 MB / 2.1M tris, flat-baked** (terrain held aside). Loadable. Not what we want.
- **With terrain, `bake-ground` produces 26.3M tris / 457 MB / 88 min CPU.** That is the blocker, and it is the whole job.

## ⛔ What is ALREADY DECIDED — do not redesign

**The adaptive refine is correct and is already the default.** `bake-ground.js:59`:

> `GROUND_REFINE="adaptive"` (default) swaps the uniform edge test for a **terrain-deviation test**: split only where the heightfield bends enough that a coarser triangle would lift its interior off the terrain by more than `GROUND_REFINE_TOL_M`. **Flat blocks stay coarse; the steep park band stays fine.**

That **is** Jacob's spec, verbatim: *"I don't think we need fine ground detail and in flat sections we can let it be flat."* **The logic is not the bug. Do not rewrite it. Do not "add" adaptivity — it's there.**

## The actual bug: the constants are LS-shaped

```js
const GROUND_REFINE_TOL_M      = 0.50;   // half-metre fidelity
const GROUND_REFINE_MIN_EDGE_M = 6;      // hard floor
const GROUND_REFINE_MAX_EDGE_M = 64;
```

**LS is 892 m radius and *"locally planar — median ~1.4 cm deviation over a 30 m edge"*, so `TOL=0.50` splits almost nothing. Altadena is 4,161 m radius (69× the area) with a mountain in it — 1,480 m of relief and real canyon crinkle — so the same test splits EVERYTHING, down to the 6 m floor, across kilometres.** 26M triangles is the correct answer to the question those numbers ask. We asked the wrong question of the wrong hood.

**`MIN_EDGE` is the lever** — it caps the worst case over Altadena's 8,742 m span:

| MIN_EDGE | worst-case quads | |
|---:|---:|---|
| 6 m *(today)* | 2.1M | **26.3M tris · 457 MB · 88 min** |
| 24 m | 133k | ~16× less — lands near the flat bake's 2.1M tris / 42 MB, **but conformant** |
| 32 m | 75k | ~28× less |

## The proposal — Jacob has NOT ruled on it. Stand up before you build.

A **per-hood knob defaulting to today's values**, living next to the extent SSoT in `cartograph/data/<scene>/neighborhood_boundary.json` — so **LS keeps `6 / 0.50` and bakes byte-identical**, and Altadena declares something coarser. Jacob's own rule from the cull: *"the margin is a **knob** (`nb.contextMargin`), never hardwired."* Possibly span-seeded (Altadena is 69× LS), operator-overridable later — the same "automatic now, editable band later" shape.

**Do the cheap experiment FIRST, before designing the knob:**
1. In a **worktree**, override the constants locally (`MIN_EDGE=24`).
2. Bake Altadena's ground **once** (~2–5 min by the arithmetic).
3. Put it on **Jacob's eye**. Does coarse-but-conformant read right?

If yes, the knob is a small safe change. If no, we've learned it for one bake instead of another 88 minutes.

> ### ⚠️ The doubt to carry into the standup (this may reframe the whole task)
> The deviation test spends detail **where the terrain bends** — on Altadena that's the **mountain**, i.e. **where nobody walks**. The town is in the flat south and gets almost none. **The current tuning optimises the scenery and starves the product.** The right answer may not be a global floor at all, but something that knows *ground people stand on* from *backdrop*. This was raised and deliberately **not** designed at 4am. Raise it with Jacob before you assume `MIN_EDGE` is the whole answer.

## The gate

- **LS must bake BYTE-IDENTICAL.** It's PROD. If the knob defaults to today's values, `ground.bin` must not move by a byte. Prove it — don't assert it.
- **Jacob's eye on Altadena.** Triangle counts are not the gate; the operator's eye is (`feedback_proxy_render_is_not_the_operator_eye`). Coarse-but-conformant either reads right or it doesn't.

## Constraints — each of these cost this session real money

- ⛔ **Do not touch Lafayette Square.** PROD. Read it as a control if you like; never bake it.
- ⛔ **`bake-ground.js` standalone STRIPS `ground.json`.** It writes a FRESH manifest; **`bake-ground-ao.js` is what adds `poolmap`/`colormap`/`lightmap`.** So every standalone ground bake silently drops all three — the PNGs stay on disk, nothing *looks* broken, and the slab renders with no pool reflections / colormap / baked AO. **Recovery: re-run `bake-ground-ao.js --look=<id> --scene=<id>` (~48 s; terrain is not one of its inputs). Verify by diffing `ground.json`'s key set against LS's.** This bit us twice.
- ⛔ **Measure on a copy; CAP the experiment.** An uncapped measurement bake ran 88 minutes and overwrote the slab with 457 MB. `serve.js` caps the ground step at 300 s for a reason.
- **`console.time` is wall-clock — it measures STARVATION, not work.** Don't trust a timer whose callback was queued behind a blocked main thread.
- Don't fix the load (done: ~180 s → ~18 s). Don't touch the mountain (`bake-landscape` — a separate open item; **it does not touch this one**, both are just "too much geometry").

## Deliverable

The one bake, on Jacob's eye, plus a recommendation: is `MIN_EDGE` the knob, or does the doubt above mean the test needs to know product-ground from backdrop? **Then** the knob, if he rules for it — with the LS byte-identical proof.
