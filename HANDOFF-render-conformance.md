# Handoff (DRAFT — cold-review before dispatch) — Render-Environment Conformance: One Pass to Production Parity

> **Status: DRAFT, large + high-blast-radius.** Touches the production Canvas, all authoring Canvases,
> the camera rig, post-FX, and the mobile path. Cold-review (fresh-Boz + Jacob) before dispatch.
> **Goal:** the production runtime renders identically to the surfaces that authored it — on desktop
> AND on the virtual phone — and the operator can toggle layers + bake the slab himself, reliably,
> without per-change back-and-forth. Synthesized from three fresh audits (production / Cartograph
> trinity / helpers+mobile) + Vernier's §6 divergence inventory.

## The conformance principle

Production is the reference for **what mounts and what's authored** (the render tree + slab channels).
The **depth regime** is the exception — and it's **per-device** (forensic verdict): the kit "LOG
mandatory" doctrine holds for desktop (production-desktop conforms UP to it = parity + far-field gain),
but **mobile stays LINEAR pending measurement** because a global LOG flip kills early-Z on mobile WebGL2
(see Phase 1 + [[project_production_linear_depth_gap]]). The win where production conforms is **parity**
(production renders like what the operator authors/sees), not a z-fighting fix. "The product is what the operator sees in Stage"
([[project_preview_equals_ls_literally]], [[project_stage_consumer_parity]]) — and Stage is LOG.

**⚠️ Z-fighting is a KNOWN, still-open issue (operator-deprioritized to cosmetic) — NOT solved, and NOT
in scope here.** Do not claim or assume conforming to LOG resolves it. The authoring surfaces run LOG
*and still z-fight* at the tolerated level; production-under-LOG inherits the same. Coplanar z-fighting
(ground ribbons, foundations — polygonOffset cases) is depth-*independent*; LOG mainly helps the
far-field distribution. Conformance's only obligation re: z-fighting is **make it no worse than the
authoring surfaces** — fixing z-fighting itself is a separate, deprioritized future arc.

## The root finding (the spine)

**Everything that built the slab runs `logarithmicDepthBuffer: true` (Designer/Stage `CartographApp.jsx:805`,
Preview `PreviewApp.jsx:650`, Meteorologist `CanaryScene.jsx`); production `Scene.jsx:649` OMITS it → LINEAR.**
The operator authors/measures under LOG and ships LINEAR. Doctrine says LOG is mandatory kit-wide; the
near:1/far:60000 frustum needs it. This is the most likely cause of the deployed jank and the same root
that produced the neon-over-trees bug ([[project_production_linear_depth_gap]]).

---

## Phase 0 — Inspect & baseline (no code)
- Confirm the depth-regime table above on the current tree; confirm `Scene.jsx` still omits log.
- Capture a before screenshot set at Hero/Browse/Street in the deployed app (the symptoms to beat).
- **Verify the trees atlas is single-page** (`bake-look.js#unifyAtlases` output) — if it regressed to
  multi-page, the bloom flicker is that, not depth. Rule it in/out before Phase 4.
- Confirm `src/instance.js` is the synchronous home for global mobile-quality (it is — docstring
  "fixed-truth the slab doesn't carry"; [[project_mobile_profile_authored_channel]]).

## Phase 1 — Depth conformance: DESKTOP→LOG (the spine; own commit) — NOT a global flip
**AMENDED by forensic verdict (2026-05-26, [[project_production_linear_depth_gap]]):** the original
"global production→LOG" was wrong on mobile. On WebGL2 (every mobile target) a global
`logarithmicDepthBuffer:true` writes `gl_FragDepth` for every material → **disables early-Z** → taxes
the canopy-overdraw budget the tree arc fights (the canopy doctrine *relies* on early-Z). So depth is a
**per-device (mobile-class) quality knob**, not a global flip:
- **Desktop → LOG now.** Safe: it's the validated authoring regime, N8AO + all post-FX already run under
  it in Stage/Preview (H3 refuted — N8AO is fine under LOG), NeonBands auto-adapts via its
  `gl.capabilities.logarithmicDepthBuffer` gate (Ballast Option B — do not re-hardcode), far-field
  precision improves at near:1/far:60000. Drive it from `INSTANCE.mobileQuality` (the depth knob), set
  LOG for desktop.
