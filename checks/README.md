# The check suite

⛔ **GENERATED — `npm run test:tiers`. Do not hand-edit; your edit is the next run's casualty.**

One check per bug-class, each stating a claim that can be **shown false**. The tier is **derived
from each script's source** (`checks/tier.mjs`), never from a list — so a check added tomorrow is
gated without anyone remembering to gate it, which is what makes this work on town #2.

| gesture | tier(s) | contacts |
|---|---|---|
| `npm test` | safe | nothing — enforced per-run by `checks/_no-network.mjs` |
| `npm run test:all` | safe + local-effect | nothing; ⛔ writes to disk, so not CI |
| `npm run test:live` | live | ⛔ **production.** Needs `CHECKS_LIVE=i-mean-it` |
| `npm test -- --list` | — | prints what would run |

A non-zero exit is a **finding for the board**, not a runner fault. The suite reports; it does not fix.

## ⛔ live — 112. Never in a default run.

Two reason classes, and they are not the same thing. **outbound** — a demonstrated call out.
**unreadable** — runs code the parser cannot read, so it *may* contact nothing but cannot be shown
to. Both are excluded, because "cannot be shown safe" is the only honest gate (`CLAUDE.md` Layer 0 q2).

⛔ `scratch/claims-onboarding-guard.sh` POSTs `/auth/v1/signup` at the live Supabase project **with no
teardown** — every invocation leaves another anonymous user behind. That is a recorded incident
(`SECURITY.md`, the 2026-08-31 audit disclosure), not a hypothetical.

