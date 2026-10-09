import { createHash } from "node:crypto";
import type { PilotState } from "./accounting";

const SNIPPET_BYTES = 512;
const MAXIMUM_HTTP_BYTES = 2_000_000;
export type HttpFailureKind =
  | "none"
  | "transport"
  | "admission"
  | "timeout"
  | "abort"
  | "body-limit"
  | "parse"
  | "http-status"
  | "evidence";
export type HttpStage = "intent" | "transport" | "headers" | "body" | "parse" | "complete";
type PilotRedirectMode = "error" | "follow" | "manual";
export type PilotDeploymentCapture = {
  workerName: string;
  versionId: string | null;
  configSHA256: string;
  entrypointSHA256: string;
  uploadSHA256: string | null;
};
export type HttpReceipt = {
  id: string;
  sequence: number;
  method: "GET" | "POST" | "PUT" | "DELETE";
  label: string;
  startedAtUTC: string;
  endedAtUTC: string | null;
  stage: HttpStage;
  responseAvailable: boolean;
  status: number | null;
  contentType: string | null;
  requestURL: string | null;
  responseURL: string | null;
  redirected: boolean | null;
  /** Fetch exposes no redirect chain. Missing is never reconstructed from a requested URL. */
  redirectChain: null;
  /** Observed only when an instrumented handler returns its method; otherwise UNKNOWN. */
  finalMethod: "GET" | "POST" | "PUT" | "DELETE" | "HEAD" | "UNKNOWN";
  redirectMode: PilotRedirectMode | null;
  responseHeaders: Record<string, string>;
  deployment: PilotDeploymentCapture | null;
  applicationStatementsBefore: number | null;
  applicationAccountingAvailableBefore: boolean;
  applicationStatementsAfter: number | null;
  applicationAccountingAvailableAfter: boolean;
  requestBodyBytes: number;
  responseBodyBytes: number;
  responseSHA256: string | null;
  bodySnippet: string;
  failure: HttpFailureKind;
  failureStage: HttpStage | null;
  errorName: string | null;
  protocolReceivedBytes: number | null;
  protocolSentBytes: number | null;
  providerObservationAvailable: boolean;
  finalEvidenceWriteFailed: boolean;
  transportCode: string | null;
};

export type ReceiptJournal = { persist(receipt: HttpReceipt): Promise<void> };
export type HttpCaptureOptions<T> = {
  id: string;
  sequence: number;
  method: HttpReceipt["method"];
  label: string;
  /** Observation only; never an authorization source. The dispatch authority is separate. */
  authority: { snapshot(): Promise<Pick<PilotState, "applicationStatements">> };
  journal: ReceiptJournal;
  /** Transport must forward this signal to fetch; no controller starts a background retry. */
  fetchResponse: (signal: AbortSignal) => Promise<Response>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Actual HTTP bytes only; authentication headers and request payload are never persisted. */
  requestBodyBytes?: number;
  secrets?: readonly string[];
  capturePublicSyntheticSnippet?: boolean;
  /** Only sanitized, bounded error excerpts; successful control/auth payloads stay disabled. */
  captureErrorSnippet?: boolean;
  requestURL?: string;
  redirectMode?: PilotRedirectMode;
  deployment?: PilotDeploymentCapture;
  parse: (body: string, response: Response) => T;
  measurement?: (parsed: T) => {
    protocolReceivedBytes: number | null;
    protocolSentBytes: number | null;
    providerObservationAvailable: boolean;
  };
  onFailure?: () => Promise<void>;
  now?: () => number;
};

