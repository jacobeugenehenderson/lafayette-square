# Preview — inspecting the slab

> **Status: v0.1 (2026-06-10), doctrine amended 2026-06-17 — the topic-doc.** The keystone Reference for the **Preview** stage — the third beat of `… stage → bake → preview`. Grounded against the live render tree in `src/preview/PreviewApp.jsx` and the cost machinery in `src/preview/GpuMonitor.jsx`, not assembled from prose. Completes the front-half rebuild trio: paired with **`STAGE.md`** (authors the Look) and **`BAKE.md`** (freezes it into the slab). Preview *reads* what those two produced — **and, as of the 2026-06-17 standup, *authors deployment policy* at the publish gate** (§0.2).
>
> ▶ **Measurement (Phase 2 E, 2026-10-04):** the startup sequence, TIME TO WARD, per-artifact cost and residency are measured (§4a). **Still unbuilt:** thermal, a real-device reading, and per-target budgets that are measured rather than INTERIM (`deviceProfiles.js`); the June design is `HANDOFF-preview-measurement.md`.
>
> Preview is **both** an *idea* (the QA beat after the bake) and a *thing* (the standalone app at `/preview.html`). This doc owns *what Preview is for and how it inspects*. It does **not** re-document the slab's byte format (that's `SLAB-CONTRACT.md`) or the render components themselves (those are LS-runtime concerns shared with production — Preview just mounts them).

---

## 0. What Preview is

**Preview is the slab inspection environment.** It mounts the frozen slab (`public/baked/<look>/*`) in production's exact render tree, straps a GPU monitor over the top, and lets the operator stress-test the result before it's handed to the LS app. It is the **proving ground between the bake and the deploy**: the last surface where a too-expensive layer or a look that didn't propagate is caught by the operator instead of by a mobile user.

Two load-bearing facts:

1. **Preview is production's render tree + inspection bolt-ons — not a separate render path** (`project_preview_equals_ls_literally`) — ⛔ **ON DESKTOP. NOT ON MOBILE, AND THE GAP IS FIVE PASSES.**
   > ⚠️ **AND SINCE 2026-09-01 THAT PARITY SPANS TWO COPIES.** The slab is gitignored and served from R2
   > (`PUBLISH.md §6`); Preview, running locally with `VITE_ASSET_BASE` unset, reads **your disk**, while
   > production reads **the bucket**. Byte-for-byte still holds — the pour uploads what it just wrote and
   > fails loudly if it cannot — but it is now an **invariant to verify**, not an identity to assume.
   > ▶ `node scripts/verify-baked-in-r2.mjs`. ⛔ **And do not set `VITE_ASSET_BASE` while authoring**, or
   > Preview inspects R2's older slab and §7's "a wrong Preview is a wrong bake" fires on a bake that was fine. Whatever Preview draws, the **desktop** app draws, byte-for-byte: the same `BakedGround`, `SlabBuildings`, `InstancedTrees`, `BakedLamps`, `GatewayArch`, `CelestialBodies`, `SceneNeon`, post-FX stack.

> ### ⭐ EACH SURFACE DRAWS WHAT IT SHIPS — the town's DEPLOYMENT, authored here *(2026-10-04, Phase 2 F)*
> Which post-FX passes a surface runs is the town's **deployment policy**, `cartograph/data/<map>/deployment.json` (`src/lib/deployment.js`), laid on the surface's render profile by **`qualityProfile.js#surfaceQuality`**, the one function Preview and the Ward both apply it through; `includesPass` is the one question. The bake's manifest step carries it into `manifest.deployment`. Preview's toggles can only **take out** a pass the surface ships (`renderPipeline.jsx#mountedPasses`). **Every real phone runs phone-lo's policy** until phones can be told apart (Jacob); phone-hi is authorable and stored. ▶ `node checks/claims-deployment-has-one-authority.mjs` · `node checks/claims-preview-phone-runs-production-passes.mjs`
>
> ⚠️ Unbuilt: telling phone-hi from phone-lo at runtime; the **pyramid ladder** (it reaches nothing that renders; `renderTiers.js` header). Board row **`ROADMAP.md H1`**.

