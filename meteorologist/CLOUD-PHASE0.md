# Cloud realism — Phase 0 findings (Howard)

> Specialist: **Howard** (lineage: Nimbus). Named for Luke Howard, who gave the clouds their
> Latin names in 1803 — fitting for the agent whose job is making each genus read as its genus.
> This is the Phase 0 deliverable: reference-library audit + morphology taxonomy +
> off-the-shelf survey + adopt-vs-build recommendation. **No shader code yet — checking in
> before Phase 1.**

Baseline accepted as-is: the three render fixes (slab-follows-cloud, authoring-normalize,
additive lighting) are correct and I build on them. The data model (52 presets, 67 tags, WMO
codes, descriptions) is rich and I don't rebuild it. The gap is the renderer: **one isotropic
FBM = amount + lumpiness only**, so every genus collapses to the same puffy blob.

---

## Thread 1 — Reference-library audit

I visually inspected the morphology-critical exemplars (one+ per shape family), every
small/suspect file, and the genera I'll lean on hardest when authoring recipes. `SOURCES.json`
already flags 5 missing + 5 intentionally-omitted; below adds what the *eyeball* pass found
beyond the JSON.

### Confirmed GOOD (verified by eye — safe to author against)
`cumulus_mediocris` · `cumulus_congestus` · `cirrus_fibratus` (textbook combed parallel fibers) ·
`cirrus_uncinus` (textbook mares-tails, hooked heads + fallstreak tails) ·
`cirrocumulus_stratiformis` (textbook mackerel fish-scale) · `cumulonimbus_mammatus` (textbook
pouches) · `cumulonimbus_capillatus` (textbook anvil + fibrous glaciated top) ·
`altocumulus_lenticularis` (textbook smooth lens over a peak) · `stratocumulus_volutus`
(clean roll tube) · `stratocumulus_perlucidus` (lumpy sheet with blue gaps) ·
`stratus_nebulosus` (featureless low ceiling).

### WEAK / MISLABELED (file exists but is a poor genus reference — re-source before trusting)
| id | problem | what a good fill shows |
|---|---|---|
| `cirrus_spissatus` | dark cloud bank at sunset; doesn't read as *dense high* cirrus. Ambiguous. Tiny 61 KB file. | a thick, sun-muting patch of high cirrus with a bright raked rim |
| `altostratus_opacus` | too bright & translucent — reads as *translucidus*, not opacus (the whole point of opacus is the sun is **gone**, sky dim/dark). Tiny 64 KB file. | a uniform dark-grey mid overcast, no sun disk |
| `altocumulus_stratiformis` | cellular patch structure not evident; thin sunset horizon streaks. Weak. | a clear quilt of mid-level cloudlets with cracks between cells |
| `altocumulus_lacunosus` | the *defining holes* are absent — reads as a generic mottled layer. Mislabel-grade. | a sheet pierced by a regular honeycomb of blue holes |
| `cirrostratus_nebulosus` | captures the 22° **halo** beautifully (keep for that), but the cloud field is broken cumuliform patches, **not** a smooth high veil. | a smooth, near-featureless whitish veil softening the sun, ideally with halo |

### MISSING (no file — `SOURCES.json` `needs_photo`)
`cirrus_castellanus` · `cirrocumulus_floccus` · `cirrocumulus_castellanus` ·
`altocumulus_castellanus` · `stratocumulus_castellanus`.
**Note:** four of the five are the **castellanus/turret** group — so right now there is **no
good turret reference anywhere in the library**, and turrets are their own morphology recipe
(shared base-line + vertical mini-towers). This is the single most consequential reference gap
for Phase 1; please prioritize one strong castellanus shot (any altitude — the geometry reads
the same) plus a `floccus`/tuft shot.

### Intentionally omitted / reuse (per SOURCES — flagging for completeness, not blocking)
`fog_ground`→reuses fog_valley · `haze_summer` (reference shows a clear day, no haze) ·
`rain_heavy` (castle under blue sky) · `rain_squall` (schematic diagram) ·
`lightning_intracloud` (shows cloud-to-ground). These are precip/optical, not cloud-shape, so
they don't gate the morphology work — but `haze_summer` and the two rain mismatches are worth a
real photo eventually.

### Coverage honesty
I eyeballed ~15 of 42 — every shape family's exemplar + all suspect/small files. The ~22
un-eyeballed are `exists`-status variations on confirmed-good families (more sheets, more
veils, the precip/snow set), i.e. lower-risk. I can do an exhaustive per-photo pass if you want
belt-and-suspenders, but it isn't needed to start Phase 1.

**Operator action (only Jacob can do):** re-source the 5 weak + 5 missing above. Multiple
angles/lighting per genus is ideal. I'll wire whatever lands.

