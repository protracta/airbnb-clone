# Product Requirements Document

## Feature: Google Maps on Listings Page

---

## Problem

Users browsing listings on the search page currently have no spatial context for results — they cannot see where listings are located relative to each other or to their searched destination. This forces users to evaluate listings purely by text/filters, reducing confidence in booking decisions and increasing friction in the discovery experience.

---

## Goals

1. **Map renders for ≥ 95% of listing page loads** where a `locationValue` search param is present, with no layout-breaking failures.
2. **All listings returned by `/api/listings`** for the current search are represented as markers on the map simultaneously.
3. **Map center and zoom reflect the searched location** (`locationValue`) on every search, so the visible region matches user intent.
4. **Zero regression on existing filters** — `guestCount`, `roomCount`, and `locationValue` params continue to function correctly after map integration.
5. **Map loads without blocking the listing cards** — listings are visible and interactive while the map tile renders (no full-page loading gate imposed by the map).

---

## Non-Goals

- **Booking or reservation flow changes** — this release does not touch checkout.
- **Map-driven search** ("search as I move the map" / bounding-box re-query) — map is display-only in this release.
- **Custom branded map styles or themes.**
- **Mobile-specific map layout** (responsive behaviour is a best-effort; a dedicated mobile map UX is deferred).
- **Marker clustering** for high-density results.
- **User location / "near me" geolocation** prompts.

---

## User Stories

| # | Persona | Action | Benefit |
|---|---------|--------|---------|
| 1 | Guest (searcher) | I want to see all search results plotted on a map next to the listing cards | So I can quickly understand the geographic spread and proximity of options |
| 2 | Guest (searcher) | I want the map to auto-center on the city/region I searched | So I don't have to manually pan to find my destination |
| 3 | Guest (searcher) | I want to click a map marker and see which listing it corresponds to | So I can correlate map position with listing details without losing context |
| 4 | Guest (searcher) | I want the map to update when I change filters (guest count, rooms) | So the markers always reflect the current result set |
| 5 | Developer / Operator | I want the Google Maps API key to be managed via environment variable | So it is never exposed in client-side source or version control |

---

## Acceptance Criteria

### Map Rendering

- [ ] `<Map />` component renders inside the listings search page (`app/` route that displays listing results) when at least one listing is returned.
- [ ] If `/api/listings` returns zero results, the map still renders centered on `locationValue` with no markers and no JS error.
- [ ] Map does not render (graceful null/empty state) when `locationValue` is absent from search params.
- [ ] A missing or invalid `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` env var surfaces a non-breaking fallback UI (e.g., grey placeholder + "Map unavailable" label) rather than a JS exception.

### Markers

- [ ] One marker is rendered per listing returned by `/api/listings` for the active search.
- [ ] Each marker is positioned using the listing's `latitude` and `longitude` values.
- [ ] Markers update (old markers removed, new markers added) whenever the result set changes due to filter changes without a full page reload.

### Location Centering

- [ ] On initial load, map center is derived from `locationValue`; the resolved lat/lng matches the searched location within reasonable geocoding accuracy.
- [ ] Map zoom level defaults to a value that shows all returned markers within the viewport (or a sensible city-level zoom when no markers exist).

### Marker Interaction

- [ ] Clicking a marker opens an info window or tooltip displaying at minimum: listing title and price.
- [ ] Only one info window is open at a time; opening a second closes the first.
- [ ] Clicking outside all markers closes any open info window.

### Performance & Integration

- [ ] Map component is **lazy-loaded** (dynamic import with `ssr: false`) so it does not block server-side rendering of listing cards.
- [ ] Listing cards are visible and interactive before the map iframe/canvas fully loads.
- [ ] Existing `locationValue`, `guestCount`, and `roomCount` filter behaviours produce identical results to pre-map baseline (verified by existing or new integration tests).

### Security

- [ ] Google Maps API key is read exclusively from `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` environment variable.
- [ ] API key is not hard-coded anywhere in source files (enforced by a lint/grep check in CI).

---

## Solution Design

### Component Architecture

```
app/
└── (search)/
    └── page.tsx                  ← existing search page (server component)
        └── <ListingsClient />    ← existing client wrapper
            ├── <ListingCard />   ← existing (unchanged)
            └── <Map />           ← NEW client component (dynamic, ssr:false)
```

**`<Map />` receives:**
- `listings: ListingWithLatLng[]` — the same array already fetched for cards
- `center: { lat: number; lng: number }` — resolved from `locationValue`

**Layout:** Side-by-side split on desktop (e.g., `grid-cols-[1fr_400px]` or `flex`); map column is sticky so it stays in view while cards scroll. Mobile collapses to stacked (cards above, map below) — exact breakpoint TBD (see Open Questions).

