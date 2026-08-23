# BRIEF — the Arborist: find the spine, then exorcise the ghosts

**You are a FRESH agent.** Read `CLAUDE.md` (the routing gate) first. ⛔ Do **not**
read `BOZ.md` — this is not a coordinator job.

> ⚠️ **EVERY PREMISE BELOW IS A CLAIM, NOT A FACT.** The numbers were measured on
> 2026-08-23 and are reproducible with the commands given. **Confirm before you
> build on any of them, and say what you found.** If the code contradicts this
> brief, the code is right and the contradiction is the first finding.

---

## 1. Why this exists, in Jacob's words

> *"I **do not understand** how the Arborist is still a mess. It's the whole
> thing. There is lots of vestigia. All the way, the entire app. I don't think we
> have a solid prose version of what it's supposed to do so we always get caught
> up/trapped by some ghost. Time to exorcise."*

⭐ **The second sentence is the diagnosis and it is the more important half.**
Every recent Arborist session has ended in the same shape: someone looks at a
surface, sees something that seems wrong, and spends the day discovering that it
was either (a) correct-by-design and undocumented, or (b) a leftover from an arc
that was abandoned without being removed. **Both are the same disease: there is
no statement of what the Arborist IS, so nothing can be judged against it.**

⛔ **So the first deliverable is not a fix. It is the sentence that makes fixes
possible.**

---

## 2. The two deliverables, in order. ⛔ Do not start the second first.

### A. THE SPINE — what the Arborist is for, in prose

**Home: `arborist/ORIENTATION.md`.** ⛔ It already exists — **rewrite it, do not
add a sibling.** A second front door is the disease, not the cure (`CLAUDE.md`
prune rules).

It must answer, in plain language a newcomer can hold in their head:

1. **What is the Arborist for?** One paragraph. Not a feature list.
2. **What are its surfaces, and what is each one FOR?** There are eleven
   workstages in `src/arborist/`. A reader should be able to say what each is for
   and when they'd open it — or the surface should be named as dead.
3. **What is the pipeline?** From a raw scanned part to a tree standing on a
   street in the product. Name every artifact and every transform between them.
4. ⭐⭐ **WHICH ARTIFACT DOES EACH SURFACE READ?** This is the single highest-value
   sentence in the whole document and its absence has cost real days — see §4.
5. **What is authored vs derived vs baked vs per-operator?** Where does each live,
   and what invalidates it.
6. **What is DONE, what is OWED, and what is ABANDONED?**

⛔ **Prose, not a table of everything.** If it can be checked by running
something, it is a check, not prose — put the command in and delete the number
(`CLAUDE.md`).

### B. THE CONFORMANCE PASS — docs vs code, over the whole app

Then, and only then, go file by file. For every claim in the ten live docs, and
every comment that asserts a state, decide which of three it is —
**`CLAUDE.md`'s smell-detector rule, and you must name which:**

- **ROT** — the doc describes an old reality → **evict it** (to
  `arborist/_archive/`, dated; never delete).
- **REGRESSION** — the doc describes what should still be true; the code drifted
  → **fix the code**.
- ⭐⭐ **ASPIRATION** — the doc describes intent that was never built. ⛔ **Neither
  evict nor "correct."** It is an unbuilt decision filed as done. **Surface it as
  work.** This is the conformance job's own failure mode: an aspiration looks
  exactly like rot, so a careless pass *deletes decisions*, quietly, one plausible
  edit at a time. **When you cannot tell, STOP and ask Jacob.**

---

## 3. ⛔ PHASE 1 IS READ-ONLY. This is a hard gate.

The surface is **~25,000 lines of code and ~2,800 lines of live docs**:

```
arborist/*.js        39 files   15,247 lines   (serve.js alone is 1,833)
src/arborist/*.jsx   14 files    9,315 lines
arborist/*.md        10 files    2,793 lines
```

⛔ **An agent editing that much on its own judgement is how decisions get
deleted.** So:

- **Phase 1 — investigate and write.** Produce **the spine (A)** and a **findings
  ledger**: every mismatch, classified ROT / REGRESSION / ASPIRATION, with the
  file and line, and for each one the *smallest* change that resolves it.
  ⛔ **Change no code in phase 1.** Doc edits are allowed only for
  `ORIENTATION.md` itself.
- **Phase 2 — execute**, after Jacob has read the ledger and ruled on the
  ASPIRATION items. Those are his calls, not yours.

---

## 4. Seed evidence — measured 2026-08-23. **Confirm each; none is exhaustive.**

These are handed over because they are *examples of the classes*, not a to-do
list. The point is to find the rest.

**⛔ GHOST 1 — one tree has five identities in the source pool.**
```
ls -d public/trees/*/ | sed 's|.*/trees/||;s|/||' | grep -i saccharum
```
→ `acer_saccharum`, `acer_saccharum_lowpoly`, `acer_saccharum_multistem`,
`acer_saccharum_procedural` — **and separately `maple_sugar`**. Botanical ids and
bake-style ids coexist with no stated rule for which is canonical.
⚠️ `/grove` serves BOTH `acer_saccharum` and `maple_sugar` as separate tiles with
different `bakedAt` stamps, so **the operator can set the canary to either and
they are different trees.** That is very likely why "the Grove doesn't look like
the Salon."

**⛔ GHOST 2 — 79 species in the pool, 10 baked.**
```
ls -d public/trees/*/ | wc -l                                   # 79
ls -d public/baked/lafayette-square/trees/*/ | grep -vE 'hero-impostor|overhead' | wc -l   # 10
```
Is the other 69 a library, a graveyard, or both? **Nothing says.** A newcomer
cannot tell whether `burnt_tree` is a feature or a leftover.

