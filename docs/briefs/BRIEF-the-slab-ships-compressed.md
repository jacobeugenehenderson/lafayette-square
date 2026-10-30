# BRIEF — the slab ships compressed: a visitor downloads the bins at their compressed size

<!-- BRIEF-STATE
status: OPEN
dispatched: no (written 2026-10-30, Boz, at Jacob's "yes, brief it", after Ward's wire measurement)
evict-when: every slab binary a town's player fetches arrives compressed on the wire (the staging R2 custom domain and production-sites), with
the player's reads unchanged in result; a check that reads the uploaders and Workers catches a .bin uploaded or served uncompressed;
PTown's cold load re-measured before vs after with scratch/browse-perf/load.mjs; merged on Zob's PASS; Jacob's publish + Promote.
Then this moves to cartograph/_archive/ dated.
-->

**You are the dispatched agent. Name yourself:** one word, not one a running session holds (`ListAgents`, then `/rename`).
**Agent: FRESH.** **Report to Boz.** **Confirm-then-build:** every premise is a claim; confirm each against the code by symbol, say
what you found. If the code disagrees, stop and flag Boz. Zob reads your plan before you build.

## 0. Why (Jacob, 2026-10-30)
PTown's first load is 120.9 MB on the wire; its six slab bins are 85.86 MB raw against 30.03 MB brotli-5 (38.74 gzip-6). The far
shore's "accepted" sizes (Huron 5.38 MB, PTown 1.40 MB gzip) were never what went over the wire. Likely the largest load lever left.

## 1. Measured (Ward, 2026-10-30; numbers, not re-measured)
- Every `.bin` on provincetown.online and assets.theward.online/staging is `application/octet-stream`, NO `content-encoding`, the same
  length with and without `Accept-Encoding: gzip, deflate, br, zstd`. JSON on the same hosts IS compressed (`zstd`).
- PTown production (MB, raw / gzip-6 / brotli-5): ground 48.61 / 20.24 / 17.61 · terrain 18.28 / 10.73 / 8.29 · context.coastDist
  9.14 / 5.22 / 2.35 · buildings 6.71 / 1.22 / 0.60 · revetment-far 1.64 / 0.69 / 0.63 · -unseen 1.47 / 0.64 / 0.55.

## 2. What the code does today (Ward's read; confirm by symbol)
- `scripts/upload-baked-to-r2.mjs` (Publish) and `scripts/promote-player-to-prod.mjs` (Promote) write `.bin` as
  `application/octet-stream`, no content-encoding.
- ⚠ CORRECTED (Groyne, measured): staging's slab is NOT behind a Worker; the player reads it from the R2 public custom domain
  (assets.theward.online/staging/). Only production's slab goes through `workers/production-sites`.
- `workers/production-sites` and `workers/staging-sites`, `src/index.js#serve`, pass R2 `httpMetadata.contentType` through
  (`typeFor()` falls back to octet-stream), never set content-encoding, and serve `accept-ranges` / Range.
- That the edge compresses by content type (JSON yes, octet-stream no) is INFERRED from the contrast; read Cloudflare's docs and cite.
- Slab names are content-hashed (`--names=sha256-16`), manifest last (OPERATIONS "Slab names"); the manifest names each file.

## 3. The work, in order
1. **Who reads byte ranges?** Find every reader of a slab bin in the player (Town's import graph, and the Ward if any), by symbol:
   whole-file fetch or Range. Compressed objects and Range don't mix; this decides the means.
2. **Choose the means, measured:** (a) an honest content type the edge compresses; (b) objects stored pre-compressed (brotli or gzip)
   with `content-encoding` in R2 httpMetadata, served as-is (and what a client without that encoding gets); (c) the Worker compressing
   on the fly (CPU per request, cache behaviour). For each: wire bytes per town, cold reveal time, decode cost in the browser, what
   breaks (Range, `content-length`, the manifest's sizes and hashes, `proof` / the uploader's byte check), and both Workers alike.
   Bring the comparison to Boz before building.
3. **Build** the chosen means in ONE place both uploaders and both Workers share (no second copy of "which files compress"); the
   choice of which files is read from the manifest's own types, never a list of names. Delete what it replaces.
4. **Register:** OPERATIONS (Publish, Promote, slab names: what is stored and what is served); FEATURES if it reads as a capability.

## 4. Gates
- A check that reads the uploaders and both Workers: a slab binary is stored or served compressed; mutant (the octet-stream path
  restored) → RED.
- Measured on staging and production, headless, cold ×3: per-file `content-encoding` and encoded bytes; PTown's reveal before vs after
  (today 7.2–8.5 s production, 120.9 MB).
- The player's result is unchanged: every bin decodes to the same bytes (hash the decoded body against the uploaded file).
- No regression in claims-the-publish-panel-reports-the-address-it-shipped, claims-a-production-town-plays-the-player-promote-pinned,
  and the slab-names checks.

## 5. Bounds
Branch off `integration/2026-10-20` in `.claude/worktrees/`; `git commit -- <paths>`. ⛔ No upload, Publish, Promote or Worker deploy
by you: those are Jacob's, on Boz's relay. Measure against the live hosts read-only. No dev server without Boz's word.
