# Product Requirements Document: Maps Feature

## Problem

Users searching for accommodations lack spatial context to understand listing locations relative to landmarks, neighborhoods, transportation, and other listings. Current search results are list-based, forcing users to manually cross-reference addresses with external mapping tools. This friction reduces confidence in booking decisions and requires context-switching away from the platform.

## Goals

1. **Enable location-aware search**: Users can browse listings on an interactive map filtered by location, dates, guest count, and price range.
2. **Reduce booking friction**: Users gain immediate spatial context (proximity to transit, landmarks, neighborhoods) within the Airbnb clone without leaving the platform.
3. **Support discovery**: Users can explore listings by geographic clusters and adjust map viewport to refine search scope dynamically.
4. **Maintain performance**: Map interactions (pan, zoom, filter) complete within 500ms for typical search result sets (50–500 listings).

## Non-Goals

- Street-view or 3D building visualization.
- Turn-by-turn navigation or directions to listings.
- Custom marker styling per listing category (all markers use standard design).
- Offline map support or cached tile layers.
- Advanced geospatial queries (e.g., isochrone/reachability analysis).

## User Stories

- As a **guest**, I want to see listings plotted on a map so that I can understand the geographic distribution of available accommodations at a glance.
- As a **guest**, I want to filter map listings by price range and amenities so that I can narrow my search spatially.
- As a **guest**, I want to click a marker and view a preview card (name, price, rating) so that I can quickly assess listings without leaving the map.
- As a **guest**, I want to pan and zoom the map to refine my search by neighborhood so that I can focus on areas that interest me.
- As a **host**, I want to see where my listing appears on the map in relation to competitors so that I can understand my market positioning.

## Acceptance Criteria

