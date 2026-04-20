# Product Requirements Document

## Problem
Users browsing Airbnb listings lack spatial context when evaluating properties. Without a visual map showing listing locations, users must mentally reconstruct geography from text descriptions and addresses, leading to slower decision-making and incomplete location assessment relative to landmarks, transit, and neighborhoods.

## Goals
1. **Render listings on an interactive Google Map** on the search results page, keyed to the `locationValue` search parameter.
2. **Enable location-based visual filtering** so users can identify clusters of properties and evaluate neighborhood desirability at a glance.
3. **Maintain search state consistency** between map interactions and listing filters (guestCount, roomCount, locationValue).
4. **Load map data efficiently** without blocking search results—lazy load or defer non-critical map assets.
5. **Support touch and desktop interactions** (pan, zoom, marker hover/click).

## Non-Goals
- Street-level imagery (Street View integration).
- Heatmaps or density visualizations of demand.
- Reverse geocoding to auto-populate search filters from map clicks.
- Offline map support or caching.
- Multi-location simultaneous display (e.g., comparing two searches on one map).

## User Stories
- As a **guest**, I want to see all search results pinned on a map so that I can visualize neighborhoods and proximity to landmarks.
- As a **guest**, I want to click a marker on the map so that the corresponding listing is highlighted or a preview card appears.
- As a **guest**, I want the map to update when I refine my filters (guests, rooms) so that I always see contextually relevant locations.
- As a **host**, I want my listing location to display accurately on the search map so that potential guests discover my property geographically.

## Acceptance Criteria

### Functional
1. **Map renders on search results page** when a `locationValue` query parameter is present and valid.
2. **Listing markers appear** for all listings matching the current filters (guestCount, roomCount, locationValue).
3. **Marker displays listing title and price** in a tooltip on hover.
4. **Clicking a marker** scrolls to or highlights the corresponding listing card in the search results list, or opens an inline preview.
5. **Map center and zoom adjust** to fit all displayed markers on initial load.
6. **Clearing filters or changing locationValue** updates the map markers in real time.
7. **Map respects responsive layout** on mobile (smaller container, touch-friendly zoom controls).

### Non-Functional
1. **Google Maps API loads asynchronously** and does not block page render.
2. **Map initialization completes within 2 seconds** on a standard 4G connection.
3. **No console errors** related to missing API keys or invalid coordinates.
4. **Listing coordinates** (latitude/longitude) are persisted in the database and fetched via `/api/listings`.

### Data Integrity
1. **All listings returned from `/api/listings` include `latitude` and `longitude` fields** or a fallback geocoding strategy is defined.
2. **Invalid or missing coordinates** do not crash the map; a fallback bounds or error message is shown.

## Out of Scope
- **Booking directly from map markers** (stays in listing detail view).
- **Advanced map layers** (public transit, satellite view toggles in this release).
- **Analytics tracking** of map interactions (logged separately).
- **Saved/bookmarked locations** on the map.
- **Customizable marker colors** or icon styles.

---

## Solution Design

### Architecture Overview
The Google Maps integration is implemented as a **sibling component** to the listings grid on the search page, sharing the same filtered dataset. The map state (center, zoom, visible markers) is derived from the current search params and listings API response—not a separate source of truth.

### Component Hierarchy
```
<SearchPage>
  ├─ <SearchFilters>        (guestCount, roomCount inputs)
  ├─ <ListingsMap>          (new; renders <GoogleMap> + manages markers)
  │  └─ <GoogleMap>         (@react-google-maps/api)
  │     └─ <MarkerClusterer> (optional; clusters overlapping markers)
  │        └─ <Marker>      (per listing)
  └─ <ListingsGrid>         (existing; shows cards)
```

### Data Flow
1. **Search page URL params** → `locationValue`, `guestCount`, `roomCount`.
2. **API call** to `/api/listings?locationValue=...&guestCount=...&roomCount=...` returns listings array with `{ id, title, imageSrc, price, latitude, longitude, ... }`.
3. **ListingsMap component** receives listings array and renders a marker for each.
4. **Marker click** triggers highlight on corresponding listing card in the grid (via scroll or CSS class).
5. **Filter changes** cause API refetch → map markers update.

