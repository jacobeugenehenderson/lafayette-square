# Handoff — Preview Measurement Regime: Trustworthy Per-Layer GPU Attribution

> Dispatch-ready brief. The Preview layer toggles are meant to do double duty: hide/show a layer
> AND turn its GPU cost on/off so the panel attributes load per layer. Right now they don't measure
> reliably — every toggle conditionally *mounts/unmounts* (destructive churn), and the buildings
> toggle gates the wrong path. This makes Preview "a scene that rebuilds itself as you poke it"
> instead of "production's render tree + a non-destructive inspection overlay." Fix the regime.

**You are the dispatched agent. Name yourself** — novel + NOT already used in this project (check
`arborist/NOTES.md` / `cartograph/BACKLOG.md` / commits). No theme suggestions. You own this
end-to-end. **Recommended dispatch:** someone fluent in `src/preview/PreviewApp.jsx` + the
`GpuMonitor` + the layer system.

**Diagnostic-first.** Phase 0 is an audit with NO code change. Do not start converting toggles until
the audit confirms what "all on" actually renders vs production and how the meter behaves.

---

## Why this exists (the stakes — don't under-weight this)

Preview is the **GPU-proving ground before slab handoff** (`cartograph/FEATURES.md`): "if a layer's
cost is unexpectedly high in Preview, the panel surfaces it before mobile users feel it." **The whole
mobile-perf arc runs on this meter** — the hero-tree LOD/impostor work (`HANDOFF-tree-hero-lod.md`,
Azimuth) has a Phase-0 baseline and a Phase-D success gate that are *literally* "draw-call / overdraw
drop in the Preview GPU panel." If the meter is churny or miswired, **we cannot trust the number
that's supposed to prove the impostors were worth building.** A trustworthy measurement regime is
*upstream* of validating that win — that's why this is being done now.

**The doctrine being restored** (`project_preview_equals_ls_literally`): Preview and production LS are
two consumers of the same slab with **identical render trees**; Preview adds inspection bolt-ons *over
the top*. A toggle that changes the **mount** (rather than visibility) forks Preview from production
and contaminates the measurement with mount/unmount transients.

**The full parity chain — measurement only matters if it traces back to Stage.** Per `cartograph/
FEATURES.md`: **"the product is what the operator sees in Stage."** The chain is **Stage authors
(live) → bake → slab → Preview measures it == Production ships it.** So "all on == production" is the
*tail* of the chain, not the whole of it: the thing you measure in Preview is only legitimate if it's
the faithful bake of what **Stage displays**. Verifying only Preview↔Production can miss that *both*
diverge from Stage — e.g., an authored layer that didn't bake through (a slab gap; the "Stage dark
but Preview fine = half-baked slab" failure mode). Your audit cross-checks against Stage and **flags**
divergence; it does **not fix** slab-completeness gaps (that's SLAB-CONTRACT territory — see scope).

## Current state (verified 2026-05-26)

- **All geometry layers conditional-MOUNT:** `{layers.fog && …}`, `ground`, `slabBuildings`, `trees`,
  `park`, `lights`, `arch`, `celestial`, `clouds` (`PreviewApp.jsx:686–723`). Toggling off unmounts →
  disposes geometry/textures; toggling on re-uploads + re-compiles. Destructive churn; `renderer.info`
  right after a remount is unstable.
- **Buildings double-toggle is miswired:** `buildings` gates the *live* (already-hidden) LafayetteScene
  buildings via `hiddenLayers`; `slabBuildings` mounts the slab (`:707`, `:715`). So toggling "Buildings"
  off does nothing to the *rendered* (slab) cost — the "meter doesn't move as expected" symptom.
- **PostFX toggles are prop-gated** (`ao/bloom/aerial/grade/grain` as props, `:730`) — a different,
  already-non-destructive mechanism (effect inclusion in the composer). Likely fine; confirm in audit.
- **GpuMonitor reads `renderer.info`** (draws/tris/ms) + a per-layer `measureToggle`. Note: **no
  overdraw field** — overdraw only manifests as frame-ms under a fill-bound profile.

---

## Phase 0 — Audit (NO code change; mandatory first)

1. **Inventory** every layer toggle and exactly how it gates cost (conditional-mount / `hiddenLayers`
   prop / PostFX prop / `SHOT_SKIP`). Table it.
2. **"All on" == production?** Compare the Preview render tree with all toggles on against production
   `src/components/Scene.jsx`'s mount list. Enumerate every divergence (the live-vs-slab buildings
   path, any Preview-only mounts, prop differences). The target end-state: all-on Preview is production's
   exact render tree.
