# Shortlisting

The **Saved** tab holds blocks you bookmarked — up to **20**. Saved homes appear before sync, export, and other secondary utilities. Save a block with the bookmark icon in the detail drawer or a results row, or save a listing check directly from the Check tab. A saved check records the seller's asking price without overwriting your buyer target price or notes.

## Decision board

Each saved block can carry richer context for your decision:

- asking price and a fair value range (low / median / high)
- suggested offer ceiling and your opening offer
- valuation, estimated COV, and viewing date
- decision status — `considering`, `viewing booked`, `offered`, `kiv`, `rejected`, `dropped`
- pros, cons, renovation notes, noise notes, transport notes, agent remarks, and free-form buyer notes

Offer preparation starts collapsed. Open it only when you are ready; the board exposes one offer-ceiling field and one buyer-notes field rather than duplicate inputs. Comparison highlights appear only when at least two homes can actually be compared, and the default order is recently saved.

Removing a saved block shows an **Undo** action for five seconds. Undo restores the exact saved entry in its previous position, including its asking price, offer fields, decision status, and notes.

## Comparing saved blocks

With at least two available blocks, the **compare view** lays them side by side: block-wide median, asking price, fair range, delta vs fair median, recent block-record volume, remaining lease, MRT context, decision status, caveats, target price, and notes. It does not claim to preserve a past listing-check verdict. On mobile, compact cards keep the same evidence scannable without horizontal scrolling.

## Export and share

- **Export** your shortlist as CSV or JSON, including decision-board fields and notes. Hover over (or focus) the export button to see its tooltip.
- **Share** generates a URL carrying the shortlist data (within size limits) so someone else can open the same board. Hover over (or focus) the share button to see its tooltip.
- If an older saved address is no longer present in the current block dataset, exports and share links still include its saved address key and buyer-entered fields. Current block-derived fields are left blank instead of dropping the entry.

## Cloud sync (optional)

The shortlist lives in your browser by default and works fully offline. To use it across devices:

1. Open the **sync panel** in the Saved tab.
2. Generate a **sync code** — a short anonymous code, no account or email.
3. Enter the same code on another device.

The sync code is the only identifier; anyone who has it can read the shortlist, so treat it like a private link. Notes you add to saved blocks are included in synced data.

## Things to keep in mind

- Block metrics, nearby amenities, and factual data-quality labels refresh from the current dataset when Saved loads; your manually entered offer fields and notes remain as entered. Re-run a listing check before making an offer — see [Understanding price comparisons](/docs/understanding-price-comparisons).
- Clearing browser site data deletes a local-only shortlist. Generate a sync code first if you want to keep it.
