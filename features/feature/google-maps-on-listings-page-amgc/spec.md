# Product Requirements Document

## Problem
Users browsing listings on Airbnb Clone cannot visualize property locations on a map, forcing them to click into individual listings to understand geographic distribution. This limits quick location-based decision making and reduces confidence in search results.

## Goals
1. Display an interactive Google Map on the listings search page showing pins for all returned properties.
2. Allow users to click a map pin to highlight and scroll to the corresponding listing card.
3. Ensure map loads and renders within 2 seconds on typical network conditions.
4. Support map interaction (pan, zoom) without degrading listing page performance.
5. Provide fallback UX if Google Maps API fails or is unavailable.

## Non-Goals
- Street View, satellite imagery, or custom map styling in this release.
- Real-time location tracking or geolocation permission prompts.
- Heatmaps, clustering, or advanced analytics overlays.
- Mobile-specific map optimizations (use responsive design instead).
- Integration with other map providers (Google Maps only).

## User Stories
- As a guest, I want to see property pins on a map so I can visualize neighborhoods and proximity to landmarks.
- As a guest, I want to click a pin and have the listing card highlight so I can cross-reference map location with property details.
- As a guest, I want the map to respect my search filters (location, guest count, room count) so results stay relevant.

## Acceptance Criteria

### Functional
- [ ] Google Map renders on the search results page, sized at 40% viewport height or larger.
- [ ] Each listing returned by `/api/listings?locationValue=X&guestCount=Y&roomCount=Z` appears as a clickable pin on the map.
- [ ] Clicking a pin highlights its corresponding listing card (e.g., border color change, background highlight) and scrolls card into view.
- [ ] Clicking a listing card highlights its pin on the map.
- [ ] Map center and zoom level are set based on the search `locationValue` (e.g., center on city center, initial zoom 12).
- [ ] Map supports standard Google Maps gestures: pan (drag), zoom (scroll/pinch), and zoom controls (UI buttons).

### Data & API
- [ ] Listings API response includes `latitude` and `longitude` fields (required for pin placement).
- [ ] Map requests use the existing Google Maps API key configured in environment (`.env.local`).
- [ ] Listings data is fetched once on page load; map updates when search params change.

### Performance & Reliability
- [ ] Google Maps library loads asynchronously (does not block page render).
- [ ] Map interactive state (zoom, center) does not re-render listing cards unnecessarily.
- [ ] If Google Maps API key is invalid or quota exceeded, a graceful error message appears instead of blank map (e.g., "Map unavailable").
- [ ] Lighthouse Performance score does not drop >10 points vs. baseline.

### Accessibility & UX
- [ ] Map container has a descriptive `aria-label` (e.g., "Property locations map").
- [ ] Keyboard users can focus pins via Tab and select via Enter.
- [ ] Map does not obscure critical page content on tablet/mobile (responsive layout).

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No listings returned | Show empty map centered on search location with message "No properties found." |
| Listing has missing lat/lng | Log error; exclude pin from map; still display listing card. |
| Google Maps API fails | Display error banner; render listings without map. |
| User zooms to extreme level (e.g., zoom 20) | Pins remain visible and clickable; no special handling needed. |
| Many listings (100+) | Render all pins (no clustering in v1); monitor performance; defer clustering to v2 if needed. |
| Search location has no recognized coordinates | Center map on default (e.g., San Francisco 37.7749, -122.4194); show warning. |
| User clicks pin while listing card is scrolling | Pin highlight is applied; card scroll continues smoothly. |

## Out of Scope
- Marker clustering (defer to v2 if performance issues arise with 100+ listings).
- Custom marker icons per listing type or price range.
- Directions, transit, or routing suggestions.
- Saved locations or bookmark integration with map.
- Analytics or heatmap of popular search areas.

---

## Solution Design

### Architecture Overview
The map component will live in `app/listings/page.tsx` (or a new `<ListingsMap />` sub-component) alongside the existing listings grid/list. The component will:

1. **Consume search params** (`locationValue`, `guestCount`, `roomCount`) from `useSearchParams()`.
2. **Fetch listings** from existing `/api/listings` endpoint.
3. **Render map** using `@react-google-maps/api` GoogleMap component.
4. **Manage pin state** (hover, click) to highlight corresponding listing cards.

