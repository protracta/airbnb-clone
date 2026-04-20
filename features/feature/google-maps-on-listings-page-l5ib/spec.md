# Product Requirements Document

## Problem

Users browsing listings on the search results page cannot visualize property locations geographically. They must open individual listings to understand neighborhood context, making it harder to evaluate multiple properties by location proximity. Adding an interactive map to the listings page will reduce cognitive load and accelerate decision-making for location-sensitive searches.

## Goals

1. **Display listings on an interactive map** – Render all search-result listings as markers on Google Maps, centered on the searched location.
2. **Enable location-based filtering** – Allow users to visually identify clusters of properties and refine searches by map interaction.
3. **Maintain search state synchronization** – Map markers and listing cards stay in sync as `locationValue`, `guestCount`, and `roomCount` change.
4. **Achieve <2s map load time** – Google Maps API calls and marker rendering do not block search results display.
5. **Mobile-responsive layout** – Map scales gracefully on mobile (collapsed/drawer) and desktop (side panel).

## Non-Goals

- Booking or reservation flow integration with map.
- Turn-by-turn directions or routing.
- Custom map styling beyond Google Maps default theme.
- Heat maps or density visualizations.
- Map-based search (drag-to-filter boundaries).

## User Stories

- **As a guest**, I want to see all available listings pinned on a map so that I can understand their geographic distribution relative to landmarks or transport.
- **As a guest on mobile**, I want to toggle the map on and off so that I can maximize screen space for browsing listing cards.
- **As a guest**, I want to click a map marker and have the corresponding listing card highlight or scroll into view so that I can quickly match a location to property details.

## Acceptance Criteria

### Functional
1. Map loads on the search/listings page and displays all listings matching current search filters (`locationValue`, `guestCount`, `roomCount`).
2. Each listing is represented by a marker with a label or icon indicating price or property type.
3. Map is centered on the searched location (derived from `locationValue` param).
4. Clicking a map marker highlights the corresponding listing card in the results list (or scrolls it into view).
5. Clicking a listing card centers the map on that listing's marker.
6. Map re-renders when search filters change (URL params update).
7. No listings data is duplicated; map consumes the same `/api/listings` response as the card list.

### Performance
8. Google Maps API loads without blocking initial page render (lazy-load or async).
9. Map interactive (pan/zoom) within 2 seconds of page load on 4G network.

### Mobile
10. On screens <768px, map is either hidden by default, collapsed in a drawer, or displayed below listing cards in a scrollable section.
11. Map remains responsive and usable (touch zoom/pan) on mobile.

### Data & Integrity
12. All listing markers include valid latitude/longitude coordinates (no null/undefined coordinates render).
13. If a listing lacks coordinates, it is excluded from the map but still visible in the card list.

## Solution Design

### Component Architecture

```
SearchPage (app/listings)
├── ListingsContainer
│  ├── FiltersBar (locationValue, guestCount, roomCount)
│  ├── MapListingsLayout
│  │  ├── GoogleMapsPanel (new)
│  │  │  └── MapContainer (@react-google-maps/api)
│  │  │     └── MarkerClusterer + Marker components
│  │  └── ListingsCardGrid
│  │     └── ListingCard[] (existing)
```

### Google Maps Integration

- **Library**: `@react-google-maps/api` (already in tech stack).
- **Async Loading**: Use `useJsApiLoader` hook to load Google Maps API key asynchronously; display skeleton or fallback until ready.
- **Map Center**: Parse `locationValue` query param → geocode to lat/lng or use a predefined location mapping (e.g., city slugs to coordinates).
- **Markers**: Loop through filtered listings; create `<Marker>` for each with:
  - `position: { lat, lng }` from listing data.
  - `label` or custom icon showing price range or property count.
  - `onClick` handler to trigger listing card highlight/scroll.

### State & Synchronization

- **URL Params as Source of Truth**: `locationValue`, `guestCount`, `roomCount` remain in the URL; map and card list both derive filtered listings from the same `/api/listings` call.
- **Highlight State**: Use React state (`selectedListingId`) to track which marker/card is active. Sync via:
  - Marker click → set `selectedListingId` → scroll card into view.
  - Card click → set `selectedListingId` → recenter map on marker.
