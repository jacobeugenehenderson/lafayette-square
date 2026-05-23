# Meteorologist Phase 2 — Teacup workstage

Stand up the per-cloud authoring surface. Click a Teapot row → Teacup opens; right rail has the standard TOD card on top + 13 cloud-shader-param TodChannels below, each autosaving. **No 3D viewport yet** — that's Phase 4. **No Condition editor** — that's Phase 3.

---

## Read first, in this order

1. **`meteorologist/INTERFACE.md` §5 + §5.1 + §6**  — the Teacup layout (header / slot tabs / viewport / right rail) and the autosave model.
2. **`src/cartograph/TodChannel.jsx`** docstring (lines 1–43) — the channel data contract, editability gating, fillSlot semantics, revert behavior.
3. **`src/cartograph/animatedParam.js`** docstring (lines 1–40) — the `NAMED_TOD_SLOTS` vocabulary + `resolveGroupAtMinute` resolver. **You will reuse this resolver** (it handles both flat + animated forms).
4. **`meteorologist/pipeline/schema/preset.schema.json`** — the current strict schema. You're going to relax it (see §"Schema extension" below).
5. **`src/arborist/Workstage.jsx`** + **`src/arborist/ProceduralWorkstage.jsx`** — header + slot-tab layout templates. Mirror the visual frame; don't copy the LiDAR-specific machinery.
6. **`src/cartograph/CartographSkyLight.jsx`** — search for `<TodChannel` usage to see how callers wire the props (onFillSlot / onSetValue / onRevert / etc.). Stage's existing channels are your model for how Meteorologist should mount its 13 cloud params.

---

## Scope (Phase 2 only)

### Files to CREATE

```
src/meteorologist/
  Teacup.jsx                                ← header / slot tabs / placeholder viewport / right rail
  SlotTabs.jsx                              ← shared CLOUD CHAMBER | GROUND component (placeholder content)
  cloudParamFields.js                       ← static metadata: the 13 cloud param ids + labels + min/max/step
```

### Files to MODIFY

```
meteorologist.html                          ← (probably nothing; depends on root mounting)
src/meteorologist/MeteorologistApp.jsx      ← when activePresetId set → render <Teacup /> instead of <TeapotLibrary />
src/meteorologist/TeapotLibrary.jsx         ← click row → setActivePreset(id) (already wired Phase 1; just ensure it triggers Teacup mount)
src/meteorologist/stores/useMeteorologistStore.js  ← add: presetById lookup, updateCloudParam debounced PUT, savePreset
meteorologist/serve.js                      ← add: GET /presets/:id, PUT /presets/:id (with schema validation)
meteorologist/pipeline/schema/preset.schema.json   ← relax cloudParams + fogParams to allow animated-channel values
meteorologist/pipeline/validate.js          ← (only if necessary) handle both flat-number + animated-channel shapes in cross-schema checks
public/clouds/presets.json                  ← migrate flat-number params to TodChannel shape (one-time, scripted; commit the result)
```

### What the Teacup renders

```
┌──────────────────────────────────────────────────────────────┬──────────────────────┐
│ ← TEAPOT   METEOROLOGIST  cloud authoring   CLOUD [Cu humilis▾]                     │
├──────────────────────────────────────────────────────────────┼──────────────────────┤
│ [ CLOUD CHAMBER ● ] [ GROUND ]                               │ ▼ Time of Day        │
├──────────────────────────────────────────────────────────────┤   [DawnTimeline +    │
│                                                              │    NAMED_TOD_SLOTS]  │
│                                                              ├──────────────────────┤
│                                                              │ ▼ Cloud parameters   │
│                                                              │                      │
│            Phase 4 will mount CanaryScene here.              │   coverage           │
│            Phase 2 ships a dark placeholder.                 │   density            │
│                                                              │   drift              │
│                                                              │   sunScatter         │
│                                                              │   ambientFloor       │
│                                                              │   edgeSilver         │
│                                                              │   shadowStrength     │
│                                                              │   noiseSeed          │
│                                                              │   octaves            │
│                                                              │   baseAlt            │
│                                                              │   thickness          │
│                                                              │   warpFreq           │
│                                                              │   warpAmp            │
│                                                              │                      │
│                                                              │ (each row is a       │
│                                                              │  <TodChannel> with   │
│                                                              │  one field: 'value') │
└──────────────────────────────────────────────────────────────┴──────────────────────┘
```

