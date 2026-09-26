<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: Promote to Production puts a town on its own .online domain without touching any other town, and Lafayette Square's cutover from lafayette-square.com is either done or boarded with Jacob's ruling.
-->

# Production sites — each town on its own .online domain

**You are the dispatched agent. Name yourself — one word, yours.**
**Agent: FRESH** — the staging half was built by agents whose windows are closed; read what they left, don't recall it.

## The ask, and the rulings (Jacob, 2026-09-26)

*"We need to finish the maker's pipeline. We have the Publish to Staging button wired and working, we have
the domain info in the Operations utility, so now we need to link the Push to Production button to the
correct URLs."*

**Domains, ruled:**

| town | production domain | status |
|---|---|---|
| Lafayette Square | **`lafayettesquare.online`** (moving off `lafayette-square.com`, "to match the convention of everything else"; `.com` redirects to it) | owned |
| Hi-Pointe–DeMun | `hipointedemun.online` | owned |
| Provincetown | `provincetown.online` | owned |
| Huron | `huron.online` — **not bought yet**; stays on staging for now | not owned |

**The Works page (ruled the same day, on Boz's advice):** list **towns that are live**, each linking to its
production site. ⛔ Never publish the held-domain list or a "coming soon" address — it reads as squatting and
hands anyone a shopping list. Staging links stay unlisted (`BRIEF-a-link-per-town` ruling).

## Read first

- `docs/briefs/BRIEF-a-link-per-town.md` — the staging half and its rulings. **This brief is its breakage ④'s production half.** ⭐ The ruling to carry: *"the staging address belongs to The Ward; the production address belongs to the town."*
- `ROADMAP` **H-18** and **H-19** (anti-scraping: both prefixes move together), `SECURITY.md` **F-18**, `PUBLISH.md §6`, `SLAB-CONTRACT.md` (the top note on `ASSET_BASE`).

## Code sites

- `cartograph/serve.js` — `siteUrlsForLook` (already reads `src/instances/<map>.js#domain`; returns `null` with a reason when there is none), `POST /looks/<id>/promote` (today: upload the slab `--env=prod`, then **fast-forward `main`**), `POST /looks/<id>/publish` (runs `scripts/publish-player-to-staging.mjs`), `ASSET_ENV_PREFIX`.
- `workers/staging-sites/` — one Worker, **one shared player**, town read from the first path segment, no table of towns, no fallback across towns. ⭐ The production twin should have the same shape.
- `src/instances/{lafayette-square,hipointe-demun,huron,provincetown}.js` — `domain`; `src/instance.js#readLookParam` (how the player picks its town — production will need the town from the **host name**, not the path).
- `src/preview/PreviewApp.jsx` — `promoteProd`, `targetRow('prod', …)`.
- `.github/workflows/deploy.yml` — Lafayette Square's current GitHub Pages production.
- **The Operations utility's domain records** live in the `theward-operations` repo, outside this one. ⛔ Ask Jacob for the path; don't guess, and don't copy its data into this repo — read it, or have Promote read it.

## ⛔ Stop conditions you must respect

- **Promote today pushes this branch to `main`, which is ~646 commits ahead.** Do not press it, and do not run the endpoint, for any town, while building this. A production deploy plan for `main` is owed separately (`ROADMAP` status block).
- **Lafayette Square goes last** (`ROADMAP` ordering: "move LS's plumbing last … never the night before a demo"). Build and prove the path on Provincetown or HPDM first.
- `lafayette-square.com` is live production. ✅ **RULED 2026-09-26 (Jacob): at cutover it REDIRECTS to `lafayettesquare.online`** (a permanent redirect that keeps the path, so old links and QR codes still land). ⛔ The redirect goes live only once `lafayettesquare.online` is serving and Jacob has seen it — never before, and it is part of the Lafayette Square step, which is last.

## The shape to confirm with Jacob before building

A production Worker that mirrors `staging-sites`: each town's `.online` domain bound to it as a custom
domain; the town resolved from the host name via a record the Promote step writes (no town list in code, so
town #N needs no deploy); the same player build; slabs from the `prod` key space. Promote becomes
per-town — shipping Provincetown touches nothing else — and stops depending on `main`. ⚠️ The 66 Ward zones
were added to Cloudflare on 2026-09-26 and were still activating; check a zone's status before binding.

## The chain

Upstream you trust: the baked slab in R2 and the published player. Downstream that trusts you: a partner or
visitor at the town's domain, and the Works page. A wrong mapping shows one town another town's map — the
Layer 0 q2 failure — so a host with no record must 404 by name, never fall through.

## Can the instrument see it?

`curl` each production domain and read back which town's `scene.json` it loaded; the Publish panel must
print the URL it actually shipped to (never a constant). Then Jacob opens each in a browser.

## Bounds

- Write in `workers/` (a new production Worker), `cartograph/serve.js` (promote), `src/preview/PreviewApp.jsx` (the button), `src/instances/*.js` (`domain`), `scripts/` (the prod publish). Cloudflare changes (routes, custom domains) are Jacob's to approve before you run them.
- Canon: `PUBLISH.md` and `OPERATIONS.md` (the knob), `FEATURES.md` if the capability is new to them, and a `ROADMAP` H-18 line. Retire what you supersede to the Diary.
- Commit messages name the register reached.

**The instruction is confirm-then-build:** read the canon and the code, tell Jacob what you found, and if
the code contradicts this brief — stop and flag him.
