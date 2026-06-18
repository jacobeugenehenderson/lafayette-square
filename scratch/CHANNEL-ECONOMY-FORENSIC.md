# Forensic — The Channel Economy (read-only census + opportunity analysis)

> **Pathologist: Prism.** (A prism splits one white beam into its component channels —
> the exact move this forensic makes on the render.) Read-only walk, 2026-06-18. **No code
> changed, no pipeline touched.** Classifications carry evidence per `AUDIT-MATRIX.md`;
> every load-bearing claim re-verified against the code/library myself (two `Explore`
> sweeps fed breadth — I re-checked each finding; one missed the tree bloom-stability
> constraint, corrected below per `audit-arborist.md §6`'s "verify the artifact" rule).

---

## 0. Frame — what this is, and the lens vs. the subject

The operator's question (paraphrased, ratified 2026-06-18): *stop reasoning about one pair of
effects at a time; inventory the whole channel economy and determine what's actually on the
table to stack / share / repurpose / cut / split-by-time-of-day.*

**Scope anchor (operator ruling, 2026-06-18):** whole-app in *reach*, **slab-anchored** in
*focus* — every channel that **constitutes or configures the shipped Slab**. So the census
target is: (a) **baked content** (ground, buildings, trees, lamps, AO lightmap), and (b) the
**baked render/effect *configuration*** a Look carries through `scene.json` into the runtime
(bloom params, the TOD curves, post-fx settings). The measurement/toggle regime (gauges,
device profiles) is the **lens** I measure *with* — it is not itself a census row. Pure
authoring/dev scaffolding that never ships (debug overlays, QC tints, the gauges) is excluded.
Inclusion test: *does this channel end up in, or shape, what the public's slab renders?*

**The acceptance test carried through Part 2 (operator ruling):** "fusing two effects couples
them — that negates the point." Any opportunity that destroys clean **per-channel
measurement** is a non-starter. Sharing is only valuable if the shared part stays
**independently measurable** — a shared resource as its own gauge line-item, each consumer a
cheap measurable delta on top. This is applied as a pass/fail gate on every Part-2 item.

### The lens, in one paragraph (so the costs below are legible)

The regime is now an honest **work-vs-budget** instrument, not a frame-ms meter. `deviceProfiles.js`
is the SSoT: `desktop` (generous-but-real ceiling), `phone-hi` (iPhone 16 Pro Max), `phone-lo`
(Galaxy A54 — the floor we guarantee); active default `phone-hi`, draw/tri budgets an **INTERIM
200 / 1M** until a Phase-3 real-device measurement (a green verdict is *explicitly not yet a ship
call*). `GpuMonitor` reads `renderer.info` per frame with `autoReset=false` + per-frame delta-ing
(so multi-pass post-FX is counted honestly), and attributes **per-channel cost** via `measureToggle`:
settled pre-baseline → skip 2 transient samples → average 5 settled post-samples → signed Δ in
{ms, draws, tris}. **Crucial limitation the operator already documented in the UI:** toggles hide a
layer's *draw*, geometry stays GPU-resident (it's a render-cost, not a memory, instrument); and
**"deltas don't sum — overdraw is shared (hiding trees also cuts buildings' fill); trust the all-on
total, not the sum of layers."** That overdraw-sharing fact is the physical basis for several
opportunities below.

---

## 1. The channel census

Four tables: **A. Post-process** (image-space, `scene.json`-configured) · **B. World &
lighting** (atmospherics + emissive, `scene.json`-configured) · **C. Baked content** (geometry
in the slab) · **D. Tree material sub-channels** (absorbed from Increment, `audit-arborist.md`).

Cost legend: ✅ = individually `measureToggle`-attributable in Preview today; ⛔ = **measurement
gap** (no per-channel toggle, folds into a parent or the all-on total). "Mobile" notes the
`IS_MOBILE` render-path fork.

### A. Post-process channels — the EffectComposer stack

