# Bugfix Requirements: UX Evidence and Control Coherence

## Introduction

This bugfix removes buyer-facing controls and evidence states that contradict
the action, data basis, or time range they claim to represent.

## Current Behavior and Root Causes

1. Listing Check rendered suggestion groups that its selection handler could
   not use.
2. Search suggestions could reopen after selection or remain selectable after
   the controlled query changed.
3. The block drawer's Save state depended on a filter-resolved block even
   though loaded detail keeps the drawer open after that block leaves the
   filtered corpus.
4. Similar-block and comparable-range evidence disappeared in the same
   detail-fallback state.
5. Comparable-range peers were selected partly by price proximity, making the
   subsequent price comparison circular.
6. Trend range buttons counted populated rows instead of calendar months.
7. History described a capped recent-transaction response as the total.
8. Empty results rendered a no-match conclusion while block data was loading.
9. Buyer setup accepted fractional dollar inputs but persisted whole dollars.
10. Chinese block-search guidance used characters the suggest endpoint cannot
    match.

## Expected Behavior

1. Every rendered suggestion SHALL be actionable in its current workflow.
2. Suggestions SHALL correspond to the immediate controlled query; stale
   responses SHALL NOT reopen or repopulate the list, and selection SHALL keep
   the list closed until the buyer edits again.
3. Drawer actions and derived evidence SHALL use the loaded detail summary when
   the filtered corpus no longer contains the selected block.
4. Price benchmark peers SHALL be selected without price or price-per-area
   proximity. Changing only the selected block price SHALL NOT change peer
   selection or the peer price range.
5. Trend labels SHALL describe real calendar spans, and transaction copy SHALL
   distinguish shown rows from total rows.
6. Loading, input rounding, and translated examples SHALL match actual runtime
   behavior.

## Preserved Behavior

- The buyer-facing Similar blocks list may still use price proximity.
- Benchmark values remain deterministic and local to precomputed block data.
- Selection suppression ends as soon as the buyer edits the search field.
- No runtime geocoding or external API request is introduced.