| check | why | what it reaches |
|---|---|---|
| `checks/claims-a-bake-reads-design-through-one-reader.mjs` | unreadable | imports cartograph/pour-code.mjs, which can: runs `git` — not a known-local command, runs `git` — not a known-local command · computed import of cartograph/lookDesign.mjs — read, safe |
| `checks/claims-a-bake-step-declares-what-it-reads.mjs` | unreadable | imports cartograph/pour-code.mjs, which can: runs `git` — not a known-local command, runs `git` — not a known-local command · computed import() with no readable target — runs arbitrary modules · re-runs its own file (process.execPath + its own path) — the same tier as itself |
| `checks/claims-a-bend-bends-the-band.mjs` | unreadable | computed import() of a path an argument or the environment can supply — arbitrary |
| `checks/claims-a-bridge-over-water-is-not-ground.mjs` | unreadable | writeFileSync · deletes files · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules |
| `checks/claims-a-city-building-keeps-its-permanent-id.mjs` | outbound | imports cartograph/fetch-buildings.mjs, which can: writeFileSync, mkdirSync, imports cartograph/socrata-fetch.mjs, which can: deletes files, runs `curl` — reaches out, imports cartograph/msbf-identity.js, which can: writeFileSync |
| `checks/claims-a-click-hits-what-is-drawn.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command · runs `pkill -9 -f 'user-data-dir=${profile}'` — not a known-local command |
| `checks/claims-a-coast-finer-than-its-trace-is-not-drawn.mjs` | outbound | writeFileSync · deletes files · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules · imports cartograph/bake-coast.mjs, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync, imports cartograph/elevationSources.mjs, which can: calls fetch(), imports cartograph/fetch-lidar-flights.mjs, which can: mkdirSync |
| `checks/claims-a-cold-preview-opens-on-the-saved-shot.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command |
| `checks/claims-a-dead-tile-is-named.mjs` | outbound | imports a network module · imports cartograph/elevationSources.mjs, which can: calls fetch() · imports package(s) geotiff — not read from source |
| `checks/claims-a-dem-is-chosen-by-its-data.mjs` | outbound | imports cartograph/fetch-dem.mjs, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync, imports cartograph/elevationSources.mjs, which can: calls fetch() |
| `checks/claims-a-hashed-town-loads-end-to-end.mjs` | outbound | calls fetch() · opens a WebSocket · writeFileSync · deletes files · runs `npx` — reaches out · runs `/Applications/Google Chrome.app/Contents` — not a known-local command |
| `checks/claims-a-label-change-ends-no-leg.mjs` | unreadable | writeFileSync · computed import() with no readable target — runs arbitrary modules |
| `checks/claims-a-lake-level-converts-at-its-own-height.mjs` | outbound | writeFileSync — only under its own temp dir · mkdirSync — only under its own temp dir · deletes files — only under its own temp dir · imports cartograph/fetch-water-datums.mjs, which can: calls fetch(), mkdirSync, imports cartograph/io.js, which can: writeFileSync |
| `checks/claims-a-land-use-boundary-is-one-line.mjs` | outbound | writeFileSync · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules · imports cartograph/cdl.mjs, which can: calls fetch(), writeFileSync |
| `checks/claims-a-lean-never-turns-the-map.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command · runs `pkill -9 -f 'user-data-dir=${profile}'` — not a known-local command |
| `checks/claims-a-look-holds-only-its-towns-grove.mjs` | unreadable | computed import() of a path an argument or the environment can supply — arbitrary |
| `checks/claims-a-look-link-opens-that-town.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules · runs `/Applications/Google Chrome.app/Contents` — not a known-local command |
| `checks/claims-a-missing-height-fails-loudly.mjs` | outbound | writeFileSync · imports cartograph/elevationSources.mjs, which can: calls fetch() · imports cartograph/terrainLoad.js, which can: imports cartograph/intake-rows.mjs, which can: writeFileSync, mkdirSync |
| `checks/claims-a-paused-town-draws-nothing.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command |
| `checks/claims-a-perpendicular-landing-runs-straight-on.mjs` | unreadable | computed import() of a path an argument or the environment can supply — arbitrary |
| `checks/claims-a-pinched-face-is-two-faces.mjs` | unreadable | writeFileSync · deletes files · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules |
| `checks/claims-a-production-town-plays-the-player-promote-pinned.mjs` | outbound | imports a network module · imports checks/_miniflare.mjs, which can: computed import() with no readable target — runs arbitrary modules, runs `npm` — not a known-local command |
| `checks/claims-a-reimport-keeps-curation.mjs` | unreadable | deletes files · copies/renames files · child_process with a non-literal command — cannot be read |
| `checks/claims-a-salon-save-keeps-provenance.mjs` | unreadable | writeFileSync · mkdirSync · deletes files · imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command, imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files |
| `checks/claims-a-scrub-never-writes-the-keys.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command |
| `checks/claims-a-shot-change-flies.mjs` | outbound | calls fetch() · opens a WebSocket · writeFileSync · deletes files · runs `/Applications/Google Chrome.app/Contents` — not a known-local command |
| `checks/claims-a-shot-never-resizes-its-shadow-box.mjs` | unreadable | imports vite — its server resolves localhost over DNS (caught by the no-network guard) · writeFileSync · mkdirSync · deletes files · imports package(s) vite — not read from source |
| `checks/claims-a-slab-name-is-its-content.mjs` | outbound | writeFileSync · mkdirSync · deletes files · imports scripts/upload-baked-to-r2.mjs, which can: calls fetch(), writeFileSync · imports scripts/sweep-retired-slab-keys.mjs, which can: calls fetch(), writeFileSync — only under its own temp dir |
| `checks/claims-a-slider-step-compiles-nothing.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command · runs `pkill -9 -f 'user-data-dir=${profile}'` — not a known-local command |
| `checks/claims-a-stage-entry-knows-its-slab-age.mjs` | outbound | calls fetch() · writeFileSync |
| `checks/claims-a-staging-town-names-its-player.mjs` | unreadable | imports checks/_miniflare.mjs, which can: computed import() with no readable target — runs arbitrary modules, runs `npm` — not a known-local command |
| `checks/claims-a-surveyed-tree-is-never-dropped.mjs` | unreadable | imports arborist/bake-trees.js, which can: writeFile, imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files, imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command |
| `checks/claims-a-tide-station-is-in-the-water-or-named.mjs` | outbound | imports cartograph/fetch-water-datums.mjs, which can: calls fetch(), mkdirSync, imports cartograph/io.js, which can: writeFileSync |
| `checks/claims-a-town-has-one-sealed-id.mjs` | unreadable | computed import of src/instances/registry.js — read, safe · runs `git` — not a known-local command |
| `checks/claims-a-town-keeps-its-own-clock.mjs` | unreadable | computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules · child_process with a non-literal command — cannot be read |
| `checks/claims-a-town-page-fetches-no-authoring.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command |
| `checks/claims-a-town-page-writes-its-own-card.mjs` | unreadable | imports checks/_miniflare.mjs, which can: computed import() with no readable target — runs arbitrary modules, runs `npm` — not a known-local command |
| `checks/claims-a-tree-well-plants-only-standing-trees.mjs` | outbound | imports cartograph/fetch-trees.mjs, which can: writeFileSync, mkdirSync, imports cartograph/socrata-fetch.mjs, which can: deletes files, runs `curl` — reaches out |
| `checks/claims-a-worker-deploy-darkens-no-town.mjs` | outbound | calls fetch() |
| `checks/claims-an-early-frame-key-is-held.mjs` | outbound | imports scripts/lib/headless.mjs, which can: calls fetch(), opens a WebSocket, deletes files — only under its own temp dir, child_process with a non-literal command — cannot be read |
| `checks/claims-an-external-base-survives-a-bake.mjs` | unreadable | writeFileSync · mkdirSync · deletes files · runs `node` — not a known-local command |
| `checks/claims-an-impostor-town-fetches-no-atlas.mjs` | outbound | writeFileSync · mkdirSync · deletes files · computed import of scripts/slab-publish-rule.mjs — read, safe · computed import() with no readable target — runs arbitrary modules · imports scripts/upload-baked-to-r2.mjs, which can: calls fetch(), writeFileSync |
| `checks/claims-an-island-stays-land-in-the-mint.mjs` | unreadable | writeFileSync · deletes files · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules |
| `checks/claims-authored-skelids-keep-their-ways.mjs` | unreadable | deletes files — only under its own temp dir · child_process with a non-literal command — cannot be read |
| `checks/claims-deployment-has-one-authority.mjs` | unreadable | imports vite — its server resolves localhost over DNS (caught by the no-network guard) · imports package(s) vite — not read from source |
| `checks/claims-every-app-mounts-the-set-piece.mjs` | unreadable | computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules |
| `checks/claims-every-ground-surface-takes-the-lamp.mjs` | unreadable | imports vite — its server resolves localhost over DNS (caught by the no-network guard) · imports package(s) vite — not read from source |
| `checks/claims-every-tree-candidate-is-accounted-for.mjs` | unreadable | deletes files — only under its own temp dir · imports arborist/bake-trees.js, which can: writeFile, imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files, imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command |
| `checks/claims-extent-never-seeds-a-committed-radius.mjs` | outbound | writeFileSync — only under its own temp dir · deletes files — only under its own temp dir · imports a temp copy of src/cartograph/api.js, which can: calls fetch() · imports a mutated copy of src/cartograph/extentRadius.js from its own temp dir — read as src/cartograph/extentRadius.js, safe · imports a mutated copy of src/cartograph/api.js from its own temp dir — read as src/cartograph/api.js, safe |
| `checks/claims-frame-timeline-catches-a-stall.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command · runs `pkill -9 -f 'user-data-dir=${profile}'` — not a known-local command |
| `checks/claims-neon-picks-its-building.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command · runs `pkill -9 -f 'user-data-dir=${profile}'` — not a known-local command |
| `checks/claims-no-edge-is-drawn-twice.mjs` | unreadable | installs a loader hook (node:module register) — can swap any module's source · writeFileSync · imports cartograph/bake-ground.js, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync, imports cartograph/terrainLoad.js, which can: imports cartograph/intake-rows.mjs, which can: writeFileSync, mkdirSync |
| `checks/claims-no-view-reaches-the-sky-at-the-shore.mjs` | outbound | imports scripts/lib/headless.mjs, which can: calls fetch(), opens a WebSocket, deletes files — only under its own temp dir, child_process with a non-literal command — cannot be read |
| `checks/claims-one-way-into-stage.mjs` | outbound | calls fetch() · computed import() of a path an argument or the environment can supply — arbitrary |
| `checks/claims-one-weather-per-instant.mjs` | unreadable | imports vite — its server resolves localhost over DNS (caught by the no-network guard) · imports package(s) vite — not read from source |
| `checks/claims-overture-licence-table-is-current.mjs` | outbound | calls fetch() |
| `checks/claims-pilgrim-monument-site.mjs` | unreadable | computed import() with no readable target — runs arbitrary modules · imports cartograph/terrainLoad.js, which can: imports cartograph/intake-rows.mjs, which can: writeFileSync, mkdirSync |
| `checks/claims-preview-frame-cost-splits.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command · runs `pkill -9 -f 'user-data-dir=${profile}'` — not a known-local command |
| `checks/claims-preview-phone-runs-production-passes.mjs` | unreadable | imports vite — its server resolves localhost over DNS (caught by the no-network guard) · imports package(s) vite — not read from source |
| `checks/claims-settle-never-crosses-the-open-close.mjs` | outbound | writeFileSync · deletes files · computed import() with no readable target — runs arbitrary modules · imports cartograph/bake-coast.mjs, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync, imports cartograph/elevationSources.mjs, which can: calls fetch(), imports cartograph/fetch-lidar-flights.mjs, which can: mkdirSync |
| `checks/claims-socrata-reads-the-whole-envelope.mjs` | outbound | imports cartograph/socrata-fetch.mjs, which can: deletes files, runs `curl` — reaches out |
| `checks/claims-stage-preview-parity.mjs` | unreadable | writeFileSync · mkdirSync · computed import() of a path an argument or the environment can supply — arbitrary · computed import() of a path an argument or the environment can supply — arbitrary |
| `checks/claims-startup-marks-fire-in-order.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command · runs `pkill -9 -f 'user-data-dir=${profile}'` — not a known-local command |
| `checks/claims-the-bake-watches-its-code.mjs` | unreadable | writeFileSync · deletes files · computed import() of a path an argument or the environment can supply — arbitrary · computed import of cartograph/coastFile.mjs — read, safe · computed import of cartograph/geography.mjs — read, safe · computed import of src/cartograph/streetProfiles.js — read, safe · runs `git` — not a known-local command · runs `git` — not a known-local command |
| `checks/claims-the-beach-band-is-the-towns-own.mjs` | unreadable | computed import() of a path an argument or the environment can supply — arbitrary |
| `checks/claims-the-coast-is-the-lidars.mjs` | outbound | writeFileSync · deletes files · imports cartograph/pour-code.mjs, which can: runs `git` — not a known-local command, runs `git` — not a known-local command · imports cartograph/elevationSources.mjs, which can: calls fetch() · imports cartograph/bake-coast.mjs, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync, imports cartograph/fetch-lidar-flights.mjs, which can: mkdirSync · imports package(s) clipper-lib — not read from source |
| `checks/claims-the-device-link-page-is-served-on-both-sites.mjs` | outbound | calls fetch() · imports workers/staging-sites/src/index.js, which can: calls fetch() · imports workers/production-sites/src/index.js, which can: calls fetch() |
| `checks/claims-the-dry-bed-record-is-the-lidar.mjs` | outbound | imports cartograph/elevationSources.mjs, which can: calls fetch() · imports cartograph/fetch-lidar-flights.mjs, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync |
| `checks/claims-the-flight-builds-no-ao.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command · runs `pkill -9 -f 'user-data-dir=${profile}'` — not a known-local command |
| `checks/claims-the-floor-is-read-only-from-a-permitted-survey.mjs` | outbound | imports cartograph/fetch-bathymetry.mjs, which can: writeFileSync, mkdirSync, deletes files, imports cartograph/io.js, which can: writeFileSync, imports cartograph/elevationSources.mjs, which can: calls fetch() |
| `checks/claims-the-kerb-along-the-water-is-the-coast-line.mjs` | unreadable | writeFileSync · deletes files · computed import of a temp-dir module, and not every write is shown to stay in its temp dir · computed import() with no readable target — runs arbitrary modules · declares @args --slot=<granted> |
| `checks/claims-the-legacy-look-table-dies-at-ls-cutover.mjs` | outbound | calls fetch() |
| `checks/claims-the-movie-is-continuous.mjs` | unreadable | imports vite — its server resolves localhost over DNS (caught by the no-network guard) · writeFileSync — only under its own temp dir · deletes files — only under its own temp dir · computed import of src/preview/heroAnim.js — read, safe · imports a mutated copy of src/preview/heroAnim.js from its own temp dir — read as src/preview/heroAnim.js, safe · imports a mutated copy of src/preview/heroAnim.js from its own temp dir — read as src/preview/heroAnim.js, safe · imports package(s) vite — not read from source |
| `checks/claims-the-paint-stack-flattens.mjs` | unreadable | writeFileSync — only under its own temp dir · computed import of a temp-dir module whose source cannot be read · re-runs its own file (process.execPath + its own path) — the same tier as itself · imports cartograph/bake-ground.js, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync, imports cartograph/terrainLoad.js, which can: imports cartograph/intake-rows.mjs, which can: writeFileSync, mkdirSync |
| `checks/claims-the-paint-takes-the-rim-crossings.mjs` | unreadable | writeFileSync · child_process with a non-literal command — cannot be read · imports cartograph/bake-ground.js, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync, imports cartograph/terrainLoad.js, which can: imports cartograph/intake-rows.mjs, which can: writeFileSync, mkdirSync |
| `checks/claims-the-pour-reads-the-towns-norm.mjs` | unreadable | child_process with a non-literal command — cannot be read |
| `checks/claims-the-pour-records-itself-once.mjs` | unreadable | writeFileSync · mkdirSync · deletes files · computed import of a temp-dir module, and not every write is shown to stay in its temp dir · imports cartograph/pour-code.mjs, which can: runs `git` — not a known-local command, runs `git` — not a known-local command · imports cartograph/pourSteps.mjs, which can: writeFileSync |
| `checks/claims-the-publish-can-stage-what-it-promises.mjs` | unreadable | runs `git` — not a known-local command |
| `checks/claims-the-slab-addresses-files-by-where-it-was-fetched.mjs` | unreadable | imports vite — its server resolves localhost over DNS (caught by the no-network guard) · imports package(s) vite — not read from source |
| `checks/claims-the-sun-dims-with-the-weather-now.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · computed import() with no readable target — runs arbitrary modules · runs `/Applications/Google Chrome.app/Contents` — not a known-local command |
| `checks/claims-the-terrain-is-the-mean-of-its-lidar.mjs` | outbound | imports cartograph/elevationSources.mjs, which can: calls fetch() · imports cartograph/fetch-lidar-flights.mjs, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync |
| `checks/claims-the-tower-light-loads-on-its-first-tap.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command · runs `pkill -9 -f 'user-data-dir=${profile}'` — not a known-local command |
| `checks/claims-the-ward-reads-what-the-manifest-bakes.mjs` | unreadable | computed import of src/instances/registry.js — read, safe · imports cartograph/pour-code.mjs, which can: runs `git` — not a known-local command, runs `git` — not a known-local command |
| `checks/claims-the-wind-field-extent-is-the-towns.mjs` | unreadable | imports vite — its server resolves localhost over DNS (caught by the no-network guard) · imports package(s) vite — not read from source |
| `checks/claims-the-wind-has-one-authority.mjs` | outbound | calls fetch() · opens a WebSocket · deletes files — only under its own temp dir · runs `/Applications/Google Chrome.app/Contents` — not a known-local command |
| `checks/claims-tree-drawn-height-by-window.mjs` | unreadable | imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files, imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command · imports package(s) @gltf-transform/core, @gltf-transform/extensions, meshoptimizer — not read from source |
| `checks/claims-writers-name-the-scene.mjs` | unreadable | runs `git` — not a known-local command |
| `scratch/claims-a-rename-cannot-repaint.mjs` | unreadable | imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command, imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files |
| `scratch/claims-band-reaches-lu.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules · computed import of src/lib/tileGround.js — read, safe |
| `scratch/claims-cary-anon-exposure.mjs` | outbound | calls fetch() · references a hosted-service credential |
| `scratch/claims-corner-delta.mjs` | unreadable | writeFileSync · deletes files · child_process with a non-literal command — cannot be read · imports scratch/claims-band-reaches-lu.mjs, which can: writeFileSync, mkdirSync, computed import() with no readable target — runs arbitrary modules, computed import of src/lib/tileGround.js — read, safe |
| `scratch/claims-corner-leg-suppression.mjs` | unreadable | writeFileSync · mkdirSync · computed import of scratch/.leg-probe/tileGround.leg.mjs, a module it writes itself — made at run time, cannot be read |
| `scratch/claims-curb-ramp-neutral.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-decline-fate.mjs` | unreadable | writeFileSync · mkdirSync · computed import of scratch/.d2-mutants/tileGround.declineFate.mjs, a module it writes itself — made at run time, cannot be read · computed import of scratch/.d2-mutants/tileGround.clean.mjs, a module it writes itself — made at run time, cannot be read |
| `scratch/claims-doc-code-citations.mjs` | unreadable | runs `git ls-files` — local, read-only · child_process with a non-literal command — cannot be read |
| `scratch/claims-doc-pointers-resolve.mjs` | unreadable | computed import() with no readable target — runs arbitrary modules · runs `git ls-files "*.md"` — local, read-only |
| `scratch/claims-dossier-writers-agree.mjs` | unreadable | deletes files · copies/renames files · runs `node` — not a known-local command |
| `scratch/claims-every-declared-page-ships.mjs` | unreadable | runs `git` — not a known-local command |
| `scratch/claims-every-placed-asset-has-a-size-band.mjs` | unreadable | imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files, imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command |
| `scratch/claims-ia-source-stamp.mjs` | unreadable | writeFileSync · mkdirSync · computed import of scratch/.stamp-probe/tileGround.stamp.mjs, a module it writes itself — made at run time, cannot be read |
| `scratch/claims-junctionmap-blast-radius.mjs` | unreadable | runs `grep -rl junctionMap src carto` — local, read-only · child_process with a non-literal command — cannot be read |
| `scratch/claims-keyhole-carry-to-ia.mjs` | unreadable | imports scratch/claims-band-reaches-lu.mjs, which can: writeFileSync, mkdirSync, computed import() with no readable target — runs arbitrary modules, computed import of src/lib/tileGround.js — read, safe |
| `scratch/claims-keyhole-splice-survival.mjs` | unreadable | imports scratch/claims-band-reaches-lu.mjs, which can: writeFileSync, mkdirSync, computed import() with no readable target — runs arbitrary modules, computed import of src/lib/tileGround.js — read, safe |
| `scratch/claims-label-loss-bisect.mjs` | unreadable | writeFileSync · mkdirSync · computed import of scratch/.lab-probe/tileGround.lab.mjs, a module it writes itself — made at run time, cannot be read |
| `scratch/claims-mesh-equals-the-bar.mjs` | unreadable | imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command, imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files |
| `scratch/claims-notch-origin-bisect.mjs` | unreadable | writeFileSync · mkdirSync · computed import of scratch/.notch-probe/tileGround.notch.mjs, a module it writes itself — made at run time, cannot be read |
| `scratch/claims-offset-reversal.mjs` | unreadable | writeFileSync · mkdirSync · computed import of scratch/.rev-probe/tileGround.rev.mjs, a module it writes itself — made at run time, cannot be read |
| `scratch/claims-onboarding-guard.sh` | outbound | shell: runs curl · shell: redirects to a file |
| `scratch/claims-postwall-provenance.mjs` | unreadable | writeFileSync · mkdirSync · computed import of scratch/.prov-probe/tileGround.prov.mjs, a module it writes itself — made at run time, cannot be read |
| `scratch/claims-the-leaf-face-axis-reaches-the-shader.mjs` | unreadable | imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files, imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command |
| `scratch/claims-the-roster-light-tells-the-truth.mjs` | unreadable | imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command, imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files |
| `scratch/claims-unpainted-arcs.mjs` | unreadable | writeFileSync · mkdirSync · computed import of scratch/.arc-probe/tileGround.arc.mjs, a module it writes itself — made at run time, cannot be read |

