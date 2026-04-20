# Product Requirements Document

## Problem
Users browsing Airbnb clone listings lack visual geographic context. Without a map, they cannot quickly assess listing locations relative to landmarks, transportation, or each other, forcing them to open external maps or rely on text addresses. This increases friction in the search-to-booking flow and reduces confidence in location-based decisions.

## Goals
1. Display a Google Map on the listings search page centered on the searched location.
2. Render listing markers on the map synchronized with the filtered listings displayed below.
3. Allow users to click a listing card to highlight its marker on the map (visual feedback).
4. Ensure map remains responsive and performant with up to 50+ markers visible.
5. Reduce time-to-location-understanding by providing immediate visual context alongside text results.

## Non-Goals
- Booking directly from the map.
- Turn-by-turn directions or routing.
- Street View or satellite imagery features.
- Map-based filtering (drawing polygons, radius searches).
- Offline map caching.
- Real-time listing updates based on map pan/zoom.

## User Stories

1. **As a guest**, I want to see a map on the search results page **so that** I can visualize where listings are relative to the area I'm searching.

2. **As a guest**, I want to see markers for each listing on the map **so that** I can identify location clusters and avoid isolated properties.

3. **As a guest**, I want clicking a listing card to highlight its marker **so that** I can quickly find its exact position on the map.

4. **As a developer**, I want the map component to be lazy-loaded **so that** search page performance is not degraded for users who don't scroll to the map.

---

## Acceptance Criteria

### Functional
- [ ] Map displays on the search results page (`/listings?locationValue=...`) below or beside the listing cards.
- [ ] Map is centered on the `locationValue` (search location) with appropriate zoom level (default: 12).
- [ ] For each listing returned by `/api/listings?locationValue=...&guestCount=...&roomCount=...`, a marker is rendered on the map.
- [ ] Clicking a listing card adds a CSS class or visual indicator to its corresponding marker (e.g., color change, scale, border highlight).
- [ ] Clicking a marker opens a tooltip or popover showing listing title and price (or navigates to listing detail).
- [ ] Map respects search filter updates: when `guestCount`, `roomCount`, or `locationValue` change, markers update without full page reload.

### Performance
- [ ] Map component loads lazily (intersection observer or dynamic import) and does not block initial listings render.
- [ ] With 50 markers visible, Time-to-Interactive (TTI) on search page ≤ 3 seconds on 4G.
- [ ] Marker clustering is implemented if marker density exceeds 15 markers in viewport (e.g., via `@react-google-maps/api` with MarkerClusterer).

### Responsive Design
- [ ] Map displays on desktop (full width or 50% sidebar) and tablet (full width, below listings on mobile).
- [ ] On mobile (<640px), map is either hidden by default or displayed full-screen on tap, with listings below.
- [ ] Touch interactions (pinch-zoom, pan) work correctly on mobile.

### Accessibility
- [ ] Map container has `role="region"` with `aria-label="Listing locations map"`.
- [ ] Markers have alt text or aria-labels for screen readers.
- [ ] Keyboard navigation: Tab through markers and activate with Enter.

### API & Data Integrity
- [ ] Map receives listing data from the same API call used for the listings grid (no additional API hit per marker).
- [ ] Markers only display listings that match current filters (guestCount, roomCount).

---

## Solution Design

### Architecture

#### Frontend (Next.js Client Component)
1. **SearchResults Layout** (`app/listings/page.tsx`)
   - Fetch listings via `/api/listings?locationValue=...&guestCount=...&roomCount=...`
   - Render a two-column or stacked layout: **Map** (left/top) and **Listing Cards** (right/bottom).
   - Pass filtered listings array to both `ListingsGrid` and `MapComponent`.

2. **MapComponent** (`components/ListingsMap.tsx`)
   - Use `@react-google-maps/api` (`GoogleMap`, `MarkerF`, `InfoWindowF`).
   - Accept props: `listings[]`, `locationValue`, `onMarkerClick`, `selectedListingId`.
   - Initialize with `center` derived from `locationValue` geocoding or hardcoded coordinates.
   - Render markers for each listing with unique `key` (listing ID).
   - Highlight marker on selection (color, scale, or icon swap).
   - Show info window with listing title/price on marker hover or click.
   - Implement clustering via `@react-google-maps/api/addons/MarkerClusterer` if >15 markers.

