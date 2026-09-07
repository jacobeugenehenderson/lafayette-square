# Retired — `PIPELINE.md` §3a, the ARTIFACT CONTRACT block (2026-09-06)

**Why it is here.** This block was written on 2026-09-06 to answer *"what stops ① becoming the
producer?"* Its answer — **the artifact contract, and the proto tile satisfies 3 of the 14 required
fields** — was correct when written and was **superseded the same evening**, twice over:

1. **The produce/refuse split was RULED** (`df04b455`, then `50871138`) — the eleven unsupplied fields
   are not a to-do list. **2 are supplied (`runs`, `lu`), 9 are refused with reasons.** The live home
   is `RIBBONS §1`, *"RULED 2026-09-06 — THE PRODUCE/REFUSE SPLIT FOR ①'s TILE."*
2. **① became the producer for Survey and Section** (`84cb6a5b` · `dfd95f3b` · `e14f17f9`), so the
   block's framing — *"what STOPS ① becoming the producer"* — no longer describes an open question.

⛔ **Its live residue was kept in `PIPELINE.md` and is not duplicated here:** the union-with-optional-
members shape of the contract, the two-proto-objects warning (`tilesFromProto` vs `protoShapeTiles`),
and the derive-both-sides command. Those are still true and still load-bearing.

⭐ **The lesson the block earned, kept because it outlived its own subject:** *"how many fields does a
tile have"* was never the question. *"How many REQUIRED fields does my tile fail to supply"* is, and
only the required/optional split makes it askable. **Three counts were produced before anyone asked
the right question, and each was a perfectly good count of the wrong thing.** That is `S7`'s shape
(`DOC-CODE-COHERENCE`) — a number answering a different question than the one asked, with nothing in
the number to say so.

---

## The retired text, verbatim

> ### ⭐⭐ AND THE BLOCKER IS THE **ARTIFACT CONTRACT**, NOT THE GEOMETRY — read this before you plan the switch
> ② and ③ are correct. What stops ① becoming the producer is that **a frozen block and a proto block are
> not the same object.** The frozen artifact carries a rich per-block record — the ring, the curb, the
> per-vertex radius, the band depths, the tip typology, the run identity, the edge provenance, the
> producer stamp — and the proto path emits a ring and its owning edges. **It was baked anyway, and
> Section came out disconnected; the bake is back on the chain artifact.**
>
> ⛔⛔ **AND THE CONTRACT IS A UNION WITH OPTIONAL MEMBERS, NOT A FIXED FIELD LIST — that is the shape of
> the answer, and it matters more than its size.** On LS: **20 keys across the artifact, but only 14 on
> every block; 6 are optional.** ⇒ **A consumer may not assume a field is there, and a producer emitting
> all of them would be over-promising.** Planning against "the tile has N fields" is planning against
> something that does not exist.
>
> ### ⭐⭐⭐ THE FIGURE A PLANNER ACTS ON: **the proto tile satisfies 3 of the 14 required fields.**
> Not "5 of 17", not "5 of 20". `protoShapeTiles` carries `ring · iA · bands · producer ·
> producerReason` — of which **`ring`, `iA` and `producer` are required, `producerReason` is optional,
> and `bands` is an addition rather than a substitution.**
> **The 11 required fields it does not supply:** `vertR` · `tl` · `sw` · `lu` · `roundTips` ·
> `bluntTips` · `roundTipKeys` · `runs` · `bandJoin` · `cap` · `fillets`.
>
> ⛔ **But do not read that as "produce eleven more fields."** `bands` ships **the FILL already
> painted** — the code says so at the push site: *"not `runs` for something else to re-stroke."* That is
> a deliberate change of model, not an omission, and it means some of the eleven (`tl`, `sw`, `runs`)
> may want **explicit refusal** rather than supply. ⭐ **Which of the eleven must be produced and which
> must be refused is the open design question** — and it is the real content of "switch ① on."
>
> ⭐ **And note how this figure was reached, because it is this document's own lesson:** *"how many
> fields does a tile have"* was never the question. *"How many REQUIRED fields does my tile fail to
> supply"* is, and only the required/optional split makes it askable. **Three counts were produced
> before anyone asked the right question, and each was a perfectly good count of the wrong thing.**
>
> ⛔ **Derive it — both sides, and don't sample one block:**
> ▶ `node -e "…"` *(the command; kept live in `PIPELINE.md` §3a)*
> ▶ and ⛔ **name which proto object you mean** — there are two, with different shapes.
> `tilesFromProto` returns `{ring, edges}` and is called by **nothing** in `src/`; what `--proto`
> actually freezes is `protoShapeTiles`. Saying "the proto tile" without saying which is how a real
> gap gets stated as an unreproducible number.
>
> *(Three counts were in circulation on the day this was written — 17, 20 and 5 — and none survived the
> command. The 17 came from reading `tiles[0]` and reporting it as the population.)*
>
> ⇒ **The sentence that eventually replaces "produces nothing that ships" will be about the contract,
> not about the shape.**

---

## Also retired here — §3a's "two things known to be still untrue" (both were built the same evening)

> **Two things are known to be still untrue, and they are the live work:**
> - ⛔ **The centerline the operator SEES is not the line ① is built from.** `ribbons.streets[].points`
>   versus the skeleton: **median 1.00 m apart, p90 7.50 m, max 20.8 m — 4,781 of 9,547 points more than
>   a meter off.** The curb is a perfect offset of a line nobody can see.
> - ⛔ **The authored corner radius is not built** on the ① path. It belongs in the node's bezier handles.
>   A corner-rounding pass was written, grew four guards each propping up the last, and was excised
>   (Law 3). On that path, corners are sharp.

**Both closed by `e14f17f9`, and the first one closed by being reinterpreted rather than fixed:**

- The divergence **was never two lines diverging.** A skeleton street's `points` is the **control
  polygon**; the curves live in `segments`, and both ① and the drawn centreline were reading the
  anchors alone — so every curve was minted as a chord. **That 20.80 m was the discarded curve.**
  `tessellateAdaptive` subdivides to a 0.10 m arc tolerance, one map feeding both consumers. ⭐ Note
  what converging them to 0.00 m would have meant if the cause had not been found first: **it would
  have deleted the curve from both sides.** Live home: `RIBBONS §1`.
- The corner is built — `easeContour`, the node as a **handle configuration**. No threshold, no budget,
  no decline, no revert; `R = 0` leaves the contour byte-identical by construction. ⛔ It is **not**
  `easeRing` and the difference is the whole point. Live home: `RIBBONS §1`.
