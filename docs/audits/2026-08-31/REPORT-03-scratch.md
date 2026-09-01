# REPORT 03 — `scratch/` and `_handoffs/`

Branch `land-use-derivation` @ `5a0bdaea`, measured 2026-08-31. **Zero edits, nothing deleted;
`git status --porcelain` empty at the end.**

---

## 0 · Three corrections to the brief's premises

**① `_handoffs/` is NOT tracked in git. It is gitignored.**

```bash
git ls-files _handoffs | wc -l          # → 0
git check-ignore -v _handoffs           # → .gitignore:245:_handoffs/	_handoffs
ls _handoffs | wc -l ; du -sh _handoffs # → 54 ; 776K
awk -F'|' '$4 ~ /^_handoffs\//' blobs2.txt | wc -l   # → 0 blobs in ALL history
```

It has never been in the repo, in any commit. **An outside developer who clones receives none of
it — and 11 tracked docs point at it** (§4).

**② `scratch/` is NOT the clone-weight problem. `public/` is.**

```bash
git count-objects -vH
git rev-list --objects --all > objs.txt
git cat-file --batch-check='%(objecttype)|%(objectsize)|%(objectsize:disk)|%(rest)' < objs.txt \
  | awk -F'|' '$1=="blob"' > blobs2.txt
awk -F'|' '{p=$4;n=split(p,a,"/");d=(n>1?a[1]:"(root)");s[d]+=$3} END{for(k in s) printf "%9.1f MiB  %s\n",s[k]/1048576,k}' blobs2.txt | sort -rn
```

| dir | history, on-disk | share of 4,530 MiB |
|---|---|---|
| `public/` | **2,913.3 MiB** | 64.3% |
| `photos-wikimedia/` | 879.9 MiB | 19.4% |
| `models/` | 652.1 MiB | 14.4% |
| **`scratch/`** | **116.4 MiB** | **2.6%** |
| `cartograph/` | 48.5 MiB | 1.1% |

**③ `CLAUDE.md`'s "`scratch/` holds 200+" is stale in both directions.**

```bash
git ls-files scratch | grep -cE '\.(mjs|js|cjs)$'   # → 657  (scripts)
git ls-files scratch | grep -c 'FORENSIC.*\.md'     # → 7    (forensic STUDIES)
```

Classify as **ROT** — evict the number, replace with the command.

---

## 1 · Liability or asset? The tension is stated inside the README, one line apart

- `README.md:196` — *"**`scratch/`** — git-tracked working files; **throwaway-ish, not
  canonical**."*
- `README.md:28,29,30,35,37,173,180` — **13 citations as the harness of record**: *"verify with
  `node scratch/claims-scene-at-default.mjs`, never by belief"*, *"harness
  `scratch/correctness-detector.mjs`"*.
- `PIPELINE-CLAIMS.md` — 14 references; its constitution is *"A number without its method is not a
  claim"*, and the methods are `node scratch/…`.

~4% of scratch is the verification apparatus — *"the real prize"* — filed in a directory the README
labels throwaway, with **no npm script, no runner, no README, no CI**:

```bash
node -e "console.log(Object.keys(require('./package.json').scripts).join(' '))"
# → dev dev:web dev:cartograph dev:arborist dev:meteorologist build preview
grep -n scratch package.json     # → (no output)
```

---

## 2 · Taxonomy

### 2.1 Census

```bash
git ls-files scratch | wc -l                                             # → 1381
git ls-files scratch | grep -E '\.(mjs|js|cjs)$' | xargs wc -l | tail -1 # → 69347
```

| ext | files | HEAD bytes | history (on-disk) |
|---|---:|---:|---:|
| `.svg` | 140 | **105.42 MiB** | 35.57 MiB |
| `.bin` | 5 | **60.26 MiB** | 11.27 MiB |
| `.png` | 380 | **53.42 MiB** | 59.48 MiB |
| `.glb` | 10 | 12.81 MiB | 4.98 MiB |
| `.json` | 27 | 5.65 MiB | 0.79 MiB |
| `.mjs` | 628 | 3.64 MiB | 1.67 MiB |
| `.md` | 134 | 2.01 MiB | 0.94 MiB |
| other | 57 | 4.10 MiB | 1.69 MiB |
| **TOTAL** | **1381** | **247.31 MiB** | **116.39 MiB** |

