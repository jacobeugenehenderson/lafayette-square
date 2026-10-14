# The short-edge label fix — the trade, on one page (2026-10-14, Tern; for Jacob via Boz)

**The fix** (parked, uncommitted; the diff is `label-fix-2026-10-14.patch` beside this file): inside `offsetRingByRects`,
an edge too short for `labelOf` to see (2–4 mm, lying on a contributor, overlap ≤ TOLC) takes the label of the edge it
leads into — `mergeGrid`'s own rule, forward by ring adjacency. It labels the 52 (Huron) / 76 (HPDM) ② vertices ①
never labelled (`unlabelled-cause.mjs`). Because ② reads corners off the labels, it also eases **nine corners ① names
that the gap had kept sharp**, and it moves painter verdicts both ways — this page.

Every count below is **re-derivable**; none is to be quoted without its command.

## Walk — does a block's sidewalk close as ONE band (`checks/claims-sidewalk-is-one-band.mjs`'s own test)

| town | HEAD → fix | blocks that changed (owners off the polygon) |
|---|---|---|
| Huron | 90 → 88 | tile 77 one → two (crescent-drive-1 right · wasta-avenue right · franklin-drive left · winona-avenue …) · tile 166 one → two (ridgewood-avenue right · richland-avenue-0 left · high-street right) — **both at two of the nine restored corners** |
| HPDM | 172 → 170 | tile 58 one → **none** (de-mun-avenue-3/-2 left · alamo-avenue-0 left) · tile 88 one → two (founders-way right · seminary-place-1 right · residential-217 left) · tile 241 one → two (trinity-avenue-1 · kingsbury-boulevard-2 · north-big-bend-boulevard · washington-avenue-1) · tile 213 two → **one** (rosedale-avenue-5/-4 · waterman-boulevard-1 · north-skinker-boulevard-0 …) |

Why a restored corner splits the walk, and how the label change reaches HPDM's tiles 58 / 88 / 241 (none of the nine
sites): **not established**.

## Arcs — every ① turning vertex's verdict (`checks/claims-every-turn-in-the-protopolygon-gets-an-arc.mjs`'s own test)

| | Huron | HPDM | total |
|---|---|---|---|
| made → **dropped** (an arc lost) | 16 (tile 2 v13 105.4° jeffries/knight/river-road; 15 on tile 24's lake shore, 18–59°) | 2 (tile 199 v9 98.8° westgate-avenue-1 · pershing-avenue-10; tile 224 v8 61.6° north-skinker-boulevard-0 · mcpherson-avenue-3/-1) | **18** |
| dropped → **made** | 14 (all tile 24's shore) | 2 (tile 204 v5, tile 233 v4) | 16 |
| absent → **made** | 0 | 1 (tile 213 v6, 138.4°) | 1 |
| *newly made* | | | **17** |
| dropped → stampLost (the arc now EXISTS; the check cannot see its ① stamp) | 2 (tiles 77, 101) | 4 (tiles 52, 126, 186, 206) | 6 — six of the nine restored corners |
| made → stampLost (traceability only) | 2 (tiles 24, 62) | 4 (tiles 58, 89, 105, 204) | 6 |

## Slope — discontinuities > 5 cm across one vertex (`checks/claims-the-slope-is-on-the-leg.mjs`)

HPDM 342 → 200 · Huron 579 → 457 · Jackson Heights 539 → 284 · LS 313 → 231 · Provincetown 534 → 436 — **2,307 → 1,608 (−699)**.

## The trade

- **Gained:** nine corners restored (sites, turns, radii, displacement: Tern's measurement to Boz; on Jacob's street-level
  eye list) · 699 fewer slope chevrons across five towns · one HPDM walk closes · 17 arcs newly made.
- **Lost:** four blocks' walks stop closing as one band (two of them AT restored corners) · 18 arcs now dropped (16 on
  Huron, 15 of those on tile 24's lake shore, which churns 15 out / 14 in).
- **Shuffled:** 12 arcs between made/dropped and stampLost — a traceability verdict, not a corner.

## Reproduce

```sh
# the fix: apply the patch to a clean tree (or check out the parked worktree)
git apply scratch/ground-budget/label-fix-2026-10-14.patch
# per block / per turn, on HEAD's tileGround (in-memory swap of a copy of HEAD's file) and on the fix
git show HEAD:src/lib/tileGround.js > /tmp/tg-head.js     # any path; the swap serves it under the real URL
SWAP_MAP='{"/src/lib/tileGround.js":"/tmp/tg-head.js"}' node --max-old-space-size=8000 --import ./scratch/kerb-cut/swap.mjs \
  scratch/ground-budget/label-fix-blocks.mjs huron huron-head.json
node --max-old-space-size=8000 scratch/ground-budget/label-fix-blocks.mjs huron huron-fix.json    # with the patch applied
# (same for hipointedemun) — then match blocks and turns by key: a walk verdict that moved, a turn verdict that moved
# the totals: the three checks above, on HEAD and with the patch
```
One proto pour per town and side (≈1–2 GB); run them one at a time.
