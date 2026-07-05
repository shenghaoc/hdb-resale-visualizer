# Understanding price comparisons

The **Check** tab compares a listing's asking price against historical resale transactions for the same block — widened to the street or town only when the block alone has too few transactions. It is a **deterministic comparison of published data**, not an AI valuation: no model guesses a price, and price itself is never used to pick the comparables.

## Listing prices vs completed transactions

This is the most important caveat in the whole app:

- An **asking price** is what a seller hopes to get. It comes from a listing portal and may be optimistic, negotiable, or stale.
- A **resale transaction** is a completed sale registered with HDB. It is a fact, but it happened in the past — sometimes many months ago.

The app compares an asking price (a hope) against transactions (facts). A "fair" verdict means the ask is in line with what similar units actually sold for, not that the unit is worth that amount today. Renovation condition, exact floor, facing, and urgency of sale are not in the data.

## Running a check

1. **Search for the block** — type the address to select it.
2. **Enter the asking price** — the listed price from a property portal.
3. Optionally add **floor area**, **flat type**, **storey range**, and **lease commencement year** to tighten the match.
4. No listing handy? **Try sample listing check** pre-fills a known block so you can see the flow.

## Reading the verdict

The verdict states whether the ask is **well below**, **below**, **around**, **above**, or **well above** the median of comparable recent transactions, together with:

- the percentage difference vs the comparable median and peak
- the price range of the comparables (lowest to highest)
- price per square metre for the ask vs the comparable median
- where the ask sits as a percentile among the comparables
- the number of comparable transactions used

## Confidence and data quality

Each result shows a **confidence badge** (High / Medium / Low) based on four signals: sample size, data recency, geographic scope (same block vs street vs town), and match quality (flat type, floor area, storey).

A **data quality badge** summarises the comparable set:

| Badge                   | Meaning                                                    |
| ----------------------- | ---------------------------------------------------------- |
| **Strong data**         | Recent block-level evidence with a good sample size        |
| **Weak data**           | Low sample size or low confidence                          |
| **Widened comparables** | Search was expanded beyond the block to the street or town |
| **Stale data**          | The most recent comparable is over 12 months old           |

**Caveats** below the verdict spell out specific limitations — small sample, stale data, wide geographic search. When fewer than five comparables exist, treat the verdict as directional only.

## Time adjustment

Comparable prices are **time-adjusted** to the latest data month by default, so a sale from a year ago is compared on a like-for-like basis with today's market trend. A caveat notes when the adjustment was applied; when no usable price trend exists for that town and flat type, raw (unadjusted) prices are shown instead and a caveat says so.

## The comparable evidence table

Every transaction behind the verdict is listed with its month, block/street, flat type, storey range, floor area, lease year, price, $/sqm, original price when time adjustment is available, a similarity score, and the match reasons (e.g. "Same block", "Same flat type"). Sort by any column; the default is similarity descending. On mobile, the table becomes cards with sort pills. Expand **"Why these comparables?"** to see how the set was selected.

## Interpreting the numbers

- **Price** — the time-adjusted resale price when adjustment data is available; otherwise the registered resale price. When adjustment is applied, **Orig. Price** shows the registered resale price at the time of the transaction.
- **Floor area** — in square metres, as registered. $/sqm is usually the better basis for comparing different-sized units.
- **Flat type** — 2-Room to Executive. Prices are only meaningful within the same flat type; the app never mixes types in a comparison unless stated.
- **Town** — towns differ structurally in price. A "cheap" price in one town may be expensive in another; town-level comparisons are shown in the town profile.
- **Storey range** — HDB registers a range (e.g. "07 TO 09"), not the exact floor. Higher floors usually transact higher; the similarity score accounts for storey distance.
- **Remaining lease** — HDB flats are 99-year leaseholds. Remaining lease materially affects price, CPF usage, and bank financing — a flat with 60 years left is not comparable to one with 90. Lease warnings appear in the detail drawer when a block's remaining lease may constrain financing or resale. The lease year shown is the **lease commencement year**; remaining lease is computed from it.
- **Transaction history** — individual past sales in the block. A long, recent history makes medians trustworthy; one or two old transactions do not.

## Stale or missing data

- **Stale** means the newest comparable is over 12 months old. The market may have moved since; the time adjustment helps but cannot fully compensate.
- **Missing** values (shown as "—") mean the source data did not include that field, or no transaction matched. The app states what is missing rather than guessing.
- The data window's latest month is shown in the header — if a sale happened last week, it will not be in the dataset yet.

See also [Troubleshooting](/docs/troubleshooting) if a check returns no comparables at all.

> This comparison is an exploratory aid, not a valuation. See the [disclaimer](/docs) before relying on it.