**247 MiB of working tree every developer checks out and every editor indexes; 234.54 MiB (95%) is
binary/vector dumps nothing references.**

### 2.2 The 657 scripts, by purpose keyword

| cluster | n | what it is |
|---|---:|---|
| `claims-*` | **78** | the reproducible-check family — **the asset** |
| `*probe*` | 46 | one-shot interrogations of a live artifact |
| `*diag*` | 32 | diagnostics |
| `*render*`/`*svg*`/`*viz*` | 34 | SVG/PNG emitters — producers of the 245 image files |
| `*check*` | 19 | ad-hoc assertions (not the `claims-` contract) |
| `*audit*` | 15 | campaign walks |
| `*census*` | 14 | population counts |
| `*test*`/`*proof*`/`*spike*`/`*measure*`/`*trace*`/`*bisect*`/`*repro*` | 47 | investigation scaffolding |
| **no purpose keyword at all** | **371** | codename one-offs |

```bash
git ls-files scratch | grep -E '\.(mjs|js|cjs)$' | grep -v claims- \
  | xargs -n1 basename | sed 's/-.*//' | sort | uniq -c | sort -rn | head -15
```

The 371 are named by **session codename, not subject**: `LINDEN-` 26, `cap-` 23, `bollard-` 23,
`mitre-` 16, `voussoir-` 12, `mercator-` 9, plus `tresaguet-`, `vesalius-`, `gunter-`, `sextant-`,
`alidade-`, `benton-`. ⭐ **A codename is unsearchable by anyone who was not in the session that
coined it — the direct reason "reuse forensics, never re-derive" cannot be complied with, and why
the corpus regenerates itself.**

Only **269 of 628** `.mjs` open with a comment at all.

### 2.3 Date profile

| month last touched | files at HEAD |
|---|---:|
| 2026-05 | 136 |
| 2026-06 | **846** |
| 2026-07 | 173 |
| 2026-08 | 226 |

| age bucket | files | share |
|---|---:|---:|
| untouched > 60 days | **982** | 71.1% |
| untouched > 30 days | **1155** | 83.6% |
| touched in the last 30 days | 226 | 16.4% |

Of the 226 recent, **166 are `.mjs`** — the live front is scripts; images are frozen. **June 2026
alone deposited 846 files nobody has opened since.**

---

## 3 · The three populations

```bash
git grep -oh 'scratch/[A-Za-z0-9_][A-Za-z0-9_./-]*' -- ':!scratch' ':!.gitignore' \
  | sed 's/[.,)]*$//' | sort -u > refs.txt        # → 226 distinct referenced paths
git ls-files scratch | sort > head.txt
comm -12 refs.txt head.txt > referenced.txt       # → 202 exist
comm -23 head.txt referenced.txt > orphans.txt    # → 1179 orphans
```

| population | files | HEAD bytes | share |
|---|---:|---:|---:|
| **REFERENCED** | **202** | **3.98 MiB** | 14.6% |
| **ORPHANS** | **1179** | **243.32 MiB** | 85.4% |
| — also >60d (**COLD ORPHANS**) | **916** | **207.03 MiB** | 66.3% |

**The referenced corpus is 4 MiB. The orphan mass is 61× the weight of everything anyone cites.**

### 3.1 LIVE CHECKS — the asset, and it works

79 `claims-*` files (78 `.mjs` + `claims-onboarding-guard.sh`); **57 cited by a live doc.**

```bash
for f in scratch/claims-*.mjs; do
  grep -qE 'writeFileSync|writeFile\(|mkdirSync|rmSync|unlinkSync|execSync|spawnSync|fetch\(' "$f" && continue
  node "$f" >/dev/null 2>&1; echo "$? $f"
done | awk '{print $1}' | sort | uniq -c
```