2b. **And == Stage?** Cross-check the measured layer set against what **Stage** (`/cartograph.html` in
   shot modes) displays — Stage is the authored source of truth ("the product is what the operator sees
   in Stage"). A layer Stage shows but Preview doesn't measure = a candidate **slab gap** (authored-but-
   not-baked); a layer Preview/production renders that Stage doesn't = **drift**. **Flag these as
   findings — do NOT fix them here** (slab-completeness is SLAB-CONTRACT territory). The point is to
   confirm the meter measures the faithful bake of the authored product, and to surface it if it doesn't.
3. **Sanity-test the meter empirically.** On a fixed shot/TOD, toggle each layer and record the
   draws/tris/ms delta. Flag any toggle whose delta is implausible (buildings ≈ 0 today). Establish
   whether there's a fixed **baseline** cost (everything off) that should be subtracted, and whether
   `renderer.info` is read after it stabilizes (not mid-remount).
4. **Pin the intent: render cost vs memory.** Per-frame *render* cost (draws/tris/fill — the mobile
   bomb) is measured cleanly by `.visible=false` (skips the draw, no churn). GPU *memory* needs
   disposal. Confirm the regime's goal is render cost (recommend: yes) — that decides the gating
   mechanism. If memory attribution is also wanted, that's a separate explicit mode, not the default.
5. **Note CPU vs GPU:** an invisible component's `useFrame`/uniform updates still run (CPU). Fine for
   GPU attribution; flag any layer where that materially skews `ms`.

Write a findings note in this brief before Phase 1. **Surface anything that contradicts this brief**
— especially if the audit shows conditional-mount was intentional for a reason this brief missed.

## Phase 1 — Non-destructive `.visible` gating (geometry layers)

Mount every production layer **exactly as `Scene.jsx` does** (same components, props, baked assets),
unconditionally; toggles flip `visible` (or a layer mask), not the mount.

- **"All on" becomes production's literal render tree** — verify against the Phase-0 divergence list.
- Each toggle **cleanly zeroes that layer's per-frame draws/tris when off**, with no dispose/re-upload
  and instant re-enable.
- PostFX toggles: keep their prop/composer mechanism (already non-destructive) unless the audit says
  otherwise.

- **Fixes:** the meter delta per toggle is a clean steady-state per-frame cost; "all on" reads true
  production load.
- **Verify:** toggle each layer repeatedly — meter moves by a stable, repeatable amount, no transient
  spikes, instant re-enable. "All on" draws/tris match a production (`index.html`) reading of the same
  shot.

## Phase 2 — Collapse the buildings double-toggle + set the convention

- **One "Buildings" toggle** gating the *slab* buildings' visibility (live path stays hidden, exactly
  like production). Remove `slabBuildings`. Migrate the persisted layer key (`preview.layers.v*`).
