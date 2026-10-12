# RETIRED — `lafayette-square-staging`

**Retired 2026-09-13 by Jacob.** This scene is not part of the kit's live set.

An abandoned attempt to fit LS. Production runs on actual `lafayette-square`.
It has already cost a full day: staging was eye-gated while the work was on LS
and neither party knew (`PREBAKE §4.0a`). That is the cost of it staying live.

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

## The data is gone from the tree (2026-10-12, Jacob)

Its inputs were never tracked in git, so history does not hold them. On 2026-10-12 Jacob had them deleted from disk
(they made 43 checks refuse the census). A local archive, outside git, was kept:
`.claude/retired/lafayette-square-staging-2026-10-12.tgz` (this machine only). Its baked copy (`public/baked/`, untracked) went the same
way, into `.claude/retired/lafayette-square-staging-public-2026-10-12.tgz`; its Look (`public/looks/…/design.json`) was
tracked, so git history holds it.
