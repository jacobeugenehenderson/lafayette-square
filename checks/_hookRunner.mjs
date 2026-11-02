// _hookRunner.mjs — a minimal model of React's hook ordering, for a check that RUNS a component or a hook without a renderer
// (moved out of claims-a-refusal-is-never-swallowed, 2026-11-01, when a second check needed it).
// What it models: state, refs and memo per instance; effects (useEffect, useLayoutEffect) run after the render that queued
// them, re-run when their deps change, cleaned up before a re-run and on unmount; a state change marks the instance dirty
// and `settle` re-renders it after the microtasks drain; a render that THROWS is recorded (`thrown()`), not propagated.
// What it does not: concurrent features, context (a check stubs useContext), children, and a store's hook form (a zustand
// `useStore(selector)` is answered from getState by the check's prefix: a real hook would also subscribe and re-render). Hooks are read from
// globalThis.__hooks, which a check's importSource prefix forwards to.
export function hookRunner() {
  let cur = null
  const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]))
  globalThis.__hooks = {
    useState(init) { const i = cur, k = i.k++; if (!(k in i.s)) i.s[k] = init; return [i.s[k], (v) => { i.s[k] = v; i.dirty = true }] },
    useMemo(f, deps) { const i = cur, k = i.k++, m = i.m[k]; if (m && same(m.deps, deps)) return m.v; const v = f(); i.m[k] = { deps, v }; return v },
    useEffect(f, deps) { const i = cur, k = i.k++, e = i.e[k]; if (e && same(e.deps, deps)) return; i.after.push(() => { e?.cleanup?.(); i.e[k] = { deps, cleanup: f() } }) },
    useRef(init) { const i = cur, k = i.k++; if (!(k in i.s)) i.s[k] = { current: init }; return i.s[k] },
  }
  globalThis.__hooks.useLayoutEffect = globalThis.__hooks.useEffect
  return (render) => {
    const i = { s: {}, m: {}, e: {}, k: 0, after: [], dirty: false, outs: [] }
    const go = (props) => { cur = i; i.k = 0; i.dirty = false; let out
      try { out = render(props) } catch (e) { cur = null; i.thrown = e; i.after.length = 0; return undefined }
      cur = null; i.outs.push(out); for (const f of i.after.splice(0)) f(); return out }
    return { outs: i.outs, render: go, thrown: () => i.thrown,
      async settle(props) { for (let n = 0; n < 20; n++) { await new Promise((r) => setTimeout(r, 0)); if (i.dirty) go(props) } },
      unmount() { for (const e of Object.values(i.e)) e.cleanup?.() } }
  }
}