| exit code | n | meaning |
|---:|---:|---|
| 0 | 37 | check passes |
| 1 | 15 | **claim measured FALSE** — a live red gate, not rot |
| 2 | 8 | loud usage failure (e.g. *"⛔ LOUD FAIL — no `--source` given, and there is deliberately NO DEFAULT"*) |
| crash | **0** | — |

**Zero of 60 are broken. Every non-zero exit is the check doing its job.**

```bash
grep -lE "readFileSync\([^)]*(src/|cartograph/|arborist/|meteorologist/)" scratch/claims-*.mjs | wc -l   # → 17
```

- **17 parse source code** — the blessed pattern. `claims-revert-field-coverage.mjs` prints
  `revert scopes, parsed from src/cartograph/stores/useCartographStore.js:`;
  `claims-clip-extent-floor.mjs` prints `── A. the expressions, parsed from source ──`. **These
  cannot go stale.**
- **59 read data artifacts** (`ribbons.json`, `shape.json`, `design.json`, the slab). Still checks,
  but they measure a baked output, so they stale when the artifact is not re-poured.
- None observed restating a hardcoded expectation as prose.

⛔ **Layer 0 defect inside the check family:**

```bash
grep -lE "'lafayette-square'|\"lafayette-square\"" scratch/claims-*.mjs | wc -l   # → 25
grep -l '\-\-scene' scratch/claims-*.mjs | wc -l                                  # → 16
```

**25 hardcode LS; only 16 take `--scene`. A check that only runs on town #1 fails Layer 0 question
1** — same class as the standing `litmus-curb-parallel.mjs` receipt. Not a reason to leave them in
scratch; it is the work item that comes *with* promotion.

**Promotion set:** the 57 doc-cited `claims-*` (**0.61 MiB**) plus `correctness-detector.mjs`,
`rebake-shape.mjs`, `tree-lu-exclusion-census.mjs`, `thrunode-frozen-verify.mjs`,
`coupler-slit-universal.mjs`. Move to `checks/`, add `"check": "node checks/run-all.mjs"`, repoint
doc references **in the same commit**, write a 30-line `checks/README.md` listing each check's claim
in one line.

### 3.2 REFERENCED FORENSICS — cannot be deleted without repointing

```bash
git grep -o 'scratch/[A-Za-z0-9_./-]*' -- ':!scratch' | sed 's/:.*//' | sort | uniq -c | sort -rn | head -20
```

| citer | refs |
|---|---:|
| `ROADMAP.md` | 36 |
| `arborist/_archive/NOTES-2026-05-diary.md` | 27 |
| `cartograph/POLYGON-FIRST.md` | 21 |
| `cartograph/_archive/A10-cure-journey-2026-08-11.md` | 18 |
| `cartograph/RIBBONS.md` | 17 |
| `arborist/_archive/BACKLOG-2026-05-brief-arcs.md` | 17 |
| `.gitignore` | 17 |
| `arborist/ARCHITECTURE.md` | 16 |
| `PIPELINE-CLAIMS.md` | 14 |
| `README.md` | 13 |
| `arborist/BACKLOG.md` | 13 |
| `SECURITY.md` | 10 |
| `cartograph/BACKLOG.md` | 10 |
| **`src/lib/tileGround.js`** | **4** (production source cites `scratch/`) |

Referenced by kind: 137 `.mjs`, 45 `.md`, 4 `.png`, 4 `.cjs`, plus singles. **Zero `.svg`, zero
`.bin`, zero `.glb` are referenced by anything.**

**66 of the 202 referenced files are cold (>60d)** — cited but never re-run, so most likely to have
silently rotted against a refactored `src/`.

⚠️ **Coupling risk:** `grep -lE "from ['\"]\.\./(src|cartograph|arborist)" scratch/*.mjs
scratch/*.js scratch/*.cjs | wc -l` → **363 of 657 import production modules directly.** Every
rename in `src/` breaks them and nothing reports it, because nothing runs them.

**7 real dead pointers already exist:**

