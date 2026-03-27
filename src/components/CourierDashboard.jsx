/**
 * Cary — Courier Dashboard
 *
 * Full-screen overlay for active couriers. Shows:
 * - Incoming requests (accept/decline)
 * - Active session meter (live GPS, fare, controls)
 * - Go online/offline toggle
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { create } from 'zustand'
import useCary from '../hooks/useCary'
import { computeFare, computeBreakdown } from '../../cary/lib/meter.js'
import { filterPoint } from '../../cary/lib/geo.js'
import SafetyReport from './SafetyReport'
import CourierOnboarding, { PipelineTracker, PIPELINE } from './CourierOnboarding'
import CaryAuth from './CaryAuth'

// ── Store ─────────────────────────────────────────────────────
export const useCourierDash = create((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

// ── Derive pipeline state from auth/profile/courier ───────────
function deriveCurrentStep(user, profile, courierProfile) {
  if (!user || !profile) return 'account'
  if (!courierProfile) return 'identity' // about to create courier profile
  if (courierProfile.status === 'active') return null // done
  return courierProfile.onboarding_step || 'identity'
}

function deriveCompletedSteps(user, profile, courierProfile, onboardingStatus) {
  const completed = new Set()
  if (user && profile) completed.add('account')
  if (!onboardingStatus?.steps) return completed

  const steps = onboardingStatus.steps
  if (steps.identity?.complete) completed.add('identity')
  if (steps.agreement?.complete) completed.add('agreement')
  if (steps.license?.complete) completed.add('license')
  if (steps.background?.complete) completed.add('background')
  if (steps.insurance?.complete) completed.add('insurance')
  if (steps.vehicle?.complete) completed.add('vehicle')
  return completed
}

// ── Online/Offline Toggle ─────────────────────────────────────
function OnlineToggle() {
  const [online, setOnline] = useState(false)
  const watchRef = useRef(null)
  const { updateLocation } = useCary()

  const goOnline = useCallback(() => {
    setOnline(true)
    // Start GPS tracking
    if ('geolocation' in navigator) {
      watchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          updateLocation(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.heading,
            pos.coords.accuracy
          )
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 }
      )
    }
  }, [updateLocation])

  const goOffline = useCallback(() => {
    setOnline(false)
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current)
      }
    }
  }, [])

  return (
    <button
      onClick={online ? goOffline : goOnline}
      className={`w-full py-3 rounded-xl font-medium text-body transition-all ${
        online
          ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
          : 'bg-surface-container-high border border-outline text-on-surface-variant'
      }`}
    >
      {online ? 'Online — accepting requests' : 'Go online'}
    </button>
  )
}

// ── Request Card ──────────────────────────────────────────────
function RequestCard({ request, onAccept }) {
  const typeLabels = { ride: 'Ride', delivery: 'Delivery', pickup: 'Pickup', errand: 'Errand' }

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="text-label-sm uppercase tracking-widest text-amber-400">
            {typeLabels[request.type] || request.type}
          </span>
          <p className="text-body font-medium text-on-surface mt-0.5">{request.place_name}</p>
        </div>
        <span className="text-caption text-on-surface-subtle">
          {new Date(request.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
      {request.description && (
        <p className="text-body-sm text-on-surface-variant mb-3">{request.description}</p>
      )}
      <button
        onClick={() => onAccept(request.id)}
        className="w-full py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-medium text-body-sm hover:bg-emerald-500/30 transition-colors"
      >
        Accept
      </button>
    </div>
  )
}

// ── Live Meter ────────────────────────────────────────────────
function LiveMeter() {
  const { activeSession, startMeter, completeMeter, pushRoutePoint, emergencyEnd, loading } = useCary()
  const [elapsed, setElapsed] = useState(0)
  const [distance, setDistance] = useState(0)
  const [showSafety, setShowSafety] = useState(false)
  const lastPointRef = useRef(null)
  const watchRef = useRef(null)

  // Timer
  useEffect(() => {
    if (!activeSession?.started_at) return
    const start = new Date(activeSession.started_at).getTime()
    const tick = () => setElapsed(Math.round((Date.now() - start) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [activeSession?.started_at])

  // GPS tracking for route points
  useEffect(() => {
    if (!activeSession?.started_at) return
    if (!('geolocation' in navigator)) return

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const point = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: Date.now(),
        }
        const result = filterPoint(point, lastPointRef.current)
        if (result.accept) {
          setDistance((d) => d + result.distance)
          lastPointRef.current = point
          pushRoutePoint(point.lat, point.lon, point.accuracy)
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000 }
    )

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current)
      }
    }
  }, [activeSession?.started_at, pushRoutePoint])

  if (!activeSession) return null

  const request = activeSession.requests
  const meterStarted = !!activeSession.started_at
  const fareCents = meterStarted ? computeFare(distance, elapsed) : 0
  const breakdown = meterStarted ? computeBreakdown(fareCents) : null

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="rounded-xl border border-outline bg-surface-container-high p-4 space-y-4">
      {/* Request info */}
      <div>
        <span className="text-label-sm uppercase tracking-widest text-emerald-400">
          {request?.type || 'Trip'}
        </span>
        <p className="text-body font-medium text-on-surface mt-0.5">
          {request?.place_name || 'Unknown'}
        </p>
        {request?.description && (
          <p className="text-body-sm text-on-surface-variant mt-1">{request.description}</p>
        )}
      </div>

      {/* Meter display */}
      {meterStarted ? (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-caption text-on-surface-subtle">Time</p>
              <p className="text-title font-mono text-on-surface">{formatTime(elapsed)}</p>
            </div>
            <div>
              <p className="text-caption text-on-surface-subtle">Distance</p>
              <p className="text-title font-mono text-on-surface">
                {distance < 1000
                  ? `${Math.round(distance)}m`
                  : `${(distance / 1609.34).toFixed(1)}mi`}
              </p>
            </div>
            <div>
              <p className="text-caption text-on-surface-subtle">Fare</p>
              <p className="text-title font-mono text-emerald-400">
                ${(fareCents / 100).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Breakdown */}
          {breakdown && (
            <div className="rounded-lg bg-surface-container border border-outline-variant px-3 py-2 space-y-1 text-body-sm">
              <div className="flex justify-between text-on-surface-variant">
                <span>Your payout</span>
                <span className="text-on-surface">${(breakdown.courier_payout / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-on-surface-subtle">
                <span>Platform fee</span>
                <span>${(breakdown.platform_fee / 100).toFixed(2)}</span>
              </div>
            </div>
          )}

          <button
            onClick={completeMeter}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-on-surface text-surface font-medium text-body transition-colors hover:bg-on-surface-medium disabled:opacity-40"
          >
            {loading ? 'Completing...' : 'Complete trip'}
          </button>

          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setShowSafety(true)}
              className="py-2 rounded-lg border border-rose-400/30 text-rose-400 text-body-sm hover:bg-rose-500/10 transition-colors"
            >
              End Service
            </button>
            <button
              onClick={() => window.open('tel:911')}
              className="py-2 rounded-lg border border-amber-400/30 text-amber-400 text-body-sm hover:bg-amber-500/10 transition-colors"
            >
              Need Help
            </button>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: 'My Cary trip',
                    text: `I'm on a ${request?.type || 'trip'} near ${request?.place_name || 'Lafayette Square'}`,
                  }).catch(() => {})
                }
              }}
              className="py-2 rounded-lg border border-outline-variant text-on-surface-variant text-body-sm hover:bg-surface-container transition-colors"
            >
              Share Trip
            </button>
          </div>

          {/* Safety report */}
          {showSafety && (
            <SafetyReport
              onReport={(reason, details) => { emergencyEnd(reason, details); setShowSafety(false) }}
              onCancel={() => setShowSafety(false)}
            />
          )}
        </>
      ) : (
        <button
          onClick={startMeter}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-medium text-body hover:bg-emerald-500/30 transition-colors"
        >
          Start meter
        </button>
      )}
    </div>
  )
}

