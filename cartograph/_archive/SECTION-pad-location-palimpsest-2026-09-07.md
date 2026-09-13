# The pad-location palimpsest — three doctrines written over each other

**Retired from `SECTION.md §6.1` on 2026-09-07**, on Jacob's instruction: *"Fix the code, fix the
docs. Get rid of the palimpsest."*

Over about thirty hours this block was rewritten three times, and each rewrite was layered on the
last instead of replacing it, so it ended up asserting all three at once:

1. **the pad is predicated on the fillet ARC** — the original;
2. **⛔ NOT THE ARC — the pad is located by the OWNER CHANGING**, arc supplies only the extent;
3. **⛔ NOT THE ARC AND NOT THE OWNER EITHER — where ① TURNS *and* the owner changes.**

Each correction was right about its predecessor and none deleted it. ⭐ **The reason it mattered:
`RIBBONS §1` invariant 1 was saying the whole time that a corner is not located at all** — *"the
corner is the band BENT around the arc, a slice of the same continuous concentric offsets, NEVER a
separately-constructed primitive"* — and no layer of this block ever reconciled with that, so four
successive constructions were built against a doctrine that had already been superseded one doc over.

⛔ Preserved because the *measurements* in it are sound and their commands still run. ⛔ NOT live
doctrine — the live form is `SECTION §6.1` and `RIBBONS §1`'s four invariants.

---

> ### ⭐⭐⭐ WHERE THE PAD IS LOCATED — AMENDED 2026-09-07 (Jacob). ⛔ **NOT THE ARC, AND NOT THE OWNER EITHER.**
> **The pad is located where ① TURNS *and* the owner changes; the arc supplies only its EXTENT.**
> > *(Jacob, on the canary: "Are you **positive** you are working from and only from the protopolygon?
> > **The protopolygon doesn't have a node/corner there in the first place.**")*
> ⛔ **This line read "located by the OWNER CHANGING" and that alone was wrong** — an owner is a chain
> identity (`protoOwners[].skelId`, ordinal stripped), so it cannot answer a question about ①'s shape.
> **The shape answers WHETHER, the label answers WHOSE.** Full law + why not the turn alone:
> `RIBBONS §1`, "the corner test, in its corrected form".
> ⛔ **AND THE EXTENT IS `len` EDGES, NOT `len + 1`.** An arc from vertex `a` to vertex `b` spans the
> edges *between* them; the inclusive bound also claimed the first edge of the next leg, and on ①'s
> sparse contour a straight frontage is ONE EDGE — one quadrilateral block painted **458 m of 458 m**
> as curb ramp, its treelawn erased. ▶ the gate, by LENGTH and reading the painter rather than
> restating it: `SECTION_DUMP=1 node checks/claims-the-pad-is-the-size-of-the-corner.mjs`
> ⭐ **The two towns agreeing is the evidence, not either number** — the pad's share of kerb was 32%
> against 39% before and 3.4% against 3.6% after; the divergence WAS the defect's signature, because it
> scaled with how sparse the contour is and so read worst on the town nobody has stared at.
> *(Written as the cure in `8753ea91`'s own commit message on 2026-09-06 and not built for a day, while
> three sessions re-derived it. `CLAUDE.md`: reuse forensics, never re-derive.)*
> - ⛔ **Predicating the pad on the fillet is `RIBBONS §1` invariant 3 broken** — *"a band-slice, NOT
>   predicated on the arc, so it works square OR round."* Measured when it was: most arrangement steps
>   did not sit inside a fillet arc, so **most corners were bare**, and every square corner declined.
> - ⭐ **The owner is the FRONTAGE, not the run.** A run is cut wherever `segOrd` changes, and one
>   frontage can carry several — so a `segOrd` change draws a corner treatment in the middle of a
>   straight block edge where nothing turns and nothing changes. ▶ `node checks/claims-frontage-covers-the-block.mjs`
> - ⭐ **A stamp cannot decline.** At contour points inside the corner the stamp says concrete and the
>   same four offsets draw it — no sector, no intersection, no bid. The walk painter's four decline
>   gates decline a majority of its bids; this has none.
> ⛔ **The SLIDE is not the pad.** It carries a *change*, so it belongs to the mixed config alone
> (`§6.1` step 5). The pad is unconditional — `§6.1` step 3, the curb side of a corner is concrete
> ALWAYS. Conflating them removes the pads at every corner whose two sides agree.
> ▶ `node checks/claims-sidewalk-is-one-band.mjs` · `node checks/claims-survey-and-section-agree.mjs`
> ⛔ Re-run them; the counts move, and the closure count REWARDS over-painting — a leg painted
> all-concrete trivially closes. Do not tune against it alone.

