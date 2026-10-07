import { jsonResponse, notFound, serverError } from "../_lib/d1";
import { projectManifestContract } from "../../shared/manifest-contract";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const row = await env.DB.prepare("SELECT json FROM manifest WHERE id = 1").first<{
      json: string;
    }>();
    if (!row) {
      return notFound("manifest not synced yet");
    }
    // Only the public contract leaves the Worker; see shared/manifest-contract.ts.
    const manifest = projectManifestContract(JSON.parse(row.json));
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
