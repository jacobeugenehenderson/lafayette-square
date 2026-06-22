# Handoff — Real Depth-of-Field: the romance *and* the invisible LoD cover

> **Status: DRAFT (2026-06-21, Boz) — design assembled, not yet phased-for-dispatch.** Pulls the
> long-scattered "real DoF" aim into one current plan and **supersedes the conflicting fake-blur
> direction** (`HANDOFF-tree-hero-lod.md`, now archived → `cartograph/_archive/HANDOFF-tree-hero-lod-2026-06-21.md`).
> This is the return FOREST-BUILDER §14 anticipated: *"if the arc ever returns it would likely rebuild
> around **real** DoF — the value preserved is the design, not the buggy classifier."*
>
> ⛔ **ROUTE FIRST** (`CLAUDE.md`): `ORIENTATION.md` → `README §⭐ START HERE` (Preview / Stage rows) →
> `cartograph/PREVIEW.md` + `cartograph/STAGE.md` (the design surface — **author in Stage, confirm in
> Preview**; the arrow is Stage → Preview/Production, `HANDOFF-render-conformance.md §conformance principle`)
> → the source material below → this brief.
>
> **Source material (read, don't re-derive):** `scratch/CHANNEL-ECONOMY-FORENSIC.md` (the reuse
> architecture — the whole §2 opportunity analysis + §3 implications), `cartograph/_archive/FOREST-BUILDER-DESIGN-v1-superseded-2026-06-18.md`
> (Espalier — the DoF-gated-LoD aim), `scratch/FOREST-BUILDER-KIT-MATCHER.md §14` (the dormant hero-LOD
> code, kept not deleted), `src/components/PostProcessing.jsx` (the post stack), `treeAtlasMaterial.js`
> (the one-program Bloom constraint).

---

## The aim (Jacob, recovered 2026-06-21)

Drop the reliance on a fake blur; **build a real depth-of-field** that does **two jobs at once**
(Espalier, verbatim):

> **"DoF-gated detail-LoD — real depth-of-field for romance AND as the cover that lets leaf detail taper
> *invisibly* in blurred zones — trees never disappear / cull stays vetoed; popping dissolves."**

DoF does not *replace* LoD; it makes aggressive LoD **imperceptible** — leaf/tree detail drops off in the
mid/far field, but that field is blurred, so the drop-off can't be seen. The romance look and the perf
cover are the **same pass**. Three operator values frame every decision here:

1. **As few knobs as possible** — one "distance treatment" that earns its slot by doing romance + LoD.
2. **Knobs visibly active** — pushable to an obvious extreme so the operator can see what they do.
3. **Easy on the C/GPU** — every shared primitive reused, never a redundant pass.

## What's settled going in (don't re-derive)

- **There is NO DoF today, anywhere** (`CHANNEL-ECONOMY §3 Q1`: `grep depthoffield|bokeh|CoC|DoF` over
  `src/` = zero hits). This is **net-new engineering**, not wiring an existing effect.
- **Two blur strategies existed; this picks the real one.** The archived `tree-hero-lod` used
  *"impostor flatness IS the DoF blur"* (fake blur via billboards + a `cull` tier). No-cull is doctrine
  → the cull half is vetoed; the fake-blur half is **superseded by this real-DoF plan**. The merged
  per-pixel "depth-Halo taper" Boz floated 2026-06-21 is also *not* this — it fades, it can't blur.
  **Halo stays as-is** (the cheap day-only screen-haze the operator likes — separate effect, not folded).
- **The screen vs. real distinction:** a per-pixel merged effect can *fade* (contrast/sat/haze by depth)
  for free; it **cannot blur** (neighbour sampling = a convolution pass). Real DoF *is* a convolution
  pass — so the whole game is making that pass cheap by **reuse** (below), not avoiding it.

## The reuse architecture — how a real DoF stays GPU-cheap (`CHANNEL-ECONOMY §2`)

The forensic already worked out (verified against the library, not guessed) how a real DoF reuses what
the stack already pays for. **The operator's gate on all of it: a shared resource is its own Preview
gauge line; each consumer is a measurable delta; NEVER pipe one effect *through* another's result
(coupling = non-starter).**

