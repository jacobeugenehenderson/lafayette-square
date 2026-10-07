<!-- BRIEF-STATE
status: OPEN
dispatched: Strobe
written: 2026-10-06
evict-when: RULING: Jacob calls the arrival into Hero, and Hero→Browse, smooth on Huron in the Ward on staging
-->

# BRIEF — the shot into Hero is smooth: measure frame by frame, then fix



**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH, a
performance specialist.** **Report to the session `Boz the Younger`.**

**Instruction: confirm-then-build.** Read the canon and code below and tell Boz what you found. If the code
contradicts this brief, **stop and flag**. ⛔ This brief is **PURELY performance**. No look changes, no Preview
features beyond the one instrument in step 0, and no geometry.

---

## STATE — 2026-10-07 (Strobe). Open only on the ruling (Jacob's eye on staging after tonight's pin).
- **Landed:** the frame-timeline recorder (step 0, ▶ `node checks/claims-frame-timeline-catches-a-stall.mjs`); the slider
  compiles nothing (▶ `node checks/claims-a-slider-step-compiles-nothing.mjs`); RG decode off the main thread; one reveal
  (the gate, the splash, the dawn, the swell — ▶ `node checks/claims-startup-marks-fire-in-order.mjs`); the first Browse
  flight links nothing (fog zeroed not removed, the gate compiles as drawn, discs/rim/labels prepared); Hero PCF /
  Street–Browse PCSS; the DoF pass skipped at zero blur; desktop canvas MSAA off; trees.json format 2. Commits carry
  each measurement.
- **Shelved, approved (Boz's ROADMAP lines):** composer AA at 2×; the grass footprint LOD.
- **Not this brief's, measured and handed on:** the ground's per-pixel cost (grass shader) and the composer's MSAA are
  Browse's biggest costs (▶ `node scratch/browse-perf/probe.mjs --surfaces`, `node scratch/msaa/probe.mjs --tiers`).

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
| the reveal gate (what only Browse draws is prepared with the town) | `src/components/Town.jsx#RevealGate` (the idle `useOverheadWarm` is deleted) |

## 3. Sequence

*Steps 0–2 (the recorder, measure-and-rank, one cause at a time) are done; their text is in `cartograph/_archive/BRIEF-hero-arrival-perf-steps-2026-10-07.md`, their results in the STATE above and the commits.*

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
