# Salon Interface — the design (in flight, 2026-06-25)

> **Working design doc for the Salon "fashion-plates" pivot.** Route: `ORIENTATION.md` → `arborist/README.md §⭐ START HERE` → this. Prose-first (what we want to happen) → the part model (the finite basis sets) → the per-knob triage → the wiring maps that make each cut safe. As each cut lands, its map migrates into `arborist/ARCHITECTURE.md`; this doc carries the in-flight design + open decisions. Branch `curb-offset-draw`.

---

## 1. What we want to happen (the prose)

The Salon's job is **not "configure a tree" — it's "cast a species."** The kit-matcher already changed the work: a species name → a **dossier** (the botanical *target* — really a set of rubric coordinates) → the **matcher** resolves **ranked parts** that fit it. The operator is a stylist at a rack the matcher pre-filtered.

**Rubric-forward (decided direction, 2026-06-25):** the operator authors **coordinates**, not **selections.** Parts *resolve* from the rubric coordinates automatically (matched base + parametric modifiers); the operator **accepts or overrides**, reaching for an override only when the auto-resolution is visibly wrong. This dissolves the "why make me pick a chassis you already suggested?" problem — you're not picking, you're confirming-or-overriding — and it draws the automate/manual line in the right place: **automate *resolution*; the operator tunes *coordinates* + *overrides*.** The deformer going automatic (§4) is instance #1 of this one general rule.

The nuance that protects quality: rubric-forward resolution sits **over a discrete authored library + parametric modifiers** — it *selects and modifies*, it does not *generate from scratch.* Hero/Street trees still need authored real geometry (authored > synthetic is settled doctrine). The rubric picks the right authored base **and** drives the modifiers.

**The dossier reference image is intake-only.** You read the reference *once* to encode the species' rubric coordinates (its permanent fingerprint); the image then never appears downstream. So building reference functionality isn't "disposable infrastructure" — its durable product is the dossier coordinates; the image is a one-time data-entry aid, never a runtime/authoring dependency. The roster and every per-species default then fall out of the botanical tags **programmatically.**

---

## 2. The part model — three finite, completable bases (silhouette · bark · leaf)

> The anxiety this resolves: "we don't have enough pieces for a real library / maybe just go find an authored correct tree." Answer: **the library we need is small, closed, and build-once** — because each part puts its "literalness" in a different place, and the rubric already enumerates every axis. **~40 authored bases span essentially all trees on Earth**, procured **per-family, not per-species.** "Go find the authored correct piece" is right — and bounded.

In Nature there are millions of *literal* exact forms (one+ per species). But what a tree-card needs is the **morphological base** — and those are finite, closed botanical sets. The three parts sit at different points on the literal↔parametric spectrum, which sets the shape of each sub-library:

| Part | Nature | Discrete bases | Where the "literal" lives | Parametric span (the dials) |
|---|---|---|---|---|
| **Silhouette** | most **parametric** (a growth *process*) | **~3 topologies / 9 habits** | almost nowhere | size · lean · density + per-instance deformer |
| **Bark** | **parametric** surface (tileable material) | **~8 types** | almost nowhere | color · scale · groove · plate · exfoliation + posterize recolor |
| **Leaf** | most **literal** (a fixed outline) | **~25 shape families** | the shape itself | recolor only: front/back · season (posterize) |

### Silhouette — most parametric
Not a fixed shape, a **growth process** (`spaceColonization.js` generates it from params). The discrete base is the **architecture/topology** — `spreading / strong-leader / monopodial` (Hallé & Oldeman; `ARCHITECTURE.md §Three architecture modes` — they differ in topology, no tuning converts one to another), layered with **habit** for landscape-form (`chassis.habit` = 9: vase, columnar, oval, spreading, weeping, multi-stem, pyramidal, rounded, irregular). Everything else is dials (`chassis.size / lean / density`) + the per-instance deformer (one architecture → N individuals). Smallest discrete library of the three.
- **Authored-vs-synthetic tension lives here most:** a procedural SCA-tube trunk doesn't survive feet-away; bark wants to wrap on *real* trunk geometry → **near-tier = authored real chassis** (vendor/LiDAR); far-tier = architecture + deformer. The authored chassis library is **per-architecture, a handful — not per-species.**

