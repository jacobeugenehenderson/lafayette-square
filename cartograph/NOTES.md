# Cartograph — Operator Handoff

This document explains how to (re)build the Lafayette Square neighborhood map from
scratch, the principles behind the pipeline, and the work-in-progress problems the
next operator should pick up. Read this top-to-bottom before touching any code.

> Part of the **cartograph quintet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md` / `RIBBONS.md`). **Ribbon / corner / curb / intersection / block-geometry doctrine and pipeline** live in `RIBBONS.md` — the living doc that evolves every session. The Diary is kept lean: aged entries lift to `_archive/notes/` (below); settled facts live in the Reference docs.

---

## 2026-06-30 — render-pipeline install: one manifest, fork retired (Fenn, Phases 1–3).

The doctrine said "Preview == Production, byte-for-byte"; the code said post-FX was the exception — Preview ran a forked `PreviewPostFx` composer whose DoF driver was URL-param-based and missing heroDist/gates, so **Preview's DoF was silently wrong**. Fixed structurally, not patched:
- **Ph1 (`cba425b1`)** — extracted `usePostFxDriver`: the one per-frame driver (channel resolution + all module refs + `dofDriver` absorbed). The hook OWNS the refs (dependency flows one way → acyclic).
- **Ph2 (`99098910`)** — `renderPipeline.jsx`: `POSTFX_PIPELINE` (the declared ship list) + `RenderPipeline` (the installer, filtered by `platform`+`gate`). `PostProcessing` shrank ~340 lines to a thin mode wrapper. **The `if(IS_MOBILE)` fork collapsed into the `platform` field** — mobile is data now, not a code fork (still stripped; the bracket conversion is later, gated on real device numbers).
- **Ph3** — Preview mounts the same installer with `inspect={toggles,onCost}`; **`PreviewPostFx` deleted.** Preview's DoF/N8AO adopt production's props — the parity win (Preview *changed*, correctly).

**Eye-gate: green all three (Jacob).** Production+Stage pixel+perf-identical; Preview same look/cost, toggles work, fork gone. ⭐ **Lesson — latent parity:** the `grade.brightness` "parity win" showed *nothing* on `lafayette-square` and that was the correct pass — the Look authors no brightness key → resolves to `GRADE_FLAT_DEFAULTS.brightness=0`, so old fork (never wrote it → boot default 0) and new driver (writes resolved 0) apply the same zero lift, **identical by arithmetic**. The win is real but only becomes visible on a Look that authors a brightness lift (the overhead Browse look). *(Fact → `ARCHITECTURE.md §8 "Render pipeline"` + `PREVIEW.md`; the HANDOFF now tracks the Phase 4/5 follow-on only.)*

## 2026-06-30 — doc-canon deep audit + remediation sweep (Boz, fan-out).

A whole-corpus read (5 cluster auditors over root + cartograph + ls + arborist + meteorologist; ~18K lines) then a remediation pass (3 domain agents — Marginalia/ls, Rowan/arborist, Stratus/meteorologist — + Boz on root/cartograph). **Diagnosis:** the doc *system* (BOZ §2–3) is sound; the rot was concentrated in docs not touched in the recent look/publish sprint, and worst where it's most dangerous — the Reference docs a fresh agent trusts *first*. **All findings verified against code before writing** (e.g. the meteorologist "CloudDome deleted" claim was false — `skyMode.js` ships CloudDome by default; ls admin token is `localStorage` not sessionStorage; no `stage-config`/`ground.svg` in `src/`).

Landed: 35 docs edited + 3 HANDOFFs retired (design-dawn, publish-ceremony [folded → `PREVIEW §0.2` + `OPERATIONS §Named-levers#2`], NOTE-to-docs-boz-render). Banners on the stale first-reads (meteorologist ARCHITECTURE/STATUS · arborist SPEC · ls reference-tier/STATUS/BACKLOG); ~10 dead pointers repointed to live homes; orphans indexed (park-path-unify, animator-unify → cartograph BACKLOG; logistician-onboarding → ls BACKLOG); `DOC-CODE-COHERENCE` B1/B2 closed. **Deferred (bannered, not physically moved):** archive RUNTIME-DELTA + the ls-ARCHITECTURE session-diary tables + the misfiled cartograph sky-ADRs (`meteorologist/NOTES` ~473–680); reconcile exact arborist counts. **Untouched by intent:** the SHAPE forensics (archiving PAUSED, `[[project_revisit_skeleton_survey_section]]`).

