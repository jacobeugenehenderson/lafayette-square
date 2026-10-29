# BRIEF — cut once in full precision: the decks, the dike and the water without integer copies

<!-- BRIEF-STATE
status: OPEN
dispatched: no (written 2026-10-28 night, Boz, at Jacob's ask: "write A and B")
evict-when: structures.mjs's open/close and the deck take-out make no second integer copy of any edge; the traced water's
`cutOnce: false` debt is deleted; PTown's ground builds on coast v5 (or refuses by name at a stage that is not this class); the
decks' ≤ 2 mm edges are back to their pre-open counts (PTown 0, Huron 3); every gate below green with its mutants seen RED; merged on
Zob's PASS. Then this moves to cartograph/_archive/ dated.
-->

**You are the dispatched agent. Name yourself:** one word, not one a running session holds (`ListAgents`, then `/rename`).
**Agent: FRESH.** The work that found this spans four agents' contexts; the record (this brief, the commits, the handoff) is the
read-in, never their memory. **Report to Boz.** **Confirm-then-build:** every premise below is a claim. Confirm each against the
code and say what you found. If the code disagrees, stop and flag Boz; the stop is the deliverable.

## 0. Why (Jacob, 2026-10-28)
PTown is the town Jacob just shared outside. Its PLAYER updates with this tranche; its SLAB waits on this brief. *"I want to upgrade
Provincetown."*

## 1. The doctrine (read in full first)
- `ORIENTATION.md` "Rounding, three kinds", (3) the lattice: *every cut rounds to one 1 mm grid, once, where the line is born; near-coincident
  vertices join only within the rounding's own bound, √2/2 of a step (`latticeNode.js#NODE_BOUND`). A line cut twice and rounded twice is
  the recurring defect of this repo; the cure is always to cut it once, never a tolerance.*
- Registry: `r-a-way-tag-decides-before-byCoast`, `r-the-coast-bake-holds-an-embankment-as-land`.
- BACKLOG's live handoff: "NAMED DEBTS" (openCloseAtStep's two behaviours) and "PTOWN PARKS" (b); the history is in
  `cartograph/_archive/HANDOFF-2026-10-28.md`.

## 2. What the code does today (measured 2026-10-28; confirm by symbol)
- `cartograph/structures.mjs#openCloseAtStep` opens/closes a region at half a cell with clipper-lib's INTEGER offsets (1 mm lattice).
  Footprints (decks, embankments) are cut once: the result is the source, minus the taken FEATURES, plus the filled ones; a sliver is a
  piece that erodes to nothing at NODE_BOUND (`isRoundingSliver`). The traced water passes `cutOnce: false` and keeps the older integer
  form, because cut-once made crossings in the cut/fill booleans themselves (Huron 44 at (−4820.8, −3834.5), before simplify).
- What's left after cut-once: where a feature meets the source, its end is the re-offset's ROUNDED COPY of a source corner, 0.6–1.41
  units from it, along two near-parallel copies of one edge. That intersection is ill-conditioned, and joining the copies needs a √2
  proximity join, which is ruled out. Deck edges ≤ 2 mm: PTown 57 → 10, Huron 171 → 40 (pre-open: 0, 3).
- PTown's ground refuses at MacMillan Wharf: a 1 mm back-step in ①'s deck edge at (282.795, 113.216) → (282.795, 113.217), made by
  `mintInputs`' deck take-out (`structures.mjs#waterWithoutDecks`: thin water pieces within 2 cells of a deck are taken with it, and
  their cut sides are a re-rounded copy of the water edge). It reaches the mint wherever a street deck sits within 2 cells of a coast
  at a corner (PTown 4 street decks; Huron 0).
- Sizing (Swash): the repo's only polygon library is clipper-lib (integer). Clipper2's float API scales to integers internally too.
  A float erode/dilate with topology (parts splitting, merging, holes) is new robust geometry or a new dependency. Sized LARGE.

## 3. The work, in order
1. **Choose the means, measured, read-only.** Candidates, none decided: JSTS (the JTS port; its BufferOp is a robust float buffer),
   `polygon-clipping` (Martinez–Rueda booleans in floats), or our own float offset built on exact segment intersection. On three
   fixtures (PTown MacMillan's deck + water, PTown's Breakwater strip, Huron's traced water at (−4820.8, −3834.5)), report for each:
   does an unchanged edge stay the SOURCE's own edge (no second copy), topology correct, time per town, licence. ⛔ A new dependency is
   Jacob's call (licence + size): bring the comparison, don't install.
2. **Plan to Zob** (`docs/agents/ZOB.md §2`): the sites (openCloseAtStep, waterWithoutDecks, deckFootprints/stripOf, bake-coast's
   water), what trusts them and what they trust, the checks that see the change.
3. **Build:** one open/close for footprints AND water (the `cutOnce: false` fork deleted, three-part fix), and the deck take-out with
   its cut ends being the source's own points. Rounded to the lattice ONCE, at the output.
4. **COAST_VERSION bump** if coast.json changes; fixtures re-derived.

## 4. Gates
- PTown on coast v5: mint and ground BUILD (or the next refusal is named and is not this class).
- Deck edges ≤ 2 mm back to pre-open (PTown 0, Huron 3); `claims-a-deck-is-every-object-that-covers-it`, `claims-a-dike-is-one-line-with-the-coast`,
  `claims-the-coast-is-one-line-on-the-lattice`, `claims-a-coast-edge-is-no-finer-than-its-trace` green.
- Huron and LS/HPDM: before vs after on the same inputs, every difference named (map.json byte-identical where no deck or water is near).
- A new check that reads the source: no open/close output carries an edge within the lattice of a parallel source edge without being
  it; mutant (an integer re-offset restored) → RED.
- Per-town bake time before vs after.

## 5. Bounds
Branch off `integration/2026-10-20` in `.claude/worktrees/`; `git commit -- <paths>`; canon off-limits except the lines this changes
(ORIENTATION's rounding homes, the BACKLOG debt rows: evicted to the Diary when cured). Heavy runs: ask Boz for the slot by name.
No dev server without asking; Jacob's live stack is :5173/:3333/:3334.
