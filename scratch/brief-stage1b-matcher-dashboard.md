# Brief — Stage 1B: the matcher + the readiness dashboard (the spine, right half)

> **Agent: FRESH.** Name yourself one word, novel (check `arborist/NOTES.md` + recent commits; avoid
> Hortus / Florilegium / Espalier / Increment / Prism / Verdigris / Alidade / Theodolite / Verge / Mitre).
> You are **half of Stage 1** — you run in parallel with **Stage 1A** (ingest + tagger). Your input is a
> single file 1A produces: the **tagged-part index** (`arborist/state/part-index.json`, schema below).
> **It may not exist yet when you start** — build against the schema + a small **fixture** you hand-write
> (a few Sugar-Maple-relevant parts), then swap to the real file when 1A lands. **The Stage-0 keystone is
> RATIFIED** — `rubric.json` (axes + `similarityMatrices` + tolerance rules) + the 10 dossiers
> (`required{}`) are your source of truth. Don't re-open it; if it's wrong, flag Boz.

## ROUTE FIRST (mandatory gate, CLAUDE.md)
`ORIENTATION.md` → `README.md §⭐ START HERE` → the Arborist canon. Then read, to the section:
`scratch/FOREST-BUILDER-KIT-MATCHER.md` **§7** (matcher + the tolerance engine) · **§8** (dashboard) ·
**§9** (viewer context — you are NOT building the viewer, but the matcher feeds its option pickers) ·
**§13 Stage 1** · **§15.1** (the tolerance-basis decision — accepted: hand-authored matrices + % scalars).
Then read what you build against: `arborist/rubric.json`, `arborist/dossiers/*.json`,
`arborist/STAGE0-KEYSTONE.md`, and the two **seeds** you generalize.

## What you build

**1. The matcher (§7) — `matcher(dossier, partType) → ranked workable options`.**
The **tolerance engine** is the real work (§7.2; the single hardest call, §15.1 — accepted as
hand-authored). Read the rules straight from `rubric.json`:
- **enum** (`chassis.habit`, `bark.type`, `leaf.silhouette`, `leaf.ways`): `distance` = hops in
  `rubric.similarityMatrices[axis]` (0 = identity, 1 = near, 2 = stretch; unlisted = `farDistance` 9);
  `withinTol = distance ≤ required.tol`. **The matrices ARE the taste — read them, don't invent a metric.**
- **scalar** (`chassis.size`, `bark.color`, `leaf.size`): `distance = |actual − target| / target`;
  `withinTol = distance ≤ tol`. The **legibility floor** on `leaf.size` is a hard clamp (a too-small leaf
  is never workable, `rubric.scalarTolerance.leafSizeLegibilityFloor`).
- **ordinal** (`chassis.density`): adjacent buckets workable.
- **hardness:** a `hard` axis out of tol drops the option **workable → stretch**; `soft` axes never
  disqualify, only move `score` (weighted closeness, hard axes weighted up).
- **provisional:** un-ratified tags (`ratified:false`) are **down-weighted + badged** so a match never
  silently rests on a guess.
Output the §7.1 shape exactly (`{partType, preselect, options:[{partId, verdict, score, perAxis:[…]}]}`),
with `preselect` set only when there is **exactly one** workable. Surface **how close** + **which axes are
hard vs nice-to-have** so the operator can ratify or say "go get a real one" (→ the shopping list).

**2. The readiness dashboard (§8) — a VIEW over the matcher, not separate bookkeeping.**
Generalize `roster-coverage.js` (it already computes have-vs-need: `literal`/`composite`/`gap`, the
`/coverage` join, Brief 24) to **per-part + visual**: each species row × **Chassis · Bark · Leaves**
(🟢 in-hand = matcher returns a workable option / 🟡 stretch / 🔴 gap). Three jobs: (1) the 10 priority
species' status; (2) **"buildable today" — uncapped** (every species whose 3 parts are all green — sweep
the freebies, do NOT cap at 10, §1.8); (3) the **shopping list** (which part to procure for the blocked
ones → drives the import procedure §10). A species is green-Chassis **iff** `matcher(dossier,'chassis')`
returns a workable option — so it stays honest as parts ingest.

**3. Generalize `leaf-pack-bindings.json` → the matcher config.** It's a proto-matcher (morphology →
ordered pack candidates + `coverageGaps`) for **leaves only**. Make the matcher **general across all four
part-types** and **tolerance-driven** off `rubric.json`. Treat `leaf-pack-bindings.json` as a **seed you
read**, not a file you rewrite (1A reads it too). Put new matcher config in a new module/file.

## THE CONTRACT with Stage 1A — `arborist/state/part-index.json` (you READ it)
```jsonc
{ "parts": [
  { "partId": "...", "partType": "chassis|bark|leaf|overlay", "source": "authored|lidar|procedural",
    "path": "public/library/…", "tags": { "<axis>": { "value": …, "ratified": false, "confidence": "high|low", "source": "…" } },
    "conformReport": { … } }
] }
```
Until 1A lands it, write `arborist/state/part-index.fixture.json` with ~6 parts (a couple chassis, the
palmate + lobed + heart leaf packs, a bark) and point the matcher at a path that prefers the real file,
falls back to the fixture. **Don't block on 1A.**

## Constraints / boundaries
- **File ownership (avoid colliding with 1A):** you own the matcher module, the dashboard view, the
  matcher config, the fixture. **Do NOT touch `survey-deleaf.js`, `public/library/**`, or write
  `part-index.json`** (1A owns those). **Read** `leaf-pack-bindings.json` / `roster-coverage.js`; don't mutate.
- Evolve the existing surfaces — **no fork** (`feedback_no_parallel_pipeline`). The dashboard rides the
  existing `/coverage` join + Salon scaffold; don't stand up a parallel app.
- Gate live code on `opts.*`, **never `process.env`** (banked lesson).
- **Acceptance (§13 Stage 1, Jacob's eye on the LIT app):** the dashboard shows **real, granular**
  coverage; the matcher returns **sensible ranked options for Sugar Maple** (palmate leaf preselects;
  chassis options ranked by habit/size closeness; provisional tags badged) and the **gaps read as the
  real gaps** (ash compound, sweetgum star, cypress needle-spray, birch bark, crabapple/redbud ornamental
  chassis — these are the 6 `partAvailability:gap` cells the dossiers already declare). Build to a state I
  (Boz) reconcile to `curb-offset-draw` for Jacob's eye (agent-worktree work is invisible on the
  operator's dev server until merged — banked lesson). Commit your work; I reconcile.
```
