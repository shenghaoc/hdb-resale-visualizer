# Troubleshooting

## No results / empty map

Empty results almost always mean the **filter combination is too strict**, not that data is missing:

1. Check the **filter chips** under the header — each chip is an active constraint. Remove the most restrictive ones first (budget, remaining lease, MRT distance).
2. Watch for combinations that quietly exclude everything, e.g. a low budget **plus** a long remaining-lease minimum, or a small town **plus** a rare flat model.
3. A narrow **date range** hides blocks whose transactions fall outside it — widen it or clear it.
4. The **affordability filter** needs a search profile; with a tight budget profile it can exclude every block. Use its "clear" button in the empty state.
5. Still nothing? Press **Reset** in the filter panel and reapply filters one at a time to find the culprit.

The map only shows block markers once a location scope is set — pick a town, search, or use your location first.

## Data failed to load

If you see "Static data missing" or a load error:

- Check your connection and **reload** the page.
- If you are on a flaky network, the app may have cached a partial state — a reload usually recovers it.
- If the error persists, the data service itself may be down; try again later. The app never falls back to made-up data.
- Developers running locally: the API needs the full-stack dev server (`pnpm dev:functions`), not the UI-only one.

## Stale data or stale cache

- The dataset updates **nightly**; the latest transaction month is shown in the header. A sale from this week will not appear yet.
- The app is a PWA and caches aggressively for offline use. If the header date looks older than it should: reload once (the service worker updates itself), or close all tabs of the app and reopen.
- As a last resort, clear the site's data in your browser settings. **Warning:** this also deletes a local-only shortlist — generate a [sync code](/docs/shortlisting) first.

## A "Stale data" badge on a price check

That badge means the newest _comparable transaction_ is over 12 months old — the data pipeline is fine, the block just has thin recent activity. Treat the verdict as directional; see [Understanding price comparisons](/docs/understanding-price-comparisons).

## Mobile layout issues

- The bottom **tab bar** switches views; the map is shown when no tab is active.
- If the header is hidden, look for the **show header** control at the top edge.
- If panels look cramped after rotating the device, switching tabs once re-lays them out.
- Very old browsers/WebViews may not support the map layer — update the browser or use the Results list, which carries the same information.

## Confusing filter behaviour

- Filters and the search profile **combine**. Profile chips (budget, flat type, lease) constrain results even when the filter panel looks empty — remove profile chips below the header if results seem inexplicably narrow.
- Town selection from the **search bar**, the **wizard**, and the **filter panel** all set the same town filter; the chips row is the source of truth for what is active.
- The **date range** affects medians and trends, not just visibility: a short window means fewer transactions and noisier numbers.

## A check found no comparables

The block may have no registered resales for your inputs in the data window. Loosen the optional fields (storey, floor area), or widen the date range. If the engine had to widen the search to street or town, a caveat will say so.

## Something else is broken

Errors in one panel don't take down the rest of the app — use the **Retry** button in the failed panel. If retry loops, reload the page. State that lives in the URL (filters, selection, check inputs) survives reloads.