### Map Rendering
- [ ] Map renders on the search results page with initial viewport centered on the primary search location (or user's current location if location-based search is enabled).
- [ ] Map is responsive and resizes correctly on desktop (≥1024px), tablet (768–1023px), and mobile (<768px) viewports.
- [ ] Map library is loaded asynchronously; initial page load does not block on map rendering.

### Listing Markers
- [ ] Listings matching current filters are plotted as markers on the map.
- [ ] Markers update dynamically when filters (dates, guests, price range, amenities) change without requiring a full page refresh.
- [ ] Markers display a consistent icon/color; price is shown as a label or tooltip.
- [ ] Clicking a marker displays an in-map card showing: listing name, thumbnail image, price per night, average rating, and a "View Details" link.
- [ ] Marker clusters appear when ≥4 listings overlap at the current zoom level; cluster shows count and expands on click.

### Interaction
- [ ] Users can pan and zoom the map using mouse (desktop) and touch (mobile).
- [ ] Zooming to a neighborhood level (zoom level 14–16) loads and displays all listings in that viewport.
- [ ] Map state (center, zoom, visible listings) persists in the URL query parameters; users can share or bookmark map states.
- [ ] "Search in this area" button allows users to apply the current map viewport as a search filter.

### Performance
- [ ] Map loads initial markers within 2 seconds on a 4G connection.
- [ ] Pan/zoom interactions remain responsive (60fps) on desktop; no jank on mobile with 100+ visible markers.
- [ ] Marker updates (filter changes) complete within 500ms.

### Data Accuracy
- [ ] Listing coordinates (latitude, longitude) are validated and stored correctly in the database.
- [ ] Map projects coordinates accurately using the Web Mercator projection (standard for web maps).
- [ ] Listings are not duplicated or misplaced on the map.

## Out of Scope

- **Saved locations / favorite neighborhoods**: Users cannot yet bookmark or tag neighborhoods for future searches.
- **Heat maps**: Visual density representation of listings by area is deferred.
- **Multilingual map labels**: Map labels (street names, landmarks) use the user's language preference only if the map provider supports it; custom translations are not built.
- **Accessibility overlays**: Points of interest (restaurants, hospitals, transit stops) are not displayed on the initial release.
- **Map export / embedding**: Hosts cannot embed maps of their listing location on external sites.

---

## Solution Design

### Architecture Overview

The maps feature integrates a client-side interactive map library with the existing accommodation search backend:

1. **Frontend (Next.js + React)**
   - Search results page includes a map component alongside the list view.
   - Map state is managed via URL query parameters (`lat`, `lng`, `zoom`) and React state for filter state.
   - On mount, the component fetches the current search query (location, dates, guests, filters) from the URL and context.
   - Listings from the search API response are transformed into GeoJSON features and plotted.

2. **Backend (Node.js / Existing API)**
   - Existing `/api/listings/search` endpoint returns listings with `latitude` and `longitude` fields.
   - No new backend endpoints are required for this initial release; spatial filtering (within bounding box) is performed client-side.
   - Future optimization: add server-side bounding-box filtering to reduce payload size.

3. **Map Provider**
   - Use **Mapbox GL JS** or **Google Maps API** (decision pending vendor cost/licensing review).
   - Recommendation: **Mapbox GL JS** for lower costs at scale, open-source ecosystem, and better performance on mobile.

4. **Marker Clustering**
   - Use a lightweight clustering library (e.g., **Supercluster**) to group overlapping markers client-side.
   - Cluster breakpoints: 4+ markers at zoom levels 10–13; all individual markers at zoom 14+.

### Data Flow

```
User adjusts search filters (dates, price, amenities)
    ↓
Frontend updates URL query params and filters listings array
    ↓
Map component receives updated listings array
    ↓
GeoJSON features are generated and passed to Mapbox
    ↓
Markers are rendered/updated on map
    ↓
User clicks marker → Preview card appears
    ↓
User clicks "View Details" → Navigate to listing detail page
```

### Component Structure (Frontend)

```
SearchPage
  ├── SearchFiltersBar (existing)
  ├── MapContainer (new)
  │   ├── MapView (Mapbox GL wrapper)
  │   ├── MarkerPreviewCard
  │   └── SearchInAreaButton
  └── ListingsListView (existing, synchronized with map)
```

---

## Data Model

### Listing Document (Existing + Additions)

**Existing fields** (no changes):
- `id` (UUID): Unique listing identifier.
- `title` (string): Accommodation name.
- `description` (text): Full description.
- `price_per_night` (decimal): Nightly rate.
- `currency` (string): Currency code (USD, EUR, etc.).
- `images` (array of strings): URLs to listing photos.
- `amenities` (array of strings): Amenity identifiers or names.
- `rating` (float): Average guest rating (1–5).
- `review_count` (int): Number of reviews.
- `host_id` (UUID): Foreign key to host user.
- `created_at` (timestamp): Listing creation date.
- `updated_at` (timestamp): Last modification date.

**New fields** (required for maps):
- `latitude` (decimal): Listing location latitude (required).
- `longitude` (decimal): Listing location longitude (required).
- `address_line_1` (string): Street address (optional but recommended).
- `city` (string): City name (optional).
- `country` (string): Country name or code (optional).

### GeoJSON Feature (Runtime Only)

When listings are fetched and prepared for the map, they are transformed into GeoJSON FeatureCollection format:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "listing-uuid",
        "title": "Cozy Studio in Downtown",
        "price": 89,
        "rating": 4.8,
        "image_url": "https://...",
        "currency": "USD"
      },
      "geometry": {
        "type": "Point",
        "coordinates": [-74.0060, 40.7128]
      }
    }
  ]
}
```

### Database Indexes

To support fast spatial queries in future optimization phases:

- Add a **GIST or BRIN index** on `(latitude, longitude)` columns if using PostgreSQL.
- This enables efficient bounding-box queries without a dedicated geospatial column.

### API Response Schema (No Change to `/api/listings/search`)

The existing endpoint already returns listings; no schema change is required. Backend will confirm that `latitude` and `longitude` are included in all listing objects.

---

## Edge Cases

1. **Listings with missing or invalid coordinates**
   - If a listing lacks coordinates, it is excluded from the map but remains in the list view.
   - A warning is logged; host receives an admin notification to update their listing location.

2. **Simultaneous filter changes**
   - When a user adjusts multiple filters rapidly (price, dates, amenities), debounce filter updates by 300ms to avoid excessive marker re-renders.

3. **Mobile viewport constraints**
   - On mobile, the map takes 60% of the screen height; list view is scrollable below.
   - Touch interactions (pinch-zoom, two-finger pan) are supported natively by Mapbox GL JS.

4. **Large result sets (500+ listings)**
   - Clustering is mandatory above 100 markers to maintain performance.
   - If a search returns >1000 listings, consider paginating or suggesting refined filters.

5. **Timezone and daylight shifts**
   - Availability is determined by selected check-in/check-out dates; no map-specific timezone logic is needed.
   - The backend search API already handles date-based availability.

6. **Browser without geolocation permission**
   - If location-based search is enabled and the user denies permission, the map centers on the search location (from query params) instead.

7. **Map provider outage or API quota exceeded**
   - Display a fallback message: "Map is temporarily unavailable. You can still browse listings below."
   - List view remains functional.

---

## Open Questions

1. **Map provider selection**: Should we use Mapbox GL JS or Google Maps API? What are the licensing and cost constraints?
   - *Impact*: Affects development timeline, performance, and long-term costs.

2. **Server-side bounding-box filtering**: Should the backend `/api/listings/search` endpoint accept a bounding-box parameter to reduce payload for large geographic areas?
   - *Impact*: Improves performance for wide map views but requires backend changes.

3. **Mobile map-first experience**: Should mobile users see the map first (70%) and list second (30%), or list first with a map tab?
   - *Impact*: UX flow differs significantly; requires design decision.

4. **Favorite locations**: Should users be able to save favorite neighborhoods or map regions for quick access?
   - *Impact*: Deferred to post-launch; requires persistent storage and UI changes.

5. **Accessibility for maps**: How do we ensure the map is usable for screen-reader users? Do we provide a text-based geographic legend or keyboard navigation?
   - *Impact*: WCAG 2.1 AA compliance may require additional components.

6. **Analytics**: What map interactions should we track (zoom level, pan frequency, marker clicks, "Search in this area" usage)?
   - *Impact*: Helps validate feature usage and informs future improvements.