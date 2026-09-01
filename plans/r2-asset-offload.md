# R2 asset offload — the cutover plan

**Phase 1 (reversible) is DONE; Phase 2 is NOT STARTED and needs Jacob's explicit go.**
Nothing in the repo has been changed. No `.gitignore` edit, no removal, no push.

**Goal:** baked map assets leave the git repo and are served from Cloudflare R2 over a custom
domain, with **zero visible change to a visitor**.

> **Kit framing (Layer 0).** The asset host is a **kit-wide** resource, not an LS one. `public/baked/`
> already holds five looks (LS, HPDM, Altadena, toy, default). Every decision below is written so
> town #2 needs no hand-work: one env var, one bucket prefix per look, no per-scene branch. And every
> failure mode below is required to **fail loudly** — the specific silent failure this plan guards
> against is a poured slab that lives nowhere and 404s in production while the map still renders.

---

## 1. Measured state — every number with its command

| Fact | Value | Command |
|---|---|---|
| Tracked `public/` | **702 MB** | `git ls-files -z public \| xargs -0 du -ch \| tail -1` |
| Tracked `public/baked/` | **516 MiB** (`du -ch`) / **527,880 KB** (`du -ck`) | `git ls-files -z public/baked \| xargs -0 du -ch \| tail -1` |
| Pack size | **4.41 GiB** | `git count-objects -vH` |
| `BASE_URL` uses in `src/` | **74** | `grep -rn "import.meta.env.BASE_URL" src/ \| wc -l` |
| `copyPublicDir` in vite config | **0 hits** | `grep -rn "copyPublicDir" vite.config.js` |
| `wrangler.toml` | **absent** | `ls wrangler.toml wrangler.jsonc` |

Baked, per look and per extension:

```
git ls-files public/baked | awk -F/ '{print $3}' | sort -u | while read l; do \
  s=$(git ls-files -z "public/baked/$l" | xargs -0 du -ck | tail -1 | cut -f1); echo "$((s/1024))M $l"; done | sort -rn
git ls-files public/baked | while read f; do echo "$(stat -f%z "$f") ${f##*.}"; done \
  | awk '{a[$2]+=$1} END{for(k in a) printf "%.1f MB  %s\n", a[k]/1048576, k}' | sort -rn
```

→ `lafayette-square` 189M · `hipointe-demun` 174M · `altadena` 117M · `lafayette-square-staging` 15M
· `default` 14M · `toy` 4M.  By kind: png 189.7 · bin 155.8 · glb 101.3 · json 46.0 · ktx2 20.4 MB.

**Why now.** GitHub Pages soft-limits a published site at 1 GB. The deployed payload is
`dist/`, which is the build plus a straight copy of tracked `public/` (there is no
`copyPublicDir` allow-list — see §2). At 702 MB, one more pour of Altadena's size
(117 MB) or HPDM's (174 MB) puts the site over.

---

## 2. Brief premises — confirmed, corrected, and one unbuilt claim

**Confirmed.**
- `public/baked` is the bulk of tracked `public/`; the pack is 4.41 GiB.
- Every baked-asset fetch resolves through `import.meta.env.BASE_URL`. The eight sites that read
  `${base}baked/…` (`terrainShader.js`, `SlabBuildings.jsx`, `OverheadTrees.jsx`,
  `HeroImpostorTrees.jsx`) all derive `base` from `BASE_URL` in the same file.
- **`src/toy/ToyTrees.jsx:18` is the only hardcoded asset path** —
  `bakeUrl="/baked/toy/trees.json"` — and it is the only one. There is no hardcoded asset *host*
  anywhere in `src/` (the non-app hosts that exist are arcgisonline, zippopotam, fontsource,
  jsdelivr, and photo URLs inside `src/data/buildings.json`).
- No `wrangler.toml`; `worker.js` is hand-deployed via the Cloudflare dashboard, routed only at
  `lafayette-square.com/place/*` (PUBLISH.md §3). Asset requests do not pass through it.