**Header pattern:** mirrors `src/arborist/ProceduralWorkstage.jsx` exactly. `← TEAPOT` back button on the left (sets `activePresetId = null`); `METEOROLOGIST` + `cloud authoring` subtitle in the center; `CLOUD` pulldown on the right with the current cloud's label (changing it sets `activePresetId` to the new id, NO back-trip to library).

**Slot tabs:** static for Phase 2 — render both pills (`CLOUD CHAMBER` highlighted by default, `GROUND` un-styled). Clicking the inactive pill flips the active state but the viewport just shows different placeholder text. Real rendering lands Phase 4.

**Viewport:** dark placeholder (`background: var(--surface-dim)` or `#0a0a0a`), centered text `"Phase 4: CanaryScene mounts here"`. No Canvas, no three.js imports.

**Right rail TOD card:** `<DawnTimeline />` mounted at the top. Bare-bones — it's the existing component, no Meteorologist-specific styling. Just reads/writes `useTimeOfDay` global state.

**Right rail Cloud parameters card:** one `<TodChannel>` per param in `cloudParamFields.js`. Each TodChannel is a single-field group (`fields: [{ key: 'value', label: '', min, max, step }]`) with the preset's current param value (wrapped on read; see §"Data model adapter" below).

---

## Data model — the load-bearing decision

The current `public/clouds/presets.json` stores each cloud param as a flat scalar:

```json
"params": { "coverage": 0.5, "density": 1.0, "drift": 0.8, ... }
```

`TodChannel` expects each authored value to be one of:

```js
// Flat (channel not animated):
{ values: { value: 0.5 } }

// Animated:
{ animated: 'tod', values: { dawn: {value: 0.3}, noon: {value: 0.5} }, transitionIn?: minutes, transitionOut?: minutes }
```

You must migrate the persistence to TodChannel shape so that:
1. The flat-number case stores as `{ values: { value: 0.5 } }`.
2. The first time the operator clicks the animate-toggle, that channel switches to the animated form.
3. The schema accepts both forms (it currently only accepts numbers).

### Schema extension

In `preset.schema.json` `$defs/cloudParams`, each param property becomes:

```jsonc
"coverage": {
  "oneOf": [
    // Phase-1 legacy flat (kept for round-trip safety during migration; can be retired once migration commits)
    { "type": "number", "minimum": 0, "maximum": 1 },
    // Phase-2 canonical shape — flat
    { "$ref": "#/$defs/animatableValue" }
  ]
}
```

Add `$defs.animatableValue`:

```jsonc
"animatableValue": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "values": {
      "type": "object",
      "description": "Flat: { value: number }. Animated: { <slotId>: { value: number }, … } where slotId ∈ {dawn, sunrise, noon, golden, sunset, dusk, night}.",
      "additionalProperties": {
        "oneOf": [
          { "type": "object", "properties": { "value": { "type": "number" } }, "required": ["value"], "additionalProperties": false }
        ]
      }
    },
    "animated": { "const": "tod" },
    "transitionIn":  { "type": "number", "minimum": 0, "maximum": 720 },
    "transitionOut": { "type": "number", "minimum": 0, "maximum": 720 }
  },
  "required": ["values"]
}
```

(Per-param min/max range is NOT enforced inside the animatableValue $def — too much overhead for marginal value. The UI's TodChannel sliders clamp at the field's `min`/`max` from `cloudParamFields.js`. Pre-bake will eventually catch any out-of-range value.)

### Migration

One-time, scripted, committed in this PR:

```bash
node meteorologist/pipeline/migrate-params-to-channels.js public/clouds/presets.json
```

Script reads `presets.json`, for each preset where `kind === 'cloud'` or `kind === 'fog'`, wraps every numeric param in `{ values: { value: <number> } }`, writes back. Validator passes after migration: `npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json` → `ok: 52 presets, 16 rules`.