### Bark — a parametric surface
The most dial-able part. Discrete base = **`bark.type` (8): smooth, furrowed, plated, scaly, ridged, exfoliating, fibrous, mottled** (the pattern topology). Parametric span = `bark.color / scale_frequency / groove_depth / plate_size / exfoliation_density` + the **posterize recolor (already built** — Brief 10B `extract-bark-posterized.mjs`: median-cut → indexed PNG → atlas page → shader sample). ~8 textures, recolored/rescaled, span the world.
- **Close-range:** bark is *the* high-value Street win (LiDAR doctrine — photo-bark on real geometry). **Near-tier = real PBR** (color+normal+roughness, furrow depth) **+ tiling without the wrap-crawl seam** (open question, `ARCHITECTURE.md §Bark tile wrap` — texture-arrays or pre-tile). Far-tier = posterized substrate + gradient (built).

### Leaf — most literal
The one part where the *shape is the identity* (you can't gradient a maple into a ginkgo). So its discrete library is the biggest of the three — but still small and completable: **~25 shape families** span temperate + common trees at render distance. The rubric names 10 today (`leaf.silhouette`: palmate, lobed, heart, ovate, lanceolate, compound, fan, star, needle, scale); "complete" ≈ 20–30 (split `compound` → pinnate/bipinnate/palmate-compound; add deltoid, orbicular, obovate, elliptic). Within a base, geometry params (lobe-count 3/5/7, aspect) finish the shape.
- **Color is *not* in the shape — it's parametric** via **posterize** (Jacob's call — the bark mechanism ported): posterize a base to a few tones → each tone a swappable slot → **front-palette vs back-palette keyed off facing** = Silver Maple's silver underside (`leaf.face` = `{front: ramp, back: second ramp}`) → swap the palette LUT for the **seasonal ramp** (`leaf.season`, summer→gold→russet→bare). So one base × parametric recolor serves a whole genus; **you never need a colored pack per species.**

### Every part tiers by render-role (the LsoD applied to parts)
Optical parity is invariant; detail is the only variable (`HANDOFF-visibility-cull-lods.md` capstone). So each part has a **near-tier** (Street, eye level, feet away — paid only on the *focal* tree) and a **far-tier** (Hero/Browse/background-Street — DoF covers it), over the *same* shared base:

| Part | Near-tier (focal, Street) | Far-tier (Hero/Browse/background) |
|---|---|---|
| **Silhouette** | authored real chassis (bark wraps believably) | architecture + deformer (procedural / decimated-real) |
| **Bark** | real PBR + seam-free tiling + furrow depth | posterized substrate + gradient |
| **Leaf** | real card + **artificial translucency** + high-pass detail overlay + accurate outline | posterized cutout, front/back as palette swap |

The near-tier is paid expensively only on the **one focal/near tree** (Street = 1 full + rest hero + DoF); everything else recedes to the cheap far-tier. So the high-fidelity bases carry a *quality spec* (alpha + normal + translucency for leaves; PBR for bark; real geometry for chassis), but the **count stays ~40**, build-once.

**Near-tier leaf technique (decided 2026-06-25 — reuses the bark toolbox):** two layers, exactly mirroring bark — a **posterized substrate** (low-freq tone → the front/back/season recolor, `extract-bark-posterized.mjs` analog) + a **high-pass detail overlay** (high-freq venation/edge, Overlay-blend, gated ON only at the near tier — the same `extract-bark-detail.mjs` mechanism + the `step(0.5, uBarkShaderTier)` gate the bark already uses). Front/back two-tone via **`gl_FrontFacing`** (front-palette vs back-palette); the backlit silver-flash is **artificial translucency** — a cheap wrap/back-light term, **not real subsurface scattering** (mobile-first, cheap-by-construction). Genuinely-new shader work is small — `gl_FrontFacing` selection + the fake-translucency term; the posterize + detail-overlay machinery is reused from bark (the tree shader has no transmission/SSS today, verified). **Remaining eye-gate (operator, Street view):** how stylized the posterized tones read up close, and how strong the flash. Settled at the Salon Street view, not on paper.

