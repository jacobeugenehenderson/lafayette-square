# Kit ↔ Instance Couplers — Parametrize Plan

This plan defines the six couplers between the kit (Cartograph / Arborist / Meteorologist / Courier helpers) and each per-place instance (Lafayette Square is v1; future neighborhoods follow). It does not specify the cleanout (see [`pre_public_cleanout.md`](pre_public_cleanout.md), not yet authored) or the basemap swap (see [`ls_basemap_swap.md`](ls_basemap_swap.md), not yet authored). It does not execute. Output of Phase B; input to Phase C.

**Verification state.** Branch `cartograph-looks-pass-ab @ 6cb89d2` (local HEAD at write time) vs. local `main @ b39834b`. The Phase A diagnostic in [`../ls/reference/RUNTIME-DELTA.md`](../ls/reference/RUNTIME-DELTA.md) is verified against `b39834b vs origin/main @ 20866ef`; verdicts cited here are §2-derived and remain valid against the newer branch tip (recent commits are doc-only — LS BACKLOG reframe, Trinity late-session arc, FEATURES additions).

## Required reading

Read in this order before editing any coupler decision.

1. [`../README.md`](../README.md) — two-trinity index.
2. [`../ls/FEATURES.md`](../ls/FEATURES.md), [`../ls/ARCHITECTURE.md`](../ls/ARCHITECTURE.md), [`../ls/BACKLOG.md`](../ls/BACKLOG.md) — consumer-side trinity.
3. [`../cartograph/FEATURES.md`](../cartograph/FEATURES.md), [`../cartograph/ARCHITECTURE.md`](../cartograph/ARCHITECTURE.md), [`../cartograph/BACKLOG.md`](../cartograph/BACKLOG.md) — producer-side trinity.
4. [`../SLAB-CONTRACT.md`](../SLAB-CONTRACT.md) — boundary spec; the Cartograph coupler is partially specified there.
5. [`../ls/reference/RUNTIME-DELTA.md`](../ls/reference/RUNTIME-DELTA.md) — Phase A diagnostic; verdict source for every "parametrize" row this plan resolves.
6. [`../ls/reference/INVENTORY-DATA.md`](../ls/reference/INVENTORY-DATA.md), [`../ls/reference/INVENTORY-API.md`](../ls/reference/INVENTORY-API.md).
7. Memory: `project_kit_helpers_pattern`, `feedback_beautiful_first_lightweight_51`, `project_compass_only_camera_heading`, `feedback_no_speculative_cruft_lists`, `feedback_orphan_audit_full_repo`.

## Framework summary

| # | Coupler | Helper (kit) | Artifact (instance) | Runtime consumer | v1 shape |
|---|---|---|---|---|---|
| 1 | Cartograph (slab) | Cartograph | `public/baked/<look>/{ground,scene,lamps,buildings,trees-atlas}.{json,bin,png}` | `BakedGround`, `BakedLamps`, `InstancedTrees`, `LafayettePark`, `treeAtlasMaterial` | Full helper shipped; `lookId` lifted to instance module |
| 2 | Arborist | Arborist | `public/baked/default.json` + `public/baked/<look>/trees/*.glb` + atlas PNGs | `InstancedTrees`, `treeAtlasMaterial` | Full helper shipped; placements cross-look, atlas per-look |
| 3 | Meteorologist | Meteorologist (in Stage) | `public/clouds/{presets,almanac}.json` | None today (`CloudDome` procedural) | **Strip artifacts in v1**; defer wire to v1.1 |
| 4 | Courier (Cary) | Courier (future helper) | Per-instance Cary config (Supabase project + courier scope + property IDs) — inline at v1 | `useCary`, `CourierOnboarding`, `CourierDashboard`, `CourierDots`, `ChatModal`, `SmsInbox`, `ContactModal` | Hardcoded inline + `VITE_SUPABASE_*` env; helper deferred |
| 5 | Listings | Apps Script | GAS deployment ID + Sheets | `lib/api.js`, every consumer modal, `worker.js` | Build-time env (`VITE_API_URL`); no helper |
| 6 | Place (identity + geography) | n/a — instance module | `src/instance.js` (new) | `useWeather`, `useTimeOfDay`, `CelestialBodies`, `SidePanel`, `Scene`, `App`, `worker.js`, `InfoModal`, etc. | Single per-instance JS module; lat/lon, lookId, display name, conservancy strings, OG copy |

Six rows; the rest of the doc elaborates one per section.

---

## 1. Cartograph coupler — the slab

### Authoring source

Cartograph publishes the slab via its bake chain: `cartograph/bake-ground.js`, `cartograph/bake-buildings.js`, `cartograph/bake-lamps.js`, `cartograph/bake-scene.js`, `cartograph/bake-ground-ao.js`, plus arborist's `bake-trees.js` (which lives in Arborist's coupler — §2 — but writes the per-look tree atlas as part of the same slab directory). Operator hits "Bake" in Stage; `cartograph/serve.js` runs the chain via `runShell` (POST `/api/cartograph/looks/:id/bake`); per-step `needsRebuild` skips no-op steps. The full canonical pipeline is documented in [`../cartograph/FEATURES.md` §"Data flow & the bake chain"](../cartograph/FEATURES.md) and the artifact directory + binary layouts in [`../SLAB-CONTRACT.md`](../SLAB-CONTRACT.md).

### Runtime consumer

The slab is fetched at boot by five production components, all under `src/components/`, each with their own `?t=<bakeLastMs>` cache-bust pattern:

- `BakedGround.jsx:294-298` — `ground.json`, `ground.bin`, `scene.json` (+ `ground.lightmap.png` via Three.js loader).
- `BakedLamps.jsx:37-41` — `lamps.json` + `scene.json`.
- `InstancedTrees.jsx:211,298` — `default.json` + `scene.json` + per-look GLB variants and atlas (atlas read via `treeAtlasMaterial.js:126`).
- `LafayettePark.jsx:425` — `scene.json` only (bake-aware offsets/lifts).
- `treeAtlasMaterial.js:126` — `trees-atlas.json` + atlas PNGs.

