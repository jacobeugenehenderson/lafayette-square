# serve.js for G2(b) (Argon): a Publish commits the PUBLISHING town's declared ribbons only — never LS's for every Look.
import sys
p='cartograph/serve.js'; s=open(p).read()
rep=[
("import { DEFAULT_MAP, mapRawDir, mapCleanDir, ribbonsPathOf } from './config.js'",
 "import { DEFAULT_MAP, mapRawDir, mapCleanDir, ribbonsPathOf, declaredRibbonsOf } from './config.js'"),
("""function slabPathspecs(id) {
  return [""","""function slabPathspecs(id) {
  // ⭐ A town's COMMITTED ribbons ride ITS OWN Look's publish (declaredRibbonsOf — the town's pour.ribbons): every other
  // town's are generated and gitignored. ⛔ It listed src/data/ribbons.json for EVERY Look — Lafayette Square's ribbons
  // on a Huron publish, by name (G2(b), 2026-10-07).
  const scene = readLooksIndex().looks.find((l) => l.id === id)?.scene
  const ribbons = scene ? declaredRibbonsOf(scene) : null
  return ["""),
("""    `public/looks/index.json`,
    `src/data/ribbons.json`,
    `public/photos/og-preview.jpg`,""","""    `public/looks/index.json`,
    ...(ribbons ? [ribbons] : []),
    `public/photos/og-preview.jpg`,"""),
]
for a,b in rep:
    if s.count(a)!=1: sys.exit(f'anchor ({s.count(a)}): {a[:70]!r}')
    s=s.replace(a,b,1)
if '--check' in sys.argv: print('anchors ok; not written'); sys.exit(0)
open(p,'w').write(s); print('serve.js written')
