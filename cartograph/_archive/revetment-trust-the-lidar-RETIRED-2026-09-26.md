# DIARY — "the revetment trusts the lidar about where the shore is", retired 2026-09-26

*Superseded by Jacob's ruling of 2026-09-26: **"The drawn water's edge IS the mapped shoreline, and the
revetment sits on it."** Since then the revetment's "is this arc at the water, and which side is wet?"
comes from the drawn water (`clean/map.json#layers.water`, the rings `bake-ground` paints), not from the
heightfield. The lidar still sets each station's crest and toe. The soft-shore predicate and the
structure-tag rule are unchanged. Live home: `cartograph/shore-armour.mjs#wetSideOf` · the check
`node checks/claims-every-metre-of-drawn-shore-is-named.mjs`.*

The ruling this retires is `r-coast-trust-the-lidar` (Jacob, 2026-09-25, "Lidar"; `references/registry.json`),
introduced in `c9e5dde6`.

---

## The text, verbatim, as it stood

`cartograph/OPERATIONS.md`, CLI / bake operations:

> - ⭐ **The revetment says how much of the shore it covers, every bake** — one line, four different kinds
>   of fact, never merged: what it **built**, what the **lidar declined** (*"not at the water"*), what was
>   refused for other reasons, and what lies **outside the drawing** (beyond the disc — our own frame, not a
>   fact about the town). ⛔ **A low number here is usually CORRECT, not a bug:** where the mapped coastline
>   and the lidar water surface disagree — common on a sandy or accreting shore — the kit **trusts the
>   lidar**, because that is what the stone would sit on *(ruled 2026-09-25)*. The revetment is a filler;
>   the bed closes the shore wherever it builds nothing.

`cartograph/bake-revetment.js`, above the coverage print:

> ⭐⭐⭐ ONE LOUD LINE, EVERY BAKE — ruled by Jacob 2026-09-25 ("Lidar", r-coast-trust-the-lidar).
> ⛔ THE COVERAGE FIGURE IS A HEADLINE NUMBER AND IT WAS ONLY DISCOVERABLE BY READING A LIST.
> Provincetown armours an EIGHTH of its shore, and the reason is not a defect in the kit: the OSM coastline
> and the USGS water surface disagree along two thirds of the coast — measured, 54.3% of segments on the
> longest run are above zero on BOTH sides within the probe. We TRUST THE LIDAR (it is what the stone would
> sit on, and on a sandy spit a shore dry on both sides is most likely beach that needs no armour), so the
> decline is CORRECT — which is exactly why it has to be said out loud rather than left in a `refused` array
> nobody opens.

`cartograph/shore-armour.mjs#wetSideOf` asked the heightfield: the wet side was the side whose probes read
at or below one armour course above the water plane, swept outward from one grid step to six; an arc where
neither side did was refused as *"neither side reaches the water within N m — this arc is not at a water
edge"*.

## What it did, measured

`node cartograph/bake-revetment.js --scene=<town> --out=<scratch dir>` at the retiring commit and after:

| town | before (lidar decides) | after (drawn water decides) |
|---|---|---|
| huron | 9.10 km armoured of 11.77 km ruled; 0.00 km declined; 0.02 km stubs | 9.10 km armoured of 11.79 km drawn shore; 1.37 km below one course, 1.16 km soft shore; 0.02 km stubs |
| provincetown | 1.90 km armoured of 8.02 km ruled; **42.36 km declined "not at the water per the lidar"** | 2.08 km armoured of 50.39 km drawn shore; **47.73 km bare as soft shore**, 0.21 km below one course; 0.02 km stubs/too few vertices |

⭐ The lesson: a decline named for the INSTRUMENT ("per the lidar") rather than for the SHORE hid the fact
that 42 km of drawn water met land with nothing between them. Under the drawn-water test the same metres
now carry the reason the map itself gives, which on Provincetown is overwhelmingly "soft shore".

---

## Also excised from `BRIEF-boulder-revetment.md` §3 the same day — ROT

huron was re-fetched: `raw/osm.json#ground.man_made` holds 214 features and `other[]` holds none with a
`man_made` tag (`node -e` over `cartograph/data/huron/raw/osm.json`). The block, verbatim:

> ### ⚠️ ① THE CODE FIX IS LANDED BUT HURON HAS NOT FELT IT — RE-FETCH FIRST
> `man_made` is in `tagPriority` now, but **bucketing happens AT FETCH TIME**, in `fetch.js`'s
> `bucket()` loop, and it writes the buckets into `raw/osm.json`. huron's still carries an empty
> `man_made` bucket with everything in `other[]`, which has zero consumers.
> ▶ **Your first step is a re-fetch:** `node cartograph/fetch.js --scene=huron`
> ✅ Safe — huron has no authored `design.json` and its `raw/osm.json` is git-tracked.
> ⛔ **Confirm `ground.man_made` is non-empty before going further.**
>
