# Product Requirements Document

## Problem
Users browsing Airbnb clone listings lack geographic context when evaluating properties. Without a visual map, they cannot quickly assess neighborhood location, density of available listings, or proximity to landmarks—forcing them to manually cross-reference addresses or rely on text descriptions alone.

## Goals
1. **Display interactive map** on the listings search page showing pinned locations for all search results within the current filter scope.
2. **Enable map-driven exploration** so users can identify listing clusters and understand geographic distribution without leaving the search page.
3. **Maintain filter state synchronization** between map and list view (locationValue, guestCount, roomCount remain consistent).
4. **Load and render maps performantly** for searches returning up to 100+ listings without blocking the page.
5. **Establish reusable map component pattern** for future map usage across the application.

## Non-Goals
- Clustering/heatmap visualizations (defer to Phase 2).
- Map-based filtering (e.g., drawing a bounds box to filter listings).
- Turn-by-turn directions or routing.
- Street View or 360° panoramas.
- Custom map styling or dark mode variants in this release.

## User Stories

| ID | Story |
|----|-------|
| US-1 | As a user searching listings, I want to see a map with pins for each result so I understand their geographic distribution. |
| US-2 | As a user, I want the map to respect my current filters (location, guest count, room count) so the map only shows relevant listings. |
| US-3 | As a user, I want to click a pin on the map and see listing details (or navigate to that listing) so I can quickly compare properties by location. |
| US-4 | As a user on mobile, I want the map to be responsive and readable so I can browse listings on any device. |

## Acceptance Criteria

### Functional
- [ ] Map component displays on the search results page, positioned below or beside the listings list (layout TBD).
- [ ] Map loads with initial bounds centered on the primary search location (derived from `locationValue` param).
- [ ] All listings matching current filters (locationValue, guestCount, roomCount) render as markers on the map.
- [ ] Clicking a map marker either opens an info window with listing summary (title, price, rating) or navigates to the listing detail page.
- [ ] Map remains in sync when user changes filters—markers update or map re-centers without page reload.
- [ ] Zoom and pan controls are visible and functional.

### Performance
- [ ] Map initializes and renders within 2 seconds on a typical connection (3G).
- [ ] Adding/removing markers for filter changes completes within 500ms.
- [ ] No layout shift or jank when map loads (use Suspense/skeleton if needed).

### Responsive Design
- [ ] On desktop (>768px), map occupies at least 40% of viewport width.
- [ ] On tablet (768px–1024px), map stacks below listings or uses split-view layout.
- [ ] On mobile (<768px), map is toggleable or occupies full width below listings list.

### Data & Integration
- [ ] Listings API response includes `latitude` and `longitude` fields (or city-level coordinates if exact coords unavailable).
- [ ] Map API key is stored securely in environment variables; no keys exposed in frontend code.
- [ ] Listing data passed to map is the same dataset fetched by the listings list (no separate API call).

---

## Solution Design

### Component Architecture

```
SearchPage
├─ SearchParams (parse locationValue, guestCount, roomCount)
├─ fetchListings(params) → [Listing]
├─ ListingsList (existing)
└─ ListingsMap (new)
    ├─ GoogleMap (@react-google-maps/api)
    ├─ MarkerClusterer (optional, Phase 2)
    └─ InfoWindow (optional, for quick preview)
```

### Implementation Flow

1. **Data Fetch** (server-side or client-side, TBD):
   - Listings API endpoint (`/api/listings`) already returns array of listings with search params.
   - Confirm response includes `latitude` and `longitude` for each listing.

2. **Map Initialization**:
   - Use `@react-google-maps/api` `GoogleMap` component.
   - Set initial center to `locationValue` (geocoded or cached coordinate).
   - Set zoom level to 12 (city-level view, adjustable per UX review).

3. **Marker Rendering**:
   - Loop through listings array; create `Marker` for each.
   - Attach listing ID, price, and thumbnail to marker data.
   - Use custom marker icon (optional, Phase 2).

