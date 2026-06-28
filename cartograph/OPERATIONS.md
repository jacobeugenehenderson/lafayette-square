# Cartograph — Operations (the operator's manual)

> **The engineering/operator counterpoint to [FEATURES.md](FEATURES.md).** FEATURES is the *brochure* — what it is, why it's special (user/investor-facing). **This is the *manual* — here's the panel, here's the knob, here's when to turn it (operator-facing).** Same tools, two books: one sells it, one runs it. Reference-kind (eternal-present); **operator** audience (distinct from FEATURES = user/investor, and from ARCHITECTURE/PIPELINE/RIBBONS = developer). Engineer-internals behind these knobs live in `ARCHITECTURE.md`; the geometry in `RIBBONS.md`.

> **Status: populated 2026-06-14** (the operator-knob content migrated out of FEATURES, purifying FEATURES to pure what/why); **Stage + Preview built out to the full per-card knob master list 2026-06-26** (grounded against the panel code — `CartographSkyLight.jsx` / `CartographPost.jsx` / `CartographSurfaces.jsx` / `PreviewApp.jsx`). Still grows as the tile re-pour's **T3 authoring migration** reshapes the Survey/Section tools — fill in as those settle.

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

Materials, color, visibility, shaders, sky, post-FX, neon, camera — the per-Look aesthetic, baked into the slab. Everything here is **WYSIWYG and live**: a tweak shows on screen immediately, and the bake freezes that exact state into `scene.json` (`STAGE.md §3`). Two facts shape every knob below:

- **Every look value is a *time-of-day curve*, not a single number** — the **TodChannel** (`STAGE.md §1`). You drag a slider *at the currently-scrubbed time*, and the channel records the curve, so one Look renders dawn, noon, and deep-night faithfully. A channel left unanimated is a flat scalar (the same value all day).
- **The only deliberate "save" is forking a named Look** ("＋ Save as new Look…"). Every other tweak just autosaves the active Look to `design.json` (~300 ms debounce); there is no "save the bake."

The full channel inventory + where each persists is `STAGE.md §1`; the cards below are the operator's-eye view — *which knob is on which card, and how to drive it.*

### How to operate any TOD channel (the universal mechanic)

