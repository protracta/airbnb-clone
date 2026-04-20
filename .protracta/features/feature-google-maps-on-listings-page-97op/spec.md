# Product Requirements Document

## Problem

Users browsing Airbnb clone listings lack visual spatial context for property locations. Currently, the search results page shows filtered listings in a list format only, forcing users to mentally map addresses and compare distances. A map integration would let users see property locations at a glance, correlate price with geography, and filter visually—reducing decision friction and improving confidence in booking decisions.

## Goals

1. **Display interactive map** on the listings page showing property pins for all currently filtered results (by location, guest count, room count).
2. **Synchronize list ↔ map state** so selecting a listing in the list highlights its pin on the map and vice versa.
3. **Reduce cognitive load** by allowing users to understand property geography without context-switching between list and external maps.
4. **Support mobile and desktop layouts** with responsive map sizing (map secondary on mobile, side-by-side on desktop).
5. **Maintain search parameter fidelity** so `locationValue`, `guestCount`, and `roomCount` continue to drive both list and map results without URL pollution.

## Non-Goals

- Turn-by-turn navigation or directions to properties.
- Street view or 3D building previews.
- Drawing custom search radiuses or polygon filters.
- Offline map caching or map tile customization.
- Heatmap visualization of price density or availability trends.

## User Stories

- **As a** guest browsing listings, **I want** to see properties plotted on a map so that **I can visualize their geographic distribution and walkability to landmarks**.
- **As a** guest, **I want** to click a map pin to jump to and highlight that listing in the list so that **I can quickly compare nearby properties without scrolling**.
- **As a** guest on mobile, **I want** the map to be easily accessible (collapsible or toggled) so that **I don't sacrifice screen space for list viewing**.
- **As a** guest, **I want** the map to update in real-time as I refine filters so that **I stay oriented without manual page reloads**.

## Acceptance Criteria

### Functional
1. **Map renders on listings page** with Google Maps API key configured; no errors on load or during re-render.
2. **All filtered listings appear as pins** on the map; pin count matches visible listing count in the list.
3. **Pins are clickable** and trigger navigation to the corresponding listing detail or highlight the listing in the list view.
4. **Map re-renders and pins update** when any of `locationValue`, `guestCount`, or `roomCount` search params change.
5. **Map center and zoom** default to a sensible frame for the filtered results (e.g., center of all pins, auto-fitted bounds).
6. **Selected/highlighted pin** has distinct visual styling (e.g., color change, icon change, or label).

### Performance
7. **Map + list interaction latency** ≤ 500 ms for pin clicks and list selections.
8. **Page load time** does not increase by >1 second with map component added (lazy-load map if necessary).

### Responsive Design
9. **Desktop layout (≥1024px)** displays map side-by-side with list (e.g., 50/50 or 60/40 split).
10. **Mobile layout (<768px)** shows map in a collapsible drawer, tab, or toggle below the list; list remains primary.
11. **Tablet layout (768–1024px)** gracefully degrades map (e.g., stacked vertically or hidden by default).

### Accessibility & UX
12. **Map has keyboard navigation** (arrow keys to pan, +/− to zoom, or standard Google Maps controls).
13. **Pin hover/focus states** are clearly visible and announced to screen readers.
14. **Search params are preserved** in the URL; map state is derived from params, not internal React state.

## Solution Design

### Component Architecture

```
ListingsPage (app/listings/page.tsx)
├── SearchBar (existing)
├── Filter Controls (existing)
├── ListingsContainer (new layout wrapper)
│   ├── ListingsMap (new)
│   │   └── GoogleMap (@react-google-maps/api)
│   │       └── MarkerClusterer + Markers
│   └── ListingsList (existing, refactored)
│       └── ListingCard[] (existing)
```

### Key Implementation Details

1. **Map Component (`ListingsMap.tsx`)**
   - Wraps `@react-google-maps/api` (GoogleMap, MarkerClusterer, Marker, InfoWindow).
   - Accepts `listings` array and `onPinClick(listingId)` callback.
   - Manages map instance ref and bounds fitting on mount and when listings change.
   - Renders pins with listing price and property type in infowindows.

2. **State Synchronization**
   - Parent component (`ListingsPage`) manages a single `selectedListingId` state.
   - Passing `selectedListingId` to both `ListingsMap` and `ListingsList` ensures visual sync.
   - `onPinClick` and list item selection both update the same `selectedListingId` state.

