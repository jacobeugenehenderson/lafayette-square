// prep.mjs — writes the paint-only gate copies of bake-ground from the SOURCE (each edit asserted to match exactly once):
// bake-ground.HEAD.js (the main tree's) and bake-ground.r1.js (this branch's). Each stamps every console line with the
// seconds since start (Brace's paint-only kit) and, right after the paint stack, writes every group's flattened items
// to $FLATTEN_DUMP (JSON, { groupKey: [{ outer, holes }] } in metres, as the bake holds them) and exits.   node prep.mjs
import { readFileSync, writeFileSync } from 'fs'
const W = new URL('./', import.meta.url).pathname, MAIN = '/Users/jacobhenderson/Desktop/lafayette-square.nosync/'
const once = (src, a, b, what) => { if (src.split(a).length !== 2) throw new Error(`prep: ${what} — the anchor is not found exactly once`); return src.replace(a, b) }
const stamp = `const __t0 = Date.now(), __ol = console.log.bind(console), __ow = console.warn.bind(console)
console.log = (...a) => __ol(\`[+\${((Date.now() - __t0) / 1000).toFixed(1)}s]\`, ...a)
console.warn = (...a) => __ow(\`[+\${((Date.now() - __t0) / 1000).toFixed(1)}s]\`, ...a)
`
const anchor = "    + `(${KEEP_OWN_SLOT.size} keeping their own slot, ${DOES_NOT_CUT.size} not cutting) in ${((Date.now() - _t0) / 1000).toFixed(1)}s`)\n"
const hook = anchor + `  // ⚠️ FLATTEN-R1 GATE COPY (prep.mjs): every group's flattened items, then exit before anything is meshed
  writeFileSync(process.env.FLATTEN_DUMP, JSON.stringify(Object.fromEntries(flattened))); console.log('[flatten-r1-gate] dumped ' + process.env.FLATTEN_DUMP); process.exit(0)
`
for (const [tag, src] of [['HEAD', MAIN + 'cartograph/bake-ground.js'], ['r1', W + '../../../cartograph/bake-ground.js']])
  writeFileSync(W + `bake-ground.${tag}.js`, stamp + once(readFileSync(src, 'utf8'), anchor, hook, `${tag}: the paint-stack log line`))
// bake-ground.inputs.js: HEAD's, and also each step named in $PAINT_DUMP_KEYS (comma list) has its raw inputs — mine (the
// layer's own paths, the subject, EvenOdd) and acc (the union ABOVE it, the clip, NonZero), clipper integer units — kept
// and written beside the flatten dump as { key: { mine, acc } } to $INPUTS_DUMP.
{ let src = once(readFileSync(MAIN + 'cartograph/bake-ground.js', 'utf8'), anchor, hook.replace("writeFileSync(process.env.FLATTEN_DUMP", "writeFileSync(process.env.INPUTS_DUMP, JSON.stringify(globalThis.__inputs)); writeFileSync(process.env.FLATTEN_DUMP"), 'inputs: the paint-stack log line')
  src = once(src, "    if (!mine.length) { out.set(e.groupKey, []); continue }\n",
    "    if (!mine.length) { out.set(e.groupKey, []); continue }\n    if ((process.env.PAINT_DUMP_KEYS || '').split(',').includes(e.groupKey)) (globalThis.__inputs ||= {})[e.groupKey] = { mine: mine.map(q => q.map(p => [p.X, p.Y])), acc: acc.map(q => q.map(p => [p.X, p.Y])) }\n", 'inputs: the flatten\'s empty-layer line')
  writeFileSync(W + 'bake-ground.inputs.js', stamp + src) }
console.log('[prep] bake-ground.HEAD.js + bake-ground.r1.js + bake-ground.inputs.js written')
