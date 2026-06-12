# FAQ

## Where does the data come from?

All resale transaction data comes from [data.gov.sg](https://data.gov.sg) (the official HDB resale dataset) and is refreshed nightly. Map tiles, addresses, and walking times use [OneMap](https://www.onemap.gov.sg). The header shows the latest transaction month and, when available, the sync timestamp and collection identifier.

## Is the price check a valuation?

No. It is a deterministic comparison of an asking price against completed resale transactions — see [Understanding price comparisons](/docs/understanding-price-comparisons). It is not a valuation, and the app gives no financial, legal, valuation, property, or purchasing advice.

## Does the app use AI?

No. There is no AI valuation API, no language model, and no third-party AI service. Every number on screen is a reproducible calculation over published data.

## Why doesn't a block I know appear?

Only blocks with resale transactions in the dataset appear. A block may be missing because it has had no resale activity in the data window, it is too new to have resales, or your filters exclude it. Try widening the date range or clearing filters — see [Troubleshooting](/docs/troubleshooting).

## Why is a recent sale I heard about not shown?

Transactions appear only after HDB registers and publishes them, which can lag the actual sale by weeks. The dataset's latest month is shown in the header.

## Why does an asking price differ so much from the transactions shown?

Asking prices are seller hopes; transactions are completed facts. Condition, renovation, exact floor, and timing all matter and are not in the data. A large gap is a prompt to investigate, not a verdict — see the caveats in [Understanding price comparisons](/docs/understanding-price-comparisons).

## Do I need an account?

No. Filters, theme, language, and your shortlist are stored in your browser. The only server-side personal storage is the optional shortlist sync, keyed by an anonymous code you generate — see [Shortlisting](/docs/shortlisting).

## Does it work offline?

Yes, as a Progressive Web App: after the first load, the app shell and previously fetched data are cached. Fresh data needs a connection. If the app seems stuck on old data, see "Stale cache" in [Troubleshooting](/docs/troubleshooting).

## Can I use it in Chinese?

Yes — the language control on the map switches between English and 中文. Guide content is currently in English.

## How do I share what I'm seeing?

Filters, the selected block, listing checks, and the shortlist all have share buttons that produce URLs reproducing your view.
