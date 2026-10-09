import {
  AtomicPilotAuthority,
  type AtomicPilotStore,
  type PilotState,
  type RequestAdmission,
} from "../../scripts/neon-benchmark/pilot/accounting";
export class SerialTestStore implements AtomicPilotStore {
  private state: PilotState | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  transact<T>(change: (state: PilotState | null) => { next: PilotState; result: T }): Promise<T> {
    const pending = this.tail.then(() => {
      const { next, result } = change(structuredClone(this.state));
      this.state = structuredClone(next);
      return result;
    });
    this.tail = pending.catch(() => undefined);
    return pending;
  }
}
export const admission = (
  id = "request1",
  overrides: Partial<RequestAdmission> = {},
): RequestAdmission => ({
  id,
  sequence: 1,
  method: "POST",
  maximumStatements: 8,
  maximumReceivedDatabaseBytes: 2_000_000,
  maximumSentDatabaseBytes: 30_000,
  ...overrides,
});
export async function authorityFixture() {
  const store = new SerialTestStore();
  const authority = new AtomicPilotAuthority(store, "synthetic-run", () => 1000);
  await authority.initialize();
  return { authority, store };
}
