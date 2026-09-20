# BOZ §5 — why the read-in stopped being a "budget" (receipt, 2026-09-20)

Retired from `docs/agents/BOZ.md §5` on the day §5 was re-founded. Kept because the rule it produced
("there is no read-in budget; read the spine") is the kind of rule that gets softened back into a
budget by the next person who finds the read-in expensive.

## What §5 said

> *"The read-in is tiered, and it fits. The full canon is ~400 KB and will not fit — so this is not a
> list of everything, it is a **budget**. Tiers 0–2 are 63 KB / ~16k tokens, measured, and are not
> optional."*

…and it prescribed `ROADMAP.md` as two slices:

```
sed -n '1,77p' ROADMAP.md
grep -nE '^#{1,3} |^- \*\*[A-Z][0-9]+' ROADMAP.md | cut -c1-150
```

## What was measured, 2026-09-20

| | stated | measured |
|---|---|---|
| the live corpus | ~400 KB | **~3.9 MB / ~139 files** |
| what fits | "will not fit" | the **spine, ~1 MB**, fits with room to work |

⛔ Re-derive rather than quoting either figure:
```
git ls-files '*.md' | grep -v _archive | grep -v '^scratch/' | xargs du -ch | tail -1
```

## The cost

One sentence understated the corpus by an order of magnitude, understated what fits, and licensed a
Boz to read the board as a heading index — **arriving as a fresh agent with a long context, which is
the exact failure the sentence two lines below it forbade.** The board carries staleness banners
*inside* items (`ROADMAP A06`: *"scope is unverified, re-derive before estimating"*); a heading index
cannot see one.

⭐ **The rule it earned: a budget derived from an unmeasured size is not a budget, it is a permission
slip.** The same shape as every expired receipt this corpus warns about — the difference is that this
one was in the doc that tells Boz how to read everything else.

## The second half, same day

Jacob: *"the cartograph doesn't require anything from the universal player, the arborist, or the
meteorologist."* That is `ARCHITECTURE §1` — the helpers are decoupled and meet only at the artifact —
so the spine is **one domain's**, and the cross-domain obligation is **STATE, not REFERENCE**.
Measured: those three domains entire are **960 KB**; their state docs are **~256 KB**.
