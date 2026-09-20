# Excised 2026-09-20 — the "intersect, and the rim edge comes out owned" text in `mintProtopolygon`

`RIBBONS §1` marked this ROT on 2026-09-06 ("THIS SECTION USED TO SAY the mint 'unites the whole
grid and then INTERSECTS' and that a rim edge 'comes out owned' by `__boundary__`. Both are ROT")
and the correction has been correct there ever since. **The code header was never updated**, so the
rotten wording sat in `src/lib/tileGround.js` for two weeks reading as current doctrine.

⭐ **It was read as current on 2026-09-20 and cost a day.** An agent building the shoreline read this
header, did not read four lines further into `RIBBONS §1` where it is struck, and wrote "shore edges
come out carrying `__boundary__`, resolve to no measure, `depthAt` → 0" into two commit messages as
the design rationale. **0 of LS's 275 block faces carry a single `__boundary__` label.** Under
stamp-last a block runs PAST the rim and is cut afterwards, so there is no rim edge to own.

## The excised text, verbatim

> ⇒ Build the WHOLE grid, then INTERSECT. The boundary is the CLIP, never a subject.
>
> ⛔ WHY THE OTHER READING IS WORSE, AND IT IS NOT A STYLE CHOICE. Uniting a boundary line
> into ① leaves every street's ink running THROUGH and PAST the perimeter, so the rim becomes
> a chain of slivers between the circle and each crossing street — Jacob's "weird odd shapes".
> Intersecting cuts every street SQUARE at the edge: "there should be no tips; the streets clip
> at the perimeter edge." A square cut has no endpoint, so there is nothing for a cap, a bulb
> or a fillet to be built on. That is the point — the defect class is removed rather than
> guarded against downstream.

> ⇒ Subtract the ink FROM the disc: a rim block comes out whole, bounded by ink on some edges
> and by the circle on the rest. Its circle-side edges carry `__boundary__` and resolve to NO
> measure, so `depthAt` returns 0 there — which is already the ruled behaviour at the map edge
> ("edgeDepth → 0, land-use floods to the boundary, no curb/sidewalk on the map edge").

**Live home for what replaced it:** `RIBBONS §1`, "THE CIRCLE IS STAMPED LAST, ON FINISHED GEOMETRY".
