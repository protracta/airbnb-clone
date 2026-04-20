# Product Requirements Document

## Problem

Users browsing listings on the search results page lack a visual geographic context for where properties are located. Without an interactive map, users must rely solely on text-based location information and cannot quickly assess property distribution, neighborhood proximity, or travel distances to key areas. This friction reduces confidence in property selection and increases time spent evaluating listings.

## Goals

1. **Display interactive map** on the listings search page showing pins/markers for all filtered properties.
2. **Enable location-based filtering** by allowing users to understand property geography before clicking into details.
3. **Maintain search state** so map updates reactively when users change `guestCount`, `roomCount`, or `locationValue` filters.
4. **Establish reusable map component** that can support future features (e.g., marker clustering, polygon filters).
5. **Ship without disrupting existing listing list view**—map is a complementary, not replacement, feature.

## Non-Goals

- Marker clustering (v1 shows all markers without grouping).
- Drawing/polygon-based search filters.
- Street-view or satellite-mode toggles.
- Custom map styling or branding.
- Mobile-responsive map optimization (desktop-first implementation).

## User Stories

- As a **guest**, I want to see where listings are located on a map so that I can visualize neighborhoods and distance relationships before clicking into property details.
- As a **guest**, I want the map to update when I apply filters (guests, rooms, location) so that I can see only relevant properties geographically.
- As a **developer**, I want a clean, reusable `MapComponent` so that future features can leverage it without rework.

## Acceptance Criteria

### Functional
1. **Map renders on listings search page** without errors when the page loads.
2. **Map displays markers** for every listing returned by `/api/listings` based on current filter state (`locationValue`, `guestCount`, `roomCount`).
3. **Markers are positioned** using listing latitude/longitude from the database.
4. **Map updates reactively** when search filters change (search params update).
5. **Map is responsive to viewport** and does not overflow or overlap the listings list layout.
6. **Default map bounds** center on the first property or search location with appropriate zoom level.

### Data & API
7. **Listings table includes** `latitude` and `longitude` columns (nullable for legacy data; new listings must provide both).
8. `/api/listings` endpoint returns `latitude` and `longitude` in response payload.
9. Missing or invalid coordinates are handled gracefully (marker skipped, console warning logged).

### User Experience
10. **Marker click or hover** shows listing title and price (tooltip or popover).
11. **Marker styling** is consistent (color, size) across all listings.
12. **Map library** (@react-google-maps/api) is initialized with valid API key at build time.

### Code Quality
13. **MapComponent** is extracted as a reusable, typed React component in `/app/components/`.
14. **TypeScript interfaces** define marker data shape and component props.
15. **No console errors** when rendering with valid or invalid coordinate data.

## Edge Cases

| Scenario | Handling |
|----------|----------|
| No listings match filters | Map renders empty with default bounds centered on `locationValue`. |
| Listing has null `latitude`/`longitude` | Marker is omitted; count of rendered markers may be less than listing count. |
| User changes `locationValue` but no results found | Map still renders with previous view; component should log warning. |
| Google Maps API key invalid or network unavailable | Map container shows error message; page remains usable, list view unaffected. |
| Very high zoom level on dense listings | Markers overlap; implement tooltip on hover to prevent user confusion (v2 candidate: clustering). |

## Solution Design

### Layout & Integration
- **Placement:** Map occupies right-side column on desktop search results page (similar to Airbnb's desktop layout).
- **Sizing:** Fixed 400–500px width or 40% of viewport, left column holds scrollable listing cards.
- **Responsive fallback:** On tablets/mobile, map hidden or displayed as collapsible panel (non-goal for v1, but architecture should allow).

### Map Component Architecture
```
MapComponent (props: listings[], searchLocation, zoom)
├── GoogleMap container
│   └── MarkerClusterer (future v2)
│       └── Marker[] (each listing)
│           └── InfoWindow (click-triggered)
└── Error boundary
```

- **Props interface:**
  ```typescript
  interface MapComponentProps {
    listings: ListingWithCoordinates[];
    center?: { lat: number; lng: number };
    zoom?: number;
    onMarkerClick?: (listing: Listing) => void;
  }
  ```

- **Listing interface:**
  ```typescript
  interface ListingWithCoordinates {
    id: string;
    title: string;
    price: number;
    latitude: number;
    longitude: number;
    // ... other fields
  }
  ```

### Data Flow
1. Search page queries `/api/listings?locationValue=...&guestCount=...&roomCount=...`
2. API returns listings with `latitude` and `longitude` fields.
3. MapComponent receives listings array as prop.
4. MapComponent renders GoogleMap with markers for each listing.
5. On filter change, search params update → listings re-fetched → MapComponent re-renders with new markers.

## Data Model

### Database Changes (Prisma)
```prisma
model Listing {
  id                String  @id @default(cuid())
  title             String
  description       String?
  imageSrc          String?
  category          String
  roomCount         Int
  bathroomCount     Int
  guestCount        Int
  locationValue     String  // e.g., "Paris, France"
  latitude          Float?  // NEW
  longitude         Float?  // NEW
  price             Int
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  userId            String
  user              User     @relation(fields: [userId], references: [id])
}
```

**Migration strategy:**
- Add `latitude` and `longitude` as nullable columns.
- Populate existing listings via data migration job (seed or manual script) or leave null temporarily.
- Enforce NOT NULL on new listings via application logic or future schema tightening.

### API Response Shape
```json
{
  "listings": [
    {
      "id": "123",
      "title": "Cozy Apartment in Paris",
      "price": 120,
      "latitude": 48.8566,
      "longitude": 2.3522,
      "roomCount": 2,
      "guestCount": 4,
      "imageSrc": "..."
    }
  ]
}
```

## Open Questions

1. **Google Maps API key management:** Where is the API key stored (environment variables)? Is it client-side or server-side?
2. **Coordinate source:** Should new listings be geocoded automatically when created, or entered manually by users? (Currently out of scope but impacts data completeness.)
3. **Marker click behavior:** Should clicking a marker navigate to the listing detail page or open a preview popover?
4. **Default zoom & center:** For a `locationValue` like "Paris, France," what is the initial map center and zoom level? Hardcoded or geocoded at query time?
5. **Performance:** Expected number of listings per search? Do we need pagination or clustering in v1, or is <100 markers acceptable?
6. **Mobile:** Is the map hidden, collapsed, or rendered differently on mobile/tablet, or is v1 desktop-only?
7. **Legacy listings:** Should the feature gracefully degrade if a listing lacks coordinates, or is backfilling coordinates a blocker for launch?

## Out of Scope (v1 & Future)

- **Marker clustering** (v2 candidate if density becomes an issue).
- **Custom marker icons** (use default Google Maps pins).
- **Polygon/radius search filters** (draw on map to filter listings).
- **Distance matrix / travel time** overlays.
- **Satellite or street-view modes**.
- **Accessibility features** (alt text, keyboard navigation) — address separately in a11y audit.
- **Mobile optimization** — ship desktop-first, revisit post-launch.
- **Geocoding service integration** — coordinate entry is manual or external for v1.

---

## Implementation Notes

- **Owner:** Frontend (React/Next.js) + Backend (Prisma schema + API route).
- **Dependencies:** @react-google-maps/api (already in tech stack).
- **Testing:** Unit tests for MapComponent props handling; integration tests for filter reactivity.
- **Timeline:** Estimate based on data model migration, component build, and API integration (likely 3–5 sprint days).