The migration script lives at `meteorologist/pipeline/migrate-params-to-channels.js`. Keep it in the repo (don't delete after running); it's a precedent for future migrations.

### Runtime adapter

Phase 2 reads/writes the canonical animatableValue shape on disk. The runtime renderer (Phase 4's `<Atmosphere />` shader; not your problem yet) will pass the active TOD minute to `resolveGroupAtMinute` from `animatedParam.js` to get the scalar value to feed the shader uniform. This resolver already handles both flat + animated shapes — that's why we're aligning on it.

For Phase 2, the UI consumes the shape directly: TodChannel `channel={preset.params.coverage}` works because the on-disk shape matches what TodChannel expects.

---

## Cloud param field metadata (`cloudParamFields.js`)

```js
// Pulled from preset.schema.json $defs.cloudParams ranges. Single source
// of truth for slider min/max/step per cloud param. Not yet schema-derived
// (could be in a future pass).
export const CLOUD_PARAM_FIELDS = [
  { key: 'coverage',       label: 'Coverage',       min: 0,    max: 1,     step: 0.01,  group: 'shape' },
  { key: 'density',        label: 'Density',        min: 0,    max: 2,     step: 0.01,  group: 'shape' },
  { key: 'thickness',      label: 'Thickness (m)',  min: 0,    max: 18000, step: 50,    group: 'shape' },
  { key: 'baseAlt',        label: 'Base alt (m)',   min: 0,    max: 15000, step: 50,    group: 'shape' },
  { key: 'warpFreq',       label: 'Warp freq',      min: 0,    max: 0.01,  step: 0.0001,group: 'shape' },
  { key: 'warpAmp',        label: 'Warp amp (m)',   min: 0,    max: 2000,  step: 10,    group: 'shape' },
  { key: 'noiseSeed',      label: 'Noise seed',     min: 0,    max: 10000, step: 1,     group: 'shape' },
  { key: 'octaves',        label: 'Octaves',        min: 1,    max: 8,     step: 1,     group: 'shape' },
  { key: 'sunScatter',     label: 'Sun scatter',    min: 0,    max: 3,     step: 0.01,  group: 'lighting' },
  { key: 'ambientFloor',   label: 'Ambient floor',  min: 0,    max: 1,     step: 0.01,  group: 'lighting' },
  { key: 'edgeSilver',     label: 'Edge silver',    min: 0,    max: 2,     step: 0.01,  group: 'lighting' },
  { key: 'shadowStrength', label: 'Shadow str',     min: 0,    max: 2,     step: 0.01,  group: 'lighting' },
  { key: 'drift',          label: 'Drift',          min: 0,    max: 5,     step: 0.01,  group: 'motion' },
]
```

In the right rail, render the fields in this order — shape first, lighting middle, motion last. Group headers (a small uppercase label) optional but encouraged for readability.

---

## Store extensions (`useMeteorologistStore.js`)

Add:

```js
{
  // Lookup helpers
  presetById: (id) => get().presets.find(p => p.id === id),

  // Per-param mutation (autosave-debounced)
  setCloudParam: (presetId, paramKey, channelData) => {
    // Update in-memory `presets` array (replace the param's channel)
    // Mark dirty; schedule debounced PUT
  },

  // Debounced flush (~500ms idle). The actual write goes through
  // savePreset(); track per-preset dirty timers.
  savePreset: async (presetId) => {
    const p = get().presetById(presetId)
    const r = await fetch(`/api/meteorologist/presets/${presetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      set({ presetsError: err.error || `HTTP ${r.status}` })
      return false
    }
    return true
  },
}
```

**Critical:** the debounced save must flush before any dependent POST happens (memory `feedback_debounced_save_must_flush_before_dependent_post`). Phase 2 doesn't have a dependent POST (no /bake), so the debounce is fine on its own. **Note this for Phase 4** when CanaryScene reads the preset to render — that's not a POST but a fetch from the same backend; if there's a flush-race the operator could see a stale viewport. Phase 4's problem; just be aware the debounce window matters.

---

## Backend extension (`meteorologist/serve.js`)

Add:

| Method | Path | Action |
|---|---|---|
| `GET`  | `/presets/:id` | Read presets.json, return the matching preset object only |
| `PUT`  | `/presets/:id` | Validate body against `preset.schema.json` (single-preset), replace the matching entry in presets.json, write back |

`PUT` writes the full presets.json file. Use `writeIfChanged`-equivalent or a plain `writeFileSync` — there's no chained baker that cares about mtime here, so plain write is fine. The validator MUST run before write — if validation fails, return 400 with the ajv errors. **Don't write malformed data.**

Use the existing `validatePreset` import from `pipeline/validate.js`.

Pseudo:

```js
if (req.method === 'PUT' && match(path, /^\/presets\/(.+)$/)) {
  const id = match[1]
  const body = await readBody(req)
  const incoming = JSON.parse(body)
  if (incoming.id !== id) return jsonRes(res, 400, { error: 'id mismatch' })
  const v = validatePreset(incoming)
  if (!v.ok) return jsonRes(res, 400, { error: 'schema invalid', details: v.errors })
  const file = readJsonOrNull(PRESETS)
  const idx = file.presets.findIndex(p => p.id === id)
  if (idx < 0) return jsonRes(res, 404, { error: 'preset not found' })
  file.presets[idx] = incoming
  writeFileSync(PRESETS, JSON.stringify(file, null, 2))
  return jsonRes(res, 200, { ok: true })
}
```

`readBody(req)` is the same helper used in `arborist/serve.js`. Copy it in (it's tiny).

---

## Stash-isolate per file

```bash
git stash push -- src/meteorologist/Teacup.jsx src/meteorologist/SlotTabs.jsx src/meteorologist/cloudParamFields.js src/meteorologist/MeteorologistApp.jsx src/meteorologist/TeapotLibrary.jsx src/meteorologist/stores/useMeteorologistStore.js meteorologist/serve.js meteorologist/pipeline/schema/preset.schema.json meteorologist/pipeline/migrate-params-to-channels.js public/clouds/presets.json
```

(Plus `meteorologist/pipeline/validate.js` if you touched it.)

Verify `git status --short` shows only Meteorologist files staged.

Memory: `feedback_stash_isolate_per_file`.

---

## Verification

1. `npm run validate -- public/clouds/presets.json public/clouds/almanac.json` → `ok: 52 presets, 16 rules` (after migration committed).
2. `npm run dev` boots; all four servers (web/carto/arb/met) up.
3. Open `http://localhost:5173/meteorologist`.
4. Click a Teapot row → Teacup mounts. Header shows `← TEAPOT` + `METEOROLOGIST cloud authoring` + `CLOUD [<label> ▾]`.
5. Slot tabs render. Clicking GROUND toggles active highlight (viewport placeholder changes text or stays the same — fine either way).
6. DawnTimeline renders at top of right rail; scrub works (sun moves in DevTools state).
7. Below DawnTimeline: 13 cloud-param rows. Each has a slider showing the current value. Drag a slider → value updates locally; ~500ms after release, DevTools Network tab shows `PUT /api/meteorologist/presets/<id>` returning 200.
8. Reload the page. Slider reflects the persisted value.
9. Click the animate-arm toggle on one TodChannel → it switches to animated mode with the slot strip. Click an empty slot chip → keyframe attaches; the saved preset now has `{ animated: 'tod', values: { <slot>: { value: ... } } }`.
10. Click `← TEAPOT` → returns to library, no errors.
11. Click the CLOUD pulldown → switching to a different cloud loads its params.
12. `curl http://localhost:3335/presets/cumulus_humilis | jq .params.coverage` → returns the TodChannel-shaped object.