RUNTIME-DELTA §1.1 confirms every one of these mounts is **new on branch vs. main** (main is fully pre-slab via `VectorStreets` + `StreetRibbons`, which no longer exist on branch). RUNTIME-DELTA §2.2 flags that all five reach into `useCartographStore` for `activeLookId` + `bakeLastMs` + `layerColors` + `materialPhysics` — the store seam, addressed in this coupler's *Coupling mechanism*.

### Per-instance variables

The slab artifact itself is fully per-instance — `public/baked/lafayette-square/` is the LS payload; a future neighborhood gets `public/baked/<otherlook>/`. The per-instance **consumer-side** variables — what the runtime needs to know to point at the right slab — are tiny:

| Variable | Where today | Per-instance? |
|---|---|---|
| `lookId` string | `src/components/Scene.jsx:942` (hardcoded `"lafayette-square"`) | ✅ yes |
| `bakeLastMs` (cache-bust seed) | `useCartographStore.bakeLastMs` (authoring store) | ❌ produced by the bake server; instance-agnostic |
| `layerColors`, `materialPhysics`, `materialColors`, `buildingPalette`, `lampGlow` | `useCartographStore` reads on six components (RUNTIME-DELTA §2.2) | ❌ should travel **inside** `scene.json`, not via the cartograph store |

The pull is that there is structurally **one** per-instance variable on the runtime side: `lookId`. Everything else either lives in the slab itself (look-keyed automatically by the directory) or is dev-time authoring state that has no business in production.

### Coupling mechanism (decision)

Two-part decision:

1. **`lookId` resolves through a new `src/instance.js` module** (introduced by the Place coupler — §6). Components import `INSTANCE.lookId` instead of taking a `lookId` prop or reading the cartograph store. `Scene.jsx:942` becomes `<BakedGround lookId={INSTANCE.lookId} />`; the prop chain in `BakedGround` / `BakedLamps` / `InstancedTrees` keeps the prop (with `INSTANCE.lookId` as default) so authoring contexts can still override per-Look.
2. **The six `useCartographStore` reads move behind a minimal slab-side data hook** — `useSceneJson` (or equivalent), living in `src/lib/` or `src/hooks/`, distinct from `src/cartograph/stores/useCartographStore.js`. The hook fetches `scene.json` once per `(lookId, bakeLastMs)` pair (already fetched by `BakedGround` / `BakedLamps` / `LafayettePark` — the hook consolidates and memoizes), and exposes the consumed fields: `layerColors`, `lampGlow`, `materialPhysics`, `materialColors`, `buildingPalette`. Production replaces every `useCartographStore(...)` read on the six components (RUNTIME-DELTA §2.2) with a `useSceneJson(...)` read; the cartograph store stops being a runtime dependency. Authoring builds still mount the cartograph store (cartograph chunk only), so live-tuning in Stage / Designer continues to work through that path.

Justification: `lookId` is identity (per-instance, module-shaped); the rest is style (slab-published, hook-shaped). The hook is deliberately thin — it's a slab data adapter, not a state container — so it can't accrete the kind of authoring-only concerns that drove `useCartographStore` to 1313 lines. Keeping it distinct from the cartograph store is what makes the seam load-bearing in the right direction.

### What breaks if this is wrong

Wrong `lookId` → every slab fetch 404s; `BakedGround`, `BakedLamps`, `InstancedTrees`, `treeAtlasMaterial` all error to their boundary. The scene mounts but the ground is gone, no trees, no lamps. Loud failure — won't ship by accident. Worse case: a `lookId` that exists but is the wrong scene (e.g. `"toy"`) — geometry renders but bbox / stencil / palette is for a different place; user sees a stylized-correct but spatially-nonsensical scene. Mobile users on cellular pay the slab download for nothing. The verification gate below is designed to catch both.

### V1 carve-out

Ship full. The Cartograph helper is the most mature in the kit; the slab is already published per-look; the only remaining work is collapsing the store seam (`useCartographStore` → `scene.json` + `INSTANCE.lookId`). Two carve-outs:

