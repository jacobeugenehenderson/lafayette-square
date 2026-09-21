<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-21
evict-when: RULING: one site per town, or one site serving every town? Until that is answered nothing here is buildable — and see §1, which may make the answer smaller than it looks.
-->

# A link per town

> **The ask, verbatim (Jacob, 2026-09-21, ~02:00):** *"once we have this whole pipeline together I
> can build neighborhoods and send the working links to prospective partners."* Then, on pressing
> Publish for Huron: *"it also goes to LS staging: we need to fix that so it creates and routes to
> its own staging site."*

⛔ **Read §1 before costing anything.** The premise that the kit cannot serve a second town is
**false**, and it was false before this brief was written. What is broken is narrower and cheaper
than "build per-town deploys," and mistaking one for the other is how this becomes a week.

---

## 1 · ⭐⭐ THE CAPABILITY ALREADY EXISTS AND IS ALREADY LIVE. **MEASURED 2026-09-21, ~02:10.**

Every one of these is a command, not a recollection. ▶ re-run them; do not quote them.

| Claim | How it was measured | Result |
|---|---|---|
| The player boots any town from the URL | read `src/instance.js` | `INSTANCE` resolves from **`?look=`** at module load; `INSTANCES` holds `lafayette-square`, `hipointe-demun`, **`huron`** |
| Huron's slab is on the staging CDN | `curl -o /dev/null -w '%{http_code}' https://assets.theward.online/staging/baked/huron/scene.json` | **200** |
| …and its ground, too | same, `…/baked/huron/ground.json` | **200** |
| The staging site is up | `curl … https://jacobeugenehenderson.github.io/lafayette-square-staging/` | **200** |

⇒ **A Huron link almost certainly already works:**

```
https://jacobeugenehenderson.github.io/lafayette-square-staging/?look=huron
```

⛔ **NOT VERIFIED IN A BROWSER.** The four probes above are HTTP and source reads; nobody has loaded
that URL and looked at it. **That is the single cheapest act in this brief and it must happen before
any other work** — it decides whether this is a *naming* problem (hours) or a *routing* problem
(days). ⚠️ If it renders Lafayette Square rather than Huron, `?look=` is not reaching `INSTANCE` in a
production build and **that is the whole finding** — stop and re-scope.

### What is genuinely broken, assuming the link renders

**① The URL says another town's name.** `lafayette-square-staging` is in the repo name, the GitHub
Pages path, and Vite's `--base`. You cannot send a partner in Huron a link with St. Louis in it.
⭐ **This is the actual complaint**, and it is *presentation*, not capability.

**② The bare URL is Lafayette Square.** `src/instance.js`: `const DEFAULT_LOOK = 'lafayette-square'`,
commented as *"a deployment fact: Lafayette Square is installation #1 and owns the bare domain."*
That comment is correct for **production** and is the wrong default for a **preview** site whose job
is to show whatever was last poured.

**③ Publish reports one link for every town.** `cartograph/serve.js` holds
`STAGING_SITE_URL` as a **module constant**, and the panel prints it whatever look you published.
⛔ So the button truthfully reports a successful publish and then hands you the wrong address —
a plausible-looking success, which Layer 0 q2 names as the worst outcome available.

**④ One trunk, one deploy, for N towns.** `STAGING_BRANCH = 'land-use-derivation'`;
`.github/workflows/staging.yml` fires on a push to it and force-orphans `./dist` into
`lafayette-square-staging`. Publishing **any** town redeploys **the** site. ⚠️ This is only a
problem if towns must be independently versioned — see §3, where that is the question.

---

## 2 · What is NOT broken, so nobody "fixes" it

⛔ **The slab layer is already per-town and already correct — do not touch it.**
`src/lib/bakedUrl.js`: *"One prefix per look under one bucket, mirroring `public/baked/<look>/…`
exactly, so pouring town #2 needs no code change and no entry in any table."* Keys are
`staging/baked/<look>/…` vs `prod/baked/<look>/…`, and both towns' objects are up there now,
side by side, not overwriting each other.

⛔ **The staging/prod split is already real and already guarded.** `staging.yml` reads
`VITE_ASSET_BASE_STAGING`, with an explicit refusal to fall back to the production base —
*"an unset variable must instead break staging's slab visibly, because a broken preview is
recoverable in a minute and a preview that lies about being a preview is not."*
⭐ **That sentence is the doctrine this whole brief must obey.**

⛔ **`INSTANCE` is keyed by MAP, not by LOOK, on purpose** (2026-09-19). A map carries many Looks —
seasonal, sponsor — and all are the same town. Do not re-key it while adding sites.

---

## 3 · ⛔ THE RULING. Nothing below §1's browser check is buildable until this is answered.

**Does each town get its own SITE, or does one site serve every town?**

**Option A — one site, many towns (`?look=` or `/t/<town>/`).** Closest to what exists; §1's link may
already work. Cost is ①②③ only. ⚠️ Every town shares one deploy: republishing Huron reships
Lafayette Square's bundle, so a partner's link can change under them without anyone touching that town.

**Option B — one site per town.** A partner-grade address per town, and towns are independently
versioned. ⚠️ Each needs its own hosting target, its own deploy key, its own build with its own
`--base`; the single `staging.yml` becomes a matrix; `slabPathspecs` and the publish endpoint become
per-town. ⛔ **And the prod path is not symmetrical** — `promote` fast-forwards `main` and uploads
`--env=prod`, both global today.

**Option C — one site per town for PROD, one shared preview for STAGING.** Preview is a dry run
whose churn nobody should care about; a partner link is an address someone remembers.

⚠️ **A fourth thing Jacob has not been asked and should be, because it changes A vs B:** is a
partner link **public** — indexable, permanent — or an **unlisted preview** for a specific
conversation? ⛔ Not established, and it decides whether these need real domains.

---

## 4 · The smallest honest first step, whatever the ruling

⭐ **Kill ③ now. It is a lie and it does not depend on the ruling.** Publish should report the URL
**of the look it just published**. If that URL cannot yet be derived per town, the panel must say so
— ⛔ never print an address that is wrong for the thing it just shipped. *Reaches `OPERATIONS`.*

▶ Then the browser check in §1, which is ten seconds and re-scopes everything else.

---

## 5 · Premises deliberately NOT established — do not build on these

- Whether `?look=huron` renders Huron **in a production build**. §1. Everything hangs on it.
- Whether any hosting target beyond `lafayette-square-staging` exists. **Not looked at.**
- What a partner link should *be* — public and permanent, or unlisted. §3.
- Whether `INSTANCE` needs a module per town before a town can be published (huron has one;
  a fourth town's first pour would find out). **Untested.**
- ⛔ Cost. **No option here is costed** — §3's ruling changes the shape enough that any number
  written today would be invented.
