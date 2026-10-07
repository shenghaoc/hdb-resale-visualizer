/**
 * The D1 publication marker, shared by the publisher (`scripts/lib/sync/store.ts`) and the Worker's
 * public-data cache (`worker/public-data-cache.ts`).
 *
 * `writeArtifactsToD1` replaces the generated tables through many separate D1 requests (about half an hour at
 * production scale) and writes the manifest last, so for that whole window the manifest still describes the
 * previous generation while the tables underneath it are being replaced. The cache treats "the same manifest
 * text before and after the handler" as proof that the handler saw one generation, which is only true if the
 * manifest text changes before the first table is touched.
 *
 * The publisher therefore stamps `publicationInProgress` into the stored manifest first. The final manifest
 * write replaces the whole document, which removes the marker in that same statement; nothing else clears it,
 * so an aborted publication stays marked until a later one completes. While the marker is present the cache
 * stores nothing and serves the generation named by `baseVersion` if it is still cached. The marker is internal
 * bookkeeping: `GET /api/manifest` projects it away (`shared/manifest-contract.ts`).
 *
 * `owner` identifies the run that stamped the marker last. Two overlapping runs cannot both finish "cleanly":
 * the publisher checks ownership between phases and makes its final write conditional on it, so a run that
 * another run has superseded stops, and can never remove the marker of the run that still owns it. (Overlapping
 * publishers stay unsupported; this only keeps the cache from being told a half-written table set is complete.)
 */
export const PUBLICATION_MARKER_KEY = "publicationInProgress";
/** SQLite JSON path of the owner inside the stored manifest, for conditional writes in `scripts/lib/sync/store.ts`. */
export const PUBLICATION_OWNER_JSON_PATH = `$.${PUBLICATION_MARKER_KEY}.owner`;

const VERSION_PATTERN = /^[a-f0-9]{64}$/;

type Plain = Record<string, unknown>;
const isPlain = (value: unknown): value is Plain =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type PublicationState =
  | { inProgress: false }
  | {
      inProgress: true;
      /** Why nothing may be cached: a publisher's marker, or a manifest that cannot be read at all. */
      reason: "marker" | "unreadable";
      /** The last complete generation, when the marker names a valid one. */
      baseVersion: string | null;
      /** When the marked publication started, when the marker says. */
      startedAt: string | null;
    };

/** The identity of a published generation: the SHA-256 of the exact stored manifest text. */
export async function manifestVersion(json: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function baseVersionOf(marker: unknown): string | null {
  return isPlain(marker) &&
    typeof marker.baseVersion === "string" &&
    VERSION_PATTERN.test(marker.baseVersion)
    ? marker.baseVersion
    : null;
}

/**
 * Whether a stored manifest marks an unfinished publication. A manifest that cannot be read as a JSON object
 * counts as unfinished: nothing may be cached from a generation that cannot be identified.
 */
export function readPublicationState(json: string): PublicationState {
  const unreadable = {
    inProgress: true,
    reason: "unreadable",
    baseVersion: null,
    startedAt: null,
  } as const;
  let document: unknown;
  try {
    document = JSON.parse(json);
  } catch {
    return unreadable;
  }
  if (!isPlain(document)) return unreadable;
  if (!Object.hasOwn(document, PUBLICATION_MARKER_KEY)) return { inProgress: false };
  const marker = document[PUBLICATION_MARKER_KEY];
  return {
    inProgress: true,
    reason: "marker",
    baseVersion: baseVersionOf(marker),
    startedAt: isPlain(marker) && typeof marker.startedAt === "string" ? marker.startedAt : null,
  };
}

/**
 * The manifest text to store when a publication starts: the current manifest plus the marker. When there is
 * nothing readable to preserve (`json` is `null` for the first publication, or the stored text is not a JSON
 * object) the marker stands alone as a placeholder manifest with no previous generation to serve; the
 * placeholder is still what lets the publisher hold ownership, and the cache bypass, from its first write.
 */
export async function stampPublicationMarker(
  json: string | null,
  startedAt: string,
  owner: string,
): Promise<string> {
  let document: unknown = null;
  if (json !== null) {
    try {
      document = JSON.parse(json);
    } catch {
      document = null;
    }
  }
  if (json === null || !isPlain(document)) {
    return JSON.stringify({ [PUBLICATION_MARKER_KEY]: { baseVersion: null, startedAt, owner } });
  }
  const { [PUBLICATION_MARKER_KEY]: earlier, ...generation } = document;
  // A marker left by an unfinished run keeps its base: the last COMPLETE generation is still the one to preserve.
  // A placeholder has no generation at all, so there is no base to keep.
  const baseVersion = Object.hasOwn(document, PUBLICATION_MARKER_KEY)
    ? (baseVersionOf(earlier) ??
      (Object.keys(generation).length > 0
        ? await manifestVersion(JSON.stringify(generation))
        : null))
    : await manifestVersion(json);
  return JSON.stringify({
    ...generation,
    [PUBLICATION_MARKER_KEY]: { baseVersion, startedAt, owner },
  });
}
