# Meteorologist — Interface

The operator-facing layout. What surfaces exist, what each owns, what each composes from elsewhere. This doc captures the model; engineering follows from it.

> Part of the **meteorologist quartet** (`README.md` / `ARCHITECTURE.md` / `SPEC.md` / `BACKLOG.md` / `NOTES.md`, with `INTERFACE.md` / `CANON.md` / `STAGE_MIGRATION.md` as topical addenda). Updates to layout decisions land here first; cross-references in the other docs follow.

---

## 1. App shape — standalone shell

Meteorologist runs at **`/meteorologist.html`** as its own app shell, mirroring Arborist's shape. This reverses the earlier "in-Stage editor housing" decision (see `NOTES.md` 2026-05-18 entry). The reversal's rationale: Meteorologist **consumes** Stage's published artifacts (sky envelope + sun/moon + lighting curves via `scene.json`) rather than reproducing them. With consume-not-reproduce as the boundary, the original concern (duplicating Stage's rendering stack) dissolves; standalone gets the operator full real-estate for cloud authoring without paying that cost.

```
URL                  Owner                              Role
─────────────────────────────────────────────────────────────────────────────
/cartograph.html     Cartograph Stage (the studio)      Authors the world
/arborist.html       Arborist (tree library)            Authors trees
/meteorologist.html  Meteorologist (weather authoring)  Authors weather
/preview.html        Preview (slab inspection)          Verifies the bake
/                    Production (LS app)                Renders for users
```

Meteorologist composes outputs from Cartograph (sky channels) + Arborist (hero tree) as its authoring backdrop. Its own outputs (Teapot presets + Conditions/Almanac) are consumed by Production's `<Atmosphere />` runtime when v3 lands.

---

## 2. Vocabulary

Two top-level libraries. Same data model, two viewpoints into it.

| User-facing word | What it is | Schema name (internal) | File |
|---|---|---|---|
| **Teapot** | Library of 52 cloud presets | `presets-file` + `preset` | `public/clouds/presets.json` |
| **Teacup** | The per-cloud workstage (one cloud, isolated, intrinsic params) | — | — |
| **Conditions** | Library of 16 weather situations | `almanac` (file stays named Almanac) | `public/clouds/almanac.json` |
| **Condition editor** | The per-condition workstage (sky modulations + clouds-in-condition + per-cloud expression flags) | — | — |
| **Cloud chamber** | First slot tab — cloud isolated against sky, close framing | — | — |
| **Ground** | Second slot tab — cloud composed with a hero tree for scale, mid-distance framing | — | — |

The schema and file names keep their internal vocabulary (Almanac stays Almanac in code) to avoid churn; the UI uses Teapot/Teacup/Conditions throughout. The word "preset" stays available in tooltips/help when the technical term is clearer than "Teapot entry."

---

## 3. Top-level navigation

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ METEOROLOGIST          [ TEAPOT | CONDITIONS ]                       [Look ▾]│
└──────────────────────────────────────────────────────────────────────────────┘
```

**Top-bar elements:**

- **App name** (`METEOROLOGIST`) — left, plain typography, no logo.
- **Mode toggle** (`TEAPOT | CONDITIONS`) — center. Two co-equal libraries; not nested. Active mode is highlighted; clicking either switches the library being browsed.
- **Look picker** — right, mirrors Arborist's `LookPicker`. Selects which Cartograph Look's sky envelope is imported as the authoring backdrop. Active Look's published `scene.json` provides sun, sky, lighting curves, celestial bodies.

No Almanac button — Almanac is the Conditions library, not a separate surface.

No save action anywhere — autosave-on-edit throughout (same model as Stage's TodChannel primitive; see §6).

---

## 4. Library views

Two libraries, same shape — flat rows, click to open the workstage. Mirrors `ArboristApp.jsx`'s species list.

```
TEAPOT library                            CONDITIONS library
┌─────────────────────────┐               ┌─────────────────────────┐
│ Cumulus humilis         │               │ Clear day               │
│ Cumulus mediocris       │               │ Fair cumulus            │
│ Cumulus congestus       │               │ Building convection     │
│ Cumulonimbus capillatus │  → click →    │ Mackerel sky            │  → click →
│ Stratocumulus translucid│               │ Halo cirrostratus       │
│ Cirrus uncinus          │               │ Overcast pre-rain       │
│ Cirrostratus            │               │ Steady rain             │
│ Fog ground              │               │ Thunderstorm            │
│ Haze summer             │               │ Post-storm mammatus     │
│ …  (52 total)           │               │ Snow                    │
└─────────────────────────┘               │ Morning fog             │
                                          │ Summer haze             │
                                          │ …  (16 total)           │
                                          └─────────────────────────┘