/** Conservative public-pilot preview. Control-plane/auth payloads must leave capture disabled. */
export function sanitizePilotSnippet(value: string, secrets: readonly string[] = []): string {
  let sanitized = value;
  for (const secret of secrets)
    if (secret) {
      sanitized = sanitized.split(secret).join("[REDACTED]");
      // A stream may abort in the middle of a credential. Redact known prefixes as well.
      for (let length = secret.length - 1; length >= 3; length--)
        sanitized = sanitized.split(secret.slice(0, length)).join("[REDACTED]");
    }
  sanitized = sanitized
    .replace(
      /(["']?(?:authorization|password|api[_-]?key|token|secret)["']?\s*[=:]\s*)(["'])(.*?)\2/gi,
      '$1"[REDACTED]"',
    )
    .replace(
      /["']?(?:authorization|password|api[_-]?key|token|secret)["']?\s*[=:]\s*["']?[^,}\n]*/gi,
      "[REDACTED_CREDENTIAL]",
    )
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_CONNECTION]")
    .replace(
      /(?:authorization|password|api[_-]?key|token|secret)\s*[=:]\s*["']?[^\s,}\n"']+/gi,
      "[REDACTED_CREDENTIAL]",
    )
    .replace(/bearer\s+\S+/gi, "[REDACTED_AUTHORIZATION]")
    .replace(/[A-Za-z0-9_-]{24,}(?:\.[A-Za-z0-9_-]+)*/g, "[REDACTED_OPAQUE_VALUE]");
  let printable = "";
  for (const character of sanitized) {
    const code = character.charCodeAt(0);
    if (code >= 32 || code === 9 || code === 10 || code === 13) printable += character;
  }
  // Stream decoding omits a partial trailing UTF-8 code point instead of expanding it.
  return new TextDecoder().decode(new TextEncoder().encode(printable).slice(0, SNIPPET_BYTES), {
    stream: true,
  });
}

function sanitizedURL(value: string, secrets: readonly string[] = []): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Never retain user info, query credentials or fragments, including redirect locations.
    return sanitizePilotSnippet(url.origin + url.pathname, secrets);
  } catch {
    return null;
  }
}

function capturedHeaders(response: Response, secrets: readonly string[] = []) {
  const headers: Record<string, string> = {};
  for (const name of [
    "content-type",
    "content-length",
    "cf-ray",
    "server",
    "location",
    "x-pilot-control-method",
    "x-pilot-control-path",
    "x-pilot-control-protocol",
  ] as const) {
    const value = response.headers.get(name);
    if (!value) continue;
    let safe: string | null;
    try {
      safe =
        name === "location"
          ? sanitizedURL(new URL(value, response.url || "https://unknown.invalid").href, secrets)
          : sanitizePilotSnippet(value, secrets);
    } catch {
      safe = null;
    }
    if (safe) headers[name] = safe.slice(0, 256);
  }
  return headers;
}

function failureKind(error: unknown, stage: HttpStage): HttpFailureKind {
  if (error instanceof PilotAdmissionError) return "admission";
  if (error instanceof PilotHttpError) return error.classification;
  if (error instanceof Error && error.name === "TimeoutError") return "timeout";
  if (error instanceof Error && error.name === "AbortError") return "abort";
  return stage === "parse" ? "parse" : "transport";
}
export class PilotAdmissionError extends Error {
  constructor() {
    super("Pilot request refused before dispatch");
  }
}

export class PilotHttpError extends Error {
  constructor(
    readonly classification: HttpFailureKind,
    readonly receipt: HttpReceipt,
  ) {
    super(`Pilot HTTP stopped: ${classification} at ${receipt.failureStage ?? receipt.stage}`);
  }
}

