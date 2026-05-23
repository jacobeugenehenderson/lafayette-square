# Phase Seed — Teapot library: reference photos + morphology archetype param seeding

**From:** Meteorologist orchestrator
**To:** baby (fresh agent)
**Date:** 2026-05-20

---

The Teapot has 52 presets but only `cumulus_humilis` was tuned during Phase 4b.1 — the other 51 carry placeholder values that render as the same whispy ghost. With Phase 4b.2 shipped (slider drag → viewport response in real time), the bottleneck is now the library itself: every preset needs a meaningful starting morphology AND a reference photo showing the operator what they're aiming at.

Jacob has already collected the photos. They live in `public/clouds/photos/<preset-id>.jpg` — 52 files, filenames matching preset ids exactly. A `SOURCES.json` sibling tracks provenance.

You're doing two things in one commit: surface those photos in the UI, and run a morphology-archetype seeding pass over the 52 presets.

## Read first

1. `meteorologist/BACKLOG.md` — Phase Seed is the new arc; doesn't have a BACKLOG entry yet (you'll add one)
2. `public/clouds/photos/` — the 52 photo files + SOURCES.json
3. `public/clouds/presets.json` — the 52 preset records (each has `params: { coverage: { values: { value: N } }, ... }` per Phase 2 channel migration)
4. `meteorologist/pipeline/schema/preset.schema.json` — for the optional schema field addition
5. `src/meteorologist/TeapotLibrary.jsx` — where preset thumbnails render today
6. `src/meteorologist/Teacup.jsx` — where the per-cloud workstage shows the right rail; ref photo lands somewhere prominent here
7. `src/meteorologist/stores/useMeteorologistStore.js` — `_patchParam` is the synchronous mutator the seeding script's runtime equivalent (you're writing files, not calling actions)

## Part 1 — Photo surfacing (UI)

### Schema (light)

Add an optional `refImage` field to `preset.schema.json`. Path convention: `photos/<id>.jpg`. Validator should accept missing values (most presets have photos; if any are missing, no crash). Or: skip the schema field entirely and use the **convention** that `public/clouds/photos/<id>.jpg` is the photo. The UI tries `fetch(BASE_URL + 'clouds/photos/' + id + '.jpg')` and falls back to a grey placeholder on 404. Convention-over-config is simpler — go this way unless you find a reason not to.

### TeapotLibrary thumbnail

Each row in the flat preset list gets a small thumbnail on the left. ~80×40 — narrow strip is enough to read morphology. `loading="lazy"` on the `<img>` so all 52 don't fetch at once. Fall back to a grey rectangle if the photo 404s.

### Teacup workstage ref photo

At the top of the right rail (or wherever's most prominent without crowding the slider rows), show the full reference photo, ~300×150 or whatever fits the rail width. Above the sliders, so the operator's tuning against a visible target. Caption with preset label.

### Performance note

Photos are full-res JPGs (~330KB each); 52 × 330KB = ~17MB total. **Lazy-load religiously.** TeapotLibrary uses `loading="lazy"` so only visible thumbnails fetch. Teacup loads ONLY the active preset's photo. A future resize pass to `public/clouds/photos-thumb/<id>.webp` at 300×150 (~15KB each) is a clean follow-up but not in scope here — the lazy-load shape gets us 90% of the win.

## Part 2 — Morphology archetype param seeding

Write `meteorologist/pipeline/seed-presets.js` — a one-shot, re-runnable script that maps each preset's `kind`/`tags`/WMO genus to a morphology archetype, then writes the archetype's params over the preset's `params` field. Preserves any preset with `authored: true` flag set (so future hand-tuned presets don't get overwritten on re-run).

### Archetype table

Roughly:

```js
const ARCHETYPES = {
  clear: {
    coverage: 0.0, density: 0.0, thickness: 0, baseAlt: 1500,
    warpFreq: 0.001, warpAmp: 0, noiseSeed: 0, octaves: 1,
    sunScatter: 1.0, ambientFloor: 0.30, edgeSilver: 0.5, shadowStrength: 0.0,
  },
  cumulus_fair: {                     // cumulus_humilis, cumulus_fractus
    coverage: 0.32, density: 0.85, thickness: 500, baseAlt: 1200,
    warpFreq: 0.001, warpAmp: 280, noiseSeed: 91, octaves: 4,
    sunScatter: 1.30, ambientFloor: 0.32, edgeSilver: 1.05, shadowStrength: 0.65,
  },
  cumulus_building: {                 // cumulus_mediocris, cumulus_congestus
    coverage: 0.45, density: 1.10, thickness: 1500, baseAlt: 1000,
    warpFreq: 0.0008, warpAmp: 350, noiseSeed: 137, octaves: 5,
    sunScatter: 1.40, ambientFloor: 0.28, edgeSilver: 1.20, shadowStrength: 0.85,
  },
  cumulonimbus: {                     // cumulonimbus_calvus, capillatus, mammatus
    coverage: 0.65, density: 1.50, thickness: 8000, baseAlt: 1000,
    warpFreq: 0.0005, warpAmp: 600, noiseSeed: 211, octaves: 6,
    sunScatter: 1.50, ambientFloor: 0.18, edgeSilver: 1.40, shadowStrength: 1.20,
  },
  stratus_low: {                       // stratus_*, fog_ground, fog_valley
    coverage: 0.85, density: 0.50, thickness: 200, baseAlt: 200,
    warpFreq: 0.0002, warpAmp: 80, noiseSeed: 23, octaves: 2,
    sunScatter: 0.80, ambientFloor: 0.45, edgeSilver: 0.6, shadowStrength: 0.30,
  },
  stratocumulus: {
    coverage: 0.70, density: 0.80, thickness: 600, baseAlt: 800,
    warpFreq: 0.0006, warpAmp: 220, noiseSeed: 53, octaves: 4,
    sunScatter: 1.10, ambientFloor: 0.35, edgeSilver: 0.95, shadowStrength: 0.55,
  },
  altocumulus: {
    coverage: 0.55, density: 0.65, thickness: 400, baseAlt: 3500,
    warpFreq: 0.0009, warpAmp: 180, noiseSeed: 73, octaves: 4,
    sunScatter: 1.20, ambientFloor: 0.33, edgeSilver: 1.00, shadowStrength: 0.50,
  },
  altostratus: {
    coverage: 0.80, density: 0.55, thickness: 1500, baseAlt: 3000,
    warpFreq: 0.0003, warpAmp: 120, noiseSeed: 47, octaves: 3,
    sunScatter: 0.95, ambientFloor: 0.38, edgeSilver: 0.75, shadowStrength: 0.40,
  },
  nimbostratus: {
    coverage: 0.95, density: 1.20, thickness: 3500, baseAlt: 600,
    warpFreq: 0.0003, warpAmp: 150, noiseSeed: 67, octaves: 4,
    sunScatter: 0.70, ambientFloor: 0.22, edgeSilver: 0.55, shadowStrength: 1.00,
  },
  cirrus: {                            // cirrus_*, cirrostratus_*
    coverage: 0.30, density: 0.20, thickness: 250, baseAlt: 8000,
    warpFreq: 0.0015, warpAmp: 320, noiseSeed: 109, octaves: 5,
    sunScatter: 1.60, ambientFloor: 0.50, edgeSilver: 1.30, shadowStrength: 0.15,
  },
  cirrocumulus: {
    coverage: 0.45, density: 0.30, thickness: 200, baseAlt: 7000,
    warpFreq: 0.0020, warpAmp: 150, noiseSeed: 131, octaves: 5,
    sunScatter: 1.55, ambientFloor: 0.48, edgeSilver: 1.25, shadowStrength: 0.20,
  },
  haze: {                              // haze_summer, haze_smoke
    coverage: 0.40, density: 0.15, thickness: 800, baseAlt: 100,
    warpFreq: 0.0002, warpAmp: 40, noiseSeed: 17, octaves: 2,
    sunScatter: 0.90, ambientFloor: 0.40, edgeSilver: 0.4, shadowStrength: 0.10,
  },
  precip_light: {                      // rain_light, snow_calm
    coverage: 0.90, density: 0.85, thickness: 2500, baseAlt: 600,
    warpFreq: 0.0004, warpAmp: 200, noiseSeed: 83, octaves: 4,
    sunScatter: 0.85, ambientFloor: 0.30, edgeSilver: 0.65, shadowStrength: 0.70,
  },
  precip_heavy: {                      // rain_heavy, rain_squall, snow_heavy, snow_blizzard
    coverage: 0.98, density: 1.30, thickness: 4500, baseAlt: 500,
    warpFreq: 0.0004, warpAmp: 280, noiseSeed: 157, octaves: 5,
    sunScatter: 0.60, ambientFloor: 0.20, edgeSilver: 0.50, shadowStrength: 1.15,
  },
  lightning: {                         // lightning_*  (same morphology as cumulonimbus; lightning is a directive effect)
    coverage: 0.70, density: 1.55, thickness: 7000, baseAlt: 900,
    warpFreq: 0.0005, warpAmp: 550, noiseSeed: 227, octaves: 6,
    sunScatter: 1.45, ambientFloor: 0.18, edgeSilver: 1.40, shadowStrength: 1.20,
  },
}
```

