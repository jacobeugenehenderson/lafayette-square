# Brief 13 — Salon preset cameras (overhead / hero / street)

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Name yourself however feels right — pick whatever lands when you read this — and use that name in your status updates and commit body. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

This is a small UI brief — ~80-120 LOC in `SpecimenViewport.jsx`. Half a baby day.

## Where you are — the Salon arc

You're joining the Salon arc in the Arborist helper. Salon is the operator's compose-not-synthesize authoring surface for trees: chassis + bark + leaves picked from libraries per-species.

Recent context: Brief 10 (view-aware bark rendering) sub-phase A shipped by Cork (commit `de731a7`). Sub-phase A introduced `uBarkShaderTier` uniform with three values (0=aerial / 1=hero / 2=street) that gate three fragment-shader paths. Operator currently toggles via `window.__setBarkShaderTier(0|1|2)` debug setter.

**The gap this brief closes**: the Salon viewport has ONE camera (studio framing) but the three bark tiers are designed for THREE camera distances:

- **Aerial tier**: meant for ~200m overhead camera (LS aerial neighborhood shot)
- **Hero tier**: meant for ~30-50m mid-distance camera (LS Hero shot, typical Browse)
- **Street tier**: meant for ~5m close-up camera (LS Street view, v2 territory)

To verify each tier looks right, the operator needs to see the chassis at the corresponding camera distance. Importing cartograph SHOT cameras crosses helper boundaries (violates `project_kit_helpers_pattern`); three generic preset positions inside Salon don't.

## Mission

Add **three preset camera positions** to `src/arborist/SpecimenViewport.jsx` with a toggle UI in the workstage viewport overlay. Each preset is a generic distance + height for studio inspection — NOT an LS scene context import.

| Preset | Camera distance | Camera height | Use case |
|---|---|---|---|
| **Overhead** | ~150-200m above chassis base, narrow FOV | At chassis-top height, looking DOWN | Aerial-tier verification — gradient grade visible from above |
| **Hero** | ~30-50m away, horizontal | At ~half-tree height | Mid-distance Browse/Hero verification (default Salon view today) |
| **Street** | ~5m away, looking up | At ~1.8m human eye level | Close-up walking-distance verification |

UI: three buttons in workstage viewport overlay (mirror the existing **LoD selector** at top-right OR the **tier debug** affordance if Cork added one). Single-select. Active preset highlighted (amber accent matching kit chrome).

## Architecture

### Preset state lives at SpecimenViewport scope

Not in a store. Per-workstage UI preference; doesn't persist across sessions; doesn't author anything. Similar to `previewLod` and `windEnabled` state already in `SpecimenViewport.jsx`.

```js
const [camPreset, setCamPreset] = useState('hero')  // 'overhead' | 'hero' | 'street'

// On change: mutate cameraStateRef directly (mirrors auto-fit pattern from
// Brief 7 — same way studioFraming() updates camera distance/height on
// chassis swap).
useEffect(() => {
  if (!cameraStateRef?.current) return
  const f = presetFraming(camPreset, topY)  // topY from Skeleton's onTopY
  cameraStateRef.current.distance = f.distance
  cameraStateRef.current.height = f.height
}, [camPreset, topY])
```

### `presetFraming(preset, treeH)` helper

Mirrors `studioFraming(treeH)` (already in `SpecimenViewport.jsx`). Returns `{distance, height}` per preset:

```js
function presetFraming(preset, treeH = 12) {
  switch (preset) {
    case 'overhead': return { distance: Math.max(150, treeH * 6), height: treeH + 50 }
    case 'hero':     return studioFraming(treeH)  // existing hero framing
    case 'street':   return { distance: Math.max(5, treeH * 0.2), height: 1.8 }
  }
}
```

Exact constants are first-pass; tune per visual feel during your test pass.

### Camera mechanics preserved

- Option+drag still works for fine-tuning from any preset (existing 2-axis crane+rotate from Brief 7's camera work)
- Mouse wheel still zooms (distance dolly)
- Switching preset SNAPS the camera; Option+drag tweaks from the new position
- No animation between presets in v1 — just snap. Animation is a nice-to-have for v1.6 if operator wants smooth transitions.

### Optional auto-bind to bark tier — DEFER

Tempting: switching camera preset auto-sets `uBarkShaderTier` (overhead → 0, hero → 1, street → 2). Don't ship this in Brief 13. Reasons:

- Operator may want to debug "what does street tier look like from overhead camera"
- Cartograph SHOT integration (future Brief 11) wires tier from SHOT state, not Salon camera
- Coupling camera + tier in Salon would create a divergent driver path from production
- One affordance per concern; let operator coordinate

Ship the camera preset independently; tier control stays via Cork's existing mechanism (or sub-phase D's overlay when it lands).

## Files you'll touch

