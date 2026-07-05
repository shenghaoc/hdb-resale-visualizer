import { describe, expect, it } from "vite-plus/test";
import { readBodyWithLimit } from "../../functions/_lib/d1";

describe("readBodyWithLimit", () => {
  it("returns a 400 response when the request body reader cannot be acquired", async () => {
    const request = {
      headers: new Headers({ "content-length": "1" }),
      body: {
        getReader() {
          throw new TypeError("stream is locked");
        },
      },
    } as unknown as Request;

    const result = await readBodyWithLimit(request, 1024);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
    await expect((result as Response).json()).resolves.toEqual({ error: "Bad Request" });
  });
});