### Map Initialization & Configuration
- **Center**: Computed as average of all listing coordinates (or center of `locationValue` bounds if only one listing).
- **Zoom**: Fitted to bounds of all markers; default zoom level 12 if no listings.
- **API Key**: Loaded from `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (environment variable).
- **Libraries**: `@react-google-maps/api` v2.19+ configured with `GoogleMap`, `MarkerClusterer`, and `Marker` components.

### Marker Interaction
- **Hover**: Tooltip displays listing title and price (e.g., "Cozy Apartment • $120/night").
- **Click**: 
  - Scroll listing grid to focus the clicked listing card.
  - Add `.highlight` CSS class to listing card (e.g., border or shadow effect).
  - Remove highlight when user clicks another marker or clears selection.
- **Clustered markers** (if overlapping): Click cluster to zoom in; on final zoom, individual markers appear.

### Error Handling
- **Missing API Key**: Render fallback message "Map unavailable" without crashing page.
- **Invalid coordinates**: Exclude marker; log warning; continue rendering valid markers.
- **No listings**: Render empty map centered on `locationValue` geocoded center.
- **Geocoding failure** (locationValue → bounds): Center map on hardcoded default (e.g., city center) or skip map.

---

## Data Model

### Listings Table (Prisma Schema)
Extend the existing `Listing` model to include geolocation:

```prisma
model Listing {
  id            String      @id @default(cuid())
  title         String
  description   String
  imageSrc      String
  price         Int
  roomCount     Int
  guestCount    Int
  bathroomCount Int
  locationValue String      // e.g., "San Francisco, CA" or postal code
  latitude      Float       // NEW: decimal degrees
  longitude     Float       // NEW: decimal degrees
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  
  // Relations
  reservations  Reservation[]
  
  @@index([locationValue])
  @@index([latitude, longitude]) // For spatial queries in future
}
```

### API Response Structure
`GET /api/listings?locationValue=...&guestCount=...&roomCount=...` returns:

```json
[
  {
    "id": "abc123",
    "title": "Cozy Apartment",
    "price": 120,
    "imageSrc": "/image.jpg",
    "roomCount": 1,
    "guestCount": 2,
    "bathroomCount": 1,
    "locationValue": "San Francisco, CA",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "createdAt": "2024-01-15T10:00:00Z"
  },
  ...
]
```

### Client-Side Component State (React)
```typescript
interface ListingWithLocation extends Listing {
  latitude: number;
  longitude: number;
}

interface ListingsMapState {
  listings: ListingWithLocation[];
  selectedListingId: string | null;
  mapCenter: google.maps.LatLngLiteral;
  mapZoom: number;
  isLoading: boolean;
  error: string | null;
}
```

### Database Migration Strategy
- Add `latitude` and `longitude` columns to `listings` table as `FLOAT` (nullable initially).
- For existing listings without coordinates, run a migration script:
  - Use Google Geocoding API (or Nominatim) to batch-geocode by `locationValue`.
  - Populate `latitude`, `longitude` fields.
  - Make columns `NOT NULL` after backfill.
- New listings created via admin/API must include coordinates (validated at creation).

---

## Edge Cases

1. **Multiple listings at identical coordinates**: Markers overlap; use `MarkerClusterer` to group them visually.
2. **Listing in ocean or invalid location**: Coordinates stored but visually distant from city center; display with warning tooltip.
3. **User zooms out to world view**: Many markers crowd the map; clustering handles this automatically.
4. **Search returns 0 listings**: Map renders but is empty; show centered message "No listings in this area."
5. **locationValue is ambiguous** (e.g., "Springfield"): Use API parameter or config to disambiguate (state/country); document expected format.
6. **User is offline**: Map script fails to load; graceful fallback to listings-only view.
7. **API response missing `latitude`/`longitude` for some listings**: Skip those markers; log warning; show remaining listings on map.
8. **Mobile viewport too small for side-by-side layout**: Stack map above listings grid; make map full-width or collapsible.

---

## Open Questions

1. **Layout**: Should the map appear on the left or right of the listings grid? Or full-width above on mobile?
2. **Map persistence**: Does the map stay in view as the user scrolls the listings list, or does it disappear when scrolling?
3. **Marker clustering threshold**: At what zoom level should clusters form, and what's the minimum marker count to trigger clustering?
4. **Coordinate source**: Will listings coordinates be entered by hosts at creation time, auto-geocoded on the backend, or batch-loaded from a third-party data source?
5. **Mobile UX**: Is the map mandatory on mobile, or should it be a toggle ("Show Map" button)?
6. **Accessibility**: What ARIA labels and keyboard navigation are required for map interactions?
7. **Performance**: What is the acceptable number of listings on a single map before we paginate or filter further?
8. **Existing listing data**: Do all current listings have coordinates in the database, or do we need a migration plan?