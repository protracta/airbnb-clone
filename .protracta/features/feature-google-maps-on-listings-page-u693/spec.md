# Product Requirements Document: Google Maps on Listings Page

## Problem
Users browsing listings lack spatial context about property locations. Without a map view, they cannot quickly understand neighborhood geography, proximity to landmarks, or relative positions of multiple listings—forcing manual address lookup and reducing confidence in booking decisions.

## Goals
1. Display an interactive Google Map on the listings search page showing pins for all filtered listings.
2. Allow users to hover/click listing pins to see property details (name, price, guest capacity).
3. Ensure map stays synchronized with search filters (locationValue, guestCount, roomCount).
4. Achieve sub-100ms map pan/zoom performance with ≤50 listings visible.
5. Enable users to identify geographic clusters and make location-informed decisions faster than address-by-address review.

## Non-Goals
- Street-view or 3D building visualization.
- Heatmaps showing demand or pricing by neighborhood.
- Turn-by-turn directions to listings.
- Map-based filtering (e.g., "show me listings within 2km").
- Offline map caching.

## User Stories
- **As a** traveler searching for accommodations, **I want to** see all matching listings on a map **so that** I understand their geographic distribution and neighborhood context.
- **As a** guest with mobility constraints, **I want to** click map pins to view listing details **so that** I can assess proximity to transit without opening each listing individually.
- **As a** repeat visitor, **I want to** refine my search and see the map update instantly **so that** I don't lose spatial orientation between filter changes.

## Acceptance Criteria

### Functional
1. **Map Rendering**
   - Google Map loads and centers on the primary search location (derived from `locationValue` param) on initial page load.
   - If no `locationValue` is provided, map defaults to a sensible world view (e.g., coordinates 0,0 with zoom 2).

2. **Listing Pins**
   - Each listing in the filtered result set appears as a distinct pin/marker on the map.
   - Pin shows listing image or icon; hovering displays listing name and price.
   - Clicking a pin navigates to or opens a popover with listing title, guest count, and room count.

3. **Filter Synchronization**
   - When `guestCount` or `roomCount` filters change via URL params, the map re-fetches listings and updates pins within 500ms.
   - Map viewport remains centered on `locationValue` unless user has manually panned; manual pans are preserved until filter change triggers a re-center.

4. **Performance & Limits**
   - Map renders smoothly with up to 50 pins visible without jank (60fps).
   - Clustered markers (e.g., >50 listings) collapse into a single "count" pin that expands on click.

5. **Responsive Design**
   - Map container is full-width on desktop (>1024px) and spans ≥80% viewport width on mobile.
   - Touch gestures (pinch-zoom, pan) work on mobile devices.

### Data Flow
6. Search params (`locationValue`, `guestCount`, `roomCount`) trigger a fetch to `/api/listings?locationValue=...&guestCount=...&roomCount=...`.
7. API response includes listing coordinates (latitude, longitude) for each property.
8. Map component receives listing array and re-renders pins without page refresh.

### Quality
9. No console errors or TypeScript compilation failures.
10. Accessibility: map is keyboard-navigable; listing pins have `aria-label` attributes.

## Out of Scope
- Map styling customization (light/dark mode toggle for map).
- Save/bookmark locations on the map.
- Print map with listings.
- Integration with Google Places Autocomplete for address entry (assumed handled separately in search UI).
- Custom tile layers or alternative map providers (e.g., Mapbox).

---

## Solution Design

### Architecture Overview
The Google Maps integration uses a **map wrapper component** that manages state and API communication, with **reusable marker components** for individual listings.

### Component Structure
```
SearchPage (app/search/page.tsx)
├── SearchFilters (reads and updates URL params)
└── SearchResultsWithMap
    ├── ListingsGrid (existing)
    └── GoogleMapComponent (new)
        ├── MapContainer (@react-google-maps/api GoogleMap)
        ├── MarkerClusterer (for >50 listings)
        └── ListingMarker[] (custom marker pins)
```

### State & Data Flow
1. **URL Source of Truth**: `locationValue`, `guestCount`, `roomCount` are read from `useSearchParams()`.
2. **Effect Hook**: When search params change, trigger `/api/listings` fetch.
3. **Map Sync**: Listings array passed to `GoogleMapComponent` as prop.
4. **Marker Rendering**: For each listing, create a `Marker` with click handler that either:
   - Opens a side panel with listing details, or
   - Navigates to `/listings/[id]`.

