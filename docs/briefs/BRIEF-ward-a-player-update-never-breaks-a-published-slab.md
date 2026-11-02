# BRIEF — a player update never breaks a published slab (the Ward)

**Owner:** Ward. **Reviewer:** Zob (co-sign below). **Repo:** `~/Desktop/dev.nosync/theward` only.

1. **You are the dispatched agent. Name yourself:** one word, yours, and not one a running session holds (check with
   `ListAgents`, then `/rename`).
2. **Agent: FRESH.**

⛔ **DISPATCH ONLY WHEN** Tinsel's reader for pre-display slabs (Boz, 2026-11-02, below) has merged and the Ward's pin
carries it. Boz names the commit.

## The ruling

Adopted by Jacob, 2026-11-01, via Boz: *"a player update never breaks a published slab"*. Before a player is
published, the candidate build loads every slab that is published now, on staging and in production, and the release
waits on the result. Tonight's case: PTown's production slab was poured before the drawer index, and the player it
was promoted with refused its display (the taint, fixed by the kit's `rasterFrame`). Nothing ran the new player
against the old slab before the press.

## The premise (measured by Ward, 2026-11-02 04:20Z, theward `4e4e096`, ward-kit `ea8bd519`; confirm it)

- **No cross-origin read.** With `Origin: http://localhost:5180`, the production slabs
  (`https://<domain>/baked/<look>/manifest.json`) and the staging slabs (`https://assets.theward.online/staging/baked/…`)
  answer 200 with NO `access-control-allow-origin`. That's by design: the production slab is same-origin
  (`workers/production-sites/src/index.js`, "no per-town CORS", and the H-19 anti-scraping gate will sit there). So
  :5180 can't simply point `WARD_ASSET_BASE` at a host.
- **No public list of published towns.** `looks/index.json` is 404 on both sides; the staging root says "address a
  town directly"; the towns records are per town (`src/lib/townsRecordKeys.js`); the production Worker reads
  `hosts/<host>.json` and holds no table. The per-town records answer publicly: `staging/sites/<map>/player.json` and
  `hosts/<domain>.json` on `assets.theward.online` are 200 for the registered towns.
- **Cache:** a manifest is served `no-cache`; `content/events.json` (an unhashed path) `public, max-age=300,
  must-revalidate`.
- How checks load a town today: `checks/devTown.mjs#devTowns` reads `looks/index.json` from `WARD_ASSET_BASE` (:5173,
  the kit's dev server). Placard's `checks/a-refused-layer-is-named.mjs` reads the sink through the page's own module
  URL.

## Rulings

- **The town list (Boz, 2026-11-02):** the kit's instance registry, in git (`src/instances/registry.js#registeredMaps`,
  which `scripts/towns-record.mjs` reads), never an R2 listing and never a typed list. For each registered town:
  - staging: GET `staging/sites/<map>/player.json`. A 404 is "not published to staging", stated per town.
  - production: the town's domain from Operations (`cartograph/operations-domain.mjs`, through the publisher's Access
    service token, kit `cartograph/OPERATIONS.md` "Machine setup"; read from the environment, never written to disk),
    then GET `hosts/<domain>.json`. A town that answers neither is listed as unpublished.
  - NOT CHECKED only if the registry or Operations can't be read (the token absent included), with words.
