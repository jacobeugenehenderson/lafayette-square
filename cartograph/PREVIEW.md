# Preview — inspecting the slab

> **Status: v0.1 (2026-06-10), doctrine amended 2026-06-17 — the topic-doc.** The keystone Reference for the **Preview** stage — the third beat of `… stage → bake → preview`. Grounded against the live render tree in `src/preview/PreviewApp.jsx` and the cost machinery in `src/preview/GpuMonitor.jsx`, not assembled from prose. Completes the front-half rebuild trio: paired with **`STAGE.md`** (authors the Look) and **`BAKE.md`** (freezes it into the slab). Preview *reads* what those two produced — **and, as of the 2026-06-17 standup, *authors deployment policy* at the publish gate** (§0.2).
>
> ▶ **In flight — the v0.2 measurement-regime arc (`HANDOFF-preview-measurement.md`).** A ratified redesign turns Preview from a *desktop truth-meter* into a **publish-confidence instrument**: a named-virtual-device emulator, gauges re-aimed at the *device budget* (not desktop ms), and thermal / memory / transition-spike axes. **Not yet built** — the sections below describe today's v0.1 behavior; the keystone brief holds the forward plan. The doctrine reversal in §0.2 *is* settled and lands here now.
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

> ### ⭐ PARITY HOLDS PER TIER — Preview mounts each tier's own pass set *(2026-10-04, Phase 2 D)*
> Which post-FX passes a device runs is its **quality profile's** (`qualityProfile.js#includesPass`, the profile's `postFxOff` list) — the one question every surface asks. A **phone** runs `grade` · `smaa` · `grain`; **desktop** runs all nine (`ao` · `pyramid` · `heroLadder` · `bloom` · `dof` · `aerial` + those three), `heroLadder`/`dof` only where the Look authors a blur. Preview's phone tiers hand `<Town>` the phone profile, so they mount exactly what a phone ships, and its FX toggles can only **take out** a pass the tier ships, never force one in (`renderPipeline.jsx#mountedPasses`); a pass the tier doesn't run shows greyed "not on this tier". ▶ `node checks/claims-preview-phone-runs-production-passes.mjs`
>
> ⚠️ **What is still fixed, and unbuilt:** the phone's list is a constant, not a measurement, and `phone-hi`/`phone-lo` share one profile — they render identically and differ only in the gauge budgets (`deviceProfiles.js`). Jacob wants every effect switchable **per surface** (desktop · phone-hi · phone-lo) — *"we don't want to 'cancel bloom' because we can't get it going on a lo phone"* — and that per-surface data plugs into `includesPass`. The **pyramid tuner** is the other unfinished half (it reaches nothing that renders yet; `renderTiers.js` header says why). Board row **`ROADMAP.md H1`**; design `_handoffs/HANDOFF-mobile-profile.md §2`.

The *only other* divergences are the GPU profiler, the phone frame, and the layer-toggle matrix laid over the top. This is what makes the desktop cost numbers honest — they measure the shipping desktop render, not a proxy.

