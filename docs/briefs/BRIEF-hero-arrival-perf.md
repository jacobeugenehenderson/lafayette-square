# BRIEF — the shot into Hero is smooth: measure frame by frame, then fix

<!-- BRIEF-STATE
status: OPEN
dispatched: Strobe
written: 2026-10-06
evict-when: RULING: Jacob calls the arrival into Hero, and Hero→Browse, smooth on Huron in the Ward on staging
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH, a
performance specialist.** **Report to the session `Boz the Younger`.**

**Instruction: confirm-then-build.** Read the canon and code below and tell Boz what you found. If the code
contradicts this brief, **stop and flag**. ⛔ This brief is **PURELY performance**. No look changes, no Preview
features beyond the one instrument in step 0, and no geometry.

---

## 0. What this is (Jacob, 2026-10-06)

*"Things look pretty good but the scene is not agile, the time slider is not agile, and the camera move/frame rate
is choppy."* On arrival, *"the ground draws and then the trees come in in drabs and cover the ground. What if we drew
the ground detail after trees? We need new thinking."* **Town: Huron**, the biggest example.

Three symptoms, all about **smoothness**, not average speed:
1. **The arrival into Hero:** what lands when, and the hitches while it lands.
2. **The camera move:** the frame rate is low and the motion is choppy.
3. **The time-of-day slider:** dragging it does not keep up.

⭐ **Kit, not Huron (`CLAUDE.md` Layer 0).** Every fix must hold on a town nobody has measured: no threshold, budget,
LOD distance or count that happens to fit Huron. Budgets are per **target** (`src/preview/deviceProfiles.js`).
Prove each fix on Huron, then on Lafayette Square.

## 1. What is already known — read these, don't re-derive them

- **`ROADMAP H-9`** — the frame rate was solved once (2026-09-22). **It was the trees.** The hero card grid was
  42 M tris/frame on Huron; fixed to 2.3 M, 11 → 24.6 FPS. **Leads nobody owns:**
  - `heroTier: 2375 mesh / 0 impostor` on Huron, i.e. the tree impostor path is not engaging;
  - per-frame CPU over 111,696 instances;
  - the 20-pass post stack.

  ⛔ **Its instrument rule:** `gl.info.render.frame` counts RENDER PASSES, not frames.
- **`ROADMAP` `frameCost.js#gpuWindow`** — on this M1 (ANGLE/Metal) the GPU timer is **not GPU time**. It is shelved;
  ⛔ do not try to fix it here. Every number derived from it (Grain's tree VERDICT, the lamp numbers, the pyramid rows)
  is **unconfirmed**. Jacob's real ask, which step 0 answers: *"capture fast-moving transitions … actionable info …
  and then giving the user a means to fix it."*
- **`ROADMAP` "Lamps → BRIEF-lamps.md"** — lamps measured costlier than trees in Huron's Hero view (Grain, with the
  gauge above, so re-measure). The lamp *model* swap belongs to `BRIEF-lamps.md`; ⛔ never commit or upload the
  purchased lamp models.
- **`ROADMAP` "Preview v2: the startup timeline as authoring"** — **the runtime cannot defer an asset class today.**
  On LS, all 380 tree files land before WARD USABLE. Jacob's "ground detail after trees" is exactly this missing
  machinery.
- **`cartograph/PREVIEW.md §4a`** — the startup sequence. **FIRST TRUTHFUL FRAME = WARD USABLE** = ground +
  buildings drawn (Jacob, 2026-10-04); `DrawnAnchor` marks first draws; `window.__startup()` / `__residency()` /
  `__previewFrame()`.
- **`ROADMAP` "Preview becomes a first-class technical-director app"** — where the cost is believed to be: trees
  25.4 of 28 M tris in LS Browse; the ground is 0.17 M tris, so its cost, if any, is shading and fill. Not measured.

## 2. Code sites

| what | where |
|---|---|
| Preview, its frame loop (`PREVIEW_FRAMELOOP = always`) | `src/preview/PreviewApp.jsx` |
| today's gauges (GPU timer, main ms, long-animation-frame) | `src/preview/frameCost.js` |
| startup marks, residency ledger | `src/components/DrawnAnchor.jsx`, `src/preview/glLedger.js`, `src/preview/phoneBus.js#recordColdStart` |
| the camera path into Hero | `src/camera/MovieCamera.jsx`, `src/preview/heroAnim.js` (`BRIEF-one-movie-driver.md`) |
| trees: hero cards, instancing, tiers | `src/components/HeroImpostorTrees.jsx`, `src/components/InstancedTrees.jsx` (`heroTier`) |
| the time-of-day channels the slider drives | `src/cartograph/TodChannel.jsx`, `src/cartograph/animatedParam.js` (`STAGE.md §1`) |
| the only deferral that exists | `useOverheadWarm` (overhead discs warm on entering Browse) |