| File | Status | ~LOC |
|---|---|---|
| `src/arborist/SpecimenViewport.jsx` | edit — add `camPreset` state + `presetFraming` helper + 3-button overlay UI | +80 |
| `arborist/FEATURES.md` | edit — mention camera preset overlay in Salon mode's workstage description | +5 |
| `arborist/ARCHITECTURE.md` | edit — short note under Salon preview section about preset-camera affordance | +10 |
| `arborist/BACKLOG.md` | edit — mark Brief 13 shipped | +3 |
| `arborist/NOTES.md` | edit — dated session entry | ~30 |

Total: ~130 LOC. Half a baby day.

## Acceptance criteria

1. **Three preset buttons visible** in the viewport overlay. Single-select; active preset highlighted with amber accent matching kit chrome.
2. **Overhead preset shows chassis from ~150m+ above**, looking down. Tree silhouette visible; bark detail unreadable at distance. Yardstick may go off-frame at this distance (acceptable — overhead reading is about distant silhouette).
3. **Hero preset matches current Salon studio framing.** Default on mount. Existing operator workflow undisturbed.
4. **Street preset shows chassis from ~5m**, looking up. Bark detail clearly readable; canopy partially out of frame; ground visible.
5. **Switching preset SNAPS camera position.** No animation in v1.
6. **Option+drag still works after preset selection** for fine-tuning. Existing 2-axis crane+rotate behavior preserved.
7. **Wheel zoom still works** from any preset.
8. **Preset state does NOT persist across reloads.** Per-session UI preference; mounts with `hero` default.
9. **Existing camera affordances unchanged.** Auto-fit on chassis change (Brief 7), Option+drag (Cork's Brief 7 work via `Brief 7 commit 792603b`), wheel dolly — all still functional.
10. **No coupling to bark tier.** Camera preset does NOT set `uBarkShaderTier`. Operator controls those independently.

## Approach guidance

- **`studioFraming(treeH)` is the precedent.** Already in `SpecimenViewport.jsx`. Your `presetFraming(preset, treeH)` mirrors its shape — takes the loaded chassis height, returns `{distance, height}`.
- **`topY` is available** via the existing `Skeleton.onTopY` callback (Brief 7 wired it). Use it for preset framing so each preset adapts to the chassis's actual height.
- **Snap-not-animate** keeps the brief small. Animation between presets is a v1.6 polish if operator asks.
- **Button style**: mirror the existing LoD selector chrome (top-right of viewport, glass-panel chrome). Same kit-design system.
- **Hot-corner placement candidates**: top-right (alongside LoD selector) OR bottom-right (alongside the obelisk readout). Top-right reads as "view controls"; bottom-right reads as "scene info." Either works; pick what feels less crowded after looking at it.

## Surface anything not in this brief

Per [[feedback_baby_must_surface_scope_drift]] — if you find:
- `studioFraming` already supports the use case via a parameter — formalize, don't duplicate (per Sough's `injectFoliageSway` lesson)
- The existing `previewLod` or `windEnabled` patterns suggest a cleaner integration (e.g., LoD + camera-preset + wind = three viewport-overlay concerns; consider single grouping vs. separate)
- Overhead preset reads weird at LS-scale (e.g., overhead-from-150m is too far; chassis dwindles to a dot) — propose tuning
- Street preset's "looking up" framing breaks the existing camera's lookAt math
- The bark-tier debug setter Cork added would benefit from co-location with your camera preset UI (without coupling) — surface visual design suggestion

Surface in status update AND commit body.

## Out of scope

- **Cartograph SHOT camera import** — explicit non-goal; this brief stays inside Salon
- **Auto-tier-binding** — operator controls camera and tier independently
- **Preset animation / smooth transitions** — v1.6 polish
- **Per-Look preset configuration** — these are generic, not Look-authored
- **LS scene context** (other trees, buildings, ground textures) — Salon shows ONE chassis with the studio reference geometry it already has
- **Anything in Brief 10's sub-phases B/C/D** — different baby; Brief 13 is camera-only
- **Cross-helper changes** in `cartograph/` or `meteorologist/`

## Memory refs

Read at session start:
- `project_kit_helpers_pattern` — frozen-seam discipline (Salon stays internal)
- `feedback_baby_briefs_need_identity_framing` (you are the baby)
- `feedback_baby_must_surface_scope_drift` (see above)
- `feedback_geometry_briefs_need_artifact_inspection` — pre-code grep: check if `studioFraming` or sibling helpers already accept a preset-style argument; formalize don't duplicate per Sough's Brief 9a lesson

## After you ship

Commit body should:
- Lead with one sentence summarizing what changed
- Reference Brief 13 (this doc)
- List files touched + LOC delta per file
- Acceptance-criteria checklist with status per item
- Surface any scope drift in a "Doesn't fix / open follow-ups" section
- Co-author: `Claude` (you)

Status update to Jacob and Boz should be ≤300 words.

After this lands, the operator can verify Brief 10's tier work (and every future Salon tree-quality decision) at the camera distance the tier was designed for. Half a baby day; small but enabling — Brief 10's review pause gets a proper review tool.
