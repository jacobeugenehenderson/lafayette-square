# BRIEF: a refusal is never swallowed (the kit)

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-31
evict-when: node checks/claims-a-refusal-is-never-swallowed.mjs --mutants
-->

**Owner:** Boz. **Reviewer:** Zob (premise read below; Zob co-signs your plan before code). **Repo:** the kit,
branch off `integration/2026-10-20` in `.claude/worktrees/` (never on the Desktop).

1. **You are the dispatched agent. Name yourself:** one word, yours, and not one a running session holds (check with
   `ListAgents`, then `/rename`).
2. **Agent: FRESH.** No live window holds this work. Tinsel (Displays) is busy with its own queue, and this is a
   kit-wide change with its own premise.

## 0. Why, in one paragraph

`CLAUDE.md` Layer 0, question 2: *"What happens when this is WRONG on a town nobody has inspected? It fails loudly. ⛔ NO
FALLBACKS."* The kit's refusals are written to obey that: each is a `throw` with a `⛔` reason. But inside the 3D town
one component turns every refusal into a retry loop and then into **nothing**: the layer vanishes for the visitor, and
the reason reaches only the console. A loud failure is converted into a silent one. **This blocks the next Ward pin**:
the calendar route (Tinsel, `tinsel/displays` 5725b7c7, unmerged) makes a display refuse by name when the app passes no
calendar, and today that refusal would just make the display disappear (`cartograph/BACKLOG.md`, pin precondition ①).

## 1. Read first (both docs AND code, before you plan)

- `CLAUDE.md` Layer 0, all three questions; `ORIENTATION.md` §1 (What we are building), question 2 ("It must fail loudly").
- `docs/briefs/BRIEF-ward-the-scene-says-why-it-failed.md`: the Ward's half of the same class (throws OUTSIDE the
  wrapped layers). Yours is the kit's half. Don't build the Ward's.
- The code sites in §2, by symbol. **Confirm each premise against the source and tell Boz what you found before you
  plan.** If the code contradicts this brief, stop and flag it.

## 2. What the code says (Zob, read in source 2026-10-31; ⛔ NOT MEASURED: your first act is to measure it)

- **`src/components/R3FErrorBoundary.jsx`** wraps 15 of `src/components/Town.jsx`'s layers (InstancedTrees, SetPiece,
  SlabBuildings, BakedGround, BakedLamps, CelestialBodies, WindSheet, …; read the list from `Town.jsx`, don't trust
  this copy). On any throw it logs, renders null, retries on `RETRY_DELAYS_MS` (7 delays, ~16 s, 8 attempts), then
  renders null until reload. Its header says the retry exists for "a transient OOM during load". **It cannot tell a
  refusal from a transient**: it retries every error.
- **There is no refusal type.** The refusals are plain `throw new Error('[<site>] ⛔ …')`. Zob's grep: about **206**
  throw sites in **53** files match the `[tag] ⛔` pattern. The only typed errors are unrelated (`WeatherRangeError`,
  `weatherAt.js`; `OutsideCoverageError`, `nws.js`). Re-derive the count; don't quote it.
- **Displays already has its own sink:** `src/displays/failures.js` (a named console line plus Stage's banner), with
  `src/displays/DisplayBoundary.js` containing a refusal per display, INSIDE SetPiece's `R3FErrorBoundary`. Unify the
  two sinks, or the kit ends up with two.
- **The Ward can only surface what reaches it.** Today a refusal inside a wrapped layer never does.

## 3. The job

1. **A refusal is told apart from a transient**, by something the boundary can test that isn't a string guess at
   runtime. Choose and say why: a refusal type every `⛔` site throws (a migration of ~206 sites, by codemod), OR the
   `[tag] ⛔` convention made the contract, with a check that reads the source and fails on a `⛔` throw that doesn't
   meet it. Either way, **the check must find an untyped or malformed `⛔` throw**, or the migration rots.
2. **`R3FErrorBoundary` never retries a refusal and never renders it as null.** A transient keeps the retry. A refusal
   goes to the ONE sink.
3. **One sink, kit-wide**, absorbing `src/displays/failures.js` (not beside it). It names the site and the reason,
   and the app surfaces it: **Stage** shows it to the operator (as Displays' banner does today); the **Ward** decides how
   a public visitor sees it (Ward's register, `docs/agents/WARD.md`), and the kit exposes the sink so the Ward CAN.
   ⛔ Never silent in either.
4. **Remove what this replaces**, in the same commit (`CLAUDE.md` "every fix is a fix in three parts"): a duplicated
   sink, a refusal-swallowing branch, a stale header comment. Say what you removed.

## 4. Validation (the surface that already exists)

- **Stage** is the controlled surface: a forced refusal in a wrapped layer (e.g. a display with no calendar, once the
  calendar route merges; or a deliberate throw under a dev-only flag) must show its reason in Stage's banner, and the
  layer must NOT retry 8 times. ⛔ No parallel scratch renderer.
- If you drive Chrome: your OWN new tab, and prove the render loop runs (`document.hidden === false` plus a frame
  counter) before reading anything (memory `feedback_a_backgrounded_tab_cannot_measure_a_render_loop`). Jacob's say-so
  comes through Boz.
- **The check** `checks/claims-a-refusal-is-never-swallowed.mjs --mutants`, reading the source, never restating it.
  Mutants, at least: the boundary retries a refusal · the boundary renders a refusal as null · a `⛔` throw that misses
  the contract passes · a second sink returns. Register it in `checks/TIERS.json` (`npm run test:tiers`).

## 5. Bounds

- Write: `src/components/R3FErrorBoundary.jsx`, `src/displays/{failures,DisplayBoundary}.js`, the `⛔` throw sites (the
  migration only, no behaviour change at a site), Stage's banner wiring, the new check, `checks/TIERS.json`.
- Registers: `cartograph/OPERATIONS.md` gets the operator's line (where a refusal shows in Stage). Canon is otherwise
  off-limits. Commit with `git commit -- <paths>` only, never from the shared index.
- ⛔ Not yours: the Ward repo, the Ward's boundary, how a visitor reads a refusal, Tinsel's display code beyond the sink.
- **Surface scope drift to Boz; don't absorb it.** A `⛔` site whose throw is actually a transient, or a refusal that
  turns out to be load-bearing as a silent skip: stop and report.

## 6. Done

Zob's PASS on the branch → Boz merges into `integration/2026-10-20` after `node checks/tier.mjs --check` →
`cartograph/BACKLOG.md`'s pin precondition ① is struck → this brief retires to `cartograph/_archive/` dated.