---

## Thread 2 — Morphology taxonomy (quality → geometry → what the shader needs)

The 39 cloud presets collapse into **~10 morphology classes**. Each class is a *recipe* — a
density-field shape — not a parameter tweak. The current isotropic FBM can only honestly render
the **veil/sheet** class and a soft version of the **blobby** classes; everything with
direction, cellularity, a smooth envelope, or an inverted/spreading shape is **out of reach
today**. That's why every genus looks the same.

| # | Class | Genera | Distinguishing geometry (the instant-recognition feature) | Tags it explains | Today's FBM? | Lever the recipe needs |
|---|---|---|---|---|---|---|
| 1 | **Cumuliform** | cumulus humilis/mediocris/congestus | hard rounded **cauliflower lobes** on top, **flat base** at condensation level; congestus taller-than-wide | puffy, cauliflower, flatter-than-wide, towering | ½ (blobs, but base not flat, lobes not hard) | flatten base + harden/round top warp; vertical aspect from thickness |
| 2 | **Cirriform** | cirrus fibratus/uncinus/spissatus | long **parallel filaments** combed by shear; uncinus = hooked head + **fallstreak tail** | fibrous, hooked, mares-tails, thin | ✗ — isotropic noise has no direction | **anisotropic** noise stretched along a comb dir; uncinus adds a downward fallstreak drop |
| 3 | **Veil / sheet** | cirrostratus neb/fib/dup, altostratus, stratus neb/op, nimbostratus | smooth near-uniform sheet; thin→halo-capable, thick→dark & sunless | veil, smooth, sheet, ceiling, halo-capable | ✓ (the one it does) | low warp + high coverage (already works); halo/ground-glass-sun are **sun-disc optics**, separate |
| 4 | **Cellular / rippled** | cirrocumulus stratiformis (mackerel), altocumulus str/tr/op/pe, stratocumulus str/pe/op | regular **quilt of cloudlets** with thin cracks; cell size shrinks with altitude (Cc tiny → Sc big) | rippled, mackerel, patches, lumpy, with-gaps | ✗ — FBM gives blobs, not a tessellation | **Worley/Voronoi** cell layer; cellSize knob; lacunosus = invert (holes in sheet) |
| 5 | **Lenticular** | cirrocumulus/altocumulus/stratocumulus lenticularis | smooth **almond/saucer**, clean edges, often stacked, **stationary**, feathered tips | lens, wave, stationary | ✗ — opposite of fractal turbulence | analytic **ellipsoid envelope** × laminar layering; minimal noise |
| 6 | **Turreted + tufted** | *castellanus* group, *floccus* group | row of mini-**towers on a shared base line**; floccus = tuft + ragged base/virga trail | turreted, tufted, instability | ½ (bumps, no organization) | shared base plane + periodic vertical turrets; floccus adds a small fallstreak |
| 7 | **Cumulonimbiform** | cumulonimbus calvus / capillatus | giant tower; hard cauliflower lower, **fibrous glaciated top spreading into a flat anvil** (incus) | storm, tower, anvil-debris, no-anvil | ✗ — no anvil spread | height-dependent **horizontal spread** near top (the unused `anvil` param) + fibrous top |
| 8 | **Mammatus** | cumulonimbus mammatus | smooth **downward-bulging pouches** hanging under a base (inverted lobes) | pouches, mamma | ✗ | **inverted Worley** on the underside; smooth, not turbulent |
| 9 | **Roll / arcus** | stratocumulus volutus | a single long **horizontal tube**, detached, rolling on a horizontal axis | roll, dramatic | ✗ | analytic **horizontal-cylinder envelope** |
| 10 | **Ragged / fractus** | stratus fractus, cumulus fractus | torn **shreds**, no defined body, wispy | ragged, broken, scud, post-rain | ½ | high warp + low coverage + erosion bias toward tatters |
| — | **Fog / haze** | fog_valley, haze_smoke | ground-hugging / full-volume attenuation | (fogParams) | n/a | depth-fade, not a slab shape — out of the morphology recipe set |

**The throughline:** four primitives unlock all of it — (a) **anisotropy/shear** (cirriform,
turret combing), (b) a **Worley/cellular** layer + its inversion (cellular, mammatus,
lacunosus), (c) **analytic envelopes** that multiply the noise (lens, roll, anvil spread, flat
cumulus base), and (d) **erosion control** (cauliflower hardness vs ragged tatters). Plus the
sun-disc **optics** (22° halo, ground-glass sun, iridescence) which are a cheap separate pass,
not a density shape.

---

## Thread 3 — Off-the-shelf survey + recommendation

