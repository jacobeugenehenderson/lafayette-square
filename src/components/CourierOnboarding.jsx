/**
 * Cary — Courier Onboarding Wizard
 *
 * Multi-step pipeline rendered inside CourierDashboard for non-active couriers.
 * Each step calls the onboarding edge function and advances on success.
 *
 * Unified pipeline (Domino's-style):
 *   Deliver zone: Account → Identity → Agreement
 *   Drive zone:   License → Background → Insurance → Vehicle
 *
 * Everyone starts on Deliver. Drive is a graduation, not a separate product.
 */

import { useState, useCallback } from 'react'
import useCary from '../hooks/useCary'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]

const VEHICLE_TYPES = [
  { id: 'car', label: 'Car' },
  { id: 'bike', label: 'Bicycle' },
  { id: 'ebike', label: 'E-bike' },
  { id: 'scooter', label: 'Scooter' },
  { id: 'on_foot', label: 'On foot' },
]

// ── Unified Pipeline ──────────────────────────────────────────

export const PIPELINE = [
  {
    key: 'account',
    label: 'Account',
    zone: 'deliver',
    summary: 'Phone verification and profile. We use your number for sign-in and delivery notifications only.',
  },
  {
    key: 'identity',
    label: 'Identity',
    zone: 'deliver',
    summary: 'Verified by Stripe, not by Cary. We receive pass/fail and your age. Your ID image never touches our servers.',
  },
  {
    key: 'agreement',
    label: 'Agreement',
    zone: 'deliver',
    summary: 'Independent contractor terms. You keep your credentials. 75% of the 22% service charge is yours, plus 100% of tips.',
  },
  {
    key: 'license',
    label: 'License',
    zone: 'drive',
    summary: 'We verify your driving record but never store your license number. Only the state and expiration are recorded.',
  },
  {
    key: 'background',
    label: 'Background',
    zone: 'drive',
    summary: 'Performed by Checkr — criminal history, sex offender registry, and driving record. ~$40 at cost, 1-3 business days.',
  },
  {
    key: 'insurance',
    label: 'Insurance',
    zone: 'drive',
    summary: 'Required for motor vehicles. We store only the verification status and expiry date — the document stays with you.',
  },
  {
    key: 'vehicle',
    label: 'Vehicle',
    zone: 'drive',
    summary: 'Basic registration info. Make, model, year, and plate for motor vehicles.',
  },
]

// ── Pipeline Tracker (vertical accordion) ─────────────────────

