/**
 * The global daily budget of nearby-search database statements.
 *
 * The two Workers Rate Limiting bindings count per Cloudflare location, so neither bounds the whole deployment.
 * This Durable Object is one counter for all of them: every cache miss asks it for one statement of the UTC day's
 * allowance before the statement is sent. Cache hits never reach it.
 *
 * It fails closed. A missing binding, an invalid configured budget, an object that throws or an answer that is
 * not understood all refuse the request with a no-store 503; nothing is sent to the database unchecked.
 */
import { privateJsonResponse } from "../functions/_lib/d1";
import { NEARBY_DAILY_MISS_BUDGET } from "../shared/nearby-limits";

/** The single object every location addresses. */
export const NEARBY_BUDGET_OBJECT_NAME = "global";
const STORAGE_KEY = "day";
const DAY_MS = 86_400_000;

type BudgetDay = { day: string; used: number };
export type BudgetStorage = {
  get(key: string): Promise<unknown>;
  put(key: string, value: BudgetDay): Promise<void>;
};
export type BudgetDecision = { allowed: boolean; day: string; used: number; limit: number };

const utcDay = (now: number): string => new Date(now).toISOString().slice(0, 10);

function storedDay(value: unknown): BudgetDay | null {
  if (typeof value !== "object" || value === null) return null;
  const { day, used } = value as Record<string, unknown>;
  return typeof day === "string" &&
    typeof used === "number" &&
    Number.isSafeInteger(used) &&
    used >= 0
    ? { day, used }
    : null;
}

/**
 * Takes one statement from `limit` for the UTC day of `now`, or refuses when the day's allowance is spent. A new
 * UTC day starts from zero. The count is written before the answer is given, so a granted statement is never
 * forgotten; a stored value that is not understood is treated as a spent day rather than as zero.
 */
export async function consumeDailyBudget(
  storage: BudgetStorage,
  limit: number,
  now: number,
): Promise<BudgetDecision> {
  const day = utcDay(now);
  const raw = await storage.get(STORAGE_KEY);
  const stored = raw === undefined ? { day, used: 0 } : storedDay(raw);
  if (!stored) return { allowed: false, day, used: limit, limit };
  const used = stored.day === day ? stored.used : 0;
  if (used >= limit) return { allowed: false, day, used, limit };
  await storage.put(STORAGE_KEY, { day, used: used + 1 });
  return { allowed: true, day, used: used + 1, limit };
}

/** Accepts only a whole number from 1 to the code's own ceiling; anything else is a deployment mistake. */
export function parseDailyBudget(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d{0,8}$/.test(value)) return null;
  const limit = Number(value);
  return limit <= NEARBY_DAILY_MISS_BUDGET ? limit : null;
}

/**
 * One instance (`NEARBY_BUDGET_OBJECT_NAME`). A Durable Object handles one request at a time around its storage
 * operations, so concurrent misses cannot both take the last statement.
 */
export class NearbyDailyBudget {
  constructor(private readonly state: { storage: BudgetStorage }) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = parseDailyBudget(url.searchParams.get("limit") ?? undefined);
    if (request.method !== "POST" || url.pathname !== "/consume" || limit === null)
      return new Response("Bad Request", { status: 400 });
    return Response.json(await consumeDailyBudget(this.state.storage, limit, Date.now()));
  }
}

export type NearbyBudgetNamespace = {
  idFromName(name: string): unknown;
  get(id: never): { fetch(input: string, init?: RequestInit): Promise<Response> };
};

const unavailable = (retryAfterSeconds: number) =>
  privateJsonResponse(
    { error: "Nearby search is temporarily unavailable" },
    { status: 503, headers: { "Retry-After": String(retryAfterSeconds) } },
  );

/**
 * Asks the global counter for one statement. Returns null when it was granted, otherwise the refusal to send.
 * Checked only when the answer has to come from the database.
 */
export async function checkNearbyDailyBudget(
  namespace: NearbyBudgetNamespace | undefined,
  configuredLimit: string | undefined,
  now: number = Date.now(),
): Promise<Response | null> {
  const limit = parseDailyBudget(configuredLimit);
  if (!namespace || limit === null)
    return privateJsonResponse({ error: "Nearby search is not configured" }, { status: 503 });
  try {
    const stub = namespace.get(namespace.idFromName(NEARBY_BUDGET_OBJECT_NAME) as never);
    const response = await stub.fetch(`https://nearby-budget/consume?limit=${limit}`, {
      method: "POST",
    });
    if (!response.ok) throw new Error(`Budget object answered ${response.status}`);
    const decision: unknown = await response.json();
    if (typeof decision !== "object" || decision === null || !("allowed" in decision))
      throw new Error("Budget object answer not understood");
    if (decision.allowed === true) return null;
    if (decision.allowed !== false) throw new Error("Budget object answer not understood");
  } catch (error) {
    console.error("Nearby daily budget failed, refusing request:", error);
    return unavailable(60);
  }
  // Spent for today: the allowance returns at the next UTC midnight.
  const untilMidnight = Math.max(1, Math.ceil((DAY_MS - (now % DAY_MS)) / 1000));
  return privateJsonResponse(
    { error: "Nearby search has reached its daily limit" },
    { status: 503, headers: { "Retry-After": String(untilMidnight) } },
  );
}
