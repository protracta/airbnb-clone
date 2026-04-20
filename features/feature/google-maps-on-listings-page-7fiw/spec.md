# Product Requirements Document
## Feature: Google Maps on Listings Page

---

## Problem

Users browsing the listings page currently have no spatial context for search results — they cannot see where listings are located relative to each other or to their intended destination. This forces users to evaluate listings purely through text and filters, leading to poor location-awareness and reduced confidence in booking decisions. The application already has `locationValue` as a URL search param and `@react-google-maps/api` in the stack, but the map integration has not yet been implemented.

---

## Goals

1. **Render a map** alongside the listings grid that displays a pin for every listing returned by the current search query.
2. **Maintain search context** — the map viewport auto-centers and auto-zooms to the active `locationValue` on every search.
3. **Improve listing discoverability** — users can identify listing positions without opening individual listing pages.
4. **Zero regression on existing filters** — `guestCount`, `roomCount`, and `locationValue` filter behaviour is unaffected by the map addition.
5. **Performance** — the map and listing grid load within an acceptable time budget (see Acceptance Criteria) on a standard broadband connection.

---

## Non-Goals

- Interactive filtering by drawing a bounding box or polygon on the map (deferred).
- Clustering of map markers at low zoom levels (deferred).
- Real-time price labels on map pins (deferred).
- Native mobile / app-store map experience — this is a web-only feature.
- Geocoding of free-text addresses at query time — `locationValue` is assumed to already encode a resolvable location.

---

## User Stories

| # | Persona | Action | Benefit |
|---|---------|--------|---------|
| 1 | Guest browsing listings | I want to see a map showing where each listing is located | So that I can quickly judge proximity to my destination without opening each listing |
| 2 | Guest performing a location search | I want the map to automatically centre on my searched location | So that I don't have to manually pan to find the relevant area |
| 3 | Guest hovering over a listing card | I want the corresponding map pin to be visually highlighted | So that I can correlate a card to its map position instantly |
| 4 | Guest clicking a map pin | I want to be taken to — or have previewed — the corresponding listing | So that I can act on spatial interest without returning to the card grid |
| 5 | Developer maintaining the app | I want the map key to be stored in an environment variable | So that the Google Maps API key is never exposed in source control |

---

## Acceptance Criteria

### Map Rendering
- [ ] A Google Map renders on the listings page whenever at least one listing is returned by `/api/listings`.
- [ ] The map is hidden (or replaced with an empty-state message) when zero listings are returned.
- [ ] The map uses the `@react-google-maps/api` `GoogleMap` component — no third-party map library is introduced.
- [ ] The Google Maps API key is read exclusively from `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local`; it does not appear in committed code.

### Viewport & Centering
- [ ] On initial render with an active `locationValue`, the map centres on the coordinates resolved for that location value.
- [ ] When `locationValue` changes (new search), the map re-centres and re-zooms without a full page reload.
- [ ] Default zoom level is sufficient to display all returned listing pins simultaneously (fit-bounds behaviour acceptable).

### Markers
- [ ] One `Marker` (or `AdvancedMarkerElement`) is rendered per listing returned by the current filtered query.
- [ ] Each marker is positioned using `latitude` and `longitude` values stored on the listing record.
- [ ] Markers update (add/remove) reactively when filters change the listing result set.

### Listing Card ↔ Marker Interaction
- [ ] Hovering a listing card highlights (visually distinguishes) its corresponding map marker.
- [ ] Hovering away from a listing card returns the marker to its default state.
- [ ] Clicking a map marker navigates to, or opens a preview of, the associated listing detail page.

### Layout
- [ ] On desktop (≥ 1024 px), the listings grid and map are displayed side-by-side with the map occupying a fixed or sticky column.
- [ ] On mobile (< 1024 px), the map is either stacked below the listings grid or hidden behind a toggle — no horizontal overflow is introduced.
- [ ] The map container has an explicit height (not 0) so it is visible without additional CSS override by consumers.

### Performance
- [ ] Lighthouse Performance score on the listings page does not regress by more than 5 points vs. the pre-map baseline.
- [ ] The Google Maps JS bundle is loaded lazily (dynamic import or `@react-google-maps/api` `useLoadScript`) and does not block the listings grid render.

### Data Integrity
- [ ] Listings without valid `latitude`/`longitude` values do not cause a runtime error — they are silently excluded from marker rendering.
- [ ] No existing Prisma query or API route for listings is modified in a breaking way.

---

## Solution Design

### Component Architecture

```
app/
└── listings/
    └── page.tsx                  ← server component; fetches listings, passes to client shell
        └── ListingsClient.tsx    ← client component; owns hover state, renders grid + map
            ├── ListingCard.tsx   ← existing; receives onHover / onHoverEnd callbacks
            └── ListingsMap.tsx   ← NEW client component; wraps @react-google-maps/api
                └── ListingMarker.tsx  ← NEW; single marker with highlight logic
```

