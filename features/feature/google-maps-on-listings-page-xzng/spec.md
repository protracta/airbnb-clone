# Product Requirements Document

## Problem

Users browsing Airbnb listings cannot visualize property locations on a map, forcing them to rely solely on text addresses and individual listing details to assess neighborhood geography and proximity to points of interest. This creates friction in the decision-making process and reduces confidence in location-based choices.

## Goals

1. **Display interactive map** on the listings search page centered on the searched location with all filtered listings pinned.
2. **Enable location-aware filtering** by allowing users to see which listings fall within their search geography.
3. **Reduce cognitive load** by providing a visual alternative to scrolling through text-based address listings.
4. **Support existing search parameters** (`locationValue`, `guestCount`, `roomCount`) without disrupting current navigation flow.
5. **Maintain performance** with map rendering under 2s page load time, even with 100+ listings visible.

## Non-Goals

- Turn-by-turn directions or routing between listings.
- Real-time traffic or transit overlay data.
- Clustering or heatmap views for large datasets (MVP scope).
- Map-based search initiation (e.g., draw radius to filter); filtering remains URL-param driven.
- Mobile-responsive map UX optimization (v1 targets desktop).

## User Stories

- **As a guest**, I want to see all search results plotted on a map so that I can understand the geographic spread of available properties.
- **As a guest**, I want to click a pin on the map so that I can quickly jump to that listing's details.
- **As a guest**, I want the map to auto-center on my search location so that I don't have to manually navigate the viewport.
- **As a host**, I want my listings visible on the map when guests search my area so that location-conscious bookings increase.

## Acceptance Criteria

### Functional
1. **Map renders** on the listings search page when `locationValue` is present in URL params.
2. **All listings** matching current filters (`locationValue`, `guestCount`, `roomCount`) are pinned with distinct markers.
3. **Clicking a pin** navigates to or highlights the corresponding listing in the list.
4. **Map centers** automatically on the geocoded `locationValue` with appropriate zoom level (e.g., zoom 12 for city-level search).
5. **Search params are preserved** when interacting with the map (no accidental filter loss).

### Technical
6. **Google Maps API** is initialized with API key from environment variables (no client-side key exposure).
7. **Geocoding** of `locationValue` returns valid lat/lng coordinates; invalid locations display error toast and fallback map view.
8. **Listing coordinates** are sourced from Prisma listing records (assumes lat/lng fields exist or are derived from address).
9. **Map performance**: render completes within 2s for up to 100 listings; lazy-load marker windows on hover/click.
10. **TypeScript** types are strict; no `any` usage in map component.

### UX
11. **Markers are visually distinct** from each other (color, size, or numbering) to aid identification.
12. **Error states** (e.g., invalid location, API quota exceeded) display user-friendly messaging.
13. **Map is responsive to filter changes**—re-querying `/api/listings` and re-rendering pins when params change.

## Edge Cases

1. **No listings found**: Map renders centered on location; empty state message displayed.
2. **Multiple listings at same coordinate**: Markers cluster or stack visually to avoid overlap.
3. **Listing lacks lat/lng in database**: Default to geocoding the listing address field; log warning if both are absent.
4. **Geocoding API fails**: Display error toast, render map centered on a default location (e.g., San Francisco), allow user to still browse list.
5. **User searches non-existent location**: Geocoding returns null; error toast prompts user to refine search.
6. **Network latency on `/api/listings`**: Show skeleton loading state on map while data is in flight.
7. **Very high zoom levels**: Pins may cluster or become unresponsive; implement graceful zoom limit.

## Out of Scope

- Saving favorite listings with persistent pins.
- Collaborative map-sharing links.
- Drawing polygons or custom search areas on the map.
- Integrating transit, restaurants, or amenity layers.
- Mobile app map functionality (web desktop only in v1).
- Offline map data caching.

---

## Solution Design

### Architecture Overview

**Component Hierarchy**
```
SearchPage (app/search/page.tsx)
├── SearchFilters
├── ListingsMap (new)
│   ├── GoogleMap wrapper
│   ├── MarkerList
│   └── InfoWindow (on hover/click)
└── ListingsList
```

**Data Flow**
1. User performs search with `locationValue`, `guestCount`, `roomCount` URL params.
2. SearchPage fetches listings via `GET /api/listings?locationValue=...&guestCount=...&roomCount=...`.
3. ListingsMap receives listings array, geocodes `locationValue` to lat/lng, renders map centered on that point.
4. For each listing, a marker is placed at its stored lat/lng (or geocoded address).
5. Clicking a marker highlights the listing card in the list below (scroll-into-view or visual highlight).

