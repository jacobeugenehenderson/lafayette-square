# BRIEF — the shape-layer reds in the check suite

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-13
evict-when: npm test 2>&1 | grep -qE "^(checks/)?claims-(ring-partition|proto-frozen-matches-live|stamp-follows-the-edge|sidewalk-is-one-band)" || echo LANDED
-->

**Status: OPEN, UNDISPATCHED. Written 2026-09-13. ⛔ Jacob dispatches — do not self-dispatch.**
**Evicts to `_archive/` dated the day its acceptance passes. The eviction condition is in the
`BRIEF-STATE` block above and `checks/claims-a-brief-declares-how-it-dies.mjs` reads it.**

---

## Why this brief exists

`npm test` was wired on 2026-09-13 and **had never been run as a suite before it was wired**. The
first run: **80/125 green.** The wiring is now live in `staging.yml` and `deploy.yml` and
`checks/run.mjs` fails closed, so **CI is red on both branches until this lands.**

⛔ **Do not quote a count from this brief.** The set drifts daily and a number in prose is stale the
moment it is written. Derive it:

```
npm test                       # the whole suite; the RED list prints at the end
npm test -- --list             # what runs, runs nothing
```

Your set is the shape-layer entries in that list — the ones about rings, protopolygons, bands,
corners, frontages, stamps, spurs, ramps and pads. **The tree/arborist reds are a separate brief;
the memory, doc and tiering reds are already closed.**

---

## Who you are + the bounds

You are a fresh specialist. **Name yourself — one word, yours.** `Agent: FRESH` — nobody holds
useful context on this; the suite has never been triaged.

- **Write bounds:** `src/lib/tileGround.js`, `cartograph/*.js`, and the checks themselves.
  ⛔ Canon docs are off-limits unless a fix makes a doc false — then **stop and flag**, don't edit.
- ⛔ **Do not touch `docs/briefs/`, `_archive/`, `MEMORY.md` or the memory directory.**
- **Surface scope drift, don't absorb it.**

---

## ⭐⭐ THE FIRST QUESTION FOR EVERY RED — and it is not "how do I fix the code"

> **IS THE INSTRUMENT WRONG, OR IS THE PRODUCT WRONG?**

**Measured 2026-09-13: of 12 reds examined closely, 6 were defects in the CHECK, not the code.**
Receipts, so you believe it before it costs you a day:

- `claims-docs-carry-their-commands` — fence detection read `/^\s*```/`, so every ` > ``` ` block
  inside a blockquote was invisible. It was walking into measured tables it is built to skip and
  reporting their cells as bare prose. **4 of its 7 findings were its own bug.**
- `claims-doc-pointers-resolve` — its doc set was a literal list of 28 files. It reported *"every
  cited pointer resolves"* while covering 10% of the corpus. Derived from `git ls-files` it covers
  272 and immediately found 4 dead.
- `claims-memory-index-health` — failed on a doc that does not exist **because nobody has written it
  yet**. An aspiration, not rot.
- A static grep to find "checks that cannot run without an argument" was **wrong about 4 of 6** —
  it would have dropped a passing check and buried 3 real findings as wiring debt.

⇒ **For each red: read the check, then read the code it asserts against, then decide which is
wrong.** `[[feedback_the_instrument_is_where_the_defect_lives]]`

⛔ **And when you fix a check, mutation-test it: a passing check proves nothing until it has been
seen to fail.** Break the thing it asserts, watch it go red, put it back.
`[[project_the_check_is_the_deliverable_mutation_test_it]]`

---

## Route first — BOTH the canon and the code

- **Canon by section:** `cartograph/RIBBONS.md §1` (the tile model + the four invariants) ·
  `cartograph/SECTION.md §4` (the corner: `iaCorner` is the ease's own per-vertex stamp) ·
  `cartograph/SURVEY.md` and `cartograph/POLYGON-FIRST.md §3` for the producer split ·
  `ORIENTATION.md` for the dependency chain.
- **Code sites:** `src/lib/tileGround.js` — the painter, the corner read (`iaCorner`/`iaArc`), and
  `degenerate:collapsed` · `cartograph/derive.js` — the anchor model and `assignSegOrdsToFes` ·
  `cartograph/skeleton.js` — `CURVE_FIT`, the terminal/through stamp.
- ⛔ **The canon can be wrong and the code is the fact.** Test the doc against the source.

### ⛔ The chain — what this trusts and what trusts this
Upstream: the **frozen `shape.json`** and the skeleton that produced it. A check reading the frozen
artifact cannot see a fix that lives only in the live pass — **ask of every red: does this read disk
or live?** Downstream: the **slab**, and the operator's eye on the real render.

### ⛔ Two live doc-vs-code contradictions you will meet
1. `src/lib/tileGround.js:3820` still describes `iaCorner[q]` as *"① TURNS at this vertex **AND the
   owner changes**"* — a conjunction `cartograph/SECTION.md` says was **RETIRED 2026-09-08**. One of
   them is wrong. **Say which; do not quietly correct either.**
2. `cartograph/BACKLOG.md:16` says `CURVE_FIT` is *"built + eye-approved but **OFF**"*. It is **ON by
   default** — `cartograph/skeleton.js`: `process.env.CURVE_FIT !== '0'`. That is doc ROT; evict it.

---

## The work

1. **Triage every shape-layer red into: instrument defect · real product defect · stale baked
   artifact.** Report the split before fixing anything.
2. **Fix the instrument defects first** — they are cheap, and each one removes noise that would
   otherwise cost a real investigation.
3. **For real product defects: fix at source.** ⛔ No fallbacks — a fallback converts a failure into
   a plausible-looking success, and for a kit that is the worst available outcome.
4. **For stale-artifact reds, say so and stop.** A re-bake is an operator gesture, not your call.

## Acceptance

1. `npm test` shows **no shape-layer red**, or every remaining one is documented as a real defect
   with a board line and a receipt.
2. **Every check you fixed has been mutation-tested** — say so, per check, with what you broke.
3. ⛔ **No check was made green by narrowing what it looks at.** If you changed a check's scope, say
   what it stopped covering and why that is correct.
4. `node scratch/claims-doc-pointers-resolve.mjs` is green; `node checks/claims-memory-index-health.mjs`
   is green.

## Registers (`CLAUDE.md`, part 2 of every fix)

- A shape fix that changes what the operator sees reaches **`cartograph/FEATURES.md`**; a new knob or
  gesture reaches **`cartograph/OPERATIONS.md`**.
- ⛔ **The commit message names the register it reached, or says "reaches no register" outright.**