### Component Structure
```
ListingsPage
├── SearchBar (existing)
├── Filters (existing)
├── ListingsContainer
│   ├── ListingsMap (NEW)
│   │   ├── GoogleMap
│   │   ├── MarkerCluster (if >10 listings, simple grid; no library clustering)
│   │   └── InfoWindow (pin details on hover, optional v1)
│   └── ListingsGrid/List (existing)
└── Footer (existing)
```

### Data Flow
1. `ListingsPage` fetches listings via `/api/listings` with search params.
2. Listings array is passed to both `<ListingsMap />` and `<ListingsGrid />`.
3. `<ListingsMap />` extracts `latitude`, `longitude` from each listing and renders pins.
4. Click event on pin → setState({ activeListingId }) → Grid card re-renders with highlight.
5. Click event on card → setState({ activeListingId }) → Map pin visual updates.

### Map Initialization
- **Center:** Parse `locationValue` to lat/lng using Google Geocoding API OR pre-computed location table (see Data Model).
- **Zoom:** 12 for city-level; adjust based on bounds of all listings.
- **Bounds:** Fit map to all pins using `fitBounds()` if listings span wide area.

---

## Data Model

### Listings Table (Extended)
The existing `Listing` model in Prisma schema must include:

```prisma
model Listing {
  id              String    @id @default(cuid())
  title           String
  description     String?
  imageSrc        String
  createdAt       DateTime  @default(now())
  
  // EXISTING FIELDS
  roomCount       Int
  bathroomCount   Int
  guestCount      Int
  category        String
  
  // NEW FIELDS FOR MAPS
  latitude        Float     @db.Decimal(10, 8)  // Precise decimal for geo-coordinates
  longitude       Float     @db.Decimal(10, 8)
  locationValue   String    // e.g., "San Francisco, CA" or city/region code
  
  // ... other fields (userId, etc.)
}
```

**Rationale:** Store `latitude` and `longitude` directly on Listing to avoid N+1 queries. `locationValue` ties listings to search filters.

### Location Reference Table (Optional, for Geocoding)
If pre-computing geocodes for common search locations:

```prisma
model Location {
  id              String    @id @default(cuid())
  name            String    @unique  // e.g., "San Francisco, CA"
  latitude        Float     @db.Decimal(10, 8)
  longitude       Float     @db.Decimal(10, 8)
  zoomLevel       Int       @default(12)
  createdAt       DateTime  @default(now())
}
```

**Rationale:** Speeds up map initialization without calling Geocoding API on every search. Optional in v1; recommend for v2.

### API Response Contract
`GET /api/listings?locationValue=X&guestCount=Y&roomCount=Z` returns:

```json
[
  {
    "id": "listing-123",
    "title": "Cozy apartment",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "locationValue": "San Francisco, CA",
    "guestCount": 4,
    "roomCount": 2,
    "imageSrc": "...",
    ...
  }
]
```

**Changes:** Ensure response includes `latitude` and `longitude`. Update API response type if needed.

### Frontend State (Component Level)
```typescript
// In ListingsMap component
const [activeListingId, setActiveListingId] = useState<string | null>(null);
const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 37.7749, lng: -122.4194 });
const [mapZoom, setMapZoom] = useState(12);
```

---

## Open Questions

1. **Geocoding:** Should we call Google Geocoding API on each search, or pre-populate a Location reference table? (Current: Recommend API call in v1; table lookup in v2.)
2. **Listing latitude/longitude:** Are these values already in the database, or do we need a migration to backfill? (Blocks data model implementation.)
3. **Pin styling:** Should pins be uniform, or differentiate by price, rating, or availability? (Current: Uniform in v1.)
4. **Mobile layout:** Should the map be full-width above listings, or side-by-side on desktop? (Current: Recommend full-width above on mobile; side-by-side 40/60 on desktop if screen >1024px.)
5. **API key security:** Is the Google Maps API key restricted to web domain only? (Security check before launch.)
6. **Listing update frequency:** Can a listing's lat/lng change, or is it immutable? (Affects caching strategy.)