```

Each row carries minimal metadata — name, genus tag (Teapot) or weather signature (Conditions), and a small indicator if the entry has been operator-edited vs. ships-as-default. No thumbnails in v1 (deferred until v3 `<Atmosphere />` renders are cheap to generate; reference-photo gallery is a v1.x BACKLOG item).

---

## 5. Workstage layout — shared frame, divergent rail

Both Teacup (per-cloud) and Condition editor (per-condition) share the same outer frame. Only the right rail's content below TOD differs.

```
┌── header ────────────────────────────────────────────────────────────────────┐
│ ← TEAPOT  METEOROLOGIST  cloud authoring        CLOUD  [ Cumulonimbus ▾ ]    │
│           (or)                                  (or)                          │
│ ← CONDITIONS  METEOROLOGIST  weather authoring  CONDITION  [ Thunderstorm ▾ ]│
├── slot tabs ─────────────────────────────────────────────────────────────────┤
│ [ CLOUD CHAMBER ● ] [ GROUND ]                                                │
├── viewport ──────────────────────────────────────────┬── right rail ─────────┤
│                                                      │ ▼ Time of Day         │
│                                                      │   [TodChannel UI]     │
│                                                      ├───────────────────────┤
│                                                      │ ▼ <rail body — see    │
│                                                      │     §5.1 or §5.2>     │
│  imported sky from active Look                       │                       │
│  + thing-being-authored                              │                       │
│  + hero tree (Ground slot only)                      │                       │
│                                                      │                       │
│                                                      │                       │
│                                                      │                       │
│                                                      │                       │
└──────────────────────────────────────────────────────┴───────────────────────┘
```

Header pattern matches Arborist's `ProceduralWorkstage` exactly: back button on the left, mode name + subtitle in the middle, named-unit pulldown on the right. Slot tabs sit immediately below, in the strip Arborist uses for SLOT 1 / SLOT 2 / SLOT 3.

### 5.1 Teacup right rail (Teapot view)

```
┌── right rail ──────────────┐
│ ▼ Time of Day              │
│   [TodChannel UI]          │
├────────────────────────────┤
│ Previewed under:           │
│ [ Thunderstorm ▾ ]         │  ← condition selector for the sky backdrop
├────────────────────────────┤
│ ▼ Cloud parameters         │
│   coverage    [TodChannel] │
│   density     [TodChannel] │
│   drift       [TodChannel] │
│   silver      [TodChannel] │
│   scatter     [TodChannel] │
│   sunScatter  [TodChannel] │
│   ambientFlr  [TodChannel] │
│   edgeSilver  [TodChannel] │
│   shadowStr   [TodChannel] │
│   thickness   [TodChannel] │
│   baseAlt     [TodChannel] │
│   warpFreq    [TodChannel] │
│   warpAmp     [TodChannel] │
└────────────────────────────┘
```

13 cloud-shader params, each its own `TodChannel`. The "Previewed under" selector picks which Condition's atmospheric modulations are applied to the imported sky while the operator tunes — lets them see cumulonimbus against Thunderstorm conditions, then under Clear Day, then under Mackerel Sky, without leaving Teacup view. Conditions are editable+revertable; this preview-context is a read-only consumption of whatever the operator has authored in Conditions view.

### 5.2 Condition editor right rail (Conditions view)

> **Phase 3 ships these as flat inputs** (slider / color / dropdown / chip multi-select). **Phase 3b promotes the numeric directive fields** (`sun.intensity`, `lightDome.ambientFloor`, `wind.scale`, `wind.dir`, `precip.intensity`) **to TodChannels** (the same `animatableValue` shape Phase 2 introduced for cloud-shader params), once Phase 4's viewport lets us validate the temporal authoring visually. Colors and enums stay flat in v1.


```
┌── right rail ──────────────────────┐
│ ▼ Time of Day                      │
│   [TodChannel UI]                  │
├────────────────────────────────────┤
│ ▼ Sky modulations                  │
│   darken      [TodChannel]         │
│   desat       [TodChannel]         │
│   halo        [TodChannel]         │
│   light dome  [TodChannel]         │
│   wind speed  [TodChannel]         │
│   wind dir    [TodChannel]         │
│   [Revert to ship defaults]        │
├────────────────────────────────────┤
│ Clouds in this condition           │
│ [ Raining Cu-nimbus ▾ ]            │  ← which cloud-in-condition you're editing
│ [+ Add cloud from Teapot]          │
├────────────────────────────────────┤
│ ▼ Expression (per-cloud-in-cond)   │
│   weight       [TodChannel]        │  ← blend weight in directive
│   rain rate    [TodChannel]        │  ← gated by cloud's precipKinds
│   snow rate    [TodChannel]        │  ← gated by cloud's precipKinds
│   lightning    [TodChannel]        │  ← gated by cloud's electrified flag
│   [Remove from condition]          │
├────────────────────────────────────┤
│ When this condition fires:         │
│   tempC      [range slider]        │  ← rule's `when` block (not TodChannel)
│   cloudCover [range slider]        │
│   humidity   [range slider]        │
│   windKph    [range slider]        │
│   precipMmHr [range slider]        │
│   stormDistK [range slider]        │
│   sunElevDeg [range slider]        │
│   …                                │
└────────────────────────────────────┘
```

The "Clouds in this condition" pulldown is the *filtered* list — only clouds whose `capabilities` are compatible with this condition's expression flags. (Cumulonimbus appears in Thunderstorm because it can rain + spark lightning; Cirrus doesn't because it can't.) The pulldown switches which cloud's per-condition expression flags are being tuned in the rail below.

The "When this condition fires" block at the bottom uses plain range sliders (not TodChannel) — these are the rule's `when` predicates, not TOD-animated. They're the schema's `weatherPayload` boundaries that decide which condition the Almanac evaluator selects.

---

## 6. The TOD card and the autosave model

Both rails carry the **same TOD card on top** — the existing `<TodChannel>` primitive from `src/cartograph/TodChannel.jsx`, untouched. Imports the project-wide design tokens from `src/tokens/design.css`. No fork, no copy.

**Per the TodChannel contract:**

- Each authored value is one of 7 named TOD slots (`dawn / sunrise / noon / golden / sunset / dusk / night`).
- A channel can be **flat** (one value) or **animated** (per-slot keyframes with optional ramp in/out).
- Slot-chip strip below each slider lets the operator attach/detach keyframes.
- Editability gating: when the playhead is parked on an attached slot, sliders are editable; off-slot they're read-only at the interpolated value. (Same rules across all callers.)

**Autosave-on-edit.** No Save button anywhere in the app. Drag a slider → the channel commits the new keyframe at the active slot → write debounces to disk through `serve.js` → next reload reflects the change. Same model as Stage. The only explicit action in the whole app is **Revert** (per-condition, per-channel) — and that's a recovery affordance, not a finisher.

**Volumetrically:** 52 clouds × 13 params × 7 slots ≈ 4,700 numeric values in the Teapot, plus 16 conditions × ~6 sky-mod channels × 7 slots ≈ 670 values in Conditions, plus per-cloud-in-condition expression flags. Authored sparsely (most slots inherit the flat default until the operator touches them).

---

## 7. The viewport — what's rendered

Two slot tabs share the canvas but compose differently:

### Cloud Chamber slot
```
┌── viewport ──────────────────────────────────────┐
│  imported sky (sun, moon, gradient, celestial)   │
│  + the active cloud (or full blend in Cond view) │
│  no ground, no tree                              │
│  camera framing: tight, mid-frame, cloud-centric │
└──────────────────────────────────────────────────┘
```

For tuning the cloud's intrinsic shape against atmospheric lighting without scene-scale interference. The sky is real (active Look's `scene.json`); the cloud is the one being authored.

### Ground slot
```
┌── viewport ──────────────────────────────────────┐
│  imported sky                                    │
│  + the active cloud (or full blend)              │
│  + flat or gently bermed ground                  │
│  + ONE hero tree from Arborist (mid-frame)       │
│  camera framing: tilted ~30° up, sky fills 70%   │
└──────────────────────────────────────────────────┘
```

For verifying the cloud reads at LS scale, with a real-world reference object (the tree) anchoring scale + perspective. The hero tree is intentionally a fancy high-LOD asset we wouldn't ship in a populated LS scene — Meteorologist's authoring scene has one tree, so we can spend the GPU budget here that we can't elsewhere.

### What the viewport composes (the publish-loop consumed-not-reproduced)

```
useSceneJson(activeLook)         ← Cartograph's per-Look published scene.json
  → <CelestialBodies>            ← same shared consumer Stage + Preview mount
  → <ArchHorizon>                ← (Ground slot only)
  + (Ground slot only)
    <InstancedTrees> with        ← Arborist's per-Look bake
    one-tree placement override
  + (always)
    <Atmosphere> with current    ← Meteorologist's own runtime
    Teapot/Conditions state
