# HANDOFF / BRIEF — per-neighborhood backend tenancy (its own area of the shared backend)

> **Agent: FRESH → name yourself.** **Foreground** (background writes are denied — you must be able to write). **Worktree** (`isolation: worktree`): trunk `curb-offset-draw` is live with an unrelated impostor agent (tree files) — you touch `apps-script/Code.js` + `src/lib/api.js`, no collision, but isolate anyway. **You never deploy** (see the boundary at the end).

## Route first (the CLAUDE.md gate — do not skip)
`ORIENTATION.md` → `README.md §⭐ START HERE` → then: `PUBLISH.md §2` (the backend — Apps Script + the Sheets workbook, the deployment-ID single-source-of-truth) + `HANDOFF-blank-app-instance-decoupling.md` (the Universal Reader arc: the app is a generic reader, LS is installation #1, `?look=` selects the installation; **backend multi-tenancy was the deferred horizon — this brief is it**). You are extending the two-faces frame to the LIVE data layer. Read those, don't re-derive the model.

## The goal (one line)
The shared backend (one Apps Script + one Google Sheets workbook) is **single-tenant Lafayette Square** — every install that hits it (e.g. `?look=hipointe-demun` on staging) reads/writes **LS's** data, so HiPointe's Society shows LS's businesses. Give **each neighborhood its own area of the one backend**, selected by the active `look`, so a non-LS install reads/writes its own live data.

## The design to build to (SETTLED with Jacob — build to THIS, don't re-litigate)
**Per-look TABS, not a `look` column.** One workbook; each neighborhood gets its own tabs; the current request's `look` resolves which tab. Chosen because **isolation is structural** (you physically read the look's tab — you *cannot* accidentally serve another neighborhood's rows) and because it **concentrates the change in one chokepoint** instead of ~50 handler edits. Rails:

- **`getSheet(name)` is the pivot.** It's called **89×** and is the near-universal chokepoint for sheet access (verified). Make **it** look-aware: resolve `name` → the current look's tab. Almost none of the 89 call sites change — they inherit the right tab for free.
- **Default look = bare tab names → ZERO migration.** For `lafayette-square` (the `DEFAULT_LOOK`), `getSheet('Listings')` resolves to the **existing** `Listings` tab. LS's data never moves. For other looks, resolve to a suffixed tab (recommend `Listings__hipointe-demun` — pick one clean convention and hold it).
- **Auto-create on demand (extend, don't reinvent).** `getSheet` (`Code.js:54`) **already** auto-creates a missing tab and seeds headers (the `HEADERS` map, L57–64). Extend that: a missing per-look tab is created by **cloning the header row from the default-look (bare) tab** — so a new neighborhood needs **no manual tab setup and no data seeding** (see "content vs live" below).
- **`Handles` stays GLOBAL.** Identity is one-per-person across neighborhoods. Keep a small `GLOBAL_SHEETS` set (`['Handles']`, maybe `LinkTokens` — you decide by reading their use) that `getSheet` always resolves to the bare tab regardless of look. Everything else (Listings, Checkins, Reviews, Events, Guardians, Residents, LobbyPosts, Bulletins, Threads, Comments, QRDesigns…) is per-look.
- **The look reaches `getSheet` via a request-scoped global.** Apps Script runs one execution per request, so at the top of `doGet`/`doPost` read the look (`e.parameter.look` for GET, `body.look` for POST), default to `DEFAULT_LOOK` when absent (back-compat: old clients + LS), and stash it in a script-scoped var (`CURRENT_LOOK`) that `getSheet` reads. No signature churn on the 89 callers.

## Exact anchors (read these, build with them)
- **`apps-script/Code.js`**
  - `getSheet(name)` — **L54** (the chokepoint; already auto-creates + seeds headers L57–64). This is where per-look resolution + header-clone-on-create lives.
  - `doGet(e)` — **L172** (routes on `e.parameter.action`, reads `e.parameter.*`). Capture `look` here.
  - `doPost(e)` — **L210** (routes on `body.action`). Capture `look` here.
  - Shared helpers that operate on a sheet handle and mostly DON'T change: `sheetToObjects` (L69), `getHeaderMap` (L125), `findRow` (L133), `updateCell` (L150), `deleteRowsByColumn` (L157).
  - **The bypasses to audit (must not escape the look):** a direct `getSheetByName` at **L1948** and `openById` calls (3 total, one is inside `getSheet` itself). Route the real bypass through the look-aware path or justify it in a comment.
- **`src/lib/api.js`** — the ENTIRE frontend change is two spots:
  - `get(action, params)` — **L145**: add `url.searchParams.set('look', INSTANCE.lookId)`.
  - `post(action, body)` — **L157**: add `look` to the body → `JSON.stringify({ action, look: INSTANCE.lookId, ...body })`.
  - Import `INSTANCE` from `../instance.js` (already used across the reader). `USE_MOCKS` dev path (L7) — `look` is harmless there.

## Content vs live — WHY HiPointe needs no seeding (don't over-build)
The Society directory's listings come from `useListings`, which loads the installation's **local content** (`listings.json`) as the base, THEN merges the backend on top (backend rows win; static-only landmarks are appended). So with an **empty** HiPointe backend tab, the merge keeps HiPointe's local listings → **its Society shows its own businesses**. The per-look tab just accumulates *live* activity (check-ins, reviews, guardian claims) as it happens, starting empty. **Do not seed HiPointe listings into the Sheet** — the local content is the display base; the tab is for live edits. (Community-stats counts read 0 for a fresh neighborhood — correct.)

## Build order
1. **Backend `getSheet` look-resolution** — request-scoped `CURRENT_LOOK` (set in `doGet`/`doPost`, default `DEFAULT_LOOK`), per-look tab name (bare for default look), header-clone-on-create, `GLOBAL_SHEETS` exception. Audit the L1948 bypass.
2. **Frontend `get`/`post`** — send `INSTANCE.lookId` as `look` (two lines).
3. **Isolation proof** — before/after: a `look=hipointe-demun` request reads/writes only HiPointe tabs; a default/LS request is byte-identical (bare tabs, no behavior change). Write a short manual test-plan the deploy can run.

## Doctrine rails (violating these is the predictable failure)
- **Structural isolation is the point** — every sheet access flows through the look-aware `getSheet`; a `look=X` request must be *physically incapable* of touching `look=Y`'s rows. The audited bypass is the one place that could break this.
- **LS byte-identical** — default-look requests hit the existing bare tabs; no LS data moves, no LS behavior changes. Prove it.
- **Scene = dataset + a per-scene selector, NOT a forked pipeline** (`feedback_no_parallel_pipeline_for_scenes`) — one backend, one codebase, look selects the area. No per-neighborhood code branches.
- **Client-declared `look` is acceptable for this tier** — listings are public; the guardian-secret / admin-token auth is per-listing and orthogonal (unchanged). Do **not** weaken existing auth; do **not** try to fix it either (next rail).

## Out of scope (surface drift before crossing — `feedback_baby_must_surface_scope_drift`)
- **The deeper auth-hardening** (admin-token-in-body trust, webhook sig, RLS — `HANDOFF-security-audit.md`) is its **own** arc. You add tenant *isolation* (structural, via tabs); you do NOT refactor the auth model. Note where they touch; don't balloon.
- **Cary / Supabase** (delivery backend) — separate, deferred; HiPointe delivery is off.
- **The frontend content seam** — already done (Phase 2). You only add the `look` param.
- **No new neighborhoods' data** — you make the mechanism; HiPointe's tabs auto-create empty.

## ⛔ The deploy boundary — YOU NEVER DEPLOY
The Apps Script push is **Jacob's** (`clasp push && clasp deploy -i <ID>`, unauthed in your env; the deployment-ID single-source-of-truth ritual is `PUBLISH.md §2`). **You edit `apps-script/Code.js` in the repo and stop.** Deliver: the code + a crisp **deploy-and-verify checklist** for Jacob (what to `clasp deploy`, how to confirm LS unchanged, how to confirm `?look=hipointe-demun` writes to HiPointe tabs and can't read LS's). Final live verification is post-deploy, with Jacob — do not claim "confirmed" without it (`feedback_dont_claim_confirmed_without_verifying`).

## Commit boundaries
Worktree branch; **canon docs are off-limits** (Boz folds the outcome into `PUBLISH.md §2` + `ls/ARCHITECTURE.md` after deploy + eye-gate). Commit only your own files (`Code.js`, `api.js`, and your deploy-checklist doc). No collision with the impostor agent (tree files) — but if you find yourself editing anything outside the backend/api surface, **stop and flag Boz.**