The *only other* divergences are the GPU profiler, the phone frame, and the layer-toggle matrix laid over the top. This is what makes the desktop cost numbers honest — they measure the shipping desktop render, not a proxy.

2. **Preview mirrors the *Look*; it authors *deployment policy*** (amended 2026-06-17 — a scoped refinement of `feedback_stage_is_source_preview_is_mirror`, "we've grown"). Two halves:
   - **The Look mirrors** (unchanged). Stage authors the art → the Look serializes → Preview reads the frozen `scene.json` + baked geometry cold (past **wall #2** — `BAKE.md §0`); no live re-derivation. If a *Look* looks right in Stage but wrong in Preview, the bug is the bake (it didn't propagate), never Preview.
   - **Deployment policy is authored at the gate.** *Which channels ship to desktop vs. mobile* is **not Look-art — it is a cost-driven deployment decision**, and the cost instrument lives in Preview. So the per-surface **deployment** (`cartograph/data/<map>/deployment.json`) **is owned and edited in Preview** (the publish gate), where the operator decides-while-measuring. This overturned the prior "Preview never writes the slab" rule (`HANDOFF-preview-measurement.md §doctrine`); the distinction it protected — inclusion ("what ships") ≠ the inspection toggles ("what am I measuring") — survives via a *separate editorial surface*: the amber deployment panel, which never reads or writes the inspection store.
   - **The gate now has a button (✅ shipped 2026-06-30, `d1b86dd4`).** The Preview **"Publish" panel** realizes the *one-command save ceremony* (`OPERATIONS.md §Named levers #2`): one click commits the scoped slab pathspecs + pushes, plus an **SMS-hero OG capture** (`📷 Capture → 🚀 Push to Prod → ✓ live`) off the WebGL canvas → `public/photos/og-preview.jpg`. All DEV-ONLY (git endpoints in `cartograph/serve.js`; the panel hides when the backend is unreachable).

> **Preview is the gate for a slab — sufficiency, not mechanism.** It renders the slab in production's exact tree, so no staging soak tells you more; but a bake writes only `staging/`, and production is a separate Promote per town (`OPERATIONS.md` § Publish), so the two environments hold different bytes. ▶ `PUBLISH.md §6` · `node checks/claims-the-slab-envs-do-not-collide.mjs`
*(Open tail in `cartograph/BACKLOG.md` NOW: panel buttons-as-status cleanup · `og:description`. ✅ the hero random-start fix landed 2026-08-28.)*

---

## 1. The artifact chain

| | |
|---|---|
| **Inputs** | the slab — `public/baked/<look>/{ground.json,ground.bin,ground.lightmap.png,buildings.json,buildings.bin,lamps.json,scene.json,trees.json}` — every URL from `src/lib/slabUrl.js` (published: content names; on disk: `?bake=<re-read key>`). ▶ `node checks/claims-every-slab-url-is-resolved.mjs`; the retired `?t=<bakedAt>` scheme is in `cartograph/_archive/slab-cache-bust-scheme-RETIRED-2026-09-28.md`. |
| **Look selection** | The town the address names (`?look=`, else the one Stage last had open), resolved by the shared authoring resolver (`PreviewApp.jsx#resolvePreviewLookId`) |
| **Town identity** | The slab's baked `manifest.json#identity`, the record the Ward reads, never the authoring source. A Look with no manifest refuses with "bake it in Stage first" (`PreviewApp.jsx#FrozenTown`) |
| **Who reads the slab** | the **shared runtime components** — `BakedGround`, `SlabBuildings`, `InstancedTrees`, `BakedLamps`, `GatewayArch`, `CelestialBodies` / `Atmosphere` / `CloudDome`, `LafayettePark`, `SceneNeon` (via `LafayetteScene`), all fed by `useSceneJson(lookId)` |
| **Format SSOT** | `SLAB-CONTRACT.md` |
| **Output** | the **Look is read-only** (Preview persists nothing of the render). Its product is the operator's *verdict*: "ship the slab" or "back to Stage." **Exception (amended 2026-06-17, §0.2):** Preview *does* author the per-platform **inclusion manifest** — its one sanctioned write, deployment policy decided at the gate. |

There is no Preview artifact and no Preview store. Preview is the one stage in `stage → bake → preview` that writes nothing — it is pure inspection.

---

## 2. The inspection toolkit

The bolt-ons over the production render — the only things Preview adds that LS does not have:

| Tool | What it does | Code |
|---|---|---|
| **GPU profiler** | per-frame cost off `renderer.info` (draws / triangles) + a rolling CPU frame-time from rAF deltas; spike log tagged with its cause | `GpuMonitor.jsx` |
| **Per-layer cost** | toggle a layer → measured Δ (ms / draws / tris) attributed to that layer (§4) | `measureToggle`, `getLayerCost` |
| **Cold start** | the strip's first recording is the page's load: a startup lane ticks the spec's marks (`ward:*`, set by the shared renderer), the header carries TIME TO WARD, each fetched file is an assets span (hover: its sizes); the **files** tab is its table, per class opening onto files (§4a) | `phoneBus.js#recordColdStart`, `StripChart.jsx`, `FilesTab.jsx`, `src/lib/startupMarks.js`, `src/components/DrawnAnchor.jsx` |
| **Deployment · Diagnosis** | what the surface ships, autosaved to `deployment.json` (§0.1), and beside it the measured problem ranked with its remedy (§4a) | `DeploymentPanel.jsx`, `DiagnosisPanel.jsx` |
| **Residency** | each Scene layer row: MB held · in view · in the slab; the GPU panel: GPU memory in bytes (textures · geometry · post-FX targets) beside the count ceilings (§4a) | `Residency.jsx`, `glLedger.js` |
| **Profiler** (strip · gpu · files) | under the phone on the phone tiers; on desktop in the right panel, closed to one line (TIME TO WARD · GPU MB). Opaque (`.profiler-panel`, project tokens), one fixed height | `StripChart.jsx`, `GpuPanel` |
| **Phone mode** | renders the canvas inside `<PhoneFrame>` (iPhone bezel, target scale 0.65) to read deployed mobile aspect; persisted to `localStorage` (`preview.mode.v1`) | `PhoneFrame.jsx`, `usePhoneScale` |
| **Layer toggle matrix** | live per-layer visibility for Scene + Post-FX layers, each with its cost bar | `RightPanel`, `LayerRow` |
| **Time-of-day** | the shared `DawnTimeline` scrub — test the look at dawn / day / dusk / night | `TimeControl` |
| **Shot picker** | Hero / Browse / Street, gated by production's adjacency graph (Hero ↔ Browse ↔ Street; no Hero↔Street edge) | `SHOT_ADJACENCY`, `ShotCamera` |
| **Soft-reload** | bumps a React key to remount `CanvasContents`, forcing a fresh fetch of the baked artifacts (the cache-bust escape hatch) | `reloadKey` |
| **Frame timeline** (the strip's recorder) | every presented-frame interval (rAF deltas, no GPU clock) with, on the same clock, the marks a hitch sits on: files, programs / uploads (`renderer.info` growing), KTX2 pages transcoded and AO+depth pages decoded (`markTimeline`), slider input, long frames and their scripts; read back as p50 / p95 / max, frames over the target's budget, and each hitch (p50 + one budget) beside its marks (§4a) | `phoneBus.js#frameTimeline`, `TriggerBar.jsx` |

The **Hero shot is the authored bounce**, replayed identically here, in Stage, and in production through the shared `src/preview/heroAnim.js` model — Preview is the QA mirror of exactly the camera the operator tuned (`STAGE.md §1`, `OPERATIONS.md` Stage ▸ Hero shot).

---

## 2a. ⛔⛔ THREE VISIBILITY SURFACES — and only one of them is the slab's

*(2026-08-28. A whole session was lost to this: the map was correct everywhere and blank at the gate.)*

| surface | lives in | who writes it | reaches Preview? |
|---|---|---|---|
| `scene.layerVis` | the baked slab | Designer / Stage | ✅ (mount-gates decorations) |
| **Preview inspection toggles** | **`localStorage: preview.layers.v3`** | **Preview only** | ✅ **and nothing upstream can touch it** |
| per-platform inclusion manifest | the Look | Preview's publish gate (§0.2) | deployment policy |

⛔ **Turning layers on in the Designer does NOT turn them on in Preview.** Nor does a re-bake, nor a
full re-pour from the Datawall. Ground/buildings/trees off in `preview.layers.v3` renders **identically
to a broken slab**, with nothing on screen saying so — the operator reasonably concludes the pipeline
broke. ⭐ **Preview should surface "N layers hidden" without expanding SCENE.** Not built.

## 2b. The shot is `<Town shot>` — the same store field in every app

Preview draws through `<Town>` (`src/components/Town.jsx`), like production and Stage. The shot reaches the renderer
as ONE field, `useCamera.townShot`, written only by `TownBridge.jsx`; a shot consumer reads that, never the old
player's `viewMode` (reading `viewMode` is what kept Preview's Browse on the hero cards, 2026-08-28).
▶ `node checks/claims-the-town-reads-no-player-store.mjs` fails a renderer file that reads `viewMode`.

## 3. The toggle convention — why "all on" must equal production

Every Scene-layer toggle gates `.visible` on a `<group>`, **never the mount** (the *Vernier convention*, `PreviewApp.jsx:339`). The rationale is load-bearing:

- **"All on" must equal production's literal mount list, per tier** — so the all-on cost number is the shipping cost of the tier selected (§0.1). A toggle is a clean per-frame on/off, not a destructive unmount/dispose/re-upload that would churn the GPU meter and lie about steady-state cost.
- A layer whose cost is a **draw** (geometry) → wrapped in `<group visible>`.
- A layer that is a **scene property** (fog) → passed an `enabled` prop; the component nulls the property instead of unmounting.
- **The one sanctioned mount-gate:** the live `LafayetteScene` buildings stay *unmounted*, exactly as in production where the merged-mesh **slab** replaces them (L1.3, 2026-05-26). The `Buildings` toggle gates the *slab's* `.visible`; `LafayetteScene` stays mounted only for `SceneNeon` + labels + markers + the click-catcher.
- **Post-FX is NO LONGER a fork (2026-06-30).** It used to be the exception — Preview ran its own `PreviewPostFx` composer, which drifted (its DoF driver was silently wrong). Now the post-FX stack is **one declared manifest installed by mode** (`renderPipeline.jsx` → `RenderPipeline`; `ARCHITECTURE.md §8 "Render pipeline"`): production/Stage install it plain, Preview installs the *same* one with `inspect={toggles,onCost}`. An FX toggle mounts/unmounts its pass *through the manifest* (the composer rebuilds on the toggle set) — inspection is a parameter, not a parallel composer. `PreviewPostFx` is **retired**; "Preview == Production" post-FX is structural, not asserted. (The transient caveat, §4, still applies to a toggled pass.)

The layer roster (`PreviewApp.jsx#SCENE_LAYERS`, `#FX_LAYERS`): **Scene** — Ground, Buildings, Trees, Park, Streetlamps, Gateway Arch, Neon, Sky+Sun, Clouds, Atmospheric Fog. **Post-FX** — N8AO, Bloom, Halo, Film Grade, Film Grain, SMAA, DoF (the pyramid and the hero ladder follow the passes that read them).

⭐ **Ground-contact effects ride the Ground layer (parity automatic, no separate toggle).** The lamp light-pools + tree/lamp contact shadows (`ground.poolmap.png`) and the trunk-base ground blend (`ground.colormap.png`) are baked into the ground textures, sampled by the ground/grass + trunk shaders (`SLAB-CONTRACT §3.1/§3.2`) — so toggling **Ground** gates them and "all-on" == production by construction. They're natural candidates for the per-platform channel-listing (a measurable mobile-cost line) once the v0.2 measurement regime lands.

Every `DEFAULT_LAYERS` entry is on, post-FX included (bloom and DoF were default-off until 2026-10-04).

---

## 4. Reading the numbers — three caveats and the budget

The per-layer cost is measured by **toggle, not by sum**: on a toggle, `GpuMonitor` captures the settled rolling-average baseline (`SAMPLE_WINDOW=30`), discards the post-toggle transient (`SETTLE_SAMPLES=2` — re-upload spikes / first-draw shader compile / the `.visible` flip settling), then averages `POST_SAMPLES=5` purely-post-toggle samples; the signed delta (positive when toggling **on**) is the layer's steady-state cost (`GpuMonitor.jsx#measureToggle`). *(The earlier design read `post` too soon and diluted every delta to ~10% of true — the Vernier Phase-0 fix.)*

Two caveats that, unstated, would mislead (`PreviewApp.jsx#SceneCaveats`):

1. **Render cost, not memory** — a toggle hides a layer (skips its draw); the geometry stays GPU-resident. The meter reads draw cost, not VRAM.
2. **Deltas don't sum** — overdraw is shared (hiding trees also cuts the buildings' fill behind them). **Trust the all-on total, not the sum of the per-layer deltas.**

