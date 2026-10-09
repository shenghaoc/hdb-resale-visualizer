/** Captured documents and approved field patches become complete replacements locally. */
import { z } from "zod";
import { canonicalJson } from "../lib/sync/neon";
import { textKey } from "./text-key";
import {
  applyDetailPaths,
  packStage,
  sha256,
  type PackedStage,
  type StageItem,
} from "./staged-plan";
const object = z.record(z.string(), z.json());
export type DetailDerivation = {
  addressKey: string;
  oldDocument: Record<string, z.infer<ReturnType<typeof z.json>>>;
  patches: NonNullable<StageItem["detailPatches"]>;
  beforePgSHA256: string;
};
export function materializeDetailStage(
  patchStage: PackedStage,
  captured: ReadonlyMap<string, Record<string, unknown>>,
  oldPgDigests: ReadonlyMap<string, string>,
) {
  const derivations: DetailDerivation[] = [];
  const items = patchStage.items.map((item): StageItem => {
    if (item.table !== "block_details" || item.operation !== "update") return item;
    const addressKey = textKey(item.key.address_key, "address_key"),
      oldDocument = object.parse(captured.get(addressKey)),
      beforePgSHA256 = oldPgDigests.get(addressKey);
    if (!item.detailPatches || !beforePgSHA256 || !/^[a-f0-9]{64}$/.test(beforePgSHA256))
      throw new Error("Missing captured detail patches or compatible old PostgreSQL digest");
    const finalDocument = applyDetailPaths(oldDocument, item.detailPatches);
    derivations.push({ addressKey, oldDocument, patches: item.detailPatches, beforePgSHA256 });
    return {
      table: "block_details",
      operation: "update",
      key: item.key,
      before: {},
      after: { json: finalDocument },
      detailBeforePgSHA256: beforePgSHA256,
    };
  });
  const plan = packStage(items);
  return { plan, derivations, identity: materializedDetailIdentity(plan, derivations) };
}
export function materializedDetailIdentity(plan: PackedStage, derivations: DetailDerivation[]) {
  const replacements = new Map(
    plan.items
      .filter((r) => r.table === "block_details" && r.operation === "update")
      .map((r) => [textKey(r.key.address_key, "address_key"), r]),
  );
  const identities = derivations
    .map((r) => {
      const item = replacements.get(r.addressKey);
      if (!item) throw new Error("Derived detail absent from replacement stage");
      return {
        addressKey: r.addressKey,
        oldCanonicalSHA256: sha256(canonicalJson(r.oldDocument)),
        finalCanonicalSHA256: sha256(canonicalJson(item.after.json)),
        patchesSHA256: sha256(canonicalJson(r.patches)),
        beforePgSHA256: r.beforePgSHA256,
        oldBytes: Buffer.byteLength(canonicalJson(r.oldDocument)),
        finalBytes: Buffer.byteLength(canonicalJson(item.after.json)),
        patchCount: r.patches.length,
      };
    })
    .sort((a, b) => (a.addressKey < b.addressKey ? -1 : a.addressKey > b.addressKey ? 1 : 0));
  return {
    rows: identities.length,
    oldDocumentSetSHA256: sha256(
      canonicalJson(
        identities.map(({ addressKey, oldCanonicalSHA256, oldBytes }) => ({
          addressKey,
          oldCanonicalSHA256,
          oldBytes,
        })),
      ),
    ),
    finalDocumentSetSHA256: sha256(
      canonicalJson(
        identities.map(({ addressKey, finalCanonicalSHA256, finalBytes }) => ({
          addressKey,
          finalCanonicalSHA256,
          finalBytes,
        })),
      ),
    ),
    derivationIdentitySHA256: sha256(canonicalJson(identities)),
    totalOldBytes: identities.reduce((n, r) => n + r.oldBytes, 0),
    totalFinalBytes: identities.reduce((n, r) => n + r.finalBytes, 0),
    maximumOldBytes: Math.max(0, ...identities.map((r) => r.oldBytes)),
    maximumFinalBytes: Math.max(0, ...identities.map((r) => r.finalBytes)),
    maximumPatchCount: Math.max(0, ...identities.map((r) => r.patchCount)),
    detailCopyBytes: plan.items.reduce(
      (n, r, i) =>
        n +
        (r.table === "block_details"
          ? Buffer.byteLength(`${i + 1}\t${plan.wires[i].replaceAll("\\", "\\\\")}\n`)
          : 0),
      0,
    ),
  };
}
export function assertMaterializedDetails(
  plan: PackedStage,
  derivations: DetailDerivation[],
  ownedPaths: string[][],
  expectedIdentity: unknown,
) {
  // Runtime callers can load JSON from disk; TypeScript alone cannot validate it.
  const checked = z
    .array(
      z
        .object({
          addressKey: z.string().min(1),
          oldDocument: object,
          patches: z.array(z.unknown()).min(1).max(64),
          beforePgSHA256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    )
    .parse(derivations);
  const replacements = plan.items.filter(
      (r) => r.table === "block_details" && r.operation === "update",
    ),
    lookup = new Map(checked.map((r) => [r.addressKey, r])),
    owned = new Set(ownedPaths.map(canonicalJson));
  if (lookup.size !== derivations.length || replacements.length !== derivations.length)
    throw new Error("Materialized detail target count/identity mismatch");
  for (const item of replacements) {
    const row = lookup.get(textKey(item.key.address_key, "address_key"));
    if (!row || item.detailPatches || item.detailBeforePgSHA256 !== row.beforePgSHA256)
      throw new Error("Materialized detail old-digest drift");
    const validated = packStage([
      {
        table: "block_details",
        operation: "update",
        key: item.key,
        before: {},
        after: {},
        detailPatches: row.patches,
      },
    ]);
    const patches = validated.items[0].detailPatches!;
    if (patches.some((p) => !owned.has(canonicalJson(p.path))))
      throw new Error("Materialized detail changes an unowned path");
    if (
      canonicalJson(applyDetailPaths(row.oldDocument, patches)) !== canonicalJson(item.after.json)
    )
      throw new Error("Materialized detail final document differs from approved field patches");
  }
  if (
    canonicalJson(materializedDetailIdentity(plan, derivations)) !== canonicalJson(expectedIdentity)
  )
    throw new Error("Materialized detail approval identity drift");
}
