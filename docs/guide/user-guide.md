# HDB Resale Explorer — User Guide

HDB Resale Explorer is a free, buyer-first HDB due-diligence tool for Singapore resale transactions. It pulls official data from data.gov.sg and presents it on an interactive map so you can compare blocks, evaluate asking prices, and shortlist properties — all without creating an account.

> **In-app user guide:** this guide also ships inside the app. Tap the **?** (User guide) button in the tab bar, or open `/docs` directly, to browse the same material with section navigation and local search — no need to leave the app. Sections live at `/docs/getting-started`, `/docs/understanding-price-comparisons`, `/docs/filters-and-map`, `/docs/shortlisting`, `/docs/faq`, and `/docs/troubleshooting` (content source: `src/features/docs/content/`).

## Getting started

When you first open the app, the first screen is a quick buyer-entry flow so you can start value analysis immediately:

1. **Check a listing price**
2. **Find candidate blocks**
3. **Compare my shortlist**

Use **Check a listing price** first if you already have a specific unit in mind. Use location/town search only when you want to scan map-driven candidates first.

The map remains available for map-first discovery, and you can still **use your current location** or **choose a town** to scope the map and filters.

On **desktop** the interface has three zones:

- **Left panel** — tabs for Filters, Results, Check, and your Saved list
- **Centre** — the interactive map
- **Right side** — block detail drawer (appears when you select a block)

On **mobile** a bottom tab bar switches between Filters, Results, Check, Saved, and the Map.

## Searching and filtering

### Quick search

Type an address, block number, street name, town, MRT station, or postal code into the **search bar** in the header. The typeahead suggests matching results across all of these categories — select one to jump straight there.

### Filter panel

Open **Filters** to narrow results by:

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

All filters combine — setting Town to "Tampines" and Flat type to "4-Room" shows only 4-Room blocks in Tampines.

**Reset** clears every filter at once.

### Filter chips

Active filters appear as **chips** below the header. Remove any chip to clear that single filter. You can also share your current filter set by tapping the **share icon** next to the chips. Hover over (or focus) any icon-only button to see a tooltip describing its action.

## Using the map

Blocks appear as **coloured dots** on the map. The colour indicates the median resale price — cooler tones (blue/green) are lower, warmer tones (orange/red) are higher. A **price legend** at the bottom of the map shows the scale.

### Map controls

- **Zoom** — scroll wheel, pinch, or the +/− buttons
- **Pan** — click and drag (or swipe on mobile)
- **Select a block** — click any dot to open its detail drawer
- **Geolocate** — tap the location button to centre the map on your device

### Overlays

Toggle these from the **layer control** on the right side of the map:

- **MRT stations** — shows station markers so you can judge proximity
- **MRT exits** — individual exit points for finer-grained walking-time estimates
- **Primary schools** — appears after selecting a block; shows nearby schools

### Price heatmap

Enable the **heatmap toggle** (also on the right) to see a density overlay of prices across the map. You can adjust its opacity and switch between total-price and per-square-metre modes.

## Viewing block details

Click a block dot on the map (or a row in the Results list) to open the **detail drawer**. It shows:

- **Block address** and town
- **Median resale price** for the selected flat type
- **Transaction history** — individual transactions with price, floor area, storey range, and date
- **Remaining lease** and lease commencement year
- **Nearest MRT** station with walking time
- **Nearby amenities** — MRT stations, primary schools
- **Comparable blocks** — similar blocks in the area for quick comparison

Use the **bookmark icon** to save the block to your shortlist.

## Results list

The **Results** tab shows all blocks matching your current filters as a scrollable list. Each row displays the block address, median price, flat types available, nearest MRT, and remaining lease.

### Sorting

Sort by:

- **Price** (low → high or high → low)
- **Remaining lease**
- **MRT proximity**
- **Most recent activity** (blocks with the most recent transactions first)
- **Affordability score** (when a search profile is active)

### Town profile

When a town filter is active, a **town profile card** appears at the top of Results showing monthly trends, transaction volume, median price per square metre, busiest blocks, and value deals.

You can **compare two towns** side-by-side by selecting a second town from the dropdown.

## Asking-price check

The **Check** tab lets you evaluate a specific listing's asking price against historical resale transaction data.

This is a **deterministic comparison**, not a black-box AI valuation.

- **No AI valuation API** is used.
- The app compares your input to actual recent transactions from the same area and similar units.

1. **Search for the block** — type the address to select it
2. **Enter the asking price** — the listed price from PropertyGuru, 99.co, etc.
3. Optionally enter **floor area**, **flat type**, **storey range**, and **lease year** for a more precise comparison

If you have no block selected, you can use the sample path:

4. **Try sample listing check** — pre-fills a known public sample block so you can see the same comparison flow without manually entering everything first.

The tool returns a **verdict** — whether the asking price is well below, around, or above the median for comparable recent transactions. You will see:

- A percentage comparison to the median
- The transaction range (lowest to highest recent price)
- Number of comparable transactions used

### Confidence and caveats

Each result shows a **confidence badge** (High / Medium / Low) indicating how reliable the assessment is. Confidence is based on four signals: sample size, data recency, geographic scope (proportion of comparables from the same block, street, or town), and match quality (flat type, floor area, storey).

A **data quality badge** appears alongside the confidence badge to summarise the comparable set:

