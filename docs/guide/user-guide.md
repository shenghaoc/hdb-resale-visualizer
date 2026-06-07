# HDB Resale Explorer — User Guide

HDB Resale Explorer is a free, map-based tool for browsing Singapore HDB resale transactions. It pulls official data from data.gov.sg and presents it on an interactive map so you can compare blocks, check asking prices, and shortlist properties — all without creating an account.

## Getting started

When you first open the app you will see a prompt asking you to **use your current location** or **choose a town**. Picking either one scopes the map to that area and loads the matching blocks.

On **desktop** the interface has three zones:

- **Left panel** — tabs for Filters, Results, Check, and your Saved list
- **Centre** — the interactive map
- **Right side** — block detail drawer (appears when you select a block)

On **mobile** a bottom tab bar switches between Filters, Results, Check, Saved, and the Map.

## Searching and filtering

### Quick search

Type an address, block number, or street name into the **search bar** in the header. The typeahead suggests matching blocks and streets — select one to jump straight there.

### Filter panel

Open **Filters** to narrow results by:

| Filter | What it does |
|--------|-------------|
| **Town** | Restrict to a single town (e.g. Tampines, Clementi) |
| **Flat type** | 2-Room, 3-Room, 4-Room, 5-Room, Executive, etc. |
| **Budget** | Set a minimum and/or maximum resale price |
| **Remaining lease** | Only show blocks with at least N years of lease left |
| **MRT proximity** | Filter by walking distance to the nearest MRT station |
| **Date range** | Limit transactions to a specific month window |

All filters combine — setting Town to "Tampines" and Flat type to "4-Room" shows only 4-Room blocks in Tampines.

**Reset** clears every filter at once.

### Filter chips

Active filters appear as **chips** below the header. Remove any chip to clear that single filter. You can also share your current filter set by tapping the **share icon** next to the chips.

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
- **Affordability score** (when a search profile is active)

### Town profile

When a town filter is active, a **town profile card** appears at the top of Results showing monthly trends, transaction volume, median price per square metre, busiest blocks, and value deals.

You can **compare two towns** side-by-side by selecting a second town from the dropdown.

## Asking-price check

The **Check** tab lets you evaluate a specific listing's asking price against real transaction data.

1. **Search for the block** — type the address to select it
2. **Enter the asking price** — the listed price from PropertyGuru, 99.co, etc.
3. Optionally enter **floor area**, **flat type**, **storey range**, and **lease year** for a more precise comparison

The tool returns a **verdict** — whether the asking price is well below, around, or above the median for comparable recent transactions. You will see:

- A percentage comparison to the median
- The transaction range (lowest to highest recent price)
- Number of comparable transactions used

### Time-adjusted prices

Toggle **"Show time-adjusted prices"** to see what older comparable transactions would roughly correspond to at the latest market period. This is **not a price forecast** — it is a mechanical restatement of observed historical data.

When enabled, each comparable shows:
- The original transaction price (strikethrough)
- The adjusted price (bold), computed from town × flat type monthly median prices per square metre
- An adjustment label (e.g. "Adjusted from 2022-03 median")

If trend data is unavailable for a particular comparable, the row shows **"No adjustment data"** instead.

The adjustment is calculated by dividing the latest available town × flat type median price per square metre by the transaction month's median:
`adjustedPrice = rawPrice × (latestMedian ÷ txMonthMedian)`

This helps you understand how an older transaction compares to the latest market period without making a prediction. The default view is raw prices — adjust only when comparing transactions from different years.

You can **save the check to your shortlist** or **share it via URL**.

## Shortlist (Saved)

The **Saved** tab holds blocks you have bookmarked. You can save up to 50 blocks.

### Features

- **Side-by-side comparison** — view all saved blocks with their key metrics in a table
- **Notes** — add personal notes to any saved block
- **Target price** — set a target price for tracking
- **Sort and rank** — order saved blocks by your preferred metric
- **Export** — download your shortlist as CSV or JSON
- **Share** — generate a URL to share your shortlist

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

- **Escape** — close the current drawer or overlay
- **Arrow keys** — navigate within tab bars and lists
- **Tab** — move focus between interactive elements

## Data and privacy

- All transaction data comes from [data.gov.sg](https://data.gov.sg) and is refreshed nightly.
- Map tiles and geocoding use [OneMap](https://www.onemap.gov.sg).
- No account is required. Your filters, theme preference, and shortlist are stored in your browser's local storage.
- Cloud sync (optional) uses an anonymous code — no email, no password, no personal data on the server.
- The app works offline as a Progressive Web App (PWA) after the first load.