## local-effect — 29. `npm run test:all`, never CI.

Writes into the repo or a scratch dir.

| check | the claim it falsifies |
|---|---|
| `checks/claims-a-failed-apply-leaves-one-state.mjs` | Provincetown, 2026-09-25: the Bake applied a 5,290 m disc, the pour's promote refused |
| `checks/claims-a-failed-bake-leaves-the-slab.mjs` | DOES A BAKE WHOSE GROUND FAILS LEAVE THE SLAB EXACTLY AS IT WAS? |
| `checks/claims-a-false-map-is-not-a-fallback.mjs` | IS ANY INPUT'S ABSENCE PRETENDING TO BE FINE? |
| `checks/claims-a-hand-curated-town-gets-its-roster.mjs` | CLAIM: a town that keeps its LISTINGS by hand (`meta.baseSource: "hand-curated"`) still gets its ROSTER from |
| `checks/claims-a-pour-keeps-building-ids.mjs` | Building ids are minted ONCE, at fetch (`fetch-msbf.js` → `identity-registry.json`, the seal). |
| `checks/claims-a-road-marking-lies-inside-its-road.mjs` | EVERY ROAD MARKING THE GROUND PAINTS LIES ON THE ROAD. |
| `checks/claims-a-scene-is-named-not-numbered.mjs` | a neighborhood's scene id is the slug |
| `checks/claims-a-town-owns-its-raw-inputs.mjs` | DOES ANY TOWN READ ANOTHER TOWN'S RAW INPUT? |
| `checks/claims-coast-distance-is-the-coast.mjs` | IS THE COAST-DISTANCE CHANNEL THE DISTANCE TO THIS TOWN'S COAST? |
| `checks/claims-every-junction-corner-has-a-curb-cut-source.mjs` | ⭐⭐ EVERY JUNCTION CORNER'S CURB CUTS COME FROM SOMEWHERE NAMED — AND EVERY CROSSWALK ENDS AT A CURB CUT ON BOTH SIDES — `BRIEF-corner-ramps-and-kerb § |
| `checks/claims-every-listing-keeps-its-building.mjs` | DOES EVERY LISTING'S BUILDING STAY IN THE NEIGHBORHOOD? |
| `checks/claims-every-lit-town-has-lamps.mjs` | CLAIM — EVERY TOWN WHOSE STREETS TAKE LAMPS SHIPS LAMPS, EACH ONE SAYING WHERE IT CAME FROM, |
| `checks/claims-every-metre-of-drawn-shore-is-named.mjs` | IS ANY DRAWN SHORE BARE FOR NO REASON? |
| `checks/claims-fade-derives-from-radius.mjs` | CLAIM: the circle has ONE origin, and the fade is DERIVED from it. |
| `checks/claims-no-filename-reaches-a-plate-label.mjs` | DOES A SOURCE FILENAME (OR A SPECIES READ OFF ONE) REACH THE OPERATOR? |
| `checks/claims-prominence-recovers-ls-landmarks.mjs` | CLAIM: the prominence rank is a SORT and never a filter, hand-promotion outranks |
| `checks/claims-the-built-ground-has-no-needles.mjs` | A CURB, A WALK OR A LAWN NEVER COMES TO A SHARP POINT. |
| `checks/claims-the-ground-stays-in-budget.mjs` | "DOES THIS GROUND BAKE FIT UNDER ITS TOWN'S SERVED SLAB SIZE AND SERVED GROUND-BAKE TIME?" |
| `checks/claims-the-lidar-flights-are-named.mjs` | CLAIM — WHEN THE LIDAR FLEW, AND THE GEOID IT WAS DELIVERED ON, ARE READ AND NAMED, NEVER GUESSED (fetch-lidar-flights.mjs). |
| `checks/claims-the-road-lies-on-the-lattice.mjs` | EVERY ROAD VERTEX IN THE DISC LIES IN A TILE OR AN INK PIECE (`roadOffTheLattice`). |
| `checks/claims-the-road-meets-itself-across-its-centreline.mjs` | DOES THE DRAWN ROAD MEET ITSELF WHERE ITS TWO HALVES READ |
| `checks/claims-the-street-eye-stands-on-the-ground.mjs` | IS EVERY STREET CAMERA 5′8″ ABOVE THE DRAWN GROUND? |
| `checks/claims-the-stripe-lies-on-its-road.mjs` | DOES THE PAINTED STRIPE LIE ON THE ROAD IT IS PAINTED ON? |
| `checks/claims-the-walk-is-level-across.mjs` | DOES EVERY WALK AND CURB STAY LEVEL ACROSS ITS RUN, AT EVERY EXAGGERATION? |
| `scratch/claims-attribution-is-per-town.mjs` | IS EACH TOWN CREDITING ITS OWN SOURCES? |
| `scratch/claims-building-identity-survives-repour.mjs` | ⭐ WHY IT IS NOT A COUNT. `A01`'s ticket exists because `promote-ribbons.js`'s clobber |
| `scratch/claims-deadend-look.mjs` | RENDER THE NINE. Read-only. |
| `scratch/claims-protopolygon.mjs` | THE PROTOPOLYGON — Jacob's construction, built for the first time. READ-ONLY. |
| `scratch/claims-wind-tier-extraction.mjs` | Does the extracted stampWindTier still classify exactly as the two hand-kept |

## safe — 347. This is `npm test`.

