// free-ids.mjs <file.js> [--unused] — every identifier the module REFERENCES that no scope binds (a deletion that left a
// reader behind), minus JS/Node/browser globals; with --unused, also every module-level and function-level binding nothing
// reads (what a deletion left without a reader). Read-only; uses the repo's @babel/parser + @babel/traverse.
import fs from 'fs'
import { createRequire } from 'module'
const require = createRequire('/Users/jacobhenderson/Desktop/lafayette-square.nosync/package.json')
const { parse } = require('@babel/parser')
const traverse = require('@babel/traverse').default
const file = process.argv[2], wantUnused = process.argv.includes('--unused')
const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] })
const GLOBALS = new Set(['undefined', 'NaN', 'Infinity', 'Math', 'Number', 'String', 'Boolean', 'Object', 'Array', 'JSON', 'Set', 'Map', 'WeakSet',
  'WeakMap', 'Symbol', 'Error', 'TypeError', 'RangeError', 'Promise', 'Date', 'RegExp', 'console', 'globalThis', 'process', 'performance', 'window',
  'document', 'parseInt', 'parseFloat', 'isFinite', 'isNaN', 'Float32Array', 'Float64Array', 'Int32Array', 'Uint8Array', 'Uint16Array', 'Uint32Array',
  'Int8Array', 'Int16Array', 'ArrayBuffer', 'DataView', 'BigInt', 'Reflect', 'Proxy', 'structuredClone', 'queueMicrotask', 'setTimeout', 'clearTimeout',
  'arguments', 'require', 'module', 'URL', 'TextEncoder', 'TextDecoder', 'fetch', 'Intl', 'encodeURIComponent', 'decodeURIComponent', 'atob', 'btoa'])
const free = new Map(), unused = []
traverse(ast, {
  ReferencedIdentifier(p) {
    const n = p.node.name
    if (p.scope.hasBinding(n, true) || GLOBALS.has(n)) return
    if (p.parentPath.isJSXAttribute() || p.isJSXIdentifier()) return
    if (!free.has(n)) free.set(n, []); free.get(n).push(p.node.loc.start.line)
  },
  Scope(p) {
    if (!wantUnused) return
    for (const [n, b] of Object.entries(p.scope.bindings)) {
      if (b.referenced || b.kind === 'param') continue
      if (b.path.parentPath?.isExportNamedDeclaration?.() || b.path.parentPath?.parentPath?.isExportNamedDeclaration?.()) continue
      unused.push(`${n} (${b.kind}) :${b.identifier.loc.start.line}`)
    }
  },
})
for (const [n, ls] of free) console.log(`FREE ${n} :${ls.slice(0, 6).join(',')}${ls.length > 6 ? ` …+${ls.length - 6}` : ''}`)
if (wantUnused) for (const u of [...new Set(unused)]) console.log(`UNUSED ${u}`)
console.log(`[free-ids] ${file}: ${free.size} free identifier(s)${wantUnused ? `, ${new Set(unused).size} unread binding(s)` : ''}`)