---

## 3. The per-knob triage — three kinds, not all "knobs"

The current Salon's mistake is putting three different *kinds* of thing on one panel as if all were operator dials.

**A — Identity coordinates (the plates; keep, make graphical, elevate):**
`silhouette · bark · leaf · leaf-size · leaf-color`. Per-species, ship in the bake, inherently visual. In rubric-forward framing these are *resolved* from coordinates and *overridden* visually, not hand-built.

**B — Runtime variation (engine stays; authoring disappears → automatic):**
the per-instance **deformer** (lean / twist / wander). Runs at runtime, per-instance, by hash — the "compose-don't-synthesize" engine that keeps 100 instances of one chassis from looking stamped. **DECIDED 2026-06-25 (Jacob): the deformer goes automatic — ranges become rubric/morphology-derived defaults, and the authoring panel leaves the Salon entirely.** Full wiring + the cut: §4. Expressivity trade owned: a species gets a *morphology-class* lean/wander signature, not a hand-tuned one (per-species deformer tuning was never the high-value work).

**C — Vestigial / now-automatic (cut or bury):**
- **Gnomon transform gizmo** (rotateY / posOffset / tilt / scale / oubliette). Brief 19/20 recenters every chassis to trunk-base-at-origin *at source* → posOffset / rotateY / oubliette are near-no-ops. Survivors with real justification: **scale** (multipacks have no canonical height) + **de-lean tilt** — both edge-case. → demote to an "advanced / fix-this-chassis" drawer, out of the main flow.
- **Authored vs Synthesized leaf toggle** — natural is the answer everywhere; synth is a fallback for de-leafed/LiDAR chassis. Bury.
- **Multi-stop bark gradient editor + tier debug** — heavy machinery for what should be "pick a bark, maybe nudge its color." Fold color into the rubric color axis; retire the editor.

**D — Verification framings (keep, but NOT authoring knobs):**
the Street / Hero / Browse preset cameras are how you *check* the cast, not how you cast it. View toggles, off to the side. (Street is where the near-tier — §2 — gets eye-gated.)

---

## 4. The deformer — where everything is and how it connects (the safety map for §3-B)

