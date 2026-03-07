import { useEffect, useRef, useCallback } from 'react'
import { create } from 'zustand'
import useCamera from '../hooks/useCamera'

// ── Store ────────────────────────────────────────────────────────────
export const useInfo = create((set) => ({
  open: false,
  section: null, // 'about' | 'guidelines' | 'privacy'
  openTo: (section = 'about') => set({ open: true, section }),
  close: () => set({ open: false, section: null }),
}))

const SECTIONS = [
  { id: 'about', label: 'About' },
  { id: 'guidelines', label: 'Guidelines' },
  { id: 'privacy', label: 'Privacy' },
]

export default function InfoModal() {
  const open = useInfo((s) => s.open)
  const section = useInfo((s) => s.section)
  const close = useInfo((s) => s.close)
  const panelOpen = useCamera((s) => s.panelOpen)
  const panelCollapsedPx = useCamera((s) => s.panelCollapsedPx)
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
      className="absolute top-3 left-3 right-3 bg-surface-glass backdrop-blur-2xl backdrop-saturate-150 rounded-2xl text-on-surface shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-outline overflow-hidden flex flex-col z-50"
      style={{
        fontFamily: 'ui-monospace, monospace',
        bottom: panelOpen ? 'calc(35dvh - 1.5rem + 18px)' : `${(panelCollapsedPx || 76) + 18}px`,
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
            <div className="space-y-3 text-body-sm text-on-surface-variant leading-relaxed">
              <p>Lafayette-Square.com is an independent project created by a neighbor for neighbors.</p>
              <p>It is not affiliated with any company, advertiser, or government entity, and it is not funded by grants or sponsorships. The goal is simple: to celebrate and document one of the most extraordinary neighborhoods in America while building tools that help our community stay connected and resilient.</p>
              <p>The site includes several systems designed for everyday neighborhood life:</p>
              <ul className="list-disc list-outside ml-5 space-y-1">
                <li><strong className="text-on-surface-medium">The Almanac</strong> — live connections to weather and astronomical services, providing daily environmental context for the Square.</li>
                <li><strong className="text-on-surface-medium">The Community Bulletin Board</strong> — a place to share announcements, ideas, offers, and requests with neighbors.</li>
                <li><strong className="text-on-surface-medium">The Property Atlas</strong> — listings for all ~1,000 buildings in Lafayette Square, forming the foundation of a shared historical and architectural record.</li>
              </ul>
              <p>The map also includes a carefully modeled version of Lafayette Park itself, with trees placed in their real-world locations and tagged with their actual species. One of the major goals of the project is to continue developing the park portion of the map as a living record of the extraordinary volunteer work that maintains it — including the efforts of neighbors and the Lafayette Square Conservancy.</p>
              <p>As the system grows, park spaces will function just like other places in the neighborhood, allowing community activities and events to be listed directly within the park itself.</p>
              <p>Over time, the hope is that neighbors will contribute stories, photos, and knowledge so that the site becomes a living digital twin of Lafayette Square — a collective record of the place we share.</p>
              <p>Eventually, the goal is not just a website but a tool that helps move activity from the internet back into real neighborhood life.</p>
              <p>Everything here is free to use. Anyone in Lafayette Square — residents, businesses, caretakers, and friends of the neighborhood — is welcome to post announcements, highlight local projects, promote events, or share useful information.</p>
              <p>With a neighborhood of roughly 2,000 residents, even a simple message can reach the people who matter most: your neighbors.</p>
              <p className="text-on-surface-subtle italic">Cities are ultimately made of people, memory, and shared space. This project is an attempt to honor all three in Lafayette Square.</p>
            </div>
          </section>

          <div className="border-t border-outline-variant" />

          {/* ── Community Guidelines & Moderation ── */}
          <section ref={(el) => (sectionRefs.current.guidelines = el)}>
            <h2 className="text-body font-semibold text-amber-300/80 tracking-wide uppercase mb-4 pl-3 border-l-2 border-amber-400/40">Community Guidelines & Moderation</h2>
            <div className="space-y-3 text-body-sm text-on-surface-variant leading-relaxed">
              <p>This project is operated by a single individual and provided free of charge to the community.</p>
              <p>Because of that, moderation is intentionally simple.</p>
              <p>The goal is to maintain a neighborly, respectful space that reflects the spirit of Lafayette Square.</p>
              <p>Posts may be removed if they include:</p>
              <ul className="list-disc list-outside ml-5 space-y-1">
                <li>harassment or abusive behavior</li>
                <li>personal attacks</li>
                <li>discrimination or hate speech</li>
                <li>scams or deceptive activity</li>
                <li>spam or excessive promotion</li>
                <li>anything that undermines the safety or trust of the community</li>
              </ul>
              <p>Moderation decisions are made at the sole discretion of the site operator.</p>
              <p>If a post is removed repeatedly, posting privileges may be revoked.</p>
              <p className="text-on-surface-medium font-medium">A general guideline:</p>
              <p className="italic text-on-surface-subtle">If you wouldn't say it to someone on the sidewalk in Lafayette Square, don't post it here.</p>
              <p>If you encounter a post that violates these guidelines, you may flag it by contacting me directly.</p>
            </div>
          </section>

          <div className="border-t border-outline-variant" />

          {/* ── Privacy & Safety ── */}
          <section ref={(el) => (sectionRefs.current.privacy = el)}>
            <h2 className="text-body font-semibold text-amber-300/80 tracking-wide uppercase mb-4 pl-3 border-l-2 border-amber-400/40">Privacy & Safety</h2>
            <div className="space-y-3 text-body-sm text-on-surface-variant leading-relaxed">
              <p>This project is designed with privacy in mind.</p>
              <p>Users of Lafayette-Square.com appear within the system as Townies, represented only by emoji-based identities. These identities are intentionally simple and are not connected to real names or personal information within the platform.</p>
              <p>Some Townies may choose to claim a Place within the neighborhood map. When this happens, they become the Guardian of that specific Place.</p>
              <p>Guardianship is local to that Place only. Outside of their own Place, a Guardian appears exactly the same as any other Townie. Other users cannot see who is or is not a Guardian elsewhere in the neighborhood.</p>
              <p>This structure allows neighbors to help care for the information associated with particular locations without creating visible hierarchies or permanent personal profiles.</p>

              <h3 className="text-body-sm font-semibold text-on-surface-medium tracking-wide uppercase mt-5">Protecting Your Privacy</h3>
              <p>Users are encouraged to keep their participation anonymous within the app, even if they are the real-world resident, owner, or steward of a Place.</p>
              <p>For your own privacy and safety, please avoid including personally identifiable information such as:</p>
              <ul className="list-disc list-outside ml-5 space-y-1">
                <li>full names</li>
                <li>home addresses</li>
                <li>phone numbers</li>
                <li>email addresses</li>
                <li>other details that could link your account to your real-world identity</li>
              </ul>
              <p>The goal is to allow neighbors to interact and share information without creating permanent digital identities tied to real people.</p>

              <h3 className="text-body-sm font-semibold text-on-surface-medium tracking-wide uppercase mt-5">Real-World Interaction</h3>
              <p>Some posts on the Community Bulletin Board may involve exchanging items, meeting neighbors, or participating in activities.</p>
              <p>If you plan to meet someone in person, please use common-sense precautions. Consider meeting in public or neutral locations, such as:</p>
              <ul className="list-disc list-outside ml-5 space-y-1">
                <li>Lafayette Park</li>
                <li>neighborhood cafes or businesses</li>
                <li>other well-trafficked areas</li>
              </ul>
              <p>This project does not verify identities and cannot guarantee the behavior of participants.</p>
              <p>As with any online platform, please exercise reasonable judgment when interacting with others.</p>

              <h3 className="text-body-sm font-semibold text-on-surface-medium tracking-wide uppercase mt-5">Data Philosophy</h3>
              <p>This site is intentionally designed to collect as little personal data as possible.</p>
              <p>The goal is to support neighborly communication without surveillance or data extraction.</p>
              <p>Participation should feel lightweight, safe, and respectful of everyone's privacy.</p>
            </div>
          </section>

          {/* Bottom padding so last section can scroll to top */}
          <div className="h-[40vh]" />
        </div>
      </div>
    </div>
  )
}
