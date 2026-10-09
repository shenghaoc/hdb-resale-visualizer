// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";
import { AtomicPilotAuthority } from "../../scripts/neon-benchmark/pilot/accounting";
import { boundedPilotStore } from "../../scripts/neon-benchmark/pilot/bounded-store";
import { createStatementDispatcher } from "../../scripts/neon-benchmark/pilot/dispatch";
import { admission, SerialTestStore } from "../fixtures/neon-pilot";

describe("isolated tiny diagnostic ceiling", () => {
  it("allows request A's two and request B's first but refuses fourth before driver", async () => {
    const store = new SerialTestStore();
    const first = new AtomicPilotAuthority(boundedPilotStore(store, 3), "diagnostic", () => 1000);
    const second = new AtomicPilotAuthority(boundedPilotStore(store, 3), "diagnostic", () => 1000);
    await first.initialize();
    const send = vi.fn(async () => []);
    const trace: string[] = [];
    const beforeDriverSend = async (permit: { id: string }) => {
      trace.push(permit.id);
    };
    await first.admitRequest(admission("A", { method: "GET", maximumStatements: 2 }));
    await first.activateRequest("A");
    const a = createStatementDispatcher({ authority: first, requestId: "A", beforeDriverSend });
    await a("SELECT 1", [], send);
    await a("SELECT 2", [], send);
    await first.finishRequest("A", "complete");
    await second.admitRequest(admission("B", { method: "GET", sequence: 2, maximumStatements: 2 }));
    await second.activateRequest("B");
    const b = createStatementDispatcher({ authority: second, requestId: "B", beforeDriverSend });
    await b("SELECT 1", [], send);
    await expect(b("SELECT 2", [], send)).rejects.toThrow("AUTHORIZATION");
    expect(send).toHaveBeenCalledTimes(3);
    expect(trace).toEqual(["A:s1", "A:s2", "B:s1"]);
    expect((await first.snapshot()).applicationStatements).toBe(3);
    expect((await second.snapshot()).statements.map((r) => r.applicationSequence)).toEqual([
      1, 2, 3,
    ]);
  });
  it("refuses concurrent claims beyond one, without reserving from another pilot's 90", async () => {
    const store = new SerialTestStore();
    const authority = new AtomicPilotAuthority(
      boundedPilotStore(store, 1),
      "concurrent",
      () => 1000,
    );
    await authority.initialize();
    await authority.admitRequest(admission("C", { method: "GET", maximumStatements: 2 }));
    await authority.activateRequest("C");
    const send = vi.fn(async () => []);
    const dispatch = createStatementDispatcher({ authority, requestId: "C" });
    const results = await Promise.allSettled([
      dispatch("SELECT 1", [], send),
      dispatch("SELECT 2", [], send),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
    const other = new AtomicPilotAuthority(new SerialTestStore(), "comparable", () => 1000);
    await other.initialize();
    expect((await other.snapshot()).applicationStatements).toBe(0);
  });
  it("rejects widening and refuses send when durable dispatch trace fails", async () => {
    for (const value of [0, -1, 91, 1.5])
      expect(() => boundedPilotStore(new SerialTestStore(), value)).toThrow("Invalid");
    const authority = new AtomicPilotAuthority(
      boundedPilotStore(new SerialTestStore(), 1),
      "trace",
      () => 1000,
    );
    await authority.initialize();
    await authority.admitRequest(admission());
    await authority.activateRequest("request1");
    const send = vi.fn();
    const dispatch = createStatementDispatcher({
      authority,
      requestId: "request1",
      beforeDriverSend: async () => {
        throw Error("Synthetic disk loss");
      },
    });
    await expect(dispatch("SELECT 1", [], send)).rejects.toThrow("EVIDENCE");
    expect(send).not.toHaveBeenCalled();
    expect((await authority.snapshot()).statements[0].outcome).toBe("authorized-unknown");
  });
});