> Written down explicitly (Jacob's instruction) BEFORE the cut, so moving the *authoring* to automatic cannot silently break the *runtime engine*. Verified against code 2026-06-25, not memory.

**The shape of it:** the deformer is a **runtime engine** + a **bake pass-through of one object** (`deformer.range = { lean:[lo,hi], twist:[lo,hi], wander:[lo,hi] }`). The engine and the transport are **agnostic to where that object comes from.** So the cut touches only the *source* of the range; everything downstream is byte-unchanged.

### The invariant seam (do not disturb)
`effective.deformer.range` — the `{ lean, twist, wander }` of `[lo,hi]` pairs. Produced once in `generate-salon.js`, consumed by bake-look → runtime. **Identity-safe:** absent/`(0,0)` range → bit-exact identity render (already the regression-safe default). Moving the *producer* from UI → rubric table is a localized change; the seam's shape never changes.

### ENGINE — runtime, UNTOUCHED by the cut
`src/components/treeAtlasMaterial.js`
- `226–236` — uniform decls: `uDeformLeanRange / uDeformTwistRange / uDeformWanderRange / uDeformSeed`, each init `Vector2(0,0)`.
- `261–266` — vertex shader: `attribute float aTreeHeightNorm` + the three range uniforms + seed.
- `274–288` — per-instance hash channels `dh5/dh6`; `leanAmt/twistAmt = mix(range, dh5)`, `wanderAmt = mix(range, dh6)`.
- `322–339` — the displacement: lean∘twist `mat3` built in `<beginnormal_vertex>` (rotates the normal too), reused on `transformed` in `<begin_vertex>`; anchor = `instanceMatrix[3].xz + uDeformSeed` (with `modelMatrix[3]` single-mesh fallback for the preview); `cantH = clamp(aTreeHeightNorm,0,1)`.
- `1010–1034` — `stampTreeVertexAttrs`: computes `aTreeHeightNorm` (chassis-wide minY/range, base→top) at **runtime-merge** time.
- `1038–1058` — `applyDeformerUniforms(material, deformerRange, seed)`: per-draw setter that writes the range object into the uniforms.

`src/components/InstancedTrees.jsx`
- `26` — imports `applyDeformerUniforms`.
- `173–198` — stamps `aTreeHeightNorm` across the collected primitives at runtime-merge.
- `300 / 311 / 346–351` — `SubmeshInstances` calls `applyDeformerUniforms(material, deformerRange)` per draw (LS seed stays 0).
- `634–671` — reads `atlas.manifest.deformerBySpecies[species].range` → the `deformerRange` prop.

### TRANSPORT — bake, UNTOUCHED (pure pass-through of `deformer.range`)
`arborist/generate-salon.js`
- `328–345` — `resolveEffective` merges the deformer default chain: `DEFAULTS.deformer` ← `chassisDefaults.deformer` ← `composition.deformer`. **← THIS is the injection point for the cut (see below).**
- `1556–1563` — `patchManifestForSalon` writes `m.deformer = { range: ... }` from the first composition's `effective.deformer.range` (single-spec per species, like bark).

`arborist/bake-look.js`
- `1025–1039` — builds `deformerBySpecies[species] = { range }` from `manifest.deformer.range`.
- `1187` — emits `deformerBySpecies` into `trees-atlas.json`.

### AUTHORING SOURCE — what the cut changes
`src/arborist/SalonWorkstage.jsx`
- `1290` — `<DeformerPanel>` mounted. **← REMOVE.**
- `1305–1310` — `DeformerPanel`: lean/twist/wander sliders → `onParams({ deformer: { range: { lean, twist, wander } } })`. **← REMOVE.**
- `454 / 715–716 / 784` — `deformer` / `deformerRange` / `deformerSeed` plumbed into the preview; the "Re-roll preview sample" (`onReroll` / `deformSeed`) fakes the population spread on one tree. **← REMOVE (preview still renders the engine, just with the auto-derived range, seed 0).**
- store: `composition.deformer.range` persisted. **← stops being written by the UI; becomes empty/reserved.**

### THE CUT (localized)
Replace the **per-species UI authoring of `composition.deformer.range`** with an **automatic resolver** at the `resolveEffective` deformer-merge layer (`generate-salon.js:342–345`): derive the range from morphology and inject it where `chassisDefaults.deformer` / `DEFAULTS.deformer` sit. Everything from `generate-salon.js:1556` onward is unchanged.

### The keying hook for "rubric-derived" (it's real, not a wish)
- **Signal:** the `chassis.habit` (9 values) + `chassis.lean` rubric axes (`arborist/rubric.json`), or the chassis `meta.morphology` (`broad / weeping / columnar / ornamental / conifer`).
- **Precedent:** `DEFAULT_SCA_BY_PRESET` (`arborist/spaceColonization.js`, used by `generate-procedural.js`) already keys per-morphology defaults by preset — the same pattern, for the procedural generator.
- **Implementation shape:** a small `DEFORMER_BY_MORPHOLOGY` table (weeping wanders/leans most; columnar least; broad moderate) resolved in `resolveEffective`, populating the deformer default where `composition.deformer` used to. One table, one resolver, no engine/transport/runtime change.

---

## 5. The interface that the prose implies

A **plate-rack, not a control panel**: roster species list (auto-populated from the dossier coordinates) → the live composed tree in the center → three resolved picks shown as **visual plates** (gray-shader silhouettes · bark swatches · leaf cutouts), each defaulting to the matcher's top resolution with an **override** affordance ("not right — let me pick") → two trims (size, color) → a readiness light (green = ships). No deformer panel, no gizmo in the main flow, no opaque ids (`Bark007` → named/thumbnailed). The whole gesture is *confirm-or-override against the resolved default*; the rubric/matcher supplies everything underneath. The Street/Hero/Browse view toggles are how the near/far tiers (§2) get eye-gated.

---

## 6. Open decisions (Jacob's call)

- [x] **Rubric-forward** (2026-06-25). Author coordinates + override, not selections; resolution is automatic; library = discrete authored bases + parametric modifiers (select-and-modify, not generate-from-scratch); reference image is intake-only.
- [x] **Part model = three finite bases** (2026-06-25): silhouette ~3 topologies/9 habits (most parametric), bark ~8 types (parametric surface), leaf ~25 shape families (most literal). ~40 authored bases total, per-family, each tiering near/far by role. Color/face/season via posterize.
- [x] **Deformer → automatic — BUILT (A1, 2026-06-25, uncommitted).** `generate-salon.js#DEFORMER_BY_MORPHOLOGY` table (broadleaf/conifer/columnar/weeping) injected at `resolveEffective`; `DeformerPanel` + re-roll removed from `SalonWorkstage.jsx`; preview reads the morphology-fed `effective`. Proven: `maple_sugar` (broadleaf) manifest now emits `deformer.range {lean[0,0.08],twist[0,0.1],wander[0,0.15]}` from an empty `composition.deformer`. Geometry GLBs byte-unchanged (deformer is runtime-only). Magnitudes are conservative starting defaults — **eye-gate pending** (the table is the knob). Docs closed: `FEATURES.md` (user/operator) + `ARCHITECTURE.md` (dev) deformer paras updated to the automatic reality.
  - ⚠️ **Doc-structure gap surfaced:** arborist has **no `OPERATIONS.md`** (its operator knobs currently live in `FEATURES.md`). The deformer operator-knob (tune the table) was written into `FEATURES.md` for now. Decide later whether to seed a dedicated arborist `OPERATIONS.md` (the quartet doctrine wants one).
- [x] **Keying for the auto deformer** (2026-06-25): `DEFORMER_BY_MORPHOLOGY` **table first** (concrete, matches the `DEFAULT_SCA_BY_PRESET` precedent); promote to the `chassis.lean` rubric scalar later if finer control is wanted.
- [x] **Triage confirmed** for §3-C (2026-06-25): gizmo → advanced drawer; Authored/Synth toggle → buried; gradient editor → retired. **Each still needs its own §4-style wiring map *before* the cut** (the doc-before-cut discipline).
- [x] **Leaf near-tier technique decided** (2026-06-25): posterize substrate + high-pass detail-overlay (near-only) + artificial translucency (`gl_FrontFacing` + cheap back-light, **not** SSS), reusing the bark toolbox. Only the *how-stylized* eye-gate remains (Street view).
- [x] **Sequencing** (2026-06-25): the **WYSIWYG plumbing leads** — and is now **verified built + carrying to the slab.** Autosave ✓ (committed), fold-regenerate-into-bake ✓ (`15682e55`), shared runtime material in the preview ✓ (Brief 7 Cambium). Propagation proven at the byte level (`scratch/measure-leaf.mjs`): a `leaves.scale: 2` edit on `maple_sugar` → published GLB leaf-edge 0.1148→0.2850 (~2.5×) → **slab GLB byte-identical (0.2850, 44,352 verts)**. The operator couldn't *see* it only because bloom obscures the foliage — a separate observability matter, not a propagation bug (bloom-off = off-parity, don't chase).
- [x] **Piece-3 (render-published-everywhere) LOCKED "good enough"** (2026-06-25): the Salon keeps its **live preview-atlas** (instant authoring). The forked preview *material* was already retired (Brief 7 → same `treeAtlasMaterial` as runtime, no shader daylight); the residual is only that the preview renders a live per-composition *artifact* vs the published one — and the published path is proven faithful, so the daylight is mostly theoretical. **Revisit only if a real divergence surfaces in authoring.** Effort redirects to the visible payoff: the **plate-rack**.
</content>
