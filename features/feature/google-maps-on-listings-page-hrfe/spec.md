# Product Requirements Document

## Problem
Users browsing listings on the search/results page lack visual geographic context, making it difficult to understand property locations relative to each other, nearby amenities, or their search area. Adding an interactive map to the listings page will help users make faster, more confident decisions about which properties to explore.

## Goals
1. Display an interactive Google Map on the listings page showing all filtered properties as markers.
2. Map markers are synchronized with listing filters (`locationValue`, `guestCount`, `roomCount`).
3. Users can click a marker to highlight or navigate to the associated listing card.
4. Map renders without blocking page load; graceful fallback if API key is missing.
5. Map viewport automatically centers and zooms to fit all visible listings (bounds auto-fit).

## Non-Goals
- Booking or reservation flow from the map.
- Map-based filtering (click-to-filter by region).
- Street View or other Google Maps advanced features.
- Offline map support or custom map styling beyond defaults.
- Search by drawing polygons or radius.

## User Stories

| # | User Story |
|---|---|
| 1 | As a guest, I want to see all listings plotted on a map so I can understand their geographic distribution and proximity to each other. |
| 2 | As a guest, I want the map to update when I change filters (guests, rooms, location) so I see only relevant properties. |
| 3 | As a guest, I want to click a map marker to identify which listing it represents, so I can navigate between map and listing details. |
| 4 | As a developer, I want clear error handling and fallback UI if Google Maps API fails so the page remains functional. |

## Acceptance Criteria

### Functional
- [ ] Map component renders on the search/listings page alongside listing cards.
- [ ] Map displays a marker for each listing in the current filtered result set.
- [ ] Markers are updated in real-time (or on filter change) without a full page reload.
- [ ] Clicking a marker highlights the corresponding listing card or scrolls/focuses the card into view.
- [ ] Map viewport auto-fits to bounds of all visible markers (margin of safety included).
- [ ] If no listings exist after filtering, map displays the search center point (based on `locationValue`) with a neutral zoom level.
- [ ] Marker infowindows (or tooltips) display listing name/price on hover or click.

