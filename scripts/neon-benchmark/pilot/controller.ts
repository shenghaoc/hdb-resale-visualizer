import type {
  PilotAuthority,
  RequestAdmission,
  ServerObservation,
  StatementPurpose,
} from "./accounting";
import {
  capturePilotHttp,
  PilotAdmissionError,
  type HttpCaptureOptions,
  type ReceiptJournal,
} from "./evidence";
import { createStatementDispatcher } from "./dispatch";

export type PilotRequest<T> = RequestAdmission & {
  label: string;
  fetchResponse: HttpCaptureOptions<T>["fetchResponse"];
  parse: HttpCaptureOptions<T>["parse"];
  requestBodyBytes?: number;
  secrets?: readonly string[];
  capturePublicSyntheticSnippet?: boolean;
  measurement?: HttpCaptureOptions<T>["measurement"];
  signal?: AbortSignal;
};

/** Dependency-injected only: importing this local review module starts no remote action. */
export class PilotController {
  constructor(
    readonly authority: PilotAuthority,
    private readonly journal: ReceiptJournal,
  ) {}

  /** Every control-plane HTTP attempt uses this recorder; bodies remain hidden by default.
   * No SQL/POST/connection allowance is allocated for provider create/delete requests here.
   * Importing this method grants no permission or credentials for those actions.
   */
  controlRequest<T>(input: Omit<HttpCaptureOptions<T>, "authority" | "journal">): Promise<T> {
    return capturePilotHttp({
      ...input,
      authority: this.authority,
      journal: this.journal,
      onFailure: async () => {
        try {
          await this.authority.stop();
        } finally {
          await input.onFailure?.();
        }
      },
    });
  }

  async request<T>(input: PilotRequest<T>): Promise<T> {
    try {
      return await capturePilotHttp({
        ...input,
        timeoutMs:
          input.maximumWallMs ??
          (input.method === "POST" ? 35_000 : input.purpose === "cleanup" ? 10_000 : 85_000),
        fetchResponse: async (signal) => {
          try {
            await this.authority.admitRequest(input);
          } catch {
            throw new PilotAdmissionError();
          }
          signal.throwIfAborted();
          return input.fetchResponse(signal);
        },
        authority: this.authority,
        journal: this.journal,
        onFailure: async () => {
          try {
            await this.authority.stop();
          } finally {
            await this.authority.finishRequest(input.id, "failed-unknown");
          }
        },
      });
    } finally {
      // Preserve an earlier unknown outcome even if cleanup or a late response succeeds.
      await this.authority.finishRequest(input.id, "complete").catch(() => undefined);
    }
  }

  /** Owner/setup/final diagnostics use the SAME authority; not an extra 90-command pool. */
  async ownerStatements<T>(
    admission: RequestAdmission,
    action: (dispatch: ReturnType<typeof createStatementDispatcher>) => Promise<T>,
    purpose: StatementPurpose = "work",
  ): Promise<T> {
    await this.authority.admitRequest({ ...admission, purpose });
    await this.authority.activateRequest(admission.id);
    const dispatch = createStatementDispatcher({
      authority: this.authority,
      requestId: admission.id,
      defaultPurpose: purpose,
    });
    try {
      return await action(dispatch);
    } catch (error) {
      await this.authority.finishRequest(admission.id, "failed-unknown");
      throw error;
    } finally {
      await this.authority.finishRequest(admission.id, "complete");
    }
  }

  /** Only an observation. This cannot increment, refund, reset or block the app SQL counter. */
  observeServer(observation: ServerObservation): Promise<void> {
    return this.authority.observeServer(observation);
  }

  /** Resource cleanup failures cannot discard HTTP or statement history. No cleanup I/O supplied. */
  async cleanup(
    actions: readonly (() => Promise<void>)[],
  ): Promise<{ index: number; failed: true }[]> {
    const failures: { index: number; failed: true }[] = [];
    await this.authority.stop().catch(() => failures.push({ index: -1, failed: true }));
    for (const [index, action] of actions.entries()) {
      try {
        await action();
      } catch {
        failures.push({ index, failed: true });
      }
    }
    return failures;
  }
}
