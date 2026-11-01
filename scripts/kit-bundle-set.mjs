/**
 * kit-bundle-set.mjs — which files the kit bundle ships: every `kitUrl(` call site's literal path, matched against the files
 * git tracks under public/. Pure; the caller is publish-kit-bundle.mjs (which reads both inputs from git at one commit), and
 * checks/claims-the-kit-bundle-names-no-town.mjs runs the same two functions on the working tree.
 */

/** `git grep -n` lines, 'file:line:text' → { wants: Map(path or dir prefix → call sites), unreadable: [site] }. */
export function kitWants(lines) {
  const wants = new Map(), unreadable = []
  for (const line of lines) {
    const [, file, ln, text] = line.match(/^([^:]+):(\d+):(.*)$/) || []
    if (!file || file === 'src/lib/kitUrl.js' || /^\s*(\*|\/\/)/.test(text)) continue
    for (const m of text.matchAll(/kitUrl\(\s*(?:'([^']*)'|"([^"]*)"|`([^`$]*)(\$\{)?[^`]*`|([^)]*))/g)) {
      const lit = m[1] ?? m[2] ?? m[3]
      if (lit == null || (m[4] && !lit.endsWith('/'))) { unreadable.push(`${file}:${ln}: ${text.trim()}`); continue }
      wants.set(lit, [...(wants.get(lit) || []), `${file}:${ln}`])
    }
  }
  return { wants, unreadable }
}

/** wants × tracked [{ rel, … }] → { files: Map(rel → tracked entry), unmatched: [[want, sites]] }. */
export function kitBundleFiles(wants, tracked) {
  const files = new Map(), unmatched = []
  for (const [want, sites] of wants) {
    const matched = tracked.filter((f) => (want.endsWith('/') ? f.rel.startsWith(want) : f.rel === want))
    if (!matched.length) unmatched.push([want, sites])
    for (const f of matched) files.set(f.rel, f)
  }
  return { files, unmatched }
}
