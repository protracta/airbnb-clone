# Product Requirements Document
## Feature: Google Maps on Listings Page

---

## Problem

Users browsing the listings search page currently have no spatial context for search results — they cannot see where listings are located relative to each other or to their searched destination. This forces users to evaluate listings in isolation, without the geographic orientation that is critical to accommodation decision-making (e.g. proximity to city centre, transport links, or points of interest). Adding an interactive Google Map to the listings page directly addresses this gap.

---

## Goals

1. **Spatial orientation**: 100% of listings returned by a search are represented as markers on the map, geo-anchored to their stored coordinates.
2. **Search coherence**: The map viewport automatically centres and zooms to the area matching the active `locationValue` search parameter on every search.
3. **Interactivity**: Clicking a map marker surfaces a summary of that listing (name, price, thumbnail) without requiring a full page navigation.
4. **Performance**: The map component loads without blocking the listings grid; time-to-interactive for the listings grid is not regressed by more than 100 ms.
5. **Resilience**: If the Google Maps script fails to load or a listing has no coordinates, the page renders gracefully without a broken UI state.

---

## Non-Goals

- **Full map-based search / "search as I move the map"** — The map is read-only in this release; panning/zooming the map does not trigger a new API query.
- **Custom marker clustering** — Basic single markers only; clustering is deferred.
- **Directions or route planning** — No integration with Google Directions API.
- **Mobile-specific map UX** — The map must be responsive, but a dedicated mobile drawer/sheet experience is out of scope.
- **Saving or sharing a map view** — No map state is persisted to the URL in this release.

---

## User Stories

| # | Persona | Action | Benefit |
|---|---------|--------|---------|
| 1 | Guest (searcher) | I want to see all search results plotted on a map alongside the listings grid | I can quickly assess neighbourhood and proximity before clicking into a listing |
| 2 | Guest (searcher) | I want the map to auto-centre on my searched location | I don't have to manually pan to find where results are |
| 3 | Guest (searcher) | I want to click a map marker and see a listing summary | I can get key details (name, price) without losing my place in the search results |
| 4 | Guest (searcher) | I want the listings grid to remain usable if the map fails to load | I can still browse and book even in degraded network conditions |
| 5 | Developer / Admin | I want listing coordinates stored in the database | The map has reliable, structured data to render markers from |

---

## Acceptance Criteria

### Map Rendering
- [ ] The listings page renders a `MapComponent` alongside the listings grid when at least one listing is returned.
- [ ] The map is initialised using `@react-google-maps/api`'s `<GoogleMap>` component, loaded via the `useJsApiLoader` hook with the API key sourced from an environment variable (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`).
- [ ] The map does **not** render (or renders a neutral placeholder) when zero listings are returned.

### Viewport / Centre
- [ ] On initial render and on each new search, the map centres on the coordinates derived from the active `locationValue` URL parameter.
- [ ] A default zoom level (recommended: `10`) is applied; this value must be configurable via a constant without a code change to the component.

### Markers
- [ ] One `<Marker>` is rendered per listing that has valid `latitude` and `longitude` values.
- [ ] Listings missing `latitude` or `longitude` are silently skipped — no console error, no broken render.
- [ ] Each marker is positioned at `{ lat: listing.latitude, lng: listing.longitude }`.

### Info Window / Popup
- [ ] Clicking a marker opens an info popup showing: listing title, nightly price (formatted as currency), and thumbnail image.
- [ ] Only one info popup is open at a time; opening a second marker closes the first.
- [ ] The popup includes a link that navigates to `/listings/[id]`.

### Data Model
- [ ] The `Listing` Prisma model contains `latitude Float?` and `longitude Float?` fields.
- [ ] A Prisma migration is generated and applied before the feature ships.
- [ ] The `/api/listings` endpoint returns `latitude` and `longitude` in its response payload.
- [ ] The `ListingCardProps` / listing TypeScript type is updated to include `latitude: number | null` and `longitude: number | null`.

### Error & Edge Cases
- [ ] If `useJsApiLoader` returns `loadError`, the map container renders a non-blocking fallback UI (e.g. a static placeholder with copy: "Map unavailable").
- [ ] If `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is undefined, the app does not throw an unhandled exception; a warning is logged to the console in development.

### Performance
- [ ] The `MapComponent` is wrapped in `next/dynamic` with `ssr: false` and a loading skeleton, so it is code-split and does not block server-side rendering of the listings grid.

---

## Solution Design

### Component Architecture

```
app/
└── listings/
    └── page.tsx                  ← Listings page (server component)
        ├── ListingsGrid          ← Existing listings grid (client component)
        └── MapComponent          ← NEW (client component, dynamic import)
