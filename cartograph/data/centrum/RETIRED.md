# RETIRED — `centrum`

**Retired 2026-09-13 by Jacob.** This scene is not part of the kit's live set.

A one-off internationalisation test (Łódź), poured alongside `ksi-y-m-yn`. It is
defunct, and its recurring re-emergence in whole-scene checks and audits is
noise — ⛔ **not** a licence for a skip list.

## Why this file exists

A retired town declares its own status, in its own directory. The kit's root
`.gitignore` names no town — live or retired — because a list of town names is
the skip list Layer 0 forbids: it is written once, by hand, and is wrong for the
next town nobody has retired yet.

So retirement is two files, and the same two files for every town:

- **this `RETIRED.md`** — the reason, in prose, so *"why is this here?"* stops
  being tribal knowledge and becomes a file someone can read.
- **`.gitignore`** beside it — `*`, less these two. It stops the scene's inputs
  re-emerging as untracked noise, and stops a future `git add` resurrecting them.

`node checks/claims-a-pour-adds-no-gitignore-lines.mjs` enforces the invariant:
**every scene on disk either tracks its inputs, or carries this file.** A scene
that is neither fails loudly — that case is a freshly poured town going silently
untracked, which is the defect the generic rule exists to close.

## Nothing was deleted

Retiring removed the tracked files at HEAD only (`git rm --cached`). Git keeps
every version, so this town is recoverable from history in full, at any time.
⛔ Do not `filter-repo`, and do not touch history.
