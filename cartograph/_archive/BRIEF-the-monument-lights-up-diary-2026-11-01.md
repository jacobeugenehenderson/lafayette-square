# BRIEF-the-monument-lights-up — Diary, 2026-11-01

Superseded content from `docs/briefs/BRIEF-the-monument-lights-up.md`, kept verbatim and dated (CLAUDE.md, prune as you go).
Archived for currency, not truth: this was true when written.

## §2a, owed item removed 2026-11-01 (tinsel/show-channel)

> - **Mixed-null nights (Zob, 2026-10-31; inferred, high latitudes only):** `glowSpan` reads { dusk, dawn null } as glowing
>   from 00:00 (the morning before the dusk included) and { dusk null, dawn } as no glow, though it is dark until that dawn.
>   These are the days into polar night and white nights; the schedule check owes a synthetic case for each, and for
>   night.js's both-null branch (untested today).

**Why it went:** it was ROT, not a decision.
- Every time-of-day slot now has a minute on every day. A slot the sun never reaches sits at its closest approach, solar noon or the nadir (Jacob, 2026-11-01: "Yes, build it"; e93016a5).
- `glowSpan`, `showtimes` and `night.js` are deleted. A display's schedule is its Look's own channel (r-a-display-is-authored-on-its-own-look-channel; faf1613c).

**Where its cases live now:** `node checks/claims-every-slot-has-a-time-every-day.mjs`. It runs the white night (80°N, Jun 21), the polar night (80°N, Dec 21) and the partial day (62°N, Jun 21: Sunset real, Dusk and Dawn at the nadir) through the real resolvers, on the lamps and the display alike.
