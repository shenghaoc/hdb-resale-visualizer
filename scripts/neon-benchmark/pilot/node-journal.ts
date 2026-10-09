import { open } from "node:fs/promises";
import { dirname } from "node:path";
import type { HttpReceipt, ReceiptJournal } from "./evidence";

/** Append-only, fsynced receipts. Cleanup has no API capable of clearing this history. */
export class FileReceiptJournal implements ReceiptJournal {
  constructor(private readonly path: string) {}

  async persist(receipt: HttpReceipt): Promise<void> {
    const bytes = new TextEncoder().encode(`${JSON.stringify(receipt)}\n`);
    if (bytes.byteLength > 8192) throw new Error("Pilot receipt exceeds bounded journal record");
    const output = await open(this.path, "a", 0o600);
    try {
      const written = await output.write(bytes);
      if (written.bytesWritten !== bytes.byteLength) throw new Error("Incomplete receipt write");
      await output.sync();
    } finally {
      await output.close();
    }
    const directory = await open(dirname(this.path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
}