```

**`MapComponent` responsibilities:**
- Accept `listings: ListingMapItem[]` and `center: LatLng` as props.
- Own all `@react-google-maps/api` logic internally; nothing outside this component imports from that library.
- Manage `activeMarkerId: string | null` in local state to control the open info window.

**Dynamic import in `page.tsx`:**
```ts
const MapComponent = dynamic(
  () => import('@/components/MapComponent'),
  { ssr: false, loading: () => <MapSkeleton /> }
);
```

### Location Resolution

`locationValue` (a string, e.g. `"London, UK"`) must be converted to a `LatLng` centre for the map. Two viable approaches — **open question on which to adopt** (see Open Questions):

| Option | Mechanism | Tradeoff |
|--------|-----------|----------|
| A | Client-side Geocoding API call inside `MapComponent` | Simpler data flow; costs an extra Maps API call per search |
| B | Store `lat/lng` on a `Location` lookup table keyed by `locationValue` | No extra runtime API call; requires additional data seeding work |

### Marker Data Shape

Only a subset of listing data is needed by the map. Define a lean type to avoid passing full listing objects:

```ts
// types/map.ts
export type ListingMapItem = {
  id: string;
  title: string;
  price: number;
  imageSrc: string;
  latitude: number;   // guaranteed non-null at call site (filtered before passing)
  longitude: number;
};
```

The parent page filters out listings without coordinates before passing to `MapComponent`:

```ts
const mappableListings = listings.filter(
  (l) => l.latitude != null && l.longitude != null
) as ListingMapItem[];
```

---

## Data Model

### Prisma Schema Change

```prisma
model Listing {
  id            String   @id @default(cuid())
  title         String
  price         Int
  imageSrc      String
  locationValue String

  // NEW FIELDS
  latitude      Float?
  longitude     Float?

  // ... existing fields unchanged
}
```

> `Float?` (nullable) is intentional: existing listings in the database will have `null` coordinates until backfilled. The UI must handle null gracefully (see Acceptance Criteria — Markers).

### Migration

```bash
npx prisma migrate dev --name add_listing_coordinates
```

This generates a non-destructive `ALTER TABLE` migration. No existing data is modified.

### API Contract Update

`GET /api/listings` response shape (partial):

```json
{
  "id": "clx...",
  "title": "Cosy flat in Shoreditch",
  "price": 120,
  "imageSrc": "/images/listing.jpg",
  "locationValue": "London, UK",
  "latitude": 51.5236,
  "longitude": -0.0749
}
```

Ensure the Prisma `select` / `findMany` call in the listings API handler does **not** explicitly exclude `latitude` or `longitude` (i.e. do not use a restrictive `select` that omits them).

---

## Edge Cases

| Scenario | Expected Behaviour |
|----------|--------------------|
| Listing has `latitude: null` / `longitude: null` | Marker is not rendered; listing still appears in the grid |
| All listings in results lack coordinates | Map renders centred on `locationValue` with no markers; no error state |
| `locationValue` cannot be geocoded | Map renders at a default world-level zoom; log warning |
| Google Maps JS API fails to load | Fallback placeholder renders; listings grid is unaffected |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` missing | Console warning in dev; map fallback shown; no thrown exception |
| User clicks a marker for a listing that has since been deleted | Link navigates to `/listings/[id]`; 404 handling is owned by the listing detail page |
| Very large result set (100+ listings) | All valid markers render; performance impact is noted as a known risk — clustering is deferred |

---

## Out of Scope

- Map-driven search ("search as map moves")
- Marker clustering for dense result sets
- Saved / shareable map view state in URL
- Mobile map drawer / bottom-sheet UX pattern
- Heatmaps or pricing overlays on the map
- Backfill script to populate `latitude`/`longitude` for existing listings *(required operationally but not part of this feature ticket)*

---

## Open Questions

| # | Question | Owner | Impact if Unresolved |
|---|----------|-------|----------------------|
| 1 | **Location resolution strategy**: Geocoding API at runtime (Option A) vs. stored `lat/lng` lookup table (Option B)? | Tech Lead | Blocks `MapComponent` implementation and potential additional schema work |
| 2 | **Google Maps API key billing**: Is the key scoped and quota-limited for this use case? | Infra / DevOps | Risk of unexpected billing or quota exhaustion in production |
| 3 | **Coordinate seeding**: How will `latitude`/`longitude` be populated for new listings? Via an admin form field, a server-side geocode-on-create hook, or manual DB entry? | Product + Backend | Null markers will be common until this is decided |
| 4 | **Map layout**: Split-panel (map 50% / grid 50%) or map below grid? | Design | Affects responsive breakpoints and component layout work |
| 5 | **Info window design**: Is the thumbnail + title + price + link sufficient, or does design require a richer card? | Design | Scope of `InfoWindow` sub-component |