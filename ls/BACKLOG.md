# Lafayette Square — Backlog

The v1 punchlist for the LS consumer app. Triaged: slab migrations, route strips, mobile-perf gates, doc updates.

> Part of the **LS trinity** (`ls/FEATURES.md` / `ls/ARCHITECTURE.md` / `ls/BACKLOG.md`). Read at session start; check off completions during work; prune toward pristine. Resolved items belong out of this doc, not in a "Done" section. The cartograph trinity under `cartograph/` covers authoring; this is the consumer side.

Last updated: 2026-05-12 (trinity populated; reference docs landed under `ls/reference/`; `SLAB-CONTRACT.md` at root; facade-decor ripped; orphan data quarantined; rollback tag pushed)

---

## Session-end pin (read first)

The LS trinity (`ls/{FEATURES,ARCHITECTURE,BACKLOG}.md`) is **scaffolded but not yet populated**. The skeleton sections marked `[TO BE FILLED]` are the next session's work — the live-data inventory and runtime composition map produce the content. Until they're filled, treat any FEATURES/ARCHITECTURE claim as provisional.

Last spring-cleaning pass removed:
- 40 ribbons.json.backup files (gitignored anyway)
- 7 orphan `src/data/*.json` files → `_quarantine/src-data/`
- Facade-decor system end-to-end: `FacadeElements.jsx`, `FacadeBillboards.jsx`, `facadeElements.json`, `public/models/facade/` (400M), `public/model-viewer.html`, broken `decor`/`decor-icons` symlinks
- `ARCH.md` (Gateway Arch handoff, orphan) → `_archive/handoffs/`

Build (`npm run build`) succeeds again post-rip.

---

## L0 — Documentation regime (this session)

| ID | Item | Status |
|---|---|---|
| L0.1 | LS trinity scaffolded under `ls/` | ✅ |
| L0.2 | Cartograph trinity moved into `cartograph/` | ✅ |
| L0.3 | Root `README.md` updated as the two-trinity index + reference + slab-contract pointers | ✅ |
| L0.4 | Live-data inventory → `ls/ARCHITECTURE.md §2` + `ls/reference/INVENTORY-DATA.md` | ✅ |
| L0.5 | Runtime composition map → `ls/ARCHITECTURE.md §1` | ✅ |
| L0.6 | API reference → `ls/reference/INVENTORY-API.md` (50+ GAS endpoints, Supabase tables/RPCs/functions, Cloudflare Worker, open-meteo) | ✅ |
| L0.7 | `SLAB-CONTRACT.md` at root — boundary spec between cartograph and LS | ✅ |
| L0.8 | Last-known-good tag `v1-pre-cartograph-merge` on `origin/main @ 20866ef` | ✅ pushed |
| L0.9 | **End-user experience writeup** — populate `ls/FEATURES.md §"The end-user experience"` (Browse / Hero / Street / PlaceCard / Bulletin / Cary / check-in / residence / handles) | Pending — next session |
| L0.10 | **`SECURITY.md` reference doc** — device-hash identity, admin passphrase scope, GAS PropertiesService, Supabase RLS posture, guardian/claim secret flow, what's mutable by whom | Pending — next session |

---

## L1 — v1 slab migration (LS consumes the slab, not live data)

The bake exists; LS production doesn't yet trust it. Migrate consumer-side.

| ID | Item | Notes |
|---|---|---|
| ~~L1.1~~ | ~~`Scene.jsx` mounts `BakedLamps` instead of `StreetLights` for production~~ | ✅ **Shipped 2026-05-12.** Three-line swap in Scene.jsx; both desktop mount and `DeferredStreetLights` mobile wrapper now use `BakedLamps`. |
| L1.1b | Migrate `lampLightmap.js` from live `street_lamps.json` to slab `/baked/<look>/lamps.json` | `lampLightmap.js` computes a 256² gaussian-splat DataTexture for shader glow (grass / bark / foliage / paths) and is the second consumer of `street_lamps.json`. Currently sync at module-init; slab fetch is async — touches shader-uniform timing. Sub-phase separately from L1.1 (D.3-bundling rule). |
| L1.2 | Park water / park paths → slab | `LafayettePark` reads `park_water.json` + `park_paths.json` live. Bake into ground slab (already partial via `bake-ground`?) — verify, complete, then remove live import. |
| L1.3 | Audit `LafayetteScene`'s live `_allBuildings` consumption | FEATURES marks this "side-burner until product port" — that's now. Decide: keep live (load-bearing for neon + place state) and confirm in docs, or design a hybrid (merged slab mesh + per-id lookup index). |
| L1.4 | `Terrain.jsx` → slab or freeze | `terrain.json` is currently live. Static data, no reason to be live. |
| L1.5 | Verify `CloudDome` actually consumes meteorologist artifacts | `public/clouds/{presets,almanac}.json` exist; runtime wiring TO VERIFY per ARCHITECTURE §2. |

---

## L2 — Bundle + asset hygiene (mobile first-paint)

