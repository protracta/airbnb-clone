# Product Requirements Document

## Problem
Listing hunters on the Airbnb Clone platform currently lack geographic context when browsing properties. Users cannot visually verify neighborhood, proximity to landmarks, or surrounding amenities at a glance. This creates friction in the decision-making process and requires users to manually cross-reference external map services to validate listing locations.

## Goals
1. **Reduce friction:** Surface map visualization alongside listings without requiring external tab switches.
2. **Increase location confidence:** Enable users to validate neighborhood context and proximity relationships before clicking into detail pages.
3. **Support filtered discovery:** Map markers reflect active filter state (guest count, room count) in real time.
4. **Deliver on existing tech commitment:** Leverage the already-integrated `@react-google-maps/api` library to unblock downstream features.
5. **Maintain query state:** Preserve `locationValue`, `guestCount`, and `roomCount` URL parameters across map interactions.

## Non-Goals
- Street View, satellite imagery, or alternative map providers in this release.
- Map-based radius filtering ("show listings within 5km").
- Turn-by-turn directions or transit time estimates.
- Clustering or custom map styling beyond default Google Maps appearance.
- Mobile-optimized map UX (defer to responsive baseline).

## User Stories

1. **As a** guest searching for listings in a city, **I want** to see a map of all properties matching my filters **so that** I understand the geographic distribution before narrowing my choice.

2. **As a** guest with specific neighborhood preferences, **I want** the map to update when I adjust guest/room count filters **so that** I can explore how inventory changes across the area.

3. **As a** guest reviewing a listing, **I want** the map to highlight that specific property's location **so that** I can confirm it's in the neighborhood I want.

## Acceptance Criteria

### Functional
- [ ] Map renders on the search/listings page, positioned prominently (e.g., right-side panel or below listing cards on mobile).
- [ ] Map displays a marker for each listing returned by the active API query.
- [ ] Markers include the listing's `id`, `latitude`, and `longitude` from the database.
- [ ] When filters change (`guestCount`, `roomCount`, `locationValue`), the map refetches and re-renders markers immediately (no manual refresh required).
- [ ] Clicking a marker reveals a tooltip or popup showing listing title and price.
- [ ] The map stays in sync with URL search parameters; navigating back/forward doesn't break state.
- [ ] Map centers on the `locationValue` (or geocoded centroid) when the page loads.

### Non-Functional
- [ ] Map component loads asynchronously and does not block initial page render.
- [ ] Listings API response includes `latitude` and `longitude` fields for all properties.
- [ ] No API key exposure in client-side code; key is managed via environment variables.
- [ ] Map performs acceptably with 100+ markers on screen (use clustering if needed for UX).

### Edge Cases
- [ ] If `locationValue` is not recognized, map defaults to a fallback zoom level (e.g., world view) with a user-facing error message.
- [ ] If a listing is missing `latitude` or `longitude`, it is silently omitted from the map (logged server-side for data quality).
- [ ] If the Listings API is slow or fails, the map skeleton/loading state appears while the list loads.
- [ ] Switching between listings pages does not reset map position unexpectedly.

## Out of Scope
- Interactive map-based filtering (e.g., drawing polygons, setting radius bounds). **Deferred.** Requires additional UX design and backend geospatial query work.
- Listing detail page map integration. **Separate initiative.** Consider after search page ships.
- Multi-destination itinerary mapping. **Future phase.** Blocked on multi-city search capability.
- Accessibility features beyond standard Google Maps defaults (e.g., keyboard navigation, ARIA labels). **Design review required.** Flag for accessibility audit post-launch.

---

## Solution Design

### Architecture Overview
The map feature extends the existing search page without restructuring core routes or API contracts.

**Data Flow:**
1. User lands on `/listings?locationValue=Paris&guestCount=2&roomCount=1`.
2. The search page component reads URL params and calls `GET /api/listings?locationValue=Paris&guestCount=2&roomCount=1`.
3. The API response includes listings with `latitude` and `longitude`.
4. A new `<MapComponent>` renders in parallel with the listings feed, consuming the same listings data.
5. Map markers are derived directly from listings array; no separate geospatial query.

**Component Structure:**
```
/app/listings/
  page.tsx (existing search page)
    ├── SearchFilters (existing)
    ├── ListingsList (existing)
    └── ListingsMap (new)
        ├── GoogleMapContainer
        └── MarkerCluster (if needed for performance)
```

