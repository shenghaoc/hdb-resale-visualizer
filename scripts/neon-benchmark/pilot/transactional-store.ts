import type { AtomicPilotStore, PilotState } from "./accounting";

export type TransactionStorage = {
  transaction<T>(
    action: (transaction: {
      get<TValue>(key: string): Promise<TValue | undefined>;
      put(key: string, value: unknown): Promise<void>;
    }) => Promise<T>,
  ): Promise<T>;
};

/** Shared durable storage adapter, not a Worker-isolate-local counter or a deployment. */
export function transactionalPilotStore(storage: TransactionStorage): AtomicPilotStore {
  return {
    transact: (change) =>
      storage.transaction(async (transaction) => {
        const current = (await transaction.get<PilotState>("pilot")) ?? null;
        const { next, result } = change(current);
        await transaction.put("pilot", next);
        return result;
      }),
  };
}
