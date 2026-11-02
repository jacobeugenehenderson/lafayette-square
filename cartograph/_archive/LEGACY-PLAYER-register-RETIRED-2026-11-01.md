# The kit's legacy player — superseded register text (retired 2026-11-01, the LS bleed (b))

Moved here verbatim when the kit's own player (`staging/player/`, `player/<map>/`, `/_player/`) and the all-towns share-card record (`staging/towns.json`) were retired: every town plays the Ward, and a town's Publish writes its own card. Live text: `cartograph/OPERATIONS.md` § Publish, § Staging, § Production sites; `PUBLISH.md` Quick reference and §0.5. The pre-cutover Lafayette Square lines went stale when `lafayette-square.com` began answering 301 → `lafayettesquare.online` (measured 2026-11-01).

## from `PUBLISH.md`

| Frontend → **staging** | press **Publish** in Preview — it uploads the slab + the shared player to R2; no branch. ▶ `node checks/claims-the-publish-gate-pushes-where-staging-deploys.mjs` |

## from `PUBLISH.md`

| Promote **staging → prod** | press **Promote to Production** in Preview, per town — slab → `baked/<look>/`, the staged player pinned to `player/<map>/`, then the host record;

## from `PUBLISH.md`

| Player | `staging/player/` — ONE build, shared by every town | `player/<map>/` — that same build, **pinned per town** by Promote |

## from `PUBLISH.md`

- **Lafayette Square is the legacy exception until its cutover:** `lafayette-square.com` (§1, GitHub Pages
  from `main`) keeps serving; Promote refuses it by name. At cutover `.com` 301s to `lafayettesquare.online`
  (ruled 2026-09-26), **only after** the new site is serving and Jacob has seen it.

## from `PUBLISH.md`

Every town, Lafayette Square included, is served per §0.5. ⛔ Nothing pushes `main`. Until `lafayette-square.com` 301s to
`lafayettesquare.online` (`BRIEF-ls-cutover-to-its-address` step 5) that address still serves `main`'s last Pages build; the
workflow and `public/CNAME` retire in its step 6.

## from `PUBLISH.md`

- ✅ **DONE 2026-09-24 — the staging player carries the published-layer reader.** `node scripts/publish-player-to-staging.mjs` ran (439 files, 50.6 MB → `theward-assets/staging/player/`, build stamp 2026-09-24T20:48Z), so staging.theward.online now lays `staging/live/<look>/listings.json` over the Sheet (Baileys' closed on staging LS). ⚠️ That player is built from `docs/conformance-2026-09-21` — the whole unpushed branch is live on STAGING (not production).

## from `cartograph/OPERATIONS.md`

- **Publish** bakes first only when the bake check owes a step, then freezes the manifest (**this is where the deployment panel's settings are accepted**), uploads this Map's slab to `staging.theward.online/<map>/`, and rebuilds + uploads the kit's player (`staging/player/`) when staging's build is behind your source. ⛔ Only the player ships, never the operator apps built beside it (▶ `node checks/claims-the-player-publish-ships-only-the-player.mjs`), and every operator tab (every tracked page but `index.html` and `public/`) wears the Ward's mark, `src/operator/ward-mark.svg`, copied from theward-online, never redrawn (re-copy: `ward-mark.source.json`; ▶ `node checks/claims-every-operator-tab-wears-the-ward-mark.mjs`). ⛔ It refuses a player the staging Worker cannot place (no `/_slab-base`: every town's staging site would stop). ⭐ It also publishes the **towns record**, every town's share card (`staging/towns.json` + its list; alone: `node scripts/publish-towns-record.mjs`). **Promote** pins a town's copy at `sites/<map>/towns.json` and refuses without it; `--map=<map> --card-only` pins the card alone (the same verification, that one key, no player), so a card or icon fix never waits on a Ward release. A town with no record serves no card tags and says why (`ward-share-card: absent; …`) ▶ `node checks/claims-a-town-page-writes-its-own-card.mjs`. ⛔ **Moving a site Worker onto these keys keeps every card whole only in this order:** ① `node scripts/publish-towns-record.mjs` · ② deploy the **staging** Worker · ③ `node scripts/promote-player-to-prod.mjs --map=<map> --card-only` for each production town · ④ deploy the **production** Worker. Deployed before ③, the production Worker serves every town's page with no card until its pin lands. **Which player the address serves is the town's record — § Staging — which player a town serves, below.** ⭐ A town whose trees are all impostors (no species on the Arborist's mesh bar) publishes no model-tree GLBs or atlas PNGs; put a species on the bar, re-bake, and the next Publish ships them (`src/lib/treeGeometry.js`).

## from `cartograph/OPERATIONS.md`

- **One line per target; the button says what it will ship.** **Publish slab · Publish player · Publish slab + player** (and **Promote …** the same), past-tense and inert when that site already serves both: your slab (`scene.json#bakedAt` from the live key space, and the deployment its manifest carries; staging also needs no bake owed) **and** the player (staging: `staging/player/build.json` newer than your source; production: the build staging serves is the one this town pinned). ⛔ Unknown counts as stale. **A blocked Promote prints why under the button**: no production address · no player named on staging · staging not current yet (Promote ships this disk's slab, so Publish and check it first). **Visit →** is the address **derived for this look** — staging `staging.theward.online/<map>/`, production from Operations — or **"no address"** with the reason on hover, never a substitute. ⛔ The state is **read on every mount**, never remembered. ▶ `node checks/claims-the-publish-panel-reports-the-address-it-shipped.mjs` · `node checks/claims-the-publish-button-can-say-it-is-done.mjs`

## from `cartograph/OPERATIONS.md`

- **The switch:** `node scripts/set-staging-player.mjs --map=<map> --player=ward|legacy [--dry-run]` — one town per run, Jacob's go for each. `ward` serves the Ward build `staging/ward/current.json` names (the Ward publishes it: `npm run publish:staging` in `theward`); `legacy` serves the kit's player above.

## from `cartograph/OPERATIONS.md`

copies that player's exact bytes, each checked against its list (`scripts/promote-player-to-prod.mjs`): `legacy` → the kit's player into `player/<map>/`; `ward` → the Ward build staging serves into `ward/<sha>/` and its kit bundle into `kit/<sha>/`

## from `cartograph/OPERATIONS.md`

⚠️ Until `lafayette-square.com` 301s to `lafayettesquare.online` (`BRIEF-ls-cutover-to-its-address` step 5) the `.com` serves the old player, which still asks the backend as `look=lafayette-square`.

## from `cartograph/OPERATIONS.md`

taken from `public/baked/<map>/manifest.json` when the player is published (`scripts/towns-record.mjs` → towns.json `icon`; a dry run prints each town's `icon` line); a new mark reaches the card at the next player publish, and in production at the next Promote.

## from `cartograph/OPERATIONS.md`

| `main` | `deploy.yml` | **lafayette-square.com (PROD)** |

