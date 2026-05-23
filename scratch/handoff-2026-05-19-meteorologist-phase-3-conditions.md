# Meteorologist Phase 3 — Condition editor

Stand up the per-condition authoring surface. Click a Conditions library row → Condition editor opens. Right rail has TOD card on top, then a "When" card (range sliders for the rule's payload predicates), a "Directive" card (the published atmospheric output: sun + lightDome + wind + precip), and a "Clouds in this condition" card (the cloud blend with preset + weight per entry). Autosave per-rule through a new PUT endpoint. **No viewport yet** (Phase 4). **No per-cloud expression flags** (rain rate / lightning rate per cloud — Phase 3b after schema work). **No cloud capabilities filter** beyond `kind` (cloud vs fog).

---

## Read first, in this order

1. **`meteorologist/INTERFACE.md` §5 + §5.2 + §9** — the condition editor's outer frame and the editable+revertable conditions pattern.
2. **`src/meteorologist/Teacup.jsx`** — your direct template. Header + slot tabs + viewport placeholder + right rail are 90% the same; just the rail body changes.
3. **`meteorologist/pipeline/schema/almanac.schema.json`** — the existing rule + directive schema. **You consume this as-is in Phase 3.** No schema changes.
4. **`public/clouds/almanac.json`** — the 16 rules. Each rule has `id`, `label?`, `when`, `softness?`, `transitionMs?`, `directive`. Walk one fully (e.g. `thunderstorm`) before coding.
5. **`src/meteorologist/stores/useMeteorologistStore.js`** — the Phase 2 patterns for debounced autosave + flush-on-switch carry over. You'll add a parallel slice for conditions.
6. **`src/cartograph/CartographSkyLight.jsx`** — example of how Stage mounts color pickers + flat sliders. You'll use the same primitives (no TodChannel for Phase 3 directive fields — see §"Data model" below for why).

---

## Scope (Phase 3 only)

### Files to CREATE

```
src/meteorologist/
  ConditionEditor.jsx                       ← header / slot tabs / viewport placeholder / right rail
  conditionFields.js                        ← static metadata: when-block fields (label/min/max/step/unit) + directive-block fields
  WhenCard.jsx                              ← range slider per when-block field; multi-select chips for tod/season/precipKind
  DirectiveCard.jsx                         ← flat inputs for directive.sun/lightDome/wind/precip
  CloudsInConditionCard.jsx                 ← list of directive.clouds[]; preset dropdown + weight slider per row; add/remove
public/clouds/almanac.defaults.json         ← copy of almanac.json as it lands today; immutable, used for per-condition Revert
```

### Files to MODIFY

```
src/meteorologist/MeteorologistApp.jsx      ← when activeConditionId set in 'conditions' mode → render <ConditionEditor />
src/meteorologist/ConditionsLibrary.jsx     ← click row → setActiveCondition(id) (already wired Phase 1; just ensure it triggers editor mount)
src/meteorologist/stores/useMeteorologistStore.js  ← add: conditionById, setRuleField (debounced), saveAlmanac, revertConditionToDefault
meteorologist/serve.js                      ← add: GET /almanac/:id, PUT /almanac/:id, POST /almanac/:id/revert
```

### What the Condition editor renders

```
┌──────────────────────────────────────────────────────────────┬──────────────────────┐
│ ← CONDITIONS  METEOROLOGIST  weather authoring  CONDITION [Thunderstorm ▾]          │
├──────────────────────────────────────────────────────────────┼──────────────────────┤
│ [ CLOUD CHAMBER ● ] [ GROUND ]                               │ ▼ Time of Day        │
├──────────────────────────────────────────────────────────────┤   [DawnTimeline]     │
│                                                              ├──────────────────────┤
│                                                              │ ▼ When               │
│            Phase 4 will mount CanaryScene here.              │   tempC      [range] │
│            Phase 3 ships a dark placeholder.                 │   cloudCover [range] │
│                                                              │   humidity   [range] │
│                                                              │   windKph    [range] │
│                                                              │   precipMmHr [range] │
│                                                              │   stormDist  [range] │
│                                                              │   sunElev    [range] │
│                                                              │   tod        [chips] │
│                                                              │   season     [chips] │
│                                                              │   precipKind [chips] │
│                                                              │   softness   [slider]│
│                                                              │   transition [number]│
│                                                              ├──────────────────────┤
│                                                              │ ▼ Directive          │
│                                                              │   sun.intensity      │
│                                                              │   sun.tint    [color]│
│                                                              │   sun.azimuth        │
│                                                              │   sun.elevation      │
│                                                              │   lightDome.top      │
│                                                              │   lightDome.horizon  │
│                                                              │   lightDome.ambFloor │
│                                                              │   wind.scale         │
│                                                              │   wind.dir           │
│                                                              │   precip.kind [drop] │
│                                                              │   precip.intensity   │
│                                                              ├──────────────────────┤
│                                                              │ ▼ Clouds in cond.    │
│                                                              │   [Cu congestus ▾]   │
│                                                              │     weight  ──●─     │
│                                                              │     [Remove]         │
│                                                              │   [Cb capillatus ▾]  │
│                                                              │     weight  ●───     │
│                                                              │     [Remove]         │
│                                                              │   [+ Add cloud]      │
│                                                              ├──────────────────────┤
│                                                              │ [Revert to defaults] │
└──────────────────────────────────────────────────────────────┴──────────────────────┘
```

**Header** mirrors Teacup's exactly: `← CONDITIONS` back button (sets `activeConditionId = null`); `METEOROLOGIST` + `weather authoring` subtitle; `CONDITION` pulldown of all 16 conditions. Switching the pulldown sets a new active condition (with flush-on-switch — see Phase 2's pattern).

