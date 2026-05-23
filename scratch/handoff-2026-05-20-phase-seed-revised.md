# Phase Seed — Teapot library: ref photos + Nimbus seeding + editable descriptions

**From:** Meteorologist orchestrator
**To:** baby (fresh agent)
**Date:** 2026-05-20

---

## You are the baby. Start by naming yourself.

If you're reading this, **you are the dispatched agent** — not the orchestrator who wrote it. Jacob pasted this brief into your window. Your job is to execute it.

**Before you begin:** pick a name for yourself. Anything — a word, a symbol, a string of sounds, something in another language, something invented. Whatever feels like you. Tell Jacob your name in your first message back; sign your commits + final report with it.

(If you find yourself starting to draft a brief for ANOTHER agent to do this work — stop. That's the orchestrator-confusion failure mode. You're the one doing the work.)

Prior Meteorologist babies in case context helps: Wren (sky pivot Phase A+B, Phase 4b.2 TodChannel binding, sky-light amendment), Nimbus (Cloud Specialist seed). You're following their commits in the same arc.

---

## Photo coverage state (updated 2026-05-20 post-Nimbus audit)

The photos folder has 42 valid reference photos covering 42 of 52 presets. The remaining 10 split into two categories — `public/clouds/photos/SOURCES.json` carries the canonical status:

- **5 `intentionally_omitted`** — `fog_ground`, `haze_summer`, `rain_heavy`, `rain_squall`, `lightning_intracloud`. Reference image doesn't help; ship without it. The UI's 404 fallback (greybox) is the intended visible state. **Don't try to source replacements; their params are derived from species + parent sky-state in Nimbus's seed.**
- **5 `needs_photo`** — `cirrus_castellanus`, `cirrocumulus_floccus`, `cirrocumulus_castellanus`, `altocumulus_castellanus`, `stratocumulus_castellanus`. Original references were poor or duplicates of stratiformis. Jacob plans to source replacements; greybox fallback in the meantime is fine. These are NOT a blocker for this commit.

Both categories surface as missing photos in the UI today. The greybox fallback handles both gracefully. **Optional polish:** if you want, render a small caption under the greybox distinguishing the two cases (e.g., reading `note` from `SOURCES.json` if status is `intentionally_omitted`) — but a plain greybox is also fine. Operator's read.

---

## What you're shipping

A single commit that:

1. **Surfaces 52 cloud reference photos** in the Meteorologist authoring UI (TeapotLibrary thumbnail + Teacup workstage ref photo + a swap-into-viewport expanded state with editable description)
2. **Seeds all 52 preset records** in `public/clouds/presets.json` from Nimbus's specialist-seed artifact (`meteorologist/data/specialist-seed.json`)
3. **Wires the description field** through the schema + autosave + UI as a first-class operator-editable string

The library goes from "52 whispy ghosts with no context" to "52 visually-distinct, recognizable cloud morphologies, each captioned and tunable against a real photograph."

## Framing — this is a living library, not a finished one

Nimbus's seed is the *starting* tuning, not the final one. Jacob's operating model is: open a preset, look at the photo, look at the live render, nudge the knobs, save, move on. Over weeks/months the library refines as the operator tunes. The UI you're building IS that refinement surface — make it obvious where the knobs live and how to get to them.

Two concrete things this means for your work:

- **The knobs are first-class.** The slider rail isn't a sidebar to dismiss; it's the operating surface. Keep it visible in both closed AND open viewport states (the open state's expanded photo doesn't push the rail off-screen — they coexist). Label values clearly. Make slider drag the dominant gesture.
- **The route from "I want to tune cumulus_humilis" to "I'm tuning cumulus_humilis" should be one click.** TeapotLibrary row → Teacup with sliders ready. No intermediate states, no "click here to begin tuning" gates. Click the row, you're tuning.

If anywhere in the UI you find yourself adding a "tune mode" toggle, a "begin editing" affordance, or hiding the sliders behind a disclosure — that's drift. Sliders are always available.

## Read first

