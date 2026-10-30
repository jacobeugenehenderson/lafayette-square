# PUBLISH §1 — GitHub Pages, Lafayette Square's legacy production (RETIRED 2026-10-30)

Moved VERBATIM from `PUBLISH.md` at LS's cutover, step 2 (`BRIEF-ls-cutover-to-its-address`): the instance's `domain` line was deleted, so LS's production address now comes from Operations and Promote ships it like every town. Retired for CURRENCY, not truth: it describes how `main` reached lafayette-square.com. Live home: `PUBLISH.md §0.5`.

---

## 1. Frontend (GitHub Pages) — ⚠️ Lafayette Square's LEGACY production only

> Every other town is served per §0.5. This section describes `lafayette-square.com` until its cutover; nothing in the Publish panel pushes `main` any more.

Deploys automatically on every push to `main`. **Per the working loop (strategy B, 2026-06-26), promote to `main` only after verifying on staging** (the trunk `curb-offset-draw`) — see the Quick reference above + [`cartograph/OPERATIONS.md §Save → ship`](cartograph/OPERATIONS.md). Both branches are slab-era and stay a few commits apart, so prod promotion is a clean fast-forward.

```bash
# solo, work directly on the trunk:
git push origin curb-offset-draw        # → staging (verify here first)
git push origin curb-offset-draw:main   # → prod, once staging looks right
```

The GitHub Actions workflow (`.github/workflows/deploy.yml`) builds with Vite and deploys `dist/` via `actions/deploy-pages@v4`.

The `public/CNAME` file tells GitHub Pages to serve at `lafayette-square.com`.

To trigger a re-deploy without code changes:
```bash
git commit --allow-empty -m "Trigger deploy" && git push
```

### Staging (preview before prod)

There is a **second** Pages target for previewing slab/look work before it reaches `lafayette-square.com`:

| Branch | Workflow | Deploys to |
|---|---|---|
| `main` | `deploy.yml` | **lafayette-square.com** (prod, this section) |
| the trunk (⛔ derive it, never quote it — see the check above) | `staging.yml` | **`lafayette-square-staging`** (GitHub Pages preview) |

Push a feature branch to the trunk to stage it; push the trunk to `main` to ship. **CI does not bake** — both workflows are `vite build` over an `actions/checkout`.

⛔⛔ **BUT THE SLAB IS NO LONGER WHAT YOU COMMIT (2026-09-01).** This line used to read *"serve the committed slab, so the artifacts you committed are exactly what deploys (bake + commit before you push)"* — **that instruction is now wrong and following it ships nothing.** `public/baked/` is gitignored and served from R2 (§6). Publish uploads it; git carries only `design.json`, `looks/index.json`, `ribbons.json` and the OG image. ⭐ **So a slab reaches its environment WITHOUT a push, and code still needs one.** ⚠️ **Corrected 2026-09-03:** this line, and the row above, used to say a pour was *"live immediately, on staging AND prod"* — it was, and that was the defect, not the design. One bucket, one un-prefixed key space, both workflows resolving the same `VITE_ASSET_BASE`: a pour reached lafayette-square.com with **no preview and no gate**, while code had a full staging loop. Publish writes `staging/baked/…` only (a bake writes nothing remote); promotion is its own deliberate gesture. The slab save→ship discipline (source-vs-derived, dirty-tree triage, the symptom→door table) lives in **`cartograph/OPERATIONS.md §Save → ship`**.

### Build-time environment (GitHub Secrets)

These are injected during `npm run build` in the Actions workflow:

| Secret | Purpose |
|--------|---------|
| `VITE_API_URL` | Apps Script deployment URL |
| `VITE_SUPABASE_URL` | Supabase project URL (for Cary, when live) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (for Cary, when live) |

Set in repo [Settings > Secrets > Actions](https://github.com/jacobeugenehenderson/lafayette-square/settings/secrets/actions).

When adding a new secret, also add it to `.github/workflows/deploy.yml` under the `npm run build` step's `env:` block.

### Production build test

```bash
npm run build && npm run preview
```

Preview serves at `localhost:4173/`.

