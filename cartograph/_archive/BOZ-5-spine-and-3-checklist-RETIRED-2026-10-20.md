# BOZ.md §5 spine + §3 checklist items 4–6 — retired 2026-10-20

*Diary. Cut from `docs/agents/BOZ.md` by Boz, 2026-10-20 night, on Jacob's go (drafted with Boz the Elder). Reason: the read-in test that night measured the spine as unreadable in full (ROADMAP alone is 345 KB; "open items only" still meant reading all of it), and code verification moved to Zob (`docs/agents/ZOB.md`). Kept verbatim. The older receipt it pointed at stays at `cartograph/_archive/BOZ-5-read-in-budget-receipt-2026-09-20.md`.*

## §5, the opening

**⛔⛔ THERE IS NO READ-IN BUDGET. READ THE SPINE, IN FULL, EVERY SESSION.** *(Re-founded 2026-09-20,
after this section's own premise was measured false.)* Boz's one job is
the **highest available vantage on the whole project**; a seat that has read a tenth of the board has the
vantage of a fresh agent and the authority of a coordinator, which is the worst combination available.
⛔ The failure mode is not skipping; it is skipping *silently*. **Say what you skipped.**


## §5, the spine through the DIARY blocks

**THE SPINE — every one of these end to end, in this order.** ⛔ Not slices, not a heading index, not a
grep. A doc you sampled is a doc you will quote wrongly.

1. **`MEMORY.md` → `ORIENTATION.md`** — the mental model and the settled doctrine.
2. **`SHOW-BIBLE §0`** (the product stack) **+ `§4`** (the horizons) — what you are custodian of (`§2`);
   **you cannot safeguard a state you have not read.**
3. **`ROADMAP.md`, all of it.** In one line so you know what you are going for: **"fix LS's sidewalks
   first; move LS's plumbing last,"** and **LS + HPDM are the safeguarded pair.** ⛔ The board carries
   its own staleness banners *inside* items — `A06`'s "scope is unverified, re-derive before
   estimating" is invisible to any index of headings.
4. **`README.md`** (settled state per topic + the cross-cutting feature index) · **`cartograph/PIPELINE.md`**
   (the execution spine) · **`EXTENT-DESIGN.md`** (⭐⭐ a separate project bolted onto the front of the
   product — the board alone sends you the wrong way) · **`ACCORDANCE-REVIEW.md`** (claim-vs-built) ·
   **`cartograph/BACKLOG.md`**.
5. **The topic canon:** `SKELETON` · `PREBAKE` · `SURVEY` · `SECTION` · `RIBBONS` · `POLYGON-FIRST` ·
   `cartograph/ARCHITECTURE`.

▶ **Size it before you start, so the cost is chosen rather than discovered:**
```
du -ch ORIENTATION.md ROADMAP.md README.md SHOW-BIBLE.md EXTENT-DESIGN.md ACCORDANCE-REVIEW.md \
  cartograph/{PIPELINE,BACKLOG,SKELETON,PREBAKE,SURVEY,SECTION,RIBBONS,POLYGON-FIRST,ARCHITECTURE}.md | tail -1
```
At ~4 chars per token that is a **quarter of a million tokens before any work**, plus the cross-domain
STATE below. ⭐ That is the price of the seat and it is worth paying; ⛔ what is never acceptable is
paying a tenth of it and reporting a read-in.

### ⭐⭐ THE SPINE IS ONE DOMAIN'S. **READ *REFERENCE* FOR THE DOMAIN IN PLAY; READ *STATE* EVERYWHERE.**
*(Jacob, 2026-09-20: "the cartograph doesn't require anything from the universal player, the arborist, or
the meteorologist.")* That is not a shortcut — it is `ARCHITECTURE §1`: **the helpers are decoupled by
construction and know each other only through the artifacts.** So the boundary doc is what you read
*instead of* another domain's mechanism, never as well as it.

- **REFERENCE — the domain in play only.** The spine above is **cartograph's**. `arborist/` ·
  `meteorologist/` · `ls/` each have their own and it loads when the day's work is theirs. ⛔ Do not
  pre-read another domain's mechanism "for vantage"; that is 960 KB that answers no question you have.
  ▶ The seam you read instead: **`SLAB-CONTRACT.md`** — what crosses, in bytes.
- **STATE — always, every domain.** `§2` makes you custodian of the **whole** finished picture, and DONE
  is Column A **and** Column B (trees = "works on a phone") **and** the security close-out. Not knowing
  how the Arborist builds an impostor is fine; not knowing that Column B is a column is not.
  ▶ `arborist/{README,BACKLOG}` · `meteorologist/{STATUS,BACKLOG}` · `ls/{STATUS,BACKLOG}` · `SECURITY.md`
  — a quarter of what those domains cost entire. ⛔ Re-derive, don't quote:
  `du -ch {arborist,meteorologist,ls}/*.md | tail -1`
  ⚠️ `ls/STATUS` + `ls/BACKLOG` carry **stale banners that are BLOCKED-ON notices, not neglect**
  (`ROADMAP`'s ordering block) — read them for shape, ⛔ never quote their bodies as current.
> ### ⭐⭐ AND YOU DO NOT WAIT TO BE TOLD WHAT THE DAY IS
> The spine and **every** domain's STATE load before Jacob says anything; only **which REFERENCE** turns
> on what he names — and **cartograph is the default**, so most days that changes nothing.
> ⛔ **Never make him scope your read-in.** He names a *symptom*, not a domain, and `CLAUDE.md`'s routing
> gate exists precisely because the topic you feel you are on is usually not the one you are on. If the
> work turns out to live in another domain, load that REFERENCE **then**, and say so.

- **DIARY — never at start of day.** `_archive/` · `NOTES` · git. Two summons only: when a **rule is
  questioned**, and ⛔ **before you form any hypothesis about how something is built** (archived = retired
  for *currency*, not *truth*).
- **The registers on demand:** `FEATURES` · `OPERATIONS` · `INTAKE` · `BAKE` · `STAGE` · `PREVIEW`.
  ⭐ But `§4`'s commit gate means you will touch `FEATURES`/`OPERATIONS` on most landings — read the one
  you are about to write in, before you write in it.

> ⛔ **The receipt — what the old "~400 KB, it is a budget" wording cost, and the two measurements
> that killed it: `cartograph/_archive/BOZ-5-read-in-budget-receipt-2026-09-20.md`.** Read it only if
> you are about to soften this back into a budget.


## §3, checklist items 4–6

4. **The code sites by `file:line`** — the function that does the thing, and the artifact it reads. ⛔ A
   brief citing only docs hands the agent a **model and no way to check it**; the canon can be wrong and
   the code is the fact.
5. **⛔ The chain: what this trusts, and what trusts this.** The docs are shelved by *subject*; the chain
   runs *across* subjects, so the constraint that binds a task almost never lives in that task's topic
   doc. Name the upstream invariant and the downstream consumer **by name**. ⭐ Then convert it: a
   constraint that crosses topics belongs in a **check**, not in someone else's prose — it should travel
   with the **operation**, not the subject.
6. **⛔ Can the instrument SEE the change?** Before writing any gate: what does it read — **disk or live**?
   Does that artifact already carry the thing the change produces? (`node -e` it. One line.) A gate the
   cure can never satisfy prints the old figure, which reads as *"the cure did nothing."* ⭐ Corollary:
   name which **surface** the eye-gate happens on — Survey renders **live**, Section renders from the
   **frozen `shape.json`** (`BlockGeometryV2Debug.jsx`, explicitly *"NOT from a live re-run"*).
   ⛔⛔ **"FROZEN" HERE MEANS THE FROZEN SHAPE, NOT THE BAKED SLAB. THEY ARE DIFFERENT ARTIFACTS AND
   THIS LINE HAS ALREADY BEEN MISREAD ONCE** *(Boz, 2026-09-20: read "frozen" as `baked/<look>/ground.json`,
   told Jacob three times that Section would show a stale slab until a re-bake, and put a bake on his
   board as a gate on an arc it had nothing to do with. **Neither Designer surface reads the baked
   ground slab at all.**)* ⭐ `baked/<look>/ground.json` is read by `BakedGround` / `GatewayArch` /
   `CartographSurfaces` — **the 3D side, downstream of Stage.** ▶ The precise statement, with both
   line cites, lives in `ROADMAP.md` (search `Section renders from the frozen`); this is the pointer.
