// bootOrRefuse.js — A TOOL PAGE THAT CANNOT OPEN SAYS SO ON SCREEN, WITH THE WAY OUT (2026-10-28, "a message explains or goes
// away": localhost:5173/arborist with no ?look= was a black screen; the refusal, "[instance] ⛔ this page names no town …",
// reached the console only, because it is THROWN while the page's first modules are evaluated, before anything can draw).
// An entry hands its boot here as one async function that imports its modules IN ORDER (placeBootTown first, as before:
// placeBootTown.js); if that throws, the root shows the message and a link to each town in public/looks/index.json, opened
// with ?look=<id>. ⛔ Plain DOM, and nothing here imports instance.js (that import is the throw being shown).
import looksIndex from '../public/looks/index.json' with { type: 'json' }

export async function bootOrRefuse(root, tool, boot) {
  try { await boot() } catch (e) {
    console.error(e)
    const msg = String(e?.message || e)
    const towns = (looksIndex.looks || []).filter(l => l.scene)
    const here = window.location.pathname
    root.replaceChildren()
    const box = document.createElement('div')
    box.setAttribute('role', 'alert')
    box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:32px;background:#1a1a18;color:#f3d9a4;font:14px/1.5 system-ui;text-align:left'
    const inner = document.createElement('div'); inner.style.maxWidth = '640px'
    const h = document.createElement('strong'); h.textContent = `${tool} could not open.`
    const p = document.createElement('p'); p.textContent = msg; p.style.cssText = 'margin:8px 0 16px;color:#e6c98a'
    inner.append(h, p)
    if (/names no town/.test(msg) && towns.length) {
      const lead = document.createElement('div'); lead.textContent = 'Open it for a town:'
      const list = document.createElement('ul'); list.style.cssText = 'margin:6px 0 0 18px'
      for (const l of towns) { const li = document.createElement('li'), a = document.createElement('a')
        a.href = `${here}?look=${encodeURIComponent(l.id)}`; a.textContent = l.name || l.id; a.style.color = '#f3d9a4'
        li.append(a); list.append(li) }
      inner.append(lead, list)
    }
    box.append(inner); root.append(box)
  }
}
