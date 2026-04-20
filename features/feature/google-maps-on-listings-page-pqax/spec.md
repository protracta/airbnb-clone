# Product Requirements Document
## Feature: Google Maps on Listings Page

---

## Problem

Users browsing the listings search page currently have no spatial context for results — they cannot see where listings are located relative to each other or to their searched location. This forces users to evaluate listings purely on text/price, creating friction in the decision-making process and reducing confidence in selections. The `@react-google-maps/api` package is already included in the stack but unused, meaning the capability exists and is simply not wired up.

---

## Goals

1. **Render a visible map** on the listings page that displays all current search result listings as markers, loading within 2 seconds of page render on a standard connection.
2. **Spatial orientation**: 100% of markers shown on the map correspond 1:1 with listing cards rendered in the results list — no ghost markers, no missing pins.
3. **Search-driven map focus**: The map viewport auto-centers and zooms to the searched `locationValue` region on every search, with zero manual repositioning required by the user.
4. **Marker–card interaction**: Clicking a map marker highlights the corresponding listing card (and vice versa), reducing the cognitive overhead of cross-referencing map and list.
5. **No regression**: Existing search filters (`locationValue`, `guestCount`, `roomCount`) continue to function correctly with the map present; Lighthouse performance score does not drop more than 5 points.

---

## Non-Goals

- We are **not** building a draggable "search as map moves" interaction in this release.
- We are **not** building custom-styled map markers (e.g. price bubbles) in this release — default pin icons are acceptable.
- We are **not** adding street view, satellite toggle, or any other Google Maps layer controls.
- We are **not** persisting map viewport state (zoom level, pan position) to the URL or database.
- We are **not** changing the listings API (`/api/listings`) contract or adding geo-based server-side filtering.

---

## User Stories

| # | Persona | Action | Benefit |
|---|---------|--------|---------|
| 1 | **Guest (searcher)** | I want to see all listings plotted on a map alongside the results list | So that I can quickly understand the geographic spread of options |
| 2 | **Guest (searcher)** | I want the map to automatically focus on the area I searched | So that I don't have to manually pan to find my destination |
| 3 | **Guest (searcher)** | I want to click a marker on the map and have the matching listing card highlighted | So that I can easily connect a pin to its details without scrolling and guessing |
| 4 | **Guest (searcher)** | I want to click a listing card and see its pin highlighted on the map | So that I can orient a specific listing geographically without losing my place in the list |
| 5 | **Guest (mobile)** | I want to toggle between the map view and the list view on small screens | So that the map does not consume the entire viewport and hide results |

---

## Acceptance Criteria

### Map Rendering
- [ ] **AC-1**: The map component renders on the listings page without a console error when a valid Google Maps API key is present in environment variables.
- [ ] **AC-2**: If the API key is missing or invalid, the map container renders a graceful fallback UI (e.g. "Map unavailable") — the listings list must still be fully functional.
- [ ] **AC-3**: The map is not rendered server-side; it is loaded client-side only (no SSR hydration mismatch errors).

### Markers
- [ ] **AC-4**: One marker is rendered per listing returned by `/api/listings` for the current search query — no more, no fewer.
- [ ] **AC-5**: Each marker is positioned at the `latitude` and `longitude` stored against the listing record (see Data Model).
- [ ] **AC-6**: If a listing has `null` coordinates, it is excluded from the map silently (no crash); its listing card still renders in the list.

### Viewport / Centering
- [ ] **AC-7**: On initial load and on each new search, the map centers and fits its bounds to encompass all visible markers.
- [ ] **AC-8**: If `locationValue` resolves to zero results, the map renders in a neutral default state (e.g. world view) rather than crashing or showing a blank canvas.

### Marker–Card Interaction
- [ ] **AC-9**: Clicking a marker sets that listing into an "active" state — the corresponding listing card receives a visible highlight style (e.g. border or shadow change).
- [ ] **AC-10**: Clicking a listing card sets that listing into an "active" state — the corresponding marker receives a visible highlight (e.g. distinct color or scale).
- [ ] **AC-11**: Only one listing can be in the "active" state at any time; clicking elsewhere on the map or a different item clears the previous active state.

### Filters & Search
- [ ] **AC-12**: Changing `locationValue`, `guestCount`, or `roomCount` search params re-fetches listings and re-renders markers without requiring a full page reload.
- [ ] **AC-13**: The map and list remain in sync at all times — the marker count always equals the listing card count for any given filter state.

### Mobile
- [ ] **AC-14**: On viewports narrower than `768px`, the map is hidden by default and a "Show map" toggle button is visible.
- [ ] **AC-15**: Tapping "Show map" replaces the list view with the map view; tapping "Show list" restores the list — both views remain functional.

### Performance
- [ ] **AC-16**: The Google Maps JS SDK is loaded lazily (dynamic import or `next/script` with `strategy="lazyOnload"`) so it does not block the initial listing list render.

---

## Solution Design

### Component Architecture

```
app/
└── listings/
    └── page.tsx                  ← Server component; fetches listings, passes to client shell
        └── ListingsClient.tsx    ← Client component; owns active marker state
            ├── ListingCard.tsx   ← Existing; receives `isActive` prop + onClick handler
            └── ListingsMap.tsx   ← New client component (dynamic import, ssr: false)
                └── MapMarker.tsx ← New; renders individual <Marker>; receives `isActive` prop
```