**Budgets are per target** (`deviceProfiles.js`, INTERIM until a real-device reading): the GPU panel colours frame time and draws / tris against the active target's; per-layer bars rank by share of the heaviest layer, not a budget. A spike fires past the target's thresholds or on any metric doubling its baseline, tagged with the last gesture (`noteEvent`) and its GPU / main split.

`frameloop="always"` is deliberate (`PreviewApp.jsx#PREVIEW_FRAMELOOP`): Preview targets a continuously-rendering mobile/desktop runtime, so an honest always-on loop reports cost more truthfully than `demand`+`invalidate` would.

## 4a. Startup, residency and frame cost — what each gauge reads, and what it cannot

- **The sequence** (spec, *Cold Start / Time to Ward*): HTML → runtime → manifest → ground · buildings · trees
  **PREPARED** out of sight → **THE REVEAL = FIRST TRUTHFUL FRAME = WARD USABLE** (Jacob, 2026-10-06: the physical town
  arrives at once; it was "ground + buildings", 2026-10-04) → look layers fade in. **TIME TO WARD** = that mark from
  navigation start. The gate (`Town.jsx#RevealGate`, reading the `prepared:<class>` startup marks) compiles each class ahead and draws it once
  offscreen before the reveal, so the reveal frame pays no compile or upload; `ward:reveal` marks the gate opening.
  Pieces mark on their first **visitor** draw (`DrawnAnchor`; the gate's prepare draws do
  not mark), so a hidden layer never marks; the Ward carries the same marks. Once per page: reload for a cold number.
