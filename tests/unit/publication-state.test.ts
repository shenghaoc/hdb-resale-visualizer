// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import {
  PUBLICATION_MARKER_KEY,
  PUBLICATION_OWNER_JSON_PATH,
  manifestVersion,
  publicationLabel,
  readPublicationState,
  stampPublicationMarker,
} from "../../shared/publication-state";

const manifest = JSON.stringify({
  schemaVersion: "2.0.0",
  generatedAt: "2026-08-29T01:37:16.797Z",
  counts: { blocks: 9730 },
});
const SHA = /^[a-f0-9]{64}$/;

describe("manifestVersion", () => {
  it("is the SHA-256 of the exact stored text", async () => {
    expect(await manifestVersion(manifest)).toBe(
      createHash("sha256").update(manifest, "utf8").digest("hex"),
    );
    expect(await manifestVersion(`${manifest} `)).not.toBe(await manifestVersion(manifest));
  });
});

describe("readPublicationState", () => {
  it("reports a manifest without the marker as published", () => {
    expect(readPublicationState(manifest)).toEqual({ inProgress: false });
  });

  it("reports the base version of a valid marker", async () => {
    const stamped = await stamp(manifest);
    expect(readPublicationState(stamped)).toEqual({
      inProgress: true,
      reason: "marker",
      baseVersion: await manifestVersion(manifest),
      startedAt: "2026-10-07T01:00:00.000Z",
    });
  });

  it("treats a marker without a usable base as in progress with no base to serve", () => {
    for (const marker of [
      {},
      { baseVersion: "not-a-hash" },
      { baseVersion: 12 },
      { baseVersion: "A".repeat(64) },
      "yes",
      null,
    ])
      expect(
        readPublicationState(
          JSON.stringify({ generatedAt: "x", [PUBLICATION_MARKER_KEY]: marker }),
        ),
      ).toEqual({ inProgress: true, reason: "marker", baseVersion: null, startedAt: null });
  });

  it("refuses to treat a manifest it cannot read as one generation, and says why", () => {
    for (const unreadable of ["", "{", "v2", "null", "[]", '"text"', "12"])
      expect(readPublicationState(unreadable)).toEqual({
        inProgress: true,
        reason: "unreadable",
        baseVersion: null,
        startedAt: null,
      });
  });
});

const stamp = (json: string | null, startedAt = "2026-10-07T01:00:00.000Z", owner = "owner-a") =>
  stampPublicationMarker(json, startedAt, owner);