The production/Stage stack order (`PostProcessing.jsx`): **N8AO → Bloom → AerialPerspective →
FilmGrade → SMAA → FilmGrain**. Every param is a TOD-shaped channel resolved per-minute from
`scene.json` (override → baked → flat-default). ⭐ **Mobile drops the heavy half of the stack:**
the `IS_MOBILE` branch mounts **only FilmGrade → SMAA → FilmGrain** — **no N8AO, no Bloom, no
AerialPerspective** (`PostProcessing.jsx:371`). SMAA is mobile's *only* AA (Canvas MSAA is
desktop-only).

| Channel | What it is | Authored where | Toggle / measure | Cost | Shares / reads | TOD | Host parity | Class |
|---|---|---|---|---|---|---|---|---|
| **Bloom** | `@react-three/postprocessing` `Bloom`, `mipmapBlur` on, SCREEN blend; the glow amplifier | Post card → `scene.bloom` {intensity, threshold, smoothing} | ✅ Preview FX toggle (`bloom`) | 1 bright-pass + **internal mip pyramid** (down+up `MipmapBlurPass`) + composite. Fill-bound. **Desktop/Stage only** | Builds its own mip pyramid (`MipmapBlurPass`, lib-internal, **not exposed**); reads scene HDR target. **The emissive consumers (lamp glass, tree lamp-glow, sky/star) depend on it to glow** | both (night-leaning: it's what makes night emissive read) | **Divergent**: prod+Stage yes, **mobile NO**; Preview default-**off** (flagged known-broken pending tree-atlas work) | **real** (but see §2 health note) |
| **AO (N8AO)** | Screen-space ambient occlusion post pass; `halfRes` off only in hero | Post card → `scene.ao` {radius, intensity, distanceFalloff} | ✅ Preview FX toggle (`ao`) | Depth + AO sample pass; halfRes elsewhere. **Desktop/Stage only** | Computes/reads a **depth buffer + AO buffer** (a reusable primitive — see Part 2) | both | Divergent: **mobile NO** | **real** |
| **Exposure** | `gl.toneMappingExposure` + FilmGrade `uExposure` | Post card → `scene.exposure` | ⛔ no individual toggle (rides FilmGrade/Canvas) | ~0 (uniform) | drives tone-map; mirrored to a module ref so composer-bypass paths agree | both | same (its own `ExposureTicker` for bypass paths) | **real** |
| **Warmth** | FilmGrade white-balance bias | Post card → `scene.warmth` | ⛔ rides FilmGrade | ~0 (uniform) | FilmGrade `uWarmth` | both | same | **real** |
| **Fill** | Shadow-toe lift (distinct↔soft shadows) | Post card → `scene.fill` | ⛔ rides FilmGrade | ~0 (uniform) | FilmGrade `uToe` (piecewise; overrides grade.toe) | both | same | **real** |
| **Grade** | FilmGrade contrast/sat/vignette + the whole film curve | Post card → `scene.grade` | ✅ Preview FX toggle (`grade`) | 1 fullscreen pass (cheap) | reads `uSunAlt` (TOD physics on top of authored) | both | same (mobile keeps it) | **real** |
| **Grain** | FilmGrain animated film grain | Post card → `scene.grain` | ✅ Preview FX toggle (`grain`) | 1 fullscreen pass (cheap) | reads sun-altitude day-factor | both (day-scaled) | same (mobile keeps it) | **real** (cosmetic) |
| **Halo / Aerial** | `AerialPerspective` horizon haze | Sky&Light → `scene.halo` {strength, color} | ✅ Preview FX toggle (`aerial`) | 1 fullscreen pass; gated to `dayFactor` | reads sun-altitude (day-only gate) | **day-dominant** (off at night) | Divergent: **mobile NO** | **real** |
| **SMAA** | Edge AA; ULTRA preset | Post card → `scene.smaa` (static on/off) | ✅ Preview FX toggle (`smaa`) | 1 cheap fullscreen pass | composite key flips on toggle (forces composer rebuild) | neutral | same; **mobile's only AA** | **real** |
| **Tone-mapping** | ACESFilmic, Canvas-level | not a channel (Canvas const) + Exposure | ⛔ structural | ~0 | exposure drives it | neutral | same all hosts | **real** |
| **DoF / bokeh** | — | — | — | **ABSENT** | — | — | — | **does not exist** (see §3) |

### B. World & lighting channels — atmospherics + emissive

| Channel | What it is | Authored where | Toggle / measure | Cost | Shares / reads | TOD | Host parity | Class |
|---|---|---|---|---|---|---|---|---|
| **Sky (GradientSky)** | 4-band dome shader; `renderOrder -1000` | Sky&Light → `scene.sky` grid + `skyGain` | ✅ Preview `celestial` (bundles sky+sun+stars+moon) | 1 dome draw + per-minute color resolve | `uSkyGain` scales whole dome last | both (authored per-TOD) | prod always; Stage shots-only; Preview gated | **real** |
| **Stars / moon** | ~523 catalog + 3000 filler stars (Points), 3D moon | derived (ephemeris) + lighting channels | rides `celestial` toggle | heavy per-frame star transform; additive draws | additive output → **bloom samples it** (glow) | **night-dominant** (opacity ramps with sunAlt) | rides celestial | **real** |
| **Constellations** | Planetarium lines+dots+labels | `scene.constellations` (now **styling only**, not visibility) | rides `celestial` (no own toggle) | ⚠️ ~165 unbatched draws (labels each a Text mesh) + full per-frame recompute | sidereal time (not TOD) | **night** but **street-view-only** (`viewMode==='planetarium'`) | prod street-view; Stage/Preview via overlay | **real** (cost-heavy; street-gated) |
| **Milky Way** | sky-band glow term | `scene.milkywsy`→`milkyway` {value} default **0** | ⛔ rides celestial | ~0 when 0 | sky shader | night | same | **duct-tape-ish** (default-off, author-dormant) |
| **Mist / Fog** | `FogExp2` density+color | Sky&Light → `scene.mist` | ✅ Preview `fog` (nulls `scene.fog` non-destructively) | ~0 (scene property, no draw) | every material's fog chunk (free piggyback) | both | prod+Stage+Preview; Preview adds `enabled` | **real** |
| **Shadows** | `SoftShadows` size/samples | Post card → `scene.shadow` | ⛔ **no Preview toggle** (always mounts) | shadow-map render; **desktop/non-mobile only** | shadow map; `focus 0.35` | both | Divergent: **prod mobile NO**, Stage shots, Preview always | **real** (measurement gap) |
| **Ambient / Hemi / Sun / Moon light** | 4 intensity-multiplier channels | Sky&Light | ⛔ no individual toggle | ~0 (lights) | feed CelestialBodies lighting config | both (phase-selected) | same | **real** |
| **Lamp glow** | shared `_lampGlow` uniforms {grass, trees, pool} | Sky&Light → `scene.lampGlow`; Stage via `LampGlowPump` | ⛔ **no Preview toggle** (`LampGlowDriver` always mounts) | ~0 driver; **its visible cost rides Streetlamps/Trees/Park draws** | written once; **read by grassMaterial, treeAtlasMaterial, StreetLights** (3 consumers, one source) | **night-dominant** (ramps off by day) | prod+Preview driver; Stage pump | **real** (cross-channel spine) |
| **Neon** | merged rooftop tube; 3 Gaussian masks (core/tube/bleed) + emissive | Sky&Light → `scene.neon` {core,tube,bleed,emissive,tubeRadius}; Stage `NeonPump` | ✅ Preview `neon` (forces all tubes on = worst-case) | 1 merged additive draw; **the bleed term is built to bloom** ("volumetric glow at zero geometric cost") | shared `_neonUniforms`; `#ifdef USE_LOGDEPTHBUF` (prod linear vs Stage/Preview log) | **night-dominant** (author-gated; default invisible) | parity (merged consumer) | **real** |
| **Clouds (CloudDome/Atmosphere)** | cheap dome or volumetric | `scene.clouds` | ✅ Preview `clouds` | dome cheap; volumetric heavy | weather drivers | day-leaning | gated all hosts; **volumetric behind `SKY_IS_VOLUMETRIC`** | **duct-tape** (`scene.clouds` **dead in shipping path** until volumetric lands — `AUDIT-MATRIX` knot) |

### C. Baked content channels — geometry in the slab

| Channel | What it is | Authored where | Toggle / measure | Cost | Shares / reads | TOD | Host parity | Class |
|---|---|---|---|---|---|---|---|---|
| **Ground** | single-mesh slab, 44 groups (10 land-use faces + 34 mat overlays) | bake (`ground.json/.bin`); colors from `design.json` | ✅ Preview `ground` | 1 big mesh, many groups; per-group baked-Y z-resolve | terrain-lift uniform; lightmap UVs | neutral | parity (BakedGround) | **real** |
| **Ground lightmap (baked AO)** | static AO PNG sampled by ground | `bake-ground-ao.js` (`ground.lightmap.png`) | ⛔ no toggle (texture on ground) | ~0 (1 texture sample) | **distinct from runtime N8AO** — both occlude the ground (partial duplication) | neutral | parity | **real** (overlaps N8AO — Part 2) |
| **Buildings** | merged mesh v2 + per-building render index | bake (`buildings.json` v2) | ✅ Preview `buildings` (gates slab `.visible`) | ~9 group meshes | per-building index → neon anchors, selection | neutral | parity (SlabBuildings prod+Preview); Stage live for retint | **real** |
| **Lamps** | point cloud → StreetLights geometry (posts/halo/bulb/pool) | bake (`lamps.json`) | ✅ Preview `lights` | 4–5 InstancedMesh; **additive overdraw** (halo/bulb/pool, no depth-write) | reads `_lampGlow.poolUniform`; glass emissive **wants bloom** | **night-dominant** | prod desktop direct / **mobile deferred 4 s**; Stage shots; Preview gated | **real** |
| **Trees (placement + atlas)** | 745 instances, per-(url×tile) InstancedMesh; one shared atlas material | bake (`default.json` + `trees-atlas.json`) | ✅ Preview `trees` | ~77 InstancedMesh typical; transparent leaf cards (alphaTest) | shared atlas; lamp-glow uniform; wind uniforms | both | parity (InstancedTrees) | **real** (sub-channels in D) |
| **Water / Park** | LafayettePark paths+water; ground `water` face | bake (ground groups) + live LafayettePark | ✅ Preview `park` | small | grass/lamp uniforms | neutral | parity | **real** (L1.2: trim duplicate live imports — open) |
| **Gateway Arch** | landmark + uplights | `scene.arch.values` | ✅ Preview `arch` | small mesh + lights | hero-camera target resolves from `arch.values` | both | prod (desktop/hero); Stage; Preview | **real** |

### D. Tree material sub-channels (absorbed from Increment — `audit-arborist.md §1a`, not re-audited)

All ride the **single shared `MeshStandardMaterial`** (one shader program — a hard Bloom
constraint, see §3) with per-draw uniform mutation; none individually `measureToggle`-able (they
fold into the `trees` toggle). Costs are vertex/fragment work, not extra draws.

| Sub-channel | What it is | TOD | Class (Increment) |
|---|---|---|---|
| Bark tint / region | per-(species,draw) retint via uniforms | neutral | real |
| Bark gradient LUT | luminance-sampled gradient ramp | neutral | real |
| Bark detail | overlay-blended detail tile (hero/street only) | neutral | real |
| Bark posterized | tier≤1 substrate resample | neutral | real |
| Deformer (lean/twist/wander) | per-instance vertex displacement | neutral | real |
| Wind / sway | spatial-advection gust field (`treeSwayUniforms`) | neutral (continuous) | real |
| Lamp glow (canopy) | warm emissive into `totalEmissiveRadiance`, canopy-gated | **night** | real |
| heroTier QC | per-instance mesh/impostor/cull attr → QC tint | n/a (dev) | real mechanism, **classifier scores the WRONG camera target (~1200 m off)** — §2 headline of Increment; **blocks the hero-LOD payoff** |
| Bark shader tier | camera-altitude aerial/hero/street selector | n/a | **duct-tape** (calibrated to retired camera consts) |

---

## 2. What's on the table — the opportunity analysis (ranked)

Each item states mechanism · estimated win · risk · **and the non-coupling/measurability verdict**
(the operator's gate). Ranked by leverage for the tree DoF/LOD design that spawned this.

### #1 — Day/Night channel sets: drop night channels off the *daytime* budget (and vice-versa). ✅ PASSES

**Mechanism.** The TOD channel spine (`resolveGroupAtMinute`) already resolves every channel
per-minute, and the night channels already *fade their emissive* to ~0 by day (lamp glow ramps off
at `sunAlt ≥ 0.15`; neon author-gated; stars opacity-ramp). **But fading emissive to zero does not
stop the draw** — the lamp additive passes (halo/bulb/pool, no depth-write = overdraw), the merged
neon additive mesh, and the star transforms all still execute by day for zero visual payoff. The
move: gate the *mount/visibility* of the night-only channels on a TOD threshold, not just their
brightness — and symmetrically, the future DoF + AerialPerspective (already `dayFactor`-gated to
~0 at night) could drop off the *night* budget.

**Win.** Night set (lamp overdraw + neon additive + star/constellation transforms) is a real
daytime draw/fill saving — and on **phone-lo**, where overdraw is the thermal enemy, removing
additive passes in the half-day they contribute nothing is exactly the "earn its slot" decision.
Constellations are already street-view-only (the pattern exists); this generalizes it to TOD.

**Risk.** Twilight hand-off must cross-fade, not pop (the existing ramps give the window). Mount
churn on a TOD threshold violates the regime's "gate `.visible`, don't unmount" doctrine — so do it
as a **`.visible`/budget gate**, not mount/unmount.

**Measurability verdict — PASSES, and *strengthens* it.** Each channel stays its own gauge
line-item; TOD-gating just zeroes its cost in the dead half-day. This is precisely the operator's
"could a channel be off the budget entirely in the half-day it doesn't earn its keep" — and the
channel-listing editorial surface (`HANDOFF-preview-measurement.md §6`) is the natural home: a
**Desktop/Mobile × Day/Night** inclusion matrix instead of just Desktop/Mobile.

### #2 — A shared downsample/blur pyramid as its own measured resource (the seed hypothesis). ✅ PASSES *only if built as a resource, not fused*

**Confirmed from the library, not guessed:** our Bloom builds an **internal `MipmapBlurPass`**
(`postprocessing` build line 3866) — a real down/up mip pyramid — but it is **not exposed** as a
reusable resource, and the library's `DepthOfFieldEffect` (which *does* exist in the package, the
React `DepthOfField` wrapper is exported) **builds its own CoC + bokeh pyramid and does not accept
an external mip chain.** So the off-the-shelf answer to "can DoF ride Bloom's pyramid" is **no — not
without custom effect code.**

**Mechanism (if pursued).** Author a **single shared `DownsamplePyramid` pass** as its own
EffectComposer stage with its own gauge line-item; Bloom samples it for the bright-pass blur, a
future DoF samples it for the full-scene blur + CoC-lerp. They share the *pyramid*, never the
*result* (bloom = blurred bright-pass added; DoF = blurred full-scene CoC-lerped — different
consumers).

**Win.** One downsample instead of two when both are on (desktop, where both live). Also a
**two-for-one side benefit the calm-canopy goal wants**: the pyramid's far-field blur smothers
far-canopy leaf shimmer for free.

**Risk.** This is a **build, not a knob** (confirmed above) — a custom shared-resource refactor of
the post stack. Bloom is also currently desktop-only and flagged known-broken pending tree-atlas
work, so the shared resource would be desktop-first.

**Measurability verdict — PASSES IFF the pyramid is its own gauge line and each consumer a
measurable delta.** If instead DoF were piped *through* Bloom's result, that couples them and is a
non-starter (operator ruling). The discipline: **shared resource = its own row; consumers = deltas.**

### #3 — Collapse the AO duplication: runtime N8AO vs. the baked ground lightmap. ✅ PASSES

**Mechanism.** Two AO channels occlude the same ground: the **static baked `ground.lightmap.png`**
(free, one texture sample) and the **runtime N8AO post pass** (a depth+AO pass, desktop-only). On
the ground plane specifically they partially duplicate. Option: let the baked lightmap carry the
ground/large-scale AO and scope N8AO to the contact-shadow scale it's uniquely good at (or drop it
on phone-lo entirely, where it's already absent).

**Win.** N8AO is one of the heavier desktop passes; narrowing its job (or its on-budget window) is
real fill savings, and it's *already off on mobile* — so this is a desktop-tier and `phone-hi`
decision.

**Risk.** The lightmap is baked for the ground bbox only; buildings/trees still want runtime AO.
Don't regress contact occlusion under trees/eaves.

**Measurability verdict — PASSES.** Both are already separate channels; this is a scoping decision
measured by toggling N8AO with the lightmap present vs. absent. No coupling.

### #4 — Repurpose the depth buffer N8AO already computes (feeds fog and a future DoF CoC). ✅ PASSES (as a shared resource)

**Mechanism.** N8AO computes scene depth. Fog (`FogExp2`) is currently a free per-material chunk
(no extra pass) so it needs nothing — but a **future DoF** needs exactly a depth/CoC buffer. If DoF
is built, source its depth from the already-computed depth target rather than a second depth pass.

**Win.** Avoids a redundant depth prepass when DoF lands.

**Risk.** Depends on DoF being built at all (it isn't — §3). Forward-looking, not actionable today.

**Measurability verdict — PASSES** if the depth target is a named shared resource (its own line),
consumers as deltas.

### #5 — Cut / dormant channels (tag, don't cut — removal freeze holds). 

Per `AUDIT-MATRIX` the v1 **removal freeze** is in force (tag into the deferred queue, cut in one
post-v1 window). Flagged here for the *budget* conversation, not for deletion:

- **`scene.clouds` is dead in the shipping path** until volumetric `Atmosphere` lands (`AUDIT-MATRIX`
  knot) — it carries authored state that the public never sees. Decide: wire volumetric, or stop
  authoring it.
- **Milky Way** defaults to 0 (author-dormant) — costs nothing, but it's an unearned channel slot.
- **Grain / (and arguably Halo)** are cheap cosmetic fullscreen passes; Halo is day-only. On
  phone-lo they're candidates for the Day/Night inclusion matrix (#1), not the stack.
- **Bloom is default-OFF in Preview and flagged known-broken pending tree-atlas work** — this is a
  *health* flag, not a cut: the entire night glow economy (lamp glass emissive, tree lamp-glow,
  star/neon bloom) hangs off it. Resolve before leaning on any bloom-sharing opportunity (#2).
- Tree-pipeline cruft (Increment): `BAKE_URL` hardwire, `heroTier` wrong-target — tracked in
  `audit-arborist.md`, out of render-channel scope but **the heroTier bug blocks the LOD payoff §3**.

---

## 3. Implications for the tree DoF/LOD design (the immediate consumer)

The three questions blocking the Espalier revision, answered from the code:

**1. Is there a real DoF pass today, or only the fake-blur plan?**
**Only the plan. There is NO DoF anywhere.** `grep -rniE "depthoffield|bokeh|CoC|depth.of.field|DoF"`
over `src/` returns **zero hits**. The post stack is N8AO → Bloom → AerialPerspective → FilmGrade →
SMAA → FilmGrain — no focus-blur pass in production, Stage, or Preview. So "DoF-gated detail-LOD"
starts from **building DoF**, not wiring an existing one. (The Azimuth "fake-blur-via-impostor" is
the only blur concept on the table; a *real* post DoF does not exist.)

**2. Can DoF ride Bloom's blur pyramid as a shared (measurable, uncoupled) resource — or is that a
refactor?**
**It's a refactor / build — not a knob-wire** (verified against the library, not assumed). Our Bloom
uses an internal `MipmapBlurPass` that is **not exposed**, and the `postprocessing` lib's
`DepthOfFieldEffect` builds its **own** CoC/bokeh pyramid and **won't accept an external mip chain.**
To share, you'd author a custom **DownsamplePyramid resource** (Part 2 #2) that both sample — which
is the *right* shape under the operator's gate (pyramid = its own gauge line, each consumer a
delta), but it is engineering, not configuration. Compounding: **Bloom is desktop-only** (mobile
post is FilmGrade→SMAA→FilmGrain), so any bloom-shared DoF is desktop-first and a separate mobile
story is needed. **So: DoF-gated tree LOD is a BUILD, and it must answer the mobile path on its own.**

**3. How do the tree/leaf/bloom/DoF channels sit in the toggle+gauge regime today?**
- **Trees** are one `measureToggle`-attributable channel (✅). The leaf/bark **sub-channels are NOT
  individually measurable** — they all ride the single shared tree shader program (D), which is a
  **hard Bloom constraint, not an accident**: `treeAtlasMaterial.js:117` ("Bloom needs a single
  tree-fragment program … non-negotiable") and `:722` ("One material → one shader program, which is
  the constraint Bloom requires … alphaTest+alphaToCoverage gives crisp leaf edges **without
  per-frame jitter under Bloom**"). ⭐ **This is the tree↔bloom coupling the Espalier design must
  respect:** the calm-canopy / DoF-LOD work cannot fork the tree material into per-tier shader
  programs without breaking the bloom-stability guarantee. Leaf detail must taper *within one
  program* (uniform/tier-driven, as the bark-tier selector already does), which is exactly the
  "popping dissolves in the blur" idea — but the blur (DoF) doesn't exist yet (Q1).
- **Bloom** is ✅-measurable, desktop-only, and currently default-off/known-broken — see #5.
- **DoF** is unmeasurable because it's unbuilt; when built it must land as its own gauge line.
- **Blocking dependency from Increment:** the `heroTier` classifier scores the wrong camera target
  (~1200 m off) — any LOD/DoF-gated tapering that keys off heroTier inherits a mis-aimed split until
  `bake-trees` adopts the shared `resolveHeroSubject` + re-bakes (`audit-arborist.md §2`). Fix that
  first or the gated LOD judges the wrong shot.

---

## For the Boz / Jacob review

The census is done; the honest headline is that **the channel economy is healthier and more
*separable* than "we keep guessing pair-by-pair" implied** — almost everything is already its own
TOD-shaped channel resolved from `scene.json`, and the gauge already attributes the big ones. The
real finds are four, each passing the no-coupling gate:

**1. Day/Night is the biggest, cleanest win — and it's the operator's own instinct, vindicated.**
The night channels (lamp overdraw, neon additive, star/constellation transforms) still *draw* by
day even though their emissive has faded to nothing; the day channels (AerialPerspective, a future
DoF) are dead at night. Gating *visibility/budget* by TOD — not just brightness — drops each off the
budget in its dead half-day, and it strengthens measurement rather than coupling (each stays its own
gauge line). The tradeoff: it wants a `.visible`/budget gate with a twilight cross-fade, never
mount/unmount, and it's most valuable on phone-lo where overdraw is the thermal enemy. Natural home:
extend the channel-listing editorial surface from Desktop/Mobile to **Desktop/Mobile × Day/Night**.

**2. The shared-blur-pyramid hypothesis is real but it's a *build*, not a wire — and I confirmed
that against the library, not from memory.** Bloom's mip pyramid is internal and unexposed; the
stock DoF effect won't accept an external one. The only way to share is to author a `DownsamplePyramid`
as its *own* gauge line that both Bloom and a future DoF sample (sharing the pyramid, never the
result). The tradeoff: it's a custom post-stack refactor, desktop-first (Bloom is desktop-only), and
gated behind actually deciding to build DoF at all.

**3. There is no DoF today, anywhere — so DoF-gated tree LOD is net-new engineering, and it collides
with a load-bearing constraint.** The tree material is deliberately *one shader program* because
Bloom requires it (stated twice in the code as "non-negotiable"); the leaf detail taper the design
wants must happen *within* that one program (uniform/tier-driven), not by forking per-tier materials.
And the blur that's supposed to hide the popping doesn't exist yet. The tradeoff to weigh: build a
real DoF (romance + the LOD cover) as its own measured channel, accepting it's desktop-first and the
mobile tapering needs a separate answer — vs. the Azimuth impostor route that needs no new post pass.

**4. Two quiet two-for-ones worth banking.** The runtime N8AO and the baked ground lightmap
partially duplicate AO on the ground — scope or TOD-gate N8AO against the free baked lightmap
(it's already off on mobile). And a future DoF should source depth from the buffer N8AO already
computes rather than a second prepass. Both are clean shared-resource moves (separate gauge lines,
no coupling); neither is urgent.

One health flag to clear before relying on any of the bloom-sharing ideas: **Bloom is default-off in
Preview and flagged known-broken pending tree-atlas work**, yet the whole night glow economy hangs
off it. Worth confirming bloom is sound before #2 leans on it.