```

No new render code beyond `<Atmosphere />` itself. Everything else is mounting existing consumers with the active Look's published artifacts.

---

## 8. Rain / snow / lightning — modifier flags, not species

Per SPEC §"Decisions locked" — *"Modifiers (incus, mamma, virga, asperitas, etc.) are flags layered by the shader, not standalone presets."* This extends to precipitation and electrical activity.

- **One cumulonimbus in the Teapot.** Same Teacup, same intrinsic params (shape, density, base color, etc.).
- **Capabilities** live on the cloud preset: `precipKinds: ['rain', 'snow']`, `electrified: true`, etc. Declarative — "this cloud CAN do these things."
- **Expression** lives on the Condition's per-cloud config: in Thunderstorm, the cumulonimbus IS raining at rate X (per-TOD-slot), sparking at rate Y. The cloud-in-condition pulldown lists "Raining cumulonimbus with lightning" because the Thunderstorm condition has set `rain: true, lightning: true` on its cumulonimbus reference.

Why not "variants" (Arborist's model): Arborist variants are different *geometries* of the same species. Cloud variants would be different shader flag combinations on the same geometry — that's a state distinction, not a geometry distinction.

Why not "separate species": would balloon the Teapot from 52 → 200+, most of which are combinatorial flag products of a smaller base set with no independent intrinsic params.

UI consequence: the Teacup right rail does NOT have rain/snow/lightning rate sliders. Those only appear in the Condition editor's per-cloud expression block (§5.2), and only when the selected cloud's capabilities permit them.

---

## 9. Conditions ship as editable + revertable presets

Same pattern Cartograph uses for material colors, TOD curves, etc.:

- `public/clouds/almanac.json` ships with 16 canonical conditions baked in (current state: scaffolded).
- Operator edits any condition freely; edits autosave.
- Each condition's right rail carries a **Revert to ship defaults** button at the bottom of the Sky-modulations card. Click → restores the on-disk default values for THIS condition (not the others).
- A global Revert is not exposed in v1; per-condition is enough granularity.

The Teacup view consumes Conditions as preview contexts (§5.1) — so editing Thunderstorm affects what "Previewed under: Thunderstorm" shows when tuning any cloud, including ones not in Thunderstorm's roster.

---

## 10. App-shell architecture

Standalone app at `/meteorologist.html`. File layout mirrors `src/arborist/`:

```
src/meteorologist/
  main.jsx                       # imports ../tokens/design.css; renders <MeteorologistApp />
  MeteorologistApp.jsx           # top bar, mode toggle, Library router by groveOpen-style flag
  TeapotLibrary.jsx              # flat list, click → setActiveCloud
  Teacup.jsx                     # header / slot tabs / viewport / right rail
  ConditionsLibrary.jsx          # flat list, click → setActiveCondition
  ConditionEditor.jsx            # header / slot tabs / viewport / right rail
  SlotTabs.jsx                   # shared CLOUD CHAMBER | GROUND component
  CanaryScene.jsx                # the toy scene (flat ground + hero tree + sky)
  stores/
    useMeteorologistStore.js     # zustand: active mode / active cloud id /
                                 # active condition id / preview-context id /
                                 # autosave plumbing to serve.js

