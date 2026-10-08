import { jsonResponse, notFound, serverError } from "../_lib/d1";
import type { PublicRouteHandler } from "../_lib/public-data";
import { projectManifestContract } from "../../shared/manifest-contract";

export const onRequestGet: PublicRouteHandler = async ({ publicData }) => {
  try {
    const json = await publicData.manifestJson();
    if (json === null) {
      return notFound("manifest not synced yet");
    }
    // Only the public contract leaves the Worker; see shared/manifest-contract.ts.
    const manifest = projectManifestContract(JSON.parse(json));
    // A placeholder that carries only the publication marker (the first publication, still running) holds no
    // contract field at all. It is not a manifest yet.
    if (typeof manifest === "object" && manifest !== null && Object.keys(manifest).length === 0) {
      return notFound("manifest not synced yet");
    }
    return jsonResponse(manifest);
  } catch (error) {
    console.error("manifest lookup failed:", error);
    return serverError("Internal server error");
  }
};
