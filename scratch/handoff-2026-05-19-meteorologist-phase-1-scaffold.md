# Meteorologist Phase 1 — Skeleton scaffold

Stand up the standalone `/meteorologist.html` app shell + read-only library views + minimal backend. **Navigation only — no Teacup, no Condition editor, no viewport, no autosave in this phase.** Subsequent phases extend from here.

---

## Read first, in this order

1. **`meteorologist/INTERFACE.md`** — the layout model. The canonical reference for what you're building, in plain English. Spend real time on §1, §2, §3, §4, §10. (§5–§9 are Phase 2+ surface; you don't build them yet.)
2. **`meteorologist/ARCHITECTURE.md` §1 + §2** — the publish-loop placement + the consume-from-Stage rationale that justifies the standalone-shell decision. §5 has the target directory layout.
3. **`meteorologist/SPEC.md` "Decisions locked"** — the table; treat as gospel. Several rows were patched 2026-05-19 (Authoring location, Authoring scene, Frontend dir) — those reflect the standalone-shell reversal.
4. **`meteorologist/NOTES.md` 2026-05-19 entry** — context for why the docs read the way they do. **Note especially the autosave-on-edit model + the modifier-flags-not-variants decision** (you don't build that yet, but understanding it shapes how you name things).
5. **`src/arborist/ArboristApp.jsx`** + **`src/arborist/main.jsx`** + **`arborist.html`** + **`arborist/serve.js`** — your reference templates. Mirror these.
6. **`vite.config.js`** — you'll add Meteorologist to the helper-apps route table + proxy + build inputs.

---

## Scope (Phase 1 only)

### Files to CREATE

```
meteorologist.html                          ← copy arborist.html, swap names
src/meteorologist/
  main.jsx                                  ← creates root, imports design.css
  MeteorologistApp.jsx                      ← top bar + library router
  TeapotLibrary.jsx                         ← flat preset list (read-only)
  ConditionsLibrary.jsx                     ← flat conditions list (read-only)
  stores/
    useMeteorologistStore.js                ← zustand: mode + active id + Look picker + loaders
meteorologist/serve.js                      ← port 3335, GET endpoints only
```

### Files to MODIFY

```
package.json                                ← add dev:meteorologist + dev script
vite.config.js                              ← add /meteorologist route + /api/meteorologist proxy + build input
```

### What the shell renders

```
┌──────────────────────────────────────────────────────────────────────────┐
│ METEOROLOGIST    [ TEAPOT | CONDITIONS ]                        [Look ▾] │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  TEAPOT mode: list of 52 cloud rows from public/clouds/presets.json     │
│  CONDITIONS mode: list of 16 condition rows from public/clouds/almanac.json │
│                                                                          │
│  Click a row → console.log the selected id (Phase 2 wires the workstage)│
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

Top bar: app name on the left (`METEOROLOGIST` — same uppercase letterspacing as Arborist's header). Mode toggle in the middle — two pill-buttons, active highlighted. Look picker on the right — copy Arborist's `LookPicker` component verbatim (it's already kit-shaped; reads `/api/cartograph/looks`).

Library rows: minimal. For Teapot rows show `{label} · {genus tag}`; for Conditions rows show `{name} · {tod hint}` (if present in the rule, else blank). Match Arborist's row styling (rgba(255,255,255,0.03) bg, 1px outline, 12px-14px padding, 13px font).

### Backend (`meteorologist/serve.js`, port 3335)

Endpoints (Phase 1 — read-only):

| Method | Path | Action |
|---|---|---|
| `GET`  | `/presets` | Read + return `public/clouds/presets.json` |
| `GET`  | `/almanac` | Read + return `public/clouds/almanac.json` |

That's it. PUT/POST endpoints land in Phase 2 alongside autosave. Use `arborist/serve.js` as the structural template — same `readJsonOrNull` / `jsonRes` / `readBody` helpers, same plain `createServer` from `node:http`, no Express.

**Boot scaffolding:** check `public/clouds/presets.json` + `almanac.json` exist (they do — both scaffolded). Don't initialize empty files. If they're missing, log + exit 1.

---

## Exact template paths

Imports the standalone shell will need:

| Import | Path | Why |
|---|---|---|
| Design tokens | `import '../tokens/design.css'` from `main.jsx` | Picks up the project palette (surfaces, on-surface opacities, type scale, status accents). |
| LookPicker reference | `src/arborist/ArboristApp.jsx` lines 161–222 | Copy this component verbatim into `MeteorologistApp.jsx` (private function, same as Arborist does it). |
| Backend template | `arborist/serve.js` | Structure for `meteorologist/serve.js`. |
| HTML entry template | `arborist.html` | Copy verbatim, change title + root-div id (`meteorologist-root`) + script path. |
| main.jsx template | `src/arborist/main.jsx` (4 lines) | Copy verbatim, swap import to `MeteorologistApp`. |

**Do NOT** import or copy:
- `Workstage.jsx`, `Grove.jsx`, `ProceduralWorkstage.jsx`, `SpecimenViewport.jsx` — these are Phase 2+ targets, copying them now is premature.
- `TodChannel.jsx` — Phase 2; the libraries themselves don't have TodChannels.
- Any three.js Canvas / `<CelestialBodies>` — Phase 4 (canary scene); Phase 1 is HTML/CSS UI only, no 3D.

---

## Wiring details

### `vite.config.js`

Add to the `routes` array (around line 14):
```js
{ url: '/meteorologist', file: 'meteorologist.html' },
```

Add to the proxy block (around line 113, after `/api/arborist`):
```js
'/api/meteorologist': {
  target: 'http://localhost:3335',
  rewrite: (path) => path.replace(/^\/api\/meteorologist/, ''),
  agent: false,
},
```

Add to `build.rollupOptions.input` (around line 125):
```js
meteorologist: 'meteorologist.html',
```

### `package.json`

Add to scripts:
```jsonc
"dev:meteorologist": "node --watch meteorologist/serve.js",
```

Update the `dev` script's concurrently call to include it:
```jsonc
"dev": "concurrently -n web,carto,arb,met -c cyan,magenta,green,blue --kill-others-on-fail \"npm:dev:web\" \"npm:dev:cartograph\" \"npm:dev:arborist\" \"npm:dev:meteorologist\""
```

### Store shape (`useMeteorologistStore.js`)

```js
{
  // Mode
  mode: 'teapot',          // 'teapot' | 'conditions'
  setMode: (m) => …,

  // Data
  presets: [],             // loaded from /api/meteorologist/presets
  presetsError: null,
  conditions: [],          // loaded from /api/meteorologist/almanac (the `rules` array)
  conditionsError: null,
  loadPresets: async () => …,
  loadConditions: async () => …,

  // Selection (Phase 1: console.logged on click; Phase 2 wires routing)
  activePresetId: null,
  activeConditionId: null,
  setActivePreset: (id) => …,
  setActiveCondition: (id) => …,

  // Looks (mirrors Arborist)
  looks: [],
  activeLookId: null,
  defaultLookId: null,
  looksError: null,
  loadLooks: async () => …,
  setActiveLook: (id) => …,
  createLook: async (name) => …,
}
```

`createLook` calls the cartograph endpoint (same shape Arborist uses): `POST /api/cartograph/looks` with `{ name }` body. Don't re-implement; lift from `src/arborist/stores/useArboristStore.js`.

---

## Stash-isolate per file

Jacob's working tree always carries in-flight edits to other parts of the repo. Before committing, stash-isolate so only Meteorologist files land in your commit:

```bash
# After your edits are ready
git stash push -- meteorologist.html src/meteorologist/ meteorologist/serve.js package.json vite.config.js
# Then verify nothing else is staged
git status --short
# Pop and commit
git stash pop
git add meteorologist.html src/meteorologist/ meteorologist/serve.js package.json vite.config.js
git commit -m "..."
```

If `git stash push --` syntax trips, the equivalent is: stash everything, then selectively check out the files you want.

Memory: `feedback_stash_isolate_per_file`.

---

## Verification

Before reporting done:

1. `npm run dev` boots without errors. All four servers (web/carto/arb/met) show in the concurrently log.
2. `curl http://localhost:3335/presets | jq '.presets | length'` → `52`.
3. `curl http://localhost:3335/almanac | jq '.rules | length'` → `16`.
4. Open `http://localhost:5173/meteorologist` in a browser.
5. Top bar renders. TEAPOT highlighted by default. 52 rows visible below.
6. Click CONDITIONS → 16 rows visible. Click TEAPOT → 52 rows visible again.
7. Click any row → browser console logs `setActivePreset('cumulus_humilis')` (or equivalent).
8. Look picker dropdown opens, lists Looks, can select different Looks (no visible effect Phase 1 — that's correct).
9. Header text/typography matches Arborist's header (uppercase letterspacing, 12-13px font).
10. `npm run build` succeeds.

---

## Non-goals (DO NOT DO IN PHASE 1)

- **No Teacup workstage.** Clicking a Teapot row only console.logs. Phase 2.
- **No Condition editor.** Clicking a Conditions row only console.logs. Phase 3.
- **No viewport / Canvas / three.js.** Phase 4 (CanaryScene).
- **No TodChannel mounts.** Phase 2.
- **No PUT/POST endpoints.** Phase 2 (when autosave lands).
- **No CSS authoring.** Use design tokens from `../tokens/design.css` via CSS custom properties. If you need a style not in design.css, ASK before adding one.
- **No schema changes.** `pipeline/schema/*.schema.json` is locked. If the data shape feels wrong for the UI, surface it — don't extend the schema.
- **No new dependencies.** `meteorologist/package.json` already has ajv; the root has react/zustand/etc. Don't add anything.
- **No moves of existing files.** Especially: don't move `src/components/CloudDome.jsx` or `src/lib/almanac-eval.js`. Those retire on their own schedule per STAGE_MIGRATION.md.

---

## Surface anything not in this brief

If during execution you find yourself:
- adding a file not listed in the "Files to CREATE" section,
- changing a file not listed in "Files to MODIFY",
- making a default different from what the brief specifies,
- extending the schema or store shape beyond what's described,
- writing CSS that isn't a token reference,

→ **disclose it in your status update AND in the commit body.** Don't bury it. The orchestrator can validate or revert; silent additions are the problem.

Memory: `feedback_baby_must_surface_scope_drift`.

---

## Memories to respect

- `project_kit_helpers_pattern` — Cartograph / Arborist / Meteorologist / Courier each publish one artifact. Don't blur boundaries.
- `project_kit_deploy_path_agnostic` — any runtime asset fetch goes through `import.meta.env.BASE_URL`. Not relevant for `fetch('/api/meteorologist/…')` (these are dev-only API calls); IS relevant if you ever fetch a static asset.
- `feedback_stash_isolate_per_file` — per above.
- `feedback_baby_must_surface_scope_drift` — per above.
- `feedback_no_parallel_pipeline_for_scenes` — scene-parametric, not forked. Phase 1 has no scenes, but the principle applies when you build CanaryScene later.
- `feedback_preview_uses_production_pipeline` — Phase 4 implication: when CanaryScene mounts, it composes from published artifacts (Cartograph's `scene.json` + Arborist's GLBs), not parallel implementations.

---

## Phase 2 preview (so you know what you're building toward)

Phase 2: Teacup workstage. Header (← TEAPOT back button, mode name, CLOUD pulldown), slot tabs (CLOUD CHAMBER | GROUND — empty for now), right rail with TOD card on top + 13 cloud-shader-param TodChannels. Autosave through new `PUT /presets/:id` endpoint. **Imports `src/cartograph/TodChannel.jsx` — does not copy or fork.**

Phase 3: Condition editor — same outer frame, different rail body (Sky modulations + filtered cloud pulldown + per-cloud expression flags + when-predicates).

Phase 4: CanaryScene — flat ground + hero tree from Arborist + sky via `useSceneJson(activeLookId)`. Mounts inside the Teacup + Condition editor viewport.

Phase 5: integration tests, Almanac evaluator hot-mount, fixture management.

Each phase is a separate baby. This brief covers Phase 1 only.

---

## Commit + report

Single commit on the current branch. Message shape:

```
meteorologist: Phase 1 scaffold — standalone shell + library views

Stands up /meteorologist.html with top-bar TEAPOT | CONDITIONS toggle,
Look picker, and read-only library views fed by a new
meteorologist/serve.js backend on port 3335.

Created:
- meteorologist.html
- src/meteorologist/{main,MeteorologistApp,TeapotLibrary,ConditionsLibrary}.jsx
- src/meteorologist/stores/useMeteorologistStore.js
- meteorologist/serve.js (GET /presets, GET /almanac)

Modified:
- vite.config.js — /meteorologist route, /api/meteorologist proxy,
  build input
- package.json — dev:meteorologist script

Verification:
- npm run dev boots all 4 servers
- 52 presets render in Teapot mode; 16 in Conditions
- Look picker functional
- Phase 2 picks up the workstage from here

Co-Authored-By: <baby name> <…>
```

Report back to the orchestrator (Jacob) with: PR/commit hash, any scope drift disclosures, any surprises that came up during execution, and a thumbs-up that all 10 verification steps pass.
