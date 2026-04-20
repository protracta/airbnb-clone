# Product Requirements Document
## Feature: Google Maps on Listings Page

---

## Problem

Users browsing the listings search page currently have no spatial context for search results — they cannot see where listings are located relative to each other or to their searched destination. This forces users to mentally map individual listing cards, degrading decision-making quality and reducing confidence in booking choices. The app already has `@react-google-maps/api` installed and a `locationValue` search param in place, but the map integration has not been implemented.

---

## Goals

1. **Spatial visibility** — 100% of listings returned by a search query are represented as pins on a rendered Google Map on the listings page.
2. **Search-map coherence** — The map viewport automatically centers and zooms to match the `locationValue` search param on every search, with no manual user adjustment required.
3. **Listing-pin linkage** — Clicking a map pin surfaces the associated listing's key details (e.g. title, price, thumbnail) without requiring a full page navigation.
4. **Filter responsiveness** — The map re-renders visible pins within ≤500ms whenever `guestCount` or `roomCount` filters change, reflecting only the filtered result set.
5. **No regression** — Existing listing card functionality, search param behaviour, and API response times are unaffected by the map addition (measured by existing test suite passing and `/api/listings` p95 latency unchanged).

---

## Non-Goals

- Drawing custom geographic search boundaries by dragging the map (i.e. "search as I move the map" behaviour).
- Replacing or redesigning the existing listing card grid layout.
- Building a native mobile map experience — this release targets the web viewport only.
- Offline or cached map tile support.
- Any changes to the authentication, booking, or payment flows.

---

## User Stories

1. **As a guest searching for accommodation**, I want to see all search results plotted on a map so that I can understand the geographic spread of available listings before choosing one.
2. **As a guest**, I want the map to automatically centre on my searched location so that I do not have to manually pan to the right area.
3. **As a guest**, I want to click a pin on the map and see a summary of that listing (price per night, title, thumbnail) so that I can quickly evaluate options without leaving the search page.
4. **As a guest**, I want the map pins to update when I change guest or room count filters so that I only see pins for listings that actually match my requirements.
5. **As a guest on a smaller laptop screen**, I want the map and listing cards to be visible at the same time (split-layout) so that I can cross-reference a pin with its card without scrolling back and forth.

---

## Acceptance Criteria

