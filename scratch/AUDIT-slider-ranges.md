# Audit list — slider ranges should run 0 → "Extreme"

> **State / forward-looking checklist.** Filed 2026-06-21 (Jacob's call). Not a now-sweep — a
> **touch-as-you-go** list: when you're in a channel anyway, check its slider range against the
> principle and fix it. Home of the channel schemas: `src/cartograph/skyLightChannels.js`.

## The principle (Jacob)

> **Every authoring slider should range from 0 to "Extreme."** A slider you can't push far enough to
> *see* what it does can't teach you what it does — and a too-tight ceiling makes the operator think
> they're "using it wrong" (the Halo confusion, 2026-06-21).

**"Extreme" is not "absurd."** Jacob's clarification: it means **enough to clearly see the effect, with
headroom to intentionally overdo it for style** — not a physically-meaningless runaway number. Rule of
thumb for the max: the point where the effect *fully* expresses (e.g. a mix reaching its target color, a
multiplier fully saturating) **plus a little style headroom** — not 10× past anything visible. Keep the
*default* unchanged (don't alter unauthored-Look behavior); only open the *ceiling*.

## Why it's not just cosmetics

Tight ranges were the direct cause of the Halo/"Aerial Perspective" confusion: max 0.5 + a screen-Y band +
mid-tone gating meant even maxed it barely moved, so it read as broken. Operator legibility *is*
correctness here (`BOZ.md §3` agent-accessibility standard, applied to the panel).

## Checklist (seeded from `skyLightChannels.js` — review when touched)

| Channel | Field(s) · current max | Verdict / action |
|---|---|---|
| **Halo** (AerialPerspective) | strength **0.5 → 1.0** | ✅ **DONE 2026-06-21** — opened to full-haze + headroom; label unified to "Halo" in Preview too |
| Bloom | intensity **3→2** · threshold **1→0.9** (min 0.1→0) · smoothing 1; steps **0.05→0.01/0.02** | ✅ **DONE 2026-06-21** — attenuated to the working zone + finer intervals (was "only shows at max/min"). ⚠️ threshold *default* 0.85 may still need lowering (changes baked Looks — eye call) |
| AO (N8AO) | radius 30 · intensity 5 · falloff 1 | review — can the operator see an *extreme* occlusion crush? |
| Fill | 0–2 | likely ok (piecewise toe map) — confirm "2 = obviously soft" |
| Exposure | 0–2 | review — is 2 enough to clearly over/under-expose? |
| Grade | contrast 1 · toe 0.6 · sat 0.5–1.5 · vignette 2 | review — sat range narrow; vignette 2 ok? |
| Grain | scale 3 | likely ok |
| Sky-gain | 0–2 | review |
| Ambient/Hemi/Sun/Moon | 0–2 each | review — 2 enough to clearly blow out lighting? |
| Neon | core/tube/bleed 1 · emissive 0.5–8 · tubeRadius 0.1–3 | likely ok (emissive 8 is generous) |
| Mist | density 0–1 | review — does 1 read as "pea-soup"? |
| Shadow | size 100 · samples 32 | engine-bound; leave |
| Warmth | 0–1 | bipolar (0.5 neutral); leave |

*(New channels — e.g. the coming DoF/Focus section, `cartograph/_archive/HANDOFF-real-dof-2026-06-27.md` — are born to this principle:
focus/range/strength sliders shipped with 0→Extreme ceilings from day one.)*