### Location Resolution

`locationValue` is currently a string (city/region name). Resolution options — **decision needed** (see Open Questions):

- **Option A (preferred):** Use the Google Maps Geocoding API server-side inside the existing `/api/listings` route handler to resolve `locationValue` → `{ lat, lng }` and return it alongside listings. Keeps API key server-side only.
- **Option B:** Use `@react-google-maps/api`'s `useLoadScript` + `Geocoder` client-side. Simpler but exposes key in browser (already true for Maps JS API; acceptable if key is HTTP-referrer-restricted).

### Map Library Integration

```ts
// lib/googleMaps.ts
export const libraries: Libraries = ['places'];  // extend if geocoding added

// components/Map.tsx
'use client';
import { GoogleMap, Marker, InfoWindow, useLoadScript } from '@react-google-maps/api';
```

Dynamic import in parent:

```ts
const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-neutral-200 animate-pulse" />,
});
```

### Marker → Listing Interaction

Maintain `selectedListingId: string | null` in `<ListingsClient />` state (or a local `<Map />` state). On marker click → set state → render `<InfoWindow>` anchored to that marker's position.

---

## Data Model

### Schema Changes

The existing `Listing` Prisma model **must be extended** with geospatial coordinates:

```prisma
// prisma/schema.prisma  — additions to existing Listing model

model Listing {
  // ... existing fields ...

  latitude   Float?   // WGS-84 decimal degrees  e.g. 48.8566
  longitude  Float?   // WGS-84 decimal degrees  e.g. 2.3522
}
```

> **Nullable rationale:** Existing listings have no coordinates. Nullable allows a zero-downtime migration; a backfill job populates coordinates asynchronously. The map simply omits markers for listings where lat/lng is null.

**Migration:**

```bash
npx prisma migrate dev --name add_listing_lat_lng
```

### Backfill Strategy

New listings: coordinates are written at creation time (geocode `locationValue` in the POST `/api/listings` handler before `prisma.listing.create`).

Existing listings: a one-off script geocodes each listing's `locationValue` and patches the record. Script should be rate-limited to respect Geocoding API quotas (50 req/s default).

### API Response Shape

`/api/listings` response items extend to include coordinates:

```ts
// types/index.ts
export type SafeListing = Omit<Listing, 'createdAt'> & {
  createdAt: string;
  // latitude and longitude are already included via Prisma model
};
```

No new API endpoint is needed — coordinates flow through the existing listings response.

### Environment Variables

| Variable | Scope | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Client + Server | Yes | Restrict by HTTP referrer in GCP Console |
| `GOOGLE_MAPS_SERVER_API_KEY` | Server only | If Option A chosen | Used exclusively for Geocoding API calls; never sent to browser |

---

## Out of Scope

> The following were raised or implied during scoping but are **explicitly deferred** to a future release:

- **Map-driven / bounding-box search** ("search as I move the map")
- **Marker clustering** (e.g., `@googlemaps/markerclusterer`) for dense result sets
- **Street View integration**
- **Directions / routing** from user location to listing
- **Saved/favourites layer** on the map
- **Dedicated mobile map toggle** (full-screen map mode on small viewports)
- **Custom map styles** (brand colours, POI filtering)
- **Real-time availability overlay** on markers

---

## Open Questions

| # | Question | Owner | Impact if Unresolved |
|---|----------|-------|----------------------|
| 1 | **Geocoding approach:** Server-side (Option A) or client-side (Option B) for resolving `locationValue` → lat/lng? Server-side is more secure and avoids a client round-trip, but adds latency to the listings API response. | Tech Lead | Affects API key security posture and `/api/listings` response time |
| 2 | **`locationValue` format:** Is it always a free-text city name, or can it be a structured value (country code, place ID) from a prior autocomplete integration? A place ID would make geocoding deterministic and cheaper. | Product / FE | Affects geocoding reliability and cost |
| 3 | **Mobile layout breakpoint:** Should the map be hidden by default on mobile with a "Show map" toggle, or always stacked below cards? | Design | Affects component layout and accessibility |
| 4 | **Marker click behaviour:** Should clicking a marker also highlight / scroll the corresponding listing card into view? | Product | Affects `<ListingsClient />` state coupling complexity |
| 5 | **Backfill ownership and timeline:** Who runs the coordinate backfill script, and must it complete before the feature ships (or can null-coordinate listings silently omit their marker)? | Eng / Data | Affects launch readiness criteria |
| 6 | **API key quota and billing:** Has the GCP project been set up with billing enabled and quota alerts for the Maps JS API + Geocoding API? | DevOps / Ops | Feature cannot ship to production without this |