```
scratch/alidade-spike-proof.svg
scratch/alidade-spike.mjs
scratch/bezier-parity-test.mjs
scratch/gunter-ribbons-HEAD.json
scratch/leg-build.mjs
scratch/stamp-mouth-audit.mjs
scratch/stamp-predicts-fill.mjs
```

### 3.3 ORPHANS — the deletion candidate mass

**1179 files, 243.32 MiB, 85.4%.**

| orphan bucket | files | HEAD bytes |
|---|---:|---:|
| `.svg` (2 MiB map dumps) | 140 | **105.42 MiB** |
| `.bin`/`.glb`/`.gz`/`.geojson` | 17 | **75.69 MiB** |
| `.png` | 376 | **53.11 MiB** |
| `.json`/`.csv`/`.jsonl`/`.tsv`/`.txt` | 39 | 5.24 MiB |
| `.mjs`/`.js` | **514** | 2.62 MiB |
| `.md` | 89 | 1.18 MiB |

**Hot orphans: 128 files touched in the last 30 days that nothing references** — today's session
residue; leave alone. **The corpus is still accreting at ~4 files/day.**

**Do the orphan scripts still run?** Sampled 20 non-`claims` scripts (every 22nd, skipping 6 that
write): **13 of 14 runnable ones executed cleanly** (`LINDEN-soup-diag`, `apron-node-kinds`,
`bollard-namelogic`, `caliper-instr`, `dcurb-probe`, `hpdm-curb-probe`, `g3a-diag`, `node-runkey`,
`prevailing-kink`, `marl-ksi-polygon-cost`, `coclaim-by-nodekind`, …). One broken:
`scratch/_diagY.mjs` (ENOENT).

⭐ **The orphans are undiscoverable, not rotted** — so archive-don't-delete applies, and **git
history *is* that archive at zero recurring cost.**

**Duplicates:** 14 content-hashes appear more than once, covering 31 files. `ls-clean.bin` ≡
`bin-CLEAN.bin`, `ls-withcustoms.bin` ≡ `bin-WITHCUSTOMS.bin` — **24 MiB of the 60 MiB `.bin` mass
is literal duplication.**

---

## 4 · `_handoffs/` — untracked, and 11 tracked docs depend on it

```bash
ls _handoffs | wc -l           # → 54 (.md only)
du -sh _handoffs               # → 776K
git ls-files _handoffs | wc -l # → 0    ← NOT TRACKED
ls -l _handoffs | awk 'NR>1{print $6}' | sort | uniq -c   # → May 1, Jun 12, Jul 37, Aug 4
```

Nothing added since 2026-08-05. A dispatch-brief spool: 51 `HANDOFF-*.md`, 4 `BRIEF-*.md`,
1 `CARY-BRIEF.md`.

```bash
git grep -n -o '_handoffs/[A-Za-z0-9_.-]*\.md' -- ':!.gitignore' ':!scratch' | sort -u
```

| cited file | cited from |
|---|---|
| `HANDOFF-deadend-face-resolution.md` | `README.md`×4, `ROADMAP.md`, `cartograph/PIPELINE.md`, `POLYGON-FIRST.md`, `PREBAKE.md`, `RIBBONS.md`×2, `SECTION.md` |
| `CARY-BRIEF.md` | `README.md`×2 |
| `BRIEF-intake-manifest.md` | `README.md` |
| `HANDOFF-A06-legacy-carve-chain-free.md` | `ROADMAP.md` |
| `HANDOFF-pipeline-reproducibility.md` | `cartograph/POLYGON-FIRST.md` |
| `HANDOFF-freeze-the-curb-in-the-first-bake.md` | `cartograph/PREBAKE.md` |
| `HANDOFF-hero-impostor-foundation.md` | `arborist/ARCHITECTURE.md` |
| `HANDOFF-hero-impostor-and-startup-weight.md` | `BRIEF-arborist-join-and-budget.md` |
| `HANDOFF-curve-primitive-skeleton.md` | `BRIEF-hpdm-curve-fit.md` |
| `HANDOFF-doc-sweep-corrections.md` | archive×2 |

