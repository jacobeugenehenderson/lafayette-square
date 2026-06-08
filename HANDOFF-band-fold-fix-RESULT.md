# HANDOFF — Band-fold fix RESULT (dispatched agent → Boz)

**Status: fix complete + committed, pending Jacob's live :5173 eye-confirm.** Branch `band-fold-fix` @ **`8e1e414`** (off trunk `cartograph-looks-pass-ab` @ `5658d43`). The main-tree **working copy** also carries the fix (uncommitted, **unstaged** on trunk) so Jacob can validate live right now — see §Git state.

Supersedes the dispatch brief `HANDOFF-band-fold-fix.md` and its FINDINGS companion (both retire to NOTES on landing).

---

## TL;DR

The brief's mechanism was **wrong**, and I verified it in the geometry, not the proofs ([[feedback_shape_proofs_dont_gate_fill_geometry]]). The 4 marks are **not** ped-band offset folds; Clipper's inward offset is **clean at every depth (SI0)**. The opaque blobs are **self-intersecting *output* rings** from (a) **degenerate `iA`** on sliver/acute tiles and (b) **union folds** of legitimately-overlapping contributions. The fix is **`iA`-regularize at source + whole-layer boolean hygiene (`SimplifyPolygons`) on every rendered layer** — which Jacob explicitly sanctioned mid-task ("SimplifyPolygons = legit boolean hygiene; morphological-open only as last resort").

**Result (production `buildTileGround` path, `smooth:0`):** all 4 named marks gone in **every** layer · SELFINT **59→0** · sidewalk reversal verts **471→401** · footprint preserved to the metre · `block` area + `cornerFillets` (handle anchors) **identical (466)** · R=0 squares preserved · build **~+575 ms** on full rebuilds.

---

## The diagnosis (what I found vs what the brief said)

| | brief / Bollard / Caliper | what I measured (live `buildTileGround`, instrumented) |
|---|---|---|
| mechanism | inward **offset folds** past the medial axis → opaque blob | `offsetRings` (Clipper) is **clean at every depth (SI0)** — it splits rings, never self-crosses |
| fix | **Option A: local capacity clamp on offset depth** | irrelevant — there is no offset fold to clamp |
| root of blobs | the band offset | **(a) `iA` self-intersects** on 12 sliver/acute tiles → propagates to asphalt-finger (#0) + curb-needle (#3); **(b) union folds** of overlapping per-tile contributions → ped T-mouth (#1) + east teardrop (#2). `sectionPass` emits **zero** self-int — the ped marks are union artifacts |
| reversal vs self-int | conflated as "fold" | **two distinct symptoms**: reversal verts (depth-driven band necks, non-self-int) ≠ self-int blobs (the visible overdraw). The operator marked the **blobs** |

I instrumented the live stamping loop (gated `__bfd`, since removed) to pin each self-int ring to its birth op, and root-hunted the union folds (which contributors overlap into each fold). Evidence is in the worktree `scratch/bandfold-*.mjs`.

---

## What I tried and REJECTED (so Boz doesn't re-walk these)

1. **Per-ring `SimplifyPolygons`** → resolved most marks but **ballooned one ring at `[-619,-445]` by +18 k m²**. Cross-ring cause: that ring's inverted lobe is cancelled by an overlapping **neighbour** in the layer's NonZero winding; resolving any ring **in isolation** fills the lobe.
2. **`simplify-small`** (declump small rings, keep big rings as-is) → **catastrophic** (asphalt footprint 4.5×). Splitting big outers from small holes destroys the outer/hole winding.
3. **`unionRings` (whole-layer re-union)** → footprint-preserving but **idempotent** — does not resolve the self-int (51 remained).
4. **Inflation guard on `signedArea`** → useless: the pathological ring's own shoelace is *already* 18 k (the inflation is purely cross-ring, no per-ring signal).
5. **Morphological-open-only declump** → also inflates, because `offsetRings` (ClipperOffset) NonZero-resolves the **isolated** ring the same way.

**The answer: whole-layer `SimplifyPolygons`** — resolves all rings *together*, keeping cross-ring winding intact → footprint preserved (verified to the metre), topology cleaned. A handful of genuinely-irreducible NonZero-valid folds get a tiny **scoped morphological open (ρ=0.5)** — Jacob's sanctioned last-resort, reached only for those (footprint-safe because they're isolated, no cancelling neighbour).

---

## The fix (exact, `src/lib/tileGround.js` only)

Three new helpers (after `signedArea`): `ringSelfIntersects`, `simplifyRings` (Clipper `SimplifyPolygons`, NonZero), `declumpLayer` (whole-layer simplify, skipped unless a **local** ring ≤300 pts self-intersects, + scoped ρ-open fallback).

1. **`iA`-regularize at source** (per-tile, after `filletRings`): `if (iA.some(ringSelfIntersects)) iA = simplifyRings(iA).filter(area > 0.5)`. Only fires on degenerate tiles; in-spec tiles **byte-identical**; freezes into `_shapeArtifact` so Section inherits clean `iA`.
2. **`declumpLayer` on EVERY rendered layer**, in **both** `buildTileGround` and `sectionOpen`: asphalt, curb, sidewalk, **treelawn, land-use (`luByClass`), and `block`**.