| Badge                   | Meaning                                                    |
| ----------------------- | ---------------------------------------------------------- |
| **Strong data**         | Recent block-level evidence with a good sample size        |
| **Weak data**           | Low sample size or low confidence                          |
| **Widened comparables** | Search was expanded beyond the block to the street or town |
| **Stale data**          | The most recent comparable is over 12 months old           |

Below the verdict, **caveats** highlight data limitations that may affect reliability — for example, a small sample size, stale data, or a wide geographic search. These help you judge how much weight to put on the result.

Comparable prices are **time-adjusted** to the latest data month by default so older transactions are compared on a like-for-like basis. A caveat notes when the adjustment was applied, and — when a town/flat type has no usable price trend — a caveat tells you raw (unadjusted) prices are shown instead.

The header bar shows the latest transaction month in the dataset and, when available, the sync timestamp and data source attribution (including the data.gov.sg collection identifier). When provenance metadata is missing or only partially present, the header says so explicitly rather than showing nothing.

### Comparable evidence table

Below the verdict, a **comparable evidence table** shows every transaction used to reach the verdict. Each row includes:

| Column             | Description                                                             |
| ------------------ | ----------------------------------------------------------------------- |
| **Month**          | Transaction month                                                       |
| **Block / Street** | Block and street of the comparable unit                                 |
| **Flat Type**      | e.g. 4 ROOM, 5 ROOM                                                     |
| **Storey**         | Storey range of the unit                                                |
| **Area**           | Floor area in square metres                                             |
| **Lease**          | Lease commencement year                                                 |
| **Price**          | Resale price                                                            |
| **$/sqm**          | Price per square metre                                                  |
| **Adj. Price**     | Time-adjusted price (shown when adjustment data is available)           |
| **Similarity**     | How closely the transaction matches your listing (percentage bar)       |
| **Match Reasons**  | Why this transaction was selected (e.g. "Same block", "Same flat type") |

Click any sortable column header to re-order the table. The default sort is **similarity descending** — the closest match appears first. Clicking the same header again toggles between ascending and descending.

On **mobile**, transactions appear as cards instead of a table. Pill-shaped sort buttons at the top let you change the sort order by tapping.

#### "Why these comparables?"

Expand this section to see how comparables were selected. The engine picks the most similar recent transactions in the same block. If too few are found, the search widens to the same street or town — the explainer notes this when it happens. Price is never used to select comparables, only to display them.

When fewer than five comparables are available, a low-sample warning appears advising you to treat the assessment as directional only.

You can **save the check to your shortlist** or **share it via URL**.

## Shortlist (Saved)

The **Saved** tab holds blocks you have bookmarked. You can save up to 20 blocks.

### Features

- **Side-by-side comparison** — view all saved blocks with their key metrics in a table
- **Decision board** — capture richer shortlist context per block:
  - asking price
  - fair value range (low/median/high)
  - suggested offer ceiling
  - buyer opening offer
  - valuation, estimated COV, and viewing date
  - decision status (`considering`, `viewing booked`, `offered`, `kiv`, `rejected`, `dropped`)
  - pros, cons, renovation notes, noise notes, transport notes, agent remarks, and buyer notes
- **Comparative decision view** — the compare mode now includes the shortlist’s ask price, fair range, delta vs fair median, remaining lease, MRT context, confidence, caveats, and monthly payment placeholder when available.
- **Notes and legacy compatibility** — old saved shortlist entries still load with data preserved.
  Existing `notes` continue to display and are mirrored into the new board where needed.
- **Sort and rank** — order saved blocks by your preferred metric; decision status is included as a tie-break in ranking.
- **Export** — download your shortlist as CSV or JSON including offer-board fields and decision notes. Hover over the export button to see its tooltip.
- **Share** — generate a URL to share your shortlist with all shortlist board data (within payload size limits). Hover over the share button to see its tooltip.
- **Mobile-friendly compare** — mobile view uses compact cards so all required shortlist metrics remain scannable without horizontal clipping, including the nearest MRT station name with walking time and any buyer notes you have recorded.

### Cloud sync

Your shortlist is stored locally in the browser by default. To sync across devices:

1. Open the **sync panel** in the Saved tab
2. Generate a **sync code** (a short anonymous code — no account needed)
3. Enter the same code on another device to sync

No account, email, or password is required — the sync code is the only identifier. Note that any notes you add to shortlisted blocks are included in the synced data.

## Search profile

A **search profile** lets the app personalise results to your situation. When you first visit, a wizard offers to set one up (you can skip it). The profile includes:

- **Preferred flat type** (e.g. 4-Room)
- **Budget range**
- **Commute destination** — an MRT station you commute to
- **Minimum remaining lease** — based on your age or preference
- **CPF and income** — for affordability estimates

With a profile active, the app shows **affordability scores** on each block and can recommend towns that best match your criteria.

Profile chips appear alongside filter chips. Remove any chip to disable that part of the profile.

## Keyboard shortcuts

- **Escape** — close the current drawer, overlay, or search suggestion dropdown
- **Arrow keys** — navigate search suggestions in the typeahead; switch between price and $/sqm in the heatmap toggle (when focused)
- **Tab** — move focus between interactive elements (standard browser behaviour)

## Data and privacy

- All transaction data comes from [data.gov.sg](https://data.gov.sg) and is refreshed nightly.
- Map tiles and geocoding use [OneMap](https://www.onemap.gov.sg).
- No account is required. Your filters, theme preference, and shortlist are stored in your browser's local storage.
- Cloud sync (optional) uses an anonymous code — no email, no password, no personal data on the server.
- The app works offline as a Progressive Web App (PWA) after the first load.
