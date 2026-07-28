const DEFAULT_E2E_PORT = 4173;

export function resolveE2EPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_E2E_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`E2E_PORT must be an integer from 1 to 65535; received "${value}"`);
  }
  return port;
}

export const E2E_HOST = "127.0.0.1";
export const E2E_PORT = resolveE2EPort(process.env.E2E_PORT);
export const E2E_BASE_URL = `http://${E2E_HOST}:${E2E_PORT}`;
