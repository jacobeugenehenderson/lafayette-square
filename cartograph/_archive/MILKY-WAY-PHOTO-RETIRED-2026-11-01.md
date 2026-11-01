# The Milky Way photo panorama — retired 2026-11-01

Jacob, 2026-11-01: "Retire it." The photo (`public/textures/milky_way.jpg`, Serge Brunier's 12000×6000 panorama, 17.5 MB) and its renderer `CelestialBodies.jsx#MilkyWaySphere` had been unmounted since 2026-05-02 (JPEG blocks and stretched stars at the Hero/Street cameras). The band on screen is procedural (`src/components/skyGradient.js#MILKY_WAY_GLSL`, since the 2026-09-27 deep-night pass); the kit's placed and noise stars draw over it. The file still shipped in every kit bundle because the dormant function kept its `kitUrl()` call site. Removed by Sigil (branch sigil/milky-way). Jacob's later direction, not this retirement: the sky is "good enough for now"; more photographic drama later.

## The lines this retired, verbatim

### from `ROADMAP.md`

- **Milky Way re-enable** — the renderer is **present and named**: `src/components/CelestialBodies.jsx` (1369 lines) — `MilkyWaySphere` at `:363`, `MILKYWAY_FLAT_DEFAULTS` imported `:19`, `MILKYWAY_DEFAULT_CHANNEL` `:37`, resolved through `resolveGroupAtMinute` `:405`, mounted `:486`. Channel plumbing is live (`skyLightChannels.js` → `bake-scene.js`). *(2026-07-18 claimed the file no longer existed and sized this M for a locate-the-renderer investigation; re-verified 2026-08-04 — nothing is missing.)* The real task is re-enable + view across TOD + report what beautiful costs. S · → talk-out brief. ·

### from `ls/STATUS.md`

- Milky Way mount is **disabled** (`CelestialBodies.jsx` ~1194, "hidden 2026-05-02") — **KEEP → re-enable** (Jacob), one-line uncomment, *not* cruft.

### from `ls/OPERATIONS.md`

- **Milky Way** is mounted-disabled (`CelestialBodies.jsx` ~1194) — **keep / re-enable** (one-line uncomment), do not delete.

### from `ls/STREET-VIEW.md`

- **Milky Way** authored-but-disabled — the seam into the larger planetarium build-out (§3.4).

### from `ls/STREET-VIEW.md`

The `milkyWay` channel + texture exist (§3.2); the work is re-enabling it, animating its rise/arc with sidereal time, and weighing the ~17 MB mobile cost (stream/compress, or gate by tier).