describe("stampPublicationMarker", () => {
  it("keeps every manifest key and its order, and appends the marker last", async () => {
    const stamped = JSON.parse(await stamp(manifest));
    expect(Object.keys(stamped)).toEqual([
      "schemaVersion",
      "generatedAt",
      "counts",
      PUBLICATION_MARKER_KEY,
    ]);
    expect(stamped.counts).toEqual({ blocks: 9730 });
    expect(stamped[PUBLICATION_MARKER_KEY]).toEqual({
      baseVersion: await manifestVersion(manifest),
      startedAt: "2026-10-07T01:00:00.000Z",
      owner: "owner-a",
    });
    expect(stamped[PUBLICATION_MARKER_KEY].baseVersion).toMatch(SHA);
  });

  it("changes the manifest text, which is what makes the cache's before/after comparison sound", async () => {
    const stamped = await stamp(manifest);
    expect(stamped).not.toBe(manifest);
    expect(await manifestVersion(stamped)).not.toBe(await manifestVersion(manifest));
  });

  it("hands the marker to the run that stamps last, keeping the base of the unfinished publication", async () => {
    const first = await stamp(manifest, "2026-10-07T01:00:00.000Z", "owner-a");
    const second = await stamp(first, "2026-10-07T02:00:00.000Z", "owner-b");
    expect(JSON.parse(second)[PUBLICATION_MARKER_KEY]).toEqual({
      baseVersion: await manifestVersion(manifest),
      startedAt: "2026-10-07T02:00:00.000Z",
      owner: "owner-b",
    });
    expect(
      Object.keys(JSON.parse(second)).filter((key) => key === PUBLICATION_MARKER_KEY),
    ).toHaveLength(1);
  });

  it("falls back to the unmarked text when an earlier marker has no usable base", async () => {
    const damaged = JSON.stringify({ ...JSON.parse(manifest), [PUBLICATION_MARKER_KEY]: {} });
    const stamped = JSON.parse(await stamp(damaged));
    expect(stamped[PUBLICATION_MARKER_KEY].baseVersion).toBe(await manifestVersion(manifest));
  });

  it("stands alone as a placeholder when there is nothing readable to preserve", async () => {
    // The first publication (no stored manifest) and a stored manifest that is not a JSON object.
    for (const nothing of [null, "[]", "null", '"x"', "7", "{", ""]) {
      const placeholder = JSON.parse(await stamp(nothing, "t", "owner-a"));
      expect(placeholder).toEqual({
        [PUBLICATION_MARKER_KEY]: { baseVersion: null, startedAt: "t", owner: "owner-a" },
      });
      // The cache treats it as an unfinished publication with no previous generation to serve.
      expect(readPublicationState(JSON.stringify(placeholder))).toEqual({
        inProgress: true,
        reason: "marker",
        baseVersion: null,
        startedAt: "t",
      });
    }
  });

  it("keeps a placeholder's lack of a base when it is stamped again", async () => {
    const first = await stamp(null, "t1", "owner-a");
    const second = JSON.parse(await stamp(first, "t2", "owner-b"));
    expect(second).toEqual({
      [PUBLICATION_MARKER_KEY]: { baseVersion: null, startedAt: "t2", owner: "owner-b" },
    });
  });

  it("exposes the owner at the JSON path the publisher uses for its conditional writes", async () => {
    const document = JSON.parse(await stamp(manifest, "t", "owner-a"));
    const path = PUBLICATION_OWNER_JSON_PATH.replace(/^\$\./, "").split(".");
    expect(path.reduce((value, key) => value?.[key], document)).toBe("owner-a");
  });
});

describe("publicationLabel", () => {
  /** The three fields the labelled SQL returns for a stored manifest text: sha256, jsonb_typeof, marker text. */
  async function sqlFields(text: string) {
    const document: unknown = JSON.parse(text);
    const type = Array.isArray(document)
      ? "array"
      : document === null
        ? "null"
        : typeof document === "object"
          ? "object"
          : typeof document;
    const marker =
      type === "object" && Object.hasOwn(document as object, PUBLICATION_MARKER_KEY)
        ? JSON.stringify((document as Record<string, unknown>)[PUBLICATION_MARKER_KEY])
        : null;
    return [await manifestVersion(text), type, marker] as const;
  }

  it("agrees with reading the full manifest, for every state a manifest can be in", async () => {
    const texts = [
      manifest,
      await stamp(manifest),
      await stamp(await stamp(manifest)),
      JSON.stringify({
        [PUBLICATION_MARKER_KEY]: {
          baseVersion: null,
          startedAt: "2026-10-07T01:00:00.000Z",
          owner: "a",
        },
      }),
      JSON.stringify({ ...JSON.parse(manifest), [PUBLICATION_MARKER_KEY]: null }),
      JSON.stringify({
        ...JSON.parse(manifest),
        [PUBLICATION_MARKER_KEY]: { baseVersion: "not-a-version" },
      }),
      JSON.stringify({ ...JSON.parse(manifest), [PUBLICATION_MARKER_KEY]: "text" }),
      "[]",
      "null",
      '"a string"',
      "42",
      "true",
    ];
    for (const text of texts) {
      const label = publicationLabel(...(await sqlFields(text)));
      expect(label, text).toEqual({
        version: await manifestVersion(text),
        state: readPublicationState(text),
      });
    }
  });

  it("refuses fields it cannot trust", () => {
    const good = "a".repeat(64);
    expect(() => publicationLabel(undefined, "object", null)).toThrow("version");
    expect(() => publicationLabel("A".repeat(64), "object", null)).toThrow("version");
    expect(() => publicationLabel(good.slice(1), "object", null)).toThrow("version");
    expect(() => publicationLabel(good, undefined, null)).toThrow("shape");
    expect(() => publicationLabel(good, "object", 5)).toThrow("shape");
    expect(publicationLabel(good, "object", null)).toEqual({
      version: good,
      state: { inProgress: false },
    });
  });
});
