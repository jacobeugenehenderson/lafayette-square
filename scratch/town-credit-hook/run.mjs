const H = process.argv[2]
const { useSources } = await import(H + '/sources.bundle.mjs')
const warn = console.warn; let warned = []; console.warn = (...a) => warned.push(a.join(' '))
for (const mode of ['ok', '404', 'nolist', 'throw']) {
  globalThis.__mode = mode; globalThis.__states = []; warned = []
  useSources('huron'); await new Promise(r => setTimeout(r, 20))
  const last = globalThis.__states.at(-1)
  warn(`${mode.padEnd(6)} → credits ${last?.credits?.length} · loaded ${last?.loaded} · warn: ${warned[0] || '(none)'}`)
}
try { useSources(undefined); warn('no look → did not throw') } catch (e) { warn('no look → throws: ' + e.message) }
