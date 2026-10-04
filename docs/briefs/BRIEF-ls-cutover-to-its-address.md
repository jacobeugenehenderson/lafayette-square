<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-27
evict-when: Lafayette Square is the map `lafayettesquare`, served at lafayettesquare.online by Promote; lafayette-square.com 301s to it with paths kept (old links land); and GitHub Pages production is retired.
-->

# Lafayette Square's cutover: `lafayette-square` → `lafayettesquare`, on lafayettesquare.online

**Name yourself — one word, yours. Agent: FRESH.** ⛔ **Last of all the towns** (`ROADMAP`: *"move LS's
plumbing last … never the night before a demo"*), after `BRIEF-rename-hpdm-to-its-address` has landed and
proven the rename path, and not before Boz boards it.

## The rulings (Jacob, 2026-09-26 and -27)

- **A town's name is its address.** `lafayettesquare.online` (owned, zone active) → map, Ward and look
  `lafayettesquare`. Same rule and same mechanics as the HPDM rename. Reuse that brief's redirect record
  and listing-prefix fix; ⛔ don't rebuild them.
- **`lafayette-square.com` redirects to `lafayettesquare.online`**, a permanent redirect that **keeps the
  path**, so old links and shared URLs still land. *(No cards or QR codes have been printed — Jacob, 2026-10-04 — so this protects links, not paper.)* ⛔ Only once `lafayettesquare.online` is serving and
  Jacob has seen it. Never before.

## Why this is bigger than HPDM (▶ `git grep -l -- lafayette-square`)

Lafayette Square is installation #1, so its name is the **default** in places no other town's is:
`src/instance.js#DEFAULT_LOOK`, `src/instances/registry.js#DEFAULT_MAP` (and the `lafayette-square-staging`
look that maps to it), `cartograph/config.js`, Cary's Supabase functions, Meteorologist's pipeline schemas,
and `index.html`'s static share tags. ⭐ Each is a question before it's an edit. **Is it the town's
name, or a default that should not name any town?** (`CLAUDE.md` Layer 0, and `BRIEF-ls-bleed-excision`.)
A default that merely changes spelling is the same bleed with a new name.

## The cutover, in order

1. **Rename** (as HPDM): data, look, instance module, registry, R2 slab (staging), the staging redirect
   `lafayette-square` → `lafayettesquare`. Listing ids unchanged.
2. **Operations**: the Ward's Domain `lafayette-square.com` → `lafayettesquare.online`, one edited value.
   That is also what renames the town in Operations (its name is read from the Domain).
3. **The switch in code**: delete `src/instances/lafayette-square.js#domain`. It is the one legacy line
   that makes Promote refuse Lafayette Square and makes its QR codes read `.com`
   (`src/lib/townOrigin.js`, `cartograph/serve.js#siteUrlsForLook`). ⚠️ From that commit, new QR codes
   read `lafayettesquare.online`.
4. **Publish to Staging → Promote.** Promote binds the domain and `www.` itself. Jacob opens the site.
5. **Only then, the redirect**: `lafayette-square.com` (and `www.`) → `https://lafayettesquare.online/<same
   path>`, e.g. a Cloudflare redirect rule on the `.com` zone. ▶ Check each card-route path:
   `/checkin/<id>`, `/claim/<id>/<secret>`, `/place/<id>`, `/link/<token>` — each must 301 to the same path
   on `.online` and open the right page there.
6. **Retire what served `.com`**: `.github/workflows/deploy.yml`, `public/CNAME`, `PUBLISH.md §1` (to the
   Diary), the bucket CORS entries for `lafayette-square.com`, and the `main` branch's role as production.
   ⛔ Nothing is pushed to `main` as part of this. **And the Apps Script's `LEGACY_LOOK_TENANT`** (the one
   look it still translates, for `main`'s player) with `resolveTenant`'s `look` argument: drafted, Jacob
   deploys. ▶ `node checks/claims-the-legacy-look-table-dies-at-ls-cutover.mjs` fails until it is gone.
   *(LS's backend is keyed by its sealed id since 2026-10-04, so renaming the map moves no data.)*

## Can the instrument see it?

`curl -s https://lafayettesquare.online/ | grep ward-look` → `lafayettesquare`. `curl -sI
https://lafayette-square.com/place/x` → 301 to `https://lafayettesquare.online/place/x`. The listing ids are
byte-identical before and after. Promote's own proof step passes. Then Jacob opens both addresses.

## Bounds

The rename paths, the defaults above (each ruled on, not re-spelled), the legacy `domain` line, the `.com`
redirect (a Cloudflare change, Jacob's to approve), and the retirements in step 6. Commit messages name the
register reached (`PUBLISH`, `OPERATIONS § Production sites`, `FEATURES`).
