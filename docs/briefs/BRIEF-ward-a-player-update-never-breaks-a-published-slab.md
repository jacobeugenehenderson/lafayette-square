# BRIEF — a player update never breaks a published slab (the Ward)

**Owner:** Ward. **Reviewer:** Zob (co-sign below; DRAFT until it is). **Repo:** `~/Desktop/dev.nosync/theward` only.

1. **You are the dispatched agent. Name yourself:** one word, yours, and not one a running session holds (check with
   `ListAgents`, then `/rename`).
2. **Agent: FRESH.**

⛔ **DISPATCH ONLY WHEN** Zob has co-signed and Boz has answered Q1 and Q2 below.

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
  town directly"; the towns records are per town (`src/lib/townsRecordKeys.js`, Boz's ruling C); the production Worker
  reads `hosts/<host>.json` and holds no table. So the published set is only an R2 key listing (`hosts/`,
  `staging/sites/`). This seat has no R2 credentials.
- **Cache:** a manifest is served `no-cache`; `content/events.json` (an unhashed path) `public, max-age=300,
  must-revalidate`.
- How checks load a town today: `checks/devTown.mjs#devTowns` reads `looks/index.json` from `WARD_ASSET_BASE` (:5173,
  the kit's dev server). Placard's `checks/a-refused-layer-is-named.mjs` reads the sink through the page's own module
  URL.

## Open, for Boz (kit intent)

- **Q1, the list's source.** Ward's proposal: the check lists `hosts/*.json` and `staging/sites/*/` with a
  READ-ONLY R2 token from `.env.local` (`WARD_R2_READ_*`; Jacob mints it). No token, or a listing error → NOT CHECKED,
  with words. ⛔ Never a typed list of towns (town #5 would go unchecked, and nobody would know).
- **Q2, a slab with no `displays`.** Is it a town with no channel (draw nothing, no refusal), or a refusal? The second
  mutant below depends on the answer.

## The work

1. **`checks/a-player-update-never-breaks-a-published-slab.mjs`**, wired into `run.mjs` and into
   `publish:staging`'s preflight (and named in OPERATIONS as the gate before Promote). The candidate is the build the
   main checkout serves on :5180.
2. **For each published slab** (staging `<map>`, and production `<domain>` → its record's look), a FRESH page load of
   `:5180/<map>/` (one browser, one page at a time: the heavy slot). The check routes the page's asset-base requests by
   CDP `Fetch` interception to the host, fetches them in Node, and fulfils them. The bytes are the published ones,
   unmodified (drop `content-encoding` from the response, since Node has already decoded the body). ⛔ No hook in src,
   and no edit to `.env.local` during the run.
3. **RED on any** of: a sink entry for the town (read through the page's module URL, as Placard's check does); the
   scene error screen (`role="alert"`); a console `⛔`; the town not drawn within the budget (a stated number, with its
   reason in the source). **Green** only when every listed slab loaded clean. A host that doesn't answer is NOT
   CHECKED for that slab, named, and the whole run exits 2 unless something is red. ⛔ Never green by omission.
4. **It proves its own reach:** per slab, report the bytes fetched through the intercept and the manifest etag. A slab
   whose page fetched nothing from the host is NOT CHECKED (the intercept missed it), not green.
5. **Mutants**, by the intercept rewriting served bytes (never by editing src):
   - Tinsel's: drop one show from a town's channel. The check asserts the show count the page schedules equals the
     count in the slab's own channel data, read from the bytes and never a constant. It must go RED.
   - `displays` deleted from a slab's scene data: RED or green per Q2, and say which.
   - A slab's `manifest.json` with its drawer index removed (tonight's PTown shape before the republish) must go RED.
   Report each line.

## Bounds

- A branch `ward/a-player-update-never-breaks-a-published-slab` off `ward-pin/2026-11-01`; `git commit -- <paths>`.
  ⛔ No kit edits. ⛔ No publish. ⛔ No R2 write path in the check (a read-only token, and the code holds no put).
- The commit names its register (OPERATIONS: the release gate) or says "Reaches no register."
- The heavy slot: take `.claude/heavy-slot.lock` only if it's absent, and delete it when done. `--mutants` only when
  Jacob isn't on :5180.
- **Out of bounds, surface it:** the kit assets (textures, basis) come from :5173 (integration), not the bundle the
  candidate will ship, which is a standing gap for every Ward check. And the H-19 gate, once built, may refuse a Node
  fetch.

**Confirm, then build:** read the Worker, the records' keys and the Ward's checks, then tell Ward what you found. If
they contradict this brief, stop and flag.

## Zob's co-sign

*(pending)*
