export async function slabFetch(look, rel) {
  const m = globalThis.__mode
  if (m === 'throw') throw new Error('network down')
  const url = `http://x/baked/${look}/${rel}`
  if (m === '404') return { ok: false, status: 404, url }
  const body = m === 'nolist' ? { owed: [] } : { credits: [{ requires: 'attribution', source: 'OpenStreetMap', credit: '© OpenStreetMap contributors' }], owed: [] }
  return { ok: true, status: 200, url, json: async () => body }
}
