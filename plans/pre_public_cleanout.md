# Pre-Public Cleanout Plan

This plan resolves every **strip** and **gate** verdict from [`../ls/reference/RUNTIME-DELTA.md`](../ls/reference/RUNTIME-DELTA.md) §2. It does not specify the couplers (see [`kit_couplers_parametrize.md`](kit_couplers_parametrize.md)) or the basemap swap (see `ls_basemap_swap.md`, not yet authored). It does not execute. Output of Phase B; input to Phase C.

**Verification state.** Branch `cartograph-looks-pass-ab @ 6cb89d2` vs. local `main @ b39834b`. RUNTIME-DELTA's verdicts were taken against `b39834b vs origin/main @ 20866ef`; the newer branch tip adds only doc-only commits and the verdicts remain valid.

**The repo is the Cartograph operator's environment.** The kit (Cartograph / Arborist / Meteorologist / Courier-future) stays in place across multiple neighborhood authoring sessions. This plan removes authoring code from the *production build*, not from the *source tree*. The production-side strip is achieved structurally — build-config + runtime seam — not by deleting source. Only two files are deleted by this plan (§S3): verified-orphan assets.

## Required reading

1. [`kit_couplers_parametrize.md`](kit_couplers_parametrize.md) — sibling plan. This plan inherits its non-scope (no per-coupler design, no runtime architecture changes) and its CC.1–CC.7 cross-cutting rules. Coupler §1's `useCartographStore` → `useSceneJson` seam closure is a **precondition** for this plan's §S2 validation gate.
2. [`../ls/reference/RUNTIME-DELTA.md`](../ls/reference/RUNTIME-DELTA.md) — verdict source. §2.1, §2.3, §2.4, §2.5, §2.6; carry-overs RD.4, RD.8, RD.9, RD.10.
3. [`../SLAB-CONTRACT.md`](../SLAB-CONTRACT.md) — boundary spec; slab is keep. Producer-contract §1 bears on §S3's whitelist (no foreign files alongside `public/baked/<look>/`).
4. [`../cartograph/{FEATURES,ARCHITECTURE,BACKLOG}.md`](../cartograph/) — kit's punchlist + helper-app layout pattern.
5. [`../ls/{FEATURES,ARCHITECTURE,BACKLOG}.md`](../ls/) — consumer trinity.
6. [`../vite.config.js`](../vite.config.js) — `build.rollupOptions.input` lines 119–124; `serveHelperApps()` lines 13–38. No `copyPublicDir` override today (default `true` ships all of `public/`).
7. [`../package.json`](../package.json) — runtime vs. dev deps; `concurrently`, `clipper-lib`, `meshoptimizer`, `three-mesh-bvh`, `@gltf-transform/*`, `fbx2gltf`, `node-unrar-js`, `pngjs` are dev-only.
8. [`../worker.js`](../worker.js) — Cloudflare Worker; mirror-constants block (lines 1–3) is couplers plan §6 territory. `worker.js:1`'s `GAS_API` is the fifth deployment-ID location (§S8).
9. [`../PUBLISH.md`](../PUBLISH.md) — deploy procedure; §"Single source of truth" + §5.
10. Memory: `feedback_beautiful_first_lightweight_51` (doctrine), `feedback_orphan_audit_full_repo` (quarantine before delete — applies to §S3's two file deletions), `feedback_no_speculative_cruft_lists` (grep-verified, not pattern-matched), `project_kit_helpers_pattern` (helpers stay; their dev-only nature is enforced by build-config, not source removal).

## Framework summary

| § | Surface | Verdict | Mechanism | Verification gate (one-liner) |
|---|---|---|---|---|
| S1 | Authoring HTML entries (`cartograph.html`, `arborist.html`, `preview.html`) | strip from build | Mode-conditional `rollupOptions.input` (drops in prod) | `dist/cartograph.html` etc. absent; build succeeds |
| S2 | Authoring source trees (`src/cartograph/`, `src/arborist/`, `src/preview/`, `src/stage/`) | **validate, do not delete** | Three-part gate: §S1 + couplers §1 + §S6 grep | No `cartograph-*.js` chunk in `dist/assets/`; source trees intact |
| S3 | `public/` asset whitelisting + two verified-orphan deletes | strip (build) + delete (two files) | `copyPublicDir: false` + explicit allow-list plugin; quarantine-then-delete for `public/data/landmarks.json` and `public/cartograph-ground.svg` | `dist/clouds/`, `dist/trees/`, `dist/models/`, `dist/looks/` absent; two files gone from `public/` |
| S4 | Helper backends (`cartograph/serve.js`, `arborist/serve.js`, `meteorologist/serve.js`) and their `data/` dirs | gate (already dev-only) | No-op for build; documented in PUBLISH.md | n/a (servers never deploy) |
| S5 | Stale handoff docs (root `HANDOFF-*.md`, `cartograph/SHADOW_HANDOFF.md`) + `CARY-BRIEF.md` relocation | gate / relocate | Handoff docs → `_archive/handoffs/`; `CARY-BRIEF.md` → its own home (NOT archive) | Repo root contains no `HANDOFF-*.md`; `CARY-BRIEF.md` colocated with Cary infrastructure |
| S6 | `useCartographStore` runtime seam | strip — owned by couplers §1 | **No-op here**; this plan validates closure | Grep returns zero `useCartographStore` imports in `src/components/`, `src/hooks/`, `src/lib/`, `src/App.jsx`, `src/main.jsx` |
| S7 | `apps-script/Code.js` source | gate | Vite never reaches it; documented | `grep -c apps-script dist/...` returns zero |
| S8 | Five-place deployment-ID audit | operational | Pre-deploy `scripts/audit-deployment-id.sh` + CI step | Audit script exits 0; mutation test blocks deploy |
| S9 | Build-chunk validation (derivative of §S1 + §S2 gate) | observational | No-op; observe `dist/assets/` post-§S1 | `cartograph`, `arborist`, `preview`, `PreviewPostFx` chunks absent |

Nine sections.

---

## S1 — Authoring HTML entries

### Current state

`vite.config.js:119-124`:

```js
input: {
  main: 'index.html',
  cartograph: 'cartograph.html',
  arborist: 'arborist.html',
  preview: 'preview.html',
}
```

All four bundle into `dist/`. Dev middleware `serveHelperApps()` (lines 13–38) routes `/cartograph`, `/arborist`, `/preview` — that's dev-server only; build ships HTML regardless. `stage.html` and `model-viewer.html` already removed.

RUNTIME-DELTA §2.1 verdict: strip from the production build.

### Strip mechanism (decision)

**Mode-conditional `rollupOptions.input`.** The `defineConfig` callback already receives `{ command }` (line 70). Production build (`command === 'build'`) emits only `{ main: 'index.html' }`; dev (`command === 'serve'`) keeps all four so the authoring routes still resolve. The three `*.html` files stay at repo root (dev entry points).

Justification: build-level removal is structural and reversible by a one-line config flip; dev preservation keeps the kit usable on the branch.

### Quarantine step

n/a — no files deleted.

### What breaks if this is wrong

- Production build still emits authoring chunks → §S9 validation fails; cleanout's headline bundle-delta is unmet.
- Condition inverted → dev server stops serving `/cartograph`; authoring blocked. Loud, easy revert.

### Verification gate

1. `npm run build` exits 0.
2. `ls dist/` shows `index.html` only — no `cartograph.html`, `arborist.html`, `preview.html`.
3. `npm run dev` + browser load of `localhost:5173/cartograph` still serves the Designer UI.
4. Mobile UA on `/`: no console errors, no Network requests for `/cartograph*`.

### V1 carve-out

None.

### Cross-references

- RUNTIME-DELTA §2.1.
- Couplers plan §1 (seam closure — independent prerequisite for §S2 gate).
- `vite.config.js:13-38, 70, 119-124`.

---

## S2 — Authoring source trees (validation only)

### Current state

Four source trees power the authoring HTML entries from §S1:

| Tree | Purpose | Status in this plan |
|---|---|---|
| `src/cartograph/` | Designer + Stage UI; `useCartographStore` (1313 lines + transitive deps) | **Stays in source.** Build-side: production entry-graph no longer reaches it after §S1 + couplers §1. |
| `src/arborist/` | Tree species library, Grove, specimen workstage | **Stays in source.** Same. |
| `src/preview/` | GpuMonitor, PhoneFrame, BakedBuildings, etc. | **Stays in source.** Same. |
| `src/stage/` | StageApp, StageArch, StageSky, surfaceState | **Stays in source.** Imported by cartograph (RUNTIME-DELTA §2.1 keep row); `StageArch` mounted by production. |

The repo IS the Cartograph operator's environment. The kit ships across neighborhood authoring sessions. Source-tree deletion would conflate two operations — "stop shipping to prod" (this plan) and "extract the kit to its own repo" (a much later operation, not on Phase B's table).