- **Source and target.** Locally the slab comes off disk and the code is Vite's unbundled modules, so fetch times and
  the `code` row are not a visitor's (the panel prints its source). Every number is this desktop's GPU running the
  target's profile; phone-hi and phone-lo draw the same frame (§0.1).
- **Residency.** GPU bytes come from the allocation calls (`glLedger.js`), never file sizes; an unsized format is
  printed, not defaulted. VISIBLE is per mesh, an upper bound. **SELECTED / OPENED: not reachable** (no taps).
- **Frame cost.** GPU ms (timer query, from the frame's first render call) and main ms (the frame's callbacks) apart,
  plus long-animation-frame entries. ⚠️ On ANGLE/Metal the GPU timer read above the frame interval (cause not
  established): relative there, and the panel flags it.
- **Diagnosis** (right panel, per surface): ranks by measurement only (no fixed order) — GPU ms per layer by a bracketed
  toggle (rest · out · rest; the rests' spread is the row's noise: inside it reads ≈ 0, negative past it reads *unstable*),
  and tris / meshes / memory by share. Each row names its remedy: **deployment** (a switch above), **creative** (Stage),
  **engineering** (a ROADMAP row). Blind spots: off-main-thread work (KTX2), the driver's copies, images the browser holds.
- **Frame timeline** — three scripted runs (cold into Hero · the Hero move at `?movieAt=` · a slider scrub), removal by `--off=`; an injected 50 ms stall must come back beside its mark. Headless, DPR 1: not the operator's eye.
  ▶ `node checks/claims-frame-timeline-catches-a-stall.mjs [--town=] [--only=a|stall|c|b]` · `window.__frameTimeline()`
