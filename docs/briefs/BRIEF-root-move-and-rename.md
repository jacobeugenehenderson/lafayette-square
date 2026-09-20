<!-- BRIEF-STATE
status: HOLD
dispatched: no
written: 2026-09-20
evict-when: RULING: which of the three naming options (§4) — does "Cartograph" name the root, the map kit, or neither?
-->

# BRIEF — move the project, and decide what "Cartograph" names

**Asked by Jacob, 2026-09-20 (exploring, not dispatched):** move
`~/Desktop/lafayette-square.nosync` into `~/Desktop/dev.nosync`, and rename the folder and the
overall project **Cartograph**.

⛔ **HOLD — this is two jobs with very different risk, and only one of them is ready.** The **move**
is small and mechanical. The **rename** is a naming decision with a 2,018-reference tail and an
unresolved collision. Do not let the second ride along on the first because they were asked in one
sentence.

---

## 1. The move — small, and one thing breaks silently

**Tracked coupling is 47 files, and 43 are in `scratch/`** — throwaway forensics.
▶ `git grep -l "Desktop/lafayette-square"`
The four that matter: `PUBLISH.md` · `docs/audits/2026-08-31/REPORT-01-root-docs.md` ·
`cartograph/_archive/BRIEF-legs-and-corners-parallel-EXPIRED-2026-09-07.md` ·
`_archive/notes/NOTES-2026-04-07_to_2026-05-18.md`.
⭐ The two `_archive/` hits are **Diary** — they record history verbatim and must NOT be rewritten
to today's path. Only the live two are edits.

### ⛔⛔ 1.1 THE SILENT ONE — THE MEMORY DIRECTORY IS KEYED TO THE ABSOLUTE PATH

`~/.claude/projects/-Users-jacobhenderson-Desktop-lafayette-square-nosync/` — **the key is the
absolute path with `/` turned to `-`.** Move the folder and the read-in looks under a new key,
finds nothing, and **starts fresh with no error**: `MEMORY.md`, 348 memory files, the whole
continuity, gone and reported as a clean new project.

⭐ **That is `CLAUDE.md` Layer 0 question 2 exactly** — a failure that presents as a plausible
success. The fix is one `mv` of that directory **in the same operation as the project move**, and
the danger is entirely in not knowing it exists.

▶ Verify after: `node checks/claims-memory-index-health.mjs` must still report ~348 memories and
`✅ PASS`. A sudden small number is the tell.

### 1.2 Eight git worktrees live INSIDE the project

`.claude/worktrees/` holds 8. Git records absolute paths in `.git/worktrees/*/gitdir`; moving the
parent breaks all of them. Recoverable with `git worktree repair`, but broken until someone runs it.
▶ `git worktree list`

### 1.3 What does NOT break
npm scripts · the dev servers (5173 / 3333 / 3334 / 3335) · every relative import · the deploy
workflow · git remotes and history. All relative; all travel.

---

## 2. The rename — "Cartograph" already means something here, and it is not the root

- **`cartograph/` is the MAP KIT** — streets, blocks, curbs, the bake. **2,018 references across
  707 files.** ▶ `git grep -c "cartograph/"`
- **`SHOW-BIBLE §0` says the Cartograph is the WHOLE SUITE:** *"The Cartograph = the FACTORY. The
  authoring suite (with Arborist + Meteorologist as internal / à-la-carte modules) that produces
  slabs. This is the licensable product."*

⇒ Naming the root `Cartograph` makes the word mean **two nested things at once** — the repository,
and one of its ~20 children, sitting beside `arborist/`, `meteorologist/`, `ls/`, `cary/`,
`botanica/`.

⛔ **That is the trap `ORIENTATION` keeps a vocabulary note about** — *"'polygon' means two things
here. Learn both or you will lose a day — several already have."* This would introduce a second
one deliberately, in the name of the project itself.

---

## 3. What the corpus says about renames of this size

⭐ **Read `b44daa6c` before scoping this.** That was **Stage 1 of `scene` → `map`: 30 identifiers,
288 lines, 51 files** — and it is the smaller job. What it cost and what it taught:
- A dry run whose **correct output is an empty diff** was the only instrument that caught
  `listScenes`/`getDefaultScene` being **glTF-Transform library API** — renaming them breaks the
  GLB pipeline **at runtime**, past a green `vite build`.
- **The destination word was already occupied:** `map` is 132 identifiers / 877 refs. `town` 475,
  `neighborhood` 254. **Every candidate word in this corpus is taken.**
- Five identifiers were dropped for measured reasons, not tidiness.

⇒ A 2,018-reference sweep is **7× that**, and the same failure modes apply at 7× the surface.

---

## 4. ⭕ THE RULING OWED — and it is the only thing blocking

**Which does "Cartograph" name?**

1. **Move only, no rename.** Root becomes `dev.nosync/cartograph/`. ⛔ This *is* the collision, just
   quieter — the folder and its child share a name.
2. **Root = `Cartograph`, and the map kit takes its own name** (`mapkit/`, `survey/`, …). Honest and
   complete. **2,018 references, 7× the sweep that took a full session tonight.**
3. **Root gets a name no child has.** The repo is the workspace; `cartograph/` stays the map kit;
   **"Cartograph" remains the PRODUCT name in `FEATURES`/`SHOW-BIBLE` without ever being a
   directory.** Cheapest, and it keeps the product name doing product work.

⛔ **Not a coordinator call.** ⚠️ **And the move does not need it** — §1 can land under any of the
three, provided the memory directory moves with it.

---

## 5. Order, if it goes ahead

1. **Land the shoreline work first.** Jacob: *"I want to start fresh as the shoreline work is
   landed."* ⛔ A root move with uncommitted work in the tree is how a session loses it.
2. Clean tree · all agents stood down · **push** (git is the archive and the move is the moment you
   want a remote copy).
3. Move the project **and the memory directory together**, one operation.
4. `git worktree repair` · re-run the dev stack · `node checks/claims-memory-index-health.mjs` ·
   `npm test`.
5. Fix the two live absolute-path refs. ⛔ Leave the two `_archive/` ones alone.
6. **Then, separately and only after a ruling, the rename.**

---

*Written 2026-09-20 (Boz), from measurement, at Jacob's request to explore. Nothing here is
dispatched. The move is ready; the rename is not.*
