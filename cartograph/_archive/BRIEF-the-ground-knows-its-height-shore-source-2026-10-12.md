# BRIEF-the-ground-knows-its-height §5 — the shore's shape source as it stood (Diary, 2026-10-12)

Retired: superseded by Jacob's 2026-10-11 rulings (relayed by Boz, landed 2026-10-12): the coast line is where the lidar
surface meets the high-water level, and the gusset is the bank from there down to the low-water plane. Live home: the
brief's §5, "The shore" and "THE SHORE'S GUSSET". The text as it stood before:

- **The shore:** the line's height IS the water level; the land eases down to meet it along the smoothed waterline. The
  waterline's SHAPE is the one smoothed coast chain in ① (`ROADMAP H-4`). The lidar trace refines or validates it, with
  measured agreement, never as a second outline beside it.

And §4 item 6, the 2026-10-10 measurement (Talus), consolidated into §5's table the same day:

6. **The shore has two shape sources.** The lidar waterline lies p50 4.2 m (Huron) / 23 m (Provincetown) off the ①
   coast stroke, with a median beside 42% / 80% of the line. At the 1 m trace's y = 0 the 5 m field reads p50 0.28 /
   0.82 m. At the line the mesh's chord error is small (p50 2–5 cm), and the drawn land crosses the level FEWER times
   per km than the field. ▶ `shore-sources.mjs`, `shore-jag.mjs`
   **The gusset** (land above the water at the line): Huron p50 0.19 / p90 0.48 m on 74% of the line; Provincetown at
   LOW p50 0.69 / p90 1.58 m on 94%, at HIGH on 3%. Where both sides carry ground, the drawn ground is continuous across
   the line (p50 5–7 cm over 0.6 m). Its shape is recorded per segment for a treatment to read.
   ▶ `gusset.mjs <scene>` → `gusset-<scene>.json`
   The median's two lines are the S-curve's two ends in plan: the ① stroke, where the flat sheet meets the ground,
   and the lidar waterline, where the real ground reaches the level.
   The crack's mechanism: §4 item 9.
   Gap walk: standoff now derived (`gaps.jsx`). Its Huron baseline (2026-10-10) came back BLIND: 7,018 of
   7,086 views reached the sky, the unchanged `far` view included, and the mutation found the same, so the check
   voided itself. Cause not established; a one-station look comes before any re-run.

And §0 (c)'s measurements (Argon, 2026-10-07/08), superseded by §4 and §5:

Argon's measurements so far (2026-10-07/08, facts only):
- The shore-median sand edge is the lidar waterline traced by marching squares at 1 m, UNSMOOTHED
  (`bake-shore-median.mjs` → `bake-ground`'s `shore` group). It zigzags p50 0.16 · p90 0.73 · p99 2.24 m off its own
  ±3 m chord. Meanwhile the coast is ALSO a chain in ① (`ROADMAP H-4`: "stroke the coast as a two-sided chain"). So the
  waterline has two shape sources at two resolutions.
- The drape (per vertex, last) and the cracks: measured in §4.3 and §4.6. The 9,212 px "hole" at (−2386, −2008) was the
  gap walk's 20 m camera under a ~12 m channel's far bank; the standoff is now derived.

