import { useEffect, useRef, useCallback } from 'react'
import { create } from 'zustand'
import useCamera from '../hooks/useCamera'
import { useSources } from '../lib/sources.js'
import { COPY, NotDeclared } from '../instances/copy/index.jsx'

// ── Store ────────────────────────────────────────────────────────────
export const useInfo = create((set) => ({
  open: false,
  section: null, // 'about' | 'guidelines' | 'privacy' | 'sources'
  openTo: (section = 'about') => set({ open: true, section }),
  close: () => set({ open: false, section: null }),
}))

const SECTIONS = [
  { id: 'about', label: 'About' },
  { id: 'guidelines', label: 'Guidelines' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'sources', label: 'Sources' },
]

export default function InfoModal() {
  const open = useInfo((s) => s.open)
  const section = useInfo((s) => s.section)
  const close = useInfo((s) => s.close)
  const panelCollapsedPx = useCamera((s) => s.panelCollapsedPx)
  // Per-look, straight off the slab. Never a list in this file.
  const { credits, owed, loaded: sourcesLoaded } = useSources()
  const scrollRef = useRef(null)
  const sectionRefs = useRef({})
  const observerRef = useRef(null)
  const tabBarRef = useRef(null)

  // Scroll to requested section on open
  useEffect(() => {
    if (!open || !section) return
    const tid = setTimeout(() => {
      const el = sectionRefs.current[section]
      if (el && scrollRef.current) {
        const top = el.getBoundingClientRect().top - scrollRef.current.getBoundingClientRect().top + scrollRef.current.scrollTop - 24
        scrollRef.current.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      }
    }, 50)
    return () => clearTimeout(tid)
  }, [open, section])

  // IntersectionObserver to highlight active tab on scroll
  const setActiveTab = useCallback((id) => {
    SECTIONS.forEach((s) => {
      const tab = document.getElementById(`info-tab-${s.id}`)
      if (!tab) return
      if (s.id === id) {
        tab.dataset.active = 'true'
      } else {
        delete tab.dataset.active
      }
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const container = scrollRef.current
    if (!container) return

    const tabH = tabBarRef.current?.offsetHeight || 48

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const s of SECTIONS) {
          const el = sectionRefs.current[s.id]
          if (!el) continue
          const entry = entries.find((e) => e.target === el)
          if (entry?.isIntersecting) {
            setActiveTab(s.id)
            return
          }
        }
        for (const s of SECTIONS) {
          const el = sectionRefs.current[s.id]
          if (!el) continue
          const rect = el.getBoundingClientRect()
          if (rect.top < window.innerHeight * 0.5) {
            setActiveTab(s.id)
          }
        }
      },
      { root: container, rootMargin: `-${tabH}px 0px 0px 0px`, threshold: 0 }
    )

    SECTIONS.forEach((s) => {
      const el = sectionRefs.current[s.id]
      if (el) observerRef.current.observe(el)
    })

    return () => observerRef.current?.disconnect()
  }, [open, setActiveTab])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, close])

  if (!open) return null

  const scrollToSection = (id) => {
    const el = sectionRefs.current[id]
    if (el && scrollRef.current) {
      const top = el.getBoundingClientRect().top - scrollRef.current.getBoundingClientRect().top + scrollRef.current.scrollTop - 24
      scrollRef.current.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="absolute top-3 left-3 right-3 bg-surface-glass backdrop-blur-2xl backdrop-saturate-150 rounded-2xl text-on-surface shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-outline overflow-hidden flex flex-col z-50 font-mono"
      style={{
        bottom: `${(panelCollapsedPx || 76) + 18}px`,
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center px-4 py-3 border-b border-outline-variant flex-shrink-0">
        {/* Section tabs */}
        <nav ref={tabBarRef} className="flex-1 flex gap-4">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              id={`info-tab-${s.id}`}
              data-active={section === s.id ? 'true' : undefined}
              onClick={() => scrollToSection(s.id)}
              className="text-label-sm uppercase tracking-widest text-on-surface-disabled transition-colors data-[active]:text-on-surface hover:text-on-surface-subtle"
            >
              {s.label}
            </button>
          ))}
        </nav>
        {/* Close */}
        <button
          onClick={close}
          className="w-9 h-9 rounded-full backdrop-blur-md bg-rose-500/20 border border-rose-400/40 text-rose-300 transition-all duration-200 flex items-center justify-center hover:bg-rose-500/30"
          title="Close"
          aria-label="Close"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-xl mx-auto px-5 py-6 space-y-10">

          {/* ── About ── */}
          <section ref={(el) => (sectionRefs.current.about = el)}>
            <h2 className="text-body font-semibold text-amber-300/80 tracking-wide uppercase mb-4 pl-3 border-l-2 border-amber-400/40">About</h2>
            {COPY?.about ?? <NotDeclared what="About text" />}
          </section>

          <div className="border-t border-outline-variant" />

          {/* ── Community Guidelines & Moderation ── */}
          <section ref={(el) => (sectionRefs.current.guidelines = el)}>
            <h2 className="text-body font-semibold text-amber-300/80 tracking-wide uppercase mb-4 pl-3 border-l-2 border-amber-400/40">Community Guidelines & Moderation</h2>
            {COPY?.guidelines ?? <NotDeclared what="community guidelines" />}
          </section>

          <div className="border-t border-outline-variant" />

          {/* ── Privacy & Safety ── */}
          <section ref={(el) => (sectionRefs.current.privacy = el)}>
            <h2 className="text-body font-semibold text-amber-300/80 tracking-wide uppercase mb-4 pl-3 border-l-2 border-amber-400/40">Privacy & Safety</h2>
            {COPY?.privacy ?? <NotDeclared what="privacy text" />}
          </section>

          <div className="border-t border-outline-variant" />

          {/* ── Sources ──
              The receipt for the claim the About section makes: the inputs are
              real, not guessed. Also the legal surface — OpenStreetMap's data is
              ODbL and a rendered map is a Produced Work, so the notice has to
              name the database and the licence, and a visitor has to be able to
              reach it. The credit line in the panel footer links here.

              ⛔ EVERY ROW BELOW COMES FROM THE SLAB. Do not hardcode a source
              here "just for Lafayette Square" — this component renders for every
              installation, and the next town's providers are not this one's. */}
          <section ref={(el) => (sectionRefs.current.sources = el)}>
            <h2 className="text-body font-semibold text-amber-300/80 tracking-wide uppercase mb-4 pl-3 border-l-2 border-amber-400/40">Sources</h2>
            <div className="space-y-3 text-body-sm text-on-surface-variant leading-relaxed">
              <p>This map is built from public data, block by block — not from a generic city model. These are the datasets it was poured from.</p>

              {!sourcesLoaded && <p className="text-on-surface-disabled">Loading…</p>}

              {sourcesLoaded && credits.length === 0 && (
                /* Empty-asset safe: a visible to-do, never a crash and never
                   another town's credits. */
                <p className="text-on-surface-disabled">—&nbsp; No sources recorded for this map yet.</p>
              )}

              {credits.map((c) => (
                <div key={c.source} className="pl-3 border-l border-outline-variant py-1">
                  <div className="text-on-surface">
                    {c.sourceUrl
                      ? <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-amber-200">{c.source}</a>
                      : c.source}
                  </div>
                  <div className="text-on-surface-disabled">
                    {/* ODbL §4.3 wants the database and the licence both named and
                        both linked. CDLA asks instead that the terms be reachable —
                        a link to the licence text is what satisfies it. */}
                    {c.requires === 'attribution' ? 'Made available under ' : 'Licensed under '}
                    {c.licenceUrl
                      ? <a href={c.licenceUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-amber-200">{c.licence}</a>
                      : c.licence}
                  </div>
                </div>
              ))}

              {owed.length > 0 && (
                /* Honest about what we cannot state. An input whose terms were
                   never recorded is shown as outstanding rather than quietly
                   omitted or, far worse, given a guessed licence.
                   ⛔ An AGGREGATED source can owe several debts from ONE row —
                   Overture Places stamps a contributing dataset per record, and
                   two of them are on nobody's attribution page. Naming the
                   dataset is what stops those rendering as the same label twice,
                   which reads as a display bug rather than as two real debts. */
                <p className="text-on-surface-disabled pt-1">
                  {owed.length} further input{owed.length === 1 ? '' : 's'} ({owed.map(o => o.dataset ? `${o.label} — ${o.dataset}` : o.label).join(', ')}) {owed.length === 1 ? 'is' : 'are'} pending a recorded licence and {owed.length === 1 ? 'is' : 'are'} not credited above.
                </p>
              )}
            </div>
          </section>

          {/* Bottom padding so the last section can scroll to TOP — which is what
              makes tab-clicking land correctly and the active-tab highlight agree
              with what you are looking at. It must exceed the viewport minus the
              SHORTEST final section, so it was sized against Privacy (long) and
              became too small the moment Sources (short) went last: clicking
              Sources hit max scroll, left it mid-view, and the observer then read
              Privacy as active. */}
          <div className="h-[70vh]" />
        </div>
      </div>
    </div>
  )
}