Every animatable channel shares one drawer, and **the 7 time-of-day slot chips are always visible** (dawn / sunrise / noon / golden / sunset / dusk / night) — there is no "animate" toggle to arm. The live edit target is simply **the slot the playhead is parked on**: that chip is highlighted and its sliders are LIVE. **Edit a value to write that slot's keyframe** — a still-flat channel auto-converts to time-keyed on the first edit (no arming step). **In a gap between slots the playhead is on no slot, so the sliders go read-only**, showing the resolved (tweened) value; **click a chip to scrub the playhead onto that slot** and make it live. Because each slot's time is stamped, editing a value never jogs the timeline — the playhead only moves when you click a chip. **Transition-in / -out (ramp) inputs** appear once a channel has ≥1 keyframe — they shape how fast the value crosses between slots. **✕ Clear**: parked on a keyframe → removes *that* keyframe (the value falls back to the tween; removing the last one returns the channel to its flat value); otherwise → clears the whole channel to its flat default. *(2026-06-27 — unified: dropped the "animate/animated" toggle; chips are always on and the playhead's slot is the edit target. The internal animated-vs-flat data shape and the bake are unchanged — `animated` is just no longer surfaced.)* Toggle-type channels lerp 0↔1 between slots; color fields are an HTML color swatch storing a hex string. *(2026-06-28 — nearly every Sky & Light + Post + Lamps channel is now TOD-animatable: this pass promoted **lantern · ambient · exposure · halo · mist · dof (Focus) · warmth · dirMoon · fill** alongside the channels already curve-aware — so the whole frame can ride the day.)* ⚠️ **Converting a flat channel to TOD needs an anchor slot, or it applies globally.** The resolver gives a single-keyframe channel that *one* value at **all** times — so when you turn a still-flat channel into an animated one, first seed an anchor slot (noon or night) with the prior flat value, then author the others off it. Skip the anchor and the first keyframe you write becomes the value for the entire day.

### Sky & Light card

**Sky colour (the dome gradient).** The dome's colour is authored as **sparse grid overrides** — `{hour, band, hex}` triples on a per-season grid (bands = **horizon / low / mid / high / sunGlow**), and the **Sky Builder** is the live tool for placing them. ⚠️ **Overrides key on the CLOCK HOUR, not the TOD slot — and the slot→hour mapping shifts by season** (e.g. summer sunset ≈ hour 20, winter ≈ hour 17). So a sunset colour authored for one season **won't track the slot** in another; author per-season or expect the hue to land at a different point of the day. **Lamps ride a TOD channel on top of an automatic sun-altitude ramp** — photocell behaviour: lamps trip **on** at civil dusk/dawn and **off** near sunrise as the sun clears the horizon, with the Lantern channel (Lamps card) scaling that automatic turn-on.

**Atmosphere group**
- **Mist** — fog density + colour (the FogExp2 the runtime applies). TOD.
- **Halo** — the aerial-perspective glow strength + colour (sky-light bleeding into distance). TOD.
- **Sky Layer Gain** — *"how dark is the night sky."* Dims (or lifts) **just the sky dome** on a TOD curve — bands, sun/moon glow, horizon scatter together. It is exposure scoped to the sky layer: the global **Exposure** knob (Post card) darkens the *whole frame* (buildings + ground + sky), whereas Sky Layer Gain touches only the dome — so deep night goes genuinely dark while street lamps and lit windows stay where authored. Stars are not affected. LS authors ~1.0 by day dipping to ~0.2 at Night; default 1.0 leaves an unauthored Look unchanged. **Reach for Sky Layer Gain when the *sky* is too bright; Exposure when the *whole image* is.** *(Note 2026-06-07: bloom no longer auto-boosts at night — author it in the Post **Bloom** channel; night otherwise leans on lamp glow, cheaper and intentional.)*
- **Neon** — the neon look as one grouped TOD channel: **core / tube / bleed / emissive** intensities, plus the **tube-radius** field. Tube radius (per-Look `tubeRadius`, ~0.1–3.0 m, default 1.0) is the odd one out — unlike the intensity fields it **drives geometry**, so it rebuilds the merged neon mesh on change (step-quantized so a drag doesn't churn). Neon *colour* is set on the Surfaces card's **Neon** tab.

**Lighting group** — each a TOD intensity slider:
- **Ambient** — flat fill light everywhere.
- **Hemisphere** — sky-vs-ground gradient fill.
- **Sun light** — the directional sun.
- **Moon light** — the directional moon (carries the night).

**Celestial group**
- **Constellations** — toggle the spectral-node constellation overlay (TOD; defaults off, lifts at night).

### Post card — post-processing

All Post channels are TOD. Grouped on the card as:

**Camera group**
- **Exposure** — global brightness of the whole frame (the master image knob; contrast with Sky Layer Gain, which is sky-only).
- **Warmth** — cool↔warm colour-temperature tint across the image.

**Shadow group**
- **AO** — ambient occlusion (N8AO): contact-darkening in crevices. Fields: radius, intensity, distance-falloff.
- **Fill** — lifts shadow floors (distinct-and-deep ↔ soft-and-open).

**Soften group**
- **Bloom** — glow on bright **contrast** (edges + points of light), not on broad brightness. A *band-pass* off the shared blur ladder: bright local detail (a sharp mip minus a blurrier one) glows, so lamps/neon/glints read as points and a bright sky **backlights** dark objects as a rim, while open sky and flat surfaces don't wash. Fields: intensity (strength), threshold (**how much contrast it takes to glow** — runs LOWER than the old absolute-bright bloom), smoothing (the knee), warm/cool tint. Additive (HDR-correct; SCREEN darkened the HDR-bright sky). *(Owns night glow — see the Sky Layer Gain note. `CustomBloom.jsx`, off `DownsamplePyramid.jsx`.)*

**Finish group**
- **Grade** — the film grade: contrast, toe (shadow shoulder), saturation, vignette.
- **Grain** — film-grain scale.
- **Antialiasing (SMAA)** — on/off, baked to `scene.json` (default on). An SMAA post-pass at the ULTRA preset. ⚠️ **Near-invisible on desktop by design** — the desktop Canvas already runs 8× MSAA, so SMAA only cleans the *shader-contrast* edges MSAA can't (lit/unlit seams). Its real job is **mobile**, where MSAA is off (`antialias:!IS_MOBILE`) and SMAA is the *only* AA. Also exposed as a toggle in **Preview**'s layer matrix for A/B inspection. *(To witness it on desktop, temporarily disable MSAA so SMAA does all the AA — `Scene.jsx` `antialias`.)* The on/off is a mount/unmount; the `EffectComposer` is keyed so it reconciles on toggle (value-channels stream live, but an effect's *existence* needs the rebuild). `PostProcessing.jsx` / `PreviewPostFx.jsx`.
- **Focus (DoF)** — depth-of-field (`RomanceDoF`). **Single-focal + a hero pocket**: sharp from the camera out to **Focus distance**, then the blur RADIUS grows with depth (the mid/far melts — the LoD cover), picked from the shared blur ladder (a real focus pull, not a haze cross-fade). **Hero softness** gives the designated hero (the Arch) its own gentle blur near its distance — *a little soft, like IRL* — anchored to the live authored hero placement. Fields: On · Blur (mid/far melt) · Focus distance (m — how far the sharp zone reaches; a Hero shot frames everything far, so it wants a big value) · Hero softness · Softness (transition width). **Now a real TOD channel (2026-06-28)** — pull focus per-slot (e.g. a moody soft dawn, crisp noon/sunset). ⚠️ **DoF blur is suppressed in the overhead Browse shot by design** — it only shows in Hero / Street (gated on the camera looking *down*, not its height). *(Debug: `window.__dofDebug = 1` paints the zones green=sharp / red=blur. `RomanceDoF.jsx`, off `DownsamplePyramid.jsx`.)*
- **Shadow** — shadow-map quality: kernel size + per-pixel samples (softer/cleaner cast shadows ↔ cheaper).

### Surfaces / Materials card

- **Per-layer / per-LU swatch** — pick any map layer or land-use class from the tabbed list (Streets, Blocks, Land Use, Paths, Land Cover, Furniture, Labels, Roofs, Lighting, Building, Neon, Trees, Park, Infra) and set its **Color** (hex swatch) and **Visible** (checkbox). Visibility here is also a bake lever (`BAKE.md §2`). *(Not TOD — a flat per-Look property.)*
- **3D material editor** (for the selected PBR material) — **Roughness**, **Metalness**, a **Texture** dropdown (none / brick variants / stone / stucco / wood / slate / metal) with **Texture Scale** + **Texture Strength** when a texture is chosen, and **Emissive** (colour swatch + intensity).
- **Building palette** — a 16-swatch colour grid that drives the per-building tint mix.
- **Lamp colour** — the **lamp swatch** here (`layerColors.lamp`) is the single source that tints both the lamp lantern and its ground light-pool (see Lamps card).

### Lamps card

Two channels:
- **Lantern** (`lantern` = **Brightness + Glow**) — the lamp's own light source (lantern / glow orb / bulb), TOD-animatable, operator master × the automatic dusk→night turn-on. **Lantern Brightness also drives the ground light POOL** (the pool *is* the lantern's light on the ground — one slider for both; off by day).
- **Lamp Glow** (`lampGlow` = **Canopy**) — the under-lamp glow on tree foliage.

The pool is **baked into the ground** (contour-correct), so its *shape* is a bake-time knob (CLI / bake operations, below). **Lamp colour** is the Surfaces lamp swatch (above) — one source tints the lantern **and** the pool.

### Hero & Horizon card

- **Arch placement** (non-TOD) — the Gateway Arch's **Distance**, **Scale**, **Rotation**, **Y-offset**, and **Foot-fade** (where the legs dissolve into the ground).
- **Arch Lighting** (`archLight`, TOD) — the cross-aimed foot **uplights**: left/right **intensity · colour · cone° · reach**, a TOD channel of their own so the wash can warm at dusk and fade by day. *(Placement stays on the separate, non-animated `arch` channel above.)*
- **Horizon** (non-TOD) — the horizon disc: **Radius**, **Fade-inner**, **Fade-outer** (how the ground plane dissolves into the far sky).

### Camera / Shots

- **Hero shot** — an authored camera **bounce**: the camera sweeps a Catmull-Rom path Start → (mids) → End → back, looking at the resolved hero subject. **Start/End are permanent anchors**; insert optional **Mid** keyframes (only mids are deletable). **FOV** is a per-keyframe channel; **Period** sets the bounce duration and an **Ease** toggle (sine / triangle) shapes the sweep. Replays identically in Stage / Preview / production via `heroAnim.js`.
  - **Authoring vs. runtime controls (2026-06-24).** The Hero shot opens in **runtime**: the bounce **plays** and the orbit controls are **locked** — you're watching exactly what ships. **Click a keyframe dot** (on the timeline) to **author** it: playback pauses, the camera **jumps** to that keyframe, and the controls unlock to a **free orbit** so you can reposition — the camera **stays locked on the subject** (the Hero Lock; you're choosing the vantage, not the aim). **Save keyframe** captures the new position + FOV, **re-locks**, and **stays paused on the saved frame** (so you can click the next dot and keep going); press **▶** to watch the motion, or **Cancel / Esc** to discard the orbit. In a gap with playback paused, **+ Add keyframe here** inserts one at the playhead and drops you straight into authoring it. *(Only `{position, fov}` is stored; the subject-aim is applied at runtime — so the look-direction you orbit through is a framing aid, not saved.)*
- **Browse camera** — the overhead default: **Center X / Center Z** (the look-at point; numeric inputs, click-to-edit or drag-to-scrub), **Altitude**, **FOV**, and **Heading** (screen orientation — the one fully-baked camera channel today).
- **Street camera** — the eye-level shot: **Eye height** and **FOV**.
- **Stage drag semantics** — Browse: LEFT-drag = pan, ⌥+LEFT (or RIGHT) = orbit. Hero/Street: LEFT = rotate, ⌥+LEFT = pan (they're inspection shots). **Hero is the exception: its controls are locked during the runtime preview and only free while authoring a keyframe** (above). Designer's "Stage →" always lands on Browse so the camera transition is continuous with the overhead view.

### Paths ▸ Shape

- **Alley end-cap dial** — a 3-segment toggle controlling how **all** alleys in the active Look terminate: `square` (flush) / `rounded` (rounded-rectangle pad) / `round` (true semicircle). Stored as `design.alleyCap`. Other path kinds use per-kind defaults and carry no operator surface.

### Bake — committing the look to the slab

- **Bake buttons** — Designer's **"Stage →"** = navigate to your last Stage shot immediately, bake async in the background (the slab refreshes when done). Stage's **"↻"** = bake in place, stay put. Both accept **⌥-click to force a full rebuild** (bypass the dirty-check). A small orange dot lights when authoring edits exist since the last bake (indicator only — never disables the action).
- **Ground-contact effects** (baked; tune via the bake constants in **CLI / bake operations** below): the **lamp light pools**, the **dark contact rings** under trees + lamps (visible in daylight), and the **tree trunk-base ground blend** (the lowest of each trunk takes on the ground colour beneath it). All three bake into ground textures + sample in the ground/tree shaders — **re-bake to see them**, hard-refresh to pick up the slab.

## Preview — the publish-confidence gate

GPU profiler · device frame · layer-toggle matrix · TOD scrub. Walks the *shipping* render with a profiler strapped on. **The layer-toggle matrix is *ephemeral inspection* ("what am I measuring") — never persisted as policy; "all-on" equals production.** Separately, the operator authors **deployment policy** here: the per-platform channel-listing (desktop vs. mobile inclusion), the one thing Preview writes. Keystone Reference: **`PREVIEW.md`** (the model — what it inspects + how to read the numbers). *(In flight — the virtual-device emulator + device-budget gauges + thermal/memory/transition readouts: `HANDOFF-preview-measurement.md`.)*

Unlike Stage, **Preview authors almost nothing** — its knobs set up an *inspection*, not a look. The one thing it will write is deployment policy (below). What persists is the inspection *state* (which device, which layers shown), in `localStorage`, so a reload returns you to the same vantage.

### Device / environment selector — Desktop · Phone-hi · Phone-lo

The top-bar device picker switches the render environment *and* the budget the gauges read against — the cost is benchmarked to **two real reference phones**, not the operator's desktop. Exclusive toggle; persists to `localStorage` (`preview.mode.v1`). Phone modes also draw the canvas inside the phone bezel (below).
- **`phone-hi` = iPhone 16 Pro Max** — Apple A18 Pro (6-core GPU), 8 GB RAM, 6.9″ 2868×1320 (~460 ppi). The best-case ceiling (and the device the PhoneFrame bezel is modeled on).
- **`phone-lo` = Samsung Galaxy A54/A55** — the floor we *guarantee*. Anchored to the weaker A54 (Exynos 1380, Mali-G68 MP5, 8 GB, 6.4″ 2340×1080); the A55 (Exynos 1480, RDNA-based Xclipse 530) is the stronger sibling, so an A54-clean slab covers it.
- **`desktop`** — a 60fps target with a generous-but-present draw/tri ceiling (trips only on a pathological scene / weak laptop GPU).
- **All budgets live in one place: `src/preview/deviceProfiles.js`** — edit the numbers there. ⚠️ Today the device *identities* are set but the per-tier budget *numbers* are **interim** (placeholder) until the Phase-3 virtual-device measurement locks them — don't trust a "ships" verdict for a publish call until they're measured.

### Shot picker — Hero · Browse · Street

Top-bar buttons that move the camera between the three production shots, **gated by production's adjacency graph** (Hero ↔ Browse ↔ Street; there is no direct Hero↔Street edge, so that button greys out from Hero). The **Hero** shot is the same authored bounce, replayed identically here (`heroAnim.js`). Camera drag in each shot mirrors Stage (Browse: LEFT = pan, RIGHT = orbit; Hero/Street: LEFT = orbit, RIGHT = pan); a deliberate drag during the Hero auto-pan interrupts it back to Browse, exactly as production does. Ephemeral.

### Time-of-day scrub

The shared **DawnTimeline** — scrub dawn → day → dusk → night to inspect the Look across the day (the same control Stage uses). Ephemeral.

### The layer-toggle matrix — *what am I measuring*

The right panel lists every render layer with a per-layer cost bar; each checkbox gates that layer's `.visible` (never the mount), so **"all on" is the literal shipping cost** (`PREVIEW.md §3`). Toggling a layer off attributes its measured Δ. Inspection state persists to `localStorage` (`preview.layers.v3`) — but this is *measurement* setup, **not** the deployment manifest (those are separate; see below).
- **Scene layers** — Ground (carries the baked lamp-pools / contact-shadows / trunk-blend), Buildings (the slab merged mesh), Trees, Park, Streetlamps, Gateway Arch, Neon, Sky+Sun, Clouds, Atmospheric Fog.
- **Post-FX layers** — N8AO, Bloom, Halo (aerial perspective), Film Grade, Film Grain, SMAA, **DoF** *(WIP)*.
- **Two deliberate default divergences from production** (`DEFAULT_LAYERS`): **Neon is forced all-on** (worst-case profiling, vs. production's TOD-gated neon), and **Bloom defaults off** (only so a reload doesn't burn into a black scene — not because it's broken). Flip them on for true parity.

### Reading the gauges

- **GPU panel** — the numeric tab: a **scene-vs-budget verdict** (one chip per device, green/amber/red against that device's budget), live **frame ms · fps**, **draws / tris** vs. budget, resident **geos / tex / progs**, and a rolling **spike log** (each spike tagged with the gesture that caused it). **Milliseconds are the budget** — draws/tris are context, frame-time is what users feel (`PREVIEW.md §4`).
- **Strip chart** (phone mode) — a rolling work-ratio equalizer against the device budget line, with cluster detection (≥3 events bunched → "stagger" hint) and a hover caret (when stopped) for per-frame detail.
- **Recording mode** (phone mode) — **event** (a trigger arms a ~5 s capture window) vs. **ambient** (a continuous rolling window, triggers disabled). Persists to `localStorage` (`preview.recMode.v1`).
- ⚠️ **Three caveats** when reading per-layer cost (`PREVIEW.md §4`): it's *render* cost, not VRAM; deltas **don't sum** (shared overdraw) — trust the all-on total; neon is forced-on.

### Phone frame · soft-reload · trigger bar

- **Phone frame** — in a phone device mode, the canvas renders inside an iPhone bezel at the deployed mobile aspect, so you read the real portrait slice.
- **Soft-reload (↻)** — remounts the canvas and re-fetches the baked artifacts (and busts the tree-atlas cache) — the escape hatch when a re-bake didn't show. *(If a Look looks right in Stage but wrong here, it's the bake that didn't propagate — re-bake / soft-reload — never a Preview bug.)*
- **Trigger bar** (phone mode) — shot-jump + reload buttons that fire a recording span, so a spike is attributable to a specific gesture.

### The pyramid tuner — *in flight* ⏳

Per-device sliders (**Levels · Resolution · Radius**) that tune the **shared downsample pyramid** feeding Bloom + DoF — `Resolution` is the looks↔cost dial (finer mips cost perf). Persists per-environment to `localStorage` (`preview.renderTiers.v1`). ⚠️ **This is part of the in-flight measurement-regime / shared-pyramid arc, not settled doctrine** — the pyramid being shared + re-bracketable per device tier is still being worked out (`HANDOFF-preview-measurement.md`, `[[preview-equals-pyramid-tier-ladder]]`). Document/operate it as provisional; the channel set and where it lives may still move.

### Deployment policy — the one thing Preview writes *(planned)*

The per-platform **inclusion manifest** — *which channels ship to desktop vs. mobile* — is a **cost-driven deployment decision**, so it's authored here at the gate, beside the instrument that responds (`PREVIEW.md §0.2`). ⚠️ **Not yet built** — the editorial surface lands with the v0.2 measurement regime (`HANDOFF-preview-measurement.md`, Phase 3–4). Until then Preview writes nothing; its product is the operator's *verdict* ("ship the slab" / "back to Stage").

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

Promote to staging = fast-forward/merge the feature branch into the trunk and push; promote to prod = merge the trunk into `main` and push.

**The working loop (strategy B, chosen 2026-06-26).** Author on the working branch (`curb-offset-draw`) → commit source+derived → push to the **trunk** (auto-deploys staging) → eye-check staging → **fast-forward `main`** when you want it public. Prod (`main`) and the trunk are **both slab-era** and kept only a few commits apart, so a prod promotion is a clean fast-forward, not a big-bang. Quick commands: `git push origin <branch>:cartograph-looks-pass-ab` (staging), then `git push origin <branch>:main` (prod) once staging is verified.

> ⚠️ **Reason about deploy state from the REMOTE, never a stale local ref.** Always `git fetch` and compare `origin/main` / `origin/cartograph-looks-pass-ab` — not local `main`/trunk, which drift badly when you live on a feature branch. On 2026-06-26 local `main` (`b39834b4`) read **1123 commits + "pre-slab" behind** while `origin/main` was actually **4 commits behind and slab-era** — an entirely phantom gap that nearly derailed a publish decision until the remote was checked.

*(Derived artifacts are intentionally **git-tracked**, not ignored — that's what lets CI stay a plain `vite build`. The alternative — gitignore them and bake in CI — is a deliberate, un-taken fork; see the named levers below.)*

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
| **Bloom (or another post effect) suddenly looks broken / no glow** right after you toggled **DoF or SMAA** | An **HMR artifact, not a real bug.** The `EffectComposer` is keyed `fx-${smaaOn}-${dofOn}`, so toggling DoF/SMAA rebuilds the composer and Vite HMR can leave it detached → **hard-refresh the page.** Don't chase a DoF↔Bloom coupling — they share the pyramid by design. |
| **Trees don't show in Browse** | Known render "wake-up" — **nudge any look dial** and they pop in. It's the render/cull layer, not a look knob (tracked, unresolved). |

### Named levers (deliberate, not yet built)

Two formalizations are *chosen but un-built* (2026-06-17 — the path-A decision), tracked here so we turn them on purpose, not by accident:
1. **Kill the timestamp noise** — make `scene.json`/`index.json`/`default.json` omit (or stabilize) their `Date.now()` fields so a no-op re-bake is byte-identical and the tree stops going dirty for free.
2. **One-command save ceremony** — a single CLI action: flush source → force-bake → report what *semantically* changed → commit the slab. Replaces eyeballing the dirty tree.

*(With path-A also: a reproducibility gate — CI/pre-push check that the committed slab equals a fresh bake from source — to catch a stale slab before it ships.)*

*Provenance: Boz 2026-06-01 (seed); populated 2026-06-14 from the FEATURES operator-knob migration; **save→ship lifecycle + troubleshooting door added 2026-06-17** (the forensic-to-lookup conversion); **Stage + Preview expanded to the full code-grounded knob master list 2026-06-26** (pyramid tuner + inclusion manifest flagged in-flight). The operator-manual counterpoint to FEATURES.*
