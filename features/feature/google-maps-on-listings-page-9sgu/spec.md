# Product Requirements Document

## Problem

Users browsing Airbnb listings lack a visual, geographic context for where properties are located. Currently, the listings page presents a list view only, making it difficult for users to understand spatial relationships between properties, compare neighborhoods at a glance, or discover clusters of available accommodations in their target area. This friction reduces confidence in booking decisions and limits exploration.

## Goals

1. **Display interactive map** on listings page with property pins corresponding to search results, visible without additional navigation.
2. **Enable map-based filtering** by allowing users to see results update when filters (guest count, room count) are applied.
3. **Support location-aware search** by rendering the map centered on the `locationValue` URL parameter, establishing geographic context for the current query.
4. **Achieve <2s map load time** for typical search results (50–200 listings) to maintain page responsiveness.
5. **Increase listing engagement** by providing a secondary discovery mechanism (users can click map pins to view property details).

## Non-Goals

- Street-level imagery, satellite view, or terrain switching.
- Routing or travel-time calculations between listings and points of interest.
- Clustering algorithms or heatmaps for density visualization.
- Offline map caching or PWA map functionality.
- Map-based drawing tools (e.g., draw a custom search radius).

## User Stories

- As a **guest**, I want to see listings plotted on a map so that I can understand the geographic layout of available properties.
- As a **guest**, I want the map to stay synchronized with my search filters so that I only see pins for properties matching my criteria (guest count, room count).
- As a **guest**, I want to click a map pin to navigate to or preview the listing so that I can decide if the location works for me.
- As a **guest**, I want the map centered on my search location so that I don't have to manually pan to find relevant results.

## Acceptance Criteria

### Functional

1. **Map renders on listings page**
   - Map component displays below or alongside the listings list.
   - Map is responsive on desktop (≥768px width) and mobile (≤767px width).
   - Map initializes with center point derived from `locationValue` URL parameter.

2. **Listings appear as map pins**
   - Each listing in search results renders as a distinct pin on the map.
   - Pin color or icon is consistent and visually distinct from standard Google Maps markers.
   - Pins update in real-time when search filters change (guest count, room count).

3. **User interaction with pins**
   - Clicking a pin opens a tooltip or popup showing listing name and price.
   - Clicking the popup navigates to the listing detail page or scrolls the list to that listing.
   - Hovering over a map pin highlights the corresponding listing in the list view (and vice versa).

4. **Filtering integration**
   - Applying filters (guest count, room count) updates the map pins immediately.
   - Listings removed by filters disappear from the map.
   - No duplicate pins for the same listing.

5. **Location center accuracy**
   - Map center matches the search location provided in `locationValue`.
   - If `locationValue` cannot be geocoded, fall back to a default center (e.g., world view or previous search location) with a user-facing message.

### Performance

6. Map renders and becomes interactive within **2 seconds** for a typical search result set (50–200 listings).
7. Filtering operations (guest/room count) update the map within **500ms** without full page reload.

### Cross-browser & Accessibility

8. Map is functional on Chrome, Firefox, Safari, and Edge (latest versions).
9. Map pins are keyboard-navigable and screen-reader compatible.
10. Color contrast on pins meets WCAG AA standards.

## Solution Design

### Component Architecture

**Map Integration Layer**
- Leverage `@react-google-maps/api` to wrap the Google Maps API.
- Create a `ListingMap` component accepting props:
  - `listings: Listing[]` — array of properties to plot.
  - `center: { lat: number; lng: number }` — map center derived from `locationValue`.
  - `onPinClick: (listingId: string) => void` — callback for pin interaction.
  - `onPinHover: (listingId: string | null) => void` — callback for hover state.

**Listings Page Layout**
- Use Tailwind CSS Grid or Flexbox to split the page:
  - Left column (or top on mobile): Filtered listings list.
  - Right column (or bottom on mobile): `<ListingMap />` component.
- On mobile, stack vertically; on tablet+, use responsive ratio (e.g., 40/60 split).

**State Management**
- Maintain `selectedListingId` and `hoveredListingId` in the listings page component.
- Pass these to the map to highlight pins; pass to the list to highlight rows.

### Data Model

**Listing Schema** (existing in Prisma, augmented)

