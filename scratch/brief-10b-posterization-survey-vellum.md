# Brief 10B (Vellum) — posterization survey

Per-ref tile sizes, sha1s, atlas delta, latency, and surfaced anomalies.

## Per-ref posterized.png

| ref     | tile  | colors* | dither | bytes | sha1 (head 16) |
|---------|-------|---------|--------|-------|----------------|
| Bark003 | 256²  | 32→16   | 0.5    | 25.8K | a17570270073…  |
| Bark004 | 256²  | 32→16   | 0.5    | 11.3K | f464c4be0128…  |
| Bark007 | 256²  | 32→16   | 0.5    | 26.9K | d804940427 01… |
| Bark012 | 256²  | 32→16   | 0.5    | 30.8K | 2aba1fa59493…  |
| Bark015 | 256²  | 32→16   | 0.5    | 29.5K | d039b45deb75…  |
|         |       |         | total  | 124K  |                |

\* **sharp's libimagequant binding clamped 32→16 colors** (encoded indexed PNG reports `bitsPerSample=4`, `paletteBitDepth=4` = 16-color palette). The `colors:32` request appears to be a max; libimagequant compacts further when its perceptual model finds 16 buckets sufficient. **Not blocking** — the substrate posterizes visibly, gradient LUT indexing still benefits from discrete luminance buckets. Operator-tunable: bump `colors` to 64 or 128 in `arborist/posterize-defaults.json` to force more palette retention; per-ref overrides via `perBarkRef.<ref>.colors` work the same way. Surfaced for tuning.

## Source-file delta per ref

| ref     | color.jpg | detail.png | **posterized.png** | posterized / color |
|---------|-----------|------------|--------------------|--------------------|
| Bark003 | 1,261 KB  | 889 KB     | **26 KB**          | **2.1%**           |

Posterized is ~50× smaller than vendor color. Brief 11 lightweight's eventual aerial-only path will save ~1.2 MB per bark ref served (sample only posterized, skip vendor) — atlas-byte savings compound when Brief 11 + a future "atlas-deadweight-strip" brief retire the vendor tile from aerial.

## Atlas master delta (LS roster, 7 species → 5 bark refs after dedup)

- **before 10B:** `trees-atlas-color.png` = 21,135,871 B (≈ 20.2 MB)
- **after 10B:**  `trees-atlas-color.png` = 21,399,444 B (≈ 20.4 MB)
- **delta:** +263,573 B (+0.26 MB) — **dramatically under the ~10–20 MB worst-case** estimated in the brief. Reason: dedup by bark-ref (5 refs for 7 species), small posterized tiles (256² @ 4-bit indexed), one row in skyline pack.

Brief's atlas-size soft-guard suggestion: 32 MB threshold is comfortable headroom — current atlas at 20.4 MB sits at 64% of guard. Worth adding a `[bake-look] WARN: unified atlas > 32MB` log emit when bark-ref count grows substantially or if `posterize-defaults.json#colors` is bumped to 128+ producing larger posterized PNGs. **Not added in 10B** (out of scope); flagged for a future single-line tweak.

## Determinism (AC #10)

Two consecutive `node arborist/extract-bark-posterized.mjs` runs against the same `posterize-defaults.json` → byte-identical `posterized.png` outputs (sha1 match before/after). Confirmed Bark003: `a17570270073…` stable across two runs. libimagequant's median-cut + FS-dither is deterministic — no PRNG seed exposed.

## Latency

- **Cold CLI extract (all 5 refs):** 0.29 s total. Per-ref ~0.06 s — far under the brief's ~1–3 s/ref estimate. Brief expected ~10–30 s cumulative on cold-checkout first-bake of all refs; actual is sub-second.
- **Auto-trigger inside bake-look** (one ref re-extracted mid-bake): no measurable delta vs idempotent path. Bake total 8.86 s with auto-trigger active vs ~10.87 s on full first-bake including atlas re-encode.
- **Idempotent re-run:** all refs report `(unchanged)`, mtime touched, downstream bake re-runs as designed per `[[project_writeifchanged_touches_mtime]]`.

## Sha1 dedup observations

Five distinct bark refs in LS roster → five distinct posterized sha1s (no cross-ref dedup opportunity — each source `color.jpg` is unique). Within-roster: 7 species map to 5 bark refs via `barkPosterizedBySpecies` (species `procedural_broadleaf` + `acer_saccharum_procedural` + `procedural_conifer` + `procedural_ornamental` + `acer_saccharum` + 2 more → 5 ref tiles). Dedup is at the bark-ref layer (mirrors detail), not the posterized-pixel-byte layer. If two refs were ever quantized to identical palettes (would require identical source `color.jpg`), sha1 dedup at the source-buffer level already collapses them.

## Surfaced anomalies (per `feedback_baby_must_surface_scope_drift`)

