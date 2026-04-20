# Product Requirements Document

## Problem

Users browsing listings on the search page lack visual spatial context for property locations. Currently, listings are presented as a filtered list without geographic reference, making it difficult to understand neighborhood context, proximity to landmarks, or compare locations across multiple properties at a glance. Integrating a map view will help users make location-informed decisions faster.

## Goals

1. **Display listings on an interactive map** on the search results page, synchronized with current filters (location, guest count, room count).
2. **Enable map-based property discovery** — users can view property density and distribution across the search area.
3. **Maintain filter state across list and map views** — toggling filters updates both the list and map in real time.
4. **Support map interaction** — zoom, pan, and click markers to reveal property details or navigate to listing detail page.
5. **Load performantly** — map renders without blocking search page load; lazy-load map if needed.

## Non-Goals

- Street-view integration or 360° property tours.
- Heatmap layers (e.g., crime, walkability, schools).
- Offline map functionality or custom map tiles.
- Map-based search (drawing polygons or radius circles to filter).
- Mobile-specific map UX (treated as desktop-first; mobile UX follows standard responsive patterns).

## User Stories

- **As a searcher**, I want to see all available listings pinned on a map so that I can quickly assess geographic spread and avoid neighborhoods that are too far from attractions.
- **As a searcher**, I want to click a map marker to see a preview of the listing (title, price, rating) so that I can identify properties of interest without leaving the map.
- **As a searcher**, I want my current filter selections (guest count, room count, location) to be reflected on the map in real time so that I stay oriented as I refine my search.
- **As a searcher**, I want to zoom and pan the map freely so that I can explore specific areas in detail.

## Acceptance Criteria

### Functional

1. **Map Rendering**
   - Map displays on the search results page using `@react-google-maps/api`.
   - Map centers on the location specified by the `locationValue` URL parameter (e.g., "Paris").
   - Map initializes with an appropriate zoom level that shows all filtered listings (auto-fit bounds or fixed zoom based on location).

2. **Listing Markers**
   - Each listing returned by `/api/listings` (filtered by `locationValue`, `guestCount`, `roomCount`) is rendered as a distinct marker on the map.
   - Marker position corresponds to the `latitude` and `longitude` fields from the listing data model.
   - Markers are visually distinct and clickable.

3. **Marker Interaction**
   - Clicking a marker displays a popup/info window showing: listing title, price per night, image thumbnail (optional), star rating, and a "View Listing" link.
   - Closing the popup does not navigate away or reset map state.
   - Hovering over a marker (on desktop) provides visual feedback (color change, tooltip, or scale).

4. **Filter Synchronization**
   - When filter parameters change (via search bar or filter controls), the map updates to show only listings matching the new criteria.
   - Listings removed by filtering are removed from the map.
   - Map center and zoom persist unless the new location differs from the current one.

5. **Layout Integration**
   - Map occupies a defined portion of the search results layout (e.g., right sidebar or above/below the list).
   - List and map remain synchronized — scrolling the list does not require map updates, but filtering affects both.
   - Layout is responsive; map adjusts gracefully on smaller screens (stacks or reduced size).

### Performance

6. - Map load time does not exceed 2 seconds for a list of up to 500 listings.
   - No page jank or dropped frames when panning/zooming the map.
   - Filtering and re-rendering the map completes within 500ms.

### UX & Accessibility

7. - Map is labeled with accessible text; markers have aria-labels.
   - Keyboard navigation supports tabbing to markers and opening/closing popups.
   - Map tiles and labels are legible at standard font sizes and color contrasts.

---

## Solution Design

### Component Architecture

```
SearchPage (app/search/page.tsx)
├── SearchBar (existing, may enhance with location input)
├── Filters (existing, guest/room count controls)
├── ResultsContainer (flex layout)
│   ├── ListingsPanel
│   │   └── ListingCard[] (existing)
│   └── MapPanel (NEW)
│       └── GoogleMap (@react-google-maps/api)
│           └── MarkerClusterer (optional, for many listings)
│               └── Marker[] (one per listing)
│                   └── InfoWindow (popup on click)
```

### Key Components

**MapPanel.tsx**
- Wraps `<GoogleMap>` component from `@react-google-maps/api`.
- Accepts props: `listings` (array), `locationValue` (string), `centerLat/Lng` (number), `zoom` (number).
- Manages local state: `selectedMarkerId`, `mapBounds`.
- Renders markers for each listing; opens InfoWindow on marker click.
- Handles map events: `onBoundsChanged`, `onZoomChanged`.

**MarkerInfoWindow.tsx**
- Displays listing title, price, image, rating, and "View Listing" link.
- Controlled by parent (MapPanel) to open/close based on selectedMarkerId.

### Data Flow

1. **Search page load**: URL params (`locationValue`, `guestCount`, `roomCount`) passed to `/api/listings`.
2. **API response**: Returns array of listings with `id`, `title`, `price`, `imageUrl`, `latitude`, `longitude`, `rating`.
3. **MapPanel receives listings**: Iterates and creates `<Marker>` components; computes center/zoom from bounds.
4. **User filters**: Search params updated, API called again, listings re-fetched.
5. **Map re-renders**: New listing set replaces old markers; bounds recalculated.