## 3. Sequence

### Step 0 — the frame-timeline recorder (instrument only; no fixes)
- **Measure the time between presented frames** (`requestAnimationFrame` deltas), every frame. That is what the eye
  judges as choppy, and it needs no GPU clock.
- **Put marks on the same timeline:**
  - a slab file or tree file arrives;
  - a mesh first draws (`DrawnAnchor`);
  - a material or shader compiles for the first time (`renderer.info.programs` growing);
  - a texture goes up to the GPU, or a KTX2 transcode finishes;
  - a slider input or camera keyframe;
  - a long animation frame and its scripts.
- **Three scripted, repeatable runs:**
  - **(a)** a cold page into Hero, through the movie;
  - **(b)** a scrub of the time slider across the day at a fixed rate;
  - **(c)** a fixed camera move in Hero.

  Each run is the same path every time, so two runs can be compared.
- **Output:** per run, the frame-interval series (p50 / p95 / max, and every frame over the target's budget), with
  each hitch listed beside the marks that coincide with it. ▶ Expose the result as `window.__frameTimeline()`, and
  add one `checks/` script that runs a scripted run headless and prints it.
- **Attribution by removal:** the same run with one class off (trees · hero cards · lamps · post stack · ground
  detail · shadows), compared frame series against frame series. Repeat the baseline to show the noise.
  ⛔ Trust the all-on total; per-class deltas don't sum (`PREVIEW.md §4`).
- ⛔ **Mutation-test the instrument.** Inject a known 50 ms stall at a known frame, and show it is caught, timed and
  attributed to its mark.
- ⛔ **Headless is not the operator's eye** (`feedback_proxy_render_is_not_the_operator_eye`). Validate the recorder
  once in Jacob's own browser on Huron, and say which surface every number came from.

### Step 1 — measure and rank. ⛔ STOP and report to Boz before changing anything.
- For Huron:
  - what lands when on arrival, and what the eye sees at each moment ("the trees come in in drabs");
  - every hitch with its cause;
  - the steady frame cost in Hero, with each class's share by removal;
  - what one slider step costs, and why.
- Re-check H-9's three leads by measurement.
- **Rank the causes by what they cost the eye.** For each, name its remedy as **engineering** (ours), **deployment**
  (a per-surface switch) or **creative** (Stage).
- Write only the numbers; where a mechanism is not measured, write **"cause not established"** (`CLAUDE.md`).

### Step 2 — fix one cause at a time, each measured before and after
- Each fix is its own commit, with Huron's before/after frame series in the message, then Lafayette Square's.
- **Jacob's idea, tested as one fix:** order the arrival so the trees land before the ground's detail (base ground →
  buildings → trees → ground detail), or whatever order step 1's numbers favour.
  - It needs the deferral machinery the ROADMAP says doesn't exist. Build it as the general mechanism (an asset class
    can arrive after WARD USABLE), not a Huron special case. That machinery is what Preview v2's startup timeline will
    later drive.
  - ⛔ WARD USABLE stays ground + buildings, as Jacob ruled. A deferral that delays it is a regression.
- ⛔ **"It's only seen from far" is not an argument.** A fix that degrades the close camera is not a fix.
- ⛔ **No fallbacks:** a deferred class that never arrives must fail loudly, not leave a quiet hole.
- ⛔ The fix that replaces something removes it in the same commit (`CLAUDE.md`, a fix in three parts).

## 4. Bounds

- **Writes:** the renderer and Preview (`src/components`, `src/lib`, `src/preview`, `src/camera`), and `checks/`.
- ⛔ **No bake, pour or slab-format change** without Boz. If a fix needs the bake to emit something new, that is a
  separate, cleared landing. Jackson Heights bakes tonight; another agent (Sill) is working the corner brief in
  `src/lib/tileGround.js`, so don't touch that file.
- **The renderer is shared with The Ward:** a change here changes the published player at its next Publish.
  ⛔ No Publish or Promote from you.
- Commit through explicit paths only (`BOZ §3.7`). **Registers:** `PREVIEW.md` (the recorder, in place of what it
  supersedes) and `OPERATIONS` (any new switch). Each commit names the register it reached, or says "reaches no
  register".

## 5. Done when

On Huron, the arrival, the camera move and a slider scrub each meet the desktop target's budget on p95, with no
hitch the eye can see. Lafayette Square is no worse. The recorder and its check stay as Preview's instrument, and
Jacob's eye in his own browser is the final gate.
