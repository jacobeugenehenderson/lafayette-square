export function useState(v) { const s = [v, (n) => { globalThis.__states.push(n) }]; return s }
export function useEffect(fn) { fn() }