// ── Onboarding Flow (accordion + step content) ──────────────
function OnboardingFlow({ user, profile, courierProfile, onboardingStatus, currentStep, completedSteps, effectiveTier }) {
  const [expandedStep, setExpandedStep] = useState(currentStep)
  const { refreshOnboardingStatus } = useCary()

  // Auto-expand current step when it changes
  useEffect(() => {
    setExpandedStep(currentStep)
  }, [currentStep])

  const advanceStep = useCallback(() => refreshOnboardingStatus(), [refreshOnboardingStatus])
  const vehicleType = courierProfile?.vehicle_type

  // Build the step content that renders inside the expanded accordion item
  const stepContent = useMemo(() => {
    if (expandedStep !== currentStep) return null // only show forms for the active step
    switch (currentStep) {
      case 'account': return <CaryAuth />
      case 'identity':
        if (!courierProfile) return <CourierOnboarding tier={effectiveTier} /> // VehicleTypeStep
        return <CourierOnboarding tier={effectiveTier} />
      case 'agreement':
      case 'license':
      case 'background':
      case 'insurance':
      case 'vehicle':
      case 'pending_activation':
        return <CourierOnboarding tier={effectiveTier} />
      default:
        return null
    }
  }, [expandedStep, currentStep, courierProfile, effectiveTier])

  return (
    <>
      {/* Early access banner — shown before sign-in */}
      {!user && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-400/25 px-3 py-3 space-y-2">
          <p className="text-body-sm text-amber-200/90 font-medium">Early access — not yet live</p>
          <p className="text-[12px] leading-relaxed text-amber-200/60">
            Cary is Lafayette Square's neighborhood delivery service. We're onboarding couriers now so you're credentialed and ready when we launch. Completing the process gets you independently verified — your credentials belong to you, not the platform. When we go live, you'll be first in the network.
          </p>
        </div>
      )}

      {/* Vertical accordion tracker with embedded step content */}
      <PipelineTracker
        currentStep={currentStep}
        tier={effectiveTier}
        completedSteps={completedSteps}
        expandedStep={expandedStep}
        onToggle={setExpandedStep}
        stepContent={expandedStep === currentStep ? stepContent : null}
      />
    </>
  )
}

