/** Isolated pilot control plane. This module has no database or asset dependencies. */
export const PILOT_CONTROL_PROTOCOL = "hdb-pilot-control-v1";
export const PILOT_CONTROL_METHODS: Readonly<Record<string, "GET" | "POST">> = Object.freeze({
  "/control/ready": "GET",
  "/control/begin": "POST",
  "/control/configure": "POST",
  "/control/charge-setup": "POST",
  "/control/retire": "POST",
  "/control/retired-handoff": "GET",
  "/control/evidence": "GET",
  "/control/accept-diagnostic": "POST",
  "/control/stop": "POST",
  "/control/safeguards": "GET",
  "/control/cleanup-observations": "GET",
});

/** Unknown and wrong-method control requests must never reach data or asset routing. */
export function refuseInvalidPilotControl(path: string, method: string): Response | null {
  if (path !== "/control" && !path.startsWith("/control/")) return null;
  const expected = Object.hasOwn(PILOT_CONTROL_METHODS, path) ? PILOT_CONTROL_METHODS[path] : null;
  if (!expected) return Response.json({ error: "Unknown control route" }, { status: 404 });
  if (method !== expected)
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { Allow: expected } },
    );
  return null;
}