3. **ListingCard Enhancement**
   - Add `onClick` handler to emit `onSelectListing(listingId)`.
   - Parent component (`SearchResults`) updates `selectedListingId` state.
   - Pass selected ID to `MapComponent` for marker highlighting.

#### Backend (No Changes Required)
- Existing `/api/listings` endpoint already returns listing objects with location data (latitude, longitude assumed in data model).
- No new API routes needed for MVP.

---

## Data Model

### Assumptions from Context
- Listings table contains: `id`, `title`, `price`, `latitude`, `longitude`, `locationValue`, and other attributes.
- `locationValue` is a string identifier (e.g., "New York, NY" or postal code).

### Frontend State (MapComponent)
```typescript
interface ListingMarker {
  id: string;
  title: string;
  price: number;
  latitude: number;
  longitude: number;
  image?: string;
}

interface MapComponentProps {
  listings: ListingMarker[];
  locationValue: string;
  selectedListingId?: string;
  onMarkerClick?: (listingId: string) => void;
}
```

### API Response Assumption
```json
{
  "listings": [
    {
      "id": "listing-123",
      "title": "Cozy Studio in Manhattan",
      "price": 150,
      "latitude": 40.7580,
      "longitude": -73.9855,
      "locationValue": "New York, NY",
      "imageUrl": "..."
    }
  ]
}
```

### Prisma Schema (Reference)
```prisma
model Listing {
  id          String   @id @default(cuid())
  title       String
  price       Int
  latitude    Float
  longitude   Float
  locationValue String
  guestCount  Int
  roomCount   Int
  // ... other fields
}
```

---

## Edge Cases

1. **No listings found** → Map still shows center point; display "No listings found" overlay.
2. **Location geocoding fails** → Fall back to user's last known location or default map center; log error.
3. **Missing latitude/longitude in listing** → Skip marker rendering for that listing; log warning.
4. **50+ listings with poor spatial distribution** → Clustering prevents visual clutter; ensure cluster click expands or zooms.
5. **User zooms/pans map** → Map state persists but does not filter listings (filtering only via buttons).
6. **Slow network on 4G** → Map loads lazily; listing cards visible before map renders.
7. **Small viewport (mobile)** → Map is full-screen or hidden below fold; consider bottom sheet UI pattern.
8. **Duplicate locations** → Multiple listings at same lat/long; clustering or offset markers handles this.

---

## Out of Scope

- **Saved/favorited location pins** – Future feature.
- **Drawing custom search radius** – Requires map-based filtering logic not in current scope.
- **Real-time listing updates** – Would require WebSocket or polling.
- **Heat maps or density visualization** – Advanced analytics feature.
- **Directions/routing to listing** – Third-party integration; defer to detail page.
- **Multiple map layers** (terrain, satellite) – Can be added later if requested.
- **Listing reviews or ratings on markers** – Defer to listing detail page.

---

## Open Questions

1. **Geocoding Strategy**: Do we have a service to convert `locationValue` (e.g., "New York, NY") to lat/long coordinates? Should we use Google Geocoding API or pre-compute coordinates during listing creation?
2. **Marker Clustering Threshold**: At what marker count should clustering activate? Suggested: >15 markers in viewport.
3. **Mobile UX**: Should the map be hidden on mobile by default (bottom sheet/modal) or displayed full-width below listings? What is the preferred layout?
4. **Marker Icons**: Should all markers use the same icon, or should different room types have different icons? (E.g., house vs. apartment.)
5. **Info Window Content**: Should clicking a marker navigate to listing detail, or only show a preview (title, price, image)? Or both?
6. **Map Bounds**: Should the map auto-fit all markers in the viewport after filtering, or maintain a fixed zoom level?
7. **Error Handling**: What is the fallback if the Google Maps API is unavailable (rate-limited, offline)? Should we hide the map or show a static image?
8. **API Key Management**: Is the Google Maps API key already provisioned in the environment? What are the quota limits?

---

## Implementation Notes

- **Component Library**: Use `@react-google-maps/api` (already in tech stack); no additional dependencies needed for basic functionality.
- **Lazy Loading**: Wrap `MapComponent` in `dynamic()` with `ssr: false` to prevent SSR overhead.
- **Styling**: Use Tailwind CSS for map container responsiveness; embed Google Map styling inline via `options` prop.
- **Testing**: Mock Google Maps API for unit tests; use Cypress for E2E map interaction tests.
- **Monitoring**: Track map render time and marker interaction metrics for performance analysis.