## 2026-06-30 — the "Browse look" turned into a look-foundation + panel-taxonomy day.

Set out to author the **overhead Browse** look per time-of-day (Dawn first). The Browse
override was a byte-for-byte mirror of Hero, so it inherited Hero's low, cinematic dawn —
black from above. The chase exposed that the *foundation* wasn't there for "moody directional
light **and** see everything":

- **Why exposure didn't help:** `exposure` is a *multiplicative* gain — near-0 albedo × any
  factor stays ~0, so it can't lift crushed blacks. Jacob named the missing lever: an **additive
  lift** (the "B" of HSB; Saturation already existed). Landed a **`brightness` field on `grade`**
  (`c + B·(1−c)` in `FilmGradeEffect`) that raises the black floor with the white point intact.
- **Why the map was colourless:** a hardcoded **white ambient floor** washed everything flat, and
  the fill colours were muddy. Drove the **hemisphere fill from the live sky gradient** (up-sky
  colour from above, warm horizon as ground-bounce) + strengthened `hemiBase` 0.35→0.55 — the
  "surfaces glow with the sky's colour" lever. Distinct from flat `ambient` ("Fill light").
- **Why surfaces crushed/blew:** albedo runs value ~40–178 with saturated lots. Added a
  **surface desaturate + value-lift** (`treatAlbedo` in `BakedGround` `FadeMesh`) so layers read
  as a gentle gray family the sky-light colours. ⚠️ prototype constants — owes a "Surface" knob.

Then Jacob pushed on the panel itself: *"why are Fill, AO, Shadow in different categories — nothing
works intuitively?"* Diagnosis: the look panel was organized by **render mechanism**, not operator
**intent** — Fill (a FilmGrade toe), AO (N8AO pass), Shadow (SoftShadows) scattered across cards;
a **dead Grade Toe** slider (Fill overrode its uniform); a **double-"Shadow"** (a section *and* a
channel, in different cards); "Fill" mislabeled (the real fill light is Ambient/Hemi). Mapped it
all in `scratch/LOOK-PANEL-TAXONOMY.md` and shipped **Phase A** (UI-only, slab byte-identical):
cards **Light & Sky** / **Image** / **Light Sources**; a unified **Light & Shadow** section; relabels
(Fill→Shadow lift · Ambient→Fill light · Hemisphere→Sky fill · AO→Occlusion · Hero Lighting→Arch
uplights); removed the dead Grade Toe; reframed the fade inputs → **"turn-on/off speed"**.

Lessons banked: organize authoring by **what the operator is doing**, not by where the knob plugs
into the renderer; tunable degrees are **knobs, not buried constants** (the surface-treatment debt);
the lamp is really **three** things (fixture+aura/bloom · ground pool · canopy), not two. Open: the
actual Dawn Browse look (deferred under the infra), the cascade **per-ToD-per-shot** granularity
correction, and taxonomy **Phase B**. All on `curb-offset-draw`, committed (not yet pushed/deployed; eye-gate-pending).

## 2026-06-29 — "Nothing sits on the ground": the conformance arc + a neon regression hunt.

A long day with Jacob (Boz), much of it shipped live (staging + prod, branch `curb-offset-draw`).

**The headline — ground conformance.** Jacob: "nothing is perfectly sitting on the ground's surface." Forensic (agent Datum) found ONE heightfield but TWO problems: **(1)** the CPU bilinear sampler and the GPU `texture2D` indexed the same data at *different positions* (grid-corner vs texel-center) — up to **~2 m** apart at the edges; **(2)** objects point-sample the *smooth* field while the rendered ground is a *coarse mesh*, so they float between vertices (≤0.5 m on faces, worse on unrefined ribbons). Refining the ground to close #2 is a perf dead-end (tol 0.25 → 2× the ground tris). The fix that landed, framed by Jacob as the **shared-pyramid pattern**: reconcile the GPU sample to the CPU convention (`_terrainUV`, one field), then bring the OBJECTS to the DRAWN ground via a shared sampler (`groundSampler.groundRawAt`) + per-object **baked anchors** (`patchTerrainInstancedBaked`) — the buildings/foundations `aCentroidY` regime generalized. Lamps first (proof), then all 745 trees (per-look `tree-anchors.json`), removing up to 0.53 m / 1.9 m of float. ⭐ **Jacob's instinct that "the buildings/foundations regime accommodates this exact situation" was exactly right** — and because buildings never sample the texture (baked corner-mean), the reconcile + refine couldn't disrupt them; they became the canonical convention everything else came home to. Also: **park gravel paths** contour-refined to ride the park hill; **tree trunks** now blend toward the *combined effective* ground colour (albedo × baked contact-shadow + lamp pool), not raw albedo. Full doctrine: `ARCHITECTURE §8` "Ground conformance".

