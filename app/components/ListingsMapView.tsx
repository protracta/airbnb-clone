"use client";

import { useState, useCallback } from "react";
import { SafeListing, SafeUser } from "@/app/types";
import ListingCard from "./listing/ListingCard";
import dynamic from "next/dynamic";

// Dynamically import the map so it only loads client-side (no SSR)
const MapContainer = dynamic(() => import("./map/MapContainer"), { ssr: false });

interface ListingsMapViewProps {
  listings: SafeListing[];
  currentUser: SafeUser | null;
}

const ListingsMapView: React.FC<ListingsMapViewProps> = ({
  listings,
  currentUser,
}) => {
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  const handleSelectListing = useCallback(
    (id: string | null) => setSelectedListingId(id),
    []
  );

  const handleCardSelect = useCallback(
    (id: string) =>
      setSelectedListingId((prev) => (prev === id ? null : id)),
    []
  );

  return (
    <div className="flex gap-6">
      {/* Listing cards grid */}
      <div className="flex-1 min-w-0">
        {listings.length === 0 ? (
          <p className="text-center text-light-gray py-20 text-sm">
            No listings found.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 medium:grid-cols-3 2xl:grid-cols-4 gap-8">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                data={listing}
                currentUser={currentUser}
                isSelected={selectedListingId === listing.id}
                onSelect={() => handleCardSelect(listing.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sticky map sidebar – visible from "phone" breakpoint up */}
      <div className="hidden phone:block sticky top-[120px] self-start h-[calc(100vh-160px)] w-[38%] shrink-0 rounded-xl overflow-hidden shadow-md border border-border-gray">
        <MapContainer
          listings={listings}
          selectedListingId={selectedListingId}
          onSelectListing={handleSelectListing}
        />
      </div>
    </div>
  );
};

export default ListingsMapView;
