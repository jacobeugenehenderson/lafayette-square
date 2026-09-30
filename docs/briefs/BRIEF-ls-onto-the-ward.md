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
  is re-baked with the roster.** LS's grove is re-baked, but its impostor captures **have not run**:
  the overnight run stopped before them (Master Arborist, 09:35). ▶ `node checks/claims-a-tree-card-starts-at-the-ground.mjs`
- **Provincetown is published to staging** (Jacob, 2026-09-29).
- **The Ward** (`~/Desktop/dev.nosync/theward`) is pinned to kit `e3e3f482`. Its suite is 12 green /
  5 red. Of the reds, one is an endpoint, `gas:verify-resident`, waiting on Jacob's resident-verification
  ruling. The other four need a running app or Tamp's harness. Cary is **cut from the cutover** (Jacob,
  2026-09-28); its 11 endpoints are retired as deferred.
- ✅ **Promote pins the Ward (Phase 2 DELIVERED 2026-09-29, `30bcd111`).** It pins whichever player the town's
  staging record names; no record refuses by name. ▶ `node checks/claims-a-production-town-plays-the-player-promote-pinned.mjs`
- ✅ **Provincetown and Huron play the Ward on staging** (2026-09-29, records `ward`). **LS is dark on staging**
  until Phase 1 runs for it: the Arborist's re-shoot, then Stage Bake, then Publish, then its record.
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

## Phase 2 — Promote learns the Ward · ✅ **DELIVERED 2026-09-29** (`30bcd111`, Lintel). As briefed: `cartograph/_archive/BRIEF-ward-on-staging-DELIVERED-2026-09-29.md` (appendix); `cartograph/OPERATIONS.md § Production sites` is the register.

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
  - **Resident verification**: `verify-resident` is closed (F-23, @69); the neighbour and building-card flows are **NEXT UP** (Jacob, 2026-09-29; Warden's options sheet; no ID checks for ordinary people). ⛔ **No building
    card prints before it is ruled.**
  - ✅ The **Apps Script batch** (F-21 · F-22 · F-23 closed · each town's day in its own zone) is **live at @69** (2026-09-29, `8d6e401a`).
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