**What exists (real-time, WebGL/three.js-compatible, evidence):**
- The whole field — Guerrilla *Nubis* (Schneider), Häggström, Hillaire's PBR sky, Maxime
  Heckel's R3F cloudscapes, David Peicho's DataTexture3D raymarch, the three.js-forum
  "game-ready volumetric clouds", `CK42BB/procedural-clouds-threejs` (WebGPU + WebGL2 fallback,
  Beer-Lambert + Henyey-Greenstein + light-march) — converges on **one architecture**:
  raymarch a slab; density = low-freq **shape noise** + high-freq **Worley detail erosion** ×
  a **height-gradient profile** × a **coverage map**; light via **Beer-Lambert + dual-lobe
  Henyey-Greenstein phase + powder + a short light-march**.
- **Every one of them renders cumulus/stratus weather systems.** Their "cloud type" knob
  interpolates stratus↔cumulus↔cumulonimbus via the height profile. **None produce
  cirrus mares-tails, mammatus pouches, a lenticular lens, or a mackerel tessellation** —
  confirmed directly by the survey ("standard procedural noise is most effective at alto-/
  cirrus *coverage*… no specific info on mammatus or lenticularis morphologies"). Those genus
  shapes are exactly our gap, and exactly what no library does.
- Commercial engines that *do* go further (SilverLining, TrueSKY, UE Volumetric Clouds) are
  native/licensed, not WebGL, and still don't do per-genus morphology — they do weather-system
  coverage.

**Recommendation — HYBRID (adopt the stack, build the morphology layer):**
1. **Keep** our slab raymarch architecture — it's the same one every reference uses and it's
   already integrated with our sky/lighting. We replace the *density field* + *scattering*,
   not the architecture.
2. **Adopt** the proven, well-trodden building blocks (no need to reinvent): Worley detail
   erosion, the height-gradient profile, and the **Beer-Lambert + dual-lobe Henyey-Greenstein +
   powder + light-march** scattering model (Phase 2 — this is also the "luminance / sits-in-sky"
   fix). These are jargon-y and welcome; they earn their keep.
3. **Build** the per-morphology recipe layer ourselves — a `morphology` class dispatcher that
   selects {envelope, noise type, anisotropy, erosion} per genus. This is the part nothing
   off-the-shelf gives us, and it's the whole reason a cumulus and a cirrus must differ *in
   kind*. The four primitives above (anisotropy, Worley±invert, analytic envelopes, erosion)
   cover all 10 classes.

Net: don't adopt a turnkey renderer (none reaches genus-distinct shapes); **do** adopt the
turnkey *techniques* and spend our originality on the morphology recipes.

---

## Proposed Phase 1 — small, legible operator knobs (for your nod)

Keep operator-facing dials few and plain; derive the rest internally per class. The genuinely
independent new dials:

| New knob | What it visibly does | Drives classes |
|---|---|---|
| **`morphology`** (enum) | the big one — picks the recipe: `cumuliform / cirriform / veil / cellular / lenticular / turret / cumulonimbus / mammatus / roll / ragged` | all |
| **`shear`** (0–1 + direction) | how hard the cloud is combed/stretched into streaks | cirriform, turret |
| **`cellSize`** | grain of the cellular quilt (tiny mackerel → big stratocumulus); inverts for lacunosus/mammatus | cellular, mammatus |
| **`lobe`** (0–1) | cauliflower-hard ↔ smooth; doubles as ragged-tatter control at low end | cumuliform, ragged, lenticular |
| **`anvil`** (already in schema, unused) | top horizontal spread | cumulonimbus |

Existing `coverage / density / thickness / baseAlt / warpFreq / warpAmp / noiseSeed / octaves`
stay and keep their meaning. The schema's reserved `modifiers` (`mamma`, `incus`, `virga`,
`pileus`…) become the natural home for accessory features. That's ~5 new dials total, each
mapped to a feature you can see — not 64 opaque ones.

**Phase spine unchanged:** 1 = morphology vocabulary (this) · 2 = scattering/luminance (HG +
powder + light-march) · 3 = re-author the 39 presets against the (fixed) references, operator
by-eye approval per genus.

---

## Check-in — decisions I need before going wide

1. **Adopt-vs-build = hybrid** (keep architecture, adopt scattering techniques, build morphology
   recipes). Nod?
2. **Phase 1 knob set** above (one `morphology` enum + ~4 plain dials). Anything to add/cut?
3. **Reference re-sourcing** — you own the 5 weak + 5 missing photos; **castellanus/turret is
   the priority** (no good turret ref exists). Want the exhaustive 42-photo eyeball pass too, or
   is family-exemplar coverage enough?
4. Order check: I'd build **morphology (Phase 1) before scattering (Phase 2)** — shape sells the
   genus harder than light, and scattering is easier to tune once the shapes are real. OK?
