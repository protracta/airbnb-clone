# Product Requirements Document

## Problem
Users browsing Airbnb listings lack visual context about property locations. Currently, the listing search page displays results in a list format without geographic visualization, making it difficult for users to understand neighborhood context, proximity to amenities, or compare locations across multiple properties. Adding an interactive map to the listings page will give users spatial awareness and reduce decision friction.

## Goals
1. Display an interactive Google Map on the listings search page showing pins for all filtered listings.
2. Synchronize map markers with the current search filters (`locationValue`, `guestCount`, `roomCount`).
3. Enable users to click a map marker to view or highlight the corresponding listing in the list.
4. Support zooming and panning the map without losing filter state.
5. Load map data efficiently without blocking initial page render.

## Non-Goals
- Streetview, satellite imagery, or advanced map layers.
- Marker clustering (initial MVP assumes reasonable result counts per search).
- Real-time marker updates or live collaboration features.
- Mobile-responsive map layout optimization (desktop-first for this release).
- Custom marker icons or styling beyond Google Maps defaults.

## User Stories
- As a **guest searching for accommodations**, I want to **see where listings are located on a map** so that **I can understand neighborhood proximity and make geographically informed decisions**.
- As a **guest with location preferences**, I want to **interact with the map (zoom, pan) and still see my filtered results** so that **I can explore properties in specific areas**.
- As a **guest evaluating multiple properties**, I want to **click a map marker and have the listing highlighted in the list** so that **I can quickly cross-reference location and amenities**.

## Solution Design

### UI Layout
- **Search page template:** Add a two-column layout where the left column contains the listings list (existing) and the right column contains a fixed or sticky Google Map container.
- **Map container:** Minimum 400px height, responsive width (50% of viewport on desktop, or full-width stacked on smaller screens if needed).
- **Marker interaction:** Hovering or clicking a marker highlights the corresponding listing card in the list; clicking a listing card pans the map to center that marker.

### Map Behavior
- **Initialization:** On page load, the map centers on the search `locationValue` (converted to lat/lng via Geocoding API or stored in database).
- **Bounds fitting:** If multiple listings exist, fit the map bounds to show all markers in view.
- **Zoom level:** Default to zoom level 12 for city-level searches; adjust dynamically based on bounds.
- **Filter synchronization:** Redraw markers whenever `guestCount`, `roomCount`, or `locationValue` changes in the URL.

### Data Flow
1. Search page fetches listings from `/api/listings?locationValue=...&guestCount=...&roomCount=...`.
2. API response includes listing location data (latitude, longitude, address).
3. Component renders list and instantiates Google Map with marker array.
4. Event handlers sync marker clicks with list highlights.

## Data Model

### Listings Table (Prisma Schema)
```prisma
model Listing {
  id           String   @id @default(cuid())
  title        String
  description  String?
  imageSrc     String
  category     String
  roomCount    Int
  bathroomCount Int
  guestCount   Int
  locationValue String  // e.g., "new-york-ny"
  
  // NEW: Geographic data for map
  latitude     Float    // Decimal degrees, e.g., 40.7128
  longitude    Float    // Decimal degrees, e.g., -74.0060
  
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  @@index([locationValue])
  @@index([latitude, longitude])
}
```

### API Response Schema
```json
{
  "id": "listing-123",
  "title": "Cozy Apartment in SoHo",
  "roomCount": 2,
  "guestCount": 4,
  "latitude": 40.7245,
  "longitude": -74.0022,
  "locationValue": "new-york-ny",
  "imageSrc": "..."
}
```

### Location Service (Utility)
- **Purpose:** Convert `locationValue` (human-readable) to (lat, lng) for map centering.
- **Implementation:** Lookup table (hardcoded or database-backed) mapping location slugs to default coordinates, OR integrate Google Geocoding API on demand.
- **Fallback:** Default to (0, 0) with warning log if location not found.

## Acceptance Criteria
1. **Map renders on search page:** When the listings search page loads with valid search params, a Google Map is visible next to the listings list without errors.
2. **Markers display correctly:** All listings returned by the API call are represented by pins on the map at their stored latitude/longitude coordinates.
3. **Map centers on search location:** The map's initial center point matches the geographic center of the `locationValue` parameter.
4. **Filter synchronization:** Changing `guestCount`, `roomCount`, or `locationValue` in the URL causes the map to redraw with only matching listing markers.
5. **Marker interaction works:** Clicking a map marker highlights the corresponding listing card in the list; clicking a listing card pans the map to that marker.
6. **Bounds adjustment:** If multiple listings are present, the map automatically fits all markers in the viewport without manual user zoom.
7. **No blocking load:** The map does not block the initial page render; listing data is visible while the map initializes asynchronously.
8. **Mobile graceful degradation:** On screens <768px, the map is either hidden, stacked below the list, or displays a message directing users to desktop view (based on product decision).

## Edge Cases
- **No listings found:** Map displays but shows center point only (no markers); list is empty.
- **Invalid locationValue:** Map falls back to world view (0, 0); errors are logged; user can still refine search.
- **Missing lat/lng data:** Listings without coordinate data are excluded from map but still appear in list (with warning in logs).
- **Viewport too small for two-column layout:** Graceful stack or hide map (see acceptance criterion 8).
- **Slow API response:** Map initializes with cached or default bounds; markers append as data arrives.
- **User zooms/pans away:** Filter changes still update markers in viewport; map does not force re-center unless user expects it.

## Out of Scope
- Advanced filtering by map drag-rectangle (deferred to v2).
- Save or bookmark favorite map regions.
- Directions, transit, or routing information.
- Place search suggestions tied to map (e.g., "Restaurants near listing").
- Offline map caching.
- Map-based listing creation or editing flows.

---

## Implementation Notes

### Dependencies
- `@react-google-maps/api` (already in tech stack).
- Google Maps API key (must be provisioned and added to environment config).
- Geocoding API (optional, only if dynamic location → lat/lng conversion is needed).

### Database Migration
- Add `latitude` and `longitude` columns to the `Listing` table.
- Backfill existing listings with coordinates (manual seeding or batch script).

### Testing Strategy
- Unit tests for location → lat/lng lookup function.
- Integration test: API returns listings with valid coordinates.
- E2E test: Search page loads, map renders, marker counts match listing count.
- E2E test: Filter changes redraw map correctly.
- Manual QA: Marker click/list highlight interaction, bounds fitting, mobile responsiveness.

### Known Ambiguities
1. **Location slug to coordinates:** Should we use a hardcoded lookup table, database seeding, or real-time Geocoding API calls? (Recommend: database lookup for performance.)
2. **Mobile layout:** Hide map, stack below list, or show smaller version? (Recommend: product decision session.)
3. **Existing listing data:** Do current listings in the database have coordinates? If not, when/how do we backfill? (Recommend: pre-launch data audit and migration plan.)