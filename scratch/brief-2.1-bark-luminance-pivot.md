# Brief 2.1 — Bark gradient pivot to per-pixel luminance

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours. Name yourself however feels right — pick whatever lands when you read this — and use that name in your status updates and commit body. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

## Mission

Pivot Brief 2's bark gradient sampling from **per-instance hash** (one position along the ramp per tree) to **per-pixel luminance** (every pixel reads the PBR bark sample's luminance and uses that as `t` into the gradient LUT). This unlocks the operator's actual stated vision: **one B&W substrate × N contrasty gradients = N species visual identities** — Sugar Maple warm-brown, Norway Maple cool-grey, Pin Oak dark-furrowed all from the same texture.

Brief 2 (Holm) shipped clean infrastructure (LUT bake, atlas tile category, manifest channel, editor UI, per-variant lift) but the runtime sampling axis was the wrong architectural interpretation — coordinator spec-compression failure documented in [[feedback_spec_compression]]. All of Holm's infrastructure transfers; only the shader sampling axis changes. This is a small surgical pivot, not a rebuild.

## Why the per-pixel direction matters (read before you start)

Per-instance hash gives across-tree color variation: 5 trees of the same species sit at 5 positions along the ramp. Visually pleasant but cannot disambiguate species — Maple and Oak with the same gradient still look like the same tree species.

Per-pixel luminance gives **species disambiguation via gradient swap**: the bark's own light/dark pattern (which is intrinsic to the species — Maple bark has different furrow structure than Oak) drives the color lookup. Identical gradients applied to different luminance patterns produce visually distinct species. Same gradient applied across species would unify their palette while preserving their intrinsic detail.

Operator's mental model: the bark texture is a B&W luminance map; the gradient ramp is the color palette; species identity = (luminance pattern, gradient palette) pair. You're enabling that.

Per-instance hash can OPTIONALLY ride as a secondary modulation on top (sub-amplitude offset into luminance) — for subtle cross-tree variety without breaking species identity. Default off (amp=0); operator slider exposes it.

## The exact change — REPLACE semantics, not MULTIPLY

**The architectural shape that matters most:** the gradient REPLACES the bark color when bound; it does NOT tint or multiply it. Operator vision: "luminance is the substrate; gradient is the palette." → `final_color = gradient_LUT[luminance(bark)]`, not `final_color = bark × tint × gradient[lum]`.

If you keep Holm's `barkColor = diffuseColor.rgb * effTintFinal` pattern and just swap the sampling axis from `jh4` to `lum`, the original bark color shows through and dampens the gradient effect, which means species disambiguation via gradient swap won't work cleanly. This is the spec-compression risk to avoid.

`src/components/treeAtlasMaterial.js` line 235-247 currently (post-Cinder) reads:

```glsl
// Brief 2 (Holm) per-variant gradient: ...
float jh4 = fract(sin(dot(vWorldXZ.xz, vec2(521.7, 233.1))) * 43758.5453);
vec2 lutUV = vec2(jh4, 0.5) * uBarkGradientTileScale + uBarkGradientTileOffset;
vec3 gradientTint = texture2D(map, lutUV).rgb * 2.0;
vec3 effTintFinal = mix(barkTint, gradientTint, uUseBarkGradient);
vec3 barkColor = diffuseColor.rgb * effTintFinal;
```

Replace with luminance-driven REPLACE:

```glsl
// Brief 2.1: per-pixel luminance drives the gradient sample. When
// uUseBarkGradient=1, the gradient REPLACES the bark color — the bark
// texture's own light/dark pattern (furrows, lichen, knots) becomes
// the LUT index, and the gradient stops become the species palette.
// Same gradient on different bark textures = distinct species
// identities (Sugar Maple warm-brown / Norway Maple cool-grey / Pin
// Oak dark-furrowed from the same gradient applied to different bark
// luminance patterns).
// uBarkGradientHashAmp adds optional cross-tree luminance offset on
// top of the per-pixel base (default 0; operator-tunable).
float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
float jh4 = fract(sin(dot(vWorldXZ.xz, vec2(521.7, 233.1))) * 43758.5453);
float t = clamp(lum + (jh4 - 0.5) * uBarkGradientHashAmp, 0.0, 1.0);
vec2 lutUV = vec2(t, 0.5) * uBarkGradientTileScale + uBarkGradientTileOffset;
// No *2.0 bias — gradient stops are authored as direct bark colors
// (REPLACE), not as multipliers against the PBR sample.
vec3 gradientColor = texture2D(map, lutUV).rgb;
// Legacy single-tint path: full Holm tint stack on diffuse (when no
// gradient is bound, uUseBarkGradient=0 → legacy renders unchanged).
vec3 legacyBark = diffuseColor.rgb * barkTint;
vec3 barkColor = mix(legacyBark, gradientColor, uUseBarkGradient);
```

