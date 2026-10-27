# BACKLOG items resolved 2026-10-25 by retiring the shore median (BRIEF-the-shore-is-one-line step 3: the 'shore-median' and 'ground-shore' steps are gone, so a coastal Bake runs the ground once)

Then, QUEUED (Jacob, 2026-10-25: "yes, queue the PTown bake speed-up"): PTown's bake pays for the ground TWICE (ground 5,197 s +
ground-shore 4,949 s of ~177 min, timings of 10-11): the shore pass must not re-run the whole ground. Brief after the tranche.

- `bake-shore-median.mjs` reads its shape from the SERVED path (`public/baked/<look>/shape.json`) even with `--out=`, so a scratch run traces the served shape (Kerf, read in source). Probably: read the shape beside `--out`. Small; not built.

- **Design call for Jacob:** a coastal Bake runs ground (--shore=pending) → shore-median → ground-shore, so TWO full ground passes (PTown ~87 + ~82 min, 10-11 timings). The median needs only the new shape.json, so shape → median → ONE ground pass would save a pass (Kerf). Moot if the median retires with the tern merge (7f4531d8, whose premise, the lidar coast, isn't on integration).

- PTown's shore-median.json is stale after its 2026-10-20 re-pour (walked on the old shoreline); its flatten is unmeasured until shore-median re-runs. Flatten's orphan/bow-tie drops stay until Huron and PTown measure 0.