### Strip mechanism (decision)

**No source deletion. Validate the three-part gate that keeps these trees out of production:**

1. §S1 — production `rollupOptions.input` excludes `cartograph.html`, `arborist.html`, `preview.html`. No entry-graph reaches the trees from a production build.
2. Couplers plan §1 — `useSceneJson` (or equivalent slab-side data hook, distinct from `useCartographStore`) lands; the six runtime components (`BakedGround`, `BakedLamps`, `InstancedTrees`, `LafayetteScene`, `LafayettePark`, `StreetLights`) read it instead of the cartograph store. The runtime no longer imports anything under `src/cartograph/`.
3. §S6 (below) — deploy-time grep gate confirms (2) stays true.

When all three hold, Rollup's tree-shake of the production graph emits no chunk reaching `src/cartograph/`, `src/arborist/`, `src/preview/`. Same expected bundle deltas as if the trees were deleted, achieved without losing the kit.

Justification: this plan's purpose is **deploy hygiene**, not source-tree reduction. The kit stays; the deploy excludes. Build-config + runtime seam are the structural answer; deletion is a stronger action than the goal requires.

### Quarantine step

n/a — no files deleted.

### What breaks if this is wrong

- §S1 incomplete (production input map still references an authoring entry) → Rollup retains the entry-graph and chunks emit. Caught by §S9 validation.
- Couplers §1 incomplete (a runtime component still imports `useCartographStore`) → §S6's grep gate returns non-zero; deploy blocks. Recoverable; loud.
- A new cross-import lands later (a hook or `lib/` file innocently reaches into `src/cartograph/`) → §S6's grep gate catches at next deploy. CI-enforced.