Critical semantic notes:
- `uUseBarkGradient=0` (no gradient authored) → `barkColor = legacyBark` — full Holm path including `effTintBase * perInstanceTint`. Existing compositions without gradient stops render unchanged.
- `uUseBarkGradient=1` (gradient authored) → `barkColor = gradientColor` — gradient sample replaces bark color. No multiplicative tint layered on top. The gradient stops are interpreted as direct bark colors.
- The `*2.0` bias from Holm's brief is GONE — it was a multiplication-mode artifact (kept midtone stops near identity-multiply). Under REPLACE, gradient stops are authored as the bark colors they should produce.
- Existing Brief 2 compositions' `gradientStops` may need re-authoring with this change — what looked balanced under multiplication may look saturated or dark under REPLACE. Surface if you see this.
- Cinder's detail composite (Brief 2.1a, line ~248+) reads `barkColor` regardless of how it was computed — Overlay blend continues to fire correctly on top of the new gradient-replaced color. NO changes to the detail composite chunk.

That's the core shader pivot — ~8 LOC delta (slightly more than my initial estimate due to the legacy/gradient split).

## The new uniform

Add `uBarkGradientHashAmp` (float, default 0.0). When 0, sampling is pure luminance. When >0 (e.g. 0.1), per-instance hash adds modulation in `[-amp/2, +amp/2]` so adjacent trees of the same species sample slightly different positions along the gradient — cross-tree variety on top of the species identity.

Initialize alongside the existing gradient uniforms in `treeAtlasMaterial.js` (around line 91).

## Files you'll touch

1. **`src/components/treeAtlasMaterial.js`** — the shader pivot above. Add `uBarkGradientHashAmp` uniform initialization.

2. **`src/components/InstancedTrees.jsx#applyBarkUniforms`** — surface `uBarkGradientHashAmp` per-draw. The value comes from `manifest.bark.gradientHashAmp` (default 0). Pass through alongside the existing gradient slot resolution.

3. **`arborist/generate-salon.js#patchManifestForSalon`** — when writing per-variant gradient stops, also write `gradientHashAmp` from `composition.bark.gradientHashAmp` (default 0). Plumbed alongside `gradientStops`.

4. **`src/arborist/SalonWorkstage.jsx#BarkGradientEditor`** (or sibling) — operator slider: "Cross-tree variation" 0.0–0.3, drives `composition.bark.gradientHashAmp`. Visible when "Use gradient" is enabled.

5. **`arborist/state/<species>/compositions.defaults.json`** — document the new field if a defaults file exists; otherwise skip.

## What you do NOT change

- **The LUT bake path** in `bake-look.js` — the gradient atlas tile + sha1 dedup + manifest emission all stay identical to Brief 2. Holm's infrastructure transfers wholesale.
- **The manifest `gradientStops` schema** — same `[{t, color}, ...]` shape, same per-variant lift.
- **The atlas-pack-time UV math** — sub-region offsets/scales unchanged.
- **`uBarkGradient*` existing uniforms** — `uUseBarkGradient`, `uBarkGradientTileOffset`, `uBarkGradientTileScale` all stay.
- **Anything Brief 5 touched** — leaf rendering, vendor-card preservation, atlasKind partitioning. Stay out of the leaf path entirely.

## Acceptance criteria

1. **Visual disambiguation test (REPLACE semantic)**: in Salon, author the same `gradientStops` (e.g., `[#3a2820 → #8a6a4a → #d4a878]` warm-brown ramp) on two compositions using DIFFERENT bark refs (e.g., `Bark003` vs `Bark007`). Verify they look visibly distinct — the texture luminance pattern modulates the same gradient differently. The bark color visible in the render should be the GRADIENT'S color sampled at the bark's luminance, not the bark photo tinted by the gradient.
2. **REPLACE confirmation**: with a gradient active, the rendered bark should be drawn primarily from the gradient stops, not from the underlying PBR bark color. Quick test: author a saturated red→blue gradient on a brown bark ref. If you see red/blue dominant, REPLACE is working. If you see brownish-red/brownish-blue (the bark color showing through), it's still multiplicative — go back and check the shader.
3. **Hash amp slider behaves**: with two trees of the same species visible, sliding `gradientHashAmp` from 0 → 0.2 introduces subtle cross-tree color variety on top of the per-pixel luminance base. At 0, both trees identical (modulo any pre-existing `tintJitter`); at 0.2, visibly different but same species character.
4. **Bloom stability**: workstage perf gauge shows `programs` count unchanged from current (11). No new shader program compiled.
5. **Determinism**: same composition + same on-disk materials → byte-identical published GLB. Sha1sum twice, verify match.
6. **Per-Look palette override unaffected**: `scene.materialColors[<species>]` overriding `tintBase` continues to layer correctly underneath the gradient path. When `uUseBarkGradient=0` (no gradient authored), pure tintBase override works as before.
7. **Detail layer (Cinder Brief 2.1a) unaffected**: bark detail composite still applies on top of the new gradient path. The Overlay-blend chunk runs after the `barkColor = diffuseColor.rgb * effTintFinal` assignment — that line is unchanged in this brief.
8. **Per-variant gradient lift still works**: a Salon composition with `gradientStops` set on variant 1 only (not variant 2) should show gradient on v1 and pure tint on v2, same as Brief 2's per-variant resolution.

