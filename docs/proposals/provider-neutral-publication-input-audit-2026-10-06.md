# Canonical publication input audit for the snapshot design

**Existing generated web artifacts are reusable, but a D1/Neon export alone is not a source-complete substitute for the full `HDB_DATA_DIRECTORY` importer contract.** This audit inspects the current web pipeline, D1 migrations and frozen Neon representations. It does not execute or validate the separate C# importer; its full oracle remains the acceptance criterion for the snapshot design.

## Available build outputs

`GeneratedArtifacts`, returned by [buildArtifacts](../../scripts/lib/pipeline.ts), already contains the manifest, ordered block summaries, town grouping, keyed details/comparisons, town × flat-type trends, and optional full normalized comparable transactions. MRT station/exit GeoJSON is built alongside it. Persistent geocode/routing caches are independently staged. The D1 publisher preserves logical transaction multiplicity and integer identity, applies affected-data/field patches, and writes the manifest last.

The frozen Neon prototype stores equivalent normalized transaction facts and JSONB artifacts. Native stage compilation and materialized detail derivations retain approved leaves/unowned siblings and bind old/final documents to digests. That is publication correctness evidence; it is not proof that all original source evidence survives normalization or was ever stored in those JSON extensions.

## Source preservation gaps

| Required evidence                | Current retained representation                                                                                                                           | Gap to preserve before discard                                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source `remaining_lease`         | Input schema accepts it; normalized rows retain a trimmed string or year-based fallback; latest **20** detail transactions retain that presentation value | Both normalized transaction tables omit it. Raw presence/value and fallback provenance cannot be reconstructed for all transactions.                                                  |
| Raw strings / source occurrences | CSV string dictionaries become canonical labels/numbers; stable integer IDs and multiset reconciliation preserve legitimate duplicate **cardinality**     | Original field strings, dataset/file/row identity and raw occurrence provenance are not persisted in the transaction tuple. Comparable conversion excludes unparseable storey ranges. |
| Property evidence                | Five projected property fields enter `PropertyInfo`; the builder uses a map by address and emits selected derived summaries                               | Preserve full raw rows, assertions, duplicates/conflicts and source provenance before schema projection or last-record map selection.                                                 |
| ACRA postal assertions           | OneMap geocode cache selects one result/postal code                                                                                                       | No inspected first-class ACRA assertion/multiplicity/conflict model. A OneMap postal hint cannot establish ACRA evidence or absence of conflicts.                                     |
| Footprint geometry/provenance    | Geocoded block points; point-based MRT/amenity shapes                                                                                                     | No inspected first-class footprint polygon/provenance model. A point cannot substitute for a source building footprint.                                                               |
| Quality / evidence availability  | Manifest IDs/counts/date, build-state digests, raw/context hashes and unresolved records in the staged envelope                                           | These do not replace original source completeness, rejection/fallback/ambiguity records. Missing evidence must remain explicitly unknown.                                             |

Relevant source: [normalization](../../scripts/lib/sync/normalization.ts), [CSV/property schemas](../../scripts/lib/schemas.ts), [comparable conversion and detail cap](../../scripts/lib/pipeline.ts), [D1 transaction schema](../../migrations/0009_transactions_normalize.sql), [Neon benchmark schema](../../scripts/neon-benchmark/schema.sql), [geocode result selection](../../scripts/lib/sync/geocode.ts), [occurrence reconciliation](../../scripts/lib/sync/incremental.ts).

`parseRemainingLease` trims a supplied value and synthesizes a current-year estimate when absent. Do not label that fallback as an original source assertion. `toTransactionRow` omits remaining lease and rejects unsupported storey ranges, while public aggregates can still use those facts. A snapshot containing only `GeneratedArtifacts.transactions` would therefore omit part of the canonical source evidence even though it is sufficient for the existing comparable engine's stored facts.

Property parsing projects five fields; `buildArtifacts` creates `new Map(propertyInfo.map(...))`, selecting one record for duplicate address keys. Retaining that selected summary does not retain all property assertions. Geocoding explicitly takes `results[0]`; its postal value does not preserve an ACRA assertion set or conflict multiplicity.

The frozen staged Neon envelope explicitly labels historical inputs as **retained baseline, not recaptured**, while binding the current raw CSV/context hashes and unresolved occurrences. Its materialized detail stage preserves captured documents plus approved patches. This is intentionally bounded migration/publication evidence, not a guarantee of full historical raw-source coverage. Unknown JSON extension fields were not queried; their presence or absence in remote rows is unverified.

## Eventual provider-neutral output hook — design only

The useful existing boundary is the accepted input/build result **before** `writeArtifactsToD1` or Neon native-stage compilation. A future pure build-output hook can be named:

```text
emitPublicationSnapshot({
  canonicalSourcePack,
  generatedArtifacts,
  mrtGeoJson,
  publicationIdentity
})
```

`canonicalSourcePack` is a proposed input, not an existing implementation. It must retain authoritative raw evidence **before** `normalizeResaleRows`, `normalizePropertyRows` or `toTransactionRow` discards information: exact source bytes/hash and identity, raw per-occurrence strings, property assertions, authoritative ACRA and footprint evidence, and explicit quality/missing/conflict status. Those sources must follow the canonical importer contract; absent D1 evidence must never be fabricated from OneMap.

The output hook should consume accepted canonical inputs and existing generated outputs without depending on a D1/Neon client. Publication identity must cover both evidence and derived artifacts. Keep stable transaction identity/multiplicity, affected-set reconciliation, manifest-last publication, staged caches and field preservation unchanged. This proposal introduces no runtime abstraction, publisher edit, source fetch, migration or deployment.

Acceptance still requires the **full C# importer oracle**, including duplicate multiplicity, raw remaining lease, all property/ACRA assertions and conflicts, exact footprint provenance/geometry, quality and missing-evidence behavior. A count/hash of normalized database facts alone is insufficient. This document supplies the web-side preservation audit; the separate snapshot design owns the actual importer contract and tests.

Evidence is included in [the diagnostic JSON](../evidence/api-v2-manifest-diagnostic-2026-10-06.json). All analysis is read-only; no database query or publication was performed for this audit.

## Verified source recovery supplement

The subsequent [Search authentication/source recovery](onemap-search-auth-source-recovery-2026-10-06.md) verifies all five resale CSV headers and exact raw pins. `remaining_lease` is **absent** in the 1990–1999, 2000–February 2012 and March 2012–December 2014 files. It is **present with zero blank cells** in the 37,153-row 2015–2016 file and both separately pinned 241,920-row current Web/Qt 2017-onward files. Header omission must remain distinct from a present blank value; CSV parsing and raw validation tests preserve both states.

All 37,153 supplied lease cells in the 2015–2016 source are raw bare-integer strings. Preserve them verbatim; do not append units or use the Web fallback to alter the Qt oracle. The parent/Qt task confirms these are invalid under its unchanged years/months grammar and retain a null derived lease.

Four newly captured historical partition bodies plus the retained Web active file provide 988,123 current raw rows, not byte-identity proof of the August production corpus or approval to change the Qt M11 oracle. The original Web active delivery receipt still lacks its original HTTP headers. Six retained context bodies match their receipt hashes/row counts, and their ordered CSV headers were recovered without another download.

The parent/Qt recovery also supplies separately verified property, ACRA B and historical OneMap sidecar pins. These improve available raw evidence; they do not turn the existing normalized database schema into a complete source oracle. The other 26 ACRA partitions, expanded postal projection and exact footprint/provenance acceptance remain owned by the separate Qt recovery and full importer oracle. No database publisher or snapshot emitter was changed by this supplement.