2. **Preview mirrors the *Look*; it authors *deployment policy*** (amended 2026-06-17 — a scoped refinement of `feedback_stage_is_source_preview_is_mirror`, "we've grown"). Two halves:
   - **The Look mirrors** (unchanged). Stage authors the art → the Look serializes → Preview reads the frozen `scene.json` + baked geometry cold (past **wall #2** — `BAKE.md §0`); no live re-derivation. If a *Look* looks right in Stage but wrong in Preview, the bug is the bake (it didn't propagate), never Preview.
   - **Deployment policy is authored at the gate.** *Which channels ship to desktop vs. mobile* is **not Look-art — it is a cost-driven deployment decision**, and the cost instrument lives in Preview. So the per-platform **inclusion manifest is owned and edited in Preview** (the publish gate), where the operator decides-while-measuring. This overturned the prior "Preview never writes the slab" rule (`HANDOFF-preview-measurement.md §doctrine`); the distinction it protected — inclusion ("what ships") ≠ the inspection toggles ("what am I measuring") — survives via a *separate editorial surface* (the channel-listing, §2).
   - **The gate now has a button (✅ shipped 2026-06-30, `d1b86dd4`).** The Preview **"Publish" panel** realizes the *one-command save ceremony* (`OPERATIONS.md §Named levers #2`): one click commits the scoped slab pathspecs + pushes, plus an **SMS-hero OG capture** (`📷 Capture → 🚀 Push to Prod → ✓ live`) off the WebGL canvas → `public/photos/og-preview.jpg`. All DEV-ONLY (git endpoints in `cartograph/serve.js`; the panel hides when the backend is unreachable).

> ### ⛔⛔ "STAGING IS REDUNDANT FOR SLAB-DATA" IS RETIRED — IT WAS REVERSED ON 2026-09-03, AND THIS PAGE OUTLIVED IT BY A DAY
> This paragraph read: *"because Preview already renders the slab in production's exact tree, **staging is REDUNDANT for slab-data** — the publish flow pushes straight to prod; staging-first applies only to code/structural changes."* Settled 2026-06-30, and **true until the bucket stopped being one key space.**
> **What replaced it:** one bucket, **two prefixes** (`staging/` and the un-prefixed prod keys). ⛔ **A bake may only ever write `staging/`**; production is a separate, deliberate promotion. The reason is the one the old rule could not price: *"the bigger issue is there's no way to preview it before it goes live"* (Jacob) — a pour reached `lafayette-square.com` the instant it uploaded, with no gate and no way back except re-baking a slab that may no longer exist.
> ⭐⭐ **THE COST OF THIS SENTENCE OUTLIVING ITS TRUTH, MEASURED 2026-09-04 — it was load-bearing in CODE, not just prose, in three places:**
> - **`/promote` shipped code and no slab.** Under the old rule the bake *did* reach prod directly, so promotion had nothing to upload; the split moved the mechanism and left the wiring. Nothing anywhere ran `--env=prod`. **830 of 915 prod objects were stale** — a complete but older canopy, rendering plausibly, telling nobody.
> - **`/deployed?target=` accepted the target and discarded it,** reading prod's keys for both rows — *citing this paragraph by name to justify it.* The staging row reported production's slab, so the panel's two gestures could not disagree.
> - **`PUBLISH.md §6`** carried the matching sentence ("per-environment prefixes are the fix if it ever bites"). It bit.
>
> ⭐ **The doctrine that survives is the half about *sufficiency*: Preview is still the gate for a slab** — it renders the slab in production's exact tree, and no amount of staging soak tells you more than that. What died is the claim about *mechanism*: that shipping a slab therefore needs no separate environment. It does now, because the two environments hold **different bytes**.
> ▶ `PUBLISH.md §6` · `node checks/claims-the-slab-envs-do-not-collide.mjs`
> ⛔⛔ **BUT READ WHAT THE BUTTON DOES, NOT WHAT THE DOCTRINE INTENDS (2026-08-28).** "Promote to Prod" is `git push origin <branch>:main` — it fast-forwards prod to your whole working HEAD, so **every commit you are carrying ships, not just the baked look.** The doctrine above is about *sufficiency* (a slab needs no staging soak); the mechanism is a full release. ⭐ The slab COMMIT is properly scoped (`slabPathspecs` cannot sweep unrelated dirty files) — it is the PUSH TARGET that is wide.
> ⛔ And the staging target must be derived, never quoted: it was pinned to a branch nothing had deployed for four weeks, so the button reported success and staging never moved. ▶ `node checks/claims-the-publish-gate-pushes-where-staging-deploys.mjs`
*(Open tail in `cartograph/BACKLOG.md` NOW: panel buttons-as-status cleanup · `og:description`. ✅ the hero random-start fix landed 2026-08-28.)*

---

## 1. The artifact chain

| | |
|---|---|
| **Inputs** | the slab — `public/baked/<look>/{ground.json,ground.bin,ground.lightmap.png,buildings.json,buildings.bin,lamps.json,scene.json,trees.json}` — every URL from `src/lib/slabUrl.js` (published: content names; on disk: `?bake=<re-read key>`). ▶ `node checks/claims-every-slab-url-is-resolved.mjs`; the retired `?t=<bakedAt>` scheme is in `cartograph/_archive/slab-cache-bust-scheme-RETIRED-2026-09-28.md`. |
| **Look selection** | The town the address names (`?look=`, else the one Stage last had open), resolved by the shared authoring resolver (`PreviewApp.jsx#resolvePreviewLookId`) |
| **Town identity** | The slab's baked `manifest.json#identity`, the record the Ward reads, never the authoring source. A Look with no manifest refuses with "bake it in Stage first" (`PreviewApp.jsx#FrozenTown`) |
| **Who serves it** | the cartograph dev server (`serve.js:735` maps `/` → `/preview.html`); entry `src/preview/main.jsx` → `PreviewApp` |
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
| **Strip chart / GPU panel** | two profiler tabs — a rolling frame-time strip vs. the numeric draws/tris/geos/tex/progs readout | `StripChart.jsx`, `GpuPanel` |
| **Phone mode** | renders the canvas inside `<PhoneFrame>` (iPhone bezel, target scale 0.65) to read deployed mobile aspect; persisted to `localStorage` (`preview.mode.v1`) | `PhoneFrame.jsx`, `usePhoneScale` |
| **Layer toggle matrix** | live per-layer visibility for Scene + Post-FX layers, each with its cost bar | `RightPanel`, `LayerRow` |
| **Time-of-day** | the shared `DawnTimeline` scrub — test the look at dawn / day / dusk / night | `TimeControl` |
| **Shot picker** | Hero / Browse / Street, gated by production's adjacency graph (Hero ↔ Browse ↔ Street; no Hero↔Street edge) | `SHOT_ADJACENCY`, `ShotCamera` |
| **Soft-reload** | bumps a React key to remount `CanvasContents`, forcing a fresh fetch of the baked artifacts (the cache-bust escape hatch) | `reloadKey` |
| **Trigger bar / phoneBus** | shot picker + reload + bracketed span events (e.g. a camera transition) so a spike is attributable to a gesture | `TriggerBar.jsx`, `phoneBus.js` |

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

The per-layer cost is measured by **toggle, not by sum**: on a toggle, `GpuMonitor` captures the settled rolling-average baseline (`SAMPLE_WINDOW=30`), discards the post-toggle transient (`SETTLE_SAMPLES=2` — re-upload spikes / first-draw shader compile / the `.visible` flip settling), then averages `POST_SAMPLES=5` purely-post-toggle samples; the signed delta (positive when toggling **on**) is the layer's steady-state cost (`GpuMonitor.jsx:53`, `:160`). *(The earlier design read `post` too soon and diluted every delta to ~10% of true — the Vernier Phase-0 fix.)*

Three caveats that, unstated, would mislead (`PanelCaveats`, `PreviewApp.jsx:526`):

1. **Render cost, not memory** — a toggle hides a layer (skips its draw); the geometry stays GPU-resident. The meter reads draw cost, not VRAM.
2. **Deltas don't sum** — overdraw is shared (hiding trees also cuts the buildings' fill behind them). **Trust the all-on total, not the sum of the per-layer deltas.**
3. **Neon is forced on** — worst-case, unlike production's authored/TOD-gated neon (§3).

