import { create } from 'zustand'

const useCommunityStats = create(() => ({
  townies: 0,
  residents: 0,
  guardians: 0,
}))

export default useCommunityStats
