# Product Requirements Document

## Problem
Users searching for listings on the Airbnb Clone cannot visually locate properties on a map, forcing them to scan text-based results without geographic context. This reduces confidence in property selection and prevents quick spatial comparison of multiple listings relative to landmarks, transit, or neighborhood boundaries.

## Goals
1. **Render a functional Google Map** on the listings search page that displays all filtered listings as markers.
2. **Synchronize map markers with search filters** — map updates in real-time when `locationValue`, `guestCount`, or `roomCount` query parameters change.
3. **Enable property discovery via map interaction** — clicking a marker reveals or highlights the corresponding listing card in the results list.
4. **Load map performance within 2 seconds** on standard connections (3G+) for up to 50 listings.
5. **Support mobile responsiveness** — map is usable on viewports ≥375px width.

## Non-Goals
- Clustering or heatmap visualization of dense marker regions (defer to Phase 2).
- Booking directly from the map interface.
- Street View or 3D building models.
- Offline map caching or offline-first capability.
- Integration with user's saved/favorited listings from the map view.

## User Stories

- **As a guest**, I want to see all available listings pinned on a map while filtering by location and guest count, so that I can understand property density and spatial distribution before reading details.
- **As a guest**, I want to click a map marker and have the corresponding listing card scroll into view and highlight, so that I can quickly navigate between map and list views.
- **As a guest on mobile**, I want the map to occupy the full width and remain responsive, so that I can explore listings without layout breakage.
- **As a property searcher**, I want the map to update automatically when I change filters, so that I do not have to manually refresh or navigate to a different page.

## Acceptance Criteria

### Functional
1. **Map Renders on Search Page**
   - Google Map component is mounted and visible on `/listings` page.
   - Map displays a default center (e.g., San Francisco, CA) if no `locationValue` is provided.
   - Map shows ≥1 marker for every listing returned by `/api/listings` endpoint.

2. **Markers Sync with Search Filters**
   - When `locationValue` query param changes, map center and zoom adjust to the new location within 500ms.
   - When `guestCount` or `roomCount` filters change, markers update to reflect newly returned listings.
   - Markers persist for listings that remain in filtered results.

3. **Map-List Bidirectional Interaction**
   - Clicking a map marker highlights its corresponding listing card (e.g., border color, background tint).
   - Clicking or scrolling to a listing card in the list highlights its corresponding marker.
   - Highlight state is cleared when user clicks elsewhere on the map or list.

4. **Responsive Layout**
   - On desktop (≥1024px), map occupies right 50% of screen; listing cards occupy left 50%.
   - On tablet (768px–1023px), map is 60% width; listing cards are 40% or stacked below on scroll.
   - On mobile (<768px), map is full-width and toggleable via a "Show Map" / "Show List" button or tab switcher.
   - No horizontal scroll is introduced; content fits within viewport.

5. **Performance**
   - Map loads and renders 50 markers within 2 seconds on 3G network simulation.
   - Panning and zooming remain responsive (no visible lag >300ms).
   - Filtering operations that update markers complete within 1 second.

6. **Data Accuracy**
   - Every listing marker displays the correct latitude and longitude from the listing object.
   - Marker info window (if present) shows listing title and price; accurate to the data returned by `/api/listings`.

### Non-Functional
- No console errors or warnings related to Google Maps API or React component lifecycle.
- Google Maps API key is managed securely (not committed to repo; stored in `.env.local`).
- TypeScript compilation succeeds with no `any` types in the map component.

## Out of Scope

- **Advanced filtering by map area** (e.g., "only show listings within this drawn polygon") — deferred to Phase 2.
- **Marker customization** (e.g., different colors for price ranges, availability badges) — phase 2 enhancement.
- **Directions API integration** (showing travel time from a point of interest) — future roadmap.
- **Reviews or ratings overlay on map** — deferred; possible in a later release.
- **Saved listings synchronized with map state** — stored separately; no map-specific persistence layer in this release.

---

## Solution Design

### Component Architecture