**The budget is anchored to milliseconds**, the only thing that directly determines smoothness. Per-layer bars are scaled to `BUDGET_MS=16` (`PreviewApp.jsx:431`); the GPU panel warns frame-time amber >22ms, red >33ms, and shows draws / tris against soft caps (200 draws, 1M tris). Draws + tris are shown for context but **don't drive the bar color** — a layer that takes 1ms but uploads a million tris is fine on a modern GPU. Spike detection fires on the same thresholds (`SPIKE = {ms:33, calls:200, tris:1_000_000}`) plus any metric doubling its tracked baseline, and tags the spike with the most-recent gesture label.

`frameloop="always"` is deliberate (`PreviewApp.jsx:648`): Preview targets a continuously-rendering mobile/desktop runtime, so an honest always-on loop reports cost more truthfully than `demand`+`invalidate` would.

---

## 5. The flow — Stage → Bake → Preview

1. **Stage** — the operator authors the Look live (WYSIWYG); autosaves to `design.json` (`STAGE.md`).
2. **Bake** — one button freezes `design.json` → `scene.json` and pours the geometry/AO into the slab (`BAKE.md`). Stage's "↻" re-fires it in place; Designer's "Stage →" fires it implicitly.
3. **Preview** — open `/preview.html?look=<id>` (or follow "← Stage" / "Preview →" between the two). Walk the slab at the authored shots, scrub the day, flip to phone mode, watch the GPU panel. **If the slab holds at acceptable mobile cost → it's ready for the LS app. If a layer is hot → back to Stage to lighten it. If it looks wrong → the bake didn't propagate (re-bake / soft-reload), not a Preview bug.**

