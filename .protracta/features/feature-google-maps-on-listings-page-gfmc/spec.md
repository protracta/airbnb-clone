# Product Requirements Document

## Problem
Users browsing Airbnb listings lack a visual geographic reference for property locations. Currently, the listing page displays search results as a list only, forcing users to mentally map each address or manually open a separate map tool to understand neighborhoods, proximity to landmarks, or cluster of similar properties. This friction reduces confidence in booking decisions and slows discovery.

## Goals
1. **Display map on listings page** showing pins for all currently filtered listings in a single viewport.
2. **Enable location-based discovery** by allowing users to see property clusters and geographic distribution without leaving the search results page.
3. **Maintain search state** so map reflects active filters (location, guest count, room count) and updates when filters change.
4. **Support touch and desktop interactions** (pan, zoom, click to view listing details or open listing detail page).
5. **Load map efficiently** without blocking initial page render or degrading search performance.

## Non-Goals
- Street view or satellite imagery toggles.
- Geospatial search (e.g., "find listings within 2km of this point").
- Heatmaps or density visualizations.
- Map-first experience or full-screen map mode in this release.
- Offline map support or custom tile layers.
- Turn-by-turn directions or distance matrix calculations.

## User Stories
- As a **guest**, I want to see all listings on a map so that I can understand neighborhood geography and property density.
- As a **guest**, I want the map to update when I change filters so that I see only the relevant properties.
- As a **guest**, I want to click a map pin so that I can quickly identify which listing it represents and navigate to its detail page.
- As a **mobile user**, I want the map to be responsive and scrollable alongside the listing list so that I can view both simultaneously.

## Solution Design

### Overview
Integrate Google Maps on the listings search page using `@react-google-maps/api`. The map will display dynamically generated markers for each listing in the current filtered set. The map component will be positioned as a sidebar or below the listing list (layout TBD by design), and will re-render when the search params (`locationValue`, `guestCount`, `roomCount`) or listing data changes.

### Architecture
1. **Map Container Component** (`components/MapComponent.tsx`)
   - Wrapper around `GoogleMap` from `@react-google-maps/api`.
   - Accepts `listings` array as prop.
   - Centers map on mean latitude/longitude of filtered listings (or falls back to search location).
   - Renders `MarkerF` for each listing with `onClick` handler.

2. **Marker Handler**
   - On click: navigate to listing detail page (e.g., `/listings/{listingId}`) or open an inline preview modal (design decision pending).

3. **Integration Point**
   - Listings page (`app/listings/page.tsx`) fetches listings via existing `/api/listings` endpoint, passing URL search params.
   - Map component receives filtered listings as prop and re-renders on dependency changes.

4. **Initialization**
   - Google Maps API key stored in environment variable `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
   - Map library loaded via `@react-google-maps/api` wrapper (client-side).

### Data Flow
```
Search Page (listings/page.tsx)
  ↓ [read URL params: locationValue, guestCount, roomCount]
  ↓ [fetch /api/listings with params]
  ├─→ Listing List Component
  └─→ Map Component
       ↓ [render markers for each listing]
       ↓ [on marker click: navigate or preview]
```

### Key Implementation Decisions
1. **Marker pin content**: Initially show listing price or a generic marker icon; expand to thumbnail preview if design supports it.
2. **Map bounds**: Auto-fit to bounds of all visible markers using `fitBounds()`.
3. **Re-render strategy**: Map re-fetches listings and updates markers whenever `locationValue`, `guestCount`, or `roomCount` changes (existing behavior via URL params).
4. **Lazy load map**: Map component is rendered conditionally on listings page to avoid loading Google Maps library on non-search routes.

---

## Data Model

### Listing (existing)
```typescript
// Prisma schema (inferred from context)
model Listing {
  id          String
  title       String
  description String
  latitude    Float       // NEW: required for map display
  roomCount   Int
  guestCount  Int
  bathroomCount Int
  imageSrc    String
  category    String
  userId      String
  price       Int
  locationValue String   // e.g., city name or address
  createdAt   DateTime
}
```

**New requirement**: All listings must have valid `latitude` and `longitude` fields. Existing listings without coordinates must be migrated or excluded from map display.

### API Response (/api/listings)
```json
{
  "listings": [
    {
      "id": "uuid",
      "title": "Cozy apartment in Brooklyn",
      "latitude": 40.6501,
      "longitude": -73.9496,
      "price": 150,
      "imageSrc": "...",
      "locationValue": "Brooklyn, NY"
    }
  ]
}
```

### Map Props
```typescript
interface MapComponentProps {
  listings: Listing[];
  center?: { lat: number; lng: number }; // falls back to mean of listings
  zoom?: number; // default 12
}

interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  price: number;
  title: string;
}
```

---

## Acceptance Criteria

### Functional
1. **Map renders** on the listings search page without JavaScript errors.
2. **Markers display** for all listings returned by `/api/listings` endpoint.
3. **Map updates** when URL search params (`locationValue`, `guestCount`, `roomCount`) change.
4. **Click handler works**: clicking a marker navigates to the listing detail page or opens a preview (design decision required).
5. **Map centers and bounds** automatically fit all visible markers.
6. **Zoom and pan** work smoothly on both desktop and mobile.

### Performance
7. **Initial page load** is not blocked by map; map loads asynchronously.
8. **Marker rendering** is performant for 50+ listings (use clustering or virtualization if needed).
9. **API response time** for `/api/listings` remains under 500ms with map-specific data included.

### Data Integrity
10. **Listings without latitude/longitude** are logged as warnings and excluded from map display without crashing the component.
11. **Map gracefully handles empty listing sets** (e.g., no results) by showing a fallback message or centered map.

### Responsive Design
12. **Map is responsive** and adapts to mobile/tablet/desktop viewports.
13. **Layout** (map position, sizing) is defined in Tailwind and matches design specs (pending design handoff).

---

## Edge Cases

1. **No listings found**: Map shows centered on search location (if available) with no markers and displays "No listings in this area" message.
2. **Listings with invalid coordinates**: Marker is skipped; listing still appears in list. Warning logged to console in development.
3. **User searches very broad area** (e.g., entire country): 100+ markers may cause performance lag. Consider adding marker clustering library (e.g., `markerclusterer`).
4. **Map fails to load** (network error, invalid API key): Fallback to list-only view; error message displayed to user.
5. **User on slow network**: Map asynchronously loads; listing list renders immediately to avoid blocking UX.
6. **Listing location changes** (after user is viewing map): Map will update on next filter change or page refresh; no real-time sync required in this release.

---

## Open Questions

1. **Design layout**: Should the map be a sidebar (right-side column), full-width strip below listings, or toggled by a button?
2. **Marker click interaction**: Should clicking a marker navigate to listing detail page, or open an inline preview card/modal?
3. **Mobile strategy**: On mobile, should map be hidden by default and toggled, or stacked above/below listings?
4. **Marker clustering**: For searches with 50+ results, should we implement marker clustering to improve performance and UX?
5. **Existing listings migration**: How do we populate `latitude` and `longitude` for existing listings without geocoding service? (May require design/PM decision on data seeding.)
6. **Accessibility**: Should map have keyboard navigation and ARIA labels? (Likely yes, but specifics deferred to a11y review.)
7. **API key scope**: Should the API key be restricted to listings page domain only, or left open for future features?
8. **Search location context**: If user searches by `locationValue` (e.g., "Brooklyn"), should map center on that city center as fallback, or on marker bounds only?

---

## Out of Scope

- Advanced map controls (draw radius, filter by distance).
- Listing thumbnail previews in marker popups (can be added in V2).
- Save/favorite listings from map view.
- Real-time listing updates (map only refreshes on filter change).
- Integration with external geocoding service (assume listings already have lat/lng in database).
- Custom map styling or branding beyond Google Maps defaults.
- Analytics or click-through tracking on map markers.