### Google Maps Configuration

- **API Key**: Stored in `.env.local` (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).
- **Libraries loaded**: `["marker", "infowindow", "maps"]` via loader prop.
- **Default map options**: `{ zoom: 12, center: { lat, lng } }`.
- **Marker clustering** (optional for >100 listings): Use `@react-google-maps/marker-clusterer` to avoid marker overlap.

---

## Data Model

### Prisma Schema Extensions

No schema changes required if listings already include latitude/longitude. Verify:

```prisma
model Listing {
  id          String   @id @default(cuid())
  title       String
  price       Int
  imageUrl    String?
  latitude    Float    // REQUIRED for map
  longitude   Float    // REQUIRED for map
  rating      Float?
  locationValue String  // Indexed for search
  guestCount  Int
  roomCount   Int
  // ... other fields
}
```

### API Response Shape

`GET /api/listings?locationValue=Paris&guestCount=2&roomCount=1`

```json
[
  {
    "id": "listing-1",
    "title": "Cozy Studio in Marais",
    "price": 120,
    "imageUrl": "https://...",
    "latitude": 48.8566,
    "longitude": 2.3522,
    "rating": 4.8
  },
  ...
]
```

### Client-side State

MapPanel maintains:
- `selectedMarkerId: string | null` — which marker is currently selected (info window open).
- `mapBounds: google.maps.LatLngBounds | null` — computed bounds to fit all markers.

---

## Edge Cases

1. **No listings match filters**
   - Map renders but no markers appear. Display a message: "No listings in this area matching your criteria."
   - Map center defaults to the input location (e.g., city center) even if empty.

2. **Missing latitude/longitude**
   - If a listing lacks coordinates, skip it during marker rendering; log a warning.
   - Do not break the map or fail the page load.

3. **Invalid locationValue**
   - If `locationValue` does not correspond to a valid geocodable location, map centers on a default (e.g., user's last search) or world view (zoom 2).
   - Show a subtle warning: "Unable to locate [value]. Showing nearby results."

4. **Large result sets (500+ listings)**
   - Use marker clustering to avoid UI lag and visual clutter.
   - Clustered markers show count (e.g., "25"); clicking expands the cluster.

5. **Mobile/Responsive**
   - On screens <768px: Stack map below listings or hide map behind a toggle button to preserve listing visibility.
   - On tablets: Side-by-side layout with reduced map width.

6. **Rapid filter changes**
   - Debounce filter input (e.g., 300ms) to avoid re-querying `/api/listings` on every keystroke.
   - Cancel in-flight requests if a new filter is submitted before the previous one completes.

7. **Map interaction interrupts scroll**
   - Map is within a scrollable container; mouse wheel over the map zooms rather than scrolling the page (standard Google Maps behavior). No action needed.

---

## Open Questions

1. **Map placement**: Should the map occupy the right sidebar, full width above the list, or togglable? (Recommend: right sidebar on desktop, toggle button on mobile.)

2. **Marker styling**: Should markers use custom icons (e.g., property images as thumbnails) or standard Google Maps pins? Custom icons require additional design assets.

3. **Default zoom level**: Should it be fixed (e.g., zoom 12) or computed to fit all listings? (Recommend: fit bounds for discovered listings, fallback to zoom 12 if empty.)

4. **Marker clustering threshold**: At what listing count do we enable clustering? (Recommend: ≥100 listings.)

5. **Info window persistence**: Should opening one info window close others, or allow multiple open simultaneously? (Recommend: close previous when opening a new one.)

6. **Listing detail navigation**: Does clicking "View Listing" in the info window open a modal, a side panel, or navigate to `/listings/[id]`? (Current architecture suggests full-page navigation; clarify interaction model.)

7. **Analytics**: Should we track map interactions (marker clicks, zoom, pan) for insights? Define event names and metrics.

8. **Geocoding strategy**: How do we handle `locationValue` → lat/lng conversion? Geocode on backend at index time, or use Google Geocoding API on the fly? (Recommend: pre-geocode and store in Listing model to avoid API calls on every search.)

---

## Out of Scope

- Saved/favorite listings with map view.
- Collaborative trip planning (shared maps).
- Route optimization (nearest listings to a point of interest).
- Advanced filters (price ranges visualized as map overlays).
- Street-view or 3D tour integration.
- Real-time availability sync from external booking systems.
- Multi-language map labels (using only English for MVP).

---

## Implementation Notes

- **Dependency**: `@react-google-maps/api` is already in tech stack.
- **Secrets**: Ensure NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is configured in `.env.local` for development and environment variables in production.
- **Testing**: Unit test marker rendering with mock listings; integration test filter + map sync.
- **Browser support**: Google Maps API supports modern browsers (Chrome, Firefox, Safari, Edge).