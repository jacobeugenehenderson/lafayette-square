# BRIEF — the rim is cut once: no sub-lattice slivers where the drawing meets the disc

<!-- BRIEF-STATE
status: OPEN
dispatched: Mitre (WARM), Boz overnight 2026-10-21 under Jacob's standing rule (a stopper convenes Zob + the specialist; keep going)
written: 2026-10-21
evict-when: HPDM's rim residue (B1 + B2) and LS's asphalt needle are gone at the source, the mutants below each go RED, the build is merged to integration; then this moves to cartograph/_archive/ dated.
-->

**Agent: WARM → Mitre.** **Report to Boz.** **Instruction: confirm-then-build.** Premises are Zob's and Mitre's
measurements (2026-10-21 night); check each against the code and say what you found. If the code contradicts this
brief, stop and flag Boz.

## 0. Why

After the flatten noding and the height-code fixes, HPDM's ground bake still refuses on unowned ped vertices AT THE RIM.
Two mechanisms, both lattice rounding meeting the disc (Zob, measured; scripts in Zob's session scratchpad `rim/`):

- **(A) a crossing minted PAST the rim on ONE operand's copy of a shared line** (HPDM's B2: 261 points, 247 in tile 242).
  In `sectionPassProtoTile`, the lawn's operand (`less(env − Wp)`, env = band(pedOuter, luIn0) ∪ envX) carries a vertex
  262.9 m along a line it shares with the curb's operand (`less(band(curbOuter, pedOuter))`), past the rim crossing at
  ~199 m. Rounding that vertex to the lattice tilts the lawn's copy 0.416 mm. The oblique block cut (`inBlock` =
  `intersectRings(rings, st.iA)`) then crosses the two copies 0.6 mm apart, which rounding takes to a 1.41 mm pair.
  Inside the disc the copies stay within the flatten noding's √2/2 bound. Only the oblique cut magnifies them past it.
- **(B) the drawn rim sits up to √2/2 step off the stencil** (most of HPDM's B1: 341 points 0–2 m inside the disc; Huron
  15; LS 3). A one-sided offset (0.46 mm across the rim) that the deformer's ray, meeting the rim 65° off its normal, reads
  as a ~1.1 mm lot slice, so `bandsAlong` returns before the band (`sawBand` starts true when the ray starts 'beyond').
- **(C) related, separate site:** LS's asphalt needle (Plumb): the disc stamp in the sectionOpen finish (`cut`/`cutOwned`
  → `intersectRings(…, [MP.boundaryRing])`) mints a crossing 0.166 mm off the rim chord that the tile ring doesn't share.

## 1. The fix, at the source (⛔ never a deformer tolerance, never a wider window)

1. **(A): cut the band OPERANDS by the disc BEFORE the band differences** (pedOuter, luIn0, env, envX, curbOuter …), so
   no crossing past the rim ever exists on any copy of a shared line. ⛔ Adding a disc cut to each operand at the end
   does NOT close it (Zob). Alternatively, if (1) is wider than it looks: share ONE rim crossing per line across classes.
   Say which you build and why.
2. **(B): make the drawn rim the stencil.** The rim edge of every painted piece lies ON the stencil's own lattice
   vertices (the same ring the deformer's 'beyond' test reads), so a ray leaving 'beyond' enters paint with no lot
   between. Find where the drawn rim and `stencil.clipPolygon` / `MP.boundaryRing` diverge, and make it one ring.
3. **(C): the disc stamp's crossing is shared with the tile ring** (the block and the road strip `ring − iA` meet the rim
   at the same vertex), so no sub-lattice needle is left in `A`.

## 2. Mutants, each must go RED

1. A beyond-rim vertex on one operand's copy of a shared line → a ≥ 1 lattice pair at the rim (B2's class). 2. The drawn
rim offset from the stencil by one step → a lot slice on a 'beyond' ray (B1's class). 3. The disc stamp's crossing not
shared with the tile ring → a sub-lattice needle in `A` (LS's class). Name the check (new or a row in an existing one).

## 3. Gates

Light first, on your producer dumps / an in-memory tile run: HPDM tile 242's 1.41 mm pair gone; B1's ray at
(1352.96, 310.57) reads walk, not lot; LS's tile-133 needle gone. Then the unowned count per town with the deformer
alone (target: HPDM's 599 → its non-rim remainder; name what's left by class). Then report and stop. The batch bake is
Boz's, after Jacob's go.

## 4. Bounds

Branch off `integration/2026-10-20` in a worktree under `.claude/worktrees/`; commit by pathspec; never push; Boz merges.
⛔ No served bake, Publish, Promote or Stage; never write `clean/` or `public/baked/`. Heavy runs: ask Boz (Kerf's
census holds the slot overnight). Measure before writing. Registers: `RIBBONS §1` (the compound shape: "the rim is an
edge of the drawing") if the construction's description changes, or say "reaches no register".