⚠️ **The first pass only did asphalt/curb/sidewalk and Jacob saw NO change** — the dominant visible blob is the **LAND-USE fill** (the big colored block paint), not the thin strips. My own mark-check had the same blind spot (only the 3 strip layers). **His eye caught it; the metric didn't.** Banked lesson candidate: *a self-int fix must sweep every rendered layer, and the verification harness must check every layer, not just the ones you touched.* ([[feedback_proxy_render_is_not_the_operator_eye]] reinforced.)

---

## Measured results (all on the production path)

- **4 named marks** (#0 `[450,-92]`, #1 `[177,202]`, #2 `[706,302]`, #3 `[-344,-244]`): self-int in **any** layer → **NONE**.
- **SELFINT rings** (≤300 pt, repo-wide): **59 → 0**. The 5 big map-spanning silhouette rings (legit invisible junction touch-points — Caliper's red-herrings) **untouched by design**.
- **Sidewalk reversal verts >120°: 471 → 401.**
- **Footprint preserved:** asphalt +0.1%, sidewalk +2 m², **LU Δ −2.7 m²**, treelawn / block **identical**.
- **Handles safe:** `cornerFillets` **466 = 466**, `block` area **1763412.5 = 1763412.5**.
- **R=0 squares:** preserved by construction (no rounding op; `SimplifyPolygons` keeps vertices).
- **Frozen Section path** (`sectionOpen` on the **stale** on-disk `shape.json`): clean except **1** non-mark `lu:recreation` residual that exists only because the baked artifact predates the `iA`-regularize — a **re-bake clears it**.
- **Perf:** build ~745 ms → **~1320 ms (+575 ms)** on full rebuilds (corner-radius / measure edits via the `useMemo`). Whole-layer `SimplifyPolygons` over all layers incl. big rings. Not a stated gate; can optimize (prefilter / cache / bake-gate) if the live drag feels laggy. It **must** run on the Survey path (so the view is clean at rest), so it can't be bake-only.

---

## Git state (please read — my exploratory edits leaked into the main tree)

- **Deliverable:** branch **`band-fold-fix` @ `8e1e414`** — `src/lib/tileGround.js` only, the complete fix. Clean base off `5658d43`.
- **Main tree** (`cartograph-looks-pass-ab`): `src/lib/tileGround.js` **working copy = the full fix, uncommitted, index unstaged** (I `git restore --staged`'d it so trunk won't be accidentally committed). This is intentional — it makes the fix **live on :5173** for Jacob's validation. Diff is **identical** to `8e1e414`.
- Pre-existing uncommitted main-tree changes I did **not** touch: `HANDOFF-band-fold-fix.md`, `public/looks/index.json`, `public/looks/lafayette-square/design.json` (Jacob's look fiddling). Worktree `scratch/bandfold-*.mjs` = validation harnesses (untracked).
- **Land it your usual way** (targeted checkout of `8e1e414`'s `tileGround.js` → main-tree regenerate). The main-tree working copy already matches, so landing is low-risk.

---

## What's left for Boz

1. **Get Jacob's live eye-confirm** — he needs a **hard-refresh** of the :5173 tab (vite serves the fix; his open tab had the stale bundle). I confirmed vite serves the updated module over the wire.
2. **Re-bake `public/baked/lafayette-square/shape.json`** (Stage button / `bake-ground.js`) so the **frozen Section path** (Measure-tool mode) reflects the regularized `iA` and clears the 1 `lu:recreation` residual. Held per the brief — your call to trigger.
3. **Fold canon:** `RIBBONS §3.9a item 5` (the capacity guard is now a **boolean-hygiene** declump, not an offset-depth clamp — correct the mechanism), `§6.3` (SELFINT residual **49 → 0**), **flip the G12 ledger row → DONE**. Note the brief's "Option A offset-depth clamp" framing is **superseded** — record why (offset is clean; roots are degenerate-iA + union folds).
4. **Retire** `HANDOFF-band-fold-fix.md` + `HANDOFF-junction-band-thorns-FINDINGS.md` + the band-fold portion of `scratch/SURVEY-CONSTRUCTION-FORENSIC.md` → NOTES.
5. **Re-test the dead-end Missouri Ave flood** on the fresh topology (brief's ask).

## Distinct, NOT fixed here (do not bundle)

- **Depth-driven reversal thorns** persist at the named clean-Ts (Vail 2, Kennett 1, Albion 1, **Waverly 6** reversal verts; Mackay → 0). These are **non-self-intersecting band necks** — a separable symptom from the self-int blobs, and what the brief's *original* offset-depth clamp would actually target. **A distinct follow-up** if Jacob wants it (the current operator marks — the self-int blobs — are all cleared).
- The **corner-registration gap (~77 handles)** — Caliper §(c), DISTINCT code root (`:2004-2008`). Separate brief.
- The **Truman south-of-Park median** (D3/D8) — left alone per the brief's no-regress gate.
