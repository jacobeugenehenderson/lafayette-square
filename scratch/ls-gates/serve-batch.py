# The ONE serve.js save for G1 + G5 (Argon, Boz's batch). Asserts every anchor before writing; one write = one restart.
import sys
p='cartograph/serve.js'; s=open(p).read()
rep=[
("import { join, extname, dirname } from 'path'", "import { join, extname, dirname, relative } from 'path'"),
# the content step's comment: the declaration, not the name
("""      // the baked id set). LS is guarded (its content is hand-curated) — the step
      // + bake-content both skip the default scene. Hand-authoring survives via
      // the committed override sidecars (listings.overrides.json).""", """      // the baked id set). A town that declares its listings hand-curated (meta.baseSource, LS) is skipped by
      // bake-content itself, from its own data. Hand-authoring survives via the committed override sidecars
      // (listings.overrides.json)."""),
# G1 — LS's authored lamps moved into its own data: the shared-path constant and its two input listings go
("""      const STREET_LAMPS = join(REPO_ROOT, 'src', 'data', 'street_lamps.json')\n""", ""),
("""          [STREET_LAMPS, join(bakePaths.raw, 'osm.json'),""", """          [join(bakePaths.raw, 'osm.json'),"""),
("""         join(LOOK_DIR, 'lamps.json'), STREET_LAMPS, join(LOOK_DIR, 'trees.json'),""", """         join(LOOK_DIR, 'lamps.json'), join(LOOK_DIR, 'trees.json'),"""),
# G5 — the town declares its pour (design.json `pour`, a TOWN field): no name test
("""      const isDefaultMap = bakeScene === DEFAULT_MAP\n""", ""),
("""      const elevFlag = isDefaultMap ? '' : ' --skip-elevation'""",
 """      const elevFlag = bakeDesign.pour?.elevation === true ? '' : ' --skip-elevation'   // the town's declaration (design.json pour.elevation)"""),
("""        const lsAsks = isDefaultMap && !bakeReads[`${id}:promote-ribbons`]
          ? ['src/data/ribbons.json → promote-ribbons has no record yet, so this Bake would re-promote LS\\'s committed ribbons'] : []""",
 """        const lsAsks = bakeDesign.pour?.held && !bakeReads[`${id}:promote-ribbons`]
          ? [`${relative(REPO_ROOT, RIBBONS)} → promote-ribbons has no record yet, so this Bake would re-promote ${bakeScene}'s committed ribbons (its pour is held: ${bakeDesign.pour.held})`] : []"""),
("""      if (!isDefaultMap) {
        const SCENE_BAKED_BUILDINGS""", """      {
        const SCENE_BAKED_BUILDINGS"""),
("""      } else {
        skip('content (LS content is hand-curated — not regenerated)')
      }
      if (layerOn('lamp')) {""", """      }
      if (layerOn('lamp')) {"""),
# G5 — the autosave preserves the town fields Stage does not author, `pour` among them
("""        for (const k of ['trees', 'groveThreshold', 'water']) {""", """        for (const k of ['trees', 'groveThreshold', 'water', 'pour']) {"""),
]
for a,b in rep:
    if s.count(a)!=1: sys.exit(f'anchor not unique/absent ({s.count(a)}): {a[:80]!r}')
    s=s.replace(a,b,1)
if 'isDefaultMap' in s: sys.exit('isDefaultMap still referenced')
if '--check' in sys.argv: print('all anchors found; not written'); sys.exit(0)
open(p,'w').write(s); print('serve.js written')