meteorologist/
  serve.js                       # port 3335, GET/PUT presets + almanac + fixtures
  pipeline/                      # (exists) schemas + validator

public/clouds/                   # (exists) presets.json + almanac.json
                                 # + fixtures/ (not yet populated)
```

`src/meteorologist/main.jsx` imports `../tokens/design.css` so the TodChannel primitives render with the project palette. No CSS authoring needed in the helper.

---

## 11. What's NOT in v1

- **Cloud preset gallery / thumbnails.** Deferred until v3 `<Atmosphere />` renders are cheap. Reference photos optional; BACKLOG item 10.
- **Fake-weather panel.** SPEC's original third right-panel card. Folded into the Condition editor's "When this condition fires" range-slider block — the operator dials the condition's trigger ranges and the viewport already reflects the result (since the editor IS that condition). No separate fixture-driven preview surface in v1.
- **Procedural-style dice + adopt.** Cloud presets are parametric; there's nothing to dice. The whole "roll random seeds and adopt good ones" idiom doesn't map here.
- **A Grove equivalent.** Clouds aren't curated into per-Look rosters. The full Teapot is always present; Conditions select from it via capability filter.
- **Multi-Look authoring.** All authoring is global (Teapot is global; Conditions are global). The Look picker only selects which Look's *sky* is imported as backdrop, not which Look the cloud edits belong to. (Per-Look cloud-override channel is a separate question owned by Stage's `scene.clouds`, not Meteorologist.)

---

## 12. Cross-references

- `README.md` — orientation
- `SPEC.md` — full work order (some locked decisions updated 2026-05-18; see `NOTES.md`)
- `ARCHITECTURE.md` — publish-loop shape, consume-from-Stage subsection
- `BACKLOG.md` — spade work (the v1.5 list still applies; INTERFACE.md just resolves the layout questions)
- `NOTES.md` — 2026-05-18 reversal of in-Stage decision (load-bearing context for why this doc exists)
- `CANON.md` — Teapot inclusion principles
- `STAGE_MIGRATION.md` — CloudDome retirement (executes when `<Atmosphere />` v3 lands)
- `../cartograph/ARCHITECTURE.md` — kit-wide publish-loop pattern
- `src/cartograph/TodChannel.jsx` — the reusable TOD primitive; imported, not copied
- `src/components/DawnTimeline.jsx` — the scrub bar; imported, not copied
- `src/tokens/design.css` — design tokens; imported in `src/meteorologist/main.jsx`
- `src/arborist/ArboristApp.jsx` — the layout frame this doc adapts