### Verification gate

1. `npm run build` exits 0.
2. `ls dist/assets/` shows no `cartograph-*.js`, `arborist-*.js`, `preview-*.js`, `PreviewPostFx-*.js` chunks. Expected bundle deltas vs. 2026-05-12 build (RUNTIME-DELTA §2.3 / INVENTORY-DATA §G):
   - `cartograph`: −4.5 MB min / −1.1 MB gz.
   - `arborist`: −71 KB / −21 KB gz.
   - `preview`: −36 KB / −13 KB gz.
   - `PreviewPostFx`: −88 KB / −28 KB gz.
   - Total first-paint payload reduction: ≈ −1.16 MB gz.
3. Mobile UA: DevTools Network shows no requests for `*-cartograph-*`, `*-arborist-*`, `*-preview-*`. No console errors.
4. Visual smoke: Browse / Hero / Street modes render unchanged; PlaceCard opens; neon ticks; Cary placeholder still surfaces (R3 non-target — Cary lives in `src/components/Courier*.jsx` and `src/hooks/useCary.js`, which this section does not touch).
5. **Source trees still present:** `ls src/cartograph/ src/arborist/ src/preview/ src/stage/` succeeds. (The kit didn't go anywhere.)

### V1 carve-out

`src/stage/` stays through v1 even though its dedicated HTML entry is gone. Future operations may push `StageArch` into shared `src/components/` and retire `src/stage/`; v1.1+ refactor, not a cleanout.

### Cross-references

- Couplers plan §1 (precondition: `useSceneJson` lands; `useCartographStore` no longer imported by runtime).
- RUNTIME-DELTA §1.1, §2.1, §2.2, §2.3.
- §S6 (deploy-time grep gate).
- §S9 (post-build chunk validation).
- Memory: `project_kit_helpers_pattern` — helpers stay across instances; deploy-hygiene is build-config, not source removal.

---

## S3 — `public/` asset whitelisting + verified-orphan file deletions

### Current state

`vite.config.js` does not override `copyPublicDir`, so Vite defaults to `true` — every file under `public/` ships to `dist/`. Current contents (verified `ls public/` at `6cb89d2`):

| Path | Size | Verdict | Notes |
|---|---|---|---|
| `public/baked/` | 201 MB | keep — ship | The slab (SLAB-CONTRACT §1) |
| `public/photos/` | 71 MB | keep — ship | PlaceCard photos |
| `public/codedesk/` | unmeasured | keep — ship | Served by `serveCodedesk()` middleware; §S8 deployment-ID source |
| `public/textures/` | incl. 17 MB `milky_way.jpg` | keep — ship (mobile gate deferred) | `CelestialBodies` background; RD.9 |
| `public/weather-icons/` | unmeasured | keep — ship (consumer verified) | Consumed via URL fetch by `src/lib/weatherCodes.jsx:41` |
| `public/logos/` | unmeasured (16 LS business logos: png/jpg/webp) | keep — ship (consumer verified) | Consumed via `src/data/landmarks.json` URL references rendered through `PlaceCard` |
| `public/lafayette-square.svg` (85 KB) | | keep — ship | `LafayettePark.jsx` reads it (RUNTIME-DELTA §1.2) |
| `public/CNAME` (21 B) | | keep — ship | DNS — couplers plan §6 |
| `public/404.html` | | keep — ship | GH Pages fallback |
| `public/favicon.svg`, `public/lsq-tokens.css` | | keep — ship | First-paint metadata |
| `public/trees/` | 4.9 GB | strip from build (stay in source) | Arborist authoring inputs; consumer is `public/baked/<look>/trees/` |
| `public/models/` | 255 MB | strip from build (stay in source); per-file audit deferred | 400 MB facade already gone; remainder is authoring inputs |
| `public/clouds/` | 28 KB | **keep — ship** | SC.6 (Meteorologist coupler scaffolding) reverses the earlier strip verdict. The Teapot (`presets.json`, 52 entries) + Almanac (`almanac.json`, 16 rules) are kit-level authored artifacts that the v3 `<Atmosphere />` raymarched runtime will fetch at runtime; `src/lib/almanac-eval.js` lands in SC.6 as the evaluator. Forward-compat shipping is the whole point. |
| `public/looks/` | 508 KB | strip from build (stay in source) | Cartograph store-only consumer (RUNTIME-DELTA §2.5); authoring input |
| `public/data/landmarks.json` | ~1 KB | **strip + delete** | Vestigial duplicate; runtime imports `src/data/landmarks.json` (JS module); the public copy has zero consumers and is out of date (verified by orchestrator) |
| `public/cartograph-ground.svg` (440 KB) | | **strip + delete** | Zero consumers anywhere in repo (verified by orchestrator); RUNTIME-DELTA §1.2 noted "no runtime consumer" |
| `public/lidar/` | does not exist | n/a | RUNTIME-DELTA §2.5 speculation; carry-over CL.1 |

RUNTIME-DELTA §2.5: "Vite's `copyPublicDir` is dumb; Phase B's sterilize step needs to whitelist what actually goes in the deployed bundle, not rely on a permissive default."

### Strip mechanism (decision)

Two-part mechanism:

**Part A — Build-side allow-list.** Set `copyPublicDir: false` in `vite.config.js` `build` block, add a small custom plugin (≤30 lines) that copies an explicit allow-list of `public/` paths into `dist/` at build time. The allow-list for v1:

```
public/baked/                       → dist/baked/
public/photos/                      → dist/photos/
public/codedesk/                    → dist/codedesk/
public/textures/                    → dist/textures/
public/weather-icons/               → dist/weather-icons/
public/clouds/                      → dist/clouds/
public/logos/                       → dist/logos/
public/lafayette-square.svg         → dist/lafayette-square.svg
public/CNAME                        → dist/CNAME
public/404.html                     → dist/404.html
public/favicon.svg                  → dist/favicon.svg
public/lsq-tokens.css               → dist/lsq-tokens.css
```

Excluded by virtue of not being in the allow-list (and named in the plugin's comment for future readers): `public/trees/`, `public/models/`, `public/looks/`, `public/data/`, `public/cartograph-ground.svg`. The first three stay in source for authoring; the latter two are deleted (Part B). `public/clouds/` is **shipped** in v1 per SC.6 (forward-compat for the Meteorologist v3 `<Atmosphere />` runtime; see the table row above).

**Part B — Two verified-orphan file deletions** via the quarantine pattern:

1. `public/data/landmarks.json` → `_quarantine/public-data/landmarks.json` (quarantine commit) → `rm` (delete commit) after the clean-session gate.
2. `public/cartograph-ground.svg` → `_quarantine/public-cartograph-ground.svg` (quarantine commit) → `rm` after the clean-session gate.

These are the only file deletions in this plan.

Justification: whitelist beats blacklist on a default-permissive Vite (CC.5). Two deletions are warranted because both files are verified-orphan (orchestrator confirmed: `public/data/landmarks.json` is a 1 KB out-of-date duplicate with no consumer; `public/cartograph-ground.svg` has zero references anywhere). Quarantine remains mandatory per `feedback_orphan_audit_full_repo`.

### Quarantine step

Applies to **only the two file deletions** (`public/data/landmarks.json`, `public/cartograph-ground.svg`).

1. **Grep audit (must return zero before quarantine):**
   ```
   grep -rln "public/data/landmarks\|/data/landmarks.json" \
       src/ cartograph/ arborist/ meteorologist/ apps-script/ scripts/ worker.js \
       --include='*.js' --include='*.jsx' --include='*.cjs' --include='*.mjs' --include='*.py' --include='*.html'
   ```
   and analogously for `cartograph-ground.svg`. Production reads `src/data/landmarks.json` (JS module) via `useInit` / `useListings`; that is distinct from `public/data/landmarks.json` (HTTP fetch path), which has no caller.
2. **Quarantine destination:** `_quarantine/public-data/landmarks.json`, `_quarantine/public-cartograph-ground.svg`. Sibling of established `_archive/`. One quarantine commit per file.
3. **Verify clean-session gate:** `npm run build` + `npm run dev` + mobile + desktop browser load of `/`. No 404s on `/data/landmarks.json` or `/cartograph-ground.svg`. No visual regression. Hold one session minimum.
4. **Final delete:** separate commit, `rm _quarantine/public-data/landmarks.json`, `rm _quarantine/public-cartograph-ground.svg`.

The build-side strip (Part A) has no quarantine — nothing is deleted from source.

### What breaks if this is wrong

- Allow-list misses a consumed path → 404 on runtime fetch. Caught by first mobile load + Network panel.
- A "verified orphan" turns out to have a missed consumer → 404; restore from quarantine (entire reason the quarantine pattern exists).
- 17 MB `milky_way.jpg` ships uncompressed → mobile cellular pain (RD.9). Handled in V1 carve-out.
- `public/models/` per-file audit deferred → some models may be dead weight in source forever; not a deploy concern (they're build-excluded), it's a future repo-hygiene operation.

### Verification gate

1. `npm run build`; `du -sh dist/` bounded by allow-list sum (≈ <300 MB).
2. `ls dist/` shows no `trees/`, `models/`, `looks/`, `data/`, `cartograph-ground.svg`. `dist/clouds/` IS expected and present (SC.6 ship decision).
3. Mobile UA: Network panel filter for `/trees/`, `/models/`, `/looks/`, `/data/`, `cartograph-ground` returns zero requests with paths matching those (slab tree GLBs under `/baked/<look>/trees/` ARE expected and present; `/clouds/presets.json` + `/clouds/almanac.json` are likewise expected once Atmosphere v3 lands and may already be fetched by future probes).
4. Mobile + desktop visual smoke: scene renders; trees stand; lamps glow; park renders; photos load in PlaceCard; weather icons render where used; admin login (passphrase) at `/codedesk` works.
5. Two file deletions verified: `ls public/data/landmarks.json public/cartograph-ground.svg` → "No such file or directory" for both, after the final delete commit.

### V1 carve-out

- **`public/textures/milky_way.jpg`** ships at current 17 MB through v1 (RD.9). Future perf-gate session adds a smaller webp variant + media-query swap. Deferred.
- **`public/models/` per-file audit** deferred to a Phase C source-hygiene pass. Build-excluded for v1; source-side cleanup is a separate operation.
- **`public/trees/`, `public/looks/`** source trees stay in repo through v1 (authoring inputs). `public/clouds/` ships (SC.6).

### Cross-references

- Couplers plan §3 (`public/clouds/` no consumer) — **reversed** by SC.6; the Teapot + Almanac are now shipped as forward-compat for `<Atmosphere />` v3, evaluator at `src/lib/almanac-eval.js`.
- Couplers plan §6 (CNAME — Place coupler).
- RUNTIME-DELTA §1.2 (`cartograph-ground.svg` no consumer), §2.4 (clouds), §2.5 (asset volume).
- INVENTORY-DATA §F.
- SLAB-CONTRACT §0–§1.
- `src/lib/weatherCodes.jsx:41` (weather-icons consumer).
- `src/data/landmarks.json` + `PlaceCard.jsx` (logos consumer chain).

---

## S4 — Helper backends

### Current state

Three Node servers, dev-only:

- `cartograph/serve.js` — `localhost:3333`.
- `arborist/serve.js` — `localhost:3334`.
- `meteorologist/serve.js` — `localhost:3335`.

Started by `npm run dev` via `concurrently` (`package.json:7`, `concurrently` is `devDependencies:41`). `vite.config.js:105-114` proxies `/api/cartograph` and `/api/arborist` in dev only. Never deployed; `.github/workflows/deploy.yml` builds `dist/` only.

### Strip mechanism (decision)

**No-op for build.** Nothing reaches `dist/`. Document in PUBLISH.md as dev-only.

### Quarantine step

n/a.

### What breaks if this is wrong

If a future change wires an HTTP route or build step to one of these servers, production would attempt `localhost:3333` (fail) or bundle a Node-only module (build fail). Not in flight today.

### Verification gate

`grep -rn "localhost:333" src/ index.html` returns zero in production code paths (vite.config.js proxy line is dev-server config, not bundled).

### V1 carve-out

Helpers + their `data/` dirs stay in repo through v1, supporting authoring sessions. Future condition: kit extraction to its own repo. Out of scope.

### Cross-references

- INVENTORY-DATA §D, INVENTORY-API §E.
- Memory: `project_kit_helpers_pattern`.

---

## S5 — Stale handoff docs + `CARY-BRIEF.md` relocation

Two distinct operations in one section; treated separately.

### S5a — Stale handoff docs

#### Current state

Four docs flagged in `ls/BACKLOG.md` "Stale handoff docs":

| Doc | Location | Retire condition |
|---|---|---|
| `HANDOFF-clouds-day3-clouddome-v2.md` | repo root | `<Atmosphere />` ships and supersedes shader rubric |
| `HANDOFF-neon.md` | repo root | `NeonBands` decision history lifts into `ls/FEATURES.md §"Neon"` |
| `HANDOFF-sky-and-light.md` | repo root | Sky/light pipeline lifts into both trinities |
| `cartograph/SHADOW_HANDOFF.md` | `cartograph/` | Cartograph BACKLOG C.4 lands; doc ingested into ARCHITECTURE |

#### Strip mechanism (decision)

**Move to `_archive/handoffs/`** — established pattern (`_archive/handoffs/GATEWAY_ARCH.md` per INVENTORY-DATA §E). One commit per doc.

Justification: archival, not deletion — decision history per `feedback_load_bearing_corner_pads` posture. Removes from casually-scanned root surface without losing content.

#### Quarantine step

Move is the quarantine; no further delete.

#### What breaks if this is wrong

A session on (e.g.) cloud shader tuning loses the historical pointer. Recovery: `git log --all` + read archived file. Low cost.

#### Verification gate

1. `ls /` shows no `HANDOFF-*.md` at root.
2. `ls _archive/handoffs/` shows all four files plus pre-existing `GATEWAY_ARCH.md`.
3. `ls/BACKLOG.md` "Stale handoff docs" table updated: rows removed if retire-condition met, otherwise moved into a "Carried forward" subsection citing the archive path.

#### V1 carve-out

None.

### S5b — `CARY-BRIEF.md` relocation (NOT archival)

#### Current state

`CARY-BRIEF.md` exists at repo root. It is **not** a stale handoff. Cary is active LS-instance infrastructure with planned expansion: rideshare as second Courier role; two-level onboarding; toll-free number (`+18773351917`, per couplers plan §4) serves both roles. `CARY-BRIEF.md` is the Cary persona spec.

A directory `cary/` also exists at repo root (verified `ls`). The Cary surface in `src/` is also live production code (R3 non-target list).

#### Strip mechanism (decision)

**Relocate, do not archive.** `CARY-BRIEF.md` moves to a more appropriate colocated home — either:

- staying at repo root (if it doc-indexes equally for orchestration purposes), or
- into `cary/CARY-BRIEF.md` (if `cary/`'s contents are the operational home of the Cary persona).

Final destination is **deferred to Phase C** when the orchestrator inspects `cary/`'s contents and decides. This plan rules out `_archive/handoffs/` explicitly: archival framing misrepresents the doc's status.

Justification: the doc is active infrastructure documentation, not a historical artifact. Mis-archiving would obscure live planning material.

#### Quarantine step

n/a — relocation, not deletion. If the final destination is `cary/`, the move commit is the operation.

#### What breaks if this is wrong

Mis-archive → Cary planning material disappears from orchestration view. Caught by orchestrator pre-commit (don't allow `git mv CARY-BRIEF.md _archive/...`).

#### Verification gate

1. `ls _archive/handoffs/CARY-BRIEF.md` returns "No such file" (negative gate — never archive).
2. `CARY-BRIEF.md` exists at its Phase-C-chosen home (root or `cary/`).
3. `ls/BACKLOG.md`'s "Stale handoff docs" table does NOT list `CARY-BRIEF.md` (removing the framing it had previously).

#### V1 carve-out

Final-location decision deferred to Phase C.

### Cross-references

- `ls/BACKLOG.md` "Stale handoff docs" table.
- INVENTORY-DATA §E (existing `_archive/` pattern).
- Couplers plan §4 (Cary coupler — `CARY-BRIEF.md` is its planning material).

---

## S6 — `useCartographStore` runtime seam (validation only)

### Current state

Six production components import `useCartographStore` (RUNTIME-DELTA §2.2): `BakedGround.jsx`, `BakedLamps.jsx`, `InstancedTrees.jsx`, `LafayetteScene.jsx`, `LafayettePark.jsx`, `StreetLights.jsx`. Couplers plan §1 resolves with `useSceneJson` (or equivalent slab-side hook, distinct from the cartograph authoring store).

### Strip mechanism (decision)

**No-op in this plan.** Owned by couplers plan §1. This section names the gate that §S2's validation depends on, so the inter-plan dependency is explicit.

### Quarantine step

n/a.

### What breaks if this is wrong

§S2 validation gate fails (chunks emit in `dist/assets/`) because Rollup's production graph still reaches into `src/cartograph/` via a surviving `useCartographStore` import. Recoverable by closing the missing import; loud at the deploy CI step.

### Verification gate

Single grep, run before each deploy (CI step):
```
grep -rln "useCartographStore" \
    src/components/ src/hooks/ src/lib/ src/App.jsx src/main.jsx
```
Must return zero lines. Wired into `.github/workflows/deploy.yml` alongside §S8's audit script.

### V1 carve-out

None.

### Cross-references

- Couplers plan §1 (mechanism owner).
- RUNTIME-DELTA §2.2.
- §S2 (validation consumer of this gate).

---

## S7 — `apps-script/Code.js` source

### Current state

`apps-script/Code.js` deployed manually to Google per PUBLISH.md. Lives in repo for version control + diff review; not in `public/`, not imported by anything under `src/`. Vite never sees it.

### Strip mechanism (decision)

**Structural gate — no action.** Vite's resolver doesn't reach `apps-script/` because nothing imports it. Document in PUBLISH.md.

### Quarantine step

n/a.

### What breaks if this is wrong

If a future change `import`s from `apps-script/Code.js` into `src/`, Vite would bundle it. §S7's deploy-time grep gate catches.

### Verification gate

1. `grep -rln "apps-script" src/ index.html cartograph.html arborist.html preview.html` → zero.
2. `grep -c apps-script dist/assets/*.js dist/index.html` → zero.
3. Both wired into the deploy CI step.

### V1 carve-out

None.

### Cross-references

- PUBLISH.md §2.
- INVENTORY-API §A.
- Couplers plan §5.

---

## S8 — Five-place deployment-ID audit (operational)

### Current state

Five canonical locations (PUBLISH.md §"Single source of truth" + INVENTORY-API §A), verified by grep at write time:

| # | File | Constant | Line |
|---|---|---|---|
| 1 | `PUBLISH.md` | "Current deployment ID" | `:26, 93, 99, 109` |
| 2 | `.env` (gitignored) / `.env.example` (CL.6) | `VITE_API_URL` | (local file) |
| 3 | GitHub Secret | `VITE_API_URL` | injected at `.github/workflows/deploy.yml:32` |
| 4 | `public/codedesk/index.html` | `window.LSQ_API_URL` | `:479` |
| 5 | `worker.js` | `GAS_API` | `:1` |

Drift = "Unknown-action" runtime errors (historical bug).

### Strip mechanism (decision)

**Operational: `scripts/audit-deployment-id.sh` (≤20 lines) + CI gate.** Extracts the ID from each of the five canonical files, asserts exact-match identity. Wired into `.github/workflows/deploy.yml` as a pre-build step; non-zero exit blocks deploy.

Justification: drift is the historical bug; automated gate is the structural answer. Cleverness over checklist (CC.6 / `feedback_beautiful_first_lightweight_51`).

### Quarantine step

n/a.

### What breaks if this is wrong

Loose grep pattern → near-miss typo passes. Mitigated by exact-match across all five extractions.

### Verification gate

1. `bash scripts/audit-deployment-id.sh` exits 0 on clean branch.
2. CI step runs script before build; deploy blocks on non-zero exit.
3. Mutation test: change one file's ID by one character on a test branch; confirm CI blocks deploy.

### V1 carve-out

None.

### Cross-references

- PUBLISH.md §"Single source of truth".
- INVENTORY-API §A.
- Couplers plan §5.

---

## S9 — Build-chunk validation (derivative)

### Current state

Per RUNTIME-DELTA §2.3 + INVENTORY-DATA §G, the 2026-05-12 build emits four authoring-derived chunks: `cartograph` (1.1 MB gz), `arborist` (21 KB gz), `preview` (13 KB gz), `PreviewPostFx` (28 KB gz). They are products of §S1's HTML entries + §S2's source-tree reachability.

### Strip mechanism (decision)

**No-op — observational.** Once §S1's input map drops the three entries and the couplers-§1 seam closes (validated by §S6), Rollup has no entry-graph reaching those chunks; they disappear.

### Quarantine step

n/a.

### What breaks if this is wrong

§S1 incomplete OR §S6 gate doesn't hold → chunks persist. Fix path: back to §S1 / couplers §1 / §S6.

### Verification gate

Single command after each merge:
```
ls dist/assets/ | grep -E "^(cartograph|arborist|preview|PreviewPostFx)-"
```
Zero lines. Cite the RUNTIME-DELTA §2.3 byte-deltas as the expected contract (per §S2's table).

### V1 carve-out

None.

### Cross-references

- RUNTIME-DELTA §2.3.
- INVENTORY-DATA §G.
- §S1, §S2, §S6.

---

## Cross-cutting decisions

### CC.1 — Quarantine before delete is universal (narrow scope this plan)

Every file deletion passes through `_quarantine/<area>/` with grep audit + clean-session gate, per `feedback_orphan_audit_full_repo`. **This plan deletes only two files** (`public/data/landmarks.json`, `public/cartograph-ground.svg` — §S3 Part B). Both follow the full quarantine flow. No exception by file age or pattern-matched obviousness.

### CC.2 — Build-success gate after every commit, no batching

`npm run build` exits 0 after every individual commit, not just at the end of the cleanout. Per `feedback_d3_bundling_failure_modes` — batching strips hides which one broke what.

### CC.3 — Bundle-byte delta is part of the verification

Every strip section cites an expected `dist/assets/*.js` or `dist/` size change drawn from RUNTIME-DELTA §2.3 / INVENTORY-DATA §G. Deviation = regression: either the strip didn't fully land, or an unrelated change crept in. The deltas are the contract.

### CC.4 — Deployment-ID audit is a deploy gate

§S8's `scripts/audit-deployment-id.sh` runs in `.github/workflows/deploy.yml` as a pre-build step; no deploy proceeds with drift. Generalizes: any future "N-place rule" gets the same automated gate, not a manual checklist.

### CC.5 — Whitelist beats blacklist for build allow-lists

§S3 codifies the form: `copyPublicDir: false` + named-allow-list plugin. New `public/` subdirectories don't auto-ship; require an allow-list edit with a justification comment. Same posture for any future "filter what enters the bundle" mechanism.

### CC.6 — 51% doctrine — every strip is stability win, zero visual cost

Per `feedback_beautiful_first_lightweight_51`, no strip in this plan removes a visible feature; every entry is dev-only authoring code, build-only exclusion of authoring inputs, or two verified-orphan files. If a future strip target has visual cost, it does not belong in this plan — back to orchestrator.

### CC.7 — Couplers plan precondition is explicit

§S2's validation and §S9's observation cannot pass until couplers plan §1 ships and §S6's grep gate returns zero. Dependency direction: couplers plan first, cleanout second, basemap swap third. Plan-level locking is part of Phase B → Phase C handoff.

### CC.8 — Kit stays; production excludes

The repo is the Cartograph operator's environment. `src/cartograph/`, `src/arborist/`, `src/preview/`, `src/stage/`, `cartograph/`, `arborist/`, `meteorologist/`, plus their `data/` dirs, plus `public/trees/`, `public/models/`, `public/clouds/`, `public/looks/` source trees — all stay in the repo through v1. Production exclusion is by build-config + runtime-seam, never by source deletion. The two file deletions in §S3 are verified-orphan assets, not kit components.

---

## What this plan does NOT do

Inherits from couplers plan's non-scope:
- Does not specify per-coupler parametrization (see [`kit_couplers_parametrize.md`](kit_couplers_parametrize.md)).
- Does not author or implement the marriage leap sequencing (see `ls_basemap_swap.md`, not yet authored).
- Does not modify any runtime architecture or component graph (couplers plan §1 and §6 territory).
- Does not address security-audit posture for Supabase RLS or GAS PropertiesService (future Phase B doc).

Adds (this plan's own non-scope):
- **Does not delete any authoring source tree.** `src/cartograph/`, `src/arborist/`, `src/preview/`, `src/stage/` all stay. Build-side production exclusion via §S1 + couplers §1 + §S6 gate; not source deletion.
- **Does not touch Cary production infrastructure.** The following are production consumer surface, not authoring code, and are **non-targets** of every section in this plan: `src/components/CourierDashboard.jsx`, `src/components/CourierOnboarding.jsx`, `src/components/CourierDots.jsx`, `src/components/CaryAuth.jsx`, `src/components/SmsInbox.jsx`, `src/components/ContactModal.jsx`, `src/components/ChatModal.jsx`, `src/hooks/useCary.js`, `src/lib/supabase.js`. The `cary/` directory at repo root also stays.
- **Does not archive `CARY-BRIEF.md`.** Relocates per §S5b; final destination Phase-C-deferred.
- **Does not delete `apps-script/Code.js`** (§S7 gate only).
- **Does not retire helper backends or their `data/` dirs** (§S4 dev-only, stays through v1).
- **Does not perform the `public/models/` per-file audit.** Specifies its shape; execution deferred to a Phase C source-hygiene pass.
- **Does not address `public/textures/milky_way.jpg`'s 17 MB mobile cost** (RD.9 — perf-gate session, future).
- **Does not execute.** No file moves, no Vite-config edits, no quarantine moves performed by this document. Phase C executes.

---

## Carry-overs

Items surfaced during this plan's read pass:

| ID | Item | Where | Owner |
|---|---|---|---|
| CL.1 | **`public/lidar/` does not exist.** RUNTIME-DELTA §2.5 lists it ("unmeasured") but `ls public/` at `6cb89d2` shows no such directory. | RUNTIME-DELTA §2.5 | Next RUNTIME-DELTA touch |
| CL.2 | **`public/data/landmarks.json`** verdicted strip + delete per orchestrator (§S3 Part B). Vestigial duplicate of `src/data/landmarks.json`. Not pending audit; promoted into this plan. | RUNTIME-DELTA §2.5 (absent row) | This plan absorbs; flag for §2.5 update |
| CL.3 | **`public/weather-icons/`** verdicted ship — consumer verified at `src/lib/weatherCodes.jsx:41` (URL fetch). | RUNTIME-DELTA §2.5 (absent row) | This plan absorbs; flag for §2.5 update |
| CL.4 | **`public/logos/`** (16 LS business logos: png/jpg/webp) verdicted ship — consumer verified via `src/data/landmarks.json` URL refs rendered through `PlaceCard`. | RUNTIME-DELTA §2.5 (absent row) | This plan absorbs; flag for §2.5 update |
| CL.5 | **`public/cartograph-ground.svg`** verdicted strip + delete per orchestrator (§S3 Part B). Zero consumers anywhere in repo. RUNTIME-DELTA §1.2 already flagged "no runtime consumer" but did not promote to a §2.5 strip row. | RUNTIME-DELTA §2.5 (absent row) + §1.2 | This plan absorbs; flag for §2.5 update |
| CL.6 | **`.env.example`** may not exist at repo root. PUBLISH.md and couplers plan §5 imply an example file. If absent, add it as part of §S8's audit-script commit. | PUBLISH.md + couplers plan §5 | Phase C; trivial |
| CL.7 | **`concurrently` is `devDependencies`** (`package.json:41`) — confirms RUNTIME-DELTA RD.10 ("no prod concern"). | (verification of existing claim) | n/a |
| CL.8 | **`CARY-BRIEF.md` was framed as a stale handoff doc** in earlier drafts and in this plan's first revision. Reframed per R2: it's active Cary infrastructure spec, relocation-not-archive. `ls/BACKLOG.md` "Stale handoff docs" table should be updated to remove `CARY-BRIEF.md` if it ever appeared there, or to clarify it was never in the archival queue. | `ls/BACKLOG.md` | Next LS-trinity touch |
| CL.9 | **`public/codedesk/`** not measured. INVENTORY-DATA §F omitted it. Allow-listed for v1 (admin login surface, §S8 deployment-ID location 4). Size measurement is a Phase C addendum. | INVENTORY-DATA §F | Phase C |

**RUNTIME-DELTA §2.5 amendment summary** (consolidated for the next touch of that doc):
- Drop `public/lidar/` row (does not exist).
- Add `public/data/` row (verdict: strip + delete `landmarks.json`; rest of dir audit deferred).
- Add `public/weather-icons/` row (verdict: ship; consumer `src/lib/weatherCodes.jsx:41`).
- Add `public/logos/` row (verdict: ship; consumer `landmarks.json` → `PlaceCard`).
- Add `public/cartograph-ground.svg` row (verdict: strip + delete; promoted from §1.2's "no consumer" note).
- `public/textures/milky_way.jpg` mobile concern unchanged (RD.9 stands).

These are flagged for RUNTIME-DELTA's next touch; this plan's verdicts are authoritative regardless of when RUNTIME-DELTA is updated, per the inter-plan precedence rule (Phase B plans bind Phase C; RUNTIME-DELTA is Phase A reference).
