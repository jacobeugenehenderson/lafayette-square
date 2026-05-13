# Lafayette Square — Backlog

The path from where we are (branch `cartograph-looks-pass-ab`) to where we're going (clean LS app deployed on the cartograph slab at `lafayette-square.com`).

> Part of the **LS trinity** (`ls/FEATURES.md` / `ls/ARCHITECTURE.md` / `ls/BACKLOG.md`). Read at session start; check off completions during work; prune toward pristine. The cartograph trinity under `cartograph/` covers authoring; this is the consumer side.

Last updated: 2026-05-13 EOD (Phase B complete — three plans canonical at `plans/`; staging URL live with slab rendering; BASE_URL invariant codified across plans + slab contract + memory)

---

## Session-end pin (read first)

**The end state is one thing: LS app running stably on the cartograph slab at `lafayette-square.com`.** Mobile-stable, error-free, secure, beautiful, lightweight. Cartograph polish continues on its own track (`cartograph/BACKLOG.md`); we don't wait for it.

**The product doctrine** (see `feedback_beautiful_first_lightweight_51` memory): beautiful + stable are co-equal; stability wins forced tradeoffs 51/49; **never resolve a tradeoff by making the product look cheaper.** The fix to "we can't do both" is always to be more clever.

**Main is fully pre-slab.** Production today renders via `VectorStreets` + `StreetRibbons` (live) — no `public/baked/`, no `BakedGround.jsx`. The branch ships a complete rendering-architecture switchover, not an incremental migration. That's why this is a three-phase operation, not a flat punchlist.

**Three named operations** stand between here and merge-to-main:

### Phase A — Diagnostic ✅
Shipped 2026-05-13: [`reference/RUNTIME-DELTA.md`](reference/RUNTIME-DELTA.md). Three sub-catalogs: architecture diffs (old VectorStreets/StreetRibbons path vs. new slab path), what ships now that didn't (authoring surfaces + store seam + bundle deltas + asset volume, with keep/strip/gate/parametrize verdicts), and what stops working or changes for users (consumer-surface walk). Carry-overs RD.1–RD.10 feed Phase B + Phase C.

### Phase B — Plan ✅
Three canonical plans, all shipped 2026-05-13:

- [`plans/kit_couplers_parametrize.md`](../plans/kit_couplers_parametrize.md) — six kit↔instance couplers (Cartograph slab, Arborist trees, Meteorologist clouds, Courier/Cary, Listings/GAS, Place/identity). `src/instance.js` introduced; `useSceneJson` slab-side data hook replaces `useCartographStore` reach from runtime; `scene.json.bakedAt` amendment to SLAB-CONTRACT §4. CC.1–CC.8 cross-cutting rules; CC.8 codifies the BASE_URL invariant.
- [`plans/pre_public_cleanout.md`](../plans/pre_public_cleanout.md) — resolves every strip + gate verdict from RUNTIME-DELTA §2. Mode-conditional `rollupOptions.input` drops authoring HTML in prod; source trees stay (CC.8 "kit stays; production excludes"); `copyPublicDir: false` + whitelist plugin; two verified-orphan file deletions (`public/data/landmarks.json`, `public/cartograph-ground.svg`); CARY-BRIEF relocated not archived; five-place deployment-ID audit script + grep gate wired into `deploy.yml` as the only production-workflow modifications.
- [`plans/ls_basemap_swap.md`](../plans/ls_basemap_swap.md) — sequences the merge. Six phases: couplers exec → cleanout exec → pre-merge verification on staging → `git merge --no-ff` → post-merge stability watch → concurrent tracks resume. Nine CC rules; rollback command verbatim (`git push --force-with-lease origin v1-pre-cartograph-merge:main`).

### Phase C — Execute
Phase C is the entire marriage leap operation, sequenced by `plans/ls_basemap_swap.md`. Each commit lands on the branch, auto-deploys to the staging URL via `.github/workflows/staging.yml`, gets verified there before the next commit. Phase 3's exhaustive RUNTIME-DELTA §3 walk on real cellular is the hard gate before merge to `main`.

**Staging URL:** [`https://jacobeugenehenderson.github.io/lafayette-square-staging/`](https://jacobeugenehenderson.github.io/lafayette-square-staging/) — slab renders end-to-end as of `a1ebe1b`.

---

## Concurrent / non-blocking

These don't gate the marriage leap; they progress on their own tracks.

| Item | Notes |
|---|---|
| **Cartograph evergreen** | Visual stack refinements (`cartograph/BACKLOG.md`) continue. Each bake produces a fresher slab; the deployed site picks up new slab data as you ship. |
| **Arborist roster swap** | Trees library upgrade post-stability. Hot-swappable into `public/baked/<look>/trees/` + `default.json`; no LS app code changes needed. |
| **Cary v1 status decision** | Ship behind placeholder vs. wire up Supabase live. Affects bundle weight + secrets. Resolution lands in Phase B's parametrize plan (Cary's data layer is the kit-instance boundary). |
| **`ls/FEATURES.md` end-user experience writeup** | Browse / Hero / Street / PlaceCard / Bulletin / residence / handles. Doc work, lags execution opportunistically. |
| **`ls/reference/SECURITY.md`** | Device-hash identity, admin passphrase, Supabase RLS posture. Lands as part of Phase B's security audit doc. |

