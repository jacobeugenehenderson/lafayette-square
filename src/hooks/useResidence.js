import { create } from 'zustand'

/**
 * Residence state — tracks whether the current user is a Resident of a building.
 * Populated from the `init` response and updated on claim/leave actions.
 */
const useResidence = create((set) => ({
  buildingId: null,   // building_id the user is a resident of (or null)
  status: null,       // 'pending' | 'verified' | null

  setResidence: (buildingId, status) => set({ buildingId, status }),
  clear: () => set({ buildingId: null, status: null }),
}))

export default useResidence
