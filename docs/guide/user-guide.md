# HDB Resale Explorer — User Guide

HDB Resale Explorer is a free, buyer-first HDB due-diligence tool for Singapore resale transactions. It pulls official data from data.gov.sg and presents it on an interactive map so you can compare blocks, evaluate asking prices, and shortlist properties — all without creating an account.

> **In-app user guide:** this guide also ships inside the app. On mobile, tap the **?** button in the header; on desktop, use **User guide** in the primary tab bar. You can also open `/docs` directly to browse the same material with section navigation and local search — no need to leave the app. Sections live at `/docs/getting-started`, `/docs/understanding-price-comparisons`, `/docs/filters-and-map`, `/docs/shortlisting`, `/docs/faq`, and `/docs/troubleshooting` (content source: `src/features/docs/content/`).

## Getting started

The app opens directly to a task-first map prompt — no onboarding form blocks the first visit. Choose **Check a listing price**, **use your current location**, or **choose a town**.

For personal recommendations or a conservative CPF-based estimate, open **Filters → Buyer setup**. This optional setup asks for a preferred flat type, optional maximum budget, minimum remaining lease, and optional local-only finance inputs. It never asks for a work address, destination MRT, or commute estimate because the app does not model door-to-door commutes. You can exit from any step and reopen it later.

Flat type, budget, and lease become ordinary URL-backed filters. CPF, income, and age remain in your browser and are not put into shared links.

From the first prompt:

1. Use **Check a listing price** if you already have a specific unit and asking price.
2. **Use your current location** or **choose a town** to browse candidate blocks.
3. Open **Saved** from the primary tab bar when you want to continue a shortlist.

On **desktop** the interface has three zones:

- **Work panel** — one primary destination at a time: Filters, Results, Check, or Saved
- **Centre** — the interactive map
- **Block detail** — replaces Results content when you select a block

On **mobile** a bottom tab bar switches between Filters, Results, Check, Saved, and the Map.

## Searching and filtering

### Quick search

Type an address, block number, street name, town, MRT station, or postal code into the **search bar** in the header. The typeahead suggests matching results across all of these categories. Exact and minor-typo town, street, block, display-name, or postal-code queries use those field matches; broader free text falls back to fuzzy matching. Select a suggestion to jump straight there.

### Filter panel

Open **Filters** to narrow results by:

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

All filters combine — setting Town to "Tampines" and Flat type to "4-Room" shows only 4-Room blocks in Tampines.

**Reset** clears every filter at once.

The **Town-wide overview** is available only for an unrefined town scope. It intentionally summarizes all flat types; once buyer-specific filters are active, results stay in the block list so town-wide and filtered evidence are not mixed.

### Filter chips

Active URL-backed filters appear as **chips** below the header and are the sole source of visible constraints. Remove any chip to clear that filter. You can share a reproducible filter set with the **share icon**; the action is unavailable while local-only affordability filtering is active because CPF, income, and age are never included in URLs.

## Using the map

Blocks appear as **coloured dots** on the map. The colour indicates the median resale price — cooler tones (blue/green) are lower, warmer tones (orange/red) are higher. A **price legend** at the bottom of the map shows the scale.

### Map controls

- **Zoom** — scroll wheel, pinch, or the +/− buttons
- **Pan** — click and drag (or swipe on mobile)
- **Select a block** — click any dot to open its detail drawer
- **Geolocate** — tap the location button to centre the map on your device

### Overlays

Toggle these from the **layer control** on the right side of the map:

- **MRT** — one switch controls both station markers and exit points; detailed markers appear as you zoom in
- **Primary schools** — appears after selecting a block and shows up to three nearby schools

Layer and heatmap controls stay hidden until you choose a location scope. Selecting a result brings that block into view; ordinary map panning and zooming do not dismiss your active work panel.

### Price heatmap

Enable the **heatmap toggle** (also on the right) to see a density overlay of prices across the map. You can adjust its opacity and switch between total-price and per-square-metre modes.

## Viewing block details

Click a block dot on the map (or a row in the Results list) to open the **detail drawer**. It shows:

