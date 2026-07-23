# BRIEF — HPDM identity lock, step 2: fetch-msbf CONSULTS the registry

**Agent: FRESH.** A small, fully-specified change to one pipeline file + one shared helper + a test.
No prior session context is load-bearing — step 1 is committed and self-describing. **Jacob dispatches.**
**Name yourself** in the writeup.

> ⛔ **Route first** (`CLAUDE.md`): `ORIENTATION.md` → `README §⭐ START HERE` → then
> **`EXTENT-DESIGN.md §4` + §6 step 2** (the lock = the registry; the append-only allocator) and
> **`EXTENT-EXCAVATION.md §0.8`** (identity is minted in the soft pass; the lock IS the registry;
> ⚠️ name the seq-lock `sealed`, never the governance `locked`). This is the identity discipline of
> `SKELETON.md §0` and `BRIEF-polygon-asks-the-stamp` one artifact down: **mint once, carry, never
> re-derive.** Do not reopen the design — build to it.

---

## 0. Why (verified, do not re-derive)

`fetch-msbf.js:169` mints `msbfId: i` = the fetch **array index**. MSBF footprints carry **no external
id** (bare polygons + optional height). The `msbf-<id>` key is formed from `msbfId` in **4 sites**
(`bake-buildings.js:66`, `pipeline.js:107` & `:248`, `bake-content.js:126`). HPDM's **192 listing
anchors** (`building_id:"msbf-NNNN"`) and **1281 roster ids** are anchored to that index — so a
re-fetch (dataset bump, bbox/margin change, reorder) **silently re-points every one, no error.** HPDM
is the only commercially-requested map; it must not ship on a renumbering identity.

The permanent key is therefore **geometry**: the footprint **centroid (lon/lat)** — verified unique
across all 9880 HPDM footprints, **0 collisions at 7dp**.

## 1. What's already done (step 1 — committed `ca2db7ca`)

- **`cartograph/data/hipointe-demun/identity-registry.json`** (git-tracked, R18 gitignore exception) —
  the **frozen truth**: `{ version, scene, key:"centroid-lonlat-7dp", highWater, map: {"<lon>,<lat>": msbfId} }`.
  9880 keys, `highWater: 9879`.
- **`scratch/hpdm-identity-capture.mjs`** — built it and proved it: a shuffled fetch restores
  **9880/9880** to their exact `msbfId`; a new footprint appends at `highWater+1`; all **192** listing
  anchors resolve. **Reuse its `keyOf` / centroid math verbatim — see §3 gotcha.**

## 2. The change — `fetch-msbf.js` consults-and-updates the registry

In the `allFeatures.map((f, i) => …)` block (`:157`), replace `msbfId: i` with a registry consult.
The registry path is `join(RAW_DIR, '..', 'identity-registry.json')` (`RAW_DIR` is imported from
`config.js` = `data/<scene>/raw/`; the scene is whatever config points at).

**Logic — general, covers HPDM retroactively AND every new town's first fetch:**

```
load registry at data/<scene>/identity-registry.json   (may be absent)

if registry exists (the SEALED case — HPDM today):
    for each footprint f:
        k = keyOf(centroid(f))
        msbfId = registry.map[k]          // existing → its permanent number
                 ?? ++registry.highWater  // unseen  → APPEND, never renumber
        if newly allocated: registry.map[k] = msbfId
    persist the (possibly-grown) registry back to disk

else (no registry — a NEW scene's FIRST fetch = the seal):
    mint msbfId = i as today (first-ever numbering is legitimate — nothing to renumber)
    THEN write the registry from this fetch (freeze it), so the second fetch is locked
```

- **Never renumber.** A footprint that vanished from a newer dataset simply isn't re-emitted; its
  number stays reserved in the registry (a later reappearance re-binds to the same number). Do not
  compact or reassign.
- **Persist deterministically** — same `JSON.stringify(registry, null, 0)+'\n'` the capture used, so a
  no-op fetch produces no diff.

## 3. ⚠️ The one gotcha — the key derivation must be IDENTICAL in both places

If `keyOf` (centroid + rounding precision) differs by one digit between the capture and the consult,
every key misses and the whole lock silently fails open (falls back to appending everything = a fresh
renumber). **Extract the centroid-key into one shared helper** (e.g. `cartograph/msbf-identity.js`
exporting `keyOf(coords)` at `PREC=7`) and have **both** `hpdm-identity-capture.mjs` and
`fetch-msbf.js` import it. One definition, no drift.

## 4. Acceptance (measured, then the test)

1. **Unit test** (node-testable, no network): feed the helper a registry + a **shuffled** copy of
   HPDM's `raw/msbf.json` features → assert **9880/9880** keep their exact `msbfId`; inject one
   synthetic new footprint → assert it gets `9880` and the registry grows by one; assert a no-op run
   writes a byte-identical registry.
2. **Anchor integrity**: after a simulated re-fetch, all **192** `content/listings.json` `building_id`s
   still resolve (the check `hpdm-identity-capture.mjs` already prints).
3. **No scene-name branch** — the mechanism is data-driven (registry present/absent), never
   `scene === '…'`. `scratch/served-parity.mjs` still runs clean.
4. **New-town path**: stub a scene with no registry → first fetch mints + writes a registry; a second
   fetch against a reordered stub preserves numbering.

## 5. Boundaries

- ⛔ **Do NOT re-fetch or re-bake HPDM's shipped slab** as part of this. The change takes effect on the
  *next* fetch by design; landing it does not touch `public/baked/hipointe-demun/**`. (No network fetch
  is needed to test — simulate against the committed `raw/msbf.json`.)
- ⛔ **Do NOT touch LS's numbering.** LS (`bldg-`) is a separate migration (EXTENT-DESIGN §6 step 5),
  conformed last.
- **Surface = `fetch-msbf.js` + the new shared `msbf-identity.js` + the registry artifact.** Nothing
  else. The 4 downstream `msbf-<id>` sites are already correct — they consume `msbfId`, they don't mint
  it; leave them.
- Everything inside `lafayette-square.nosync/`. **Do not start a dev server** (one is running).

## 6. Deliver

1. The `fetch-msbf.js` consult + the shared `msbf-identity.js`; `hpdm-identity-capture.mjs` re-pointed
   at the shared `keyOf`.
2. The unit test (§4) committed under `scratch/` or the repo's test home.
3. A short writeup: what landed, the acceptance numbers, and whether the general new-town path (§4.4)
   was exercised or only reasoned. Note if any assumption (e.g. `config.js` scene resolution) differed
   from this brief — code drifts; re-verify before editing.
