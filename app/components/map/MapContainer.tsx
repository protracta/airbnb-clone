"use client";

import { useCallback, useEffect, useState } from "react";
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import { SafeListing } from "@/app/types";

interface MapContainerProps {
  listings: SafeListing[];
  selectedListingId?: string | null;
  onSelectListing: (id: string | null) => void;
}

const containerStyle = {
  width: "100%",
  height: "100%",
};

const MapContainer: React.FC<MapContainerProps> = ({
  listings,
  selectedListingId,
  onSelectListing,
}) => {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [activeInfoWindowId, setActiveInfoWindowId] = useState<string | null>(null);

  const mappableListings = listings.filter((listing) => {
    if (listing.latitude == null || listing.longitude == null) {
      console.warn(`[MapContainer] Listing "${listing.id}" has no lat/lng – skipping marker.`);
      return false;
    }
    return true;
  });

  const fitBounds = useCallback(() => {
    if (!map || mappableListings.length === 0) return;

    if (mappableListings.length === 1) {
      map.setCenter({
        lat: mappableListings[0].latitude!,
        lng: mappableListings[0].longitude!,
      });
      map.setZoom(12);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    mappableListings.forEach((listing) => {
      bounds.extend({ lat: listing.latitude!, lng: listing.longitude! });
    });
    map.fitBounds(bounds);

    // Cap maximum zoom so pins aren't overly zoomed in
    const idleListener = map.addListener("idle", () => {
      const zoom = map.getZoom() ?? 0;
      if (zoom > 16) map.setZoom(16);
      window.google.maps.event.removeListener(idleListener);
    });
  }, [map, mappableListings]);

  useEffect(() => {
    fitBounds();
  }, [fitBounds]);

  // Pan to & open info window for the selected listing (triggered by card clicks)
  useEffect(() => {
    if (!map || !selectedListingId) return;
    const listing = mappableListings.find((l) => l.id === selectedListingId);
    if (!listing) return;
    map.panTo({ lat: listing.latitude!, lng: listing.longitude! });
    setActiveInfoWindowId(selectedListingId);
  }, [map, selectedListingId, mappableListings]);

  const handleMarkerClick = (listingId: string) => {
    setActiveInfoWindowId(listingId);
    onSelectListing(listingId);
  };

  const handleInfoWindowClose = () => {
    setActiveInfoWindowId(null);
    onSelectListing(null);
  };

  if (!apiKey || loadError) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-hover-gray rounded-xl border border-border-gray">
        <div className="text-center p-6">
          <p className="font-semibold text-dark-gray mb-1">Map unavailable</p>
          <p className="text-sm text-light-gray">
            Unable to load Google Maps. Please try again later.
          </p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-hover-gray rounded-xl border border-border-gray">
        <p className="text-light-gray text-sm animate-pulse">Loading map…</p>
      </div>
    );
  }

  if (mappableListings.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-hover-gray rounded-xl border border-border-gray">
        <p className="text-light-gray text-sm">No listings to display on map.</p>
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      options={{
        fullscreenControl: false,
        mapTypeControl: false,
        streetViewControl: false,
        zoomControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_CENTER,
        },
      }}
      onLoad={(mapInstance) => setMap(mapInstance)}
      onUnmount={() => setMap(null)}
    >
      {mappableListings.map((listing) => (
        <Marker
          key={listing.id}
          position={{ lat: listing.latitude!, lng: listing.longitude! }}
          onClick={() => handleMarkerClick(listing.id)}
          animation={
            selectedListingId === listing.id
              ? window.google.maps.Animation.BOUNCE
              : undefined
          }
        >
          {activeInfoWindowId === listing.id && (
            <InfoWindow
              position={{ lat: listing.latitude!, lng: listing.longitude! }}
              onCloseClick={handleInfoWindowClose}
            >
              <div className="p-1 max-w-[200px]">
                <p className="font-semibold text-sm text-dark-gray truncate">
                  {listing.title}
                </p>
                <p className="text-xs text-light-gray mt-1">
                  ₹ {listing.price} / night
                </p>
                <a
                  href={`/rooms/${listing.id}`}
                  className="text-xs text-accent-pink mt-2 block hover:underline font-medium"
                >
                  View listing →
                </a>
              </div>
            </InfoWindow>
          )}
        </Marker>
      ))}
    </GoogleMap>
  );
};

export default MapContainer;
