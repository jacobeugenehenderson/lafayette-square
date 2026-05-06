# Stage migration — cleanup commit checklist

The Meteorologist landing affects Stage in three small ways: one new TodChannel row, one new launch button, one mode swap. The rest of the migration is the cleanup commit that retires the legacy cloud sandbox spike code.

**No file moves out of Stage. No card splits. No renames of `CartographSkyLight.jsx` / `CartographPost.jsx` / `CartographSurfaces.jsx`.** Everything that's currently in Stage stays in Stage, structurally unchanged.

---

## Add to Stage

### 1. New TodChannel row: Clouds

In `src/cartograph/CartographSkyLight.jsx`, add a new row alongside Sky gradient / Mist / Halo / Neon / Ambient / Hemi / Sun / Moon / Constellations:

```jsx
<StoreChannel name="clouds" label="Clouds"
  fields={CLOUDS_FIELDS} flatDefaults={CLOUDS_FLAT_DEFAULTS} />
```

`CLOUDS_FIELDS` and `CLOUDS_FLAT_DEFAULTS` go in `src/cartograph/skyLightChannels.js`. Field shape is a single dropdown-typed field whose options are the Teapot preset ids (read from `public/clouds/presets.json` at app load). New `ChannelPreset` field type added to `TodChannel.jsx` — same shape as `ChannelColor` / `ChannelSlider` / `ChannelToggle`, just renders a select.

Per-Look serialization key in `design.json`: `clouds`. Migration helper `migrateCloudsChannel` added to `useCartographStore.js`; older Looks gain a default preset id (`fair_cumulus` or `cumulus_humilis`) on first load.

### 2. "Launch meteorologist" button

Inside the Clouds row's expanded drawer, a single button:

```
[ launch meteorologist ↗ ]
```

Click handler:
- Sets `useCartographStore.scene = 'meteorologist'` (alias of the existing toy scene; `'toy'` is preserved as a synonym for the developer's toolbar toggle).
- Sets `useCartographStore.rightPanelMode = 'meteorologist'` (new piece of UI state).
- Camera framing: same fixed oblique that the toy scene uses today (lines ~213–216 of `CartographApp.jsx`).

### 3. Right-panel takeover

When `rightPanelMode === 'meteorologist'`, the existing right panel content is replaced by:

- **TeapotLibrary** card (`src/cartograph/TeapotLibrary.jsx`)
- **AlmanacEditor** card (`src/cartograph/AlmanacEditor.jsx`)
- **FakeWeatherPanel** card (`src/cartograph/FakeWeatherPanel.jsx`)
- Top-bar **exit** button → restores `rightPanelMode = 'normal'` and `scene = 'lafayette-square'` (or whatever the previous scene was).

These three card files are new but live in `src/cartograph/` — no `src/meteorologist/` directory.

---

## Cleanup commit (atomic, after the rest of v1 is wired)

### Delete

```
src/components/CloudDome.jsx
src/components/CloudDomeV2.jsx
src/components/CloudDomeV3.jsx
src/components/SpriteClouds.jsx
src/components/CloudsActive.jsx
src/sandbox/CloudsSandbox.jsx
clouds-sandbox.html
HANDOFF-clouds-day2.md
HANDOFF-clouds-day3-clouddome-v2.md
```

### Replace `<CloudDome />` mounts with `<Atmosphere />`

```
src/components/Scene.jsx:952
src/cartograph/CartographApp.jsx:687  (and the commented SpriteClouds at 695 — remove the comment)
src/stage/StageApp.jsx:23             (verify mount line via grep at commit time)
src/preview/PreviewApp.jsx:551        (behind layers.clouds — keep the layer toggle)
```

Each becomes:

```jsx
{layers.clouds && <R3FErrorBoundary name="Atmosphere"><Atmosphere /></R3FErrorBoundary>}
```

### Verify untouched

These do not change:

- `src/cartograph/CartographSkyLight.jsx` — gains the Clouds row, otherwise identical
- `src/cartograph/CartographPost.jsx` — Camera/Shadow/Soften unchanged
- `src/cartograph/CartographSurfaces.jsx` — unchanged (no Neon migration; Neon stays where it is)
- `src/cartograph/SkyGradientGrid.jsx` / `TodChannel.jsx` / `skyGrid.js` / `animatedParam.js` — unchanged in location and behavior; `TodChannel.jsx` gains a `ChannelPreset` field type
- `src/stage/StageSky.jsx` — gains an `atmosphere-compose.js` import for Almanac modulation; otherwise structurally same
- `src/cartograph/stores/useCartographStore.js` — gains `clouds` channel state + actions, `rightPanelMode` state, `migrateCloudsChannel` helper; existing slices unchanged
- `src/components/WeatherPoller.jsx` — untouched
- `src/hooks/useSkyState.js` — extends with the additional Almanac fields (humidity, pressureMb, precipMmHr, etc.); existing fields stay

### Per-Look `design.json` impact

- New top-level key `clouds` (TodChannel of the same shape as the others).
- New optional top-level key `atmosphereOverrides` — present only when a Look explicitly overrides a directive value. Sub-keys: `sun`, `lightDome`. (No override for cloud-math drivers.)
- Existing keys preserved exactly.

---

## Sequencing

The cleanup commit lands **last** — after `<Atmosphere />` is wired and rendering correctly in all four mount sites and after the authoring UI is functional. Until then:

- The legacy `CloudDome` continues rendering everywhere it's mounted today.
- Stage's existing Sky and Light card works unchanged.
- Authoring of the Teapot + Almanac happens in Meteorologist mode against the toy.

Nothing is broken in any window during construction. The atomic cleanup commit swaps mounts + deletes legacy files + flips the publish-loop forward.

---

## Cross-references

- [`./SPEC.md`](./SPEC.md) — full work order
- [`./CANON.md`](./CANON.md) — Teapot inclusion principles
