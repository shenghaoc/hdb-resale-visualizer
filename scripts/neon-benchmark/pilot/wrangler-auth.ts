import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const AUTH_TIMEOUT_MS = 20_000;
const AUTH_MAX_OUTPUT_BYTES = 100_000;

export type WranglerAuthRunner = (
  executable: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeout: number;
    maxBuffer: number;
  },
) => Promise<{ stdout: string }>;

/** Obtain the existing OAuth credential through Wrangler's expiry/refresh path.
 * The token stays in memory. Neither subprocess errors nor token output may be logged.
 */
export async function existingWranglerOAuth(
  configPath: string,
  cwd: string,
  runner: WranglerAuthRunner = run,
  inheritedEnvironment: NodeJS.ProcessEnv = process.env,
): Promise<{ token: string; source: "wrangler-oauth" }> {
  let output: { stdout: string };
  try {
    output = await runner("wrangler", ["auth", "token", "--json", "--config", configPath], {
      cwd,
      env: {
        ...inheritedEnvironment,
        CI: "true",
        WRANGLER_SEND_METRICS: "false",
        WRANGLER_WRITE_LOGS: "false",
        WRANGLER_LOG_SANITIZE: "true",
        WRANGLER_LOG: "log",
      },
      timeout: AUTH_TIMEOUT_MS,
      maxBuffer: AUTH_MAX_OUTPUT_BYTES,
    });
  } catch {
    // execFile errors can include stdout/stderr containing credentials.
    throw new Error(
      "Wrangler OAuth authentication failed; stop and inspect the Wrangler login state.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.stdout);
  } catch {
    throw new Error("Wrangler authentication returned invalid JSON; stop without retry.");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("type" in parsed) ||
    parsed.type !== "oauth" ||
    !("token" in parsed) ||
    typeof parsed.token !== "string" ||
    !parsed.token ||
    /\s/.test(parsed.token)
  )
    throw new Error("Wrangler did not return the expected existing OAuth credential; stop.");
  return { token: parsed.token, source: "wrangler-oauth" };
}