```prisma
model Listing {
  id                String    @id @default(cuid())
  title             String
  description       String?
  price             Float
  guestCount        Int
  roomCount         Int
  bathroomCount     Int
  imageSrc          String?
  
  // Geocoding & Map Data
  locationValue     String    // e.g., "San Francisco, CA" or structured JSON
  latitude          Float     // Derived from geocoding locationValue
  longitude         Float     // Derived from geocoding locationValue
  
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

**API Contract** (`GET /api/listings`)

Request:
```json
{
  "locationValue": "San Francisco, CA",
  "guestCount": 2,
  "roomCount": 1
}
```

Response:
```json
{
  "listings": [
    {
      "id": "listing-1",
      "title": "Cozy Studio Downtown",
      "price": 120,
      "guestCount": 2,
      "roomCount": 1,
      "latitude": 37.7749,
      "longitude": -122.4194,
      "imageSrc": "https://..."
    },
    ...
  ],
  "mapCenter": {
    "lat": 37.7749,
    "lng": -122.4194
  }
}
```

### Geocoding Strategy

- **Backend:** Use a geocoding service (Google Geocoding API, or lightweight alternative like `node-geocoder`) to convert `locationValue` strings to lat/lng coordinates.
- **Caching:** Store computed lat/lng in the `Listing` table to avoid repeated API calls.
- **Fallback:** If geocoding fails, return a default center (e.g., hardcoded coordinates) and a user-visible message: *"Unable to center map on this location. Showing all results."*

## Data Model

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `Listing.id` | String (CUID) | Existing | Primary key. |
| `Listing.latitude` | Float | Computed | Geocoded from `locationValue` on creation/update. Required for map rendering. |
| `Listing.longitude` | Float | Computed | Geocoded from `locationValue` on creation/update. Required for map rendering. |
| `Listing.locationValue` | String | User Input | Human-readable location (e.g., "San Francisco, CA"). Seed for geocoding. |
| `Listing.guestCount` | Int | Existing | Used for filtering. |
| `Listing.roomCount` | Int | Existing | Used for filtering. |
| `Listing.price` | Float | Existing | Displayed on map tooltip. |
| `Listing.title` | String | Existing | Displayed on map tooltip/detail. |

**API Response Additions**

| Field | Type | Purpose |
|-------|------|---------|
| `mapCenter.lat` | Float | Derived from `locationValue`; centers map on search location. |
| `mapCenter.lng` | Float | Derived from `locationValue`; centers map on search location. |

---

## Edge Cases

1. **Empty Search Results**
   - Map displays with no pins; show a message: *"No listings found for your criteria."*
   - Map still centers on the search location.

2. **Multiple Listings at Same Coordinates**
   - Pins may overlap; consider clustering or a small offset to distinguish them.
   - On hover/click, show all listings at that coordinate in a popup or modal.

3. **Invalid or Ambiguous locationValue**
   - Geocoding returns multiple results (e.g., "Springfield" matches multiple states).
   - Fallback: Use the first result, log the ambiguity, and optionally prompt the user to refine.

4. **Slow Network or Geocoding Failure**
   - Map may take >2s to load; show a skeleton loader or spinner.
   - If geocoding fails entirely, render the map at a default center and display an error toast.

5. **Mobile Viewport**
   - Map and list may compete for screen real estate.
   - On small screens (<600px), consider a collapsible map or a carousel-style switcher between map and list views.

6. **Stale Geocoding Data**
   - If a listing's `locationValue` changes, recompute lat/lng asynchronously to avoid blocking the response.
   - Mark the data as "pending" until geocoding completes.

## Open Questions

1. **Geocoding Service Choice**
   - Use Google Geocoding API (cost, quota) or a free alternative (e.g., OpenStreetMap/Nominatim)?
   - What is the budget and expected QPS?

2. **Map Bounds & Zoom Level**
   - Should the map auto-zoom to fit all pins on the current search, or use a fixed default zoom?
   - What is the fallback zoom if only one listing is visible?

3. **Mobile UX Priority**
   - On mobile, should map be hidden by default and toggled via a button, or always visible?
   - Or should the layout switch to a full-screen map with a minimized list?

4. **Hover/Click Behavior for List-to-Map Synchronization**
   - Should hovering a list item highlight its pin on the map?
   - Should clicking a pin scroll the list to that listing or navigate to the detail page?

5. **Pin Customization**
   - Should pins display the price, a number, or just a standard marker?
   - Should pins be color-coded by price range, room count, or other property?

6. **Analytics & Tracking**
   - Should we track user interactions with the map (e.g., pin clicks, pans, zooms) for insights into user behavior?

7. **API Rate Limiting**
   - If geocoding is done server-side on each request, what rate limits apply?
   - Should we batch geocoding requests for bulk listing imports?

8. **Filtering Latency**
   - When a user changes guest/room count, should the API re-filter on the backend and return only matching listings, or return all listings and filter client-side?
   - (Likely backend filtering for scalability, but open for clarification.)