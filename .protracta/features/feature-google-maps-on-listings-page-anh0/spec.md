# Product Requirements Document

## Problem

Users browsing Airbnb listings lack a visual spatial context for where properties are located. Currently, the search results page displays listings as a vertical list without geographic orientation, forcing users to mentally map locations or open external tools to understand neighborhood density, proximity to landmarks, or travel distances between listings.

## Goals

1. **Reduce cognitive load:** Display listings on an interactive map alongside the list view so users understand property locations without context switching.
2. **Enable spatial filtering:** Allow users to visually identify clusters of properties and make location-based decisions in a single interface.
3. **Maintain search consistency:** Map should respect existing `locationValue`, `guestCount`, and `roomCount` search parameters without breaking the current search flow.
4. **Ship with zero performance regression:** Map rendering must not degrade listing page load time or responsiveness.
5. **Prepare for future interactivity:** Establish data model and component structure to support map-based filtering (e.g., "show only listings in this region") in later releases.

## Non-Goals

- Map-based search initiation (users still search via the existing search bar).
- Custom map styling or branding beyond Google Maps defaults.
- Real-time listing updates as users pan/zoom the map.
- Clustering or heatmap visualization of listing density.
- Directions, routing, or transit information display.
- Mobile-optimized map layout (responsive, but not mobile-first).

## User Stories

- As a **guest browsing listings**, I want to see properties plotted on a map so that I can understand their geographic distribution and proximity to each other.
- As a **guest with a location preference**, I want the map to center on my search location so that I immediately see where results are clustered.
- As a **guest evaluating properties**, I want to click a map marker and see the corresponding listing highlighted in the list so that I can cross-reference details quickly.
- As a **guest applying filters**, I want the map to update when I change guest/room count so that I see only relevant properties.

## Acceptance Criteria

### Display & Rendering
- [ ] Map container renders on the search results page (right column, below filters on desktop; collapsible or hidden on small screens).
- [ ] Map displays Google Maps with default `zoom: 12` when `locationValue` is provided; shows world map if no location.
- [ ] All listings returned by `/api/listings` (filtered by `guestCount`, `roomCount`, `locationValue`) are plotted as markers on the map.
- [ ] Markers use a consistent, recognizable icon; show listing price on hover (tooltip or popup).

### Interaction
- [ ] Clicking a marker on the map highlights/scrolls to the corresponding listing in the list view.
- [ ] Clicking a listing in the list view centers the map on that property's marker.
- [ ] Map center updates when `locationValue` search param changes (e.g., user searches a new city).
- [ ] Marker set updates when `guestCount` or `roomCount` changes (filters apply to map).

### Data & API
- [ ] `/api/listings` response includes `latitude` and `longitude` for each listing (or they are derived from `locationValue` and property address).
- [ ] Map queries the same `/api/listings` endpoint with existing search params; no new backend endpoint required.

### Performance
- [ ] Map library (@react-google-maps/api) is lazy-loaded or code-split to avoid blocking initial page load.
- [ ] Rendering 100+ markers does not cause noticeable lag (benchmark: <200ms render time on mid-range device).
- [ ] Listing page Lighthouse performance score does not drop more than 5 points after map integration.

### Accessibility & UX
- [ ] Map is keyboard-navigable (pan/zoom via arrow keys; marker focus via Tab).
- [ ] Map container has `role="region"` and descriptive `aria-label`.
- [ ] Marker tooltips and popups are readable by screen readers.

## Solution Design

### Architecture Overview

The map will be integrated as a new **MapView** component on the search results layout:

```
SearchPage (layout)
├── Filters sidebar (left column)
├── ListingsView (center/full width)
└── MapView (right column or overlay)
```

### Component Structure

```
MapView
├── GoogleMap (container, manages center/zoom state)
├── MarkerCluster (future: deferred to phase 2)
└── MarkerList
    └── Marker (each listing)
        ├── icon (price badge)
        └── InfoWindow (hover tooltip)
```

### Data Flow

