# Deploy & verify — per-neighborhood backend tenancy

**Branch:** `sheet-tenancy` (worktree off `curb-offset-draw`). **Agent:** Vane (fresh). **Do not merge canon docs** — Boz folds the outcome into `PUBLISH.md §2` + `ls/ARCHITECTURE.md` after this deploys and passes your eye-gate.

## What shipped (the whole change)
Each neighborhood now gets its **own area of the one shared backend**, selected by the request's `look`. HiPointe stops reading Lafayette Square's live data.

- **`apps-script/Code.js`** — `getSheet()` (the 89× chokepoint) is now look-aware. A request-scoped `CURRENT_LOOK` (set at the top of `doGet`/`doPost` from the client's `look`, default `lafayette-square`) drives `tabNameFor()`:
  - default look → **bare** tab (`Listings`) → **LS data never moves, zero migration**.
  - other look → **suffixed** tab (`Listings__hipointe-demun`), auto-created on demand by **cloning the bare tab's header row** (no manual setup, no seeding).
  - `Handles` is in `GLOBAL_SHEETS` → always bare (identity is one-per-person across neighborhoods). Link tokens live in `CacheService`, not a tab — no tenancy concern.
  - The client `look` is sanitized at the door (`normalizeLook`: trim → lowercase → strip non-`[a-z0-9-]`, empty→default) before it becomes a tab name — canonical `lookId`s pass through unchanged; a casing/whitespace/illegal-char variant collapses to a safe slug instead of erroring the request or fragmenting a tenant.
  - Bypasses audited: `setupSheets()` stays look-unaware **on purpose** (it provisions the default-tenant bare tabs, which are the header-clone source) — commented. `saveDesign()`'s unreachable fallback routed through `tabNameFor` so it can't escape the tenant — commented.
- **`src/lib/api.js`** — `get()` adds `?look=INSTANCE.lookId`; `post()` adds `look` to the body. Plus the `INSTANCE` import. Nothing else.

## Pre-deploy proof (already run, green — no deploy needed)
- `node --check apps-script/Code.js` → parses.
- `scratchpad/tenancy-proof.js` loads the **real** `Code.js` in a stubbed Apps Script sandbox → **14/14 pass**: default look sees LS's rows; hipointe sees zero and gets its own auto-created tab with cloned headers; LS tabs untouched; `Handles` stays global; absent `look` defaults to LS.
- `esbuild` bundles `api.js` → imports resolve, no cycle.

## You deploy (I can't — unauthed here)
```
# from the repo root, on this branch's code
clasp push
clasp deploy -i <DEPLOYMENT_ID>     # the single-source-of-truth ID — PUBLISH.md §2
```
The frontend `api.js` change ships with the normal app build/deploy (Vite), not clasp.

> ⚠️ One-time, before or right after first deploy: if the **bare** LS tabs were ever created ad-hoc (not via `setupSheets`), confirm each has its header row — per-look tabs clone their headers from the bare tab, so a bare tab missing headers would give new neighborhoods empty headers. Running `setupSheets()` once from the Apps Script editor is the safe belt-and-suspenders (it's idempotent and only touches bare/default tabs). LS's existing data is unaffected.

## Verify after deploy (live, with your eye — the real gate)
1. **LS byte-identical.** Open the app with **no** `?look=` (or `?look=lafayette-square`). Society directory, check-ins, reviews, events, bulletins, residents — all show LS's real live data exactly as before. Post a test review on an LS listing → it lands in the bare `Listings`/`Reviews` tabs (open the workbook; no `__` suffix). **Nothing about LS moved or changed.**
2. **HiPointe reads its own (empty) tenant.** Open `?look=hipointe-demun` on staging. Society shows **HiPointe's** businesses (from its local `listings.json` content — correct; the backend tenant is empty and the merge keeps local listings). Community-stats counts read **0** for a fresh neighborhood — correct.
3. **HiPointe writes land in HiPointe tabs, never LS.** As `?look=hipointe-demun`, do a check-in / post a review / claim a listing. Open the workbook → new tabs appear **suffixed** (`Checkins__hipointe-demun`, `Reviews__hipointe-demun`, …) with the activity. The **bare** `Checkins`/`Reviews` tabs (LS's) are **untouched**. This is the isolation proof by eye.
4. **HiPointe cannot see LS activity.** Whatever you posted to LS in step 1 does **not** appear under `?look=hipointe-demun`, and vice-versa.
5. **Identity is shared.** A handle set on one device is the same handle across looks (Handles is global — bare tab, no suffix).

If any of 1–4 fails, **stop** — that's a tenancy leak, not a cosmetic issue.

## Rollback
Revert the two files (`Code.js`, `api.js`) and re-`clasp push` / re-deploy the frontend. No data migration to undo — bare tabs were never touched; per-look tabs are additive and harmless if orphaned.

## Out of scope (untouched — surfaced, not crossed)
Deeper auth-hardening (admin-token trust, webhook sig, RLS — `HANDOFF-security-audit.md`) is its own arc; this adds tenant **isolation** only, no auth-model changes. Cary/Supabase delivery backend: separate, deferred. No new neighborhood data seeded — HiPointe's tabs auto-create empty by design.
