# Product Requirements Document

## Problem

Users browsing Airbnb clone listings lack a visual, geographic context for where properties are located. Without an interactive map, users must manually cross-reference addresses or rely on text descriptions to understand neighborhood positioning, travel distance, and clustering of available properties. This reduces confidence in booking decisions and increases cognitive load during the search-to-booking flow.

## Goals

1. **Display listings geographically** – Render all filtered listings as markers on an interactive Google Map on the search results page, synchronized with applied filters (location, guest count, room count).
2. **Enable map-driven exploration** – Allow users to pan, zoom, and interact with the map to discover properties within their desired geographic radius.
3. **Maintain filtering state** – Ensure map markers update reactively when filters change; listing count and map pins remain in sync.
4. **Ship with performant rendering** – Load and display maps + markers without degrading page load time for searches returning <500 listings.
5. **Establish reusable component patterns** – Build a MapContainer component that can be extended for future features (clustering, info windows, property details on hover).

## Non-Goals

- Map-based filtering (e.g., "show only listings in this viewport bounds"). Filtering remains URL param–driven.
- Marker clustering or heatmaps in the initial release.
- Street View, satellite view toggles, or advanced map customization.
- Mobile-optimized map gestures or bottom-sheet layouts (responsive behavior acceptable; full mobile redesign deferred).
- Integration with Google Places Autocomplete for location search (separate project).

## User Stories

- **As a guest**, I want to see all search results plotted on a map so that I can visualize property locations relative to landmarks and neighborhoods.
- **As a guest**, I want the map to update when I adjust filters so that I can see how guest count or room count changes affect available properties in my desired area.
- **As a guest**, I want to click or hover over a map marker to see basic property info (title, price, image thumbnail) so that I can quickly assess listings without opening detail pages.
- **As an operator**, I want the map to load efficiently even with 300–500 listings visible so that the UX remains snappy.

## Acceptance Criteria

### Core Functionality
1. **Map renders on search page** – When a user navigates to `/search?locationValue=<value>`, the map displays centered on the provided location (geocoded from `locationValue` param).
2. **Markers placed for all filtered listings** – Each listing matching applied filters (`guestCount`, `roomCount`) appears as a distinct marker on the map.
3. **Map updates on filter change** – When filters are applied via URL params, markers re-render within 500ms; no full page reload required.
4. **Marker interactivity** – Clicking or hovering over a marker displays a tooltip or info window showing: listing title, price per night, and primary image thumbnail.
5. **Zoom & pan behavior** – Users can zoom to any level (1–20) and pan freely; map state persists during the session.
6. **Fallback for empty results** – If no listings match filters, map displays the search location with a "no results" message overlay.

### Performance & Quality
7. **Page load < 3.5s** – Lighthouse report on search page (with map + 300 listings) achieves > 70 performance score.
8. **No layout shift** – Cumulative Layout Shift < 0.1 when map loads.
9. **API call deduplication** – Listings are fetched once; map does not trigger redundant `/api/listings` calls on filter changes if data is already in-memory.
10. **Error handling** – If Google Maps API fails to load, a fallback message is shown; page remains functional (list view still displays).
11. **TypeScript strict mode** – All new map code passes `strict: true` type checking.

### Accessibility & UX
12. **Keyboard navigation** – Map container is tab-accessible; zoom buttons respond to arrow keys if focused.
13. **ARIA labels** – Markers and info windows include descriptive aria-labels for screen readers.
14. **Mobile responsiveness** – Map occupies 100% width on mobile; layout does not break on screens < 375px.

## Solution Design

### Architecture Overview

**Component Hierarchy:**
```
SearchPage (app/search/page.tsx)
├── ListingFilters (existing)
├── MapContainer (new)
│   ├── GoogleMapWrapper (@react-google-maps/api)
│   └── MarkerList
│       └── Marker (per listing)
│           └── InfoWindow (on hover/click)
└── ListingGrid (existing)
```

**Data Flow:**
1. User applies filters → URL params update (existing behavior).
2. `SearchPage` fetches listings via `/api/listings?locationValue=...&guestCount=...&roomCount=...`.
3. Listings array passed to `MapContainer` as prop.
4. `MapContainer` geocodes `locationValue` → center coordinates via Google Geocoding API.
5. For each listing, `MarkerList` renders a marker at `listing.latitude`, `listing.longitude`.
6. On marker click/hover, `InfoWindow` pops up with cached listing data (no additional API call).