### 1. sharp's `palette:true` clamps to 16 colors regardless of `colors:32`
Documented above in the per-ref table. Not a bug — libimagequant optimization. Operator can tune via `perBarkRef.<ref>.colors` if a specific ref looks too washed. Recommend leaving `colors: 32` as the default (it's a max budget, not a floor); add per-ref overrides only when visual inspection in Salon shows a ref reading too soft.

### 2. localUV computation lifted, not duplicated
Per the brief's "Lift `localUV` computation earlier, or compute it twice — your call, surface in commit" choice point: **lifted**, not duplicated. The local-UV recovery (`(vMapUv - uBarkTileOffset) / uBarkTileScale`) is now at the very top of the bark fragment chunk, and both the posterized swap and the existing detail Overlay composite reuse the single declaration. Cheaper (one division instead of two) and the lift is forward-compatible if more bark-substrate layers want the same UV.

### 3. `applyBarkUniforms` posterized-only fallback for bark-tile bounds
The species's primary bark tile bounds (`uBarkTileOffset/Scale`) currently flow ONLY through `detailSlot.barkTileUV`. With posterized binding but detail absent (hypothetical — happens if a species's bark ref has `posterized.png` but no `detail.png`), local-UV recovery would default to identity and the posterized sample would miss its sub-region. I added a fallback in `applyBarkUniforms`: when `posterizedSlot` is present but `detailSlot` is absent, lift bark-tile bounds from `posterizedSlot.barkTileUV` (same field, identical shape). Doesn't fire today in the LS roster (every species with a posterized tile also has a detail tile by symmetry), but it makes the runtime composable for the future case of posterized-without-detail.

### 4. Atlas-size soft-guard not added in this brief
Surfaced for follow-up: add `if (unifiedColorBytes > 32 * 1024 * 1024) console.warn('[bake-look] WARN: unified atlas exceeds 32MB threshold')` at the end of `unifyAtlases`. Single line, no behavior change. Held back from 10B to keep the diff tight.

### 5. `extract-bark-detail.mjs` auto-trigger NOT retroactively wired
Brief asked me to surface this. `extract-bark-posterized.mjs` is auto-triggered from `bake-look.js` + `salon-preview-atlas.js` whenever the source `posterized.png` is missing for a needed ref. `extract-bark-detail.mjs` (Brief 2.1a precedent) is still manual-CLI-only — a fresh checkout without `detail.png` files would silently bake without detail composite. Tiny follow-up brief could lift the auto-trigger pattern to detail extraction; ~10 LOC change, identical shape to what 10B added. Not shipped in 10B (scope wall).

### 6. Gradient hash amp × posterized interaction (brief flagged)
`uBarkGradientHashAmp` adds per-instance luminance jitter before LUT sample. With a posterized substrate, the per-pixel luminance is now in discrete buckets — the hash offset can push a sample across a bucket boundary, producing per-instance posterization shifts that may or may not read as intentional. **Not visually validated yet** (needs browser). Operator should inspect at Salon Hero tier with `gradientHashAmp > 0` and judge; if the cross-boundary banding reads as noise rather than character, a tier-aware hash-amp dial (zero out hash under tier ≤ 1) is the future remediation — flagged for a follow-up if needed.

### 7. Detail Overlay × posterized substrate (brief flagged)
Detail Overlay-blend now operates on a quantized `barkColor` (the gradient/legacy mix). Overlay-blend's `step(0.5, base)` branch behaves identically on quantized vs continuous bases — math is local per-channel — but the visual character of the composite may shift because detail is a continuous high-pass signal modulating discrete buckets. **Not visually validated yet**; should look fine at default `uBarkDetailStrength=1.0` but worth inspecting at Salon Hero. If detail reads as visually inconsistent on quantized substrate, the natural tweak is to lower default detail strength under posterized (tier-aware uniform binding); deferred for browser inspection.

## What's still unverified (needs browser, Jacob)

Acceptance criteria #3 (Hero posterized), #4 (Overhead posterized), #5 (tier-2 vendor fallback via `window.__setBarkShaderTier(2)`), #7 (Salon preview parity with LS runtime), #8 (single shader program), #9 (no leaf regression) all require running the dev server + opening Salon and/or LS. CLI verification covered #1, #2, #6 (identity-safe by shader structure), #10, #11.

Recommended browser-side smoke sequence:
1. `npm run dev`; open Salon at any species
2. Pin Salon's `Ground` preset → bark should read as quantized luminance bands (kit-illustrated look)
3. Switch to `Overhead` preset → still quantized (Brief 10A's tier-0 convergence + 10B's substrate swap, no detail composite)
4. Pin `window.__setBarkShaderTier(2)` → bark should snap back to photographic vendor PBR (forward-compat with 10C)
5. Open LS Hero → identical readout to Salon's Ground preset
6. PerfGauge: confirm `programs` count stable across all tier flips (one shared `treeAtlasMaterial`)
7. Visual diff leaves vs. pre-10B chassis renderings → bytecode-identical (posterized swap is `vBark`-gated)

If any of those fail, AC are still pending and 10B should not be considered shipped per `[[feedback_salon_preview_is_authoring_surface]]`.

— Vellum
