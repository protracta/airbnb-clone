"use client";

import { useCallback, useMemo, useRef } from "react";
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { useRouter } from "next/navigation";
import { SafeListing } from "../types";

interface MapComponentProps {
  listings: SafeListing[];
}

const containerStyle = {
  width: "100%",
  height: "100%",
};

const DEFAULT_CENTER = { lat: 20, lng: 0 };
const DEFAULT_ZOOM = 2;

const MapComponent: React.FC<MapComponentProps> = ({ listings }) => {
  const router = useRouter();
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  });

  const validListings = useMemo(
    () =>
      listings.filter((listing) => {
        const hasCoords =
          listing.latitude != null && listing.longitude != null;
        if (!hasCoords && process.env.NODE_ENV === "development") {
          console.warn(
            `[MapComponent] Listing "${listing.title}" (${listing.id}) has no coordinates — skipping marker.`
          );
        }
        return hasCoords;
      }),
    [listings]
  );

  const center = useMemo(() => {
    if (validListings.length === 0) return DEFAULT_CENTER;
    const avgLat =
      validListings.reduce((sum, l) => sum + (l.latitude as number), 0) /
      validListings.length;
    const avgLng =
      validListings.reduce((sum, l) => sum + (l.longitude as number), 0) /
      validListings.length;
    return { lat: avgLat, lng: avgLng };
  }, [validListings]);

  const handleMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      if (validListings.length > 1) {
        const bounds = new window.google.maps.LatLngBounds();
        validListings.forEach((listing) => {
          bounds.extend({
            lat: listing.latitude as number,
            lng: listing.longitude as number,
          });
        });
        map.fitBounds(bounds);
      }
    },
    [validListings]
  );

  const handleMarkerClick = useCallback(
    (listingId: string) => {
      router.push(`/rooms/${listingId}`);
    },
    [router]
  );

  if (loadError) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-hover-gray rounded-xl border border-border-gray">
        <div className="text-center px-4">
          <p className="text-light-gray text-sm font-medium">
            Unable to load map
          </p>
          <p className="text-light-gray text-xs mt-1">
            Please check your connection and try again.
          </p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-hover-gray rounded-xl border border-border-gray animate-pulse">
        <p className="text-light-gray text-sm font-medium">Loading map…</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-border-gray">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={validListings.length === 0 ? DEFAULT_ZOOM : 12}
        onLoad={handleMapLoad}
        options={{
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          zoomControlOptions: {
            position: 7, // RIGHT_CENTER
          },
        }}
      >
        {validListings.map((listing) => (
          <MarkerF
            key={listing.id}
            position={{
              lat: listing.latitude as number,
              lng: listing.longitude as number,
            }}
            title={listing.title}
            onClick={() => handleMarkerClick(listing.id)}
          />
        ))}
      </GoogleMap>

      {validListings.length === 0 && isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl px-4 py-3 shadow-md">
            <p className="text-dark-gray text-sm font-medium text-center">
              No listings in this area
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapComponent;