4. **Interactivity**:
   - On marker click, trigger `InfoWindow` or navigate to listing detail page.
   - On filter change, rebuild marker set (remove old, add new).

5. **Error Handling**:
   - If geolocation fails or API returns no coords, fallback to hiding map or showing placeholder.
   - If Google Maps API fails to load, display error boundary.

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Server vs. Client data fetch** | Defer to architecture review; keep listings fetch unified (don't duplicate calls). |
| **Marker click behavior** | Prefer navigation to detail page over inline info window (cleaner, less cognitive load). Revisit if UX testing suggests otherwise. |
| **Zoom & bounds** | Start with zoom=12, allow user pan/zoom. Auto-fit bounds only if all markers are far apart (Phase 2). |
| **Map position** | Place below listings list on mobile; side-by-side on desktop (Tailwind grid/flex TBD by design team). |

---

## Data Model

### Listings API Response (existing, confirm fields)

```typescript
interface Listing {
  id: string;
  title: string;
  description: string;
  imageSrc: string;
  category: string;
  roomCount: number;
  bathroomCount: number;
  guestCount: number;
  price: number;
  locationValue: string;    // e.g., "San Francisco, CA"
  latitude: number;         // ← REQUIRED for map
  longitude: number;        // ← REQUIRED for map
  userId: string;
  rating?: number;
  reviewCount?: number;
}
```

### ListingsMap Component Props

```typescript
interface ListingsMapProps {
  listings: Listing[];
  selectedLocationValue?: string;  // for map centering
  isLoading?: boolean;
}
```

### Marker Data Structure (internal to component)

```typescript
interface MarkerData {
  id: string;
  position: { lat: number; lng: number };
  title: string;
  price: number;
  imageSrc: string;
}
```

### Prisma Schema Addition (if latitude/longitude missing)

```prisma
model Listing {
  // ... existing fields
  latitude      Float       @default(0)
  longitude     Float       @default(0)
}
```

**Migration**: Backfill existing listings with geocoded coordinates using a one-time seed script (e.g., via Google Geocoding API or manual import).

---

## Edge Cases

1. **Listings without coordinates**: Fallback to geocoding `locationValue` (city-level pin); note in UI.
2. **Very high listing density** (100+ in one area): Consider lazy-loading markers or clustering (Phase 2).
3. **Mobile viewport**: Ensure map doesn't obscure search inputs; consider collapsible toggle.
4. **Slow network**: Display skeleton/placeholder while map loads; do not block listings list.
5. **Invalid API key or quota exceeded**: Show error message; do not crash page.
6. **User has location services disabled**: Proceed without geolocation; use `locationValue` as fallback.

---

## Out of Scope (Deferred)

- **Marker clustering**: Defer to Phase 2 if performance issues emerge.
- **Custom marker icons**: Use default Google Maps pins in v1.
- **Map-based search/filtering**: Users must use filter UI; map is read-only in v1.
- **Saved locations overlay**: Defer to future user account features.
- **Directions / routing**: Out of scope for listings discovery.
- **Dark mode map style**: Defer to global theming work.

---

## Open Questions

1. **Coordinate sourcing**: Are exact listing coordinates available in the existing database, or must we geocode by `locationValue`? Does this require a migration?
2. **Map placement**: Side-by-side or stacked layout? Responsive breakpoints?
3. **Marker interaction UX**: Info window popup (quick preview) or direct navigation to listing? Accessibility considerations?
4. **Billing & quota**: What is the expected query volume? Does current Google Maps API plan support it, or does it need upgrade?
5. **Analytics**: Should map interactions (clicks, zoom) be tracked for user behavior insights?
6. **Mobile priority**: Is mobile-first or desktop-first the primary launch target?
7. **Initial bounds**: If user hasn't searched yet (home page), what does the map show? Global view or hidden until search?