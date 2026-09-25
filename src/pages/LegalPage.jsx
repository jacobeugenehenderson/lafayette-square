/**
 * LegalPage — standalone pages for /privacy, /terms/courier, /terms/restaurant
 *
 * Regulator-ready URLs that render legal content outside the map context.
 * Visitable by Twilio, Stripe, and TNC reviewers.
 */

import { INSTANCE } from '../instance.js'
import { COPY, NotDeclared } from '../instances/copy/index.jsx'

// ⛔ This installation's legal documents, or none. Never another town's: they were
// hardcoded here until 2026-09-24, so every installation served LS's Missouri terms.
const LEGAL = COPY?.legal ?? null


// ── Shared layout ────────────────────────────────────────────

/**
 * ⛔ A NULL CONTACT MUST NOT RENDER AS A LINK. `mailto:${null}` is the literal
 * string "mailto:null" — a dead link with no error, on the canonical public
 * statement. Three of the four installations have these fields set to null.
 * ⭐ A labelled gap is the honest answer: it is visibly unfinished, so someone
 * fixes it, where a dead link looks finished and nobody ever does. Placeholders
 * are labelled and obvious; never a plausible-looking fake.
 */
function ContactBit({ href, value, display }) {
  if (!value) return <span className="opacity-60">[not set for this installation]</span>
  return <a href={href} className="underline hover:text-[#e0ddd8]/50">{display || value}</a>
}

function LegalShell({ title, subtitle, children }) {
  return (
    <div className="fixed inset-0 bg-[#0a0a0f] text-[#e0ddd8] font-mono overflow-y-auto">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <header className="mb-10">
          <a href="/" className="text-[13px] text-[#e0ddd8]/40 hover:text-[#e0ddd8]/60 transition-colors">&larr; {LEGAL?.homeLabel ?? INSTANCE.domain ?? 'home'}</a>
          <h1 className="text-[22px] font-medium text-[#e0ddd8] mt-4">{title}</h1>
          {subtitle && <p className="text-[14px] text-[#e0ddd8]/50 mt-1">{subtitle}</p>}
        </header>
        <div className="space-y-8">
          {children}
        </div>
        <footer className="mt-16 pt-6 border-t border-[#e0ddd8]/10 text-[12px] text-[#e0ddd8]/30 space-y-1">
          {(LEGAL?.publisherLines ?? []).map((l) => <p key={l}>{l}</p>)}
          <p>Contact: <ContactBit href={`mailto:${INSTANCE.contact.email}`} value={INSTANCE.contact.email} /> · <ContactBit href={`tel:${INSTANCE.cary.smsNumber}`} value={INSTANCE.cary.smsNumber} display={INSTANCE.cary.smsNumberDisplay} /></p>
        </footer>
      </div>
    </div>
  )
}

function AgreementSections({ sections }) {
  return sections.map((section) => (
    <div key={section.title}>
      <h2 className="text-[14px] font-medium text-[#e0ddd8]/90 mb-2">{section.title}</h2>
      <p className="text-[13px] leading-relaxed text-[#e0ddd8]/60">{section.body}</p>
      {section.subsections?.map((sub) => (
        <div key={sub.title} className="mt-3 ml-4">
          <h3 className="text-[13px] font-medium text-[#e0ddd8]/70 mb-1">{sub.title}</h3>
          <p className="text-[13px] leading-relaxed text-[#e0ddd8]/60">{sub.body}</p>
        </div>
      ))}
    </div>
  ))
}

// ── Privacy Page ─────────────────────────────────────────────

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy & Safety" subtitle={LEGAL?.privacySubtitle}>
      {LEGAL ? <LEGAL.PrivacyBody ContactBit={ContactBit} /> : <NotDeclared what="privacy terms" legal />}
    </LegalShell>
  )
}

// ── Courier Terms Page ───────────────────────────────────────

export function CourierTermsPage() {
  return (
    <LegalShell
      title="Courier Independent Contractor Agreement"
      subtitle={LEGAL?.courierSubtitle}
    >
      {LEGAL ? <AgreementSections sections={LEGAL.courierSections} /> : <NotDeclared what="courier agreement" legal />}
    </LegalShell>
  )
}

// ── Restaurant Terms Page ────────────────────────────────────

export function RestaurantTermsPage() {
  return (
    <LegalShell
      title="Restaurant Participation Agreement"
      subtitle={LEGAL?.restaurantSubtitle}
    >
      {LEGAL ? <AgreementSections sections={LEGAL.restaurantSections} /> : <NotDeclared what="restaurant agreement" legal />}
    </LegalShell>
  )
}