**The neon regression — and a hard lesson.** "Neon not on for open businesses; it used to work." I theorized TWO wrong fixes — a `hours_json`→`hours` parse (no-op: the backend already sends objects, verified by curling the live API) and a category-hex mismatch (also wrong: `CATEGORY_HEX` does include `dining`). Only when I **instrumented `openPlaces`** did the truth appear in one reload: the gate was FINE (24 lit, Park Ave Coffee `openNow:true`) — the bug was **intensity**. Neon is `animated:"tod"`, so `scene.neon.values` is slot-keyed (`{golden:{…}}`), but production's `NeonBands` flat-read `scene.neon.values.core` → `undefined` → core/tube = 0 → tubes built at zero intensity → invisible. Stage looked fine only because `NeonPump` resolves the slot. `NeonBands` now resolves via `resolveGroupAtMinute`. ⛔ **`feedback_worked_before_means_regression` in the flesh: I burned real time theorizing before verifying the running app. Instrument first.** (Canon: `ARCHITECTURE §8` "Neon renderer".)

**Also shipped:** building x-ray made automatic (no toggle); Text-us required Name field; the hero pan got arc-length reparam + per-keyframe dwell (path) and a `frameloop="always"`-during-hero attempt (temporal) — **but the stutter persists on Jacob's eye** ("an elegant smooth crawl, not a stuttery drag; reads as bad performance"), still the priority camera item (perf/mobile angle, `BACKLOG`).



A look-authoring day with Jacob (agent "Wren"), eye-gated throughout. Authored the complete time-of-day arc for lafayette-square — **dawn → sunrise → noon → golden → sunset → dusk → night** as one continuous curve. Data lives in `public/looks/lafayette-square/design.json` (authored via `scratch/set-slot.mjs`, baked with `node cartograph/bake-scene.js --look=lafayette-square`); recipe table in `scratch/DAWN-DESIGN-NOTES.md`. This is where `HANDOFF-design-dawn` conceptually retires. Commits `bc9a74ea`, `4ca9ab5f`, `986a4f8f`.

- **Promoted flat → TOD-animated this pass:** lantern, ambient, exposure, halo, mist, dof, warmth, dirMoon, fill (lampGlow/hemi/skyGain/bloom were already animated).
- **The artistic arc:** dawn = moody (DoF up, bloom OFF) · noon = "blown out" (superbloom 6 + exposure 0.8) · sunset = sharp + ELECTRIC sky overrides (hour 20) · dusk = blue moonglow (warmth 0.3, hemi 1.6, dirMoon 1.2, blue mist + sky overrides hour 21) · night = dark but **softened** (Fill lifted to 1.3 to kill the stark crushed shadows + hemi/ambient/exposure nudged).
- **Photocell-realistic lamps:** lantern ON at civil dawn (the StreetLights sun-altitude ramp gives ~0.56 there — verified), OFF at sunrise, warms back at sunset, full at night.
- **Render fix (`4ca9ab5f`):** the DoF mount gate in `PostProcessing.jsx` read only the FLAT `dof.values.enabled`, so a TOD-animated dof never mounted. Now mounts when ANY slot enables it → **per-slot DoF is a real TOD channel.**

