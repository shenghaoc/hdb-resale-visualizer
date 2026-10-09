// Public upstream capture + offline diagnosis only. No database network connections or credentials.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import Papa from "papaparse";
import { collectionMetadataSchema, datasetMetadataSchema } from "../lib/schemas";
import { fetchJson, fetchWithRetry } from "../lib/sync/fetchers";
import { normalizeResaleRows } from "../lib/sync/normalization";
import { toTransactionRow } from "../lib/pipeline";
import {
  transactionTuple,
  TRANSACTION_COLUMNS,
  type StoredTransaction,
} from "../lib/sync/incremental";
import type { TransactionRow } from "../lib/schemas";
import { compareSourceOccurrences } from "./source-diagnostic";

const ACTIVE = "d_8b84c4ee58e3cfc0ece0d773c8ca6abc";
type DatasetMetadata = {
  datasetId: string;
  title: string;
  lastUpdatedAt: string;
  coverageStart: unknown;
  coverageEnd: unknown;
  datasetSize: unknown;
};
async function inventory(signal: AbortSignal) {
  const metadata = collectionMetadataSchema.parse(
    await fetchJson<unknown>(
      "https://api-production.data.gov.sg/v2/public/api/collections/189/metadata",
      { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) },
    ),
  ).data.collectionMetadata;
  if (
    metadata.collectionId !== "189" ||
    metadata.childDatasets.length !== 5 ||
    !metadata.childDatasets.includes(ACTIVE)
  )
    throw new Error("Unexpected official resale inventory");
  const datasets: DatasetMetadata[] = [];
  for (const id of metadata.childDatasets) {
    const raw = await fetchJson<{ data: Record<string, unknown> }>(
      `https://api-production.data.gov.sg/v2/public/api/datasets/${id}/metadata`,
      { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) },
    );
    const checked = datasetMetadataSchema.parse(raw);
    if (checked.errorMsg || checked.data.datasetId !== id || typeof raw.data.name !== "string")
      throw new Error("Invalid official source metadata");
    datasets.push({
      datasetId: id,
      title: raw.data.name,
      lastUpdatedAt: new Date(checked.data.lastUpdatedAt).toISOString(),
      coverageStart: raw.data.coverageStart,
      coverageEnd: raw.data.coverageEnd,
      datasetSize: raw.data.datasetSize,
    });
  }
  return { observedAtUTC: new Date().toISOString(), collection: metadata, datasets };
}
export async function captureOfficialSource(argv = process.argv.slice(2)) {
  const resume = argv.length === 2 && argv[0] === "--resume-local-capture";
  if (!resume && (argv.length !== 1 || argv[0] !== "--capture-authorized"))
    throw new Error("Explicit source-only acquisition authorization required");
  const startedAtUTC = new Date().toISOString();
  const deadline = AbortSignal.timeout(10 * 60 * 1000);
  const directory = resume
    ? argv[1]
    : `.neon-benchmark/official-resale-${startedAtUTC.replaceAll(":", "-").replaceAll(".", "-")}`;
  if (!/^\.neon-benchmark\/official-resale-[0-9TZ.-]+$/.test(directory))
    throw new Error("Known local public source capture required");
  if (!resume) mkdirSync(directory, { mode: 0o700 });
  const receipt: Record<string, unknown> = resume
    ? (JSON.parse(readFileSync(`${directory}/receipt.json`, "utf8")) as Record<string, unknown>)
    : {
        startedAtUTC,
        directory,
        mode: "new-official-source-capture-offline-only",
        NeonCalls: 0,
        D1Calls: 0,
        publication: false,
        notReplayOfFailedRun: true,
      };
  if (resume) {
    if (
      receipt.error !== "Maximum call stack size exceeded" ||
      receipt.publication !== false ||
      receipt.NeonCalls !== 0 ||
      receipt.D1Calls !== 0
    )
      throw new Error(
        "Only retained bytes after known local argument-limit failure may resume; upstream denials never bypassed",
      );
    writeFileSync(`${directory}/receipt-local-failure.json`, JSON.stringify(receipt, null, 2), {
      mode: 0o600,
    });
    receipt.resumedOfflineAtUTC = startedAtUTC;
    delete receipt.error;
  }
  const save = () =>
    writeFileSync(`${directory}/receipt.json`, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  const old = new DatabaseSync(".neon-benchmark/source.sqlite", { readOnly: true });
  try {
    const before = resume
      ? (receipt.before as Awaited<ReturnType<typeof inventory>>)
      : await inventory(deadline);
    receipt.before = before;
    save();
    const faithfulManifest = JSON.parse(
      old.prepare("SELECT json FROM manifest WHERE id=1").get()!.json as string,
    ) as { sources: { resaleDatasetIds: string[] } };
    if (
      JSON.stringify([...faithfulManifest.sources.resaleDatasetIds].sort()) !==
      JSON.stringify([...before.collection.childDatasets].sort())
    )
      throw new Error("Changed source inventory; bounded partition diagnosis stopped");
    const activeMetadata = before.datasets.find((entry) => entry.datasetId === ACTIVE)!;
    if (!/Jan-2017 onwards/i.test(activeMetadata.title))
      throw new Error("Cannot establish active partition ownership");
    const captures: Record<string, unknown>[] =
      resume && Array.isArray(receipt.captures)
        ? (receipt.captures as Record<string, unknown>[])
        : [];
    const allIncoming: TransactionRow[] = [];
    async function download(id: string) {
      const retained = captures.find((entry) => entry.datasetId === id);
      if (retained) {
        if (retained.file !== `${directory}/${id}.csv`)
          throw new Error("Retained capture path mismatch");
        const bytes = readFileSync(retained.file as string);
        if (createHash("sha256").update(bytes).digest("hex") !== retained.responseBodySHA256)
          throw new Error("Retained public input bytes changed");
        const parsed = Papa.parse<Record<string, string>>(bytes.toString("utf8"), {
          header: true,
          skipEmptyLines: true,
        });
        const normalized = normalizeResaleRows(parsed.data);
        const facts = normalized.flatMap((row) => {
          const fact = toTransactionRow(row);
          return fact ? [fact] : [];
        });
        if (
          parsed.errors.length ||
          facts.length !== retained.factRows ||
          normalized.length !== parsed.data.length ||
          facts.length !== normalized.length
        )
          throw new Error("Retained normalization mismatch");
        for (const fact of facts) allIncoming.push(fact);
        console.log(JSON.stringify({ reusedVerifiedLocalBytes: id, rows: facts.length }));
        return facts;
      }
      const existingFile = `${directory}/${id}.csv`;
      if (resume && existsSync(existingFile)) {
        const bytes = readFileSync(existingFile);
        const parsed = Papa.parse<Record<string, string>>(bytes.toString("utf8"), {
          header: true,
          skipEmptyLines: true,
        });
        const normalized = normalizeResaleRows(parsed.data);
        const facts = normalized.flatMap((row) => {
          const fact = toTransactionRow(row);
          return fact ? [fact] : [];
        });
        if (
          parsed.errors.length ||
          !facts.length ||
          normalized.length !== parsed.data.length ||
          facts.length !== normalized.length
        )
          throw new Error("Retained raw input normalization failed");
        const hash = createHash("sha256");
        for (const tuple of facts.map(transactionTuple).sort())
          hash.update(`${Buffer.byteLength(tuple)}:${tuple}`);
        const months = facts.map((row) => row.month).sort();
        captures.push({
          datasetId: id,
          file: existingFile,
          bodySavedAtUTC: statSync(existingFile).mtime.toISOString(),
          hashRecordedAtUTC: new Date().toISOString(),
          responseBodyBytes: bytes.length,
          responseBodySHA256: createHash("sha256").update(bytes).digest("hex"),
          normalizedMultisetSHA256: hash.digest("hex"),
          csvRows: parsed.data.length,
          normalizedRows: normalized.length,
          factRows: facts.length,
          minimumMonth: months[0],
          maximumMonth: months.at(-1),
          HTTPStatus: null,
          headerMetadata: null,
          provenance:
            "Raw CSV saved before local argument-limit failure; hashes first persisted on resume, original response headers/times not retained",
        });
        receipt.captures = captures;
        save();
        for (const fact of facts) allIncoming.push(fact);
        console.log(
          JSON.stringify({ reusedRetainedRawFile: id, rows: facts.length, noRedownload: true }),
        );
        return facts;
      }
      const requestedAtUTC = new Date().toISOString();
      const base = `https://api-open.data.gov.sg/v1/public/api/datasets/${id}`;
      await fetchJson(`${base}/initiate-download`, {
        signal: AbortSignal.any([deadline, AbortSignal.timeout(30000)]),
      });
      let delivery: string | undefined;
      for (let i = 0; i < 8; i++) {
        const polled = await fetchJson<{ data?: { url?: string } }>(`${base}/poll-download`, {
          signal: AbortSignal.any([deadline, AbortSignal.timeout(30000)]),
        });
        if (polled.data?.url) {
          delivery = polled.data.url;
          break;
        }
      }
      if (!delivery || new URL(delivery).protocol !== "https:")
        throw new Error("Official CSV delivery unavailable");
      const response = await fetchWithRetry(delivery, {
        signal: AbortSignal.any([deadline, AbortSignal.timeout(120000)]),
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 200000000)
        throw new Error("Unexpected official CSV size");
      const file = `${directory}/${id}.csv`;
      writeFileSync(file, bytes, { mode: 0o600 });
      const parsed = Papa.parse<Record<string, string>>(bytes.toString("utf8"), {
        header: true,
        skipEmptyLines: true,
      });
      if (parsed.errors.length) throw new Error("Official CSV parse failure; no bypass");
      const normalized = normalizeResaleRows(parsed.data);
      const facts = normalized.flatMap((row) => {
        const fact = toTransactionRow(row);
        return fact ? [fact] : [];
      });
      if (
        !facts.length ||
        normalized.length !== parsed.data.length ||
        facts.length !== normalized.length
      )
        throw new Error("Source normalization/exclusion discrepancy; offline diagnosis stopped");
      const hash = createHash("sha256");
      for (const tuple of facts.map(transactionTuple).sort())
        hash.update(`${Buffer.byteLength(tuple)}:${tuple}`);
      const months = facts.map((row) => row.month).sort();
      captures.push({
        datasetId: id,
        requestedAtUTC,
        completedAtUTC: new Date().toISOString(),
        file,
        responseBodyBytes: bytes.length,
        responseBodySHA256: createHash("sha256").update(bytes).digest("hex"),
        normalizedMultisetSHA256: hash.digest("hex"),
        csvRows: parsed.data.length,
        normalizedRows: normalized.length,
        factRows: facts.length,
        minimumMonth: months[0],
        maximumMonth: months.at(-1),
        HTTPStatus: response.status,
        contentType: response.headers.get("content-type"),
        etag: response.headers.get("etag"),
        signedDeliveryURLRetained: false,
      });
      receipt.captures = captures;
      save();
      for (const fact of facts) allIncoming.push(fact);
      console.log(JSON.stringify(captures.at(-1)));
      return facts;
    }
    const active = await download(ACTIVE);
    if (active.some((row) => row.month < "2017-01"))
      throw new Error("Active source violates its documented month partition");
    const activeOld = old
      .prepare(
        `SELECT id,${TRANSACTION_COLUMNS.join(",")} FROM transactions WHERE month >= ? ORDER BY id`,
      )
      .all("2017-01") as unknown as StoredTransaction[];
    let comparison = compareSourceOccurrences(activeOld, active);
    let scope = "Active Jan-2017-onward file only; historical CSVs not re-downloaded";
    if (comparison.missingOccurrences.length !== 5) {
      for (const id of before.collection.childDatasets.filter((id) => id !== ACTIVE))
        await download(id);
      const allOld = old
        .prepare(`SELECT id,${TRANSACTION_COLUMNS.join(",")} FROM transactions ORDER BY id`)
        .all() as unknown as StoredTransaction[];
      comparison = compareSourceOccurrences(allOld, allIncoming);
      scope =
        "All five official resale files; historical capture necessary because active partition alone did not account for five occurrences";
    }
    receipt.comparison = comparison;
    receipt.comparisonScope = scope;
    save();
    const after = await inventory(deadline);
    receipt.after = after;
    const versions = (snapshot: typeof before) =>
      JSON.stringify({
        collectionLastUpdated: snapshot.collection.lastUpdatedAt,
        datasetIds: snapshot.collection.childDatasets.slice().sort(),
        versions: snapshot.datasets
          .map((entry) => [entry.datasetId, entry.lastUpdatedAt])
          .sort(([a], [b]) => a.localeCompare(b)),
      });
    receipt.sourceVersionHintsStableDuringCapture = versions(before) === versions(after);
    receipt.success = true;
    receipt.limitation =
      "New capture, not an exact replay of failed in-memory input. Metadata stability is not immutability proof. Exact one-field candidates do not establish correction/deletion authority; no winner selected. Historical bodies were skipped only where active capture accounted for all five observed occurrences; the full current historical corpus was not revalidated in that case.";
  } catch (error) {
    receipt.success = false;
    receipt.error = (
      error instanceof Error ? error.message : "Unknown source capture failure"
    ).replace(/https?:\/\/[^\s"'<>]+/gi, "[URL redacted]");
    process.exitCode = 1;
  } finally {
    old.close();
    receipt.finishedAtUTC = new Date().toISOString();
    save();
    writeFileSync(
      ".neon-benchmark/latest-offline-source-capture.json",
      JSON.stringify(
        { directory, receipt: `${directory}/receipt.json`, success: receipt.success },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        directory,
        success: receipt.success,
        error: receipt.error,
        sourceVersionHintsStableDuringCapture: receipt.sourceVersionHintsStableDuringCapture,
      }),
    );
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void captureOfficialSource().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Source-only setup failed");
    process.exitCode = 1;
  });