// ── Drive Upgrade Card ───────────────────────────────────────
function DriveUpgradeCard() {
  const { upgradeToDrive, loading } = useCary()

  return (
    <button
      onClick={upgradeToDrive}
      disabled={loading}
      className="glass-card w-full text-left rounded-xl p-4 hover:bg-[rgba(255,255,255,0.08)] transition-colors"
    >
      <p className="text-body font-medium text-on-surface">Level up to Drive</p>
      <p className="text-body-sm text-on-surface-variant mt-1">
        Carry passengers starting in the Square, servicing the entire county. Must be 18+.
      </p>
      <p className="text-caption text-on-surface-subtle mt-2">~$42 background check — active in 1-3 days</p>
    </button>
  )
}

// ── Main Dashboard ────────────────────────────────────────────
export default function CourierDashboard() {
  const open = useCourierDash((s) => s.open)
  const setOpen = useCourierDash((s) => s.setOpen)
  const {
    user,
    profile,
    courierProfile,
    onboardingStatus,
    activeSession,
    courierRequests,
    acceptRequest,
    subscribeAsCourier,
    unsubscribeAll,
  } = useCary()

  useEffect(() => {
    if (open && courierProfile?.status === 'active') {
      subscribeAsCourier()
      return () => unsubscribeAll()
    }
  }, [open, courierProfile?.status, subscribeAsCourier, unsubscribeAll])

  // Preview mode: ?preview=true skips auth to show the onboarding wizard
  const isPreview = new URLSearchParams(window.location.search).has('preview')

  if (!open) return null

  const currentStep = deriveCurrentStep(user, profile, courierProfile)
  const completedSteps = deriveCompletedSteps(user, profile, courierProfile, onboardingStatus)
  const effectiveTier = courierProfile?.tier || 'deliver'
  const isActive = courierProfile?.status === 'active'

  // Determine subtitle based on pipeline state
  const subtitle = isPreview ? 'Courier onboarding preview'
    : isActive ? 'Courier dashboard'
    : currentStep === 'account' ? 'Create your account'
    : currentStep === 'identity' && !courierProfile ? 'How will you deliver?'
    : currentStep === 'identity' ? 'Verify your identity'
    : currentStep === 'agreement' ? 'Review the agreement'
    : currentStep === 'pending_activation' ? 'Almost there'
    : effectiveTier === 'drive' ? 'Drive for Cary'
    : 'Courier onboarding'

  return (
    <div className="fixed inset-0 z-[60] glass-overlay overflow-y-auto">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-headline text-on-surface font-medium font-mono">
              Cary
            </h2>
            <p className="text-body-sm text-on-surface-subtle">{subtitle}</p>
          </div>
          <button
            onClick={() => {
              setOpen(false)
              if (window.location.pathname.startsWith('/cary')) window.location.href = '/'
            }}
            className="w-9 h-9 rounded-full backdrop-blur-md bg-rose-500/20 border border-rose-400/40 text-rose-300 hover:bg-rose-500/30 flex items-center justify-center text-body-sm"
          >
            &times;
          </button>
        </div>

        {/* Preview mode */}
        {isPreview && <CourierOnboarding preview tier="drive" />}

        {/* Onboarding flow (not active, not preview) */}
        {!isPreview && !isActive && (
          <OnboardingFlow
            user={user}
            profile={profile}
            courierProfile={courierProfile}
            onboardingStatus={onboardingStatus}
            currentStep={currentStep}
            completedSteps={completedSteps}
            effectiveTier={effectiveTier}
          />
        )}

        {/* Active courier */}
        {!isPreview && isActive && (
          <>
            <OnlineToggle />

            {/* Drive upgrade for Deliver-only couriers */}
            {effectiveTier === 'deliver' && <DriveUpgradeCard />}

            {/* Active session */}
            {activeSession && <LiveMeter />}

            {/* Incoming requests */}
            {!activeSession && courierRequests.length > 0 && (
              <div className="space-y-3">
                <p className="text-label-sm uppercase tracking-widest text-on-surface-subtle">
                  Nearby requests
                </p>
                {courierRequests.map((req) => (
                  <RequestCard
                    key={req.id}
                    request={req}
                    onAccept={acceptRequest}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!activeSession && courierRequests.length === 0 && (
              <div className="text-center py-8">
                <p className="text-body-sm text-on-surface-subtle">
                  No requests nearby. Stay online and you'll be notified.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
