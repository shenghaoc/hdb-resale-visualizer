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
    return jsonResponse(projectManifestContract(JSON.parse(row.json)));
  } catch (error) {
    console.error("manifest lookup failed:", error);
    return serverError("Internal server error");
  }
};
