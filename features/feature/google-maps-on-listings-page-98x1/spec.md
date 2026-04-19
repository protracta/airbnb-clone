# Product Requirements Document
## Feature: Google Maps on Listings Page

---

## Problem

Users browsing the listings page currently have no spatial context for search results — they cannot see where listings are located relative to each other or to their intended destination. This forces users to evaluate listings in isolation, increasing cognitive load and reducing confidence in booking decisions. The listings page already supports a `locationValue` URL parameter and the project has `@react-google-maps/api` installed, making map integration a natural and low-friction next step.

---

## Goals

1. **Spatial awareness**: 100% of listings returned by a search are represented as pins on a visible map on the listings page.
2. **Interactivity**: Clicking a map pin surfaces the corresponding listing's key details (title, price, thumbnail) without requiring a full page navigation.
3. **Filter coherence**: The map viewport and pins update automatically when `locationValue`, `guestCount`, or `roomCount` search params change — with no manual refresh required.
4. **Performance**: The map component loads without blocking the listings list; initial page Time-to-Interactive does not regress by more than 200 ms on a simulated 4G connection.
5. **Accessibility**: The map is not the sole means of navigating listings; the existing listings list remains fully functional alongside the map.

---

## Non-Goals

- **Custom map styling / branding** — default Google Maps styling is acceptable for this release.
- **Clustering of pins** at high zoom-out levels — not required in this release.
- **Drawing tools or radius search** — users cannot draw a search boundary on the map.
- **Map-first navigation** — the map does not replace the listings list; it is a companion view only.
- **Mobile-specific map UX** (e.g. collapsible drawer, swipe-to-dismiss card) — desktop layout is the target for this release.
- **Saved/favourited listings highlighted on the map** — deferred.

---

## User Stories

| # | Persona | Action | Benefit |
|---|---------|--------|---------|
| 1 | Guest (searcher) | I want to see all search results plotted on a map next to the listing cards | So that I can understand the geographic spread of available listings at a glance |
| 2 | Guest (searcher) | I want to click a map pin and see the listing's name, price, and photo | So that I can evaluate a listing's location without leaving the page |
| 3 | Guest (searcher) | I want the map to re-centre and re-pin when I change my search filters | So that the map always reflects my current search results without extra steps |
| 4 | Guest (searcher) | I want the map to centre on the location I searched for | So that I am not disoriented by an irrelevant default map position |

---

## Acceptance Criteria

### Map Rendering
- [ ] A Google Maps instance is rendered on the listings page alongside the listings grid/list.
- [ ] The map is lazy-loaded (dynamic import with `ssr: false`) so it does not block server-side rendering of listing cards.
- [ ] The map centres on the coordinates derived from the current `locationValue` search param on initial load.
- [ ] If `locationValue` is absent, the map renders at a sensible world-level default zoom (e.g. zoom level 2, centred at 0°, 20°).

### Pins
- [ ] One marker pin is rendered per listing returned by `/api/listings` for the current search params.
- [ ] Each pin is positioned using the listing's `latitude` and `longitude` values.
- [ ] Pins re-render (add/remove/move) whenever the listings result set changes due to filter updates.

### Info Window / Pop-up
- [ ] Clicking a pin opens an info window displaying: listing thumbnail image, listing title, price per night, and a "View listing" link.
- [ ] Only one info window is open at a time; opening a new pin closes the previous info window.
- [ ] The info window can be dismissed by clicking the map background or a close button.

### Filter & URL Param Coherence
- [ ] Changing `locationValue`, `guestCount`, or `roomCount` via the search UI triggers a re-fetch of listings and a corresponding map update without a full page reload.
- [ ] The map re-centres on the new `locationValue` coordinates when the location filter changes.

### Data & API
- [ ] `/api/listings` returns `latitude` and `longitude` fields for every listing record.
- [ ] Listings that lack `latitude` or `longitude` are rendered in the listings list but are silently omitted from the map (no crash, no console error).

### Environment & Keys
- [ ] The Google Maps API key is stored in an environment variable (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) and is never hard-coded in source.
- [ ] The app renders gracefully (listings list fully functional, map replaced by an error banner) if the API key is missing or the Maps script fails to load.

---

## Solution Design

### Component Architecture

```
app/
└── listings/
    └── page.tsx                  ← Server Component; fetches listings, passes to client shell
        └── ListingsClient.tsx    ← Client Component; owns layout (list + map side-by-side)
            ├── ListingCard.tsx   ← Existing card component (unchanged)
            └── ListingsMap.tsx   ← NEW — lazy-loaded Client Component (dynamic, ssr:false)
                └── ListingMarker.tsx  ← NEW — individual marker + InfoWindow
```