**Key Integration Points:**
- **URL Params:** Shared state via `useSearchParams()` hook. Map respects filter changes; no local state divergence.
- **API Contract:** Listings endpoint must return `latitude` and `longitude` for all properties. No new endpoint.
- **Error Handling:** Map gracefully degrades if Google Maps API key is missing or if geolocation data is incomplete.

### Data Model

#### Listing Entity (Existing)
```prisma
model Listing {
  id          String   @id @default(cuid())
  title       String
  price       Int
  locationValue String  // City or region string
  // ... other fields
  latitude    Float?   // NEW: Geographic latitude
  longitude   Float?   // NEW: Geographic longitude
  createdAt   DateTime @default(now())
}
```

**Rationale for NULL-able fields:** Existing listings may not have geolocation data. Migration strategy requires populating these fields via geocoding service or manual data import before public launch.

#### Map Marker Payload (Derived)
```typescript
interface MapMarker {
  id: string;           // Listing ID
  lat: number;          // latitude
  lng: number;          // longitude
  title: string;        // Listing title
  price: number;        // Price per night
}
```

**Data Source:** Mapped directly from Listings API response. No additional database queries.

### API Contract

**Existing Endpoint (Modified):**
```
GET /api/listings?locationValue=Paris&guestCount=2&roomCount=1
```

**Response (extended):**
```json
[
  {
    "id": "listing-1",
    "title": "Cozy Parisian flat",
    "price": 120,
    "locationValue": "Paris",
    "latitude": 48.8566,
    "longitude": 2.3522,
    "guestCount": 2,
    "roomCount": 1
  },
  ...
]
```

**Validation:**
- `latitude` and `longitude` must be valid floats or null (no silent coercion).
- All returned listings must have matching `locationValue` or be filtered server-side.

### Environment & Configuration
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<key>
GOOGLE_MAPS_GEOCODING_API_KEY=<key> // For server-side geocoding (future: reverse-lookup missing lat/lng)
```

**Google Maps Library Usage:**
- `@react-google-maps/api` for client-side rendering.
- `GoogleMap`, `MarkerF`, `InfoWindowF` components.
- Load API asynchronously via `useJsApiLoader` hook to avoid blocking initial paint.

---

## Open Questions

1. **Geolocation Data Completeness:** Do all existing listings in the database have `latitude` and `longitude` values, or do we need a backfill migration before launch?

2. **Fallback Geocoding:** If a listing lacks coordinates, should the backend auto-geocode using `locationValue`, or should we require manual data entry?

3. **Mobile Map Layout:** Should the map be full-width, a side panel, or a collapsible drawer on small screens? Responsive design spec is missing.

4. **Marker Clustering:** At what zoom level or marker count should clustering activate? Should cluster counts be visible?

5. **Tooltip Interaction:** Is a hover-triggered tooltip sufficient, or should clicking a marker navigate to the listing detail page directly?

6. **Map Bounds:** Should the map auto-fit to show all markers on the current page, or should it respect a fixed zoom level tied to `locationValue`?

7. **Performance Baseline:** What is the acceptable map load time? Should we paginate markers (e.g., show top 50) or use a separate geospatial index for fast queries?

8. **Analytics:** Should we track map interactions (e.g., marker clicks, zoom events) for future product decisions?

---

## Edge Cases & Risks

| Edge Case | Mitigation |
|-----------|-----------|
| Missing lat/lng in database | Silently omit from map; log for data quality audit. Implement server-side geocoding backfill pre-launch. |
| Invalid `locationValue` | Show world map with error toast. Provide search suggestions. |
| API key expiration/quota exceeded | Graceful fallback: show list view only; log error server-side. Alert product team. |
| Very high marker density (1000+ listings) | Implement clustering with visual count badges. Test performance ceiling. |
| User zooms in on empty area | No markers displayed; expected behavior. Consider heat map overlay (future). |
| Network timeout loading map | Skeleton loader during load. Retry mechanism or fallback to list view after timeout. |

---

## Success Metrics (Proposal)
- **Adoption:** % of search sessions where the map is visible.
- **Engagement:** Avg. time spent on listings page (expect increase due to map exploration).
- **Data Quality:** % of listings with non-null lat/lng.
- **Performance:** Map first paint time < 1s; marker render time < 500ms for 100+ markers.