- **#2 — a shared `DownsamplePyramid` resource.** Bloom builds an internal down/up mip pyramid
  (`MipmapBlurPass`) that is **not exposed**, and the stock `DepthOfFieldEffect` builds its **own** CoC +
  bokeh pyramid and **won't accept an external chain**. So sharing is a **build, not a knob**: author one
  custom `DownsamplePyramid` pass (its own gauge line) that **both** Bloom (bright-pass blur) and DoF
  (full-scene blur + CoC-lerp) *sample* — sharing the **pyramid**, never the **result**. One downsample
  instead of two when both are on (desktop). **Side benefit the calm-canopy wants for free:** the
  far-field blur smothers far-canopy leaf shimmer.
- **#4 — reuse N8AO's depth.** N8AO already computes a scene depth buffer; DoF needs exactly a depth/CoC
  buffer. Source DoF's depth from that target — **no redundant depth prepass**. (Shared resource, own
  line, consumers as deltas.)
- **#3 (adjacent) — AO duplication.** The baked `ground.lightmap.png` and runtime N8AO partially
  duplicate ground AO; scope / TOD-gate N8AO against the free baked lightmap. Frees desktop fill that DoF
  will want.

## The hard constraints (weigh before building)

- ⭐ **The tree material is ONE shader program *because Bloom requires it*** — stated twice in
  `treeAtlasMaterial.js` as "non-negotiable" (`:117`, `:722`). **The leaf-detail taper MUST happen
  *within* that one program** (uniform / tier-driven, exactly as the bark-tier selector already does) —
  **never by forking per-tier materials** (that breaks the bloom-stability guarantee). "Popping dissolves
  in the blur" is a *uniform* lerp under one program, gated by the tree's blur-zone.
- **DoF is desktop-first.** Bloom (and therefore the shared pyramid) is **desktop-only** — mobile post is
  `FilmGrade → SMAA → FilmGrain` (`PostProcessing.jsx:371`). So the bloom-shared DoF + its LoD cover is a
  desktop/`phone-hi` story; **the mobile leaf-taper needs its own answer** (open decision below — do NOT
  assume DoF on `phone-lo`).
- **Bloom is SOUND** (confirmed Jacob, 2026-06-21 — the "known-broken pending tree-atlas work" flag was
  stale, and the cited `project_bloom_diagnosis_actual.md` never existed). The whole night-glow economy
  *and* the shared pyramid (Phase 1) hang off Bloom, so this was the gate — **now cleared.** Phase 1 is
  unblocked. (Bloom is still default-OFF in *Preview* only, so a reload doesn't burn into a black scene —
  a QA default, not breakage.)
- **Fix the heroTier mis-aim (now unblocked).** The dormant `classifyHeroTiers` scored the wrong camera
  target (~1200 m off) because it never used `resolveHeroSubject`. That shared resolver **now exists**
  (render-conformance Phase 2 landed, `src/lib/heroSubject.js`). Any LoD/DoF gate that keys off camera
  framing must use it, or it judges the wrong shot (`audit-arborist §2`).

---

## The build (phased — each its own commit; high blast-radius, serialize)

### Phase 0 — Pre-reqs / health (no DoF code)
- Confirm Bloom is sound (single-page tree atlas; default-off is a QA bypass, not breakage).
- Adopt `resolveHeroSubject` in `bake-trees.js` + re-bake so the camera-framing gate is aimed right.
- Re-confirm DoF is genuinely absent (it is) — net-new.

### Phase 1 — The shared `DownsamplePyramid` resource (own gauge line; desktop-first)
Author the custom down/up mip pass as its own EffectComposer stage **with its own Preview gauge
line-item**. Refactor Bloom to sample it for the bright-pass blur (replacing the internal unexposed
`MipmapBlurPass`). **Verify:** Bloom's per-channel delta unchanged; the pyramid reads as its own line;
no coupling (the result is not shared, only the pyramid).

### Phase 2 — The DoF effect (custom TWO-FOCAL CoC from depth; own gauge line)
⭐ **The focus model (Jacob, 2026-06-21) — genuinely two-focal, NOT a single plane:**
- **Near plane sharp** — the "front row" by the camera (e.g. the park edge).
- **Far plane sharp** — the **Hero Object (the Arch) at infinity focus**.
- **Graded blur everywhere else** — in front of the near plane (too-close) AND through the mid-distance,
  easing back to sharp as depth reaches the Arch/infinity.

