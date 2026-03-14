/**
 * Cary — Courier Onboarding Wizard
 *
 * Multi-step pipeline rendered inside CourierDashboard for non-active couriers.
 * Each step calls the onboarding edge function and advances on success.
 *
 * Steps:
 *   1. Account (handled by CaryAuth before this renders)
 *   2. Identity — Stripe Identity (redirect)
 *   3. License — DL state + expiry
 *   4. Background — Checkr invitation (redirect)
 *   5. Insurance — policy expiry
 *   6. Vehicle — make/model/year/plate
 *   7. Agreement — terms acceptance
 *   8. Pending activation / credential issued
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

// ── Progress indicator ────────────────────────────────────────

const STEP_LABELS = ['Identity', 'License', 'Background', 'Insurance', 'Vehicle', 'Agreement']

function ProgressBar({ currentStep }) {
  const stepIndex = STEP_LABELS.findIndex(
    (s) => s.toLowerCase() === currentStep?.replace('pending_activation', 'done')
  )
  const activeIndex = currentStep === 'pending_activation' ? STEP_LABELS.length : Math.max(0, stepIndex)

  return (
    <div className="flex items-center gap-1 mb-6">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex-1 flex flex-col items-center gap-1">
          <div
            className={`w-full h-1 rounded-full transition-colors ${
              i < activeIndex
                ? 'bg-emerald-400/60'
                : i === activeIndex
                ? 'bg-on-surface/40'
                : 'bg-outline-variant/40'
            }`}
          />
          <span
            className={`text-[10px] tracking-wide transition-colors ${
              i <= activeIndex ? 'text-on-surface-variant' : 'text-on-surface-disabled'
            }`}
          >
            {label}
          </span>
        </div>
      ))}
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
      <p className="text-caption text-on-surface-subtle">
        Verification is handled by Stripe. Your ID is not stored by Cary.
      </p>
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

function AgreementStep({ onNext, preview }) {
  const { onboardingAction, loading, error } = useCary()
  const [agreed, setAgreed] = useState(false)

  const handleAccept = useCallback(async () => {
    if (preview) { onNext(); return }
    if (!agreed) return
    const result = await onboardingAction('accept_agreement')
    if (result) onNext()
  }, [agreed, onboardingAction, onNext, preview])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-body font-medium text-on-surface">Courier agreement</h3>
        <p className="text-body-sm text-on-surface-variant mt-1">
          Review and accept the terms of operating as a Cary courier.
        </p>
      </div>
      <div className="rounded-lg bg-surface-container border border-outline-variant px-3 py-3 space-y-3 text-body-sm text-on-surface-variant">
        <div>
          <p className="text-on-surface font-medium mb-0.5">Independent contractor</p>
          <p>You operate as an independent contractor, not an employee of Cary or Lafayette Square.</p>
        </div>
        <div>
          <p className="text-on-surface font-medium mb-0.5">Community conduct</p>
          <p>Treat every guest with respect. You represent the neighborhood.</p>
        </div>
        <div>
          <p className="text-on-surface font-medium mb-0.5">Safety first</p>
          <p>Follow all traffic laws. Either party may end a service immediately if they feel unsafe.</p>
        </div>
        <div>
          <p className="text-on-surface font-medium mb-0.5">Zero tolerance</p>
          <p>Violence, harassment, discrimination, or impaired driving result in immediate and permanent removal.</p>
        </div>
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-outline-variant accent-emerald-400"
        />
        <span className="text-body-sm text-on-surface-variant">
          I have read and agree to the Courier Agreement, including the independent contractor status, community conduct rules, and zero-tolerance policy.
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

const STEP_ORDER = ['identity', 'license', 'background', 'insurance', 'vehicle', 'agreement', 'pending_activation']

function PreviewOnboarding() {
  const [step, setStep] = useState(null) // null = vehicle type selector
  const [vehicleType, setVehicleType] = useState('car')

  const advanceStep = () => {
    if (!step) {
      setStep('identity')
      return
    }
    const idx = STEP_ORDER.indexOf(step)
    if (idx < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[idx + 1])
    }
  }

  // Vehicle type selector
  if (!step) {
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
              onClick={() => { setVehicleType(v.id); advanceStep() }}
              className="w-full text-left px-4 py-3 rounded-xl border border-outline-variant bg-surface-container text-on-surface text-body hover:border-on-surface-subtle hover:bg-surface-container-high transition-colors"
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // In preview, wrap onNext so buttons always advance (no Supabase calls)
  const previewNext = advanceStep
  const stepComponent = {
    identity: <IdentityStep onNext={previewNext} preview />,
    license: <LicenseStep onNext={previewNext} preview />,
    background: <BackgroundStep onNext={previewNext} preview />,
    insurance: <InsuranceStep onNext={previewNext} vehicleType={vehicleType} preview />,
    vehicle: <VehicleStep onNext={previewNext} vehicleType={vehicleType} preview />,
    agreement: <AgreementStep onNext={previewNext} preview />,
    pending_activation: <PendingStep />,
  }

  return (
    <>
      <ProgressBar currentStep={step} />
      {stepComponent[step] || <PendingStep />}
    </>
  )
}

// ── Main Onboarding Component ───────────────────────────────

export default function CourierOnboarding({ preview = false }) {
  const { courierProfile, refreshOnboardingStatus } = useCary()

  // Preview mode: self-contained with local state
  if (preview) return <PreviewOnboarding />

  const step = courierProfile?.onboarding_step
  const vehicleType = courierProfile?.vehicle_type

  // No courier profile yet — show vehicle type selection to create one
  if (!courierProfile) {
    return (
      <VehicleTypeStep
        onSelect={() => refreshOnboardingStatus()}
      />
    )
  }

  // Already active — shouldn't be here
  if (courierProfile.status === 'active') return null

  const advanceStep = () => refreshOnboardingStatus()

  switch (step) {
    case 'identity':
      return (
        <>
          <ProgressBar currentStep={step} />
          <IdentityStep onNext={advanceStep} />
        </>
      )
    case 'license':
      return (
        <>
          <ProgressBar currentStep={step} />
          <LicenseStep onNext={advanceStep} />
        </>
      )
    case 'background':
      return (
        <>
          <ProgressBar currentStep={step} />
          <BackgroundStep onNext={advanceStep} />
        </>
      )
    case 'insurance':
      return (
        <>
          <ProgressBar currentStep={step} />
          <InsuranceStep onNext={advanceStep} vehicleType={vehicleType} />
        </>
      )
    case 'vehicle':
      return (
        <>
          <ProgressBar currentStep={step} />
          <VehicleStep onNext={advanceStep} vehicleType={vehicleType} />
        </>
      )
    case 'agreement':
      return (
        <>
          <ProgressBar currentStep={step} />
          <AgreementStep onNext={advanceStep} />
        </>
      )
    case 'pending_activation':
      return (
        <>
          <ProgressBar currentStep={step} />
          <PendingStep />
        </>
      )
    default:
      return (
        <>
          <ProgressBar currentStep={step} />
          <PendingStep />
        </>
      )
  }
}
