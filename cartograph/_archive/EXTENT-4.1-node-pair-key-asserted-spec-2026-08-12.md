# RETIRED — `EXTENT-DESIGN §4.1`'s asserted node-pair KEY spec (2026-08-12 → 2026-08-21)

**Why this is here.** `§4.1` carried a box titled *"THE NODE-IDENTITY SPEC — MEASURED AND SETTLED
2026-08-12 (agent Ferrule)"*. Two different propositions were inside it under one title:

1. **Nodes survive a weld.** Ferrule measured this on the real weld. ✅ **It holds and it stayed in
   `§4.1`.** Nothing below disturbs it.
2. **Therefore an ordered node pair can replace `feCustomKey`, and `side` falls out of the pair's
   order, and chains need no permanent id at all.** ⛔ **This was never measured — it was derived from
   (1) and filed as settled.** Measured 2026-08-21 (agent Gimbal, `aa7bdf44`) it **fails**.

This is `CLAUDE.md`'s third mismatch cause — **ASPIRATION**, intent filed as done — which is the
conformance job's own failure mode: it looks exactly like rot, so a tidying pass would have deleted
it instead of surfacing it as work. It is preserved here in full rather than corrected in place.

▶ **Reproduce, never quote: `node scratch/claims-node-pair-key-parity.mjs`** (LS + hipointe-demun,
authoring ON). Live home of the open question: `EXTENT-DESIGN §4.1`.

---

## The retired text, verbatim

> ⇒ **THE KEY: mint a node id, consult by POSITION, validate with the name-set, mint on miss.** That is
> not an analogy to `fetch-msbf.js:179` — **it is the same mechanism**, since the msbf consult keys on
> the building *centroid*, i.e. position. **Tolerance ceiling, measured:** nearest-neighbour distance
> among the 229 is **min 2.53 m** · p05 7.30 · median 49.25 ⇒ **unambiguous below 2.53 m.**
> - ⭐⭐ **A RUN KEYS ON AN ORDERED NODE PAIR `(nodeA → nodeB)` — and the ORDER supplies the left/right
>   datum that `side` currently takes from chain forward-direction.** So the pair replaces **both**
>   `skelId` and `segOrd` in `feCustomKey`, and `side` keeps its meaning **without a chain**. A cap keys
>   on a single deg-1 node. **Measured: 26 of 28 `segOrd` slots keyable, ZERO failing for node
>   instability** (the 2 failures are the derive drift — endpoints absent from `skeleton.json`).
> - ⭐⭐⭐ **∴ CHAINS NEED NO PERMANENT ID AT ALL** — they become exactly what `§1` already calls them,
>   *a downstream view, with identity living on the points.*
> - ⚠️ **The 2 cap slots may be keyed to CLIP ARTIFACTS** (`carroll-street-0`, `south-18th-street-3`) —
>   `skeleton.json` is pre-clip so its deg-1 tips are real, but this was not verified per-tip.

## What measurement did to each clause

| retired clause | verdict, 2026-08-21 |
|---|---|
| tolerance "unambiguous below 2.53 m" | ⛔ **does not survive town #2.** The number was LS-only and was never re-run elsewhere. |
| "26 of 28 `segOrd` slots keyable" | ⛔ **superseded** — a 28-slot sample, not the fe population. Run at fe level on both towns it does not hold. |
| ⭐⭐ "the ORDER supplies `side`" | ⛔ **FAILS on both towns**, corroborated by two independent instruments. The sign convention itself is clean; the breaks sit where an fe's midpoint is not one half-width off its own span, or projects off the end of it. **Cause not established.** |
| ⭐⭐⭐ "chains need no permanent id at all" | ⛔ **does not follow** — it was a corollary of the clause above. Not refuted on its own merits; **unsupported.** |
| ⚠️ cap slots may be clip artifacts | ✅ **DISCHARGED.** All 3 authored LS cap tips verified per-tip: interior real dead ends, deg-1, 224–591 m inside the stencil. `carroll-street-0` and `south-18th-street-3` are not clip artifacts. |

## The finding the box never anticipated

⛔ **The frozen `ribbons.junctionMap` is NOT a superset of the node population the key must consult.**
`§4.1`'s premise is *"a frozen frame fact … carry it, never re-derive it."* A large share of the
consulted endpoints are absent from the freeze at exact coordinates, so the consult would have to
re-derive the very population it is supposed to trust. **This is upstream of every clause above.**

⭐ Note also that `§4.1`'s weld table, `ribbons.junctionMap.nodes`, and the key's consulted set are
**three different populations**. They were read interchangeably. ⛔ Do not merge their counts.
