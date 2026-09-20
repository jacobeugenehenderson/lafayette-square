<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20
evict-when: node checks/claims-a-bake-step-declares-what-it-reads.mjs
-->

# BRIEF — A BAKE STEP MUST DECLARE EVERY FILE IT READS

*Written 2026-09-20 by the coordinator seat, after it happened to Huron in front of the operator.*

> ### ⛔ THE INCIDENT, IN ONE PARAGRAPH
> Huron acquired elevation for the first time and baked terrain successfully. Its **3,678 buildings
> stayed at `centroidY = 0.00` — all 198,738 vertices — and were rendered UNDERNEATH 24.29 m of new
> ground.** Jacob, looking at it: *"when I pan the camera below the ground I can see all the
> buildings are already there on their risers, but not lifted high enough to track the ground."*
> A plain re-run of `bake-buildings` fixed it instantly: **`centroidY` 1.41 → 13.40 m, 198,738/198,738.**
> ⭐ **Nothing was broken. The step simply never re-ran.**

---

## 1. You are the dispatched agent. Name yourself — one word, yours.
## 2. Agent: **FRESH.** ⚠️ `cartograph/serve.js`'s bake chain is the subject; check `git status` first — several sessions have been in that file today.

## 3. ⛔⛔ THE DEFECT: A STEP CONSUMES A FILE IT DOES NOT DECLARE

`runIfDirty(label, INPUTS, OUTPUTS, cmd)` skips a step when its outputs are newer than its inputs.
⇒ **A file a step READS but does not LIST cannot invalidate it. Ever.**

**`cartograph/bake-buildings.js:687`** — reads the terrain, explicitly, to seat every building:
```js
const terrain = loadSceneTerrain(scene) || { getElevationRaw: () => 0 }
```
**`cartograph/serve.js:2331`** — its declared inputs:
```js
[MAP_JSON, DESIGN, join(here, 'bake-buildings.js')]          // ⛔ no terrain
```

⭐⭐ **AND `ground` GETS IT RIGHT, WHICH PROVES THE SHAPE IS KNOWN** — `:2325` lists
`SCENE_TERRAIN_JSON, SCENE_TERRAIN_BIN` among its inputs. **Somebody fixed one consumer and not the
others.** That is why this is a class, not a bug.

### THE SUSPECTS — ▶ verify each, do not inherit this table
| step | `serve.js` | declares terrain? | reads it? |
|---|---|---|---|
| `ground` | `:2324` | ✅ **yes** | yes |
| **`buildings`** | `:2330` | ⛔ **NO** | **yes — `bake-buildings.js:687`** |
| `lamps` | `:2394` | ⛔ no | ⚠️ **unverified — lamps are seated on the ground too** |
| `trees` | `:2452` | ⚠️ via `treeInputs.inputs` — **resolve what that actually contains** | — |
| `tree-anchors` | `:2479` | lists `ground.json`/`ground.bin` — ⭐ **maybe sufficient, since ground is terrain-derived. ESTABLISH IT, do not assume.** |

⛔ **Terrain is the instance we caught. IT IS NOT THE ONLY EDGE.** ▶ **The deliverable is the audit:
for every `runIfDirty` in the chain, does its input list contain every file the script opens?**

## 4. ⚠️ WHY IT IS WORSE THAN A STALE ARTIFACT
- **It is silent.** The bake reports success. Every step is "unchanged", which is the correct word
  for the wrong reason.
- ⭐⭐ **It only fires when an input arrives LATE** — so it is invisible on a town poured in the usual
  order and hits a town that acquires something afterwards. ⇒ **It will bite altadena, HPDM and every
  future town the day they gain elevation**, exactly as it bit Huron.
- ⛔ **A `--force` bake hides it.** Forcing fixes the symptom and teaches the operator to force, which
  is how a dirty-graph bug survives for months.
- ⚠️ **`elevation.js:32` records the same class happening BEFORE:** *"y=0 — buried under 2.6–34.8 m
  of terrain."* **This is its second documented occurrence.**

## 5. ⭐ THE CHECK IS THE DELIVERABLE
> **Every file a bake script reads appears in that step's `runIfDirty` input list.**

▶ `checks/claims-a-bake-step-declares-what-it-reads.mjs`. ⛔ **It must READ BOTH SIDES** — parse the
input arrays out of `serve.js` and parse the reads out of each script — **never restate either.**
⚠️ Static analysis will not catch a dynamically-built path; ⭐ **where it cannot tell, it must say
UNKNOWN and name the step — not pass.** A check that silently skips the hard cases is the same
disease one level up.
⛔ **MUTATION-TEST IT:** remove `SCENE_TERRAIN_JSON` from `ground`'s input list and prove it goes red
naming `ground`.

## 6. Write/commit bounds
**In bounds:** `cartograph/serve.js`'s input lists · the new check · `cartograph/OPERATIONS.md` if the
operator-facing story changes.
⛔ **OUT:** the bake scripts' internals · anything about WHAT they produce. ⭐ **This brief is only
about the DECLARATION.** If a step reads something it should not, that is a different finding —
surface it, do not fix it here.
⚠️ **Re-baking a town is how you verify; huron is safe. LS, HPDM and altadena are not yours to re-bake.**
⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.**

---

## What "done" looks like
1. Every `runIfDirty` input list contains every file its script reads — **or the gap is named.**
2. A check proves it, **seen to fail** on a removed input.
3. The audit's result is **reported as a count**, whether it is 1 gap or 6.
4. ⭐ Huron re-bakes from cold and its buildings are seated **without `--force`.**

---

> # ⭐⭐ THE GATE THIS BRIEF IS ACTUALLY JUDGED ON
> ⛔ **"Does it look good" is not an eye-gate.** The gate here is mechanical and total: **is the
> element present and correct.** Buildings seated · counts unchanged · the check red before green.
> ⭐ This brief has no aesthetic component at all, and that is a feature — **it is the purest case of
> the rule: a wrong element that looks plausible.** Buried buildings render happily and report success.
