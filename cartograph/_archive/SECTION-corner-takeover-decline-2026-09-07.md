# The corner takeover's four decline modes — retired diagnosis

**Retired from `SECTION.md §7` on 2026-09-07.** It described `sectionPassTile`'s CONDITIONAL corner
takeover, cured on stamped tiles by `07e65753` and scoped thereafter as *"still live on UNSTAMPED
tiles."* **That population is measured EMPTY** — 0 of 149 on Lafayette Square and 0 of 1196 on
Hi-Pointe/DeMun; ① is the producer and every tile carries the stamp. Command in `SECTION §7`.

⛔ Kept because it is the account of a real defect and its measurement method was sound. ⛔ NOT kept
as live doctrine: the numbers below are historical and the construction they describe paints nothing
today. ⭐ If the legacy walk painter ever becomes reachable again, the honest move is to EXCISE it
rather than restore this text.

---

> ### ✅✅ CURED 2026-08-11 (`07e65753`) — READ THIS BEFORE THE DIAGNOSIS BELOW, WHICH IS NOW THE *ACCOUNT OF A FIXED BUG*.
>
> **The band is painted FROM THE PARTITION.** On a tile carrying the `iaEdge` stamp, `iA` is cut at every
> fillet's two tangent points and at every ownership change outside a fillet; **each owner sweeps its own
> arc inward**, and adjacent arcs close on the **same inward bisector** — so **step over and step back are
> ONE cut, and a gap is not constructible.** ⇒ the four decline modes below **no longer gate the takeover
> on a partitioned tile**; the corner owns its arc rather than bidding for it. **An unstamped tile keeps the
> construction described below, byte-identical** — so the diagnosis stays live for that population.
> ▶ **State, scope and what remains: `ROADMAP` A10.** The full journey: `_archive/A10-cure-journey-2026-08-11.md`.
>
> ### The deviation *(the bug, as diagnosed — still live on UNSTAMPED tiles)*
>
> Doctrine `§6.9`.4: *"**Both legs stop at tA/tB; the corner ribbon takes over; legs resume.**"* The
> pull-back (`legTrim` `:1416`, exact via `tangentTrim` `:1409`) is therefore **intended**.
>
> ⭐⭐ **The doctrine does not say "if a fillet can be found."** The takeover is gated on
> `bandRem.length && cornerT.size && fillets.length` (`:1566`), per corner on locating a fillet within
> `best.r + c.trim + 1` (`:1575`), and again on the intersection coming back non-empty (`:1583`).
> **Step over is unconditional; step back is not.**
>
> ▶ **The population is measured, not estimated — `node scratch/claims-corner-takeover.mjs`** (all 7 scenes,
> both states, runs the real `sectionPassTile` under `CORNER_DUMP=1`; the dump is inert — output is
> byte-identical armed and disarmed). What it establishes:
> - **Four decline modes exist, and LS fires all four** — `bandRem-empty` · `bandRem-empty + no-fillets` ·
>   `no-fillet-in-range` · **`empty-pad` (`:1583`)**. ⛔ **No town carries a mode LS lacks**, so the cure
>   does not need a town nobody has looked at in order to be designed.
> - ⚠️ **But the MIX is not portable, and that is the trap.** `bandRem-empty` as a share of a town's bids
>   swings widely by town (▶ `node scratch/claims-corner-takeover.mjs` prints the per-town split and the
>   overall decline-rate range), LS mid-range. **A cure tuned to LS's dominant gate is tuned wrong for both extremes** — handle all four
>   structurally, never optimise for the common one.
> - **Two gates are dead:** `zero-depth` (`:1569`) and the pure no-fillets tile gate fired **0 times in
>   7,632 bids**. ⛔ Do not treat either as load-bearing.
>
> ⭐⭐ **An unhonoured takeover is a MISLABEL, not a hole.** Band the legs released and no corner claimed
> falls to `luRemainder` (`:1642`) and **renders as land use** — the gap is **ribbon painted green**, not
> absent geometry. That is why it is intermittent while the curb is uniformly correct.