**Lessons banked:**
- **The resolver: a channel with ONE keyframe resolves to that value at EVERY minute.** Converting flat→animated by writing one slot globally overwrites the whole day → **always seed an anchor slot (noon/night) with the prior flat value** before authoring the rest.
- **The EffectComposer key is `fx-${smaaOn}-${dofOn}`.** Any edit flipping dofOn/smaaOn rebuilds the composer, and under Vite HMR the rebuild can leave a consumer detached ("bloom went dark / no glow") until a **HARD REFRESH**. This cost a long phantom "bloom broke when DoF mounted" chase — it was an HMR artifact, **not** a DoF↔Bloom coupling. Hard-reload after a dofOn/smaaOn change before diagnosing.
- **DoF + Bloom share the DownsamplePyramid BY DESIGN and coexist fine** (guards `a1a6956c` + tree-source sanitize). "Turn one off and the other returns" has repeatedly been a mount/HMR confound — **the operator's live repro is the gate, not code-reading.** (This session I re-derived from code despite the existing canon — the exact CLAUDE.md anti-pattern; route first.)
- **DoF blur is forced to 0 in Browse** (dofDriver look-down gate) — DoF shows only in Hero/Street.
- **Sky colour overrides are CLOCK-HOUR-keyed on a seasonal grid, not slot-keyed** — they don't track the slot across seasons (known limitation; the Sky Builder is the live tool).

**Open:** trees don't show in Browse until a look dial is nudged ("wake-up" symptom) — a render/cull-layer bug, not a look problem.

---

## 2026-06-28 — Building x-ray promoted to automatic (the toggle dies).

The "don't cut through buildings" dissolve (added 2026-06-25, shipped *gated off* behind `useCamera.buildingDissolve` + a see-through button in the BrowseHeader) became the **camera x-ray**: always on, no toggle, no button. The session resumed mid-edit — a half-removal had stripped the JS uniform plumbing but left the GLSL + store + UI button dangling — so we finished it deliberately: restored the per-frame `uCamPos` feed in `SlabBuildings` and hardwired `uDissolveDist`/`uDissolveBand` on; deleted the BrowseHeader button and the `buildingDissolve`/`setBuildingDissolve`/`toggleBuildingDissolve` store fields; renamed the dev helper `window.__bldgDissolve` → `window.__bldgXray` (drops its toggle-flip behaviour, keeps live DIST/BAND tuning). Fact → `ARCHITECTURE.md` "Building x-ray"; operator note → `OPERATIONS.md` "Shot picker"; pitch → `FEATURES.md`.

**The decision (Jacob, eye-confirmed):** auto, not a knob. The hollow cross-section the near-clip slices is *never* something you'd want to see — this is artifact suppression, the same family as frustum culling, not a look channel. By our own no-hidden-look-math rule (`feedback-no-hardcoded-ramps-use-knobs`) a knob is for *authored look variation*; this varies nothing, it just removes an artifact → it shouldn't be a knob. The lingering question we closed: a toggle would only let a user choose to see broken geometry — no value. If the dither band ever flickers on some path, we promote DIST/BAND to a real authored knob *then*, not pre-emptively.

---

## 2026-06-26/27 — DoF + bloom, rebuilt off a shared blur LADDER (the romance lands)

A long post-FX session with Jacob, eye-gated throughout. The arc the `HANDOFF-real-dof` brief opened finally landed — and **superseded its own plan**. Archived → `_archive/HANDOFF-real-dof-2026-06-27.md`. Commit `7d1bb238` + follow-ups. Settled doctrine → `ARCHITECTURE.md` (Decisions) + `OPERATIONS.md` (Bloom / Focus knobs).

**The one architectural move:** `DownsamplePyramid` now exposes its **mip LADDER** (8 rungs, tight→wide) via `_pyramidRefs.levels`, not one collapsed blur. One downsample, sampled many ways — gang intact, phone budget intact. Both effects got their defining property back off it.