**Integration Points**
- **@react-google-maps/api**: Provides `GoogleMap`, `Marker`, `InfoWindow` components. Initialize with `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- **Prisma**: Listings must include `latitude` and `longitude` fields (or `address` field for fallback geocoding).
- **Existing `/api/listings` endpoint**: No changes; map consumes same data structure.

### Component Specification

**ListingsMap.tsx** (new)

```typescript
interface ListingsMapProps {
  listings: Listing[];
  searchLocation: string; // locationValue from URL
  onMarkerClick: (listingId: string) => void;
}

export const ListingsMap: React.FC<ListingsMapProps> = ({
  listings,
  searchLocation,
  onMarkerClick,
}) => {
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Geocode searchLocation on mount
  useEffect(() => {
    if (!searchLocation) return;
    geocodeLocation(searchLocation)
      .then((coords) => {
        setMapCenter(coords);
        setError(null);
      })
      .catch(() => {
        setError("Could not find location. Try refining your search.");
        setLoading(false);
      })
      .finally(() => setLoading(false));
  }, [searchLocation]);

  if (loading) return <MapSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!mapCenter) return <ErrorBanner message="Unable to load map." />;

  return (
    <GoogleMap
      zoom={12}
      center={mapCenter}
      mapContainerClassName="w-full h-96"
    >
      {listings.map((listing) => (
        <Marker
          key={listing.id}
          position={{ lat: listing.latitude, lng: listing.longitude }}
          onClick={() => onMarkerClick(listing.id)}
          title={listing.title}
        />
      ))}
    </GoogleMap>
  );
};
```

**Helper: geocodeLocation.ts** (new)

```typescript
export async function geocodeLocation(
  location: string
): Promise<{ lat: number; lng: number }> {
  const response = await fetch("/api/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location }),
  });

  if (!response.ok) throw new Error("Geocoding failed");
  const { lat, lng } = await response.json();
  return { lat, lng };
}
```

**API Endpoint: /api/geocode** (new)

```typescript
// pages/api/geocode.ts
import { google } from "@googlemaps/js";

export default async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  const { location } = req.body;
  if (!location) return res.status(400).json({ error: "location required" });

  try {
    const geocoder = new google.maps.Geocoder();
    const result = await geocoder.geocode({ address: location });

    if (!result.results.length) {
      return res.status(404).json({ error: "Location not found" });
    }

    const { lat, lng } = result.results[0].geometry.location;
    res.status(200).json({ lat, lng });
  } catch (err) {
    res.status(500).json({ error: "Geocoding error" });
  }
};
```

---

## Data Model

### Listing Record (Prisma Schema)

**Current assumption**: Listings table already exists. Required fields for map:

```prisma
model Listing {
  id            String   @id @default(cuid())
  title         String
  address       String   // Fallback for geocoding if lat/lng missing
  latitude      Float    // NEW: store geocoded latitude
  longitude     Float    // NEW: store geocoded longitude
  guestCount    Int
  roomCount     Int
  // ... other fields
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

**Migration**:
- Add `latitude` and `longitude` as non-nullable `Float` fields to `Listing`.
- Seed existing listings by geocoding their `address` field; store results.
- Future listings must include lat/lng at creation time (via host onboarding or admin panel).

### API Response (Listings Endpoint)

**No schema change required**; existing response already includes address. Map component extracts:

```json
{
  "id": "listing-1",
  "title": "Cozy Apartment",
  "address": "123 Market St, San Francisco, CA",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "guestCount": 2,
  "roomCount": 1
}
```

### Geocode Cache (Optional, Future)

To reduce redundant Google Maps API calls:

```prisma
model GeoCache {
  id        String   @id @default(cuid())
  location  String   @unique // normalized location string
  latitude  Float
  longitude Float
  createdAt DateTime @default(now())
  expiresAt DateTime // 30-day TTL
}
```

---

## Open Questions

1. **Listing Coordinates Source**: Do existing listings have lat/lng stored, or must we geocode all addresses during migration?
2. **Marker Styling**: Should markers be colored by price range, availability, or uniform? Any brand guidelines?
3. **Zoom Level Logic**: Should zoom auto-adjust based on bounding box of all listings, or fixed at zoom 12?
4. **Marker Click Behavior**: Scroll listing into view, highlight card, or open inline preview window?
5. **Google Maps API Key Management**: Where will `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` be stored (env file, secret manager)?
6. **Geocoding Rate Limits**: Should we implement caching to avoid hitting Google's quota on repeated searches?
7. **Mobile Roadmap**: Is this feature desktop-only in v1, or should responsive map design be in scope?