**Key Implementation Decisions:**
- **Map placement:** Sticky sidebar on desktop (right of listings grid), full-width above grid on mobile.
- **Marker styling:** Use Google's default red pin; highlight on hover with gold border.
- **Info window:** Show title, price, and thumbnail; clicking "View Listing" navigates to detail page.
- **Geocoding strategy:** Cache `locationValue` → coordinates mapping in React state/context to avoid repeated API calls.

### Assumptions & Constraints
- Listings already have `latitude` and `longitude` fields in the database (Prisma schema must include these).
- Google Maps API key is available and configured in `next.config.js` or environment variables.
- `/api/listings` endpoint supports current filter params and returns structured JSON.

## Data Model

### Database Schema (Prisma)
Listings table must include:
```prisma
model Listing {
  id            String   @id
  title         String
  price         Int
  image         String   // primary image URL
  latitude      Float    // required for map rendering
  longitude     Float    // required for map rendering
  guestCount    Int
  roomCount     Int
  locationValue String
  // ... other fields
}
```

**Migration Required:** If `latitude` and `longitude` are not present, a schema migration must add these columns. Existing listings require geocoding (bulk job to populate coordinates from address/location).

### API Response Format
`GET /api/listings?locationValue=<value>&guestCount=<num>&roomCount=<num>` returns:
```json
{
  "listings": [
    {
      "id": "listing-1",
      "title": "Cozy apartment in downtown",
      "price": 150,
      "image": "https://...",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "guestCount": 4,
      "roomCount": 2,
      "locationValue": "New York"
    }
  ]
}
```

### New State/Context
- **MapContextProvider (optional):** Store `selectedLocation`, `geocodedCenter`, `userFilters` to reduce prop drilling. Use only if component tree depth warrants it; otherwise, pass as props.
- **Marker state:** Track `hoveredMarkerId` and `selectedMarkerId` for conditional styling/info window display.

## Edge Cases

1. **No listings match filters** – Map displays search location center; overlay shows "No listings found."
2. **User enters invalid location** – Geocoding fails; map shows error state; list view still displays (graceful degradation).
3. **Listing has null/invalid lat/lng** – Marker is skipped; error logged to console; other markers render normally.
4. **Map viewport contains 0 visible listings after zoom** – No change in UI; zoom level is user-driven.
5. **Mobile device with slow network** – Map tiles load progressively; markers may appear after tiles are ready (acceptable).
6. **API rate limit hit (Google Maps)** – Show fallback message; list view remains functional; offer to retry.
7. **User toggling between list and map view** – Map mounts/unmounts cleanly; no memory leaks or lingering event listeners.

## Open Questions

1. **Do we have lat/lng for all existing listings, or must we backfill?** 
   - If backfill is needed, what geocoding service do we use (Google Places, bulk upload, manual data entry)?
   - Who owns this data enrichment task, and what is the timeline?

2. **Should clicking a marker navigate to the listing detail page or open an inline preview?**
   - Current user stories suggest inline info window; confirm this doesn't conflict with existing detail-page flow.

3. **Are there UI mocks or Figma designs for the map layout (sidebar vs. full-width, info window style)?**
   - Guidance on responsive breakpoints and visual hierarchy will inform component composition.

4. **What is the expected listing volume per search?**
   - "< 500" is assumed in goals; if searches regularly return 1000+, we must implement marker clustering immediately.

5. **Should map state (center, zoom) persist across navigation and back?**
   - If yes, implement via URL params or sessionStorage; if no, confirm that full reset on route change is acceptable.

6. **Do we need analytics on map interactions** (e.g., marker clicks, zoom events)?
   - If yes, define events and schema now to avoid refactoring later.

7. **Is there a design system or component library for map-related UI** (buttons, info windows, tooltips)?
   - Confirm styling approach (Tailwind classes, custom CSS, or existing component library) to avoid rework.

---

## Implementation Checklist

- [ ] Verify Prisma schema includes `latitude`, `longitude` on Listing model; add migration if needed.
- [ ] Backfill geocoding data for existing listings (if not present).
- [ ] Configure Google Maps API key and add `@react-google-maps/api` to dependencies.
- [ ] Create `MapContainer` component with GoogleMapWrapper child.
- [ ] Implement `MarkerList` component; render marker per listing.
- [ ] Add info window component for marker click/hover; test tooltip behavior.
- [ ] Implement geocoding for `locationValue` param (cache results).
- [ ] Add responsive layout logic (sidebar desktop, full-width mobile).
- [ ] Write unit tests for MapContainer (rendering, filter sync, error states).
- [ ] Performance test with 300–500 markers; profile and optimize if needed.
- [ ] Test keyboard accessibility and ARIA labels with screen reader.
- [ ] Add error boundary and fallback UI for API failures.
- [ ] Document component API and geocoding cache strategy in code comments.