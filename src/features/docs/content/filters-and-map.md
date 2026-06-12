# Filters, map, and views

## Filter panel

Open **Filters** to narrow results:

| Filter              | What it does                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Town**            | Restrict to a single town (e.g. Tampines, Clementi)                                                                        |
| **Flat type**       | 2-Room, 3-Room, 4-Room, 5-Room, Executive, etc.                                                                            |
| **Affordability**   | Toggle between "All blocks", "Affordable: comfortable", or "Affordable: comfortable + stretch" (requires a search profile) |
| **Budget**          | Set a minimum and/or maximum resale price                                                                                  |
| **Remaining lease** | Only show blocks with at least N years of lease left                                                                       |
| **MRT proximity**   | Filter by walking distance to the nearest MRT station                                                                      |
| **Flat model**      | Narrow to a specific flat model (e.g. Improved, New Generation, DBSS)                                                      |
| **Floor area**      | Set a minimum and/or maximum floor area in square metres                                                                   |
| **Date range**      | Limit transactions to a specific month window                                                                              |

All filters **combine** — Town "Tampines" plus Flat type "4-Room" shows only 4-Room blocks in Tampines. If a combination returns nothing, that usually means the filters are too strict together, not that data is missing — see [Troubleshooting](/docs/troubleshooting). **Reset** clears every filter at once.

### Filter chips

Active filters appear as **chips** below the header. Remove a chip to clear that single filter, or tap the **share icon** to copy a link reproducing your exact filter set. Search-profile chips appear alongside and can be removed the same way.

## The map

Blocks appear as **coloured dots**. Colour encodes the median resale price — cooler tones (blue/green) are lower, warmer tones (orange/red) are higher. The **price legend** at the bottom shows the scale and whether it is in total price or $/sqm mode.

### Controls

- **Zoom** — scroll wheel, pinch, or the +/− buttons
- **Pan** — drag (or swipe on mobile)
- **Select a block** — click any dot to open its detail drawer
- **Geolocate** — centre the map on your device location

### Overlays

From the **layer control** on the right side of the map:

- **MRT stations** — station markers for judging proximity
- **MRT exits** — individual exit points for finer walking-time estimates
- **Primary schools** — available after selecting a block; shows nearby schools

### Price heatmap

The **heatmap toggle** overlays price density across the map. Adjust its opacity and switch between total-price and per-square-metre modes — $/sqm is better for comparing across flat types.

## Results list

The **Results** tab lists every block matching your filters, with address, median price, flat types, nearest MRT, and remaining lease. Sort by price, remaining lease, MRT proximity, most recent activity, or affordability score (with a profile). Results can also be exported as CSV.

## Town profile and charts

With a town filter active, a **town profile card** appears at the top of Results: monthly price **trend charts**, transaction volume, median $/sqm, busiest blocks, and value deals. Charts show medians of completed transactions per month — thin months mean fewer sales and noisier lines, so read short-term spikes with care (see [Understanding price comparisons](/docs/understanding-price-comparisons)).

Pick a second town in the dropdown to **compare two towns** side by side.

## Block detail

Selecting a block opens the **detail drawer**: median resale price for the selected flat type, full transaction history (price, floor area, storey range, date), remaining lease and lease commencement year, nearest MRT with walking time, nearby amenities, and comparable blocks. The bookmark icon saves the block to your [shortlist](/docs/shortlisting).