**All 10 exist on disk; none exist in any clone.** `README.md:167` and `cartograph/SECTION.md:278`
label `HANDOFF-deadend-face-resolution.md` the **"live task"** for `ROADMAP A0`.

⭐ `.gitignore:67-68` names this exact hazard in its own comments: *"Worst case is a brief moved
from the (also-ignored) `_handoffs/` to here — it then existed in NO tracked location at all."*

**Disposition:** track the 10 cited briefs, repoint 25 call sites in the same commit — 776K total,
cost nil. The other 44 stay untracked; spent dispatch material.

---

## 5 · `.gitignore` — a policy, not a junk drawer

```bash
wc -lc .gitignore                                              # → 293 lines, 13747 bytes
grep -c '^\s*#' .gitignore                                     # → 122 comment lines (41.6%)
grep -vcE '^\s*(#|$)' .gitignore                               # → 147 rules
grep -cE '^\s*!' .gitignore                                    # → 69 negations (46.9%)
grep -vE '^\s*(#|$)' .gitignore | grep -cE '[*?\[]'            # → 31 rules contain a glob
grep -E '^\s*!' .gitignore | grep -vE '[*?\[]' | grep -cE '\.[A-Za-z0-9]+$'   # → 45 single-file negations
```

**Characterization: a maintained, heavily-annotated deny-all-then-allowlist policy.** 42% is prose
explaining *why*, and the prose is good — it records the `a20619cc` incident where a stray
`sangabriel.obj` baked the San Gabriel mountains into Altadena, and flags the "`_archive` gitignore
gotcha" open since 2026-06-30. **Nobody was fighting binaries file-by-file in a panic.**

⛔ **But it fails Layer 0 question 1, visibly.** Lines 85–201 are 4 near-identical per-scene blocks
(`lafayette-square`, `hipointe-demun`, `ksi-y-m-yn`, `toy`), each hand-enumerating 6–18 files:

```
!cartograph/data/hipointe-demun/tree-mix.json
!cartograph/data/ksi-y-m-yn/content/menus.json
!cartograph/data/lafayette-square/clean/park_trees.json
```

**This is an enumerated exception table.** Town #5 requires hand-adding ~15 lines; a missed line
silently drops that scene's inputs — **a plausible-looking success with a missing input.** The
kit-shaped fix is rules keyed on **role, not town** (`cartograph/data/*/raw/osm.json`,
`cartograph/data/*/clean/*.json`, `cartograph/data/*/content/*.json`), collapsing ~60 lines to ~8.