**Key decisions:**
- `ListingsMap` is wrapped in `next/dynamic` with `{ ssr: false }` to satisfy AC-3 and AC-16.
- Active listing state (`activeListingId: string | null`) lives in `ListingsClient` so both `ListingCard` and `MapMarker` can subscribe to it without prop-drilling through unrelated layers or reaching for a global store.
- `@react-google-maps/api`'s `<GoogleMap>` and `<Marker>` components are used directly — no additional mapping library introduced.

### Environment Variable

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<key>
```

Must be set in `.env.local` (development) and deployment environment. The component reads this at runtime and renders the fallback UI (AC-2) if the value is falsy.

### Coordinate Resolution

`locationValue` is a human-readable place string (e.g. `"Paris, France"`). Two options exist:

| Option | Approach | Trade-offs |
|--------|----------|-----------|
| **A (recommended)** | Store `lat`/`lng` on the `Listing` model at creation time (see Data Model) | No runtime geocoding cost; fast map load; requires migration |
| **B** | Geocode `locationValue` client-side at search time using Google Geocoding API | No schema change; adds latency + API cost per search |

**Recommendation: Option A.** Coordinates should be captured when a listing is created. The map viewport center/bounds are derived from the returned listings' coordinates, making the geocoding of `locationValue` itself unnecessary for the map to function.

### Bounds Fitting Logic

```typescript
// Inside ListingsMap.tsx
const bounds = new google.maps.LatLngBounds();
listings.forEach(l => {
  if (l.latitude && l.longitude) {
    bounds.extend({ lat: l.latitude, lng: l.longitude });
  }
});
map.fitBounds(bounds);
// Guard for single marker (fitBounds zooms in too far)
if (listings.length === 1) map.setZoom(14);
```

---

## Data Model

### Schema Change (Prisma)

Add two optional fields to the existing `Listing` model:

```prisma
model Listing {
  id            String   @id @default(cuid())
  // ... existing fields ...

  latitude      Float?   // decimal degrees, WGS84
  longitude     Float?   // decimal degrees, WGS84
}
```

**Why optional (`Float?`):** Existing listings in the database have no coordinates. Making the fields nullable prevents a breaking migration and allows AC-6 (graceful exclusion of coordinate-less listings) to be handled cleanly.

### Migration

```bash
npx prisma migrate dev --name add_listing_coordinates
```

No backfill is required for the initial release — existing listings without coordinates will simply not appear on the map.

### API Contract

No change to the `/api/listings` route signature. The response payload is extended to include the new fields:

```typescript
// Existing ListingResponse type — append:
latitude:  number | null;
longitude: number | null;
```

The client already receives the full listing object; no new endpoint is needed.

---

## Edge Cases

| # | Scenario | Expected Behaviour |
|---|----------|--------------------|
| EC-1 | All listings in a search result have `null` coordinates | Map renders in world-view default; no markers shown; no crash |
| EC-2 | Only one listing has valid coordinates | Map centers on that single marker at zoom 14 (see bounds logic above) |
| EC-3 | API key quota exceeded / network error loading Maps SDK | Graceful fallback UI displayed; listing list unaffected |
| EC-4 | Listing has a `latitude` but `null` `longitude` (or vice versa) | Treated as no coordinates; excluded from map |
| EC-5 | User navigates away while Maps SDK is still loading | Dynamic import is cancelled cleanly; no memory leak or error |
| EC-6 | >200 listings returned in a single search | Markers still render; consider `OverlappingMarkerSpiderfier` in a future release if clustering is needed |

---

## Open Questions

| # | Question | Owner | Impact if Unresolved |
|---|----------|-------|----------------------|
| OQ-1 | How is `latitude`/`longitude` populated for **new** listings at creation time? Is the host expected to enter coordinates manually, or do we geocode `locationValue` on save? | Product / Backend | Blocks data quality for all future listings |
| OQ-2 | What is the Google Maps API key billing arrangement? Who owns the GCP project and monitors quota? | Infra / Finance | Blocks production deployment |
| OQ-3 | Should the map be visible by default on tablet (768px–1024px), or only on desktop (>1024px)? | Design | Affects AC-14 breakpoint decision |
| OQ-4 | Are there plans for geo-radius search ("search near me") that would affect the map viewport logic chosen here? | Product | Could require rework of centering strategy |
| OQ-5 | Is `locationValue` always a freeform string, or is it ever a structured object (city, country) that could yield a canonical lat/lng cheaply? | Backend | Affects whether Option B above becomes viable |

---

## Out of Scope

- **Cluster markers** for dense result sets — deferred to post-launch.
- **Price-label markers** (Airbnb-style floating price chips on the map) — deferred.
- **"Search this area" on map drag** — explicitly not in this release (see Non-Goals).
- **Saved/favorited listing indicators** on map markers — deferred.
- **Backfilling coordinates** for existing listings — deferred; operational task, not product scope.
- **Custom map styling** (dark mode, brand colours) — deferred.