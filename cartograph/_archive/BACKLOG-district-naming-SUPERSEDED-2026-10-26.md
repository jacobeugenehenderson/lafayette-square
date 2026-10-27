# BACKLOG — district naming (SUPERSEDED 2026-10-26)

Moved from `cartograph/BACKLOG.md` when the declared-district machinery was removed (Boz's ruling, BRIEF-a-town-lists-everything §0, on Jacob's 2026-10-21 words). Kept as written.

⚠️ HISTORIC DISTRICT NAMES ARE MIS-ASSIGNED, a kit class, LIVE ON HPDM (Zob, measured): fetch-parcels reduces the City's
district CODES to booleans, so with one declared district every flagged parcel takes its name. HPDM: 81 buildings
(Wydown, Woodbourne, Buena Vista, Fauquier, Skinker …, no declared street, no NR match) are named "Hi-Pointe–DeMun
Historic District", likely other districts. LS's declaration (Plumb, 9477fdd8, correct in itself) is HELD: it would
name ≤ 80 at-risk LS buildings the same way. The fix: carry the code (fetch-parcels → sources.js codes → districtOf by
code; a foreign code gets no name) + a City parcels re-fetch for LS and HPDM + the City's code→name table (source not
established). Your call for Thursday: (i) leave HPDM's 81 as served, (ii) interim: a flag with no code match names no
district (HPDM's 81 lose the wrong name; LS stays unnamed), or (iii) the full fix first.
**Ward recommends (ii) for Thursday, then (iii):** the Ward shows only the district NAME (Facts.jsx), so the 81 cards just
lose a line and say nothing false. The partner knows their district's boundary; a Wydown house labelled HPDM's district is
what they'd spot first. I agree. (ii) is PREPARED: Truss, `1cfc3f47` on `truss/district-flag-interim`, unmerged (HPDM dry run: named 598 → 517, the 81
unnamed, in-district unchanged; check `claims-a-flag-names-no-district`, safe tier). Zob reviews; it merges on your yes.
