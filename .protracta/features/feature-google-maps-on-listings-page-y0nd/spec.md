# Product Requirements Document

## Problem
Airbnb Clone users currently cannot visualize listing locations on a map while browsing search results. This forces users to mentally map text-based addresses, reducing confidence in location decisions and increasing friction during property discovery. Adding an interactive map to the listings page will close this gap and align the experience with industry-standard property search patterns.

## Goals
1. **Display listings as interactive markers** on a Google Map embedded on the search results page, filterable by current search parameters (locationValue, guestCount, roomCount).
2. **Improve location confidence** by allowing users to see where properties cluster relative to landmarks, transit, or desired neighborhoods.
3. **Maintain search state cohesion**: Map and listing filters must stay synchronized as users refine searches.
4. **Establish map foundation** for future features (street view, directions, price overlays).
5. **Performance baseline**: Map must load and render ≤2s on typical network conditions with up to 100 visible listings.

## Non-Goals
- Street View integration.
- Directions or routing to third-party transit APIs.
- Heat maps or price clustering visualizations.
- Mobile-optimized map UI (responsive basic layout is acceptable).
- Offline map caching.

## User Stories
- **As a** prospective guest browsing listings, **I want** to see all search results plotted on a map, **so that** I can quickly identify property clusters and assess neighborhood context.
- **As a** user refining my search (adjusting guest/room counts), **I want** the map to automatically update to show only matching properties, **so that** I stay oriented as my criteria change.
- **As a** user exploring a property, **I want** to click a marker on the map, **so that** I can jump directly to that listing's details.

## Acceptance Criteria

### Functional
- [ ] Map component renders on the listings search page layout (likely a sidebar or split view).
- [ ] All listings matching current search filters (`locationValue`, `guestCount`, `roomCount`) appear as markers on the map.
- [ ] Each marker displays a label (e.g., price per night or listing name) on hover or click.
- [ ] Clicking a marker navigates to (or highlights) the corresponding listing in the search results.
- [ ] Map center and zoom level adjust automatically when search filters change or on initial load (e.g., fit bounds to all visible markers).
- [ ] Listing data passed to map is fetched from `/api/listings` and includes `latitude`, `longitude`, and `price` (or equivalent location fields).

### Performance
- [ ] Map and initial marker rendering complete within 2s on 4G network with ≤100 listings.
- [ ] Marker updates (add/remove) on filter change do not cause layout shift or jank.

### Data Integrity
- [ ] Listings with missing or invalid coordinates are logged and excluded from the map (not silently dropped without warning).
- [ ] Map respects the same search parameter logic as the listings list (no inconsistency between visible listings and plotted markers).

### Browser/Compatibility
- [ ] Map renders correctly in Chrome, Firefox, Safari (latest stable versions).
- [ ] Google Maps API key is securely stored in environment variables and not exposed in client logs.

## Solution Design

### Component Architecture
```
SearchPage (app/listings/page.tsx)
├── SearchFilters (guest/room/location inputs)
├── ListingsMap (new component)
│   └── GoogleMap (@react-google-maps/api)
│       └── Marker[] (one per visible listing)
└── ListingsList (existing component)
```

**ListingsMap Component** responsibilities:
- Fetch listings from `/api/listings?locationValue=X&guestCount=Y&roomCount=Z`.
- Transform listing data to GLatLng objects for marker placement.
- Handle map center/zoom logic (fit bounds or fixed zoom based on result count).
- Listen to search param changes and re-fetch/re-render markers.
- Emit click events to parent (SearchPage) for navigation or highlighting.

**Integration point**: SearchPage passes current `searchParams` (locationValue, guestCount, roomCount) to ListingsMap as props. ListingsMap re-fetches whenever these props change.

### Data Model

**Listing Entity** (assumed existing, from Prisma schema):
```typescript
model Listing {
  id: String @id @default(cuid())
  title: String
  description: String
  imageSrc: String
  category: String
  roomCount: Int
  bathroomCount: Int
  guestCount: Int
  price: Int // per night
  locationValue: String // city, region, or geocoded name
  latitude: Float // NEW for map
  longitude: Float // NEW for map
  createdAt: DateTime @default(now())
  updatedAt: DateTime @updatedAt
}
```

**Required schema changes**:
- Add `latitude: Float` and `longitude: Float` columns to `Listing` table.
- Backfill existing listings (or mark as optional and exclude from map if null).
- Seed/migrate any existing test data with coordinates.

**API Contract** (`/api/listings`):
```typescript
// Request
GET /api/listings?locationValue=Paris&guestCount=2&roomCount=1

// Response
{
  listings: [
    {
      id: "abc123",
      title: "Cozy Studio in Marais",
      price: 85,
      latitude: 48.8566,
      longitude: 2.3522,
      // ... other fields
    },
    // ...
  ]
}
```

### Interaction Flow
1. User lands on search page with initial filters (or refines them).
2. SearchPage passes `searchParams` to ListingsMap.
3. ListingsMap fetches listings and renders markers.
4. User hovers/clicks a marker → map displays label or tooltip.
5. User clicks marker → parent callback fires, triggering navigation to listing detail page (or scroll-to in results).
6. User changes a filter → searchParams update → ListingsMap re-fetches and updates markers.

## Edge Cases

| Scenario | Handling |
|----------|----------|
| No listings match filters | Show empty map with message: "No properties found. Try adjusting your search." |
| Listing coordinates are missing/invalid | Log error, exclude from map, display banner in results: "1 listing excluded (missing location data)." |
| Search params are invalid (e.g., guestCount = "abc") | /api/listings returns empty; map shows empty state. |
| User is offline or API fails | Show cached listings (if available) or empty map with error message: "Unable to load map. Please refresh." |
| Map API key is invalid or quota exceeded | Console error and empty map container; graceful degradation (listings list still functional). |
| Listings > 500 in a single search | Consider clustering or pagination. Defer to sprint planning; document as known limitation. |

## Data Dependencies

- **Existing dependency**: @react-google-maps/api already in tech stack.
- **New dependency**: None (assuming Prisma + PostgreSQL already support float columns).
- **API dependency**: Google Maps JavaScript API must be enabled in GCP project; API key provisioned and injected at build/runtime.

## Open Questions

1. **Coordinates source**: Should listings be geocoded on creation (via Google Geocoding API), manually entered by hosts, or backfilled from a migration script?
2. **Map UI placement**: Sidebar (desktop/tablet) or below listings (mobile)? Responsive breakpoint strategy?
3. **Marker customization**: Static pins, custom icons (e.g., price cards), or clusters?
4. **Listings >500**: Do we paginate/cluster, or assume search filters will narrow results?
5. **Analytics**: Should we track map interactions (marker clicks, zoom, pan) for insights?
6. **Accessibility**: ARIA labels and keyboard navigation for map markers? Required for launch or Phase 2?

## Out of Scope

- Advanced map filtering (e.g., draw polygons, filter by radius).
- Street View or satellite imagery layers.
- Offline maps or service worker caching.
- International map localization (language, driving side conventions).
- Integration with analytics or user tracking services.
- Marker clustering or heatmap visualization (may be Phase 2 if result sets grow large).

---

## Implementation Notes

**Tech readiness**: @react-google-maps/api is already in package.json; no new major dependencies required.

**Risk**: If listings table lacks coordinates, backfill must happen before launch or UI must degrade gracefully (show map with empty markers). Consider a data validation pre-launch checklist.

**Success metric**: Post-launch, measure time-to-click on a map marker vs. time to click a listing card in the list. A 15–20% reduction in friction would indicate value.