# Troubleshooting

## No results / empty map

Empty results almost always mean the **filter combination is too strict**, not that data is missing:

1. Check the **filter chips** under the header — each chip is an active constraint. Remove the most restrictive ones first (budget, remaining lease, MRT distance).
2. Watch for combinations that quietly exclude everything, e.g. a low budget **plus** a long remaining-lease minimum, or a small town **plus** a rare flat model.
3. A narrow **latest-sale range** hides blocks whose most recent recorded sale falls outside it — widen it or clear it. With a flat type selected, this uses that type's latest sale.
4. The **CPF-based estimate filter** needs positive local CPF, income, and age inputs. It excludes available cash, grants, other debts, and HFE outcomes; clear it before treating an empty result as a real affordability limit.
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

- The bottom **tab bar** has an explicit **Map** action alongside Filters, Results, Check, and Saved.
- If the header is hidden, look for the **show header** control at the top edge.
- Rotating the device keeps the active panel open and translates it to the desktop or mobile layout.
- Very old browsers/WebViews may not support the map layer — update the browser or use the Results list, which carries the same information.

## Confusing filter behaviour

- Only URL-backed filter chips constrain visible results. Buyer-setup choices for flat type, budget, and lease become those same normal filters; **Reset** clears them. There is no second hidden profile-filter layer.
- Positive local finance inputs make a conservative CPF-based estimate available in Buyer setup and block detail. They constrain Results only when you explicitly enable the CPF-based estimate filter; Buyer setup never silently filters ordinary results. “Above estimate” does not mean “unaffordable.”
- Town selection from the **search bar** and **filter panel** sets the same town filter; the chips row is the source of truth for what is active.
- The **latest recorded sale** range controls block visibility only. It does not recalculate block medians, transaction counts, or trend charts.

## A check found no comparables

Keep the flat type, storey range, and floor area equal to the listing rather than changing facts to force a result. The engine widens from block to street or town automatically when needed, and a caveat states when it did so. If nothing remains comparable, treat that as missing evidence rather than an invitation to guess different unit details.

## Something else is broken

Errors in one panel don't take down the rest of the app — use the **Retry** button in the failed panel. If retry loops, reload the page. State that lives in the URL (filters, selection, check inputs) survives reloads.