Preview closes the authoring loop without authoring anything: it is the operator's *verdict surface*.

---

## 6. Status — done / partial

**DONE (shipping, verified in code):**
- ✅ **Render parity** — Preview mounts production's exact tree (slab buildings + foundations + neon off the slab index; L1.3 cutover 2026-05-26). `BakedBuildings` deleted; no separate render path.
- ✅ **GPU profiler** — per-frame draws/tris off `renderer.info` (autoReset off, delta'd for post-FX honesty), rolling CPU frame-time, spike log with cause attribution.
- ✅ **Per-layer cost** — settled pre/post-toggle attribution (Vernier Phase-0 timing fix); live cost bars on every Scene + Post-FX layer.
- ✅ **Phone mode**, **layer matrix**, **TOD scrub**, **shot picker** (adjacency-gated), **soft-reload**, **trigger/phoneBus spans** — all live.
- ✅ **Hero parity** — the authored bounce replays through the shared `heroAnim.js`, identical to Stage and production.

**PARTIAL / the tail:**
- 🟡 **Cold reload** — soft-reload remounts `CanvasContents` (re-fetch); a true cold reload via `sessionStorage` handoff is sketched, not built (`PreviewApp.jsx:619`).
- 🟡 **`BasicLights` fallback** — a Preview-only inspection light for "celestial off"; held resident-but-hidden, never drawn in the all-on path (no production analog).

---

## 7. The doctrine, in one place

- **Preview *is* production + bolt-ons, per tier.** Same render tree and the tier's own pass set (§0.1), plus the profiler, phone frame and toggle matrix.
- **Preview mirrors the Look; it authors deployment policy.** Stage authors the art, the Look serializes, Preview mirrors it cold (no store, no save, no re-derivation of the Look). But *per-platform inclusion* — what ships to desktop, phone-hi and phone-lo — is **to be authored in Preview**, the publish gate beside the cost instrument (§0.2, amended 2026-06-17). ⚠️ Not built: today each profile's list is fixed in `qualityProfile.js`.
- **"All on" equals the shipping cost.** Toggles gate `.visible`, never the mount; the all-on total is the production render's cost.
- **Trust the all-on total, not the sum of deltas.** Shared overdraw makes per-layer deltas non-additive; they isolate *causes*, the total measures *cost*.
- **Milliseconds are the budget.** Draws/tris are context; frame-time is what users feel. 16ms is the per-layer bar anchor; 33ms is the spike line.
- **A wrong Preview is a wrong bake, never a Preview bug.** Looks-right-in-Stage / wrong-in-Preview = the bake didn't propagate. Diagnose the bake, then upstream (`BAKE.md §4`).

---

## Cross-references

- **`STAGE.md`** — the Look-authoring tool whose `design.json` the bake freezes; Preview's upstream source.
- **`BAKE.md`** — the publish stage that pours the slab Preview reads; the paired keystone (`BAKE.md §3` lists every artifact).
- **`SLAB-CONTRACT.md`** — the slab's byte format + producer/consumer contracts (the SSOT this doc points to for §1).
- **`HANDOFF-preview-measurement.md`** *(State — in flight)* — the v0.2 measurement-regime arc: the virtual-device emulator, device-budget gauges, thermal/memory/transition axes, and the per-platform channel-listing this doc's §0.2 reversal enables. The forward plan; this doc becomes its Reference home on landing.
- **`FEATURES.md §3 "Preview"`** — the user/investor re-voicing of this doc (the role table + the three-environments walkthrough).
- **`OPERATIONS.md "Preview — the slab inspector"`** — the operator manual entry (defers here for the model).
- **`_archive/RENDER-PATH-CENSUS.md`** *(archived)* — the render-path audit; Preview as the shipping-render measurement surface.
- **Code:** `src/preview/PreviewApp.jsx` (render tree + toggle convention) · `src/preview/GpuMonitor.jsx` (cost attribution) · `StripChart.jsx` · `PhoneFrame.jsx` · `TriggerBar.jsx` · `phoneBus.js` · `heroAnim.js` (shared camera model).
- **Memory:** `project_preview_equals_ls_literally`, `feedback_stage_is_source_preview_is_mirror`, `project_ls_parity_pipeline`, `[[project_two_bakes_two_walls]]`.