---

## Non-goals (DO NOT DO IN PHASE 2)

- **No 3D viewport / Canvas / CanaryScene.** Placeholder div only. Phase 4.
- **No Condition editor.** Conditions library click still console.logs. Phase 3.
- **No preview-context selector** ("Previewed under: <Condition>" — INTERFACE.md §5.1). That presupposes a viewport; defer to Phase 4.
- **No fixture management.** Phase 5.
- **No Almanac evaluator hot-mount.** Phase 5.
- **No CSS authoring beyond design tokens.** Use `var(--*)` references; if you need a new token, ASK.
- **No new top-level dependencies.** zustand + react already there.
- **No changes to almanac.json** or `almanac.schema.json`. Phase 3.
- **No changes to fixture schema** or `weather-payload.schema.json` / `directive.schema.json`. Phase 5.
- **No changes to TodChannel.jsx, animatedParam.js, DawnTimeline.jsx, or useCartographStore.** Import them; do not modify. If you find a bug in any of these, surface it; don't patch in-place.

---

## Surface anything not in this brief

If during execution you find yourself:
- adding a file not in "Files to CREATE",
- modifying a file not in "Files to MODIFY",
- writing a schema field not described above,
- inventing a different debounce / autosave mechanism,
- needing to patch a kit-shared file (TodChannel etc.) to make this work,

