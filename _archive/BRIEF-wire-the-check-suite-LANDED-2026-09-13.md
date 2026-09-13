# BRIEF — wire the check suite, without firing it at production

**Status:** DRAFT, dispatch-ready. Fresh-agent brief. Boz drafted 2026-09-13; **Jacob dispatches.**

> ⛔ **ROUTE FIRST (CLAUDE.md gate).** `ORIENTATION.md` → `README §⭐ START HERE`. Then the two rules this brief exists to serve, both in **`CLAUDE.md`**: *"if it can be checked by running something, it is a check — not prose"* (the PRUNE section) and **Layer 0**'s first question, *what does this do for town #2?*
>
> Read **`docs/agents/AGENT-VALIDATION-SURFACES.md`** before validating anything, and **`SECURITY.md §5`** before running anything that touches Cary.

---

## Who you are + the bounds

You are a fresh specialist landing **one** change: give the repository an `npm test` that runs the checks which are **safe to run**, and a CI step that runs it.

⛔ **You are not fixing checks, and you are not making them portable.** Classify, wire, document. If a check fails when you run it, **that is a finding to report, not a bug to fix** — a red check is the suite doing its job and may be a real defect on the board.

⛔ **You are not promoting all 157.** The unsafe ones stay out of the default run, behind an explicit opt-in.

---

## The problem

157 `claims-*` scripts exist in `scratch/`. **Zero are wired.** `package.json` has no `test` script; neither workflow has a step. The only mention of a check in `.github/workflows/staging.yml` is a *comment* telling a human to run one.

**116 of them are cited by name in the docs** — the corpus already treats them as its proof and cannot run them. Confirm, don't trust:

```
ls scratch/claims-* | wc -l
git grep -ohE "claims-[a-z0-9-]+\.(mjs|js|sh)" -- '*.md' | sort -u | wc -l
node -e 'console.log(require("./package.json").scripts)'
```

### ⛔⛔ THE TRAP, AND IT IS THE REASON THIS IS A BRIEF AND NOT A ONE-LINER

**A blanket `npm test` over all 157 hits the production Supabase project.**

`scratch/claims-onboarding-guard.sh` performs an unconditional `POST /auth/v1/signup` and has **no teardown**. It has already created anonymous users against the live project that were never removed — that is a recorded incident, not a hypothetical (`SECURITY.md`, the 2026-08-31 audit disclosure). Every invocation creates another.

Roughly **9 of 157 touch the network or a live service** and **16 write to disk**. Re-derive both sets yourself; the ones drafted against are:

`claims-onboarding-guard.sh` · `claims-cary-anon-exposure.mjs` · `claims-cary-order-contract.mjs` · `claims-commerce-write-gate.mjs` · `claims-contact-sms-rate-limit.mjs` · `claims-twilio-webhook-guard.mjs` · `claims-the-slab-freshness-key-is-not-stale.mjs` · `claims-deadend-look.mjs` · `claims-protopolygon.mjs`

⭐ **The classification is the work. The wiring is ten minutes.**

---

## The work

**1. Classify every check into one of three tiers, by reading its source — never by its name.**

- **`safe`** — reads repo files, no network, no writes outside a temp dir. Runs in `npm test`.
- **`local-effect`** — writes into the repo or a scratch dir. Runs under `npm run test:all`, not in CI.
- **`live`** — touches a network endpoint or a hosted service. ⛔ **Never in a default run.** Opt-in only, and each one gets a one-line note saying what it contacts.

⭐ **The tier list must be derived, not typed.** A hand-maintained manifest is a skip list, and it will be wrong the first time someone adds a check. Detect the tier by parsing the script (`fetch(`, `https://`, `supabase`, `writeFileSync`, `execSync`) and let the manifest be *generated*. Follow `scratch/claims-memory-index-health.mjs` for the read-the-source pattern.

**2. Promote the `safe` set out of `scratch/` into `checks/`**, repointing every doc reference **in the same commit** — a dead pointer is the one unforgivable error. `node scratch/claims-doc-pointers-resolve.mjs --run` is the instrument that proves you got them all; run it before and after.

**3. Add the wiring.**
- `npm test` → the `safe` tier.
- A CI step in **both** workflows.
- A short index — one line per check stating **the claim it falsifies**, not what it does.

**4. Report, don't fix.** Produce the pass/fail table for the `safe` tier. ⛔ Every non-zero exit is a finding for the board; do not chase any of them in this session.

---

## Acceptance — mechanical, no eye gate

1. **`npm test` contacts nothing.** Prove it, don't assert it: run the suite with the network disabled (or with `SUPABASE_URL` unset and a proxy that refuses), and show it still passes. ⛔ *"I read them and they looked fine"* is not acceptance — the incident this brief exists to prevent was caused by exactly that confidence.
2. **Idempotent.** Run `npm test` twice; `git status --porcelain` is identical and empty both times.
3. **The tier list regenerates.** Delete it, re-run the generator, get the same file.
4. **⭐ Mutation-tested.** Add a `fetch()` to a `safe` check and confirm the classifier re-tiers it to `live`; then revert. A passing check proves nothing until it has been seen to fail (`[[project_the_check_is_the_deliverable_mutation_test_it]]`).
5. **`claims-doc-pointers-resolve.mjs --run` is green** after the move.

---

## ⛔ Known, and explicitly NOT this brief's job

**58 of the 157 name Lafayette Square with no way for a caller to choose a scene**, and the ones that *are* parameterised use four conventions — `--scene`, `--only`, `--look`, bare `argv[2]`. A check that runs only on town #1 fails Layer 0's first question.

That is the **next** ticket, and it is larger than this one. ⛔ Do not start it here. **Do** record the count and the convention split in your report, and note which conventions the `safe` tier actually uses — that is the input the next brief needs.

---

## Registers (`CLAUDE.md`, part 2 of every fix)

- **`cartograph/OPERATIONS.md`** — `npm test` is a new operator gesture; it needs a line, including the warning that the `live` tier is opt-in and why.
- **Commit message** names the register reached, or says "reaches no register" outright.

⚠️ **One idle interactive peer shares this working tree.** `ListAgents` before staging; **scoped pathspecs only** — ⛔ never `git add -A` (`[[feedback_check_for_peers_before_git_add_all]]`).
