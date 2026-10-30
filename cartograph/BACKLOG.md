# Cartograph Backlog

> **STATE + forward-work only** (`docs/agents/BOZ.md` doc architecture). No diary (→ `NOTES.md` + git), no how-it-works (→ Reference: `SKELETON` / `PREBAKE` / `SURVEY` / `SECTION` / `RIBBONS` / `ARCHITECTURE` / `ORIENTATION` / `STAGE` / `PREVIEW` / `BAKE`). **When an arc lands it LEAVES here:** *fact* → Reference, *why* → `ARCHITECTURE` Decisions, *narrative* → `NOTES`, *dispatch brief* → `_archive/handoffs/` (dated). Landed work is NOT logged here.

Active trunk `curb-offset-draw` (→ staging via `staging.yml`; the old `cartograph-looks-pass-ab` trunk was retired 2026-07-08, `26a62407`). **Production is NOT pre-slab:** `origin/main` = `7b2ae01e` (2026-06-30) already ships the LS slab, the full looks pass, the 7-slot TOD day-cycle, and the Publish ceremony. It is a **clean fast-forward with no divergence** — **hundreds of commits behind head and widening** — the trunk has not shipped since June 30 (`git rev-list --count origin/main..HEAD` is the live number; it was 59 on 2026-07-05 and 559 on 2026-08-04). ⛔ Don't re-record the count here — it is stale the day after it's written. The remaining marriage-leap is **incremental** — which commits to push — not "wait for the whole platform." ⚠️ *A stale local `main` fossil sits at April 27 — `git fetch` before trusting it.*

---

## ▶ Forward list (2026-10-28) — this tranche LS · HPDM · Huron; PTown and Altadena parked

### ⭐⭐ MORNING RELEASE — 2026-10-30 (Boz). PTown stable for outreach. Run in this order; paste any refusal to Boz.
Merged on integration (head 2a44e317+): the overhead camera's near (phone water/seabed fix, 3a032bd5) · slab compression (br-5, 801fc795) ·
per-place share cards (1d7a0743) · PTown's tagline (64aa9fb3) · one place per building + Jacob's 17 (2a44e317). Commands from
`~/Desktop/lafayette-square.nosync/.claude/worktrees/integration` unless named.
1. **Publish each town's slab to staging** (every .bin/.glb re-uploads once, brotli): `! curl -s -X POST localhost:3333/looks/<id>/publish` for
   provincetown, huron, hipointedemun (the panel's "bakes first: coast" on PTown/Huron is the judge's re-run, a no-op; the direct POST skips it).
   PTown's content also re-bakes for the duplicates: Stage Bake on PTown first if its plan shows content (it asks nothing else).
2. **Purge the staging edge once, AFTER all publishes:** Cloudflare dashboard → zone theward.online → Caching → Configuration → Purge Cache →
   Custom Purge → Prefix → `assets.theward.online/staging/baked/` → Purge.
