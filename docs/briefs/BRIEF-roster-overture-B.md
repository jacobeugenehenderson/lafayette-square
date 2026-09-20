# BRIEF B — AN EXTERNAL LISTINGS BASE, AS A FIRST-CLASS SOURCE

*Written 2026-09-20 by the coordinator seat. Dispatch B of three; runs in PARALLEL with A.*

> ### ⭐ WHAT JACOB ASKED FOR
> *"…devise the system for finding out on non preserved towns. CoCs? There must be resources."*
>
> **A** gets huron's own data in (OSM nodes, the assessor, the zoning engine). **B is the answer for
> the town where A's well does not exist** — no assessor, thin OSM, outside the US. **C** ranks what
> A and B produce.

> ### ⛔⛔ THIS IS NOT "RESTORE THE ŁÓDŹ DEMO." READ THIS BEFORE YOU PLAN ANYTHING.
> `bake-content.js:776-782` — **the code has already diagnosed itself, in the smell detector's own
> words.** Verbatim, from the source:
> > *"⛔ THERE IS NO MERGE TOOL TO SEND YOU TO, AND SAYING SO IS THE POINT. This line used to name
> > `scratch/merge-lodz-listings.mjs`, which was hardcoded to one scene's content dir and was deleted
> > with that scene (2026-09-19). The guard above is generic — it reads `meta.baseSource` out of the
> > DATA — but the remedy never was. ⭐ So this is an unbuilt thing that read as done: the next town
> > with a non-OSM base is protected from the destructive bake and then has nowhere to go. **Folding
> > an external base in as a first-class bake-content source is OPEN WORK, not a missing file.**"*
>
> ⇒ **ASPIRATION** (`CLAUDE.md`'s third cause), named by the code about itself. ⛔ Neither evict nor
> "correct" — **build it.** That paragraph is this brief's charter and you should read it at the
> source before your first edit.

---

## 1. You are the dispatched agent. Name yourself — one word, yours.

## 2. Agent: **FRESH**

⚠️⚠️ **TWO SESSIONS WILL BE IN `cartograph/bake-content.js`.** Brief A owns `loadParcels` (`:140`),
`loadOsmPois` (`:203`) and the zoning tables (`:361`). **You own the guard and the merge path
(`:760-786`).** ⛔ **Disjoint regions, ONE index, one worktree.** Before every commit:
`git diff --cached` — and **never `git add -u`.** If A is live, coordinate through Boz, not directly.
⭐ Also fine, and cleaner if Jacob agrees: let A land first and rebase.

## 3. Read this canon, by section

- **`INTAKE-CATALOGUE §3.3`** — the listings layer. *"Two proven bases: OSM POIs and **Overture Places**
  (Łódź, 84 records, declared via `meta.baseSource:"overture"`)."*
- **`INTAKE-CATALOGUE §3.5`** — the join-key invariant and **the two load-bearing defences**: the
  external-base guard, and **anchor re-resolution** (`applyListingOverrides` re-resolves
  `building_id` from a stored anchor on EVERY run). ⭐ **That second one is what lets a re-poured
  skeleton keep its content — your merge must preserve it, not bypass it.**
- **`INTAKE-CATALOGUE §4.2`** — the **one-button rule**. Where an endpoint exists, the acquisition is a
  button, not an instruction.
- **`INTAKE-CATALOGUE`'s header, the licence lesson** — ⛔⛔ **"Read the licence at the source, from the
  bytes, or do not state it."** Microsoft's footprints were recorded as ODbL in this repo for months;
  they are **CDLA Permissive 2.0**, and a web search *still* answers ODbL. See §6.
- **`cartograph/INTAKE.md §1`** — the source table you will be adding a row to.

## 4. The code sites, by `file:line` — all verified 2026-09-20

### (a) ⭐ THE GUARD — it EXISTS, it is GENERIC, and it is correct. Do not rewrite it.
`cartograph/bake-content.js:771-773`:
```js
const externalBase = listingOverrides?.meta?.baseSource
if (externalBase && externalBase !== 'osm' && !force) {
  // …skip listings.json; roster/profile still bake
```
⚠️ **`INTAKE-CATALOGUE §3.5` cites this at `:730-747`. That has DRIFTED — it is `:760-786` today.**
⛔ Re-derive every line number in this brief before you trust it; the catalogue was wrong twice today.

⭐ **Why it is right, and the history is the argument:** baking Łódź after an Extent edit took
`listings.json` from **84 → 5** (2026-07-20). The guard is declared **in the data**, not by scene name
— so the next town is protected without editing this file. **That generalization is the model for
everything you build here.**

### (b) ⛔ THE ACQUISITION HALF DOES NOT EXIST AT ALL
**There is no Overture Places fetch anywhere in this repo.** Grep it: the only occurrences are
comments (`bake-content.js:33`), a source-table row, and two operator-facing labels. ⛔ **So "proven
on Łódź" describes the CONSUMPTION path only.** Those 84 records arrived by a route that is not in the
tree, and the route is gone with the scene.

`cartograph/INTAKE.md:52` lists Overture for **buildings** — *"`config.py` / merge"*, **artifact `—`**,
licence ***"ODbL/CDLA ⚠️ confirm."*** ⚠️ **A different theme (buildings, not places), no artifact, and
an unconfirmed licence.** Treat that row as a lead, not a precedent.

⭐ **The real precedent to copy is `scripts/03-fetch-stl-parcels.py`** (`INTAKE.md:53`) — a named
endpoint → a scene-homed artifact under `data/<scene>/raw/`. **That is the shape: acquire once to a
local file; the pipeline never reads the network** (`INTAKE-CATALOGUE`'s standing constraint —
*a pour must be reproducible with the network unplugged*).

### (c) ⛔⛔ WE ARE ALREADY PROMISING THIS TO THE OPERATOR
`src/cartograph/SourcesPanel.jsx:209`:
```js
{ name: 'Overture Places', note: 'free · what Łódź used' },
```
**The Sources panel offers it, by name, with no path behind it.** ⛔ That is a doc/code mismatch on a
**live operator surface** — the most expensive kind. ⭐ **Either this brief makes it true, or the row
must say what it actually is.** Do not leave it as-is.

## 5. The chain — what this trusts, and what trusts this

**Upstream:** the acquired artifact under `data/<scene>/raw/`; the baked building set (`bakedIds`);
`buildingGrid` / `parcelByAddr` for anchoring.

**Downstream, by name:** `content/listings.json` → `useListings` → **place cards · search · the Society
tab · neon colour · open-now · the Places stat**.
⛔ **THE ORPHAN INVARIANT IS THE HARD GATE** — `bake-content.js:800`: *every listing `building_id` ∈ the
baked set*. huron prints `ORPHAN CHECK: 0 … ✓ (membership == slab)` today. **Your merge must not break
it, and an external POI that lands outside the baked set must be DROPPED LOUDLY, with its name and
reason** — the existing `add_dropped` reporting is the pattern to follow, not to reinvent.

⭐ **Convert the constraint to a check** (`BOZ §3.5`):
> **A scene with an external base survives a bake byte-identically** — the 84→5 regression, pinned.
⚠️ **And you have no Łódź to pin it on.** Constructing a minimal external-base fixture is therefore
part of the work, not a nicety. **Say so in your plan.**

## 6. ⛔ Can the instrument SEE the change?

**Yes — `content/listings.json` on disk, and the bake prints its own census every run.**
⭐ **BASELINE, huron, measured 2026-09-20 — re-derive, never quote:** `base listings (OSM): 37`,
`with-listings 35`, `3678` buildings, `ORPHAN CHECK: 0`.

⚠️ **But the guard's own success path prints a SKIP, not a number** — a scene with an external base
produces no listings census at all. ⛔ **Check that your instrument can tell "skipped correctly" from
"produced nothing."** Those look identical in the log today and that is exactly the silent-substitution
class.

⛔⛔ **MUTATION-TEST IT.** `MEMORY §C`: a passing check proves nothing until it has been SEEN TO FAIL.
**The mutation that matters is the 84→5 one** — run a bake that *should* destroy an external base and
prove your check goes red.

### ⛔⛔ THE LICENCE GATE — DO NOT SKIP THIS AND DO NOT ANSWER IT FROM MEMORY
This data may reach a **public attribution surface** (`bake-sources.js`, the visitor credit).
**Read the licence from the distribution's own bytes** — its `LICENSE` file / the dataset's own terms —
**not from a web search and not from this brief.** `INTAKE-CATALOGUE`'s header records the exact
failure: MSBF was recorded as ODbL here for months and is **CDLA Permissive 2.0**; a search still
answers ODbL. ⭐ Licences live as structured fields in `cartograph/intake-rows.mjs`, not as prose.
⛔ **A guessed licence on a public page is the one error that cannot be walked back quietly.**
⚠️ **Confirm the distribution mechanism the same way** — from the source, current at the time you run
it. **Do not build against a remembered API shape.**

## 7. Write/commit bounds

**In bounds:** a new acquisition script (follow `scripts/03-fetch-stl-parcels.py`'s shape) ·
`cartograph/bake-content.js:760-786` and the merge path · `cartograph/intake-rows.mjs` (the licence
row) · `cartograph/INTAKE.md §1` (the source row) · `SourcesPanel.jsx:209` · a new check + fixture.

⛔ **OUT of bounds:** `loadParcels` / `loadOsmPois` / the zoning tables (**brief A, live**) ·
the fade arc (**Quill, live**) · prominence ranking (**brief C**) · re-fetching any town but huron.

⚠️ **`INTAKE-CATALOGUE §3.5`'s drifted line numbers are yours to correct** — the doc edit is part of
the fix (CLAUDE.md's three-part rule), and ⛔ **the commit message names the register it reached or
says "reaches no register" outright.**

⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.** In particular: **if the fold-in turns out to need a
schema change to `listings.json`, STOP and come back.** That is a contract other systems read.

### ⚠️ THE THING TO BRING JACOB BEFORE YOU COMMIT TO A SOURCE
He asked: ***"CoCs? There must be resources."*** ⛔ **Chambers of Commerce are NOT in the intake
catalogue** — a genuine gap in the canon, not something you are missing. **Boz's read, which is a read
and not a ruling:** a CoC directory is per-town HTML with no API, and ⛔ **membership ≠ existence**, so
it is a *biased sample of businesses that pay dues* — below a global open dataset for kit purposes,
but potentially the best source of **hours and contact detail** for a small town. ⭐ **Enumerate the
candidate sources with their coverage/licence/per-town cost, and let Jacob pick — do not silently pick
one because it was named in a brief.**

## 8. The validation surface that already exists

⛔ **Do NOT build a parallel pipeline** (`feedback_no_parallel_pipeline_for_scenes`). `bake-content.js`
runs on any scene in seconds and prints a census — **it is the harness.**
⚠️ **You have no scene with an external base**, so a minimal fixture is required — ⭐ build it as a
**scene-shaped `listings.overrides.json` carrying `meta.baseSource`**, exercising the production guard
via the production path. ⛔ Not a mock of the guard; the guard itself.

---

## What "done" looks like

1. An external listings base can be **acquired to a local artifact** by a repeatable, town-agnostic path.
2. It can be **folded in as a first-class bake-content source** — the open work the code names at `:778`.
3. The 84→5 regression is **pinned by a check, seen to fail first.**
4. An external POI outside the baked set is **dropped loudly, by name** — the orphan invariant holds.
5. The licence is **read from the bytes** and lives in `intake-rows.mjs`.
6. `SourcesPanel.jsx:209` is **true**, or it says what is actually there.
7. ⛔ The source itself is **Jacob's pick**, from an enumerated comparison — not yours.
