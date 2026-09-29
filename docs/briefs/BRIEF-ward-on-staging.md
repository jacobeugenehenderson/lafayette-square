<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-28
evict-when: every town's staging site plays the player its R2 record names; a town with no record returns a 404 that names it; the renderer's own assets load on staging from a versioned kit bundle the page names; and the Ward's staging dry-run passes against it
-->

# BRIEF — Put The Ward on staging: the per-town player switch and the kit bundle

**You are the dispatched agent. Name yourself — one word, yours, and not one a RUNNING session holds**
(check `ListAgents`, then ask Jacob to `/rename`). **Agent: FRESH** — this is new kit code on the
staging-site layer, and no running session holds its context. **You build in this repo (the kit).** You
read `~/Desktop/dev.nosync/theward`, and you never write there. Report to **Boz**. **Warden** coordinates
the Ward side and is the counterparty for the interface.

**Instruction: confirm, then build.** Read the docs and the code below and tell Boz what you found. If
the code contradicts this brief, **stop and flag it** — that stop is a deliverable.

---

## 0. Why this exists

The Ward (the new player, `theward` repo) replaces this repo's player at cutover (`ROADMAP` "⏱ WHERE THE
WORK STANDS — 2026-09-28"). Its staging publish (`theward` commit `52ab1cc`) was built against two kit
pieces that the Ward's `OPERATIONS.md` (lines ~140–145) describes as existing. **Neither was ever built**
(Boz verified this 2026-09-28: no file, no history on any branch, no mention outside `scratch/`):

1. **The per-town player switch** — `scripts/set-staging-player.mjs --map=<map> --player=ward`, which
   writes `staging/sites/<map>/player.json`.
2. **The kit bundle** — the renderer's own files published under `kit/<kit-sha>/` and served at
   `/_ward/<sha>/`, with the page naming them in `<meta name="ward-kit-base">`.

Until both exist, no town on staging can draw inside the Ward. **Nothing in the Ward's code calls either
name yet** (Warden, 2026-09-28), so you are defining the kit's half of an agreed interface, not chasing a
caller.

## 1. Rulings you build to

- **Every town goes to the Ward on staging — no holdout** (Jacob, 2026-09-28, via Warden).
- **The switch is a per-town record in R2, and no record is an error** — never a default player. This is
  the design Tamp and Quire agreed on 2026-09-28; nobody wrote the script. It is `CLAUDE.md` Layer 0 q2:
  a town silently served the wrong player is the plausible-looking success this repo forbids.
- **No list of towns anywhere** — not in the Worker, not in the scripts. The map id comes from the path
  and becomes an R2 prefix (the Worker's own header states this rule; keep it).
- **The renderer's assets are the renderer's** (`BRIEF-slab-loading.md` §⑥b): publish them as a
  **versioned** bundle on the asset host, read through the asset base, and pinned by the host page.
- Promote, DNS, Cloudflare and `wrangler` deploys are **Jacob's buttons**. You build and dry-run; he
  publishes.

## 2. Read first — to the section

- `BRIEF-slab-loading.md` **§⑥b** (the renderer's own assets) and **§⑥** (`design.json` leaves the
  runtime — **not in scope here**; note it and leave it).
- `ROADMAP.md` **H-18** (one staging site per map, `staging.theward.online/<map>/`, and why the address
  belongs to the Ward).
- The Ward's `README.md` §7 (loading) and §9 (what "finished" means), and its `OPERATIONS.md`, the
  staging section (~lines 130–150) — read only.
- `CLAUDE.md` Layer 0.

## 3. The code

- **`workers/staging-sites/src/index.js`** — `fetch()`. Today it serves `/_player/<file>` from
  `PLAYER_PREFIX`, `/<map>/…` from the one player's `index.html` behind a `staging/baked/<map>/manifest.json`
  existence check, and `shareCard()`. **This is where the switch is honoured.**
- **`workers/staging-sites/wrangler.jsonc`** — the bindings (`ASSETS`, `PLAYER_PREFIX`, `SITE_PREFIX`,
  `SLAB_BASE`).
- **`scripts/publish-player-to-staging.mjs`** — the old player's one-build publish (`--base=/_player/`,
  ships only what git tracks). It is the model for the kit-bundle publish.