- **An old slab plays (Boz, 2026-11-02, from Jacob's ruling):** a slab written before the `displays` block is a town
  with no displays, and plays. What ships at `ea8bd519` refuses it instead (Zob, read in `src/displays/Displays.jsx`:
  a display the identity declares with no channel in `scene.json` refuses "…baked before displays had one: re-bake
  the Look's scene"). That refusal is the violation, and the kit fix is Tinsel's, hence the dispatch gate above.
  - **Version-gated, never a default (Zob, 2026-11-02):** a `scene.json` with NO `displays` key is the pre-display
    version, and each declared display gets what the bake gives a Look with no channel for it
    (`showChannel.js#displayChannelsFor`, the same function). A `displays` key that lacks a declared display's id is
    an inconsistent slab and stays a refusal by name. The reader is one named function, and the check plants both.
- **Any sink entry on a live slab is RED (Boz, 2026-11-02, reading (ii)):** under Jacob's rule, a town showing "this
  isn't drawn" counts as broken, however honest the notice. The fix is that town's republish before the player release
  goes out; Boz sequences it. No drawer-version verdict is needed: the check covers only what is published now. (PTown's
  pre-drawer slab isn't live: both of its manifests carry `displays.<id>.drawer`, measured by Ward 2026-11-02.)

- **A break is a REGRESSION (Boz, 2026-11-02, from Tinsel's Huron read):** a console `⛔` that the LIVE player already
  produces on the same slab is a standing disclosure (Huron: `[BakedGround] ⛔ "huron": surface "sand" is drawn WITHOUT
  rippleSpacingM…`, kit `BakedGround.jsx`, absent and not defaulted, by design). It is LISTED, not red. Red is a `⛔` the
  candidate produces that the live player doesn't, on the same slab. ⛔ The baseline is a run, never a list of known
  messages (that's a skip list). Ward's reading, pending Boz: a SINK entry stays red outright under (ii), because a
  standing "isn't drawn" on a live town is the breakage (ii) names, so the diff covers console `⛔` only.

## The work

1. **`checks/a-player-update-never-breaks-a-published-slab.mjs`**, wired into `run.mjs` and into
   `publish:staging`'s preflight (and named in OPERATIONS as the gate before Promote). The candidate is the build the
   main checkout serves on :5180.
2. **For each published slab** (staging `<map>`, and production `<domain>` → its record's look), a FRESH page load of
   `:5180/<map>/` (one browser, one page at a time: the heavy slot). The check routes **the slab's paths only**
   (`baked/<look>/…`, and `content/…` as the manifest names them) by CDP `Fetch` interception to the published host,
   fetches them in Node, and fulfils them. The bytes are the published ones, unmodified (drop `content-encoding`, since
   Node has already decoded the body). ⛔ The kit's own assets (textures, basis, clouds: `vite.config.js`
   `RENDERER_ASSETS`) are left alone, or a path the host doesn't serve reads as the slab's failure. ⛔ No hook in src,
   and no edit to `.env.local` during the run.
3. **RED on any** of: a sink entry for the town (read through the page's module URL, as Placard's check does); the
   scene error screen (`role="alert"`); a console `⛔` from the town's own layers or slab that the
   baseline (5) doesn't produce; the town not drawn within the budget (a stated number, with its
   reason in the source). **Green** only when no listed slab shows a red; standing `⛔` lines are listed beside it. A host that doesn't answer is NOT
   CHECKED for that slab, named, and the whole run exits 2 unless something is red. ⛔ Never green by omission.
   - **A `⛔` is attributed** to the request or module that raised it. A `⛔` from a failure at a non-slab ORIGIN (the
     weather feed, wind tiles, a third party) makes that slab NOT CHECKED with the origin named, never red or green.
     ⛔ No exemption by name (a skip list). The rule is stated in the check's header.
   - **Every green line names the kit gap:** "kit assets from :5173 (<sha>), not the bundle that ships".
4. **It proves its own reach:** per slab, report the slab bytes fetched through the intercept, the manifest etag, and
   the count of kit requests left untouched. A slab whose page fetched nothing from the host is NOT CHECKED (the
   intercept missed it), not green.
5. **The baseline run:** for each slab, the LIVE player on its own page (`https://<domain>/`, or
   `https://staging.theward.online/<map>/`) is the same slab under the published build and kit, same-origin, through the
   same intercept as a pass-through (so a mutant can be served to both runs). Collect its attributed `⛔` lines the same way. Diff by key = (the module tag, e.g. `[BakedGround]`, and
   the message with numbers masked); state the key in the check's header. A wording change between pins reads as new,
   so it's RED, which is the safe side. A live page that doesn't load is NOT CHECKED for that slab, named. Each line
   reports both builds' shas.
6. **Mutants**, by the intercept rewriting served bytes (never by editing src):
   - Tinsel's: drop one show from a town's channel. The check asserts the shows the page schedules equal what the
     kit's own engine gives for the slab's channel (`engine.js#showtimesOn` and `displayAt`, imported from ward-kit,
     the same module the page runs), never a copy of the schedule rule and never a constant. It must go RED.
   - **An old slab plays:** `displays` deleted from a display town's `scene.json` (PTown's 10-29 shape). It must
     load clean, with no sink entry. Run it once at `ea8bd519` first and report the RED: that's the violation the kit
     fix closes.
   - A `⛔` planted only in the candidate's run (through the intercept: a slab byte change the live run doesn't see)
     must go RED; the same change served to both runs must be listed as standing, not red.
   - A slab's `manifest.json` with its drawer index removed (tonight's PTown shape before the republish) must go RED.
   Report each line.

## Bounds

- A branch `ward/a-player-update-never-breaks-a-published-slab` off `ward-pin/2026-11-01`; `git commit -- <paths>`.
  ⛔ No kit edits. ⛔ No publish. ⛔ No R2 write path in the check (a read-only token, and the code holds no put).
- The commit names its register (OPERATIONS: the release gate) or says "Reaches no register."
- The heavy slot: take `.claude/heavy-slot.lock` only if it's absent, and delete it when done. `--mutants` only when
  Jacob isn't on :5180.
- **Out of bounds, surface it:** the H-19 gate, once built, may refuse a Node fetch.

**Confirm, then build:** read the Worker, the records' keys and the Ward's checks, then tell Ward what you found. If
they contradict this brief, stop and flag.

## Zob's co-sign

Zob, 2026-11-02: co-signed at integration 09a4c8ae; Q2 answered from Displays.jsx (a display town with no channel
refuses at ea8bd519); conditions 1–4 (the slab is routed and the kit is not; the show count from the kit's engine; a
⛔ attributed by origin; the kit gap named in every green).