**⛔ GHOST 3 — documented routes that the server does not have.**
```
grep -c "/forest"    arborist/serve.js      # 0, cited in 4 docs
grep -c "/readiness" arborist/serve.js      # 0, cited in 1 doc
```
⚠️ I cited `:3334/forest` to Jacob this morning **from a doc, without checking**,
and it does not exist. That is the failure this brief exists to end.

**⛔ GHOST 4 — three surfaces, three different artifacts, undocumented.**
| surface | reads |
|---|---|
| Salon | a **freshly built** preview — POSTs `{chassis,bark,leaves}` (`SalonWorkstage.jsx:615`) |
| Grove | the **source pool** — `/trees/<sp>/skeleton-<v>-lod0.glb` (`arborist/serve.js:354`) |
| diorama / `?view=fullmonte` | the **bake** — `baked/<look>/trees/…` (`TreeDiorama.jsx:411`) |

⭐ **This is correct by design** — the diorama must show what deploys — **and it
is written down nowhere**, so every time the three disagree it reads as a bug. It
cost most of a session on 2026-08-23. **It belongs in the spine, §A.4.**

**⛔ GHOST 5 — the bakes are wildly uneven and nothing says which is the standard.**
```
node -e '...' # see git log 0dc2b91c for the GLB measuring snippet
  linden_american      12.4 MB   331,389 verts   200,171 tris
  oak_white             3.7 MB   102,353 verts    56,654 tris
  maple_sugar           3.2 MB    90,312 verts    49,111 tris
  platanus_acerifolia   0.3 MB     8,761 verts     8,360 tris
```
The linden is **4× the maple and 24× the plane**. Is that the species, the
chassis, or a stale bake? **Not established.** It makes every non-linden specimen
look broken.

**⛔ GHOST 6 — every one of the ten live docs contains parked/superseded/retired
language.** `grep -rlniE "parked|superseded|retired|deprecated|dormant|killed"
arborist/*.md` → all ten. Some of that is honest history; some is ROT that has
already misled a reader. ⚠️ **A live instance, fixed today (`c8c85a1a`):**
`BACKLOG.md` said *"trees ship ALL-MESH; the impostor render is PARKED"* — true on
2026-06-25, superseded on 2026-07-22, and **it made Jacob believe the impostor
system was off for a month.**

**◻ RENAME — "full monte."** Jacob: *"it's just the street-level full-detail
single tree export."* Blast radius: 6 files in `src/`, 4 docs, and ⛔ one URL
contract `?view=fullmonte` (`ArboristApp.jsx:90`) that `ls/OPERATIONS.md §5` and
the theward.online docs both cite. **Rename the concept AND the param together, or
neither.**

---

## 5. ⛔ Traps. Each of these cost real hours on 2026-08-23.

- ⛔⛔ **A bare `await import()` in the console gets a SECOND MODULE INSTANCE.**
  vite stamps edited files `?t=…`; the console fetches the unstamped url. Any
  module-scoped shared uniform (`treeSwayUniforms`, `treeBarkTierUniform`,
  `treeLeafTransmission`) then silently stops being shared. **I read a working
  value as 0 three times and twice started debugging correct code.** Probe the url
  the app actually loaded: `performance.getEntriesByType('resource')`.
- ⛔ **`curl` against the vite dev server returns 200 for files that do not
  exist** — it serves `index.html` for unknown paths. **Never use it to prove an
  asset is present.** Use `ls`.
- ⛔ **The first screenshot after a navigate is routinely UNPAINTED.** Always take
  a second frame before believing a picture.
- ⛔ **A lighting effect you cannot light looks exactly like a broken one.** The
  diorama runs on live wall clock; at midday nothing is backlit. Use `?at=17:55`.
- ⛔ **`measureText().actualBoundingBox*` is useless for colour emoji** (returns
  the em box) — unrelated to trees, but the same lesson: verify the instrument
  before trusting its reading.
- ⛔ **Do not read the Preview GPU gauge as a perf signal** — count-vs-fake-budget,
  ignores frame-ms, red with no trees on screen. It drove a whole tree-degradation
  arc that was then reverted (`arborist/ARCHITECTURE.md`).

---

## 6. Partitioning, if more than one agent runs

⛔ **They must not share files.** Suggested split, each producing its own section
of the ledger:

1. **Backend + pipeline** — `arborist/*.js` (15k lines; `serve.js`, `bake-*.js`,
   `ingest*`, `matcher`, `library-builder`). *Which routes exist? Which are dead?
   What does each artifact actually contain?*
2. **Front end + surfaces** — `src/arborist/*.jsx` (9.3k lines, 11 workstages).
   *What is each stage for? Which are reachable? Which are abandoned?*
3. **The docs + the asset pool** — `arborist/*.md`, `public/trees/`,
   `public/baked/*/trees/`. *Every claim classified; every species accounted for.*

⭐ **One agent must own the spine (§A) and write it LAST**, from the other
ledgers. It is a synthesis, not a survey.

---

## 7. What "done" looks like

- `arborist/ORIENTATION.md` — a newcomer reads it and can say what the Arborist is
  for, what each surface does, which artifact each reads, and what is owed.
- A findings ledger, every item classified **ROT / REGRESSION / ASPIRATION**, with
  file:line and the smallest resolving change.
- ⛔ **The corpus is SMALLER.** Every touch nets down; superseded content moves to
  `arborist/_archive/` dated, refs repointed in the same breath.
- ⭐ **And where a fact can be checked by running something, the doc holds the
  COMMAND, not the number.**

---

*Drafted 2026-08-23 at Jacob's request, from a session that hit four of these
ghosts in one day. ⛔ It is a brief for a fresh agent; the measurements are
reproducible and the classifications are not yet made.*
