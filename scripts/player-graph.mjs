/**
 * player-graph.mjs — which build output is NOT the town player's, read from Vite's own build manifest
 * (`dist/.vite/manifest.json`, `build.manifest` in vite.config.js). Pure; the caller is publish-player-to-staging.
 *
 * ⛔ The one build makes six pages (vite.config.js's rollupOptions.input): the player (index.html) and the operator
 * apps. Every built file shipped, so the authoring tools went public at staging.theward.online/_player/ and were
 * copied into towns' production players by Promote (2026-10-30). Ruled by Boz: the operator apps never publish.
 *
 * What is dropped, and only this: a file the manifest names that the player's graph does not reach (each entry's
 * file, imports, dynamicImports, css, assets, transitively, from `entry`); every OTHER entry's page; and the
 * manifest itself. ⭐ Everything the manifest does not know keeps the caller's rule, because the player fetches it at
 * runtime: public/ files, each town's content/ (copied in by vite.config's mirrorInstallationContent), and a worker
 * chunk (measured 2026-10-30: the Vite manifest names 52 files, the player's graph 41, and 106 on disk it doesn't
 * name, among them content/ and rgPageWorker-*.js, which the player's OverheadTrees loads).
 * ▶ node checks/claims-the-player-publish-ships-only-the-player.mjs --mutants
 */
export const VITE_MANIFEST = '.vite/manifest.json'

/** The dist files the entry's graph reaches. */
export function graphOf(manifest, entry) {
  if (!manifest[entry]?.isEntry) throw new Error(`the build manifest has no entry "${entry}" — is build.manifest on?`)
  const files = new Set(), seen = new Set()
  const visit = (key) => {
    const c = manifest[key]
    if (!c || seen.has(key)) return
    seen.add(key)
    files.add(c.file)
    for (const f of [...(c.css || []), ...(c.assets || [])]) files.add(f)
    for (const k of [...(c.imports || []), ...(c.dynamicImports || [])]) visit(k)
  }
  visit(entry)
  return files
}

/** → the dist paths that are not the player's: other entries' pages, the files only they reach, and the manifest. */
export function notThePlayers(manifest, entry = 'index.html') {
  const player = graphOf(manifest, entry)
  const out = new Set([VITE_MANIFEST])
  for (const [key, c] of Object.entries(manifest)) {
    if (c.isEntry && key !== entry && key.endsWith('.html')) out.add(key)
    for (const f of [c.file, ...(c.css || []), ...(c.assets || [])]) if (!player.has(f)) out.add(f)
  }
  return out
}

/**
 * The publish's whole decision: every built file is the player's to ship, the operator apps' (never shipped), or an
 * untracked public/ file (never shipped). `publicKept(rel)` is the caller's public/ rule: false for a file that came
 * from public/ and is not tracked, true otherwise.
 */
export function playerShipSet(all, manifest, publicKept, entry = 'index.html') {
  const notPlayers = notThePlayers(manifest, entry)
  const ship = [], operator = [], untracked = []
  for (const f of all) (notPlayers.has(f.rel) ? operator : publicKept(f.rel) ? ship : untracked).push(f)
  return { ship, operator, untracked }
}