3. **Search Param → Data Flow**
   - Existing: `useSearchParams()` reads `locationValue`, `guestCount`, `roomCount`.
   - `/api/listings` fetch already filters by these params.
   - Map receives the same filtered listings array as the list; no additional API call needed.

4. **Responsive Layout**
   - Use Tailwind `grid` or `flex` with breakpoints:
     - Mobile: `flex flex-col` (map hidden or in drawer by default).
     - Tablet: `grid grid-cols-1` or single column toggle.
     - Desktop: `grid grid-cols-2` (list + map side-by-side).

### Data Dependencies

- **Input**: `listings[]` (from existing `/api/listings` response).
- **Input**: `locationValue` URL param (used to center map).
- **Output**: Visual pins and infowindows; no new API or database writes.

## Data Model

### Existing Models (Unchanged)
- `Listing` (Prisma model): `id`, `title`, `description`, `price`, `latitude`, `longitude`, `guestCount`, `roomCount`, `locationValue`, etc.

### New Data Requirements
- **No database schema changes.**
- **Listings API response** must include `latitude` and `longitude` for each listing (assumed to exist; validate during implementation).
- **Map state** is ephemeral and derived from URL params + listings data; not persisted.

### Validation Rules
- Latitude must be in range `[-90, 90]`.
- Longitude must be in range `[-180, 180]`.
- Missing or invalid coordinates are silently skipped (pin not rendered).

## Edge Cases

1. **No listings match filters**: Map renders but shows no pins. Display a helpful message (e.g., "No properties found in this area. Try adjusting filters.").
2. **Single listing**: Map should center on it and zoom to a readable level (e.g., zoom 15).
3. **All listings at the same coordinate**: Cluster them visually or offset slightly to avoid overlap.
4. **Very large result sets (100+ listings)**: Use marker clustering (`MarkerClusterer` from library) to avoid performance degradation.
5. **Invalid `locationValue`**: Map defaults to a global center (e.g., `{lat: 20, lng: 0}`) or hides map with error message.
6. **Slow API response**: Show map skeleton loader while listings fetch; pins render as data arrives.
7. **Google Maps API key missing or invalid**: Render error boundary fallback; don't break the page.
8. **Mobile user toggles map on/off multiple times**: Ensure re-mounting doesn't leak map instances or event listeners; use `useEffect` cleanup.

## Open Questions

1. **What zoom level and bounds fitting strategy** should the map use when multiple listings are displayed? (e.g., fit all pins with padding, or center on `locationValue` and zoom to a fixed level like 13?)
2. **Should the map display anything (e.g., price or property type label) inside pins**, or just a generic marker with an infowindow on click?
3. **Is there a preference for marker clustering UI** (e.g., numbered circles vs. heatmap)? Current recommendation: `MarkerClusterer` with default styling.
4. **Should clicking a map pin scroll the list to that listing**, or just highlight it? (Recommend: scroll + highlight for mobile, highlight only for desktop.)
5. **What is the target mobile breakpoint** for switching layout? (Recommend: Tailwind's `md:` at 768px.)
6. **Should the map be filterable by viewport** (e.g., "Show only listings in current map bounds")? (Deferred to Phase 2; marked as out-of-scope.)
7. **Do all Listing records currently have valid `latitude` and `longitude` values**, or do we need a migration or fallback geocoding strategy?
8. **Should the map persist its pan/zoom state** as the user browses, or reset on every filter change?

## Out of Scope

- Viewport-based filtering ("Show me only listings visible on the map right now").
- Heatmap or density visualization by price, rating, or availability.
- Custom map styling (dark mode, custom colors, branded markers).
- Drawing or search radius tools.
- Street view or 3D building tours.
- Transit/walkability score overlays.
- Favorite/saved properties pins or layer.
- Multi-language map labels.

---

## Implementation Notes

- **Tech stack alignment**: Use existing `@react-google-maps/api` library; add `@react-google-maps/marker-clusterer` for large result sets.
- **API key management**: Store Google Maps API key in `.env.local` (Next.js convention); ensure it has Maps JavaScript API enabled.
- **Testing strategy**: Unit tests for map state sync (listing selection), integration tests for filter → map update flow, visual regression tests for responsive layouts.
- **Rollout**: Feature-flag behind a toggle or release to 10% of users first to validate performance and UX on production data.