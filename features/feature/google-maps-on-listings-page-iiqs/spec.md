# Product Requirements Document

## Problem
Users browsing Airbnb listings lack a visual reference for property locations. Currently, the listings page displays search results as a filtered list only, forcing users to manually cross-reference addresses with external maps. Integrating an interactive Google Map directly on the listings page reduces friction in the property discovery workflow and helps users make location-based decisions faster.

## Goals
1. **Display an interactive Google Map** on the listings page showing pins for all filtered properties in the current search results.
2. **Synchronize map state with search parameters** (locationValue, guestCount, roomCount) so the map reflects the active filters without requiring additional API calls.
3. **Enable location-aware interaction** where clicking a listing highlights its pin on the map, and vice versa.
4. **Load the map without degrading page performance** (target: <500ms additional render time for map initialization).
5. **Support responsive design** so the map functions on desktop and tablet viewports.

## Non-Goals
- Street-view or satellite imagery toggle in this release.
- Drawing custom search radius boundaries on the map.
- Turn-by-turn directions or public transit integration.
- Clustering logic for densely packed pins (defer to v2 if needed).

## User Stories
- **As a guest**, I want to see properties plotted on a map so I can visually assess neighborhood proximity to landmarks.
- **As a guest**, I want the map to update when I change filters so I don't have to manually refresh.
- **As a guest**, I want to click a listing and see its pin highlighted on the map so I can quickly locate it geographically.

## Solution Design

### Architecture Overview
The Google Map will be rendered as a **component on the listings page** (`/app/listings/page.tsx` or a child component). The map will:
1. Consume the existing search params (locationValue, guestCount, roomCount) from the URL.
2. Fetch listings data from the existing `/api/listings` endpoint (no new API needed).
3. Use `@react-google-maps/api` library (already in tech stack) to render the map and markers.
4. Maintain a shared state with the listings list to enable click-to-highlight interactions.

### Component Structure
```
ListingsPage
├── ListingsFilters (existing)
├── ListingsContainer
│   ├── GoogleMapComponent (new)
│   └── ListingsList (existing)
└── [Layout handles responsive split]
```

### Data Flow
1. **On page load**: Search params are extracted; a GET request to `/api/listings?locationValue=X&guestCount=Y&roomCount=Z` returns listing data.
2. **Map initialization**: The map centers on the `locationValue`'s coordinates (lat/lng must be resolved from locationValue or added to the listing response).
3. **Marker placement**: For each listing, a marker is rendered at its coordinates with a click handler.
4. **Listing interaction**: Clicking a listing card emits an event (or updates local state) to highlight/pan to its corresponding marker.

## Data Model

### Listing Data Structure (Existing)
```typescript
interface Listing {
  id: string;
  title: string;
  imageSrc: string;
  category: string;
  roomCount: number;
  bathroomCount: number;
  guestCount: number;
  locationValue: string; // e.g., "Vancouver"
  userId: string;
  price: number;
  // ... other fields
}
```

### Extended Listing Response (New Requirement)
To power the map, the `/api/listings` endpoint must return **latitude and longitude** for each listing. This can be:

**Option A (Recommended)**: Add `lat` and `lng` columns to the Listing model in Prisma.
```typescript
model Listing {
  // ... existing fields
  lat: Float;      // Stored at listing creation time
  lng: Float;      // Stored at listing creation time
}
```

**Option B**: Geocode locationValue at request time (adds latency, not recommended).

### Map State Interface (New)
```typescript
interface MapState {
  center: { lat: number; lng: number };
  zoom: number;
  selectedListingId: string | null; // Tracks which listing is highlighted
}

interface MapMarker {
  id: string;              // listing.id
  position: { lat: number; lng: number };
  title: string;           // listing.title
  price: number;           // listing.price
}
```

## Acceptance Criteria

### Functional
1. **Map renders** on the listings page with visible marker pins for all listings returned by `/api/listings`.
2. **Map centers** on the first listing's coordinates or the centroid of all listings on initial load.
3. **Search params sync**: Changing filters (locationValue, guestCount, roomCount) updates the displayed listings and map markers without a full page reload.
4. **Listing-to-marker interaction**: Clicking a listing card highlights or pans the map to the corresponding marker.
5. **Marker-to-listing interaction**: Clicking a marker opens a popup or highlights the listing card.

### Technical
6. **API response includes coordinates**: `/api/listings` returns `lat` and `lng` for each listing (or error handling if missing).
7. **No performance regression**: Page load time does not increase by more than 500ms; map renders within 2 seconds of component mount.
8. **Responsive layout**: On tablet (768px–1024px), the map is visible and functional; on mobile (<768px), the map may be collapsed or below the fold (defer exact mobile UX to design).
9. **Error handling**: If Google Maps API key is missing or invalid, the map fails gracefully without breaking the listings list.

### Quality
10. **Map is keyboard-accessible**: Tab navigation works; ARIA labels are present on markers.
11. **No console errors**: React and library warnings do not appear in browser console.

## Edge Cases

| Case | Handling |
|------|----------|
| **No listings match filters** | Map displays but no markers; shows "No results" message. |
| **Single listing in results** | Map centers and zooms to that one marker; marker remains visible. |
| **Listing has no lat/lng** | Marker is skipped with a warning log; other markers render normally. |
| **Google Maps API key is invalid** | Map div displays error message; listings list still renders. |
| **Very dense marker cluster** (e.g., 200+ listings) | All markers render (clustering is Non-Goal); consider pagination or filtering as mitigation. |
| **User zooms/pans map** | Map state is retained; filter interactions pan back to result bounds (not sticky zoom). |

## Out of Scope

- **Mobile-first map UX**: Tablet/desktop are the priority; mobile layout deferred pending design review.
- **Marker clustering**: If 50+ markers become unreadable, defer to v2.
- **Saved location bookmarks on map**: Defer to a future favorites feature.
- **Map-based search radius drawing**: Defer; filter-based search is sufficient for now.
- **Analytics/tracking on map interactions**: Defer until analytics infrastructure is in place.

---

## Open Questions

1. **Coordinate data**: Do listings already have lat/lng stored? If not, what is the migration plan for backfilling existing listings?
2. **Geocoding**: Should locationValue be geocoded server-side at listing creation, or should we store pre-computed coordinates in the database?
3. **Mobile layout**: Should the map be hidden, collapsed, or repositioned on mobile (<768px)? Design sign-off needed.
4. **Marker styling**: Should markers be branded (Airbnb red, custom icons), or use Google Maps defaults? Design system input required.
5. **Map dimensions**: Should the map be a fixed sidebar, a split pane, or full-width with listings below? Layout TBD with design.
6. **API key management**: Where will the Google Maps API key be stored, and who manages billing?
7. **Listing popup on marker click**: Should clicking a marker show a mini card, open a modal, or just highlight the list item?