// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  capturePilotHttp,
  sanitizePilotSnippet,
  type HttpReceipt,
  type ReceiptJournal,
} from "../../scripts/neon-benchmark/pilot/evidence";
import { FileReceiptJournal } from "../../scripts/neon-benchmark/pilot/node-journal";
import { PilotController } from "../../scripts/neon-benchmark/pilot/controller";
import { createStatementDispatcher } from "../../scripts/neon-benchmark/pilot/dispatch";
import { admission, authorityFixture } from "../fixtures/neon-pilot";

function journalFixture() {
  const receipts: HttpReceipt[] = [];
  const journal: ReceiptJournal = {
    persist: async (receipt) => {
      receipts.push(structuredClone(receipt));
    },
  };
  return { journal, receipts };
}
describe("durable pilot HTTP evidence", () => {
  it("retains bounded sanitized control errors, safe headers, redirect and deployment identity", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = journalFixture();
    const password = "synthetic-private-password";
    const parse = vi.fn();
    await expect(
      capturePilotHttp({
        id: "control404",
        sequence: 1,
        method: "POST",
        label: "control",
        authority,
        journal,
        requestURL: "https://user:private@pilot.invalid/control/begin?token=private#private",
        redirectMode: "manual",
        captureErrorSnippet: true,
        secrets: [password],
        deployment: {
          workerName: "local-pilot",
          versionId: null,
          configSHA256: "a".repeat(64),
          entrypointSHA256: "b".repeat(64),
          uploadSHA256: "c".repeat(64),
        },
        fetchResponse: async () =>
          new Response("<html>" + password + "x".repeat(1000) + "</html>", {
            status: 404,
            headers: {
              "content-type": "text/html",
              "cf-ray": "0011223344556677-SIN",
              server: "cloudflare",
              location: "https://user:private@redirect.invalid/path?token=private#private",
              "set-cookie": "private-cookie",
              authorization: "private-header",
            },
          }),
        parse,
      }),
    ).rejects.toThrow("http-status");
    expect(parse).not.toHaveBeenCalled();
    const receipt = receipts.at(-1)!;
    expect(receipt).toMatchObject({
      status: 404,
      requestURL: "https://pilot.invalid/control/begin",
      redirectMode: "manual",
      redirected: false,
      redirectChain: null,
      finalMethod: "UNKNOWN",
      failure: "http-status",
      responseHeaders: {
        "cf-ray": "0011223344556677-SIN",
        server: "cloudflare",
        location: "https://redirect.invalid/path",
      },
      deployment: { workerName: "local-pilot" },
    });
    expect(new TextEncoder().encode(receipt.bodySnippet).length).toBeLessThanOrEqual(512);
    expect(receipt.responseBodyBytes).toBeGreaterThan(1000);
    expect(receipt.responseSHA256).toMatch(/^[a-f0-9]{64}$/);
    for (const secret of [
      password,
      "private-cookie",
      "private-header",
      "token=private",
      "user:private",
    ])
      expect(JSON.stringify(receipts)).not.toContain(secret);
  });
  it("records an observed handler method without inventing a redirect chain", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = journalFixture();
    const response = new Response('{"ok":true}', {
      headers: {
        "x-pilot-control-method": "GET",
        "x-pilot-control-path": "/control/begin",
        "x-pilot-control-protocol": "hdb-pilot-control-v1",
      },
    });
    Object.defineProperties(response, {
      url: { value: "https://pilot.invalid/control/begin" },
      redirected: { value: true },
    });
    await capturePilotHttp({
      id: "followed",
      sequence: 1,
      method: "POST",
      label: "control",
      authority,
      journal,
      redirectMode: "follow",
      requestURL: "https://pilot.invalid/redirect",
      fetchResponse: async () => response,
      parse: (body) => JSON.parse(body),
    });
    expect(receipts.at(-1)).toMatchObject({
      method: "POST",
      finalMethod: "GET",
      redirected: true,
      redirectChain: null,
      responseURL: "https://pilot.invalid/control/begin",
      responseHeaders: {
        "x-pilot-control-method": "GET",
        "x-pilot-control-path": "/control/begin",
      },
    });
  });
  it("keeps successful control bodies disabled and rejects redirects without parsing", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = journalFixture();
    await capturePilotHttp({
      id: "controlOK",
      sequence: 1,
      method: "GET",
      label: "control",
      authority,
      journal,
      captureErrorSnippet: true,
      fetchResponse: async () => new Response('{"token":"private-value"}'),
      parse: (body) => JSON.parse(body),
    });
    expect(receipts.at(-1)!.bodySnippet).toBe("[BODY_CAPTURE_DISABLED]");
    await expect(
      capturePilotHttp({
        id: "redirect",
        sequence: 2,
        method: "POST",
        label: "control",
        authority,
        journal,
        redirectMode: "manual",
        captureErrorSnippet: true,
        fetchResponse: async () =>
          new Response("redirect", { status: 307, headers: { location: "http://[invalid" } }),
        parse: (body) => JSON.parse(body),
      }),
    ).rejects.toThrow("http-status");
    expect(receipts.at(-1)!.responseHeaders).toEqual({
      "content-type": "text/plain;charset=UTF-8",
    });
    expect(JSON.stringify(receipts)).not.toContain("private-value");
  });
  it("persists intent before fetch and status before any parsing", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = journalFixture();
    const result = await capturePilotHttp({
      id: "http1",
      sequence: 1,
      method: "GET",
      label: "public-synthetic",
      authority,
      journal,
      capturePublicSyntheticSnippet: true,
      fetchResponse: async () => {
        expect(receipts[0]).toMatchObject({ stage: "intent", status: null });
        return new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
      },
      parse: (text) => {
        expect(receipts.at(-1)).toMatchObject({
          status: 200,
          stage: "parse",
          bodySnippet: '{"ok":true}',
        });
        return JSON.parse(text);
      },
    });
    expect(result).toEqual({ ok: true });
    expect(receipts.at(-1)).toMatchObject({
      stage: "complete",
      failure: "none",
      responseAvailable: true,
      applicationStatementsAfter: 0,
    });
    expect(receipts.at(-1)?.endedAtUTC).not.toBeNull();
  });
  it.each([403, 502])("retains HTTP %i and a non-JSON body without parsing it", async (status) => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = journalFixture();
    const parse = vi.fn();
    await expect(
      capturePilotHttp({
        id: "http1",
        sequence: 1,
        method: "GET",
        label: "public-synthetic",
        authority,
        journal,
        capturePublicSyntheticSnippet: true,
        fetchResponse: async () => new Response("Forbidden: synthetic", { status }),
        parse,
      }),
    ).rejects.toThrow("http-status");
    expect(parse).not.toHaveBeenCalled();
    expect(receipts.at(-1)).toMatchObject({
      status,
      bodySnippet: "Forbidden: synthetic",
      failure: "http-status",
      responseAvailable: true,
    });
  });
  it.each(["malformed {", "<html>synthetic edge error</html>"])(
    "retains malformed/non-JSON success body %s",
    async (body) => {
      const { authority } = await authorityFixture();
      const { journal, receipts } = journalFixture();
      await expect(
        capturePilotHttp({
          id: "http1",
          sequence: 1,
          method: "POST",
          label: "public-synthetic",
          authority,
          journal,
          capturePublicSyntheticSnippet: true,
          fetchResponse: async () => new Response(body),
          parse: (body) => JSON.parse(body),
        }),
      ).rejects.toThrow("parse");
      expect(receipts.at(-1)).toMatchObject({
        status: 200,
        bodySnippet: body,
        failureStage: "parse",
        errorName: "SyntaxError",
      });
    },
  );
  it("retains status/body when the metrics header itself is malformed", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = journalFixture();
    await expect(
      capturePilotHttp({
        id: "http1",
        sequence: 1,
        method: "GET",
        label: "public-synthetic",
        authority,
        journal,
        capturePublicSyntheticSnippet: true,
        fetchResponse: async () =>
          new Response('{"ok":true}', { headers: { "x-pilot-metrics": "broken{" } }),
        parse: (text, response) => {
          JSON.parse(response.headers.get("x-pilot-metrics")!);
          return JSON.parse(text);
        },
      }),
    ).rejects.toThrow("parse");
    expect(receipts.at(-1)).toMatchObject({
      status: 200,
      bodySnippet: '{"ok":true}',
      failureStage: "parse",
    });
  });
  it.each(["AbortError", "TimeoutError"])(
    "retains %s before headers without assuming a response",
    async (name) => {
      const { authority } = await authorityFixture();
      const { journal, receipts } = journalFixture();
      await expect(
        capturePilotHttp({
          id: "http1",
          sequence: 1,
          method: "GET",
          label: "public-synthetic",
          authority,
          journal,
          fetchResponse: async () => {
            throw Object.assign(Error("sensitive message"), { name });
          },
          parse: (body) => JSON.parse(body),
        }),
      ).rejects.toThrow();
      expect(receipts.at(-1)).toMatchObject({
        status: null,
        responseAvailable: false,
        failureStage: "transport",
        errorName: name,
      });
      expect(JSON.stringify(receipts)).not.toContain("sensitive message");
    },
  );
  it("retains an aborted body after headers and partial bytes", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = journalFixture();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulls++ === 0) controller.enqueue(new TextEncoder().encode("public partial"));
        else controller.error(Object.assign(Error("aborted"), { name: "AbortError" }));
      },
    });
    await expect(
      capturePilotHttp({
        id: "http1",
        sequence: 1,
        method: "GET",
        label: "public-synthetic",
        authority,
        journal,
        capturePublicSyntheticSnippet: true,
        fetchResponse: async () => new Response(body),
        parse: (body) => JSON.parse(body),
      }),
    ).rejects.toThrow("abort");
    expect(receipts.at(-1)).toMatchObject({
      status: 200,
      responseAvailable: true,
      failure: "abort",
      failureStage: "body",
    });
    expect(receipts.at(-1)!.responseBodyBytes).toBeGreaterThan(0);
  });
  it("bounds snippets/body retention and stops oversized responses", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = journalFixture();
    await expect(
      capturePilotHttp({
        id: "http1",
        sequence: 1,
        method: "GET",
        label: "public-synthetic",
        authority,
        journal,
        capturePublicSyntheticSnippet: true,
        fetchResponse: async () => new Response("x".repeat(2_000_001)),
        parse: (body) => JSON.parse(body),
      }),
    ).rejects.toThrow("body-limit");
    expect(receipts.at(-1)).toMatchObject({ status: 200, failure: "body-limit" });
    expect(new TextEncoder().encode(receipts.at(-1)!.bodySnippet).byteLength).toBeLessThanOrEqual(
      512,
    );
  });
  it("disables auth/control bodies and redacts credentials, including partial known values", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = journalFixture();
    await capturePilotHttp({
      id: "http1",
      sequence: 1,
      method: "GET",
      label: "control",
      authority,
      journal,
      fetchResponse: async () =>
        new Response('{"password":"private-password"}', {
          headers: { "set-cookie": "private-cookie", authorization: "private-header" },
        }),
      parse: (body) => JSON.parse(body),
    });
    const serialized = JSON.stringify(receipts);
    for (const secret of ["private-password", "private-cookie", "private-header"])
      expect(serialized).not.toContain(secret);
    expect(sanitizePilotSnippet('{"password":"abcd","token":"partial')).not.toContain("abcd");
    expect(sanitizePilotSnippet("public shortpas", ["shortpassword"])).not.toContain("shortpas");
    expect(sanitizePilotSnippet("postgresql://user:password@hostname/database")).not.toContain(
      "password@hostname",
    );
    expect(
      new TextEncoder().encode(sanitizePilotSnippet("🌟".repeat(300))).byteLength,
    ).toBeLessThanOrEqual(512);
  });
  it("does not dispatch if intent persistence fails", async () => {
    const { authority } = await authorityFixture();
    const fetchResponse = vi.fn();
    await expect(
      capturePilotHttp({
        id: "http1",
        sequence: 1,
        method: "GET",
        label: "public",
        authority,
        journal: {
          persist: async () => {
            throw Error("unavailable");
          },
        },
        fetchResponse,
        parse: (body) => JSON.parse(body),
      }),
    ).rejects.toThrow("evidence");
    expect(fetchResponse).not.toHaveBeenCalled();
  });
  it("keeps a missing after-count unknown and retains earlier receipts if final writes fail", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = journalFixture();
    let called = 0;
    const snapshot = authority.snapshot.bind(authority);
    authority.snapshot = async () => {
      if (called++ > 0) throw Error("lost authority");
      return snapshot();
    };
    await expect(
      capturePilotHttp({
        id: "http1",
        sequence: 1,
        method: "GET",
        label: "public",
        authority,
        journal,
        fetchResponse: async () => new Response("{}"),
        parse: (body) => JSON.parse(body),
      }),
    ).rejects.toThrow("evidence");
    expect(receipts.at(-1)).toMatchObject({
      applicationStatementsAfter: null,
      applicationAccountingAvailableAfter: false,
    });
    const next = await authorityFixture();
    const saved: HttpReceipt[] = [];
    await expect(
      capturePilotHttp({
        id: "http2",
        sequence: 2,
        method: "GET",
        label: "public",
        authority: next.authority,
        journal: {
          persist: async (record) => {
            if (record.endedAtUTC) throw Error("final write failed");
            saved.push(structuredClone(record));
          },
        },
        fetchResponse: async () => new Response("{}"),
        parse: (body) => JSON.parse(body),
      }),
    ).rejects.toThrow("evidence");
    expect(saved[0].stage).toBe("intent");
    expect(saved.at(-1)?.status).toBe(200);
  });
  it("unknown accepted outcomes retain SQL permits and full transfer leases through cleanup", async () => {
    const { authority } = await authorityFixture();
    const { journal, receipts } = journalFixture();
    const controller = new PilotController(authority, journal);
    const send = vi.fn(async () => []);
    await expect(
      controller.request({
        ...admission(),
        label: "synthetic-accepted-response-lost",
        parse: (body) => JSON.parse(body),
        fetchResponse: async () => {
          await authority.activateRequest("request1");
          await createStatementDispatcher({ authority, requestId: "request1" })(
            "SELECT 1",
            [],
            send,
          );
          throw Object.assign(Error("response lost"), { name: "AbortError" });
        },
      }),
    ).rejects.toThrow("abort");
    const cleanup = await controller.cleanup([
      async () => {
        throw Error("private cleanup error");
      },
      async () => {},
    ]);
    expect(cleanup).toEqual([{ index: 0, failed: true }]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(receipts.at(-1)).toMatchObject({ failure: "abort", applicationStatementsAfter: 1 });
    const state = await authority.snapshot();
    expect(state.applicationStatements).toBe(1);
    expect(state.receivedDatabaseBytesReserved).toBe(2_000_000);
    expect(state.requests[0].outcome).toBe("failed-unknown");
    expect(state.stopped).toBe(true);
  });
  it("append-only fsynced receipts survive failed cleanup and can be replayed locally", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hdb-pilot-journal-"));
    try {
      const path = join(directory, "receipts.jsonl");
      const { authority } = await authorityFixture();
      const controller = new PilotController(authority, new FileReceiptJournal(path));
      await expect(
        controller.request({
          ...admission(),
          label: "synthetic",
          capturePublicSyntheticSnippet: true,
          fetchResponse: async () => new Response("not JSON"),
          parse: (body) => JSON.parse(body),
        }),
      ).rejects.toThrow("parse");
      const before = await readFile(path, "utf8");
      await controller.cleanup([
        async () => {
          throw Error("cleanup failed");
        },
      ]);
      expect(await readFile(path, "utf8")).toBe(before);
      const history = before
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as HttpReceipt);
      expect(history[0].stage).toBe("intent");
      expect(history.at(-1)).toMatchObject({
        status: 200,
        failure: "parse",
        bodySnippet: "not JSON",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