**Key decisions:**
- `ListingsMap` is imported via `next/dynamic` with `ssr: false` to prevent hydration errors from the Google Maps DOM and to avoid blocking the SSR-rendered listing cards.
- `ListingsClient` passes the current filtered `listings` array as a prop to `ListingsMap`; the map is a pure consumer of that data — it owns no fetch logic.
- `locationValue` is resolved to `{ lat, lng }` coordinates inside `ListingsClient` (or a dedicated `useMapCentre` hook) using the same country/location lookup the existing search flow already performs.

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Search / Filter Bar                                 │
├────────────────────────┬────────────────────────────┤
│                        │                            │
│   Listings Grid        │   Google Map               │
│   (scrollable)         │   (sticky, full height)    │
│                        │                            │
└────────────────────────┴────────────────────────────┘
```

- Desktop: 50/50 or 60/40 split (listings / map), map is `position: sticky` so it stays in view while the user scrolls listing cards.
- The split is a Tailwind flex/grid layout in `ListingsClient`.

### `ListingsMap` Props Interface (TypeScript)

```ts
interface ListingsMapProps {
  listings: ListingWithCoordinates[];   // see Data Model below
  centre: google.maps.LatLngLiteral;   // derived from locationValue
  zoom?: number;                        // default: 12
}
```

### Marker & InfoWindow Behaviour

- Use `@react-google-maps/api`'s `<GoogleMap>`, `<Marker>`, and `<InfoWindow>` components.
- Local state `selectedListingId: string | null` in `ListingsMap` controls which InfoWindow is open.
- Setting `selectedListingId` to a new ID closes any open window and opens the new one.

---

## Data Model

### Schema Change — `Listing` table

The `Listing` Prisma model must be extended with two new optional fields:

```prisma
model Listing {
  id            String   @id @default(cuid())
  title         String
  // ... existing fields ...

  // NEW
  latitude      Float?
  longitude     Float?
}
```

**Notes:**
- Both fields are **optional (`Float?`)** so that existing listing records do not break on migration.
- A Prisma migration file must be generated (`prisma migrate dev --name add_listing_coordinates`).
- Seed data / listing creation flow (out of scope for this release — see below) should be updated to populate these fields when a listing is created.

### API Response — `GET /api/listings`

The existing listings route must be updated to include the new fields in its `select` or response serialisation:

```ts
// app/api/listings/route.ts (addition)
select: {
  // ...existing selected fields...
  latitude: true,
  longitude: true,
}
```

### TypeScript Type Extension

```ts
// types/index.ts (or equivalent)
export type ListingWithCoordinates = Listing & {
  latitude: number | null;
  longitude: number | null;
};
```

---

## Open Questions

| # | Question | Owner | Impact if unresolved |
|---|----------|-------|----------------------|
| 1 | How is `locationValue` currently encoded — is it a country code, a city name, or a coordinates string? The map centring logic depends entirely on this. | Engineering | Blocks map centre implementation |
| 2 | Are `latitude`/`longitude` values populated at listing-creation time, or do we need a backfill strategy for existing records? | Product / Engineering | Existing listings will not appear as pins without a backfill or Geocoding API call |
| 3 | Should the Geocoding API (to resolve `locationValue` → `{lat,lng}`) be called client-side or server-side? Calling it server-side avoids exposing an unrestricted key but adds latency. | Engineering | Security posture of API key |
| 4 | What is the agreed desktop breakpoint below which the map is hidden (or moved below the listing list)? | Design | Layout AC cannot be finalised |
| 5 | Is there a Google Maps API key already provisioned for this project, or does one need to be created and restricted? | Infra / Engineering | Blocks any local or staging testing |
| 6 | Should pins visually differentiate listings that are "featured", "superhost", or currently selected/hovered in the listing list? | Product | Scope of `ListingMarker` component |

---

## Out of Scope

- **Listing creation form updates** to capture `latitude`/`longitude` at submission time.
- **Geocoding backfill job** for existing listings that have no coordinates.
- **Pin clustering** for dense result sets.
- **Mobile / responsive map layout** (collapsible panel, drawer pattern).
- **Map-driven search** ("search as I move the map" behaviour).
- **Saved listings or trip planning** features surfaced on the map.
- **Custom map themes or Airbnb-branded pin icons** (default Google Maps markers are acceptable for v1).