- `__BUILD_HASH__` (`vite.config.js:141`) and `atlasVersion` (`InstancedTrees.jsx:738`) both exist.

**Corrected.**
- The brief's "**public/baked ≈ 528 MB**" is the `du -ck` **kilobyte** figure (527,880 KB) read as
  megabytes. The same tree is **516 MiB** by `du -ch`. Same bytes, two units — recorded so the two
  numbers are not later quoted as a discrepancy.

**⚠️ Unbuilt claim, surfaced not corrected.**
`ls/ARCHITECTURE.md:372` (§8 "Pending verifications", item 2) reads:

> *"**Vite's `copyPublicDir` selectivity** — RESOLVED by cleanout plan §S3: production build moves
> to `copyPublicDir: false` + named allow-list plugin. Phase C executes."*

`grep -rn copyPublicDir vite.config.js` returns **zero hits**. This is **ASPIRATION filed as
RESOLVED** (CLAUDE.md's third cause) — an intent that was never built, marked done. Per the gate it
is **neither evicted nor quietly corrected**: it is surfaced here as work. It is also *directly
load-bearing for this plan*: the allow-list is the alternative lever for the same problem, and
whoever wrote "RESOLVED" left the payload-size question looking closed for anyone who read that
line. **Boz owes the ruling** on whether the allow-list is still wanted alongside R2 or is
superseded by it; this plan does not decide it and does not touch that doc.

---

## 3. What the cutover changes

### 3.1 Bucket and prefix layout

One bucket, look-scoped prefixes mirroring the on-disk tree exactly, so the URL is a pure
substitution and nothing per-scene is encoded anywhere:

```
r2://<bucket>/baked/<look>/…      ←  public/baked/<look>/…
```

Recommended bucket name: `theward-assets` (kit-level, not LS-level). Location hint: ENAM.

### 3.2 The domain — a recommendation Jacob should overrule if he wants

Jacob supplies the domain. **Recommend a studio-level host, not an LS one** — e.g.
`assets.jacobhenderson.studio` (or `assets.theward.*`).

Reason: PUBLISH.md §0.5 already settles "one factory, many destinations" — HPDM may get its own
apex, and Altadena after it. Putting the shared asset store on `assets.lafayette-square.com` makes
every future town's canopy load from a domain named after a different neighborhood, and re-homing it
later means invalidating every cached URL. A neutral host is the same work today and no work later.

⛔ Do not put the bucket behind `r2.dev` — that endpoint is rate-limited and explicitly not for
production.

### 3.3 CORS

Cross-origin matters here: `fetch()` for the JSON/`.bin`, and `THREE.TextureLoader` /
`GLTFLoader` / the KTX2 transcoder for the media. All of it needs `Access-Control-Allow-Origin`.

Allowed origins — **exactly these, no wildcard**:

| Origin | What it is |
|---|---|
| `https://lafayette-square.com` | prod (`deploy.yml` → Pages, `public/CNAME`) |
| `https://www.lafayette-square.com` | the `www` CNAME (PUBLISH.md §4) |
| `https://jacobeugenehenderson.github.io` | staging — the staging site is a **path** (`/lafayette-square-staging/`) on this host, so the *origin* is the bare host |
| `http://localhost:5173` | `npm run dev:web` (Vite) |
| `http://localhost:4173` | `npm run preview` |

`AllowedMethods: [GET, HEAD]`. `AllowedHeaders: [range, content-type]` (range matters — the GLB and
`.bin` loaders issue range requests). `ExposeHeaders: [content-length, content-range, etag]`.

⚠️ **CORS fails at runtime, not at build.** A `curl` proves nothing here: `curl` sends no `Origin`
and R2 answers it happily while a browser still blocks. Verification is a **real page load** with a
real canopy — §5.

### 3.4 The code change — `VITE_ASSET_BASE`

One new module, one env var, and the existing `BASE_URL` joins keep working unchanged:

```js
// src/lib/bakedUrl.js  (new)
// The asset origin for BAKED output. Defaults to BASE_URL so dev, `vite preview`
// and any build without the var behave exactly as before. Production sets it to
// the R2 custom domain. ⛔ No fallback beyond this default: if the var is set and
// the asset is missing, the fetch 404s LOUDLY — it must never resolve to LS.
const RAW = import.meta.env.VITE_ASSET_BASE || import.meta.env.BASE_URL
export const ASSET_BASE = RAW.endsWith('/') ? RAW : RAW + '/'
```

Then the ~25 sites that build `${BASE_URL}baked/…` (and the eight `${base}baked/…` derivations)
read `ASSET_BASE` instead. The remaining ~49 `BASE_URL` uses — app routes (`place/`, `codedesk/`),
`favicon.svg`, `textures/`, `clouds/`, `models/`, `basis/`, `weather-icons/`, `looks/*/design.json`,
`assetUrl.js`'s instance content — **stay on `BASE_URL`**: they are not baked output and are not
moving. Two paths need naming explicitly:

- **`src/toy/ToyTrees.jsx:18`** — the one hardcode. Becomes `` bakeUrl={`${ASSET_BASE}baked/toy/trees.json`} ``.
- **`src/components/treeAtlasMaterial.js:1425-1427`** — the manifest stores absolute `/baked/…`
  paths and this is the one place they are re-based. `withBase` switches to `ASSET_BASE`.
  ⚠️ This is the site of the 2026-06-17 bug where the lone BASE_URL-bypassing fetch gated **all**
  trees off. It is the highest-risk single line in the change.

Env wiring: `VITE_ASSET_BASE` added to the `env:` block of **both** `deploy.yml` and `staging.yml`
(from a GitHub Secret or a literal — it is not secret). Left unset locally, so `npm run dev` and
`npm run preview` keep reading `public/` off disk with no R2 round-trip.

### 3.5 Cache headers — keyed to what actually versions, which is *not* uniform

The brief calls the cache-busting design "half built." Measured, on LS, that is exactly right, and
the split decides the policy:

```
node -e "const fs=require('fs');const g=JSON.parse(fs.readFileSync('public/baked/lafayette-square/ground.json','utf8'));…"
# (the three groups below; re-run the probe in §6 to reproduce)
```

| Group | Bytes (LS) | Version token |
|---|---|---|
| Tree GLBs, `trees.json`, `tree-anchors.json`, `ground.json`/`.bin`, `lamps.json`, `labels.json`, `scene.json`, landscape | the bulk | ✅ `?v=<atlas generatedAt>` / `?t=<scene.bakedAt>` — a **stable content version** |
| Atlas textures (`trees-atlas-color/normal.png` **18.0 MB**) · KTX2 impostor pages (360 files, **18.8 MB**) · `terrain.json`/`.bin` + `ground.{lightmap,poolmap,colormap}.png` (**1.5 MB**) | **38.3 MB** | ⛔ **NONE.** In a production build `bakeLastMs` is undefined (it is an authoring prop), so `BakedGround.jsx:131/147/168` emit no query at all, and `treeAtlasMaterial.js:1427` / `HeroImpostorTrees.jsx:87` / `OverheadTrees.jsx:154` append nothing. |
| `buildings.json` + `buildings.bin` + `trees-atlas.json` | **3.4 MB** | ⚠️ `?t=${Date.now()}` — a *new URL every page load*, so never cacheable at all (`SlabBuildings.jsx:143`, `treeAtlasMaterial.js:1399-1400`) |

**Therefore, at cutover: `Cache-Control: public, max-age=300, must-revalidate`. Not `immutable`.**

Setting a long immutable TTL now would pin those 38.3 MB — including the *entire canopy atlas and
every impostor page* — at their pre-repour bytes, with no URL to change and no way to flush. That is
a silent substitution of stale data for fresh, on the assets that make the map look right: Layer 0's
second question, answered wrong. R2 emits ETags, so a 5-minute TTL still costs only conditional
revalidations, not re-downloads.

**Named follow-up, not part of this cutover:** thread the existing version tokens through the three
unversioned sites (atlas `generatedAt` → `treeAtlasMaterial`'s `withBase` and the two impostor URL
builders; `scene.bakedAt` → `BakedGround`'s three texture URLs and `terrainShader`), and replace the
two `Date.now()` busts with `generatedAt`. **Only then** flip to `max-age=31536000, immutable`. This
is worth doing — it converts a 38.3 MB per-visitor re-validation into a true cache hit and makes the
3.4 MB re-download disappear — but it is a code change to the tree render path and does not belong
in the same step as a host swap.

---

## 4. ⚠️ The integration point the brief did not name: `cartograph/serve.js`

The brief's step 5 says "add the upload step to the end of the bake." The bake is not the only
producer, and it is not where a slab currently *ships*.

**`cartograph/serve.js:87` `slabPathspecs(id)`** returns:

```
public/baked/<id>  ·  public/looks/<id>/design.json  ·  public/looks/index.json
src/data/ribbons.json  ·  public/photos/og-preview.jpg
```

and `POST /looks/<id>/publish` (`serve.js:2447`) runs `git add` + `git commit` over exactly those
pathspecs, then pushes to `land-use-derivation`. **That is the operator's Publish button.**

If `public/baked/<id>` becomes gitignored and nothing else changes:

- `git status --porcelain -- <specs>` reports the baked tree as **unchanged** (ignored files do not
  appear), so `changed` is empty and `committed` is `false`;
- `specs.length` is still non-zero because `design.json` and `index.json` remain tracked, so the
  guard `if (!specs.length) throw` **does not fire**;
- the endpoint pushes and returns `{ ok: true }`.

**The operator presses Publish, gets a success, and the slab never leaves the machine.** That is
precisely the failure the brief's step ordering exists to prevent, arriving through a door the
ordering does not cover. The UI's `bakedAt` poll against the live site would eventually not match —
a slow, ambiguous symptom, not a loud failure.

**So Phase 2 step 5 must change this endpoint in the same commit that gitignores the baked output:**
the R2 upload becomes an explicit step of `/publish` (and of the bake CLI), it must **fail the
request loudly** if the upload fails, and `slabPathspecs` drops `public/baked/<id>` while keeping
the rest. `serve.js` is dev-only and local, so it can hold the R2 credentials in the local `.env`
(already gitignored, `.gitignore:8`).

---

## 5. Phase 2 — the ordered steps. **The order is the safety property.**

⛔ Requires Jacob's explicit go. ⛔ Never push — commit if useful; Jacob pushes.

1. **Bucket + custom domain + CORS.** (§3.1–3.3.) Jacob supplies the domain; he creates the bucket
   and the API token, or authorizes their creation.
2. **Upload the existing baked assets.** All five looks, `public/baked/**` → `baked/**`.
   Nothing is removed from the repo. `rclone` or `wrangler r2 object put` under a script in
   `scripts/`; the script is scene-generic — it globs `public/baked/*`, no look is named in it.
3. **Code + env.** Add `src/lib/bakedUrl.js`, switch the baked-asset sites to `ASSET_BASE`, fix
   `ToyTrees.jsx:18`, add `VITE_ASSET_BASE` to both workflows. **Assets now exist in both places.
   That redundancy is deliberate and is the thing that makes steps 1–4 reversible.**
4. **Deploy to staging and verify in a real browser** (§6). Prod after staging is clean.
5. **Only after 4 passes:** add the R2 upload to `POST /looks/<id>/publish` **and** the bake CLI
   (§4), gitignore newly baked output, and remove the committed baked assets from HEAD
   (`git rm -r --cached public/baked` — HEAD only; ⛔ **no history rewrite**, the 4.41 GiB pack stays
   by decision).
6. **Verify again in a browser**, on staging then prod.
7. Add `git clone --depth 1` to `README.md §Local development` (line 42). Full history stays
   4.41 GiB by decision; a shallow clone is what a new developer wants.

⛔ **If 5 lands before 4, a pour produces assets that live nowhere and 404 in production — the map
renders and the trees do not.** That is the silent failure this ordering prevents.

### What must NOT happen in step 5

- ⛔ **Do not naively untrack `public/`.** `.gitignore:280-293` records, with reasons, which baked
  artifacts are committed on purpose. Two live decisions sit there: `*-lod0.glb` is **ignored**
  (56% of a town's payload the map never requests), and **KTX2 pages ARE COMMITTED** — *"an ignored
  page is a 404 in the canopy, not a rebuild."* Under R2 that second rationale changes shape (the
  page is no longer served by `actions/checkout`), so **the comment must be rewritten, not deleted**
  — the decision it records is still live, its mechanism moved.
- ⛔ **Keep one baked slab reachable at HEAD or via R2 at all times.** This is why a stranger sees a
  working map minutes after cloning. Between step 5's `git rm --cached` and R2 being verified, that
  property is held *only* by R2 — which is why step 4 gates step 5.
- ⛔ **No fallback.** A missing asset 404s. It never resolves to Lafayette Square.

---

## 6. Verification — a page load, not a curl

**The trees are the canary.** The canopy is the KTX2 + atlas + GLB path: cross-origin, range
requests, a transcoder, and the one line (`treeAtlasMaterial.js:1425`) that has broken this way
before. If the canopy renders, the risky part survived. Per look, in a real browser:

1. Load the site. **Check the shader compile first** — a blank or black render is a shader failure,
   not an asset failure, and reads identically.
2. DevTools → Network, filter `baked` — every row must be the R2 host, `200`, and **no CORS error in
   the console**. A blocked preflight shows as a console error and a failed row, never as a 404.
3. The canopy is present and textured (not untextured grey, which is the atlas failing to load).
4. Ground lightmap/pool/colormap present; buildings present; lamps present; street labels present.
5. Repeat under `?look=hipointe-demun`, `?look=altadena`, `?look=toy` — the toy look is the one that
   exercises the fixed `ToyTrees.jsx` hardcode, and `hipointe-demun` is the one that proves the
   change is not LS-shaped.

Re-derive the cache-group split at any time:

```
node -e "
const fs=require('fs'),L='public/baked/lafayette-square';
const g=JSON.parse(fs.readFileSync(L+'/ground.json','utf8'));
const m=JSON.parse(fs.readFileSync(L+'/trees-atlas.json','utf8'));
const un=['terrain.json','terrain.bin'];
for(const k of ['lightmap','poolmap','colormap']) if(g[k]?.image) un.push(g[k].image);
for(const p of [m.atlas?.colorPath,m.atlas?.normalPath]) if(p) un.push(p.replace('/baked/lafayette-square/',''));
const seen=new Set(),walk=o=>{if(!o)return;if(typeof o==='string'){if(/^\/trees\/.*\.ktx2$/i.test(o))seen.add(o);return}
 if(typeof o==='object')for(const v of Object.values(o))walk(v)};
walk(m.impostorBySpecies);walk(m.heroImpostorBySpecies);
const sz=f=>{try{return fs.statSync(L+'/'+f.replace(/^\//,'')).size}catch{return 0}};
const tot=a=>a.reduce((s,f)=>s+sz(f),0);
console.log('UNVERSIONED', ((tot(un)+tot([...seen]))/1048576).toFixed(1)+' MB', '('+seen.size+' ktx2 pages)');
console.log('Date.now()  ', (tot(['buildings.json','trees-atlas.json',JSON.parse(fs.readFileSync(L+'/buildings.json','utf8')).bin])/1048576).toFixed(1)+' MB');
"
```

---

## 7. Out of scope, deliberately

- **No git history rewrite.** Separate decision, separate session. The 4.41 GiB clone stays.
- **No extent / membership / boundary work** — `EXTENT-DESIGN §5.2` is load-bearing.
- **No doc reduction.**
- **The `copyPublicDir` allow-list** (§2) is surfaced as unbuilt work, not built here.
- **The version-token follow-up** (§3.5) is named, not built here.
