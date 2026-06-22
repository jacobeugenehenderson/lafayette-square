# Cartograph — Operations (the operator's manual)

> **The engineering/operator counterpoint to [FEATURES.md](FEATURES.md).** FEATURES is the *brochure* — what it is, why it's special (user/investor-facing). **This is the *manual* — here's the panel, here's the knob, here's when to turn it (operator-facing).** Same tools, two books: one sells it, one runs it. Reference-kind (eternal-present); **operator** audience (distinct from FEATURES = user/investor, and from ARCHITECTURE/PIPELINE/RIBBONS = developer). Engineer-internals behind these knobs live in `ARCHITECTURE.md`; the geometry in `RIBBONS.md`.

> **Status: populated 2026-06-14** (the operator-knob content migrated out of FEATURES, purifying FEATURES to pure what/why). Still grows as the tile re-pour's **T3 authoring migration** reshapes the Survey/Section tools — fill in as those settle.

---

## Survey — the hardscape-SHAPE tool

The hardscape silhouette: centerlines, smoothing, caps, anchor, road metadata, corner radius, curb.

- **Asphalt-edge handle** — `pavementHW` per side (the half-width of pavement).
- **Auto-smoothing** — a selected chain shows its raw points for editing; returns to the smooth curve on `enter`. Street smoothing rides **one knob** (`STREET_SMOOTH`) so the navy centerline and the curb are one curve by construction — never two copies kept in sync by hand (`SKELETON.md §3.5`).
- **Caps** — round / blunt / none, per dead-end (a free per-dead-end authoring choice; `SECTION.md §6`/D6a + G8 govern the *fill*).
- **Curb** — global width, its own material.
- **Marker (FAB)** — a freehand pen overlay for triage, independent of the authoring tools (`FEATURES.md §Designer`). Toggle the FAB to draw; each stroke persists immediately to `data/clean/marker_strokes.json`. Stack: **eraser** (click a stroke to remove it) · **undo** (drop the last stroke) · **clear all**. The server's `/analyze` endpoint reports the parcels + blocks under the current strokes — circle a defect, ask "what's under here?"
- **The corner-radius kit — three layers that stack at every intersection** (Blocks ▸ Shape):
  1. **Global `Corners` slider** — multiplies every IX radius for the active Look. `1×` = AASHTO/NACTO baseline; `>1` = bubblier; `0` = fully square (useful for sponsored "retro" mode). Dragging it *resets* both override maps on commit ("scale all corners to this × default").
  2. **`Edit corners` toggle → per-IX dot** — a big blue dot at each IX center; drag the radial distance from cursor to IX to set that IX's radius (homogenizes the IX). Right-click an IX dot = **revert that IX** (clears its per-IX + per-corner overrides) without touching the rest of the map.
  3. **Per-corner cyan dots** — adjust a single corner alone, for true corner cases.
  - **Color coding:** blue/cyan = default · gold = operator-authored · white = mid-drag. Resolution at render: per-corner → per-IX → data-default, all × the global scale. All three layers persist per-Look to `design.json`; bake reads the same maps. Per-corner identity uses leg-pair keys so authoring survives chain-edit churn.
- **Revert to Data** (NEXT, `BACKLOG`) — strip the SHAPE overrides back to the skeleton's surveyed base widths.

## Section (was Measure) — the ped-profile tool

The pedestrian cross-section, stroked **inward** off the frozen curb (LU = the remainder).

- **Ped handles** — treelawn / sidewalk widths per edge.
- **Strip-material swap** — ctrl-click an LU↔SW strip to flip it.
- **Edit-row vs edit-block** — author one frontage-edge or a whole block.
- **Translucency-focus** — the selected element renders translucent / context opaque (by design, `RIBBONS.md §5`).
- **Revert to Default** — footer button (whole-scene) · **⌃-click a ped handle** = per-edge re-seed to the calculated best-effort (gleaned treelawn-Y/N + ADA defaults). Field-scoped so it never wipes Survey (`SECTION.md §8`).

## Stage — the look tool

Materials, color, visibility, shaders, sky, post-FX, neon, camera — the per-Look aesthetic, baked into the slab.

