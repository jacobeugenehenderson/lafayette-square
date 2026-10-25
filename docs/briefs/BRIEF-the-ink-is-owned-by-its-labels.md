# BRIEF — the ink is owned by its labels: no re-stroke past the Wall

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-25 (Boz, on Jacob's "that is what the datawall is for")
evict-when: `inkByOwner`'s and `inkPiecesByOwner`'s quad re-strokes are gone, with ink class and ownership read off ①'s labels + frozen `nodes` by ONE construction; the centre stripe reads a sealed centreline, not `ribbons.streets[].points`; the gates below are GREEN; merged. Then this moves to cartograph/_archive/ dated.
-->

**You are the dispatched agent. Name yourself:** one word, yours, and not one a RUNNING session holds (`ListAgents`, then `/rename`).
**Agent: FRESH.** Kerf and Splice are on other briefs, and this one needs no warm context beyond §1.
**Report to Boz.** **Instruction: confirm-then-build.** Read §1 and the code sites in §2, then tell Boz what you found. If the code contradicts this brief, **stop and flag Boz. The stop is the deliverable.**
**Premise pass: Zob, 2026-10-25, on integration 7ef32564 (read).** It corrected the first premise: the asphalt's street-scale outline and corners already come from the sealed tiles. What this brief fixes is narrower.
⚠️ **Wait for** the seam branch (`BRIEF-the-ink-meets-inside-the-ink`, Splice) to land before building. It rewrites the mint and tileGround's corner readers.

## 0. Why

`ORIENTATION §3`, the Wall: *"after it there is no 'this chain link', only 'this edge of this surface'… every polygon comes from
the frozen shape."* ① already says, for every ink edge, which street and side made it (its labels), and the mint freezes each real
node's outline (`protopolygon.nodes`, built once from all its legs). Past the Wall, two functions decide that again:

- `tileGround.js#inkByOwner` (asphalt, highway and shore classes) and `#inkPiecesByOwner` (shape.json's frozen `ink` pieces, per owner)
  re-stroke every labelled edge of ①'s union ring as a 2ε quad reaching 2ε past each end, then resolve each junction by OVERLAP:
  water first, then highway, then road; per owner, overlaps over `tiny` become multi-owner pieces. That is a second answer to "who
  owns this ink at this node", made from geometry instead of read from ①. It's two constructions of one surface, and neither is the
  mint's. ε-scale (≈10 mm), but it's the class the Wall forbids, and it fails worst where nodes are complex (towns nobody's looked at).
- `bake-ground.js`'s `centreStripeRings(ribbons.streets)` buffers the mint's own input polylines (`points`, chain-indexed) past
  the Wall. They're pour-sealed, but they're chain geometry, not ① or tile geometry.

**Not in scope, and established false:** the asphalt does NOT redraw corners at street scale. Its outline is the tile ring minus
② (`sectionOpen`'s bundle `A`), so its kerb edge follows ②'s eased radius (Zob, read).

## 1. Read first (in full)

`ORIENTATION.md §3` (① · the Wall) · `cartograph/SKELETON.md` "AND ITS HOME IS THE MINT" · `cartograph/RIBBONS.md §1` (the
four invariants; the anti-patterns) · `docs/briefs/BRIEF-the-rim-is-cut-once.md §5` (the overlays, the stripe included, join ①'s
one stamp; **unbuilt**, Zob read; this brief gives the stripe its sealed INPUT, and §5 gives it its STAMP; don't build §5 here).

## 2. Premises: claims to confirm (by symbol)

1. `inkByOwner` and `inkPiecesByOwner` build quads from ①'s labelled union edges and decide junction ownership by overlap; nothing
   reads `protopolygon.nodes` there.
2. `protopolygon.nodes` (frozen by the mint) holds each real node's outline with its legs. Does it carry enough to split a node's
   ink between owners without geometry? If not, say what the mint must add. ⛔ The mint is the only place a chain is read.
3. `sectionOpen`'s `A = differenceRings([tile ring], ② block)` unions in `inStencil(roadInk)` and the curbless `kind: 'block'` ink pieces.
4. `centreStripeRings` reads `ribbons.streets[].points` for STRIPE_CLASSES, not oneway, not grade-separated, buffered 0.10 m.

## 3. The fix

1. **One construction for the ink's class and owner, read off ① past the Wall:** each ink edge takes its label's owner and class;
   at a node, the frozen node outline splits the ink between its legs. The quads and the overlap resolution are deleted, in BOTH
   functions, and the two become one function, read by asphalt/highway/shore and by shape.json's `ink`.
2. **The stripe reads a sealed centreline.** The mint (or the pour, right beside it) carries each striped street's centreline as an
   owned feature in ①'s record, the way the ruled sand line is ink made in the pour. `centreStripeRings` reads that, never
   `ribbons.streets`. Which record carries it, and why: propose it to Boz before building.
3. **Removed in the same commit:** the quad re-stroke code, `centreStripeRings`' chain read, and any reader left of the removed paths.

## 4. Gates

- `claims-no-edge-is-drawn-twice` on the four poured towns: ink-touching rows (asphalt/highway/shore against anything) no worse,
  and every row that moves explained. ▶ the asphalt/curb row's cause is being measured separately (Zob's HPDM site read); this
  brief doesn't own that row unless the read says it's an ink-ownership row.
- shape.json's `ink` owners equal ①'s labels on every ink edge (a new check reading both; mutant: a re-stroke resolution).
- The stripe: the same stripe geometry as today within the lattice step, on four towns (a check), plus
  `claims-a-closed-stripe-keeps-its-hole`.
- `claims-proto-frozen-matches-live` (cited by Zob, not run at this head): run it.
- Validation through the production path (Survey and the Stage bake), never a parallel spike.

## 5. Bounds

- Write: `src/lib/tileGround.js` (`inkByOwner`, `inkPiecesByOwner`, the mint's record if §3.2 needs it), `cartograph/bake-ground.js`
  (the stripe's read), new checks. Canon is off-limits: surface conflicts to Boz.
- Branch off `integration/2026-10-20` (after the seam lands), in `.claude/worktrees/`, with `git commit -- <paths>`. Boz merges, on Zob's PASS.
- Heavy runs only in the slot, granted by Boz by name. No re-pour of every town; the tranche re-pour is Boz's.
- Commit message names the register it reached, or says "reaches no register".
