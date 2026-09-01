# REPORT 06 — Outsider release readiness

Repo `lafayette-square` (`git@github.com:jacobeugenehenderson/lafayette-square.git`), branch
`land-use-derivation`. Audited 2026-08-31, read-only, **zero edits made.** Dev servers started
during the audit were terminated. **Secret values were never reproduced — only file paths and
secret classes.**

---

## 0 · First-contact reaction (recorded before going deeper)

**`CLAUDE.md` (22,735 bytes) is the first file a stranger opens, and it is not addressed to them.**
It opens with "⛔⛔ LAYER 0", references "Boz", "Pip", "the librarian Process", "the day-cycle", and
cites dated internal incidents. It contains the sentence *"WRITING WRONG SHIT DOWN IS WHY YOU ARE
FAILING."* It is a management document for AI agents, and it is at the front door.

The effect on a stranger is not "this is disciplined" — the first read is **"something went badly
wrong here repeatedly, and this file is the scar tissue."** The doc is *literally an incident log*:
it enumerates its own past failures, including a paragraph admitting that its own cited evidence
went stale twice while claiming to be current. **An investor reading this reasonably concludes the
project's dominant cost is rework.**

⭐ **That is a framing loss, not a truth about the project.** `ORIENTATION.md` — the *second* file —
is genuinely excellent. Its first 20 lines (*"A kit for pouring 3D neighborhoods… Lafayette Square
is the first neighborhood off the line… it has to be beautiful and run on a phone"*) are the
clearest, most sellable articulation of the product anywhere in the repo. **It should be the front
door. It is currently gated behind an agent-discipline document.**

**Second reaction:** I could not tell what the product is from the repository *name*. Everything
about the packaging says "one bespoke website for one St. Louis neighborhood." Everything about the
architecture says "a productizable kit." **A stranger will price the first one.**

**Third reaction:** ~50 markdown files at root, 17 of them `BRIEF-*`, a 155 KB `ROADMAP.md`, a 62 KB
`README.md`. **I could not find "how do I run this" without grepping.** It is at README line 45,
below a doctrine table whose individual *cells* run to 3,000+ characters.

---

## 1 · RELEASE BLOCKERS

### B1 — No LICENSE. The repo is legally un-shareable as it stands. **[S] [risk: HIGH]**

```bash
git ls-files | grep -iE '^(LICENSE|COPYING|NOTICE)'   # → (no output)
grep -n '"license"' package.json                      # → (no output)
```

No `LICENSE`, `COPYING`, `NOTICE`, `license` field, or copyright statement. `"private": true`
prevents npm publish; **it grants no rights to a reader.**

**Consequence:** under default copyright a contractor who clones this has *no license to use,
modify, or run it*, and — more dangerously for you — **no assignment of what they write back.**
Every outsider contribution is currently ambiguously owned. **Cheapest blocker on the list; most
expensive to have skipped.**

### B2 — Clone weight: 4.41 GiB pack, 90% build artifacts, unfixable at HEAD. **[L] [risk: HIGH]**

```bash
git count-objects -vH
#   size-pack: 4.41 GiB   in-pack: 29168   packs: 6
git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
    | awk '$1=="blob"' | sort -k3 -nr > blobs.txt
awk '{s+=$3} END {printf "%.2f GB / %d blobs\n", s/1073741824, NR}' blobs.txt
#   9.66 GB across 16421 blobs
awk '$4 ~ /\.(glb|bin|png|jpg|jpeg|zip|fbx|tif|tiff|ktx2)$/{s+=$3} END{printf "%.2f GB\n", s/1073741824}' blobs.txt
#   7.82 GB   ← 81% of all history is binary build output
grep -c 'ground.bin' blobs.txt        # → 140  (140 committed revisions of one generated file)
awk '/ground.bin/{s+=$3} END{printf "%.2f GB\n", s/1073741824}' blobs.txt   # → 1.79 GB
```

History by top-level directory: `public/` 6.46 GB · `cartograph/` 1.04 · `photos-wikimedia/` 0.86 ·
`models/` 0.72 · `scratch/` 0.24 · `src/` 0.22 · **all markdown combined ~0.02**.

Largest history blobs: an 80.5 MB vendor ZIP, a 63.5 MB texture ZIP, a 63.4 MB raw OSM dump, a
59.6 MB GLB — **none source.**

**Plainly: yes, an outsider *can* clone this, but it is a 4.4 GB, multi-tens-of-minutes download for
~120k lines of actual code, and it worsens with every bake.** 2,286 tracked binaries at HEAD mean
even `--depth 1` is ~2 GB (`1.97 GB across 4597 files`).

⛔ **Explicit on the mechanic: deleting these at HEAD does nothing.** Git history is immutable
content-addressed storage; the 4.41 GiB pack is already in every clone and in `origin`. Only fixes:

- **(a) History rewrite** — `git filter-repo --path public/baked --path models --path
  photos-wikimedia --invert-paths`, force-push, every collaborator re-clones, all **62 branches**
  rebased or dropped. Pack likely drops to ~0.3–0.5 GiB. **L.** One-day-plus, real chance of losing
  work, and **it must precede outsider clones because after that the cost multiplies by clone
  count.**
- **(b) Fresh public repo** — clean export at HEAD, keep this private as archive. **M.** Loses
  `git log`/`blame`, which for a project whose commit messages are its design record is a genuine
  loss.
- **(c) Git LFS / asset CDN** going forward. Doesn't fix the existing pack; stops the bleeding.
  **Do regardless. M.**

**Recommendation: (a) + (c), before the first outsider clone.** `botanica/` is 103 GB on disk,
correctly gitignored, 0 tracked — not part of this problem, but it means a new contributor's tree
won't resemble yours and **that must be documented.**

### B3 — A live third-party endpoint is committed in plaintext in the README. **[S] [risk: MED-HIGH]**

```bash
git check-ignore -v .env                       # → .gitignore:8  (correctly ignored)
git log --all --full-history --oneline -- .env # → (no output — NEVER committed) ✅
git ls-files | grep -iE '(^|/)\.env'           # → (no output) ✅
```

**`.env` itself is clean.** Never committed, gitignored, three keys (`VITE_API_URL`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — all client-side values that ship in the browser
bundle anyway. CI supplies them from GitHub Secrets. **That part is correct.**

**However — `README.md:69-70` prints two of the three verbatim as a literal example block**,
duplicated across `worker.js:1`, `PUBLISH.md` (5 sites), `SECURITY.md` (6),
`ls/reference/INVENTORY-API.md` (2), `public/codedesk/index.html:479`. **17 sites across 7 files.**

Two classes:

- **Supabase project URL + anon key** — designed public; acceptable *iff* RLS is enforced on every
  table. **Not a blocker alone.**
- **The Google Apps Script `/exec` deployment URL** — a **capability URL**: possession is
  authorization. It has been in a public-facing README. `plans/pre_public_cleanout.md` §S8 already
  names it "the fifth deployment-ID location," so this is known. **Treat as disclosed:** redeploy
  for a new ID, add auth, replace all occurrences with `${VITE_API_URL}`, consolidate to one source.

⭐ **Otherwise the secret scan is clean.** No JWTs, `sk-*`, `ghp_*`, `AKIA*`, PEM keys, or
credentialed connection strings in any tracked file. The only `service_role` hits are the Postgres
role name in grants — verified false positives. **No secret has ever entered history by filename.
Better than most repos this age; worth saying.**

### B4 — OSM/ODbL attribution is absent from the shipped product. **[S] [risk: MED]**

```bash
git grep -lniE 'openstreetmap|odbl' -- '*.md' '*.html' '*.jsx' '*.js'  # → 16 files, all internal
git grep -niE 'openstreetmap|odbl' -- src public/*.html index.html
#   → src/cartograph/SourcesPanel.jsx only (9 hits)
```

**ODbL §4.3 requires any Produced Work to carry attribution visible to end users.** A rendered 3D
neighborhood is a Produced Work. `SourcesPanel.jsx` is the **operator-facing intake UI**, not the
public app. No attribution in `index.html`, no credits surface, no `ATTRIBUTION.md`. **A stranger's
read: this ships derived OSM data with no attribution.** That is the single most common OSM
compliance failure and it is checked by people who care.

Further unresolved licensing surface, all **S to document**:

- `models/lamp-posts/uploads_files_6828811_*.zip` — third-party 3D asset, 144 MB across two ZIPs.
- `photos-wikimedia/` — 298 tracked files, 884 MB. Wikimedia is a mix of CC-BY / CC-BY-SA / PD, each
  requiring per-file attribution. *(An attribution.json does exist — see REPORT-05 §5 — but nothing
  renders it.)*
- `assets/` — `.ai`/`.svg`/`.xlsx`/`.pdf`. Provenance unstated.
- Microsoft Building Footprints — ODbL; same treatment needed.

**No `THIRD-PARTY-NOTICES.md` anywhere.** For a product whose value proposition is ingesting open
geodata, **this is the gap noticed fastest.**

### B5 — `cary/legal/` ships seven unsigned draft legal instruments for a *different business*. **[S] [risk: MED]**

```
cary/legal/README.md
cary/legal/courier-agreement.md          (12,375 B — Courier Independent-Contractor Agreement)
cary/legal/sender-agreement.md           (12,497 B — Sender Participation Agreement)
cary/legal/places-guardian-terms.md      (content license + Section 230 posture)
cary/legal/rider-template.md             (per-jurisdiction schedule)
cary/legal/org-structure.md              (13,173 B — corporate structure)
cary/legal/legal-readiness-brief.md
```

Worker-classification contracts for a delivery business, self-described as *"Draft / orientation —
NOT legal advice… not by a licensed attorney. Nothing here is enforceable."* They sit in a 3D
mapping repo with **no gitignore, no access control, no `DRAFT` in any filename.**

Three problems: **legibility** (an investor opening `cary/` asks whether this is a mapping kit or a
delivery startup); **legal risk** (unreviewed IC-classification language is precisely the category
where an escaped draft causes harm, independent of enforceability); **confidentiality**
(`org-structure.md` is corporate-structure material inside the artifact you're handing to
contractors).

**Fix:** move out of this repo, or at minimum gitignore and `DRAFT-` prefix every file. **Before the
first clone; after that it is in their copy permanently.**

---

## 2 · CREDIBILITY

### C1 — Effectively no test suite, in ~122,000 lines of product code. **[L] [risk: HIGH]**

```bash
git ls-files | grep -iE '(\.test\.|\.spec\.|(^|/)tests?/|__tests__)'
#   scratch/hpdm-identity-lock.test.mjs          ← one file, in the scratch directory
grep -n '"test"' package.json                 # → (no output)
git ls-files | grep -iE '(vitest|jest|mocha|playwright|cypress)\.config'  # → (none)
git ls-files 'src/**/*.js*' 'cartograph/*.js' 'arborist/*.js' 'meteorologist/**/*.js' \
    | grep -v _archive | xargs wc -l | tail -1
#   122034 total
```

**The single most damaging credibility finding.** No runner, no test script, no CI test step (both
workflows run `npm ci && npm run build`, nothing else).

⭐ **The honest counter-argument is visible:** `scratch/` holds **1,381 tracked files**, many
`claims-*.mjs` verification harnesses, and `CLAUDE.md`'s *"IF IT CAN BE CHECKED BY RUNNING
SOMETHING, IT IS A CHECK"* is exactly right. **You have built a large body of verification logic and
then declined to call it a test suite or run it automatically.**

**The gap between those two facts is what a stranger judges.** A directory named `scratch/`
containing 1,381 files signals disposable; that the actual invariant checks live there means an
outsider never finds them, concludes there are no tests, and is *nearly* right — **because nothing
runs them.**

**Cheap, high-leverage fix:** promote `claims-*.mjs` into `checks/` or `test/`, add `"test"`, add a
`test` step to both workflows. **M** for promotion, **S** for CI. The unit-test debt on 122k lines is
**L** and real — but the *appearance* problem is fixable in a day.

### C2 — Zero lint, zero format, zero type config. **[M] [risk: MED]**

```bash
git ls-files | grep -iE '(eslint|prettier|biome|\.editorconfig|tsconfig)'   # → (no output)
```

Despite `@types/react` and `@types/react-dom` being installed. **The first outsider PR will be a
whitespace diff.** Do config + a `--max-warnings` ratchet, **not a big-bang reformat.**

### C3 — Node unpinned locally, pinned only in CI. **[S] [risk: MED]**

```bash
ls .nvmrc .node-version        # → No such file
grep -n '"engines"' package.json  # → (no output)
grep -n 'node-version' .github/workflows/*.yml  # → both pin node-version: 20
node -v  # → v22.20.0   ← dev on 22; CI builds on 20
```

**Dev and CI are on different Node majors and nothing declares which is correct.**

### C4 — 12 npm vulnerabilities incl. 2 critical; Three.js 25 minors behind. **[M] [risk: MED]**

```
npm audit → 12 vulnerabilities (1 low, 1 moderate, 8 high, 2 critical)
  ws 8.0.0–8.20.1  — high — uninitialized memory disclosure + memory-exhaustion DoS
  shell-quote      — via concurrently 9.2.1
npm outdated → three 0.160.1 → 0.185.1 (25 minors) · vite 5.4.21 → 8.2.2 (3 majors)
               react 18.3.1 → 19.2.8 · tailwindcss 3.4.19 → 4.3.3 · zustand 4.5.7 → 5.0.15
```

⚠️ **REPORT-07 later measured this more precisely: `npm audit --omit=dev` returns ONE high. 11 of 12
are dev-only tooling. Quoting "12 vulnerabilities" overstates shipped risk ~12×.**

Stale dependencies by npm `time.modified`:

| package | last published | note |
|---|---|---|
| `clipper-lib` | 2022-06-13 | **load-bearing** — the polygon-offset engine the entire ribbon/section pipeline rests on |
| `poly2tri` | 2022-06-24 | triangulation, runtime dep |
| `tz-lookup` | 2022-06-28 | runtime dep; **timezone boundaries change** |
| `fbx2gltf` | 2023-04-24 | prebuilt native binary; will break on a future macOS/Node |
| `node-unrar-js` | 2023-11-29 | unmaintained; RAR parsing on untrusted input is a classic memory-safety surface |

**`clipper-lib` unmaintained since 2022 is the strategically important one** — it is the geometric
core of the kit. **Write a one-paragraph `DEPENDENCIES.md` saying which stale deps are deliberate and
why. The paragraph is worth more than the upgrades.**

### C5 — The kit special-cases instance #1 *in the kit code*. **[L] [risk: HIGH — strategic]**

```bash
git grep -lI -i 'lafayette' -- ':!*.md' | wc -l                                              # → 704
git grep -lI -i 'lafayette' -- '*.js' '*.jsx' '*.mjs' '*.html' | grep -v '^scratch/' | wc -l  # → 128
```

Most are harmless defaults. **But several are behavioral branches — the kit asking "am I Lafayette
Square?" and behaving differently:**

```
cartograph/bake-buildings.js:662   if (scene !== 'lafayette-square' && existsSync(nbP)) {
cartograph/bake-buildings.js:658   // The `scene !== 'lafayette-square'` gate is a HARDWIRE, twin of the source-select
cartograph/bake-content.js:722     if (scene === 'lafayette-square' && !force) {
cartograph/bake-ground.js:738      const ribbonsPath = scene === 'lafayette-square' ? … : …
cartograph/bake-ground-ao.js:169   const isDefaultScene = scene === 'lafayette-square'
cartograph/bake-lamps.js:96        if (scene === 'lafayette-square') {
```

**Consequence for the pitch: any claim that "the next town pours from the same kit" is contradicted
by five conditionals asking for the first town by name. A reviewer greps for exactly this.**

**L.** The path is designed — `src/instance.js` is a well-built per-installation config module with a
clear docblock and a `?look=` selector; the right shape. The work is finishing it into the bake
pipeline. **Until then, do not claim kit-portability without the caveat — the caveat is one grep
away.**

### C6 — Onboarding a new town requires hand-editing a 293-line `.gitignore`. **[M] [risk: MED]**

```bash
grep -c '^!' .gitignore    # → 69 negation lines
grep -n 'hipointe' .gitignore | wc -l   # → ~30 lines for one town
```

`ONBOARDING.md` STAGE 1 step 3, literally: *"Add the `.gitignore` un-ignore block (mirror the
HPDM/`ksi-y-m-yn` blocks)…"* **For a product sold as "pour a town," an outsider names this
immediately.** Root cause is B2: source and generated data intermix. **Fix the layout (`data/`
authored, `build/` generated, one rule) and this evaporates.**

### C7 — Eleven documented canon references are dead on clone. **[S] [risk: MED]**

```bash
git check-ignore -v _handoffs        # → .gitignore:245
git ls-files _handoffs | wc -l       # → 0
ls _handoffs | wc -l                 # → 56 files present locally
git grep -l '_handoffs/' -- '*.md' | wc -l                            # → 17 tracked docs cite it
git grep -ohE '_handoffs/[A-Za-z0-9_.-]+' -- '*.md' | sort -u | wc -l  # → 11 distinct paths
```

**17 tracked documents — `README.md` (7 citations), `ROADMAP.md` (5),
`cartograph/{PIPELINE,POLYGON-FIRST,PREBAKE,RIBBONS,SECTION}.md`, `arborist/ARCHITECTURE.md` — cite
11 distinct files inside a gitignored directory as authoritative.**

**On your machine these resolve. On a fresh clone every one is a 404.** A stranger following the
README's own routing hits dead ends in the primary canon.

⭐ The *tracked* link graph is otherwise sound: 78 distinct `.md` links extracted from
README/ORIENTATION/CLAUDE, each checked against `git ls-files` → **0 broken.** **The problem is
exactly and only `_handoffs/`.**

### C8 — 62 branches, and the deploy trunk is not `main`. **[S] [risk: MED]**

```bash
git branch -a | wc -l   # → 62
# staging.yml: on: push: branches: [land-use-derivation]
# deploy.yml:  on: push: branches: [main]
```

An outsider cannot tell which branches are live. **The active trunk is a feature-named branch
deploying to staging** while `main` deploys production — correct but undiscoverable.

---

## 3 · The naming problem

| layer | says | evidence |
|---|---|---|
| repo / remote | `lafayette-square` | `git remote -v` |
| package | `"name": "lafayette-square"` | `package.json:2` |
| README line 1 | "3D neighborhood visualization of Lafayette Square, St. Louis" | `README.md:1` |
| deploy targets | `lafayette-square.com`, `/lafayette-square-staging/` | `staging.yml` |
| asset paths | `public/baked/lafayette-square/**` | 1,905 tracked files under `public/` |
| default scene | `'lafayette-square'` in ~20 source sites | §C5 |
| **the actual product** | **a kit; the app is "The Ward"** | `ORIENTATION.md` step 8 |

```bash
git grep -lI 'The Ward' | wc -l              # → 7   (all markdown)
git grep -lI 'The Ward' -- '*.js' '*.jsx'    # → (none)
```

⛔ **The public product name appears in seven documentation files and zero lines of code. The
instance name appears in 704 tracked non-markdown files. By every mechanical measure the repository
*is* Lafayette Square; the kit framing exists only in prose.**

**Cost to decouple: L**, and not one job:

| step | cost |
|---|---|
| rename `package.json` `name` → e.g. `theward-kit` | **S** |
| README/ORIENTATION reframe: kit first, LS as instance #1 | **S** — highest value per hour in this entire report |
| finish `src/instance.js` adoption; retire `src/data/*` name-imports | **M** |
| remove the 5 `scene === 'lafayette-square'` bake branches | **M** |
| `public/baked/<scene>/` | — already parameterized; this part is right |
| deploy targets / domain | **M–L** — business decision |
| rename the git remote | **S**, but breaks every clone and link — **do it inside B2's rewrite or not at all** |

**Do the S items now** — one afternoon, and they change the entire first impression.

---

## 4 · Directory legibility

*"Guessable" = would a stranger predict the contents from the name.*

| entry | what it is | tracked | guessable? |
|---|---|---|---|
| `src/` | React/Three runtime app + all helper-app UIs | 295 | ✅ |
| `cartograph/` | the map kit | 292 | ⚠️ needs one line |
| `arborist/` | the tree kit | 153 | ⚠️ needs one line |
| `meteorologist/` | weather/cloud presets + almanac | 29 | ⚠️ needs one line |
| `public/` | static served root **and** all baked slab output (6.4 GB) | **1,905** | ❌ conflates served-static with build-output |
| `scratch/` | **1,381 tracked files** — the `claims-*` verification suite | 1,381 | ❌ **name says disposable, contents are the verification suite** |
| `scripts/` | 35 Python data-fetch scripts | 60 | ⚠️ undeclared second toolchain |
| `models/` | vendor 3D source assets (2.3 GB) | 0 | ⚠️ licensing unstated |
| `assets/` | design source: `.ai`, `.svg`, `.xlsx`, `.pdf` | 14 | ⚠️ 3-way ambiguity with `public/`/`models/` |
| `botanica/` | **103 GB**, gitignored — tree source library | 0 | ❌ unguessable; the reason the tree is 139 GB |
| `photos-wikimedia/` | 298 tracked Wikimedia images, 884 MB | 298 | ⚠️ |
| `cary/` | a **courier/delivery business**: legal, Stripe, Supabase, POS | 44 | ❌ completely unguessable |
| `ls/` | documentation for the *consumer app* | 20 | ❌ two-letter dir; reads as a stub |
| `inventory/` | LS historic-district survey CSVs + a dir literally named `IGNORE` | 27 | ❌ reads as software inventory; is a historical archive |
| `plans/` | 5 productization plans | 5 | ⚠️ vs `ROADMAP.md` vs `BRIEF-*` — three planning genres, no index |
| `apps-script/` | Google Apps Script backend | 3 | ❌ **a fourth runtime, absent from README's architecture table** |
| `backend/` | two JSON schemas, nothing else | 2 | ❌ **named "backend", contains no backend** |
| `dist/` | Vite build output, 7.6 GB | 0 | ✅ |
| `_archive/` | retired scripts | 5 | ✅ |
| `_handoffs/` | **56 local files, 0 tracked, cited by 17 docs** | **0** | ❌ — C7 |
| `.github/` | exactly two workflow files | 2 | ✅ but empty of everything else |
| `public/codedesk/` | a QR-code app + a screenshot + `love.jpg` | ~12 | ❌ **entirely unguessable**; holds a committed endpoint URL |
| `loom` | **does not exist** — only `LOOM-TOPO-FINDINGS.md` at root | — | a doc naming a directory that isn't there |

⛔ **Undeclared toolchain:** 35 tracked `.py` files with two `requirements.txt`, and
`grep -niE 'python|pip install|\.py' README.md` → **no output.** A stranger following the README
never installs the Python environment and hits a wall the first time they try to pour a town.

**Corpus totals: 362 `.md` / 81,739 lines documentation to 122,034 lines of code — 0.67 : 1.**
Extraordinary, and in isolation a strength. **The problem is navigational:** no top-level statement
of *which* of the 362 documents a new reader needs, and the four genres (canon / brief / findings /
plan) are visually indistinguishable at root.

---

## 5 · Engineering hygiene checklist

| item | status |
|---|---|
| LICENSE · `license` field · copyright · third-party notices | ❌ **all absent** |
| OSM/ODbL attribution in product | ❌ absent |
| CONTRIBUTING · CHANGELOG · CODE_OF_CONDUCT | ❌ absent |
| SECURITY policy | ⚠️ `SECURITY.md` exists but is an internal **audit ledger**, not a disclosure policy. GitHub surfaces it as the latter. |
| Issue/PR templates · Dependabot · CODEOWNERS | ❌ absent — `.github/` contains **only** `workflows/` |
| Test runner · test files · CI tests · CI lint | ❌ absent (1 test file, in `scratch/`) |
| Lint · format · `tsconfig.json` | ❌ absent |
| `.nvmrc` / `engines` | ❌ absent |
| Lockfile | ✅ present, 182 KB |
| `npm ci` reproducible | ✅ **verified** — `npm ci --dry-run` clean |
| `.gitignore` | ✅ present, ⚠️ 293 lines / 69 negations |
| CI workflows | ✅ **2, and correct** |
| Secrets in CI | ✅ **correct** — all `VITE_*` from `${{ secrets.* }}`; scoped `permissions:`; `concurrency` groups |
| Python deps declared | ✅ two `requirements.txt`, unreferenced by README |

⭐ **The CI is the best-engineered artifact in the repository. It is also the only automated quality
gate, and it gates nothing but "does it compile."**

---

## 6 · The AI-process layer — assessment and recommended posture

**A developer** reads `CLAUDE.md` first — alphabetically prominent, loaded by tooling, and what the
README's routing points at. They meet named personas they cannot map to humans, dated incident
post-mortems, and a doctrine gate to recite before touching code. **Two reads are available, and the
pessimistic one is the default for a stranger:** "this team is rigorous" vs "this project had a
process problem severe enough to require this document." **The give-away is that its examples are
all failures** — a reader with no context sees only failures.

**An investor** reads it as risk. It documents, in its own words, a full day lost to LS-specific
patches, a coordinator reporting a non-bug twice, four errors by one coordinator in one day, and a
receipt that *"sat here claiming OPEN what was closed… including the line numbers, which had all
drifted."* **These are honest engineering-culture artifacts and, read cold, a list of things that
went wrong.** An investor cannot distinguish "unusually transparent" from "unusually error-prone"
and will assume the latter, because it is safer.

**Recommended posture — split, do not delete. Cost S.**

1. **Keep `CLAUDE.md` at root** (tooling loads it from root). **Add a 3-line human-facing preamble:**
   *"This file configures AI coding agents working on this repository. If you are a person orienting
   to the project, read `ORIENTATION.md` and `README.md` instead."* **That single edit removes most
   of the damage** — it reframes everything below as tooling configuration rather than a confession.
2. **Move `BOZ.md`, `PIP.md`, `AGENT-VALIDATION-SURFACES.md`, `AUDIT-MATRIX.md`,
   `ACCORDANCE-REVIEW.md` → `docs/internal/`.** (Not `.claude/` — that's gitignored and would hide
   them from collaborating agents.)
3. **Move the 17 `BRIEF-*.md` and the `*-FINDINGS.md` set → `docs/briefs/` and `docs/forensics/`.**
4. **Promote `ORIENTATION.md` to the entry point.** Make `README.md`'s first 30 lines: what this is
   (the kit), what "The Ward" is, what Lafayette Square is (instance #1), how to run it, where the
   docs live.
5. **Decide on `_handoffs/`** — track it or repoint the 11 citations.

⭐ **Do not sanitize the method.** The `scratch/claims-*.mjs` discipline, *"never write a number
without the command that reproduces it,"* and the requirement that every closed item carry a
re-runnable proof are, to an outside developer who gets far enough to see them, **genuinely
impressive and rare. They are invisible behind the framing.** Reordering the front door is not
cosmetic — it is the difference between a stranger seeing a rigorous project and a troubled one.

---

## 7 · First contact: time to first render

**Verified.** Node v22.20.0, npm 10.9.3. `npm ci --dry-run` → clean. `npm run dev` → `concurrently`
fans out to four processes as documented; Vite served **HTTP 200**. All README-documented scripts
exist.

**Two real defects surfaced by the run:**

**(a) A backend crash does not fail loudly — the app comes up half-dead.**
`--kill-others-on-fail` is set, but the backends run under `node --watch`, **which does not exit on
error** — it prints the stack and waits for file changes. `concurrently` never sees a non-zero exit,
never kills the others, and Vite stays up serving the app against three dead backends. Observed
verbatim:

```
[carto] Failed running 'cartograph/serve.js'. Waiting for file changes before restarting...
[web]   ➜  Local:   http://localhost:5174/
```

⛔ **A stranger gets a working-looking app with no map backend. This is exactly the fallback-shaped
failure Layer 0 question 2 forbids — a failure presenting as a plausible success.** **S. Risk: every
new contributor's first hour.**

**(b) Vite silently rebound to 5174** while the README documents 5173 and `vite.config.js` proxies
`/api/cartograph` → `:3333`.

**Doc gaps found by following the README literally:** the "escape hatches" block lists **three** of
four sub-commands — `npm run dev:meteorologist` is omitted. **Python never mentioned.** **No
prerequisites section at all** — no Node version, no Python, no disk warning, no note that a clone is
4.4 GB.

| phase | time |
|---|---|
| `git clone` | **20–90 min** — 4.41 GiB, network-bound; **dominates everything else** |
| find "Local development" in a 62 KB README | 5–15 min |
| `npm install` | 2–5 min |
| `npm run dev` | <1 min |
| first render of the LS scene | ~immediate — **the baked slab is committed, so it renders without a pour** |
| **understand what they're looking at** | **2–4 hours** |
| **first successful pour of a new town** | **days** — needs the undocumented Python env, the `.gitignore` surgery, and the LS hardwires |

⭐ **Verdict: rendering is genuinely easy, and that is a real strength worth protecting** — worth
weighing against B2's instinct to strip `public/baked/` entirely. **Keep *one* slab at HEAD, drop the
140 revisions.** **Orienting is hard; pouring town #2 is not achievable from the documentation
alone.**

---

## 8 · Polish

| # | finding | cost |
|---|---|---|
| P1 | README 62 KB, setup at line 45; doctrine cells >3,000 chars | S |
| P2 | `SECURITY.md` is an internal audit ledger; GitHub presents it as a disclosure policy | S |
| P3 | 62 branches, most stale | S |
| P4 | No `docs/`; 362 md files across root + 4 toolchains | M |
| P5 | README "escape hatches" omits `dev:meteorologist` | S |
| P6 | Python toolchain undocumented (35 `.py`) | S |
| P7 | Vite port drift 5173→5174 undocumented | S |
| P8 | `worker.js` at root, unexplained | S |
| P9 | `backend/` has no backend; `ls/` is a 2-char doc dir; `public/codedesk/` unexplained | S |
| P10 | `.DS_Store` at root (untracked but present) | S |
| P11 | GitHub Actions pinned by tag not SHA | S |
| P12 | No `DEPENDENCIES.md` explaining the 5 deliberately-stale deps | S |

---

## 9 · Recommended sequence

**Before any outsider clones — non-negotiable:**

1. `LICENSE` + license field + copyright decision (B1, **S**)
2. Move or gitignore `cary/legal/` (B5, **S**)
3. Rotate the Apps Script deployment ID; replace all 17 sites (B3, **S**)
4. OSM/ODbL attribution in the runtime + `THIRD-PARTY-NOTICES.md` (B4, **S–M**)
5. **History rewrite + LFS/CDN for baked assets** (B2, **L**) — *must precede outsider clones*

**Same week — cheap, disproportionate impact:**

6. `CLAUDE.md` human preamble; promote `ORIENTATION.md`; move `BOZ`/`PIP`/`BRIEF-*` under `docs/` (**S**)
7. Rewrite README's first 30 lines: kit-first, prerequisites, quickstart (**S**)
8. `.nvmrc` + `engines` (**S**); `npm audit fix` (**S**)
9. **Promote `scratch/claims-*.mjs` → `checks/`, add `"test"` + CI step (M)** — *highest-leverage
   credibility fix in this report; it converts an existing strength into a visible one*
10. Fix `--kill-others-on-fail` so a dead backend fails loudly (**S**)
11. Resolve `_handoffs/` (**S**)
12. Document the Python toolchain; prune branches + document the branch model (**S**)

**Before claiming kit-portability to anyone:**

13. Remove the 5 `scene === 'lafayette-square'` bake branches; finish `src/instance.js` (**L**)
14. Restructure `data/` vs `build/` so per-scene `.gitignore` surgery disappears (**M**)
15. ESLint + Prettier with a warning ratchet (**M**)

---

## 10 · The one-paragraph verdict

**The engineering is stronger than the packaging by a wide margin, and every blocker on this list is
a packaging problem.** The architecture is coherent and genuinely well-documented
(`ORIENTATION.md`'s dependency chain is better than most commercial products manage), the CI is
correctly written, `src/instance.js` is the right abstraction built the right way, no secret has ever
entered git history, and the verification discipline in `scratch/` is unusual and valuable. Against
that: **there is no license, the product ships derived OpenStreetMap data with no attribution, a
delivery business's draft employment contracts are in the tree, a live third-party endpoint sits in
the README, and the repository costs 4.4 GB to clone because 7.8 GB of build output was committed 140
revisions deep.** Those five are what a stranger meets first, and four of the five cost less than a
day each. **The fifth — the history rewrite — is the only genuinely expensive item, and its cost is
the one that grows every day and multiplies the moment the first outsider clones. Do it first.**
