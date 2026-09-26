<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20
evict-when: node checks/claims-a-bake-step-declares-what-it-reads.mjs passes; a bake from Designer into Stage asks to re-pour only when the pour's code CONTENT changed; the 2D map refreshes itself after a pour; the bake modal is fixed-width on the project's tokens.
widened: 2026-09-26 (Jacob — the always-dirty bake, the 2D refresh, the modal)
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

> ## ⭐⭐ WIDENED 2026-09-26 — THE SAME BAKE GRAPH DIRTIES TOO OFTEN, AND THE OPERATOR PAYS FOR IT EVERY TIME *(Jacob)*
> *"It seems like the bake from designer into Stage is always dirty?"* · *"Every time I go to Stage I get the
> 'this 2D is out of date' message; is that really necessary? … it should always update."* · *"The modal window
> that shows progress isn't clamped width so it jumps around … it should look nicer; should refer to the same
> project CSS."* ⇒ **This brief now owns the whole Designer → Stage bake experience.** The original under-declare
> defect (§3–§5) is the other half of the same graph, and one agent should own `serve.js`'s bake chain.
>
> **A · "Always dirty" — measure first, cause NOT established.** Read in source (Boz): the Bake refuses and asks
> to re-pour (`BakeModal.jsx`, *"This Bake will re-pour {scene}"*; `serve.js`, grep `A CODE CHANGE RE-POURS THE
> TOWN`) when `codeNewerThan(PIPELINE_SRC, MAP_JSON)` finds any file in `pipeline.js`'s import closure with an
> **mtime** newer than the town's `map.json`. ⚠️ Several sessions commit to that closure every day, and a
> checkout, rebase or worktree operation rewrites mtimes without changing content. ⇒ **Likely: every town whose
> last pour predates today's commits asks every time — some of it real code change, some of it mtime noise.**
> ▶ Measure it: for each town, which files trip the gate, and how many are content-identical to what the last
> pour read. ⭐ The cure the file already models: the **registry** is compared by CONTENT (`map.json.registryRead`,
> `registryReadChanged`). Record the closure the pour read **by content hash** in `map.json`, compare hashes, not
> mtimes. ⛔ Keep Boz's ruling (d): a genuine code change still asks before re-pouring — especially LS, whose
> re-pour Jacob is holding (*"No LS repour for the time being"*, 2026-09-26). Removing spurious prompts is the
> goal; removing the question is not.
>
> **B · The 2D map refreshes itself.** After a pour, the Designer's 2D map is built from ribbons loaded with the
> page, so `useCartographStore` sets `ribbonsStale` and the modal says *"The 2D map is out of date … Reload"*.
> ✅ **Ruled (Jacob): it should always update.** Re-read the town's ribbons in place after the bake and rebuild the
> 2D map without a reload; the modal appears only when that re-read FAILS, and then says so. ⛔ Never a silent
> stale map.
>
> **C · The progress modal.** `BakeModal.jsx` + `.carto-bake-modal*` in `src/cartograph/cartograph.css`: fixed
> width (no jumping as step lines change length — long lines wrap or truncate), and built on the project's tokens
> (`src/tokens/design.css`, the `--carto-*` layer; `ROADMAP C10`) rather than local values. Jacob looks at it for
> minutes at a time: make it calm and legible. ⛔ No new component library.

> **OPEN (Sluice, 2026-09-26) — cause not established:** a plain huron Designer load ran `sectionOpen` 3× in
> 51 s (46 s · 10 s · 10 s) with no interaction. Measured from the `[LOAD] sectionOpen` console timers. To test next:
> is it the graph re-running itself (a dep of that memo changing identity after hydrate)?

## 1. You are the dispatched agent. Name yourself — one word, not a name another RUNNING session holds (check `ListAgents`; ask Jacob to `/rename`).
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
**In bounds:** `cartograph/serve.js`'s input lists and the re-pour gate · the new check(s) · `BakeModal.jsx`, `useCartographStore.js`'s post-bake ribbons refresh, `cartograph.css` · `cartograph/OPERATIONS.md` if the operator-facing story changes.
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