### Map Rendering
- [ ] A Google Map renders on the listings search page (`/` or equivalent search route) on every page load where at least one listing is returned.
- [ ] The map is rendered using `@react-google-maps/api` and is initialised with a valid API key sourced from an environment variable (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`). The key is never exposed in server logs or committed to source control.
- [ ] If zero listings match the current search, the map renders centred on the `locationValue` location with a visible empty-state message on the card panel (e.g. "No listings found in this area").
- [ ] If `locationValue` is absent or unresolvable, the map renders at a sensible default viewport (e.g. world view, zoom level 2).

### Pin Behaviour
- [ ] Every listing returned by `/api/listings` for the current search params is represented by exactly one pin on the map.
- [ ] Each pin encodes the listing's price per night as a label (e.g. `$120`).
- [ ] Hovering over a listing card highlights the corresponding map pin (e.g. colour change from default to accent), and vice-versa — hovering a pin highlights the corresponding card.
- [ ] Clicking a pin opens an info overlay/popover anchored to the pin, containing: listing thumbnail image, title, price per night, and a "View listing" link navigating to `/listings/[id]`.
- [ ] Only one info overlay is open at a time; opening a second pin closes the first.

### Filtering & Search Coherence
- [ ] When `locationValue` changes (new search submitted), the map re-centres and re-zooms to fit the new location within one render cycle.
- [ ] When `guestCount` or `roomCount` filter values change, the visible pins update to reflect the new filtered listing set without a full page reload.
- [ ] Map viewport does not reset to default when only filters change (i.e. location pan/zoom is preserved across filter updates).

### Layout
- [ ] On viewports ≥1024px, the listings card grid and the map are displayed side-by-side (split layout), each occupying approximately 50% of the available width, with the map sticky/fixed in the viewport while cards scroll.
- [ ] On viewports <1024px, the map is hidden by default with a visible toggle (e.g. "Show map" button) allowing the user to switch between card view and map view.
- [ ] The map container has an explicit height (minimum 400px on desktop) so it never collapses to zero.

### Data Integrity
- [ ] All listings rendered as pins have valid `latitude` and `longitude` values; listings with null coordinates are excluded from the map silently (no runtime error).
- [ ] The `/api/listings` response is the single source of truth for pins — no separate geocoding API call is made at render time for standard searches.

### Performance & Error Handling
- [ ] If the Google Maps script fails to load (e.g. invalid API key, network error), a non-breaking fallback message is displayed in the map container ("Map unavailable") and listing cards remain fully functional.
- [ ] Pin re-render on filter change completes in ≤500ms under a result set of ≤100 listings on a standard broadband connection.
- [ ] No TypeScript type errors are introduced; all new components are fully typed.

---

## Solution Design

### Component Architecture

```
app/
└── (search)/
    └── page.tsx                  ← Orchestrates split layout, passes listings to both panels
components/
├── listings/
│   ├── ListingsMap.tsx           ← New: wraps GoogleMap, renders ListingMarker per listing
│   └── ListingMarker.tsx         ← New: individual marker + InfoWindow logic
│   └── ListingCard.tsx           ← Existing: receives `isHighlighted` prop (new)
└── shared/
    └── MapToggle.tsx             ← New: mobile show/hide map button
```

**`ListingsMap` responsibilities:**
- Accepts `listings: SafeListing[]` and `center: LatLng` as props.
- Initialises `<GoogleMap>` with `mapContainerStyle`, `center`, and `zoom` derived from `locationValue`.
- Manages `hoveredListingId: string | null` and `activeMarkerId: string | null` in local state.
- Exposes `onHover` and `onMarkerClick` callbacks consumed by `ListingMarker`.

**`ListingMarker` responsibilities:**
- Renders a `<Marker>` or `<OverlayView>` for price-label pins.
- Conditionally renders `<InfoWindow>` when `activeMarkerId === listing.id`.
- Applies highlight styling when `hoveredListingId === listing.id`.

**State sharing (hover sync):**
Lift `hoveredListingId` to the search page and pass it down to both `ListingCard` (as `isHighlighted`) and `ListingsMap`. Use a `useCallback`-memoised setter to avoid unnecessary re-renders.

### API Contract

No new API endpoints are required. The existing `/api/listings` endpoint must return `latitude` and `longitude` fields per listing. Verify these fields are currently included in the Prisma select; if not, they must be added (see Data Model section).

### Location Resolution

`locationValue` (e.g. `"London, UK"`) must be converted to a `{ lat, lng }` centre point for the map. Recommended approach: use a lightweight country/city lookup library already common in Airbnb clone implementations (e.g. `world-countries` + a custom `useCountries` hook) to resolve `locationValue` to coordinates at the component level — **avoiding a runtime Geocoding API call** per render.

```ts
// hooks/useCountries.ts (extend existing or create)
const getByValue = (value: string): { latlng: [number, number] } | undefined
```

The returned `latlng[0], latlng[1]` becomes the map `center`.

---

## Data Model

### Listings Table — Coordinate Fields

The `Listing` model in `schema.prisma` must expose geographic coordinates. Add the following fields if not already present:

```prisma
model Listing {
  // ... existing fields ...

  latitude   Float?   // WGS-84 decimal degrees
  longitude  Float?   // WGS-84 decimal degrees
}
```

**Notes:**
- Fields are nullable (`Float?`) to avoid breaking existing listings that pre-date this feature and have no coordinate data.
- A follow-up data migration / backfill task should populate coordinates for existing listings (out of scope for this release — see Out of Scope).
- The Prisma `SafeListing` type alias used across the app must be regenerated after schema change (`npx prisma generate`).

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Yes | Google Maps JavaScript API key. Restrict to HTTP referrers in GCP Console. |

---

## Edge Cases

| Scenario | Expected Behaviour |
|---|---|
| Listing has `null` latitude/longitude | Excluded from map pins silently; card still renders normally. |
| `locationValue` does not resolve to coordinates | Map renders at world-view default (zoom 2, centre `0,0`); no error thrown. |
| All filtered results are off-screen from current viewport | Pins still exist; user must pan to find them. No auto-refit on filter-only change. |
| User rapidly changes filters | Debounce filter-driven re-renders by 150ms to prevent excessive Google Maps re-paint. |
| Google Maps API quota exceeded | `onError` handler on `<LoadScript>` shows "Map unavailable" fallback. Listing cards unaffected. |
| >100 listings in result set | Accepted as out of scope for performance optimisation in this release; log a warning in dev mode. |
| Two listings share identical coordinates | Both pins render stacked; no special clustering logic in this release. |

---

## Open Questions

1. **Coordinate data source** — Do existing `Listing` records in the database already store `latitude`/`longitude`, or must they be added and backfilled? If backfill is needed, what is the acceptable timeline and mechanism (Geocoding API batch job vs. manual entry)?
2. **`locationValue` format** — Is `locationValue` always a country code, a city name, or a free-text string? The resolution strategy (lookup library vs. Geocoding API) depends on this. Needs confirmation from the existing `useCountries` hook implementation.
3. **Pin design** — Has design signed off on the price-label pin style? If a custom `OverlayView` is used instead of the default Google Maps `Marker`, the implementation complexity increases. Default markers are assumed unless design provides specs.
4. **API key restrictions** — Who owns the Google Cloud project and manages API key rotation? A process for secret management in the CI/CD pipeline is needed before shipping to production.
5. **Map on mobile** — The hide-by-default toggle approach on <1024px is assumed. Is there a preferred UX pattern from design (e.g. bottom sheet, tab switch) or is the toggle sufficient for this release?
6. **Listing result cap** — Does `/api/listings` currently paginate or return all matching results? If it returns unbounded results, rendering 500+ pins simultaneously could cause performance issues. Should a cap (e.g. first 100 results) be applied at the API level for map use cases?

---

## Out of Scope

- "Search as I move the map" / bounding-box-based search queries.
- Map pin clustering for dense result sets (e.g. `@googlemaps/markerclusterer`).
- Saved/favourited listing pins with distinct visual treatment.
- Directions or distance calculations between listings and a point of interest.
- Backfilling `latitude`/`longitude` for existing listings without coordinates.
- Street View integration.
- Custom styled map themes (e.g. Airbnb's greyscale map style) — default Google Maps style is acceptable for this release.
- Any changes to `/api/listings` pagination strategy.