- **Block address** and town
- **Median resale price** for the selected flat type
- **Block-wide price history** — monthly medians combine every recorded flat type and are labelled separately from the selected-type price
- **Transaction history** — individual transactions with price, floor area, storey range, and date
- **Remaining lease** and lease commencement year
- **Nearest MRT** station with walking time
- **Nearby amenities** — MRT stations, primary schools
- **Comparable blocks** — similar blocks in the area for quick comparison

Use the **bookmark icon** to save the block. Saved comparisons are block-level, so their prices are explicitly labelled as block-wide medians rather than inheriting a temporary flat-type filter.

## Results list

The **Results** tab shows all blocks matching your current filters as a scrollable list. Each row displays the block address, median price, recorded floor-area range, nearest MRT, and remaining lease. When a flat-type filter is active, each row uses that type's recent price median. Floor-area range, record count, latest sale, quality tag, sorting, map popup, and CSV export use the same type cohort when it is available; older rows label any unavailable cohort attributes as block-wide instead of guessing.

### Sorting

Sort by:

- **Price** (low → high or high → low)
- **Remaining lease**
- **MRT proximity**
- **Most recent activity** (blocks with the most recent transactions first)

### Town profile

With an unrefined town scope — a town filter and no other filters — a **Town-wide overview** toggle appears above Results, showing monthly trends, transaction volume, median price per square metre, busiest blocks, and value deals across all flat types. The toggle is hidden once any other filter is active, so town-wide and filtered evidence are not mixed.

You can **compare two towns** side-by-side by selecting a second town from the dropdown.

## Asking-price check

The **Check** tab lets you evaluate a specific listing's asking price against historical resale transaction data.

This is a **deterministic comparison**, not a black-box AI valuation.

- **No AI valuation API** is used.
- The app compares your input to actual recent transactions from the same area and similar units.

1. **Search for the block** — type the address to select it
2. **Enter the asking price** — the listed price from PropertyGuru, 99.co, etc.
3. Enter the listing's actual **floor area**, **flat type**, and **storey range**. These are required so the app never substitutes facts from a different unit.
4. Optionally enter the **lease commencement year**, then choose **Check this listing**.

Selecting a block in global search opens Results immediately. If you then open **Check** and no check is in progress, that block carries over. A check that already has a block keeps it, so facts you have already entered are not silently replaced — use the block search inside **Check** to switch, which clears the previous listing's facts.

The tool returns a **verdict** — whether the asking price is well below, around, or above the median for comparable recent transactions. You will see:

- The difference vs the comparable median, in dollars and in price per square metre
- The **fair range** (the middle half of comparable prices, P25 to P75)
- Where the ask sits as a percentile among the comparables
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

| Column             | Description                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| **Month**          | Transaction month                                                                                   |
| **Block / Street** | Block and street of the comparable unit                                                             |
| **Flat Type**      | e.g. 4 ROOM, 5 ROOM                                                                                 |
| **Storey**         | Storey range of the unit                                                                            |
| **Area**           | Floor area in square metres                                                                         |
| **Lease**          | Lease commencement year                                                                             |
| **Price**          | Time-adjusted resale price when adjustment data is available; otherwise the registered resale price |
| **$/sqm**          | Time-adjusted price per square metre when adjustment data is available; otherwise registered $/sqm  |
| **Orig. Price**    | Registered resale price before time adjustment, shown when adjustment data is available             |
| **Similarity**     | How closely the transaction matches your listing (percentage bar)                                   |
| **Match Reasons**  | Why this transaction was selected (e.g. "Same block", "Same flat type")                             |

Click any sortable column header to re-order the table. The default sort is **similarity descending** — the closest match appears first. Clicking the same header again toggles between ascending and descending.

On **mobile**, transactions appear as cards instead of a table. Pill-shaped sort buttons at the top let you change the sort order by tapping; when time adjustment is applied, each card shows the original registered price under the primary adjusted price.

#### "Why these comparables?"

Expand this section to see how comparables were selected. The engine picks the most similar recent transactions in the same block. If too few are found, the search widens to the same street or town — the explainer notes this when it happens. Price is never used to select comparables, only to display them.

When fewer than five comparables are available, a low-sample warning appears advising you to treat the assessment as directional only.

You can **save the check to your shortlist** or **share it via URL**. Saving records the seller's asking price; it does not overwrite your buyer target price or notes.

