# BRIEF — adversarial pass on the species pipeline

You are a **fresh agent**. Nothing below is context you already have; nothing above the line
in your window applies. Read `CLAUDE.md`, then `ORIENTATION.md`, then
`arborist/ARCHITECTURE.md §The species pipeline` before touching anything.

## What this is

Over 2026-08-24/25 two sessions built the path from a census name to a placeable tree:
harvest → vocabulary → mint → hydrate → the operator settles. It works and it is committed.
**Your job is to try to break it**, not to extend it.

⛔ **This brief's premises are CLAIMS, not facts.** Confirm each against the code and say
what you found before building anything. If the code contradicts this brief or the canon,
**STOP AND FLAG IT** — that is the work, not an interruption of it.

## Why this pass exists — the evidence, not a hunch

Six real defects surfaced in two days. **Not one came from an author reviewing their own
work.** They came from a peer, from an accident, or from an unexplained number moving:

| Defect | How it surfaced |
|---|---|
| `TERM_ALIASES` keyed to pre-cutover axis ids — dead for a day | a resolve count was near-zero |
| Salon's contested rail silently blank for 9 species | a count moved 47 → 12 |
| `hydrate --write` had **never once run** (`indexOf(...)+1` read `--write` as a filename) | peer's prompting |
| `claims-verify-taxon` passed with its own TICO guard **deleted** | peer mutation-tested it |
| `FIELD_MAP` — a **sixth** store of axis ids the checker never knew about | broke it by accident; check said PASS |
| Regex read **18 of 22** FIELD_MAP entries | the number was on screen and was read past |

⭐ **The pattern, and it is the whole reason you are here: a check agrees with its author
because it asks the same incomplete question.** The doc you are auditing was written by the
same agent that wrote the code, verified by checks that same agent wrote. Three levels of
one blind spot.

## ⛔ WHAT IS NOT A DEFECT — read this before you open your mouth

The kit's own gate (`CLAUDE.md` Layer 0, question 3) is that **the operator's authoring is
the product.** In this subsystem specifically:

- ⛔ **A `contested` cell is a FEATURE.** Jacob ruled 2026-08-25: *publish the disagreement,
  the operator settles it.* ~112 cells sit contested on purpose. Sources disagreeing is not
  a bug, an unfilled cell is not a gap, and "coverage is only N%" is not a finding.
- ⛔ **A cell without `sourced: true` is the operator's.** Never propose changing one.
  `sourced` is the line between machine output and authoring — that distinction is
  load-bearing, not incidental.
- ⛔ **`claims-verify-taxon` is RED and it is CORRECT to be red.** It asserts no mismatched
  taxon reaches the observations file; SelecTree's fallback puts one there. **Do not silence
  it.** See target 4.
- ⛔ **Do not treat "recorded but not matched" as dead code.** `chassis.orientation` and
  `chassis.spread` are deliberately absent from `matcher.js MATCH_AXES`. Jacob's reasoning:
  *"It's nearly universal; and in 1 example we found a variant"* — a near-universal trait
  carries nothing for the 99% and everything for the row that matters.

## The four targets

### 1. Prove the store count — or find the seventh
Axis ids and rubric values are written down in **six** places, each found ONE AT A TIME, each
by accident: dossiers · `part-index.json` · `rubric.similarityMatrices` · `matcher.js
MATCH_AXES` · `vocabulary.mjs` (aliases/redirects/not-a-trait) · `hydrate-dossiers.mjs
FIELD_MAP`. **Nothing establishes that six is the number.** Enumerate every site that names
an axis id or an enum value — including ones this list does not anticipate. A stale key or
value does **not** throw; it silently stops matching.

### 2. Mutation-test every check
Only three of the five have ever been seen to fail for the right reason. For each guard:
disable it, confirm the check exits non-zero, restore. ⭐ **A case that two guards catch
proves neither** — the peer's TICO literal differed in genus AND epithet, so deleting the
genus guard still passed. Isolate.

### 3. Audit `ARCHITECTURE.md §The species pipeline` against the code
Every claim. ⛔ When doc and code disagree, **say which is wrong and why** — rot (evict),
regression (fix the code), or **aspiration** (an unbuilt decision filed as done — surface it,
never quietly delete it). One known-soft claim already: `crown.base_height` is in `FEET_AXES`
and reads 0/34, mapped but fed by nothing.

### 4. Settle the SelecTree fallback — the one known-open defect
`scratch/dossier-harvest.mjs` `selectree()` resolves: exact non-cultivar match → **any
non-cultivar record** → first result. ⛔ **That middle step can return A DIFFERENT SPECIES.**
A `Sorbus americana` query returned `Sorbus decora` and its traits were emitted behind an
`unverified` flag. That is a Layer-0 fallback: no match became a plausible-looking wrong
answer. USDA's skip-on-mismatch is the shape it should take. It is contained downstream
(mint refuses, hydrate drops the source) but **containment is not the fix**.

## Commands

```
node scratch/claims-axis-keys-resolve.mjs        # 6 stores, axis ids AND enum values, scalar units
node scratch/claims-verify-taxon.mjs             # ⚠️ RED ON PURPOSE — target 4
node scratch/claims-dossier-writers-agree.mjs    # one vocabulary + order independence
node scratch/claims-cutover-casualties.mjs       # authored values the old rubric could not express
node scratch/claims-reference-credits.mjs        # plate credits, generated from dossiers

node arborist/hydrate-dossiers.mjs               # dry run; --write to apply; --in <file>
node arborist/mint-dossiers.mjs                  # dry run; --write; --in <file>
node scratch/dossier-harvest.mjs --from <rank> --out <file>
```

⛔ **`hydrate` and `mint` both WRITE `arborist/dossiers/`.** Back the directory up before any
`--write`. The harvest **truncates** its output — never run it without `--out`.
⛔ **Shared worktree: never `git add -A`.** Stage only files you touched.

## Working rules

- ⭐ **Poison the input; mutate the guard.** Do not accept a green check as evidence. Make it
  fail for the right reason first, then believe it.
- ⭐ **A number that moves when nothing should have moved it is the strongest signal in this
  subsystem.** Two of the six defects surfaced exactly that way.
- ⛔ **Never write the EXPLANATION of a number — only the number.** If a mechanism is not
  measured, write **"cause not established"** and stop.
- Report findings with the file:line and the command that reproduces them. **Fix what is
  unambiguous; for anything touching authored state or a design decision, bring it to Jacob
  with the measurement rather than the question.**
