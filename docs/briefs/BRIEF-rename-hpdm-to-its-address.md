<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-27
evict-when: the map, its Ward, its slab, its look and its instance module are all named `hipointedemun`; `staging.theward.online/hipointe-demun/` redirects; HPDM's listing ids are unchanged; and Promote has put it on hipointedemun.online.
-->

# Rename Hi-Pointe–DeMun to its address: `hipointe-demun` → `hipointedemun`

**Name yourself — one word, yours. Agent: FRESH.** ⛔ **Before its first Promote, and not before Boz boards it.**

## The ruling (Jacob, 2026-09-27)

*"I'd rather the map be called what its actual URL is for clarity sake."* ⇒ **A town's name is its address.**
The Ward's id, the map's id and the name before the dot of its domain are one name
(`provincetown.online` → `provincetown`). Operations already works this way (theward-operations
`76865b7`: the Ward id *is* the map id; there is no Map id field). HPDM is one of the two towns that
predate the rule: its map is `hipointe-demun`, its address `hipointedemun.online`. ⛔ Promote refuses it
until this lands. It looks the Ward up by the map's name, and the Ward is named `hipointe-demun` today,
so it would find the Ward and ship to the right domain, but under the wrong name forever.

## What moves (▶ re-derive; never quote a count)

- `git grep -l -- hipointe-demun` lists every tracked file that names it. The live ones: `cartograph/data/hipointe-demun/`
  (raw, clean, content), `public/looks/hipointe-demun/`, `public/looks/index.json`, `src/instances/hipointe-demun.js`
  and its registry entry, `src/instance.js`, and a handful under `src/` and `cartograph/`.
  `cartograph/_archive/` and `docs/briefs/` are history. ⛔ Don't rewrite history; repoint only live references.
- **The slab in R2**: `staging/baked/hipointe-demun/` → `staging/baked/hipointedemun/` (re-bake and upload
  under the new name, then verify with `scripts/verify-baked-in-r2.mjs`). There's no production copy yet.
- **Operations**: the Ward `hipointe-demun` → `hipointedemun`. A Ward's id can't be edited, so this is a
  new record with the old one's data, plus its listings' `ward` field (`hpdm-lst-*` records name their
  Ward). It's an Operations write, so Jacob approves it.

## ⛔ What must NOT move: the listing ids

`cartograph/bake-content.js` derives a town's listing prefix from its map name, with this town special-cased:
`scene.split('-')[0] === 'hipointe' ? 'hpdm' : scene.slice(0, 4)`. Renamed naively, new HPDM listings
would get `hipo-lst-*` beside the sealed `hpdm-lst-*`, and Operations keys Host edits by listing id.
⭐ **Fix the class, not the instance.** That line is a town's name hard-coded in kit code (`CLAUDE.md`
Layer 0 q1). Make the prefix recorded in the town's sealed registry (`listing-identity.json`) and read back
from it, set once when the registry is first sealed, so a rename can never change it. ▶ A check that
fails if a listing's prefix differs from its registry's.

## The redirect: partners may hold the old staging address

Staging links are *"unlisted, but durable"* (`BRIEF-a-link-per-town` §3: a partner returns months later).
`staging.theward.online/hipointe-demun/…` must 301 to `…/hipointedemun/…`, keeping the path. ⭐ Put it
in `workers/staging-sites` as **data, not a town list**: a small R2 record of former names
(`staging/renamed.json` → `{ "hipointe-demun": "hipointedemun" }`) written by the rename, read by the
Worker, so the next rename needs no deploy. ⛔ A redirect to a name with no slab is a 404 that names both.

## Can the instrument see it?

`curl -sI https://staging.theward.online/hipointe-demun/place/x` → 301 to `/hipointedemun/place/x`.
`curl -s https://staging.theward.online/hipointedemun/ | grep ward-domain` → `hipointedemun.online`.
The Operations production-domain read for `hipointedemun` → owned and active. HPDM's listing ids are
byte-identical before and after (diff the `id` column of `content/listings.json`). Then Jacob opens the
staging site.

## Bounds

The renamed paths above, `cartograph/bake-content.js` (the prefix), `workers/staging-sites/` (the
redirect), and a check. Operations and R2 writes are Jacob's to approve. Commit messages name the
register (`OPERATIONS § Production sites` already states the rule and this job).
