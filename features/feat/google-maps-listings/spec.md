# Product Requirements Document

## Google Maps on Listings Page

---

## Problem

Users browsing the `/listings` page are presented with a flat grid of rental cards that provides no spatial context. They cannot assess proximity to landmarks, understand neighbourhood density, or compare the relative locations of multiple listings without manually opening a separate Google Maps tab. This friction is especially acute on mobile, where context-switching between apps is disruptive and increases drop-off before a booking decision is made.

---

## Goals

1. **Reduce context-switching** — eliminate the need for users to open a separate map application during listing browsing, measurable by a reduction in external Google Maps referral exits from `/listings`.
2. **Increase listing engagement** — users who interact with the map view click through to at least one listing detail page at a rate ≥ the current grid-only baseline.
3. **Render all geo-located listings** — 100% of listings that have non-null `lat`/`lng` values appear as pins on the map within the same filter state as the grid.
4. **Maintain page performance** — the map integration does not degrade initial page load; Largest Contentful Paint (LCP) on `/listings` remains within ±10% of the pre-map baseline.
5. **Preserve filter coherence** — map pins and grid cards always reflect the same filtered result set; no divergence between the two views.

---

## Non-Goals

- **Search-on-map-move** (panning/zooming the map does NOT re-query listings in this release).
- **Marker clustering** for high-density zones is not included.
- **Street View** integration is not included.
- **Saved/favourited location pins** or any personalisation layer on the map.
- **Mobile-specific map-only view** or full-screen map mode — the layout is responsive but not a dedicated mobile experience.
- **Server-side map rendering** — the map component is client-side only.

---

## User Stories

#PersonaActionBenefit1Browsing guestI want to see a map alongside the listings grid so that I can understand where each rental is located without leaving the page.2Browsing guestI want to click a map pin and see a summary card for that listing so that I can quickly assess it before opening the full detail page.3Browsing guestI want the map to highlight the pin of a listing when I hover over its grid card so that I can correlate grid cards with map positions easily.4Browsing guest (mobile)I want to toggle between grid view and map view so that I can use the map without sacrificing the full screen to both panels simultaneously.5Browsing guestI want the map pins to update when I apply filters so that the map always reflects the current result set.

---

## Acceptance Criteria

### Map Rendering

- \[ \] The `/listings` page renders a `GoogleMap` component (via `@react-google-maps/api`) loaded with `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- \[ \] The map is wrapped in a **Client Component** (`"use client"`) to satisfy Next.js App Router constraints; listing data is passed down as props from the existing Server Component fetch.
- \[ \] The map auto-fits its bounds to encompass all visible pins on initial load and after each filter change.
- \[ \] If zero listings are returned (empty filter state), the map displays a default viewport (e.g., world view or last known bounds) without throwing an error.

### Pins & Data Coherence

- \[ \] Every listing with non-null `lat` and `lng` in the current filtered result set renders exactly one `<Marker>` on the map.
- \[ \] Listings with `lat = null` or `lng = null` are silently excluded from the map (no error, no broken pin).
- \[ \] Pin count on the map always equals the count of listing cards in the grid for the same filter state.

### Interactivity — Info Window

- \[ \] Clicking a pin opens a Google Maps `<InfoWindow>` anchored to that marker.
- \[ \] The `InfoWindow` displays: listing `title`, `city`, `price_per_night` (formatted as currency), and the first image from `photos[]` (or a placeholder if `photos[]` is empty).
- \[ \] The `InfoWindow` contains a "View listing" link that navigates to `/listings/[id]`.
- \[ \] Only one `InfoWindow` is open at a time; opening a second pin closes the first.
- \[ \] Clicking the map outside any pin closes any open `InfoWindow`.

### Hover Correlation (Grid ↔ Map)

- \[ \] Hovering a listing card in the grid visually distinguishes (e.g., colour change or scale) the corresponding map pin.
- \[ \] Un-hovering the card returns the pin to its default state.

### Mobile Toggle

- \[ \] On viewports `< 768px`, the page renders a toggle control with two states: **"Grid"** and **"Map"**.
- \[ \] Default state on mobile is **"Grid"**.
- \[ \] Switching to **"Map"** hides the grid and renders the map full-width; switching back restores the grid.
- \[ \] On viewports `≥ 768px`, both the grid and map are displayed simultaneously (e.g., 50/50 or sidebar layout).

### Performance & Error Handling

- \[ \] The Google Maps script is loaded lazily (not blocking initial render); a loading skeleton or spinner is shown while the map initialises.
- \[ \] If the Maps API fails to load (e.g., invalid key, network error), the page degrades gracefully — the grid remains fully functional and an inline error message replaces the map panel.
- \[ \] No unhandled promise rejections or console errors are introduced on the `/listings` route.

---

## Data Model

\[truncated\]