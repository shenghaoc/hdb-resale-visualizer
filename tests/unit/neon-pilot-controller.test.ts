// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";
import {
  AtomicPilotAuthority,
  type AtomicPilotStore,
  type PilotState,
} from "../../scripts/neon-benchmark/pilot/accounting";
import { PilotController } from "../../scripts/neon-benchmark/pilot/controller";
import { createStatementDispatcher } from "../../scripts/neon-benchmark/pilot/dispatch";
import { capturePilotHttp, type HttpReceipt } from "../../scripts/neon-benchmark/pilot/evidence";
import {
  transactionalPilotStore,
  type TransactionStorage,
} from "../../scripts/neon-benchmark/pilot/transactional-store";
import { admission, authorityFixture, SerialTestStore } from "../fixtures/neon-pilot";

function recordingJournal() {
  const receipts: HttpReceipt[] = [];
  return {
    receipts,
    journal: {
      persist: async (receipt: HttpReceipt) => {
        receipts.push(structuredClone(receipt));
      },
    },
  };
}

describe("controller and Worker share prospective admission", () => {
  it("counts owner SET and independent Worker dispatch in one monotonically growing pool", async () => {
    const { authority, store } = await authorityFixture();
    const { journal, receipts } = recordingJournal();
    const controller = new PilotController(authority, journal);
    const workerAuthority = new AtomicPilotAuthority(store, "synthetic-run", () => 1000);
    const send = vi.fn(async () => []);
    await controller.ownerStatements(
      admission("owner", { method: "GET", maximumStatements: 1 }),
      (dispatch) => dispatch("SET application_name='synthetic'", [], send),
    );
    await controller.request({
      ...admission("worker", { sequence: 2, maximumStatements: 3 }),
      label: "public-synthetic",
      parse: (body) => JSON.parse(body),
      fetchResponse: async () => {
        await workerAuthority.activateRequest("worker");
        const dispatch = createStatementDispatcher({
          authority: workerAuthority,
          requestId: "worker",
        });
        await dispatch("BEGIN READ ONLY", [], send);
        await dispatch("SELECT 1", [], send);
        await dispatch("COMMIT", [], send);
        return new Response("{}");
      },
    });
    expect((await authority.snapshot()).applicationStatements).toBe(4);
    expect(receipts.at(-1)).toMatchObject({
      applicationStatementsBefore: 1,
      applicationStatementsAfter: 4,
    });
    expect(
      (await workerAuthority.snapshot()).statements.map((record) => record.applicationSequence),
    ).toEqual([1, 2, 3, 4]);
  });

  it("records request intent and admission failure before any HTTP send", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = recordingJournal();
    const controller = new PilotController(authority, journal);
    const fetchResponse = vi.fn();
    await expect(
      controller.request({
        ...admission("over", { maximumStatements: 81 }),
        label: "public-synthetic",
        fetchResponse,
        parse: (body) => JSON.parse(body),
      }),
    ).rejects.toThrow("admission");
    expect(fetchResponse).not.toHaveBeenCalled();
    expect(receipts[0].stage).toBe("intent");
    expect(receipts.at(-1)).toMatchObject({
      failure: "admission",
      status: null,
      applicationStatementsAfter: 0,
    });
  });

  it("uses the same bounded recorder for control-plane errors and cleanup HTTP", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = recordingJournal();
    const controller = new PilotController(authority, journal);
    await expect(
      controller.controlRequest({
        id: "control1",
        sequence: 1,
        method: "POST",
        label: "control-create",
        parse: (body) => JSON.parse(body),
        fetchResponse: async () =>
          new Response('{"token":"hidden-synthetic-value"}', { status: 403 }),
      }),
    ).rejects.toThrow("http-status");
    const failures = await controller.cleanup([
      async () => {
        await controller.controlRequest({
          id: "control2",
          sequence: 2,
          method: "DELETE",
          label: "control-delete",
          parse: (body) => JSON.parse(body),
          fetchResponse: async () => new Response("not JSON", { status: 502 }),
        });
      },
    ]);
    expect(failures).toEqual([{ index: 0, failed: true }]);
    expect(receipts.filter((record) => record.endedAtUTC).map((record) => record.status)).toEqual([
      403, 502,
    ]);
    expect(JSON.stringify(receipts)).not.toContain("hidden-synthetic-value");
    const state = await authority.snapshot();
    expect(state.applicationStatements).toBe(0);
    expect(state.comparablePOSTs).toBe(0);
    expect(state.stopped).toBe(true);
  });

  it("refuses connection 14 and sent-byte reservation overflow without refunds", async () => {
    const { authority } = await authorityFixture();
    for (let index = 1; index <= 13; index++) {
      const id = `connection${index}`;
      await authority.admitRequest(
        admission(id, {
          sequence: index,
          method: "GET",
          maximumStatements: 1,
          maximumReceivedDatabaseBytes: 1,
          maximumSentDatabaseBytes: 1,
        }),
      );
      await authority.finishRequest(id, "complete");
    }
    await expect(
      authority.admitRequest(
        admission("connection14", {
          sequence: 14,
          method: "GET",
          maximumReceivedDatabaseBytes: 1,
          maximumSentDatabaseBytes: 1,
        }),
      ),
    ).rejects.toThrow("admission");
    const next = await authorityFixture();
    await expect(
      next.authority.admitRequest(admission("overflow", { maximumSentDatabaseBytes: 1_000_001 })),
    ).rejects.toThrow("admission");
    expect((await next.authority.snapshot()).connectionAdmissions).toBe(0);
  });

  it("reserves full request wall time before admission and expires statement permits", async () => {
    let now = 0;
    const authority = new AtomicPilotAuthority(new SerialTestStore(), "clocked", () => now);
    await authority.initialize();
    now = 200_000;
    await expect(authority.admitRequest(admission("slow", { method: "GET" }))).rejects.toThrow(
      "duration",
    );
    now = 100_000;
    await authority.admitRequest(admission("request1", { maximumWallMs: 5000 }));
    await authority.activateRequest("request1");
    now += 5000;
    const send = vi.fn();
    await expect(
      createStatementDispatcher({ authority, requestId: "request1" })("SELECT 1", [], send),
    ).rejects.toThrow("AUTHORIZATION");
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["authorization", "completion"])(
    "fails closed on %s persistence without refund or retry",
    async (fault) => {
      const backing = new SerialTestStore();
      let enabled = false;
      const store: AtomicPilotStore = {
        transact: (change) =>
          backing.transact((current) => {
            const changeResult = change(current);
            if (
              enabled &&
              current &&
              (fault === "authorization"
                ? changeResult.next.applicationStatements > current.applicationStatements
                : changeResult.next.statements.some(
                    (record) => record.outcome !== "authorized-unknown",
                  ))
            )
              throw Error("Synthetic disk loss");
            return changeResult;
          }),
      };
      const authority = new AtomicPilotAuthority(store, "fault", () => 1000);
      await authority.initialize();
      await authority.admitRequest(admission());
      await authority.activateRequest("request1");
      enabled = true;
      const send = vi.fn(async () => []);
      await expect(
        createStatementDispatcher({ authority, requestId: "request1" })("SELECT 1", [], send),
      ).rejects.toThrow(fault === "authorization" ? "AUTHORIZATION" : "EVIDENCE");
      expect(send).toHaveBeenCalledTimes(fault === "authorization" ? 0 : 1);
      enabled = false;
      const state = await authority.snapshot();
      expect(state.applicationStatements).toBe(fault === "authorization" ? 0 : 1);
      if (fault === "completion") expect(state.statements[0].outcome).toBe("authorized-unknown");
    },
  );

  it("rejects a corrupt persisted counter rather than silently reconstructing or resetting it", async () => {
    const { authority, store } = await authorityFixture();
    await store.transact((current) => {
      const state = current!;
      state.applicationStatements = 1;
      return { next: state, result: undefined };
    });
    await expect(authority.snapshot()).rejects.toThrow("Corrupt");
    await expect(authority.admitRequest(admission())).rejects.toThrow("Corrupt");
  });

  it("serializes separate transactional adapters sharing one durable storage authority", async () => {
    let value: unknown;
    let tail: Promise<unknown> = Promise.resolve();
    const storage: TransactionStorage = {
      transaction: (action) => {
        const operation = tail.then(async () => {
          let pending = structuredClone(value);
          const result = await action({
            get: async <TValue>() => structuredClone(pending) as TValue | undefined,
            put: async (_key, next) => {
              pending = structuredClone(next);
            },
          });
          value = pending;
          return result;
        });
        tail = operation.catch(() => undefined);
        return operation;
      },
    };
    const first = new AtomicPilotAuthority(transactionalPilotStore(storage), "shared", () => 1000);
    const second = new AtomicPilotAuthority(transactionalPilotStore(storage), "shared", () => 1000);
    await first.initialize();
    await first.admitRequest(admission("cleanup", { purpose: "cleanup", maximumStatements: 90 }));
    await first.activateRequest("cleanup");
    const driver = vi.fn(async () => []);
    const a = createStatementDispatcher({
      authority: first,
      requestId: "cleanup",
      defaultPurpose: "cleanup",
    });
    // Different sequence offsets represent distinct clients, not replay of a driver call.
    await Promise.all(Array.from({ length: 90 }, () => a("SELECT 1", [], driver)));
    await expect(
      createStatementDispatcher({
        authority: second,
        requestId: "cleanup",
        defaultPurpose: "cleanup",
      })("SELECT 1", [], driver),
    ).rejects.toThrow("AUTHORIZATION");
    expect(driver).toHaveBeenCalledTimes(90);
    expect((value as PilotState).applicationStatements).toBe(90);
  });

  it("retains intent on authority loss before transport and whitelists transport causes", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = recordingJournal();
    authority.snapshot = async () => {
      throw Error("Authority secret withheld");
    };
    const fetchResponse = vi.fn();
    await expect(
      capturePilotHttp({
        id: "early",
        sequence: 1,
        method: "GET",
        label: "public-synthetic",
        authority,
        journal,
        fetchResponse,
        parse: (body) => JSON.parse(body),
      }),
    ).rejects.toThrow("evidence");
    expect(fetchResponse).not.toHaveBeenCalled();
    expect(receipts[0].stage).toBe("intent");
    expect(receipts.at(-1)).toMatchObject({
      applicationStatementsBefore: null,
      applicationStatementsAfter: null,
      responseAvailable: false,
    });
    const next = await authorityFixture();
    await expect(
      capturePilotHttp({
        id: "network",
        sequence: 2,
        method: "GET",
        label: "public-synthetic",
        authority: next.authority,
        journal,
        fetchResponse: async () => {
          throw new TypeError("Sensitive URL withheld", {
            cause: Object.assign(Error("Sensitive host withheld"), { code: "ENOTFOUND" }),
          });
        },
        parse: (body) => JSON.parse(body),
      }),
    ).rejects.toThrow("transport");
    expect(receipts.at(-1)).toMatchObject({
      transportCode: "ENOTFOUND",
      errorName: "TypeError",
      failureStage: "transport",
    });
    expect(JSON.stringify(receipts)).not.toContain("Sensitive");
  });

  it("enforces HTTP timeout and cancels before dispatch for an already-aborted signal", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = recordingJournal();
    await expect(
      capturePilotHttp({
        id: "timeout",
        sequence: 1,
        method: "GET",
        label: "public-synthetic",
        authority,
        journal,
        timeoutMs: 1,
        fetchResponse: async () => new Promise<Response>(() => {}),
        parse: (body) => JSON.parse(body),
      }),
    ).rejects.toThrow("timeout");
    expect(receipts.at(-1)).toMatchObject({
      failure: "timeout",
      status: null,
      endedAtUTC: expect.any(String),
    });
    const fetchResponse = vi.fn();
    await expect(
      capturePilotHttp({
        id: "aborted",
        sequence: 2,
        method: "GET",
        label: "public-synthetic",
        authority,
        journal,
        signal: AbortSignal.abort(),
        fetchResponse,
        parse: (body) => JSON.parse(body),
      }),
    ).rejects.toThrow("abort");
    expect(fetchResponse).not.toHaveBeenCalled();
  });
});
