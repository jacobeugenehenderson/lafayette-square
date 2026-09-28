# The `?t=` cache-bust scheme — RETIRED 2026-09-28

**Replaced by** content-named slab files (BRIEF-slab-loading §3 step 3): every slab URL comes from
`src/lib/slabUrl.js`; a published file is served at `<name>.<sha16>.<ext>`, immutable, and the town's
`manifest.json` (no-cache) is the switch. On disk (Stage, dev) the resolver carries the caller's re-read
key as `?bake=` only because r3f's useLoader / drei's useGLTF cache in memory by URL.
▶ `node checks/claims-every-slab-url-is-resolved.mjs` · `node checks/claims-a-slab-name-is-its-content.mjs`.
The stale-key class this scheme had (an artifact newer than `scene.json#bakedAt`) cannot occur under
content names; its successor gate is the uploader REFUSING a manifest that disagrees with the files on
disk (`scripts/upload-baked-to-r2.mjs --names=sha256-16`).

## Evicted from arborist/BACKLOG.md
- [ ] **⛔ Two looks publish behind a stale cache-bust key** — `default` and `lafayette-square-staging` (LS was among them until 2026-08-29 and is now clean). Cold consumers serve the PREVIOUS slab from cache **and no reload dislodges it**, which is exactly how a fixed bug keeps reading as broken. The pour stamps `scene.json#bakedAt` unconditionally now, so the cure is one re-pour per look. ▶ `node checks/claims-the-slab-freshness-key-is-not-stale.mjs`

## Evicted from cartograph/PREVIEW.md (Inputs row, the cache-bust clauses)
| **Inputs** | the slab — `public/baked/<look>/{ground.json,ground.bin,ground.lightmap.png,buildings.json,buildings.bin,lamps.json,scene.json,trees.json}` — all cache-busted by `scene.json#bakedAt`. ⛔ **ROT EVICTED 2026-08-28:** this row named `public/baked/<look>.json` as the tree input. Nothing has read it since the slab moved into the look folder (`InstancedTrees.jsx:626` — `bakeUrl || baked/<look>/trees.json`, and Preview passes no `bakeUrl`); the file was a 745-tree corpse from 2026-06-26 sitting beside a 5,127-tree live one, and it cost a diagnosis a detour. ⭐ **AND THE KEY IS LOAD-BEARING:** every cold consumer fetches `?t=<bakedAt>`, so if it does not advance, browsers serve the PREVIOUS slab forever and no reload dislodges it. Stage passes its own `bakeLastMs` and is immune — which is why a stale key shows up **only at the publish gate.** The pour now stamps it unconditionally (`serve.js`, beside the looks-index stamp). ▶ `node checks/claims-the-slab-freshness-key-is-not-stale.mjs` |

## Evicted from docs/briefs/HANDOFF-tree-render-2026-08-28.md
node checks/claims-the-slab-freshness-key-is-not-stale.mjs   # bakedAt vs artifact mtimes

## The retired check, verbatim: checks/claims-the-slab-freshness-key-is-not-stale.mjs
```js
/**
 * NO SLAB ARTIFACT MAY BE NEWER THAN THE KEY THAT BUSTS IT.
 *
 * ⛔ THE DEFECT (Jacob, 2026-08-28: "everything shows in the Stage, disappears on the
 * Preview"). `scene.json#bakedAt` is the cache-bust key for the WHOLE slab — every cold
 * consumer appends it to every fetch:
 *     const cacheBust = bakeLastMs ?? scene?.bakedAt ?? null      // InstancedTrees, BakedGround
 *     fetch(url + '?t=' + cacheBust)
 * But it was written ONLY by `bake-scene.js`, i.e. only when the `scene` step was dirty. A
 * pour that rewrote ground and trees and skipped `scene` left the key PINNED, so browsers
 * kept serving the previous slab from cache under a URL that never changed — permanently,
 * through any number of reloads and re-bakes.
 *
 * ⭐ WHY IT LOOKED LIKE "PREVIEW IS BROKEN". Stage passes an explicit `bakeLastMs` and is
 * immune. Preview and PRODUCTION fall back to this field. So the operator sees a correct
 * map everywhere they author and a wrong one at the publish gate — and the bake, which
 * stamped the looks index on the very next line, knew all along.
 *
 * ⭐ WHY THIS IS THE CHECK. It compares mtimes against one number. No thresholds, no
 * look-specific knowledge, no operator who has already looked at the map: if a pour ever
 * again advances an artifact without advancing the key, this fails in every town, loudly,
 * BEFORE the slab is published.
 *
 * ⚠️ WHAT THIS CHECK CAN AND CANNOT SEE. It compares mtimes, which is the only freshness
 * signal the slab carries — there is no content hash. A `git checkout` rewrites mtimes, so a
 * fresh clone (or a branch switch that touches baked files) will report stale keys that are
 * not really stale. ⛔ Do NOT "fix" that by loosening the comparison: the failure mode this
 * guards is invisible and permanent, and a false alarm costs one re-bake. Re-bake and re-run;
 * if it still fails, it is real.
 *
 *   node checks/claims-the-slab-freshness-key-is-not-stale.mjs [look ...]
 */
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const BAKED = path.join(ROOT, 'public/baked')

