# Design: UX Evidence and Control Coherence

## Suggestion State

`SearchCombobox` treats the immediate controlled input as authoritative. It
commits an async response only when both its request sequence and query still
match. Selecting a suggestion suppresses follow-up fetching and visibility for
the resulting controlled value; a real input edit clears that suppression.
Listing Check narrows the shared combobox to the block group it can select.

## Detail Fallback

`useBlockDetailController` derives `currentSummary` from loaded detail first
and the filtered-corpus block second. Drawer actions, similar blocks, benchmark
peers, and comparable range all use that same resolved summary, preventing one
open drawer from presenting internally inconsistent availability.

## Independent Benchmark

`rankSimilarBlocks` supports `ignorePriceProximity` for benchmark selection.
The option removes both price and price-per-area terms while preserving town,
flat-type, lease, MRT, and deterministic address-key tie-breaking. The normal
Similar blocks surface keeps the complete similarity score.

## Evidence Labels and Recovery

Trend ranges filter by month distance from the newest observation. History
labels the bounded API rows as shown, Results distinguishes loading from a
finished empty result, money inputs round at the form boundary, and translated
examples stay within the deterministic suggest grammar.