- **`scripts/upload-baked-to-r2.mjs`** — the slab upload (the sibling prefix).
- The Ward's publish: `theward/scripts/publish-staging.mjs` — **read its header** for where it puts the
  Ward build and what it expects from the kit. Confirm the prefixes against it; don't invent them.
- The renderer's asset fetches through `BASE_URL`: `basis/`, `clouds/*.json`, `models/lamp-posts/…`,
  `textures/{moon.jpg,milky_way.jpg,buildings/*}` (§⑥b lists them). `grep -rn "BASE_URL" src/` finds them.

## 4. The job

1. **The switch script** (`scripts/set-staging-player.mjs --map=<map> --player=ward|legacy`, plus
   `--dry-run`). It writes `staging/sites/<map>/player.json`. It **refuses** a map with no staging slab,
   and it refuses an unknown player value. ⛔ No `--all` built on a hard-coded list; if a sweep is wanted,
   enumerate from `public/looks/index.json`, the way `checks/_scenes.mjs` does.
2. **The Worker honours it.** For `/<map>/…`, read the record: `ward` serves the Ward's document and
   assets; `legacy` serves today's `/_player/` path. **No record means a 404 that names the map and
   the missing record** — never a default. Keep the existing slab-existence 404 and `shareCard()`
   behaviour for both players.
3. **The kit bundle.** Publish the renderer's own assets once per kit revision under `kit/<kit-sha>/`
   (immutable, cached hard). Serve them at `/_ward/<sha>/`. Whatever writes the Ward's document names the
   pinned sha in `<meta name="ward-kit-base">`. **Settle with Warden which side stamps that meta** before
   you build it, and tell Boz. The kit sha is a git commit, never a date or a counter.
4. **Dry-run end to end** against one town, with no deploy: the record, the routed paths and the bundle
   manifest, all printed.

⛔ **Out of scope:** `design.json` leaving the runtime (§⑥), manifest v1 (`BRIEF-slab-loading` step 3),
the two `INSTANCE` loaders (`src/data/buildings.js`, `src/hooks/useListings.js`), Promote and production.
If one of them turns out to block you, **surface it to Boz; don't absorb it.**

## 5. The chain

- **Trusts:** the slab under `staging/baked/<map>/` (from `upload-baked-to-r2.mjs`); the Ward build under
  whatever prefix `theward/scripts/publish-staging.mjs` uses; `public/looks/index.json` as the roster.
- **Trusted by:** the Ward on staging, then **Promote** at cutover (`cartograph/serve.js`
  `siteUrlsForLook`, `scripts/promote-player-to-prod.mjs`) — read Promote's handling of the old player
  so the switch doesn't strand production.
- ⭐ The cross-topic constraint (a town may not fall back to another player or town) belongs in a
  **check**, not in prose: add `checks/claims-a-staging-town-names-its-player.mjs` (or extend an existing
  staging check if one fits). It asserts that the Worker has no default branch and no town list. Watch
  it fail before you trust it: mutation-test by adding a default.

## 6. Can the instrument see it?

The Worker runs remotely. Test it locally with `wrangler dev` (or through Miniflare, if the repo already
uses it) against a local R2. A check that reads only the source proves the shape, not the behaviour; you
need both. On staging, after Jacob deploys:
`curl -s https://staging.theward.online/<map>/ | grep ward-kit-base` names a sha, and that sha's
`/_ward/<sha>/basis/…` returns 200. A map with no record returns a 404 that names it.

## 7. Bounds

You write: `workers/staging-sites/**`, the new script, the kit-bundle publish (a new script, or a mode
of `publish-player-to-staging.mjs` — your call, say why), the check, and `cartograph/OPERATIONS.md`
(the knobs: the switch and the bundle). No `wrangler deploy`, no R2 writes outside `--dry-run`, no push.
The commit message names the register it reached. When the Ward's `OPERATIONS.md` needs to change to
match, tell Warden. Don't edit it.

⭐ **Every fix is in three parts** (`CLAUDE.md`): the code, the register, and the superseded words
removed. The old `/_player/` path stays until cutover because `legacy` still needs it. Its removal is the
cutover's work (Ward README §9), not yours. Say so in the commit.

## 8. Validation surface

This is the staging site itself (through `wrangler dev` locally), and the Ward's own
`npm run publish:staging -- --dry-run`. ⛔ Don't build a parallel harness that bypasses the Worker.