| ID | Item | Notes |
|---|---|---|
| L2.1 | **Strip authoring routes from prod bundle** | `cartograph` chunk is 4.5 MB minified / 1.1 MB gzipped, shipping to end users. Strip `/cartograph.html`, `/arborist.html`, `/stage`, `/preview.html` from the production Vite build (mode-conditional `rollupOptions.input`?). High win. |
| L2.2 | Audit `public/` for what `dist/` actually carries | 4.9 GB `public/trees` and 255 MB `public/models` — verify Vite's `copyPublicDir` isn't shipping all of it. Use vite's `publicDir: false` + manual `copy` plugin if needed for selectivity. |
| L2.3 | `main` chunk (1.2 MB) + `index` chunk (966 KB) review | Split routes (`pages/*.jsx`) via dynamic import; lazy-load modals. |
| L2.4 | Fix pre-existing build blocker: dead symlinks | `public/models/facade/{decor,decor-icons}` symlinks pointed at unmounted `/Volumes/Today/`. Removed with facade-decor rip; verify no other dangling symlinks in `public/`. |

---

## L3 — Safety perimeter (don't break the live site)

Light-touch. The site has no users today but must never be left in a "nothing up there" state.

| ID | Item | Notes |
|---|---|---|
| L3.1 | Tag `v1-pre-cartograph-merge` on `main` HEAD before any structural merge | One-command rollback floor |
| L3.2 | Mobile-aspect smoke check (Preview phone frame) before merging anything touching the runtime mount tree | Informal, not a CI gate |
| L3.3 | Verify GAS deployment ID unchanged across merge | Per `PUBLISH.md §"Single source of truth"`; drift = "Unknown-action" errors |

---

## L4 — Cary status

Cary is alive — keep it functional, not on the chopping block.

| ID | Item | Notes |
|---|---|---|
| L4.1 | Document Cary's current state in `ls/FEATURES.md §"Cary"` | Behind "coming soon" placeholders per `PUBLISH.md §5`; architected but not yet phone-OTP'd. `CARY-BRIEF.md` is the source spec. |
| L4.2 | Decide: ship Cary in v1, or keep behind placeholders | Affects bundle (Supabase client weight), env vars, GitHub Secrets requirement |

---

## L4.5 — Mid-session contradictions surfaced (not yet fixed)

Items the inventory + slab-contract walks flagged. None affect runtime; all should be resolved in their respective trinity at next touch.

| ID | Item | Where | Owner |
|---|---|---|---|
| L4.5.1 | `cartograph/FEATURES.md:259,275` + `cartograph/ARCHITECTURE.md:116,136` reference `src/components/StreetRibbons.jsx` which no longer exists | Cartograph trinity | Next cartograph session |
| L4.5.2 | `CloudDome` is procedural — `public/clouds/{presets,almanac}.json` are published but have no runtime consumer. Either wire `CloudDome` to consume or remove the artifacts. | LS runtime + meteorologist scope | Either app |
| L4.5.3 | `PlanetariumOverlay` has `viewMode === 'planetarium'` infrastructure in `Scene.jsx` but the component is never imported in Scene / LafayetteScene / App. Verify it's not dead infrastructure. | LS runtime | LS session |
| L4.5.4 | `SLAB-CONTRACT.md §3` claims ground lightmap UVs are bbox-derived; not verified in `BakedGround.jsx`. Could be that UVs travel in `ground.bin` (manifest has no `uvFormat` field for ground, only buildings). | Doc accuracy | Slab-contract update |
| L4.5.5 | `SLAB-CONTRACT.md §4` calls `scene.json` `layerVis` "redundant" — not verified against `bake-ground.js`. If `layerVis` also drives Designer toggle visibility, it's not redundant. | Doc accuracy | Slab-contract update |
| L4.5.6 | Cartograph helper docs cross-link to `../cartograph/ARCHITECTURE.md` from `cartograph/README.md` self-reference path was rewritten to `./ARCHITECTURE.md` — verify cartograph README's links still resolve correctly from inside `cartograph/` | Cartograph trinity | Next cartograph session |

## L5 — Stale handoff docs (kept, with explicit retire conditions)

These were *not* archived because they have live references — but they should retire eventually.

| ID | Item | Retire when |
|---|---|---|
| L5.1 | `HANDOFF-clouds-day3-clouddome-v2.md` | `<Atmosphere />` ships and supersedes the shader tuning rubric (per `meteorologist/README.md` line 33) |
| L5.2 | `HANDOFF-neon.md` | NeonBands lifts its decision history into `ls/FEATURES.md §"Neon"`; refs in BACKLOG / source comments get rewritten |
| L5.3 | `HANDOFF-sky-and-light.md` | Sky/light pipeline gets lifted into `cartograph/FEATURES.md` (Stage half) + `ls/FEATURES.md` (runtime half) |
| L5.4 | `cartograph/SHADOW_HANDOFF.md` | Cartograph BACKLOG item C.4 (Shadow post-pass) lands; doc is ingested into ARCHITECTURE |
| L5.5 | `_quarantine/src-data/*.json` | Confirm a full session passes without anything missing them; then delete |

---

## Pointers

- `ls/FEATURES.md` — product orientation
- `ls/ARCHITECTURE.md` — runtime composition + live-data inventory
- `cartograph/BACKLOG.md` — authoring-side punchlist
