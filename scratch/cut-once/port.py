# The port (Zob, 2026-10-29: finish list item 6): scratch/cut-once/cand3.mjs + tagRun.mjs → cartograph/openClose.mjs, the kit's
# module. Every mutant hook reduced to its LIVE branch, every env diagnostic and the parked spike (backPieces) removed, the
# records (ORIGIN, INSERTED, DROPPED) per call. Each substitution must match exactly once, or the port stops.
# python3 scratch/cut-once/port.py
import re, sys, pathlib
here = pathlib.Path(__file__).parent
s = (here / 'cand3.mjs').read_text()
t = (here / 'tagRun.mjs').read_text()

def sub(old, new, count=1):
    global s
    n = s.count(old)
    if n != count: sys.exit(f'port: expected {count} of {old[:90]!r}, found {n}')
    s = s.replace(old, new)

def cut(start, end_after, inclusive_end=True):
    """delete from the line holding `start` to the end of the line holding `end_after` (searched after start)"""
    global s
    i = s.index(start); i = s.rfind('\n', 0, i) + 1
    j = s.index(end_after, i); j = s.index('\n', j) + 1
    s = s[:i] + s[j:]

# ── the header and the imports
i = s.index("import clipperLib from 'clipper-lib'")
s = s[i:]
sub("import { writeFileSync } from 'fs'\n", '')
sub("import { nodeCrossings, lineCrossOf, sameLine, NODE_BOUND, crossOf, LATTICE_STEP } from '../../src/lib/latticeNode.js'",
    "import { nodeCrossings, lineCrossOf, sameLine, NODE_BOUND, LATTICE_STEP } from '../src/lib/latticeNode.js'")
sub("import { facesOf, onLineTiered } from '../../src/lib/latticeFaces.js'", "import { facesOf, onLineTiered } from '../src/lib/latticeFaces.js'")
sub("import { isRoundingSliver } from '../../cartograph/structures.mjs'\n", '')
sub("import { tagRun } from './tagRun.mjs'\n", '')
sub("const SCALE = 1000, MITER_LIM = 0.5", "const MITER_LIM = 0.5")

# ── rawOffset (the RAW_CURVE mutant's only user) goes
i = s.index("// a ring's raw offset curve at d"); j = s.index("  return out\n}\n", i) + len("  return out\n}\n"); s = s[:i] + s[j:]

# ── every mutant flag and its setter
for f, setter in [('TAGS_BY_SEGMENT', 'setTagsBySegment'), ('REFUSE_ALL_BACKWARD', 'setRefuseAllBackward'), ('SINGLE_POINT_BRANCH', 'setSinglePointBranch'),
                  ('RAW_CURVE', 'setRawCurve'), ('BY_EDGES', 'setByEdges'), ('NO_EMIT_INVARIANT', 'setNoEmitInvariant'),
                  ('TIERS_SWAPPED', 'setTiersSwapped'), ('TAGS_OFF_AT', 'setTagsOffAt'), ('OWN_SKIPS_LIMIT', 'setOwnSkipsLimit'), ('SUB_SAME_WAY', 'setSubSameWay'),
                  ('TRIMMED_ARC_CORNERS', 'setTrimmedArcCorners'), ('ARC_RAW', 'setArcRaw'), ('NO_SLIVER_DROP', 'setNoSliverDrop'), ('TRIM_INVERTED', 'setTrimInverted'), ('CLOSE_RAW', 'setCloseRaw'),
                  ('GAP_BEFORE_LIMIT', 'setGapBeforeLimit'), ('TAG_SET_ORDER', 'setTagSetOrder'), ('INSIDE_RUN_FORWARD', 'setInsideRunForward'), ('CORNER_AT_MITER', 'setCornerAtMiter'), ('BACK_PIECES', 'setBackPieces'), ('MERGE_LEAVES_FIRST', 'setMergeLeavesFirst'), ('CLAIMANTS_KEPT', 'setClaimantsKept'), ('OPP_STANDINS', 'setOppStandins'), ('F_SLIVER_KEPT', 'setFSliverKept'), ('CLAIMANT_ONE_SUCCESSOR', 'setClaimantOneSuccessor'), ('TOPO_SILENT', 'setTopoSilent'), ('STAIR_RETAG_OFF', 'setStairRetagOff'), ('STAIR_CELL_OFF', 'setStairCellOff'), ('PREMISE_IGNORED', 'setPremiseIgnored')]:
    s, n1 = re.subn(rf'^let {f} = [^\n]*\n', '', s, flags=re.M)
    s, n2 = re.subn(rf'^export const {setter} = [^\n]*\n', '', s, flags=re.M)
    if n1 != 1 or n2 != 1: sys.exit(f'port: {f}/{setter}: {n1} let, {n2} setter')