- **Document the toggle convention** (in `PreviewApp` + wherever Preview's contract is noted): toggles
  gate `.visible`, never the mount; **migration A/B flags are temporary** — collapse to a single layer
  toggle once the new path is operator-confirmed. This is the convention **Azimuth's tree-impostor
  Preview flag (Phase C) must follow** — coordinate so it lands as a temporary flag, not a permanent
  second toggle.
- **Panel honesty:** surface the two inherent caveats so readings aren't misread — (a) per-layer deltas
  are **non-additive** (overdraw: toggling trees off lowers buildings' fill cost too), so always show
  the true "all-on" production anchor; (b) the meter is **render cost, not memory**.

- **Verify:** one buildings toggle that actually moves the meter; convention documented; no double
  toggles remain.

---

## Explicitly out of scope

Editing `src/components/Scene.jsx` (production render tree is the reference, not the target — only read
it); the GpuMonitor's internals beyond what's needed to trust the reading (no new overdraw-capture
instrumentation unless the audit proves it necessary — surface as a decision); the neon and tree feature
arcs (you set the toggle convention they follow; you don't implement their layers). Memory-attribution
mode is out unless the audit elevates it. **Fixing Stage↔Preview↔Production parity / slab-completeness
gaps is OUT — flag them as findings only;** closing a slab gap is SLAB-CONTRACT work. **That fix is the
designated NEXT arc (operator, 2026-05-26)** — so make your flagged divergence inventory clean and
complete; it's the input that scopes the next arc (it feeds `cartograph/BACKLOG.md`'s "Slab completeness"
track). Enumerating well here is part of the job even though fixing isn't.

## Commit boundaries

One commit per phase, each independently revertible. Phase 0 is findings-only (no code). Canonical
off-limits: `Scene.jsx` (read-only reference), the neon glow doctrine, the slab contract. **Convergence:**
this touches `PreviewApp.jsx`, which Azimuth's tree arc will also touch at its Phase C (impostor flag) —
**surface to Boz before landing Phase 2** so we sequence against Azimuth's PreviewApp edits and his flag
adopts your convention. Check in with Jacob after **Phase 0** (does the audit match his read of the
meter misbehavior?) and after **Phase 2** (one-toggle + convention). Surface anything not in this brief
in your status + commit bodies.

---

# Phase 0 — Audit Findings (Vernier, 2026-05-26) — NO CODE CHANGED

Agent: **Vernier**. Read-only static audit of `PreviewApp.jsx`, `GpuMonitor.jsx`, `PreviewPostFx.jsx`,
`LafayetteScene.jsx`, `SlabBuildings.jsx` against `Scene.jsx` (production) and the Stage 3D render tree
(`CartographApp.jsx` + `StageApp.jsx#StageEnvironment`). Empirical meter-toggle run is the Jacob seam
(he already reports the buildings-toggle symptom — §3 predicts every toggle's behavior to confirm against).

## §1 — Toggle → cost-gating inventory

| Toggle (key) | Gating mechanism | Destructive? | Notes |
|---|---|---|---|
| `ground` | conditional-MOUNT `{layers.ground && <BakedGround/>}` (`:698`) | **yes** | unmount disposes ground geo/tex |
| `buildings` | **prop** → `hiddenLayers.building` on LafayetteScene (`:707`) | n/a (see §2-bug) | `building: !buildings \|\| slabBuildings` — **dead when slab on** |
| `slabBuildings` | conditional-MOUNT `{layers.slabBuildings && <SlabBuildings/>}` (`:715`) | **yes** | this is the A/B that actually swaps the rendered path |
| `trees` | conditional-MOUNT (`:718`) | **yes** | |
| `park` | conditional-MOUNT (`:721`) | **yes** | |
| `lights` | conditional-MOUNT `<BakedLamps>` (`:722`) | **yes** | |
| `arch` | conditional-MOUNT (`:723`) | **yes** | |
| `neon` | **prop** → `hiddenLayers.neon` + `forceNeonOn` on LafayetteScene (`:707-708`) | no | but inside LafayetteScene neon is still `{!hide.neon && <SceneNeon/>}` (mount) — see §2 |
| `celestial` | conditional **swap** `celestial ? <CelestialBodies/> : <BasicLights/>` (`:692`) | **yes** | OFF substitutes BasicLights, doesn't remove light |
| `clouds` | conditional-MOUNT `<Atmosphere>` (`:695`) | **yes** | |
| `fog` | conditional-MOUNT `<StageFog>` (`:686`) | **yes** | |
| `ao/bloom/aerial/grade/grain` | **prop** → pass mounts inside `<EffectComposer>` (PreviewPostFx) | **yes-ish** | composer rebuilds + recompiles passes on change; `!anyOn` unmounts the whole composer. This is the *only* mechanism postprocessing offers — accepted, but the churn caveat applies to FX deltas too. |

`hide.building`/`hide.neon` inside LafayetteScene are themselves conditional-MOUNT
(`LafayetteScene.jsx:1276,1291`), not `.visible` — so even the prop-gated toggles unmount their target.

**Verdict:** every SCENE geometry toggle is destructive conditional-mount. Confirms the brief's premise.

## §2 — The buildings double-toggle bug (root cause, confirmed)

Defaults: `buildings:true, slabBuildings:true`. The wiring (`:707`):
`hiddenLayers.building = !layers.buildings || layers.slabBuildings`.

- **All-on:** `building = !true || true = true` → live buildings hidden (unmounted), **SlabBuildings renders**. Correct, matches production.
- **Toggle "Buildings" OFF** → `building = !false || true = true` → **unchanged** (still hidden). SlabBuildings (the *rendered* path) untouched. **Meter does not move.** ← exactly Jacob's symptom.
- **Toggle "Buildings → Slab (A/B)" OFF** → SlabBuildings unmounts AND `building = !true || false = false` → live buildings mount. This is a slab↔live **swap**, not an off.

So there is **no toggle that cleanly turns buildings off**: you'd need both off simultaneously. The "Buildings" checkbox only does anything when slab is already off (i.e. it's a no-op in the default/production config). This is the miswire Phase 2 collapses.

## §3 — Meter behavior: a SECOND, independent bug in `GpuMonitor` (flag — decision needed)

Even with a perfectly-wired `.visible` toggle, the measured delta would read **~10% of the true cost**, for a window-mismatch reason separate from the mount churn:

- `measureToggle` snapshots `pre` at toggle time, then captures `post` after `MEASURE_DELAY = 30` frames (`GpuMonitor.jsx:32-34,148-160`).
- But `snapshotStats()` averages the last `SAMPLE_WINDOW = 30` **samples**, and samples are pushed **once per 10 frames** (inside the `% 10` block, `:127,143`). So the averaging window spans **~300 frames (~5 s)**, while the pre→post delay is only **30 frames**.
- At `post`, only ~3 of the 30 averaged samples postdate the toggle → `post ≈ 0.9·pre + 0.1·steady` → **measured Δ ≈ 0.1 × true Δ.**

Consequence: buildings reads ≈0 today for **two** compounding reasons — (a) the toggle changes nothing (§2), and (b) even a working toggle is diluted ~10×. The remount transient (dispose/upload spike) also lands inside those ~3 post samples, so the reading can be noisy or wrong-signed. **This is squarely "needed to trust the reading" — recommend fixing alongside Phase 1** (e.g. `MEASURE_DELAY` ≥ averaging span, or average only post-toggle samples). Flagging as a decision per the GpuMonitor-internals scope line; will not touch it without your nod.

**Predicted per-toggle behavior on a fixed shot/TOD (to confirm empirically):** all geometry toggles move the meter by a diluted, transient-contaminated amount with a remount spike on flip; `buildings` moves ≈0; `slabBuildings` swaps cost (live↔slab draw-call delta, not a zero); `celestial` never fully zeros (BasicLights substitutes); FX toggles move cleanly-ish but rebuild the composer.

## §4 — Render cost vs memory (intent confirmation)

The mobile bomb is per-frame **render** cost (draws/fill/tris). `.visible=false` skips the draw with no
churn and keeps geometry resident — the right instrument. **Recommend: regime goal = render cost.**
Memory attribution (needs real disposal) should be a separate explicit mode, not the default. Panel must
*say* "render cost, not memory" so `.visible` readings aren't misread as a memory budget.

## §5 — CPU vs GPU caveat

An invisible component's `useFrame`/uniform writes still run on CPU (InstancedTrees wind, Atmosphere cloud
advection, the PostFx FxDriver, the various tickers). So the **`ms`** delta for a `.visible`-gated layer
won't fully zero — only its **draws/tris** will. `ms` attribution is muddier than draws/tris; the clean
signals are draws/tris. Worth a one-line panel note.

## §6 — Stage ↔ Preview ↔ Production divergence inventory (FLAG-ONLY — scopes the NEXT arc)

"All-on == production" is the tail; the head is "the product is what the operator sees in **Stage**."
Below: every divergence across the three consumers. **None fixed here** — slab-completeness is
SLAB-CONTRACT territory and the operator-designated next arc. Severity = impact on the *measurement's*
legitimacy (does Preview measure the faithful bake of the authored product, in production's actual regime?).

| # | Divergence | Stage | Preview | Production | Type / severity |
|---|---|---|---|---|---|
| **A** | **Buildings path** | LIVE `LafayetteScene` buildings; no `SlabBuildings`; neon/selection off live source | `SlabBuildings` (default) + live hidden | `SlabBuildings` + live hidden | **Intended cutover.** Slab must be the faithful bake of Stage's live. *Candidate slab gap only if slab ≠ live visually.* → parity arc: A/B Stage-live vs slab at matched shot/TOD. |
| **B** | **Neon force-on** | `forceNeonOn` from store (QA) | `forceNeonOn = layers.neon` → **all tubes forced on** (worst-case) | authored open/closed × TOD, no force | Intended (worst-case profiling). **Caveat:** Preview neon COST ≠ production neon cost. |
| **C** | **TOD pinned** | live/authored | `ForceDaytimeOnMount` → **10:30 fixed** | live/authored | Intended (repeatable). **Caveat:** night layers (neon, lamp glow, sun) under-measured at 10:30. |
| **D** | **UserDot / CourierDots** | ❌ neither | ❌ neither | ✅ **both mounted** (`:704-705`) | **Preview drift from production** — "all-on" ≠ prod literal tree; these are unmeasured layers. Small/variable draw cost (geolocation+courier feed). Flag for parity arc. |
| **E** | **logarithmicDepthBuffer** | ON | **ON** | **OFF** (`Scene.jsx` omits it) | **Critical.** Preview measures under LOG depth; production ships LINEAR → different depth-cull / z-fight / overdraw. `[[project_production_linear_depth_gap]]`, queued Option-A. **Preview≠prod at the depth regime.** |
| **F** | **Phone mode ≠ mobile path** | n/a | "Phone" is a viewport frame; still desktop settings (antialias on, `dpr [1,1.5]`, shadows soft, full lamps, **textured** SlabBuildings since `IS_MOBILE` false in desktop browser) | real mobile path gates `dpr=1`, antialias off, shadows off, `DeferredStreetLights`, arch hero-only | **Critical for a mobile-perf instrument.** Phone-mode numbers are desktop-quality-settings numbers. The whole mobile arc measures the wrong profile unless Phone adopts IS_MOBILE gating. |
| **G** | **frameloop** | always | always | **demand + FrameLimiter** (30/60fps, pauses on overlays) | Intended (Preview honest continuous cost). `ms` is continuous-render; prod throttles. |
| **H** | **BakedGround exag** | per-shot `targetExag` | per-shot `targetExag` (`:698`) | **no `targetExag`** → component default (`Scene.jsx:698`) | Preview/Stage morph ground per shot; production doesn't. Possible visible + measured ground divergence. Flag. |
| **I** | **PostFX component** | `PostProcessing` + overrides | `PreviewPostFx` (per-effect toggle, reads scene.json) | `PostProcessing` (frozen scene.json) | All-FX-on passes match (N8AO/Bloom/Aerial/Grade/Grain). **Verify in parity arc:** pass ORDER + any production pass NOT exposed as a Preview toggle (e.g. tone/SMAA) → would be silently unmeasured. |
| **J** | **LampGlowDriver** | custom `LampGlowPump`+`NeonPump` (module uniforms) | `LampGlowDriver` | `LampGlowDriver` | Same uniform outcome, different driver. Not a render-cost divergence. Note only. |
| **K** | **near plane** | — | fixed `near:1` | CameraRig sets `near:10` in hero, `1` else | Minor depth-precision diff. Note. |
| **L** | **celestial OFF substitutes BasicLights** | — | OFF → `BasicLights` (a Preview-only fallback that production has no analog for) | always CelestialBodies | Preview-only; only matters when toggled off. Note. |

**Severity ranking for the next arc:** E (linear-vs-log) and F (phone≠mobile) are the two that most undermine
the mobile-perf numbers — both mean Preview measures a *different render regime* than production ships.
A is the canonical slab-completeness check (is the slab a faithful bake of Stage's live?). D/H/I are smaller
parity gaps. B/C/G/J/K/L are intended-or-cosmetic (document, don't "fix").

## §7 — Contradictions with the brief?

None material. The brief's model holds: toggles should gate `.visible`, the buildings double-toggle is
miswired, conditional-mount is not intentional. **One thing the brief didn't anticipate:** the §3
GpuMonitor window-mismatch is an *independent* meter bug — fixing the mount churn (Phase 1) is necessary
but **not sufficient** for trustworthy deltas; §3 must also be addressed or every layer still reads ~10×
low. Surfacing for a Phase-1-scope decision.

## Recommended sequencing into Phase 1/2

1. Phase 1: mount all production layers unconditionally, gate `.visible`; fold the §3 `MEASURE_DELAY`/window
   fix in (with Jacob's nod) so the per-frame deltas read true.
2. Phase 2: collapse buildings to one `.visible`-gated toggle on the slab; document the convention; migrate
   `preview.layers.v2 → v3`. Surface to Boz before landing (Azimuth PreviewApp convergence).
3. Defer §6 to the next arc (operator-designated). E + F are the highest-leverage parity gaps.