## Approach guidance

- **The luminance constant** `vec3(0.299, 0.587, 0.114)` is Rec.601. Rec.709 `vec3(0.2126, 0.7152, 0.0722)` is a defensible alternative. Rec.601 is more visually intuitive for desaturated bark; stick with it unless you find a reason not to. Surface if you change it.
- **sRGB vs linear**: the atlas texture is `SRGBColorSpace`-tagged, so `diffuseColor.rgb` after `<map_fragment>` is linearized. Your luminance is computed in linear space — that's mathematically right for additive lighting work. The Brief 2 `*2.0` bias keeps midtone ramp stops near identity-multiplication; that bias is preserved here.
- **What if `uUseBarkGradient = 0`?** The `mix(barkTint, gradientTint, uUseBarkGradient)` falls back to `barkTint` — no gradient sampling cost incurred functionally, but the LUT sample still runs (texture2D is unconditional). That's fine; it's one extra texture fetch per fragment when no gradient is bound and the result is discarded by the mix. If this becomes a perf concern later, surface it; don't optimize preemptively.
- **The luminance approach assumes the bark texture's luminance distribution covers a useful range** (e.g., [0.1, 0.9]). If a bark ref's luminance is all crowded near 0.5, the gradient effectively becomes a single-stop tint. That's a bark-library curation concern, not a shader concern. Surface if you find a bark ref that doesn't disambiguate well.
- **Don't add a gamma correction step** unless you measure a problem. The atlas's sRGB tagging plus the Rec.601 luminance formula plus the `*2.0` ramp bias is the established pipeline shape; don't perturb it.

## Surface anything not in this brief

Per [[feedback_baby_must_surface_scope_drift]] — if you find:
- Architectural side-effects on Cinder's detail layer (Brief 2.1a)
- Interactions with bark region-split (Phase L Cycle 2 trunk-vs-branch)
- Bloom or shader-program drift
- Manifest schema needs beyond `gradientHashAmp`
- Bark-ref curation issues (luminance distributions that don't disambiguate well)

Surface it in your status update AND commit body. Don't quietly extend scope.

## Out of scope

- **Leaf rendering** — Brief 5 just shipped vendor-card preservation. Don't touch atlasKind partitioning, leaf material binding, or per-card UV rewrite.
- **Configuration D / LoD regime / alpha overdraw** — that's the next architectural cluster, queued as Brief 6/7 after this lands.
- **Bark library curation** — if a bark ref's luminance is uniform/uninteresting, that's a curation issue (operator chooses different ref). Don't add programmatic histogram analysis.
- **Per-Look gradient overrides** via `scene.materialColors` — natural Brief 2.5, deferred.
- **Gradient preset library** ("white birch", "oak bark", etc.) — v1.6 candidate.
- **Procedural / LiDAR generators** — their bark paths don't use per-composition `gradientStops` today; don't extend.

## Memory refs

Read at session start:
- `feedback_spec_compression` (the doctrine entry that demands this brief exists)
- `feedback_baby_briefs_need_identity_framing` (you are the baby; identity first)
- `feedback_baby_must_surface_scope_drift` (see above)
- `feedback_atlas_subregion_uv_recovery` (Cinder's pattern — your code lives right next to it; the existing `localUV = (vMapUv - uBarkTileOffset) / uBarkTileScale` recovery in the detail chunk is the doctrine in action)
- `project_authoring_is_live_production_is_static` — gradient stops author live in Salon; bake-look freezes them into the per-Look master atlas

## After you ship

Commit body should:
- Lead with one sentence summarizing what changed
- Reference Brief 2.1 (this doc)
- List files touched + LOC delta per file
- Acceptance-criteria checklist with status per item
- Surface any scope drift in a "Doesn't fix / open follow-ups" section
- Co-author: `Claude` (you)

Status update to Jacob and Boz should be ≤300 words, lead with the most surprising finding.

After this lands, the next cluster is Configuration D (LoD regime + alpha-overdraw — combined architectural lift). Welcome to the sophisticated bark manufacturer pre-stage.