→ **disclose in commit body + status report.** Don't silently extend.

Memory: `feedback_baby_must_surface_scope_drift`.

---

## Memories to respect

- `feedback_debounced_save_must_flush_before_dependent_post` — even though Phase 2 has no dependent POST, design the autosave so a flush-before-next-action pattern is available. Phase 4 will need it.
- `feedback_heavy_render_sliders_need_draft` — TodChannel uses DraftRangeInput internally already; you don't need to add anything. Just be aware that direct slider→fetch on every onChange would starve pointermove. Trust the existing primitive.
- `project_kit_helpers_pattern` — Meteorologist owns clouds end-to-end. Don't reach into Stage's Sky & Light card; Phase 2 surfaces are all inside `src/meteorologist/`.
- `project_writeifchanged_touches_mtime` — `serve.js` doesn't need this (no downstream baker). Plain `writeFileSync` is fine for `presets.json`.
- `feedback_stash_isolate_per_file` — per above.
- `feedback_baby_must_surface_scope_drift` — per above.

---

## Phase 3 preview

Conditions library row click → Condition editor mounts. Same outer frame (header + slot tabs + viewport + right rail). Right rail body: Sky modulations card (darken, desat, halo, light dome, wind speed, wind dir — TodChannels) + Revert button + cloud-in-condition pulldown filtered by capabilities + per-cloud expression flags (weight, rain rate, snow rate, lightning rate — TodChannels) + `when` predicate range sliders.

Phase 4 = CanaryScene + viewport mounts.
Phase 5 = fixtures + Almanac evaluator hot-mount + cloud preset gallery.

---

## Commit + report

Single commit on the current branch (`cartograph-looks-pass-ab`). Message shape:

```
meteorologist: Phase 2 — Teacup workstage + cloud-param TodChannels

Opens a per-cloud authoring surface when a Teapot row is clicked. Right
rail mounts DawnTimeline + 13 cloud-shader-param <TodChannel>s; each
autosaves through PUT /api/meteorologist/presets/:id on a ~500ms idle
debounce. Slot tabs render but the viewport is a Phase 4 placeholder.

Schema relaxed to allow each cloud/fog param to be either a flat number
(legacy) or a TodChannel-shaped { values, animated?, transitionIn?,
transitionOut? } object. Existing presets.json migrated in-commit via
meteorologist/pipeline/migrate-params-to-channels.js.

Created:
- src/meteorologist/{Teacup,SlotTabs}.jsx
- src/meteorologist/cloudParamFields.js
- meteorologist/pipeline/migrate-params-to-channels.js

Modified:
- src/meteorologist/MeteorologistApp.jsx — Teacup mount routing
- src/meteorologist/TeapotLibrary.jsx — row click triggers Teacup
- src/meteorologist/stores/useMeteorologistStore.js — setCloudParam +
  debounced savePreset
- meteorologist/serve.js — GET/PUT /presets/:id endpoints
- meteorologist/pipeline/schema/preset.schema.json — animatableValue $def
- public/clouds/presets.json — params wrapped in { values: { value } }

Verification:
- Validator clean: ok: 52 presets, 16 rules
- Slider drag → PUT 200 after debounce
- Reload shows persisted value
- Animate-arm + slot fill round-trips cleanly

Co-Authored-By: <baby name> <…>
```

Report back to orchestrator (Jacob) with: commit hash, any scope-drift disclosures, any surprises, browser-side verification status (1-12 above), and a thumbs-up.
