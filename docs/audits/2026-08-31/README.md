# Pre-Release Survey — 2026-08-31

**Eight parallel read-only audits of the repository, conducted 2026-08-31 against branch
`land-use-derivation` @ `5a0bdaea`. Zero edits were made to any file; `git status --porcelain`
was empty before and after.**

The synthesis of these reports is published as a private artifact:
**https://claude.ai/code/artifact/cc8430c0-fbce-49ec-b9f1-6bd5b18a3df9**

⛔ **These are DIARY. They are a dated record of one day's measurement, not canon.**
Every number in them was true on 2026-08-31 and carries the command that reproduces it —
**re-run the command, do not quote the number.** Line references drift; several of these
reports exist precisely to document how far and how fast.

⭐ **What must LEAVE these files to live:** the open items, the four aspirations, and the
half-landed terminal-node removal pass. Those belong on `ROADMAP.md`. Until they are
extracted, this directory is the only record of them — which is the exact failure mode
these reports document. **Extract first, then treat these as history.**

## The reports

| # | File | Scope |
|---|---|---|
| 01 | [`REPORT-01-root-docs.md`](REPORT-01-root-docs.md) | The ~50 root-level `.md` files; the brief/findings/handoff class |
| 02 | [`REPORT-02-cartograph.md`](REPORT-02-cartograph.md) | `cartograph/` docs ↔ code coherence; dead code; the archive |
| 03 | [`REPORT-03-scratch.md`](REPORT-03-scratch.md) | `scratch/` and `_handoffs/`; clone weight; `.gitignore` |
| 04 | [`REPORT-04-src-ward.md`](REPORT-04-src-ward.md) | `src/`, the `ls/` doc set, The Ward, deploy topology |
| 05 | [`REPORT-05-arborist-meteorologist.md`](REPORT-05-arborist-meteorologist.md) | Trees, weather, asset weight, licensing |
| 06 | [`REPORT-06-outsider-readiness.md`](REPORT-06-outsider-readiness.md) | First contact, release blockers, legal exposure |
| 07 | [`REPORT-07-open-work.md`](REPORT-07-open-work.md) | The deduplicated open-work ledger; board health |
| 07a | [`REPORT-07a-brief-verification.md`](REPORT-07a-brief-verification.md) | The four aspiration briefs, verified against live code |
| 02a | [`REPORT-02a-deadcode-crosscheck.md`](REPORT-02a-deadcode-crosscheck.md) | Independent cross-check of the cartograph dead-code census |

## The five findings that reframe the rest

1. **Work that half-landed and got a ✅.** The terminal-node stamp ships and is consumed; the
   removal pass the brief calls *"half the deliverable"* never ran, and `ROADMAP A2` reads
   "SOLUTION LANDED". Invisible to every existing model — not a dangling brief, not a bug.
   → **07a**
2. **79 `claims-*` scripts, zero wired to CI.** All 60 side-effect-free ones were run: 37 pass,
   15 report a claim FALSE, 8 fail loudly on a missing `--scene`, 0 crash. An `npm test` would
   have caught all 8 closed-but-still-listed items. → **03**, **07**
3. **The clone is 4.41 GiB and cannot be fixed at HEAD.** 81% of history is binary build output.
   `public/` is 64% of the pack; `scratch/` is 2.6%. The decision must precede the first
   outsider clone. → **03**, **06**
4. **The operator's authoring is not under version control.** All 13
   `arborist/state/*/compositions.json` are gitignored under a comment calling them
   "regenerable". They are not. → **05**
5. **No LICENSE, no OSM attribution, a live capability URL in the README, and another
   business's draft employment contracts in the tree.** → **06**

## Standing corrections to earlier claims

Recorded because each was asserted confidently and measured false:

- `_handoffs/` is **not** harmless for being gitignored — **11 tracked docs cite 10 of its files
  at 25 call sites**, including `README.md` five times. Dead on any clone. (**03**)
- `scratch/` is **not** the clone-weight problem. 2.6% of the pack. (**03**)
- "12 npm vulnerabilities, 2 critical" **overstates shipped risk ~12×** — 11 of 12 are dev-only
  tooling; `npm audit --omit=dev` returns one. (**07**)
- `PROPOSAL-rubric-axes.md` says "not yet executed"; **it landed 2026-08-28**. Rot, not
  aspiration. (**05**)
- `CLAUDE.md`'s producer-stamp receipt cites `tileGround.js:3749`; the stamp is at **`:4748`**,
  and `producerReason` is **conditional**, so "on every tile" is true of `producer` only. (**02**)
- `CLAUDE.md`'s "`scratch/` holds 200+" — there are **657 scripts** and 7 forensic studies. (**03**)

## Disclosure

While spot-checking a closure receipt, audit 07 ran `scratch/claims-onboarding-guard.sh` on the
documented assurance that it *"exits 1 until run with the key."* **It exits 0** — it prints
`[ UNCHECKED ]` and returns success. The shell profile held the anon key, so the script
proceeded: read-only RPC probes **plus one anonymous user signup against the live Supabase
project**. That call is what established finding F-16 is closed. No secret values were
reproduced anywhere in these reports. **The anon user should be removed.**

The instrument defect is the durable finding: `SECURITY.md:70` and `:426` both assert the script
fails closed. A check that reports "I did not check half the surface" while exiting 0 is
invisible to any CI gate keyed on exit status.