- **`buildingPalette` live-tuning stays a Stage feature.** Production reads `scene.json` once at mount and freezes; Stage keeps its live-wire `useFrame` palette pull. The 51%-doctrine framing: shipping live-tuning to prod is a stability cost (every authoring keystroke would invalidate prod material state) with no visual win (users can't author). Make the runtime read static; keep authoring static-after-bake too.
- **`bakeLastMs` source in production.** Today the value comes from `useCartographStore`'s in-memory state, which is reset to `Date.now()` on app boot if the store is fresh (RUNTIME-DELTA §1.3 flags this as a Phase B verify). For production the seed is the **bake's mtime of `ground.json`** (cleverness, not a new artifact): emit a `bakedAt` epoch into the existing `scene.json` manifest at bake-time, runtime reads that. One-line bake change; existing `scene.json` consumers (`BakedGround`, `BakedLamps`, `LafayettePark`) already fetch it.

### Verification gate

1. **Mobile, cellular-throttled:** load `/` on iPhone UA (Safari, Chrome iOS). DevTools Network filter `baked/` — every request returns 200 with `?t=<epoch>` matching `bakedAt`. No console errors from any of the five consumers. Ground renders; lamps glow at sunset; trees stand; no visual gaps where the park's water/paths would be (`LafayettePark` lift is correct).
2. **Look swap (sanity):** temporarily set `INSTANCE.lookId = 'toy'`. Reload. The scene should render the toy fixture — not LS — confirming the lookId is the only steering variable. Revert.
3. **No cartograph chunk in main bundle:** `dist/assets/main-*.js` and `dist/assets/index-*.js` contain no `useCartographStore` references after the seam collapse. (This is the link to `pre_public_cleanout.md`; gate here is structural — if `useCartographStore` survives in `main`, this coupler isn't done.)

### Cross-references

- [`../SLAB-CONTRACT.md`](../SLAB-CONTRACT.md) §§1–10 — boundary spec, including producer/consumer contracts.
- [`../ls/reference/RUNTIME-DELTA.md`](../ls/reference/RUNTIME-DELTA.md) §1.1 (mount diffs), §1.2 (input diffs), §2.2 (store seam), §1.3 (`bakeLastMs` boot verify).
- [`../ls/ARCHITECTURE.md`](../ls/ARCHITECTURE.md) §1 ("Boundary-crossing imports") and §2 (slab consumption table).
- [`../cartograph/ARCHITECTURE.md`](../cartograph/ARCHITECTURE.md) §3 (Looks model) and §5 (runtime composition).
- Memory: `project_compass_only_camera_heading` — frame canon; no coupler may inject a rotation. `project_writeifchanged_touches_mtime` — bakeLastMs propagation depends on this discipline holding.

---

## 2. Arborist coupler

### Authoring source

Arborist publishes via `arborist/bake-trees.js` (CLI runnable; also invoked by Cartograph's bake chain). Inputs: species roster + variants in `arborist/data/`, placements from `src/data/park_trees.json` (Python ETL, point-in-polygon-filtered against the real park boundary — see `cartograph/FEATURES.md §"Arborist is the only tree-placement authority"`), plus the active look's atlas styling pulled from `public/looks/<look>/design.json`. Outputs:

- `public/baked/default.json` — **cross-look** placements (same trees at same XZ in every look; only atlas varies).
- `public/baked/<look>/trees/<species>/skeleton-N-lod2.glb` — per-look UV-rewritten GLB variants.
- `public/baked/<look>/trees-atlas.json` + `trees-atlas-{bark,leaves}-{color,normal}.png` — per-look atlas.

### Runtime consumer

`src/components/InstancedTrees.jsx` (production) reads `default.json` + the per-look GLBs (line 298 path-builds `/baked/${lookName}${url}${atlasVersion}`). `src/components/treeAtlasMaterial.js:126` reads `trees-atlas.json` + atlas PNGs.

### Per-instance variables

| Variable | Where today | Per-instance? |
|---|---|---|
| `lookName` for atlas + GLBs | `InstancedTrees.jsx` reads from cartograph store via `propLookId` resolution | ✅ same `INSTANCE.lookId` as §1 |
| Tree placements scope | `arborist/bake-trees.js` reads `src/data/park_trees.json` (LS-specific, Python ETL output) | ✅ per-instance — but lives in the **producer's** data tree; consumer is unaffected |
| Park boundary for point-in-polygon | `arborist/bake-trees.js` uses a hardcoded LS park polygon today | ✅ producer-side; lift handled by Arborist's own kit-scope work, not by this coupler |

### Coupling mechanism (decision)

**Same as §1.** `INSTANCE.lookId` steers the atlas + GLB URLs; the cross-look placements file (`default.json`) is intentionally instance-agnostic by helper design (one bake covers every look of one neighborhood). The producer-side per-instance bits (park boundary, source ETL) are Arborist-internal — Phase B does not need to redesign them for v1 because LS-as-v1 already has them; future instances will require Arborist to grow a scene parameter, but that's an Arborist v1.1 backlog item, not a Phase C blocker.

### What breaks if this is wrong

Wrong `lookId` for the trees path → GLB 404s; trees disappear or boundary-error. Tree atlas mismatch (e.g., placements from `default.json` reference species the atlas doesn't carry) → fallback variant or empty draw; `InstancedTrees`'s `unmatched` count in `default.json` should be 0 (SLAB-CONTRACT §8); a non-zero value here indicates a bake-pipeline drift, not a coupler error.

### V1 carve-out

Ship full. Arborist is the second-most-mature helper after Cartograph; placements + atlas pipeline is verified on LS. The kit-side work (Arborist becoming scene-parametric so a second neighborhood can be baked) is **out of scope** for v1 — explicitly deferred to a future session. LS's existing `park_trees.json` ETL + LS park boundary stay hardcoded inside Arborist's CLI for v1.

### Verification gate

1. **Mobile + desktop:** load `/`. Trees render (rotated, tile-binned, lampGlow-blended). Network tab shows ~25 distinct GLB requests (one per `uniqueVariants` per SLAB-CONTRACT §8), all 200, all under `/baked/lafayette-square/trees/`. Atlas PNGs (4 files: bark color/normal, leaves color/normal) all 200.
2. **No `unmatched` regressions:** open `/baked/default.json`, confirm `"unmatched": 0`.
3. **GPU budget:** Preview (post-pre-public cleanout, if `/preview.html` is still reachable) reports tree-layer cost matches the May 2026 baseline. If Preview is stripped per the cleanout plan, fall back to manual frame inspection on mobile.

### Cross-references

- [`../SLAB-CONTRACT.md`](../SLAB-CONTRACT.md) §§7–8 — atlas + placement schemas.
- [`../cartograph/FEATURES.md`](../cartograph/FEATURES.md) §"Arborist is the only tree-placement authority".
- [`../ls/reference/INVENTORY-DATA.md`](../ls/reference/INVENTORY-DATA.md) §A (slab artifacts) row "Tree GLB variants" / "Tree atlas".
- Memory: `feedback_preview_uses_production_pipeline` — Preview consumes the same production artifacts; tree verification must round-trip through `/baked/`.

---

## 3. Meteorologist coupler

### Authoring source

`meteorologist/serve.js` (`localhost:3335`) plus a Stage-hosted UI inside Sky & Light. Publishes `public/clouds/presets.json` + `public/clouds/almanac.json` (28 KB total per INVENTORY-DATA §F). The publish loop exists; the helper's authoring surface lives inside Stage per [`../cartograph/ARCHITECTURE.md`](../cartograph/ARCHITECTURE.md) §1.

### Runtime consumer

**None.** `CloudDome` (mounted by `Scene.jsx`) is fully procedural — it does not read `presets.json` or `almanac.json`. RUNTIME-DELTA §1.1 (Sky / TOD / weather row) confirms: "`CloudDome` still **procedural** — `public/clouds/{presets,almanac}.json` published but no consumer." RUNTIME-DELTA §3.6 reiterates. INVENTORY-DATA §A row "Cloud presets + almanac" marks them ❌ not consumed.

Carry-over K.2 in [`../ls/BACKLOG.md`](../ls/BACKLOG.md): "Either wire `CloudDome` to consume or remove the artifacts." This coupler is where Phase B resolves K.2.

### Per-instance variables

If consumed at runtime, the per-instance variables would be:

| Variable | Per-instance? |
|---|---|
| Cloud preset library | ❌ kit-scope (Meteorologist authors per Look, not per place) |
| Almanac (per-month weather rules) | ✅ likely per-instance — weather patterns differ by region |

Because there is no consumer today, the per-instance question is theoretical for v1.

### Coupling mechanism (decision)

**Strip the artifacts in v1.** `public/clouds/presets.json` + `public/clouds/almanac.json` are removed from the ship — they are 28 KB on disk and 0 KB worth of behavior. The Meteorologist helper itself (CLI + Stage UI inside `/cartograph.html`) is dev-only and gets stripped alongside the rest of the cartograph chunk in [`pre_public_cleanout.md`](pre_public_cleanout.md). The artifact files in `public/clouds/` stay in the repo (Meteorologist still publishes them locally for the in-flight authoring work), but the prod build whitelist excludes them.

Justification: doctrine (`feedback_beautiful_first_lightweight_51`) says never compromise visual to be lightweight; here there is no visual cost because no consumer exists. The "wire `CloudDome` to consume" path is a v1.1 carve-out — it can land as a non-blocking concurrent track once a runtime cloud consumer is designed. Shipping unconsumed artifacts is the only worse option than shipping nothing.

### What breaks if this is wrong

Nothing breaks at v1 — no consumer was using them. The forward risk is that v1.1 cloud work has to re-publish via a fresh authoring session before it can ship. That is a small cost and the right ordering: ship lightweight, then add deliberately. Wrong direction (keep + don't wire) would leak the artifacts forever, and "stripped one day" memory pressure compounds.

### V1 carve-out

The carve-out **is** v1's posture: helper exists in dev, artifacts not shipped, no consumer yet. v1.1 wires `CloudDome`. v2 (a second instance) is when per-instance almanac becomes load-bearing.

### Verification gate

1. **`dist/clouds/` does not exist** after `npm run build`. (Will become a row in the `pre_public_cleanout.md` whitelist gate.)
2. **No regression** in cloud rendering — `CloudDome` was procedural on both sides; the strip removes nothing it ever read. Visual smoke: load `/` on mobile + desktop, observe daytime sky has clouds, sunset has lit clouds, night has dimmed clouds — same as today.

### Cross-references

- [`../SLAB-CONTRACT.md`](../SLAB-CONTRACT.md) §11 — explicitly notes clouds are not part of the slab contract.
- [`../ls/BACKLOG.md`](../ls/BACKLOG.md) Carry-over K.2.
- [`../ls/reference/RUNTIME-DELTA.md`](../ls/reference/RUNTIME-DELTA.md) §2.4 (verdict "strip unless `CloudDome` is wired") and §3.6.
- [`../meteorologist/SPEC.md`](../meteorologist/SPEC.md) — helper build plan; not referenced for v1.
- Memory: `project_kit_helpers_pattern` — helpers are kit-scope; "Meteorologist" stays in the kit even when its first instance's artifact ships empty.

---

## 4. Courier (Cary) coupler

### Authoring source

No helper exists today. Per `project_kit_helpers_pattern` memory, **Courier is the kit-level helper name; Cary is LS's instance**. The kit-helper that would author per-place courier config has not been built. v1's "Cary at Lafayette Square" is hardcoded inline across `src/components/Courier*.jsx`, `src/components/CaryAuth.jsx`, `src/hooks/useCary.js`, plus per-instance Supabase URL + anon key from env.

### Runtime consumer

- `src/hooks/useCary.js` — request/session/auth state, Supabase queries + realtime channels.
- `src/components/CourierOnboarding.jsx`, `CourierDashboard.jsx`, `CaryAuth.jsx` — UI; per `useCary`.
- `src/components/CourierDots.jsx` — realtime `courier_locations` subscription.
- `src/components/ChatModal.jsx`, `SmsInbox.jsx`, `ContactModal.jsx` — Supabase edge functions for messaging.
- `src/hooks/useInit.js` — boot fetches `courier_profiles` row.

All Supabase access goes through `src/lib/supabase.js:10-11` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

### Per-instance variables

| Variable | Where today | Per-instance? |
|---|---|---|
| Supabase project URL | `VITE_SUPABASE_URL` (env) | ✅ different instance = different Supabase project |
| Supabase anon key | `VITE_SUPABASE_ANON_KEY` (env) | ✅ paired with URL |
| Courier service name | hardcoded "Cary" — many sites; `CourierDashboard.jsx:347` "Cary is Lafayette Square's neighborhood delivery service" | ✅ per-instance proper noun |
| Legal entity name | `CourierOnboarding.jsx:587` "Jacob Henderson LLC, DBA Lafayette Square Deliveries" | ✅ per-instance |
| Service scope copy | `CourierOnboarding.jsx:542`, `CaryAuth.jsx:82` ("Cary at Lafayette Square") | ✅ per-instance |
| Default trip place_name | `CourierDashboard.jsx:276` "near Lafayette Square" | ✅ falls through to `INSTANCE.placeName` |
| SMS contact number | `PlaceCard.jsx:4093,4102,4117` `+18773351917` | ✅ per-instance |

### Coupling mechanism (decision)

**Per-instance JS module (`src/instance.js`) for naming + scope copy + SMS contact; build-time env for the Supabase secrets.** The Cary-the-system code (`useCary.js`, `Courier*.jsx`, edge functions) stays generic — it reads `INSTANCE.courier.brandName`, `INSTANCE.courier.legalEntity`, `INSTANCE.courier.smsNumber` instead of hardcoding "Cary" / "Lafayette Square Deliveries" / "+18773351917". The per-instance Supabase project stays in `VITE_SUPABASE_*` env where it already lives.

**No Courier helper for v1.** The kit-level helper (the eventual `courier/` app that would author per-instance courier config the way Cartograph authors slab) is deferred. v1 ships with the inline coupler + env vars. Doctrine framing: the helper is not load-bearing for shipping LS; building it now to satisfy four-helper symmetry would slow the marriage leap with zero visible benefit.

Justification: Supabase URL + key are deploy-time constants that already live in env — moving them to a runtime artifact would gain nothing and would leak the URL into a slab file. The naming/copy bits are JSX-readable strings that the runtime needs at render time — a JS module fits more naturally than a JSON fetch.

### What breaks if this is wrong

Wrong Supabase URL → all Cary queries 404; `useCary` falls through to its safe-stub (`src/lib/supabase.js` returns a stub when env vars missing); Cary surfaces inert. Wrong brand strings → users see "Lafayette Square" copy in another instance's UI ("Cary at the wrong place"). Both modes are loud enough to catch in a smoke test. The Supabase RLS posture (deferred to Phase B's security audit per [`../ls/BACKLOG.md`](../ls/BACKLOG.md) Concurrent / non-blocking) is the higher-stakes risk and is **not in scope here**.

### V1 carve-out

The carve-out IS v1: hardcoded helper, env-vared secrets, no `courier/` directory yet. Cary surfaces stay behind "coming soon" per `PUBLISH.md §5` regardless — the visible coupler at v1 is mostly the contact-form SMS path, which works today. The full Courier helper lands when a second instance demands it.

### Verification gate

1. **Cary "coming soon" placeholder renders** on `/` for non-onboarded users; tapping it surfaces the onboarding link/SMS contact correctly with `INSTANCE.courier.smsNumber`.
2. **Stub safety:** delete `VITE_SUPABASE_URL` from local `.env`, reload, confirm no console errors and that Cary UI is gracefully inert (per `src/lib/supabase.js` design). Restore env.
3. **Brand-string audit:** grep `dist/assets/*.js` for `"Lafayette Square Deliveries"` and `"+18773351917"` — both must appear (proves the inline coupler resolved at build). Grep for the literal strings inside `src/components/Courier*` source — both must be **absent** after the coupler lift (proves no double-source). Mobile.
4. **CourierDashboard's `place_name` fallback:** stub a request with `place_name=null`; confirm UI reads "near Lafayette Square" via `INSTANCE.placeName`, not a hardcoded string.

### Cross-references

- Memory: `project_kit_helpers_pattern` — Courier (helper) vs. Cary (instance) distinction is canonical.
- [`../ls/reference/INVENTORY-API.md`](../ls/reference/INVENTORY-API.md) §B — Supabase tables, RPCs, edge functions, auth.
- [`../ls/reference/INVENTORY-DATA.md`](../ls/reference/INVENTORY-DATA.md) §C — backend touchpoints.
- [`../ls/BACKLOG.md`](../ls/BACKLOG.md) Concurrent / non-blocking row "Cary v1 status decision".
- Carry-over: a future `pre_public_cleanout.md` security pass owns the Supabase RLS audit. Not this coupler.

---

## 5. Listings coupler

### Authoring source

Google Apps Script — `apps-script/Code.js`, deployed as a web app. Stateful storage in Google Sheets (Listings, Checkins, Reviews, Events, Guardians, Residents, LobbyPosts, Handles, QRDesigns, Bulletins, Comments, Threads, Messages — per INVENTORY-API §A "GAS Sheets"). Not a helper in the kit sense — there is no "Listings helper app" — but functionally GAS plays the role: a per-instance backend that authors and serves the listings catalog and writeable user state.

### Runtime consumer

`src/lib/api.js:6` (`API_URL = import.meta.env.VITE_API_URL || ''`) wraps the entire GAS call surface (40+ endpoints per INVENTORY-API §A). Every consumer modal + boot fetch (`hooks/useInit.js`) routes through `lib/api.js`. The Cloudflare Worker (`worker.js:51` `GAS_API`) also queries GAS for OG meta.

Per `PUBLISH.md §"Single source of truth"` (cited in INVENTORY-API §A), the GAS deployment ID must match in five places: `PUBLISH.md`, `.env`, GitHub Secret, `public/codedesk/index.html` `window.LSQ_API_URL`, and `worker.js` `GAS_API`. Drift = "Unknown-action" runtime errors.

### Per-instance variables

| Variable | Where today | Per-instance? |
|---|---|---|
| GAS deployment ID (in URL) | `VITE_API_URL` env | ✅ different instance = different GAS web app deployment |
| Worker `GAS_API` constant | `worker.js` (currently mirrors deployment ID) | ✅ same value as `VITE_API_URL` |
| Sheets backing the deployment | Google Drive, scoped to the deployment | ✅ per-instance (a different instance has a different spreadsheet) |
| Apps Script source | `apps-script/Code.js` | ❌ kit-scope — one source, deployed per instance |

### Coupling mechanism (decision)

**Build-time env var** (`VITE_API_URL`), already in place. The Worker reads its own constant (`worker.js` `GAS_API`); both must be set from the same source per deploy. No JSON artifact. No JS module. Env is exactly right for a value that:

- Must be set at build-time (Vite inlines `import.meta.env.*` at build, not at runtime).
- Is a deploy-time secret-ish constant (the URL contains the deployment ID, which is access control).
- Already has working infrastructure (`.env`, GitHub Secrets, `lib/api.js` fallback to mocks when missing).

The five-place rule (PUBLISH.md) is the operational hazard; v1's only structural improvement is documenting it clearly in `pre_public_cleanout.md`'s deploy section. Don't invent a new mechanism.

### What breaks if this is wrong

Wrong `VITE_API_URL` → every GAS call returns "Unknown-action" or HTML (the Apps Script error page). All consumer modals fail; `useInit` bricks; the app renders the scene but every user-visible state is empty. Worker mismatch → OG meta tags for `/place/*` show stale data. Five-place drift is the historical bug per PUBLISH.md.

### V1 carve-out

Ship as-is. The env var, the `lib/api.js` wrapper, the Worker constant, the codedesk page constant, the PUBLISH.md heading — all five are in place for LS. Per-instance deploy means swapping the env var + Worker constant + codedesk constant + PUBLISH.md heading; the Apps Script source itself stays single-tracked. No helper to build.

### Verification gate

1. **Smoke load** of `/` on mobile + desktop: Network filter shows GET to `VITE_API_URL?action=init...` returning 200 JSON with `listings` array. PlaceCards open with full hours/photos/menus.
2. **Dev fallback:** unset `VITE_API_URL` locally → dev server uses `lib/api.js`'s in-memory mocks; no console errors; UI shows seeded data. Re-set; confirm live data returns.
3. **Worker OG check:** `curl -A "facebookexternalhit/1.1" https://lafayette-square.com/place/<some-id>` — response contains `<meta property="og:title">` with the listing's name (proves Worker's GAS_API matches).
4. **Five-place audit** before deploy: run a one-shot grep over the repo (`PUBLISH.md`, `.env.example`, `.github/workflows/deploy.yml`, `public/codedesk/index.html`, `worker.js`) to confirm the same deployment ID. Make this a documented checklist row in `pre_public_cleanout.md`.

### Cross-references

- [`../ls/reference/INVENTORY-API.md`](../ls/reference/INVENTORY-API.md) §A — endpoint catalog + Sheets + single-source-of-truth callout.
- [`../PUBLISH.md`](../PUBLISH.md) — deploy + DNS + secrets (orthogonal but cross-linked here).
- Memory: `feedback_orphan_audit_full_repo` — any "is this endpoint used?" question must grep the full repo, not just `src/`.

---

## 6. Place (identity + geography) coupler

### Authoring source

n/a — this is the only coupler with no helper, present or future. Place is **the per-instance identity layer**: lat/lon, look ID, display name, conservancy strings, social copy, legal strings, OG meta. It's authored by editing a per-instance JS module in source. The kit (Cartograph, Arborist, Meteorologist, Courier-future) does not publish identity; identity is what the kit attaches *to*.

### Runtime consumer

Today the place identity is scattered across runtime code as hardcodes. RUNTIME-DELTA §2.6 ("parametrize" verdicts) and INVENTORY-DATA §A ("Production `Scene.jsx:942` hardcodes `lookId='lafayette-square'`") flag them; this coupler enumerates them.

### Per-instance variables

The exhaustive list, with current location:

| Domain | Variable | Where (file:line) |
|---|---|---|
| Geography | Latitude `38.6160` | `src/hooks/useTimeOfDay.js:5`, `src/components/CelestialBodies.jsx:14`, `src/components/SidePanel.jsx:117` |
| Geography | Longitude `-90.2161` | `src/hooks/useTimeOfDay.js:6`, `src/components/CelestialBodies.jsx:15`, `src/components/SidePanel.jsx:118` |
| Geography | open-meteo URL with embedded `latitude=38.616&longitude=-90.2161` and `timezone=America/Chicago` | `src/hooks/useWeather.js:3` |
| Look | `lookId` | `src/components/Scene.jsx:942` |
| Name | Display name "Lafayette Square" | `src/App.jsx:551` (alt text), `src/components/Scene.jsx:900` (aria-label), `src/components/InfoModal.jsx:163,165,167,169,171,183,196`, `src/components/BulletinModal.jsx:742,1177`, `src/components/ChatModal.jsx:182`, `src/components/CourierDashboard.jsx:276,347`, `src/components/CaryAuth.jsx:82`, `src/components/PlaceCard.jsx:4093,4102,4117,4147,4160,4176` |
| Brand | "Lafayette Square Deliveries" legal entity | `src/components/CourierOnboarding.jsx:542,587` |
| Locale | "St. Louis" / "Missouri" tax + flag color references | `src/components/PlaceCard.jsx:141` (flag blue), `:2938` (tax rate), `src/hooks/useListings.js:16,66`, `src/components/SidePanel.jsx:116` (comment), `src/components/CelestialBodies.jsx:13` (comment), `src/hooks/useTimeOfDay.js:4` (comment) |
| OG / SEO | "Lafayette Square" in worker title fallback + suffix | `worker.js:51,72` |
| OG / SEO | `ORIGIN` / `VANITY` `https://lafayette-square.com` | `worker.js:2,3` |
| OG / SEO | CNAME | `public/CNAME:1` |
| Conservancy | "Lafayette Square Conservancy" specific copy | `src/components/InfoModal.jsx:165` |
| Historic district | "Lafayette Square Historic District" | `src/hooks/useListings.js:66` |
| SMS contact | `+18773351917` | `src/components/PlaceCard.jsx:4093,4102,4117` |

Also: `CARY-BRIEF.md` (root) and `cary/` directory (root) carry Cary-the-instance scope that overlaps with §4 — those are authoring docs, not runtime code, and ride with `pre_public_cleanout.md`'s strip pass rather than this coupler.

### Coupling mechanism (decision)

**A single per-instance JS module: `src/instance.js`.** Shape:

```js
export const INSTANCE = {
  lookId: 'lafayette-square',
  placeName: 'Lafayette Square',
  placeNameLong: 'Lafayette Square, St. Louis',
  geography: { lat: 38.6160, lon: -90.2161, timezone: 'America/Chicago' },
  conservancy: 'Lafayette Square Conservancy',
  historicDistrict: 'Lafayette Square Historic District',
  flagColor: '#0055A4',
  taxRate: 0.08725,
  courier: { brandName: 'Cary', legalEntity: 'Jacob Henderson LLC, DBA Lafayette Square Deliveries', smsNumber: '+18773351917' },
  og: { vanity: 'https://lafayette-square.com', titleSuffix: 'Lafayette Square' },
};
```

All cited consumers above import `INSTANCE` and read the field they need. `useWeather.js` builds its open-meteo URL by template, not as a fixed string. The Worker has its own per-instance constants block at the top of `worker.js` — it can't import the module (Worker is a separate JS file deployed to Cloudflare), so it gets its own small constants object that mirrors the relevant fields (`placeName`, `og.vanity`, `og.titleSuffix`); the build-time check in §5's verification gate adds `worker.js` to the consistency audit.

Why a module, not env, not artifact:
- These are JSX-readable strings + numeric constants — a module fits naturally at render time without `import.meta.env` indirection.
- They're not secrets (no need for build-time injection).
- They change with the instance, not with the deploy of the instance — a module captures that semantically. A new instance is `src/instance.<name>.js` swapped in at build time (or a per-instance branch, depending on how multi-instance deploys land).
- Vite tree-shakes a JS module cleanly; the artifact path would add an HTTP fetch for no win.

The carve-out: **the OG/SEO bits in `worker.js`** stay duplicated at the Worker top, because Cloudflare Workers can't read app modules. Document the duplication in `worker.js` with a one-line comment pointing back to `src/instance.js`.

### What breaks if this is wrong

Wrong lat/lon → sun azimuth + sunrise + sunset wrong (visible misalignment with real time of day on day-one of any deploy); compass-N still right because compass-N is a slab-geometry concern, not lat/lon. Wrong `lookId` → §1 failure mode. Wrong place name → users see another instance's name in copy, alt text, OG meta. Wrong SMS number → users SMS the wrong number when contacting Cary. Wrong tax rate → PlaceCard arithmetic off by a few cents. None of these are silent: a sunrise misalignment is the worst-feeling visible failure because the whole sky theatre depends on it (memory: `feedback_beautiful_first_lightweight_51`).

### V1 carve-out

`src/instance.js` ships with LS as its only entry. Multi-instance build (multiple modules, build-time selection) is a v2 concern. The Worker stays self-contained with mirror constants for v1 + v2.

### Verification gate

1. **Geography:** load `/` at a known time of day; sun azimuth + altitude match a reference (e.g., suncalc.org for `38.616, -90.2161`, current minute). On mobile + desktop. This is the single most user-visible test of this coupler.
2. **Weather:** Network tab → request to open-meteo has `latitude=38.616&longitude=-90.2161&timezone=America/Chicago`. Response 200. `WeatherPoller` updates the runtime.
3. **Brand strings rendered:** `dist/assets/*.js` contains "Lafayette Square" exactly as expected (via the module's compiled output). All listed source files (RUNTIME-DELTA + this section) no longer contain the literal "Lafayette Square" string after the lift — grep them post-edit.
4. **Worker OG:** `curl -A "facebookexternalhit/1.1" https://lafayette-square.com/` returns `<meta property="og:site_name" content="Lafayette Square">`. Per §5's gate but the verifier here is `worker.js`'s mirror constants.
5. **Single-grep audit:** `grep -rn "38.616" src/ worker.js` returns at most two locations after the lift: `src/instance.js` and `worker.js` (if Worker mirrors it). Same audit for `-90.2161`, `lafayette-square` (lowercase look ID).

### Cross-references

- [`../ls/reference/RUNTIME-DELTA.md`](../ls/reference/RUNTIME-DELTA.md) §2.6 — aggregated parametrize ledger names every variable above.
- [`../ls/ARCHITECTURE.md`](../ls/ARCHITECTURE.md) §6 — explicit callout on hardcoded `lookId` + St. Louis lat/lon.
- [`../cartograph/FEATURES.md`](../cartograph/FEATURES.md) §"Frame discipline" — compass-only canon; lat/lon is metadata, never a rotation source.
- Memory: `project_compass_only_camera_heading` — lat/lon does **not** drive any rotation in scene geometry; it drives sun, sky, weather only.
- Memory: `feedback_no_speculative_cruft_lists` — this enumeration is grounded in grep-verified locations as of the cited SHAs, not a forecast of what "probably exists elsewhere." If the grep at execution time turns up additional sites, this section gets amended, not bypassed.

---

## Cross-cutting decisions

Rules that apply across all six couplers; called out here so each section above doesn't restate them.

### CC.1 — `INSTANCE` is the only per-instance runtime module

Couplers §1, §2, §4, §6 all rely on `src/instance.js`. There is exactly one such module per build; no per-component sub-modules, no JSON instance-config. Multi-instance support is build-time module swapping, not runtime lookup.

### CC.2 — Slab artifacts carry their own cache-busting

Every consumer fetch under `public/baked/<look>/*` uses `?t=<bakeLastMs>` (or the post-§1 `bakedAt` from `scene.json`). This is already SLAB-CONTRACT §1's rule; preserved here to remind that the Cartograph + Arborist couplers don't need separate cache controls.

### CC.3 — No coupler may inject a rotation constant

Per `project_compass_only_camera_heading` memory and `cartograph/FEATURES.md §"Frame discipline"`. The Place coupler carries lat/lon, but lat/lon never rotates scene geometry — it drives sun/sky/weather only. If any coupler emits an angle constant, the architecture is wrong.

### CC.4 — Authoring scope vs. instance scope is invariant

Helpers are kit-scope proper nouns (Cartograph, Arborist, Meteorologist, Courier); each instance is its own proper noun (Lafayette Square, Cary). Per `project_kit_helpers_pattern` memory. No coupler may bake "lafayette-square" into the helper layer; no coupler may pull "Courier" out of the helper layer.

### CC.5 — 51% doctrine resolves every coupler tradeoff

When a coupler decision has a tradeoff between visual quality and stability/lightweight, the resolution is **cleverness, not compromise** (`feedback_beautiful_first_lightweight_51`). Applied here: the §3 strip is a stability win with zero visual cost; the §1 `bakeLastMs` → `scene.json.bakedAt` move is a stability win via a one-line bake change rather than introducing a new artifact.

### CC.6 — Producer-side per-instance scope is not this plan's problem

Each helper grows its own scene-parametric authoring surface over time (Cartograph already has it in bake-ground; Arborist hardcodes the LS park boundary; Meteorologist has no per-instance scoping). Those evolutions are kit-side; this plan only specifies the **consumer-side** coupler shape per place. Helper kit-scope work is tracked in the relevant helper's own backlog.

### CC.7 — Slab contract receives a forward-compatible `scene.json.bakedAt` amendment

As part of this plan's implementation, [`../SLAB-CONTRACT.md`](../SLAB-CONTRACT.md) §4 (`scene.json` schema) gains a new field: `bakedAt` (number, epoch ms — the bake's completion timestamp, written by `cartograph/bake-scene.js`). Forward-compatible: existing consumers ignore unknown fields per consumer contract §5, so no version bump is needed. The Cartograph coupler (§1) relies on this field as production's source for the `?t=<bakedAt>` cache-bust seed, decoupling production from the in-memory `useCartographStore.bakeLastMs` value. Authoring contexts may continue to use the store's value; both should agree by construction (store seeds itself from `Date.now()` on bake completion; the bake writes the same epoch into `scene.json`).

This is the only boundary-doc touch this plan requires. It is called out as its own cross-cutting item because amending the contract is a separate review surface from the runtime coupler decisions and should be visible to anyone reading SLAB-CONTRACT in isolation.

### CC.8 — Kit asset paths are deploy-path-agnostic via `BASE_URL`

Independent of any coupler decision: **all runtime asset fetches route through `import.meta.env.BASE_URL`**. The same build runs at the apex of `lafayette-square.com` (`BASE_URL = '/'`) and at a subpath like `jacobeugenehenderson.github.io/lafayette-square-staging/` (`BASE_URL = '/lafayette-square-staging/'`) without code changes. The Vite `--base` flag at build time sets the value; consumers normalize at runtime.

This is **not a Place-coupler variable** (§6) — those vary per neighborhood instance. `BASE_URL` varies per deploy target; the same instance can deploy to multiple targets with different `BASE_URL`s. Different axis.

Canonical consumer patterns (verified 2026-05-12, commit `f871a9d`):

- **Asset paths in JSX** (`PlaceCard.assetUrl()`, `GlassSearch.resolveLogoUrl()`, `LafayetteScene` MapPin): strip leading slash, prepend `BASE_URL`. External URLs (`http://`, `https://`) pass through unchanged.
- **Slab fetch paths** (`BakedGround`, `BakedLamps`, `InstancedTrees`, `treeAtlasMaterial`, `LafayettePark`, `BakedBuildings`, `StageArch`, `CartographApp`): template directly via `${import.meta.env.BASE_URL}baked/...`.

Data-side root-absolute paths (`landmarks.json` `/photos/...`, `/logos/...`) are kit-shaped authoring form; consumers handle portability. Operators authoring data never have to think about deploy targets.

Verification gate: `grep -rn "'/baked/\|\`/baked/\|'/photos/\|\`/photos/\|'/logos/\|\`/logos/"` in `src/` returns zero matches in JSX/JS code.

Memory: `project_kit_deploy_path_agnostic`.

---

## What this plan does NOT do

- **Does not strip authoring routes, code, or chunks.** All decisions about `/cartograph.html`, `/arborist.html`, `/preview.html`, `src/cartograph/`, `src/arborist/`, `src/preview/`, `src/stage/`, `public/looks/`, `public/clouds/`, `public/trees/`, `public/models/`, and bundle whitelisting belong to `pre_public_cleanout.md` (not yet authored).
- **Does not parametrize the deploy pipeline.** GitHub Pages workflow, CNAME, Worker deployment, and PUBLISH.md's five-place GAS deployment-ID drift rule are deploy-side concerns, handled in `pre_public_cleanout.md`.
- **Does not author the Courier helper app.** Coupler §4 explicitly defers the helper to a future operation; v1 inlines.
- **Does not address Supabase RLS / security posture.** That is Phase B's security audit, a separate document.
- **Does not specify the basemap swap.** The marriage leap — how the rendering-architecture switchover ships, what gets verified in what order on the way to merge-to-main — belongs to `ls_basemap_swap.md` (not yet authored). The couplers must be in place before the swap, but the swap itself is its own sequencing problem.
- **Does not execute.** Output of Phase B; input to Phase C.

## Carry-overs (additions to RUNTIME-DELTA / trinity)

Items surfaced during the read pass that other docs should reflect at next touch:

- **(no new contradictions)** — every claim in this plan cross-checks against the cited file:line and the RUNTIME-DELTA §2 verdict. §1's `useSceneJson` framing is consistent with RUNTIME-DELTA §2.2's "extract to a minimal `useLookState` shim" — same shape (slab-side data hook distinct from the cartograph authoring store), more specific name. If `ls_basemap_swap.md` lands on a different hook name or split, RUNTIME-DELTA §2.2 should be updated to match.
- **CARY-BRIEF.md / `cary/`** at repo root are noted in §4 as authoring docs, not runtime code. `pre_public_cleanout.md` should decide ship-or-strip for the doc + directory; this plan only references them.
