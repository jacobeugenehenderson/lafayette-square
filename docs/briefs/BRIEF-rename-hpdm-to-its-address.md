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
The map's name is the name before the dot of its Ward's Domain in Operations (`provincetown.online` →
`provincetown`). Operations reads it that way (theward-operations `100f2b8`; there is no Map id field).
HPDM is one of the two towns that predate the rule: its map is `hipointe-demun`, its address
`hipointedemun.online`. ⛔ Until this lands, Promote finds no Ward for the map `hipointe-demun`, and its
staging page carries no production domain, so QR codes and share links are withheld.

## ⭐ Updated 2026-10-04 (Boz): state at dispatch, and a hazard this brief did not carry

**Agent: FRESH**, named per `docs/agents/BOZ.md §3` item 1: one word, not one a **running** session holds (`ListAgents`).

- **Start from a committed baseline.** HPDM was re-skeletoned, re-poured and baked on 2026-10-03 (roundabout weld
  `d9f367cd`; hero impostors captured in the Grove). That night's bake also rewrote tracked `content/` files and minted
  **4 new listing ids** (`hpdm-lst-0172`…`0175`, high-water 171 → 175). ⛔ **Confirm with Jacob that the baseline is
  committed before you rename anything**; the "listing ids unchanged" gate below is measured against that commit, not
  against whatever is on disk.
- ⛔⛔ **THE LIVE BACKEND IS KEYED BY THE LOOK ID. This brief missed it.** The Apps Script tenant keeps each town's rows in
  suffixed sheet tabs (`apps-script/Code.js`: *"Other looks resolve to a suffixed tab ('Listings__hipointe-demun')"*), and
  its timezone table is keyed `'hipointe-demun'`. The app sends `look: INSTANCE.lookId` on every read and write
  (`src/lib/api.js`). ⇒ **A naive rename silently points HPDM at empty `__hipointedemun` tabs: claims and guardian edits
  detach, and nothing errors.** That's Layer 0 q2. Decide the backend half **before** renaming: move the tabs, or let the
  backend's tenant key be the town's stable id rather than its display name. ⭐ The second fixes the class, the same move
  as the listing prefix below. ⛔ Changing the deployed Apps Script is a live production change: draft it, and Jacob
  deploys (`clasp push && clasp deploy`).
- **HPDM has no staging record** (`staging/sites/hipointe-demun/player.json` is absent; the address 404s). After the
  rename: `node scripts/set-staging-player.mjs --map=hipointedemun --player=ward` (dry-run first; Jacob's go). Then
  Publish to Staging, then Promote. **Promote is the last step and Jacob presses it.**
- **The chain.** *Trusts:* Operations' Domain `hipointedemun.online` (owned, zone active, read live by Promote); the sealed
  `identity-registry.json` and `listing-identity.json`. *Trusted by:* the Ward on staging and production (`ward-look`,
  `ward-domain`), the Apps Script tenant, Operations' Host edits (keyed by listing id), and partners holding the old
  staging link.
- **The validation surface:** the real staging site and the real Promote. No parallel harness.

### ✅ RULED 2026-10-04 (Jacob): "a, rename everything with a stable backend key."
Map, Ward, slab, Look and instance all become `hipointedemun`. The Apps Script tenant is keyed by a **stable id**, not the display name or Look id, so no rename moves the sheet tabs; HPDM's existing rows stay attached (prove it before and after). The listing prefix is read from the registry. *(Rejected: keeping the Look id `hipointe-demun`. On staging the path, the staging record and the Look are one string; the Ward copies the path into `ward-look` (`theward/src/main.jsx#boot`, `src/town/page.js#readPage`), and an unregistered Look resolves to Lafayette Square.)* Premise corrections from Tamp's read: a naive prefix change already **throws** (`listing-identity.json` `meta.prefix`); live files naming the town are ~86, not a dozen.

### ✅ RULED 2026-10-04 (Jacob): the stable key is an OPAQUE ID
Jacob, on reusing the old name as the key: *"I don't get the emergency permanence as regards an operator facing quantity"* ⇒ **opaque id**: minted once per town, sealed in its identity, baked into `manifest.identity`, **never shown to operators**, never derived from a name. Every backend keys by it: the Apps Script tenant, Operations' publish key (`live/<id>/…`) and its stored scene field, the Ward's tenant and overlay read (`theward/src/content/api.js`, `content.js#overlay`), and the kit's `api.js`. Cost accepted: each existing town's backend data moves **once** (HPDM, LS, Huron, PT), proven zero rows lost against before-counts. One job, owned by Tamp, committed per repo. *(Found by Tamp: the Ward and Operations key by the path name too, so a rename would have silently dropped Host edits; a kit-only key could not cover it.)*

## What moves (▶ re-derive; never quote a count)

- `git grep -l -- hipointe-demun` lists every tracked file that names it. The live ones: `cartograph/data/hipointe-demun/`
  (raw, clean, content), `public/looks/hipointe-demun/`, `public/looks/index.json`, `src/instances/hipointe-demun.js`
  and its registry entry, `src/instance.js`, and a handful under `src/` and `cartograph/`.
  `cartograph/_archive/` and `docs/briefs/` are history. ⛔ Don't rewrite history; repoint only live references.
- **The slab in R2**: `staging/baked/hipointe-demun/` → `staging/baked/hipointedemun/` (re-bake and upload
  under the new name, then verify with `scripts/verify-baked-in-r2.mjs`). There's no production copy yet.
- **Operations: nothing.** The Ward's Domain already reads `hipointedemun.online`, so the name is already
  right there. (The Ward's record id `hipointe-demun` is only a key; its listings keep pointing at it.)

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
redirect), the Apps Script tenant key (`apps-script/Code.js`, `src/lib/api.js`; drafted, Jacob deploys), and a check.
Operations, R2 and Apps Script writes are Jacob's to approve. Commit messages name the
register (`OPERATIONS § Production sites` already states the rule and this job).