export function PipelineTracker({ currentStep, tier, completedSteps, expandedStep, onToggle, stepContent }) {
  return (
    <div className="relative ml-3 border-l border-outline pl-4">
      {PIPELINE.map((step, i) => {
        const done = completedSteps.has(step.key)
        const active = step.key === currentStep
        const locked = step.zone === 'drive' && tier !== 'drive'
        const expanded = step.key === expandedStep
        const isLast = i === PIPELINE.length - 1

        return (
          <div key={step.key} className={`relative ${isLast ? '' : 'pb-4'}`}>
            {/* Timeline dot — centered on the border-l line */}
            <div className={`absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full ${
              done ? 'bg-emerald-400'
                : active ? 'bg-on-surface'
                : locked ? 'bg-neutral-700'
                : 'bg-neutral-600'
            }`} />

            {/* Step header */}
            <button
              onClick={() => onToggle(expanded ? null : step.key)}
              className="w-full flex items-center gap-2 text-left -mt-0.5"
            >
              <span className={`text-body flex-1 transition-colors ${
                done ? 'text-emerald-400 font-medium'
                  : active ? 'text-on-surface font-medium'
                  : locked ? 'text-neutral-600'
                  : 'text-on-surface-disabled'
              }`}>
                {step.label}
              </span>

              <svg
                className={`w-3 h-3 transition-transform text-on-surface-subtle ${expanded ? 'rotate-90' : ''}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Expanded content */}
            {expanded && (
              <div className="mt-2 space-y-3">
                <p className="text-[12px] leading-relaxed text-on-surface-subtle">
                  {step.summary}
                </p>
                {active && stepContent}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step: Identity ──────────────────────────────────────────

function IdentityStep({ onNext, preview }) {
  const { onboardingAction, loading, error } = useCary()

  const handleStart = useCallback(async () => {
    if (preview) { onNext(); return }
    const result = await onboardingAction('start_identity')
    if (result?.verification_url) {
      window.open(result.verification_url, '_blank')
      onNext()
    }
  }, [onboardingAction, onNext, preview])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-body font-medium text-on-surface">Identity verification</h3>
        <p className="text-body-sm text-on-surface-variant mt-1">
          Upload a government ID and take a selfie. This confirms you are who you say you are.
        </p>
      </div>
      <div className="rounded-lg bg-surface-container border border-outline-variant px-3 py-2.5 text-body-sm text-on-surface-subtle space-y-1">
        <p>You'll need:</p>
        <ul className="list-disc list-inside space-y-0.5 text-on-surface-variant">
          <li>Valid government-issued photo ID</li>
          <li>A well-lit space for a selfie</li>
        </ul>
      </div>
      <div className="rounded-lg bg-surface-container border border-outline-variant px-3 py-2.5 text-[12px] leading-relaxed text-on-surface-subtle space-y-1.5">
        <p className="text-on-surface-variant font-medium">How we handle your data</p>
        <p>Verification is performed by Stripe Identity, not by Cary. Your ID image is processed by Stripe and never stored on our servers. Cary receives only a pass/fail result and your verified age.</p>
        <p>This credential belongs to you. If you ever leave the platform, your verification history is yours — we don't hold it hostage.</p>
      </div>
      <button
        onClick={handleStart}
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-on-surface text-surface font-medium text-body transition-colors hover:bg-on-surface-medium disabled:opacity-40"
      >
        {loading ? 'Starting...' : 'Begin verification'}
      </button>
      {error && <p className="text-caption text-rose-400">{error}</p>}
    </div>
  )
}

// ── Step: License ───────────────────────────────────────────

function LicenseStep({ onNext, preview }) {
  const { onboardingAction, loading, error } = useCary()
  const [state, setState] = useState('MO')
  const [expiry, setExpiry] = useState('')

  const handleSubmit = useCallback(async () => {
    if (preview) { onNext(); return }
    if (!expiry) return
    const result = await onboardingAction('submit_license', {
      license_state: state,
      license_expiry: expiry,
    })
    if (result) onNext()
  }, [state, expiry, onboardingAction, onNext, preview])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-body font-medium text-on-surface">Driver license</h3>
        <p className="text-body-sm text-on-surface-variant mt-1">
          We verify your driving record as part of the background check. We do not store your license number.
        </p>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-caption text-on-surface-subtle block mb-1">State</label>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-full rounded-lg bg-surface-container border border-outline-variant px-3 py-2 text-body text-on-surface focus:outline-none focus:border-on-surface-subtle"
          >
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-caption text-on-surface-subtle block mb-1">Expiration date</label>
          <input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="w-full rounded-lg bg-surface-container border border-outline-variant px-3 py-2 text-body text-on-surface focus:outline-none focus:border-on-surface-subtle"
          />
        </div>
      </div>
      <button
        onClick={handleSubmit}
        disabled={loading || !expiry}
        className="w-full py-2.5 rounded-xl bg-on-surface text-surface font-medium text-body transition-colors hover:bg-on-surface-medium disabled:opacity-40"
      >
        {loading ? 'Saving...' : 'Continue'}
      </button>
      {error && <p className="text-caption text-rose-400">{error}</p>}
    </div>
  )
}

// ── Step: Background ────────────────────────────────────────

function BackgroundStep({ onNext, preview }) {
  const { onboardingAction, loading, error } = useCary()

  const handleStart = useCallback(async () => {
    if (preview) { onNext(); return }
    const result = await onboardingAction('start_background')
    if (result?.invitation_url) {
      window.open(result.invitation_url, '_blank')
    }
    if (result) onNext()
  }, [onboardingAction, onNext, preview])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-body font-medium text-on-surface">Background check</h3>
        <p className="text-body-sm text-on-surface-variant mt-1">
          A comprehensive check including criminal history, national sex offender registry, and driving record.
        </p>
      </div>
      <div className="rounded-lg bg-surface-container border border-outline-variant px-3 py-2.5 text-body-sm space-y-1">
        <div className="flex justify-between text-on-surface-variant">
          <span>Provider</span>
          <span className="text-on-surface">Checkr</span>
        </div>
        <div className="flex justify-between text-on-surface-variant">
          <span>Cost</span>
          <span className="text-on-surface">~$40 (at cost)</span>
        </div>
        <div className="flex justify-between text-on-surface-variant">
          <span>Turnaround</span>
          <span className="text-on-surface">1-3 business days</span>
        </div>
      </div>
      <p className="text-caption text-on-surface-subtle">
        You'll receive an email from Checkr to complete the check. Results are sent directly to Cary.
      </p>
      <button
        onClick={handleStart}
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-on-surface text-surface font-medium text-body transition-colors hover:bg-on-surface-medium disabled:opacity-40"
      >
        {loading ? 'Starting...' : 'Start background check'}
      </button>
      {error && <p className="text-caption text-rose-400">{error}</p>}
    </div>
  )
}

// ── Step: Insurance ─────────────────────────────────────────

function InsuranceStep({ onNext, vehicleType, preview }) {
  const { onboardingAction, loading, error } = useCary()
  const [expiry, setExpiry] = useState('')

  // Non-motor vehicles skip insurance
  const skipInsurance = vehicleType === 'bike' || vehicleType === 'on_foot'

  const handleSubmit = useCallback(async () => {
    if (preview) { onNext(); return }
    if (!expiry && !skipInsurance) return
    const result = await onboardingAction('submit_insurance', {
      insurance_expiry: skipInsurance ? '2099-12-31' : expiry,
    })
    if (result) onNext()
  }, [expiry, skipInsurance, onboardingAction, onNext, preview])

  if (skipInsurance) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-body font-medium text-on-surface">Insurance</h3>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Auto insurance is not required for bicycle and on-foot couriers.
          </p>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-on-surface text-surface font-medium text-body transition-colors hover:bg-on-surface-medium disabled:opacity-40"
        >
          {loading ? 'Saving...' : 'Continue'}
        </button>
        {error && <p className="text-caption text-rose-400">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-body font-medium text-on-surface">Auto insurance</h3>
        <p className="text-body-sm text-on-surface-variant mt-1">
          Verify your active auto insurance policy. We only record the expiration date.
        </p>
      </div>
      <div>
        <label className="text-caption text-on-surface-subtle block mb-1">Policy expiration date</label>
        <input
          type="date"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="w-full rounded-lg bg-surface-container border border-outline-variant px-3 py-2 text-body text-on-surface focus:outline-none focus:border-on-surface-subtle"
        />
      </div>
      <p className="text-caption text-on-surface-subtle">
        Your insurance document stays with you. Cary stores only the verification status and expiry date.
      </p>
      <button
        onClick={handleSubmit}
        disabled={loading || !expiry}
        className="w-full py-2.5 rounded-xl bg-on-surface text-surface font-medium text-body transition-colors hover:bg-on-surface-medium disabled:opacity-40"
      >
        {loading ? 'Saving...' : 'Continue'}
      </button>
      {error && <p className="text-caption text-rose-400">{error}</p>}
    </div>
  )
}

// ── Step: Vehicle ───────────────────────────────────────────

function VehicleStep({ onNext, vehicleType, preview }) {
  const { onboardingAction, loading, error } = useCary()
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [plate, setPlate] = useState('')
  const [regExpiry, setRegExpiry] = useState('')

  const isMotorVehicle = vehicleType === 'car' || vehicleType === 'scooter'

  const handleSubmit = useCallback(async () => {
    if (preview) { onNext(); return }
    if (!make.trim() || !model.trim() || !year) return
    const result = await onboardingAction('submit_vehicle', {
      vehicle_make: make.trim(),
      vehicle_model: model.trim(),
      vehicle_year: parseInt(year, 10),
      license_plate: plate.trim() || null,
      registration_expiry: regExpiry || null,
    })
    if (result) onNext()
  }, [make, model, year, plate, regExpiry, onboardingAction, onNext, preview])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-body font-medium text-on-surface">Vehicle registration</h3>
        <p className="text-body-sm text-on-surface-variant mt-1">
          Tell us about your {vehicleType === 'on_foot' ? 'mode of transport' : vehicleType || 'vehicle'}.
        </p>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-caption text-on-surface-subtle block mb-1">Make</label>
            <input
              type="text"
              value={make}
              onChange={(e) => setMake(e.target.value)}
              placeholder="Toyota"
              className="w-full rounded-lg bg-surface-container border border-outline-variant px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled focus:outline-none focus:border-on-surface-subtle"
            />
          </div>
          <div>
            <label className="text-caption text-on-surface-subtle block mb-1">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Camry"
              className="w-full rounded-lg bg-surface-container border border-outline-variant px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled focus:outline-none focus:border-on-surface-subtle"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-caption text-on-surface-subtle block mb-1">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2020"
              min="1990"
              max="2030"
              className="w-full rounded-lg bg-surface-container border border-outline-variant px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled focus:outline-none focus:border-on-surface-subtle"
            />
          </div>
          {isMotorVehicle && (
            <div>
              <label className="text-caption text-on-surface-subtle block mb-1">License plate</label>
              <input
                type="text"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="ABC 1234"
                className="w-full rounded-lg bg-surface-container border border-outline-variant px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled focus:outline-none focus:border-on-surface-subtle"
              />
            </div>
          )}
        </div>
        {isMotorVehicle && (
          <div>
            <label className="text-caption text-on-surface-subtle block mb-1">Registration expiration</label>
            <input
              type="date"
              value={regExpiry}
              onChange={(e) => setRegExpiry(e.target.value)}
              className="w-full rounded-lg bg-surface-container border border-outline-variant px-3 py-2 text-body text-on-surface focus:outline-none focus:border-on-surface-subtle"
            />
          </div>
        )}
      </div>
      <button
        onClick={handleSubmit}
        disabled={loading || !make.trim() || !model.trim() || !year}
        className="w-full py-2.5 rounded-xl bg-on-surface text-surface font-medium text-body transition-colors hover:bg-on-surface-medium disabled:opacity-40"
      >
        {loading ? 'Saving...' : 'Continue'}
      </button>
      {error && <p className="text-caption text-rose-400">{error}</p>}
    </div>
  )
}

// ── Step: Agreement ─────────────────────────────────────────

export const AGREEMENT_SECTIONS = [
  {
    title: '1. Independent Contractor Status',
    body: 'Couriers are independent contractors. Nothing in this Agreement creates employment, partnership, agency, or joint venture. Couriers control when they work, whether they accept deliveries, and how they perform deliveries. The Platform provides technology services only and does not control the manner or method of courier transportation.',
    subsections: [
      { title: '1.1 Freedom to Work Elsewhere', body: 'Couriers are free to perform delivery services for any other business or platform.' },
      { title: '1.2 Marketplace Role', body: 'The Platform operates as a digital marketplace that allows restaurants to request delivery services and allows independent couriers to view and claim available delivery opportunities. The Platform does not assign deliveries to couriers, require couriers to accept any delivery, or control how a courier performs a delivery.' },
    ],
  },
  {
    title: '2. Courier Eligibility',
    body: 'Couriers must be at least 16 years old, complete identity verification, provide valid government identification, and complete onboarding requirements. Additional verification may be required for expanded services.',
  },
  {
    title: '3. Transportation',
    body: 'Couriers may use bicycle, walking, scooter, car, or other lawful transportation. Couriers are responsible for maintaining their transportation and must comply with all applicable laws and traffic regulations while performing deliveries.',
  },
  {
    title: '4. Insurance',
    body: 'Couriers operating motor vehicles must maintain any legally required insurance. Couriers assume all risks associated with transportation.',
  },
  {
    title: '5. Delivery Claiming',
    body: 'Restaurants submit delivery requests through the Platform. Couriers may independently choose to claim available delivery opportunities. When a courier claims a delivery, the courier agrees to make a good-faith effort to complete it or, if the delivery cannot be completed, to return the order to the restaurant.',
    subsections: [
      { title: '5.1 Pickup Confirmation', body: 'After claiming a delivery request, the Courier is expected to confirm pickup promptly. If pickup is not confirmed within a reasonable time, the Platform may return the delivery request to the queue for reassignment.' },
      { title: '5.2 Order Handling', body: 'Couriers agree to transport orders with reasonable care and to deliver orders in the condition received from the restaurant. Couriers must not open, tamper with, or alter any order.' },
    ],
  },
  {
    title: '6. Cancellation',
    body: 'A Courier may cancel a claimed delivery if the Courier cannot complete it. Repeated acceptance and cancellation of deliveries that materially disrupt service may result in warnings, temporary restrictions, or removal from the Platform.',
  },
  {
    title: '7. Compensation',
    body: 'A service charge is collected from the customer on each order. The Courier receives a percentage of the service charge as described in the current fee schedule. Any customer tips belong entirely to the Courier. Payments are typically distributed through automated nightly payouts through the Platform\u2019s payment system.',
    subsections: [
      { title: '7.1 Current Fee Schedule', body: 'As of the effective date, the service charge is 22% of the food subtotal. The Courier receives 75% of the service charge and the Platform retains 25%. The minimum order amount is $40 before tax and fees.' },
      { title: '7.2 Right to Modify Fees', body: 'The Platform reserves the right to modify the service charge percentage, the courier/platform split, the minimum order amount, or any other fee or rate at any time. Changes to the fee schedule will be communicated to Couriers through the Platform before taking effect.' },
    ],
  },
  {
    title: '8. Alcohol Deliveries',
    body: 'Couriers performing alcohol deliveries must verify government-issued identification and refuse delivery if the recipient is underage or intoxicated. If delivery is refused, the Courier must return the alcohol to the restaurant. Failure to comply may result in removal from the Platform.',
  },
  {
    title: '9. Conduct',
    body: 'Couriers must act respectfully toward customers, restaurants, and other couriers. The Platform may remove couriers for conduct that harms the service.',
  },
  {
    title: '10. Theft or Misconduct',
    body: 'Intentional interference with deliveries may result in immediate removal from the Platform. The Platform may investigate incidents before determining outcomes.',
  },
  {
    title: '11. Privacy',
    body: 'The Platform minimizes the collection of customer data. Couriers agree not to store, retain, disclose, or misuse customer information except as necessary to complete a delivery.',
  },
  {
    title: '12. Assumption of Risk',
    body: 'Couriers perform deliveries at their own risk and are responsible for their transportation choices and compliance with law. The Platform is not responsible for injuries, accidents, property damage, or other incidents arising from courier transportation activities, nor for food preparation, food safety, or restaurant order accuracy.',
  },
  {
    title: '13. Indemnification',
    body: 'The Courier agrees to defend, indemnify, and hold harmless the Platform and its owners, officers, employees, and agents from and against any claims, damages, losses, liabilities, costs, or expenses arising out of or related to the Courier\u2019s transportation activities, accidents or injuries during delivery, violations of law, failure to verify identification for alcohol deliveries, theft or mishandling of orders, or breach of this Agreement.',
  },
  {
    title: '14. Platform Authority',
    body: 'The Platform may suspend, restrict, or remove access to the service at its discretion to protect the safety, reliability, and integrity of the Lafayette Square Deliveries system.',
  },
  {
    title: '15. Service Availability',
    body: 'The Platform is not liable for delays or failures caused by circumstances beyond its control, including weather, technical outages, restaurant closures, or courier availability.',
  },
  {
    title: '16. Dispute Resolution',
    body: 'The parties agree to attempt to resolve disputes informally. If a dispute cannot be resolved informally, either party may bring a claim in a court of competent jurisdiction in the State of Missouri, including small claims court where applicable.',
  },
  {
    title: '17. Acceptance',
    body: 'This Agreement becomes effective when the Courier accepts the Agreement through the Platform onboarding process.',
  },
  {
    title: '18. Governing Law',
    body: 'This Agreement is governed by the laws of the State of Missouri.',
  },
  {
    title: '19. Severability',
    body: 'If any provision of this Agreement is held invalid or unenforceable, the remaining provisions remain in full force and effect.',
  },
  {
    title: '20. Amendments',
    body: 'The Platform may modify this Agreement from time to time by providing notice through the Platform or by email. Unless otherwise required for safety or legal compliance, changes will become effective no earlier than thirty (30) days after notice.',
  },
]

function AgreementStep({ onNext, preview }) {
  const { onboardingAction, loading, error } = useCary()
  const [agreed, setAgreed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleAccept = useCallback(async () => {
    if (preview) { onNext(); return }
    if (!agreed) return
    const result = await onboardingAction('accept_agreement')
    if (result) onNext()
  }, [agreed, onboardingAction, onNext, preview])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-body font-medium text-on-surface">Courier Independent Contractor Agreement</h3>
        <p className="text-body-sm text-on-surface-variant mt-1">
          Between Jacob Henderson LLC, DBA Lafayette Square Deliveries (&ldquo;Platform&rdquo;) and you (&ldquo;Courier&rdquo;).
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-lg bg-surface-container border border-outline-variant px-3 py-3 space-y-3 text-body-sm text-on-surface-variant">
        <div>
          <p className="text-on-surface font-medium mb-0.5">Independent contractor</p>
          <p>You are not an employee. You control when, whether, and how you deliver.</p>
        </div>
        <div>
          <p className="text-on-surface font-medium mb-0.5">Eligibility</p>
          <p>Must be 16+ with valid ID. 21+ required for alcohol deliveries.</p>
        </div>
        <div>
          <p className="text-on-surface font-medium mb-0.5">Compensation</p>
          <p>You earn 75% of the service charge on every order (currently 22% of the food total). Tips are 100% yours. Nightly payouts. Rates may change.</p>
        </div>
        <div>
          <p className="text-on-surface font-medium mb-0.5">Conduct & safety</p>
          <p>Respect everyone. Follow traffic laws. Handle orders with care. Zero tolerance for theft, harassment, or impairment.</p>
        </div>
        <div>
          <p className="text-on-surface font-medium mb-0.5">Alcohol deliveries</p>
          <p>Verify government ID on every alcohol delivery. Refuse if underage or intoxicated. Return refused orders to the restaurant.</p>
        </div>
      </div>

      {/* Full agreement toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left text-body-sm text-on-surface-subtle hover:text-on-surface-variant transition-colors flex items-center gap-2"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {expanded ? 'Hide full agreement' : 'Read full agreement (20 sections)'}
      </button>

      {expanded && (
        <div className="rounded-lg bg-surface-container border border-outline-variant px-3 py-3 space-y-4 text-[12px] leading-relaxed text-on-surface-variant max-h-[40vh] overflow-y-auto">
          {AGREEMENT_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-on-surface font-medium mb-1">{section.title}</p>
              <p>{section.body}</p>
              {section.subsections?.map((sub) => (
                <div key={sub.title} className="mt-2 ml-3">
                  <p className="text-on-surface-medium font-medium mb-0.5">{sub.title}</p>
                  <p>{sub.body}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-outline-variant accent-emerald-400"
        />
        <span className="text-body-sm text-on-surface-variant">
          I have read and agree to the Courier Independent Contractor Agreement, including the independent contractor status, eligibility requirements, compensation terms, conduct standards, alcohol delivery protocol, assumption of risk, and indemnification obligations.
        </span>
      </label>
      <button
        onClick={handleAccept}
        disabled={loading || !agreed}
        className="w-full py-2.5 rounded-xl bg-on-surface text-surface font-medium text-body transition-colors hover:bg-on-surface-medium disabled:opacity-40"
      >
        {loading ? 'Submitting...' : 'Accept and continue'}
      </button>
      {error && <p className="text-caption text-rose-400">{error}</p>}
    </div>
  )
}

// ── Pending activation ──────────────────────────────────────

function PendingStep() {
  const { onboardingAction, onboardingStatus, loading } = useCary()

  const handleCheck = useCallback(async () => {
    await onboardingAction('check_activation')
  }, [onboardingAction])

  // Determine what's still pending
  const steps = onboardingStatus?.steps || {}
  const pending = Object.entries(steps)
    .filter(([, v]) => !v.complete)
    .map(([k]) => k)

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-400/30 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" d="M12 6v6l4 2" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>
        <h3 className="text-body font-medium text-on-surface">Almost there</h3>
        <p className="text-body-sm text-on-surface-variant mt-1">
          Your application is being processed. Some verifications take 1-3 business days.
        </p>
      </div>
      {pending.length > 0 && (
        <div className="rounded-lg bg-surface-container border border-outline-variant px-3 py-2.5 text-body-sm space-y-1.5">
          <p className="text-on-surface-subtle text-caption uppercase tracking-wider">Waiting on</p>
          {pending.map((step) => (
            <div key={step} className="flex items-center gap-2 text-on-surface-variant">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
              <span className="capitalize">{step.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={handleCheck}
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-surface-container-high border border-outline text-on-surface-variant font-medium text-body transition-colors hover:bg-surface-container-highest hover:text-on-surface disabled:opacity-40"
      >
        {loading ? 'Checking...' : 'Check status'}
      </button>
    </div>
  )
}

// ── Vehicle type selector (first thing after auth) ──────────

function VehicleTypeStep({ onSelect }) {
  const { applyCourier, loading, error } = useCary()

  const handleSelect = useCallback(async (type) => {
    const ok = await applyCourier(type, '')
    if (ok) onSelect(type)
  }, [applyCourier, onSelect])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-body font-medium text-on-surface">How will you deliver?</h3>
        <p className="text-body-sm text-on-surface-variant mt-1">
          Select your primary mode of transport.
        </p>
      </div>
      <div className="space-y-2">
        {VEHICLE_TYPES.map((v) => (
          <button
            key={v.id}
            onClick={() => handleSelect(v.id)}
            disabled={loading}
            className="w-full text-left px-4 py-3 rounded-xl border border-outline-variant bg-surface-container text-on-surface text-body hover:border-on-surface-subtle hover:bg-surface-container-high transition-colors disabled:opacity-40"
          >
            {v.label}
          </button>
        ))}
      </div>
      {error && <p className="text-caption text-rose-400">{error}</p>}
    </div>
  )
}

// ── Preview Mode (local state, no Supabase) ────────────────

const PREVIEW_STEPS = ['identity', 'agreement', 'license', 'background', 'insurance', 'vehicle']

function PreviewOnboarding({ tier = 'drive' }) {
  const [stepIdx, setStepIdx] = useState(0)
  const [expandedStep, setExpandedStep] = useState(PREVIEW_STEPS[0])
  const [vehicleType] = useState('car')
  const step = PREVIEW_STEPS[stepIdx]

  const completed = new Set(['account', ...PREVIEW_STEPS.slice(0, stepIdx)])
  const advanceStep = () => {
    if (stepIdx < PREVIEW_STEPS.length - 1) {
      const next = PREVIEW_STEPS[stepIdx + 1]
      setStepIdx(stepIdx + 1)
      setExpandedStep(next)
    }
  }

  const stepComponent = {
    identity: <IdentityStep onNext={advanceStep} preview />,
    license: <LicenseStep onNext={advanceStep} preview />,
    background: <BackgroundStep onNext={advanceStep} preview />,
    insurance: <InsuranceStep onNext={advanceStep} vehicleType={vehicleType} preview />,
    vehicle: <VehicleStep onNext={advanceStep} vehicleType={vehicleType} preview />,
    agreement: <AgreementStep onNext={advanceStep} preview />,
  }

  return (
    <PipelineTracker
      currentStep={step}
      tier={tier}
      completedSteps={completed}
      expandedStep={expandedStep}
      onToggle={setExpandedStep}
      stepContent={expandedStep === step ? stepComponent[step] : null}
    />
  )
}

// ── Main Onboarding Component ───────────────────────────────

export { VehicleTypeStep, VEHICLE_TYPES }

export default function CourierOnboarding({ preview = false, tier = 'deliver' }) {
  const { courierProfile, refreshOnboardingStatus } = useCary()

  // Preview mode: self-contained with local state
  if (preview) return <PreviewOnboarding tier={tier} />

  const step = courierProfile?.onboarding_step
  const vehicleType = courierProfile?.vehicle_type
  const effectiveTier = courierProfile?.tier || tier

  // No courier profile yet — show vehicle type selector to create it
  if (!courierProfile) {
    return (
      <VehicleTypeStep onSelect={() => refreshOnboardingStatus()} />
    )
  }

  // Already active — shouldn't be here
  if (courierProfile.status === 'active') return null

  const advanceStep = () => refreshOnboardingStatus()

  // Render the current step content (tracker is rendered by the parent)
  switch (step) {
    case 'identity':
      return <IdentityStep onNext={advanceStep} />
    case 'license':
      return <LicenseStep onNext={advanceStep} />
    case 'background':
      return <BackgroundStep onNext={advanceStep} />
    case 'insurance':
      return <InsuranceStep onNext={advanceStep} vehicleType={vehicleType} />
    case 'vehicle':
      return <VehicleStep onNext={advanceStep} vehicleType={vehicleType} />
    case 'agreement':
      return <AgreementStep onNext={advanceStep} />
    case 'pending_activation':
      return <PendingStep />
    default:
      return <PendingStep />
  }
}
