# POI ground-truth label proposals (UNAPPROVED)

**Everything in this directory is a proposal. None of it is approved, and nothing may treat it as ground truth.**

An AI agent proposed these labels on 2026-10-10 from small samples of official files it fetched on 2026-10-09 (UTC). They
illustrate the cases that the POI integration rules in the
[POI source admission analysis and spec](https://github.com/shenghaoc/hdb-resale-visualizer/pull/428) have to handle: how two
records of the same kind relate (the same place, the same physical exit, a station and its outline, or different places), and
which evidence class the rules would give each pair. The owner reviews them before any metric uses them.

| File                          | Kind            | Entries |
| ----------------------------- | --------------- | ------: |
| `PROPOSED-mrt_station.json`   | `mrt_station`   |      40 |
| `PROPOSED-mrt_exit.json`      | `mrt_exit`      |      28 |
| `PROPOSED-school.json`        | `school`        |      39 |
| `PROPOSED-supermarket.json`   | `supermarket`   |      19 |
| `PROPOSED-hawker_centre.json` | `hawker_centre` |      38 |
| `PROPOSED-park.json`          | `park`          |      40 |

## Rules while they are unapproved

1. **No test imports these files.** The spec adds a guard test for that; until then it is a rule, not a check.
2. **No precision, recall, false-merge rate or any other accuracy figure is computed against them**, by anyone, for any
   purpose. They are not a random sample: the entries were chosen to show cases, so even after approval they can serve as
   regression tests but cannot estimate a rate.
3. **They do not tune thresholds or rules.**
4. Each file carries `"status": "PROPOSED-UNAPPROVED"` and `"approvedBy": null` in its header, and every entry carries its own
   `proposedRelationHolds` and `proposedClass` for the owner to confirm or correct.

## How the owner approves them

Review the entries kind by kind. Confirm or correct each entry, resolve every `unapproved` entry, then record the approval by
renaming the file to `<kind>.json` (without `PROPOSED-`), setting `"status": "APPROVED"`, and filling in `approvedBy` and
`approvedOn`. The full labelling protocol, including how metrics are later drawn from a separate seeded random sample, is in
`.kiro/specs/poi-source-integration/design.md` (section "Labelling protocol") in PR 428.

## What the files contain

Names, identifiers and coordinates copied from official datasets published under the Singapore Open Data Licence v1.0 (each file
lists its sources with dataset ids, retrieval time and the upstream last-updated time) and, for corroboration notes, a few CC0
Wikidata items. **No personal data** is included: the school register's principal and contact fields and the supermarket
register's natural-person licensees are not reproduced.