**Slot tabs** identical to Teacup — `CLOUD CHAMBER` + `GROUND`, visual only, viewport is a placeholder.

**Viewport** identical to Teacup — dark placeholder with `Phase 4: CanaryScene mounts here` text.

**Right rail cards** all use the `glass-panel rounded-xl p-3` + `section-heading mb-2` pattern established Phase 2.

---

## Data model — KEEP IT FLAT

Phase 3 reads/writes the existing `almanac.schema.json` shape with NO promotion to TodChannel-shaped values. Why:

1. **No viewport yet.** Phase 4 mounts CanaryScene; without it, the TOD-varying nature of a directive field can't be visually inspected. Premature.
2. **The data was authored flat.** All 16 rules in `almanac.json` use flat scalar / hex / array values for directive fields. Migrating now would force an immediate UI redesign decision (which fields *should* be TodChannel?) without the viewport to validate.
3. **Phase 3b will do the promotion later.** Once Phase 4 lands and we can SEE the temporal modulation in the canary, the right set of TodChannel-promoted fields will be obvious. Plan: directive.{sun.intensity, lightDome.ambientFloor, wind.scale, wind.dir, precip.intensity} promote to animatableValue; colors (sun.tint, lightDome.top, lightDome.horizon) stay flat for v1; precip.kind stays a dropdown.

