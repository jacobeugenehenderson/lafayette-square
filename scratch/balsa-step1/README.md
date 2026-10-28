# balsa step 1 — measurement (Plumb, 2026-10-27)

`BRIEF-the-balsa-model §3.1`. Probe only; builds nothing.

**Method.** Staging Ward `1612d2de` on kit `7179c779`. Cold cache, headless Chrome, this M1, one run per cell. Phone = iPhone UA,
390×844 @3, CPU throttled 4× (the M1 GPU, not a phone GPU). Desktop = 1512×982 @2. Read: `ward:*` startup marks, rAF intervals,
the CDP sampling profiler (500 µs), CDP Network. Identity = profiler samples whose stack holds a bundle function matching identity
strings (`analyze.mjs` `IDENT`). The stamp loop also fills materials, so "index" is an upper bound; stamp vs materials is not
separable with these instruments.

```
node scratch/balsa-step1/measure.mjs <town> <phone|desktop>   # writes raw-<town>-<dev>.json in cwd
node scratch/balsa-step1/analyze.mjs <town> <phone|desktop>   # reads it, prints the summary (an-*.json)
```

The results are in the `an-*.json` files. Not measured: click-to-card (no card detected at any of 35 points per run; cause not established).
`raw/` holds the per-run raw profiles and screenshots (3–5 MB each). It is not committed.