The 17 `scratch/` rules are all dot-prefixed probe scratchpads — a sound convention (*"checkers are
tracked, their scratchpads are not"*) that should survive any cleanup. **7 dot-files inside
`scratch/` ARE tracked deliberately** — don't sweep those.

---

## 6 · Clone weight

```bash
git count-objects -vH        # size-pack: 4.41 GiB  |  in-pack: 29168
du -sh .git                  # 4.7G
ls .gitattributes            # absent — no LFS
```

At HEAD: **2,016.51 MiB across 4,596 files.**

Largest blobs in HISTORY:

| MiB | path |
|---:|---|
| 63.5 | `models/lamp-posts/uploads_files_6828811_Textures2.1-4K.zip` |
| 59.2 | `models/lamp-posts/uploads_files_6828811_Light2.1.glb` |
| 20.3 / 19.9 / 14.8 | `public/baked/lafayette-square/trees-atlas-color.png` (many versions) |
| 19.6 / 18.5 | `public/baked/hipointe-demun/trees-atlas-color.png` |
| 19.3 ×3 | `public/baked/lafayette-square/trees/broadleaf_rt3/skeleton-1-lod0.glb` |
| 18.0 | `public/baked/lafayette-square/ground.bin` |
| 17.8 | `public/baked/altadena/ground.bin` |

**Two vendor `.zip` archives that are unpacked sources for a model already tracked unpacked account
for 97 MiB.** `public/baked/` is a *generated* directory whose every re-bake writes a fresh
16–20 MiB atlas into permanent history.

### ⛔ Before sharing

**History weight cannot be fixed by deleting files now.** Removing all 1,179 orphans reclaims
**243 MiB of working tree** and **0 clone bytes**. Three options:

1. **Clean HEAD only.** Clone stays 4.41 GiB. Zero risk, zero benefit.
2. **`git clone --depth 1`** in onboarding. Transfers ~2.0 GiB. **Zero risk, no rewrite, one
   line.** ← the cheap win.
3. **`filter-repo`** stripping `models/*.zip`, `photos-wikimedia/`, historical `public/baked/`
   versions — an estimated **3.4–3.8 GiB** recovered (~85% smaller). **Rewrites all SHAs**, which
   breaks every SHA cited in the docs (`08d61ce1`, `7b5b87a3`, `29955e46`, `a98a9cd5`,
   `6d2fcb4d`…). **Do it once, before sharing, or never.**

---

## 7 · Disposition plan, ordered by value ÷ risk

| # | action | files | HEAD bytes | clone bytes | risk |
|---:|---|---:|---:|---:|---|
| **1** | **Track the 10 cited `_handoffs/` briefs**, repoint 25 call sites | +10 | +0.4 MiB | +0.4 MiB | **none** |
| **2** | **`git clone --depth 1` in README onboarding** | 0 | 0 | **−2.4 GiB felt** | **none** |
| **3** | **Promote 62 live checks to `checks/`** + README + `npm run check` | 62 moved | 0 | 0 | **low** — repoint ~202 refs in the *same* commit |
| **4** | **Delete 157 orphan binary dumps** (140 svg, 5 bin, 10 glb, gz, geojson) | −157 | **−181.11 MiB** | 0 | **very low** |
| **5** | **Delete 376 orphan `.png`** | −376 | **−53.11 MiB** | 0 | **very low** |
| **6** | **Delete 383 cold-orphan scripts + docs** | −383 | −3.2 MiB | 0 | **low–medium** |
| **7** | **Fix the 7 existing dead `scratch/` pointers** | 0 | 0 | 0 | none |
| **8** | **Collapse `.gitignore`'s 45 per-town negations to ~8 role-keyed patterns** | 0 | −~4 KiB | 0 | **medium** |
| **9** | **`git filter-repo` the history** | 0 | 0 | **−3.4 to −3.8 GiB** | **HIGH** |

⚠️ On action 6: **review the 89 orphan `.md` by eye** — `MEDIAN-RESEARCH-FINDINGS`,
`THRUNODE-GATE-LANDING`, `CENSUS-RECOVERY-FINDINGS` may be the only record of a decision; those go
to `cartograph/_archive/`, not the bin.

**Cumulative through action 6: 1,079 files removed (−78% of `scratch/`), 237.4 MiB reclaimed
(−96% of scratch's HEAD weight), zero doc pointers broken, 62 checks promoted.** `scratch/` ends at
~302 files / ~10 MiB.

### Dead-pointer guard — re-derive before executing

```bash
git grep -oh 'scratch/[A-Za-z0-9_][A-Za-z0-9_./-]*' -- ':!scratch' ':!.gitignore' \
  | sed 's/[.,)]*$//' | sort -u > /tmp/refs.txt
git ls-files scratch | sort > /tmp/head.txt
comm -12 /tmp/refs.txt /tmp/head.txt > /tmp/KEEP.txt    # must be 202; never delete a line in this file
```

Two things the grep does not catch, both to check by hand:

- **`src/lib/tileGround.js` cites `scratch/` 4 times** — production source referencing scratch
  paths. Read those 4 sites first.
- **Intra-`scratch/` imports** were excluded from the scan by design. If a promoted check imports a
  helper still in `scratch/`, the helper must travel with it — **verify with `node
  checks/run-all.mjs`, not by inspection.**

**Verification of no side effects:** every script executed was first confirmed free of
`writeFileSync`/`mkdirSync`/`rmSync`/`unlinkSync`/`execSync`/`spawnSync`/`fetch(`.