- **Re-renders**: When search params change, re-fetch listings from `/api/listings` and update both map and card list.

### Responsive Layout

- **Desktop (≥768px)**: Side-by-side grid: map on left (40%), listing cards on right (60%).
- **Tablet (640–768px)**: Stacked vertically; map above cards or toggleable via tab/button.
- **Mobile (<640px)**: Map hidden by default; toggle button expands map in full-screen modal or drawer.

## Data Model

### Extended Listing Schema (Prisma)

```prisma
model Listing {
  id              String   @id @default(cuid())
  title           String
  description     String?
  price           Int      // per night, in cents
  roomCount       Int
  guestCount      Int
  bathroomCount   Int
  locationValue   String   // city slug or address
  latitude        Float?   // NEW: for map marker positioning
  longitude       Float?   // NEW: for map marker positioning
  imageSrc        String?
  category        String?
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  reservations    Reservation[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([locationValue])
  @@index([userId])
}
```

### API Response (Listings)

Existing `/api/listings` endpoint extends response to include:

```json
{
  "id": "abc123",
  "title": "Cozy Apartment in Downtown",
  "price": 12000,
  "roomCount": 1,
  "guestCount": 2,
  "locationValue": "san-francisco",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "imageSrc": "...",
  "userId": "user1"
}
```

### Map Marker Data Structure (Frontend)

```typescript
interface MapMarkerData {
  listingId: string;
  lat: number;
  lng: number;
  price: number;
  title: string;
  isSelected: boolean;
}
```

## Edge Cases

1. **Missing Coordinates**: Listing exists but `latitude`/`longitude` are null.
   - **Handling**: Exclude from map; still appear in card list. Log warning to console.

2. **No Listings Match Filters**: Search returns empty result.
   - **Handling**: Display empty state message; map stays centered on location but shows no markers.

3. **Invalid `locationValue`**: City slug doesn't map to valid coordinates.
   - **Handling**: Default to a fallback location (e.g., San Francisco center) or show error; allow user to refine search.

4. **API Fails to Load**: `/api/listings` or Google Maps API request fails.
   - **Handling**: Show error banner; card list shows placeholder; map falls back to skeleton state.

5. **Very Large Result Set** (1000+ listings): Map becomes cluttered.
   - **Handling**: Use marker clustering (@react-google-maps/api provides this). Clusters collapse into numbered icons; expand on zoom.

6. **Mobile viewport refresh**: User opens map, rotates device.
   - **Handling**: Map remounts and recenters; use `useEffect` to listen to window resize or media query changes.

## Out of Scope

- **Directions/Navigation**: Turn-by-turn or transit directions from listing to user location.
- **Listing Polygon/Boundary**: Drawing neighborhood boundaries or service areas on map.
- **Saved Locations**: Pinning favorite locations on map for future searches.
- **Map Style Customization**: Custom themes or dark mode for maps.
- **Street View Integration**: Embedded Street View previews.

## Open Questions

1. **Location Geocoding**: How are `locationValue` URL params (e.g., "san-francisco") converted to lat/lng coordinates? Is there a predefined mapping table, or should we call a geocoding API (Google Geocoding API) on the client?

2. **Coordinates Storage**: Should `latitude`/`longitude` be populated at listing creation time (by host) or auto-geocoded server-side from `locationValue`? Who is responsible for accuracy?

3. **Map Height/Layout**: On desktop, should the map be sticky (scrolls with the page) or fixed? What minimum height ensures usability?

4. **Marker Clustering Threshold**: At what zoom level should markers cluster? Should clustering be automatic or user-configurable?

5. **Analytics**: Do we track map interactions (marker clicks, pan/zoom) for user behavior insights?

6. **Google Maps API Key**: How is the API key injected into the Next.js app? Should it be a public key or server-rendered?

7. **Accessibility**: Should map be keyboard-navigable? Should markers have ARIA labels?

---

## Implementation Notes

- **Estimate**: 3–5 days (API schema extension, map component build, integration testing, mobile refinement).
- **Dependencies**: Google Maps API key provisioning, Prisma migration for latitude/longitude columns, existing `/api/listings` endpoint stability.
- **Testing**: Unit tests for marker data transformation, integration tests for search-param sync, visual regression tests for responsive layouts.