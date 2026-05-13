# LS Basemap Swap — Sequencing Plan

This plan sequences the merge of branch `cartograph-looks-pass-ab` onto `main` — the operation that brings LS production onto the cartograph slab. It does not specify the couplers (see [`kit_couplers_parametrize.md`](kit_couplers_parametrize.md)); it does not specify the cleanout (see [`pre_public_cleanout.md`](pre_public_cleanout.md)); those sibling plans bind. This plan sequences them, plus the actual merge to main, plus the post-merge stability watch. Output of Phase B; input to Phase C.

## Verification state

- **Branch HEAD** at write time: `cartograph-looks-pass-ab @ 9709273` ([Phase A diagnostic + Phase B plans (2/3) + SLAB-CONTRACT §10.6](.)).
- **`main` HEAD** (local): `b39834b`.
- **Branch ahead of main:** 193 commits.
- **Rollback floor:** annotated tag `v1-pre-cartograph-merge` on `origin/main @ 20866ef` (resolved). Verified via `git ls-remote --tags origin`.
- **Staging URL:** [`https://jacobeugenehenderson.github.io/lafayette-square-staging/`](https://jacobeugenehenderson.github.io/lafayette-square-staging/), deployed from `cartograph-looks-pass-ab` via `.github/workflows/staging.yml`. Slab renders end-to-end. This is the verification surface for every pre-merge gate in this plan.
- **Production deploy:** `.github/workflows/deploy.yml` triggers on push to `main` (GitHub Pages, custom domain via `public/CNAME` → `lafayette-square.com`).

## Required reading

1. [`kit_couplers_parametrize.md`](kit_couplers_parametrize.md) — sibling plan 1. Especially §1 (Cartograph coupler — `useSceneJson` seam), §6 (Place coupler — `src/instance.js`), CC.7 (`scene.json.bakedAt` amendment), CC.8 (`BASE_URL` invariant).
2. [`pre_public_cleanout.md`](pre_public_cleanout.md) — sibling plan 2. Especially §S1 (HTML-entry strip), §S3 (public allow-list + two file deletions), §S6 (`useCartographStore` grep gate), §S8 (five-place deployment-ID audit), CC.7 (couplers precondition).
3. [`../ls/reference/RUNTIME-DELTA.md`](../ls/reference/RUNTIME-DELTA.md) — Phase A diagnostic. §3 ("does the nerve still smile") is this plan's Phase 3 staging-walk surface.
4. [`../SLAB-CONTRACT.md`](../SLAB-CONTRACT.md) — boundary spec; §10.6 (BASE_URL routing rule) is the invariant the merge must not violate.
5. [`../PUBLISH.md`](../PUBLISH.md) — deploy mechanics; five-place deployment-ID SSoT.
6. [`../ls/BACKLOG.md`](../ls/BACKLOG.md) — Phase A/B/C structure; Concurrent / non-blocking tracks resume post-merge.
7. `.github/workflows/staging.yml` — staging deploy (triggers on push to `cartograph-looks-pass-ab`; force-orphan publish to external repo).
8. `.github/workflows/deploy.yml` — production deploy (triggers on push to `main`; GitHub Pages artifact upload).
9. Recent commits: `f871a9d` (Tier 1 BASE_URL consumer-side fix — slab fetches now route via `import.meta.env.BASE_URL`); `9709273` (Phase A diagnostic, Phase B plans 2-of-3, SLAB-CONTRACT §10.6 amendment).
10. Memory: `feedback_beautiful_first_lightweight_51`, `feedback_orphan_audit_full_repo`, `project_kit_helpers_pattern`, `project_kit_deploy_path_agnostic`, `feedback_d3_bundling_failure_modes`.

## Summary timeline

1. **Phase 1** — Couplers plan executes on branch. Each coupler is its own commit cluster; staging URL auto-redeploys; verify on staging before moving to the next.
2. **Phase 2** — Cleanout plan executes on branch. §S1 build-config, §S3 allow-list + two quarantine-then-delete commits, §S6 + §S8 wired into `deploy.yml`.
3. **Phase 3** — Pre-merge verification on staging URL. RUNTIME-DELTA §3 walk on desktop + real-cellular mobile; `dist/` bundle deltas; CI gates green; production (still pre-slab) confirmed unchanged.
4. **Phase 4** — The merge. Single `git merge --no-ff` of `cartograph-looks-pass-ab` into `main`; push; production workflow runs; `lafayette-square.com` updates to the slab.
5. **Phase 5** — Post-merge stability watch. Watch the production surface for one work session; rollback command stays loaded.
6. **Phase 6** — Concurrent tracks resume. Arborist roster swap, Cary v1 status decision, cartograph evergreen authoring all unblock.

---

## Phase 1 — Couplers plan execution (on branch)

### Preconditions

- Branch `cartograph-looks-pass-ab` checked out; local HEAD ≥ `9709273` (Phase B plans landed).
- Staging workflow green on latest branch commit (verified by visiting the staging URL and confirming the slab renders, per RUNTIME-DELTA §3).
- Couplers plan's required reading complete; no open contradictions from its Carry-overs section.

### Operations

Order is the couplers plan's section order — §6 lands first because §1 + §2 + §4 import `INSTANCE`.

1. **§6 Place coupler — `src/instance.js` lands.** New file at `src/instance.js` exporting the `INSTANCE` object per couplers plan §6's shape. Consumers in `src/hooks/useTimeOfDay.js`, `src/hooks/useWeather.js`, `src/components/CelestialBodies.jsx`, `src/components/SidePanel.jsx`, `src/App.jsx`, `src/components/Scene.jsx`, `src/components/InfoModal.jsx`, `src/components/BulletinModal.jsx`, `src/components/ChatModal.jsx`, `src/components/CourierDashboard.jsx`, `src/components/CourierOnboarding.jsx`, `src/components/CaryAuth.jsx`, `src/components/PlaceCard.jsx`, `src/hooks/useListings.js` migrate to `INSTANCE.*` reads. Worker mirror-constants block updated at top of `worker.js`. One commit cluster (may span multiple commits — one per logical consumer group), but lands as a unit before §1.
2. **§1 Cartograph coupler — `useSceneJson` hook + `INSTANCE.lookId` wiring.** New `src/lib/useSceneJson.js` (or `src/hooks/`) — slab-side data hook distinct from `useCartographStore`. The six runtime components (`BakedGround`, `BakedLamps`, `InstancedTrees`, `LafayetteScene`, `LafayettePark`, `treeAtlasMaterial`) migrate off `useCartographStore` reads to `useSceneJson` reads. `Scene.jsx:942` switches from hardcoded `"lafayette-square"` to `INSTANCE.lookId`. Each component's migration is its own commit per `feedback_d3_bundling_failure_modes`. CC.7's `scene.json.bakedAt` ships in the same wave: `cartograph/bake-scene.js` emits `bakedAt` (epoch ms); runtime reads it as the cache-bust seed; SLAB-CONTRACT §4 amendment lands in the same commit cluster.
3. **§2 Arborist coupler.** `InstancedTrees.jsx` + `treeAtlasMaterial.js` confirmed reading `INSTANCE.lookId` (already true after §1); no separate operation. Verification only.
4. **§3 Meteorologist coupler.** No runtime change in Phase 1 — the strip ships in Phase 2 §S3 (allow-list excludes `public/clouds/`). Verification only here.
5. **§4 Courier (Cary) coupler.** Brand strings (`"Cary"`, `"Lafayette Square Deliveries"`, `+18773351917`) migrate to `INSTANCE.courier.*` in the relevant components (already named in §6's consumer list above — the §6 + §4 string lifts land in the same Phase-1.1 commit cluster).
6. **§5 Listings coupler.** No change — env-var infra already in place. Verification only.

### Verification gates

Each commit pushes to `cartograph-looks-pass-ab`; the staging workflow auto-rebuilds and republishes to the staging URL within a few minutes.

1. **After every push:** open the staging URL on desktop. The page mounts. No console errors. The surface affected by the just-pushed coupler behaves per couplers plan's per-section verification gate (e.g., post-§6: sun position matches suncalc for `38.616, -90.2161`; post-§1: `?t=<bakedAt>` query strings on slab fetches match `scene.json`'s `bakedAt`).
2. **End-of-Phase-1 grep audits** on the branch:
   - `grep -rln "useCartographStore" src/components/ src/hooks/ src/lib/ src/App.jsx src/main.jsx` → zero lines (this is §S6's gate; passes here so §S2's validation can pass in Phase 2).
   - `grep -rn "38.616\|-90.2161\|'lafayette-square'\|\"lafayette-square\"" src/ worker.js` → matches only in `src/instance.js` and `worker.js`'s mirror-constants block.
   - `grep -rn "'/baked/\|\`/baked/\|'/photos/\|\`/photos/\|'/logos/\|\`/logos/" src/` → zero (per CC.8).
3. **End-of-Phase-1 staging walk:** RUNTIME-DELTA §3 surface-by-surface on staging — Browse / Hero / Street modes; sun + sky; lamps + neon; PlaceCard; Cary placeholder. Desktop only at this gate (Phase 3 covers mobile/cellular).

### Failure modes + rollback

- **Mid-Phase recovery (a coupler's commit breaks staging):** revert the offending commit on the branch. Staging redeploys to last-good. No production impact — `main` is untouched.
- **A coupler's hidden import survives** (e.g., a transitive `useCartographStore` import via a util): caught by the end-of-Phase grep gate. Fix on branch; re-run gate.
- **Production is not at risk during Phase 1.** All failure is contained on the branch + staging URL.

### Concurrent activity

- Cartograph evergreen authoring on the branch is **paused** during Phase 1 — new bakes would muddy the staging signal. Resume Phase 6.
- Arborist roster swap, Cary v1 decision: paused (Phase 6).
- Doc-only edits on the branch are fine (don't affect bundle output).

---

## Phase 2 — Cleanout plan execution (on branch)

### Preconditions

- Phase 1 complete. End-of-Phase-1 grep gates green.
- Staging URL renders end-to-end with the new coupler architecture.

### Operations

Order is cleanout plan section order, with the inter-plan dependency (§S6) satisfied by Phase 1's grep gate.

1. **§S1 — Mode-conditional `rollupOptions.input` in `vite.config.js`.** `command === 'build'` emits `{ main: 'index.html' }`; `command === 'serve'` keeps all four entries. One commit.
2. **§S3 Part A — `copyPublicDir: false` + named-allow-list plugin in `vite.config.js`.** Allow-list per cleanout plan §S3's table. One commit. (Plugin is ≤30 lines per the sibling plan's constraint.)
3. **§S3 Part B — Two file deletions, quarantine-then-delete:**
   - Commit 3a: `git mv public/data/landmarks.json _quarantine/public-data/landmarks.json`; `git mv public/cartograph-ground.svg _quarantine/public-cartograph-ground.svg`. Grep audit precedes; clean-session gate verifies (staging URL + local dev).
   - Commit 3b (after clean-session hold): `rm _quarantine/public-data/landmarks.json _quarantine/public-cartograph-ground.svg`.
4. **§S5a — Stale handoff docs to `_archive/handoffs/`.** One commit per doc; four commits total.
5. **§S5b — `CARY-BRIEF.md` relocation.** Single commit; destination per Phase-C decision (root-stay or `cary/` move). Negative gate: never `_archive/handoffs/`.
6. **§S6 — Deploy-time grep gate wired into `.github/workflows/deploy.yml`.** New step before `npm run build`: the grep from cleanout §S6's gate; non-zero match exits the workflow. One commit. **This is the only production-workflow modification permitted by the sibling plans.**
7. **§S8 — `scripts/audit-deployment-id.sh` + `deploy.yml` CI step.** Script lands (≤20 lines); CI step calls it as a pre-build gate. One commit. (CL.6: if `.env.example` is missing, add it in the same commit.)

### Verification gates

1. **After every commit:** `npm run build` exits 0 (CC.2 from cleanout plan — no batching).
2. **Staging URL re-verifies** after each `vite.config.js` change. Especially after §S3 Part A — confirm no 404s on the allow-listed paths. Mobile + desktop.
3. **End-of-Phase-2 bundle delta check** on staging build artifacts:
   - `ls dist/assets/ | grep -E "^(cartograph|arborist|preview|PreviewPostFx)-"` → zero matches.
   - `du -sh dist/` ≤ allow-list sum (≈ <300 MB per cleanout plan §S3).
   - `ls dist/{cartograph,arborist,preview}.html dist/clouds dist/trees dist/models dist/looks dist/data dist/cartograph-ground.svg` → all absent.
4. **CI gate dry-run on the branch:** push a no-op commit; staging workflow runs; §S6 grep + §S8 audit pass (note: staging workflow does NOT currently invoke these gates — they live in `deploy.yml`. The dry-run is a manual `bash scripts/audit-deployment-id.sh` + the grep command locally before merge).
5. **Mutation test for §S8:** on a throwaway branch, change one deployment-ID location by one character; `bash scripts/audit-deployment-id.sh` exits non-zero. Revert.

### Failure modes + rollback

- **§S3 allow-list misses a consumed path** → 404 on staging. Add the path; re-push. Staging-only impact.
- **Quarantine reveals a hidden consumer** → restore from `_quarantine/`; mark the file ship-keep in the allow-list; carry-over to RUNTIME-DELTA §2.5.
- **CI gate fails on a valid state** (false positive in the grep or audit script) → fix the gate; re-push. Does not affect production until Phase 4.
- **`deploy.yml` syntax error from the §S6/§S8 wiring** → caught at the first push-to-main attempt in Phase 4. Fix on branch before merging. **Validate locally before Phase 3** via `actionlint` (if installed) or by reading the diff carefully.

### Concurrent activity

- Same posture as Phase 1: doc edits OK; bakes paused; concurrent tracks paused.

---

## Phase 3 — Pre-merge verification (on branch, via staging URL)

### Preconditions

- Phases 1 + 2 complete. All staging walks green. CI gates dry-run green.
- Production (`main` → `lafayette-square.com`) confirmed serving the pre-slab state — visit, observe `VectorStreets`-rendered ground, confirm no regressions from unrelated drift.

### Operations

This phase is verification, not change. No commits land in Phase 3 (except possibly a follow-up doc commit if the walk surfaces a Carry-over).

1. **RUNTIME-DELTA §3 walk on staging — desktop.** Section by section. Each "does the nerve still smile" surface is exercised; observed behavior recorded against §3's expected behavior.
2. **RUNTIME-DELTA §3 walk on staging — real mobile on cellular.** Real iPhone (Safari + Chrome iOS) on real cellular (not Wi-Fi, not throttled DevTools). This is the actual perf gate per CC.5. Watch: first-paint time, scene-mount time, sustained framerate on Browse pan, PlaceCard scroll, Cary placeholder tap. Verbal target: feels like the production site does today on the same device + network.
3. **`dist/` inspection** (local build of the branch tip): confirm bundle deltas match cleanout plan §S2's table (≈ −1.16 MB gz). `ls dist/assets/` clean of authoring chunks.
4. **CI gate green review:** read the latest staging workflow run; confirm `npm run build` passed; manually verify `bash scripts/audit-deployment-id.sh` exits 0 against the branch state.
5. **Production sanity:** load `lafayette-square.com` (production, still pre-slab on `main`). Confirm it serves correctly and is unchanged. This is the baseline for Phase 5's stability watch.
6. **Five-place deployment-ID manual audit** (one-shot, before merging) per couplers §5 / cleanout §S8: grep the deployment ID across `PUBLISH.md`, `.env.example`, `.github/workflows/deploy.yml`, `public/codedesk/index.html`, `worker.js`. All match.

### Verification gates

The whole phase IS the gate. Hard pass criteria — every one must hold:

- **Visual:** every RUNTIME-DELTA §3 surface behaves at parity-or-better against production (per `feedback_beautiful_first_lightweight_51` — never trade visual down).
- **Performance:** mobile cellular load + interactivity feels at parity-or-better against production.
- **Bundle:** authoring chunks gone; allow-list respected; `dist/` size within the cleanout plan's bound.
- **CI gates:** §S6 grep + §S8 audit both green.
- **Production unchanged:** `main` still serves pre-slab correctly (baseline confirmed).

Any single failure → return to Phase 1 or Phase 2 to fix on branch. Do not merge.

### Failure modes + rollback

- **A surface looks wrong on staging:** open an issue against the relevant coupler section; fix on branch; re-run Phase 3. No production impact.
- **Mobile cellular performance regresses vs. production:** this is the most likely surprise. The 17 MB `milky_way.jpg` (cleanout RD.9) is the prime suspect on first-paint; the slab itself (201 MB on disk, but only the active-look subset is fetched) is the second. If first-paint exceeds the production baseline by more than ~25%, **defer merge** and surface RD.9 (the deferred mobile-perf carve-out) as a blocker, not a carry-over. Per CC.5: the cellular pass is a hard gate, not a sigh-and-ship.
- **CI gate red:** fix the gate or the underlying issue on branch; re-run.

### Concurrent activity

- Doc edits on the branch are fine. No bakes; no concurrent-track work.

---

## Phase 4 — The merge (production cuts to slab)

### Preconditions

- Phase 3 fully passed; every gate green.
- Working tree clean on `cartograph-looks-pass-ab`; local `main` up to date with `origin/main`.
- Rollback floor tag `v1-pre-cartograph-merge` confirmed at `origin/main`'s tip via `git ls-remote --tags origin`.

### Operations

Single sequence — no inter-step verification. Confirm Phase 3 was the last verification gate; this is execution.

```
git checkout main
git pull --ff-only origin main
git merge --no-ff cartograph-looks-pass-ab -m "$(cat <<'EOF'
LS basemap swap — marriage leap

Branch cartograph-looks-pass-ab into main. Production cuts from procedural
VectorStreets+StreetRibbons to the cartograph slab (BakedGround / BakedLamps /
InstancedTrees / LafayetteScene+palette / LafayettePark+rigid-lift).

Couplers per plans/kit_couplers_parametrize.md.
Cleanout per plans/pre_public_cleanout.md.
Sequenced per plans/ls_basemap_swap.md.

Rollback floor: tag v1-pre-cartograph-merge @ 20866ef.
EOF
)"
git push origin main
```

`--no-ff` is deliberate: the merge commit preserves the marriage-leap as a single visible point in `main`'s history, which is the rollback target reference. **No fast-forward, no squash, no rebase.** The branch's commit history travels.

After `git push origin main`, `.github/workflows/deploy.yml` runs. Pipeline order: `npm ci` → §S8 audit → §S6 grep → `npm run build` → upload-pages-artifact → deploy-pages. Total wall-time historical: ~2–3 min build + ~30 s deploy. The live site updates when `actions/deploy-pages` completes.

### Verification gates

1. **GitHub Actions workflow run lands green.** Both gates (§S6, §S8) passed; build emitted; deploy completed. Watch the Actions tab.
2. **`lafayette-square.com` serves the slab.** Hard-refresh (Cmd-Shift-R). Network panel: requests to `/baked/lafayette-square/*` returning 200. No console errors. `VectorStreets` gone; `BakedGround` mounted.
3. **OG meta intact** (`curl -A "facebookexternalhit/1.1" https://lafayette-square.com/`) — Worker still serves the right title; couplers §6 mirror-constants didn't drift.

### Failure modes + rollback

- **CI red on `deploy.yml`:** the §S6 or §S8 gate found something that Phase 3's dry-run missed (most likely: dry-run was against branch tip; a last-minute commit broke it). Investigate the failing step. If the fix is small, push it to a temporary branch off `main`, PR back to `main`. If the fix is large or unclear, **roll back** (Phase 5's command, executed immediately) — the merge commit on `main` deploys nothing because the workflow failed before `deploy-pages` ran; force-pushing the tag back simply lines up history with what actually deployed (still the pre-merge state).
- **CI green but the site looks wrong:** see Phase 5.

### Concurrent activity

None. The merge is a focused operation; concurrent tracks unblock in Phase 6.

---

## Phase 5 — Post-merge stability watch

### Preconditions

- Phase 4 complete; deploy workflow green; `lafayette-square.com` serving the slab.
- Rollback command kept open in a terminal window (literal text loaded; not executed).

### Operations

1. **First 15 minutes:** keep `lafayette-square.com` open on desktop + real mobile (cellular). Periodic hard-refresh. Watch for any visual regression against Phase 3's staging walk. Check the GitHub Pages deploy URL output for cache-edge propagation.
2. **First hour:** check `/codedesk` admin surface logs in command (if any reach the operator). Visit a `/place/<id>` URL to confirm Worker OG path still works (`og:title` matches the listing).
3. **First work session (rest of day):** light touch — open the site periodically; no other deploys; no concurrent-track work on `main` yet.
4. **End of session:** Phase 5 closes when the operator sits down for the next session and the site is still serving correctly. From that point, normal operation; Phase 6 unblocks.

### Verification gates

- **Pages-pages**: production behaves as staging did in Phase 3. Visual + perf parity-or-better against the pre-slab baseline (Phase 3 capture). Real cellular framerate stable.
- **No new console errors** on either Safari or Chrome, desktop or mobile.
- **Cary placeholder** still surfaces; SMS contact still tappable; PlaceCard photos load.
- **Worker OG** still serves correct meta (one-shot `curl` per Phase 4 gate 3).

### Failure modes + rollback

- **Rollback trigger** — invoke if any of: site fails to mount; scene mounts but ground/lamps/trees missing; mobile cellular first-paint catastrophically worse than baseline; PlaceCards broken; Cary surface broken; Worker OG broken on listing pages.
- **Rollback command (verbatim):**
  ```
  git push --force-with-lease origin v1-pre-cartograph-merge:main
  ```
  This force-updates `origin/main` to point at the rollback floor (`20866ef`). The push triggers `deploy.yml` again, which builds the pre-slab state and republishes. Live site returns to pre-slab in roughly the same wall-time as a fresh deploy (~2–3 min build + ~30 s deploy + edge propagation).
- **What rollback leaves behind:** the merge commit on the *local* `main` still exists in reflog; the branch `cartograph-looks-pass-ab` is untouched. To re-attempt later: identify the regression, fix on the branch, re-run Phase 3, re-run Phase 4. The rollback floor tag stays at `20866ef` permanently — it is the v1-pre-cartograph-merge anchor for as long as that's a meaningful state to return to.
- **`--force-with-lease`** (not `--force`) is deliberate: if someone else pushed to `main` between the merge and the rollback, the lease check fails and the rollback aborts — protecting against overwriting an unknown concurrent commit. In Phase 5's tight window this is unlikely but the safer flag is the right default.
- **Post-rollback:** verify `lafayette-square.com` is back to pre-slab. Open a session against the regression with the orchestrator before retrying.

### Concurrent activity

None during Phase 5. Phase 6 begins after stability is confirmed.

---

## Phase 6 — Concurrent tracks resume

`main` is now on the slab. The tracks `ls/BACKLOG.md` § "Concurrent / non-blocking" lists unblock. One paragraph each — these are not detailed plans, just confirmations of what's unblocked.

**Cartograph evergreen.** Visual stack refinements on the producer side (`cartograph/BACKLOG.md`) resume. Each fresh bake on `cartograph-looks-pass-ab` (or a successor authoring branch) publishes to `public/baked/<look>/`; merging that branch into `main` triggers a fresh deploy and the slab updates. Operators bake; LS picks up the slab. No coupler changes required per bake.

**Arborist roster swap.** Tree library upgrade is hot-swappable per the kit pattern: re-bake `public/baked/<look>/trees/` + `public/baked/default.json` via `arborist/bake-trees.js`; commit; merge; deploy. No consumer-app code changes. The §S3 allow-list already accommodates the tree subtree under `public/baked/`.

**Cary v1 status decision.** Whether Cary surfaces ship live (Supabase wired) or behind "coming soon" is now a product decision, not a deploy blocker. The Cary coupler (§4) is already in place; flipping the placeholder is a copy edit + a wire commit. Track owner: orchestrator.

**Security audit (Phase B carry-over).** Supabase RLS audit + GAS PropertiesService posture + admin-passphrase + device-hash identity — separate document, separate session, no longer blocked by the marriage leap. Per `ls/BACKLOG.md` Concurrent table.

**Mobile perf gate (RD.9 — `milky_way.jpg`).** If Phase 3's cellular pass surfaced 17 MB texture as a real-user problem, this is the first concurrent-track operation post-merge. If not, it stays a deferred carry-over.

**`ls/FEATURES.md` end-user experience writeup.** Doc-only; resumes opportunistically.

---

## Cross-cutting decisions

### CC.1 — Phases ship as their own commit clusters on the branch before merge

Per `feedback_d3_bundling_failure_modes`: each coupler is its own commit; each cleanout section is its own commit; mixing failure modes hides which one broke what. The staging URL is the verification surface for each phase before the next begins.

### CC.2 — The branch-to-main merge is single-step

Once Phase 3 passes, the entire branch state merges into `main` in one operation (Phase 4's `git merge --no-ff` + `git push`). There is **no interim state** where `main` is partway through the swap — visitors to `lafayette-square.com` see either pre-slab (before push) or slab (after push completes). The mid-merge state described in the briefing question is non-existent by construction.

### CC.3 — Rollback is one command

`git push --force-with-lease origin v1-pre-cartograph-merge:main`. The tag is the rollback floor; pushing the tag's SHA to `main` triggers production redeploy of the pre-slab state. Total recovery time ≈ 3 min + edge propagation. No data-migration to undo (per couplers plan §4 + §5 — Supabase + GAS Sheets are unchanged).

### CC.4 — Staging is the canary throughout

Every Phase 1 + Phase 2 commit auto-deploys to staging via `.github/workflows/staging.yml`. Verify on staging before considering a phase's work complete. The staging URL collapses what would otherwise be "rigorous local testing + hope" into "real deployed artifact on real internet." This is the single biggest simplification of the marriage leap.

### CC.5 — Mobile + cellular pass is part of Phase 3

Real iPhone on real cellular (not Wi-Fi, not DevTools throttling) against the staging URL. First-paint, scene-mount, sustained framerate. Per `feedback_beautiful_first_lightweight_51` doctrine: stability and beauty are co-equal pass criteria; the cellular pass is a hard gate.

### CC.6 — Production deploy workflow is touched only for §S6 grep + §S8 audit

`.github/workflows/deploy.yml` gains two pre-build steps from the cleanout plan: the `useCartographStore` grep gate (cleanout §S6) and the deployment-ID audit script (cleanout §S8). Nothing else. The workflow's existing structure (`actions/checkout` → `setup-node` → `npm ci` → `npm run build` → `upload-pages-artifact` → `deploy-pages`) stays.

### CC.7 — BASE_URL invariant carries forward

Per couplers plan CC.8 and SLAB-CONTRACT §10.6: every runtime asset fetch routes through `import.meta.env.BASE_URL`. Staging builds with `--base=/lafayette-square-staging/` (staging workflow line); production builds with default `'/'` (deploy workflow line, no `--base` flag — apex-domain deploy via `public/CNAME`). The merge must not reintroduce any hardcoded `/baked/...`, `/photos/...`, `/logos/...` path in JSX/JS. Phase 1's end-of-phase grep covers it.

### CC.8 — Kit stays; production excludes

Per cleanout plan CC.8: `src/cartograph/`, `src/arborist/`, `src/preview/`, `src/stage/`, `cartograph/`, `arborist/`, `meteorologist/`, and their `data/` dirs all stay in the repo. The marriage leap excludes them from production via build-config (§S1 + §S3) + runtime seam (§S6 — owned by couplers §1). Source-tree extraction to a separate kit repo is a post-v1, indefinite operation. Not on this plan's table.

### CC.9 — Two file deletions are the only deletes in the merge

Per cleanout plan §S3 Part B: `public/data/landmarks.json` and `public/cartograph-ground.svg` are the only files deleted in the entire Phase 1 + Phase 2 + Phase 4 sequence. Both pass the full quarantine flow per `feedback_orphan_audit_full_repo`. Everything else is build-config exclusion, runtime-seam migration, or doc relocation.

---

## What this plan does NOT do

- **Does not re-specify couplers.** Sibling plan binds; this plan sequences.
- **Does not re-specify cleanout.** Sibling plan binds; this plan sequences.
- **Does not author the arborist roster swap operation.** Phase 6 unblocks it; the operation itself is a separate session.
- **Does not author Cary v1 status decision.** Phase 6 unblocks it.
- **Does not author the security audit.** Separate Phase B document; not blocked by the marriage leap (per `ls/BACKLOG.md` Concurrent table).
- **Does not modify production runtime architecture.** That's couplers plan territory.
- **Does not address user-data migration.** None needed — GAS Sheets + Supabase tables are unchanged across the merge (couplers §4 + §5).
- **Does not specify kit extraction to a separate repo.** Post-v1, indefinite.
- **Does not specify the mobile-perf carve-out (RD.9 — `milky_way.jpg`).** If Phase 3 catches it as a real-user blocker, it becomes a pre-merge fix per CC.5; otherwise it stays a deferred carry-over, owned by a future perf-gate session.
- **Does not modify `.github/workflows/staging.yml`.** Staging is the canary as-is.
- **Does not modify `.github/workflows/deploy.yml`** beyond the §S6 + §S8 additions named in the cleanout plan (CC.6).
- **Does not execute.** Phase C executes against this plan.

---

## Carry-overs

Items surfaced during this plan's read pass:

| ID | Item | Where | Owner |
|---|---|---|---|
| BS.1 | **Staging workflow does not run §S6 grep or §S8 audit.** `.github/workflows/staging.yml` builds + deploys to the staging external repo without the CI gates that `deploy.yml` will gain in cleanout §S6 + §S8. Phase 3's CI gate dry-run is therefore *manual* (local grep + local `bash scripts/audit-deployment-id.sh`), not automated. Consider mirroring the two gates into `staging.yml` — same steps, same script — so staging is a full deploy rehearsal, not a partial one. Low priority for v1 (the gates run on `deploy.yml` which is what gates production); higher priority for v1.1+ multi-instance work. | `.github/workflows/staging.yml` | Phase C optional; v1.1 default |
| BS.2 | **`deploy.yml` does not currently pass `--base` to `vite build`.** This is correct for the apex-domain production deploy (`BASE_URL = '/'`) — but it is invisible to anyone reading the file. A one-line comment in `deploy.yml` next to the `npm run build` step ("no `--base` — production deploys to apex via `public/CNAME`; default `BASE_URL='/'` is correct") would prevent future confusion when contrasted against `staging.yml`'s `--base=/lafayette-square-staging/`. Trivial; ride with the §S6 + §S8 commit. | `.github/workflows/deploy.yml` | Phase C |
| BS.3 | **Sibling plans do not specify their inter-plan ordering at commit granularity.** Couplers plan CC.7 names "cleanout second"; cleanout plan CC.7 names "couplers first" — both directional, neither says whether Phase 1's commits should all land before Phase 2's first commit, or whether they can interleave on the branch. This plan assumes the strict ordering (Phase 1 fully complete before Phase 2 begins) per CC.4 (each phase verified on staging before the next). The strict ordering is the safer default; the under-specification is noted but does not require sibling-plan amendment. | (this plan, by Phase 1 / Phase 2 split) | Resolved here |

No new contradictions surfaced. No sibling-plan amendments required — the sibling plans bind cleanly and the sequencing fits inside the dependencies they already declared.