- **Mobile → stays LINEAR for now**, gated behind a **Phase-4 virtual-phone measurement** (draws/tris/ms,
  log vs linear, at Browse/Hero/Street under the mobile profile). The early-Z penalty magnitude is
  *unprovable from the repo* — measure before flipping mobile. The depth regime lives in the mobile class
  (Phase 5 / the mobile-class brief) as a global-quality knob.
- **Fixes:** desktop parity + far-field precision; expected to resolve the deployed-DESKTOP jank and
  neon-far-over-trees at the root. (Does NOT fix z-fighting — see ⚠️ above. Mobile depth deferred to a
  measurement, not assumed.)
- **Verify (scene-wide, the blast-radius check):** at Hero/Browse/Street in the deployed app, walk the
  coplanar-stack hotspots — BakedGround ribbons/grass (the `polygonOffset` parity surfaces), building
  foundations, terrain, neon over trees. Nothing should z-fight *worse* than the LOG authoring surfaces
  (it should match them). If a surface regresses, its polygonOffset/renderOrder was linear-tuned — fix
  it to the LOG values the authoring surface uses (they're the source of truth).

## Phase 2 — Camera: stop using stale pre-slab data (own commit)
Root cause (Agent A): the hero transition fires before `scene.json` resolves, capturing a stale FOV in
`fromFov` (`Scene.jsx:493-523`), then lerping stale→authored. Fix: **defer the hero transition until the
slab resolves** (or re-seed `fromFov`/target when the slab arrives mid-transition). Prefer defer —
simpler, race-free.
- **Fixes:** the janky deployed camera ("old camera data with the new setup").
- **Verify:** cold-load the deployed app into Hero — camera lands on the authored keyframe path with no
  snap/lerp-from-stale; matches Stage/Preview hero motion.

### Phase 2 — EXPANDED root causes (Vernier camera diagnosis, 2026-05-26)
The deployed camera is "wrong top-to-bottom" because production's `CameraRig` rides **stale hardcoded
`PRESETS`** instead of the slab's authored framing — a stronger version of the `fromFov` bug above. Two
distinct divergences, both **camera-conformance** (production must frame like the authoring surfaces it
was tuned on). **This must hold across ALL camera instantiations** (production `CameraRig`, Preview
`ShotCamera`, Stage's CartographApp camera, and any future one) — the slab is the single source of camera
framing; no camera may re-hardcode a pose the slab authors.

**(A) Browse ignores the slab bounds.** Production reads only `shots.values.browse.fov` and centers Browse
on hardcoded `PRESETS.browse` = `[0,0,0]` / altitude `600` (`Scene.jsx:61,461`). But the slab authors
`shots.values.browse.bounds` = `{cx:95, cz:-158, w:1292, h:1025, padding:1.05}`. Preview/Stage center on
`[95,-158]` via `SHOTS.browse` + `computeBrowseAltitude(aspect, fov)` fit to the bounds. So deployed Browse
is off-center by ~`[95,-158]` AND at the wrong altitude → wrong view + controls pivoting on the wrong point.
**Fix:** production CameraRig must read `scene.shots.values.browse.bounds` (cx/cz center + `computeBrowseAltitude`)
exactly as Preview does — drop the `[0,0,0]/600` hardcode.

**(B) Hero-subject contract is mismatched across the bake boundary.** Intended behavior (operator): the
Hero shot keeps a designated **hero object** centered no matter where the camera moves — and CameraRig
already re-locks `ctl.target` to the subject every frame (`Scene.jsx:582`), so the mechanism exists. The
break is in the data contract:
  - `design.json#heroSubject` is an operator **designation** `{kind:'building'|'landmark'|'arch', id}` (or null).
  - `bake-scene.js:117` bakes `design.heroSubject || null` — the **raw, UNRESOLVED designation**.
  - Stage resolves it live: `resolveHeroSubject(designation, buildings)` → `[x,y,z]` (`StageApp.jsx:548`,
    `CartographApp.jsx:997`).
  - Production (`Scene.jsx:211`) + Preview (`ShotCamera:148`) test `Array.isArray(scene.heroSubject)` —
    they expect a **resolved point** and **never call `resolveHeroSubject`**. A `{kind,id}` object fails
    `Array.isArray` → both **always fall back to `[400,45,-100]`** (legacy arch centroid) regardless of
    designation. (For lafayette-square `heroSubject` is also `null` today — undesignated — so the fallback
    fires for that reason too.)
  - **Fix (the durable contract):** the **bake resolves the subject** — run `resolveHeroSubject` at bake
    time and write the resolved `[x,y,z]` to `scene.heroSubject` (slab owns spatial identity per
    `[[project_slab_render_vs_content_boundary]]`). Then every camera consumer reads one resolved point,
    identically; the per-frame target-lock already centers it. `resolveHeroSubject` is the **single shared
    resolver** — lift it to a shared module so bake + all runtimes resolve identically (don't let any camera
    re-derive a subject differently). Arch subjects resolve from the baked `arch` channel at bake time too.
  - **Operator action (separate from the code fix):** designate a hero object per Look in Stage
    (SurveyorPanel) — until then the resolved-fallback applies; consider making that fallback the
    neighborhood/browse-bounds center, not the arch centroid, so an undesignated Look doesn't frame a
    building edge.

**Scope note:** (A) is production CameraRig (Phase 2, `Scene.jsx`). (B) spans the **bake** (`bake-scene.js`)
+ the slab schema + the camera consumers — it's slab-completeness/conformance, larger than Phase 2's
`fromFov` fix. Sequence both under the camera/conformance work; do not let a camera fix re-hardcode what
the slab should author.

## Phase 3 — Consolidate the mobile path (own commit; no behavior change)
Replace the **6 duplicated `/iPhone|iPad|iPod|Android/i` regexes** (Scene, PostProcessing, LafayetteScene
×2, StreetLights, SlabBuildings) with ONE shared device-sense (`src/utils/deviceDetect.js` or
`instance.js`). Pure refactor, zero behavior change — sets the foundation for the profile.

## Phase 4 — The virtual phone renders the mobile profile (the deploy-on-phone gate; own commit)
Today Preview "Phone" mode renders DESKTOP settings in a phone viewport (Vernier §6-F) — so the virtual
phone tests nothing real. Make **phone-mode adopt the mobile render path** (the `IS_MOBILE` gating:
antialias off, dpr 1, shadows off, deferred lamps, mobile post-fx tier). This is what makes "deploy on
the virtual phone" meaningful AND makes the mobile-perf meter trustworthy.
- **Fixes:** virtual phone == real mobile; mobile-perf numbers become real.
- **Verify:** Preview phone-mode draw/tris/ms match a real-mobile-profile reading; the bloom-less mobile
  post-fx tier shows.

## Phase 5 — Mobile policy → authored, three homes (the big one; references HANDOFF-mobile-profile.md)
Per the cold-reviewed mobile-profile design ([[project_mobile_profile_authored_channel]]), route the
`IS_MOBILE` policy to its homes — **device *sensing* stays code; *policy* becomes data**:
- **Layer inclusion** (lamps, arch, StageShadows) → per-Look slab channel (Stage-authored).
- **Global GPU quality** (dpr/antialias/shadows/post-fx tier) → `INSTANCE.mobileQuality` (synchronous —
  Canvas-construction props can't be async slab).
- **Authored-value variants** → slab channels. **Confirmed needed:** `StreetLights` already hand-wires
  wider halo / brighter pool-alpha on mobile "to compensate for no bloom" (`StreetLights:29-38,234`).
  So mobile needs different *authored values* (e.g. `lampGlowMobile`, mobile neon/bloom), not just on/off
  — this is your #4, vindicated by the existing code.
- **Shader-baked/structural tail** (building texture-skip, GLSL constants) → stays code-side, documented.
- Seed every home from today's hardwired values → no day-one behavior change; hardwires then come out.
- **Stage authoring UX — a "Mobile | Desktop" profile selector.** Flipping it (a) re-renders Stage in
  that profile (mobile post-FX tier, dropped layers, compensated values — operator sees the truth) and
  (b) targets the per-Look knobs (inclusion + authored-value variants) at that profile. **Desktop is the
  base; Mobile is a DELTA/override** — seed Mobile from Desktop, author only what differs (drops +
  compensations); untouched knobs inherit Desktop. Do NOT make the operator author two full Looks (same
  override-layer pattern as the palette carve-out, [[project_authoring_is_live_production_is_static]]).
  The selector *applies* the INSTANCE global-quality tier in the mobile render but does NOT expose it as
  a per-Look knob (it's product-wide, not authored). This is the same profile Preview's Phase-4 phone
  mode renders — Stage authors it live, Preview inspects the baked result.
- **This phase is large — it may sub-phase or spin to its own brief once Phases 1–4 land.** Surface to Boz.

## Phase 6 — Parity cleanups (own commits)
- **`UserDot` + `CourierDots`** mount in Preview (production has them; "all-on" must == production).
- **`BakedGround targetExag`** — decide: is per-shot ground morph intended in production? If yes, add it
  to `Scene.jsx`; if no, strip it from authoring. Conform either way.
- **Arborist `SpecimenViewport`** — add `logarithmicDepthBuffer: true` defensively (Meteorologist already
  has it; Arborist lacks it but is safe today only because it uses no raw shaders — harden before a raw
  shader lands).
- Audit post-FX pass order/unexposed passes (Vernier §6-I).

## Phase 7 — Self-serve bake/test loop + true-parity sign-off
Confirm the operator can, unaided: toggle layers in Preview (trustworthy meter), bake the slab from Stage
(the "↻" loop), and see an **identical render across Designer→Stage→Preview→Production, on desktop AND
the virtual phone**. Document the bake/test loop so Jacob isn't dependent on an agent per change.
- **Verify:** the true-parity laser — same shot/TOD, all four surfaces + phone, no divergence beyond the
  intended-and-documented ones (neon-force-on, TOD-pin, frameloop).

---

## Decisions embedded (flag to overturn)
1. **Depth is a per-device mobile-class knob: DESKTOP→LOG now, MOBILE→LINEAR pending a phone measurement**
   (AMENDED by forensic verdict, [[project_production_linear_depth_gap]] — supersedes the original
   "global production→LOG"). A global flip would write `gl_FragDepth` on mobile WebGL2 → kill early-Z →
   hurt the canopy fill-rate budget. Desktop-LOG is safe (validated, N8AO works under it, NeonBands
   auto-adapts); mobile-LOG is unmeasured — decide it in Phase 4/5, don't assume it.
2. **Camera: defer hero transition** until slab resolves (vs re-seed mid-transition) — race-free.
3. **Mobile = three homes** (inclusion/slab, quality/INSTANCE, authored-values/slab) — the cold-reviewed
   split, now with authored-value variants confirmed real by StreetLights.

## Sequencing / convergence
Phases 1–2 (depth, camera) are the highest-leverage and lowest-coupling — **land first**, they likely fix
the deployed symptoms outright. Phase 3 (dedup) is a safe refactor anytime. Phase 4 (phone=mobile) gates
the virtual-phone goal. Phase 5 (authored mobile policy) is the big arc — may spin out. Touches
`Scene.jsx`, `PreviewApp.jsx`, `PostProcessing.jsx`, `instance.js`, the slab schema, Stage. Tree arc
(Azimuth) is at its A→B seam and will touch `Scene.jsx`/`PreviewApp.jsx` at its Phase C/E — **serialize**:
this conformance arc and the tree arc must not both edit those files at once (surface to Boz).

## Commit boundaries
One commit per phase, each independently revertible — critically so for Phase 1 (depth), whose blast
radius wants a clean revert if z-fighting surfaces. Canonical off-limits: the neon glow doctrine, the
slab contract (except the documented mobile channels). Check in with Jacob after **Phase 1** (does the
deployed jank clear?), after **Phase 4** (virtual phone real?), and before **Phase 5** (the big mobile
arc). 49/51 throughout: conformance is correctness *and* the look must hold on every screen.
