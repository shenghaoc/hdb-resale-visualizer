# Neon publisher: recovered from an untracked working tree

This directory preserves, with hashes, the Neon refresh implementation that existed **only** as untracked and
uncommitted files in the maintainer's checkout (branch `feat/d1-free-incremental-refresh`, HEAD
`482be1eba`, never pushed; none of these files had ever been committed on any ref).

Recovered on 2026-10-09 (UTC). The repository is public, so credentials and generated data were excluded.

## What was recovered

| Category | Count | Where |
| --- | ---: | --- |
| New files, copied byte-for-byte to their original paths | 155 | `scripts/sync-neon.ts`, `scripts/lib/sync/{neon,neon-reconciliation,neon-usage,refresh-policy,incremental,source-version,statements}.ts`, `scripts/neon-benchmark/**`, tests, `.github/workflows/refresh-neon.yml` (manual dispatch only), design docs |
| Superseded copies of files `main` now owns in a newer form | 7 | `superseded/**/*.txt` (inert, kept for provenance only) |
| Tracked-file changes (incremental reconciliation, source-version hints, geocode auth, CSV presence) | 16 files | `tracked-changes.patch` (diff of the working tree against the branch merge-base `3ead543a3`; to be applied three-way) |
| Held-back work-in-progress, reference only | 5 patches | `held/*.patch`: the earlier Worker/OG/Env approach that #413 to #417 superseded |
| Dependency delta | 1 | `package.json.delta.json` |

`SHA256SUMS` lists the hash of every recovered file as it existed in the maintainer's checkout, so reviewers can
confirm the copies are unmodified. Verify the verbatim files from the repository root with:

```bash
grep -v -E '\((branch tip blob)\)' docs/recovery/neon-publisher/SHA256SUMS | grep -v -E '/(superseded|held)/|tracked-changes|delta' | shasum -a 256 -c
```

## Deliberately not recovered

- `docs/evidence/**` (generated measurement output, about 60 untracked files, plus four committed ones) and
  `.neon-benchmark/**` (scratch state and role credentials; now git-ignored). Core publisher code does not read evidence
  files at run time; only the benchmark and analysis scripts name five of them as inputs or outputs.
- `pnpm-lock.yaml` and the `packageManager: pnpm@12.9.1` change: the pnpm 12 upgrade is held on purpose
  (its two-document lockfile hides dependencies from GitHub's dependency graph).
- `neon.ts` (a scratch `@neon/config` stub), and `worker/neon-transport.ts` plus its test, which are already identical on `main`.
- Nothing credential-like: the recovered files and patches were scanned for connection strings with passwords,
  Neon, GitHub and Cloudflare tokens, bearer values, JWTs and private keys; there were no matches.

## Status

The first commit is a byte-exact snapshot and **does not claim to build or pass the gates on `main`**. Later commits on the
same branch adapt it to `main` (three-way merge of the tracked changes, dependency additions) and are reviewed on their own.