s, n = re.subn(r'^let FOLDED_QUAD = [^\n]*\n^export const setFoldMutant = [^\n]*\n', '', s, flags=re.M)
if n != 1: sys.exit('port: the fold mutants')

# ── each read reduced to its live branch
sub("tag: TAGS_BY_SEGMENT ? null : outL[k]", "tag: outL[k]")
sub("TAGS_BY_SEGMENT ? null : openLines", "openLines")
sub("!REFUSE_ALL_BACKWARD && ", "")
sub("if (!TAG_SET_ORDER && tags.length > 1", "if (tags.length > 1")
sub("if (!INSIDE_RUN_FORWARD && pred != null", "if (pred != null")
sub("LINES?.[g] && !BY_EDGES ? runsOf", "LINES?.[g] ? runsOf")
sub("  if (TOPO_SILENT) topo.length = 0\n", "")
sub("if (!NO_EMIT_INVARIANT) for", "for")
sub("TIERS_SWAPPED ? null : (INSERTED", "(INSERTED")
sub("tags: withTags && !(TAGS_OFF_AT === who.split(' ').pop())", "tags: withTags")
sub("!OWN_SKIPS_LIMIT && capAt", "capAt", 2)
sub("const SUB = (rs) => (SUB_SAME_WAY ? rs : revT(rs)), out_ = (w) => (SUB_SAME_WAY ? w > 0 : w < 0)", "const SUB = revT, out_ = (w) => w < 0")
sub("  if (CLOSE_RAW) return asRings(C)\n", "")
sub("if (kind === 'trimmed-arc' && !TRIMMED_ARC_CORNERS) return clipArc", "if (kind === 'trimmed-arc') return clipArc")
sub("!ARC_RAW && prevLine", "prevLine")
sub("if (NO_SLIVER_DROP) return false; ", "")
sub("if (TRIM_INVERTED ? !(d < 0 ? a2 < 0n : a2 > 0n) : (d < 0 ? a2 < 0n : a2 > 0n))", "if (d < 0 ? a2 < 0n : a2 > 0n)")
sub("if (!GAP_BEFORE_LIMIT && capAt(A, B, Xf, u)) continue", "if (capAt(A, B, Xf, u)) continue")
cut("    if (GAP_BEFORE_LIMIT && capAt(A, B, Xf, u)) continue", "    if (GAP_BEFORE_LIMIT && capAt(A, B, Xf, u)) continue")
cut("    if (along <= 0 && FOLDED_QUAD)", "    if (along <= 0 && FOLDED_QUAD)")
sub(" && !NO_FOLD_TRIANGLE)", ")", 2)
sub("!conv && !R_SEPARATE && ", "!conv && ")
sub("if (!MERGE_LEAVES_FIRST && t.g != null", "if (t.g != null")
sub("if (CLAIMANTS_KEPT || !drop.every(offLine))", "if (!drop.every(offLine))")
sub("opposite = (g) => !OPP_STANDINS && Math.sign", "opposite = (g) => Math.sign")
sub("if (F_SLIVER_KEPT) return true; ", "")
sub("nx.length > 1 && !CLAIMANT_ONE_SUCCESSOR && ", "nx.length > 1 && ")
sub("  if (!STAIR_RETAG_OFF) {", "  {")
sub("STAIR_CELL_OFF || elen", "elen")
cut("        if (PREMISE_IGNORED) {", "if (sub && sk.every(q => Math.min(dLine(q, A), dLine(q, B)) <= NODE_BOUND)) { pushArc(AR, 'gap-arc', t); continue } }")