1. **Search page** reads URL params: `locationValue`, `guestCount`, `roomCount`.
2. **ListingsView** fetches from `/api/listings?locationValue=...&guestCount=...&roomCount=...`.
3. **MapView** subscribes to the same fetch query result; extracts `latitude`, `longitude` from each listing.
4. **Google Maps API** renders markers at those coordinates.
5. **User interaction:** Clicking marker → emit event → scroll list view to matching listing; clicking list item → emit event → pan map to marker.

### Map Center & Bounds Logic

- **On page load:** If `locationValue` is provided, geocode it (using Google Maps Geocoding API or pre-store coords in listing seed data) and center map at those coords with `zoom: 12`.
- **On search param change:** Re-center if `locationValue` changes; update markers if `guestCount` or `roomCount` changes.
- **Fallback:** If no `locationValue`, show world map centered at `{lat: 20, lng: 0}` with `zoom: 1`.

### Environment & API Keys

- Google Maps API key stored in `.env.local` as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- @react-google-maps/api library configured in `_document.tsx` or a wrapper component.

## Data Model

### Listings Table (existing; no changes required)

```prisma
model Listing {
  id              String   @id @default(cuid())
  title           String
  description     String?
  imageSrc        String
  category        String
  roomCount       Int
  bathroomCount   Int
  guestCount      Int
  locationValue   String   // e.g., "San Francisco, CA"
  
  // NEW FIELDS for map integration
  latitude        Float    // Derived from locationValue or user input
  longitude       Float    // Derived from locationValue or user input
  
  price           Int      // in cents
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Migration note:** Backfill `latitude` and `longitude` for existing listings by:
1. Geocoding `locationValue` via Google Maps Geocoding API or a batch script.
2. Running a one-time Prisma migration to populate these fields.

### API Response Shape

```json
{
  "listings": [
    {
      "id": "abc123",
      "title": "Cozy flat in Mission",
      "latitude": 37.7596,
      "longitude": -122.4148,
      "price": 15000,
      "imageSrc": "...",
      "roomCount": 1,
      "guestCount": 2
    }
  ]
}
```

## Edge Cases

1. **Missing coordinates:** If a listing lacks `latitude`/`longitude`, log a warning and skip marker rendering (do not crash map).
2. **Duplicate locations:** Multiple listings at identical coordinates will have overlapping markers; add a small random offset (±0.0001 degrees) to prevent visual overlap.
3. **Empty results:** If no listings match filters, show an empty map centered on `locationValue` with a "No properties found" message.
4. **Geocoding failure:** If `locationValue` cannot be geocoded, center map on a fallback region (e.g., entire country) with `zoom: 5`.
5. **Slow network:** Map should render skeleton/placeholder markers while listings are being fetched; swap in real data when ready.
6. **Zoom constraints:** Clamp zoom level to `[2, 18]` to prevent over-zoom or under-zoom artifacts.

## Open Questions

1. **Coordinate source:** Should `latitude`/`longitude` be stored in the database, or should we geocode `locationValue` on-the-fly? (Recommendation: store in DB for performance; geocode once during listing creation.)
2. **Marker click behavior:** Should clicking a marker open an info window with listing summary, or just scroll/highlight the list item? (Recommendation: MVP is scroll/highlight; info window deferred to phase 2.)
3. **Mobile layout:** Is the map hidden on mobile by default, or visible in a half-screen drawer? (Recommendation: hidden by default; toggle button to open drawer.)
4. **Map library cost:** Does the project have a Google Maps API budget limit? Map with 100+ markers may incur charges. (Recommendation: confirm quota; consider free tier limits.)
5. **Listing seed data:** Do existing listings in the database have valid `locationValue` entries? (Recommendation: audit and backfill before migration.)
6. **Real-time updates:** If listings are added/removed while user views the map, should the map auto-update? (Recommendation: No in MVP; deferred to phase 2 with WebSocket or polling.)

---

## Implementation Notes

- **Phase 1 (this release):** Basic map rendering, marker display, marker-to-list linking.
- **Phase 2 (deferred):** Clustering, heatmaps, region-based filtering, mobile drawer, real-time updates.
- **Testing:** Write unit tests for geocoding logic, integration tests for marker rendering, E2E tests for marker-list synchronization.