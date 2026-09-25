# BRIEF — excise the LS-bleed: absence must degrade to NOTHING, never to Lafayette Square

<!-- BRIEF-STATE
status: OPEN
dispatched: Act 0 landed 2026-09-20 (Kiln)
written: 2026-07-20
evict-when: site 12 closed (15/16/18-21 done) AND node checks/claims-writers-name-the-scene.mjs is green
  AND CLASS D (§1) HAS A DETECTOR — ⛔ the seven LS-sized constants were all found by accident, by people doing other work;
  a class whose only discovery method is luck is not closed however many instances are ticked. The check is the deliverable, not the count.
-->

**Agent: FRESH.** ⛔ **Route first** (`CLAUDE.md`): `ORIENTATION.md` → `README.md §⭐ START HERE` →
the topic canon for the domain you're in. `INTAKE-CATALOGUE.md §0` (repo root) has the findings.

> ### ✅ ACT 0 COMPLETE — 2026-09-20 (Kiln). Every site re-measured; the dead ones are gone from this file.
> The pre-clean 409-line version is `cartograph/_archive/BRIEF-ls-bleed-excision-preAct0-2026-09-20.md`.
> **20 of 26 sites are gone** — 13 measured dead, site 5 **ruled closed**, sites 15/16/18/19/20/21 **fixed 2026-09-20**. (26, not 22: the widened check found four new ones — 18, 19, 20, 21.) They are **deleted, not ticked** — the killing
> commits are in `§0` in one line each, and nowhere else. ⛔ **Do not re-open them.**

---

## 0. What Act 0 killed — one line, then never again