# ── the diagnostics: env switches, dumps, DETAIL, STAGES
cut("    // ⭐ Zob's minimal repro", "if (ids.length && process.env.CUTONCE_REPRO)")
cut("    if (process.env.CUTONCE_TRACE_AT) { const [tx, ty] = process.env.CUTONCE_TRACE_AT.split(',').map(v => +v * SCALE); if (Math.hypot(Xf[0] - tx", "console.log('TRACE-CAP'")
cut("      if (process.env.CUTONCE_DUMP)", "      if (process.env.CUTONCE_DUMP)")
i = s.index("    const par = (L, q) =>"); j = s.index("\n", s.index("    DETAIL.set(X[0] + ',' + X[1]", i)) + 1
if not s[i:j].rstrip().endswith('}) }'): sys.exit('port: the DETAIL line no longer closes the loop')
s = s[:i] + "  }\n" + s[j:]
sub("export const ORIGIN = new Map(), DETAIL = new Map(), INSERTED = new Map()", "const ORIGIN = new Map(), INSERTED = new Map()")
cut("export const STAGES = {}", "export const STAGES = {}")
sub("export const DROPPED = []", "const DROPPED = []")
cut("  STAGES[d < 0 ? 'erode' : 'dilate'] = F.rings", "  STAGES[d < 0 ? 'erode' : 'dilate'] = F.rings")
cut("  // TRACE (diagnostic only, CUTONCE_TRACE_AT=x,y metres)", "console.log(`TRACE ${who} ring")
cut("  if (process.env.CUTONCE_TRACE_AT) { const [tx, ty] = process.env.CUTONCE_TRACE_AT.split(',').map(v => +v * SCALE)\n    OUT.forEach", "console.log(`TRACE-OUT")
cut("  if (process.env.CUTONCE_LOST)", "  if (process.env.CUTONCE_LOST)")
cut("  if (process.env.CUTONCE_TRACE_AT) { const [tx, ty] = process.env.CUTONCE_TRACE_AT.split(',').map(v => +v * SCALE)\n    open.forEach", "console.log(`TRACE-OPEN")
sub("  STAGES.open = open\n", "")
sub("  STAGES.closedK = closedK\n", "")

# ── the parked spike, whole: its comment through backPieces
i = s.index("// ⭐ THE SPIKE (Zob, 2026-10-29)"); j = s.index("export function morph(")
s = s[:i] + s[j:]
# morph: the RAW_CURVE branch goes, the live branch stays
sub("  if (RAW_CURVE) { const raw = region.map((R, g) => rawOffset(R, d, g, (stat.squares ||= []))); F = arrange([raw], w => w[0] > 0, `${who} offset`, true) }   // ⛔ the mutant only\n  else { let pieces = region.flatMap((R, g) => offsetPieces(R, d, g, (stat.squares ||= []), BY_EDGES ? null : lines?.[g], stat))",
    "  { let pieces = region.flatMap((R, g) => offsetPieces(R, d, g, (stat.squares ||= []), lines?.[g], stat))")
sub("  if (BACK_PIECES) return backPieces(F, region, lines, -d, who, stat)\n", "")

# ── the records per call, returned (cand3 defines fresh(), beside partsOf; openAt and closeAt call it themselves)
sub("export function openCloseProvenance(paths, stepM, what) {\n", "export function openCloseCutOnce(paths, stepM, what) {\n  fresh()\n")
sub("  return { paths: toIP(k), rings: k, tags: K.tags, P: Pt, stat, topology: topo, opened: tf.map(pp => +m2(pp).toFixed(3)), closed: ff.map(pp => +m2(pp).toFixed(3)), slivers: { taken: taken.length - tf.length, filled: filled.length - ff.length } }",
    "  return { rings: k, tags: K.tags, P: Pt, stat, topology: topo, taken, filled, tf, ff, origin: new Map(ORIGIN), dropped: DROPPED.slice() }")
sub("export { pieces, area }\n", "export { area, pieces }\n")

# ── tagRun, inlined
t = t[t.index('\n', t.index("import { NODE_BOUND, lineCrossOf, sameLine }")) + 1:]
t = t.replace("export function tagRun(", "function tagRun(")
for old, new in [("{ againstDirection = false, refuseGap = false, noBand = false, twoH = null, lineOf = null } = {}", "{ twoH = null, lineOf = null } = {}"),
                 ("return !noBand && (d < lo || d > hi)", "return d < lo || d > hi")]:
    if t.count(old) != 1: sys.exit(f'port: tagRun: {old[:60]!r}')
    t = t.replace(old, new)
t = '\n'.join(l for l in t.split('\n') if not (l.lstrip().startswith('if (againstDirection)') or l.lstrip().startswith('if (refuseGap)')))
s = s.replace("export function arrange(", t.strip('\n') + "\n\nexport function arrange(", 1)

for bad in ['process.env', 'CUTONCE', 'setX', 'STAGES', 'DETAIL', 'backPieces', 'rawOffset', 'writeFileSync', 'mutant']:
    if bad in s: print(f'port: ⚠ "{bad}" still present:', [l.strip()[:120] for l in s.splitlines() if bad in l][:3])

head = (here / 'port-header.txt').read_text()
(here / '../../cartograph/openClose.mjs').resolve().write_text(head + s)
print('port: cartograph/openClose.mjs', len((head + s).splitlines()), 'lines')