- **Surfaces** — color / visibility per material · **Sky & Light** · **Post-FX** · shots / Hero keyframes.
- **Sky Layer Gain** — *"how dark is the night sky."* Dims (or lifts) **just the sky dome** on a TOD curve — bands, sun/moon glow, horizon scatter together. It is exposure scoped to the sky layer: the global **Exposure** knob darkens the *whole frame* (buildings + ground + sky), whereas Sky Layer Gain touches only the dome — so deep night goes genuinely dark while street lamps and lit windows stay where authored. Stars are not affected. LS authors ~1.0 by day dipping to ~0.2 at Night; default 1.0 leaves an unauthored Look unchanged. **Reach for Sky Layer Gain when the *sky* is too bright; Exposure when the *whole image* is.** *(Note 2026-06-07: bloom no longer auto-boosts at night — author it in the Post-FX **Bloom** channel; night otherwise leans on lamp glow, cheaper and intentional.)*
- **Hero shot** — an authored camera **bounce**: the camera sweeps a Catmull-Rom path Start → (mids) → End → back, looking at the resolved hero subject. **Start/End are permanent anchors**; insert optional **Mid** keyframes (only mids are deletable). Capture button is playhead-keyed: in a gap → **Add Keyframe**; parked on a dot → **Update Keyframe** (match-aware — reads "✓ Keyframe set" until you move the camera). FOV is a per-keyframe animated channel; an `easing` knob shapes the sweep. Replays identically in Stage / Preview / production via `heroAnim.js`.
- **Bake buttons** — Designer's **"Stage →"** = navigate to your last Stage shot immediately, bake async in the background (the slab refreshes when done). Stage's **"↻"** = bake in place, stay put. Both accept **⌥-click to force a full rebuild** (bypass the dirty-check). A small orange dot lights when authoring edits exist since the last bake (indicator only — never disables the action).
- **Alley end-cap dial** (Paths ▸ Shape) — a 3-segment toggle controlling how **all** alleys in the active Look terminate: `square` (flush) / `rounded` (rounded-rectangle pad) / `round` (true semicircle). Stored as `design.alleyCap`. Other path kinds use per-kind defaults and carry no operator surface.
- **Tube-radius slider** (Neon) — per-Look `tubeRadius` (0.1–3.0 m, default 1.0). Unlike the color/intensity channels it drives geometry, so it rebuilds the merged mesh on change (step-quantized so a drag doesn't churn).
- **Antialiasing (SMAA)** (Post card) — on/off, per-Look, baked to `scene.json` (default on). An SMAA post-pass at the ULTRA preset. ⚠️ **Near-invisible on desktop by design** — the desktop Canvas already runs 8× MSAA, so SMAA only cleans the *shader-contrast* edges MSAA can't (lit/unlit seams). Its real job is **mobile**, where MSAA is off (`antialias:!IS_MOBILE`) and SMAA is the *only* AA. Also exposed as a toggle in **Preview**'s layer matrix for A/B inspection. *(To witness it on desktop, temporarily disable MSAA so SMAA does all the AA — `Scene.jsx` `antialias`.)* The on/off is a mount/unmount; the `EffectComposer` is keyed so it reconciles on toggle (value-channels stream live, but an effect's *existence* needs the rebuild). `PostProcessing.jsx` / `PreviewPostFx.jsx`.
- **Stage drag semantics** — Browse: LEFT-drag = pan, ⌥+LEFT (or RIGHT) = orbit. Hero/Street: LEFT = rotate, ⌥+LEFT = pan (they're inspection shots). Designer's "Stage →" always lands on Browse so the camera transition is continuous with the overhead view.
- **Animating a channel (every TodChannel)** — open the drawer, hit **animate** to arm, then **click a slot chip to jump there** (scrubbing alone never drops a keyframe) and **edit a value to drop/update that slot's keyframe**. The clicked chip stays the live edit target. **✕ Clear**: parked on a keyframe → removes *that* keyframe (the value falls back to the tween); otherwise → clears the whole channel to its flat default. *(2026-06-22 — replaced the old "Revert"/auto-keyframe behavior.)*
- **Lamps card** — two channels: **Lantern** (`lantern` = **Brightness + Glow**) = the lamp's own light source (lantern/glow orb/bulb), TOD-animatable, operator master × the automatic dusk→night turn-on. **Lantern Brightness also drives the ground light POOL** (the pool *is* the lantern's light on the ground — one slider for both; off by day). And **Lamp Glow** (`lampGlow` = **Canopy**) = the under-lamp glow on tree foliage. The pool is **baked into the ground** (contour-correct), so its *shape* is a bake-time knob (below). **Lamp colour** = the Surfaces **lamp swatch** (`layerColors.lamp`) — one source; it tints the lantern **and** the ground pool.
- **Arch Lighting card** (`archLight`, Hero & Horizon) — the cross-aimed foot **uplights** (L/R intensity · color · cone° · reach), now a **TOD-animatable** channel of their own so the wash can warm at dusk and fade by day. *(Placement — distance/scale/rotation — stays on the separate, non-animated `arch` channel.)*
- **Ground-contact effects** (baked; tune via the bake constants in **CLI / bake operations** below): the **lamp light pools**, the **dark contact rings** under trees + lamps (visible in daylight), and the **tree trunk-base ground blend** (the lowest of each trunk takes on the ground colour beneath it). All three bake into ground textures + sample in the ground/tree shaders — **re-bake to see them**, hard-refresh to pick up the slab.

## Preview — the publish-confidence gate

GPU profiler · phone-mode · layer-toggle matrix · TOD scrub. Walks the *shipping* render with a profiler strapped on. **The layer-toggle matrix is *ephemeral inspection* ("what am I measuring") — never persisted; "all-on" equals production.** Separately, the operator authors **deployment policy** here: the per-platform channel-listing (desktop vs. mobile inclusion), the one thing Preview writes. Keystone Reference: **`PREVIEW.md`** (the model — what it inspects + how to read the numbers). *(In flight — the virtual-device emulator + device-budget gauges + thermal/memory/transition readouts: `HANDOFF-preview-measurement.md`.)*

- **The benchmark devices + the budget knob.** The cost gauges read against **two real reference phones**, not an abstract budget:
  - **`phone-hi` = iPhone 16 Pro Max** — Apple A18 Pro (6-core GPU), 8 GB RAM, 6.9″ 2868×1320 (~460 ppi). The best-case ceiling (and the device the PhoneFrame bezel is modeled on).
  - **`phone-lo` = Samsung Galaxy A54/A55** — the floor we *guarantee*. Anchored to the weaker A54 (Exynos 1380, Mali-G68 MP5, 8 GB, 6.4″ 2340×1080); the A55 (Exynos 1480, RDNA-based Xclipse 530) is the stronger sibling, so an A54-clean slab covers it.
  - **`desktop`** — a 60fps target with a generous-but-present draw/tri ceiling (trips only on a pathological scene / weak laptop GPU).
  - **All budgets live in one place: `src/preview/deviceProfiles.js`** — edit the numbers there. ⚠️ Today the device *identities* are set but the per-tier budget *numbers* are **interim** (placeholder) until the Phase-3 virtual-device measurement locks them — don't trust a "ships" verdict for a publish call until they're measured.

## CLI / bake operations

- The two-step build: `node skeleton.js` → `node pipeline.js` → `node promote-ribbons.js` → `node bake-ground.js` (the pipeline does **not** re-run the extractor — `[[feedback_skeleton_pipeline_two_step]]`).
- The bake is incremental (dirty-skipped); `?force=1` on the URL (or ⌥-click a bake button) forces a full rebuild.
- **The bake-target guard:** an unflagged bake targets `lafayette-square`.
- **Ground tri-budget — the `GROUND_REFINE` knob** (`bake-ground.js`, the GPU/mobile lever). The flat ground is lifted per-vertex by the terrain at runtime, so it must be subdivided enough to follow the relief. `GROUND_REFINE = "adaptive"` (default) subdivides **only where the terrain bends** — `GROUND_REFINE_TOL_M` (default **0.50 m**) is the max terrain-deviation a coarse triangle may keep before it's split. Lower `tol` = finer mesh + more tris; higher = coarser + fewer. The shipped value cuts the LS ground from **1.37M → ~548K tris** (−60%) with fidelity ≈ the original mesh. The split is **conforming (red-green)** — crack-free; an earlier non-conforming version left visible T-junction cracks along the contours at street level (fixed 2026-06-17, +~100K tris over the cracked 445K). CLI overrides (gated on argv, never `process.env`): `--refine=uniform` restores the legacy byte-identical mesh; `--refine-tol=`/`--refine-min-edge=`/`--refine-max-edge=` retune. ⚠️ It calibrates to the terrain exaggeration (`V_EXAG`); if you ever raise exaggeration, re-bake and re-check the slopes. ⚠️ **After any CLI `bake-ground.js`, run `bake-ground-ao.js` too** — the geometry bake rewrites `ground.json` without the AO `lightmap` block, so a standalone ground bake ships flat-lit (the `serve.js /bake` GUI chains them automatically; only manual CLI bakes hit this — see `BACKLOG.md`). The full diagnosis + per-material numbers live in `cartograph/_archive/handoffs/HANDOFF-ground-tri-cut-LANDED-2026-06-22.md`.
- **Ground-contact effect knobs (2026-06-22) — where they live, for later tuning / panel promotion.** `bake-ground-ao.js` emits three ground textures and carries the *bake-time* shape constants (edit + re-bake to retune): **lamp pool** — `POOL_RADIUS_M` / `POOL_RING_POS` / `POOL_RING_SHARP` (lower = blurrier ring) / `POOL_SHADOW_FRAC`; **contact shadow** (tree + lamp bases) — `TREE_SHADOW_RADIUS_M` / `TREE_SHADOW_STR`, `LAMP_SHADOW_RADIUS_M` / `LAMP_SHADOW_STR`. The *live* (shader) knobs: **trunk-base ground blend** — `uTrunkBlend` (strength) / `uTrunkBlendTop` (metres up the trunk) in `treeAtlasMaterial.js` (`injectFoliageSway`); **contact-shadow strength** — `uShadowStr` (0.5) in `grassMaterial.js` + `BakedGround` FadeMesh; **pool warm colour** — `vec3(0.80,0.62,0.32)` in both ground shaders. Pool *intensity* + arch *uplight* values are live TOD channels (Lamps / Arch Lighting cards). ⚠️ These are bake-time today — a future arc promotes pool diameter/blur to panel controls (overlap build-up forces baking the shape; see `HANDOFF-channel-variant-cascade.md` neighbours).
- Server edits (`cartograph/serve.js`) require a `carto` restart — the browser + bake scripts auto-pick-up, but the long-lived server does not (`ARCHITECTURE.md`).

## Save → ship — the lifecycle, the git tree, and the troubleshooting door

> **The door + the knobs for "the tree is dirty / how do I save / why is staging stale / it works here but not there."** Written so a future troubleshoot is a *lookup*, not a forensic. The bake *mechanism* is `BAKE.md`; the slab *byte format* is `SLAB-CONTRACT.md`; this is the **operator's** view of save-and-ship. Grounded against `serve.js`, the workflows, and `.gitignore` (verified 2026-06-17).

### Source vs. derived — the one distinction that ends the confusion

Everything in the tree is **one of two things.** Knowing which ends most "is this dirty diff real?" questions on sight.

| | **SOURCE** (you author it — intent) | **DERIVED** (the machine bakes it — a shadow of source) |
|---|---|---|
| **Files** | `public/looks/<id>/design.json` (the SHAPE + Look SSoT — Survey widths/corners + Stage materials/sky) · `clean/overlay.json` (Survey edits) · the raw set (`raw/osm.json`, `survey.json`, `elevation.json`, `measurements.json`) · `neighborhood_boundary.json` | `clean/map.json` · `src/data/ribbons.json` · `public/baked/<id>/shape.json` · `ground.json`+`ground.bin`+`ground.lightmap.png` · `scene.json` · `public/baked/default.json` (trees) · `public/looks/index.json` |
| **Who writes it** | the operator, via the tools (autosave) | the bake (`/looks/:id/bake`, see `BAKE.md §2`) |
| **If you lose it** | gone — it's intent, not regenerable | regenerate it: re-bake from source |
| **Edit it by hand?** | yes — that's authoring (or a curated datum fix, `SURVEY.md`) | **never** — edit the source, re-bake |

**The rule:** to *change* the map, edit **source** and re-bake. A hand-edit to a **derived** file is a shadow-edit — it comes back wrong on the next bake (the same lesson as `RIBBONS §1` / `ORIENTATION` "fix the centerline, not the shadow").

### Why the tree goes dirty — noise vs. real

The geometry bakes are **deterministic**: same source in → byte-identical `ground.bin` / `ribbons.json` / `map.json` / `shape.json` out (everything routes through `writeIfChanged`, `io.js`). So a derived-file diff is one of exactly two things:

- **NOISE — discard it.** Three files carry a `Date.now()` stamp that changes on *every* bake even when nothing semantic moved: `scene.json` (`bakedAt`, `bake-scene.js`), `public/looks/index.json` (`updatedAt`/`bakedAt`, `serve.js`), `public/baked/default.json` (`generatedAt`). A diff that touches **only** those timestamp lines = a no-op re-bake. Throw it away.
- **REAL — decide it.** A diff in the *geometry* of `ground.bin` / `ribbons.json` / `map.json` / `shape.json` means the source genuinely changed (a width edit, a corner, a new survey value). Keep it only if you meant the edit.

> **Fast triage:** `git diff --stat` — if the only changes are `scene.json` / `index.json` / `default.json` at ~2 lines each, it's pure timestamp noise. If `ground.bin` / `ribbons.json` / `map.json` moved, real geometry changed — look at `design.json` to see which width/corner you (or an autosave) touched.

### Save / discard ceremony

The dev server **autosaves** source on every edit (Survey/Stage debounce → `overlay.json` / `design.json`) and **re-freezes** `shape.json` on Survey-exit — so the tree is *expected* to drift while authoring. Reaching a clean state is deliberate:

- **To discard churn** (the default habit while iterating): from a quiet tree (no active drag), `git restore .` returns to the last commit. Safe — source autosaves are already on disk; this just throws away uncommitted derived churn + unwanted source edits.
- **To save a slab** (you authored something to keep): bake it (⌥-click a bake button = force, or `POST /looks/<id>/bake?force=1`) so the derived artifacts match source, then commit **source + derived together** in one commit (`bake(...)` or `feat(...)`). The slab must travel as a coherent set (`SLAB-CONTRACT §9` rule 1) — never commit a `design.json` edit without its re-baked artifacts, or the deploy ships intent the slab doesn't reflect.
- **⚠️ The dev server reads the *main worktree's* branch.** Work done in an agent worktree is **invisible** on the lit app (`:5173`) until merged into the checked-out branch. "Still not fixed" usually means "not merged yet," not "the fix failed."

### How it ships — local bake → commit → CI serves as-is

**CI does not bake.** Both workflows run `npm ci` + `vite build` (+ `--base` for staging) and publish the committed `public/` as static files. There is **no `pipeline.js` / `bake-*.js` in CI.** Consequence: **whatever slab you committed is exactly what deploys** — a stale or un-baked commit ships stale geometry to the public. Bake + commit *before* you push.

| Branch | Workflow | Deploys to |
|---|---|---|
| `main` | `deploy.yml` | **lafayette-square.com (PROD)** |
| `cartograph-looks-pass-ab` (trunk) | `staging.yml` | **`lafayette-square-staging` (GitHub Pages)** |
| any feature branch (e.g. `curb-offset-draw`) | — | **nothing** (pushing the branch deploys no site) |

Promote to staging = fast-forward/merge the feature branch into the trunk and push; promote to prod = merge the trunk into `main` and push. *(Derived artifacts are intentionally **git-tracked**, not ignored — that's what lets CI stay a plain `vite build`. The alternative — gitignore them and bake in CI — is a deliberate, un-taken fork; see the named levers below.)*

### The troubleshooting door — symptom → knob

| Symptom | The door (go here, no forensic) |
|---|---|
| Tree always dirty, but no geometry changed | Timestamp **noise** (`scene.json`/`index.json`/`default.json`) — §"noise vs. real" above. Discard. |
| Staging/prod shows **stale geometry** | You didn't bake+commit before push — CI serves the committed slab as-is (§"how it ships"). Re-bake, commit, push. |
| Wrong in **Survey**, right in **Section/bake** | The **live-load path**, not the frozen geometry — measure-resolution / overlay / the vite bundle (`ARCHITECTURE.md §2.1`). |
| Section shows **no change** after a CLI bake | The `shape.json` cache-buster (`?t=freezeTag`, `BlockGeometryV2Debug`) — a CLI bake can't bump client state. Exit Survey (autosave-freeze) or click **Bake** to bump it. |
| A **baked artifact looks wrong** | First ask "is this the *live re-stroke's* defect, faithfully captured?" — the bake is the messenger, not the bug (`BAKE.md §4`). Diagnose **upstream** (the live construction), never patch the output. |
| Proxy / node render disagrees with the app | **The operator's eye is the gate** (`[[feedback_proxy_render_is_not_the_operator_eye]]`). The proxy misleads in both directions — trust the lit app. |
| A SHAPE/curb silhouette is wrong | Upstream — Survey · skeleton · prebake. *How a ribbon bends* is Section (FILL). Name the layer before you fix (`CLAUDE.md` route gate · `PIPELINE §Wall`). |

### Named levers (deliberate, not yet built)

Two formalizations are *chosen but un-built* (2026-06-17 — the path-A decision), tracked here so we turn them on purpose, not by accident:
1. **Kill the timestamp noise** — make `scene.json`/`index.json`/`default.json` omit (or stabilize) their `Date.now()` fields so a no-op re-bake is byte-identical and the tree stops going dirty for free.
2. **One-command save ceremony** — a single CLI action: flush source → force-bake → report what *semantically* changed → commit the slab. Replaces eyeballing the dirty tree.

*(With path-A also: a reproducibility gate — CI/pre-push check that the committed slab equals a fresh bake from source — to catch a stale slab before it ships.)*

*Provenance: Boz 2026-06-01 (seed); populated 2026-06-14 from the FEATURES operator-knob migration; **save→ship lifecycle + troubleshooting door added 2026-06-17** (the forensic-to-lookup conversion). The operator-manual counterpoint to FEATURES.*
