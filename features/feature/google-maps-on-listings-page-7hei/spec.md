# Product Requirements Document

## Problem
Listings page users cannot visually locate properties on a map, forcing them to rely solely on text-based location information and manual address parsing. This limits exploration and confidence in property locations relative to nearby amenities, transit, or geography.

---

## Goals
1. **Display interactive map** on the listings page showing property locations for the current search results.
2. **Synchronize map markers** with filtered listings (guest count, room count, location) in real-time as filters change.
3. **Enable property preview** by clicking a marker to show listing details without navigation.
4. **Support responsive layout** across desktop and mobile viewports.
5. **Maintain search performance** by rendering maps only when locationValue is present and limiting initial marker load.

---

## Non-Goals
- Turn-by-turn directions or routing between properties.
- Map-first search UX (e.g., drawing polygons to filter).
- Custom map styling or multiple map providers.
- Clustering of markers for zoomed-out views.
- Street view or 3D map features.

---

## User Stories

**US-1:** As a guest, I want to see property markers on a map so that I can understand geographic distribution relative to my search location.

**US-2:** As a guest, I want the map to update when I change filters (guest count, room count) so that I see only relevant properties on the map.

**US-3:** As a guest, I want to click a marker and see a preview of the listing so that I can quickly assess a property without navigating away from the map.

**US-4:** As a guest on mobile, I want the map to adapt to a smaller screen so that I can still explore listings on my phone.

---

## Acceptance Criteria

### Functional
- [ ] Map component renders on the listings page when `locationValue` search param is present.
- [ ] Each visible listing is represented by a marker at its latitude/longitude.
- [ ] Map updates (markers added/removed) within 500ms when filters (guestCount, roomCount) change.
- [ ] Clicking a marker displays listing name, image thumbnail, price, and a "View Details" link.
- [ ] Map defaults to center on the search location with zoom level 12; bounds adjust if markers span a wide area.
- [ ] Map does not render or shows a fallback message when `locationValue` is empty or invalid.

### Technical
- [ ] Google Maps API key is securely stored in environment variables.
- [ ] Marker data is fetched from the existing `/api/listings` endpoint using current search params.
- [ ] Map re-renders only when search params or filter state changes (avoid unnecessary API calls).
- [ ] Component is built using `@react-google-maps/api` (as specified in tech stack).
- [ ] TypeScript types are defined for map component props and listing marker data.

### UX/Design
- [ ] Map occupies 40–50% of the listings page on desktop (right column or modal).
- [ ] Map is stacked below listings on mobile (<768px) and takes full width.
- [ ] Marker popups are readable with sufficient contrast and touch-friendly (min 44px tap target).
- [ ] Map controls (zoom, pan) are accessible via keyboard.

### Performance
- [ ] Initial map load (with markers) completes in <2s on 4G.
- [ ] Map layer does not block rendering of the listings list.

---

## Out of Scope
- Saving favorite/bookmarked locations from the map.
- Heat maps showing availability or price density.
- Offline map caching.
- Export/share map views.
- Integration with external navigation apps (Google Maps app linking).

---

## Solution Design

### Overview
The Google Maps feature adds a **map panel** to the listings page that displays property markers synchronized with the current search filters. The map is rendered client-side using the `@react-google-maps/api` library and pulls listing data from the existing `/api/listings` endpoint.

### Architecture & Components

**1. MapPanel Component**
- Location: `app/components/MapPanel.tsx`
- Accepts props:
  - `listings: Listing[]` – filtered listing array
  - `searchLocation: string` – the search location (for centering)
  - `onMarkerClick: (listingId: string) => void` – callback when a marker is clicked
- Renders `GoogleMap` and `Marker` components from `@react-google-maps/api`
- Handles map initialization, re-centering, and bounds calculation

**2. ListingMarkerPreview Component**
- Location: `app/components/ListingMarkerPreview.tsx`
- Displays inside a map `InfoWindow`
- Shows: listing name, thumbnail image, price/night, "View Details" link
- Closes when user clicks outside or on the close button

**3. Integration Point: Listings Search Page**
- Location: `app/listings/page.tsx` (existing)
- Import and render `MapPanel` with current `listings` array and search params
- Pass `onMarkerClick` callback to navigate or open preview modal