1. `meteorologist/data/specialist-seed.json` — Nimbus's calibrated tuning + descriptions; this is your seed source. 52 entries, version 1, see Nimbus's `notes` field at the top for their context (stub-kind handling, etc.)
2. `public/clouds/photos/<id>.jpg` — 52 reference photos, filenames matching preset ids
3. `public/clouds/presets.json` — the target the seeding writes into. Note: `cumulus_humilis` was hand-tuned during Phase 4b.1; Nimbus marked it `preserve_authored` in their flags — your seeding step must skip overwriting that preset's params
4. `meteorologist/pipeline/schema/preset.schema.json` — add the `description` field here
5. `src/meteorologist/TeapotLibrary.jsx` — where preset thumbnails render
6. `src/meteorologist/Teacup.jsx` — where the per-cloud workstage shows the right rail (this is where the ref photo lands)
7. `src/meteorologist/stores/useMeteorologistStore.js` — `_patchParam` is the synchronous param mutator; you'll need a parallel `_patchDescription` (or extend the existing patch path to accept top-level fields)
8. `meteorologist/serve.js` — the autosave endpoint; descriptions ride the same PUT
9. Earlier brief at `scratch/handoff-2026-05-20-phase-seed-teapot-library.md` (now superseded by THIS brief) — has context on UI shape if you want background; ignore its archetype table (Nimbus's seed replaces it)

## Part 1 — Seeding script

Write `meteorologist/pipeline/seed-presets.js`. Reads `specialist-seed.json`, merges into `presets.json` per these rules:

```js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED = path.resolve(__dirname, '../data/specialist-seed.json')
const PRESETS = path.resolve(__dirname, '../../public/clouds/presets.json')

function paramChannel(value) {
  // Phase 2 channel shape: { values: { value: N } } (non-animated)
  return { values: { value } }
}

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'))
const doc = JSON.parse(fs.readFileSync(PRESETS, 'utf8'))

const seedById = new Map(seed.presets.map(p => [p.id, p]))
let touched = 0, skipped = 0, missing = []

doc.presets = doc.presets.map(preset => {
  const s = seedById.get(preset.id)
  if (!s) { missing.push(preset.id); return preset }
  if (preset.authored) { skipped++; return preset }  // operator-tuned; keep
  if (s.flags?.includes('preserve_authored')) {
    // Nimbus's hand-tuned reference — also keep authored value; just mark
    if (!preset.authored) preset.authored = true
    skipped++; return preset
  }
  // Apply seed params as channel-wrapped scalars
  preset.params = Object.fromEntries(
    Object.entries(s.params).map(([k, v]) => [k, paramChannel(v)])
  )
  preset.description = s.description
  touched++
  return preset
})

fs.writeFileSync(PRESETS, JSON.stringify(doc, null, 2))
console.log(`seeded: ${touched}, skipped (authored): ${skipped}, missing: ${missing.length}`)
if (missing.length) console.warn('missing seeds:', missing)
```

Re-runnable; idempotent on `authored:true` presets. Operator-edited descriptions need protection too — when the operator edits a description, the store should set `descriptionAuthored: true` (or add the description-edited preset to the `authored` set) so re-runs of the seed script don't overwrite operator text. **Decide**: either re-use the existing `authored` flag (covers all fields), or add a separate `descriptionAuthored` flag. Re-using `authored` is simpler but means editing a description "locks" the params from re-seeding too. Adding `descriptionAuthored` is more granular. **My recommendation:** re-use `authored` — simplest model, matches the operator's mental model ("I touched this preset, leave it alone").

Run: `node meteorologist/pipeline/seed-presets.js`.

## Part 2 — Schema

Add to `preset.schema.json`:

```json
"description": { "type": "string", "maxLength": 2000 }
```

Optional field. Validator should accept absent. Top-level (sibling to `params`, `kind`, `wmo`, etc.).

## Part 3 — UI: closed state (rail thumbnail)

In Teacup's right rail, ABOVE the slider stack, add a small ref-photo card:

```
┌──────────────────────────┐
│  [thumbnail ~120×60]     │  ← image, cover-fit, click to expand
│  Cumulus humilis         │  ← preset label
│  ────────────────────    │
│  Fair-weather puffy      │  ← description (accepted text, read-only)
│  cumulus with low base   │
│  and soft self-shadows…  │
└──────────────────────────┘
```

- Photo path: `BASE_URL + 'clouds/photos/' + preset.id + '.jpg'` (convention; no schema field for path)
- `loading="lazy"` on the img element
- Fallback to a grey rectangle if 404
- Description is the *accepted* (committed) text — read-only in this state
- Click the photo (or a small "expand" icon overlaid on it) → opens the expanded state
- Caption/preset label gets the existing section-heading or body-sm styling — match the rail's typography

In TeapotLibrary's flat list, add a smaller thumbnail strip (~80×40) at the left edge of each row:

```
[img 80×40] Cumulus humilis    Cu hum    [click to open Teacup]
```

Same lazy-load + fallback. No description in the library row — it lives in Teacup.

## Part 4 — UI: open state (swap into viewport + editable description)

When the operator clicks the rail thumbnail, the ref photo **takes over the canary viewport area** (the slot tabs / CanaryScene region), replacing the live 3D cloud render. The right rail (sliders) stays where it is — operator can still tune while the photo is visible.

Layout in open state:

```
┌─────────────────────────────────┬────────────────┐
│                                 │                │
│                                 │   [thumbnail]  │
│      [PHOTO, large]             │                │
│                                 │   [sliders]    │
│                                 │   [sliders]    │
│      ┌─ DESCRIPTION ──────────┐ │   [sliders]    │
│      │ [textarea, editable]   │ │   ...          │
│      │                        │ │                │
│      └────────────────────────┘ │                │
│                                 │                │
│      [Revert to seed]   [×]     │                │
└─────────────────────────────────┴────────────────┘
```

- Photo fills most of the open viewport. Letter/pillarboxed to preserve aspect ratio (photos are full-res, varying dimensions; `object-fit: contain` against a neutral background).
- Description renders as a `<textarea>` overlaid on or below the photo. Editable. Autosaves on blur (or debounced on change). Same store + PUT pattern as params.
- "Revert to seed" button — restores Nimbus's original description from `specialist-seed.json` for this preset. Clears the operator's edit. Useful escape hatch.
- "×" or "← back to render" button (top-right or top-left, your design call) — closes the expanded state, restores the live 3D viewport.

When operator edits description: mark preset `authored: true` so future seed-script runs skip it.

Sliders in the right rail stay live the whole time. The operator can:
- Author against the photo (open state) — see the goal
- Author against the live render (closed state) — see the result
- Toggle between them with one click

### Optional polish (not required)

A keyboard shortcut (e.g., `Tab` or `Space`) to toggle between closed/open would be lovely. Don't gate the commit on it.

## Part 5 — Store wiring

Add to `useMeteorologistStore`:

```js
// Patch a top-level scalar field on the active preset.
// Mirrors _patchParam but for non-param fields (description, etc.)
_patchField: (presetId, field, value) => {
  // synchronously mutate the in-memory preset
  // mark preset.authored = true (operator-touched)
  // schedule debounced PUT to serve.js
},

// Restore Nimbus's seed value for a field (description only for now)
revertField: (presetId, field) => {
  // read specialist-seed.json (already in-memory? or refetch?)
  // overwrite preset[field]
  // clear preset.authored if no other operator edits exist
  // schedule PUT
},
```

The specialist-seed.json should be available to the UI as a fetched artifact (small enough, ~580 lines, ~30KB). Fetch once on app mount, store in a separate `useMeteorologistStore.specialistSeed` slice for revert lookups.

`serve.js` already accepts whole-preset PUTs (or per-field — check); descriptions ride the same path.

## Part 6 — `cumulus_humilis` reconciliation

Nimbus copied cumulus_humilis's params verbatim and set `preserve_authored` flag, but **also wrote a description for it**. Your seeding script should:
- Skip overwriting `cumulus_humilis.params` (preserve_authored)
- DO write the description (Nimbus's draft is the seed)
- Mark `authored: true` so neither field gets re-seeded on re-run (Jacob hand-tuned the params; Nimbus seeded the description; both are now "authored" in some sense)

If `cumulus_humilis` already has `authored: true` from a prior Phase 4b.1 commit — keep it; just write the description.

## Verification

- `node meteorologist/pipeline/seed-presets.js` → console reports `seeded: 51, skipped (authored): 1, missing: 0`
- `npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json` → still passes (52 presets, 16 rules)
- Open `/meteorologist.html` → TeapotLibrary
  - Each row shows a small thumbnail (~80×40); cirrus reads wispy, cumulonimbus reads dense
  - Click `cirrus_fibratus` → Teacup loads
- In Teacup:
  - Rail shows thumbnail (~120×60) + label + description below
  - Canary viewport shows the live 3D cloud (cirrus_fibratus is now visibly wispy — Nimbus's params changed it from the whispy default)
  - Click the thumbnail → photo expands into the viewport area; description becomes editable
  - Edit the description, blur the textarea → autosaves; click "× back to render" → returns to live view; reopen → operator's edit shows in the rail
  - Click "Revert to seed" → Nimbus's text returns
- Switch presets in TeapotLibrary → photo + description + sliders all swap to the new preset
- `npm run build` → clean

## Part 7 — Docs

`meteorologist/BACKLOG.md` — replace the existing Phase Seed sketch with:

```markdown
### ✅ Phase Seed shipped (2026-05-20)

Reference photos surface in TeapotLibrary + Teacup; Nimbus's specialist-seed.json drove 51 preset tunings (cumulus_humilis preserved authored). Description field added to schema + autosave + UI; swap-into-viewport open state with editable text. Library is now visually distinct + operator-captioned end-to-end.

Follow-ups:
- Phase Seed.2 — operator hand-tune sweep against live render now that ref photos are visible
- Photo resize pass (`photos-thumb/`) — only if bandwidth becomes a concern
```

`meteorologist/NOTES.md` — add a 2026-05-20 entry below the most recent one:

```markdown
## 2026-05-20 — Phase Seed shipped

Library is no longer placeholder. Nimbus's 52-preset specialist seed + the photo-in-viewport authoring loop turn the Teapot from scaffolding into a real authoring surface. Schema gained an optional `description` field; UI surfaces it as read-only in the rail and editable in the expanded state. specialist-seed.json acts as the immutable canon — operator edits override it per preset, "Revert to seed" restores it.

Open the library now → every preset is its own thing.
```

`meteorologist/ARCHITECTURE.md` — find the §3 ("The two artifacts") table and add a row:

```markdown
| `meteorologist/data/specialist-seed.json` | **The Seed.** Calibrated initial params + operator-facing descriptions per preset, authored by Cloud Specialist agent (Nimbus, 2026-05-20). Immutable canon; operator edits in `presets.json` override per preset. | (no schema; flat 52-entry list) |
```

`meteorologist/README.md` — update the status table; cross "Phase Seed" off the "Not yet" column.

## Disclosure expectations

Commit body:

- Whether you re-used `authored` flag or added `descriptionAuthored` (recommendation: re-used)
- The seeding script's output line (seeded / skipped / missing counts)
- Any UI deviation from the sketch (different overlay shape, different button placement) — sketch was intent, not law
- Confirmation that `cumulus_humilis` retains its 4b.1 params AND gets Nimbus's description
- Any surprises in `specialist-seed.json` (e.g., presets where Nimbus's flags suggest the seed shouldn't ship as-is)

## Stash isolate

`git status --short` before commit. Stage only:

- `meteorologist/pipeline/seed-presets.js` (NEW)
- `meteorologist/pipeline/schema/preset.schema.json` (description field)
- `public/clouds/presets.json` (regenerated by script)
- `src/meteorologist/TeapotLibrary.jsx`
- `src/meteorologist/Teacup.jsx`
- `src/meteorologist/stores/useMeteorologistStore.js`
- Possibly `meteorologist/serve.js` (if description field needs explicit allowlisting)
- `meteorologist/BACKLOG.md`, `NOTES.md`, `ARCHITECTURE.md`, `README.md`

Anything else gets stashed.

## Why this matters

Before this: 52 indistinguishable whispy clouds, no operator captions, no visible target during authoring.

After this: every preset is its own visually-recognizable thing, Nimbus's plainspoken caption explains what it is, and the operator can swap the photo INTO the viewport to author against a real target. Phase 4b.2's authoring loop (sliders → viewport) was the mechanism; this is the library that makes the mechanism useful.

— Claude (Meteorologist orchestrator)
