# BRIEF — the Ward's interface grammar: cards own their depth, search is global

<!-- BRIEF-STATE
status: UNVERIFIED
dispatched: Hinge
written: 2026-10-07
evict-when: RULING: on staging at phone size, Jacob confirms every card carries its own exit and search restores the room (theward: node checks/interface-grammar.mjs passes)
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>` in both repos, then `/rename`). **Agent: FRESH.**
**Report to the session `Boz the Younger`.**

**You work in the Ward's repo**, `~/Desktop/dev.nosync/theward`. Its `README.md` is the spec and its `checks/` are
the guards. ⛔ Don't edit the kit (`lafayette-square.nosync`); the Ward builds against a pinned kit worktree.

**Instruction: confirm-then-build.** Read the spec and code below and tell Boz what you found. Where the code or the
spec contradicts this brief, **stop and flag**.

---

## 0. What this is (Jacob, 2026-10-07)

An interface critique Jacob endorsed. The core diagnosis: *"There is no exit control attached to the thing the user
was trying to leave. The interface had been trying to preserve visual minimalism by making global controls carry
contextual meanings. That saves a button, but increases cognitive load."* The answer is **stable territories with
stable meanings**, not fewer things.

**The grammar, which becomes the Ward's interface law (README §3):**
1. The map is the underlying place, not merely another app screen.
2. **Global controls move around the Ward.** The band (Home · Society · Bulletin, later perhaps 311 · 411 · 911)
   holds destinations and services, **never history**: no Back, no Close, no search state.
3. **Search searches the Ward**; it doesn't secretly mean "go to Society".
4. **Cards own their depth.** ← returns to a meaningful parent state; × dismisses a transient one. They are not
   interchangeable.
5. **Home is absolute; Back is contextual.** Home never makes you unwind Back → Back → Close.
6. **Depth model:** level 0 (Home, Society, Bulletin) shows no ←/×. Level 1+ (a place, a detail, an expanded item, a
   modal, a secondary screen) shows its ← or × **at the upper-left of the card**, not in the band.
7. **Anything that creates depth must visibly provide the means to leave it.** Never cut an essential control just to
   show fewer controls.
8. The system **remembers what is underneath**; it never invents a destination for Back.

## 1. Rulings (Jacob, 2026-10-07): both REVERSE current spec

- **R1: a card's ←/× lives on the CARD, top-left.** Today (README §2 "The doors", "The band's two ends") a full
  page puts its ← in the band's left zone, *replacing ⌕*. That is the global-control-with-contextual-meaning the
  critique objects to. ⌕ stays put; the card carries its own exit.
- **R2: search is GLOBAL and sits OVER the current context.** ⌕ opens search from any room; × restores that room
  exactly (Home → Search → × → Home; Society → Search → × → Society). Committing to a result is navigation: Home →
  Search → a place → that place's card offers ← to the search results, and closing search afterwards restores Home.
  Today ⌕ opens Society, and README §2 lists "a search drawer or pop-over search results" as never built. That
  line changes: search is the one sanctioned overlay, and Society's list/filter/map machinery may still produce its
  results (reuse it; don't build a second search).

## 2. Already true — keep it

- **Home is absolute:** the Home room goes straight to Leisure from any depth (README §2, Jacob 2026-09-28); Esc steps
  back.
- **Every screen is an address; screen changes are history; choices within a screen replace** (README §2). The
  grammar must keep this: the browser's back gesture and a card's ← are the same act.

## 3. The work, in order (each lands alone, with its check)

1. **Read and map.** For every screen and card, list its depth level, today's exit (where and what), and what R1/R2
   change. Report and **stop**.
2. **R1: cards own ←/×.**
   - The band's left zone goes back to ⌕ everywhere.
   - Every level-1+ card carries its exit top-left, named for where it goes (keep today's "Back to Society" naming).
   - ← where a parent exists, × for transient sheets.
   - Remove the band's mutation in the same commit.
3. **R2: global search over the current context**, with the history semantics in §1. The README's search section and
   the "absent" list are rewritten in place.
4. **The row-tap test** (today: tapping a row shows the place on the map, and only its › opens it; f36b777). Prototype
   "tap the row opens it" against today's, measure the taps-to-open on touch, and bring Jacob both with numbers.
   ⛔ Don't change it without his ruling.
5. **The grammar goes into README §3** as interface law, rewritten in place (no new doc), and one check enforces the
   machine-checkable parts: no band control changes meaning by screen; every level-1+ screen renders a visible ←/×;
   Home from any depth lands on Leisure; × after search restores the prior room. Mutation-test it.
6. **The 311 / 411 / 911 band** is recorded as direction, not built: one line in README §11 ("Open before building").

## 4. Bounds and verification

- **Writes:** theward's `src/`, `README.md`, `checks/`, `FEATURES.md`, `OPERATIONS.md`.
- `npm run check` stays at today's green count or better (24 green / 6 red at pin c30afde8); no new red.
- **Verify on STAGING** (`npm run publish:staging`), but ⛔ only with Boz's word: Boz batches Ward publishes with kit
  pins. Never Promote. A Ward publish needs a clean, committed tree.
- Load each changed screen in a production build before calling it done (a headless pass on staging; Boz has a probe
  at `lafayette-square.nosync/scratch/staging-verify/probe.mjs`).
- The kit's rule applies here too: **never add a source of truth.** Reuse the Ward's existing router, history and
  Society list machinery; a better mechanism is a swap, discussed first.

## 5. Done when

On staging, on a phone-sized viewport: every card carries its own exit; the band never changes meaning; search opens
over any room and × restores it; Home always lands on Leisure. The grammar is README law with its check. Jacob's eye.
