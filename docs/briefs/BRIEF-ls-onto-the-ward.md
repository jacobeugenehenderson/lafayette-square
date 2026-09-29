<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-29
evict-when: Lafayette Square plays in The Ward on staging (staging.theward.online/lafayette-square/ names a ward-kit-base and draws its trees), Promote can pin a Ward build to a town's production, and BRIEF-ls-cutover-to-its-address has landed
-->

# BRIEF — Lafayette Square onto The Ward: staging now, production next, then its address

**Asked by Jacob, 2026-09-29:** *"the steps to finish cutting LS over to The Ward so we can begin the
process of testing in and improving the Ward."* ⭐ **So the first deliverable is LS playing in the Ward on
STAGING.** That is where testing and improving happen. Production and the address change come after, in
their ruled order.

This brief is the **order of work across four phases**. It holds only the facts each phase needs to
start. Phase 3 has its own brief already, which is linked, not copied.

**Every phase is dispatched separately, by Jacob.** Each phase says who it needs. The instruction for
every agent is **confirm, then build**: read the code named, report what you found to Boz, and if it
contradicts this brief, **stop and flag it**.

---

## Where it stands (2026-09-29, read in the code tonight)

- **The Ward's staging path is built.** Per-town player record `staging/sites/<map>/player.json`, set by
  `scripts/set-staging-player.mjs`. `workers/staging-sites` honours it, and no record is a 404 that names
  the town. The renderer's own files are a versioned bundle (`scripts/publish-kit-bundle.mjs` →
  `staging/kit/<kit-sha>/`), named in the page by `<meta name="ward-kit-base">`, and `src/lib/kitUrl.js`
  throws without it. Commits `93507e02`, `e3e3f482`. ▶ `node checks/claims-a-staging-town-names-its-player.mjs`
- **Trees read their roster from the slab** (`cc7e2a8b`). Every tree is an impostor unless the Arborist
  says model (`55214db5`), and the hero-band is retired (`8bae92b8`). ⛔ **A town draws NO trees until it
  is re-baked with the roster.** LS's grove is re-baked; its impostor captures were still running at
  00:55 on 2026-09-29 (the Master Arborist session).
- **Provincetown is published to staging** (Jacob, 2026-09-29).
- **The Ward** (`~/Desktop/dev.nosync/theward`) is pinned to kit `e3e3f482`. Its suite is 12 green /
  5 red. Of the reds, one is an endpoint, `gas:verify-resident`, waiting on Jacob's resident-verification
  ruling. The other four need a running app or Tamp's harness. Cary is **cut from the cutover** (Jacob,
  2026-09-28); its 11 endpoints are retired as deferred.
- ⛔ **Promote cannot pin a Ward build yet.** `scripts/promote-player-to-prod.mjs` copies only
  `staging/player/`, which is the OLD player. The Ward's staging build lives under the Ward's own prefix,
  and nothing carries it or the kit bundle to production. **This is the one unbuilt piece** between LS on
  staging and LS on production (Phase 2).

---

## Phase 1 — LS plays in the Ward on staging · **Jacob's buttons, no agent**

In order. Boz checks each result before the next.
1. **Wait for LS's captures to finish** (the Master Arborist reports them to Boz). Then
   `node checks/claims-a-town-draws-the-trees-its-atlas-was-built-for.mjs lafayette-square` and
   `node checks/claims-a-tree-card-starts-at-the-ground.mjs` should both be green.
2. **Stage Bake LS.** The grove bake rewrote `trees.json`, so `tree-anchors` and `ground-ao` are stale
   (`cartograph/serve.js`, the tree-anchors step). Stale anchors drop every tree onto the terrain field,
   with only a console warning. ▶ `node checks/claims-anchors-follow-the-placements.mjs` green after.
3. **Publish LS to Staging.** This puts the slab at `staging/baked/lafayette-square/`, and the Worker
   refuses a town with no manifest.
4. **Publish the kit bundle** for the current kit sha: `node scripts/publish-kit-bundle.mjs`.
5. **Set LS's player:** `node scripts/set-staging-player.mjs --map=lafayette-square --player=ward`.
6. **Deploy the staging Worker** (`wrangler deploy` in `workers/staging-sites`), if it isn't already
   deployed with the switch. Its deploy gate refuses while a served town has no player record, so set the
   records first.