| check | the claim it falsifies |
|---|---|
| `checks/claims-a-bake-never-uploads.mjs` | a bake ends on disk; Publish is the one gesture that uploads to staging. |
| `checks/claims-a-bare-edge-paints-no-curb-sliver.mjs` | CLAIM — A BARE EDGE PAINTS NO CURB. An edge whose curb depth is 0 (a highway's, a shore's, a verge's) contributes no curb |
| `checks/claims-a-brief-declares-how-it-dies.mjs` | EVERY BRIEF ON THE ROSTER SAYS WHEN IT LEAVES IT. |
| `checks/claims-a-building-carries-its-register-records.mjs` | DOES EVERY REGISTER FACT ON A TOWN'S CARDS COME FROM A WELL THE |
| `checks/claims-a-cap-carries-one-section.mjs` | DOES A DEAD-END CAP CARRY ITS OWNER'S WALK ALL THE WAY ROUND? |
| `checks/claims-a-capture-run-finishes-what-it-started.mjs` | CAN A GROVE CAPTURE RUN BE RESTARTED MID-LIST, OR UPLOAD AFTER IT WAS TORN DOWN? |
| `checks/claims-a-chain-cut-keeps-its-owner-change.mjs` | CLAIM — WHERE A STREET IS CUT INTO TWO CHAINS, ① KEEPS THE OWNER CHANGE. A chain cut (a skeleton node of degree 2, where |
| `checks/claims-a-chain-end-in-a-roadway-is-a-node.mjs` | DOES EVERY CHAIN END THAT LIES INSIDE ANOTHER STREET'S ROADWAY MEET IT AT A NODE? |
| `checks/claims-a-chain-id-is-one-chain.mjs` | DOES EVERY CHAIN ID NAME EXACTLY ONE CHAIN? |
| `checks/claims-a-city-code-the-kit-cannot-read-abstains.mjs` | CLAIM: a St. Louis CITY assessor code the kit cannot read ABSTAINS. It never becomes a plausible land use |
| `checks/claims-a-cli-scene-has-one-resolver.mjs` | DOES ANY SCRIPT ASK "WHICH TOWN?" TWICE? |
| `checks/claims-a-closed-shore-still-yields-ink.mjs` | DOES A SHORE THAT CLOSES STILL GET AN EDGE? |
| `checks/claims-a-closed-stripe-keeps-its-hole.mjs` | a fence round a yard — bakes as a BAND with a HOLE in it, never as a filled disc. |
| `checks/claims-a-coast-edge-is-no-finer-than-its-trace.mjs` | CLAIM — NO COAST EDGE IS FINER THAN ITS TRACE (ORIENTATION §5, "a source is drawn to its own resolution, and no finer"; Boz's |
| `checks/claims-a-coast-outside-the-drawing-is-no-shore.mjs` | a coast ring that never reaches the town's DRAWING (its terrain |
| `checks/claims-a-coast-ring-keeps-the-ink-clear.mjs` | CLAIM — A COAST RING KEEPS THE INK CLEAR (Boz's ruling, 2026-10-27). ① strokes the coast at ε each side (the mint's INK_EPS), so |
| `checks/claims-a-corner-is-where-one-turns.mjs` | ⭐⭐⭐ A CORNER IS WHERE ① TURNS — THE LABEL NEVER DECIDES IT. A CENSUS, not a gate: where the owner label changes on |
| `checks/claims-a-curb-arc-belongs-to-one-tile.mjs` | CLAIM — IN THE FROZEN SHAPE, A CURB CONTOUR BELONGS TO ONE TILE, SO A RUN (skelId · side · poly) IS LISTED ONCE. |
| `checks/claims-a-deck-is-every-object-that-covers-it.mjs` | IS EVERY POINT A DECK OBJECT COVERS ON THE DECK? |
| `checks/claims-a-district-is-the-towns-own.mjs` | DOES A TOWN'S ROSTER NAME ITS OWN HISTORIC DISTRICT, OR HI-POINTE–DEMUN'S? |
| `checks/claims-a-face-takes-the-land-use-that-covers-it.mjs` | ⭐⭐ THREE INVARIANTS — ① and ② ruled by Jacob 2026-09-25, ③ 2026-10-04: |
| `checks/claims-a-fitted-loop-stays-on-its-road.mjs` | DOES EVERY CLOSED-LOOP STREET CHAIN'S LINE STAY ON ITS ROAD? |
| `checks/claims-a-flat-town-is-not-refined.mjs` | CLAIM — A TOWN WITH NO TERRAIN SHIPS ITS GROUND UNREFINED (F3, Jacob 2026-09-24). |
| `checks/claims-a-frontage-can-ask-for-no-ped-band.mjs` | CLAIM: a frontage that carries no pedestrian realm can say so. |
| `checks/claims-a-highway-block-keeps-its-corners.mjs` | CLAIM — A BLOCK BESIDE A HIGHWAY KEEPS ITS TOWN CORNERS (H-3 step 3; Jacob's ruling "B"). |
| `checks/claims-a-keyframe-carries-its-aim.mjs` | IS EVERY SHOT THE OPERATOR'S OWN? |
| `checks/claims-a-kink-recovers-but-a-corner-does-not.mjs` | WHY THIS EXISTS. Jacob, 2026-09-08: "streets should continue their predominant direction into an |
| `checks/claims-a-level-body-has-one-surface.mjs` | IS THE LAKE FLAT IN OUR OWN HEIGHTFIELD? |
| `checks/claims-a-listing-keeps-its-id.mjs` | a business keeps its display id across every bake, whatever else |
| `checks/claims-a-look-authors-its-curb-width.mjs` | DOES EVERY LOOK RESOLVE ONE CURB, FROM ONE HOME, AND SAY WHICH RUNG DECIDED? |
| `checks/claims-a-look-keyed-tool-is-called-with-its-look.mjs` | every spawn of a Look-strict tool passes `--look`. |
| `checks/claims-a-menu-price-is-in-cents.mjs` | a menu price is an integer count of cents, on every |
| `checks/claims-a-missing-revetment-is-not-a-shoreless-town.mjs` | ⭐⭐ THE INVARIANT: the renderer may draw "no shore" only when it has been TOLD there is |
| `checks/claims-a-mover-stands-where-it-is.mjs` | "DOES A LIVE DOT — THE VISITOR, A COURIER — STAND WHERE IT IS, IN ANY TOWN, DRAWN BY THE TOWN?" |
| `checks/claims-a-nodeless-crossing-is-grade-separated.mjs` | WHERE TWO OSM STREET WAYS CROSS IN 2D WITHOUT A SHARED NODE, DOES OSM |
| `checks/claims-a-oneway-runs-in-travel-order.mjs` | CLAIM — EVERY ONE-WAY CHAIN RUNS IN TRAVEL ORDER, AND A REVERSED WAY'S TAGS POINT THE WAY IT NOW RUNS. |
| `checks/claims-a-parcel-keeps-all-its-parts.mjs` | DOES A MULTIPART PARCEL REACH THE MAP WHOLE? |
| `checks/claims-a-pour-adds-no-gitignore-lines.mjs` | "DOES A POUR ADD LINES TO .gitignore?" — the standing guard on scene tracking. |
| `checks/claims-a-production-host-serves-only-its-own-town.mjs` | A TOWN'S PRODUCTION DOMAIN SERVES THAT TOWN AND NOTHING ELSE — and only a domain we own, live. |
| `checks/claims-a-published-edit-reaches-the-map.mjs` | a Host's published correction is what the map shows. |
| `checks/claims-a-re-fetch-keeps-its-envelope-and-names-what-it-changes.mjs` | A RE-FETCHED raw/osm.json, BEFORE IT REPLACES THE |
| `checks/claims-a-recommit-changes-nothing.mjs` | DOES THE EXTENT COMMIT CARRY EVERY KEY IT DOES NOT OWN, AND DOES A RE-COMMIT OF |
| `checks/claims-a-roundabout-is-one-ring.mjs` | CLAIM — EVERY ROUNDABOUT OSM DECLARES ARRIVES AS ONE CLOSED CHAIN (cartograph/_archive/BRIEF-roundabout-is-one-ring-DELIVERED-2026-10-03.md). |
| `checks/claims-a-scene-switch-drops-the-old-town.mjs` | CLAIM — A SCENE SWITCH DROPS THE OLD TOWN, AND ITS DESIGN SAVES TO THE NEW TOWN'S OWN LOOK. |
| `checks/claims-a-shore-is-not-traced-twice.mjs` | ⭐⭐ TWO INVARIANTS, one cure and one guard: |
| `checks/claims-a-slab-ships-under-content-names.mjs` | every slab upload names its files by their content, and every read of what an |
| `checks/claims-a-slab-uploads-only-under-its-own-name.mjs` | A SLAB UPLOADS ONLY UNDER THE NAME IT WAS BAKED UNDER (T1). |
| `checks/claims-a-stale-terrain-is-not-a-town-without-a-coast.mjs` | ⭐⭐ THE INVARIANT: bake-revetment may report "this town has no coast" only when the SLAB |
| `checks/claims-a-state-gives-its-towns-their-wells.mjs` | ⭐⭐ THE INVARIANT (Jacob, 2026-10-05 — "yes, go", "Plus MO"): a town takes its parcel and address-point wells, |
| `checks/claims-a-suggested-palette-passes.mjs` | DOES WHAT STAGE SUGGESTS FROM A MARK CLEAR THE PLAYER'S RULES? |
| `checks/claims-a-swap-never-happens-mid-street.mjs` | ⭐⭐⭐ JACOB'S RULE, MADE CHECKABLE: "A treelawn swap NEVER happens mid-leg, period. It's |
| `checks/claims-a-tile-is-one-tree.mjs` | A TILE IS ONE TREE. |
| `checks/claims-a-town-chooses-its-lamp.mjs` | the lamp post is the town's AUTHORED choice, never its name. |
| `checks/claims-a-town-draws-the-trees-its-atlas-was-built-for.mjs` | "DOES A TOWN DRAW THE TREES ITS ATLAS WAS BUILT FOR — READ FROM ITS SLAB?" |
| `checks/claims-a-town-event-is-not-clock-dependent.mjs` | a dated event with no times runs all day, |
| `checks/claims-a-town-is-live-by-its-manifest.mjs` | "DOES EACH WORKER DECIDE A TOWN IS LIVE BY THE ONE FILE WHOSE NAME NEVER CHANGES?" |
| `checks/claims-a-town-never-bakes-from-the-whole-library.mjs` | CAN A TREE BAKE PLANT A SPECIES FROM OUTSIDE THE TOWN'S GROVE? |
| `checks/claims-a-town-shares-its-own-picture.mjs` | a shared link shows the town's own picture, at the time of day it is |
| `checks/claims-a-towns-colours-are-its-own.mjs` | "ARE A TOWN'S CATEGORY COLOURS — ITS NEON, ITS CHIPS — ITS OWN?" |
| `checks/claims-a-towns-identity-is-its-own.mjs` | IS HOW A TOWN LOOKS AUTHORED IN ONE PLACE, AND CARRIED WHOLE? |
| `checks/claims-a-towns-listings-reach-its-surfaces.mjs` | with no error anywhere. Provincetown, 2026-09-25: 445 listings on disk, 0 in the staging player, |
| `checks/claims-a-towns-sources-are-its-own.mjs` | DOES SOURCES NAME THIS TOWN'S SOURCE, OR ANOTHER COUNTRY'S? |
| `checks/claims-a-tree-card-starts-at-the-ground.mjs` | DOES EVERY HERO TREE CARD START AT THE GROUND? |
| `checks/claims-a-tree-is-refused-for-what-stands-under-it.mjs` | a ground-cover refusal is backed at the POINT. |
| `checks/claims-a-verge-span-edge-is-its-street-edge.mjs` | A VERGE BEGINS AT THE CARRIAGEWAY'S EDGE, NEVER ON A STREET'S CENTRELINE. |
| `checks/claims-a-way-tag-decides-before-the-coast.mjs` | CLAIM — A WAY'S OWN TAG DECIDES BEFORE THE COAST (Jacob, 2026-10-27, `r-a-way-tag-decides-before-byCoast`; Boz's vocabulary). |
| `checks/claims-a16-materials-write.mjs` | A16 GATE — "does a materials flip invent authoring, and did the resolver fix |
| `checks/claims-akas-never-merge-species.mjs` | DO COLLOQUIAL NAMES ROUTE WITHOUT MERGING TWO SPECIES INTO ONE? |
| `checks/claims-alley-stub-pairs.mjs` | ⭐⭐⭐ IS "BRIDGE THE ALLEY ACROSS A JUNCTION" A RULE, OR A SPECIAL CASE? |
| `checks/claims-an-annulus-splits-at-its-own-class-changes.mjs` | CLAIM — A CELL ROUND A FACE NO SPOKE REACHED SPLITS AT ITS OWN CLASS CHANGES, PAIRED BY OWNER, OR REFUSES. |
| `checks/claims-an-authored-key-names-the-same-frontage-after-a-re-pour.mjs` | WHEN A TOWN'S SKELETON IS RE-POURED, DOES EVERY KEY |
| `checks/claims-an-unanswered-axis-matches-nothing.mjs` | WHEN A SPECIES HAS NO ANSWER ON AN AXIS, DOES ANY PART "MATCH" IT? |
| `checks/claims-anchors-follow-the-placements.mjs` | `tree-anchors.json` keys to its own slab’s placements. |
| `checks/claims-anchors-know-their-terrain.mjs` | DO GROUND ANCHORS KNOW WHICH HEIGHTFIELD THEY CAME FROM? |
| `checks/claims-atlas-uv-rect-survives-the-bake.mjs` | A UV RECTANGLE MUST SURVIVE THE ATLAS BAKE UNMOVED. |
| `checks/claims-authored-framing-reaches-the-player.mjs` | DOES THE WARD READ EVERY FRAMING KEY THE BAKE WRITES? |
| `checks/claims-autosave-keeps-what-bakes-read.mjs` | DOES STAGE'S AUTOSAVE KEEP EVERYTHING A BAKE READS? |
| `checks/claims-axis-keys-resolve.mjs` | Does every axis key anyone stores actually exist in the rubric? |
| `checks/claims-back-returns-to-the-shot.mjs` | CLAIM — BACK RETURNS TO THE SHOT (2026-10-28, Jacob: going back to Extent from Survey landed in PROVINCETOWN's preview). |
| `checks/claims-bake-progress-shows-the-route.mjs` | CLAIM — THE BAKE SHOWS ITS OWN STEPS, NEVER KILLS ONE ON A CLOCK, AND SAYS WHICH STEP STOPPED. |
| `checks/claims-baked-consumers-get-a-cache-bust.mjs` | as the RE-READ key (`slabUrl(look, rel, reread)` / `slabFetch(look, rel, init, |
| `checks/claims-band-is-one-ring.mjs` | Jacob, 2026-08-11, setting the acceptance for the whole arc: |
| `checks/claims-bark-uvs-name-their-tile.mjs` | DOES EVERY BAKED BARK UV NAME A TILE ITS ATLAS HOLDS? |
| `checks/claims-block-edge-is-highway-edge.mjs` | CLAIM — A BLOCK AND THE HIGHWAY SHARE ONE EDGE (H-3 check 3, ruling b). |
| `checks/claims-both-surfaces-draw-the-same-water.mjs` | DOES THE OPERATOR SEE WHAT SHIPS? |
| `checks/claims-boundary-record-split.mjs` | CLAIM (the CLASS, not one scene): `neighborhood_boundary.json` splits into three |
| `checks/claims-browse-frame.mjs` | the authored Browse frame (SC.5), checked by |
| `checks/claims-buildings-are-the-union.mjs` | building MSBF missed vanished (provincetown: the Crown & Anchor, the Public Library, the Red Inn, |
| `checks/claims-cap-vs-skeleton.mjs` | "IS THIS CAP A DEAD END, OR A COVER OVER A FRAGMENT SEAM?" |
| `checks/claims-cards-light-from-the-scene-key.mjs` | THE IMPOSTOR CARDS MUST LIGHT FROM THE |
| `checks/claims-cary-order-contract.mjs` | The CaryOrder contract — does it hold, and does the doc still describe it? |
| `checks/claims-commerce-write-gate.mjs` | Is there any way to write commercial state without GAS saying yes? |
| `checks/claims-conformity-closes-what-the-detector-sees.mjs` | DOES THE DETECTOR SEE THE MESH THE SLAB DRAWS? |
| `checks/claims-contact-sms-rate-limit.mjs` | can a stranger still flood the Host's phone? |
| `checks/claims-coplanar-ground-has-a-painters-order.mjs` | CAN TWO TOUCHING SURFACES FIGHT? |
| `checks/claims-coplanar-groups-do-not-overlap.mjs` | A. Groups baked to the SAME Y must NOT overlap each other (or they z-fight). |
| `checks/claims-corner-takeover.mjs` | "WHERE DOES THE CORNER RIBBON'S TAKEOVER DECLINE?" — A10 / D1, the population. |
| `checks/claims-crop-rows-derived-per-field.mjs` | DO A TOWN'S CROP ROWS RUN EACH FIELD'S OWN WAY? |
| `checks/claims-curated-centerlines-unread.mjs` | "DOES THE FRAME AGREE WITH THE AUTHORITATIVE GEOMETRY WE ALREADY PAID FOR?" |
| `checks/claims-curvature-vs-band.mjs` | (Tally, 2026-08-14) — CURVATURE vs OFFSET DISTANCE, station by station, BOTH FACES. |
| `checks/claims-cutover-casualties.mjs` | ⭐ THE CUTOVER-CASUALTY CLASS. |
| `checks/claims-dblock-arc-diagnosis.mjs` | (Tally, 2026-08-14) — THE D-BLOCK ARC: two candidate mechanisms, measured side |
| `checks/claims-deadend-notch-standoff.mjs` | THE CHECK: at every frozen dead-end cap, the block (iA) must stand off the |
| `checks/claims-deployment-id-single-source.mjs` | Do all the Apps Script deployment IDs still agree? |
| `checks/claims-displaced-casters-have-a-depth-material.mjs` | PER MESH. |
| `checks/claims-divided-seam-step.mjs` | DOES THE DIVIDED↔UNDIVIDED SEAM STEP SURVIVE INTO THE FROZEN ARTIFACT? |
| `checks/claims-docs-carry-their-commands.mjs` | ⭐⭐⭐ THE DOC WRAP, AS A GATE INSTEAD OF A PROMISE. (Jacob, 2026-09-07: "The docs must be fixed |
| `checks/claims-every-app-mounts-the-town.mjs` | "DOES EVERY APP THAT DRAWS A TOWN DRAW IT THROUGH THE ONE ASSEMBLY?" |
| `checks/claims-every-authored-corner-resolves.mjs` | DOES EVERY CORNER THE OPERATOR AUTHORED STILL NAME A CORNER ON THE GROUND? |
| `checks/claims-every-baked-species-has-an-impostor.mjs` | every species in a baked census is in that slab’s atlas. |
| `checks/claims-every-building-has-a-roof-to-seat-on.mjs` | "DOES EVERY BUILDING A VISITOR CAN TAP HAVE A ROOF TO SEAT ITS SELECTION ON?"  — a per-town census. |
| `checks/claims-every-building-has-an-address.mjs` | "DOES EVERY BUILDING CARRY THE ADDRESS ITS TOWN'S INPUTS GIVE IT — AND IS A MISSING ONE SAID, NEVER GUESSED?" |
| `checks/claims-every-category-has-a-full-treatment.mjs` | every category resolves to a COMPLETE class set. |
| `checks/claims-every-corner-is-configured.mjs` | pad is a band-slice, NOT predicated on the arc — so it works square OR round." |
| `checks/claims-every-corner-is-one-of-three.mjs` | ⭐⭐⭐ EVERY CORNER RENDERS AS ONE OF THE THREE SANCTIONED SPECS — OR IT IS A DEFECT. |
| `checks/claims-every-corner-knows-its-junction.mjs` | ⭐⭐ EVERY CORNER KNOWS WHETHER A STREET MEETS IT — `BRIEF-corner-ramps-and-kerb §0a`. THE LEGS DECIDE (Jacob, |
| `checks/claims-every-curb-edge-has-its-owner.mjs` | EVERY ② EDGE CARRIES THE ① OWNER IT WAS STRUCK FROM. |
| `checks/claims-every-feature-is-classified.mjs` | ⭐⭐ IS EVERY PIECE OF STREET-SCAPE ONE CLASS OUT OF THE ONE VOCABULARY? — `BRIEF-the-classifier §3`. |
| `checks/claims-every-group-meshes-its-own-area.mjs` | A GROUND GROUP'S MESH COVERS EXACTLY ITS OWN POLYGONS. |
| `checks/claims-every-lu-tag-has-a-home.mjs` | CAN A TOWN BRING A WORD WE DO NOT KNOW? |
| `checks/claims-every-mapped-stone-structure-is-stone.mjs` | DOES EVERY MAPPED BREAKWATER AND GROYNE CARRY STONE? |
| `checks/claims-every-measurable-town-is-declared.mjs` | A TOWN THE KIT CAN MEASURE IS A TOWN THE KIT DECLARES. |
| `checks/claims-every-off-grade-span-over-the-water-is-listed.mjs` | CLAIM — EVERY OFF-GRADE SPAN OVER THE WATER IS LISTED, BY IDENTITY. ① leaves each one out of the ink (`tileGround.js#splitOverWater`: |
| `checks/claims-every-piece-takes-its-own-land-use.mjs` | ⭐⭐ THE INVARIANT (Jacob, 2026-10-04 — `docs/briefs/BRIEF-land-use-per-piece-and-the-control.md`): |
| `checks/claims-every-proto-edge-lies-on-its-owner.mjs` | CLAIM — EVERY ① EDGE LIES ON THE CHAIN THAT OWNS IT (one owner per edge, and it is the right one). |
| `checks/claims-every-shadowed-placement-renders.mjs` | EVERY PLACEMENT THE GROUND SHADOWS MUST RENDER A TREE. |
| `checks/claims-every-slab-url-is-resolved.mjs` | "DOES EVERY SLAB URL IN THE PLAYER COME FROM THE ONE RESOLVER?" |
| `checks/claims-every-tile-edge-names-its-owner.mjs` | EACH ① EDGE OF A TILE CARRIES THE OWNER ① STRUCK IT WITH (`tile.ringOwner`). |
| `checks/claims-every-town-has-a-mark.mjs` | boots as LAFAYETTE SQUARE (`src/instance.js`), so its tab, loader, badge and legal pages were |
| `checks/claims-every-turn-in-the-protopolygon-gets-an-arc.mjs` | ⭐⭐⭐ THE COMPLEMENT OF `claims-the-ease-is-the-corner`, AND THE HALF THAT WAS NEVER BUILT. |
| `checks/claims-every-water-body-reaches-the-kit-material.mjs` | DOES THE WATER ARRIVE? |
| `checks/claims-expressway-edge-follows-speed.mjs` | CLAIM — AN AT-GRADE EXPRESSWAY'S EDGE FOLLOWS ITS SPEED (q-atgrade-expressway-edge). |
| `checks/claims-extent-fetches-every-declared-well.mjs` | a declaration is a promise the fetch keeps: Extent's fetch runs every |
| `checks/claims-extent-lands-in-survey.mjs` | leaving Extent for the Designer lands in |
| `checks/claims-faces-on-the-ssot.mjs` | Jacob, 2026-09-06: "All data should skew to SSoT." Three geometries are frozen at prebake from |
| `checks/claims-fade-has-something-to-dissolve.mjs` | REPORT: does each town's block fill actually reach the fade band? |
| `checks/claims-false-deadend-census.mjs` | "IS THIS DEGREE-1 TIP A ROAD END, OR A FRAGMENT SEAM?" |
| `checks/claims-farmland-reads-as-agricultural.mjs` | ⭐⭐ THE INVARIANT (Jacob, 2026-10-05 — "add the fix"): a parcel code that SAYS farmland reads as |
| `checks/claims-fetch-contains-the-forever-zone.mjs` | WHY. Jacob's eye, 2026-09-06: "the rest of the streets show around the disc, just these on |
| `checks/claims-frontage-covers-the-block.mjs` | ⭐⭐⭐ CAN ONE FRONTAGE OWN THREE SIDES OF A BLOCK? On some blocks it does, and that is the |
| `checks/claims-gas-schema.mjs` | The GAS backend's real shape, READ FROM SOURCE — never restated. |
| `checks/claims-ground-cover-beats-jurisdiction.mjs` | ⭐⭐ THE INVARIANT: where a MANAGEMENT polygon (park, nature reserve, protected area) and a |
| `checks/claims-ground-normals-come-from-the-terrain.mjs` | IS THE GROUND LIT BY THE HILL IT IS DRAPED ON, AND DOES EVERY |
| `checks/claims-ground-refinement-does-not-breed-slivers.mjs` | CLAIM — REFINEMENT DOES NOT BREED SLIVERS PAST WHAT A GROUP'S OWN AREA CAN NEED (F2/F3, 2026-09-24). |
| `checks/claims-handle-rides-its-arc.mjs` | ── DOES THE AUTHORING HANDLE SIT ON THE ARC IT OWNS? ──────────────────────── |
| `checks/claims-hero-cards-write-their-depth.mjs` | DO HERO CARDS CARRY A DEPTH PAGE FROM CAPTURE TO SHADER, SO CROWNS MEET AS VOLUMES? |
| `checks/claims-hero-degrade-static.mjs` | the opening view of a town with no keyframes. |
| `checks/claims-hero-subject-resolves-in-its-own-slab.mjs` | "CAN THE OPERATOR PICK A HERO THAT ISN'T THERE?" — A11/A00, the authoring-UI surface. |
| `checks/claims-highway-handedness.mjs` | CLAIM — A ONE-WAY CARRIAGEWAY'S WIDE SIDE IS ON THE DRIVER'S RIGHT (H-3 check 4). |
| `checks/claims-highway-no-visible-joint.mjs` | CLAIM — A HIGHWAY IS ONE ROAD, NOT A ROW OF FRAGMENTS (H-3 check 1, cartograph/_archive/BRIEF-highway-build-plan-2026-09-23.md). |
| `checks/claims-highway-sweep-is-finite.mjs` | CLAIM — EVERY HIGHWAY SWEEP IS A VALID POLYGON (H-3 step 2; the Provincetown failure, 2026-09-24). |
| `checks/claims-highway-width-from-lanes.mjs` | CLAIM — A HIGHWAY'S WIDTH IS ITS LANES, AND EVERY VALUE SAYS WHERE IT CAME FROM (H-3 check 2). |
| `checks/claims-identity-colours-obey-the-policy.mjs` | DOES EVERY COLOUR A TOWN SETS MEET THE CONTRAST POLICY, BY EVERY PATH? |
| `checks/claims-inboard-side-convention.mjs` | READ-ONLY. Two questions left by claims-side-chain-falsifiers.mjs: |
| `checks/claims-inner-edge-deletion-gates.mjs` | the regression gates for deleting |
| `checks/claims-inner-edge-side-selector.mjs` | WHAT actually selects the ped-zeroed side on |
| `checks/claims-installation-legal-is-declared.mjs` | the /privacy and /terms pages and the courier agreement were Lafayette Square's Missouri |
| `checks/claims-intake-absence-is-loud.mjs` | downstream as a confident value instead of as an absence.** |
| `checks/claims-intake-is-consumed.mjs` | WHAT DID THIS TOWN FETCH THAT NOTHING USES? |
| `checks/claims-intake-is-lossless.mjs` | what a town takes in, it keeps, or a NAMED rule says why not. |
| `checks/claims-intersections-are-over-described.mjs` | ⭐⭐⭐ HOW OVER-DESCRIBED IS AN INTERSECTION? *(Jacob, 2026-09-08: "We need to simplify the corners |
| `checks/claims-junction-residual.mjs` | CLAIM — THE JUNCTION RESIDUAL IS WHAT THE RAW INTAKE SAYS IT IS (H-3 check 7, ruling g). |
| `checks/claims-lab-imports-never-reimplements.mjs` | IS THE SURFACE LAB STILL THE MAP'S ENVIRONMENT? |
| `checks/claims-leaf-pack-cells-agree.mjs` | A leaf pack's CELLS MUST BE INTERCHANGEABLE — the system assumes it and nothing checked. |
| `checks/claims-light-sources-are-live.mjs` | CLAIM — EVERY CONTROL ON STAGE'S LIGHT SOURCES CARD REACHES A LIVE UNIFORM, IN EVERY TOWN'S STAGE AND IN PRODUCTION. |
| `checks/claims-live-palette-equals-the-bake.mjs` | "DOES A LIVE PALETTE DRAG DRAW EXACTLY WHAT A RE-BAKE WOULD?" |
| `checks/claims-look-default-has-no-town.mjs` | "IS THE KIT'S 0-STATE A KIT, OR IS IT A TOWN?" — A11 / A00, the root gate. |
| `checks/claims-look-seed-scene-clean.mjs` | "DOES A NEW LOOK START CLEAN?" — A11 / D-C, the recurrence gate. |
| `checks/claims-marked-corners.mjs` | `clean/marker_strokes.json`; this classifies what is inside each one by CARRIED IDENTITY, so a |
| `checks/claims-matched-axes-have-matrices.mjs` | Without one, enumDistance returns farDistance (9) for ANY non-identical pair |
| `checks/claims-membership-is-the-disc.mjs` | WHERE A TOWN HAS NO AUTHORED POLYGON, MEMBERSHIP'S "INSIDE" IS THE DISC THE GROUND IS |
| `checks/claims-memory-index-health.mjs` | "WILL THE READ-IN STILL LOAD?" — the standing guard on the coordinator memory index. |
| `checks/claims-menu-item-ids.mjs` | Does every orderable menu item have a STABLE identity? |
| `checks/claims-named-way-becomes-street.mjs` | ⭐⭐ DOES A NON-VEHICULAR WAY BOUND A CITY BLOCK? — the check behind `ROADMAP A19`. |
| `checks/claims-neon-per-place.mjs` | "DOES EVERY OPEN PLACE GET ITS OWN NEON — OR SAY WHY NOT?" — BRIEF-neon-reads-at-every-distance §3.3. |
| `checks/claims-neon-two-drawings.mjs` | "DOES EVERY NEON FIELD REACH A DRAWING, AND IS THE TUBE NEVER INFLATED?" — BRIEF-neon-reads-at-every-distance §2. |
| `checks/claims-no-band-union-reversal.mjs` | CLAIM — ②'s BAND DIFFERENCE NEVER DRAWS ONE LINE TWICE, AND A JOIN LEAVES NO SLIVER. `offsetRingByRects` strikes ② as |
| `checks/claims-no-coarse-value-decides.mjs` | The defect this exists for, measured 2026-08-26: SelecTree's `leaf_form` has three |
| `checks/claims-no-corner-at-a-true-geometry-edge.mjs` | CLAIM — ② MAKES AT MOST ONE CORNER WHERE THE EXACT INK HAS A SUB-INK EDGE, AND ONLY IF THE GROUND THERE TURNS. Where two |
| `checks/claims-no-dossier-rests-on-a-wrong-species.mjs` | DOES ANY DOSSIER CITE A SOURCE THAT ANSWERED FOR ANOTHER SPECIES? |
| `checks/claims-no-hairline-ring-reaches-the-operator.mjs` | CLAIM: every ring the operator is shown — ① and the ②/③ ped bands — has a real |
| `checks/claims-no-host-carries-a-codedesk-copy.mjs` | CodeDesk has one source, and hosts pin its releases (BRIEF-codedesk). |
| `checks/claims-no-label-is-a-made-up-name.mjs` | ⭐ IS ANY BAKED STREET LABEL A NAME THE SKELETON MADE UP? — `ROADMAP A19`. |
| `checks/claims-no-listing-links-to-a-hijacked-domain.mjs` | a URL a researcher condemned may not ship. |
| `checks/claims-no-photo-loads-from-someone-elses-server.mjs` | every listing photograph is ours, and |
| `checks/claims-no-shadowed-chains.mjs` | WHY. Jacob's eye, 2026-09-06, on Survey: two navy centerlines running near-parallel with a |
| `checks/claims-no-slab-outlives-its-schema.mjs` | CLAIM: no baked slab is read under a fade model it was not baked for. |
| `checks/claims-no-sub-ink-edge-between-two-owners.mjs` | CLAIM — ① HAS NO EDGE SHORTER THAN ITS INK IS WIDE BETWEEN TWO OWNERS, EXCEPT WHERE THE EXACT INK HAS ONE. ① is every |
| `checks/claims-no-town-carries-the-mould.mjs` | "DOES ANY TOWN CARRY ANOTHER TOWN'S PLACES?" — continuity map §7 #2 (Phase 2 C, 2026-10-04). |
| `checks/claims-no-town-name-gates-the-kit.mjs` | "DOES ANY KIT CODE STILL DECIDE BY A TOWN'S NAME?" — BRIEF-ls-bleed-excision (Jacob, 2026-10-07: "fix the LS |
| `checks/claims-no-town-rides-in-the-bundle.mjs` | "DOES ONE TOWN'S DATA SHIP TO EVERY TOWN?" — the stowaway, made impossible. |
| `checks/claims-no-town-wears-another-towns-mark.mjs` | no LS asset is hardcoded into a shared surface. |
| `checks/claims-no-tree-stands-on-drawn-hardscape.mjs` | NO TREE MAY STAND ON A SURFACE THE MAP DRAWS AS HARDSCAPE. |
| `checks/claims-node-pair-key-parity.mjs` | SLICE 1 of "fix the key". PROVE, DON'T SWITCH. |
| `checks/claims-objects-dissolve-with-the-ground.mjs` | CLAIM: trees, lamps and labels thin out over the SAME band the ground fades on — |
| `checks/claims-one-blur-ladder.mjs` | "IS THERE ONE BLUR LADDER?" |
| `checks/claims-one-building-id-minter.mjs` | a building has ONE id minter and a town has ONE answer to "where do my |
| `checks/claims-one-corner-write-moves-one-corner.mjs` | ⭐⭐ ONE CORNER WRITE MOVES ONE CORNER — every field (Jacob, 2026-10-07: "every corner should be authorable on its own"). |
| `checks/claims-one-face-one-arrangement.mjs` | ⭐⭐⭐ "There should be no seams in runs, ever, period." (Jacob, 2026-09-07) |
| `checks/claims-one-frontage-one-arc.mjs` | ⭐⭐⭐ THINK IN ①. A block IS a closed polygon; each edge carries one owner; a CORNER is a vertex |
| `checks/claims-one-movie-driver.mjs` | "IS THE TOWN'S MOVIE PLAYED BY ONE COMPONENT?" |
| `checks/claims-one-shot-flight.mjs` | "IS THE FLIGHT BETWEEN SHOTS ONE MOTION, OWNED BY THE TOWN?" |
| `checks/claims-open-now-has-one-home-and-handles-midnight.mjs` | one predicate, and it survives a |
| `checks/claims-opting-out-of-the-fade-is-explicit.mjs` | CLAIM: a population that does not fade says so EXPLICITLY, and buildings are one. |
| `checks/claims-orphaned-customs.mjs` | DOES EVERY AUTHORED CUSTOM HAVE SOMETHING TO READ IT? |
| `checks/claims-osm-ground-has-no-duplicates.mjs` | query outputs tagged ways and then relation MEMBER ways, so a way that is both came back |
| `checks/claims-override-provenance.mjs` | "WHOSE TOWN DOES THIS OVERRIDE BELONG TO?" — A11, the provenance classifier. |
| `checks/claims-parcels-vote-by-area.mjs` | ⭐⭐ THE INVARIANT (Jacob, 2026-10-05 — "yes to underived grass and the rest"): a face no OSM land use |
| `checks/claims-ped-does-not-follow-the-rim.mjs` | rim runs ALONG the arc for tens of metres; a band that is CUT by the stamp meets it in chords |
| `checks/claims-price-of-record.mjs` | Can a DISPLAY FIGURE ever be charged? |
| `checks/claims-proto-band-flood-mechanism.mjs` | ⭐ WHICH DISEASE IS THE FAT BAND? — the discriminating measurement, not a thickness histogram. |
| `checks/claims-proto-blocks-are-faces.mjs` | + the raw neighborhood boundary) with the WORKING-TREE `mintProtopolygon`, so the frozen |
| `checks/claims-proto-corner-is-authored-radius.mjs` | the gate is: does ②'s eased contour actually turn at the radius the operator asked for? |
| `checks/claims-proto-curb-is-block-sized.mjs` | 2. the largest live ② ring is comparable to the largest real city block, not to the disc |
| `checks/claims-proto-curb-is-parallel.mjs` | protopoly) is smooth, their offsets should match." |
| `checks/claims-proto-fill-is-live.mjs` | ⭐⭐⭐ ③'s FILL, STRUCK LIVE PAST THE WALL — the STAMP INQUIRY, measured. |
| `checks/claims-proto-frozen-matches-live.mjs` | ⭐⭐⭐ THE FREEZE REPRODUCES THE CONSTRUCTION — the one claim a frozen artifact must earn. |
| `checks/claims-proto-identity.mjs` | let bad = 0 |
| `checks/claims-proto-median-is-a-hole.mjs` | Jacob's ruling, 2026-09-06: "the line segments which make up the split carriageways each get 2 |
| `checks/claims-proto-stack-disjoint.mjs` | ③ THE PED STACK IS A SET OF DISJOINT RINGS — the check, not the number. |
| `checks/claims-proto-stack-reads-authoring.mjs` | WHY THIS EXISTS. Seven of the eight ①②③ probes in `scratch/` call |
| `checks/claims-proto-thin-curb-runs.mjs` | WHY. `?proto=1` shows ② as long thin runs on some streets. ⛔ THE FIRST QUESTION IS NOT "what is |
| `checks/claims-proto-tip-has-two-apexes.mjs` | WHY IT MATTERS. `RIBBONS §1` carries an UNMADE RULING: "a single cubic cannot hold a half-turn; |
| `checks/claims-proto-unrounded-corners.mjs` | named set of classes, not "some corners look wrong". |
| `checks/claims-proto-vertex-provenance.mjs` | Sizes the handles build: a SOURCE vertex can resolve its centreline node by carried identity |
| `checks/claims-proto-wall.mjs` | ⭐ THE WALL, ENFORCED BY READING THE SOURCE — not by a comment claiming it. |
| `checks/claims-public-urls-come-from-the-town-domain.mjs` | EVERY PUBLIC URL THE PLAYER BUILDS TAKES THE TOWN'S DOMAIN FROM ONE HELPER. |
| `checks/claims-radius-has-one-home.mjs` | them. The disc radius lives in `neighborhood_boundary.json` (the applied disc — what |
| `checks/claims-ramp-ends-classified.mjs` | CLAIM — EVERY HIGHWAY END IS ACCOUNTED FOR, AND AN AT-GRADE END LIES INSIDE THE TOWN'S ASPHALT (H-3 check 5). |
| `checks/claims-recentre-removes-asymmetry.mjs` | READ-ONLY. Jacob, 2026-09-04: "there is NO asymmetrical case for the CHAIN ITSELF, for |
| `checks/claims-reference-credits.mjs` | The acknowledgements for the Salon's reference plates — GENERATED from the dossiers, |
| `checks/claims-references-are-sound.mjs` | the research database (references/registry.json) is internally sound. |
| `checks/claims-repour-changes-nothing.mjs` | WHY THIS EXISTS. `promote-ribbons.js` and `ROADMAP A01` both carried a standing alarm that a |
| `checks/claims-research-is-keyed-to-the-place-it-describes.mjs` | every research record's |
| `checks/claims-revert-field-coverage.mjs` | CAN THE OPERATOR GET BACK? |
| `checks/claims-ribbons-are-not-older-than-the-skeleton.mjs` | `skeleton.json` is the frame; `ribbons.json` is what Survey draws. Between them sit |
| `checks/claims-ring-partition.mjs` | "DOES THE FROZEN RING ALREADY CARRY A PARTITION WITH AN OWNER ON EVERY ARC?" |
| `checks/claims-scene-at-default.mjs` | "IS THIS SCENE AT THE STUDS?" — enumerate every surviving authoring gesture, |
| `checks/claims-scene-flag-is-the-equals-form.mjs` | ⭐ CLASS D WEARING A FLAG. `--scene <id>` does not error. `cartograph/scene.js` |
| `checks/claims-set-piece-contract.mjs` | "DOES EVERY DECLARED SET-PIECE MEET THE SLOT'S CONTRACT?" (BRIEF-set-piece-contract) |
| `checks/claims-shader-fragments-declare-what-they-use.mjs` | EVERY IDENTIFIER A GLSL FRAGMENT USES |
| `checks/claims-shore-outside-the-drawing-is-not-refused.mjs` | ⭐⭐ TWO INVARIANTS: |
| `checks/claims-side-baseline-audit.mjs` | VERIFY THE BASELINE BEFORE COMPARING TO IT. |
| `checks/claims-side-chain-falsifiers.mjs` | READ-ONLY. THE TWO FALSIFIABLE PREDICTIONS of the directed-side-chain / grout model, |
| `checks/claims-sidewalk-is-one-band.mjs` | ⭐⭐⭐ THE ACCEPTANCE, IN THE OPERATOR'S WORDS. |
| `checks/claims-simplify-preserves-authoring.mjs` | WHY THIS MUST RUN BEFORE THAT CHANGE. The drawn centreline and the line ① is built from are two |
| `checks/claims-sky-follows-its-town.mjs` | IS THE SKY PAINTED ON THIS TOWN'S SCHEDULE? |
| `checks/claims-species-map-routes-are-composed.mjs` | Every COMMON a scene routes must resolve to a COMPOSED species. |
| `checks/claims-spur-leg-offset.mjs` | READ-ONLY. ⭐ SCOPE, and it is the whole point of this file: |
| `checks/claims-stage-controls-are-live.mjs` | CLAIM — EVERY STAGE CONTROL MOVES SOMETHING ON A TOWN NOBODY HAS LOOKED AT. |
| `checks/claims-stamp-follows-the-edge.mjs` | ⭐⭐⭐ DOES A ② CONTOUR EDGE CARRY THE OWNER OF THE ① EDGE IT LIES ALONG? |
| `checks/claims-stat-scope.mjs` | A DISPLAYED FIGURE MUST DECLARE, AND MATCH, ITS SCOPE. |
| `checks/claims-survey-and-section-agree.mjs` | Section opens `protoShapeTiles` (the frozen shape) through `sectionOpen`. Under ① both must come from ①②③ and |
| `checks/claims-survey-passes-what-the-bake-passes.mjs` | DOES SURVEY'S LIVE BUILD GIVE buildTileGround EVERYTHING THE BAKE DOES? |
| `checks/claims-swap-reaches-the-paint.mjs` | ⭐⭐⭐ THE OPERATOR'S GESTURE, AS A GATE. (Jacob, 2026-09-07: "The swap regime doesn't work on |
| `checks/claims-the-ao-belongs-to-its-ground.mjs` | producer that rebuilds that manifest from scratch. `bake-ground-ao` writes |
| `checks/claims-the-armoured-shore-is-never-empty.mjs` | IS THERE A WALL AT EVERY DISTANCE? |
| `checks/claims-the-bands-are-held-by-their-owners.mjs` | EACH TILE'S CURB, WALK AND LAWN ARE CUT INTO PIECES, EACH WITH ONE OWNER (`bandPiecesOfTile`). |
| `checks/claims-the-bed-is-seen-to-depth-at-low-water.mjs` | CLAIM: a town's bed is cut where the bottom stops being seen AT LOW WATER — the visibility depth below the town's LOW |
| `checks/claims-the-block-is-one-ring.mjs` | ② IS ONE RING PER TILE: THE CONTOUR THE BANDS ARE STRUCK FROM AND THE BLOCK THE ASPHALT IS |
| `checks/claims-the-block-underlay-never-shows.mjs` | `BlockGeometryV2Debug.jsx`: `sectionGeos.block` is "the frozen block silhouette, under the LU |
| `checks/claims-the-camera-has-one-definition.mjs` | DOES EVERY APP DRIVE THE CAMERA THE SAME WAY? |
| `checks/claims-the-canvas-is-the-towns.mjs` | "DOES EVERY APP DRAW ITS TOWN THROUGH THE CANVAS THE TOWN'S QUALITY PROFILE ASKS FOR?" |
| `checks/claims-the-capture-frame-is-the-clip-frame.mjs` | THE FRAME A BAND IS CUT IN MUST BE THE FRAME THE CAMERA CLIPS IN. |
| `checks/claims-the-coast-is-one-line-on-the-lattice.mjs` | CLAIM — THE COAST IS ONE LINE ON THE LATTICE (Boz's ruling, 2026-10-27; ②'s shareIntoFull lesson, in ①). ① holds the shoreline |
| `checks/claims-the-coast-runs-on-past-the-rim.mjs` | "PAST THE RIM, DOES THE WATER END WHERE THE REAL COAST DOES?" — BRIEF-the-coast-runs-on-past-the-rim. |
| `checks/claims-the-corner-extent-is-carried.mjs` | ⭐⭐⭐ THE CORNER'S EXTENT IS CARRIED, NOT RECOVERED — and this reads the artifact, never a rule. |
| `checks/claims-the-corner-record-reports-the-achieved-radius.mjs` | CLAIM: the corner record the operator's handle rides reports the radius the arc |
| `checks/claims-the-crest-is-measured-behind-the-shore.mjs` | WHERE WAS THE WALL'S HEIGHT READ? |
| `checks/claims-the-crossings-are-noded-once.mjs` | CLAIM — CROSSINGS ARE NODED ONCE, BY ONE HOME, AND THE NODING ENDS. Rings that only overlap (a tile's contours and the |
| `checks/claims-the-curb-never-enters-the-road.mjs` | CLAIM — THE CURB NEVER ENTERS THE ROAD: no point of ② lies nearer a ① edge than that edge's own depth. |
| `checks/claims-the-dev-servers-do-not-import-the-looks-index.mjs` | no dev server imports a file it WRITES. |
| `checks/claims-the-directory-has-exactly-one-order.mjs` | every writer of the listings store orders |
| `checks/claims-the-disc-stays-inside-the-bb.mjs` | ⭐ THE DISC STAYS INSIDE THE BOUNDING BOX — `EXTENT-DESIGN §4`: the seal must enforce `bbox ⊇ disc + padding`. |
| `checks/claims-the-drawn-raw-is-one-function.mjs` | DOES EVERY READER OF THE DRAWN GROUND READ A VERTEX'S PIN THE SAME WAY? |
| `checks/claims-the-ease-is-the-corner.mjs` | ⭐⭐⭐ THE EASE IS THE CORNER TEST. `iaCorner` used to be "① TURNS *and* the owner changes" — a |
| `checks/claims-the-fade-tracks-the-active-disc.mjs` | WHOSE CIRCLE IS THE MAP FADING OVER? |
| `checks/claims-the-frame-makes-no-intersection.mjs` | IS EVERY `ribbons.intersections` ENTRY A PLACE WHERE STREETS MEET? |
| `checks/claims-the-frame-owns-only-the-frame.mjs` | CLAIM — ON ①'S BLOCK RINGS, THE FRAME (`__boundary__`) OWNS ONLY EDGES THAT LIE ON THE FRAME. The frame is the bb rectangle |
| `checks/claims-the-ground-covers-every-block.mjs` | CLAIM — THE GROUND COVERS EVERY BLOCK: nothing inside a block is painted by NOBODY. |
| `checks/claims-the-ground-has-no-cross-polygon-t-junctions.mjs` | every ground vertex by the DEM; the neighbour's edge chords straight past it, and |
| `checks/claims-the-ground-is-painted-once.mjs` | IS EVERY POINT OF THE GROUND PAINTED BY EXACTLY ONE GROUP? |
| `checks/claims-the-ground-tiles-without-a-gap.mjs` | DOES THE DRAWN GROUND TILE THE DISC, WITH NO SEAM LEFT OPEN? |
| `checks/claims-the-grove-shows-only-finished-trees.mjs` | CAN THE GROVE SHOW A TREE THAT ISN'T THIS TOWN'S, OR ISN'T BAKED? |
| `checks/claims-the-horizon-takes-the-towns-cover.mjs` | DOES THE HORIZON CARRY THE TOWN'S COVER, NEVER A ROAD? |
| `checks/claims-the-impostor-shoots-a-tree-whose-leaves-touch-wood.mjs` | DO THE LEAVES IN THE TREE THE IMPOSTOR PHOTOGRAPHS HANG ON WOOD? |
| `checks/claims-the-ink-is-absorbed-by-its-owner.mjs` | CLAIM — ① (THE ε STRIP) IS ABSORBED INTO THE FACES BY ITS OWN LABELS: EVERY PAINTED EDGE NAMES ITS OWNER, NEIGHBOURS MEET |
| `checks/claims-the-ink-never-retraces-itself.mjs` | CLAIM — THE INK NEVER RETRACES ITSELF (Boz's ruling, 2026-10-27, on Zob's read of PTown v3's r215). An island's coast is a |
| `checks/claims-the-kerb-stands-and-drops-at-each-cut.mjs` | THE RAISED KERB, ON BLOCKS SMALL ENOUGH TO KNOW THE ANSWER. |
| `checks/claims-the-key-light-is-a-real-body.mjs` | IS ANYTHING ACTUALLY THERE? |
| `checks/claims-the-labels-carry-their-style.mjs` | "DOES EVERY TOWN'S labels.json CARRY ITS WHOLE LABEL STYLE — AND IS THERE ONE DEFAULT?" |
| `checks/claims-the-land-is-painted-by-its-evidence.mjs` | IS THE LAND EVIDENCE DISJOINT, AS RULED? |
| `checks/claims-the-lattice-has-one-home.mjs` | THE PARTITION'S GRID IS DEFINED ONCE (src/lib/lattice.js) AND EVERY USE IMPORTS IT. |
| `checks/claims-the-light-follows-the-weather.mjs` | one weather state drives the rain AND the light. |
| `checks/claims-the-mark-palette-is-never-live.mjs` | IS "SUGGEST FROM MARK" AUTHORING-ONLY? |
| `checks/claims-the-mint-refuses-no-outline.mjs` | CLAIM — THE MINT REFUSED NO NODE'S OUTLINE. Where ① cannot build a node's outline (an acute meeting, a degenerate one, or a |
| `checks/claims-the-overhead-band-is-two-triangles.mjs` | IS EVERY OVERHEAD BAND A 2-TRIANGLE QUAD, AND DOES ITS FLUTTER SLIDE THE PICTURE? |
| `checks/claims-the-overhead-core-is-baked.mjs` | DOES THE GROVE BAKE THE OVERHEAD IMPOSTOR'S DEEP CORE, AND IS ITS ABSENCE LOUD? |
| `checks/claims-the-pad-is-the-size-of-the-corner.mjs` | ⭐⭐⭐ THE ADA PAD IS THE SIZE OF THE CORNER — the gate on the canary Jacob marked 2026-09-07. |
| `checks/claims-the-plan-frames-all-it-is-given.mjs` | "WHEN THE PLAN IS ASKED TO FRAME ALL OF A SET, IS EVERY PLACED MEMBER INSIDE THE FREE REGION?" |
| `checks/claims-the-plan-opens-on-its-places.mjs` | "DOES THE PLAN MAP OPEN ON THE TOWN'S PLACES — THEIR DENSEST CLUSTER, INSIDE THE EXTENT, WITH NOTHING HIDDEN?" |
| `checks/claims-the-plan-shot-ends-at-the-rim.mjs` | "IN PLAN VIEW, IS THE TOWN ONE CLOSED CIRCLE WITH A SOFT EDGE?" |
| `checks/claims-the-publish-button-can-say-it-is-done.mjs` | its condition measures what it ships. |
| `checks/claims-the-publish-gate-pushes-where-staging-deploys.mjs` | THE PUBLISH GATE MUST PUSH WHERE THE DEPLOY ACTUALLY LISTENS. |
| `checks/claims-the-publish-panel-reports-the-address-it-shipped.mjs` | no site URL is a module constant. |
| `checks/claims-the-ramp-has-room.mjs` | ⭐⭐⭐ THE RAMP NEEDS SOMEWHERE TO HAPPEN, AND ① HAS NOWHERE TO PUT IT. |
| `checks/claims-the-revetment-builds-on-the-wet-face.mjs` | DOES THE STONE FACE THE WATER? |
| `checks/claims-the-revetment-ends-as-a-heap.mjs` | DOES THE STONE STOP IN A CUT? |
| `checks/claims-the-rim-is-cut-once.mjs` | WHERE THE DRAWING MEETS THE DISC, EACH LINE IS CUT ONCE AND EVERY CROSSING IS SHARED |
| `checks/claims-the-road-paint-reads-its-marks.mjs` | CLAIM — THE ROAD'S PAINT IS WHAT EACH STREET'S MARKS SELECTED, STRUCK FROM THE SEALED SHAPE; AND THE PARKING DEPTH NEVER |
| `checks/claims-the-search-outlives-an-empty-ticker.mjs` | the header's chrome may not be gated on |
| `checks/claims-the-shadow-box-has-no-cliff.mjs` | the fitted shadow box is continuous at the horizon. |
| `checks/claims-the-shore-agrees-with-the-field.mjs` | CLAIM — THE SHORE AGREES WITH THE FIELD (BRIEF-the-shore-is-one-line §4, Boz 2026-10-25). |
| `checks/claims-the-shore-cells-are-read-from-the-tile.mjs` | CLAIM — EVERY READER OF THE SHORE CELLS READS THE TILE'S (`tile.inkCells`), NEVER THE MINT'S PRE-STAMP COPY. |
| `checks/claims-the-shore-is-closed.mjs` | no bare space between the water and the land, no matter what it's made of, no matter |
| `checks/claims-the-shore-knows-which-side-is-wet.mjs` | WHICH FACE DOES THE STONE GO ON? |
| `checks/claims-the-shore-meets-the-field-at-high.mjs` | CLAIM — THE DRAWN GROUND MEETS ①'s COAST AT HIGH, ON THE LINE, AND THE BED RAMPS TO IT (BRIEF-the-shore-is-one-line §3 step 2b; |
| `checks/claims-the-shore-says-what-it-is-made-of.mjs` | CAN THE KIT TELL STONE FROM SAND? |
| `checks/claims-the-slab-envs-do-not-collide.mjs` | STAGING AND PRODUCTION MUST NOT SERVE THE SAME SLAB. |
| `checks/claims-the-slope-is-on-the-leg.mjs` | ⭐⭐⭐ THE ACCEPTANCE FOR THE RAMP, AND IT IS A CONTINUITY TEST, NOT A DIMENSION ONE. |
| `checks/claims-the-stamp-keeps-its-owners.mjs` | DOES STAMPING A TILE WITH ITS LAND USE LEAVE EVERY EDGE'S OWNER WHERE IT WAS, |
| `checks/claims-the-survey-reaches-the-measure.mjs` | ⭐⭐⭐ DOES THE CITY'S SURVEY REACH THE MAP? — the join, scored, for any town that has one. |
| `checks/claims-the-tide-phase-stays-in-bounds.mjs` | the water never leaves the town's own low and high (BRIEF-tide). |
| `checks/claims-the-tiers-are-current.mjs` | A DRIFTED checks/TIERS.json STOPS `npm test`, NAMING EVERY CHECK THAT MOVED. |
| `checks/claims-the-town-has-no-hover.mjs` | DOES THE TOWN STAY STILL UNDER A MOVING POINTER, AND IS THE CITY MODEL GONE? |
| `checks/claims-the-town-moon-is-the-sky-moon.mjs` | "IS THE TOWN'S MOON PICTURE THE SKY'S OWN MOON — ON THE TOWN'S ONE WEBGL CONTEXT?" |
| `checks/claims-the-town-reads-no-player-store.mjs` | "CAN AN APP DRAW THE TOWN WITHOUT BEING THE OLD PLAYER?" |
| `checks/claims-the-town-sees-its-sky.mjs` | "DOES <Town> DRAW ITS SKY IN ANY APP'S CANVAS — OR ONLY IN ONE WHOSE CAMERA HAPPENS TO REACH IT?" |
| `checks/claims-the-tree-wind-is-the-looks.mjs` | IS EVERY TREE'S WIND LOOK THE LOOK'S, AND DOES THE VISIBLE FLOOR ADD NOTHING IN CALM? |
| `checks/claims-the-water-is-one-polygon.mjs` | CLAIM — THE WATER IS ONE POLYGON, ①'s, DRAWN TWICE; NO SECOND WATER (BRIEF-the-shore-is-one-line §3 step 2a/2c). |
| `checks/claims-the-weather-feed-arrives-in-the-units-we-read.mjs` | lib/nws.js converts every National Weather Service layer |
| `checks/claims-through-node-width-step.mjs` | THE CHECK: at a THROUGH-NODE — a ring vertex where two consecutive runs carry |
| `checks/claims-tide-is-present-exactly-where-tidal.mjs` | a tide where the water is tidal, and nowhere else (BRIEF-tide). |
| `checks/claims-tide-matches-noaa.mjs` | the tide's CLOCK is NOAA's, not ours (BRIEF-tide). |
| `checks/claims-tod-fades-at-the-edges.mjs` | CLAIM — TIME-OF-DAY KEYS TWEEN; A KEY BORDERING A BLANK TILE CAN FADE UP OR DOWN, AND THE FADE DOES WHAT IT SAYS. |
| `checks/claims-twilio-webhook-guard.mjs` | does sms-webhook actually reject a forged POST? |
| `checks/claims-two-listings-are-not-one-place.mjs` | no two listings share an address AND a phone. |
| `checks/claims-uturn-outer-edge-walk.mjs` | THE CHECK: walk the OUTER EDGE (the asphalt polygon `iA`) of every tile that |
| `checks/claims-vacant-is-said-only-by-a-well.mjs` | DOES `vacant: false` EVER MEAN "NOBODY SAID"? |
| `checks/claims-verge-bare.mjs` | CLAIM — A VERGE IS BARE GRASS, AND A BLOCK'S HIGHWAY EDGE IS BARE (H-3 check 6, `r-highway-verge`). |
| `checks/claims-verify-taxon.mjs` | asserts vocabulary.mjs `verifyTaxon`. |
| `checks/claims-water-depth-reads-the-level.mjs` | IS WATER DEPTH MEASURED FROM THE TOWN'S LEVEL, NEVER FROM y = 0? |
| `checks/claims-water-scales-with-its-body.mjs` | DOES THE WATER KNOW HOW BIG IT IS? |
| `checks/claims-zero-separation-offset.mjs` | READ-ONLY. Three questions, none of which has been measured: |
| `scratch/claims-clip-extent-floor.mjs` | CLAIM (the CLASS, not one site): every radius derived from the scene's authored |
| `scratch/claims-hook-bindings-declared.mjs` | Every hook-bound name a component uses is still declared in that component. |
| `scratch/claims-regime-census.mjs` | ⭐⭐⭐ THE REGIME CENSUS — every place TWO representations of the same thing coexist, |
