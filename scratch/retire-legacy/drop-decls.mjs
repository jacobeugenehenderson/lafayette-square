// drop-decls.mjs <file.js> <name> … — delete the named declarations (a function, or a const/let declarator; a declaration
// whose every declarator is named goes whole) together with the comment block directly above it (contiguous, no blank line
// between). Prints each removed span's first line so the cut can be reviewed. Refuses a name it does not find exactly once.
import fs from 'fs'
import { createRequire } from 'module'
const require = createRequire('/Users/jacobhenderson/Desktop/lafayette-square.nosync/package.json')
const { parse } = require('@babel/parser')
const traverse = require('@babel/traverse').default
const [file, ...names] = process.argv.slice(2)
let src = fs.readFileSync(file, 'utf8')
const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] })
const want = new Set(names), spans = [], found = new Map()
const lineStart = (i) => src.lastIndexOf('\n', i - 1) + 1
const withComments = (node, from) => {
  let s = lineStart(from)
  for (const c of [...(node.leadingComments || [])].reverse()) {
    const gap = src.slice(c.end, s)
    if (/\n[ \t]*\n/.test(gap)) break
    s = lineStart(c.start)
  }
  return s
}
traverse(ast, {
  'FunctionDeclaration|VariableDeclaration|ImportDeclaration'(p) {
    const n = p.node
    if (n.type === 'FunctionDeclaration') {
      if (!want.has(n.id?.name)) return
      found.set(n.id.name, (found.get(n.id.name) || 0) + 1)
      const host = p.parentPath.isExportNamedDeclaration() ? p.parent : n
      spans.push([withComments(host, host.start), host.end, n.id.name])
    } else if (n.type === 'ImportDeclaration') {
      const hit = n.specifiers.filter(s => want.has(s.local.name))
      if (!hit.length) return
      for (const s of hit) found.set(s.local.name, (found.get(s.local.name) || 0) + 1)
      if (hit.length === n.specifiers.length) spans.push([withComments(n, n.start), n.end, hit.map(s => s.local.name).join(',')])
      else for (const s of hit) { const i = n.specifiers.indexOf(s); const e = n.specifiers[i + 1] ? n.specifiers[i + 1].start : s.end
        spans.push([i && !n.specifiers[i + 1] ? n.specifiers[i - 1].end : s.start, e, s.local.name]) }
    } else {
      const hit = n.declarations.filter(d => d.id.type === 'Identifier' && want.has(d.id.name))
      if (!hit.length) return
      for (const d of hit) found.set(d.id.name, (found.get(d.id.name) || 0) + 1)
      if (hit.length === n.declarations.length) spans.push([withComments(n, n.start), n.end, hit.map(d => d.id.name).join(',')])
      else for (const d of hit) { const i = n.declarations.indexOf(d), nx = n.declarations[i + 1]
        spans.push(nx ? [d.start, nx.start, d.id.name] : [n.declarations[i - 1].end, d.end, d.id.name]) }
    }
  },
})
for (const nm of want) if (found.get(nm) !== 1) { console.error(`⛔ ${nm}: found ${found.get(nm) || 0} time(s), not once`); process.exit(2) }
spans.sort((a, b) => b[0] - a[0])
for (const [s, e, nm] of spans) {
  let e2 = e; if (src[e2] === '\n') e2++   // take the line break the declaration ended on
  console.log(`- ${nm}: ${src.slice(s, Math.min(s + 110, e)).split('\n')[0]}  (${src.slice(s, e).split('\n').length} lines)`)
  src = src.slice(0, s) + src.slice(e2)
}
fs.writeFileSync(file, src)
