# Metcalf — Section per-edge FILL: gate evidence (2026-06-07)

Build to `SECTION.md §3.3` (per-edge depth + divider + bent corner + one-depth-truth handles).
Branch `metcalf-section-per-edge` off trunk `2b39451`.

## Reproduce
```
node scratch/metcalf-fill-snapshot.mjs <out.json> [--empty-customs]   # full buildTileGround → coordinate dump + areas
node scratch/metcalf-fill-diff.mjs <before> <after> [out.svg]         # per-class XOR (signed, donut-safe) + locations
node scratch/metcalf-fill-render.mjs <snap> <out.svg> [cx cz halfW]   # eyeball render (LU cream/TL green/SW pink)
node scratch/metcalf-migrate-customs.mjs [--write]                    # the design.json depth-baggage strip
```
Snapshots kept: `metcalf-BEFORE-{empty,customs}.json` (HEAD `2b39451` code) ·
`metcalf-AFTER4-{empty,migrated}.json` (this build + the migration).

## Machine gates
- **Shape untouched:** asphalt / curb / block **IDENTICAL** (byte-equal coordinate
  dumps) in both the no-customs and real-customs comparisons. The mono-width band
  offsets are the same `iA` insets (now cached per depth, `ringAt`); the silhouette,
  `vertR`, the wall signature — untouched.
- **No-override = best-effort:** with the migration applied, every blockCustoms
  entry carries only `pavementHW`/`terminal`/`materials` → the FILL resolution falls
  through to gleaned-Y × ADA everywhere → customs-on equals customs-off plus the
  long-standing pavementHW asphalt effects.
- **The FILL delta is exactly the §3.3 classes** (`metcalf-diff-final.svg[.png]`,
  probed by grid + transect):
  1. **Treelawn-N legs in mixed tiles** stop collapsing to full-band SW → ADA SW
     hugging the curb + LU beyond (sidewalk XOR 37.0k m², the dominant term —
     verified by transect: `A…C SSS LLL…` after vs `A…C SSSSSSS…` before).
  2. **Corners at `cw + max-adjacent`** — SW↔SW corners sidewalk-deep (was full-band).
  3. **Divider now concentric to the frozen curb** (`ringAt`), not the centerline
     datum — treelawn follows flared/offset curbs (junction windows, divided
     corridors: e.g. Truman-outboard park sliver at (652,−165) gains its gleaned-Y
     1.5 m strip the old slab-datum missed). Treelawn XOR ≈ 3.2k m² total across LUs.
  4. **Round dead-end wraps go per-edge:** an N street's cap wraps SW-only (the old
     green collar there was the tile-uniform tl leaking onto alley caps).
- **Override drags the strip** (through the FROZEN artifact, `sectionOpen` on
  shape.json): `grattan-street/left/0 {treelawn:3, sidewalk:2}` → resolution flips
  `{tl:3, sw:2, hasTL:true}`, treelawn +285 m² / sidewalk −256 m², changes local to
  Grattan's corridor. Nothing re-derives: same frozen `iA`, same artifact.
- **Live cost:** `sectionOpen` full FILL re-stroke 265 ms (HEAD) → 530 ms (naive
  per-run peel) → **~365 ms** after grouping legs by identical (depths, mats) — one
  peel per group, 1–2 groups on a default tile. Grouping is geometry-neutral
  (2 m² of Clipper micro-slivers map-wide vs the ungrouped build).

## The migration (design.json)
16 blockCustoms entries carried `treelawn`/`sidewalk` copied from surveyed chain
seeds by **Survey pavementHW drags** (and the old swap/drag seeding) — never
readable intent (no depth read path existed). Stripped (`metcalf-migrate-customs.mjs
--write`); `pavementHW`/`terminal`/`materials` kept. All three writers now seed
depths from `resolvePedDepths`, so new entries carry resolved depths as intent.

## For Jacob's eye (the real gate)
- a treelawn/sidewalk handle sits ON its strip and drags it live (curb still)
- ctrl-click swap still works; slots are positional (N edges: outer=SW at curb)
- SW↔SW corner sidewalk-deep · both-strips-LU = open field
- the per-edge defaults at: alley/N legs (SW now ADA-deep, not band-deep), round
  dead-end caps of N streets (no grass collar), junction mouths (treelawn follows
  the constructed curb) — flagged because they LOOK different from the old map.

## Pushed back on the canon / tail items (report, don't fold)
- `SECTION.md §3.3` "byte-identical when nothing is overridden": **not literally
  satisfiable** while also shipping two-strips-always + max-adjacent corners — those
  change the un-authored render at mixed tiles by design (Jacob's-eye gate itself
  expects "SW↔SW corner is sidewalk-deep", which differs from today). Delivered
  instead: shape byte-identical + FILL delta exhaustively classified above.
- N edges expose no treelawn-outer handle (tl=0 → nothing to grab): growing a
  treelawn onto an N edge needs the panel's Treelawn field (works) or a future
  gesture. §5 table holds for Y edges.
- MeasurePanel's `inferTerminal` writes `terminal:'lawn'` for tl=0 edges → the
  strip-hit gate (`terminal !== 'sidewalk'`) then blocks ctrl-click swap on that
  edge. Pre-existing; FILL ignores terminal. Tail item.
- The old construction quirk where a Y-leg's **inner** strip mostly lived in the
  all-SW remainder (so an inner material swap had little to recolor) is fixed as a
  side effect — the inner strip is now the real sidewalk band slice.
