# HANDOFF — Simplify the through-ROAD, not the named chain

> ✅ **LANDED `c4cb191` (2026-06-13), eye-approved.** Built by Boz (the dispatched agent Throughstone designed + round-trip-validated it but was write-blocked in its sandbox). **Implementation:** `skeleton.js` — `rdpKeep()` helper + the transition-aware pass replacing the per-chain RDP loop; `RDP_EPS_TRANSITION = 0.3`. **Key correction vs the spec below:** un-pinning the joint was NOT the lever (it left node B at 46.5°); the lever is the finer **tolerance** that preserves the densely-sampled rounding (46.5° → 15.6°). The through-road structure is kept because it's the *robust, principled unit* (Jacob: "industrially fortified, least patchy"), and the finer eps rides inside it. **Remaining fortification:** the regression-gate invariant (name-transition-smoothness) in the detector; re-bake is Jacob's call (frame re-frozen, bakes stale-but-untouched).

**Agent: FRESH. A scoped `skeleton.js` build + its detector gate. Name yourself.** Branch `curb-offset-draw`.

**The principle (one line):** RDP today simplifies the **named street**; it must simplify the **road** — the continuous through-path that follows `continuesAs` across name-transitions. A name is a label; the road is the line on the ground. Simplify the road, attribute the names afterward.

This encodes two general truths (Jacob), so it's future-proof, not a West-18th patch:
- **"A road becomes another road"** → follow the road *through* every name-change, in any town. Every name-transition gets continuous geometry by construction.
- **"Roads bend"** → keep the real curve the data already has. Do **not** facet it into a corner, and do **not** straighten it.

## Why (the diagnosis — read it first)

**`SPAR-SKELETON-FORENSIC.md`** (the full evidence + exact code lines) + **`SKELETON.md §5a`** (the dog-leg mechanism this generalizes). In short: at the West 18th↔Dolman name-transition, RDP runs **per-chain** (`skeleton.js:1473`), drops the rounding shoulders (all `<eps`), and `junctionKeys` (`:1439`) **force-keeps the bare joint node** → a gentle **15.6°** raw curve becomes a **46.5°** kink, the node **3.31 m** off its through-chord. The road is already continuous *topologically* (`continuesAs` / `nameTransitions[]` at `:1602`) — the fix carries that continuity into the **geometry**.

## The build

1. **Route + read** `SKELETON.md §5a` + `SPAR-SKELETON-FORENSIC.md` + the three code sites before editing.
2. **Assemble the through-road:** at each degree-2 `nameTransitions[]` joint, build the continuous path across `continuesAs` from the **raw (pre-RDP) points** of the joined chains.
3. **Simplify once, across the join:** run RDP on the whole through-road (do **not** force-keep the name-transition joint as an anchor — that's what facets it). Real junctions (degree ≥ 3) and true road endpoints stay protected as before.
4. **Split back** into the named chains at the transition point (preserve it as a split; keep `continuesAs`, per-fe names, widths). The result: the gentle rounding survives; the road reads as one curve through the name change.
5. **Add the gate to the detector** (`scratch/correctness-detector.mjs`, the Sieve→Loom→Throat suite): a **name-transition-smoothness invariant** — flag any `nameTransitions[]` node whose turn spikes above the road's ambient max-turn (a *facetting jump*). RED before the fix at W18/Dolman, GREEN after.

## ⛔ The hard constraints (a day was burned violating these)

- **PRESERVE, don't STRAIGHTEN.** West 18th genuinely curves ~135° around its U — straightening to chord is wrong here. RDP only *drops* vertices within eps of the chord, so the real bend's vertices survive by construction. (This is *not* the §5a straighten-to-chord; it's keep-the-rounding.)
- **PRESERVE, don't MOVE.** The earlier arc-*refit* resampled the curve and moved the path ~2.8 m → 52 tiles shifted → "No." RDP keeps a **subset of the raw vertices**, so the path cannot drift. **Verify:** every retained vertex lies on the raw OSM polyline.
- **Skeleton layer only.** No `tileGround`/render edits. No talk of sidewalks/FILL — downstream, not this layer.
- **The EYE is the gate.** Proxy renders mislead on this map — your numbers are *candidates*; Jacob's eye on the lit app is the verdict.

## Build + validate + hand back

1. Implement in `skeleton.js`; add the invariant.
2. **Checkpoint commit FIRST** (your `skeleton.js` + detector + this brief/forensic) — *before* re-freezing.
3. Re-freeze the derived frame: `node cartograph/skeleton.js && node cartograph/pipeline.js && node cartograph/promote-ribbons.js`. *(These regenerate `skeleton.json` / `map.json` / the `ribbons` overlay only — they do NOT touch `design.json` or `public/baked/*`.)*
4. **Validate (numbers, the candidate gate):** the invariant is GREEN at W18/Dolman **and every other** `nameTransitions[]` node; turn at node B drops 46.5°→~15–20°; node-B chord-offset 3.31 m → small; `extractFaces` face count stable; no new facet-kinks elsewhere; retained vertices ⊆ raw.
5. **Leave the regenerated frame artifacts UNCOMMITTED** for Jacob's eye (he restarts the dev server, looks on the lit app); **commit only your own code + docs**, never Jacob's bakes. Report the numbers + that it's ready for his eye. **Do not declare done — the eye decides.**

---
*Drafted 2026-06-13. Supersedes the retracted ped-silhouette junction brief (wrong layer). The DoD is the name-transition-smoothness invariant going green + Jacob's eye. — Keystone/Boz.*
