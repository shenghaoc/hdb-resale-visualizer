import { open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { AtomicPilotStore, PilotState } from "./accounting";

/** Local review/reference authority. One lock also serializes different store instances/processes. */
export class FilePilotStore implements AtomicPilotStore {
  constructor(private readonly path: string) {}

  async transact<T>(
    change: (current: PilotState | null) => { next: PilotState; result: T },
  ): Promise<T> {
    const lockPath = `${this.path}.lock`;
    let lock;
    // Bounded local lock wait. A stale lock fails closed; it is never deleted as recovery.
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        lock = await open(lockPath, "wx", 0o600);
        break;
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    if (!lock) throw new Error("Pilot authority lock unavailable");
    const temporary = `${this.path}.next`;
    let ownedTemporary = false;
    try {
      let current: PilotState | null = null;
      try {
        current = JSON.parse(await readFile(this.path, "utf8")) as PilotState;
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
          throw error;
      }
      const { next, result } = change(current);
      const output = await open(temporary, "wx", 0o600);
      ownedTemporary = true;
      try {
        await output.writeFile(JSON.stringify(next));
        await output.sync();
      } finally {
        await output.close();
      }
      await rename(temporary, this.path);
      const directory = await open(dirname(this.path), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
      return result;
    } finally {
      // Only remove this transaction's files. Existing receipts/counters are never cleared.
      if (ownedTemporary) await unlink(temporary).catch(() => undefined);
      await lock.close();
      await unlink(lockPath);
    }
  }
}
