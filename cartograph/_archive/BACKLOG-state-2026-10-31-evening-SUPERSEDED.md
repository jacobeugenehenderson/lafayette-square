# BACKLOG state block, 2026-10-31 evening — superseded the same night by the rewritten block (verbatim)

### ⭐ STATE AT JACOB'S BEDTIME, 2026-10-31 (Boz). Read this first.
- **LS PROMOTED 2026-10-31** (`scratch/ls-cutover-runbook.md`): lafayettesquare.online + www serve LS on Ward 4334c64 / kit 2a44e317;
  backup `scratch/promote-rollback/lafayettesquare-prod-20261031`. **The .com → .online 301 is LIVE** (Jacob's Cloudflare rule,
  2026-10-31): runbook §6's curl gates pass, both hosts, every card route, query kept; the slab gate passes. Jacob's eye ✅ ("absolutely responsive and *totally* gorgeous"). Open:
  Ward's eye on both addresses (phone first) · the §6 retirements · `/favicon.svg` 404s on .online, and the instances'
  branding.faviconUrl names the .com one, which now redirects there. ▶ Ward measured it (2026-10-31): the static icon tag on
  LS + HPDM comes from towns.json `faviconUrl` (publish-player-to-staging.mjs ← INSTANCE.branding.faviconUrl); the Ward then
  overwrites it at boot with the Look's identity.mark. Two sources for one icon. OWED, kit brief: derive towns.json's icon from
  the Look's identity.mark (a data: URI; no mark → the Ward's stated initial); delete the instances' old-player branding
  (faviconUrl/markSvg/mark, 'UNTIL CUTOVER', now due) and townMark.js's reader; a check on every town's served tag. Then a
  staging publish; how towns.json reaches production hosts is not established. Jacob: "Get rid of the arch" (LS → ⚜️).
  Brief: `docs/briefs/BRIEF-a-town-has-one-icon.md`.
  Dead wiring (Ward, measured 2026-10-31: every served host and staging town runs the Ward 4334c64): the "legacy" player
  accepted by set-staging-player.mjs and both Workers. Remove once an R2 read of hosts/*.json + staging/ward/current.json
  (Jacob's credentials) shows no record names it.
- **Backend: two sittings after the cutover, all built and Zob-PASSed, none deployed.** Sitting 1: hotfix + recovery B + fortify
  (`scratch/backend-deploy-runbook.md`). Sitting 2 (§E): patches ④–⑫ as ONE set (theward plumb/fortify) + Ward's client
  (ward/ladder-client) + Operations signers + kit plumb/ladder-docs (merge on deploy only). Deploy-day hands: predeploy-audit items 6–12.
  The rulings: registry `r-the-host-verifies-eye-to-eye` (the four QRs, the Rep as a non-expiring mark, Host office hours, noListOfAPerson).
- **OWED before sitting 2:** patch eight's tally column `date` → `weekday` (ruled 2026-10-31, registry `noListOfAPerson`).
- **⛔ NEXT WARD PIN (the one taking Tinsel's calendar route), three preconditions:**
  ① **Kit (Boz's, owed, fresh builder):** `R3FErrorBoundary` wraps 15 of Town's layers (SetPiece, so Displays, included) and
  turns ANY throw into null after 7 retries, so a refusal VANISHES silently and never reaches the Ward (Zob, read in source).
  A refusal must be told from a transient, never retried, and surfaced with its reason. No refusal type exists: ~206
  `[tag] ⛔` throws in 53 files; one sink with `src/displays/failures.js`, not two. ② **Ward (in dispatch, co-signed):** a
  boundary for throws outside those layers. MERGED 249d7658 (Fuse; every ⛔ throw typed Refusal or Transient). Follow-up building: a reveal-layer refusal marks the
  reveal gate, and Stage's banner shows above the splash (today a refused InstancedTrees holds the town on its emblem, silent). ⚠️ Gap for a follow-up brief (Fuse, read): `reloadTerrain` is called with no await/catch (TownPlace.jsx,
  CartographApp), so a terrain refusal leaves the town on its splash with the reason in the console only; useFrame throws too.
  And refusals that never throw: ⛔ console.error/warn then render nothing (Fuse's grep: 154 lines in 45 files, 28 in Town's
  wrapped layers, e.g. InstancedTrees/BakedLamps anchors → no trees/lamps). Follow-up brief: classify each, route to the sink.
  Also (Fuse, in Stage): /stage/lafayette-square/hero is a BLANK page. HorizonControls → useTownPlace throws "[townPlace] ⛔ no town
  has been placed" outside any boundary (a likely wrong town id should refuse visibly, not blank). ③ **Ward:** Scene.jsx passes the published calendar, with the values of the kit's
  `useTownCalendar.js#readTownCalendar` (null unread · rows · {absent} · {error}; on tinsel/displays 5725b7c7, not yet on
  integration), from its own read (`content.js#loadContent`), no second reader. Today that read turns absent AND failed into [].
  Event card: Ward briefs it (registry `r-an-event-has-a-host-and-a-venue-and-opens-at-the-venue`); the kit validator goes to Tinsel.
- **Displays (Tinsel):** the Light Show is on integration through 2e408e9a; the ground-ring radius stands as is (Jacob, 2026-10-31,
  "fine for now"). Merged through 83078842 (looks, own clocks, gamut, schedule, the DoF subtree). ⛔ NO VISITOR SEES THE SHOW YET:
  the bake carries no `displays` (manifest identity has none, the drawer isn't published), so Preview and the player mount
  nothing (Tinsel, measured). Next for Tinsel: the bake publishes the drawer · then the pinnacle cap under the tone curve
  (ACES desaturates the red) · then point framing. The calendar route (5725b7c7, Zob PASS) waits on Huron's 16 event rows.
  Arborist: PTown trees near the Monument are drawn 37–40 m tall (an upper bound), and they truly occlude the strands.
  Intake: Huron building msbf-209 is named "The Huron Historical Society" (address "CENTER HURON"), but OSM way 346992145
  (amenity=library) puts Huron Public Library inside it. Ten events stand in with a {name, point} spot until intake names it (Tinsel 08eff53d).
- Older OPEN: hours (56/447) · the preview-photo licence (parked) · the dock object + tide ride (unbuilt).

