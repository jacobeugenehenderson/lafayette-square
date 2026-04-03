import { useEffect, useState } from 'react'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useCamera from '../hooks/useCamera'
import useListings from '../hooks/useListings'
import { buildings as _allBuildings } from '../data/buildings'
import PlaceCard from './PlaceCard'

const INSTRUCTIONS = {
  hero: '',
  browse: '',
  planetarium: 'Drag to orbit \u00B7 Pinch to zoom',
}

function Controls() {
  const selectedId = useSelectedBuilding((state) => state.selectedId)
  const selectedListingId = useSelectedBuilding((state) => state.selectedListingId)
  const showCard = useSelectedBuilding((state) => state.showCard)
  const hideCard = useSelectedBuilding((state) => state.hideCard)
  const viewMode = useCamera((state) => state.viewMode)
  const [buildingInfo, setBuildingInfo] = useState(null)
  const getById = useListings((s) => s.getById)
  const getByBuildingId = useListings((s) => s.getByBuildingId)
  const getListingsForBuilding = useListings((s) => s.getListingsForBuilding)

  // Panel state managed in SidePanel via showCard effect

  useEffect(() => {
    if (selectedId) {
      const building = _allBuildings.find((b) => b.id === selectedId)
      if (building) {
        setBuildingInfo(building)
      }
    } else {
      setBuildingInfo(null)
    }
  }, [selectedId])

  const listing = selectedId
    ? (selectedListingId ? getById(selectedListingId) : getByBuildingId(selectedId))
    : null

  const allListings = selectedId ? getListingsForBuilding(selectedId) : []

  const text = INSTRUCTIONS[viewMode] || ''

  return (
    <>
      {text && (
        <div className="absolute bottom-4 right-4 text-on-surface-subtle text-body text-right z-50">
          <p>{text}</p>
        </div>
      )}

      {showCard && selectedId && (buildingInfo || listing) && (
        <PlaceCard
          listing={listing}
          building={buildingInfo}
          allListings={allListings}
          onClose={hideCard}
        />
      )}
    </>
  )
}

export default Controls
