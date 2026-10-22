> **Moved 2026-10-21** from `cartograph/RIBBONS.md`'s glossary. ROT: smoothing happens in the skeleton (`cartograph/skeleton.js#rdpKeep`, `#curveFitSegments`) and `STREET_SMOOTH` is dormant at 0, so it is not "the single smoothing constant, read by every consumer". Jacob ruled 2026-10-21 that smoothing is one thing, the skeleton's fit, with the other knobs retired (unbuilt). The live line is RIBBONS' glossary entry **smoothing**; the end-to-end account is `ORIENTATION.md §3` (Rounding, three kinds).

The line as it stood:

- **STREET_SMOOTH** — the single smoothing constant (`smoothCenterline.js`), read by every consumer; one curve, concentric by construction. Currently `0`.