- **DoF (`RomanceDoF`)** — variable **radius** by depth (2-tap lerp of the straddling rungs) = a real focus pull, not the opacity cross-fade it was. **Single-focal** (sharp near → mid/far melts), which **replaced the two-focal model** — that read *backwards*: pushing Focus out blurred the *near* (everything closer than the far plane was "foreground"). A gentle **hero pocket** eases the far blur toward `heroBlur` near the designated hero's distance (the "a little soft, like IRL" Arch).
- **Bloom (`CustomBloom`)** — a **band-pass**: glow on bright *contrast* (`rung_i − rung_{i+1}`), not absolute brightness. Lamps/edges glow and a bright sky **backlights** the Arch as a rim, while uniform areas (open sky, the Arch's body) don't wash. (Jacob's framing cracked it: "IRL a bright sky would back-light the arch" — the sky bloom *is* the wanted backlight; the fix was keying on contrast so the rim glows and the body stays dark.) Also **ADDITIVE** (SCREEN *darkens* HDR-bright pixels — `screen(2.0,g) < 2.0` washed the sky).

**Lessons banked (the day was mostly debugging the hero pocket):**
- **The "everything blurry" was BLOOM, not DoF.** `window.__dofDebug = 1` (CoC paint) proved DoF was computing ~zero blur while the frame was hazy → the haze was the additive bloom. *Instrument before theorizing* — the debug paint cracked it after hours of code-reading flip-flops.
- **Anchor depth-pockets in the SHADER's depth space.** The shader decodes depth as **view-Z** (forward-axis); `camera.distanceTo` (Euclidean) put the pocket at the wrong depth for the **off-axis** Arch → missed every time. Fix: `worldPos.applyMatrix4(camera.matrixWorldInverse); heroDist = -z`. **The final blocker.**
- **Stage renders the LIVE store; the driver was reading the BAKED slab.** The pocket anchored to `scene.json`'s arch (1250) while Stage rendered the store's (1690) — a 440 m miss. Fix: pass the live arch via override.
- **The browse-disable gate killed DoF in the Hero shot** — it used raw height (`y>150`), which the elevated Hero camera trips. Gate on look-**down** instead.
- **"We did it!" ≠ done.** I committed + started archiving on a premature thumbs-up; the pocket wasn't visually confirmed yet. Close the loop *visually* before retiring State.

**Open (BACKLOG'd):** Preview's `PreviewPostFx` forks its own URL-param DoF driver (no per-frame `heroDist`/gate) → out of sync; a bloom **"blend" slider** (some broad bloom back over the Arch); Phase 4 (leaf-taper LoD cover) + Phase 5 (day/night budget); bloom TOD-curve tuning (threshold runs lower for band-pass); the Stage timeline-shift-on-edit bug (blocks per-TOD bloom authoring).

---

## 2026-06-24 — Stage: Hero camera authoring/runtime control modes.

Planned with Jacob then built (eye-gate pending). The want: clicking a Hero **keyframe** should jump the camera there and turn the on-screen controls into **generic 3D authoring** controls, reverting to **runtime** controls on **Save keyframe**. Decisions locked in conversation: **keep the Hero Lock** (the camera always aims at the subject — authoring only **repositions**, so the model stays `{position, fov}`, no bake/`SLAB-CONTRACT` change); **runtime = controls locked** (can be playing or paused); **default = playing**; **Save → re-lock and stay PAUSED on the saved frame** (do *not* auto-resume — selection is disabled during playback, so auto-play would fight the common edit-the-next-keyframe flow); scope **Hero only**.

**Key build insight (saved a whole subsystem):** `HeroPreview` already pins `controls.target` to the subject centroid **every frame** (even paused), so enabling OrbitControls in authoring pivots the orbit on the subject **for free** — no `heroSubjectPoint` broadcast needed (the brief had planned one). Also found the live controls are `OrbitControlsShot`/`Controls` in `CartographApp.jsx`, **not** the `StageCamera` in `StageApp.jsx` (that's for the deleted standalone `/stage` page — dead). Implementation: ephemeral `heroAuthoring` singleton + `useHeroAuthoring()` (same rail as `heroScrub`), gate `OrbitControlsShot enabled` for the Hero shot, and a two-mode capture zone in `HeroCamera` (clickable dots → `enterAuthoring`; `Save`/`Cancel`/Esc; rail-scrub inert while authoring; opens playing on shot entry). Commits: brief `08def6ed`, code `0141c60f`. Plan: `HANDOFF-hero-camera-authoring-mode.md`.

## 2026-06-22 (evening) — Render polish: animation UX, Arch Lighting, the ground-contact trio.

A render/Stage session (parallel to the docs Boz). Landed, all eye-verified or parse-clean:

- **Animation widget (`TodChannel.jsx`).** "Revert" → **Clear**; clicking a chip **scrubs only** (no keyframe); a keyframe is born only on an **edit**; the **clicked chip is the sticky edit target** (controls stay live on it regardless of clock drift). Applies to every channel.
- **Arch Lighting (`archLight`).** The cross-aimed foot uplights split off the `arch` *placement* channel into their own **TOD-animatable** channel (`ARCHLIGHT_*`), mounted as a `<TodChannel>` in Hero & Horizon; `GatewayArch` resolves per-frame. **Two bugs fixed:** (a) the uplight shader's face term zeroed on camera-visible faces → softened to a `0.35 + 0.65·…` floor so a cranked uplight visibly washes the arch; (b) the *baked* `scene.json` had uplights at 0 despite `design.json` authoring L2.15/R3 (stale bake) → `migrateArchLight` carries the legacy values off `arch` (cone radians→degrees). Production needs a re-bake.
- **Lamps card** (first-class in the Stage panel; was buried behind a material chip). Field schema centralized into `skyLightChannels.js`.
- **Lantern channel (`lantern`).** The lamp's own light source (glass emissive + glow orb + bulb) was fully hardwired (`t·0.8`/`t` ramps + `#fff2e0`). Now a TOD-animatable **Brightness + Glow** channel (operator master × the automatic dusk→night ramp), in the Lamps card; sibling of `archLight` (hardwires-come-out).
- **⭐ The pool follows the lantern.** Late fix after Jacob's "the pool controller doesn't control the brightness — full strength for a second then disappears." Root: `lampGlow.pool` was a *TOD-animated* channel (faint/held in daytime, slot-only edits) **+** `poolUniform` defaulted to **1.0** (the flash). Resolution: the ground pool's **intensity now comes from the Lantern** — `StreetLights` writes `poolUniform = Lantern Brightness × the dusk→night ramp` (the pool *is* the lantern's light on the ground), and its **colour** from `layerColors.lamp` (the Surfaces swatch, via `lampGlow.colorUniform`). So one light source drives lantern + pool coherently, off by day, no flash. Removed the separate `lampGlow.pool` field (and the Pump/Driver poolUniform writes); `lampGlow` now carries only **Canopy** (`trees`). `poolUniform` inits 0.
- **⭐ The ground-contact trio — baked into the ground, sampled by the ground shaders** (HOP-then-STONE; the layering/contour reasons are in `SLAB-CONTRACT §3/§3.1/§3.2`):
  - **Lamp light pools** → the **R** channel of a baked **ground FX map** (`ground.poolmap.png`): each lamp's ring profile (dark center → bright ring → 0) summed (overlaps build up), sampled by grass + `FadeMesh` × the **lantern's output** (see the pool-follows-lantern fix below) in the lamp's colour. The floating disc is **retired** (its `polygonOffset` was inert under log-depth → the "weird layering").
  - **Contact shadows** (tree bases + lamp bases) → the **G** channel of the same FX map, **multiplied into the ground diffuse directly**. ⚠️ **Lesson:** the first cut put tree rings in the **AO lightmap**, but `aoMap` only dims *ambient* → near-invisible in daytime sun ("no daytime shadow ring"). The fix is a direct albedo darken. **Always-on (constant strength)** — at night the dark ground + the additive pool naturally swallow it (no night-gate needed; Jacob's call).
  - **Trunk-base ground blend** → a baked per-Look **ground-color map** (`ground.colormap.png`, the albedo rasterized per group); the tree trunk shader samples it at the tree's world-XZ so the lowest ~1.5 m of each trunk **takes on the actual ground beneath it** ("whatever it is"). LS-driven via `BakedGround` → `groundColorState`; the Arborist Salon never mounts `BakedGround` → off there by construction. *(Eye-verified — "looks great.")*
- **Crash fix:** `GroundMeshes` is now keyed by the cache token, so a re-bake remounts it with a fresh hook order (the conditional `useLoader`s for the new maps would otherwise change hook order and crash on first re-bake).

**Tunable knobs (bake-time constants, re-bake to apply — to be promoted to the panel later):** in `bake-ground-ao.js` — pool shape (`POOL_RADIUS_M`/`POOL_RING_POS`/`POOL_RING_SHARP`/`POOL_SHADOW_FRAC`), contact shadow (`TREE_SHADOW_RADIUS_M`/`TREE_SHADOW_STR`, `LAMP_SHADOW_RADIUS_M`/`LAMP_SHADOW_STR`). **Live (shader) knobs:** trunk blend `uTrunkBlend`/`uTrunkBlendTop` in `treeAtlasMaterial.js#injectFoliageSway`; shadow strength `uShadowStr` (0.5) in `grassMaterial.js` + `BakedGround` FadeMesh; pool warm color `vec3(0.80,0.62,0.32)` in both.

**New arc captured (NOT built):** the **channel variant cascade** — per-shot + per-platform channel *values* as one sparse override cascade (`HANDOFF-channel-variant-cascade.md`; BACKLOG'd). Lands last (highest convergence). Also queued: **lamp-placement authoring** (placement is hardwired to `street_lamps.json`).

---

## 2026-06-21 (EOD) — REAL DoF end-to-end · render-conformance confirmed · authoring-hardening
*(Relocated from the MEMORY index 2026-06-23 — diary belongs here, not the pickup line. The DoF arc LANDED + superseded its plan 2026-06-26/27 — see the entry above; the HANDOFF is archived `_archive/HANDOFF-real-dof-2026-06-27.md`.)*

A big RENDER/DoF day. Highlights:
- **render-conformance was ALREADY landed** — Phases 1–3 (depth desktop-LOG `ca3514f2`, cameras-read-slab `bc2c293f`, dedup `112a7546`) shipped 2026-05-26; the AM pickup had been stale off an unmarked HANDOFF (lesson: verify code, not memory).
- ⭐⭐ **REAL DoF, end-to-end** (`HANDOFF-real-dof.md`): the two-focal romance DoF (`src/components/RomanceDoF.jsx` — near sharp + arch sharp, mid blur; CoC decoded under LOG depth; eye-verified) → the **FOCUS CHANNEL** (`9bbc5fd7`): knobs On·Blur·Focus-distance·Softness in `skyLightChannels` → shared `PostProcessing` (default-OFF, desktop, mounts `RomanceDoF`) → store → Stage Post-card "Focus (DoF)" → `bake-scene` emit. Blur **BOUNDED to the neighborhood** (arch stays sharp wherever parked). Archived the conflicting fake-blur `tree-hero-lod` → `_archive/HANDOFF-tree-hero-lod-2026-06-21.md`. **KNOWN refinements (the PROPER-DoF pass):** single-pass gather has a hard edge vs sky, no iris bokeh (disk), and doesn't share the blur pyramid with Bloom — a CoC-aware gather fixes all three.
- **authoring-hardening** (`HANDOFF-authoring-session-hardening.md`): reload restores tool+shot (`8f3dcd2b`); bake settle-gate + lifecycle (`4056032c`); Bake&Preview + reused window (`6e4b693d`); 2D toggle = free HOP (`2f9a95be`). Model: deliberate **STONE** (bake to 3D) vs free **HOP** (2D toggle).
- **camera-transition SSOT** (`8a217914`, `src/camera/transitions.js`): production/Stage/Preview transition identically (2400ms + smooth up). Camera Phase 4 (framing/orbit/intrinsics) OPEN.
- **Halo finished** (`65c2a3ba`) + Bloom attenuated + stale "broken" flag cleared (`c1f4a393`); slider-range audit `scratch/AUDIT-slider-ranges.md`. **on-pan flicker FIXED** (`fe3f88c7`): SlabBuildings hover in Preview (gated `interactive=false`) + `frustumCulled` dropping on-screen tiles (→false) — the hero PAN sweeping under a stationary cursor.
- ⛔ **DOCTRINE (Jacob): these effects are MOBILE-FIRST, not desktop-only** — cheaper/alternate ways to fit a phone's budget IS the point; every effect must be measured in the Preview GPU emulator + per-platform selectable. [[feedback_effects_mobile_first_measured]].
- ▶ **Open arc (forward state in the HANDOFFs):** the **mobile-viable DoF** (the full-res ~70-tap CoC gather is a desktop reference, held uncommitted/default-OFF; the real work is the cheap version on a downsampled shared pyramid, measured in the emulator, + finish the mobile/desktop selector = render-conformance Phase 4–5); the full doc sweep incl. the **STACKING-RENDER-PASSES** doctrine (`scratch/CHANNEL-ECONOMY-FORENSIC.md`).

---

## Older entries → archive

The Diary is kept lean — aged, settled entries are lifted (nothing deleted, moved for legibility):

- 2026-05-27 → 2026-06-08 → [`_archive/notes/NOTES-2026-05-27_to_2026-06-08.md`](../_archive/notes/NOTES-2026-05-27_to_2026-06-08.md) (V1 ribbon-corner ship · the tile pivot · the SKELETON home doc · the §Wall/better-bones day · the DataWall Phase-D · the deep-night sky · the datum repair) — lifted 2026-06-10.
- 2026-04-07 → 2026-05-18 → [`_archive/notes/NOTES-2026-04-07_to_2026-05-18.md`](../_archive/notes/NOTES-2026-04-07_to_2026-05-18.md) — lifted 2026-06-05.
