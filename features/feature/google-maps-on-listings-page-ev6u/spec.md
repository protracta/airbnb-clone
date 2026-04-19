# Product Requirements Document
## Feature: Google Maps on Listings Page

---

## Problem

Users browsing the listings search page currently have no spatial context for results — they cannot see where listings are located relative to each other or to their searched destination. This forces users to evaluate listings in isolation, increasing cognitive load and reducing confidence in booking decisions. The application already supports `locationValue`-based search but lacks any map visualisation to make that location data meaningful.

---

## Goals

1. **Spatial awareness**: 100% of listings returned by a search query are represented as markers on a visible map on the listings page.
2. **Search coherence**: The map viewport automatically centres and zooms to match the active `locationValue` search parameter on every search.
3. **Listing discoverability**: Clicking a map marker surfaces the associated listing detail (e.g. a hover card or link), measurable by click-through instrumentation.
4. **Performance baseline**: Map component renders and displays markers within 2 seconds on a standard broadband connection for result sets up to 100 listings.
5. **Filter reactivity**: The map re-renders markers within 500 ms whenever `guestCount` or `roomCount` filter params change, reflecting only the filtered result set.

---

## Non-Goals

- Drawing or editing custom map boundaries / search-by-area (drag-to-search) functionality.
- Turn-by-turn directions or routing between listings.
- Street View integration.
- Native mobile map experience (this release targets the Next.js web app only).
- Real-time listing availability overlaid on the map.

---

## User Stories

| # | Persona | Action | Benefit |
|---|---------|--------|---------|
| 1 | Guest (searcher) | I want to see all search results plotted on a map alongside the listing cards | So that I can understand the geographic spread of options at a glance |
| 2 | Guest (searcher) | I want the map to auto-centre on my searched location | So that I do not have to manually pan to find relevant results |
| 3 | Guest (searcher) | I want to click a map marker and see basic listing info (title, price, thumbnail) | So that I can evaluate a listing spatially without losing my place in the list |
| 4 | Guest (searcher) | I want the map markers to update when I change guest or room count filters | So that the map stays in sync with the filtered listing cards |
| 5 | Guest (searcher) | I want the map to be visible on desktop without scrolling | So that I can use the map and listing cards simultaneously |

---

## Acceptance Criteria

### Map Rendering
- [ ] `MapView` component mounts on the `/listings` (search results) page using `@react-google-maps/api`.
- [ ] The map is visible in the initial viewport on desktop (≥ 1024 px wide) without scrolling — implemented via a split-panel layout (listings left, map right).
- [ ] The Google Maps API key is sourced exclusively from `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` environment variable; the build fails with a clear error if the variable is absent.

### Viewport & Centring
- [ ] On page load, the map centres and zooms to the bounding region corresponding to the active `locationValue` URL param.
- [ ] If `locationValue` is absent or unresolvable, the map defaults to a world-level zoom (zoom level 2) centred at `(0, 0)`.
- [ ] Changing `locationValue` (new search) recentres the map without a full page reload.

### Markers
- [ ] One marker is rendered per listing returned by `/api/listings` for the current search params.
- [ ] Each marker's position is derived from the listing's `latitude` and `longitude` fields (see Data Model).
- [ ] Markers not included in the current filtered result set (post `guestCount`/`roomCount` filtering) are removed from the map within 500 ms.
- [ ] Clicking a marker opens an info window containing: listing title, nightly price, and thumbnail image.
- [ ] The info window contains a link that navigates to the listing detail page.

### Data Integrity
- [ ] Listings without valid `latitude`/`longitude` values are excluded from marker rendering and do not throw a runtime error.
- [ ] The `/api/listings` endpoint returns `latitude` and `longitude` fields for each listing record.

### Performance
- [ ] Map component and all markers for up to 100 listings render within 2 seconds on a standard broadband connection (verified via Lighthouse / manual timing).
- [ ] The `MapView` component is **lazy-loaded** (`next/dynamic` with `ssr: false`) to prevent server-side rendering errors from the browser-only Maps SDK.

### Accessibility & Responsiveness
- [ ] On viewports < 1024 px, the map is rendered below the listing cards (stacked layout) and is reachable by scrolling.
- [ ] The map container has a descriptive `aria-label` (e.g. `"Map showing search results"`).

---

## Solution Design

### Component Architecture

```
app/
└── listings/
    └── page.tsx                  ← Search page (server component)
        ├── ListingsClient.tsx    ← Client component; owns split-panel layout
        │   ├── ListingCard.tsx   ← Existing listing card (unchanged)
        │   └── MapView.tsx       ← New; loaded via next/dynamic (ssr:false)
        │       └── ListingMarker.tsx  ← New; renders individual marker + InfoWindow
        └── api/listings/route.ts ← Extended to return lat/lng per listing
```

**Key implementation notes:**

1. **`MapView.tsx`** receives `listings: ListingWithCoords[]` and `center: LatLng` as props. It is wrapped by `next/dynamic({ ssr: false })` in `ListingsClient.tsx` to avoid SSR incompatibility with the Google Maps browser SDK.