- ▶ `node checks/claims-startup-marks-fire-in-order.mjs [--town=]` (order; a hidden ground marks nothing and reads 0
  VISIBLE; the ledger counts to the byte) · `node checks/claims-preview-frame-cost-splits.mjs` (each load moves only its
  own number). `window.__startup()` / `__residency()` / `__previewFrame()` return the data.

---

## 5. The flow — Stage → Bake → Preview

1. **Stage** — the operator authors the Look live (WYSIWYG); autosaves to `design.json` (`STAGE.md`).
2. **Bake** — one button freezes `design.json` → `scene.json` and pours the geometry/AO into the slab (`BAKE.md`). Stage's "↻" re-fires it in place; Designer's "Stage →" fires it implicitly.
3. **Preview** — open `/preview.html?look=<id>` (or follow "← Stage" / "Preview →" between the two). Walk the slab at the authored shots, scrub the day, flip to phone mode, watch the GPU panel. **If the slab holds at acceptable mobile cost → it's ready for the LS app. If a layer is hot → back to Stage to lighten it. If it looks wrong → the bake didn't propagate (re-bake / soft-reload), not a Preview bug.**

Preview closes the authoring loop without authoring anything: it is the operator's *verdict surface*.

---

## 7. The doctrine, in one place

- **Preview *is* production + bolt-ons, per tier.** Same render tree and the tier's own pass set (§0.1), plus the profiler, phone frame and toggle matrix.
- **Preview mirrors the Look; it authors deployment policy.** Stage authors the art, the Look serializes, Preview mirrors it cold (no store, no save, no re-derivation of the Look). But *per-platform inclusion* — what ships to desktop, phone-hi and phone-lo — is **authored in Preview**, the publish gate beside the cost instrument: `deployment.json`, per town (§0.1).
- **"All on" equals the shipping cost.** Toggles gate `.visible`, never the mount; the all-on total is the production render's cost.
- **Trust the all-on total, not the sum of deltas.** Shared overdraw makes per-layer deltas non-additive; they isolate *causes*, the total measures *cost*.
- **Milliseconds are the budget.** Draws/tris are context; frame-time is what users feel. 16ms is the per-layer bar anchor; 33ms is the spike line.
- **A wrong Preview is a wrong bake, never a Preview bug.** Looks-right-in-Stage / wrong-in-Preview = the bake didn't propagate. Diagnose the bake, then upstream (`BAKE.md §4`).

---

## Cross-references

- **`STAGE.md`** — the Look-authoring tool whose `design.json` the bake freezes; Preview's upstream source.
- **`BAKE.md`** — the publish stage that pours the slab Preview reads; the paired keystone (`BAKE.md §3` lists every artifact).
- **`SLAB-CONTRACT.md`** — the slab's byte format + producer/consumer contracts (the SSOT this doc points to for §1).
- **`FEATURES.md §3`** (the capability, in a marketer's words) · **`OPERATIONS.md` § Preview** (the knobs) · **`HANDOFF-preview-measurement.md`** (the June design; what is still unbuilt of it: thermal and a real-device reading, §4a).
- **Code:** `src/preview/PreviewApp.jsx` (render tree + toggle convention) · `src/preview/GpuMonitor.jsx` (cost attribution) · `StripChart.jsx` · `PhoneFrame.jsx` · `TriggerBar.jsx` · `phoneBus.js` · `heroAnim.js` (shared camera model).
- **Memory:** `project_preview_equals_ls_literally`, `feedback_stage_is_source_preview_is_mirror`, `project_ls_parity_pipeline`, `[[project_two_bakes_two_walls]]`.