For Phase 3: each directive field gets a **flat input** of the right kind:
- numeric → DraftRangeInput-style slider (or a basic `<input type=range>` wrapped to match the Stage pattern — see `src/stage/StageApp.jsx`'s `NumInput`)
- hex color → `<input type=color>` or the kit's color picker if one exists; otherwise `<input type=text>` with the hex pattern validated client-side
- enum (precip.kind) → `<select>`
- array (tod, season, precipKind in the when-block) → multi-select chip strip

**IMPORTANT note in INTERFACE.md §5.2.** That doc shows the right rail using TodChannels for sky modulations. That commitment lands in Phase 3b. Update INTERFACE.md as part of THIS commit to clarify the phasing:

```markdown
### 5.2 Condition editor right rail (Conditions view)

**Phase 3 ships these as flat inputs** (slider / color / dropdown). **Phase 3b promotes the numeric directive fields to TodChannels** (animatableValue shape) once Phase 4's viewport lets us validate the temporal authoring visually.
```

(Insert that paragraph at the top of §5.2. Don't rewrite the rest of the section.)

---

## Existing schema — what's there to author

From `almanac.schema.json`, each rule has:

```jsonc
{
  "id": "thunderstorm",
  "label": "Thunderstorm" (optional),
  "when": {
    "tempC": [min, max],
    "cloudCover": [min, max],
    "humidity": [min, max],
    "windKph": [min, max],
    "windDirDeg": [min, max],
    "precipMmHr": [min, max],
    "stormDistanceKm": [min, max],
    "sunElevationDeg": [min, max],
    "sunAzimuthDeg": [min, max],
    "tod": ["dawn", ...],         // multi-select from NAMED_TOD_SLOTS ids
    "season": ["spring", ...],    // multi-select from {"spring","summer","autumn","winter"}
    "precipKind": ["rain", null]  // multi-select from {"rain","snow","sleet","hail",null}
  },
  "softness": 0.05,                // number 0-1
  "transitionMs": 60000,            // integer 0-600000
  "directive": {
    "clouds": [ { "preset": "<id>", "weight": 0-1 }, ... up to 3 ],
    "sun":       { "azimuth": 0-360, "elevation": -90..90, "intensity": 0-4, "tint": "#RRGGBB" },
    "lightDome": { "top": "#hex", "horizon": "#hex", "ambientFloor": 0-1 },
    "wind":      { "scale": 0-5, "dir": 0-360 },
    "precip":    { "kind": "rain"|"snow"|"sleet"|"hail"|null, "intensity": 0-1 }
  }
}
```

The fallback block has the same `directive` shape (no `when`, no `id`).

### `conditionFields.js` static metadata

```js
export const WHEN_FIELDS = [
  { key: 'tempC',           label: 'Temp (°C)',          kind: 'range', min: -30,  max: 50,    step: 1 },
  { key: 'cloudCover',      label: 'Cloud cover',        kind: 'range', min: 0,    max: 1,     step: 0.05 },
  { key: 'humidity',        label: 'Humidity',           kind: 'range', min: 0,    max: 1,     step: 0.05 },
  { key: 'windKph',         label: 'Wind (kph)',         kind: 'range', min: 0,    max: 120,   step: 1 },
  { key: 'windDirDeg',      label: 'Wind dir (°)',       kind: 'range', min: 0,    max: 360,   step: 5 },
  { key: 'precipMmHr',      label: 'Precip (mm/hr)',     kind: 'range', min: 0,    max: 50,    step: 0.5 },
  { key: 'stormDistanceKm', label: 'Storm dist (km)',    kind: 'range', min: 0,    max: 200,   step: 1 },
  { key: 'sunElevationDeg', label: 'Sun elev (°)',       kind: 'range', min: -90,  max: 90,    step: 1 },
  { key: 'sunAzimuthDeg',   label: 'Sun azimuth (°)',    kind: 'range', min: 0,    max: 360,   step: 5 },
  { key: 'tod',             label: 'TOD slots',          kind: 'chips', options: ['dawn','sunrise','noon','golden','sunset','dusk','night'] },
  { key: 'season',          label: 'Seasons',            kind: 'chips', options: ['spring','summer','autumn','winter'] },
  { key: 'precipKind',      label: 'Precip kinds',       kind: 'chips', options: ['rain','snow','sleet','hail',null], nullLabel: '(none)' },
]

export const DIRECTIVE_FIELDS = [
  // sun
  { path: 'sun.intensity',       label: 'Sun intensity',    kind: 'slider', min: 0,    max: 4,   step: 0.05 },
  { path: 'sun.tint',            label: 'Sun tint',         kind: 'color' },
  { path: 'sun.azimuth',         label: 'Sun azimuth (°)',  kind: 'slider', min: 0,    max: 360, step: 1 },
  { path: 'sun.elevation',       label: 'Sun elevation (°)',kind: 'slider', min: -90,  max: 90,  step: 1 },
  // lightDome
  { path: 'lightDome.top',          label: 'Dome top',           kind: 'color' },
  { path: 'lightDome.horizon',      label: 'Dome horizon',       kind: 'color' },
  { path: 'lightDome.ambientFloor', label: 'Ambient floor',      kind: 'slider', min: 0, max: 1, step: 0.01 },
  // wind
  { path: 'wind.scale',          label: 'Wind scale',       kind: 'slider', min: 0, max: 5, step: 0.05 },
  { path: 'wind.dir',            label: 'Wind dir (°)',     kind: 'slider', min: 0, max: 360, step: 5 },
  // precip
  { path: 'precip.kind',         label: 'Precip kind',      kind: 'select', options: ['rain','snow','sleet','hail',null], nullLabel: '(none)' },
  { path: 'precip.intensity',    label: 'Precip intensity', kind: 'slider', min: 0, max: 1, step: 0.01 },
]
```

`path` uses dot-notation for nested directive access; the store's `setRuleField(ruleId, path, value)` walks the path.

---

## Store extensions (`useMeteorologistStore.js`)

Add a slice parallel to Phase 2's preset slice:

```js
{
  // Lookup
  conditionById: (id) => get().conditions.find(c => c.id === id),

  // Per-rule mutation (debounced autosave to /almanac, file-level write)
  setRuleField: (ruleId, path, value) => {
    // Update get().conditions[i] for matching id, walking path
    // Mark dirty; schedule debounced PUT (or single full-file save — see below)
  },

  // Debounced flush
  saveAlmanac: async () => {
    const rules = get().conditions
    const fullFile = { ...get()._almanacRaw, rules }
    // ... PUT to /api/meteorologist/almanac (whole file)
  },

  // Revert per-rule
  revertConditionToDefault: async (ruleId) => {
    const r = await fetch(`/api/meteorologist/almanac/${ruleId}/revert`, { method: 'POST' })
    if (r.ok) await get().loadConditions()
  },

  // Add/remove cloud entry in a rule's directive.clouds[]
  addCloudToCondition: (ruleId, presetId) => { ... },
  removeCloudFromCondition: (ruleId, idx) => { ... },
  setCloudWeight: (ruleId, idx, weight) => { ... },
}
```

**Debounce semantics:** same ~500ms idle as Phase 2. Track per-rule timers; `_flushPendingSaves()` (existing) covers `setActiveCondition` switches.

**One key tactical choice:** since almanac.json is one file with a rules array (not a per-rule file), PUT writes the whole almanac at once. The backend mutates the indexed rule and rewrites; the UI sends only the changed rule (server merges). Pick one and document in serve.js comments.

Cleanest: send the changed rule alone (`PUT /almanac/:id` with the rule body); server reads almanac.json, replaces `rules[idx]`, writes. Same shape as Phase 2's `PUT /presets/:id`.

---

## Backend extensions (`meteorologist/serve.js`)

| Method | Path | Action |
|---|---|---|
| `GET`  | `/almanac/:id` | Read almanac.json, return matching rule (404 if not found) |
| `PUT`  | `/almanac/:id` | Validate the rule body against `almanac.schema.json` (just the rule sub-schema — see below), replace `rules[idx]`, write |
| `POST` | `/almanac/:id/revert` | Read almanac.defaults.json's matching rule, replace in almanac.json, write |

**Validating a single rule:** the existing `validateAlmanac` export validates the whole file. Add a `validateRule` export to `pipeline/validate.js` that compiles `almanac.schema.json#/$defs/rule` and use it from the PUT handler. (This IS a Phase 3 modification of `pipeline/validate.js` — small and clean.)

**Cross-schema check:** when the PUT handler writes, also run `validateLibrary({presetsFile, almanac})` to check the modified rule's `directive.clouds[].preset` references still exist + are enabled. Reject 400 if not.

---

## Ship-defaults file

Phase 3 introduces `public/clouds/almanac.defaults.json` — an immutable copy of `almanac.json` as it lands TODAY. Commit it identical to the current `almanac.json`. The Revert endpoint reads this file (not git) to restore.

```bash
cp public/clouds/almanac.json public/clouds/almanac.defaults.json
git add public/clouds/almanac.defaults.json
```

This decouples Revert from git history. The defaults file lives forever; if we want to change a default in the future, that's an explicit edit + commit, not an artifact of operator editing.

---

## Cloud pulldown in "Clouds in this condition" card

The "[Cu congestus ▾]" pulldown when adding/swapping a cloud entry. **Phase 3 filter: kind only.** Show all cloud presets where `kind === 'cloud' || kind === 'fog'`. Hide rain/snow/lightning stubs (`kind === 'rain' | 'snow' | 'lightning'`). Sort alphabetically by label.

**Phase 3b** will add capability-based filtering (precipKinds, electrified) once those fields are added to `preset.schema.json` and the Teacup gains UI to author them.

Cap at 3 cloud entries per `directive.clouds` (schema `maxItems: 3`). When 3 are present, hide the `[+ Add cloud]` button.

---

## Stash-isolate per file

```bash
git stash push -- \
  src/meteorologist/ConditionEditor.jsx \
  src/meteorologist/conditionFields.js \
  src/meteorologist/WhenCard.jsx \
  src/meteorologist/DirectiveCard.jsx \
  src/meteorologist/CloudsInConditionCard.jsx \
  src/meteorologist/MeteorologistApp.jsx \
  src/meteorologist/ConditionsLibrary.jsx \
  src/meteorologist/stores/useMeteorologistStore.js \
  meteorologist/serve.js \
  meteorologist/pipeline/validate.js \
  meteorologist/INTERFACE.md \
  public/clouds/almanac.defaults.json
```

Verify `git status --short` shows only Meteorologist files staged.

Memory: `feedback_stash_isolate_per_file`.

---

## Verification

1. `npm run validate -- public/clouds/presets.json public/clouds/almanac.json` → `ok: 52 presets, 16 rules` (no schema changes, validator should still pass).
2. `npm run validate -- public/clouds/presets.json public/clouds/almanac.defaults.json` → same `ok: 52 presets, 16 rules`. (The defaults file IS valid; it's just a copy.)
3. `npm run dev` → 4 servers, met on 3335.
4. `http://localhost:5173/meteorologist` → switch to CONDITIONS mode → click `Thunderstorm` → editor opens.
5. Header shows `← CONDITIONS` + `METEOROLOGIST weather authoring` + `CONDITION [Thunderstorm ▾]`.
6. CONDITION pulldown switches between conditions; in-flight saves flush.
7. WhenCard renders range sliders for all numeric when-fields, chip multi-selects for tod/season/precipKind.
8. DirectiveCard renders sliders for numeric fields, color inputs for hex fields, dropdown for precip.kind.
9. CloudsInConditionCard renders one row per `directive.clouds[]` entry with preset dropdown + weight slider + Remove.
10. `+ Add cloud` works when count < 3; hidden at 3.
11. Drag any slider → ~500ms later `PUT /api/meteorologist/almanac/<id>` returns 200 in Network panel.
12. Reload page → all edits persist.
13. Click `Revert to defaults` → that condition's values restore to almanac.defaults.json values (other conditions untouched).
14. `curl http://localhost:3335/almanac/thunderstorm | jq .when.cloudCover` → matches what the UI shows.
15. Bad PUT (e.g., `directive.clouds` length > 3) returns 400 with schema errors.

---

## Non-goals (DO NOT DO IN PHASE 3)

- **No TodChannel promotion of directive fields.** Phase 3b after Phase 4.
- **No per-cloud-in-condition expression flags** (rainRate, snowRate, lightningRate per cloud). Phase 3b.
- **No cloud capabilities** (`precipKinds`, `electrified` on preset.schema). Phase 3b.
- **No viewport / Canvas / CanaryScene.** Phase 4.
- **No fallback editor.** The fallback block has the same directive shape; for Phase 3 it stays as-authored in the JSON file. Phase 5 (or whenever).
- **No fixture management.** Phase 5.
- **No Almanac evaluator hot-mount.** Phase 5.
- **No CSS authoring beyond what `glass-panel`/`section-heading`/Tailwind utilities give.**
- **No edits to TodChannel.jsx, animatedParam.js, DawnTimeline.jsx, useCartographStore, or any Phase 2 file** beyond MeteorologistApp.jsx + ConditionsLibrary.jsx + stores. If you find a bug in any of these, surface it; don't patch.

---

## Surface anything not in this brief

Per `feedback_baby_must_surface_scope_drift`: if you add a file or modify a file not in the lists above, disclose in commit body + status. The orchestrator validates; silent additions are the problem.

Likely small drifts that ARE OK (just disclose):
- A `<RangeInput>` or `<ChipSelect>` helper component if you find yourself repeating range/chip markup across multiple cards.
- Reusing Phase 2's `_flushPendingSaves` primitive for condition switches (you should, in fact).

Likely drifts that are NOT OK:
- Schema extensions to preset.schema.json or almanac.schema.json (Phase 3b territory).
- New TodChannel mounts for directive fields (Phase 3b territory).
- Touching `public/clouds/almanac.json` data (the editor writes to it; don't pre-edit).

---

## Memories to respect

- `feedback_kit_helper_css_import_index_not_tokens` (2026-05-19) — `src/meteorologist/main.jsx` is already importing `index.css` correctly after the Phase 2 chrome fixup. Use `glass-panel rounded-xl p-3` + `section-heading mb-2` for your new cards.
- `feedback_debounced_save_must_flush_before_dependent_post` — flush-on-switch is established Phase 2 primitive; reuse via `_flushPendingSaves`.
- `feedback_heavy_render_sliders_need_draft` — if you build a `<RangeInput>` helper, use a local draft state + idle commit (Phase 2 leveraged TodChannel's internal `DraftRangeInput`; for flat inputs you'll need similar). Direct slider→fetch on every onChange would starve pointermove.
- `project_kit_helpers_pattern` — Meteorologist owns weather end-to-end.
- `feedback_stash_isolate_per_file` / `feedback_baby_must_surface_scope_drift`.

---

## Phase 4 preview

CanaryScene + viewport mounts. Flat ground + one hero tree (from Arborist's active-Look bake) + sky imported from active Cartograph Look's `scene.json` via `useSceneJson(activeLookId)` + the active cloud (Teapot) or condition (Conditions) rendered via the v3 `<Atmosphere />` shader. Two slot framings (Cloud Chamber close, Ground mid-distance).

Phase 3b adds: TodChannel-promotion of directive numeric fields, cloud capabilities (precipKinds, electrified) on preset.schema, per-cloud-in-condition expression flags. Likely lands AFTER Phase 4 so the viewport validates each addition.

Phase 5 = fixtures + Almanac evaluator hot-mount + fallback editor + cloud preset gallery.

---

## Commit + report

Single commit on `cartograph-looks-pass-ab`. Message shape:

```
meteorologist: Phase 3 — Condition editor

Opens a per-condition authoring surface when a Conditions row is clicked.
Right rail mounts three cards under the TOD card: When (range sliders +
chip multi-selects for the rule's payload predicates), Directive (flat
inputs for sun/lightDome/wind/precip), and Clouds-in-condition (cloud
blend with preset dropdown + weight slider, capped at 3 entries). Each
autosaves through PUT /api/meteorologist/almanac/:id on a ~500ms idle
debounce. Per-condition Revert restores from almanac.defaults.json.

Created:
- src/meteorologist/{ConditionEditor,WhenCard,DirectiveCard,CloudsInConditionCard}.jsx
- src/meteorologist/conditionFields.js
- public/clouds/almanac.defaults.json (immutable, used by Revert)

Modified:
- src/meteorologist/MeteorologistApp.jsx — ConditionEditor mount routing
- src/meteorologist/ConditionsLibrary.jsx — row click triggers editor
- src/meteorologist/stores/useMeteorologistStore.js — condition slice
- meteorologist/serve.js — GET/PUT /almanac/:id, POST /almanac/:id/revert
- meteorologist/pipeline/validate.js — validateRule export for per-rule PUT
- meteorologist/INTERFACE.md — §5.2 phasing note (flat in P3, TodChannel in P3b)

Verification:
- Validator clean: ok: 52 presets, 16 rules
- Slider drag → PUT 200 after debounce
- Revert restores per-condition without affecting others
- Bad PUT (cloud cap exceeded, etc.) → 400 with schema details

Co-Authored-By: <baby name> <…>
```

Report back to Jacob with: commit hash, scope-drift disclosures, surprises, browser-side verification status (1-15 above), and a thumbs-up.