3. **Gate staging:** `! node scratch/slab-compressed-gate.mjs https://assets.theward.online/staging/ provincetown` (and huron, hipointedemun). Exit 0.
4. **Deploy the Workers** (each refuses if a town would go dark; they also ship the place share card):
   `! cd workers/staging-sites && npx wrangler deploy` then `! cd workers/production-sites && npx wrangler deploy`.
   ⛔ production-sites BEFORE any Promote (today's Worker would serve a brotli file unlabelled).
5. **The new player to staging:** Ward's pin 96e9b15 on kit 2a44e317 (built; 38 checks green, the reds standing or an instrument-order defect being fixed): `! cd ~/Desktop/lafayette-square.nosync/.claude/worktrees/ward-kit && node scripts/publish-kit-bundle.mjs`
   then `! cd ~/Desktop/dev.nosync/theward && npm run publish:staging`.
6. **⭐ JACOB'S PHONE on staging.theward.online/provincetown/:** Browse and Society water reads as water (no sand), the movie, a place link.
7. **The open production question, on a scratch key** (Groyne's C1–C4: does a .online zone decode br for a non-br client?): the commands are in
   Groyne's message to Boz, 2026-10-30. Run them, read the [gzip]/[identity] rows, and delete the key.
8. **Promote provincetown and hipointedemun:** back up first, `! node scratch/promote-rollback/backup-prod-slab.mjs --look=<id> --out=scratch/promote-rollback/<id>-prod-$(date +%Y%m%d) --list-from=public/baked`
   (it keeps production's manifest.json too: the only way back, since a Promote overwrites it; the script refuses on any mismatch);
   then `! curl -s -X POST localhost:3333/looks/<id>/promote`; then purge prefix `assets.theward.online/baked/`;
   then `! node scratch/slab-compressed-gate.mjs https://provincetown.online/ provincetown` (and hipointedemun). Exit 0.
9. **Re-time PTown:** `scratch/browse-perf/load.mjs` cold ×3 + a throttled run (before: 7.2–8.5 s desktop, 120.9 MB).
OPEN for Jacob: ⭐ the MARINA DOCKS (Plumb, built for his eye): under the fix the floating docks become WATER (no green stripes; the
off-ground deck object is unbuilt), incl. Fishermen's Wharf's floating docks, which read plausibly today. Before/after frames come with it;
his word merges it. · the share image fixed vs time-of-day (it works as designed; send links by day) · hours (56/447) · the
preview-photo licence (parked) · a floating dock riding the tide · LS's cutover. In progress: Plumb on the marina docks drawn as treelawn.

### ⭐ HANDOFF — 2026-10-28 (the sprint closed; Swash for Boz). Read this block first; everything below is detail.
The layered night notes of 10-25 → 10-28 are archived VERBATIM: `cartograph/_archive/HANDOFF-2026-10-28.md`. Live state only here.

**▶ THIS TRANCHE: LS · HPDM · Huron.** The record is `integration/2026-10-20` (`.claude/worktrees/integration`, unpushed).
Merged on it 2026-10-27 → 28 (`git log integration/2026-10-20 --since=2026-10-27 --merges`), by theme:
- **The coast** (COAST_VERSION 5): the ink never retraces itself and settle never crosses the open/close (`ferrule/closed-coast-stroke`);
  the edge rule at settle's exit and a way's own tag deciding before the coast (`ferrule/way-tag-vocabulary`, v4); every deck input
  unioned alone (`swash/deck-winding`); an embankment street held as land by the coast bake, footprints cut once, one measure rule
  (`streetProfiles.js#pourMeasureOf`), v5 (`swash/embankment-hold`).
- **The mint and the pour:** a chain end in a roadway is a T (`kerf/chain-end-is-a-node`); an area highway leaves the network
  (`kerf/area-highway`); the home Look passed by value (`kerf/home-look-arg`); each town's declared ribbons (`kerf/ls-ribbons-path`); the
  pour records itself once and a committed radius is never re-seeded (`ferrule/extent-committed-radius`); the four ground readers read
  ground.json (`plumb/ground-readers`).
- **The player and the tools:** depth of field reads the scene's depth, the hero ladder by coverage, the town-anchored blur
  (`ferrule/dof-truth`, `ferrule/dof-town-anchor`); Designer and Section MSAA (`plumb/designer-aa`); entry frames (`plumb/entry-frames`); the
  splash in the free region (`gnomon/splash-centres-in-the-free-region`); hover deleted (`plumb/balsa-no-hover`); trees name their
  failure (`kerf/stage-black`); a tool page says why it can't open (`kerf/messages`); water levels follow a terrain re-bake
  (`kerf/water-levels-reload`); Survey draws shape, not fill (`ferrule/survey-smooth-ink`).
**🌙 OVERNIGHT 2026-10-29 (Ward). HPDM is DONE:** promoted, and its production scene.json is byte-identical to tonight's bake on disk
(sha256 `c0d7ee75…`). **Baked, NOT published:** LS (bakedAt `1793254966651`) and Huron (re-pour, `1793255891256`), both `stale: []`.
**What refused:** `POST :3333/looks/lafayettesquare/publish`, denied by Ward's auto-mode classifier ("Modify Shared Resources"). Every
staging upload below is therefore Jacob's. **The Ward pin moved** to kit `a109ec98` on theward `ward-pin/2026-10-29b` (`edf5d5b`): vite build passes,
the static checks are green apart from the standing reds, and **⛔ the browser checks are NOT RUN** (they need the Ward dev server on :5180).
**MORNING, IN RELEASE ORDER** (⛔ LS's slab must not reach staging under `c07eef9d`: the old player places the Arch by the
retired distance/bearing. Staging's player is ONE build for every town, so HPDM's staging moves too; HPDM production is pinned per host
and stays untouched):
0. `! cd ~/Desktop/dev.nosync/theward && npm run dev`, then `npm run check` against it: Ward's green on the browser checks.
1. `! cd ~/Desktop/lafayette-square.nosync/.claude/worktrees/ward-kit && node scripts/publish-kit-bundle.mjs` (the kit bundle at `a109ec98`).
2. `! cd ~/Desktop/dev.nosync/theward && npm run publish:staging` (from `ward-pin/2026-10-29b`). This also stages PTown's player, which is
   not a hold (Jacob: live PTown's Hero already blurs this way), and Jacob judges it. ⛔ No Promote.
3. `! curl -s -X POST localhost:3333/looks/lafayettesquare/publish` (or Stage's Publish), then Ward's eye. ⛔ LS production stays on `main`; the cutover is Jacob's call.
4. `! curl -s -X POST localhost:3333/looks/huron/publish`, then Ward's eye. **Huron is staging-only** until a domain is owned.
The combined bake also measures THE WATER TINT (below).

**⏸ PARKED**
- **PTown:** its PLAYER updates with the Ward pin on its current slab (the release order's player-first state), so live PTown gets today's
  player fixes (DoF, All places, arrival, splash) without a new slab. Its SLAB refuses on BOTH paths (re-poured 2026-10-29 night on
  Plumb's stack, PTown's authored state, ribbons md5 `bbb087ed2d12f823fac645d67f1df3ef`; nothing published): the SHIPPING integer path pours,
  then ②'s stamp refuses at iaFull ring 15 vertex 72 (282.795, 113.216), Kerf's site, reproduced. The PORT (brief A) refuses earlier, at
  bake-coast's traced water, on two unruled cases (a 1-step concurrence: fixed on a local branch, parked because Huron's ratchet rose; a
  trimmed arc starting outside D's wedge). Whether the port clears ② at MacMillan: NOT MEASURED. A diagnostic sweep of PTown's traced
  water tables every refusal class (count, area, share blocked) for the morning.
- **▶ PTOWN SCENE-ONLY POST** (Jacob, 2026-10-29: "get *something* posted"; Zob rehearsed it offline green, Ward confirmed the player; no code):
  (1) Stage, PTown: author DoF (design.json has no `dof` key today) and the keys; autosave; ⛔ NO Bake press. (2) Capture share images
  (today's are 10-25). (3) `! cd ~/Desktop/lafayette-square.nosync/.claude/worktrees/integration/cartograph && node bake-scene.js --look=provincetown`.
  (4) `! curl -s -X POST localhost:3333/looks/provincetown/publish`. ⛔ NOT Preview's Publish button: it POSTs /bake first, which asks to
  re-pour, and the re-pour refuses. Ships: the 10-26 pour + the new scene (focus on the Monument from the keys, his DoF) + content newer
  than the pour (roster 3.05 → 4.14 MB, 447 listings, 33 photos; all resolve in the pour). The commit carries index.json's LS/Huron
  bakedAt too. Then eye on staging and Promote on Jacob's word.
- **⭐ BRIEF A (cut-once, Plumb + Zob): JACOB RULED "land the port without PTown"** (2026-10-29). Built on local `plumb/cut-once`, in Zob's
  review; then the merge, then Huron re-bakes. ▶ `checks/claims-the-open-close-cuts-once{,-huron}.mjs`; its refusals and debts are the rows
  below that cite them; PTown's sweep: `docs/briefs/BRIEF-provincetown-pours-on-the-port.md`.
- **Altadena:** re-fetch, the Extent fix, re-pour.
- **Rain/snow over the overhead map** (Boz's ruling (i), 2026-10-30: not drawn there): streaks positioned in the town's space, if Jacob wants falling weather in the plan. Layer 0: RainParticles' RADIUS / TOP_Y / BOTTOM_Y are metres typed for a street-height camera (Zob).
- **The buildings.json v2 path** (`SlabBuildings.jsx`, the v2 read and its live-palette refusal) stays only while a town is v2, by ruling (Warden 2026-09-28); it goes when the check lists none. ▶ `node checks/claims-live-palette-equals-the-bake.mjs`.

**▶ NEXT TRANCHE LEADS:** fractional block keys (`r-block-keys-are-minted-once-and-inserted-between`) · the listing point backfill · the Ward-tranche list (`docs/agents/WARD.md`).

**▶ BRIEFED 2026-10-28 night, co-signed by Zob, ready for Jacob's FRESH dispatch:** the re-skeleton button: LANDED 73f8e441 (each town's first Bake asks once to re-skeleton; HPDM and Huron take the area-highway rule there). · `docs/briefs/BRIEF-the-day-strip-has-its-line.md` (the Almanac's
temperature line: a regression from kit 2df8d341 (10-20, Open-Meteo → NWS); Ward's brief, Zob co-signed; reports to Ward). All three FRESH, independent. Next to
brief, on Jacob's go: the Arch as a set-piece at its real coordinates with a presence scale + retiring the Survey Hero (focus lives on
keyframes only). Jacob, 2026-10-28: the Arch now "bounces" with camera motion since it's no longer tied to the camera; that brief owns it.

**❓ OPEN RULINGS FOR JACOB:** the (b′) chain ends · the chain join's override home · Browse → Society re-frame · a deck's width (the
pier's OSM `width` tag) vs an embankment's (the pour measure): two rules size a street's land over water · authoring dpr.

**⛔ PROMOTE CARRIES A STALE PLAYER SILENTLY (measured by Ward, 2026-10-29 02:29Z):** HPDM was promoted with its new slab while
staging/ward/current.json still named the 10-27 player, so production got new slab + old player (symptom: "[revetment] FAILED to load
revetment.json — manifest names no revetment.json"). The release order said player first; nothing enforced it. FIX OWED: Promote refuses
by name when the player staging names was built on an older kit than the slab's bake (claims-no-slab-outlives-its-schema's family).
Re-promoted by Jacob the same night on the new player (Ward 25ee07f / kit 19bb2d25).

**Follow-ups from the day-strip line (Isotherm, 2026-10-28; Ward's board):** theward checks/kit.mjs resolves KIT relative to the checkout
(breaks in worktrees) · observed wind for storminess · a cited cloudLayers → cover standard (Jacob's terms) · targetsOf's
precipitation/wind/visibility defaults (Layer 0 fallbacks) · claims-the-wind-has-one-authority unrun (needs a server).
**Place-link preview photo (parked, Jacob, 2026-10-30):** always the town's time-of-day shot, or the place's photo where its licence allows (PBG and attribution photos undecided). Built narrow meanwhile: `shareCard.js#PREVIEW_LICENCES` = public domain / CC0, so 2 of PTown's 33 photographed places send their own photo. ▶ `node checks/claims-a-place-link-sends-its-own-card.mjs`

**Two Society reds on the Ward's board (Ward, 2026-10-29; cause not established):** RED identically on kit pins a109ec98 and 527213c7,
same :5180 dev server, so they came before the far-shore pin. ① theward `checks/society-flight-has-no-long-frame.mjs`: the phone flight
has frames over budget, varying by run (headless; e.g. LS 183 ms once, Huron 67–83 ms ×9). ② `checks/society-frames-what-it-lights.mjs`:
the live arrival frames with the movie's inset {top 104, bottom 224}, not the map's settled rect {top 362}.

**▶ BRIEFED: `docs/briefs/BRIEF-provincetown-pours-on-the-port.md`** (Jacob, 2026-10-29: "piledrive Provincetown"): Plumb, continuing
after the port merges. The full refusal census on the merged port, then one class at a time, each a rule for any town.
**▶ BRIEFED: `docs/briefs/BRIEF-the-drape-sizes-one-nested-lattice.md`** (Boz, 2026-10-29): the 201-sample sizing (PTown 1:left
empty; 42 near-only chunks named KNOWN in claims-the-armoured-shore-is-never-empty) and Jacob's seam ruling ("call them from the same
place") in one rewrite of `drapeGlobals`: one nested lattice sized from what it builds, `farRow` the one producer of the near/far edge.
Groyne, a follow-up off groyne/far-shore.
**⛔ PTOWN'S MARINA DOCKS DRAW AS GREEN 'TREELAWN' ON THE SEABED** (Zob, measured 2026-10-30; Jacob's "markings on the sandbed are grass"):
OSM floating piers (`highway=footway, man_made=pier, floating=yes, mooring=yes`; ways 1486114948, 1486114957–978, 289074419/420)
reach the ground as `treelawn:<LU>` (renderOrder 32, #6E8A5E) at ground level, so at low tide they lie as green stripes on the exposed bed.
⛔ This CONTRADICTS a standing ruling: `r-a-way-tag-decides-before-byCoast` says man_made=pier is a deck. So it's a defect, not a design
question: which code turns a pier footway (a PATH, not a street) into treelawn is not traced. Kit-wide: any town with mapped docks.
Open for Jacob after: what `floating=yes` means for the deck's height (the tide). Also check the ~0.9 km² salt marsh drawn as
`treelawn:*` west of the Breakwater (plausibly the same mislabel at area scale, unverified). Next for Plumb.
**⛔ URGENT, DISPATCHED to Gimbal: `docs/briefs/BRIEF-the-overhead-camera-resolves-its-ground.md`** (Jacob, 2026-10-30, live PTown on
his phone: the seabed shows through the harbour in Browse and Society; desktop clean). Phone linear depth with near 1 m at ~6.5 km.
**▶ JACOB, 2026-10-30 (not tonight): THE PUBLISH PANEL'S BUTTONS ARE CONFUSING:** "the slab/player publish/push buttons … are unnecessarily
confusing; I think it's because they shouldn't all be the same buttons." A design question for Ward's seat: different actions shouldn't look
alike (Publish to staging vs Promote to production; slab vs player). Not ruled.
**▶ PTOWN, THE BOATSLIP'S WATER AT LOW TIDE** (Jacob, 2026-10-30): "we need to analyze the boatslip area and confirm there's enough water;
boats parked there would be sitting on sand at low tide; which might be correct; we need to confirm". Compare our terrain and tide datum
there against a cited chart (NOAA, MLLW soundings off 161 Commercial St). A fact check, not a fix.
**⛔ A PROMOTE CANNOT BE ROLLED BACK** (Ward, measured 2026-10-30): production's slab index `baked/<look>/manifest.json` is ONE unversioned
key, and each Promote overwrites it. The old pour's hashed files survive, but nothing names them, and no backup is taken by default
(scratch/promote-rollback/ holds HPDM only). Owed: a Promote keeps the previous manifest (versioned or saved) and a scripted rollback,
with a check. Same family as the promote guard.
**▶ BRIEFED: `docs/briefs/BRIEF-the-slab-ships-compressed.md`** (Jacob, 2026-10-30): every slab .bin is served UNCOMPRESSED (Ward, measured:
PTown's six bins 85.86 MB raw vs 30.03 MB brotli; 120.9 MB first load). The largest load lever left.
- Small: Preview's DeploymentPanel shows "could not read the deployment: Unexpected end of JSON input" when :3333 is restarting; say the
  bake server isn't answering (Jacob's rule: a message explains or goes away).
**▶ NEXT LOAD COST (Ward, measured on PTown production 2026-10-29, after the far shore landed: reveal 10.6–12.6 s, from 14.7–15.7 s):**
the largest main-thread task is now `drawnGround.js#makeDrawnGround`'s triangle-grid binning, 1.6–1.9 s, camera-independent (Groyne's C9
census: a view over baked bytes, so outside the far-shore check's class). Candidate: the cell grid baked into the slab, or built in a worker.
Measure before choosing. PTown's console also prints "STALE SLAB … this ground predates the pinned coast (no drawnRaw record)"; that's the
true state, and it clears with PTown's re-pour (BRIEF-provincetown-pours-on-the-port).
**⟦OWED⟧ A WARD PIN REFUSES WHILE A COASTAL STAGING SLAB LACKS THE FAR BAKE** (Groyne/Zob, 2026-10-29): after the far-shore merge, a
player past it draws no shore on a slab without `revetment-far.*`. The release order (OPERATIONS) says merge → far step + publish for
every coastal town → only then the pin. Nothing enforces it; same family as the promote guard above. ⭐ And the guard reads the FORMAT, not presence (Ward/Boz, 2026-10-29,
FAR_FORMAT 3): the pin, and every Promote, refuses while a town's staging slab's `revetment-far.json` version ≠ the pinned player's
`revetmentFromSlab.js#FAR_FORMAT`. The new player refuses an old format by name; the old player (527213c7) has no far-format gate, so a
format-3 slab published under it is read as format-1 bytes (inferred from source, not run), and a Promote in that window carries the
old player to production with it. Until the guard exists, this cycle's rule: both slabs publish, then kit bundle + publish:staging back
to back, then the eye, then any Promote.
**▶ LANDED 2026-10-29: `docs/briefs/BRIEF-the-far-shore-is-not-built-at-load.md`** (Groyne, merged; evicts after Jacob's eye on the shore) (Jacob, 2026-10-29: PTown's long load; Ward's
profile: one ~3.2 s main-thread task per load is the revetment's far layer, `SlabRevetment.jsx`'s `useFrame` → `revetmentDrape`).
**▶ TO BRIEF NEXT (Jacob, 2026-10-29):** ⭐ FIRST: an AIMER for the Stage camera (LS's staging slab is a PLACEHOLDER until it lands: Jacob
re-aims LS's keys with it, then LS re-bakes and its cutover follows) (`r-plant-it-and-point-it`: today's navigation kept; add turn-in-place,
then play) · the live edge fade band (below) · a town keeps the values it grew with (`r-a-town-keeps-the-values-it-grew-with`: a
kit-default change never re-colours a town on its next bake; today `bake-scene.js`'s `design.X || kit…` channels follow the kit).
- **▶ BRIEF AFTER THE AIMER: a move TRACKS a point or TURNS the head, per segment** (`r-a-move-tracks-a-point-or-turns-the-head`, Jacob
  2026-10-29). TRACK (the default) tracks the key's FOCUS OBJECT, else the TOWN'S CENTRE, read at play time, never stored (amended: no hidden
  handle); TURN paces on position + turn angle. Movies change where stored targets differ from that. Measured motive (Gimbal, `scratch/aimer/probe-equal-depth.mjs` in the aimer worktree): today's hidden depth moves the mid-move look by up to
  LS 2.47° · PTown 17.72° · Huron 16.21° · HPDM 39.19° (HPDM tracks no subject).
**⛔ STAGE'S EDGE FADE BAND IS BAKE-TIME, NOT LIVE (Keystone, measured on LS 2026-10-29); ruled: visual values are live
(`r-visual-look-values-are-live-in-stage`), brief owed, not tonight.** Also: createGroupChannelActions' set<Channel> drops a write to an
animated channel's unkeyed slot silently (Layer 0; refuse by name). ⚠️ LS's design.json carries edgeFadeBand 801 (on r 892: the fade
would start 91 m out) — confirm with Jacob before LS's next bake.

**⛔ NAMED DEBTS (each removed when its cure lands, never left as a quiet fork):**
- by-value reads in `checks/claims-a-bake-step-declares-what-it-reads.mjs`.
- `src/data/buildings.json` in every pour's inputs (Class D).
- derive.js reads cap ends from raw/centerlines.json by NAME (ends within 2 m), a fallback no guard sees; LS has 11 capped centerlines,
  all shadowed by overlay caps today (Zob, 2026-10-28). A candidate to retire.

**Branches kept:** `plumb/ls-historic-districts` (9477fdd8, 91178f33): KEEP, a ruling owed; it declares LS's historicDistricts in
sources.json but writes the OLD dir (`cartograph/data/lafayette-square`), so re-point it to `lafayettesquare` before any merge ·
`plumb/on-edge-derived-PARKED` (1348ba84): parked on the ON_EDGE_M re-measure (row below) · `ferrule/ink-owned-by-labels`: merged, checked
out in the MAIN checkout (Jacob's), stays.

**Still-open rows cited by name elsewhere (short; their history is in the archive):**
- **the open/close refuses at a source staircase** (cited by `openClose.mjs#emit`'s refusal, which names the cut's two edges and the jog
  between them). Known refusal, by class, site and lengths, in `claims-the-coast-is-the-lidars`: MacMillan's 10-27 crop (KNOWN_REFUSALS 1; the
  wharf's 1.4 mm step builds under the unit-line rule). Its shape: a 2.8 mm diagonal jog (after a 1 mm unit edge) read BACKWARD between two lines
  7.2° apart, both targets past a cell (15.9 m, 4.8 m). Q1 and Q2 do not reach it: it is the backward-cut branch, not an out-of-order tag or a
  trimmed arc. Unbuilt; "join any sub-step edge" raised Huron's ratchet (local `plumb/staircase-runs`). Trace: `macmillan-trace.mjs`.
- **an island near one terrain cell is kept or dropped on its vertex set** (Zob, 2026-10-29): Huron's (715.43, 214.26) is 29.583 m² at the
  open/close on both paths and the definition, yet kept at base and dropped through the port, downstream (simplify/settle, then "every island
  kept holds a terrain node"); the stage's sensitivity, cause not established.
- **the open/close's residual against the definition** (cited by `claims-the-open-close-cuts-once-huron`): Huron's traced water past
  2·NODE_BOUND, on a ratchet; evicts at 0. PTown's take-out: 0.008 m² at (192.163, 80.195), not chased. Local `plumb/concurrence`
  e7b78ec2 raised it (definition-only 11 → 17). Every coast bake judges and records it (`bake-coast.mjs#judgeNets`). COPIES, by site: Huron 1 at (720.196,
  209.874), insideRun's crop 2 at (−4312.323, −3315.972), each a cut point past NODE_BOUND off its source line; why emission passes it, not established.
- **the take-out re-run on its own (extended) deck is not idempotent**: PTown's deck 0 takes a new 0.001 m² sliver at (118.657, 167.066). The
  pour never re-enters (none of its 6 touching pieces is rounding); checks recompute via `mintInputsOf`. Cause not established.
- **facesOf's tag ranking is held** (Zob, 2026-10-29): no current case; 84–86 was a folded input (now refused by name).
- **PTOWN PARKS** (registry canon): (a) the edge rule and the way tag landed (v4); the dike is held as land (v5, `r-the-coast-bake-holds-an-embankment-as-land`).
  **(b)** the decks' 1 mm jogs: cut once (`openClose.mjs`), PTown's decks' edges ≤ 2 mm are 0 (pre-open 0) ▶ `claims-the-open-close-cuts-once` (2). **(c)** below.
- **PTOWN'S PLAYER: A PRESS IS NOT WORSE, AND THE FOCUS RETURNS ONLY WITH THE RE-BAKE** (2026-10-29). Any player past the Hero retirement
  (d7e5f160) reads focus only from the SLAB's keys (`Town.jsx#heroKeyframes`, `focusObject.js#keyframeFocusIds`). PTown's slab predates
  the arch-stands stamp, so its keys carry no `focus` and the Monument is no focus object. Jacob, by eye: live PTown's Hero is ALREADY
  blurred that way, so a player-only press is Jacob's call on staging, not a hold. No shim (it would be the deleted fallback). The
  Monument's focus returns with PTown's scene re-bake, after brief A.
- **(c) THE WIDTH CLAUSE** (no neck or channel under one cell, at settle's exit) is unbuilt (ORIENTATION ⟦unbuilt⟧; `bake-coast.mjs`).
- **RELEASE ORDER FOR THE COAST PIN** (Jacob ruled the pin): an OLD player on a NEW slab draws the bare lidar contour silently. (1) the kit
  merged; (2) the kit bundle published at that sha; (3) the Ward pin moved on `ward-pin/<date>` and publish:staging; (4) ONLY THEN the
  coastal towns re-baked and published to staging; (5) Promote pins player and slab together; a rollback restores both.
- **THE WATER TINT READS THE FIELD, NOT THE PINNED GROUND** (Ward-seat review (c)): measured in the combined bake by
  `scratch/water-tint/probe.mjs` on the shader's composite (diffuseColor.a and makeWaterAbsorption's T/T.g, at the town's own look); over
  one 8-bit step on a post-bake slab is a second shoreline, to Boz (the fix then: pins on the water sheet through drawnPinsOf).
- **THE DIRTY DETECTOR HAS NO DISCRETION** (cited by `pour-code.mjs`, `claims-the-bake-watches-its-code`): the record is in the archive.
- **THE CUT-SEPARATELY CENSUS** (cited by `tileGround.js`): its site list is in the archive; still open.
- **ON_EDGE_M** (groundConformity's 5 mm weld): HELD; Zob's derived form √2/2·LATTICE + the float32 ulp opens 85 LS seams (363 m) the
  weld closes; re-measured after M1. Class D, not ruled.

---

## ⌒ WE HAVE NEVER TREATED A CONVEX CORNER — and ② is rounding 27 of them (2026-09-06)

**Jacob, on the ①-produced map:** *"a convex corner, which is something we've never done"* ·
*"we've never treated a convex corner."*

**Measured, LS in-disc: 27 corners are eased in the OPPOSITE sense to their ring** — they round
**outward**, wrapping an INSIDE corner. Attribution, so the history is honest: **6** were admitted
by rules that predate 2026-09-06 (1 owner-change, 5 `hard` on both sides) and **4** by that day's
`a.hard || b.hard` correction; the rest did not resolve to a rule under the probe used.

⭐ **THE DOCTRINE POINT, WHICH IS BIGGER THAN THE COUNT.** The authored radius is a **CURB RETURN** —
an *outside*-corner specification (the NACTO/AASHTO 4.50 m class seed, the dial the operator turns at
an intersection). An inside corner **has no authored value**, so applying the dial there invents a
specification. That is `RIBBONS §1`'s cap rule one level up: *"an offset is measured from a LEG,
never from a CAP; a cap has no authored value — it is what falls out."*
⇒ **What an inside corner should do is UNRULED.** Candidates: stay sharp · take its own (larger)
radius · take the band's inner offset for free. ⛔ Do not pick one by eye on LS.

### ⛔ ATTEMPTED AND REVERTED THE SAME DAY — read before rebuilding it
A guard was written to leave reflex vertices sharp and disclose the count. **It fired on almost
nothing** (ordinary corners 47 → 45, reflex 27 → 25) because **the ① block ring and the artifact
tile ring do not share a winding convention**, so the guard's convexity test and the probe's
measured the opposite thing. ⛔ **Get the winding convention pinned FIRST** — this repo carries both
shoelace conventions and `booleanLabelled` converts the outer "to the winding the consumer expects"
— then the guard is a few lines. Reverted rather than shipped, because a branch that changes nothing
is worse than no branch.
▶ Reproduce: count fillets whose signed turn opposes their ring's signed area, on the ARTIFACT tiles.

## 🎗 SKINNY MEDIANS ON PARK (2026-09-06, operator-marked)

Park Avenue's median blocks measure **6.0–8.7 m mean width** in ① (5 of them: `park-avenue-0+1`,
`-2`, `-5+7`, `-6+2`, `-7+5`), and ② then erodes each side by the authored half-width, so what
survives reads as a sliver.

⚠️ **Suspect the DATUM before the construction.** ①'s ink is struck at ε about the **CENTRELINE**
(`SKELETON §61`, corrected 2026-08-14: the chain points are at carriageway centrelines, *not* inner
edges), so a median block's boundary sits on the two centrelines and eroding it by a full
`pavementHW` per side double-counts the inboard lane. `derive.js` `innerEdgeAssign` exists to set a
carriageway's sides to `surveyHW/2` — ⛔ **whether ②'s `protoMeasureOf` honours that halving is NOT
measured.** That is the first question, and it is a datum question, not a corner one.
⛔ Do not "fix" this by widening the median — `RIBBONS §1`: a median is a block, and if the curbs
touch there is no block.

## 🕳 UNCLOSED BLOCKS AT THE RIM — a street that stops SHORT of its junction (2026-09-06)

**Symptom, operator-marked:** a chunk of the map inside the disc paints **nothing** — no block, no
curb, no sidewalk, no land use — while its neighbours draw normally. LS: the SW rim, mark at
`(-267,-793)`, **61% of a 144 m circle blank**.

⭐ **CAUSE ESTABLISHED, and it is the FRAME, not the producer.** ① makes a block from a HOLE in the
ink, so the ink has to close a loop. Papin Street **shares no vertex with South Jefferson** — it
stops short of it:

| chain | ends | short of | gap |
|---|---|---|---|
| `papin-street-0` | start | `south-jefferson-avenue-0` | **11.63 m** |
| `papin-street-5` | end | `south-jefferson-avenue-8` | **15.87 m** |

The aerial shows the road running through to the junction, so the road is real and the frame is
wrong. `ENDPOINT_SNAP` welds near-coincident endpoints at a few **centimetres**; 12–16 m is three
orders of magnitude past it, so nothing welds and the loop never closes.

⛔ **DO NOT CHASE THIS IN THE PRODUCER.** Everything downstream is behaving correctly — there is no
hole, so there is no block, so there is nothing to stroke. Ruled out by measurement on the way:
the fetch bbox (2236 × 2240 m against an 1784 m disc — it covers), prebake loss (skeleton and
ribbons agree exactly there), and the `touchesFrame` exterior drop (removing it changes nothing).

▶ **Home for the fix: `cartograph/extend-centerlines.js`** — the class is "a chain that stops short
of the junction it visibly reaches." Skeleton-layer, so it **needs a re-pour**, which is why it is
here and not in the corner arc.
⭐ **The kit form, and it is the deliverable:** a check that flags *any* chain endpoint sitting a
few metres from a chain it does not share a vertex with. That is town-#2 portable and needs no
operator who has already seen this street. ⛔ A per-street extension list is not a fix.
⚠️ **And it must not weld a GENUINE severance** — `OSM-FORENSICS §1.3` names Carroll Street as a
real one, and `ROADMAP A09`'s `highway=turning_circle` tag is the only arbiter we have for
severed-vs-fragmented. Distance alone yields a shortlist, never a verdict.

▶ Reproduce: `node checks/claims-marked-corners.mjs` is the WRONG lens (a corner classifier); use a
region count — ① blocks inside the mark vs drawn — and the endpoint-gap scan above.

## 📐 the kit-correctness track — shrink automation-debt (automate the eye)

> The SHAPE campaign: make the skeleton produce correct street geometry **automatically** so LS's *automation-debt* curated hand-fixes can be deleted and the auto-pipeline still holds. This is **kit-forward correctness** (town #2…N), distinct from the v1-render frontier above. **The law** (`NEIGHBORHOOD-INPUTS §0.0/§1.1`): every output is a best guess and overridable — automation should keep improving, but override is first-class, and *idiosyncratic* curated chains (features no source holds) are **kept**, not defects. The data question is CLOSED (no external street source helps — `INTAKE §5.1`); the lever is the skeleton's *interpretation*. North star: *Survey shows the perfected map straight from the skeleton.*

- **⭐⭐ The correctness detector IS the deliverable** (not the 35 fixes) — `POLYGON-FIRST §5`, harness `scratch/correctness-detector.mjs`. 8 invariants seeded; **`junction-band` is the recall instrument** (24/25 structurally-visible curated defects; the defect is pervasive ~60 junctions), **`width-step` the flagship** (the datum-step class). The 35 are mostly **topological** (loops/cul-de-sacs + seam datum-steps), not jagged curves — so the suite's centre of gravity is graph-level. Findings: `SIEVE-DETECTOR` · `LOOM-TOPO` · `THROAT-JUNCTION-FINDINGS`. The detector flags the class everywhere → CI gate → onboarding loop (run-suite → fix-class → green).
- **The open construction (the bug classes still to kill generally):**
  - **`HANDOFF-curve-primitive-skeleton.md` — curves as bezier primitives.** Ph1 (centerline beziers) + Ph2.1 (robust curve curb) landed; the junction-curb bump RESOLVED. ▶ **v2: loops + divided carriageways as closed/paired beziers** (the cul-de-sac faceting + Benton/Waverly/divided medians) — Benton-gated; add the `curve-faceting` detector. *(Absorbs the old round-skeleton-corners / concentric-curb / vector-curve framings.)*
  - ⛔ **`HANDOFF-junction-construction.md` — intersection-everywhere — CLOSED 2026-09-05** (Jacob: *"E3 is superseded; fold it in and close the campaign"*). Thicken→collide→trim→assemble **is polygonize-then-offset under construction vocabulary**; the grout does it without constructing. ▶ **`cartograph/RIBBONS.md §1`**; the file carries a closure banner naming what survived (`innerSign`→face-adjacency → `RIBBONS §3.5`; the `junction-band`/`curb-bump` detectors). ⚠️ **Its through-node subclass root still stands and is NOT superseded** — `tileGround.js` gates window construction on `dw`/`kink` and skips straight deg-3 T's (`scratch/THRUNODE-GATE-FINDINGS.md`, 2026-07-16); it is a real defect in the code the grout replaces, so it dies with that code or it does not. **Re-check it against the grout before assuming either.**
  - **`HANDOFF-band-fold-fix.md` — the G12 thorn clamp.** ⚠️ **NOT landed** (`8e1e414` stranded; `thinTile` orphaned to `bandJoin`, no depth clamp). The LOCAL capacity clamp (engage on partial-degeneracy without over-clamping). Two subclasses, both open. *(Absorbs the junction-band-thorns forensic.)*
  - **`HANDOFF-freeze-the-curb-in-the-first-bake.md` — freeze the curb geometry (the last unfrozen polygon).** D2 froze the tile *topology*; the **PRODUCER** still mints the curb by stroking chains and snapshotting it (the "d" bulge — its divided-transition instance landed `fd38c70`, but the program is the freeze). ⚠️ **Scope corrected 2026-07-31:** the **consumer** half is DONE — every non-Survey view reads the frozen `shape.json` (`ORIENTATION §3 (the Wall)` ⚠️ *(was cited as `WALL.md §31` — a section that never existed)*); only Survey live-strokes, by design. What is red is **Check C** (producer chain-free), so this item is D6b/c only — smaller than the "the curb is not frozen" framing implied. Emit the clean parallel-offset curb once in prebake, consume it; only the element under the operator's hand re-strokes. ⚠️ **Rebuild-gated → PARKED.** Phase 2 (block-local edit loop) is the FILL-perf sibling of section-perf #1.
- **⭐ Land-use classification — the phantom park (data, not geometry; `RIBBONS §6.2`).** `classify.js` stamps `type='park'` on the FIRST containing overlay, and the bucket includes `landuse=grass` + `leisure=garden` — so residential lawns capture whole faces. Measured 2026-07-30: **512 of 895 overlays stamp park**; **25 of the 29 faces shipping `use='park'` are yards** (all via `landuse=grass`, 92,869 m²); worst is face#12, **136,234 m² captured by a 4,899 m² lawn**. ⛔ The canon's old "~3 LOC: drop `leisure=garden`" fix repairs **3 of 28** — the offender is **grass**. Fix = narrow to genuine parkland (`leisure=park`, `landuse=recreation_ground`), drop grass AND garden. ⚠️ Moves land use map-wide → prebake + rebake + Jacob's eye before it counts.
- **⛔ `layers.park[0]` is AUTHORED — do NOT delete it** (`RIBBONS §6.2a`). The 350×350 m 4-vertex square at the origin reads synthetic and is not: it is `clean/park-polygon.json`, deliberately preferred over the 65-vertex OSM trace so the corner plugs reconcile. **Measured aligned** — 9.20° vs the grid's 9–9.5°. Two real correctables instead: (a) it is **~8% small** (350 m vs OSM's ~365 m ⇒ the edge sits ~7 m inside the true park all round — fix `halfWidthMeters` if that is a slip); (b) **`PARK_CENTER` `{-15,-15}` disagrees with the polygon's `(0,0)` centre** by 21 m in the parcel-exclusion test (latent). *This object has tripped us repeatedly — the note exists so the next pass corrects it rather than deleting it.*
- **Skeleton fortification — name-aware weld** (`SKELETON §5b-bis`): weld 35 same-name fragments + straighten within-name kinks (St-Vincent/Papin artifacts vs Park-Place real bends). Partly addressed by the `roadId`/`continuesAs` union.
- **`HANDOFF-tile-T3-authoring.md` — polygonize Survey / migrate authoring onto tiles.** Move handles / corner-R / cap-selector / strip-swap / translucency off the dead figure-ground; activated-block live redraw (the sticky-tools fix); then **T4 deletes figure-ground**. *(Absorbs the design spine + the injective corner-handle slice.)* The **Survey · Section · Stage rename** rides this (don't rename code until implemented).
- **`HANDOFF-tile-feature-ledger.md`** — the tile re-pour definition-of-done ledger (tracking matrix; the construction side is ✅, T3/T4/slab-content remain).
- **Deferred SHAPE residuals** (`[[feedback_accept_the_long_tail]]`): the intersection-everywhere finish (better-but-not-perfect nodes — = the junction work) · the curve-and-cut class (a block edge curving-then-cutting near a junction).

**Landed → `_archive/handoffs/` + Reference (not logged here):** the pre-DataWall closeout (surface-and-wire G1/G3/G4, edge-of-map perimeter faces, divided-"d" curb, cul-de-sac keyhole, the walked-face median, intersection-everywhere `9c275ce`, the Section build, loops/dead-ends/cap-wrap/handle-float/alleys). The honest "done" test (code-landed ≠ eye-verified) lives in `DOC-CODE-COHERENCE.md`.

---

## 🛡 HARDENING — correct on the eye, not yet correct-by-construction
- **The overhead near's leftovers** (Zob, 2026-10-30, on ff4f430d): (a) a geometry swap that keeps the same mesh count can leave a stale town top; (b) plan → street drops the near to 1 at the flight's start while the camera is still high (~1.5 s of the old phone precision); (c) noted: desktop costs nothing.
- **BakedGround calls `setDrawnGround` inside a `useMemo`** (a setState during render; React warns naming SlabRevetment and Ground). Pre-existing (Zob, 2026-10-29). Publish the drawn ground from an effect.
- **🧭 "no terrain identity" and "flat" are one string** (Zob, 2026-10-29). bake-tree-anchors and bake-lamps stamp
  `terrain.identity ?? 'none'`, and `terrainCommon.js#terrainIdentity` of the flat terrain is also `'none'`. So an anchor file whose
  identity failed to compute reads as a flat town's, and the anchor verdict (`src/lib/anchorGate.js`) matches it to a flat slab.
  Flat-to-flat is right; the failure should be its own loud value. Pre-existing. Not built.
- **The coast-residual accept builds its git commands as shell strings** (`serve.js`, the accept route: `git add -- ${rel}`, `git commit -m ${JSON.stringify(msg)} -- ${rel}`): `$` and backticks still expand in double quotes. Safe today only because the scene id and the numbers are kit-made; pass them as an argument list (execFile) on the next touch (Zob, 2026-10-29).
- **D3 — corner identity at divided transitions → freeze at prebake.** The false-corner cure is LIVE (`9c275ce`); doctrine wants the decision made once upstream as frozen topology (`PREBAKE §5`). Sibling of the curb-freeze. ⚠️ Relocating re-derives corners → gate it; don't cleanup-refactor.

## ⏭ NEXT

- **🚸 THE DEAD-END MOUTH CROSSING — the ped band closes across a spur's mouth and paints it as SIDEWALK, i.e. a crosswalk where none exists** *(flagged by Jacob 2026-08-10, on the eye, off the back of `A10` ③)*. **Section/FILL — ⛔ NOT `A0`, it does not touch the bulbs; don't bundle them.**
  - ⛔ **③ DID NOT CREATE IT — it made it LEGIBLE, and that distinction protects ③ from being "fixed" backwards.** Sidewalk area inside the frozen mouth discs is unmoved across the cure (re-derive: run `sectionPassTile` per tile before/after and intersect `Wacc` with a disc at each `st.mouths[].mid` / `.R`). What changed is that the ribbon around the mouth became continuous, so the crossing now reads as a closed loop around the spur instead of dissolving into broken green. **The old appearance was accidentally right for the wrong reason** — the arc fell to `luRemainder` and rendered as land use.
  - ⭐ **The cure keeps the arc PAINTED and changes its MATERIAL** (Jacob: *"this can literally be both ribbon sections set to tree lawn"*). ⛔ Not painting it re-opens the hole ③ closed, and `ARCHITECTURE §"The compound shape"` forbids reading an edge as an absence.
  - ⛔ **THE ARC IS NOT AUTHORABLE TODAY, so "just set both strips to LU" is not an operator gesture here.** The span that closes a mouth belongs to **the THROUGH street's run, not the spur's** — verify per scene by reading `shape.json`: for each `st.mouths[]`, the `st.runs[]` vertex nearest `.mid` carries the through street's `skelId` (a few are rim runs with no `skelId` at all). At `skelId|side|segOrd` granularity the flip would grass over the whole frontage segment.
  - **Shape of the fix:** default automatically from frozen facts — **a span lying inside a frozen mouth disc paints both strips LU** (③'s partition already isolates that span; the disc's own `R` is the only bound, no tuned distance) — and key the OVERRIDE on **the spur**, since a crossing is a property of the dead-end street and the spur *is* addressable; one scalar in its existing slot, the shape `capFlip` already has. **No new key space.**
  - ⭐ **The deliverable is the check** (`POLYGON-FIRST §5`): red-until-true, *no sidewalk strip is painted inside a mouth disc that carries no crossing* — per scene, no eye, because on town #2 nobody is looking at these.
  - ### ✅ THE OPEN QUESTION — *"flat no-crossing default, or gleaned from OSM?"* — **IS ALREADY ANSWERED ON THE BOARD: `ROADMAP A09`.** *(Boz, 2026-08-11.)*
    **We fetch the crossings and throw them away.** `fetch.js` asks Overpass for `node["highway"]` and `ingestElements` keeps only the coordinate — **`fetch.js:123` is `nodes[el.id] = [el.lon, el.lat]`, `el.tags` discarded.** A09 measured the LS bbox: **489 `crossing` nodes dropped** (alongside 763 `street_lamp`, 20 `turning_circle`, …). ⇒ **the glean is not an unknown, it is `A09`** — and this defect is a **second consumer** of that one fix, which is the argument for doing A09 rather than hand-defaulting here. ⛔ **Do not build a private crossing fetch for this ticket** (`project_census_is_the_union_of_its_wells`). ⭐ A09 already carries the same shape at the cap: *"the cap DEFAULT is derivable today; nobody ever wired it."*
  - ❓ **OPEN, Jacob's call:** flat *"a dead-end mouth carries no crossing"* default, or **gleaned** from crossing data (OSM `highway=crossing` / `footway=crossing` near the mouth) with no-crossing when silent — the kit-correct shape, and the same doctrine as `gleanTreelawn`, but it needs an intake trace first to confirm we still retain crossing nodes.
- **🔗 Boundary streets as PARTIAL edges (the spine case) — brief: `BRIEF-boundary-partial-edges.md`.** `computeBoundaryFromSelection` assumes one named corridor = one ring edge, so it demands every selected street have exactly two boundary neighbours. That's right for Księży Młyn (4 streets → 4 corners, closes) and wrong for a spine: Centrum's Piotrkowska runs *through* the district, touches dozens of junctions, and is reported interior even though the selection is correct. The model needs to become a cycle through corners where each edge is a RUN ALONG a street between two of them — a street may contribute several runs. **HPDM needs this** (two neighborhoods stacked). Must not regress `ksi-y-m-yn`.

- **📋 The Intake Manifest — brief: `BRIEF-intake-manifest.md`.** The last unbuilt step in the kit: a per-scene `intake.json` declaring every render-side input a pour *could* use, an Intake panel in the Extent tool (**Get** + **(?)** per row), and honest absence. **The manifest is ASPIRATIONAL** (Jacob, 2026-07-20) — a catalogue of what a town could have, not a checklist it must pass; an unacquired input means the feature simply isn't shown. The earlier "pour gate" framing is retracted in-brief. **Cartograph enumeration DONE 2026-07-20** (§5): floor = 4 inputs (Centrum poured on exactly those), ~16 elective, measured presence matrix (LS 25 · HPDM ~20 · KM 11 · Centrum 6). ⭐ **LS is *the* final-Boss dataset — the complete target, NOT an outlier** (Jacob): the panel lists every row for every town (a collection checklist); the render shows only what's been acquired. LS's seven unique inputs are *undocumented procedures*, not unrepeatable ones. **Scope is the CATALOGUE, all four domains** (cartograph + arborist + meteorologist + content, incl. "where on the net do I get this") while the *dependency* set stays the 4-input floor — cataloguing ≠ depending. Lens = **the universal player** (`ROADMAP C1`). The catalogue is also a **FEATURES artifact** (Jacob: "almost an oblique feature of the FEATURES doc"). ✅ **The three LS fallbacks this entry surfaced are EXCISED** (verified 2026-08-04): `bake-lamps.js` `loadAuthoredLamps` reads the per-scene well first, then LS's only `if (scene === 'lafayette-square')`, then `[]`; `bake-trees.js` resolves defaults against *this* scene and prints `no tree-species-map.json — species routing is EMPTY` on absence. For every town but LS, absence now means absence. The manifest work itself is unaffected. ⚠️ **Serialize with the partial-edges brief** — both rewrite `serve.js` + `ExtentApp.jsx`.

- **⭐ "Revert to Data" buttons — Survey + Section.** Strip the authoring overlay back to base (Survey → skeleton surveyed widths; Section → the gleaned treelawn-Y/N × ADA calc). Mechanism partly exists; generalize + surface per-tool. `SECTION §8`.
- **Boundary residual** — the edge-of-map face-walk half landed; the cull/SSOT + the S1 elbow→fade residual are **subsumed into the Extent redesign** (`_archive/EXTENT-EXCAVATION-DIARY-2026-09-13.md`; the circle-SSOT model was retracted). Former brief archived → `cartograph/_archive/HANDOFF-boundary-trio-SUPERSEDED-2026-07-21.md`.
- **Slab-content remaining** — overlays + highway-class asphalt (alleys/footways landed `735f02c`/`543bdeb`).
- **Story-pass address-maps** — Meteorologist + Arborist (`[[project_story_pass_campaign]]`).

## 🖥 GPU-perf gotchas (live)
- **⚠️ Bake-ordering footgun:** a ground GEOMETRY re-bake (`bake-ground.js`) silently drops the AO `lightmap` → flat-lit slab. **Always run `bake-ground-ao.js` after** (the GUI `/bake` chains them; only manual CLI bakes hit this). Outstanding: make `bake-ground.js` preserve the lightmap or warn.
- **tri-cut follow-ups** (tri-cut LANDED, fact in `OPERATIONS §Ground tri-budget`): (1) ✅ **MOOT 2026-09-20** — `bake-ground.js` never held a hardcoded `1.5` (grep it); it reads the shared sampler via `terrainLoad.js`, which now resolves the town's AUTHORED `terrainExag`, so bake and runtime cannot drift; (2) expose `GROUND_REFINE_TOL_M` as an `INSTANCE.mobileQuality` tier → `mobile-profile`.

## ⏸ LATER / PARKED
- **⛔ OPEN: HPDM's ground bake THROWS on 534 walk vertices no painted band owns. It cannot ship until they are fixed or ruled (Jacob's morning decision; Boz 2026-10-12).** Census on 9d89fd43's deformer, by the widest lot gap on the best ② path: ≤5 mm 144 · 5 mm–5 cm 112 · 5–50 cm 243 · >50 cm 27 · no path 8. Every wide gap's midpoint is held by LAND-USE FILL (byFaceUse `face:<lu>`), except 2 clusters (garden, parking_lot) and 1 edgeline. It is never unpainted. Six located, two shapes: (a) a small land-use piece, about 4 m² and about 44 cm mean width, reaching the CURB (0.0 mm) between two pieces of the same band (tiles 138, 21; also 48 at 156 m², and 61 at 24 cm from the curb). Likely the unpainted-band class of `RIBBONS §6.1` G12, but NOT matched to its subclasses. (b) the block's own large land-use face (tiles 52, 114: 15,039 m² and 1,339 m²) between the ② band and a walk or lawn piece no ② ray reaches. Layer: Section's FILL, not SHAPE. Cause NOT established. ⛔ Don't touch the fill without the canon routed and Jacob's eye. ▶ `GAPS=1 SIDES=1 node --max-old-space-size=14000 scratch/ground-height/orphans.mjs hipointedemun <dump> <slab>` · `scratch/ground-height/seams/{wide-held,six}.txt` (Swale)
- **⛔ OPEN: no ground is painted twice (held at ZERO area, not waived; Boz 2026-10-12).** (1) Derive's land-use evidence regions overlap: HPDM 0.300 m² across 33 painted lawn pairs of different keys, the largest OSM residential #4224 over parcel vacant #4659 (0.20 m² in `ribbons.json` `landEvidence`, a 3 mm sliver). Suspected cause, NOT established: `layerLandEvidence` rounds each new crossing vertex to its 1 cm grid; settle it by replaying that one region. (2) A disjoint cut in `rekeyByPiece` (each class minus what earlier classes took, `underived` the rest) removed those overlaps but left 0.500 m² of sub-0.7 mm X|underived slivers plus an unexplained +4.0 m² of lawn, so it was reverted. Where the slivers are made is NOT established. Patch, gate and the parked check: `scratch/ground-height/seams/{disjoint-cut.patch, disjoint-gate.txt, claims-no-ground-is-painted-twice.mjs}`. ▶ `node scratch/ground-height/seams/lawn-overlap.mjs <dump>` (Swale) (3) In the DRAWN mesh (HPDM's scratch bands slab, dac3525d, 2026-10-18, Screed): residential triangles stack along (304.060, −1002.695) → (310.317, −1029.388). Edges there are used 3× (residential+residential+sidewalk) and 2× (residential+residential), and the exact gap check reads the long edge as a seam. Across the slab's partition, 5,596 edges / 8,210 m are used more than twice: asphalt×4 680 m · residential×2+sidewalk 567 m · underived×4 303 m · residential×4 223 m · … Whether each is ground painted twice or a degenerate fan: NOT established. ▶ `node scratch/ground-budget/tj-class/seam-pairs.mjs <slab>` and the non-manifold count in Screed's 2026-10-18 report.
- **⛔ OPEN: LS's ground bake is REFUSED on bare kerb steps (Boz 2026-10-12; LS HELD).** After the lift, lifted block still meets the road with no kerb face and no taper: 46 m (vacant|asphalt 28 · commercial|asphalt 6 · verge|asphalt 5 · treelawn:park|stripe 4 · institutional|asphalt 3 m), named by place in the throw. Cause not established. (Was 9,254 m before the crease split and the carried side; the asphalt|asphalt steps were road slivers misread by a centroid, now retired.) ▶ an offline LS bake (`bake-ground.js --out-dir=<scratch>`) prints it.
- **⛔ OPEN: asphalt INSIDE the lifted block — should it lift? (Boz 2026-10-12; its own question.)** On LS, asphalt polygons lie wholly inside the painter's block (`pr.block`), e.g. around (-867, 207): 196 m², raised with the block, and their edges against the road's asphalt are bare `asphalt|asphalt` steps. Whether such asphalt is road (stays down) or block (lifts) is not decided; cause of asphalt inside the block not established. ▶ `node scratch/ground-height/kerb-refine/asph/classify.mjs <lifted-asphalt dump>`.
- **OPEN: the kerb side of a ground polygon is still READ, at the polygon (`kerbLift.mjs#withSide`, a point just inside it) — A15's remaining recovery.** The painter's items carry no owner: `tileGround.js#sectionOpen` pools every tile's bands into one ring list per class and the bake's paint-stack flatten re-clips them. Close it by stamping each band with its block where the painter emits it and keeping the stamp through the flatten; the mesh already carries the side per triangle from there (`groundConformity.js#emit`).
- **LATENT: ③'s `band(a, b)` returns `[]` when `b` is empty, not `a` (`tileGround.js`, both twins: `sectionPassProtoTile` and the producer's strike; Boz 2026-10-12).** Today nothing reaches it, because the capacity guard keeps the innermost offset non-empty. Without the guard, a block narrower than its bands would lose its walk and lawn instead of keeping land use at the centre. Close it by making `a − ∅ = a`, then re-judge whether the guard is still needed.
- **LATER: the Designer's street carries no `skelId` (Boz, 2026-10-28, filed).** `sceneStreets.js#mergeSceneStreet` names a chain `id`, so `measureModel.js#chainMeasure`'s pipeline seed (`_sceneMeasure.get(st.skelId) || …get(st.name)`) is looked up by the street's NAME, which several chains share (LS's four carroll-street-N). Giving the merged street `skelId` moves that lookup to the id everywhere it is read: the right key, a wider blast radius. ▶ `node checks/claims-a-survey-street-reaches-its-measure.mjs`.
- **KNOWN (Boz, 2026-10-28): the town player (index.html → src/main.jsx) has no on-screen boot refusal.** With no town named it is black, as the tool pages were (src/bootOrRefuse.js). Not needed today: a published town's page names its town in `<meta name="ward-look">`. A dynamic boot there would blind claims-no-town-rides-in-the-bundle (it walks the STATIC graph) and put the looks index in the bundle. ▶ `node checks/claims-a-tool-page-that-cannot-open-says-so.mjs` (names it as not its own).
- **LATER: a whole-Bake atomic publish (Boz's ruling, 2026-10-27: the terrain/ground pair is enough for now).** Only the terrain and the ground are staged and published together (`cartograph/slabStage.mjs`). ⚠️ **The named risk:** a later step that fails (revetment, shore-median, ground-shore, buildings and on) leaves the earlier steps' outputs in the slab, so it is partly new: self-consistent pair by pair, but not the slab from before the Bake, and nothing says so. The fix is to stage every step that writes `public/baked/<look>/` into the one commit. ▶ `node checks/claims-a-failed-bake-leaves-the-slab.mjs` (covers the pair only).
- **⏸ PRODUCT QUESTION (Boz, 2026-10-27): should the Bake PLAN (GET /looks/<id>/bake) answer a refusal as an ANSWER, not a 500?** Today the elevation policy (serve.js: `pourPolicyFor('elevation', bakeScene)` → `markStep 'terrain' failed` + throw) refuses in the plan exactly as in the Bake, so Stage's slab-age read on altadena and jacksonheights (no elevation input, no verified-absent record) gets a 500 naming `fetch-dem.mjs`. Loud and correct under Layer 0; the question is whether Stage should show "terrain refuses: <why>" as the plan's answer instead. ▶ `node checks/claims-a-stage-entry-knows-its-slab-age.mjs --server=<this tree's cartograph server>` (live).
- **LATENT: a slab with NO `ground.json`, or one that will not parse, ships silently (Swale; Boz 2026-10-12).** Nothing on Publish, Promote or the CLI upload requires or parses it (`scripts/upload-baked-to-r2.mjs#plan` read it only to refuse `shore: "pending"`, retired with the shore median 2026-10-25), and `bake-manifest` parses only its content payload. Not decided: whether a slab without a ground is ever legitimate.
- **From the Ward pass, 2026-09-29** (details: `cartograph/_archive/BRIEF-ward-happening-on-the-place-card-DELIVERED-2026-09-29.md`, bottom sections):
  - **Distributed events** (Jacob: *"sponsors … Carnival in Provincetown or the Jinglebell Crawl"*): an event's own card that buildings opt in to, its lit roofs, and its sponsor. Design first (Nocturne); the ticker's tap target is already generic.
  - **A home as a place** (listing a home, posting at one) waits on the **resident-verification flows** (NEXT UP; `verify-resident` itself is closed, F-23, Apps Script @69). Jacob's stance: no ID checks for ordinary people.
  - **The monument has no roof seat** for the selection dot: `claims-every-building-has-a-roof-to-seat-on` is red on provincetown `osm-164024699` (a set piece). Seat it on the set piece's own top.
  - **Addresses: HPDM + altadena need a re-pour** (poured before the OSM twin join); the bake says so by name. ▶ `node checks/claims-every-building-has-an-address.mjs`.
  - **`claims-a-bake-step-declares-what-it-reads`: the LIBRARY names (Boz, 2026-10-27).** Every name a step's own script opens is declared or excused; what is left is named in SHARED modules (`scene.js`, `lookDesign.mjs`, `sources.js`, `intake-rows.mjs`'s code, `tree-bake-inputs.mjs`, `derive.js` …), and a name match cannot tell a read from a branch the step never takes. Next: per module, read which functions each step CALLS. ▶ `node checks/claims-a-bake-step-declares-what-it-reads.mjs` (it prints the count; ⚠️ run it where `public/trees` and `public/baked` are linked, as on integration, or the library rows read wrong).
  - **`claims-stage-preview-parity`**: its app censuses predate the 2026-09-29 Town/CelestialBodies edits and need re-taking with the running app.
  - **⛔ THE TONE-MAPPING FLIP IS OPEN** (Zob, by reading, 2026-10-29; BRIEF-one-town-assembly §5, carried here when that brief landed):
    two writers. `EffectComposer` sets `gl.toneMapping = NoToneMapping` (@react-three/postprocessing dist/EffectComposer.js), while every
    app's Canvas passes `ACESFilmicToneMapping` via `qualityProfile.js#townCanvasProps`, and R3F re-applies gl props when they differ, so
    the last writer wins by render timing. The visual effect is not established. A candidate home is townCanvasProps (a composer canvas
    declares NoToneMapping); measure it, don't assume it.
- **Sky shaders under the logarithmic depth buffer** (Loupe, 2026-09-27). Stage/Preview run `logarithmicDepthBuffer:true`; hand-written ShaderMaterials without the logdepthbuf chunks fail the depth test (that hid the lantern Glow, fixed 36226b74). But ADDING the chunks to the sky shaders (CelestialBodies ×4, CloudDome, PlanetariumOverlay ×2) made the Hero STARS vanish on provincetown (71 programs compiled clean; not the far plane: star radius 49,601 m < far 60,000 m). Cause not established; reverted. Until it's understood, the sky shaders stay as they are and Wick's check ⑩ covers only near depth-tested shaders.
- **The landscape backdrop's Snowline slider runs 0–3000 m, a fixed range** (Loupe's Stage controls audit, 2026-09-26). It should derive from the backdrop's own relief, like the audit's other town-#1 ranges. `checks/claims-stage-controls-are-live.mjs` names it red. No landscape owner today.
- **⚠️ Sky-colour overrides are keyed by CLOCK HOUR (seasonal grid), not by TOD slot.** A sunset/dusk colour authored for one season won't track the slot in other seasons (the slot's clock time shifts with the season, the override doesn't follow). Future: **slot-keyed or per-season sky-colour authoring**. The Sky Builder is the current live tool. *(Known limitation surfaced 2026-06-28 while authoring the 7-slot TOD day — `bc9a74ea`/`986a4f8f`.)*
- **Onboarding / Intake** — ✅ **BUILT: the Extent tool** (author the **inclusion polygon** from the fetched street names; exclusion loops + per-building overrides as correction; one-click Bake). Committed on trunk `curb-offset-draw`, **not yet in prod**. **Altadena is the first hood poured fully end-to-end through it** (LS/HPDM predate the regime → bolt-on protections). ⭐ **Design of record: `EXTENT-DESIGN.md`** (2026-07-22) — supersedes the 2026-07-16 reconciliation. ⛔ **RETRACTED follow-on:** this entry used to call for *"excise the dormant street-selection code — `ExtentClickableStreets`, `computeBoundaryFromSelection`, the `sides` field."* **Do NOT do that — that code is the live mechanism** (retracted 2026-07-20; excising it is precisely the mistake `a05fc129` had to undo). Genuinely excised: `computeExtentCorners` + `/extent-corners` + `fetchExtentCorners` (`55df128a`). **Open follow-ons:** (a) **D4 residuals** — ✅ the `rescope` center-drop is FIXED (`71f5ff36`; it was the real cause of the "disc reverts to `[0,0]`" symptom). Still open: `ExtentApp.jsx:1145` short-circuits `keptCenter` when committed. ✅ **The fade half is CLOSED, ruled 2026-09-20** — it asked "how do fades scale with radius"; the answer is that they are **derived from it and never stored**. The disc now carries `radius` + `center` + `fadeBand` (the one knob); `fade` derives additively (`radius` → `radius + fadeBand`) and `streetFade` is deleted. A rescope has nothing to regenerate, so the question dissolved rather than being answered. `ARCHITECTURE §Extent`, ▶ `node checks/claims-fade-derives-from-radius.mjs`; (b) **retire the `src/data/*` name-imports** (13 static, 10 files) — until then **any second pour clobbers production LS** (`ARCHITECTURE §Extent`, the palimpsest warning; `EXTENT-DESIGN §2.1` + worklist step 4). ✅ **Lamps RESOLVED 2026-07-23 (`4db5c07c`) — union, not replace.** Investigating turned up a live regression: the two wells were *alternatives*, so LS's **80 authored Lafayette Park lamps had silently stopped baking** the day it gained an OSM fetch (the authored branch became unreachable). Now OSM 641 ∪ authored 80 − 33 dupes (<4 m) = 688 pre-clip, ~583 baked. LS's authored well still lives at `src/data/street_lamps.json` — **moving it to `data/lafayette-square/authored_lamps.json` retires one name-import + the last scene-name special case in `bake-lamps.js`** (the loader already prefers the per-scene path). ⚠️ **Not yet re-baked** — the slab still ships 536; needs an eye pass. `BAKE.md §4.5`; (c) **re-verify B8** (poured-scene browse framing, `DOC-CODE-COHERENCE B8`); (d) push to prod when the branch ships. `[[project_neighborhood_disc]]` · `[[project_intake_onboard_process]]` · `[[project_extent_disc_centroid_radius_bb_model]]`.
- **⭐ Custom street data — import + manage (KIT)** — generalize LS's `survey.json` (operator-measured widths, the base-width source: custom → OSM → AASHTO) into the Intake/Onboard flow. `SKELETON.md`.
- **Tile-bake footprint (P1) / curve-fineness (P3)** — profile before cutting (`tile-feature-ledger` E-rows).
- **Hosted bake service w/ auth** (v2+). · **Hero keyframe FOV regression · TAA post-pass** — not urgent.
- **⭐ Parcel-morphology as a classifier signal (`bake-content`)** — the assessor parcels (`raw/<scene>/stl_parcels.json`) already feed the content-pour's land-use *code*, but the lot **geometry** is untapped. Add urban-typology features — lot area · footprint:lot coverage · frontage:depth · corner-vs-interior · abutment/adjacency — to sharpen the use/category guess. Layers onto the existing recognizer (parcels already loaded), no rebuild; runs behind the pour = secret sauce. **When:** guess-quality becomes the bottleneck (thin-claim neighborhood, or a client wanting a pristine first-draft); the "Is This Your Building?" claim regime back-fills the residual today, so it's a sharpening, not a fix. *(Jacob, 2026-07-07.)*
- **Lot-anchored footprint geometry (parallax)** — anchor/center the MSBF building footprints to the assessor **lot boundary** to cut footprint-vs-ground misalignment on camera move. Render-side (`bake-buildings` refinement) — *distinct from the classifier* though it uses the same parcel data; keep the arcs separate. **When:** if footprint drift reads as a visible defect on the pan. *(Jacob, 2026-07-07 — mentally tinkering.)*

## ⏸ AWAITING JACOB (QC / eye)
- **20 address + phone pairs, a standing NAMED red** (Boz, 2026-10-30: they block no bake; Jacob decides them in a later sitting). ▶ `node checks/claims-two-listings-are-not-one-place.mjs` lists each one. Huron 14 (successive tenants, a propane exchange beside its station, a person beside their practice) and PTown 6 aparts (an inn and its bar, tavern or spa; the museum and the monument; two businesses on one phone). Answer each in the town's `listings.overrides.json`: `places.merge` absorbs the listing that should not exist, `places.apart` names two places. PTown's two plain doubles (Gaslamp, Conwell Home Center) are decided with the bake's 15.
- **The red "NOT the frozen shape" bar** (`ROADMAP A02`, built `b27ce690`) — **⚠️ built, never seen fire.** Outside Survey the app renders from the frozen `shape.json`; if that file is missing or fails to load it used to silently redraw the map from chains instead, looking normal. It now shows a red StatusBar bar. **Cannot be verified on LS or any current scene — all have the file.** ⭐ **Zero LS impact — this is insurance for pouring a NEW town**, so it is correctly *not* on the LS path. **Verify opportunistically:** the next time a pour's shape freeze fails or a fresh scene has no freeze yet, confirm the bar appears in Design/Measure (**not** Survey — Survey live-strokes by design and correctly shows nothing).
- **Grade-sep** faces-filtered + stroked-as-asphalt — live re-bake eye. · **Hero-tree LOD** → now the real-DoF cover. · **Render-conformance Ph4–7** — cold-review gate.
- **Section drag-fluidity** (section-perf) · **divided-"d" curb + perimeter faces** (eye-pending the Section/Stage re-bake).

## 🏛 STANDING CAMPAIGNS
- **⭐⭐ The correctness suite — DEFEAT hand-fixing** (the kit's correctness backbone) — see the kit-correctness track above; doctrine `POLYGON-FIRST §5`.
- **⭐ The doc-pristineness campaign (ACTIVE — pristine docs by v1).** The living Process (`docs/agents/BOZ.md`) + `DOC-CODE-COHERENCE`. Done: the HANDOFF prune (27→15); **the whole-corpus accord sweep (2026-06-30) — all non-SHAPE domains (root + cartograph + ls + arborist + meteorologist): stale first-reads bannered, ~10 dead pointers repointed, 3 HANDOFFs retired, orphans indexed (`NOTES.md` 2026-06-30)**. Open: codify the doc-currency mechanism (dated `verified` headers + currency-by-pointer) into `BOZ §3`; the gitignore-`_archive`/`git mv` archiving gotcha; the deferred physical archiving (RUNTIME-DELTA · ls-ARCHITECTURE diary tables · the misfiled cartograph sky-ADRs in `meteorologist/NOTES`). **✅ Drift corrected 2026-07-16 (night-shift standup):** `_archive/PIPELINE-superseded-2026-10-21.md` §5 (the Wall) (was "nothing loads it back / stub" — Survey now consumes the frozen shape via `sectionOpen` for idle display, the 2026-07-14/15 load-forensic work) and `POLYGON-FIRST §0.1/§3-D6a` (was `iA = tile.ring − aFill` at `:1994` — D6a offset landed, `tileGround.js:2728`, carve is fallback only) both **repointed to current**; Check C (producer chain-free) genuinely still RED — that half was accurate and is preserved. **Still open (small live bug):** the **centerline overlay didn't re-hydrate on scene-switch** (stale HPDM lines over the LS map — `dual_hydration_paths_drift`); fix when a scene-switch/overlay-hydration path is next touched.
- **Slider ranges → 0 "Extreme"** (touch-as-you-go, `scratch/AUDIT-slider-ranges.md`). New channels (DoF/Focus/lantern/archLight) born to it.
- **Forensic audit + productization → Show Bible** — LANDED (`_archive/AUDIT-MATRIX-DIARY-2026-09-13.md` master matrix + `SHOW-BIBLE.md`). Remaining: execute the removal queue (🧊 **post-v1 only**); route Tier-1/2/4 into `plans/`; re-audit the held ribbons/corners zone; build out `OPERATIONS` as T3 lands.

## 🛠 LIVE HANDOFFS — the live briefs (dispatch layer)

> Honest labels (`DOC-CODE-COHERENCE §Landed-forensic`): `landed` = ancestor-of-HEAD + code-path-live · `eye-pending` = code-landed, unconfirmed on the lit app · `⚠️ NOT landed` = claimed but absent. The 12 landed/OBE/folded briefs are in `_archive/handoffs/` (dated).
>
> ⚠️ **Two different layers, two different homes.** `HANDOFF-*.md` (this table) live in the **gitignored `_handoffs/`** folder — local-only, not in git. Root **`BRIEF-*.md`** are git-tracked campaign briefs; when one lands it is captured below and **deleted** (git is its archive, `BOZ §3`).

### ✅ Retired BRIEFs — outcome captured; the file moves to `cartograph/_archive/`, dated (⚠️ early rows were DELETED and git holds those)

| Brief (deleted) | Outcome | Refs |
|---|---|---|
| **BRIEF-a-chain-end-in-a-roadway-is-a-T** | ✅ **LANDED 2026-10-28 (Kerf, `0cd45dac`, merged `67849da9`)** → `_archive/BRIEF-a-chain-end-in-a-roadway-is-a-T-LANDED-2026-10-28.md`. A chain end inside another street's roadway is a T at mintInputs (`chainJoins.mjs#joinChainEnds`). The (b′) ends and the join's override home stay open for Jacob. | `checks/claims-a-chain-end-in-a-roadway-is-a-node.mjs` |
| **BRIEF-the-balsa-model** | ✅ **LANDED 2026-10-28 (Plumb, `b1ef7373` + `adff5486`, merged `2c825dd4`)** → `_archive/BRIEF-the-balsa-model-LANDED-2026-10-28.md`. Hover deleted; the identity split SKIPPED by ruling `r-balsa-lands-its-rulings-not-the-identity-cut`. | `checks/claims-the-town-has-no-hover.mjs` |
| **BRIEF-phase2-C-identity-and-honest-bake** | ✅ **LANDED 2026-10-04 (Seal)** → `_archive/BRIEF-phase2-C-identity-and-honest-bake-DELIVERED-2026-10-04.md`. Authoring reads identity from source, Preview and the Ward from the baked manifest, which the bake now writes (`b8e0c3f8`, `639cf7a8`); one `tenantOf`/`titleOf` (`src/lib/townRecord.js`), re-exported through `Town.jsx` (Ward `9fe915e`, pin `0bf9ec49`); the bake refuses a missing/unreadable design and flat terrain, and a town's fields come from one file (`8e5706f4`); seeds strip other towns' values, Huron's parkTitlePos and LS's browse box removed from source (`05c76f49`, `41bb298a`); `manifest.json#files` lists only published files (`8849a0da`); Altadena has its own identity (`49fc9fde`). ⏳ **Remains, clears on re-bake:** `claims-no-town-carries-the-mould` red on BAKED `scene.json` (browse box, 4 towns) and Huron's `labels.json`; manifests list unpublished files until their next bake. Altadena needs a mark (Jacob) and a re-bake. The 6 identity fields await Ward readers as features land. | ▶ `claims-a-bake-reads-design-through-one-reader` · `claims-no-town-carries-the-mould` · `claims-the-ward-reads-what-the-manifest-bakes` |
| **BRIEF-runtime-continuity** | ✅ **DELIVERED 2026-10-04 (Thread)** → `_archive/BRIEF-runtime-continuity-DELIVERED-2026-10-04.md` (⭐ **holds Jacob's Phase 2 spec verbatim**, the authority for tranche 2). The continuity map is `scratch/runtime-continuity/MAP.md` (+ probes): every handoff Designer → Stage → Bake → Preview → the Ward, fields classed, duplicate authorities / reconstructions / silent substitutions / rot listed, `instance.js` answered, the camera traced, 9 checks proposed. Its rows became **tranche 2: four briefs, `docs/briefs/BRIEF-phase2-{A-where-am-i,B-camera-authority,C-identity-and-honest-bake,D-preview-parity-and-live}.md`** (A, C, D in parallel; B after A). Rulings it produced: the Ward is traced in full; the map switcher is out of Phase 2; `browseFrame` is wired; the Ward reads the baked identity fields. | ▶ `scratch/runtime-continuity/MAP.md` |
| **BRIEF-rename-hpdm-to-its-address** | ✅ **LANDED 2026-10-04 (Tamp)** → `_archive/BRIEF-rename-hpdm-to-its-address-DELIVERED-2026-10-04.md`. HPDM is `hipointedemun` end to end (map, Ward, slab, Look, instance), **promoted to hipointedemun.online**; 196 listing ids byte-identical; `staging/hipointe-demun/…` 301s by data (`staging/renamed.json`); the old staging slab is swept. ⭐ **The class it closed: every backend now keys a town by a sealed OPAQUE id** (`cartograph/data/<map>/town-id.json`, Jacob's ruling) across the Apps Script tenant (@71), Operations (D1 + publish key), the Ward and the kit; the listing prefix comes from the registry. Each town's data moved once, counts equal before and after. ⏳ `LEGACY_LOOK_TENANT` holds LS alone, until its cutover. ⚠️ Owed: `apps-script/Code.js`'s one-shot migration section says *"DELETE THIS SECTION once migrateToTownIds() has run clean"*, and it has. | ▶ `node checks/claims-a-town-has-one-sealed-id.mjs` · `node checks/claims-the-legacy-look-table-dies-at-ls-cutover.mjs` |
| **BRIEF-roundabout-is-one-ring** | ✅ **LANDED 2026-10-03 (Gyre, `d9f367cd`)** → `_archive/BRIEF-roundabout-is-one-ring-DELIVERED-2026-10-03.md`. `weldRoundabouts` (`skeleton.js`, `SKELETON §3` step 7c) welds OSM's `junction=roundabout|circular` pieces into one closed chain, plus implied `oneway`. HPDM: 8 one-ring + 1 service path; every island a ① block owned by its loop; Jacob's eye in Survey: *"RAs look good."* ⏳ **LS · altadena · lafayette-square-staging still print STALE** until each is re-skeletoned. ⚠️ Open, noted by Gyre: a NAMED split roundabout could be mis-paired as divided by `analyzePhases` (no current scene has one); A19's named half looks unbuilt. | ▶ `node checks/claims-a-roundabout-is-one-ring.mjs` |
| **BRIEF-hpdm-identity-lock** | ✅ **LANDED.** `fetch-msbf.js` now consults a per-scene **centroid-keyed registry** (`msbf-identity.js` — `loadRegistry`/`assignIds`/`saveRegistry`): a known footprint keeps its permanent id, a new one appends off a persisted `highWater`, a dropped one stays reserved. **Nothing is ever renumbered** — verified 13,427→8,460 footprints, zero renumbers, 9/9 checks. This is `EXTENT-DESIGN §6` step 2 and the thing between HPDM and "safe to hand a customer." | `ca2db7ca` + `8c1b65ae`; fact → `ARCHITECTURE §Extent` "THE IDENTITY LOCK" |
| **BRIEF-dead-end-leg-flip-and-slope** | ✅ **BOTH THREADS LANDED 2026-07-22.** (a) **cap SLOPE** — the transition quad was *hard-coded* to one arrangement, correct only for a treelawn-Y leg and painted backwards for a walk-at-curb one; now derived per shoulder from each end's RESOLVED materials, smoothstep-eased. *(This is why smoothstepping alone read pixel-identical the cycle before — the shape was wrong, not the edge.)* (b) **LEG flip** — two roots closed: the ribbon folds on itself at a dead end (v2 emitted one fe under one side token, 46/50 caps) and both legs share a centreline under a symmetric claim stroke. Legs responding **56 → 93 of 100**. (c) Found while verifying: **width collapse** — `tileGround.js:3216` wrote both directed keys, leaving 22/48 chains one-sided. **Open tail:** 7 legs unresponsive, 7 caps no-visible-change (pre-existing), 10 asymmetric caps ACCEPTED by Jacob's eye. | fact → `SECTION.md §6` / `RIBBONS.md`; successor thread = the MOUTH co-claim |
| **BRIEF-dead-end-mouth-junction** *(retired-in-place — file KEPT, not deleted)* | ⛔ **RETIRED 2026-07-22 into `cartograph/_archive/BRIEF-polygon-asks-the-stamp-2026-07-30.md`** — do not dispatch separately. The mouth stub is a **CO-CLAIM, not a gap** (~15 m²/mouth across 2 layers), so it is an *identity* defect, not a fill one; the junction-band cannot gate it. ⛔ **Never FILL-patch it.** ⚠️ Waverly (loop×loop, E2/E3) is a **different class** — the mouth fix won't touch it. ⚠️ **The file stays at root** because its §3 measurements are the **evidence appendix** the stamp brief (ARCHIVED 2026-07-30) cites (`cartograph/_archive/BRIEF-polygon-asks-the-stamp-2026-07-30.md §141`); deleting it would strand an open campaign. Retire it when the stamp brief lands. *(Its §4 fix direction IS superseded — read §3 only.)* | harness `scratch/cap-mouth-classify.mjs`; live thread → `cartograph/_archive/BRIEF-polygon-asks-the-stamp-2026-07-30.md` |
| **BRIEF-extent-excavation-and-design** | ✅ **DELIVERED** — produced both of its artifacts: **`_archive/EXTENT-EXCAVATION-DIARY-2026-09-13.md`** (the evidence layer, agent Marl) and **`EXTENT-DESIGN.md`** (the design of record, ratified with Jacob 2026-07-22). The brief is fully superseded by its own outputs. | → `EXTENT-DESIGN.md` (design) · `_archive/EXTENT-EXCAVATION-DIARY-2026-09-13.md` (evidence) |
| **BRIEF-coastal-hood** | ✅ **LANDED 2026-09-20**, eye-gated by Jacob on huron. All three DONE criteria met: the lake draws as a filled positive object, the land between the last street and the shore draws as land, and the waterfront streets are painted as streets. ⭐ **The ruling that closed it: the coast is a CHAIN, and the frame is the bb.** The coast had been an **area clip** — one owner for all 1,177 of its edges, `side:'right'`, no landward side — so nothing could meet it; a street carries 4 owners for 2 points. Now two objects: the closed ring is the lake face (shoreline + bb), the OPEN arc is expanded at ε like any chain. And the frame moved from the ink bbox to the bb, which is what actually closed it — Overpass returns whole ways, so the ink bbox was 20.6 km against the shoreline's 9.9 km and the coast ended **4.2 km short of the frame**. ▶ coastal streets bounded only by the exterior **43 → 0**; largest block **341.87 km² (the frame itself) → 5.04 km²**; asphalt rings **20 → 410**. ⛔ **CARRY THE FAILED CONSTRUCTIONS — six now, each cost hours:** ① water as a replacement boundary (inverted the SSoT, R15; 19 spurious perimeter blocks) · ② the coast stroked as a CLOSED ring (square → filled, circle → annulus, Lake Erie → 3 fragments — the open arc is the safe case and is what we stroke) · ③ water as a closed subject in the ink (becomes ink, does not partition) · ④ two-stage `rect − water` fed back as subject (Clipper returns a FLAT LIST; re-entering loses the hole's orientation and the frame silently refills) · ⑤ a separate `remainder` class (it is just a block) · ⑥ **the area clip with no landward side** (drew correctly and could not be met — the one that survived longest, because it looks right). ⚠️ **Open tail, none of it evident on screen:** the non-coastal re-pour check (`ROADMAP` H-4 — every town's ink spills past its bb), water SHADING (unblocked now the shape is confirmed), `MapLayers.jsx` water skip (`H-8`), colour for unparcelled land (tabled). | `00c6bfe2` → `616810e5` (code) + `86c3520a` (FEATURES); doctrine → `RIBBONS.md §1`; open → `ROADMAP` H-4 |
| **BRIEF-shadows-are-ls-sized** | ✅ **LANDED 2026-09-20/21** → `_archive/BRIEF-shadows-are-ls-sized-DELIVERED-2026-09-21.md`. Both defects closed: ① every in-shader-displaced caster carries a `customDepthMaterial` — ⛔ **never a regression, the shadow pass had NEVER been correct for one**, worst on the hilliest town and mildest on flat LS; ② the frustum, the bias pair and the softness unit all read from the town instead of from LS's 892 m. ⭐ **The transferable decision: texel-snapping the POSITION is only half the job — the SIZE must be quantised too**, or every shadow edge in the scene jumps to a new grid at the same instant (a whole-frame flash, not judder). ⚠️ **Eye gate OWED — `ROADMAP` H-14.** ⛔ The frame rate is not this and is open (`H-9`). | `3dcb5dd3` + `ff8cf53a`; doctrine → `ARCHITECTURE §8 Cast shadows`; knob → `OPERATIONS §Light & Shadow`; capability → `FEATURES.md` |
| **BRIEF-subtract-the-overlays** | ✅ **LANDED AND THEN SUPERSEDED THE SAME NIGHT** → `_archive/BRIEF-subtract-the-overlays-DELIVERED-2026-09-21.md`. The pairwise cut landed and was eye-gated (*"That did it and it looks great"*) — face ∩ overlay to zero above 1%, and the slab got **smaller** (1.59M → 1.42M tris). ⭐ Jacob then relocated it: *"press it all down"* on the way out of 2D, so `flattenPaintStack` does the whole stack and **the pairwise cut was DELETED, not kept beside it.** ⭐ Its own hard-won rule survives as doctrine: **a key joins the shared plane only on a measurement comparing it against EVERYTHING already on the plane.** ⚠️ Its one wrong call: `stripe` cut and **194 m² survived** — cause not established, `ROADMAP` H-10. | `d793e4d4` → `4c630ebc` → `5a0d8bb9`; doctrine → `ARCHITECTURE §8`; operator half → `OPERATIONS §Bake` |
| **BRIEF-two-bodies-two-lights** | ✅ **LANDED 2026-09-20** → `_archive/BRIEF-two-bodies-two-lights-DELIVERED-2026-09-21.md`. The sun→moon position lerp is deleted; two lights at two real body positions, brighter casts, and the drawn orb no longer inherits a phantom azimuth at 83× too close. The check was **written red first**, as the brief demanded. ⭐ **It went further than asked, on Jacob's ruling that every light needs an operator knob:** the fixed fills became hemispheres (irradiance-only), which makes the invariant assertable — **only the sun and the moon have a specular lobe, so a bright path on water is EVIDENCE OF A REAL BODY.** ⛔ Every "sun path" screenshot before that night was `floorDir`, a fill nailed due north in every town for all time. ⚠️ **Eye gate OWED at the crossover hour, and night will look different — `ROADMAP` H-15.** | `972803ba` (brief) → `d360d749` + `5e655ecc`; register → `ls/FEATURES.md`; check → `claims-the-key-light-is-a-real-body.mjs` |
| **BRIEF-canon-sweep** | ✅ **RUN 2026-07-23** (this sweep). §1 FEATURES+OPERATIONS and §2 the Extent accord closed; §3 retirals captured here; §4 dead-end fold + BACKLOG trim done. Key finding: the 2026-07-20 retraction had **never landed in the procedures** — only the banners. | `dd197e06` + this commit; writeup → `NOTES.md` 2026-07-23 |

| Brief | Arc | Status |
|---|---|---|
| **park-path-unify** | unify park-path ribbon construction/render | dispatch-ready 2026-06-27 (was orphaned — indexed 2026-06-30); detail `scratch/PARK-PATH-FORENSIC.md` |
| **preview-measurement** | publish-confidence instrument | device-profile SSoT landed; **real per-tier numbers = the gate** |
| **render-conformance** | Stage↔Preview↔Production parity | Ph1–3 landed; Ph4–7 open (cold-review) |
| **mobile-profile** | what ships to mobile (3 homes) | sensing done; B/C/E open (Preview-authored inclusion) |
| **channel-variant-cascade** | per-shot + per-platform channel values | design-doc first; **lands LAST** (highest convergence) |
| **authoring-session-hardening** | restore-where-left · safe bake · one camera home | Ph1–3 landed; Ph4 (camera) + Ph5 (docs) open |
| **section-perf** | the FILL re-stroke perf | #1/#2/toggle landed; drag-fluidity eye-pending. ⚠️ Brief lives at `cartograph/_archive/HANDOFF-section-perf.md` (not `_handoffs/`) |
| **dead-end-cap-wrap-curb** | curb break wrapping the round cap | ⚠️ **no brief file exists** (index-only row — not dispatchable until one is drafted, `BOZ §3`). Detector-flagged sub-8 m² clusters (2026-07-22), **NO visible symptom** on Jacob's eye; low pri |
| **curve-primitive-skeleton** | curves as beziers | Ph1/2.1 landed; **v2 (loops/divided) open** |
| **junction-construction** | intersection-everywhere | metadata spans every node; geometry divided-only |
| **band-fold-fix** | G12 thorn clamp | ⚠️ **NOT landed** (`8e1e414` stranded) |
| **freeze-the-curb-in-the-first-bake** | freeze the curb polygon | "d" instance landed; the freeze program PARKED (rebuild-gated) |
| **tile-T3-authoring** | authoring → Survey (off figure-ground) | open; gates T4 (delete figure-ground) + the rename |
| **tile-feature-ledger** | re-pour definition-of-done ledger | tracking; construction side ✅, T3/T4/slab-content open |
| **cloud-specialist** | cloud morphology renderer | TABLED (flagship IP; the agentic Tuner loop is the design — `meteorologist/TUNER.md`) |