| sites | killed by |
|---|---|
| **1** lamps · **2** placements · **3** species-map · **4** module-level `_lamps` | `b12627c8` — each now reads its OWN scene and degrades to zero; LS's paths are read **only** under `scene === 'lafayette-square'`, which is a source, not a fallback |
| **7** MSBF-only join | `adc03f32` |
| **9** `measureModel.js` name-keyed seed · **11** `SCENE` default · **13** Look scene assign · **14** bake-over-LS | `08d61ce1` |
| **B1** `CartographApp` · **B2** `MapLayers` ribbons · **B3** `useCartographStore` | never a fallback — measured scene-gated 2026-09-19 (`EXTENT-DESIGN §2.1` has the gates) |
| **B4** `SurveyorPanel` landmarks | retired 2026-09-19 via the `loadInstanceData` seam |
| **5** `src/instance.js` unregistered look → LS identity | ⛔ **RULED CLOSED, NOT A DEFECT** — Jacob, 2026-09-20, **twice**: *"an alarm for a non-existent fire… if `?look` is unregistered that's basically tautological"* · *"When would/could this ever even happen? And who cares if it does?"* ⛔ **Do not re-open, and do not re-derive it from the general no-fallbacks doctrine** — the operator ruled this specific case. `ROADMAP A12` retired to match. |
| **16** `bake-trees.js` bakes over LS · **18** `pack-impostor-ktx2` · **19** `17-fill-canopy-trees` | `8e90eeb7` — 16 guarded at the CLI entry; 18's `\|\| '--look=lafayette-square'` and 19's **dead refusal** (`\|\| 'lafayette-square'` above an `if (!SCENE)` that could never fire) both now exit 2. ⭐ **18 and 19 were found BY the widened check, not by reading** — which is the argument for §4. |
| **15** `terrainExag` sized against LS ⭐ *(instance #2 of CLASS D — §1)* | `9378acfb` — now per-town authored in `design.json`, **kit default 1**; LS authors 1.5 and is byte-identical. ⚠️ **Every other town's terrain got shorter — intended, and it is the eye gate.** ⭐ The brief's stated "hard part" (a scene-blind module singleton in `elevation.js`) was already false: the sampler is rebuilt per look on terrain reload. |
| **20** `generate-procedural` · **21** `generate-salon` roster write | `58a91317` — `syncLookRoster('lafayette-square', …)` was hardcoded, so publishing a variant edited **LS's `design.json`** whichever Look you were in. Both now require `--look` and exit 2. ⛔ **Ruled by Jacob: "there is no reason for LS to be the fallback here EITHER."** |
| **6** sky at LS's latitude · **8** LS legal + About prose on every installation · **17** species-routing write → LS · `GET /inventory` · `scripts/config.py`'s LS geography default | **6** `e688555c` (the sky follows its town; §3.1's scoping → `_archive/BRIEF-ls-bleed-excision-site6-2026-09-24.md`) · **8** moved VERBATIM into `src/instances/copy/lafayette-square.jsx`; an undeclared installation renders "not declared" (Wellhead) · **17** `ebb4b927` · `/inventory` deleted `ccbe9d06` · config `1ebdac2d`. ⭐ `scripts/config.py` was not on this list; it was found by sweeping for LS coordinates. |
| **B2b** no boundary / no scene → LS's map + boundary · **22** LS park point + STL park codes in `derive.js` · the intake panel's `sampleForRow` (LS's file shown as a sample) · `derive.js` reading only St. Louis's parcel files | **B2b** `289c7a3e` (+ the same pattern in `BlockGeometryV2Debug.jsx`) · **22** + parcels `9a2f84c3` (22 matched nothing even on LS) · `sampleForRow` was dead: deleted with its route and client `1e637db6`. (Wellhead) |

⭐ **The argument for Act 0, kept because it recurs:** those thirteen dead ones were closed by **six different
agents, none of whom knew this brief existed.** The class is being closed incidentally and nobody was
keeping score. ▶ That is what `§4`'s check is for.

### ⭐⭐ AND TWO OF THE BRIEF'S OWN PREMISES WERE FALSE. Both would have caused damage.

- ⛔ **B6 said *"`StreetLights.jsx` is no longer mounted — confirm it is unmounted, then DELETE the
  file."*** **It is mounted, in three surfaces** — `BakedLamps.jsx:56` (Preview's lamp render),
  `CartographApp.jsx:875` (toy lamps), `StageApp.jsx:25`. **Following the brief would have broken the
  lamp render.** The `ls/ARCHITECTURE.md §1` line it rested on (*"no longer mounted by Scene"*) is
  true and narrow — `Scene.jsx` is one of four callers. ⭐ **A doc sentence scoped to one caller,
  quoted as a statement about the file.**
- ⛔ **Site 15 said the module-level singleton sampler in `src/utils/elevation.js` "has no scene in
  scope."** It does now: the sampler is **rebuilt per look** on terrain reload (`onTerrainReload`,
  `currentTerrain()`), so terrain is already per-look and **only `V_EXAG` is global.** Site 15 is
  *smaller* than briefed, not larger.

---

## 1. The defect, in one sentence

**When an input is absent, the kit does not render nothing — it renders Lafayette Square's data under
the other town's name.** It is not a bug, it is a **habit** the codebase acquired while LS was the
only installation.

A missing feature is honest and legible. A bleed is **plausible and wrong** — LS's sky, LS's legal
jurisdiction, rendered convincingly enough that nobody investigates. It costs more than an empty row
because it doesn't look like a problem.

⭐ **The correct pattern already exists in-repo — copy it, don't invent one:**
`cartograph/tree-bake-inputs.mjs` returns `null` when a scene has no census — *"an HONEST ZERO, not an
error: the caller skips the placement step rather than baking someone else's trees under this
scene's name."*

### The three classes
- **A — absence.** An input is missing, so LS's data stands in.
- **B — ALWAYS-ON cross-scene reads.** Not absence-triggered; LS's data is compiled into a shared
  module and consulted in **every** scene, even when the town has its own.
- **C — the BUILD direction.** The operator's action is silently redirected **onto** LS. Worse than
  A/B: those show a wrong map, **C overwrites a right one.**
- ### ⭐⭐⭐ **D — LS-SIZED CAPACITY. A CONSTANT WHOSE VALUE HAPPENED TO BE CORRECT FOR TOWN #1.**
  ⛔ **This class was named after SEVEN instances were found and fixed in ONE DAY (2026-09-20), all in
  the render path, none of them found by looking for this class.** It is not absence and it is not a
  substitution: nothing is missing, nothing stands in. **A number was chosen by looking at one town,
  and it is simply wrong everywhere else** — so no grep for a fallback, a scene name or a `||` will
  find it, which is why the original sweep of this brief has none of them.

  | # | the constant | what it was, and what it meant on town #2 |
  |---|---|---|
  | 1 | the sun's **shadow frustum** | `±900` = LS's 892 m radius + 8. On a 3,539 m town **~73% of the map could not receive a shadow at any quality.** |
  | 2 | **`V_EXAG = 1.5`** | sized against LS's ~35 m of relief, applied to altadena's **1,480 m** (site 15, already in §0) |
  | 3 | the **PCSS penumbra radius** | a large authored value compensating for a coarse map that only existed at LS's frustum size |
  | 4 | the penumbra's **UNIT — texels, not metres** | ⭐⭐ **the sharpest one, because the number was never edited.** It held still only while the frustum was fixed at one 0.4395 m/texel. The moment the frustum became the town's, **the same authored number meant a different real softness in every town** — huron's 23 became an **83 m smear** across 20 m buildings. |
  | 5 | the **ground-layer epsilon** | 2 mm between layers: invisible on a small flat town, and on contoured ground **arithmetically unavailable at any value** (chord error to 1.6 m) |
  | 6 | the **AO / FX map size** | a fixed 1024² over any span — 6.55 m/texel on huron, so a 4.5 m tree-shadow disc landed on **0.69 of a texel** and 18,616 splats smeared into grey |
  | 7 | **`hasHero`** | true for `lafayette-square` only — and it gated the **playback driver**, so ⛔ **no poured town had a hero camera driver at all.** |
  | 8 | **`FOUNDATION_BELOW_GRADE_M = 8`** *(added 2026-09-24)* | ⭐ **it confesses in its own comment** — *"LS diagnostic (2026-05-04): max (centroidEl − minCornerEl) × V_EXAG across all 1056 buildings = 3.984m… 8m gives ~2× safety."* Sized on town #1 and doubled. On a **waterfront** town the skirt punches past the waterline: **89.1% of huron's 3,678 buildings**, median **3.44 m** below the water plane, and over water there is no ground to hide it — Jacob's *"big underwater blocks."* ⛔ Not a number to shrink (that floats a building on a steeper town); the fix is the water's own depth fade. ▶ `node scratch/revetment-toe-founding.mjs` for the sibling case. |
  | 9 | the **bake step wall-clock kill** — `timeout: 300000` on the ground step *(added 2026-09-24)* | serve.js SIGKILLed any bake step past a fixed minutes budget (5 min for the ground; 30 s–15 min on the others), a budget that fit LS's seconds-long bakes. Provincetown's ground step, slower after its shoreline arcs, was killed at 5 min and reached the operator as **"bake look failed: 500"**. Fixed by removing the clock: every bake step now runs through `runStep`, with progress, the last line, and an operator Cancel that names the step. ▶ `node checks/claims-bake-progress-shows-the-route.mjs` |

  ### ⭐⭐ THE TELL IS ALWAYS THE SAME, AND IT IS WHAT MAKES THIS A CLASS RATHER THAN SEVEN BUGS
  > **A constant with no unit, or a unit that is only stable because something ELSE is also fixed.**

  ▶ **The three questions to ask of any literal in the render path, in this order:**
  1. **What is this in?** Metres, texels, a fraction of *what*? ⛔ A number whose unit you cannot say
     out loud is the defect — #4 is the whole argument, and it is the one that survives a code review
     because nobody edits it.
  2. **What did the person who chose it have on screen?** If the answer is "one town", it is data
     about that town, not a kit constant. ⭐ **The fix is never a better constant** — it is to derive
     it from the scene (#1, #3, #6), or to make it **the town's authored value with a NEUTRAL kit
     default** (#2: default `1`, meaning *draw the ground at the height it is*; LS's 1.5 becomes LS's
     data, and **the neutral default is the point, not a detail**).
  3. **Does a FLAG name a capability or an object?** #7 read as *"does this town have a hero OBJECT"*
     and gated *"may this town move its camera"*. ⛔ A flag whose name and whose single consumer
     disagree is this class wearing a boolean.

  ⛔ **AND THE SIGNATURE, WHICH IS WHY NO AGGREGATE FINDS IT:** every one of the seven is **invisible
  on Lafayette Square and severe on a large or contoured town.** LS is the scene you would reach for
  to prove the kit travels, and it is the one scene that cannot witness any of them. ⚠️ **NOT
  MEASURED: how many more of these exist.** Seven were found in a day of render work that was not
  looking for them; that says nothing about the size of the population, and a count here would be
  invented. ▶ The honest next move is §4's move — **a check, not a sweep.**

## 2. What "fixed" means

Absence must produce **one** of these — never a silent substitution:
- **honest zero** — the feature does not render, no error. **Preferred.**
- **documented fallback** — a *generic* default belonging to no real town, logged loudly at bake time.
- **loud refusal** — only where proceeding would corrupt an artifact. **Mandatory for Class C:
  nothing that WRITES may fall back.**

⛔ **A fallback to another installation's data is never acceptable, however plausible it looks.**
⛔ **And a sentinel is not a value** — `0`/`null`/`''` must be distinguishable from *"not registered"*
by the consumer, or you have built the same defect wearing a different hat
(`project_a_sentinel_is_not_a_value`).

---

## 3. THE LIVE SITES — all re-verified 2026-09-20

| # | Site | Class | What bleeds | Sev |
|---|---|---|---|---|
| **12** | `cartograph/serve.js:1142` | C | `sceneRouteMatch[1] \|\| DEFAULT_MAP` — a scene-less request is served **LS's** artifacts. ⛔ **Deliberately deferred:** `api.js sceneUrl()` emits scene-less URLs for the default scene, so refusing breaks the running app. **Sequence with the client; do not cut it alone.** | MED — blocked |

**Candidate, filed not fixed (2026-09-24):** `cartograph/forbidden-surface.mjs#makeZoneTester` treats `map.json`'s LEGACY `pavement` layer as a tree obstruction. Nothing draws that layer; the drawn surface is the ①/baked ground. So the tree mask can disagree with the ground a visitor sees. Measured on huron: letting parcels shape that layer moved 135 of 18,502 tree verdicts to `pavement`.

**Soft, authoring-only** (fix opportunistically, don't gate on them): `arborist/serve.js:959,1041` (Salon publish +
variant-rating re-bake LS unconditionally — now **declared LS-only by design** in their own source,
so read the comment before calling them defects).

### 3.3 ⭐⭐ Site 16 — and why the checker missed it. THIS IS THE REAL PRIZE.

`checks/claims-writers-name-the-scene.mjs` is excellent and it **passes** — 23 runnable writers
guarded, every exemption declared in its own source. **It is scoped to `cartograph/`.**

`arborist/bake-trees.js` writes `public/baked/<scene>/trees.json`, defaults its scene to LS, and calls
no guard. It is **outside the check's walls**, so the guard's green light is scoped narrower than the
sentence a reader takes from it.

⭐ **Per Layer 0 the fix is not the one edit — it is widening the detector.** Extend the check to
every writer in the repo (`arborist/`, `meteorologist/`, `scripts/`), or make its scope **loud** in
its own output. ⛔ A check that prints PASS while a bake-over-LS path sits one directory away is the
`POLYGON-FIRST §2.1` failure repeating: **a fallback inside the instrument.**

---

## 4. ⭐⭐ THE DELIVERABLE IS THE CHECK — this is the part that reaches town #2

Nine edits help nobody if the tenth bleed can still be written. Per `CLAUDE.md` **Layer 0**, the fix
is the **detector**; per the prune rule, a fact that can be checked by running something is a check,
not prose.

1. ✅ **DONE `8e90eeb7` — `claims-writers-name-the-scene.mjs` is repo-wide.** Roster discovered from
   `git ls-files`; domain decided by a scene-path predicate whose signals are parsed out of
   `scene.js`; the out-of-domain set is PRINTED with reasons; `scratch/`+`checks/` reported, never
   gating. ⭐ It immediately found two bleeds nobody had read (18, 19) — the class working as
   intended. ⚠️ Known limits, stated in its own footer: tracked files only, and the out-set is a
   source-text judgement, not a proof.
2. **`checks/claims-no-static-shared-data-imports.mjs`** — **PARSE** the source for static
   `import … from '…/data/<shared>.json'`; ⛔ never a hard-coded list of files, or it goes stale the
   day someone adds the next one. Derive the shared set by reading what sits at `src/data/*.json`
   versus `src/data/<look>/`. Exit 2 on any hit, naming file, line, and the per-scene path it should
   use. ⚠️ **Today all 7 remaining imports are scene-gated** (`§0`), so this check guards **coupling
   and bundle weight**, not an open bleed. ⛔ Do not sell it as bleed closure — that claim has been
   measured false twice.
3. **The Class-A regression:** stub a scene with no lamp data, no census, no species map, no instance
   file, no boundary; assert **nothing of LS appears in its outputs.** (The boundary case is B2b.)
4. **The Class-C regression:** run every write entry point with the scene omitted; assert it **fails**
   — and specifically that a bake cannot touch `lafayette-square` unless LS was named explicitly.
5. ⭐ **Mutation-test each one.** A passing check proves nothing until it has been seen to FAIL
   (`project_the_check_is_the_deliverable_mutation_test_it`). **Pin the runtime rule it models** and
   refuse to report green if that rule has moved.

## 5. Deliver

4. **Site 12** — ⛔ blocked on the client. Sequence with `api.js sceneUrl()`.
5. **`§4`'s checks**, failing before and passing after.
6. A short writeup: what landed, what deferred and why, and whether any *new* bleed surfaced.

## 6. Rules

- ⛔ **Confirm alignment with Jacob before writing code** (`CLAUDE.md §Standup before code`).
- ⛔⛔ **DO NOT ROUTE AN LS-FALLBACK FINDING UP FOR A DECISION — IT IS ALREADY RULED.** Jacob,
  2026-09-20: *"all LS fallbacks are stupid and annoying and counterlogical."* **Fix it and report.**
  Two were re-asked in one day (sites 5 and 20/21) and both annoyed him, correctly.
  ⭐ **The trap, and the test that avoids it:** Layer 0 q3 — *"am I calling the operator's AUTHORING
  a defect?"* — is right in general and **does not reach a hardcoded literal.** An authoring gesture
  lives in **DATA the operator edited**; a string typed into a `.js` file is a **developer's
  default.** q3 protects `design.json`, `blockCustoms`, an exclusion loop he drew — his decisions in
  his files. ▶ **Ask: could the operator have changed this WITHOUT editing code? If no, it is not
  authoring.** What still warrants asking is LS as a genuinely authored reference *in data*.
- ⛔ **A PREMISE IN THIS FILE IS A CLAIM, NOT A FACT.** Two were false and one would have deleted a
  live render component (`§0`). **Read the branch, not the string** — a path naming LS is not a
  bleed; a **fallback** to LS is.
- ⛔ **HPDM is the test surface, not LS** (Jacob, 2026-07-22): *"I can't abide HPDM getting off on the
  wrong foot since it's the only actual commercially requested map."* LS is production
  `lafayette-square.com`, conformed **last**, ⛔ never the night before a demo.
- ⛔ **The eye-gate is the operator's, on a non-LS scene.** A proxy render does not settle it.
- ⛔ **A dead bleed is DELETED, not gated** (`feedback_dead_code_gets_excised_not_archived`). Every doc
  that DESCRIBES a bleed you kill loses the description **in the same commit** — not a banner beside
  it. Superseded text → `cartograph/_archive/`, dated, refs repointed in the same breath.
- Everything inside the project folder. ⛔ **Do not start a dev server** — one is running.
- ⚠️ **Do not `git restore public/baked/**`** — the working tree is more correct than `origin/main`.
- **Name yourself in the writeup.**

## 7. ⛔ NOT IN SCOPE

- **The repo/folder rename** (`dev.nosync/the-ward/`). Separate job, different risk profile, no
  standup and no ruling. Its only real coupling is the `lafayette-square-staging` external repo + its
  `--base=` in `.github/workflows/staging.yml`. ⛔ Do not fold it in.
- **`blockCustoms` / `design.json` / per-scene authoring behaviour** — except site 15, which Jacob
  ruled *into* `design.json` deliberately. This is otherwise a **storage** change: if the map moves,
  you changed something you were not asked to change — **stop and say so.**

**Tracked in `ROADMAP` as A00, and as `EXTENT-DESIGN §6` step 4.**