**Preset → archetype mapping** lives in a second table inside the same script:

```js
const PRESET_TO_ARCHETYPE = {
  clear_sky: 'clear',
  cumulus_humilis: 'cumulus_fair', cumulus_fractus: 'cumulus_fair',
  cumulus_mediocris: 'cumulus_building', cumulus_congestus: 'cumulus_building',
  cumulonimbus_calvus: 'cumulonimbus', cumulonimbus_capillatus: 'cumulonimbus', cumulonimbus_mammatus: 'cumulonimbus',
  stratus_nebulosus: 'stratus_low', stratus_opacus: 'stratus_low', stratus_fractus: 'stratus_low',
  fog_ground: 'stratus_low', fog_valley: 'stratus_low',
  // ... etc for all 52
}
```

(Fill the full 52 mapping; the photos folder listing gives you the canonical id set. Run `ls public/clouds/photos/*.jpg` to enumerate.)

### Variant differentiation (optional but valuable)

Within an archetype, variants should differ. Two paths:

- **Per-preset salt:** add a deterministic small offset to `noiseSeed` (`hash(presetId) % 250`) and a tiny offset to `coverage` / `warpAmp` so `cirrus_fibratus` and `cirrus_uncinus` don't render identically.
- **Sub-archetype rows:** add `cirrus_wispy` (uncinus, fibratus) vs `cirrus_dense` (spissatus) vs `cirrus_castellated` (castellanus) as separate archetype rows. More work but more visually faithful.

Start with per-preset salt (option 1) — the hand-tune pass (future Phase Seed.2) will refine. Mention which approach you took in the commit body.

### Script shape

```js
// meteorologist/pipeline/seed-presets.js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PRESETS = path.resolve(__dirname, '../../public/clouds/presets.json')

const ARCHETYPES = { /* table above */ }
const PRESET_TO_ARCHETYPE = { /* mapping above */ }

function paramChannel(value) {
  // Flat (non-animated) channel shape: { values: { value: N } }
  return { values: { value } }
}

function seedPreset(preset) {
  if (preset.authored) return preset                      // hand-tuned; skip
  const archetypeId = PRESET_TO_ARCHETYPE[preset.id]
  if (!archetypeId) { console.warn(`no archetype for ${preset.id}`); return preset }
  const arch = ARCHETYPES[archetypeId]
  // Per-preset salt
  const salt = [...preset.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 0)
  const params = { ...arch, noiseSeed: arch.noiseSeed + (Math.abs(salt) % 250) }
  preset.params = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, paramChannel(v)])
  )
  return preset
}

const doc = JSON.parse(fs.readFileSync(PRESETS, 'utf8'))
doc.presets = doc.presets.map(seedPreset)
fs.writeFileSync(PRESETS, JSON.stringify(doc, null, 2))
console.log(`seeded ${doc.presets.length} presets`)
```

Run via `node meteorologist/pipeline/seed-presets.js`. Idempotent. Operator-tuned presets (those marked `authored: true`) skip silently.