---

## Doc work already done (this session)

| Item | Where |
|---|---|
| LS trinity scaffolded | `ls/{FEATURES,ARCHITECTURE,BACKLOG}.md` |
| Cartograph trinity moved | `cartograph/{FEATURES,ARCHITECTURE,BACKLOG}.md` |
| Two-trinity index | Root `README.md` |
| Live-data inventory | `ls/ARCHITECTURE.md §2` + `ls/reference/INVENTORY-DATA.md` |
| Runtime composition map | `ls/ARCHITECTURE.md §1` |
| API reference (50+ GAS endpoints + Supabase + Worker + open-meteo) | `ls/reference/INVENTORY-API.md` |
| Slab boundary spec | `SLAB-CONTRACT.md` (root) |
| Rollback floor | Tag `v1-pre-cartograph-merge` on `origin/main @ 20866ef` |
| Spring cleaning | 400 MB facade-decor + 40 ribbons backups + ARCH.md archived |
| L1.1 BakedLamps swap | Shipped (production parity with Stage/Preview) |

---

## Mid-session contradictions (carry-overs)

Items the inventory + slab-contract walks flagged. None affect runtime; all should be resolved at next touch of the relevant trinity.

| ID | Item | Where | Owner |
|---|---|---|---|
| K.1 | `cartograph/FEATURES.md:286,300` + `cartograph/ARCHITECTURE.md:116,136` reference `src/components/StreetRibbons.jsx` which no longer exists. Partially addressed 2026-05-13 (FEATURES.md L286 corrected); ARCHITECTURE.md L116 + L136 still need rewriting (the latter is a longer convention essay tied to retired chain-rectangle architecture). | Cartograph trinity | Next cartograph session |
| K.2 | ~~`CloudDome` procedural — `public/clouds/{presets,almanac}.json` published but unconsumed~~ | RESOLVED | Cleanout plan §3 strips the artifacts in v1; wire-or-rewrite deferred to v1.1 concurrent track |
| K.3 | `PlanetariumOverlay` has `viewMode === 'planetarium'` infrastructure in `Scene.jsx` but the component isn't imported anywhere in production. | LS runtime | Phase C — RUNTIME-DELTA §3 walk will confirm; strip if confirmed dead |
| K.4 | `SLAB-CONTRACT.md §3` claims ground lightmap UVs are bbox-derived; not verified in `BakedGround.jsx`. | Doc accuracy | Future slab-contract touch |
| K.5 | `SLAB-CONTRACT.md §4` calls `scene.json` `layerVis` "redundant" — not verified against `bake-ground.js`. | Doc accuracy | Future slab-contract touch |
| K.6 | Vite default `copyPublicDir: true` ships all of `public/` to `dist/` today (verified — 4.9 GB `public/trees`, 255 MB `public/models`, etc., all ship). Resolved by cleanout plan §S3 allow-list. | Build hygiene | Phase C cleanout exec |
| K.7 | `BASE_URL` invariant codified 2026-05-13 across couplers plan CC.8, SLAB-CONTRACT §10.6, and memory `project_kit_deploy_path_agnostic`. All slab consumers migrated to `${import.meta.env.BASE_URL}` routing (commit `f871a9d`). | Reference | Closed |

---

## Stale handoff docs (kept, with explicit retire conditions)

These have live references — they retire when their successor lands.

| Item | Retire when |
|---|---|
| `HANDOFF-clouds-day3-clouddome-v2.md` | `<Atmosphere />` ships and supersedes the shader tuning rubric (per `meteorologist/README.md`) |
| `HANDOFF-neon.md` | NeonBands lifts decision history into `ls/FEATURES.md §"Neon"`; refs in source comments rewritten |
| `HANDOFF-sky-and-light.md` | Sky/light pipeline gets lifted into both trinities |
| `cartograph/SHADOW_HANDOFF.md` | Cartograph BACKLOG item C.4 (Shadow post-pass) lands; doc is ingested into ARCHITECTURE |

---

## Pointers

- [`ls/FEATURES.md`](FEATURES.md) — product orientation
- [`ls/ARCHITECTURE.md`](ARCHITECTURE.md) — runtime composition + live-data inventory
- [`ls/reference/INVENTORY-DATA.md`](reference/INVENTORY-DATA.md) — data catalog (partner-pasteable)
- [`ls/reference/INVENTORY-API.md`](reference/INVENTORY-API.md) — backend catalog (partner-pasteable)
- [`../SLAB-CONTRACT.md`](../SLAB-CONTRACT.md) — boundary spec between cartograph and LS
- [`../cartograph/BACKLOG.md`](../cartograph/BACKLOG.md) — authoring-side punchlist (the visual stack v1)
- Memory: `feedback_beautiful_first_lightweight_51` — product doctrine
- Memory: `feedback_orphan_audit_full_repo` — orphan-classification rule
