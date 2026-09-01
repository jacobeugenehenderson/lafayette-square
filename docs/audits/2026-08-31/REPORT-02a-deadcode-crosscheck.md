# REPORT 02a — Independent cross-check of the cartograph dead-code census

Addendum to REPORT-02 §5. A second, independently-written census (basename/substring matching) was
run against the resolved-import-graph results used in the main report.

**Both runs agree exactly on every classification that matters:**

- `migrate-overlay.js` → **ORPHAN** in both (imp=0, men=0, doc=0)
- `probe-feature-elevation.js` → **ORPHAN** in both (imp=0, men=0, doc=0)
- `tripwire-ls-reads.cjs` → **DOC-ONLY** in both
- `osm-vocabulary.mjs` → imp=41 in both
- every LIVE-IMPORTED / CLI split identical

## Where the two disagreed on counts, the loose script was wrong

Each verified by direct grep:

| file | loose script | reported (resolved) | verdict |
|---|---|---|---|
| `elevation.js` | imp=11 | **imp=1** | resolved is correct — `grep -rn "elevation\.js'"` returns exactly one import: `cartograph/pipeline.js:17`. **The other 10 were substring hits on `probe-feature-elevation.js`**, whose filename ends in `elevation.js` |
| `serve.js` | imp=1 | **imp=0** | resolved is correct — no file imports `cartograph/serve.js`; the hit was a cross-directory match on `arborist/serve.js` / `meteorologist/serve.js` |
| `config.js` | imp=22 | **imp=21** | resolved is correct (cross-directory `config.js` false positive) |
| `derive.js` | imp=3 | **imp=2** | same cause |
| `node.js` | pkg=3 | **pkg=0** | loose script matched the *stem* `node` against the literal word "node" in every npm script string. **`node.js` appears in no `package.json` script** |

## ⭐ The substring trap, and why it bears on the census's own reliability

**`probe-feature-elevation.js` — one of the two orphans — is precisely what inflated `elevation.js`'s
count.** A basename-substring census would have made the orphan look like it was propping up a live
module.

**The resolved-path method is what separates them**, which is why the main audit switched to it
mid-task. Any future dead-code pass in this repo must resolve specifiers against the importer's
directory, not match basenames — four of the five discrepancies above are cross-directory collisions
between same-named files in `cartograph/`, `src/cartograph/`, `arborist/` and `meteorologist/`.

## Standing

**No claims in REPORT-02 change.** The line counts, the 17/24/8/2 totals, the duplicate-pair
findings, and the two out-of-brief findings — `serve.js:2589` shelling a nonexistent `render.js`, and
the second `lafayette-square` hardwire at `bake-buildings.js:658-662` — all stand as measured.