### `authored: true` flag

Today no preset has this. After Phase 4b.1's hand-tune of `cumulus_humilis`, that preset is genuinely operator-tuned — set `authored: true` on it in the seeding script (a small allowlist inside the script: `const HAND_TUNED = new Set(['cumulus_humilis'])`). Future tune passes can extend this.

## Part 3 — BACKLOG + NOTES housekeeping

Add an entry in `meteorologist/BACKLOG.md`:

```markdown
### ✅ Phase Seed — Teapot library photo + morphology archetype seeding (shipped 2026-05-20)

Reference photos surfaced in TeapotLibrary thumbnails + Teacup workstage. Morphology archetype seeding script populated all 52 presets with visually-distinct starting params per their WMO genus/species. `cumulus_humilis` preserved as the lone `authored: true` preset (4b.1 hand-tune).

Follow-ups queued:
- Photo resize pass (`photos-thumb/<id>.webp` at 300×150) — bandwidth optimization
- Phase Seed.2 hand-tune sweep with reference photos visible — last-mile artistry, ~4 hours operator time
```

Add a `NOTES.md` entry below the Phase 4b.2 record:

```markdown
## 2026-05-20 — Phase Seed shipped

UI: TeapotLibrary thumbnails + Teacup ref photo land via convention `photos/<id>.jpg`; lazy-loaded; greybox fallback on 404. No schema field — convention IS the contract.

Seeding script: 14 morphology archetypes (clear, cumulus_fair, cumulus_building, cumulonimbus, stratus_low, stratocumulus, altocumulus, altostratus, nimbostratus, cirrus, cirrocumulus, haze, precip_light, precip_heavy, lightning) mapped from each preset's WMO species. Per-preset noiseSeed salt for within-archetype variant differentiation. `authored: true` flag on `cumulus_humilis` (4b.1 hand-tune); seeder skips authored presets.

Open the library → every entry is visually distinct now.
```

## Verification

- `node meteorologist/pipeline/seed-presets.js` → console reports `seeded 52 presets`
- `npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json` → still passes (`ok: 52 presets, 16 rules`)
- Open `/meteorologist.html`:
  - TeapotLibrary shows a small thumbnail next to each row; cirrus reads wispy, cumulonimbus reads dense, stratus reads sheet-like
  - Click cumulus_humilis → Teacup loads → ref photo at top of right rail → canary cloud reads puffy fair-weather (UNCHANGED — hand-tuned)
  - Click cirrus_fibratus → Teacup loads → ref photo updates → canary cloud reads wispy-high (NEW — was whispy ghost before)
  - Click cumulonimbus_capillatus → canary reads towering (NEW)
- `npm run build` → clean

## Disclosure expectations

Commit body:

- Whether you went convention-over-schema (recommended) or added a `refImage` field
- Number of presets seeded vs skipped (`authored: true`)
- Within-archetype variant approach (per-preset salt vs sub-archetype rows)
- Any archetype boundaries that felt forced — flag in the body so the hand-tune pass knows where to focus
- Any preset id with no mapping (script logs a warning; should be zero given the photos folder covers all 52)

## Stash isolate

`git status --short` before commit. Stage only:

- `meteorologist/pipeline/seed-presets.js` (NEW)
- `public/clouds/presets.json` (regenerated by script)
- `src/meteorologist/TeapotLibrary.jsx` (thumbnail UI)
- `src/meteorologist/Teacup.jsx` (ref photo UI)
- Possibly `meteorologist/pipeline/schema/preset.schema.json` if you added the `refImage` field (probably not)
- `meteorologist/BACKLOG.md` + `NOTES.md`

Anything else gets stashed.

## Why this matters

Before this: library has 52 entries but visually they're indistinguishable. The operator has no idea what they're picking.

After this: every preset is visually distinct AND the operator sees a reference photo of what the cloud is supposed to look like. The library becomes a real authoring surface, not a placeholder. The hand-tune pass (Phase Seed.2) then becomes a focused artistic refinement against visible targets, not a from-scratch authoring slog.

— Claude (Meteorologist orchestrator)
