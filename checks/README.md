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

## ⛔ live — 132. Never in a default run.

Two reason classes, and they are not the same thing. **outbound** — a demonstrated call out.
**unreadable** — runs code the parser cannot read, so it *may* contact nothing but cannot be shown
to. Both are excluded, because "cannot be shown safe" is the only honest gate (`CLAUDE.md` Layer 0 q2).

⛔ `scratch/claims-onboarding-guard.sh` POSTs `/auth/v1/signup` at the live Supabase project **with no
teardown** — every invocation leaves another anonymous user behind. That is a recorded incident
(`SECURITY.md`, the 2026-08-31 audit disclosure), not a hypothetical.

| check | why | what it reaches |
|---|---|---|
| `checks/claims-a-bake-step-declares-what-it-reads.mjs` | unreadable | imports cartograph/pour-code.mjs, which can: imports cartograph/geography.mjs, which can: imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read · computed import() with no readable target — runs arbitrary modules |
| `checks/claims-a-corner-is-where-one-turns.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-a-face-takes-the-land-use-that-covers-it.mjs` | unreadable | imports cartograph/derive.js, which can: imports cartograph/config.js, which can: imports cartograph/geography.mjs, which can: imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read, imports cartograph/speedContext.mjs, which can: child_process with a non-literal command — cannot be read, imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-a-failed-apply-leaves-one-state.mjs` | unreadable | writeFileSync · deletes files · computed import() with no readable target — runs arbitrary modules · child_process with a non-literal command — cannot be read |
| `checks/claims-a-false-map-is-not-a-fallback.mjs` | unreadable | imports cartograph/intake-rows.mjs, which can: writeFileSync, mkdirSync, imports cartograph/config.js, which can: imports cartograph/geography.mjs, which can: imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-a-frontage-can-ask-for-no-ped-band.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-a-kink-recovers-but-a-corner-does-not.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-a-look-holds-only-its-towns-grove.mjs` | unreadable | computed import() with no readable target — runs arbitrary modules |
| `checks/claims-a-reimport-keeps-curation.mjs` | unreadable | deletes files · copies/renames files · child_process with a non-literal command — cannot be read |
| `checks/claims-a-salon-save-keeps-provenance.mjs` | unreadable | writeFileSync · mkdirSync · deletes files · imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command, imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files |
| `checks/claims-a-scene-switch-drops-the-old-town.mjs` | unreadable | child_process with a non-literal command — cannot be read |
| `checks/claims-a-stale-terrain-is-not-a-town-without-a-coast.mjs` | unreadable | imports cartograph/bake-revetment.js, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync, imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-a-swap-never-happens-mid-street.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-a-towns-listings-reach-its-surfaces.mjs` | unreadable | computed import of src/tokens/categories.js — read, safe · child_process with a non-literal command — cannot be read |
| `checks/claims-a-tree-is-refused-for-what-stands-under-it.mjs` | unreadable | imports cartograph/forbidden-surface.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read, imports cartograph/derive.js, which can: imports cartograph/config.js, which can: imports cartograph/geography.mjs, which can: imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read, imports cartograph/speedContext.mjs, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-alley-stub-pairs.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-an-external-base-survives-a-bake.mjs` | unreadable | writeFileSync · mkdirSync · deletes files · runs `node` — not a known-local command |
| `checks/claims-authored-skelids-keep-their-ways.mjs` | unreadable | deletes files · child_process with a non-literal command — cannot be read |
| `checks/claims-baked-consumers-get-a-cache-bust.mjs` | unreadable | child_process with a non-literal command — cannot be read |
| `checks/claims-band-is-one-ring.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read · imports package(s) clipper-lib — not read from source |
| `checks/claims-band-vs-partition-state.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-buildings-are-the-union.mjs` | unreadable | computed import of cartograph/building-union.mjs — read, safe · child_process with a non-literal command — cannot be read |
| `checks/claims-coast-distance-is-the-coast.mjs` | unreadable | writeFileSync · mkdirSync · deletes files · imports cartograph/bake-coast-distance.js, which can: writeFileSync, mkdirSync, imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-corner-decline-vs-partition.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-corner-takeover.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-deadend-set-decomposition.mjs` | unreadable | imports scratch/coupler-fold-legs.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-every-app-mounts-the-set-piece.mjs` | unreadable | computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules |
| `checks/claims-every-corner-is-configured.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-every-corner-is-one-of-three.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-every-lit-town-has-lamps.mjs` | unreadable | imports cartograph/bake-lamps.js, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync, imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read, imports cartograph/terrainLoad.js, which can: imports cartograph/intake-rows.mjs, which can: writeFileSync, mkdirSync, imports cartograph/forbidden-surface.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read, imports cartograph/derive.js, which can: imports cartograph/speedContext.mjs, which can: child_process with a non-literal command — cannot be read, imports cartograph/lamp-spacing.mjs, which can: writeFileSync, imports cartograph/derive-lamps.mjs, which can: writeFileSync, mkdirSync |
| `checks/claims-every-metre-of-drawn-shore-is-named.mjs` | unreadable | imports cartograph/bake-revetment.js, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync, imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-every-proto-edge-lies-on-its-owner.mjs` | unreadable | imports cartograph/derive.js, which can: imports cartograph/config.js, which can: imports cartograph/geography.mjs, which can: imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read, imports cartograph/speedContext.mjs, which can: child_process with a non-literal command — cannot be read, imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-every-tree-candidate-is-accounted-for.mjs` | unreadable | deletes files · imports arborist/bake-trees.js, which can: writeFile, imports cartograph/forbidden-surface.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read, imports cartograph/derive.js, which can: imports cartograph/config.js, which can: imports cartograph/geography.mjs, which can: imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read, imports cartograph/speedContext.mjs, which can: child_process with a non-literal command — cannot be read, imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files, imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command |
| `checks/claims-every-turn-in-the-protopolygon-gets-an-arc.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-expressway-edge-follows-speed.mjs` | unreadable | imports cartograph/speedContext.mjs, which can: child_process with a non-literal command — cannot be read · imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-extent-lands-in-survey.mjs` | unreadable | child_process with a non-literal command — cannot be read |
| `checks/claims-faces-on-the-ssot.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-frontage-covers-the-block.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-ground-cover-beats-jurisdiction.mjs` | unreadable | imports cartograph/derive.js, which can: imports cartograph/config.js, which can: imports cartograph/geography.mjs, which can: imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read, imports cartograph/speedContext.mjs, which can: child_process with a non-literal command — cannot be read, imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-grout-is-a-valid-polygon.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-handle-rides-its-arc.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-hero-subject-resolves-in-its-own-slab.mjs` | unreadable | child_process with a non-literal command — cannot be read |
| `checks/claims-highway-no-visible-joint.mjs` | unreadable | imports cartograph/applySnapshot.mjs, which can: writeFileSync, deletes files, imports cartograph/config.js, which can: imports cartograph/geography.mjs, which can: imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-installation-legal-is-declared.mjs` | unreadable | computed import of src/instances/registry.js — read, safe · child_process with a non-literal command — cannot be read |
| `checks/claims-intersections-are-over-described.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-junction-residual.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-marked-corners.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-no-filename-reaches-a-plate-label.mjs` | unreadable | child_process with a non-literal command — cannot be read · imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files |
| `checks/claims-no-hairline-ring-reaches-the-operator.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-one-face-one-arrangement.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-one-frontage-one-arc.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-overture-licence-table-is-current.mjs` | outbound | calls fetch() · child_process with a non-literal command — cannot be read |
| `checks/claims-ped-does-not-follow-the-rim.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-physical-side-reconcile.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-pilgrim-monument-site.mjs` | unreadable | computed import() with no readable target — runs arbitrary modules · imports cartograph/terrainLoad.js, which can: imports cartograph/intake-rows.mjs, which can: writeFileSync, mkdirSync, imports cartograph/config.js, which can: imports cartograph/geography.mjs, which can: imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-producer-does-not-decide-partition.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-prominence-recovers-ls-landmarks.mjs` | unreadable | imports cartograph/bake-content.js, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync, imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-band-flood-mechanism.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-blocks-are-faces.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-corner-is-authored-radius.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-curb-is-block-sized.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-curb-is-parallel.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-curb.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-fill-is-live.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-frozen-matches-live.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-identity.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-leg-tail-is-corner-reach.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-legmiss-by-producer.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-median-is-a-hole.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-paints-into-medians.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-stack-disjoint.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-stack-reads-authoring.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-thin-curb-runs.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-tip-has-two-apexes.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-unrounded-corners.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-proto-vertex-provenance.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-ramp-ends-classified.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-ribbons-are-not-older-than-the-skeleton.mjs` | unreadable | imports cartograph/applySnapshot.mjs, which can: writeFileSync, deletes files, imports cartograph/config.js, which can: imports cartograph/geography.mjs, which can: imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-shore-outside-the-drawing-is-not-refused.mjs` | unreadable | imports cartograph/bake-revetment.js, which can: mkdirSync, imports cartograph/io.js, which can: writeFileSync, imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-sidewalk-is-one-band.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-sky-follows-its-town.mjs` | unreadable | computed import() with no readable target — runs arbitrary modules · imports cartograph/proceduralSky.js, which can: child_process with a non-literal command — cannot be read · imports package(s) suncalc — not read from source |
| `checks/claims-stage-preview-parity.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `checks/claims-stamp-follows-the-edge.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-survey-and-section-agree.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-swap-reaches-the-paint.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-the-bake-watches-its-code.mjs` | unreadable | writeFileSync · deletes files · computed import() with no readable target — runs arbitrary modules · imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read · computed import of cartograph/geography.mjs — read, safe · computed import of src/cartograph/streetProfiles.js — read, safe |
| `checks/claims-the-beach-band-is-the-towns-own.mjs` | unreadable | computed import() with no readable target — runs arbitrary modules |
| `checks/claims-the-block-underlay-never-shows.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-the-corner-extent-is-carried.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-the-corner-record-reports-the-achieved-radius.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-the-curb-never-enters-the-road.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read · imports package(s) clipper-lib — not read from source |
| `checks/claims-the-device-link-page-is-served-on-both-sites.mjs` | outbound | calls fetch() · imports workers/staging-sites/src/index.js, which can: calls fetch() · imports workers/production-sites/src/index.js, which can: calls fetch() |
| `checks/claims-the-ease-is-the-corner.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-the-ground-covers-every-block.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read · imports package(s) clipper-lib — not read from source |
| `checks/claims-the-pad-is-the-size-of-the-corner.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-the-publish-can-stage-what-it-promises.mjs` | unreadable | runs `git` — not a known-local command |
| `checks/claims-the-ramp-has-room.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-the-slope-is-on-the-leg.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-the-street-eye-stands-on-the-ground.mjs` | unreadable | imports cartograph/terrainLoad.js, which can: imports cartograph/intake-rows.mjs, which can: writeFileSync, mkdirSync, imports cartograph/config.js, which can: imports cartograph/geography.mjs, which can: imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-the-survey-reaches-the-measure.mjs` | unreadable | imports scratch/_proto-feed.mjs, which can: imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-tree-drawn-height-by-window.mjs` | unreadable | child_process with a non-literal command — cannot be read · imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files, imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command · imports package(s) @gltf-transform/core, @gltf-transform/extensions, meshoptimizer — not read from source |
| `checks/claims-verge-bare.mjs` | unreadable | imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read |
| `checks/claims-writers-name-the-scene.mjs` | unreadable | runs `git` — not a known-local command |
| `scratch/claims-a-rename-cannot-repaint.mjs` | unreadable | imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command, imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files |
| `scratch/claims-attribution-is-per-town.mjs` | unreadable | imports cartograph/bake-sources.js, which can: writeFileSync, mkdirSync, imports cartograph/intake-rows.mjs, which can: writeFileSync, mkdirSync, imports cartograph/config.js, which can: imports cartograph/geography.mjs, which can: imports cartograph/scene.js, which can: child_process with a non-literal command — cannot be read |
| `scratch/claims-band-reaches-lu.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-cary-anon-exposure.mjs` | outbound | calls fetch() · child_process with a non-literal command — cannot be read · references a hosted-service credential |
| `scratch/claims-clip-extent-floor.mjs` | unreadable | child_process with a non-literal command — cannot be read |
| `scratch/claims-corner-delta.mjs` | unreadable | writeFileSync · deletes files · child_process with a non-literal command — cannot be read · imports scratch/claims-band-reaches-lu.mjs, which can: writeFileSync, mkdirSync, computed import() with no readable target — runs arbitrary modules, computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-corner-leg-suppression.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-curb-ramp-neutral.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-deadend-look.mjs` | unreadable | writeFileSync · imports src/lib/tileGround.js, which can: child_process with a non-literal command — cannot be read · imports package(s) sharp — not read from source |
| `scratch/claims-decline-fate.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-doc-code-citations.mjs` | unreadable | runs `git ls-files` — local, read-only · child_process with a non-literal command — cannot be read |
| `scratch/claims-doc-pointers-resolve.mjs` | unreadable | computed import() with no readable target — runs arbitrary modules · runs `git ls-files "*.md"` — local, read-only |
| `scratch/claims-dossier-writers-agree.mjs` | unreadable | deletes files · copies/renames files · runs `node` — not a known-local command |
| `scratch/claims-every-declared-page-ships.mjs` | unreadable | runs `git` — not a known-local command |
| `scratch/claims-every-placed-asset-has-a-size-band.mjs` | unreadable | imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files, imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command |
| `scratch/claims-hook-bindings-declared.mjs` | unreadable | child_process with a non-literal command — cannot be read |
| `scratch/claims-junctionmap-blast-radius.mjs` | unreadable | runs `grep -rl junctionMap src carto` — local, read-only · child_process with a non-literal command — cannot be read |
| `scratch/claims-keyhole-carry-to-ia.mjs` | unreadable | imports scratch/claims-band-reaches-lu.mjs, which can: writeFileSync, mkdirSync, computed import() with no readable target — runs arbitrary modules, computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-keyhole-splice-survival.mjs` | unreadable | imports scratch/claims-band-reaches-lu.mjs, which can: writeFileSync, mkdirSync, computed import() with no readable target — runs arbitrary modules, computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-label-loss-bisect.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-mesh-equals-the-bar.mjs` | unreadable | imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command, imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files |
| `scratch/claims-notch-origin-bisect.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-offset-reversal.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-onboarding-guard.sh` | outbound | shell: runs curl · shell: redirects to a file |
| `scratch/claims-postwall-provenance.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |
| `scratch/claims-regime-census.mjs` | unreadable | child_process with a non-literal command — cannot be read |
| `scratch/claims-the-leaf-face-axis-reaches-the-shader.mjs` | unreadable | imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files, imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command |
| `scratch/claims-the-roster-light-tells-the-truth.mjs` | unreadable | imports arborist/roster-coverage.js, which can: imports arborist/generate-salon.js, which can: writeFile, runs `node` — not a known-local command, imports arborist/salon-options.js, which can: imports arborist/recommend-plates.mjs, which can: writeFileSync, mkdirSync, imports arborist/library-builder.js, which can: writeFileSync, mkdirSync, deletes files, copies/renames files |
| `scratch/claims-unpainted-arcs.mjs` | unreadable | writeFileSync · mkdirSync · computed import() with no readable target — runs arbitrary modules |

## local-effect — 6. `npm run test:all`, never CI.

Writes into the repo or a scratch dir.

| check | the claim it falsifies |
|---|---|
| `checks/claims-a-pour-keeps-building-ids.mjs` | Building ids are minted ONCE, at fetch (`fetch-msbf.js` → `identity-registry.json`, the seal). |
| `checks/claims-fade-derives-from-radius.mjs` | CLAIM: the circle has ONE origin, and the fade is DERIVED from it. |
| `scratch/claims-building-identity-survives-repour.mjs` | ⭐ WHY IT IS NOT A COUNT. `A01`'s ticket exists because `promote-ribbons.js`'s clobber |
| `scratch/claims-ia-source-stamp.mjs` | "DOES EVERY iA VERTEX KNOW WHICH RING EDGE MADE IT — AND DOES THE STAMP |
| `scratch/claims-protopolygon.mjs` | THE PROTOPOLYGON — Jacob's construction, built for the first time. READ-ONLY. |
| `scratch/claims-wind-tier-extraction.mjs` | Does the extracted stampWindTier still classify exactly as the two hand-kept |

## safe — 159. This is `npm test`.

| check | the claim it falsifies |
|---|---|
| `checks/claims-a-brief-declares-how-it-dies.mjs` | EVERY BRIEF ON THE ROSTER SAYS WHEN IT LEAVES IT. |
| `checks/claims-a-capture-run-finishes-what-it-started.mjs` | started.mjs — CAN A GROVE CAPTURE RUN BE RESTARTED MID-LIST, OR UPLOAD AFTER IT WAS TORN DOWN? |
| `checks/claims-a-cli-scene-has-one-resolver.mjs` | resolver.mjs — DOES ANY SCRIPT ASK "WHICH TOWN?" TWICE? |
| `checks/claims-a-closed-shore-still-yields-ink.mjs` | ink.mjs — DOES A SHORE THAT CLOSES STILL GET AN EDGE? |
| `checks/claims-a-closed-stripe-keeps-its-hole.mjs` | hole |
| `checks/claims-a-curb-arc-belongs-to-one-tile.mjs` | CLAIM — IN THE FROZEN SHAPE, A CURB CONTOUR BELONGS TO ONE TILE, SO A RUN (skelId · side · poly) IS LISTED ONCE. |
| `checks/claims-a-flat-town-is-not-refined.mjs` | CLAIM — A TOWN WITH NO TERRAIN SHIPS ITS GROUND UNREFINED (F3, Jacob 2026-09-24). |
| `checks/claims-a-highway-block-keeps-its-corners.mjs` | CLAIM — A BLOCK BESIDE A HIGHWAY KEEPS ITS TOWN CORNERS (H-3 step 3; Jacob's ruling "B"). |
| `checks/claims-a-keyframe-carries-its-aim.mjs` | aim.mjs — IS EVERY SHOT THE OPERATOR'S OWN? |
| `checks/claims-a-level-body-has-one-surface.mjs` | surface.mjs — IS THE LAKE FLAT IN OUR OWN HEIGHTFIELD? |
| `checks/claims-a-listing-keeps-its-id.mjs` | a business keeps its display id across every bake, whatever else |
| `checks/claims-a-look-keyed-tool-is-called-with-its-look.mjs` | every spawn of a Look-strict tool passes `--look`. |
| `checks/claims-a-menu-price-is-in-cents.mjs` | a menu price is an integer count of cents, on every |
| `checks/claims-a-missing-revetment-is-not-a-shoreless-town.mjs` | town.mjs |
| `checks/claims-a-pour-adds-no-gitignore-lines.mjs` | "DOES A POUR ADD LINES TO .gitignore?" — the standing guard on scene tracking. |
| `checks/claims-a-production-host-serves-only-its-own-town.mjs` | A TOWN'S PRODUCTION DOMAIN SERVES THAT TOWN AND NOTHING ELSE — and only a domain we own, live. |
| `checks/claims-a-published-edit-reaches-the-map.mjs` | a Host's published correction is what the map shows. |
| `checks/claims-a-scene-is-named-not-numbered.mjs` | numbered.mjs — a neighborhood's scene id is the slug |
| `checks/claims-a-shore-is-not-traced-twice.mjs` | twice.mjs |
| `checks/claims-a-tile-is-one-tree.mjs` | A TILE IS ONE TREE. |
| `checks/claims-a-town-event-is-not-clock-dependent.mjs` | a dated event with no times runs all day, |
| `checks/claims-a-town-never-bakes-from-the-whole-library.mjs` | library.mjs — CAN A TREE BAKE PLANT A SPECIES FROM OUTSIDE THE TOWN'S GROVE? |
| `checks/claims-a-tree-card-starts-at-the-ground.mjs` | ground.mjs — DOES EVERY HERO TREE CARD START AT THE GROUND? |
| `checks/claims-a16-materials-write.mjs` | A16 GATE — "does a materials flip invent authoring, and did the resolver fix |
| `checks/claims-akas-never-merge-species.mjs` | species.mjs — DO COLLOQUIAL NAMES ROUTE WITHOUT MERGING TWO SPECIES INTO ONE? |
| `checks/claims-an-unanswered-axis-matches-nothing.mjs` | nothing.mjs — WHEN A SPECIES HAS NO ANSWER ON AN AXIS, DOES ANY PART "MATCH" IT? |
| `checks/claims-anchors-follow-the-placements.mjs` | `tree-anchors.json` keys to its own slab’s placements. |
| `checks/claims-anchors-know-their-terrain.mjs` | terrain.mjs — DO GROUND ANCHORS KNOW WHICH HEIGHTFIELD THEY CAME FROM? |
| `checks/claims-atlas-uv-rect-survives-the-bake.mjs` | A UV RECTANGLE MUST SURVIVE THE ATLAS BAKE UNMOVED. |
| `checks/claims-autosave-keeps-what-bakes-read.mjs` | read.mjs — DOES STAGE'S AUTOSAVE KEEP EVERYTHING A BAKE READS? |
| `checks/claims-axis-keys-resolve.mjs` | Does every axis key anyone stores actually exist in the rubric? |
| `checks/claims-bake-progress-shows-the-route.mjs` | CLAIM — THE BAKE SHOWS ITS OWN STEPS, NEVER KILLS ONE ON A CLOCK, AND SAYS WHICH STEP STOPPED. |
| `checks/claims-block-edge-is-highway-edge.mjs` | CLAIM — A BLOCK AND THE HIGHWAY SHARE ONE EDGE (H-3 check 3, ruling b). |
| `checks/claims-both-surfaces-draw-the-same-water.mjs` | water.mjs — DOES THE OPERATOR SEE WHAT SHIPS? |
| `checks/claims-boundary-record-split.mjs` | CLAIM (the CLASS, not one scene): `neighborhood_boundary.json` splits into three |
| `checks/claims-browse-frame.mjs` | frame.mjs — the authored Browse frame (SC.5), checked by |
| `checks/claims-cap-vs-skeleton.mjs` | "IS THIS CAP A DEAD END, OR A COVER OVER A FRAGMENT SEAM?" |
| `checks/claims-cards-light-from-the-scene-key.mjs` | THE IMPOSTOR CARDS MUST LIGHT FROM THE |
| `checks/claims-cary-order-contract.mjs` | The CaryOrder contract — does it hold, and does the doc still describe it? |
| `checks/claims-commerce-write-gate.mjs` | Is there any way to write commercial state without GAS saying yes? |
| `checks/claims-contact-sms-rate-limit.mjs` | can a stranger still flood the Host's phone? |
| `checks/claims-coplanar-ground-has-a-painters-order.mjs` | order.mjs — CAN TWO TOUCHING SURFACES FIGHT? |
| `checks/claims-coplanar-groups-do-not-overlap.mjs` | overlap |
| `checks/claims-coupler-totality.mjs` | ── Is the COUPLER RELATION TOTAL? |
| `checks/claims-crop-rows-derived-per-field.mjs` | field.mjs — DO A TOWN'S CROP ROWS RUN EACH FIELD'S OWN WAY? |
| `checks/claims-curated-centerlines-unread.mjs` | "DOES THE FRAME AGREE WITH THE AUTHORITATIVE GEOMETRY WE ALREADY PAID FOR?" |
| `checks/claims-curvature-vs-band.mjs` | (Tally, 2026-08-14) — CURVATURE vs OFFSET DISTANCE, station by station, BOTH FACES. |
| `checks/claims-cutover-casualties.mjs` | ⭐ THE CUTOVER-CASUALTY CLASS. |
| `checks/claims-dblock-arc-diagnosis.mjs` | (Tally, 2026-08-14) — THE D-BLOCK ARC: two candidate mechanisms, measured side |
| `checks/claims-deadend-notch-standoff.mjs` | THE CHECK: at every frozen dead-end cap, the block (iA) must stand off the |
| `checks/claims-deadend-populations.mjs` | The dead-end population, reproduced — THREE populations, side by side, because |
| `checks/claims-deployment-id-single-source.mjs` | Do all the Apps Script deployment IDs still agree? |
| `checks/claims-displaced-casters-have-a-depth-material.mjs` | PER MESH. |
| `checks/claims-divided-seam-step.mjs` | DOES THE DIVIDED↔UNDIVIDED SEAM STEP SURVIVE INTO THE FROZEN ARTIFACT? |
| `checks/claims-docs-carry-their-commands.mjs` | ⭐⭐⭐ THE DOC WRAP, AS A GATE INSTEAD OF A PROMISE. (Jacob, 2026-09-07: "The docs must be fixed |
| `checks/claims-every-baked-species-has-an-impostor.mjs` | every species in a baked census is in that slab’s atlas. |
| `checks/claims-every-category-has-a-full-treatment.mjs` | every category resolves to a COMPLETE class set. |
| `checks/claims-every-ground-surface-takes-the-lamp.mjs` | lamp.mjs — DOES A LAMP LIGHT WHATEVER GROUND IT STANDS OVER? |
| `checks/claims-every-lu-tag-has-a-home.mjs` | home.mjs — CAN A TOWN BRING A WORD WE DO NOT KNOW? |
| `checks/claims-every-measurable-town-is-declared.mjs` | A TOWN THE KIT CAN MEASURE IS A TOWN THE KIT DECLARES. |
| `checks/claims-every-shadowed-placement-renders.mjs` | EVERY PLACEMENT THE GROUND SHADOWS MUST RENDER A TREE. |
| `checks/claims-every-town-has-a-mark.mjs` | mark.mjs |
| `checks/claims-every-water-body-reaches-the-kit-material.mjs` | material.mjs — DOES THE WATER ARRIVE? |
| `checks/claims-fade-has-something-to-dissolve.mjs` | REPORT: does each town's block fill actually reach the fade band? |
| `checks/claims-false-deadend-census.mjs` | "IS THIS DEGREE-1 TIP A ROAD END, OR A FRAGMENT SEAM?" |
| `checks/claims-fetch-contains-the-forever-zone.mjs` | WHY. Jacob's eye, 2026-09-06: "the rest of the streets show around the disc, just these on |
| `checks/claims-gas-schema.mjs` | The GAS backend's real shape, READ FROM SOURCE — never restated. |
| `checks/claims-ground-normals-come-from-the-terrain.mjs` | terrain.mjs — IS THE GROUND LIT BY THE HILL IT IS DRAPED ON? |
| `checks/claims-ground-refinement-does-not-breed-slivers.mjs` | CLAIM — REFINEMENT DOES NOT BREED SLIVERS PAST WHAT A GROUP'S OWN AREA CAN NEED (F2/F3, 2026-09-24). |
| `checks/claims-hero-degrade-static.mjs` | static.mjs — the opening view of a town with no keyframes. |
| `checks/claims-highway-handedness.mjs` | CLAIM — A ONE-WAY CARRIAGEWAY'S WIDE SIDE IS ON THE DRIVER'S RIGHT (H-3 check 4). |
| `checks/claims-highway-sweep-is-finite.mjs` | CLAIM — EVERY HIGHWAY SWEEP IS A VALID POLYGON (H-3 step 2; the Provincetown failure, 2026-09-24). |
| `checks/claims-highway-width-from-lanes.mjs` | CLAIM — A HIGHWAY'S WIDTH IS ITS LANES, AND EVERY VALUE SAYS WHERE IT CAME FROM (H-3 check 2). |
| `checks/claims-inboard-side-convention.mjs` | READ-ONLY. Two questions left by claims-side-chain-falsifiers.mjs: |
| `checks/claims-inner-edge-deletion-gates.mjs` | the regression gates for deleting |
| `checks/claims-inner-edge-side-selector.mjs` | WHAT actually selects the ped-zeroed side on |
| `checks/claims-intake-absence-is-loud.mjs` | loud.mjs |
| `checks/claims-intake-is-consumed.mjs` | consumed.mjs — WHAT DID THIS TOWN FETCH THAT NOTHING USES? |
| `checks/claims-lab-imports-never-reimplements.mjs` | reimplements.mjs — IS THE SURFACE LAB STILL THE MAP'S ENVIRONMENT? |
| `checks/claims-leaf-pack-cells-agree.mjs` | A leaf pack's CELLS MUST BE INTERCHANGEABLE — the system assumes it and nothing checked. |
| `checks/claims-light-sources-are-live.mjs` | CLAIM — EVERY CONTROL ON STAGE'S LIGHT SOURCES CARD REACHES A LIVE UNIFORM, IN EVERY TOWN'S STAGE AND IN PRODUCTION. |
| `checks/claims-look-default-has-no-town.mjs` | "IS THE KIT'S 0-STATE A KIT, OR IS IT A TOWN?" — A11 / A00, the root gate. |
| `checks/claims-look-seed-scene-clean.mjs` | "DOES A NEW LOOK START CLEAN?" — A11 / D-C, the recurrence gate. |
| `checks/claims-matched-axes-have-matrices.mjs` | Without one, enumDistance returns farDistance (9) for ANY non-identical pair |
| `checks/claims-memory-index-health.mjs` | "WILL THE READ-IN STILL LOAD?" — the standing guard on the coordinator memory index. |
| `checks/claims-menu-item-ids.mjs` | Does every orderable menu item have a STABLE identity? |
| `checks/claims-named-way-becomes-street.mjs` | ⭐⭐ DOES A NON-VEHICULAR WAY BOUND A CITY BLOCK? — the check behind `ROADMAP A19`. |
| `checks/claims-no-coarse-value-decides.mjs` | The defect this exists for, measured 2026-08-26: SelecTree's `leaf_form` has three |
| `checks/claims-no-dossier-rests-on-a-wrong-species.mjs` | species.mjs — DOES ANY DOSSIER CITE A SOURCE THAT ANSWERED FOR ANOTHER SPECIES? |
| `checks/claims-no-label-is-a-made-up-name.mjs` | ⭐ IS ANY BAKED STREET LABEL A NAME THE SKELETON MADE UP? — `ROADMAP A19`. |
| `checks/claims-no-listing-links-to-a-hijacked-domain.mjs` | a URL a researcher condemned may not ship. |
| `checks/claims-no-photo-loads-from-someone-elses-server.mjs` | every listing photograph is ours, and |
| `checks/claims-no-shadowed-chains.mjs` | WHY. Jacob's eye, 2026-09-06, on Survey: two navy centerlines running near-parallel with a |
| `checks/claims-no-slab-outlives-its-schema.mjs` | CLAIM: no baked slab is read under a fade model it was not baked for. |
| `checks/claims-no-town-wears-another-towns-mark.mjs` | no LS asset is hardcoded into a shared surface. |
| `checks/claims-no-tree-stands-on-drawn-hardscape.mjs` | NO TREE MAY STAND ON A SURFACE THE MAP DRAWS AS HARDSCAPE. |
| `checks/claims-node-pair-key-parity.mjs` | SLICE 1 of "fix the key". PROVE, DON'T SWITCH. |
| `checks/claims-objects-dissolve-with-the-ground.mjs` | CLAIM: trees, lamps and labels thin out over the SAME band the ground fades on — |
| `checks/claims-open-now-has-one-home-and-handles-midnight.mjs` | one predicate, and it survives a |
| `checks/claims-opting-out-of-the-fade-is-explicit.mjs` | CLAIM: a population that does not fade says so EXPLICITLY, and buildings are one. |
| `checks/claims-orphaned-customs.mjs` | It reported "27 of 76 authored leg slots are never read" (commit c430f4e9). |
| `checks/claims-osm-ground-has-no-duplicates.mjs` | duplicates.mjs |
| `checks/claims-override-provenance.mjs` | "WHOSE TOWN DOES THIS OVERRIDE BELONG TO?" — A11, the provenance classifier. |
| `checks/claims-preclip-walk.mjs` | DOES THE PUNCH-OUT EVER SEE A CLIPPED VERTEX? |
| `checks/claims-price-of-record.mjs` | Can a DISPLAY FIGURE ever be charged? |
| `checks/claims-proto-wall.mjs` | ⭐ THE WALL, ENFORCED BY READING THE SOURCE — not by a comment claiming it. |
| `checks/claims-public-urls-come-from-the-town-domain.mjs` | EVERY PUBLIC URL THE PLAYER BUILDS TAKES THE TOWN'S DOMAIN FROM ONE HELPER. |
| `checks/claims-radius-has-one-home.mjs` | home.mjs |
| `checks/claims-recentre-removes-asymmetry.mjs` | READ-ONLY. Jacob, 2026-09-04: "there is NO asymmetrical case for the CHAIN ITSELF, for |
| `checks/claims-reference-credits.mjs` | The acknowledgements for the Salon's reference plates — GENERATED from the dossiers, |
| `checks/claims-references-are-sound.mjs` | the research database (references/registry.json) is internally sound. |
| `checks/claims-repour-changes-nothing.mjs` | WHY THIS EXISTS. `promote-ribbons.js` and `ROADMAP A01` both carried a standing alarm that a |
| `checks/claims-research-is-keyed-to-the-place-it-describes.mjs` | every research record's |
| `checks/claims-revert-field-coverage.mjs` | coverage.mjs — CAN THE OPERATOR GET BACK? |
| `checks/claims-rim-census.mjs` | THE RIM CENSUS — what `pipeline.js`'s boundary clip costs, per scene. READ-ONLY. |
| `checks/claims-ring-partition.mjs` | "DOES THE FROZEN RING ALREADY CARRY A PARTITION WITH AN OWNER ON EVERY ARC?" |
| `checks/claims-scene-at-default.mjs` | "IS THIS SCENE AT THE STUDS?" — enumerate every surviving authoring gesture, |
| `checks/claims-scene-flag-is-the-equals-form.mjs` | form |
| `checks/claims-shader-fragments-declare-what-they-use.mjs` | EVERY IDENTIFIER A GLSL FRAGMENT USES |
| `checks/claims-side-baseline-audit.mjs` | VERIFY THE BASELINE BEFORE COMPARING TO IT. |
| `checks/claims-side-chain-falsifiers.mjs` | READ-ONLY. THE TWO FALSIFIABLE PREDICTIONS of the directed-side-chain / grout model, |
| `checks/claims-simplify-preserves-authoring.mjs` | WHY THIS MUST RUN BEFORE THAT CHANGE. The drawn centreline and the line ① is built from are two |
| `checks/claims-species-map-routes-are-composed.mjs` | Every COMMON a scene routes must resolve to a COMPOSED species. |
| `checks/claims-spur-leg-offset.mjs` | READ-ONLY. ⭐ SCOPE, and it is the whole point of this file: |
| `checks/claims-stage-controls-are-live.mjs` | CLAIM — EVERY STAGE CONTROL MOVES SOMETHING ON A TOWN NOBODY HAS LOOKED AT. |
| `checks/claims-stat-scope.mjs` | scope.mjs — A DISPLAYED FIGURE MUST DECLARE, AND MATCH, ITS SCOPE. |
| `checks/claims-the-ao-belongs-to-its-ground.mjs` | ground |
| `checks/claims-the-armoured-shore-is-never-empty.mjs` | empty.mjs — IS THERE A WALL AT EVERY DISTANCE? |
| `checks/claims-the-camera-has-one-definition.mjs` | definition.mjs — DOES EVERY APP DRIVE THE CAMERA THE SAME WAY? |
| `checks/claims-the-capture-frame-is-the-clip-frame.mjs` | THE FRAME A BAND IS CUT IN MUST BE THE FRAME THE CAMERA CLIPS IN. |
| `checks/claims-the-crest-is-measured-behind-the-shore.mjs` | shore.mjs — WHERE WAS THE WALL'S HEIGHT READ? |
| `checks/claims-the-dev-servers-do-not-import-the-looks-index.mjs` | no dev server imports a file it WRITES. |
| `checks/claims-the-directory-has-exactly-one-order.mjs` | every writer of the listings store orders |
| `checks/claims-the-fade-tracks-the-active-disc.mjs` | disc.mjs — WHOSE CIRCLE IS THE MAP FADING OVER? |
| `checks/claims-the-ground-has-no-cross-polygon-t-junctions.mjs` | junctions |
| `checks/claims-the-grove-shows-only-finished-trees.mjs` | trees.mjs — CAN THE GROVE SHOW A TREE THAT ISN'T THIS TOWN'S, OR ISN'T BAKED? |
| `checks/claims-the-key-light-is-a-real-body.mjs` | body.mjs — IS ANYTHING ACTUALLY THERE? |
| `checks/claims-the-light-follows-the-weather.mjs` | one weather state drives the rain AND the light. |
| `checks/claims-the-publish-button-can-say-it-is-done.mjs` | its condition measures what it ships. |
| `checks/claims-the-publish-gate-pushes-where-staging-deploys.mjs` | THE PUBLISH GATE MUST PUSH WHERE THE DEPLOY ACTUALLY LISTENS. |
| `checks/claims-the-publish-panel-reports-the-address-it-shipped.mjs` | no site URL is a module constant. |
| `checks/claims-the-revetment-builds-on-the-wet-face.mjs` | face.mjs — DOES THE STONE FACE THE WATER? |
| `checks/claims-the-revetment-ends-as-a-heap.mjs` | heap.mjs — DOES THE STONE STOP IN A CUT? |
| `checks/claims-the-search-outlives-an-empty-ticker.mjs` | the header's chrome may not be gated on |
| `checks/claims-the-shadow-box-has-no-cliff.mjs` | the fitted shadow box is continuous at the horizon. |
| `checks/claims-the-shore-is-closed.mjs` | closed |
| `checks/claims-the-shore-knows-which-side-is-wet.mjs` | wet.mjs — WHICH FACE DOES THE STONE GO ON? |
| `checks/claims-the-shore-says-what-it-is-made-of.mjs` | of.mjs — CAN THE KIT TELL STONE FROM SAND? |
| `checks/claims-the-slab-envs-do-not-collide.mjs` | STAGING AND PRODUCTION MUST NOT SERVE THE SAME SLAB. |
| `checks/claims-the-slab-freshness-key-is-not-stale.mjs` | NO SLAB ARTIFACT MAY BE NEWER THAN THE KEY THAT BUSTS IT. |
| `checks/claims-the-weather-feed-arrives-in-the-units-we-read.mjs` | the Open-Meteo request names the |
| `checks/claims-through-node-width-step.mjs` | THE CHECK: at a THROUGH-NODE — a ring vertex where two consecutive runs carry |
| `checks/claims-tod-fades-at-the-edges.mjs` | CLAIM — TIME-OF-DAY KEYS TWEEN; A KEY BORDERING A BLANK TILE CAN FADE UP OR DOWN, AND THE FADE DOES WHAT IT SAYS. |
| `checks/claims-twilio-webhook-guard.mjs` | does sms-webhook actually reject a forged POST? |
| `checks/claims-two-listings-are-not-one-place.mjs` | no two listings share an address AND a phone. |
| `checks/claims-uturn-outer-edge-walk.mjs` | THE CHECK: walk the OUTER EDGE (the asphalt polygon `iA`) of every tile that |
| `checks/claims-verify-taxon.mjs` | taxon.mjs — asserts vocabulary.mjs `verifyTaxon`. |
| `checks/claims-water-scales-with-its-body.mjs` | body.mjs — DOES THE WATER KNOW HOW BIG IT IS? |
| `checks/claims-zero-separation-offset.mjs` | READ-ONLY. Three questions, none of which has been measured: |