### Google Maps API Integration
- Use `@react-google-maps/api` (already in tech stack).
- API key stored in `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- Load library once at app root to avoid duplicate imports.
- Debounce map pan/zoom events to prevent excessive re-renders.

### Marker Clustering (MarkerClusterer)
- When listing count exceeds 50, activate `@react-google-maps/api` clustering.
- Cluster displays count badge; expand on click to show individual markers.
- Cluster color indicates density (optional visual refinement).

---

## Data Model

### Listing Entity (Prisma Schema - Enhancement)
```prisma
model Listing {
  id              String   @id @default(cuid())
  title           String
  description     String?
  imageSrc        String?
  createdAt       DateTime @default(now())
  category        String?
  roomCount       Int
  bathroomCount   Int
  guestCount      Int
  locationValue   String   // e.g., "San Francisco, CA"
  
  // NEW: Geolocation fields
  latitude        Float    @db.DoublePrecision
  longitude       Float    @db.DoublePrecision
  
  price           Int
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // ... existing relations
}
```

### API Response Shape
**GET `/api/listings?locationValue=...&guestCount=...&roomCount=...`**
```json
{
  "listings": [
    {
      "id": "abc123",
      "title": "Cozy Studio in Mission",
      "price": 150,
      "guestCount": 2,
      "roomCount": 1,
      "imageSrc": "/images/...",
      "latitude": 37.7589,
      "longitude": -122.4103
    },
    ...
  ],
  "center": {
    "lat": 37.7749,
    "lng": -122.4194
  }
}
```

### Marker Data Structure (Frontend)
```typescript
interface ListingMarkerProps {
  id: string;
  title: string;
  price: number;
  guestCount: number;
  roomCount: number;
  latitude: number;
  longitude: number;
  imageSrc?: string;
  onMarkerClick: (listingId: string) => void;
}
```

---

## Edge Cases

1. **No Results for Location**
   - If `locationValue` returns 0 listings, display empty state on map and grid; show helpful message ("No listings found. Try adjusting filters.").

2. **Invalid `locationValue`**
   - If geolocation lookup fails, map centers on world view (0,0) with zoom 2; display warning banner.

3. **Missing Coordinates**
   - Listings without `latitude` / `longitude` are excluded from map but appear in grid with a "location unavailable" badge.

4. **Large Result Sets (>500 listings)**
   - Pagination: fetch only first 50 listings for map display; grid uses server-side pagination.
   - Marker clustering mandatory; disable individual marker click/hover to improve performance.

5. **Map Off-Screen / Hidden**
   - Do not load Google Maps API or render markers until map container is visible (use `IntersectionObserver`).

6. **Concurrent Filter Updates**
   - Rapid filter changes (e.g., guestCount 1→4→2 in quick succession): cancel in-flight requests; only render map for final query.

7. **Touch Gestures on Mobile**
   - Pan and pinch-zoom work; double-tap to zoom in; do not interfere with listing grid scroll.

8. **Network Latency**
   - Show skeleton loader for map while fetching; preserve previous pins until new data arrives.

---

## Open Questions

1. **Geocoding Strategy**: Should `latitude` / `longitude` be pre-computed during listing creation (via Google Geocoding API) or fetched on-demand from `locationValue`? Recommend pre-compute for performance, but requires seeding existing listings.

2. **Listing Detail on Pin Click**: Should clicking a marker navigate to `/listings/[id]`, open an inline popover, or toggle a side panel? Current design assumes navigation; confirm UX preference.

3. **Map Resize**: When user expands/collapses the listings grid sidebar, should the map re-center to fill new viewport? Or keep current viewport?

4. **Marker Icons**: Use generic pins, listing images as custom markers, or category-based icons (e.g., house, apartment, villa)? Default to generic pins; icons deferred to v2.

5. **Search Param Handling**: If user clears `locationValue` but keeps `guestCount` / `roomCount`, what is the fallback location? Clarify default behavior.

6. **Accessibility**: Should map keyboard navigation (arrow keys to pan) be enabled? Confirm scope with accessibility review.

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Google Maps API quota exceeded | Service outage; map fails to load | Implement quota monitoring; set daily limits; cache geocoding results. |
| Stale coordinates in DB | Pins appear in wrong locations | Establish process to re-geocode listings on address change; audit existing data. |
| Large result sets degrade map performance | User frustration; jank on mid-tier devices | Test with 200+ pins; implement clustering; lazy-load markers off-viewport. |
| Mobile touch gestures conflict with list scroll | Poor UX on mobile | Use scroll delegation; disable default scroll within map container on mobile. |
| Geolocation privacy concerns | User trust erosion | Do not collect or store user location; only display listing coordinates (all public). |