export async function capturePilotHttp<T>(options: HttpCaptureOptions<T>): Promise<T> {
  if (
    !/^[A-Za-z0-9_-]{1,96}$/.test(options.id) ||
    !/^[A-Za-z0-9_-]{1,96}$/.test(options.label) ||
    !Number.isSafeInteger(options.sequence) ||
    options.sequence < 1 ||
    !["GET", "POST", "PUT", "DELETE"].includes(options.method) ||
    !Number.isSafeInteger(options.requestBodyBytes ?? 0) ||
    (options.requestBodyBytes ?? 0) < 0 ||
    !Number.isSafeInteger(options.timeoutMs ?? 20_000) ||
    (options.timeoutMs ?? 20_000) < 1 ||
    (options.timeoutMs ?? 20_000) > 85_000
  )
    throw new Error("Invalid bounded HTTP attribution");
  const deployment = options.deployment;
  if (
    deployment &&
    (!/^[A-Za-z0-9_-]{1,96}$/.test(deployment.workerName) ||
      (deployment.versionId !== null && !/^[a-f0-9-]{36}$/.test(deployment.versionId)) ||
      !/^[a-f0-9]{64}$/.test(deployment.configSHA256) ||
      !/^[a-f0-9]{64}$/.test(deployment.entrypointSHA256) ||
      (deployment.uploadSHA256 !== null && !/^[a-f0-9]{64}$/.test(deployment.uploadSHA256)))
  )
    throw new Error("Invalid deployment attribution");
  const now = options.now ?? Date.now;
  const receipt: HttpReceipt = {
    id: options.id,
    sequence: options.sequence,
    method: options.method,
    label: options.label,
    startedAtUTC: new Date(now()).toISOString(),
    endedAtUTC: null,
    stage: "intent",
    responseAvailable: false,
    status: null,
    contentType: null,
    requestURL: options.requestURL ? sanitizedURL(options.requestURL, options.secrets) : null,
    responseURL: null,
    redirected: null,
    redirectChain: null,
    finalMethod: "UNKNOWN",
    redirectMode: options.redirectMode ?? null,
    responseHeaders: {},
    deployment: deployment ? structuredClone(deployment) : null,
    applicationStatementsBefore: null,
    applicationAccountingAvailableBefore: false,
    applicationStatementsAfter: null,
    applicationAccountingAvailableAfter: false,
    requestBodyBytes: options.requestBodyBytes ?? 0,
    responseBodyBytes: 0,
    responseSHA256: null,
    bodySnippet: "",
    failure: "none",
    failureStage: null,
    errorName: null,
    protocolReceivedBytes: null,
    protocolSentBytes: null,
    providerObservationAvailable: false,
    finalEvidenceWriteFailed: false,
    transportCode: null,
  };
  // If durable intent fails, fetch is never invoked. No response parsing precedes persistence.
  const persist = async () => {
    try {
      await options.journal.persist(structuredClone(receipt));
    } catch {
      throw new PilotHttpError("evidence", receipt);
    }
  };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const digest = createHash("sha256");
  let retained = "";
  const decoder = new TextDecoder();
  let result: { parsed: T } | undefined;
  let failure: PilotHttpError | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, abort.signal]) : abort.signal;
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  // The cancellation race retains evidence even if a faulty injected transport ignores its signal.
  const onAbort = () => rejectAbort(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  // Keep a handled rejection even if an already-aborted signal prevents transport entirely.
  void aborted.catch(() => undefined);
  try {
    await persist();
    try {
      receipt.applicationStatementsBefore = (
        await options.authority.snapshot()
      ).applicationStatements;
      receipt.applicationAccountingAvailableBefore = true;
    } catch {
      throw new PilotHttpError("evidence", receipt);
    }
    receipt.stage = "transport";
    await persist();
    timer = setTimeout(
      () => abort.abort(new DOMException("Pilot HTTP deadline", "TimeoutError")),
      options.timeoutMs ?? 20_000,
    );
    signal.throwIfAborted();
    const response = await Promise.race([options.fetchResponse(signal), aborted]);
    receipt.responseAvailable = true;
    receipt.status = response.status;
    const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";
    receipt.contentType = /^(application\/json|text\/plain|text\/html)$/i.test(mime) ? mime : null;
    receipt.responseURL = sanitizedURL(response.url, options.secrets);
    receipt.redirected = response.redirected;
    receipt.responseHeaders = capturedHeaders(response, options.secrets);
    const observedMethod = response.headers.get("x-pilot-control-method");
    if (observedMethod && ["GET", "POST", "PUT", "DELETE", "HEAD"].includes(observedMethod))
      receipt.finalMethod = observedMethod as HttpReceipt["finalMethod"];
    receipt.stage = "headers";
    await persist();
    receipt.stage = "body";
    reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const chunk = await Promise.race([reader.read(), aborted]);
        if (chunk.done) break;
        receipt.responseBodyBytes += chunk.value.byteLength;
        digest.update(chunk.value);
        if (receipt.responseBodyBytes > MAXIMUM_HTTP_BYTES)
          throw new PilotHttpError("body-limit", receipt);
        retained += decoder.decode(chunk.value, { stream: true });
        receipt.bodySnippet =
          options.capturePublicSyntheticSnippet || (options.captureErrorSnippet && !response.ok)
            ? sanitizePilotSnippet(retained, options.secrets)
            : "[BODY_CAPTURE_DISABLED]";
        await persist();
      }
      retained += decoder.decode();
    }
    receipt.responseSHA256 = digest.digest("hex");
    // This durable update precedes parsing even for non-JSON/non-success responses.
    receipt.stage = "parse";
    await persist();
    if (!response.ok) throw new PilotHttpError("http-status", receipt);
    const parsed = options.parse(retained, response);
    if (options.measurement) {
      const measurement = options.measurement(parsed);
      for (const bytes of [measurement.protocolReceivedBytes, measurement.protocolSentBytes])
        if (bytes !== null && (!Number.isSafeInteger(bytes) || bytes < 0))
          throw new PilotHttpError("parse", receipt);
      receipt.protocolReceivedBytes = measurement.protocolReceivedBytes;
      receipt.protocolSentBytes = measurement.protocolSentBytes;
      receipt.providerObservationAvailable = measurement.providerObservationAvailable === true;
    }
    receipt.stage = "complete";
    result = { parsed };
  } catch (error) {
    receipt.failure = failureKind(error, receipt.stage);
    receipt.failureStage = receipt.stage;
    receipt.errorName =
      error instanceof Error &&
      ["AbortError", "TimeoutError", "SyntaxError", "TypeError"].includes(error.name)
        ? error.name
        : "PilotFailure";
    const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
    if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string")
      receipt.transportCode = [
        "ECONNRESET",
        "ECONNREFUSED",
        "ENOTFOUND",
        "EAI_AGAIN",
        "ETIMEDOUT",
        "CERT_HAS_EXPIRED",
      ].includes(cause.code)
        ? cause.code
        : null;
    await options.onFailure?.().catch(() => undefined);
    failure = new PilotHttpError(receipt.failure, receipt);
  } finally {
    if (timer) clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    // Do not allow an unresponsive stream's cancellation to prevent durable final evidence.
    void reader?.cancel().catch(() => undefined);
    receipt.endedAtUTC = new Date(now()).toISOString();
    try {
      receipt.applicationStatementsAfter = (
        await options.authority.snapshot()
      ).applicationStatements;
      receipt.applicationAccountingAvailableAfter = true;
    } catch {
      // Unknown is not zero. Prior committed SQL intents remain in the shared authority.
      receipt.applicationStatementsAfter = null;
      if (receipt.failure === "none") {
        receipt.failure = "evidence";
        receipt.failureStage = receipt.stage;
      }
      failure = new PilotHttpError("evidence", receipt);
    }
    try {
      await options.journal.persist(structuredClone(receipt));
    } catch {
      receipt.finalEvidenceWriteFailed = true;
      failure = new PilotHttpError("evidence", receipt);
    }
    if (failure) await options.onFailure?.().catch(() => undefined);
  }
  if (failure) throw failure;
  if (!result) throw new PilotHttpError("evidence", receipt);
  return result.parsed;
}
