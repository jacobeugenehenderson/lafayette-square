/**
 * artifactClass — which artifact a URL belongs to, read off its path, never off a list of known files.
 *
 * A slab file (`…/baked/<look>/<rel>`) is classed by the first word of its slab path: `ground.lightmap.png` → ground,
 * `trees/oak/a-lod1.glb` → trees, `trees-atlas.json` → trees. So a file a future bake adds is classed by the same rule,
 * in any town. Code (`.js`, `.jsx`, `.css`, Vite's `/@…` and `node_modules`) is `code`; anything else is `asset:` + its
 * first path segment (`textures`, `models`, `basis`, `clouds`).
 */
export function artifactClass(url) {
  if (!url) return 'unattributed'
  let p
  try { p = new URL(url, typeof location !== 'undefined' ? location.href : 'http://x/').pathname } catch { return 'unattributed' }
  const slab = p.match(/\/baked\/[^/]+\/(.+)$/)
  if (slab) return slabClass(slab[1])
  if (/\.(m?js|jsx|tsx?|css)$/.test(p) || p.startsWith('/@') || p.includes('/node_modules/')) return 'code'
  return 'asset:' + (p.split('/').filter(Boolean)[0] || '?')
}

/** The class of a slab-relative path (`ground.lightmap.png` → `slab:ground`), as the manifest names its files. */
export function slabClass(rel) {
  return 'slab:' + rel.split(/[./-]/)[0]
}
