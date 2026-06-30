# Handoff — the Publish ceremony + SMS-hero OG capture (2026-06-30)

> **Status: ✅ BUILT + SHIPPED** (commits `d1b86dd4` feature, `09f4283b` forensic, on `curb-offset-draw` → pushed to `main` + staging). This is the **State capture**; the **canon-fold is PENDING** (the cartograph docs were mid-sweep by another writer 2026-06-30, so I didn't edit them — see "Canon-fold pointers" below). Reads as a dispatch-ready brief for whoever folds it.

## What landed

**The Preview "Publish" panel** — Preview is now the publish gate *with a button* (realizes the un-built **"one-command save ceremony"** named lever, `OPERATIONS §Named levers #2`). All DEV-ONLY: the git endpoints live in `cartograph/serve.js` (never in the CI/prod build), and the panel hides itself when the backend isn't reachable, so a deployed Preview can't touch the live app.

- **Backend (`cartograph/serve.js`, reached via the `/api/cartograph/*` vite proxy):**
  - `POST /looks/:id/publish` — `git add` + commit the **scoped slab pathspecs only** (never sweeps unrelated dirty files) + push the trunk (staging). Returns `{committed, changed, bakedAt}`.
  - `POST /looks/:id/promote` — fast-forward `main` (prod). Guards non-ff + no-op.
  - `GET /looks/:id/publish/status` — fetch remote, report unbaked / dirty-slab / ahead-of-staging / ahead-of-prod.
  - `GET /looks/:id/deployed?target=` — poll the live site's `bakedAt` server-side (no CORS).
  - `POST /og-image` — save a captured frame to `public/photos/og-preview.jpg` (in the slab pathspecs → ships on publish).
  - `GET /og-deployed` — is the captured OG image live on prod yet (compare live bytes to local).
  - `slabPathspecs(id)` = `public/baked/<id>/`, `public/looks/<id>/design.json`, `public/looks/index.json`, `public/baked/default.json`, `src/data/ribbons.json`, `public/photos/og-preview.jpg`.
  - ⚠️ **git gotcha (fixed, keep):** `git commit -- <path>` only knows TRACKED files → a new untracked `og-preview.jpg` fails "pathspec did not match." Must `git add -- <paths>` FIRST, then `git commit -- <paths>`. Also filter pathspecs to those that `existsSync`.
- **Frontend (`src/preview/PreviewApp.jsx`):** the panel + the **SMS-hero multistate button** (`📷 Capture SMS Hero → 🚀 Push to Prod → ✓ live`). Capture = center-square JPEG off the **WebGL canvas** (the *slab* render — UI panels are DOM overlays, never captured); 1200×1200; `preserveDrawingBuffer:true` on the Preview canvas only. In-memory state (no persistence — a refresh just resets to Capture, by design).

**The per-shot look resolve fix (B)** — `useSceneJson.js` now reads `useCamera(s => s.shotOverride ?? s.viewMode)`. Production never sets `shotOverride` → byte-identical. Preview sets it from its local `shot` (PreviewApp effect) so the **authored browse/street fork actually renders in Preview** (before, Preview showed the base/Hero look for every shot because it drives a local shot, not the global `viewMode`). ⏳ **Eye-gate pending:** toggle Hero→Browse in Preview, confirm the authored browse look applies.

**OG link-preview** — was a **404** (`/photos/og-preview.jpg` never existed) → shared links showed a bare "www.lafayette-square.com" spam-looking card. The capture button fills it. (`index.html` + `worker.js` already reference it; no `og:description` yet — easy add.)

## Doctrine settled today (fold into canon)

1. **Preview is the publish gate; staging is REDUNDANT for slab-data publishes.** The Publish panel ships *slab data* (scene.json, baked artifacts, the OG image) that **Preview already renders in production's exact render tree** (`project_preview_equals_ls_literally`) — so a staging deploy shows nothing Preview didn't. Staging's real value is **code/structural** changes (deploy/build/CDN/mobile differences), which go the normal git way, not this panel. → the SMS-hero flow pushes **straight to prod**; "Publish to Staging" is opt-in, not the default. *(Refines `OPERATIONS §Save→ship` strategy-B "staging first" — still right for code, not for slab.)*
2. **Buttons ARE the status + action** (Jacob's UX law, 2026-06-30): the button's label *is* the state; clicking does the one available thing. No separate "up to date / N ahead" lines, no deploy rows, no prose status. **Terse, present-tense, zero "helpful" clutter.** *(See `feedback-implicit-over-explicit-ux`.)*

## Open / queued (NOT done)

- **Panel "buttons-as-status" cleanup** — the panel still carries the old `Publish to Staging` + `Promote to Prod` buttons + status lines alongside the SMS multistate = "frictive" (Jacob). Collapse to: one deploy-aware status, the SMS-hero multistate, and a single "Ship slab (no new image)" for look-only changes. Jacob said "forget it for now" — do it on the next panel pass, per doctrine #2 above.
- **Hero random-start fix (diagnosed, NOT applied)** — `Scene.jsx` calls `randomizeHeroStart()` only on `entering === 'hero'` (re-entry from browse/street), **never on initial load** → every fresh load opens on phase 0 = the first keyframe = the **slowest endpoint of the sine wave** ("always the same spot" + "takes forever to get going"). **Fix:** a one-shot mount effect in `CameraRig` (≈line 260, after `heroMotion`): if booting in hero, `randomizeHeroStart(heroMotion.period)` once (ref-guarded; dep `[heroMotion.period]` so it fires once the slab's period loads). Prod-only (Preview uses ShotCamera). Eye-gate: reload a few times → different, already-moving start each time.
- **TOD-aware OG image** — backlogged in `ls/BACKLOG.md` (worker `/og` route + `suncalc`, day/night pair). Not today.
- **`og:description`** — the share card still has no subtitle; one-line add to `index.html` + `worker.js`.

## Canon-fold pointers (for the doc sweep)
- `cartograph/PREVIEW.md §0.2` — the publish gate now has a **button** (the named lever is realized); note staging-optional-for-slab.
- `cartograph/OPERATIONS.md §Save→ship` + §"Named levers #2" — mark the one-command save ceremony **BUILT**; record the staging-redundant-for-slab refinement.
- `FEATURES` (ls or cartograph) — the share-image + one-click publish as an operator feature.
- Retire this file → NOTES once folded.
