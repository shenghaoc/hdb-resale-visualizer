/** Offline differential over the exact retained public snapshot. Never opens a remote connection. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { canonicalJson } from "../lib/sync/neon";
import { applyDetailPaths, packStage, sha256, stageIdentity, statementShape } from "./staged-plan";
import { materializeDetailStage, assertMaterializedDetails } from "./materialized-details";
import { publicationSQLSHA256 } from "./staged-publisher";
import { executionCodeSHA256 } from "./staged-code-identity";
import { textKey } from "./text-key";
const began = performance.now(),
  root = ".neon-benchmark",
  prepared = root + "/staged-inputs/cache-only",
  output = root + "/staged-inputs/materialized";
const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const receipt = json(prepared + "/receipt.json"),
  patch = packStage(json(prepared + "/stageItems.json"));
if (canonicalJson(stageIdentity(patch)) !== canonicalJson(receipt.stage))
  throw Error("Captured patch-stage identity drift");
const local = new DatabaseSync(root + "/source.sqlite", { readOnly: true });
const captured = new Map(
  local
    .prepare("SELECT address_key,json FROM block_details ORDER BY address_key")
    .all()
    .map((r) => [String(r.address_key), JSON.parse(String(r.json))]),
);
// No server-text digest is invented. Placeholder strings measure encoding only and cannot admit execution.
const digests = new Map([...captured.keys()].map((key) => [key, "0".repeat(64)]));
const result = materializeDetailStage(patch, captured, digests);
assertMaterializedDetails(
  result.plan,
  result.derivations,
  receipt.detailOwnedPaths,
  result.identity,
);
const newItems = new Map(
  result.plan.items
    .filter((r) => r.table === "block_details")
    .map((r) => [textKey(r.key.address_key, "address_key"), r]),
);
const oldItems = new Map(
  patch.items
    .filter((r) => r.table === "block_details")
    .map((r) => [textKey(r.key.address_key, "address_key"), r]),
);
let intermediateRows = 0,
  intermediateDocumentTextBytes = 0,
  maximumIntermediateDocumentBytes = 0;
const finalDetails = Object.fromEntries(
  [...captured].map(([key, old]) => {
    const before = oldItems.get(key),
      next = newItems.get(key),
      final = next ? next.after.json : old;
    if (before) {
      const expected = applyDetailPaths(old, before.detailPatches!);
      if (canonicalJson(expected) !== canonicalJson(final))
        throw Error("Captured legacy/materialized differential mismatch");
      let working = old;
      for (const p of [undefined, ...before.detailPatches!]) {
        if (p) working = applyDetailPaths(working, [p]);
        const size = Buffer.byteLength(canonicalJson(working));
        intermediateRows++;
        intermediateDocumentTextBytes += size;
        maximumIntermediateDocumentBytes = Math.max(maximumIntermediateDocumentBytes, size);
      }
    }
    return [key, final];
  }),
);
const allFinalDetailsSHA256 = sha256(canonicalJson(finalDetails));
if (allFinalDetailsSHA256 !== receipt.artifactHashes.details)
  throw Error("Final complete detail set differs from frozen artifact builder output");
const newNonDetails = new Map(
  result.plan.items
    .filter((r) => r.table !== "block_details")
    .map((r) => [`${r.table}:${canonicalJson(r.key)}`, sha256(canonicalJson(r))]),
);
const nonDetailsSame = patch.items
  .filter((r) => r.table !== "block_details")
  .every(
    (r) => newNonDetails.get(`${r.table}:${canonicalJson(r.key)}`) === sha256(canonicalJson(r)),
  );
if (!nonDetailsSame) throw Error("Unrelated transaction/derived/cache/MRT mutation changed");
const review = json("docs/evidence/neon-reconciliation-review-2026-10-04.json");
for (const r of review.retentions) {
  const stored = local.prepare("SELECT * FROM transactions WHERE id=?").get(r.id);
  if (!stored) throw Error("Retained occurrence missing");
  for (const [k, v] of Object.entries(r.fact))
    if (canonicalJson(stored[k]) !== canonicalJson(v)) throw Error("Retained tuple drift");
}
const measurements = {
  atUTC: new Date().toISOString(),
  status: "OFFLINE DIFFERENTIAL PASS; SERVER DIGESTS/PLANS/FAULT MATRIX PENDING",
  engine: "Node24 existing JSON Number/object contract; not PostgreSQL evidence",
  allCapturedDetails: captured.size,
  changedDetails: result.identity.rows,
  unchangedDetails: captured.size - result.identity.rows,
  detailIdentity: result.identity,
  stage: stageIdentity(result.plan),
  maximumStageItemBytes: Math.max(...result.plan.wires.map((w) => Buffer.byteLength(w))),
  publicationShape: statementShape(result.plan.groups),
  completeFinalDetailsSHA256: allFinalDetailsSHA256,
  frozenBuilderDetailsSHA256: receipt.artifactHashes.details,
  nonDetailMutationsUnchanged: nonDetailsSame,
  retainedTupleChecks: review.retentions.length,
  originalRecursiveOperation: {
    source:
      "previous staged-plan.ts rawStagedDml(block_details,update), recursive p carries full b.json and s.item across every patch step",
    cardinality: intermediateRows,
    serializedIntermediateDocumentBytesProxy: intermediateDocumentTextBytes,
    maximumIntermediateDocumentBytesProxy: maximumIntermediateDocumentBytes,
    physicalPeakBytes: "UNKNOWN; serialization/cardinality are not executor heap/spill",
  },
  resource: {
    COPYCapBytes: 90000000,
    COPYBytes: result.plan.copyBytes,
    COPYGuardFits: result.plan.copyBytes <= 90000000,
    maxTemporaryRelationBytes: 268435456,
    minimumProjectHeadroomBytes: 268435456,
    stagePhysicalPeakBytes: "UNKNOWN; requires local PostgreSQL plans/observations/reserve",
    executorIntermediateCardinalityAfterRewrite:
      "one changed tuple per target; no recursive detail CTE, detail RETURNING carries address key + Boolean only",
    statementMsCap: 120000,
    transactionMsCap: 600000,
  },
  newPublisherSQLSHA256: publicationSQLSHA256(result.plan),
  newCodeSHA256: executionCodeSHA256(),
  elapsedWallMs: performance.now() - began,
  RSSBytesObserved: process.memoryUsage().rss,
  remoteCalls: 0,
  D1Mutations: 0,
  unresolvedAddresses: receipt.addresses.candidate.unresolved,
  skippedSupermarkets: receipt.amenities.skippedSupermarketKeys.length,
  newOneMapRequests: 0,
  missingApprovalInputs: [
    "actual PG old-json digests verified against captured documents",
    "local PostgreSQL EXPLAIN and resource evidence",
    "real-engine fault matrix",
    "fresh supported usage/headroom acceptance",
  ],
};
mkdirSync(output, { recursive: true });
writeFileSync(output + "/stageItems.json", JSON.stringify(result.plan.items));
writeFileSync(output + "/detailDerivations.json", JSON.stringify(result.derivations));
writeFileSync(output + "/stage.copy-text", result.plan.copyText);
writeFileSync(output + "/receipt.json", JSON.stringify(measurements, null, 2));
writeFileSync(
  "docs/evidence/neon-materialized-detail-local-2026-10-04.json",
  JSON.stringify(measurements, null, 2) + "\n",
);
local.close();
console.log(
  JSON.stringify({
    ...measurements,
    stage: {
      rows: result.plan.rows,
      COPYBytes: result.plan.copyBytes,
      root: result.plan.rootSHA256,
    },
  }),
);
