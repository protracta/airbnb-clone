# Product Requirements Document

## Problem
Users browsing listings on the search results page lack spatial context for property locations. Without a visual map, users cannot quickly assess neighborhoods, proximity to landmarks, or compare multiple listings geographically, forcing them to click into individual listings to understand where properties are situated.

## Goals
1. Display an interactive Google Map on the listings search page showing pins for all filtered listings.
2. Enable users to filter and explore listings spatially without leaving the search page.
3. Reduce time-to-decision for users by surfacing location context alongside listing cards.
4. Support existing filter parameters (locationValue, guestCount, roomCount) without disrupting current search flow.
5. Maintain sub-2s map load time with current listing dataset.

## Non-Goals
- Street-view or satellite imagery integration.
- Turn-by-turn directions or transit routing.
- Booking directly from the map (remain listing-card focused).
- Custom map styling or brand color overrides in this release.
- Map-based clustering or heatmaps.

## User Stories
- As a guest, I want to see all listings plotted on a map so I can understand neighborhoods before filtering.
- As a guest, I want to click a map pin and see the associated listing card highlighted so I can match location to property details.
- As a guest, I want the map to respect my current filters (location, guest count, room count) so I only see relevant properties.
- As a developer, I want the map component to accept a listings array and render markers efficiently so future filtering logic is straightforward.

## Acceptance Criteria
- **Map Rendering**
  - Google Map displays on the search results page (right or below listings, per design).
  - Map bounds auto-fit all visible listing pins on page load and after filter changes.
  - Map only shows listings matching current URL search params (locationValue, guestCount, roomCount).

- **Marker Interaction**
  - Each listing has a clickable marker with listing ID, title, and price in an info window.
  - Clicking a marker highlights the corresponding listing card in the feed.
  - Clicking a listing card centers and highlights the map marker.

- **Data Accuracy**
  - Listing latitude and longitude from Prisma listings table are correctly mapped.
  - Map respects real-time filter updates without page refresh.

- **Performance**
  - Map loads and renders 100+ markers within 2 seconds on 4G networks.
  - No jank or UI freezing during marker interactions.

- **Compatibility**
  - Works on desktop and tablet viewports.
  - Mobile responsiveness tested (map stacked or hidden if space constrained; TBD in design).

- **Error Handling**
  - If Google Maps API fails to load, a graceful fallback message is shown (no blank space).
  - If a listing lacks lat/lng, it is skipped (logged as warning) rather than breaking the map.

## Out of Scope
- Mobile-first responsive design for phones (scope pending design review).
- Deep-linking to map coordinates (`?lat=X&lng=Y` URL params).
- User-drawn map filtering (e.g., draw a polygon to filter listings).
- Offline map caching.
- Multiple map layers or custom overlays.

---

## Solution Design

### Overview
The Google Maps component will be integrated as a new sidebar or full-width section on the search results page (`app/listings` route). It will consume the same listings data already fetched for the listing feed, extract lat/lng fields, and render markers via `@react-google-maps/api`.

### Component Architecture
```
SearchPage
  ├── FiltersBar (existing)
  ├── ListingsGrid (existing)
  └── MapContainer (new)
       ├── GoogleMap
       ├── MarkerCluster (future)
       └── InfoWindow
```

### Data Flow
1. **Search Page Route** (`app/listings/page.tsx`):
   - Reads query params: `locationValue`, `guestCount`, `roomCount` (existing).
   - Fetches listings from `/api/listings` with filters (existing).
   - Passes listings array to both `ListingsGrid` and new `MapContainer`.

2. **MapContainer Component**:
   - Receives `listings` array.
   - Extracts lat/lng from each listing (assumes Prisma model includes these fields).
   - Initializes Google Map centered on first listing or median coordinates.
   - Renders markers for each listing.
   - Manages selected marker state to sync with listing card selection.

3. **Marker Interaction**:
   - Marker click → emit `onMarkerClick(listingId)` → parent syncs listing card highlight.
   - Listing card click → parent calls `setSelectedMarker(listingId)` → map re-centers if needed.

### Layout Considerations
- **Desktop**: Map placed right-hand sidebar (20–30% width) or full-width above listings (TBD in design).
- **Tablet/Mobile**: Stacked vertically; map may be collapsible or hidden by default (design TBD).

### API & Data Requirements
- No new API endpoint required; reuse existing `/api/listings`.
- **Listings Model** (Prisma) must include:
  - `latitude: Float`
  - `longitude: Float`
  - Assumed already present based on typical location-based services.
- If missing, a data migration is required (flagged as blocker).

---

## Data Model

### Prisma Schema Assumptions
```prisma
model Listing {
  id               String   @id @default(cuid())
  title            String
  description      String?
  imageSrc         String
  category         String
  roomCount        Int
  bathroomCount    Int
  guestCount       Int
  locationValue    String
  latitude         Float    // Required for map
  longitude        Float    // Required for map
  price            Int
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  reservations     Reservation[]
}
```

### Data Passed to MapContainer
```typescript
interface ListingForMap {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  price: number;
  imageSrc?: string;
}
```

### No New Data Model Required
Maps feature does not introduce new database tables. It consumes and displays existing listing coordinates.

---

## Edge Cases
1. **Listing without lat/lng**: Skip rendering marker; log warning. Do not crash map.
2. **Empty results**: Show map centered on search location (locationValue) with no markers. Display message: "No listings found."
3. **All listings clustered in one point**: Zoom level auto-adjusted by `fitBounds()` API; ensure zoom doesn't exceed max (typically 21).
4. **API key missing or invalid**: Show friendly error message in place of map. Log error for debugging.
5. **Very large listing count (1000+)**: Performance may degrade; defer marker clustering to Phase 2. Monitor and alert if >500 listings in test.

## Open Questions
1. **Latitude/longitude field status**: Are these fields already in the Prisma `Listing` model? If not, is a data migration in scope?
2. **Map placement**: Should the map be a fixed right sidebar, full-width section, or modal overlay? (Awaiting design spec.)
3. **Mobile strategy**: Should the map be hidden, collapsible, or stacked on mobile? (Awaiting design/product decision.)
4. **Info window content**: Should the info window show only title and price, or include image thumbnail and "View Listing" link?
5. **Default map center**: If no listings or first search, what is the fallback center? City center of locationValue? Hardcoded default?
6. **Zoom level**: What is the initial zoom level? Should it auto-fit or start at a fixed level (e.g., 12)?
7. **Google Maps API quota/cost**: Has budget been reviewed for API calls? Any rate-limiting strategy needed?
8. **Analytics**: Should we track map interactions (marker clicks, map pan/zoom) for product insights?