7. **Publish the Ward:** `npm run publish:staging -- --town=lafayette-square` in `theward`.
8. **See it:** `curl -s https://staging.theward.online/lafayette-square/ | grep ward-kit-base` names a
   sha, and that sha's `basis/` answers 200 on the asset host. Then Jacob opens it. ⭐ **From here the
   Ward is tested and improved on LS**, and Warden's team works against this URL.

⚠️ `lafayette-square-staging` is a different map (the one ROADMAP says to excise eventually). It is
not touched here.

## Phase 2 — Promote learns the Ward · **kit agent: WARM → Lintel** (built the staging half and the `kitUrl` contract). If Lintel's window has been cleared, **FRESH**, and ask it what it holds before briefing it on anything.

**The job:** Promote pins whichever player a town's staging record names.
- **Read:** `cartograph/serve.js` `POST /looks/<id>/promote` (steps 1–6 in its header: slab, then player,
  then address, then switch, then proof), `scripts/promote-player-to-prod.mjs`,
  `workers/production-sites/src/{index,route}.js` (serves `/_player/` from `player/<map>/` and reads
  `hosts/<domain>.json`), `scripts/set-staging-player.mjs`, `workers/staging-sites/src/index.js`, and the
  Ward's `scripts/publish-staging.mjs` header (its prefix, and `current.json`'s `kit`).
- **Build:**
  - If the town's record says `ward`, copy the Ward build that staging served **and** the kit bundle it
    names (`staging/kit/<sha>/` → a prod key). Use the same byte-verified copy rule, never a rebuild.
    Pin both in the host record.
  - `workers/production-sites` stamps `ward-kit-base` exactly as staging does.
  - `legacy` keeps today's path. **No record, or an unknown value, refuses by name.** ⛔ No default
    player.
- **Check:** extend `claims-a-staging-town-names-its-player` or add a production twin. Show it failing
  before you trust it: mutation-test by adding a default player.
- **Chain:**
  - Trusted by the production Worker and by `siteUrlsForLook` (it refuses LS today while
    `src/instances/lafayette-square.js#domain` exists; that is Phase 3's switch).
  - ⚠️ provincetown.online is live on the old player. Promoting it again **after** its staging record says
    `ward` moves it to the Ward. That is a real production change and Jacob's call. Say so in the commit.
- **Bounds:** no deploy, no Promote, no push. The register is `cartograph/OPERATIONS.md § Production
  sites`. The Ward's `OPERATIONS.md` gets a note via Warden.

## Phase 3 — LS's address: `lafayette-square` → `lafayettesquare`, on lafayettesquare.online · **its own brief**

▶ **`docs/briefs/BRIEF-ls-cutover-to-its-address.md`**: the rename, Operations' Domain, deleting the
legacy `domain` line, Promote (**now on the Ward, via Phase 2**), then the `lafayette-square.com` 301 that
**keeps paths** so printed QR codes still land, then retiring `deploy.yml` / `public/CNAME` / `main` as
production.
- ⛔⛔ **ORDERING, RULED — and it needs Jacob's eye before Phase 3 starts.** `ROADMAP` says to move LS's
  plumbing **last**, **never the night before a demo**, and that brief says **after
  `BRIEF-rename-hpdm-to-its-address` has proven the rename path.** Phases 1–2 don't touch that ruling;
  Phase 3 does. If Jacob wants LS's address to go before HPDM's rename, that is a new ruling. Ask him; ⛔
  don't infer it.
- **Gates that production has and staging doesn't:**
  - **Resident verification** (SECURITY F-23; the options sheet is Warden's artifact). ⛔ **No building
    card prints before it is ruled.**
  - The **Apps Script batch** (F-21 · F-22 · the timezone fix) needs Jacob's go.
  - **Legal:** Missouri's terms are shared by LS and HPDM by declaration.

## Phase 4 — the old player is deleted · **after the LAST town, not after LS**

The Ward's README §9: *"the domains point at it and the old player's code is deleted in the same
change."* ⚠️ **Not with LS alone:** provincetown.online still runs the old player, and so will any town
not yet moved. The deletion lands with the last town's cutover, in one change. ⛔ **Until then, `legacy`
must keep working**, and nothing may lean on it being gone.

---

## Validation surface — the one that exists

The staging site itself, plus the Ward's `npm run check` and the kit checks named above. ⛔ No parallel
harness. **DoD at every phase is Jacob's eye on the real site.** Record the scene and URL the verdict was
taken on (`README` WALL row: *"an eye verdict must record the scene it was taken on"*).