So **CoC(depth) has TWO zeros** (near + infinity) with a hump between — `CoC = maxBlur · smoothstep(near,
mid, d) · smoothstep(far, mid, d)`-shaped. ⛔ **Stock `DepthOfField` cannot do this** (one focal plane →
monotonic CoC → it would blur the Arch). So the effect is **custom from the start** — no stock-DoF proving
shortcut. CoC sourced from depth (reuse **N8AO's depth target**, #4); blur = lerp the scene toward a
blurred copy by CoC. **Blur source:** start simple-but-real (a small own blur) to see the look, then
optimize to the shared Bloom pyramid (Phase 1). Default OFF until tuned. Its own gauge line.

### Phase 3 — The DoF channel — authored in Stage, confirmed in Preview
Wire `dof` as a peer channel exactly like bloom/ao (`DOF_FIELDS`/`DEFAULTS`/`FIELD_KEYS` in
`skyLightChannels.js` → consumer in `PostProcessing.jsx` → store action → **Stage Post-card** mount →
`bake-scene.js` emit → `scene.json`). **Fewest knobs:** focus distance · focus range · blur/bokeh
strength (+ on/off). **0 → Extreme ranges** (the slider-range principle — see the audit list). Author in
Stage (the design surface), confirm it survived the bake in Preview.

### Phase 4 — The LoD cover (the payoff) — leaf taper *within one program*
Drive a leaf-detail taper uniform off each tree's blur-zone (CoC / camera-distance, via the now-correct
heroTier framing), **inside the single tree shader program** — never per-tier materials. Aggressive
detail/overdraw reduction in blurred zones, invisible because blurred. This is "trees never disappear /
popping dissolves." **Verify:** hero-shot tree overdraw/draws drop (Preview GPU panel) with no visible
pop across the pan; calm far-canopy.

### Phase 5 — Fewer knobs / Day-Night budget (the consolidation; `CHANNEL-ECONOMY §1, §3`)
- **AO duplication (#3):** scope / TOD-gate N8AO against the free baked lightmap.
- **Day/Night gating (#1 — the biggest clean win):** DoF + AerialPerspective are day-dominant (dead at
  night) → drop them off the *night* budget; the night set (lamp overdraw, neon additive, star/
  constellation transforms) draws by day for zero payoff → drop off the *day* budget. Do it as a
  `.visible`/budget gate with a **twilight cross-fade**, never mount/unmount. Home: extend the Preview
  channel-listing editorial surface from Desktop/Mobile to **Desktop/Mobile × Day/Night**
  (`HANDOFF-preview-measurement.md §6`).
- Re-evaluate which remaining effects still earn their slot once DoF carries the distance romance.

---

## Measurement discipline (the operator's gate, applied throughout)
Every new pass/resource (the pyramid, the DoF effect, the shared depth target) lands as **its own Preview
gauge line-item**; every consumer is a **cheap measurable delta** on top. Anything that fuses two effects
so their costs can't be separated is rejected. Ties directly to the v0.2 measurement regime
(`HANDOFF-preview-measurement.md`); these new lines populate it.

## Open decisions (Jacob's)
1. **Mobile leaf-taper** — DoF is desktop-first (Bloom-only). Does `phone-lo` get a *separate, cheaper*
   leaf-detail taper (uniform by camera-distance, no DoF pass), or does the calm-canopy carry mobile on
   its own? (Don't assume DoF on mobile.)
2. **DoF default + scope** — OFF until authored, then per-Look on; is it per-shot (hero/browse warrant
   romance; street maybe not) or one global authored curve?
3. **Sequence** — this collides on `PostProcessing.jsx` + the tree material with **render-conformance**
   and the **arborist leaf-model** arc; serialize (surface to Boz). Likely after the leaf-model Ways
   polish so the taper has real detail to taper.

## Coordination / blast radius
Touches `PostProcessing.jsx`, the Bloom wiring, a new shared-pyramid + DoF effect, `skyLightChannels.js`,
the Stage Post-card, `bake-scene.js`, **and the tree shader/material + `bake-trees`/`bake-look`**. **HIGH
convergence** with `HANDOFF-render-conformance.md` (PostProcessing/Scene) and the arborist arc (the tree
material) — **serialize on those files; surface to Boz before editing.** Canonical off-limits unless the
dispatch says so: the neon doctrine, the slab contract, the one-tree-program Bloom constraint. 49/51
throughout — cheaper *and* it must look like romance.

*Filed 2026-06-21 (Boz). Supersedes the fake-blur half of the archived `tree-hero-lod`. The Reference home
for the settled result is `cartograph/PREVIEW.md` / `STAGE.md` on landing.*