### Technical
- [ ] Integration uses `@react-google-maps/api` (as per tech stack).
- [ ] Google Maps API key is loaded from environment variables (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`).
- [ ] Map respects search params: `locationValue`, `guestCount`, `roomCount`.
- [ ] Map data is fetched from `/api/listings` endpoint (reuses existing endpoint).
- [ ] TypeScript is used throughout; no `any` types without justification.
- [ ] Tailwind CSS is used for responsive layout and styling.

### Performance
- [ ] Map lazy-loads Google Maps script; does not block initial page render.
- [ ] Listing cards load and display before map is interactive.
- [ ] Markers load in under 2 seconds for ≤100 listings.

### Resilience
- [ ] If Google Maps API key is missing, map shows a fallback message ("Map unavailable") but page remains functional.
- [ ] If API request for listings fails, map displays error state without crashing.
- [ ] Map remains responsive and usable on mobile (touch-friendly marker icons, readable on small screens).

## Solution Design

### Component Architecture
```
SearchPage (app/search/page.tsx)
├── ListingsContainer (flex layout)
│   ├── MapPanel (flex: 1, responsive width)
│   │   └── GoogleMap (@react-google-maps/api wrapper)
│   │       └── Markers[] (one per listing)
│   └── ListingsPanel (flex: 1)
│       └── ListingCard[] (existing component)
```

### Data Flow
1. **URL params** → SearchPage reads `locationValue`, `guestCount`, `roomCount`.
2. **Fetch listings** → Existing `/api/listings?locationValue=...&guestCount=...&roomCount=...`.
3. **Map sync** → ListingsContainer passes filtered listings array to MapPanel.
4. **Marker interaction** → Click handler on marker → call callback to highlight listing card.

### Key Implementation Details
- **Geocoding center point**: Use `locationValue` to reverse-geocode (or fetch from API) the initial map center (lat/lng).
- **Marker clustering** (optional for future): Consider MarkerClusterer if >50 listings per view.
- **Responsive layout**: Use Tailwind grid/flex; map takes 50% on desktop, full width on mobile (or below fold on small screens).
- **Debounce filter updates**: If filter changes frequently, debounce API calls to avoid unnecessary map refreshes.

## Data Model

### Listing (existing, no changes)
```typescript
interface Listing {
  id: string;
  title: string;
  price: number;
  locationValue: string;  // e.g., "San Francisco, CA"
  latitude: number;        // NEW: required for map marker placement
  latitude: number;        // NEW: required for map marker placement
  guestCount: number;
  roomCount: number;
  // ... other fields
}
```

### MapMarker (internal component state)
```typescript
interface MapMarker {
  listingId: string;
  title: string;
  price: number;
  lat: number;
  lng: number;
  isHighlighted: boolean;
}
```

### API Contract (existing endpoint, no breaking changes)
```
GET /api/listings?locationValue=...&guestCount=...&roomCount=...
Returns: Listing[]
```

**Note**: If `latitude` and `longitude` are not currently in the Listing model in your database, they must be backfilled or populated during property creation. This is a **prerequisite data migration**.

## Edge Cases

| # | Scenario | Handling |
|---|----------|----------|
| 1 | No listings match filters | Show map centered on `locationValue` with a "no results" message overlaid. |
| 2 | User clears filters; 1000+ listings returned | Show clustered markers (MarkerClusterer); display only top 100 by relevance or fetch paginated results. |
| 3 | Google Maps API key is invalid/missing | Show fallback UI ("Map unavailable") and log error to console; page remains functional. |
| 4 | User is on a poor network and map takes >3s to load | Show skeleton loader; do not block page render. |
| 5 | Listing has no valid lat/lng | Exclude from map; log warning; still show in listings panel. |
| 6 | Mobile device with small viewport | Stack map below listings; use touch-friendly marker sizes. |
| 7 | User updates search params via URL directly | Map refetches and updates markers on search param change (use `useSearchParams` hook). |

## Open Questions

1. **Listing location data**: Does every listing in the database already have accurate `latitude` and `longitude` fields? If not, is reverse-geocoding from `locationValue` acceptable, or do we need a backfill strategy?

2. **Marker clustering**: At what threshold (e.g., >50 listings) should we enable MarkerClusterer to avoid visual clutter? Should this be configurable?

3. **Marker click behavior**: Should clicking a marker:
   - Highlight the card (visual feedback only)?
   - Scroll the card into the viewport?
   - Open an infowindow with listing details?
   - All of the above?

4. **Search center on initial load**: If a user lands on `/search` without a `locationValue` param, where should the map center (e.g., user's geolocation, a default city, or a world view)?

5. **Mobile layout priority**: Should the map be:
   - Stacked below listings on mobile?
   - Collapsible/toggleable?
   - Hidden by default and shown via a "View map" button?

6. **Map style/theming**: Should the map use a custom style or Google's default? Any dark mode requirements?

7. **Analytics**: Should we track interactions (marker clicks, map pans/zooms) for product insights?

## Out of Scope

- Directions or routing from a listing to landmarks.
- Saved/bookmarked listings on the map.
- Real-time availability indicators on markers.
- Alternative map providers (Mapbox, Leaflet).
- Map-based search (drawing polygons, radius search).
- Heatmaps of price or rating by region.

---

## Notes for Eng

- **Prerequisite**: Ensure all listings have valid `latitude` and `longitude` in the database. If not, plan a data migration or backfill.
- **Dependency**: `@react-google-maps/api` is already in the tech stack; use `<GoogleMap>`, `<Marker>`, and `<InfoWindow>` components.
- **Env setup**: Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to `.env.local`.
- **Testing**: Unit test marker rendering; integration test filter → map sync; visual regression test for responsive layout.