**Key design decisions:**
- `ListingsClient` holds a single piece of state: `hoveredListingId: string | null`. This is passed as a prop down to both `ListingCard` (to apply a highlight class) and `ListingsMap` (to style the active marker).
- `ListingsMap` is a **Client Component** (`"use client"`) because it uses browser APIs.
- `ListingsMap` accepts `listings: Listing[]`, `center: LatLng`, and `hoveredId: string | null` as props — no internal data fetching.

### Map Loading Strategy

```tsx
// ListingsMap.tsx
import { useLoadScript, GoogleMap, Marker } from '@react-google-maps/api';

const { isLoaded } = useLoadScript({
  googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
});

if (!isLoaded) return <MapSkeleton />;  // lightweight placeholder
```

This avoids adding a `<Script>` tag manually and keeps loading declarative.

### Centering / Fit-Bounds Logic

```tsx
// Pseudo-code inside ListingsMap
const mapRef = useRef<google.maps.Map>();

useEffect(() => {
  if (!mapRef.current || listings.length === 0) return;
  const bounds = new google.maps.LatLngBounds();
  listings.forEach(l => bounds.extend({ lat: l.latitude, lng: l.longitude }));
  mapRef.current.fitBounds(bounds);
}, [listings]);
```

`locationValue` changes trigger a new `listings` array from the server, which cascades into the `useEffect` re-run.

### URL Param Consumption (No Change)

The existing `locationValue`, `guestCount`, and `roomCount` params are already read in `page.tsx` and passed to `/api/listings`. The map consumes the already-filtered `listings` array — no new URL params are introduced.

---

## Data Model

### Changes Required

**Listings table — add geolocation columns**

The existing `Listing` model in `prisma/schema.prisma` must be extended:

```prisma
model Listing {
  // ... existing fields ...

  latitude   Float?   // WGS-84 decimal degrees
  longitude  Float?   // WGS-84 decimal degrees
}
```

> **Nullable rationale:** Existing listings may not have coordinates. Nullable columns prevent a breaking migration and allow graceful marker exclusion (see Acceptance Criteria — Data Integrity).

**Migration**

```bash
npx prisma migrate dev --name add_listing_geolocation
```

**TypeScript type update**

The auto-generated `Prisma.Listing` type will reflect the nullable fields immediately after migration. No manual type file changes are required unless a `SafeListing` DTO is in use — in which case `latitude` and `longitude` must be added to that mapping.

**Seeding / Backfill**

- New listings created via the listing-creation flow must accept and persist `latitude` / `longitude` (sourced from the Google Places / Geocoding API response already used for `locationValue`).
- A backfill script is **out of scope for this release** (see Out of Scope below); existing listings without coordinates will simply show no marker.

### Data Flow Summary

```
/api/listings (GET)
  → Prisma query: SELECT ..., latitude, longitude FROM Listing WHERE ...
  → Returns: Listing[] (includes nullable lat/lng)
  → ListingsClient receives array
  → ListingsMap filters out nulls, renders Marker per valid coordinate pair
```

---

## Out of Scope

> The following items were raised in context or are natural follow-ons, but are explicitly deferred to avoid scope creep.

| Item | Reason Deferred |
|------|----------------|
| Map bounding-box / draw-to-filter | Requires significant filter architecture changes |
| Marker clustering | Adds library dependency; low value at current data scale |
| Price labels on pins | Requires design work; pins become cluttered at scale |
| Backfilling `latitude`/`longitude` for existing listings | Requires a geocoding job; separate operational task |
| Listing creation form update to capture coordinates | Dependency on geocoding UX; separate story |
| Mobile map toggle UI | Interaction design TBD; desktop-first for this release |
| Map style customisation (colours, POI suppression) | Nice-to-have; no user requirement stated |

---

## Open Questions

| # | Question | Owner | Impact if Unresolved |
|---|----------|-------|----------------------|
| 1 | How is `locationValue` currently encoded — is it a place name string, a place ID, or already a lat/lng pair? This determines whether the map can centre without an additional Geocoding API call. | Backend / Search team | Blocks centering implementation |
| 2 | Is a `SafeListing` DTO (or similar serialisation layer) in use between the Prisma result and the client? If so, `latitude` and `longitude` must be explicitly added to that mapping. | Backend | Blocks markers rendering correct coordinates |
| 3 | What is the accepted Lighthouse regression threshold? The PRD assumes 5 points — confirm with the team. | Tech Lead | Acceptance Criteria gate |
| 4 | Should the map be visible on the listings page when no `locationValue` is set (i.e., browsing all listings)? If yes, what is the default viewport? | Product | Scope of centering logic |
| 5 | Is `AdvancedMarkerElement` (Maps JS API v3.55+) preferred over the legacy `Marker`? Legacy `Marker` is deprecated by Google as of 2024. | Frontend Lead | Marker implementation choice |