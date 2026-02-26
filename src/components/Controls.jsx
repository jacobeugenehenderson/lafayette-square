import { useEffect, useState } from 'react'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useCamera from '../hooks/useCamera'
import useListings from '../hooks/useListings'
import buildingsData from '../data/buildings.json'
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
  const deselect = useSelectedBuilding((state) => state.deselect)
  const viewMode = useCamera((state) => state.viewMode)
  const [buildingInfo, setBuildingInfo] = useState(null)
  const getById = useListings((s) => s.getById)
  const getByBuildingId = useListings((s) => s.getByBuildingId)
  const getListingsForBuilding = useListings((s) => s.getListingsForBuilding)

  useEffect(() => {
    if (selectedId) {
      const building = buildingsData.buildings.find((b) => b.id === selectedId)
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

      {showCard && selectedId && buildingInfo && (
        <PlaceCard
          listing={listing}
          building={buildingInfo}
          allListings={allListings}
          onClose={deselect}
        />
      )}
    </>
  )
}

export default Controls
