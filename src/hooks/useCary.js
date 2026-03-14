/**
 * Cary — Request + Courier Session Store
 *
 * Requesters use the existing device hash + handle identity (no auth needed).
 * Couriers use Supabase auth (phone OTP) for verification, background checks, payments.
 */

import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { getDeviceHash } from '../lib/device'

const useCary = create((set, get) => ({
  // ── Courier auth state (only couriers need Supabase auth) ──
  user: null,           // supabase auth user
  profile: null,        // profiles row (courier only)
  courierProfile: null, // courier_profiles row (null if not a courier)
  loading: false,
  error: null,

  // ── Onboarding state ────────────────────────────────────────
  onboardingStatus: null, // result from get_onboarding_status RPC

  // ── Session state ───────────────────────────────────────────
  activeRequest: null,  // requester's current open/accepted request
  activeSession: null,  // live session (both sides)
  courierRequests: [],  // open requests visible to courier

  // ── Init: check for courier session + restore active request ─
  init: async () => {
    set({ loading: true, error: null })
    try {
      // Check for courier auth session
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await get()._loadProfile(session.user)
      }

      // Restore active request for this device (regardless of auth)
      const deviceHash = await getDeviceHash()
      const { data: activeReq } = await supabase
        .from('requests')
        .select('*')
        .eq('requester_device_hash', deviceHash)
        .in('status', ['open', 'accepted', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (activeReq) set({ activeRequest: activeReq })
    } catch (err) {
      // Don't surface init errors to the user
    }
    set({ loading: false })
  },

  // ── Courier: Phone OTP ────────────────────────────────────
  sendOtp: async (phone) => {
    set({ error: null })
    const { error } = await supabase.auth.signInWithOtp({ phone })
    if (error) {
      set({ error: error.message })
      return false
    }
    return true
  },

  verifyOtp: async (phone, token) => {
    set({ loading: true, error: null })
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    })
    if (error) {
      set({ error: error.message, loading: false })
      return false
    }
    if (data?.user) {
      await get()._loadProfile(data.user)
    }
    set({ loading: false })
    return true
  },

  // ── Courier: Profile creation (first sign-in) ─────────────
  createProfile: async (displayName, neighborhoodRelationship) => {
    const user = get().user
    if (!user) return false
    set({ loading: true, error: null })

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        phone: user.phone,
        phone_verified: true,
        display_name: displayName,
        neighborhood_relationship: neighborhoodRelationship,
      })
      .select()
      .single()

    if (error) {
      set({ error: error.message, loading: false })
      return false
    }
    set({ profile: data, loading: false })
    return true
  },

  // ── Courier: application ──────────────────────────────────
  applyCourier: async (vehicleType, vehicleDescription) => {
    const user = get().user
    if (!user) return false
    set({ loading: true, error: null })

    const { data, error } = await supabase
      .from('courier_profiles')
      .insert({
        id: user.id,
        vehicle_type: vehicleType,
        vehicle_description: vehicleDescription,
      })
      .select()
      .single()

    if (error) {
      set({ error: error.message, loading: false })
      return false
    }
    set({ courierProfile: data, loading: false })
    return true
  },

  // ── Courier: onboarding actions ─────────────────────────────
  onboardingAction: async (action, extraFields = {}) => {
    const courier = get().courierProfile
    if (!courier) return null
    set({ loading: true, error: null })

    const { data, error } = await supabase.functions.invoke('onboarding', {
      body: { action, courier_id: courier.id, ...extraFields },
    })

    if (error) {
      set({ error: error.message, loading: false })
      return null
    }
    // Refresh courier profile + onboarding status after each action
    await get().refreshOnboardingStatus()
    set({ loading: false })
    return data
  },

  refreshOnboardingStatus: async () => {
    const courier = get().courierProfile
    const user = get().user
    if (!user) return

    // Refresh courier profile from DB
    const { data: updatedCourier } = await supabase
      .from('courier_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (updatedCourier) {
      set({ courierProfile: updatedCourier })

      // Fetch onboarding status if not yet active
      if (updatedCourier.status !== 'active') {
        const { data: statusData } = await supabase.rpc('get_onboarding_status', {
          p_courier_id: updatedCourier.id,
        })
        if (statusData) set({ onboardingStatus: statusData })
      }
    }
  },

  // ── Requester: create request (uses device hash, no auth) ──
  createRequest: async ({ deviceHash, handle, placeId, placeName, placeLat, placeLon, type, description }) => {
    set({ error: null })

    const { data, error } = await supabase
      .from('requests')
      .insert({
        requester_device_hash: deviceHash,
        requester_handle: handle,
        place_id: placeId,
        place_name: placeName,
        place_lat: placeLat,
        place_lon: placeLon,
        type,
        description,
      })
      .select()
      .single()

    if (error) {
      set({ error: error.message })
      return null
    }
    set({ activeRequest: data })

    // Invoke dispatch edge function
    supabase.functions.invoke('dispatch', {
      body: { request_id: data.id },
    }).catch(() => {}) // best-effort

    return data
  },

  cancelRequest: async () => {
    const req = get().activeRequest
    if (!req) return
    await supabase
      .from('requests')
      .update({ status: 'cancelled' })
      .eq('id', req.id)
    set({ activeRequest: null })
  },

  // ── Courier: accept a request ───────────────────────────────
  acceptRequest: async (requestId) => {
    const courier = get().courierProfile
    if (!courier) return null
    set({ error: null })

    // Claim the request
    const { error: reqError } = await supabase
      .from('requests')
      .update({ status: 'accepted' })
      .eq('id', requestId)
      .eq('status', 'open') // optimistic lock

    if (reqError) {
      set({ error: reqError.message })
      return null
    }

    // Create session
    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        request_id: requestId,
        courier_id: courier.id,
      })
      .select('*, requests(*)')
      .single()

    if (error) {
      set({ error: error.message })
      return null
    }
    set({ activeSession: session })
    return session
  },

  // ── Courier: start meter ────────────────────────────────────
  startMeter: async () => {
    const session = get().activeSession
    if (!session) return false

    const { error } = await supabase
      .from('sessions')
      .update({ started_at: new Date().toISOString() })
      .eq('id', session.id)

    if (error) {
      set({ error: error.message })
      return false
    }
    set({ activeSession: { ...session, started_at: new Date().toISOString() } })
    return true
  },

  // ── Courier: complete trip ──────────────────────────────────
  completeMeter: async () => {
    const session = get().activeSession
    if (!session) return null
    set({ loading: true })

    const { data, error } = await supabase.functions.invoke('complete-session', {
      body: { session_id: session.id },
    })

    if (error) {
      set({ error: error.message, loading: false })
      return null
    }
    set({ activeSession: null, loading: false })
    return data
  },

  // ── Courier: update GPS location ───────────────────────────
  updateLocation: async (lat, lon, heading, accuracy) => {
    const courier = get().courierProfile
    if (!courier) return

    await supabase
      .from('courier_locations')
      .upsert({
        courier_id: courier.id,
        lat,
        lon,
        heading,
        accuracy,
        updated_at: new Date().toISOString(),
      })
  },

  // ── Courier: push route point to active session ─────────────
  pushRoutePoint: async (lat, lon, accuracy) => {
    const session = get().activeSession
    if (!session?.started_at) return

    const point = { lat, lon, accuracy, timestamp: Date.now() }
    const routePoints = [...(session.route_points || []), point]

    await supabase
      .from('sessions')
      .update({ route_points: routePoints })
      .eq('id', session.id)

    set({ activeSession: { ...session, route_points: routePoints } })
  },

  // ── Real-time subscriptions ─────────────────────────────────
  _subscriptions: [],

  subscribeAsRequester: (deviceHash) => {
    if (!deviceHash) return

    // Watch own requests for status changes (by device hash)
    const reqSub = supabase
      .channel('requester-requests')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'requests',
        filter: `requester_device_hash=eq.${deviceHash}`,
      }, (payload) => {
        const updated = payload.new
        const active = get().activeRequest
        if (active && active.id === updated.id) {
          set({ activeRequest: updated })
        }
      })
      .subscribe()

    // Watch sessions for own requests
    const sessSub = supabase
      .channel('requester-sessions')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sessions',
      }, async (payload) => {
        const session = payload.new
        const active = get().activeRequest
        if (active && session.request_id === active.id) {
          set({ activeSession: session })
        }
      })
      .subscribe()

    set({ _subscriptions: [reqSub, sessSub] })
  },

  subscribeAsCourier: () => {
    const courier = get().courierProfile
    if (!courier) return

    // Watch open requests
    const reqSub = supabase
      .channel('courier-open-requests')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'requests',
        filter: 'status=eq.open',
      }, async () => {
        // Refresh open requests
        const { data } = await supabase
          .from('requests')
          .select('*')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
        set({ courierRequests: data || [] })
      })
      .subscribe()

    // Watch own sessions
    const sessSub = supabase
      .channel('courier-sessions')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sessions',
        filter: `courier_id=eq.${courier.id}`,
      }, (payload) => {
        set({ activeSession: payload.new })
      })
      .subscribe()

    set({ _subscriptions: [reqSub, sessSub] })
  },

  unsubscribeAll: () => {
    get()._subscriptions.forEach((s) => supabase.removeChannel(s))
    set({ _subscriptions: [] })
  },

  // ── Safety: emergency end + report ──────────────────────────
  emergencyEnd: async (reason, details) => {
    const req = get().activeRequest

    // Cancel the active request immediately
    if (req) {
      await supabase
        .from('requests')
        .update({ status: 'cancelled' })
        .eq('id', req.id)
    }

    // TODO: Safety reports need rethinking for device-based requesters.
    // Couriers (who have auth) can still file reports via CourierDashboard.

    set({ activeRequest: null, activeSession: null })
  },

  // ── Sign out ────────────────────────────────────────────────
  signOut: async () => {
    get().unsubscribeAll()
    await supabase.auth.signOut()
    set({
      user: null,
      profile: null,
      courierProfile: null,
      activeRequest: null,
      activeSession: null,
      courierRequests: [],
      error: null,
    })
  },

  // ── Internal: load courier profile (auth users only) ────────
  _loadProfile: async (user) => {
    set({ user })

    // Fetch profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    // Fetch courier profile if exists
    const { data: courierProfile } = await supabase
      .from('courier_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    set({ profile, courierProfile })

    // Check for active courier session
    if (courierProfile) {
      const { data: activeSess } = await supabase
        .from('sessions')
        .select('*, requests(*)')
        .eq('courier_id', courierProfile.id)
        .is('completed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (activeSess) set({ activeSession: activeSess })
    }
  },
}))

// Listen for auth state changes (only when Supabase is configured)
if (import.meta.env.VITE_SUPABASE_URL) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      useCary.getState()._loadProfile(session.user)
    } else if (event === 'SIGNED_OUT') {
      useCary.setState({
        user: null,
        profile: null,
        courierProfile: null,
        activeRequest: null,
        activeSession: null,
        courierRequests: [],
      })
    }
  })
}

// Auto-init: only when Supabase is actually configured
if (import.meta.env.VITE_SUPABASE_URL) {
  useCary.getState().init()
}

export default useCary