## Shortlist (Saved)

The **Saved** tab holds blocks you have bookmarked. You can save up to 20 blocks.

Saved homes appear first. Sync, export, and sharing are secondary utilities below the decision content. Offer preparation starts collapsed, and comparison highlights appear only when at least two homes can actually be compared.

### Features

- **Side-by-side comparison** — view all saved blocks with their key metrics in a table
- **Decision board** — capture richer shortlist context per block without duplicate offer-ceiling or buyer-notes inputs:
  - asking price
  - fair value range (low/median/high)
  - suggested offer ceiling
  - buyer opening offer
  - valuation, estimated COV, and viewing date
  - decision status (`considering`, `viewing booked`, `offered`, `kiv`, `rejected`, `dropped`)
  - pros, cons, renovation notes, noise notes, transport notes, agent remarks, and buyer notes
- **Comparative decision view** — with at least two available blocks, compare mode includes block-wide median, ask price, fair range, delta vs fair median, recent block-record volume, remaining lease, MRT context, decision status, caveats, target price, and notes. It does not present a stored listing-check verdict.
- **Notes and legacy compatibility** — old saved shortlist entries still load with data preserved.
  Existing `notes` continue to display and are mirrored into the new board where needed.
- **Sort and rank** — recently saved is the default; choose another metric when you have enough data to compare.
- **Safe removal** — removing a saved block shows an **Undo** action for five seconds. Undo restores the same block in its previous position with its asking price, offer fields, status, and notes intact.
- **Export** — download your shortlist as CSV or JSON including offer-board fields and decision notes. Hover over the export button to see its tooltip.
- **Share** — generate a URL to share your shortlist with all shortlist board data (within payload size limits). Hover over the share button to see its tooltip.
- **Unavailable saved addresses** — if an older address is absent from the current block dataset, it remains visible and is still included in exports and share links by saved address key. Buyer-entered fields are preserved while current block-derived fields stay blank.
- **Mobile-friendly compare** — mobile view uses compact cards so all required shortlist metrics remain scannable without horizontal clipping, including the nearest MRT station name with walking time and any buyer notes you have recorded.

### Cloud sync

Your shortlist is stored locally in the browser by default. To sync across devices:

1. Open the **sync panel** in the Saved tab
2. Generate a **sync code** (a short anonymous code — no account needed)
3. Enter the same code on another device to sync

No account, email, or password is required — the sync code is the only identifier. Note that any notes you add to shortlisted blocks are included in the synced data.

## Search profile

A **buyer profile** provides optional ranking and affordability context. Open **Filters → Buyer setup** whenever you want to create or edit it. Setup is skippable at every step and includes:

- **Preferred flat type** (e.g. 4-Room)
- **Maximum budget**
- **Minimum remaining lease**
- **CPF, income, and age** — optional, local-only inputs for a conservative CPF-based estimate

Flat type, budget, and lease are copied into the normal filter system, where they appear as removable chips and are cleared by **Reset**. Positive finance inputs make a conservative estimate available in Buyer setup and block detail. They constrain Results only when you explicitly enable the CPF-based estimate filter. The estimate excludes available cash, grants, other debts, and your HFE outcome, so “above estimate” is not the same as “unaffordable.”

The profile never acts as a second hidden visibility filter, and personal finance data is not included in filter or shortlist share URLs.

## Keyboard shortcuts

- **Escape** — close the current drawer, overlay, or search suggestion dropdown
- **Arrow keys** — navigate search suggestions in the typeahead; switch between price and $/sqm in the heatmap toggle (when focused)
- **Tab** — move focus between interactive elements (standard browser behaviour)

## Data and privacy

- All transaction data comes from [data.gov.sg](https://data.gov.sg) and is refreshed nightly.
- Map tiles and geocoding use [OneMap](https://www.onemap.gov.sg).
- No account is required. Your filters, theme preference, buyer profile, and shortlist are stored in your browser's local storage.
- Cloud sync (optional) uses an anonymous code — no account, email, or password. It uploads the saved board, including any notes you entered, so treat the code like a private link. Local buyer-profile finance inputs are not synced.
- The app works offline as a Progressive Web App (PWA) after the first load.