```
/app/listings
├── page.tsx (Search Page)
│   ├── <SearchFilters /> (existing)
│   ├── <MapContainer />
│   │   ├── GoogleMap (from @react-google-maps/api)
│   │   └── MarkerRenderer
│   └── <ListingResults /> (existing, with highlight state)
```

#### MapContainer Component
- **Responsibility**: Owns Google Map instance and marker lifecycle.
- **Props**:
  - `listings: Listing[]` — array of listings to display.
  - `locationValue: string` — search location for map centering.
  - `selectedListingId?: string` — ID of listing whose marker should be highlighted.
  - `onMarkerClick: (listingId: string) => void` — callback when marker is clicked.
  - `onMapCenterChange?: (lat, lng) => void` — optional callback for reverse-geocoding or analytics.

- **Behavior**:
  - Uses `@react-google-maps/api`'s `GoogleMap` and `Marker` components.
  - Converts `locationValue` (e.g., "San Francisco, CA") to LatLng via Geocoding API or a lookup table (see Data Model).
  - Renders a marker for each listing; marker color/style changes on selection.
  - Attaches click handlers to markers; emits `onMarkerClick` with listing ID.
  - Re-renders markers whenever `listings` array changes (new filter applied).

#### Integration with Existing Components
- SearchFilters and ListingResults remain unchanged; parent page component orchestrates state.
- URL query params (`locationValue`, `guestCount`, `roomCount`) drive map and list updates via Next.js `useSearchParams()`.
- Highlight state is lifted to the page level and passed to both MapContainer and ListingResults.

### Map Initialization & Configuration

```typescript
const mapOptions: google.maps.MapOptions = {
  center: defaultCenter, // LatLng object (e.g., { lat: 37.7749, lng: -122.4194 })
  zoom: 12,
  mapTypeControl: true,
  fullscreenControl: true,
  zoomControl: true,
  streetViewControl: false, // disable for simplicity
  restriction: {
    // optional: restrict to a bounding box if needed
    latLngBounds: WORLD_BOUNDS,
  },
};
```