2. **Centring resolution**: `locationValue` is a country/city string (consistent with existing search param usage). On the client, use the **Google Maps Geocoding API** (or the existing `@react-google-maps/api` `useLoadScript` hook) to resolve `locationValue` → `LatLng` centre + appropriate zoom level. Cache the resolved centre in `useState` to avoid redundant geocoding calls.

3. **State flow**: Search params (`locationValue`, `guestCount`, `roomCount`) drive a `useEffect` in `ListingsClient.tsx` that re-fetches `/api/listings` and passes the updated array to `MapView`. This keeps map markers in sync with listing cards via a single source of truth.

4. **Info Window**: Use `@react-google-maps/api`'s `<InfoWindow>` component, toggled by a `selectedListingId: string | null` state in `MapView`. Only one info window is open at a time.

---

## Data Model

### Listings Table — Schema Extension

Two new columns are required on the `Listing` model in `prisma/schema.prisma`:

```prisma
model Listing {
  id            String   @id @default(cuid())
  title         String
  description   String
  imageSrc      String
  price         Int

  locationValue String   // existing — country/city code

  // NEW FIELDS
  latitude      Float?   // WGS-84 decimal degrees; nullable for backward compat
  longitude     Float?   // WGS-84 decimal degrees; nullable for backward compat

  guestCount    Int
  roomCount     Int
  bathroomCount Int
  // ... remaining existing fields
}
```

**Migration notes:**
- Both fields are **nullable** (`Float?`) to ensure backward compatibility with existing seed data and listings created before this feature ships.
- A Prisma migration (`prisma migrate dev --name add_listing_lat_lng`) generates the corresponding `ALTER TABLE` statement.
- Listings with `NULL` lat/lng are filtered out in the `/api/listings` response mapper before being passed to `MapView` — they still appear as listing cards.

### API Response Extension

`GET /api/listings` response shape (additive, non-breaking):

```typescript
// Existing shape extended with:
{
  id: string;
  title: string;
  price: number;
  imageSrc: string;
  locationValue: string;
  latitude: number | null;   // NEW
  longitude: number | null;  // NEW
  // ... rest of existing fields
}
```

### TypeScript Types

```typescript
// types/listing.ts (new helper type)
export type ListingWithCoords = Listing & {
  latitude: number;   // narrowed — null entries excluded before this type is used
  longitude: number;
};
```

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|--------------------|
| `locationValue` cannot be geocoded | Map defaults to zoom level 2, world view; no error thrown to user |
| Listing has `null` lat/lng | Listing card renders normally; no marker is placed; no runtime error |
| Zero listings returned | Map renders centred on location with no markers; empty state message on card panel |
| Google Maps API key missing / invalid | `MapView` renders a visible error boundary: *"Map unavailable"*; listing cards remain functional |
| Result set > 100 listings | Markers render but performance SLA is not guaranteed; consider server-side pagination as a follow-up |
| User rapidly changes filters | Debounce marker re-render by 300 ms to prevent excessive re-renders |
| Duplicate coordinates (two listings at same lat/lng) | Markers stack; both are individually clickable (Google Maps default stacking behaviour is acceptable for v1) |

---

## Out of Scope

The following were considered but are explicitly deferred to future releases:

- **Search-by-map-area / drag-to-search**: Allowing users to draw a bounding box or pan the map to define a new search area.
- **Listing creation lat/lng picker**: An embedded map picker in the host listing-creation flow to set coordinates (dependency: listing creation form redesign).
- **Clustered markers**: Marker clustering for dense result sets (revisit if UX feedback surfaces confusion with > 50 markers).
- **Price labels on markers**: Displaying nightly price directly on the marker pin (common Airbnb pattern, deferred for design effort).
- **Map/list toggle on mobile**: A tab-based toggle between map and list views on small screens — stacked layout ships in v1.
- **Persisting map viewport in URL**: Storing current map centre/zoom in query params for shareability.

---

## Open Questions

| # | Question | Owner | Priority |
|---|----------|-------|----------|
| 1 | How will `latitude`/`longitude` be populated for **existing** listings? Manual data entry, a backfill script using the Geocoding API against `locationValue`, or left null until re-created? | BE / Product | 🔴 High — blocks meaningful marker density at launch |
| 2 | Will `locationValue` always be a human-readable place name suitable for geocoding, or can it be an opaque code? The current README describes it as a "locationValue URL param" without specifying format. | BE | 🔴 High — drives centring implementation |
| 3 | Is there a Google Maps API billing account in place? The Geocoding API and Maps JavaScript API both have usage costs. | Infra / Finance | 🔴 High — blocks production deployment |
| 4 | Should the map panel have a fixed height or fill the remaining viewport height? Needs design sign-off. | Design | 🟡 Medium |
| 5 | Is a Mapbox fallback required, or is Google Maps the sole provider for this release? | Product | 🟢 Low |