// ⛔ READ the consumers' rule rather than restating it — if the fallback chain moves, this
// check is modelling something that no longer exists and must say so instead of passing.
const CONSUMERS = [
  'src/components/InstancedTrees.jsx',
  'src/components/BakedGround.jsx',
]
const RULE = /cacheBust\s*=\s*bakeLastMs\s*\?\?\s*scene\?\.bakedAt\s*\?\?\s*null/
const drifted = CONSUMERS.filter(f => !RULE.test(readFileSync(path.join(ROOT, f), 'utf8')))
if (drifted.length) {
  console.error(`⛔ PIN DRIFT — the cache-bust rule this check models has moved:`)
  for (const f of drifted) console.error(`     · ${f} no longer reads \`bakeLastMs ?? scene?.bakedAt ?? null\``)
  process.exit(2)
}

const looks = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(BAKED).filter(d => existsSync(path.join(BAKED, d, 'scene.json')))

let failed = 0
console.log(`No slab artifact may be newer than the key that busts it — ${looks.length} look(s)\n`)

for (const look of looks) {
  const dir = path.join(BAKED, look)
  const scenePath = path.join(dir, 'scene.json')
  const bakedAt = JSON.parse(readFileSync(scenePath, 'utf8')).bakedAt
  if (bakedAt == null) {
    failed++
    console.error(`  ⛔ ${look.padEnd(24)} scene.json has NO bakedAt — cacheBust resolves to null and every ` +
      `cold consumer SKIPS ITS FETCH ENTIRELY (\`if (cacheBust == null) return\`). Nothing renders.`)
    continue
  }

  // Every artifact the key busts. Directories are walked; the slab is flat plus trees/.
  const stale = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      const mt = statSync(p).mtimeMs
      if (mt > bakedAt + 1000) stale.push([path.relative(dir, p), mt])
    }
  }
  walk(dir)

  if (!stale.length) {
    console.log(`  ✅ ${look.padEnd(24)} key ${new Date(bakedAt).toISOString()} is at or ahead of every artifact`)
    continue
  }
  failed++
  stale.sort((a, b) => b[1] - a[1])
  console.error(`  ⛔ ${look.padEnd(24)} ${stale.length} artifact(s) NEWER than the cache-bust key ` +
    `(${new Date(bakedAt).toISOString()}) — cold consumers (Preview, production) will serve the ` +
    `PREVIOUS slab from cache, and no reload dislodges it:`)
  for (const [rel, mt] of stale.slice(0, 8)) {
    console.error(`       ${new Date(mt).toISOString()}  ${rel}`)
  }
  if (stale.length > 8) console.error(`       … and ${stale.length - 8} more (not truncated silently: that is the count)`)
  console.error(`       fix: re-bake this look — the pour now stamps scene.json#bakedAt unconditionally.`)
}

