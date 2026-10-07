# claims-orphaned-customs — the retracted header, retired 2026-10-07 (Sill)

The check was replaced on 2026-10-07. It now resolves each slot against the town's own baked `shape.json`. The old version read
LS's `src/data/ribbons.json` for every scene and modelled frontage with `buildBlockGeometryV2`, not the ① producer, so
HPDM scored 0 live (Argon, 2026-10-07). Its header, as it stood:

```
// ⛔⛔ RETRACTED 2026-08-06 — THIS PROBE'S HEADLINE RESULT IS VOID. DO NOT CITE IT.
//
// It reported "27 of 76 authored leg slots are never read" (commit c430f4e9).
// That number is void for TWO independent reasons, either one fatal:
//
//   1. IT WAS MEASURED AGAINST A FILE THAT CHANGED UNDER IT. Jacob was authoring
//      and reverting in the live app while this read design.json from disk. HEAD
//      had 49 Section-field slots; the working tree had 0 minutes later. The
//      number has no timestamp and cannot be reproduced.
//      → Snapshot an operator-authored artifact, measure the COPY, report "as of".
//
//   2. ITS PREMISE WAS WRONG. It assumed the write key is feCustomKey's
//      min(segOrds) while the read key is run.segOrd — a mismatch. But the store
//      FANS a write across every segOrd the fe owns (`feSegOrds`,
//      useCartographStore.js:26; RIBBONS §2, SECTION §5). There is no min-only
//      write. And RIBBONS §5 already names the harness for this exact question:
//      `scratch/t4-fe-parity.mjs`. Both facts were in the canon, unread.
//
// ⛔ AND THE FIX IT WAS HUNTING IS FORBIDDEN. SECTION §6.3, on this defect class:
//    "Do not fan the write across the leg range, do not restore the mouth on the
//     9, do not key differently. Answer the hole, not the cover." The addressing
//    fix was built, gated, and RETIRED — naming a leg does not give it edges. The
//    root is the missing second mouth corner (POLYGON-FIRST §2.1 Check 5).
//
// Kept, not deleted, because the earlier VERSION of this file was worse: it read
// `frontageEdges` off buildTileGround (which returns none) and reported the
// operator's entire authored corpus orphaned, off an empty array. That near-miss
// is the reason the rule exists: a probe whose result would be catastrophic if
// true is BROKEN until proven otherwise — print the denominator.
//
// The live, trustworthy sibling from that day is `claims-revert-field-coverage.mjs`.
```
