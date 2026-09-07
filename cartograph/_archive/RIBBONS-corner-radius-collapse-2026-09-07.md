# The corner-radius collapse, and the cap-apex false positive — retired detail

**Retired from `RIBBONS.md §1` on 2026-09-07.** Both defects are CLOSED; what stayed live in §1 is
the two lessons (`FILLET_TURN_TOL` is one rule with three readers · an instrument that reads the
INTENTION cannot see the ACHIEVEMENT). The mechanism narrative and its figures live here.

⛔ **This file also preserves a sentence that is now FALSE, deliberately, so a reader who meets it in
an old commit can find its correction:** *"the owner changing is a corner."* It is superseded by
`RIBBONS §1`'s corrected corner test — **a corner is a vertex where ① TURNS *and* the owner
changes.** The owner is a chain identity; it cannot answer a question about ①'s shape.

---

## The collapse (closed 2026-09-06)

**Jacob, marking a fresh set:** *"sharp corners which look to be skipped altogether."* They were not
skipped — they were planned, stamped at the authored 4.50 m, and **drawn at 0.9–1.9 m**.

**THE CAUSE.** `easeContour` did not carry `filletRing`'s `FILLET_TURN_TOL`. It planned a corner at
**every** vertex wanting a radius — a large share turning under a shallow angle, i.e. curve samples,
not corners — and `legBack`/`legFwd` terminate on ANY such vertex. So a curve sample sitting a metre
from a real 90° corner **truncated its leg**, `s = min(want, legBack/2, legFwd/2)` collapsed, and
`Reff = s/tan(θ/2)` collapsed with it.

⛔ Not a new threshold: the constant already existed, at the other constructor, ruled.

**Figures at the close** (⛔ historical — re-derive with
`node scratch/claims-proto-corner-is-authored-radius.mjs`, never quote these):
marks achieving <60% of stamped radius **19 → 0** · planned corners **2,089 → 1,208** · collapsed
setbacks **426 → 230** · achieved-radius **p10 1.45 → 2.71 m** · within 25% of authored **66% → 79%**.

## The cap-apex false positive (closed the same day)

A cap apex is where **ONE chain's two sides meet**. The cap branch keyed on `a.tipEnd || b.tipEnd`
— *"either edge belongs to a tip"* — so **64 in-disc street corners next to a dead end took the cap
rule** and a blunt default returned R = 0. **145 genuine apexes, 64 false.** Same `skelId` both
sides is the apex.

---

## The half-turn framing (retired 2026-09-07, from `RIBBONS §1`)

Before it was measured, the cap coupler was written up as a question awaiting Jacob's call:

> *"A single cubic cannot hold a half-turn; the coupler is **two** segments split at the apex, or the
> bezier is ruled canonical and `bbf4adf6`'s circle becomes its approximation. Jacob's call, not made."*

⛔ **The question only exists if the tip is ONE node turning 180°. It is not** — ① butt-ends, so its
left and right boundaries each stand ε off the centreline; the tip is **two ordinary corner vertices**
2ε apart, each turning about a right angle, and nothing is asked to hold a half-turn. Jacob: *"There
are 2 apexes."* Live form and its command: `RIBBONS §1`.