console.log()
if (failed) { console.error(`⛔ ${failed} look(s) publish behind a stale cache-bust key.`); process.exit(1) }
console.log(`✅ every look's freshness key is ahead of its artifacts.`)
```

## Evicted 2026-09-28 by the contract rewrite (verbatim)

### SLAB-CONTRACT §1 (Cache-busting paragraph)

⚠️ **`?t=` IS RETIRED (2026-09-28) — see `src/lib/slabUrl.js`; this paragraph is stale until the rewrite.** **Cache-busting:** consumers MUST request manifests with `?t=<bakeLastMs>` where `bakeLastMs` is a unique-per-bake timestamp from the consumer's store. `BakedGround`, `BakedLamps`, `InstancedTrees`, `treeAtlasMaterial`, `LafayettePark`, `StageArch`, `SlabBuildings` all follow this pattern today. Reusing a stale `bakeLastMs` causes browser HTTP cache to serve last-bake artifacts. See [`cartograph/ARCHITECTURE.md` §8 "Bake chain"](cartograph/ARCHITECTURE.md) for the cache-bust rule + the historical bug.

### SLAB-CONTRACT §9.3

3. **`bin` paths are relative to the manifest.** Never absolute, never URL-style. The consumer resolves against the manifest's own URL.

### SLAB-CONTRACT §10.2

2. ⚠️ **`?t=` IS RETIRED (2026-09-28) — every slab URL comes from `src/lib/slabUrl.js`; the rest of this item and §1's "Cache-busting" paragraph are stale until the rewrite.** **Cache-bust with `?t=<bakeLastMs>`.** Use a unique-per-bake timestamp from your store, not the bake's *duration*. See [`cartograph/ARCHITECTURE.md` §8 "Bake chain"](cartograph/ARCHITECTURE.md) (cache-bust rule + historical bug).

### SLAB-CONTRACT §10.6 (merged into §10.2: the base is ASSET_BASE, owned by the resolver)

6. **Route slab fetches through `import.meta.env.BASE_URL`.** Never hardcode root-absolute paths. The same consumer build deploys to root (`lafayette-square.com`) or any subpath (e.g., `jacobeugenehenderson.github.io/lafayette-square-staging/`) without code changes; the Vite `--base` flag at build time sets the value. Pattern: `` fetch(`${import.meta.env.BASE_URL}baked/${look}/ground.json?t=${t}`) ``. Anti-pattern: `` fetch(`/baked/${look}/ground.json?t=${t}`) `` (resolves to deploy-host root, not subpath). See memory `project_kit_deploy_path_agnostic`.

### SLAB-CONTRACT header

The consumer resolves it through
`src/lib/bakedUrl.js` (`ASSET_BASE`), **never `BASE_URL`**, which is where the *site* is deployed.

### ARCHITECTURE §bake (the implicit bake)

the Stage view's slab refreshes via `bakeLastMs` cache-bust when the bake finishes.

### ARCHITECTURE §8 (Cache-bust bullet)

- **Cache-bust:** `BakedGround`/`InstancedTrees` fetch `?t=${bakeLastMs}`; **`bakeLastMs` must be `Date.now()` on every bake completion**, never the bake duration (reusing a duration value lets the browser serve stale geometry — "I edited days ago, Stage doesn't show it").

### PUBLISH §6 table (Cache row)

| Cache | `public, max-age=300, must-revalidate` — deliberately **not** `immutable`, see below |

### PUBLISH §6 (Why the cache TTL is short)

### Why the cache TTL is short

38.3 MB of the LS slab carries **no version token** in a production build — both atlas PNGs, all 360
KTX2 impostor pages, and the terrain/ground maps — because `bakeLastMs` is an authoring prop and is
undefined in prod. `immutable` would pin a stale canopy at a URL nothing can change. ⛔ **Do not
lengthen this TTL until those carry a token** (`plans/r2-asset-offload.md §3.5`). Cloudflare's zone
**Browser Cache TTL** overrides origin headers and must stay on *Respect Existing Headers*.

### SLAB-CONTRACT §4 (bakedAt as the ?t= seed)

Consumer-side: this is the canonical `?t=<bakedAt>` cache-bust seed for production fetches of slab artifacts, decoupling production from the in-memory `useCartographStore.bakeLastMs`. Authoring contexts may continue to use the store's value; both should agree by construction (store seeds itself from `Date.now()` on bake completion; the bake writes the same epoch into `scene.json`). Per couplers plan CC.7.

### cartograph/OPERATIONS.md § Bake (the upload bullet — its 'live EVERYWHERE, one bucket, same URLs' clause was already false since 2026-09-03's env prefixes)

- ⛔⛔ **THE POUR'S LAST STEP IS AN UPLOAD, AND IT CAN FAIL THE BAKE (2026-09-01).** `public/baked/` is
  gitignored and served from R2, so **the upload — not a commit — is what carries a pour to a visitor.**
  `scripts/upload-baked-to-r2.mjs` runs at the end of the bake and a failure **fails the whole bake (500)**
  rather than returning a green slab that reached nobody. ⚠️ **And the pour is then live EVERYWHERE
  immediately** — one bucket serves staging and prod at the same URLs, so a re-pour reaches
  lafayette-square.com without a push. That is the settled model (`PREVIEW.md §0.2`: staging is redundant
  for slab-data — **Preview is the gate**), but it is new in mechanism. ▶ `node scripts/verify-baked-in-r2.mjs`