- **Default center**: San Francisco (37.7749, -122.4194) or dynamically set from first listing's location if available.
- **Zoom level**: 12 for city-scale view; auto-adjust if listings span multiple neighborhoods.
- **API Key**: Loaded from `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in environment.

### Marker Rendering Logic

```typescript
{listings.map((listing) => (
  <Marker
    key={listing.id}
    position={{ lat: listing.latitude, lng: listing.longitude }}
    onClick={() => onMarkerClick(listing.id)}
    icon={{
      path: google.maps.SymbolPath.CIRCLE,
      scale: selectedListingId === listing.id ? 12 : 8,
      fillColor: selectedListingId === listing.id ? '#FF5A5F' : '#3B82F6',
      fillOpacity: 1,
      strokeColor: '#fff',
      strokeWeight: 2,
    }}
    title={`${listing.title} - $${listing.price}`}
  />
))}
```

- **Marker size**: 8px baseline; 12px when selected (visual emphasis).
- **Color**: Blue (#3B82F6) by default; Airbnb red (#FF5A5F) when highlighted.
- **Info window** (optional for MVP): Simple tooltip showing title and price on hover or click.

---

## Data Model

### Listing Schema Extension

The existing `Listing` model in Prisma must include geospatial fields:

```prisma
model Listing {
  id            String   @id @default(cuid())
  title         String
  description   String?
  price         Int      // in cents or dollars; confirm with existing schema
  locationValue String   // e.g., "San Francisco, CA" — human-readable location
  latitude      Float    // Decimal degrees
  longitude     Float    // Decimal degrees
  guestCount    Int
  roomCount     Int
  imageUrl      String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([latitude, longitude])
  @@index([locationValue])
}
```

**Key Fields**:
- `latitude`, `longitude`: Required for map markers. Stored as Float (sufficient for ~1m precision).
- Indexes on geospatial columns improve filter performance if location-based queries scale.

### Location Lookup Table (Optional, Recommended)

To avoid repeated Geocoding API calls (which incur costs), maintain a cached mapping:

```prisma
model Location {
  id        String   @id @default(cuid())
  name      String   @unique // e.g., "San Francisco, CA"
  latitude  Float
  longitude Float
  zoom      Int      // recommended zoom level for this location (e.g., 12)
  createdAt DateTime @default(now())
}
```

**Rationale**:
- When user enters `locationValue` in search, look up its LatLng in this table.
- If not found, call Geocoding API, cache result, and use it.
- Reduces API calls and improves search performance.

### API Response (`/api/listings`)

Confirm the existing endpoint returns geospatial fields:

```json
[
  {
    "id": "xyz123",
    "title": "Cozy Studio in Mission District",
    "price": 120,
    "locationValue": "San Francisco, CA",
    "latitude": 37.7599,
    "longitude": -122.4148,
    "guestCount": 2,
    "roomCount": 1,
    "imageUrl": "..."
  }
]
```

**Note**: If the current endpoint does not include `latitude` and `longitude`, a migration is required before map feature ships.

### Map State Shape (Frontend)

```typescript
interface MapState {
  selectedListingId?: string; // ID of marker/listing user clicked
  center: google.maps.LatLng; // current map center
  zoom: number; // current zoom level
}
```

This state is managed at the page level and passed to MapContainer and ListingResults for highlight synchronization.

---

## Edge Cases

1. **No listings returned by filter**
   - Map renders but no markers appear.
   - Map center defaults to `locationValue` (or global default if `locationValue` is empty).
   - UI displays "No listings found" message in the list; map remains visible as visual feedback.

2. **Invalid `locationValue` (not recognized by Geocoding)**
   - Fallback to default center (San Francisco).
   - Log warning; optionally show toast: "Location not found; showing all listings."

3. **Listing has null or invalid lat/lng**
   - Marker is not rendered for that listing.
   - Listing card still appears in list view.
   - Log error for data quality investigation.

4. **User clicks marker while scrolling list**
   - Marker highlight updates immediately.
   - List should auto-scroll to highlight corresponding card (optional; confirm with design).

5. **Mobile: User toggles between map and list**
   - Map state (selected marker, zoom, center) persists across toggles.
   - Selected listing highlight remains synchronized.

6. **High-density area (e.g., 100+ listings in a small neighborhood)**
   - Markers may overlap; Clustering deferred to Phase 2.
   - Current release: markers render as-is; users can zoom in to resolve overlap.

---

## Open Questions

1. **Geocoding Strategy**: Should we use Google's Geocoding API on every search, or maintain a Location lookup table? (Impacts cost and latency.)
   - **Recommendation**: Start with lookup table for MVP; fallback to API if location is not cached.

2. **Marker Info Window**: Should clicking a marker show a popup with listing details (title, price, image thumbnail), or only highlight it in the list?
   - **Recommendation**: MVP shows tooltip on hover only; full info window deferred to Phase 2.

3. **Listing Data Migration**: Do all existing listings in the database have `latitude` and `longitude` values?
   - **Blocking Issue**: Must be resolved before feature launches. Plan batch-geocoding or data import if missing.

4. **Mobile UX**: On small screens, should the map be above or below the list, or in a toggleable tab?
   - **Recommendation**: Toggleable tab ("Map" / "List") to avoid excessive scrolling; design to confirm.

5. **Reverse-Geocoding on Pan**: If user manually pans the map, should we update the `locationValue` filter or just highlight nearby listings?
   - **Recommendation**: No automatic filter update in MVP; deferred to Phase 2 (advanced filtering).

6. **Performance for 1000+ Listings**: Is there a pagination or virtual-rendering strategy if a filter returns too many listings?
   - **Recommendation**: Document current `/api/listings` pagination strategy; implement marker virtualization if needed (Phase 2).

---

## Implementation Notes

- **Dependencies**: Ensure `@react-google-maps/api` is installed and configured.
- **Environment Setup**: Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to `.env.local` before local development.
- **Testing**: Unit test marker rendering and highlight logic; E2E test filter-to-map synchronization.
- **Accessibility**: Ensure map is keyboard-navigable (tab through markers); provide alt text for markers via `title` or `aria-label`.