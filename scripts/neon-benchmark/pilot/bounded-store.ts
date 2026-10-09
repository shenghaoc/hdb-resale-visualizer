import { PILOT_LIMITS, type AtomicPilotStore } from "./accounting";

/** Diagnostic-only narrower ceiling. Checked INSIDE the shared storage transaction. */
export function boundedPilotStore(store: AtomicPilotStore, maximum: number): AtomicPilotStore {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > PILOT_LIMITS.applicationStatements)
    throw new Error("Invalid narrowed diagnostic allowance");
  return {
    transact: (change) =>
      store.transact((current) => {
        const result = change(current);
        if (result.next.applicationStatements > maximum)
          throw new Error("Diagnostic application allowance exhausted before dispatch");
        return result;
      }),
  };
}