### Data Flow
1. User lands on `/listings?locationValue=London&guestCount=2&roomCount=1`
2. Listings page fetches data from `/api/listings?locationValue=London&guestCount=2&roomCount=1`
3. `MapPanel` receives filtered `listings` array and search params
4. Map centers on `locationValue` (geocoded via Google Geocoding API or stored latitude/longitude in listing data)
5. Markers are rendered for each listing
6. On filter change, listings array updates, map re-renders, bounds adjust
7. On marker click, preview modal or inline `InfoWindow` displays listing preview

### Error Handling
- **Missing locationValue:** Show placeholder message "Search a location to view the map"
- **Geocoding failure:** Center map on a default location (e.g., user's IP-based location)
- **No listings found:** Show empty map with message "No properties match your filters"
- **API errors:** Log to Sentry; display user-friendly error banner

---

## Data Model

### Listing (Existing)
```typescript
type Listing = {
  id: string;
  title: string;
  imageSrc: string;
  price: number;
  locationValue: string;
  latitude: number;      // NEW: Required for map marker positioning
  longitude: number;     // NEW: Required for map marker positioning
  guestCount: number;
  roomCount: number;
  // ... other fields
};
```

### MapMarkerData (Internal)
```typescript
type MapMarkerData = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  price: number;
  imageSrc: string;
};
```

### Database Schema Updates (Prisma)
```prisma
model Listing {
  id          String   @id @default(cuid())
  title       String
  imageSrc    String
  price       Int
  locationValue String
  latitude    Float    @default(0)    // NEW
  longitude   Float    @default(0)    // NEW
  guestCount  Int
  roomCount   Int
  // ... other fields
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**Migration Notes:**
- Populate existing listings with latitude/longitude via reverse geocoding or manual data entry
- Ensure all new listings include coordinates at creation time

### API Contract
**GET `/api/listings`** (existing, no changes)
- Query params: `locationValue`, `guestCount`, `roomCount`
- Response: `Listing[]` (now includes `latitude` and `longitude`)

---

## Edge Cases & Risks

### Edge Cases
- **Listings without coordinates:** Map gracefully skips rendering markers for listings missing lat/long
- **Duplicate locations:** Multiple listings at same address render overlapping markers (addressed in Non-Goals; not clustering in this release)
- **Zoom level mismatch:** If all listings cluster in one area, map auto-adjusts bounds; if spread across city, zoom out
- **Mobile gesture conflicts:** Ensure swipe-to-scroll on listing list does not trigger map pan
- **Search param changes during load:** If user changes filters while map is loading, cancel previous API call to avoid race conditions

### Risks
1. **Performance on large result sets** (100+ listings): Map rendering may be slow. *Mitigation:* Implement marker pagination or virtualization in a future release; for now, cap markers at initial 50 listings
2. **Google Maps API quota & cost:** Embedded maps and geocoding incur charges. *Mitigation:* Monitor usage; implement rate limiting on API calls
3. **Data consistency:** If listing coordinates are stale or incorrect, markers will be misplaced. *Mitigation:* Validate coordinates during data import; add QA check in pre-launch
4. **Browser compatibility:** Older browsers may not support Google Maps API. *Mitigation:* Provide fallback (text-based location info); test on IE11+

---

## Open Questions

1. **Geocoding strategy:** Should we geocode search location client-side (Google Geocoding API) or server-side (Prisma query by stored location point)? What is the preferred latency/cost trade-off?
2. **Listing coordinates source:** Are listings already stored with latitude/longitude, or do we need a data migration to populate them?
3. **Preview UX:** Should clicking a marker open an inline `InfoWindow` or a modal overlay? Do we navigate to the listing detail page?
4. **Map placement:** Should the map be a right-hand sidebar on desktop, a full-width collapsible panel below listings, or a modal toggle?
5. **Zoom/pan state:** Should the map state (zoom, center) persist in the URL (deep-linkable) or session storage?
6. **Accessibility:** Do we need screen-reader labels for each marker, or is the listing list sufficient for a11y?

---

## Dependencies & Assumptions

- **Dependency:** `@react-google-maps/api` is already in `package.json`; Google Maps API key is configured in `.env.local`
- **Assumption:** All listings have or will have `latitude` and `longitude` fields populated
- **Assumption:** Search location (`locationValue`) maps to a single point (not a region)
- **Assumption:** Current `/api/listings` endpoint returns listings filtered by search params; map does not need its own filtering logic