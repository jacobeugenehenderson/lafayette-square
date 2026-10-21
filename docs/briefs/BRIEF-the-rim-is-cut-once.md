# BRIEF — the rim is cut once: no sub-lattice slivers where the drawing meets the disc

<!-- BRIEF-STATE
status: OPEN
dispatched: Mitre (WARM), Boz overnight 2026-10-21 under Jacob's standing rule (a stopper convenes Zob + the specialist; keep going)
written: 2026-10-21
evict-when: HPDM's rim residue (B1 + B2) and LS's asphalt needle are gone at the source, the mutants below each go RED, the build is merged to integration; then this moves to cartograph/_archive/ dated.
-->

**Premise pass: Zob, on db33055c; corrections folded in.** **Agent: WARM → Mitre.** **Report to Boz.** **Instruction: confirm-then-build.** Premises are Zob's and Mitre's
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
- **(B) a rounded crossing ON the rim chord, not shared with the stencil the deformer reads** (HPDM's B1: 341 points 0–2 m
  inside the disc; Huron 15; LS 3; the split between B1's kinds is measured on one point of each only). All 256 vertices of
  `MP.boundaryRing` are on the lattice, so the painted rim runs exactly along the chord, EXCEPT at crossings minted on it
  (band lines × iA's rim edge in `inBlock`; iaFull × disc in `cut(t.iA)`), each rounded up to √2/2 step off the chord
  (Zob, measured). The deformer's 'beyond' test reads the exact chord (`stencil.clipPolygon`), so between the chord and a
  paint edge tilted toward a rounded crossing lies a thin lot wedge; its ray, 65° off the normal (station (1354.904,
  308.036), direction (−0.60868, 0.79341)), reads ~1.1 mm of lot and `bandsAlong` returns before the band.
- **(C) related, separate site:** LS's asphalt needle (Plumb): the disc stamp in the sectionOpen finish (`cut`/`cutOwned`
  → `intersectRings(…, [MP.boundaryRing])`) mints a crossing 0.166 mm off the rim chord that the tile ring doesn't share.

## 1. The fix, at the source (⛔ never a deformer tolerance, never a wider window)

**Boz's call (overnight, under ruled doctrine; flagged to Jacob): (A) + (B via route ii) + (C via route i on the ring).**
1. **(A): move `inBlock` (∩ `st.iA`, never the disc) onto each PAINT operand before the band differences**, at its
   producer sites: (1) `insDL`'s return (pedOuter, luIn0, LV_wf/LV_wt → W) · (2) `ins` · (3) `curbOuter` · (4) `legExt`
   (walkX, envX0, walkCut) · (5) perpPieces / ramps / R.masks / roadBand. Leave the labelled level rings (LV_*) that
   bandPiecesOfTile's cells read uncut: the pieces cut the painted band, so they follow the paint (Mitre; confirm).
   ⛔ Never cut `parts` (iaFull) by the disc before the offsets: that bends the bands around the rim, which the design
   forbids. ⛔ A disc cut added at the END doesn't close it, and a wider snap across classes is a tolerance.
   Measure whether two independently offset copies still arrive with different crossings at the rim; say so if any remain.
2. **(B), route (ii): the deformer's 'beyond' test reads the DRAWN block's rim** (the cut iA, which carries the rounded
   crossings), not `stencil.clipPolygon`. "The rim is an edge of the drawing" (`ORIENTATION`, the compound shape): the
   drawing decides. ⛔ A lattice point can't lie on a general chord, so "snap the paint onto the stencil" isn't buildable.
   If (ii) touches the fade, the ink clip or membership, stop and say which.
3. **(C), route (i) on the ring: the disc stamp inserts iA's rim crossings into the cut tile ring** (the exact vertices
   `cut(t.iA)` minted, matched exactly, never within a tolerance), so `ring − iA` leaves no needle.

## 2. Mutants, each must go RED

1. A beyond-rim vertex on one operand's copy of a shared line → a ≥ 1 lattice pair at the rim (B2's class). 2. The drawn
rim offset from the stencil by one step → a lot slice on a 'beyond' ray (B1's class). 3. The disc stamp's crossing not
shared with the tile ring → a sub-lattice needle in `A` (LS's class). Name the check (new or a row in an existing one).

## 3. Gates

Light first, on your producer dumps / an in-memory tile run: HPDM tile 242's 1.41 mm pair gone; B1's point (1352.96, 310.57),
read along Mitre's ray (station (1354.904, 308.036), direction (−0.60868, 0.79341)), reads walk, not lot; LS's tile-133 needle gone. Then the unowned count per town with the deformer
alone (target: HPDM's 599 → its non-rim remainder; name what's left by class). Then report and stop. The batch bake is
Boz's, after Jacob's go.

## 4. Bounds

Branch off `integration/2026-10-20` in a worktree under `.claude/worktrees/`; commit by pathspec; never push; Boz merges.
⛔ No served bake, Publish, Promote or Stage; never write `clean/` or `public/baked/`. Heavy runs: ask Boz (Kerf's
census holds the slot overnight). Measure before writing. Registers: `RIBBONS §1` (the compound shape: "the rim is an
edge of the drawing") if the construction's description changes, or say "reaches no register".
