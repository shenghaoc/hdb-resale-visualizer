# Filters, map, and views

## Filter panel

Open **Filters** to narrow results:

| Filter              | What it does                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Town**            | Restrict to a single town (e.g. Tampines, Clementi)                                                                                     |
| **Flat type**       | 2-Room, 3-Room, 4-Room, 5-Room, Executive, etc.                                                                                         |
| **CPF estimate**    | Optionally keep blocks within or near a conservative CPF-based estimate; excludes available cash, grants, other debts, and HFE outcomes |
| **Budget**          | Set a minimum and/or maximum resale price                                                                                               |
| **Remaining lease** | Only show blocks with at least N years of lease left                                                                                    |
| **MRT proximity**   | Filter by maximum stored distance to the nearest MRT station                                                                            |
| **Flat model**      | Narrow to a recorded model; with a flat type selected, the model must occur in that type's recent records                               |
| **Floor area**      | Show blocks whose recorded area range overlaps your size; with a flat type selected, use that type's range                              |
| **Latest sale**     | Filter by the latest recorded sale month for the selected flat type, or for the whole block when no type is selected                    |

Flat type, model, floor area, price, record count, and latest-sale evidence stay on the same recent transaction cohort. Model and area filters confirm recorded evidence, not current unit availability.

All filters **combine** — Town "Tampines" plus Flat type "4-Room" shows only 4-Room blocks in Tampines. If a combination returns nothing, that usually means the filters are too strict together, not that data is missing — see [Troubleshooting](/docs/troubleshooting). **Reset** clears every filter at once.

The **Town-wide overview** is available only for an unrefined town scope. It intentionally summarizes all flat types; once buyer-specific filters are active, results stay in the block list so town-wide and filtered evidence are not mixed.

### Filter chips

Active URL-backed filters appear as **chips** below the header. They are the source of truth for visible constraints: remove a chip to clear that filter, or tap the **share icon** to copy a reproducible filter link. The share action is unavailable while the local-only affordability filter is active because CPF, income, and age are never put into URLs.

## The map

Blocks appear as **coloured dots**. Colour encodes the median resale price — cooler tones (blue/green) are lower, warmer tones (orange/red) are higher. The **price legend** at the bottom shows the scale and whether it is in total price or $/sqm mode.

### Controls

- **Zoom** — scroll wheel, pinch, or the +/− buttons
- **Pan** — drag (or swipe on mobile)
- **Select a block** — click any dot to open its detail drawer
- **Geolocate** — centre the map on your device location

### Overlays

From the **layer control** on the right side of the map:

- **MRT** — one switch controls both station markers and exit points; detailed markers appear as you zoom in
- **Primary schools** — available after selecting a block; shows up to three nearby schools

Layer and heatmap controls stay out of the way until you choose a location scope. Selecting a result brings that block into view; ordinary panning and zooming no longer dismiss your active work panel.

### Price heatmap

The **heatmap toggle** overlays price density across the map. Adjust its opacity and switch between total-price and per-square-metre modes — $/sqm is better for comparing across flat types.

## Results list

The **Results** tab lists every block matching your filters, with address, median price, recorded floor-area range, flat types, nearest MRT, and remaining lease. When a flat-type filter is active, every row uses that type's recent price median. Floor-area range, record count, latest sale, quality tag, sorting, map popup, and CSV export use the same type cohort when it is available; older rows label any unavailable cohort attributes as block-wide instead of guessing. You can also sort by remaining lease, MRT proximity, most recent activity, or a conservative CPF-based estimate (with positive local finance inputs). That estimate excludes available cash, grants, other debts, and HFE outcomes.

## Town profile and charts

With an unrefined town scope, the **Town-wide overview** toggle shows monthly price **trend charts**, transaction volume, median $/sqm, busiest blocks, and value deals across all flat types. It is hidden once buyer-specific filters are active so town-wide and filtered evidence are not mixed. Charts show medians of completed transactions per month — thin months mean fewer sales and noisier lines, so read short-term spikes with care (see [Understanding price comparisons](/docs/understanding-price-comparisons)).

Pick a second town in the dropdown to **compare two towns** side by side.

## Block detail

Selecting a block opens the **detail drawer**: median resale price for the selected flat type, full transaction history (price, floor area, storey range, date), remaining lease and lease commencement year, nearest MRT with walking time, nearby amenities, and comparable blocks. Monthly trend charts are explicitly block-wide because they combine all recorded flat types. The drawer avoids a separate market-rank dashboard: the listing check is the single place for price assessment against comparable transactions. The bookmark icon saves the block to your [shortlist](/docs/shortlisting), where prices are labelled as block-wide medians.
